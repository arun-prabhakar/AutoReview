import type { LlmAdapter } from "./types.js";
import { OpenAIAdapter } from "./openai-adapter.js";
import { BedrockAdapter } from "./bedrock-adapter.js";

export type ProviderConfig = {
  providerType: string;
  apiBase: string;
  apiKey: string;
  awsRegion?: string;
};

export { ProviderConfig as LlmProviderConfig };

export function createAdapter(config: ProviderConfig): LlmAdapter {
  switch (config.providerType) {
    case "aws_bedrock": {
      let accessKeyId: string;
      let secretAccessKey: string;
      try {
        const parsed = JSON.parse(config.apiKey);
        accessKeyId = parsed.accessKeyId;
        secretAccessKey = parsed.secretAccessKey;
      } catch {
        throw new Error("Bedrock provider credentials must be a JSON object with accessKeyId and secretAccessKey");
      }
      if (!accessKeyId || !secretAccessKey) {
        throw new Error("Bedrock provider requires both accessKeyId and secretAccessKey");
      }
      return new BedrockAdapter(config.awsRegion || "us-east-1", accessKeyId, secretAccessKey);
    }

    case "openai_compatible":
    default:
      return new OpenAIAdapter(config.apiBase, config.apiKey);
  }
}
