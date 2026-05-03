import initSqlJs, { type Database as SqlJsDatabase } from "sql.js";
import path from "path";
import fs from "fs";
import { ensureSchema } from "./schema.js";
import { logger } from "../middleware/index.js";

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "data", "autoreview.db");

let db: SqlJsDatabase | null = null;

export async function getDb(): Promise<SqlJsDatabase> {
  if (!db) {
    throw new Error("Database not initialized. Call initDb() first.");
  }
  return db;
}

export async function initDb(): Promise<void> {
  if (db) return;

  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  ensureSchema(db);
  persistDb();

  logger.info(`Database initialized`, { path: DB_PATH });
}

export function persistDb(): void {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}
