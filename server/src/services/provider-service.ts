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
  created_at: string;
  updated_at: string;
};

export type ProviderPublic = {
  id: string;
  name: string;
  api_base: string;
  provider_type: string;
  aws_region: string | null;
  created_at: string;
  updated_at: string;
};

export async function getAllProviders(): Promise<ProviderPublic[]> {
  return all<ProviderPublic>("SELECT id, name, api_base, provider_type, aws_region, created_at, updated_at FROM llm_providers ORDER BY name");
}

export async function getProviderById(id: string): Promise<LlmProvider | undefined> {
  return get<LlmProvider>("SELECT * FROM llm_providers WHERE id = $1", [id]);
}

export async function createProvider(name: string, apiBase: string, apiKey: string, providerType?: string, awsRegion?: string): Promise<ProviderPublic> {
  const { v4: uuid } = await import("uuid");
  const id = uuid();
  const encrypted = encrypt(apiKey);
  const pType = providerType || "openai_compatible";

  await run(
    "INSERT INTO llm_providers (id, name, api_base, api_key_encrypted, provider_type, aws_region) VALUES ($1, $2, $3, $4, $5, $6)",
    [id, name, apiBase, encrypted, pType, awsRegion || null]
  );

  logger.audit("provider_created", { id, name, apiBase, providerType: pType });
  return { id, name, api_base: apiBase, provider_type: pType, aws_region: awsRegion || null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
}

export async function updateProvider(id: string, name?: string, apiBase?: string, apiKey?: string, providerType?: string, awsRegion?: string): Promise<void> {
  const existing = await getProviderById(id);
  if (!existing) throw new NotFoundError("Provider not found");

  const newName = name ?? existing.name;
  const newBase = apiBase ?? existing.api_base;
  const newKey = apiKey ? encrypt(apiKey) : existing.api_key_encrypted;
  const newType = providerType ?? existing.provider_type;
  const newRegion = awsRegion !== undefined ? awsRegion : existing.aws_region;

  await run(
    "UPDATE llm_providers SET name = $1, api_base = $2, api_key_encrypted = $3, provider_type = $4, aws_region = $5, updated_at = NOW() WHERE id = $6",
    [newName, newBase, newKey, newType, newRegion, id]
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
