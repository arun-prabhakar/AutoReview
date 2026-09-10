import OpenAI from "openai";
import type { LlmAdapter, LlmCompletionRequest, LlmCompletionResult } from "./types.js";
import { logger } from "../../middleware/index.js";

const clientCache = new Map<string, OpenAI>();

const DEFAULT_HEADERS = { "User-Agent": "autoreview/1.0" };

function getClient(apiBase: string, apiKey: string, customHeaders?: Record<string, string>): OpenAI {
  const defaultHeaders = { ...DEFAULT_HEADERS, ...customHeaders };
  const cacheKey = `${apiBase}:${apiKey.substring(0, 8)}:${JSON.stringify(defaultHeaders)}`;
  let client = clientCache.get(cacheKey);
  if (!client) {
    client = new OpenAI({ apiKey, baseURL: apiBase, defaultHeaders });
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
    customHeaders?: Record<string, string>,
  ) {
    this.client = getClient(apiBase, apiKey, customHeaders);
  }

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResult> {
    const response = await this.client.chat.completions.create({
      model: request.model,
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: request.maxTokens,
      temperature: request.temperature,
    }, { signal: request.signal });

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

  async embed(input: string[], model: string): Promise<number[][]> {
    const response = await this.client.embeddings.create({ model, input });
    const sorted = [...response.data].sort((a, b) => a.index - b.index);
    return sorted.map((d) => d.embedding);
  }
}
