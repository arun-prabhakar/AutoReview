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

export type TokenUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

export async function analyzeDiff(
  diff: string,
  commit: CommitInfo,
  repo: RepositoryConfig,
  promptTemplate: string,
  provider: ProviderConfig,
  truncated = false,
  projectContext?: string
): Promise<{ findings: RawFinding[]; incomplete: boolean; tokenUsage: TokenUsage }> {
  let prompt = promptTemplate
    .replace("{{diff}}", diff)
    .replace("{{file_paths}}", extractFilePaths(diff))
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

  const client = getOpenAIClient(provider);

  const response = await client.chat.completions.create({
    model: repo.llm_model,
    messages: [{ role: "user", content: prompt }],
    max_tokens: repo.llm_max_tokens,
    temperature: repo.llm_temperature,
  });

  const content = response.choices?.[0]?.message?.content || "[]";

  const tokenUsage: TokenUsage = {
    prompt_tokens: response.usage?.prompt_tokens ?? 0,
    completion_tokens: response.usage?.completion_tokens ?? 0,
    total_tokens: response.usage?.total_tokens ?? 0,
  };

  logger.info("LLM response received", {
    model: repo.llm_model,
    contentLength: content.length,
    tokens: tokenUsage.total_tokens,
    finishReason: response.choices?.[0]?.finish_reason,
    contentPreview: content.substring(0, 300),
  });

  const findings = filterExcludedPaths(parseFindings(content), repo.excluded_paths);

  logger.info("Findings parsed", {
    total: findings.length,
    riskBreakdown: {
      must_fix: findings.filter(f => f.risk_level === "must_fix").length,
      should_fix_soon: findings.filter(f => f.risk_level === "should_fix_soon").length,
      ignore: findings.filter(f => f.risk_level === "ignore").length,
    },
    excludedPaths: repo.excluded_paths,
  });

  return { findings, incomplete: truncated, tokenUsage };
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
- Plain text only, no markdown
- The sentence MUST be complete and grammatical — never trail off or end mid-thought
- End with a period

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
    max_tokens: 200,
    temperature: 0.2,
  });

  const raw = response.choices?.[0]?.message?.content?.trim() || "";
  if (!raw) return "";
  const overview = raw.endsWith(".") ? raw : raw + ".";
  return overview;
}

export function extractFilePaths(diff: string): string {
  const matches = diff.match(/^diff --git a\/(.+?) b\/(.+?)$/gm) || [];
  return matches.map((m) => m.replace("diff --git a/", "").split(" b/")[0]).join("\n");
}

const RISK_ORDER: Record<string, number> = { must_fix: 0, should_fix_soon: 1, ignore: 2 };

export function parseFindings(content: string): RawFinding[] {
  const jsonStr = extractJsonArray(content);
  if (!jsonStr) {
    logger.warn("parseFindings: no JSON array found in LLM response", {
      contentPreview: content.substring(0, 500),
    });
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    logger.warn("parseFindings: JSON.parse failed", {
      error: err instanceof Error ? err.message : String(err),
      matchedJson: jsonStr.substring(0, 300),
    });
    return [];
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
      logger.warn("parseFindings: parsed result is not an array", { type: typeof parsed });
      return [];
    }
  }

  if (parsed.length === 0) {
    logger.info("parseFindings: LLM returned empty array (clean diff)");
    return [];
  }

  try {
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
    logger.warn("parseFindings: field mapping failed", {
      error: err instanceof Error ? err.message : String(err),
      firstItem: JSON.stringify(parsed[0]).substring(0, 300),
    });
    return [];
  }
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
  let totalUsage: TokenUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

  const focuses = Object.keys(SPECIALIZED_PROMPTS);

  const results = await Promise.allSettled(
    focuses.map(async (focus) => {
      const specializedSuffix = `\n\n## Specialized Focus\n\n${SPECIALIZED_PROMPTS[focus]}\n\nOnly report findings relevant to this focus area. If no ${focus}-related issues exist, return an empty array [].`;
      const template = baseTemplate + specializedSuffix;

      const { findings, tokenUsage } = await analyzeDiff(diff, commit, repo, template, provider, truncated, projectContext);
      return { focus, findings, tokenUsage };
    })
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      const { focus, findings, tokenUsage } = result.value;
      allFindings.push(...findings);
      totalUsage = {
        prompt_tokens: totalUsage.prompt_tokens + tokenUsage.prompt_tokens,
        completion_tokens: totalUsage.completion_tokens + tokenUsage.completion_tokens,
        total_tokens: totalUsage.total_tokens + tokenUsage.total_tokens,
      };
      passes.push({ focus, findings: findings.length });
    } else {
      const focus = focuses[results.indexOf(result)];
      logger.warn(`Multi-pass ${focus} review failed`, { error: String(result.reason) });
      passes.push({ focus, findings: 0 });
    }
  }

  const deduplicated = deduplicateFindings(allFindings);

  return { findings: deduplicated, tokenUsage: totalUsage, passes };
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
