import { get, all, run } from "../db/queries.js";
import { encrypt, decrypt } from "./encryption-service.js";
import { logger } from "../middleware/index.js";
import { NotFoundError, ConflictError } from "../errors.js";

export type LlmProvider = {
  id: string;
  name: string;
  api_base: string;
  api_key_encrypted: string;
  provider_type: string;
  aws_region: string | null;
  custom_headers: string | null;
  created_at: string;
  updated_at: string;
};

export type ProviderPublic = {
  id: string;
  name: string;
  api_base: string;
  provider_type: string;
  aws_region: string | null;
  custom_headers: string | null;
  created_at: string;
  updated_at: string;
};

export function parseCustomHeaders(raw: string | null | undefined): Record<string, string> | undefined {
  if (!raw || !raw.trim()) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("custom_headers must be a JSON object of header name to value, e.g. {\"x-opencode-session\": \"autoreview\"}");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("custom_headers must be a JSON object of header name to value");
  }
  const entries = Object.entries(parsed as Record<string, unknown>).filter(([, v]) => typeof v === "string");
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries) as Record<string, string>;
}

export async function getAllProviders(): Promise<ProviderPublic[]> {
  return all<ProviderPublic>("SELECT id, name, api_base, provider_type, aws_region, custom_headers, created_at, updated_at FROM llm_providers ORDER BY name");
}

export async function getProviderById(id: string): Promise<LlmProvider | undefined> {
  return get<LlmProvider>("SELECT * FROM llm_providers WHERE id = $1", [id]);
}

export async function createProvider(name: string, apiBase: string, apiKey: string, providerType?: string, awsRegion?: string, customHeaders?: string): Promise<ProviderPublic> {
  const { v4: uuid } = await import("uuid");
  const id = uuid();
  const encrypted = encrypt(apiKey);
  const pType = providerType || "openai_compatible";
  const headersJson = customHeaders !== undefined ? (parseCustomHeaders(customHeaders) ? customHeaders.trim() : null) : null;

  await run(
    "INSERT INTO llm_providers (id, name, api_base, api_key_encrypted, provider_type, aws_region, custom_headers) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    [id, name, apiBase, encrypted, pType, awsRegion || null, headersJson]
  );

  logger.audit("provider_created", { id, name, apiBase, providerType: pType });
  return { id, name, api_base: apiBase, provider_type: pType, aws_region: awsRegion || null, custom_headers: headersJson, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
}

export async function updateProvider(id: string, name?: string, apiBase?: string, apiKey?: string, providerType?: string, awsRegion?: string, customHeaders?: string): Promise<void> {
  const existing = await getProviderById(id);
  if (!existing) throw new NotFoundError("Provider not found");

  const newName = name ?? existing.name;
  const newBase = apiBase ?? existing.api_base;
  const newKey = apiKey ? encrypt(apiKey) : existing.api_key_encrypted;
  const newType = providerType ?? existing.provider_type;
  const newRegion = awsRegion !== undefined ? awsRegion : existing.aws_region;
  const newHeaders = customHeaders !== undefined ? (parseCustomHeaders(customHeaders) ? customHeaders.trim() : null) : existing.custom_headers;

  await run(
    "UPDATE llm_providers SET name = $1, api_base = $2, api_key_encrypted = $3, provider_type = $4, aws_region = $5, custom_headers = $6, updated_at = NOW() WHERE id = $7",
    [newName, newBase, newKey, newType, newRegion, newHeaders, id]
  );

  logger.audit("provider_updated", { id, name: newName });
}

export async function deleteProvider(id: string): Promise<void> {
  const deps = await all<{ id: string; name: string }>(
    "SELECT id, name FROM repositories WHERE llm_provider_id = $1", [id]
  );
  if (deps.length > 0) {
    throw new ConflictError(
      `Cannot delete provider: still referenced by ${deps.length} repository(ies). Remove the provider assignment first.`
    );
  }
  await run("DELETE FROM llm_providers WHERE id = $1", [id]);
  logger.audit("provider_deleted", { id });
}

export async function getDecryptedApiKey(providerId: string): Promise<string> {
  const provider = await getProviderById(providerId);
  if (!provider) throw new NotFoundError(`Provider ${providerId} not found`);
  return decrypt(provider.api_key_encrypted);
}
