import "dotenv/config";
import { Pool } from "pg";
import { decrypt } from "../services/encryption-service.js";
import { get } from "../db/queries.js";

const BITBUCKET_API = "https://api.bitbucket.org/2.0";

async function deleteBuildStatus(
  workspace: string,
  repoSlug: string,
  commitHash: string,
  appPassword: string,
  username: string
): Promise<boolean> {
  const auth = Buffer.from(`${username}:${appPassword}`).toString("base64");
  const res = await fetch(
    `${BITBUCKET_API}/repositories/${workspace}/${repoSlug}/commit/${commitHash}/statuses/build/autoreview`,
    {
      method: "DELETE",
      headers: { Authorization: `Basic ${auth}` },
    }
  );
  if (res.ok || res.status === 204) {
    console.log(`  ✓ Deleted: ${commitHash.slice(0, 8)}`);
    return true;
  }
  if (res.status === 404) {
    console.log(`  · No status: ${commitHash.slice(0, 8)}`);
    return false;
  }
  console.log(`  ✗ Failed (${res.status}): ${commitHash.slice(0, 8)}`);
  return false;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL not set in .env");
    process.exit(1);
  }

  const limitArg = process.argv.find(a => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : null;

  const pool = new Pool({ connectionString: databaseUrl });

  const reviews = await pool.query(
    `SELECT r.repository_id, r.commit_hash, repo.workspace, repo.slug, repo.credential_id
     FROM reviews r
     JOIN repositories repo ON r.repository_id = repo.id
     WHERE r.commit_hash NOT LIKE 'pr:%'
     ORDER BY r.created_at DESC` +
    (limit ? ` LIMIT $1` : ""),
    limit ? [limit] : []
  );

  console.log(`Found ${reviews.rows.length} unique repo+commit combinations\n`);

  let deleted = 0;
  for (const row of reviews.rows) {
    const { repository_id, commit_hash, workspace, slug, credential_id } = row;
    console.log(`[${workspace}/${slug}] commit ${commit_hash.slice(0, 8)}`);

    const cred = await get<{ username: string; app_password_encrypted: string }>(
      "SELECT username, app_password_encrypted FROM credentials WHERE id = $1",
      [credential_id]
    );
    if (!cred) {
      console.log("  ✗ No credentials found, skipping");
      continue;
    }

    const password = decrypt(cred.app_password_encrypted);
    const ok = await deleteBuildStatus(workspace, slug, commit_hash, password, cred.username);
    if (ok) deleted++;
  }

  console.log(`\nDone. Deleted ${deleted} build statuses.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
