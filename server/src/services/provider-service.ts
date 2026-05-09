import { get, all, run } from "../db/queries.js";
import { encrypt, decrypt } from "./encryption-service.js";
import { logger } from "../middleware/index.js";

export type LlmProvider = {
  id: string;
  name: string;
  api_base: string;
  api_key_encrypted: string;
  created_at: string;
  updated_at: string;
};

export type ProviderPublic = {
  id: string;
  name: string;
  api_base: string;
  created_at: string;
  updated_at: string;
};

export async function getAllProviders(): Promise<ProviderPublic[]> {
  return all<ProviderPublic>("SELECT id, name, api_base, created_at, updated_at FROM llm_providers ORDER BY name");
}

export async function getProviderById(id: string): Promise<LlmProvider | undefined> {
  return get<LlmProvider>("SELECT * FROM llm_providers WHERE id = $1", [id]);
}

export async function createProvider(name: string, apiBase: string, apiKey: string): Promise<ProviderPublic> {
  const { v4: uuid } = await import("uuid");
  const id = uuid();
  const encrypted = encrypt(apiKey);

  await run(
    "INSERT INTO llm_providers (id, name, api_base, api_key_encrypted) VALUES ($1, $2, $3, $4)",
    [id, name, apiBase, encrypted]
  );

  logger.audit("provider_created", { id, name, apiBase });
  return { id, name, api_base: apiBase, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
}

export async function updateProvider(id: string, name?: string, apiBase?: string, apiKey?: string): Promise<void> {
  const existing = await getProviderById(id);
  if (!existing) throw new Error("Provider not found");

  const newName = name ?? existing.name;
  const newBase = apiBase ?? existing.api_base;
  const newKey = apiKey ? encrypt(apiKey) : existing.api_key_encrypted;

  await run(
    "UPDATE llm_providers SET name = $1, api_base = $2, api_key_encrypted = $3, updated_at = NOW() WHERE id = $4",
    [newName, newBase, newKey, id]
  );

  logger.audit("provider_updated", { id, name: newName });
}

export async function deleteProvider(id: string): Promise<void> {
  const deps = await all<{ id: string; name: string }>(
    "SELECT id, name FROM repositories WHERE llm_provider_id = $1", [id]
  );
  if (deps.length > 0) {
    throw new Error(
      `Cannot delete provider: still referenced by ${deps.length} repository(ies). Remove the provider assignment first.`
    );
  }
  await run("DELETE FROM llm_providers WHERE id = $1", [id]);
  logger.audit("provider_deleted", { id });
}

export async function getDecryptedApiKey(providerId: string): Promise<string> {
  const provider = await getProviderById(providerId);
  if (!provider) throw new Error(`Provider ${providerId} not found`);
  return decrypt(provider.api_key_encrypted);
}
