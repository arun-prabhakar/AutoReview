import OpenAI from "openai";
import type { LlmAdapter, LlmCompletionRequest, LlmCompletionResult } from "./types.js";
import { logger } from "../../middleware/index.js";

const clientCache = new Map<string, OpenAI>();

function getClient(apiBase: string, apiKey: string): OpenAI {
  const cacheKey = `${apiBase}:${apiKey.substring(0, 8)}`;
  let client = clientCache.get(cacheKey);
  if (!client) {
    client = new OpenAI({ apiKey, baseURL: apiBase });
    clientCache.set(cacheKey, client);
    if (clientCache.size > 20) {
      const firstKey = clientCache.keys().next().value;
      if (firstKey) clientCache.delete(firstKey);
    }
  }
  return client;
}

export class OpenAIAdapter implements LlmAdapter {
  private client: OpenAI;

  constructor(
    private apiBase: string,
    private apiKey: string,
  ) {
    this.client = getClient(apiBase, apiKey);
  }

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResult> {
    const response = await this.client.chat.completions.create({
      model: request.model,
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: request.maxTokens,
      temperature: request.temperature,
    });

    const content = response.choices?.[0]?.message?.content || "[]";
    const tokenUsage = {
      prompt_tokens: response.usage?.prompt_tokens ?? 0,
      completion_tokens: response.usage?.completion_tokens ?? 0,
      total_tokens: response.usage?.total_tokens ?? 0,
    };
    const finishReason = response.choices?.[0]?.finish_reason ?? null;

    logger.info("OpenAI adapter response received", {
      model: request.model,
      maxTokens: request.maxTokens,
      contentLength: content.length,
      tokens: tokenUsage.total_tokens,
      finishReason,
      contentPreview: content.substring(0, 300),
    });

    return { content, finishReason, tokenUsage };
  }

  async testConnection(): Promise<{ message: string }> {
    await this.client.models.list();
    return { message: "Connection successful" };
  }

  async listModels(): Promise<string[]> {
    const response = await this.client.models.list();
    return (response.data || []).map((m) => m.id).sort();
  }
}
