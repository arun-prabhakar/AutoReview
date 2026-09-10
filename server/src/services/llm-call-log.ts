import { AsyncLocalStorage } from "node:async_hooks";
import { getPool } from "../db/index.js";
import { logger } from "../middleware/index.js";

export type LlmCallEntry = {
  pass: string;
  attempt: number;
  model: string | null;
  request_text: string;
  response_text: string;
  finish_reason: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
};

type LlmCallContext = { reviewId: string; calls: LlmCallEntry[] };

const storage = new AsyncLocalStorage<LlmCallContext>();

export async function withLlmCallLogging<T>(
  reviewId: string,
  fn: () => Promise<T>,
): Promise<{ ok: true; result: T; calls: LlmCallEntry[] } | { ok: false; error: unknown; calls: LlmCallEntry[] }> {
  const ctx: LlmCallContext = { reviewId, calls: [] };
  try {
    const result = await storage.run(ctx, fn);
    return { ok: true, result, calls: ctx.calls };
  } catch (error) {
    return { ok: false, error, calls: ctx.calls };
  }
}

export function recordLlmCall(entry: LlmCallEntry): void {
  const ctx = storage.getStore();
  if (ctx) ctx.calls.push(entry);
}

export async function insertLlmCalls(reviewId: string, calls: LlmCallEntry[]): Promise<void> {
  if (calls.length === 0) return;
  try {
    const { v4: uuid } = await import("uuid");
    const values: unknown[] = [];
    const placeholders: string[] = [];
    for (const call of calls) {
      const offset = values.length;
      placeholders.push(`(${Array.from({ length: 11 }, (_, i) => `$${offset + i + 1}`).join(", ")})`);
      values.push(uuid(), reviewId, call.pass, call.attempt, call.model, call.request_text, call.response_text, call.finish_reason, call.prompt_tokens, call.completion_tokens, call.total_tokens);
    }
    await getPool().query(
      `INSERT INTO llm_calls (id, review_id, pass, attempt, model, request_text, response_text, finish_reason, prompt_tokens, completion_tokens, total_tokens) VALUES ${placeholders.join(", ")}`,
      values
    );
  } catch (err) {
    logger.warn("Failed to persist LLM call log", { reviewId, error: String(err) });
  }
}
