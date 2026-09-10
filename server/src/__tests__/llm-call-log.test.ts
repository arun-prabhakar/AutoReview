import { describe, it, expect } from "vitest";
import { withLlmCallLogging, recordLlmCall, type LlmCallEntry } from "../services/llm-call-log.js";

const entry = (pass: string): LlmCallEntry => ({
  pass,
  attempt: 1,
  model: "gpt-test",
  request_text: `prompt for ${pass}`,
  response_text: `response for ${pass}`,
  finish_reason: "stop",
  prompt_tokens: 10,
  completion_tokens: 5,
  total_tokens: 15,
});

describe("llm-call-log", () => {
  it("collects calls made inside the logging context", async () => {
    const outcome = await withLlmCallLogging("review-1", async () => {
      recordLlmCall(entry("base"));
      recordLlmCall(entry("agent:turn 1"));
      return "done";
    });

    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.result).toBe("done");
    expect(outcome.calls.map((c) => c.pass)).toEqual(["base", "agent:turn 1"]);
  });

  it("returns collected calls even when the wrapped work throws", async () => {
    const outcome = await withLlmCallLogging("review-2", async () => {
      recordLlmCall(entry("security"));
      throw new Error("LLM response invalid");
    });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect((outcome.error as Error).message).toBe("LLM response invalid");
    expect(outcome.calls).toHaveLength(1);
    expect(outcome.calls[0].pass).toBe("security");
  });

  it("ignores recordings made outside a logging context", () => {
    expect(() => recordLlmCall(entry("base"))).not.toThrow();
  });

  it("isolates concurrent contexts", async () => {
    const run = (label: string, delay: number) =>
      withLlmCallLogging(`review-${label}`, async () => {
        await new Promise((resolve) => setTimeout(resolve, delay));
        recordLlmCall(entry(label));
        return label;
      });

    const [slow, fast] = await Promise.all([run("slow", 30), run("fast", 5)]);
    expect(slow.calls.map((c) => c.pass)).toEqual(["slow"]);
    expect(fast.calls.map((c) => c.pass)).toEqual(["fast"]);
  });
});
