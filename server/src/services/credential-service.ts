import { get, all, run } from "../db/queries.js";
import { encrypt, decrypt } from "./encryption-service.js";
import { logger } from "../middleware/index.js";
import { NotFoundError, ConflictError } from "../errors.js";

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

export async function updateCredential(
  id: string,
  username: string,
  workspace?: string,
  appPassword?: string,
) {
  const existing = await getCredentialById(id);
  if (!existing) throw new NotFoundError("Credential not found");

  if (appPassword) {
    await run(
      `UPDATE credentials
       SET username = $1, workspace = $2, app_password_encrypted = $3, updated_at = NOW()
       WHERE id = $4`,
      [username, workspace || null, encrypt(appPassword), id],
    );
  } else {
    await run(
      `UPDATE credentials SET username = $1, workspace = $2, updated_at = NOW() WHERE id = $3`,
      [username, workspace || null, id],
    );
  }

  logger.audit("credential_updated", { id, username, workspace, tokenUpdated: Boolean(appPassword) });
  return getCredentialById(id);
}

export async function deleteCredential(id: string) {
  const existing = await getCredentialById(id);
  if (!existing) throw new NotFoundError("Credential not found");

  const deps = await all<{ id: string; name: string }>(
    "SELECT id, name FROM repositories WHERE credential_id = $1", [id]
  );
  if (deps.length > 0) {
    const repositoryNames = deps.map((repo) => repo.name).join(", ");
    throw new ConflictError(
      `Cannot delete credential because it is used by: ${repositoryNames}. Assign those repositories another credential first.`
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
  if (!row) throw new NotFoundError(`Credential ${credentialId} not found`);
  return decrypt(row.app_password_encrypted);
}
