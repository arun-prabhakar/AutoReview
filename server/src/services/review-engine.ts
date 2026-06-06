import type { CommitInfo } from "./bitbucket-client.js";
import type { RepositoryConfig } from "./repository-service.js";
import { createAdapter, type ProviderConfig } from "./llm/index.js";
import type { LlmAdapter } from "./llm/types.js";
import { logger } from "../middleware/index.js";

export const FIXED_OUTPUT_FORMAT = `
---

## Output Format

Respond with a single valid JSON array of findings only. Do NOT include any other text, markdown, or explanation outside the JSON array. Sort findings by risk: \`must_fix\` first, then \`should_fix_soon\`, then \`ignore\`.

Use the 1-based \`file_index\` from the Changed Files list in the prompt. Do not repeat file paths, finding ids, repository, branch, commit hash, or line end values in the response.

\`\`\`json
[
  {
    "file_index": <integer from Changed Files>,
    "line_start": <integer or null>,
    "category": "<security | performance | correctness | maintainability | style>",
    "risk": "<must_fix | should_fix_soon | ignore>",
    "title": "<concise one-line summary>",
    "explanation": "<detailed explanation of why this is a problem, including potential impact>",
    "suggested_fix": "<concrete fix — code snippet preferred where applicable, or null if not applicable>"
  }
]
\`\`\``;

export type RawFinding = {
  file_path: string;
  line_number: number | null;
  summary: string;
  explanation: string;
  risk_level: string;
  suggested_fix: string | null;
  category: string | null;
};

export type { ProviderConfig } from "./llm/index.js";

export type TokenUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

const MAX_ANALYSIS_TOKENS = 32768;
const MIN_RETRY_TOKENS = 8192;

type AnalysisCompletion = {
  content: string;
  tokenUsage: TokenUsage;
  finishReason: string | null | undefined;
};

export class LlmResponseError extends Error {
  aiResponse: string;

  constructor(message: string, aiResponse: string) {
    super(message);
    this.name = "LlmResponseError";
    this.aiResponse = aiResponse;
  }
}

export async function analyzeDiff(
  diff: string,
  commit: CommitInfo,
  repo: RepositoryConfig,
  promptTemplate: string,
  provider: ProviderConfig,
  truncated = false,
  projectContext?: string
): Promise<{ findings: RawFinding[]; incomplete: boolean; tokenUsage: TokenUsage; aiResponse: string }> {
  const changedFiles = extractFilePathList(diff);
  let prompt = promptTemplate
    .replace("{{diff}}", diff)
    .replace("{{file_paths}}", formatChangedFilesForPrompt(changedFiles))
    .replace("{{strictness_level}}", repo.strictness)
    .replace("{{excluded_paths}}", repo.excluded_paths || "none")
    .replace("{{commit_hash}}", commit.hash)
    .replace("{{commit_message}}", commit.message)
    .replace("{{branch}}", repo.branch)
    .replace("{{repository}}", repo.name);

  if (projectContext) {
    prompt += `\n\n## Project-Specific Context\n\nThe team has provided the following context about their codebase and coding standards. Use this to tailor your review:\n\n${projectContext}`;
  }

  prompt += FIXED_OUTPUT_FORMAT;

  if (truncated) {
    prompt += "\n\nNOTE: The diff was truncated due to size. Your review may be incomplete. Focus on the available changes.";
  }

  const adapter = createAdapter(provider);

  const initialResponse = await requestAnalysisCompletion(adapter, repo, prompt, repo.llm_max_tokens);
  let response = initialResponse;
  let totalUsage = initialResponse.tokenUsage;

  try {
    const findings = parseAnalysisFindings(response, changedFiles, repo.excluded_paths);
    return buildAnalysisResult(findings, truncated, totalUsage, response.content, repo.excluded_paths);
  } catch (error) {
    if (!(error instanceof LlmResponseError)) throw error;

    const retryTokens = retryTokenBudget(repo.llm_max_tokens);
    logger.warn("LLM response invalid; retrying AI review once", {
      model: repo.llm_model,
      error: error.message,
      originalMaxTokens: repo.llm_max_tokens,
      retryMaxTokens: retryTokens,
      contentLength: response.content.length,
      tokens: response.tokenUsage.total_tokens,
    });

    response = await requestAnalysisCompletion(
      adapter,
      repo,
      retryPrompt(prompt),
      retryTokens
    );
    totalUsage = addTokenUsage(totalUsage, response.tokenUsage);
  }

  try {
    const findings = parseAnalysisFindings(response, changedFiles, repo.excluded_paths);
    return buildAnalysisResult(findings, truncated, totalUsage, response.content, repo.excluded_paths);
  } catch (error) {
    if (error instanceof LlmResponseError) {
      throw new LlmResponseError(
        error.message,
        JSON.stringify(
          [
            { attempt: 1, response: initialResponse.content },
            { attempt: 2, response: response.content, error: error.message },
          ],
          null,
          2
        )
      );
    }
    throw error;
  }
}

function parseAnalysisFindings(
  response: AnalysisCompletion,
  changedFiles: string[],
  excludedPaths: string | null
): RawFinding[] {
  if (response.finishReason === "length") {
    throw new LlmResponseError(
      "LLM response was truncated before a complete JSON review could be parsed.",
      response.content
    );
  }

  return filterExcludedPaths(parseFindingsStrict(response.content, changedFiles), excludedPaths);
}

function buildAnalysisResult(
  findings: RawFinding[],
  incomplete: boolean,
  tokenUsage: TokenUsage,
  aiResponse: string,
  excludedPaths: string | null
): { findings: RawFinding[]; incomplete: boolean; tokenUsage: TokenUsage; aiResponse: string } {
  logger.info("Findings parsed", {
    total: findings.length,
    riskBreakdown: {
      must_fix: findings.filter(f => f.risk_level === "must_fix").length,
      should_fix_soon: findings.filter(f => f.risk_level === "should_fix_soon").length,
      ignore: findings.filter(f => f.risk_level === "ignore").length,
    },
    excludedPaths,
  });

  return { findings, incomplete, tokenUsage, aiResponse };
}

function retryTokenBudget(currentMaxTokens: number): number {
  return Math.min(
    Math.max(currentMaxTokens * 2, MIN_RETRY_TOKENS),
    MAX_ANALYSIS_TOKENS
  );
}

function retryPrompt(prompt: string): string {
  return `${prompt}\n\nIMPORTANT RETRY: The previous AI review response could not be parsed. Return one complete valid JSON array only. No markdown outside JSON. Keep explanation and suggested_fix concise. Use file_index values from Changed Files; do not repeat file paths.`;
}

function addTokenUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    prompt_tokens: a.prompt_tokens + b.prompt_tokens,
    completion_tokens: a.completion_tokens + b.completion_tokens,
    total_tokens: a.total_tokens + b.total_tokens,
  };
}

async function requestAnalysisCompletion(
  adapter: LlmAdapter,
  repo: RepositoryConfig,
  prompt: string,
  maxTokens: number
): Promise<AnalysisCompletion> {
  const result = await adapter.complete({
    model: repo.llm_model,
    messages: [{ role: "user", content: prompt }],
    maxTokens,
    temperature: repo.llm_temperature,
  });

  const content = result.content;
  const tokenUsage: TokenUsage = result.tokenUsage;
  const finishReason = result.finishReason;

  logger.info("LLM response received", {
    model: repo.llm_model,
    maxTokens,
    contentLength: content.length,
    tokens: tokenUsage.total_tokens,
    finishReason,
    contentPreview: content.substring(0, 300),
  });

  return { content, tokenUsage, finishReason };
}

const DEFAULT_EXCLUSIONS = [
  /^node_modules\//,
  /^vendor\//,
  /\.min\.js$/,
  /\.min\.css$/,
  /package-lock\.json$/,
  /yarn\.lock$/,
  /\.generated\./,
  /^[dD]ist\//,
  /^[bB]uild\//,
  /^out\//,
];

export function filterExcludedPaths(findings: RawFinding[], excludedPaths: string | null): RawFinding[] {
  const patterns = buildExclusionPatterns(excludedPaths);
  return findings.filter((f) => !matchesAnyPattern(f.file_path, patterns));
}

function buildExclusionPatterns(excludedPaths: string | null): RegExp[] {
  const patterns = [...DEFAULT_EXCLUSIONS];

  if (!excludedPaths) return patterns;

  for (const raw of excludedPaths.split(",")) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const escaped = trimmed
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".");
    patterns.push(new RegExp(escaped));
  }

  return patterns;
}

function matchesAnyPattern(filePath: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(filePath));
}

export async function generateDiffOverview(
  diff: string,
  commit: CommitInfo,
  repo: RepositoryConfig,
  provider: ProviderConfig
): Promise<string> {
  const truncated = diff.length > 8000;
  const snippet = truncated ? diff.slice(0, 8000) : diff;

  const prompt = `You are writing a one-line summary for a code review.

Given the git diff below, write ONE complete, concise sentence (max 15 words) describing what this change accomplishes.

Rules:
- Start with an active verb (Add, Fix, Remove, Refactor, Update, Implement, etc.)
- Do NOT start with "This changeset", "This PR", "This commit", or similar phrases
- Focus on WHAT was done, not HOW
- Plain text only, no markdown, no quotes around the sentence
- The sentence MUST be complete and grammatical — never trail off or end mid-thought
- End with a period
- Output ONLY the summary sentence, nothing else

Commit: ${commit.hash.substring(0, 12)}
Message: ${commit.message}
Repository: ${repo.name}
Branch: ${repo.branch}

Diff:
${snippet}`;

  const adapter = createAdapter(provider);

  const result = await adapter.complete({
    model: repo.llm_model,
    messages: [{ role: "user", content: prompt }],
    maxTokens: 100,
    temperature: 0.2,
  });

  const raw = result.content.trim() || "";
  if (!raw) return fallbackOverview(commit, diff);

  const cleaned = cleanOverviewText(raw, result.finishReason === "length");
  return isUsableOverview(cleaned) ? cleaned : fallbackOverview(commit, diff);
}

/** Handles truncated LLM responses, strips formatting artifacts, and ensures clean sentence endings. */
export function cleanOverviewText(raw: string, wasTruncated: boolean): string {
  let text = raw.trim().replace(/\s+/g, " ");

  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim();
  }

  text = text.replace(/^\*{1,2}(.+)\*{1,2}$/, "$1").trim();
  text = text.replace(/^\s*(?:[-*]|\d+[.)])\s+/, "").trim();

  const prefixes = [
    /^(?:here(?:'s| is) (?:the |a )?(?:summary|overview|description)[,:]?\s*)/i,
    /^(?:summary|overview)[,:]?\s*/i,
  ];
  for (const prefix of prefixes) {
    text = text.replace(prefix, "").trim();
  }

  if (wasTruncated || !/[.!?]$/.test(text)) {
    const lastPeriod = text.lastIndexOf(".");
    if (lastPeriod > 0) {
      text = text.substring(0, lastPeriod + 1).trim();
    } else {
      text = compactToWordBoundary(text, 140);
      if (text && !/[.!?]$/.test(text)) {
        text += ".";
      }
    }
  }

  return text;
}

export function isUsableOverview(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;
  if (!/[.!?]$/.test(normalized)) return false;
  if (/[-,;:]\.?$/.test(normalized)) return false;

  const withoutPunctuation = normalized.replace(/[.!?]+$/, "");
  const words = withoutPunctuation.match(/[A-Za-z0-9][A-Za-z0-9']*/g) || [];
  if (words.length < 4) return false;

  const lastWord = words[words.length - 1] || "";
  if (lastWord.length < 3) return false;
  if (/\b(?:and|or|to|for|with|from|by|in|on|of|the|a|an)$/i.test(withoutPunctuation)) {
    return false;
  }

  return true;
}

export function fallbackOverview(commit: CommitInfo, diff: string): string {
  const subject = cleanCommitSubject(commit.message);
  if (subject) return subject;

  const files = extractFilePathList(diff);
  if (files.length === 0) return "Update repository changes.";
  if (files.length === 1) return `Update ${files[0]}.`;
  return `Update ${files.length} files across the repository.`;
}

function cleanCommitSubject(message: string): string {
  const subject = message.split("\n")[0]?.trim().replace(/\s+/g, " ") || "";
  if (!subject) return "";

  const cleaned = compactToWordBoundary(subject.replace(/[.!?]+$/, ""), 140);
  if (!cleaned || /[-,;:]$/.test(cleaned)) return "";

  const words = cleaned.match(/[A-Za-z0-9][A-Za-z0-9']*/g) || [];
  if (words.length < 4) return "";

  return `${cleaned}.`;
}

function compactToWordBoundary(text: string, maxLen: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLen) return trimmed;

  const cutAt = trimmed.lastIndexOf(" ", maxLen);
  return (cutAt > 0 ? trimmed.substring(0, cutAt) : trimmed.substring(0, maxLen)).trim();
}

export function extractFilePaths(diff: string): string {
  return extractFilePathList(diff).join("\n");
}

function extractFilePathList(diff: string): string[] {
  const matches = diff.match(/^diff --git a\/(.+?) b\/(.+?)$/gm) || [];
  return matches.map((m) => m.replace("diff --git a/", "").split(" b/")[0]);
}

function formatChangedFilesForPrompt(files: string[]): string {
  if (files.length === 0) return "none";
  return files.map((file, index) => `${index + 1}. ${file}`).join("\n");
}

const RISK_ORDER: Record<string, number> = { must_fix: 0, should_fix_soon: 1, ignore: 2 };

export function parseFindings(content: string, changedFiles: string[] = []): RawFinding[] {
  try {
    return parseFindingsStrict(content, changedFiles);
  } catch (err) {
    if (err instanceof LlmResponseError) {
      logger.warn("parseFindings: invalid LLM response", {
        error: err.message,
        contentPreview: err.aiResponse.substring(0, 500),
      });
      return [];
    }
    logger.warn("parseFindings: failed to parse LLM response", {
      error: err instanceof Error ? err.message : String(err),
      contentPreview: content.substring(0, 500),
    });
    return [];
  }
}

function parseFindingsStrict(content: string, changedFiles: string[]): RawFinding[] {
  const jsonStr = extractJsonArray(content);
  if (!jsonStr) {
    throw new LlmResponseError("LLM response did not contain a JSON findings array.", content);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    throw new LlmResponseError(
      `LLM response contained invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
      content
    );
  }

  if (!Array.isArray(parsed)) {
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      const arrayKey = Object.keys(obj).find((k) => Array.isArray(obj[k]));
      if (arrayKey) {
        parsed = obj[arrayKey];
      }
    }
    if (!Array.isArray(parsed)) {
      throw new LlmResponseError("LLM response JSON was not a findings array.", content);
    }
  }

  if (parsed.length === 0) {
    logger.info("parseFindings: LLM returned empty array (clean diff)");
    return [];
  }

  try {
    const mapped: RawFinding[] = parsed.map((item: Record<string, unknown>) => {
      const filePath = resolveFindingFilePath(item, changedFiles);
      if (!filePath) {
        throw new Error("finding did not reference a valid changed file");
      }

      return {
        file_path: filePath,
        line_number: normalizeLineNumber(item.line_start ?? item.line_number),
        summary: String(item.title ?? item.summary ?? ""),
        explanation: String(item.explanation ?? ""),
        risk_level: String(item.risk ?? item.risk_level ?? "ignore"),
        suggested_fix: normalizeNullableString(item.suggested_fix),
        category: normalizeNullableString(item.category),
      };
    });

    return mapped.sort(
      (a, b) => (RISK_ORDER[a.risk_level] ?? 3) - (RISK_ORDER[b.risk_level] ?? 3)
    );
  } catch (err) {
    throw new LlmResponseError(
      `LLM response findings could not be mapped: ${err instanceof Error ? err.message : String(err)}`,
      content
    );
  }
}

function resolveFindingFilePath(item: Record<string, unknown>, changedFiles: string[]): string {
  const fileIndexValue = item.file_index ?? item.changed_file_index;
  const fileIndex = typeof fileIndexValue === "number" ? fileIndexValue : Number(fileIndexValue);
  if (Number.isInteger(fileIndex) && fileIndex >= 1 && fileIndex <= changedFiles.length) {
    return changedFiles[fileIndex - 1];
  }

  // Backward compatibility for older stored prompts or providers that still echo a path.
  return String(item.file ?? item.file_path ?? "");
}

function normalizeLineNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isInteger(n) ? n : null;
}

function normalizeNullableString(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

/**
 * Extracts the outermost valid JSON array from LLM output.
 * Uses balanced-bracket counting to find the correct bounds,
 * avoiding greedy regex that can match across multiple arrays.
 */
function extractJsonArray(content: string): string | null {
  const codeBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) {
    const inner = codeBlockMatch[1].trim();
    if (inner.startsWith("[")) return inner;
  }

  const start = content.indexOf("[");
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

    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) {
        return content.substring(start, i + 1);
      }
    }
  }

  return content.substring(start);
}

const SPECIALIZED_PROMPTS: Record<string, string> = {
  security: `You are a senior security engineer performing a focused security audit. Identify ONLY security vulnerabilities: injection attacks, authentication issues, authorization bypasses, data exposure, insecure cryptography, SSRF, XSS, CSRF, path traversal, deserialization flaws, and similar. Do NOT flag style or maintainability issues.`,
  performance: `You are a performance engineering specialist. Identify ONLY performance problems: N+1 queries, memory leaks, unnecessary allocations, missing indexes, inefficient algorithms, unbounded growth, blocking operations in async code, and similar. Do NOT flag style or security issues.`,
  maintainability: `You are a code quality specialist focused on long-term maintainability. Identify issues like: dead code, overly complex functions, duplicated logic, poor naming, missing error handling, hardcoded values, tight coupling, and similar. Do NOT flag security or performance unless severe.`,
};

export type MultiPassResult = {
  findings: RawFinding[];
  tokenUsage: TokenUsage;
  aiResponse: string;
  passes: { focus: string; findings: number }[];
};

export async function multiPassReview(
  diff: string,
  commit: CommitInfo,
  repo: RepositoryConfig,
  baseTemplate: string,
  provider: ProviderConfig,
  truncated: boolean,
  projectContext?: string
): Promise<MultiPassResult> {
  const passes: { focus: string; findings: number }[] = [];
  const allFindings: RawFinding[] = [];
  const allResponses: { focus: string; response: string }[] = [];
  let totalUsage: TokenUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

  const focuses = Object.keys(SPECIALIZED_PROMPTS);

  const results = await Promise.allSettled(
    focuses.map(async (focus) => {
      const specializedSuffix = `\n\n## Specialized Focus\n\n${SPECIALIZED_PROMPTS[focus]}\n\nOnly report findings relevant to this focus area. If no ${focus}-related issues exist, return an empty array [].`;
      const template = baseTemplate + specializedSuffix;

      const { findings, tokenUsage, aiResponse } = await analyzeDiff(diff, commit, repo, template, provider, truncated, projectContext);
      return { focus, findings, tokenUsage, aiResponse };
    })
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      const { focus, findings, tokenUsage, aiResponse } = result.value;
      allFindings.push(...findings);
      totalUsage = {
        prompt_tokens: totalUsage.prompt_tokens + tokenUsage.prompt_tokens,
        completion_tokens: totalUsage.completion_tokens + tokenUsage.completion_tokens,
        total_tokens: totalUsage.total_tokens + tokenUsage.total_tokens,
      };
      passes.push({ focus, findings: findings.length });
      allResponses.push({ focus, response: aiResponse });
    } else {
      const focus = focuses[results.indexOf(result)];
      logger.warn(`Multi-pass ${focus} review failed`, { error: String(result.reason) });
      if (result.reason instanceof LlmResponseError) {
        const failedResponses = [
          ...allResponses,
          { focus, response: result.reason.aiResponse, error: result.reason.message },
        ];
        throw new LlmResponseError(
          `Multi-pass ${focus} review returned invalid JSON and could not be parsed.`,
          JSON.stringify(failedResponses, null, 2)
        );
      }
      passes.push({ focus, findings: 0 });
    }
  }

  const deduplicated = deduplicateFindings(allFindings);

  return { findings: deduplicated, tokenUsage: totalUsage, passes, aiResponse: JSON.stringify(allResponses, null, 2) };
}

function deduplicateFindings(findings: RawFinding[]): RawFinding[] {
  const seen = new Map<string, RawFinding>();
  for (const f of findings) {
    const key = `${f.file_path}:${f.line_number}:${f.summary.substring(0, 60).toLowerCase()}`;
    if (!seen.has(key)) {
      seen.set(key, f);
    } else {
      const existing = seen.get(key)!;
      if (RISK_ORDER[f.risk_level] < RISK_ORDER[existing.risk_level]) {
        seen.set(key, f);
      }
    }
  }
  return Array.from(seen.values()).sort(
    (a, b) => (RISK_ORDER[a.risk_level] ?? 3) - (RISK_ORDER[b.risk_level] ?? 3)
  );
}
