export type { Provider, Credential, Repository } from "@/types";
export type { PromptTemplate as Template } from "@/types";

export const PROVIDER_PRESETS: Record<string, {
  label: string;
  apiBase: string;
  isBedrock?: boolean;
  regions?: string[];
}> = {
  openai: { label: "OpenAI", apiBase: "https://api.openai.com/v1" },
  anthropic: { label: "Anthropic", apiBase: "https://api.anthropic.com/v1" },
  gemini: { label: "Google Gemini", apiBase: "https://generativelanguage.googleapis.com/v1beta/openai" },
  zai: { label: "ZAI", apiBase: "https://api.z.ai/api/coding/paas/v4" },
  bedrock: {
    label: "AWS Bedrock",
    apiBase: "",
    isBedrock: true,
    regions: ["us-east-1", "us-west-2", "eu-west-1", "eu-central-1", "ap-southeast-1", "ap-northeast-1", "ap-south-1"],
  },
  custom: { label: "Custom", apiBase: "" },
};

export function detectProviderPreset(providerType?: string, apiBase?: string): string {
  if (providerType === "aws_bedrock") return "bedrock";

  const base = (apiBase || "").toLowerCase().replace(/\/+$/, "");
  for (const [key, preset] of Object.entries(PROVIDER_PRESETS)) {
    if (key === "custom" || key === "bedrock") continue;
    if (base === preset.apiBase.toLowerCase().replace(/\/+$/, "")) return key;
  }
  if (base.includes("openai.com")) return "openai";
  if (base.includes("anthropic.com")) return "anthropic";
  if (base.includes("googleapis") || base.includes("generativelanguage")) return "gemini";
  if (base.includes("z.ai")) return "zai";
  return "custom";
}
