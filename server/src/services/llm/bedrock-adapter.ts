import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ConverseCommandOutput,
  type Message,
} from "@aws-sdk/client-bedrock-runtime";
import {
  BedrockClient,
  ListFoundationModelsCommand,
} from "@aws-sdk/client-bedrock";
import type { LlmAdapter, LlmCompletionRequest, LlmCompletionResult } from "./types.js";
import { logger } from "../../middleware/index.js";

const runtimeClientCache = new Map<string, BedrockRuntimeClient>();
const bedrockClientCache = new Map<string, BedrockClient>();

function getRuntimeClient(region: string, accessKeyId: string, secretAccessKey: string): BedrockRuntimeClient {
  const cacheKey = `${region}:${accessKeyId.substring(0, 8)}`;
  let client = runtimeClientCache.get(cacheKey);
  if (!client) {
    client = new BedrockRuntimeClient({ region, credentials: { accessKeyId, secretAccessKey } });
    runtimeClientCache.set(cacheKey, client);
    evictIfNeeded(runtimeClientCache);
  }
  return client;
}

function getBedrockClient(region: string, accessKeyId: string, secretAccessKey: string): BedrockClient {
  const cacheKey = `${region}:${accessKeyId.substring(0, 8)}`;
  let client = bedrockClientCache.get(cacheKey);
  if (!client) {
    client = new BedrockClient({ region, credentials: { accessKeyId, secretAccessKey } });
    bedrockClientCache.set(cacheKey, client);
    evictIfNeeded(bedrockClientCache);
  }
  return client;
}

function evictIfNeeded(cache: Map<string, unknown>) {
  if (cache.size > 20) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
}

function toBedrockMessages(messages: { role: "user" | "assistant"; content: string }[]): Message[] {
  return messages.map((m) => ({
    role: m.role === "user" ? "user" as const : "assistant" as const,
    content: [{ text: m.content }],
  }));
}

function extractStopReason(reason: ConverseCommandOutput["stopReason"]): string | null {
  if (!reason) return null;
  const mapping: Record<string, string> = {
    end_turn: "stop",
    stop_sequence: "stop",
    max_tokens: "length",
    content_filtered: "content_filter",
    tool_use: "tool_calls",
  };
  return mapping[reason] ?? reason;
}

export class BedrockAdapter implements LlmAdapter {
  private runtimeClient: BedrockRuntimeClient;
  private bedrockClient: BedrockClient;

  constructor(
    region: string,
    accessKeyId: string,
    secretAccessKey: string,
  ) {
    this.runtimeClient = getRuntimeClient(region, accessKeyId, secretAccessKey);
    this.bedrockClient = getBedrockClient(region, accessKeyId, secretAccessKey);
  }

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResult> {
    const bedrockMessages = toBedrockMessages(request.messages);

    const command = new ConverseCommand({
      modelId: request.model,
      messages: bedrockMessages,
      inferenceConfig: {
        maxTokens: request.maxTokens,
        temperature: request.temperature,
      },
    });

    const response = await this.runtimeClient.send(command);

    const content = response.output?.message?.content?.[0]?.text ?? "[]";
    const tokenUsage = {
      prompt_tokens: response.usage?.inputTokens ?? 0,
      completion_tokens: response.usage?.outputTokens ?? 0,
      total_tokens: (response.usage?.inputTokens ?? 0) + (response.usage?.outputTokens ?? 0),
    };
    const finishReason = extractStopReason(response.stopReason);

    logger.info("Bedrock adapter response received", {
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
    const command = new ConverseCommand({
      modelId: "anthropic.claude-3-haiku-20240307-v1:0",
      messages: [{ role: "user", content: [{ text: "Hi" }] }],
      inferenceConfig: { maxTokens: 5, temperature: 0 },
    });

    try {
      await this.runtimeClient.send(command);
      return { message: "Bedrock connection successful" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Bedrock connection failed: ${msg}`);
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const command = new ListFoundationModelsCommand({});
      const response = await this.bedrockClient.send(command);
      const models = (response.modelSummaries || [])
        .filter((m) => m.modelId && m.modelLifecycle?.status !== "LEGACY")
        .map((m) => m.modelId!)
        .sort();
      logger.info("Fetched Bedrock models", { count: models.length });
      return models;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn("Failed to list Bedrock models", { error: msg });
      throw new Error(`Failed to list Bedrock models: ${msg}`);
    }
  }
}
