import OpenAI from "openai";
import type { CommitInfo } from "./bitbucket-client.js";
import type { RepositoryConfig } from "./repository-service.js";
import { logger } from "../middleware/index.js";

export const FIXED_OUTPUT_FORMAT = `
---

## Output Format

Respond with a single valid JSON array of findings only. Do NOT include any other text, markdown, or explanation outside the JSON array. Sort findings by risk: \`must_fix\` first, then \`should_fix_soon\`, then \`ignore\`.

\`\`\`json
[
  {
    "id": "F001",
    "file": "<file path>",
    "line_start": <integer or null>,
    "line_end": <integer or null>,
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

export type ProviderConfig = {
  apiBase: string;
  apiKey: string;
};

const openAIClientCache = new Map<string, OpenAI>();

function getOpenAIClient(provider: ProviderConfig): OpenAI {
  const cacheKey = `${provider.apiBase}:${provider.apiKey.substring(0, 8)}`;
  let client = openAIClientCache.get(cacheKey);
  if (!client) {
    client = new OpenAI({ apiKey: provider.apiKey, baseURL: provider.apiBase });
    openAIClientCache.set(cacheKey, client);
    if (openAIClientCache.size > 20) {
      const firstKey = openAIClientCache.keys().next().value;
      if (firstKey) openAIClientCache.delete(firstKey);
    }
  }
  return client;
}

export async function analyzeDiff(
  diff: string,
  commit: CommitInfo,
  repo: RepositoryConfig,
  promptTemplate: string,
  provider: ProviderConfig,
  truncated = false
): Promise<{ findings: RawFinding[]; incomplete: boolean }> {
  let prompt = promptTemplate
    .replace("{{diff}}", diff)
    .replace("{{file_paths}}", extractFilePaths(diff))
    .replace("{{strictness_level}}", repo.strictness)
    .replace("{{excluded_paths}}", repo.excluded_paths || "none")
    .replace("{{commit_hash}}", commit.hash)
    .replace("{{commit_message}}", commit.message)
    .replace("{{branch}}", repo.branch)
    .replace("{{repository}}", repo.name);

  prompt += FIXED_OUTPUT_FORMAT;

  if (truncated) {
    prompt += "\n\nNOTE: The diff was truncated due to size. Your review may be incomplete. Focus on the available changes.";
  }

  const client = getOpenAIClient(provider);

  const response = await client.chat.completions.create({
    model: repo.llm_model,
    messages: [{ role: "user", content: prompt }],
    max_tokens: repo.llm_max_tokens,
    temperature: repo.llm_temperature,
  });

  const content = response.choices?.[0]?.message?.content || "[]";

  const findings = filterExcludedPaths(parseFindings(content), repo.excluded_paths);
  return { findings, incomplete: truncated };
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
  const truncated = diff.length > 12000;
  const snippet = truncated ? diff.slice(0, 12000) : diff;

  const prompt = `You are a senior engineer writing a brief summary for a code review email.
Given the following git diff, write a concise 3-6 sentence overview of what this changeset does.
Focus on: what was added/changed/removed, the purpose/intent, and which areas of the codebase are affected.
Do NOT list findings or issues — only describe what the code changes accomplish.
Reply with plain text only, no markdown, no bullet points, no headers.

Commit: ${commit.hash.substring(0, 12)}
Message: ${commit.message}
Repository: ${repo.name}
Branch: ${repo.branch}

Diff:
${snippet}`;

  const client = getOpenAIClient(provider);

  const response = await client.chat.completions.create({
    model: repo.llm_model,
    messages: [{ role: "user", content: prompt }],
    max_tokens: 300,
    temperature: 0.3,
  });

  return response.choices?.[0]?.message?.content?.trim() || "Unable to generate overview.";
}

export function extractFilePaths(diff: string): string {
  const matches = diff.match(/^diff --git a\/(.+?) b\/(.+?)$/gm) || [];
  return matches.map((m) => m.replace("diff --git a/", "").split(" b/")[0]).join("\n");
}

const RISK_ORDER: Record<string, number> = { must_fix: 0, should_fix_soon: 1, ignore: 2 };

export function parseFindings(content: string): RawFinding[] {
  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];

    const mapped: RawFinding[] = parsed.map((item: Record<string, unknown>) => ({
      file_path: String(item.file ?? item.file_path ?? ""),
      line_number: (item.line_start ?? item.line_number ?? null) as number | null,
      summary: String(item.title ?? item.summary ?? ""),
      explanation: String(item.explanation ?? ""),
      risk_level: String(item.risk ?? item.risk_level ?? "ignore"),
      suggested_fix: (item.suggested_fix as string | null) ?? null,
      category: (item.category as string | null) ?? null,
    }));

    return mapped.sort(
      (a, b) => (RISK_ORDER[a.risk_level] ?? 3) - (RISK_ORDER[b.risk_level] ?? 3)
    );
  } catch (err) {
    logger.warn("Failed to parse LLM findings", {
      error: err instanceof Error ? err.message : String(err),
      rawContent: content.substring(0, 200),
    });
    return [];
  }
}
