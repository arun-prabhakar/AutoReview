import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseFindings, filterExcludedPaths, extractFilePaths, analyzeDiff } from "../services/review-engine.js";
import type { RawFinding } from "../services/review-engine.js";
import type { CommitInfo } from "../services/bitbucket-client.js";
import type { RepositoryConfig } from "../services/repository-service.js";

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
    { file_path: "src/app.ts", line_number: 1, summary: "s", explanation: "e", risk_level: "must_fix", suggested_fix: null, category: null },
    { file_path: "node_modules/lodash/index.js", line_number: 2, summary: "s", explanation: "e", risk_level: "must_fix", suggested_fix: null, category: null },
    { file_path: "vendor/golang/pkg.go", line_number: 3, summary: "s", explanation: "e", risk_level: "must_fix", suggested_fix: null, category: null },
    { file_path: "dist/bundle.min.js", line_number: 4, summary: "s", explanation: "e", risk_level: "must_fix", suggested_fix: null, category: null },
    { file_path: "dist/bundle.min.css", line_number: 4, summary: "s", explanation: "e", risk_level: "must_fix", suggested_fix: null, category: null },
    { file_path: "package-lock.json", line_number: 5, summary: "s", explanation: "e", risk_level: "must_fix", suggested_fix: null, category: null },
    { file_path: "yarn.lock", line_number: 6, summary: "s", explanation: "e", risk_level: "must_fix", suggested_fix: null, category: null },
    { file_path: "build/output.js", line_number: 7, summary: "s", explanation: "e", risk_level: "must_fix", suggested_fix: null, category: null },
    { file_path: "src/something.generated.ts", line_number: 8, summary: "s", explanation: "e", risk_level: "must_fix", suggested_fix: null, category: null },
  ];

  it("should filter default exclusions", () => {
    const result = filterExcludedPaths(findings, null);
    expect(result).toHaveLength(1);
    expect(result[0].file_path).toBe("src/app.ts");
  });

  it("should filter custom excluded paths", () => {
    const customFindings: RawFinding[] = [
      { file_path: "src/app.ts", line_number: 1, summary: "s", explanation: "e", risk_level: "must_fix", suggested_fix: null, category: null },
      { file_path: "test/spec.ts", line_number: 2, summary: "s", explanation: "e", risk_level: "must_fix", suggested_fix: null, category: null },
    ];
    const result = filterExcludedPaths(customFindings, "test/*");
    expect(result).toHaveLength(1);
    expect(result[0].file_path).toBe("src/app.ts");
  });

  it("should filter with wildcard patterns", () => {
    const customFindings: RawFinding[] = [
      { file_path: "src/app.ts", line_number: 1, summary: "s", explanation: "e", risk_level: "must_fix", suggested_fix: null, category: null },
      { file_path: "src/generated.types.ts", line_number: 2, summary: "s", explanation: "e", risk_level: "must_fix", suggested_fix: null, category: null },
    ];
    const result = filterExcludedPaths(customFindings, "src/generated*");
    expect(result).toHaveLength(1);
    expect(result[0].file_path).toBe("src/app.ts");
  });

  it("should return all findings if no exclusions match", () => {
    const clean: RawFinding[] = [
      { file_path: "src/a.ts", line_number: 1, summary: "s", explanation: "e", risk_level: "must_fix", suggested_fix: null, category: null },
      { file_path: "src/b.ts", line_number: 2, summary: "s", explanation: "e", risk_level: "must_fix", suggested_fix: null, category: null },
    ];
    const result = filterExcludedPaths(clean, null);
    expect(result).toHaveLength(2);
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

describe("analyzeDiff", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("should call OpenAI SDK and return findings", async () => {
    const mockFindings = [{ id: "F001", file: "src/app.ts", line_start: 1, line_end: 1, title: "SQL injection", explanation: "e", risk: "must_fix", suggested_fix: "use param", category: "security" }];

    vi.doMock("openai", () => {
      return {
        default: class MockOpenAI {
          baseURL: string;
          apiKey: string;
          constructor(opts: { apiKey: string; baseURL: string }) {
            this.apiKey = opts.apiKey;
            this.baseURL = opts.baseURL;
          }
          chat = {
            completions: {
              create: async () => ({
                choices: [{ message: { content: JSON.stringify(mockFindings) } }],
              }),
            },
          };
        },
      };
    });

    const { analyzeDiff } = await import("../services/review-engine.js");

    const commit: CommitInfo = { hash: "abc123", message: "fix bug", author: { raw: "dev" }, date: "2024-01-01" };
    const repo: RepositoryConfig = {
      id: "repo-1", name: "test-repo", workspace: "ws", slug: "test", credential_id: "cred-1",
      branch: "main", strictness: "strict", llm_model: "gemini-flash-latest",
      llm_max_tokens: 4096, llm_temperature: 0.3, excluded_paths: "",
      review_mode: "auto", trigger_on_pr_update: false,
      auto_review_enabled: true, poll_interval_minutes: 5, trigger_on_commit: true,
      generate_email: true, post_to_bitbucket: false, notification_recipients: null,
      include_commit_author: false, llm_provider: "google", llm_provider_id: "prov-1",
    };

    const provider = { apiBase: "https://api.example.com/v1", apiKey: "test-key" };

    const result = await analyzeDiff("fake diff", commit, repo, "Review this: {{diff}}", provider, false);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].file_path).toBe("src/app.ts"); // mapped from `file`
    expect(result.incomplete).toBe(false);
  });
});
