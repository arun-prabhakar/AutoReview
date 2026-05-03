import type { RawFinding } from "./review-engine.js";

export function classifyFindings(findings: RawFinding[]): {
  must_fix: RawFinding[];
  should_fix_soon: RawFinding[];
  ignore: RawFinding[];
} {
  return {
    must_fix: findings.filter((f) => f.risk_level === "must_fix"),
    should_fix_soon: findings.filter((f) => f.risk_level === "should_fix_soon"),
    ignore: findings.filter((f) => f.risk_level === "ignore"),
  };
}
