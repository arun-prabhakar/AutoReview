import OpenAI from "openai";
import type { CommitInfo } from "./bitbucket-client.js";
import type { RepositoryConfig } from "./repository-service.js";
import { logger } from "../middleware/index.js";

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

  if (truncated) {
    prompt += "\n\nNOTE: The diff was truncated due to size. Your review may be incomplete. Focus on the available changes.";
  }

  const client = new OpenAI({
    apiKey: provider.apiKey,
    baseURL: provider.apiBase,
  });

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

export function extractFilePaths(diff: string): string {
  const matches = diff.match(/^diff --git a\/(.+?) b\/(.+?)$/gm) || [];
  return matches.map((m) => m.replace("diff --git a/", "").split(" b/")[0]).join("\n");
}

export function parseFindings(content: string): RawFinding[] {
  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
