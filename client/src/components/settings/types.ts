export type { Provider, Credential, Repository } from "@/types";
export type { PromptTemplate as Template } from "@/types";

export const PROVIDER_PRESETS: Record<string, { label: string; apiBase: string; models: string[] }> = {
  openai: { label: "OpenAI", apiBase: "https://api.openai.com/v1", models: ["gpt-4", "gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "o1", "o1-mini", "o3-mini"] },
  anthropic: { label: "Anthropic", apiBase: "https://api.anthropic.com/v1", models: ["claude-sonnet-4-20250514", "claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "claude-3-opus-20240229"] },
  gemini: { label: "Google Gemini", apiBase: "https://generativelanguage.googleapis.com/v1beta/openai", models: ["gemini-2.5-pro-preview-05-06", "gemini-2.5-flash-preview-05-20", "gemini-2.0-flash", "gemini-2.0-flash-lite"] },
  zai: { label: "ZAI", apiBase: "https://api.z.ai/api/coding/paas/v4", models: ["glm-5.1", "glm-4-plus", "glm-4-flash", "glm-4-air"] },
  custom: { label: "Custom", apiBase: "", models: [] },
};

export function detectProviderPreset(apiBase: string): string {
  const base = apiBase.toLowerCase().replace(/\/+$/, "");
  for (const [key, preset] of Object.entries(PROVIDER_PRESETS)) {
    if (key === "custom") continue;
    if (base === preset.apiBase.toLowerCase().replace(/\/+$/, "")) return key;
  }
  if (base.includes("openai.com")) return "openai";
  if (base.includes("anthropic.com")) return "anthropic";
  if (base.includes("googleapis") || base.includes("generativelanguage")) return "gemini";
  if (base.includes("z.ai")) return "zai";
  return "custom";
}
