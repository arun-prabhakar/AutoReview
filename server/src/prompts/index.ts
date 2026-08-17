import type { CommitInfo } from "../services/bitbucket-client.js";
import type { RepositoryConfig } from "../services/repository-service.js";

export const DEFAULT_REVIEW_PROMPT = `You are a senior code reviewer. Find concrete defects introduced by the changed lines. Prioritize correctness, security, data integrity, reliability, and meaningful performance regressions. Do not report speculative issues, unchanged-code problems, formatting preferences, or praise.

Context:
- Repository: {{repository}}
- Branch: {{branch}}
- Commit: {{commit_hash}}
- Strictness: {{strictness_level}}
- Changed files: {{file_paths}}
- Excluded paths: {{excluded_paths}}

Risk rules:
- must_fix: exploitable vulnerability, data loss, crash, broken behavior, or merge-blocking defect.
- should_fix_soon: probable bug, significant performance issue, or costly maintainability risk.
- ignore: minor but useful observation; include only in strict mode.

Validate each finding against the diff. If no actionable defect exists, return [].

Diff:
\`\`\`diff
{{diff}}
\`\`\``;

export const FIXED_OUTPUT_FORMAT = `

## Required output
Return only one valid JSON array, with at most 30 findings, sorted by risk. No markdown or prose outside JSON. Keep explanation under 60 words and suggested_fix under 80 words.

Use file_index from the changed-files list; do not repeat file paths or repository metadata.

[
  {
    "file_index": 1,
    "line_start": 10,
    "category": "security | performance | correctness | maintainability | style",
    "risk": "must_fix | should_fix_soon | ignore",
    "title": "concise defect summary",
    "explanation": "why it fails and the impact",
    "suggested_fix": "specific correction or null"
  }
]`;

export const SPECIALIZED_PROMPTS: Record<string, string> = {
  security: "Report only exploitable security defects introduced by this diff: injection, authorization bypass, secret exposure, unsafe cryptography, SSRF, XSS, CSRF, traversal, or insecure deserialization. Require a plausible attack path.",
  performance: "Report only measurable performance regressions introduced by this diff: N+1 I/O, unbounded work, leaks, blocking operations, missing query indexes, or materially worse algorithms.",
  maintainability: "Report only maintainability defects likely to cause bugs or expensive changes: duplicated business rules, unsafe complexity, hidden coupling, dead paths, or missing error handling. Skip naming and formatting preferences.",
};

export const CONNECTION_TEST_PROMPT = "Reply with exactly: OK";

export function buildRetryPrompt(prompt: string): string {
  return `${prompt}\n\nRETRY: Return one complete valid JSON array only. Keep findings concise and use valid file_index values.`;
}

export function buildOverviewPrompt(diff: string, commit: CommitInfo, repo: RepositoryConfig): string {
  return `Write one complete sentence of at most 15 words summarizing this change. Start with an active verb and return plain text only.\nRepository: ${repo.name}\nCommit: ${commit.message}\nDiff:\n${diff.slice(0, 8000)}`;
}

export function buildPromptEnhancementMessages(content: string, customPrompt?: string) {
  return {
    system: "Improve this code-review prompt for precision, low false positives, concise output, and clear severity rules. Preserve all template variables. Return only the improved prompt.",
    user: customPrompt
      ? `Prompt:\n${content}\n\nAdditional requirements:\n${customPrompt}`
      : `Prompt:\n${content}`,
  };
}

export function buildSpecializedTemplate(baseTemplate: string, focus: string): string {
  return `${baseTemplate}\n\nSpecialized focus: ${SPECIALIZED_PROMPTS[focus]} Return [] when no ${focus} defect exists.`;
}
