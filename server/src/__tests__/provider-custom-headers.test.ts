import { describe, it, expect } from "vitest";
import { parseCustomHeaders } from "../services/provider-service.js";

describe("parseCustomHeaders", () => {
  it("parses a valid JSON object of headers", () => {
    expect(parseCustomHeaders('{"x-opencode-session":"autoreview","X-Custom":"v1"}')).toEqual({
      "x-opencode-session": "autoreview",
      "X-Custom": "v1",
    });
  });

  it("returns undefined for empty or missing values", () => {
    expect(parseCustomHeaders(null)).toBeUndefined();
    expect(parseCustomHeaders(undefined)).toBeUndefined();
    expect(parseCustomHeaders("")).toBeUndefined();
    expect(parseCustomHeaders("   ")).toBeUndefined();
  });

  it("rejects invalid JSON and non-object JSON", () => {
    expect(() => parseCustomHeaders("not json")).toThrow("JSON object");
    expect(() => parseCustomHeaders('["array"]')).toThrow("JSON object");
    expect(() => parseCustomHeaders('"string"')).toThrow("JSON object");
  });

  it("drops non-string entries and returns undefined when none remain", () => {
    expect(parseCustomHeaders('{"keep":"yes","drop":123}')).toEqual({ keep: "yes" });
    expect(parseCustomHeaders('{"a":1}')).toBeUndefined();
  });
});
