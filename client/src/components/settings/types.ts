export type { Provider, Credential, Repository } from "@/types";
export type { PromptTemplate as Template } from "@/types";

export const PROVIDER_PRESETS: Record<string, { label: string; apiBase: string }> = {
  openai: { label: "OpenAI", apiBase: "https://api.openai.com/v1" },
  anthropic: { label: "Anthropic", apiBase: "https://api.anthropic.com/v1" },
  gemini: { label: "Google Gemini", apiBase: "https://generativelanguage.googleapis.com/v1beta/openai" },
  zai: { label: "ZAI", apiBase: "https://api.z.ai/api/coding/paas/v4" },
  bedrock: { label: "AWS Bedrock", apiBase: "" },
  custom: { label: "Custom", apiBase: "" },
};

export function detectProviderPreset(apiBase: string): string {
  const base = apiBase.toLowerCase().replace(/\/+$/, "");
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
