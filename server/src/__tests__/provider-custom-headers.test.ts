import { describe, it, expect } from "vitest";
import { parseCustomHeaders } from "../services/provider-service.js";
import { substituteHeaderValues } from "../services/llm/openai-adapter.js";

describe("substituteHeaderValues", () => {
  it("replaces the review id placeholder", () => {
    expect(substituteHeaderValues({ "x-opencode-session": "${reviewId}" }, "abc-123")).toEqual({
      "x-opencode-session": "abc-123",
    });
  });

  it("falls back to a stable value outside a review context", () => {
    expect(substituteHeaderValues({ "x-opencode-session": "${reviewId}" }, undefined)).toEqual({
      "x-opencode-session": "autoreview",
    });
  });

  it("leaves static headers untouched", () => {
    expect(substituteHeaderValues({ "X-Static": "fixed" }, "abc-123")).toEqual({ "X-Static": "fixed" });
  });

  it("supports the placeholder alongside static text", () => {
    expect(substituteHeaderValues({ "X-Session": "sess-${reviewId}-tail" }, "r1")).toEqual({
      "X-Session": "sess-r1-tail",
    });
  });
});

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
