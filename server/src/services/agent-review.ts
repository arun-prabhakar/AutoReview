import type { CommitInfo } from "./bitbucket-client.js";
import { fetchFileFromRepoAtRef, fetchRepoDirListing } from "./bitbucket-client.js";
import type { RepositoryConfig } from "./repository-service.js";
import { createAdapter, type ProviderConfig } from "./llm/index.js";
import type { LlmAdapter, LlmMessage } from "./llm/types.js";
import { parseFindings, filterExcludedPaths, prepareDiffForAnalysis, renderFeedbackContext, type RawFinding, type TokenUsage } from "./review-engine.js";
import { FIXED_OUTPUT_FORMAT, REVIEW_METHOD_RULES } from "../prompts/index.js";
import { logger } from "../middleware/index.js";

const MAX_AGENT_TURNS = 10;
const MAX_TOOL_FAILURES = 2;
const TOOL_OUTPUT_CAP = 4000;
const FILE_READ_CAP = 12000;
const AGENT_TURN_TOKENS = 6144;

export type AgentCredentials = { password: string; username: string };

export type AgentTurn =
  | { action: "TOOL_CALL"; tool: string; args: { path?: string } }
  | { action: "FINAL"; content: string }
  | { action: "INVALID"; raw: string };

const AGENT_TOOLS = ["list_files", "read_file"] as const;

export function parseAgentTurn(content: string): AgentTurn {
  const jsonStr = extractJsonObject(content);
  if (!jsonStr) return { action: "INVALID", raw: content };
  try {
    const parsed = JSON.parse(jsonStr) as { action?: string; tool?: string; args?: { path?: string }; content?: string };
    if (parsed.action === "TOOL_CALL" && typeof parsed.tool === "string") {
      return { action: "TOOL_CALL", tool: parsed.tool, args: parsed.args ?? {} };
    }
    if (parsed.action === "FINAL" && typeof parsed.content === "string") {
      return { action: "FINAL", content: parsed.content };
    }
    return { action: "INVALID", raw: content };
  } catch {
    return { action: "INVALID", raw: content };
  }
}

function extractJsonObject(content: string): string | null {
  const start = content.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < content.length; i++) {
    const ch = content[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      if (inString) escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return content.substring(start, i + 1);
    }
  }
  return null;
}

function sanitizePath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().replace(/^\/+/, "");
  if (!trimmed || trimmed.includes("..") || /[\r\n]/.test(trimmed)) return null;
  return trimmed;
}

async function dispatchTool(
  tool: string,
  args: { path?: string },
  repo: RepositoryConfig,
  commitHash: string,
  credentials: AgentCredentials
): Promise<string> {
  const path = sanitizePath(args?.path);
  if (!path) return "ERROR: provide args.path as a non-empty relative path (no '..').";
  if (!AGENT_TOOLS.includes(tool as (typeof AGENT_TOOLS)[number])) {
    return `ERROR: unknown tool "${tool}". Available tools: ${AGENT_TOOLS.join(", ")}.`;
  }
  try {
    if (tool === "list_files") {
      const entries = await fetchRepoDirListing(repo.workspace, repo.slug, path, commitHash, credentials.password, credentials.username);
      if (!entries) return `ERROR: "${path}" is not a listable directory at commit ${commitHash}.`;
      return capOutput(entries.join("\n"));
    }
    const content = await fetchFileFromRepoAtRef(repo.workspace, repo.slug, path, commitHash, credentials.password, credentials.username);
    if (content === null) return `ERROR: file "${path}" not found at commit ${commitHash}.`;
    return capOutput(content.length > FILE_READ_CAP ? `${content.slice(0, FILE_READ_CAP)}\n...[truncated at ${FILE_READ_CAP} chars]` : content);
  } catch (err) {
    return `ERROR: tool call failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function capOutput(text: string): string {
  return text.length > TOOL_OUTPUT_CAP ? `${text.slice(0, TOOL_OUTPUT_CAP)}\n...[truncated at ${TOOL_OUTPUT_CAP} chars]` : text;
}

function buildAgentIntro(params: {
  basePrompt: string;
  commitHash: string;
}): string {
  return `${params.basePrompt}

## Agent Mode — Repository Exploration
You may explore the repository at commit ${params.commitHash} before finalizing your review. Each of your responses must be EXACTLY ONE JSON object and nothing else — no markdown fences, no prose outside the JSON.

Available tools:
- {"action":"TOOL_CALL","tool":"list_files","args":{"path":"src"}}
- {"action":"TOOL_CALL","tool":"read_file","args":{"path":"src/app.ts"}}

To finish, return:
- {"action":"FINAL","content":"<the complete findings JSON array serialized as a string, following the Required output schema>"}

Agent rules:
- Use at most ${MAX_AGENT_TURNS} turns total; explore only what you need, then FINAL.
- Read related files to verify suspected issues before flagging them (callers, imports, tests, sibling modules).
- Never invent file contents — if a tool errors, trust the error and adapt.
- Do not read the same file twice.
- The FINAL content must follow the Required output schema exactly, including confidence and test_gap.`;
}

export type AgentReviewResult = {
  findings: RawFinding[];
  tokenUsage: TokenUsage;
  aiResponse: string;
  turns: number;
  toolsUsed: string[];
};

export type AgentProgressFn = (turn: number, maxTurns: number, detail: string) => void;

export async function runAgentReview(params: {
  diff: string;
  commit: CommitInfo;
  repo: RepositoryConfig;
  promptTemplate: string;
  provider: ProviderConfig;
  credentials: AgentCredentials;
  truncated: boolean;
  projectContext?: string;
  feedbackContext?: string;
  signal?: AbortSignal;
  onProgress?: AgentProgressFn;
}): Promise<AgentReviewResult> {
  const reviewDiff = prepareDiffForAnalysis(params.diff, params.repo.excluded_paths);
  const changedFiles = (reviewDiff.match(/^diff --git a\/(.+?) b\/(.+?)$/gm) || [])
    .map((m) => m.replace(/^diff --git a\//, "").split(" b/")[0]);

  let basePrompt = params.promptTemplate
    .replace("{{diff}}", reviewDiff)
    .replace("{{file_paths}}", changedFiles.map((f, i) => `${i + 1}. ${f}`).join("\n") || "none")
    .replace("{{strictness_level}}", params.repo.strictness)
    .replace("{{excluded_paths}}", params.repo.excluded_paths || "none")
    .replace("{{commit_hash}}", params.commit.hash)
    .replace("{{commit_message}}", params.commit.message)
    .replace("{{branch}}", params.repo.branch)
    .replace("{{repository}}", params.repo.name);

  if (params.projectContext) {
    basePrompt += `\n\n## Project-Specific Context\nUse these repository rules when they apply:\n${params.projectContext.slice(0, 3000)}`;
  }
  basePrompt += renderFeedbackContext(params.feedbackContext);
  basePrompt += REVIEW_METHOD_RULES;
  basePrompt += FIXED_OUTPUT_FORMAT;

  const messages: LlmMessage[] = [
    { role: "user", content: buildAgentIntro({ basePrompt, commitHash: params.commit.hash }) },
  ];

  const adapter: LlmAdapter = createAdapter(params.provider);
  const tokenUsage: TokenUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  const transcript: { turn: number; assistant: string; toolResult?: string }[] = [];
  const toolsUsed: string[] = [];
  const readFiles = new Set<string>();
  let turns = 0;
  let invalidStreak = 0;

  while (turns < MAX_AGENT_TURNS) {
    turns++;
    const result = await adapter.complete({
      model: params.repo.llm_model,
      messages,
      maxTokens: AGENT_TURN_TOKENS,
      temperature: 0.0,
      signal: params.signal,
    });
    tokenUsage.prompt_tokens += result.tokenUsage.prompt_tokens;
    tokenUsage.completion_tokens += result.tokenUsage.completion_tokens;
    tokenUsage.total_tokens += result.tokenUsage.total_tokens;

    const turn = parseAgentTurn(result.content);
    const entry: { turn: number; assistant: string; toolResult?: string } = { turn: turns, assistant: result.content };
    transcript.push(entry);

    if (turn.action === "FINAL") {
      const findings = filterExcludedPaths(parseFindings(turn.content, changedFiles), params.repo.excluded_paths)
        .map((f) => ({ ...f, source_pass: f.source_pass ?? "agent" }));
      logger.info("Agent review finished", {
        turns,
        toolsUsed: toolsUsed.length,
        findings: findings.length,
        repository: params.repo.name,
      });
      return { findings, tokenUsage, aiResponse: JSON.stringify(transcript, null, 2), turns, toolsUsed };
    }

    if (turn.action === "INVALID") {
      invalidStreak++;
      if (invalidStreak >= MAX_TOOL_FAILURES + 1) {
        messages.push({ role: "assistant", content: result.content });
        messages.push({ role: "user", content: `Invalid response format. You MUST respond with one JSON object: {"action":"FINAL","content":"<findings JSON array as string>"}. Produce the FINAL answer now using what you already know.` });
        continue;
      }
      messages.push({ role: "assistant", content: result.content });
      messages.push({ role: "user", content: 'Invalid response. Return exactly one JSON object: {"action":"TOOL_CALL","tool":"list_files|read_file","args":{"path":"..."}} or {"action":"FINAL","content":"..."}.' });
      continue;
    }
    invalidStreak = 0;

    let toolResult: string;
    if (turn.tool === "read_file") {
      const path = sanitizePath(turn.args?.path);
      if (path && readFiles.has(path)) {
        toolResult = `ERROR: "${path}" was already read. Do not read the same file twice.`;
      } else {
        if (path) readFiles.add(path);
        toolsUsed.push(`read_file:${path ?? "invalid"}`);
        toolResult = await dispatchTool(turn.tool, turn.args, params.repo, params.commit.hash, params.credentials);
      }
    } else {
      toolsUsed.push(`${turn.tool}:${sanitizePath(turn.args?.path) ?? "invalid"}`);
      toolResult = await dispatchTool(turn.tool, turn.args, params.repo, params.commit.hash, params.credentials);
    }

    entry.toolResult = toolResult;
    messages.push({ role: "assistant", content: result.content });
    messages.push({ role: "user", content: `TOOL_RESULT:\n${toolResult}\n\nTurn ${turns}/${MAX_AGENT_TURNS} used. Continue exploring or return FINAL.` });
    try {
      params.onProgress?.(turns, MAX_AGENT_TURNS, `${turn.tool} ${sanitizePath(turn.args?.path) ?? ""}`.trim());
    } catch { /* progress reporting must never break the review loop */ }
  }

  messages.push({ role: "user", content: `Turn budget exhausted. Return {"action":"FINAL","content":"<findings JSON array as string>"} now.` });
  const final = await adapter.complete({
    model: params.repo.llm_model,
    messages,
    maxTokens: AGENT_TURN_TOKENS,
    temperature: 0.0,
    signal: params.signal,
  });
  tokenUsage.prompt_tokens += final.tokenUsage.prompt_tokens;
  tokenUsage.completion_tokens += final.tokenUsage.completion_tokens;
  tokenUsage.total_tokens += final.tokenUsage.total_tokens;
  transcript.push({ turn: turns + 1, assistant: final.content });

  const turn = parseAgentTurn(final.content);
  const finalContent = turn.action === "FINAL" ? turn.content : final.content;
  const findings = filterExcludedPaths(parseFindings(finalContent, changedFiles), params.repo.excluded_paths)
    .map((f) => ({ ...f, source_pass: f.source_pass ?? "agent" }));
  logger.info("Agent review hit turn budget", { turns, findings: findings.length, repository: params.repo.name });
  return { findings, tokenUsage, aiResponse: JSON.stringify(transcript, null, 2), turns, toolsUsed };
}
