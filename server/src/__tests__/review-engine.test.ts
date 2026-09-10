import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseFindings, filterExcludedPaths, filterLowConfidence, filterSuppressedFindings, extractFilePaths, cleanOverviewText, fallbackOverview, isUsableOverview, MAX_REVIEW_DIFF_CHARS, prepareDiffForAnalysis, buildFeedbackContext, renderFeedbackContext } from "../services/review-engine.js";
import type { RawFinding } from "../services/review-engine.js";
import type { CommitInfo } from "../services/bitbucket-client.js";
import type { EffectiveRepositoryConfig } from "../services/repository-service.js";

describe("prepareDiffForAnalysis", () => {
  it("removes excluded file chunks before sending a diff to the LLM", () => {
    const diff = [
      "diff --git a/src/app.ts b/src/app.ts\n+const active = true;\n",
      "diff --git a/package-lock.json b/package-lock.json\n+generated content\n",
      "diff --git a/docs/api.md b/docs/api.md\n+documentation\n",
    ].join("");

    const result = prepareDiffForAnalysis(diff, "docs/*");

    expect(result).toContain("src/app.ts");
    expect(result).not.toContain("package-lock.json");
    expect(result).not.toContain("docs/api.md");
  });

  it("caps the review diff payload", () => {
    const diff = `diff --git a/src/app.ts b/src/app.ts\n${"+x\n".repeat(30000)}`;
    expect(prepareDiffForAnalysis(diff, null)).toHaveLength(MAX_REVIEW_DIFF_CHARS);
  });
});

describe("parseFindings", () => {
  it("should parse new-format findings with field mapping", () => {
    const content = '```json\n[{"id":"F001","file":"a.ts","line_start":1,"line_end":3,"title":"s","explanation":"e","risk":"must_fix","suggested_fix":null,"category":"security"}]\n```';
    const result = parseFindings(content);
    expect(result).toHaveLength(1);
    expect(result[0].file_path).toBe("a.ts");
    expect(result[0].line_number).toBe(1);
    expect(result[0].summary).toBe("s");
    expect(result[0].risk_level).toBe("must_fix");
  });

  it("should parse JSON array without code block", () => {
    const content = '[{"id":"F001","file":"b.ts","line_start":2,"line_end":null,"title":"s","explanation":"e","risk":"should_fix_soon","suggested_fix":"fix","category":"performance"}]';
    const result = parseFindings(content);
    expect(result).toHaveLength(1);
    expect(result[0].risk_level).toBe("should_fix_soon");
  });

  it("should map compact file_index responses to changed file paths", () => {
    const content = '[{"file_index":2,"line_start":14,"title":"s","explanation":"e","risk":"must_fix","suggested_fix":"fix","category":"correctness"}]';
    const result = parseFindings(content, ["src/a.ts", "src/b.ts"]);

    expect(result).toHaveLength(1);
    expect(result[0].file_path).toBe("src/b.ts");
    expect(result[0].line_number).toBe(14);
    expect(result[0].summary).toBe("s");
  });

  it("should map 0-based file_index responses when index 0 appears", () => {
    const content = '[{"file_index":0,"line_start":1,"title":"a","explanation":"e","risk":"must_fix","suggested_fix":null,"category":null},{"file_index":1,"line_start":2,"title":"b","explanation":"e","risk":"must_fix","suggested_fix":null,"category":null}]';
    const result = parseFindings(content, ["src/a.ts", "src/b.ts"]);

    expect(result).toHaveLength(2);
    expect(result[0].file_path).toBe("src/a.ts");
    expect(result[1].file_path).toBe("src/b.ts");
  });

  it("should return empty array for invalid JSON", () => {
    expect(parseFindings("no json here")).toEqual([]);
    expect(parseFindings("")).toEqual([]);
    expect(parseFindings("not an array")).toEqual([]);
  });

  it("should return empty array for non-array JSON", () => {
    expect(parseFindings('{"key":"value"}')).toEqual([]);
  });

  it("should sort findings: must_fix first, then should_fix_soon, then ignore", () => {
    const content = '[{"id":"F001","file":"a.ts","line_start":1,"line_end":null,"title":"s1","explanation":"e1","risk":"ignore","suggested_fix":null,"category":null},{"id":"F002","file":"b.ts","line_start":2,"line_end":null,"title":"s2","explanation":"e2","risk":"must_fix","suggested_fix":null,"category":null},{"id":"F003","file":"c.ts","line_start":3,"line_end":null,"title":"s3","explanation":"e3","risk":"should_fix_soon","suggested_fix":null,"category":null}]';
    const result = parseFindings(content);
    expect(result).toHaveLength(3);
    expect(result[0].risk_level).toBe("must_fix");
    expect(result[1].risk_level).toBe("should_fix_soon");
    expect(result[2].risk_level).toBe("ignore");
  });

  it("should parse multiple findings", () => {
    const content = '[{"id":"F001","file":"a.ts","line_start":1,"line_end":null,"title":"s1","explanation":"e1","risk":"must_fix","suggested_fix":null,"category":null},{"id":"F002","file":"b.ts","line_start":2,"line_end":null,"title":"s2","explanation":"e2","risk":"ignore","suggested_fix":null,"category":null}]';
    const result = parseFindings(content);
    expect(result).toHaveLength(2);
  });
});

describe("filterExcludedPaths", () => {
  const findings: RawFinding[] = [
    { file_path: "src/app.ts", line_number: 1, summary: "s", explanation: "e", risk_level: "must_fix", suggested_fix: null, category: null, confidence: 90, test_gap: null },
    { file_path: "node_modules/lodash/index.js", line_number: 2, summary: "s", explanation: "e", risk_level: "must_fix", suggested_fix: null, category: null, confidence: null, test_gap: null },
    { file_path: "vendor/golang/pkg.go", line_number: 3, summary: "s", explanation: "e", risk_level: "must_fix", suggested_fix: null, category: null, confidence: null, test_gap: null },
    { file_path: "dist/bundle.min.js", line_number: 4, summary: "s", explanation: "e", risk_level: "must_fix", suggested_fix: null, category: null, confidence: null, test_gap: null },
    { file_path: "dist/bundle.min.css", line_number: 4, summary: "s", explanation: "e", risk_level: "must_fix", suggested_fix: null, category: null, confidence: null, test_gap: null },
    { file_path: "package-lock.json", line_number: 5, summary: "s", explanation: "e", risk_level: "must_fix", suggested_fix: null, category: null, confidence: null, test_gap: null },
    { file_path: "yarn.lock", line_number: 6, summary: "s", explanation: "e", risk_level: "must_fix", suggested_fix: null, category: null, confidence: null, test_gap: null },
    { file_path: "build/output.js", line_number: 7, summary: "s", explanation: "e", risk_level: "must_fix", suggested_fix: null, category: null, confidence: null, test_gap: null },
    { file_path: "src/something.generated.ts", line_number: 8, summary: "s", explanation: "e", risk_level: "must_fix", suggested_fix: null, category: null, confidence: null, test_gap: null },
  ];

  it("should filter default exclusions", () => {
    const result = filterExcludedPaths(findings, null);
    expect(result).toHaveLength(1);
    expect(result[0].file_path).toBe("src/app.ts");
  });

  it("should filter custom excluded paths", () => {
    const customFindings: RawFinding[] = [
      { file_path: "src/app.ts", line_number: 1, summary: "s", explanation: "e", risk_level: "must_fix", suggested_fix: null, category: null, confidence: null, test_gap: null },
      { file_path: "test/spec.ts", line_number: 2, summary: "s", explanation: "e", risk_level: "must_fix", suggested_fix: null, category: null, confidence: null, test_gap: null },
    ];
    const result = filterExcludedPaths(customFindings, "test/*");
    expect(result).toHaveLength(1);
    expect(result[0].file_path).toBe("src/app.ts");
  });

  it("should filter with wildcard patterns", () => {
    const customFindings: RawFinding[] = [
      { file_path: "src/app.ts", line_number: 1, summary: "s", explanation: "e", risk_level: "must_fix", suggested_fix: null, category: null, confidence: null, test_gap: null },
      { file_path: "src/generated.types.ts", line_number: 2, summary: "s", explanation: "e", risk_level: "must_fix", suggested_fix: null, category: null, confidence: null, test_gap: null },
    ];
    const result = filterExcludedPaths(customFindings, "src/generated*");
    expect(result).toHaveLength(1);
    expect(result[0].file_path).toBe("src/app.ts");
  });

  it("should return all findings if no exclusions match", () => {
    const clean: RawFinding[] = [
      { file_path: "src/a.ts", line_number: 1, summary: "s", explanation: "e", risk_level: "must_fix", suggested_fix: null, category: null, confidence: null, test_gap: null },
      { file_path: "src/b.ts", line_number: 2, summary: "s", explanation: "e", risk_level: "must_fix", suggested_fix: null, category: null, confidence: null, test_gap: null },
    ];
    const result = filterExcludedPaths(clean, null);
    expect(result).toHaveLength(2);
  });
});

describe("confidence handling", () => {
  it("should parse confidence and test_gap from findings", () => {
    const content = '[{"file_index":1,"line_start":10,"title":"s","explanation":"e","risk":"must_fix","confidence":92,"suggested_fix":null,"category":"security","test_gap":"no test covers invalid input"}]';
    const result = parseFindings(content, ["src/a.ts"]);

    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBe(92);
    expect(result[0].test_gap).toBe("no test covers invalid input");
  });

  it("should clamp out-of-range confidence values", () => {
    const content = '[{"file":"a.ts","line_start":1,"title":"s","explanation":"e","risk":"ignore","confidence":150,"suggested_fix":null,"category":null},{"file":"a.ts","line_start":2,"title":"s2","explanation":"e","risk":"ignore","confidence":-10,"suggested_fix":null,"category":null}]';
    const result = parseFindings(content);

    expect(result[0].confidence).toBe(100);
    expect(result[1].confidence).toBe(0);
  });

  it("should default confidence to null when absent", () => {
    const content = '[{"file":"a.ts","line_start":1,"title":"s","explanation":"e","risk":"must_fix","suggested_fix":null,"category":null}]';
    const result = parseFindings(content);

    expect(result[0].confidence).toBeNull();
    expect(result[0].test_gap).toBeNull();
  });

  it("should drop findings below the confidence threshold and keep null-confidence findings", () => {
    const findings: RawFinding[] = [
      { file_path: "a.ts", line_number: 1, summary: "solid", explanation: "e", risk_level: "must_fix", suggested_fix: null, category: null, confidence: 92, test_gap: null },
      { file_path: "a.ts", line_number: 2, summary: "weak", explanation: "e", risk_level: "should_fix_soon", suggested_fix: null, category: null, confidence: 40, test_gap: null },
      { file_path: "a.ts", line_number: 3, summary: "legacy", explanation: "e", risk_level: "ignore", suggested_fix: null, category: null, confidence: null, test_gap: null },
    ];
    const result = filterLowConfidence(findings);

    expect(result).toHaveLength(2);
    expect(result.map((f) => f.summary)).toEqual(["solid", "legacy"]);
  });

  it("should keep findings at exactly the confidence threshold", () => {
    const findings: RawFinding[] = [
      { file_path: "a.ts", line_number: 1, summary: "edge", explanation: "e", risk_level: "must_fix", suggested_fix: null, category: null, confidence: 50, test_gap: null },
    ];

    expect(filterLowConfidence(findings)).toHaveLength(1);
  });
});

describe("extractFilePaths", () => {
  it("should extract file paths from git diff", () => {
    const diff = `diff --git a/src/app.ts b/src/app.ts
index abc..def 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,3 +1,4 @@
diff --git a/src/utils.ts b/src/utils.ts
index ghi..jkl 100644`;
    const result = extractFilePaths(diff);
    expect(result).toContain("src/app.ts");
    expect(result).toContain("src/utils.ts");
  });

  it("should return empty string for no matches", () => {
    expect(extractFilePaths("no diff here")).toBe("");
  });
});

describe("overview cleanup", () => {
  it("rejects partial overview fragments", () => {
    const cleaned = cleanOverviewText("Implement co-", false);

    expect(cleaned).toBe("Implement co-.");
    expect(isUsableOverview(cleaned)).toBe(false);
  });

  it("accepts compact complete overview sentences", () => {
    const cleaned = cleanOverviewText("Implement compact commit overview validation", false);

    expect(cleaned).toBe("Implement compact commit overview validation.");
    expect(isUsableOverview(cleaned)).toBe(true);
  });

  it("falls back to a complete commit subject", () => {
    const commit: CommitInfo = {
      hash: "abc123",
      message: "Improve AI overview generation for recent commits\n\nBody",
      author: { raw: "dev" },
      date: "2024-01-01",
    };

    expect(fallbackOverview(commit, "")).toBe("Improve AI overview generation for recent commits.");
  });

  it("falls back to changed files when the commit subject is also partial", () => {
    const commit: CommitInfo = {
      hash: "abc123",
      message: "Implement co-",
      author: { raw: "dev" },
      date: "2024-01-01",
    };
    const diff = "diff --git a/server/src/services/review-engine.ts b/server/src/services/review-engine.ts";

    expect(fallbackOverview(commit, diff)).toBe("Update server/src/services/review-engine.ts.");
  });
});

describe("filterSuppressedFindings", () => {
  const base = { line_number: 1, explanation: "e", risk_level: "must_fix", suggested_fix: null, category: null, confidence: 90, test_gap: null };

  it("drops findings matching a suppressed file and summary prefix", () => {
    const findings: RawFinding[] = [
      { ...base, file_path: "src/app.ts", summary: "Missing input validation" },
      { ...base, file_path: "src/app.ts", summary: "Race condition in cache" },
    ];
    const result = filterSuppressedFindings(findings, [
      { file_path: "src/app.ts", summary: "Missing   input validation" },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].summary).toBe("Race condition in cache");
  });

  it("keeps moderately similar summaries on a different file", () => {
    const findings: RawFinding[] = [
      { ...base, file_path: "src/other.ts", summary: "Missing input validation on the import endpoint" },
    ];
    const result = filterSuppressedFindings(findings, [
      { file_path: "src/app.ts", summary: "Missing input validation" },
    ]);
    expect(result).toHaveLength(1);
  });

  it("returns findings unchanged when suppression list is empty", () => {
    const findings: RawFinding[] = [{ ...base, file_path: "src/app.ts", summary: "s" }];
    expect(filterSuppressedFindings(findings, [])).toEqual(findings);
  });
});

describe("multiPassReview source pass tagging", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("tags each finding with the pass that produced it", async () => {
    let call = 0;
    vi.doMock("../services/llm/index.js", () => ({
      createAdapter: () => ({
        complete: vi.fn(async () => {
          call++;
          return {
            content: JSON.stringify([{ file: "src/app.ts", line_start: 1, title: `Issue ${call}`, explanation: "e", risk: "must_fix", suggested_fix: null, category: null }]),
            finishReason: "stop",
            tokenUsage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          };
        }),
        testConnection: async () => ({ message: "ok" }),
        listModels: async () => [],
      }),
      ProviderConfig: {},
    }));

    const { multiPassReview } = await import("../services/review-engine.js");

    const commit: CommitInfo = { hash: "abc123", message: "m", author: { raw: "dev" }, date: "2024-01-01" };
    const repo: EffectiveRepositoryConfig = {
      id: "repo-1", name: "test-repo", workspace: "ws", slug: "test", credential_id: "cred-1",
      branch: "main", strictness: "strict", llm_model: "gpt-test",
      llm_max_tokens: 4096, llm_temperature: 0.3, excluded_paths: "",
      review_mode: "auto", trigger_on_pr_update: false,
      auto_review_enabled: true, poll_interval_minutes: 5, trigger_on_commit: true,
      generate_email: true, post_to_bitbucket: false, notification_recipients: null,
      include_commit_author: false, llm_provider: "openai", llm_provider_id: "prov-1",
      multi_pass_review: true, agent_review: false,
    };

    const diff = "diff --git a/src/app.ts b/src/app.ts\n@@ -1 +1 @@\n-old\n+new";
    const result = await multiPassReview(
      diff, commit, repo, "Review: {{diff}}",
      { providerType: "openai_compatible", apiBase: "https://api.example.com/v1", apiKey: "k" },
      false,
    );

    expect(result.passes).toHaveLength(4);
    expect(result.findings).toHaveLength(4);
    const passes = result.findings.map((f) => f.source_pass).sort();
    expect(passes).toEqual(["maintainability", "performance", "security", "standards"]);
  });
});

describe("false-positive feedback context", () => {
  it("builds a numbered feedback list with category and reason", () => {
    const context = buildFeedbackContext([
      { file_path: "src/app.ts", summary: "Missing   input validation", category: "security", reason: "validation exists in caller" },
      { file_path: "src/util.ts", summary: "Magic number", category: null, reason: null },
    ]);

    expect(context).toContain('1. src/app.ts [security]: "Missing input validation" — team reason: validation exists in caller');
    expect(context).toContain('2. src/util.ts: "Magic number"');
  });

  it("returns undefined for empty feedback", () => {
    expect(buildFeedbackContext([])).toBeUndefined();
  });

  it("renders the do-not-repeat block only when feedback exists", () => {
    expect(renderFeedbackContext(undefined)).toBe("");
    const rendered = renderFeedbackContext('1. src/app.ts: "Something"');
    expect(rendered).toContain("False-Positive Feedback");
    expect(rendered).toContain("Do NOT report these issues again");
    expect(rendered).toContain('1. src/app.ts: "Something"');
  });

  it("injects feedback context into the analysis prompt", async () => {
    vi.resetModules();
    const mockFindings = [{ file: "src/app.ts", line_start: 1, title: "s", explanation: "e", risk: "must_fix", suggested_fix: null, category: null }];
    const completeMock = vi.fn(async (_request: { messages: { content: string }[] }) => ({
      content: JSON.stringify(mockFindings),
      finishReason: "stop",
      tokenUsage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    }));

    vi.doMock("../services/llm/index.js", () => ({
      createAdapter: () => ({ complete: completeMock }),
      ProviderConfig: {},
    }));

    const { analyzeDiff } = await import("../services/review-engine.js");

    const commit: CommitInfo = { hash: "abc123", message: "fix bug", author: { raw: "dev" }, date: "2024-01-01" };
    const repo: EffectiveRepositoryConfig = {
      id: "repo-1", name: "test-repo", workspace: "ws", slug: "test", credential_id: "cred-1",
      branch: "main", strictness: "strict", llm_model: "gpt-test",
      llm_max_tokens: 4096, llm_temperature: 0.3, excluded_paths: "",
      review_mode: "auto", trigger_on_pr_update: false,
      auto_review_enabled: true, poll_interval_minutes: 5, trigger_on_commit: true,
      generate_email: true, post_to_bitbucket: false, notification_recipients: null,
      include_commit_author: false, llm_provider: "openai", llm_provider_id: "prov-1",
      multi_pass_review: false, agent_review: false,
    };

    const diff = "diff --git a/src/app.ts b/src/app.ts\n@@ -1 +1 @@\n-old\n+new";
    await analyzeDiff(
      diff, commit, repo, "Review this: {{diff}}",
      { providerType: "openai_compatible", apiBase: "https://api.example.com/v1", apiKey: "k" },
      false, undefined, undefined, '1. src/app.ts [security]: "Missing validation"',
    );

    const prompt = String(completeMock.mock.calls[0][0].messages[0].content);
    expect(prompt).toContain("False-Positive Feedback");
    expect(prompt).toContain('1. src/app.ts [security]: "Missing validation"');
    expect(prompt.indexOf("False-Positive Feedback")).toBeLessThan(prompt.indexOf("Review Rules"));
  });
});

describe("analyzeDiff", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("should call adapter and return findings", async () => {
    const mockFindings = [{ id: "F001", file: "src/app.ts", line_start: 1, line_end: 1, title: "SQL injection", explanation: "e", risk: "must_fix", suggested_fix: "use param", category: "security" }];

    vi.doMock("../services/llm/index.js", () => ({
      createAdapter: () => ({
        complete: async () => ({
          content: JSON.stringify(mockFindings),
          finishReason: "stop",
          tokenUsage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        }),
      }),
      ProviderConfig: {},
    }));

    const { analyzeDiff } = await import("../services/review-engine.js");

    const commit: CommitInfo = { hash: "abc123", message: "fix bug", author: { raw: "dev" }, date: "2024-01-01" };
    const repo: EffectiveRepositoryConfig = {
      id: "repo-1", name: "test-repo", workspace: "ws", slug: "test", credential_id: "cred-1",
      branch: "main", strictness: "strict", llm_model: "gemini-flash-latest",
      llm_max_tokens: 4096, llm_temperature: 0.3, excluded_paths: "",
      review_mode: "auto", trigger_on_pr_update: false,
      auto_review_enabled: true, poll_interval_minutes: 5, trigger_on_commit: true,
      generate_email: true, post_to_bitbucket: false, notification_recipients: null,
      include_commit_author: false, llm_provider: "google", llm_provider_id: "prov-1",
      multi_pass_review: false, agent_review: false,
    };

    const provider = { providerType: "openai_compatible", apiBase: "https://api.example.com/v1", apiKey: "test-key" };

    const result = await analyzeDiff("fake diff", commit, repo, "Review this: {{diff}}", provider, false);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].file_path).toBe("src/app.ts");
    expect(result.incomplete).toBe(false);
    expect(result.aiResponse).toBe(JSON.stringify(mockFindings));
  });

  it("should fail instead of returning no findings for partial JSON responses", async () => {
    const partialResponse = '```json\n[\n  {\n    "id": "F001",\n    "file": "docker-compose.yml",\n    "line_start": 246,\n    "explanation": "ReportService/';
    const completeMock = vi.fn(async (_request: { maxTokens?: number }) => ({
      content: partialResponse,
      finishReason: "length",
      tokenUsage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    }));

    vi.doMock("../services/llm/index.js", () => ({
      createAdapter: () => ({
        complete: completeMock,
      }),
      ProviderConfig: {},
    }));

    const { analyzeDiff, LlmResponseError } = await import("../services/review-engine.js");

    const commit: CommitInfo = { hash: "abc123", message: "fix bug", author: { raw: "dev" }, date: "2024-01-01" };
    const repo: EffectiveRepositoryConfig = {
      id: "repo-1", name: "test-repo", workspace: "ws", slug: "test", credential_id: "cred-1",
      branch: "main", strictness: "strict", llm_model: "gemini-flash-latest",
      llm_max_tokens: 4096, llm_temperature: 0.3, excluded_paths: "",
      review_mode: "auto", trigger_on_pr_update: false,
      auto_review_enabled: true, poll_interval_minutes: 5, trigger_on_commit: true,
      generate_email: true, post_to_bitbucket: false, notification_recipients: null,
      include_commit_author: false, llm_provider: "google", llm_provider_id: "prov-1",
      multi_pass_review: false, agent_review: false,
    };

    await expect(analyzeDiff("fake diff", commit, repo, "Review this: {{diff}}", { providerType: "openai_compatible", apiBase: "https://api.example.com/v1", apiKey: "test-key" }, false))
      .rejects.toBeInstanceOf(LlmResponseError);
    expect(completeMock).toHaveBeenCalledTimes(2);
    expect(completeMock.mock.calls[1]?.[0]?.maxTokens).toBe(8192);
  });

  it("should retry once when the first AI response cannot be parsed", async () => {
    const validFindings = [{ file_index: 1, line_start: 5, title: "Missing guard", explanation: "Value may be undefined.", risk: "must_fix", suggested_fix: "Add a guard.", category: "correctness" }];
    const completeMock = vi
      .fn()
      .mockResolvedValueOnce({
        content: "[{\"file_index\":1,\"line_start\":5,",
        finishReason: "stop",
        tokenUsage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
      })
      .mockResolvedValueOnce({
        content: JSON.stringify(validFindings),
        finishReason: "stop",
        tokenUsage: { prompt_tokens: 11, completion_tokens: 12, total_tokens: 23 },
      });

    vi.doMock("../services/llm/index.js", () => ({
      createAdapter: () => ({
        complete: completeMock,
      }),
      ProviderConfig: {},
    }));

    const { analyzeDiff } = await import("../services/review-engine.js");

    const commit: CommitInfo = { hash: "abc123", message: "fix bug", author: { raw: "dev" }, date: "2024-01-01" };
    const repo: EffectiveRepositoryConfig = {
      id: "repo-1", name: "test-repo", workspace: "ws", slug: "test", credential_id: "cred-1",
      branch: "main", strictness: "strict", llm_model: "gemini-flash-latest",
      llm_max_tokens: 4096, llm_temperature: 0.3, excluded_paths: "",
      review_mode: "auto", trigger_on_pr_update: false,
      auto_review_enabled: true, poll_interval_minutes: 5, trigger_on_commit: true,
      generate_email: true, post_to_bitbucket: false, notification_recipients: null,
      include_commit_author: false, llm_provider: "google", llm_provider_id: "prov-1",
      multi_pass_review: false, agent_review: false,
    };

    const diff = "diff --git a/src/app.ts b/src/app.ts\n@@ -1 +1 @@\n-old\n+new";
    const result = await analyzeDiff(diff, commit, repo, "Review this: {{diff}}\nFiles:\n{{file_paths}}", { providerType: "openai_compatible", apiBase: "https://api.example.com/v1", apiKey: "test-key" }, false);

    expect(completeMock).toHaveBeenCalledTimes(2);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].file_path).toBe("src/app.ts");
    expect(result.tokenUsage.total_tokens).toBe(37);
  });

  it("should drop low-confidence findings and keep null-confidence findings", async () => {
    const mockFindings = [
      { file_index: 1, line_start: 1, title: "solid", explanation: "e", risk: "must_fix", confidence: 95, suggested_fix: null, category: "security", test_gap: "tests never pass invalid input" },
      { file_index: 1, line_start: 2, title: "speculative", explanation: "e", risk: "should_fix_soon", confidence: 30, suggested_fix: null, category: "style", test_gap: null },
      { file_index: 1, line_start: 3, title: "legacy-format", explanation: "e", risk: "ignore", suggested_fix: null, category: null },
    ];

    vi.doMock("../services/llm/index.js", () => ({
      createAdapter: () => ({
        complete: async () => ({
          content: JSON.stringify(mockFindings),
          finishReason: "stop",
          tokenUsage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        }),
      }),
      ProviderConfig: {},
    }));

    const { analyzeDiff } = await import("../services/review-engine.js");

    const commit: CommitInfo = { hash: "abc123", message: "fix bug", author: { raw: "dev" }, date: "2024-01-01" };
    const repo: EffectiveRepositoryConfig = {
      id: "repo-1", name: "test-repo", workspace: "ws", slug: "test", credential_id: "cred-1",
      branch: "main", strictness: "strict", llm_model: "gemini-flash-latest",
      llm_max_tokens: 4096, llm_temperature: 0.3, excluded_paths: "",
      review_mode: "auto", trigger_on_pr_update: false,
      auto_review_enabled: true, poll_interval_minutes: 5, trigger_on_commit: true,
      generate_email: true, post_to_bitbucket: false, notification_recipients: null,
      include_commit_author: false, llm_provider: "google", llm_provider_id: "prov-1",
      multi_pass_review: false, agent_review: false,
    };

    const diff = "diff --git a/src/app.ts b/src/app.ts\n@@ -1,3 +1,3 @@\n-a\n+b\n+c";
    const result = await analyzeDiff(diff, commit, repo, "Review this: {{diff}}", { providerType: "openai_compatible", apiBase: "https://api.example.com/v1", apiKey: "test-key" }, false);

    expect(result.findings).toHaveLength(2);
    expect(result.findings.map((f) => f.summary)).toEqual(["solid", "legacy-format"]);
    expect(result.findings[0].confidence).toBe(95);
    expect(result.findings[0].test_gap).toBe("tests never pass invalid input");
  });
});
