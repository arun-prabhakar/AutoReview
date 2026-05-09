import { get, all, run } from "../db/queries.js";
import { encrypt, decrypt } from "./encryption-service.js";
import { logger } from "../middleware/index.js";

export async function getAllCredentials() {
  return all("SELECT id, username, workspace, created_at, updated_at FROM credentials");
}

export async function getCredentialById(id: string) {
  return get("SELECT id, username, workspace, created_at, updated_at FROM credentials WHERE id = $1", [id]);
}

export async function createCredential(username: string, appPassword: string, workspace?: string) {
  const { v4: uuid } = await import("uuid");
  const id = uuid();
  const encrypted = encrypt(appPassword);

  await run(
    `INSERT INTO credentials (id, username, app_password_encrypted, workspace) VALUES ($1, $2, $3, $4)`,
    [id, username, encrypted, workspace || null]
  );

  logger.audit("credential_created", { id, username, workspace });
  return { id, username, workspace };
}

export async function deleteCredential(id: string) {
  const deps = await all<{ id: string; name: string }>(
    "SELECT id, name FROM repositories WHERE credential_id = $1", [id]
  );
  if (deps.length > 0) {
    throw new Error(
      `Cannot delete credential: still referenced by ${deps.length} repository(ies). Update repositories first.`
    );
  }
  await run("DELETE FROM credentials WHERE id = $1", [id]);
  logger.audit("credential_deleted", { id });
}

export async function getDecryptedPassword(credentialId: string): Promise<string> {
  const row = await get<{ app_password_encrypted: string }>(
    "SELECT app_password_encrypted FROM credentials WHERE id = $1",
    [credentialId]
  );
  if (!row) throw new Error(`Credential ${credentialId} not found`);
  return decrypt(row.app_password_encrypted);
}
