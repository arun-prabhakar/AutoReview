import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CommitInfo } from "../services/bitbucket-client.js";
import type { RepositoryConfig } from "../services/repository-service.js";

function makeRepo(overrides: Partial<RepositoryConfig> = {}): RepositoryConfig {
  return {
    id: "repo-1", name: "test-repo", workspace: "ws", slug: "test", credential_id: "cred-1",
    branch: "main", strictness: "strict", llm_model: "gpt-test",
    llm_max_tokens: 4096, llm_temperature: 0.3, excluded_paths: "",
    review_mode: "auto", trigger_on_pr_update: false,
    auto_review_enabled: true, poll_interval_minutes: 5, trigger_on_commit: true,
    generate_email: true, post_to_bitbucket: false, notification_recipients: null,
    include_commit_author: false, llm_provider: "openai", llm_provider_id: "prov-1",
    multi_pass_review: false, agent_review: true,
    ...overrides,
  };
}

describe("parseAgentTurn", () => {
  it("parses a TOOL_CALL turn", async () => {
    const { parseAgentTurn } = await import("../services/agent-review.js");
    const turn = parseAgentTurn('{"action":"TOOL_CALL","tool":"read_file","args":{"path":"src/app.ts"}}');
    expect(turn).toEqual({ action: "TOOL_CALL", tool: "read_file", args: { path: "src/app.ts" } });
  });

  it("parses a FINAL turn with serialized JSON content", async () => {
    const { parseAgentTurn } = await import("../services/agent-review.js");
    const content = JSON.stringify([{ file: "a.ts", line_start: 1, title: "s", risk: "must_fix" }]);
    const turn = parseAgentTurn(`{"action":"FINAL","content":${JSON.stringify(content)}}`);
    expect(turn.action).toBe("FINAL");
    if (turn.action === "FINAL") expect(turn.content).toBe(content);
  });

  it("tolerates surrounding prose and markdown fences", async () => {
    const { parseAgentTurn } = await import("../services/agent-review.js");
    const turn = parseAgentTurn('Here is my next step:\n```json\n{"action":"TOOL_CALL","tool":"list_files","args":{"path":"src"}}\n```');
    expect(turn.action).toBe("TOOL_CALL");
  });

  it("returns INVALID for non-JSON or malformed objects", async () => {
    const { parseAgentTurn } = await import("../services/agent-review.js");
    expect(parseAgentTurn("no json").action).toBe("INVALID");
    expect(parseAgentTurn('{"action":"BOGUS"}').action).toBe("INVALID");
    expect(parseAgentTurn("").action).toBe("INVALID");
  });
});

describe("runAgentReview", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("explores with tools, then finalizes with parsed findings", async () => {
    const findingsJson = JSON.stringify([
      { file_index: 1, line_start: 2, title: "Bad guard", explanation: "e", risk: "must_fix", confidence: 90, suggested_fix: null, category: "correctness", test_gap: "no test" },
    ]);

    const completeMock = vi
      .fn()
      .mockResolvedValueOnce({
        content: '{"action":"TOOL_CALL","tool":"read_file","args":{"path":"src/app.ts"}}',
        finishReason: "stop",
        tokenUsage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 },
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({ action: "FINAL", content: findingsJson }),
        finishReason: "stop",
        tokenUsage: { prompt_tokens: 150, completion_tokens: 40, total_tokens: 190 },
      });

    const readMock = vi.fn(async () => "export function app() { return 1; }");
    const listMock = vi.fn(async () => ["src/", "README.md"]);

    vi.doMock("../services/llm/index.js", () => ({
      createAdapter: () => ({ complete: completeMock, testConnection: async () => ({ message: "ok" }), listModels: async () => [] }),
      ProviderConfig: {},
    }));
    vi.doMock("../services/bitbucket-client.js", () => ({
      fetchFileFromRepoAtRef: readMock,
      fetchRepoDirListing: listMock,
    }));

    const { runAgentReview } = await import("../services/agent-review.js");

    const commit: CommitInfo = { hash: "abc123", message: "fix bug", author: { raw: "dev" }, date: "2024-01-01" };
    const diff = "diff --git a/src/app.ts b/src/app.ts\n@@ -1,2 +1,2 @@\n-old\n+new";
    const result = await runAgentReview({
      diff,
      commit,
      repo: makeRepo(),
      promptTemplate: "Review: {{diff}}",
      provider: { providerType: "openai_compatible", apiBase: "https://api.example.com/v1", apiKey: "k" },
      credentials: { password: "pw", username: "user" },
      truncated: false,
    });

    expect(readMock).toHaveBeenCalledTimes(1);
    expect(result.turns).toBe(2);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].file_path).toBe("src/app.ts");
    expect(result.findings[0].confidence).toBe(90);
    expect(result.tokenUsage.total_tokens).toBe(300);
    expect(result.toolsUsed).toContain("read_file:src/app.ts");
    expect(completeMock.mock.calls[0][0].messages[0].content).toContain("Agent Mode");
  });

  it("salvages a bare findings array when the model ignores the protocol", async () => {
    const bareFindings = [
      { file_index: 1, line_start: 3, title: "Salvaged issue", explanation: "e", risk: "must_fix", confidence: 88, suggested_fix: null, category: "correctness", test_gap: "no test" },
    ];
    const completeMock = vi.fn(async () => ({
      content: JSON.stringify(bareFindings),
      finishReason: "stop",
      tokenUsage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
    }));

    vi.doMock("../services/llm/index.js", () => ({
      createAdapter: () => ({ complete: completeMock, testConnection: async () => ({ message: "ok" }), listModels: async () => [] }),
      ProviderConfig: {},
    }));
    vi.doMock("../services/bitbucket-client.js", () => ({
      fetchFileFromRepoAtRef: vi.fn(async () => "content"),
      fetchRepoDirListing: vi.fn(async () => []),
    }));

    const { runAgentReview } = await import("../services/agent-review.js");

    const commit: CommitInfo = { hash: "abc123", message: "m", author: { raw: "dev" }, date: "2024-01-01" };
    const diff = "diff --git a/src/app.ts b/src/app.ts\n@@ -1 +1 @@\n-old\n+new";
    const result = await runAgentReview({
      diff,
      commit,
      repo: makeRepo(),
      promptTemplate: "Review: {{diff}}",
      provider: { providerType: "openai_compatible", apiBase: "https://api.example.com/v1", apiKey: "k" },
      credentials: { password: "pw", username: "user" },
      truncated: false,
    });

    expect(completeMock).toHaveBeenCalledTimes(1);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].summary).toBe("Salvaged issue");
    expect(result.findings[0].source_pass).toBe("agent");
    expect(result.turns).toBe(1);
  });

  it("blocks repeated reads of the same file and path traversal", async () => {
    const findingsJson = "[]";
    const completeMock = vi
      .fn()
      .mockResolvedValueOnce({
        content: '{"action":"TOOL_CALL","tool":"read_file","args":{"path":"src/app.ts"}}',
        finishReason: "stop",
        tokenUsage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      })
      .mockResolvedValueOnce({
        content: '{"action":"TOOL_CALL","tool":"read_file","args":{"path":"src/app.ts"}}',
        finishReason: "stop",
        tokenUsage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      })
      .mockResolvedValueOnce({
        content: '{"action":"TOOL_CALL","tool":"read_file","args":{"path":"../etc/passwd"}}',
        finishReason: "stop",
        tokenUsage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({ action: "FINAL", content: findingsJson }),
        finishReason: "stop",
        tokenUsage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      });

    const readMock = vi.fn(async () => "content");
    vi.doMock("../services/llm/index.js", () => ({
      createAdapter: () => ({ complete: completeMock, testConnection: async () => ({ message: "ok" }), listModels: async () => [] }),
      ProviderConfig: {},
    }));
    vi.doMock("../services/bitbucket-client.js", () => ({
      fetchFileFromRepoAtRef: readMock,
      fetchRepoDirListing: vi.fn(async () => []),
    }));

    const { runAgentReview } = await import("../services/agent-review.js");

    const commit: CommitInfo = { hash: "abc123", message: "m", author: { raw: "dev" }, date: "2024-01-01" };
    const diff = "diff --git a/src/app.ts b/src/app.ts\n@@ -1 +1 @@\n-old\n+new";
    const result = await runAgentReview({
      diff,
      commit,
      repo: makeRepo(),
      promptTemplate: "Review: {{diff}}",
      provider: { providerType: "openai_compatible", apiBase: "https://api.example.com/v1", apiKey: "k" },
      credentials: { password: "pw", username: "user" },
      truncated: false,
    });

    expect(readMock).toHaveBeenCalledTimes(1);
    expect(result.findings).toEqual([]);
    expect(result.turns).toBe(4);
  });
});
