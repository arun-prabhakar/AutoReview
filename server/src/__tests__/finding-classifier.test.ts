import { describe, it, expect } from "vitest";
import { classifyFindings } from "../services/finding-classifier.js";
import type { RawFinding } from "../services/review-engine.js";

function makeFinding(riskLevel: string): RawFinding {
  return {
    file_path: `src/file_${riskLevel}.ts`,
    line_number: 10,
    summary: `Finding with risk ${riskLevel}`,
    explanation: "Explanation",
    risk_level: riskLevel,
    suggested_fix: null,
    category: "security",
  };
}

describe("finding-classifier", () => {
  it("should classify mixed findings into correct buckets", () => {
    const findings = [
      makeFinding("must_fix"),
      makeFinding("should_fix_soon"),
      makeFinding("ignore"),
      makeFinding("must_fix"),
    ];

    const result = classifyFindings(findings);
    expect(result.must_fix).toHaveLength(2);
    expect(result.should_fix_soon).toHaveLength(1);
    expect(result.ignore).toHaveLength(1);
  });

  it("should return empty arrays for empty input", () => {
    const result = classifyFindings([]);
    expect(result.must_fix).toHaveLength(0);
    expect(result.should_fix_soon).toHaveLength(0);
    expect(result.ignore).toHaveLength(0);
  });

  it("should handle all must_fix findings", () => {
    const findings = [makeFinding("must_fix"), makeFinding("must_fix"), makeFinding("must_fix")];
    const result = classifyFindings(findings);
    expect(result.must_fix).toHaveLength(3);
    expect(result.should_fix_soon).toHaveLength(0);
    expect(result.ignore).toHaveLength(0);
  });

  it("should ignore unknown risk levels", () => {
    const findings = [makeFinding("critical"), makeFinding("low")];
    const result = classifyFindings(findings);
    expect(result.must_fix).toHaveLength(0);
    expect(result.should_fix_soon).toHaveLength(0);
    expect(result.ignore).toHaveLength(0);
  });
});
