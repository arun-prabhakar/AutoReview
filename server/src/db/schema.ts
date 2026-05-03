import type { Database as SqlJsDatabase } from "sql.js";
import fs from "fs";
import path from "path";

export function ensureSchema(db: SqlJsDatabase): void {
  const initSqlPath = path.join(process.cwd(), "db", "init.sql");
  if (fs.existsSync(initSqlPath)) {
    const sql = fs.readFileSync(initSqlPath, "utf8");
    db.run(sql);
    return;
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`);

  db.run(`
    CREATE TABLE IF NOT EXISTS llm_providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      api_base TEXT NOT NULL,
      api_key_encrypted TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS credentials (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      app_password_encrypted TEXT NOT NULL,
      workspace TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS repositories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      workspace TEXT NOT NULL,
      credential_id TEXT NOT NULL,
      branch TEXT DEFAULT 'main',
      review_mode TEXT NOT NULL DEFAULT 'manual',
      auto_review_enabled INTEGER NOT NULL DEFAULT 0,
      poll_interval_minutes INTEGER NOT NULL DEFAULT 5,
      trigger_on_commit INTEGER NOT NULL DEFAULT 1,
      trigger_on_pr_update INTEGER NOT NULL DEFAULT 1,
      strictness TEXT NOT NULL DEFAULT 'balanced',
      generate_email INTEGER NOT NULL DEFAULT 1,
      post_to_bitbucket INTEGER NOT NULL DEFAULT 0,
      excluded_paths TEXT,
      notification_recipients TEXT,
      include_commit_author INTEGER NOT NULL DEFAULT 0,
      llm_provider TEXT DEFAULT 'openai',
      llm_provider_id TEXT,
      llm_model TEXT DEFAULT 'gpt-4',
      llm_max_tokens INTEGER DEFAULT 4096,
      llm_temperature REAL DEFAULT 0.2,
      smtp_host TEXT,
      smtp_port INTEGER,
      smtp_user TEXT,
      smtp_password_encrypted TEXT,
      smtp_from_address TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      repository_id TEXT NOT NULL,
      commit_hash TEXT NOT NULL,
      branch TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      strictness TEXT NOT NULL DEFAULT 'balanced',
      review_mode TEXT NOT NULL DEFAULT 'manual',
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS findings (
      id TEXT PRIMARY KEY,
      review_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      line_number INTEGER,
      summary TEXT NOT NULL,
      explanation TEXT NOT NULL,
      risk_level TEXT NOT NULL,
      suggested_fix TEXT,
      category TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS prompt_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      strictness TEXT NOT NULL DEFAULT 'all',
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_reviews_repo_status ON reviews(repository_id, status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_findings_review ON findings(review_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_prompt_templates_strictness ON prompt_templates(strictness)`);

  const { v4: uuid } = require("uuid") as { v4: () => string };
  const bcrypt = require("bcryptjs") as { hashSync: (s: string, rounds: number) => string };
  const adminHash = bcrypt.hashSync("admin", 10);
  db.run(
    `INSERT OR IGNORE INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)`,
    [uuid(), "admin", adminHash, "admin"]
  );

  const result = db.exec("SELECT COUNT(*) as count FROM prompt_templates");
  const count = (result[0]?.values?.[0]?.[0] as number) || 0;
  if (count === 0) {
    db.run(
      `INSERT INTO prompt_templates (id, name, content, strictness, is_default) VALUES (?, ?, ?, ?, ?)`,
      [
        "default",
        "Default Review Prompt",
        `You are a senior code reviewer. Analyze the following code diff and provide findings.

Repository: {{repository}}
Branch: {{branch}}
Commit: {{commit_hash}}
Strictness Level: {{strictness_level}}

Changed files:
{{file_paths}}

Excluded paths (skip these):
{{excluded_paths}}

Diff:
{{diff}}

For each finding, provide:
1. File path
2. Line number (if applicable)
3. Issue summary (concise)
4. Detailed explanation
5. Risk level: must_fix, should_fix_soon, or ignore
6. Suggested fix (if applicable)
7. Category (security, performance, correctness, maintainability, style)

Respond in JSON format as an array of findings.`,
        "all",
        1,
      ]
    );
  }
}
