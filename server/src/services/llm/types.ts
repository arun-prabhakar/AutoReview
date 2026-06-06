export type LlmMessage = {
  role: "user" | "assistant";
  content: string;
};

export type LlmCompletionResult = {
  content: string;
  finishReason: string | null;
  tokenUsage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type LlmCompletionRequest = {
  model: string;
  messages: LlmMessage[];
  maxTokens: number;
  temperature: number;
};

/** Adapter interface abstracting over LLM backends (OpenAI-compatible, AWS Bedrock, etc.) */
export interface LlmAdapter {
  complete(request: LlmCompletionRequest): Promise<LlmCompletionResult>;
  testConnection(): Promise<{ message: string }>;
  listModels(): Promise<string[]>;
}
