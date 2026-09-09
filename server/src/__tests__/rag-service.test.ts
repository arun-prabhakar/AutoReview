import { describe, it, expect } from "vitest";
import { chunkFileContent } from "../services/rag-service.js";
import { tokenSimilarity, filterSuppressedFindings, renderRetrievedContext } from "../services/review-engine.js";
import type { RawFinding } from "../services/review-engine.js";

describe("chunkFileContent", () => {
  it("chunks long content with overlap and line ranges", () => {
    const lines = Array.from({ length: 150 }, (_, i) => `line ${i + 1}`);
    const chunks = chunkFileContent(lines.join("\n"));

    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0].start_line).toBe(1);
    expect(chunks[0].end_line).toBe(60);
    expect(chunks[1].start_line).toBe(51);
    expect(chunks[0].content).toContain("line 1");
    expect(chunks[0].content).toContain("line 60");
    expect(chunks[1].content).toContain("line 51");
  });

  it("returns a single chunk for short content and skips empty content", () => {
    expect(chunkFileContent("short file")).toHaveLength(1);
    expect(chunkFileContent("   \n  \n")).toHaveLength(0);
  });
});

describe("tokenSimilarity", () => {
  it("scores identical text as 1 and unrelated text near 0", () => {
    expect(tokenSimilarity("Missing input validation", "Missing input validation")).toBe(1);
    expect(tokenSimilarity("Missing input validation", "Race condition in cache")).toBeLessThan(0.2);
  });

  it("is case-insensitive and punctuation-tolerant", () => {
    expect(tokenSimilarity("Missing input-validation!", "missing Input Validation")).toBeGreaterThan(0.6);
  });
});

describe("fuzzy filterSuppressedFindings", () => {
  const base = { line_number: 1, explanation: "e", risk_level: "must_fix", suggested_fix: null, category: null, confidence: 90, test_gap: null };

  it("drops a rephrased summary on the same file", () => {
    const findings: RawFinding[] = [
      { ...base, file_path: "src/app.ts", summary: "Input validation is missing on the login form" },
    ];
    const result = filterSuppressedFindings(findings, [
      { file_path: "src/app.ts", summary: "Missing input validation for login form" },
    ]);
    expect(result).toHaveLength(0);
  });

  it("drops near-identical summaries even on a different file", () => {
    const findings: RawFinding[] = [
      { ...base, file_path: "src/other.ts", summary: "Missing input validation on login form" },
    ];
    const result = filterSuppressedFindings(findings, [
      { file_path: "src/app.ts", summary: "Missing input validation on login form" },
    ]);
    expect(result).toHaveLength(0);
  });

  it("keeps similar-topic but materially different findings", () => {
    const findings: RawFinding[] = [
      { ...base, file_path: "src/app.ts", summary: "Missing input validation on login form" },
      { ...base, file_path: "src/app.ts", summary: "SQL injection via unparameterized query" },
    ];
    const result = filterSuppressedFindings(findings, [
      { file_path: "src/app.ts", summary: "Missing rate limiting on password reset endpoint" },
    ]);
    expect(result).toHaveLength(2);
  });

  it("keeps low-similarity findings on the same file", () => {
    const findings: RawFinding[] = [
      { ...base, file_path: "src/app.ts", summary: "SQL injection via unparameterized user query" },
    ];
    const result = filterSuppressedFindings(findings, [
      { file_path: "src/app.ts", summary: "Hardcoded API key in configuration" },
    ]);
    expect(result).toHaveLength(1);
  });
});

describe("renderRetrievedContext", () => {
  it("renders retrieved chunks with a ground-truth preamble only when present", () => {
    expect(renderRetrievedContext(undefined)).toBe("");
    const rendered = renderRetrievedContext("--- src/util.ts:10-40 ---\nexport const x = 1;");
    expect(rendered).toContain("Codebase Context (retrieved from repository index)");
    expect(rendered).toContain("src/util.ts:10-40");
  });
});
