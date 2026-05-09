import { Pool } from "pg";
import { ensureSchema } from "./schema.js";
import { logger } from "../middleware/index.js";

function parseConnectionString(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || "5432", 10),
    database: parsed.pathname.slice(1),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
  };
}

let _pool: Pool | null = null;

export function getPool(): Pool {
  if (_pool) return _pool;

  const databaseUrl = process.env.DATABASE_URL || "";

  const poolConfig = databaseUrl.includes("://")
    ? parseConnectionString(databaseUrl)
    : { host: "localhost", port: 5432, database: "autoreview", user: "postgres", password: "" };

  const isSupabase = databaseUrl.includes("supabase");

  _pool = new Pool({
    ...poolConfig,
    ...(isSupabase ? { ssl: { rejectUnauthorized: false } } : {}),
  });

  _pool.on("error", (err) => {
    logger.error("Unexpected database pool error", { error: err.message });
  });

  return _pool;
}

export async function initDb(): Promise<void> {
  const pool = getPool();
  await ensureSchema(pool);
  logger.info("Database initialized", { database: "postgresql" });
}

export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}
