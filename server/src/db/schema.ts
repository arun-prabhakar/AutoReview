import type { Pool } from "pg";
import bcrypt from "bcryptjs";
import { v4 as uuid } from "uuid";
import { logger } from "../middleware/index.js";

export async function ensureSchema(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      name TEXT,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      must_change_password BOOLEAN NOT NULL DEFAULT false,
      token_version INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT NOW(),
      updated_at TEXT NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS llm_providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      api_base TEXT NOT NULL,
      api_key_encrypted TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT NOW(),
      updated_at TEXT NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS credentials (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      app_password_encrypted TEXT NOT NULL,
      workspace TEXT,
      created_at TEXT NOT NULL DEFAULT NOW(),
      updated_at TEXT NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS repositories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      workspace TEXT NOT NULL,
      credential_id TEXT NOT NULL,
      branch TEXT DEFAULT 'main',
      review_mode TEXT NOT NULL DEFAULT 'manual',
      auto_review_enabled BOOLEAN NOT NULL DEFAULT false,
      poll_interval_minutes INTEGER NOT NULL DEFAULT 5,
      trigger_on_commit BOOLEAN NOT NULL DEFAULT true,
      trigger_on_pr_update BOOLEAN NOT NULL DEFAULT true,
      strictness TEXT NOT NULL DEFAULT 'balanced',
      generate_email BOOLEAN NOT NULL DEFAULT true,
      post_to_bitbucket BOOLEAN NOT NULL DEFAULT false,
      excluded_paths TEXT,
      notification_recipients TEXT,
      include_commit_author BOOLEAN NOT NULL DEFAULT false,
      llm_provider TEXT DEFAULT 'openai',
      llm_provider_id TEXT,
      llm_model TEXT DEFAULT 'gpt-4',
      llm_max_tokens INTEGER DEFAULT 4096,
      llm_temperature DOUBLE PRECISION DEFAULT 0.2,
      smtp_host TEXT,
      smtp_port INTEGER,
      smtp_user TEXT,
      smtp_password_encrypted TEXT,
      smtp_from_address TEXT,
      multi_pass_review BOOLEAN NOT NULL DEFAULT false,
      created_at TEXT NOT NULL DEFAULT NOW(),
      updated_at TEXT NOT NULL DEFAULT NOW(),
      FOREIGN KEY(credential_id) REFERENCES credentials(id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      repository_id TEXT NOT NULL,
      commit_hash TEXT NOT NULL,
      branch TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      strictness TEXT NOT NULL DEFAULT 'balanced',
      review_mode TEXT NOT NULL DEFAULT 'manual',
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT NOW(),
      completed_at TEXT,
      created_by TEXT,
      ai_overview TEXT,
      parent_review_id TEXT,
      tokens_prompt INTEGER,
      tokens_completion INTEGER,
      tokens_total INTEGER,
      estimated_cost REAL,
      project_context TEXT,
      FOREIGN KEY(repository_id) REFERENCES repositories(id) ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS findings (
      id TEXT PRIMARY KEY,
      review_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      line_number INTEGER,
      summary TEXT NOT NULL,
      explanation TEXT NOT NULL,
      risk_level TEXT NOT NULL,
      suggested_fix TEXT,
      category TEXT,
      disposition TEXT NOT NULL DEFAULT 'open',
      disposition_reason TEXT,
      disposition_by TEXT,
      disposition_at TEXT,
      suppressed BOOLEAN NOT NULL DEFAULT false,
      suppressed_by_rule_id TEXT,
      persistent_issue_id TEXT,
      FOREIGN KEY(review_id) REFERENCES reviews(id) ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS prompt_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      strictness TEXT NOT NULL DEFAULT 'all',
      is_default BOOLEAN NOT NULL DEFAULT false,
      created_at TEXT NOT NULL DEFAULT NOW(),
      updated_at TEXT NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS ai_overview TEXT`);
  await pool.query(`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS parent_review_id TEXT`);
  await pool.query(`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS tokens_prompt INTEGER`);
  await pool.query(`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS tokens_completion INTEGER`);
  await pool.query(`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS tokens_total INTEGER`);
  await pool.query(`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS estimated_cost REAL`);
  await pool.query(`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS project_context TEXT`);
  await pool.query(`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS error_message TEXT`);
  await pool.query(`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS completed_at TEXT`);
  await pool.query(`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS created_by TEXT`);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_reviews_repo_status ON reviews(repository_id, status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_findings_review ON findings(review_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_prompt_templates_strictness ON prompt_templates(strictness)`);

  // --- Notifications table (Feature 8) ---
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT,
      read BOOLEAN NOT NULL DEFAULT false,
      entity_type TEXT,
      entity_id TEXT,
      created_at TEXT NOT NULL DEFAULT NOW(),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read)`);

  // --- Finding Comments table (Feature 9) ---
  await pool.query(`
    CREATE TABLE IF NOT EXISTS finding_comments (
      id TEXT PRIMARY KEY,
      finding_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT NOW(),
      FOREIGN KEY(finding_id) REFERENCES findings(id) ON DELETE CASCADE
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_comments_finding ON finding_comments(finding_id)`);

  // --- Suppression Rules table (Feature 11) ---
  await pool.query(`
    CREATE TABLE IF NOT EXISTS suppression_rules (
      id TEXT PRIMARY KEY,
      repository_id TEXT NOT NULL,
      category TEXT,
      file_pattern TEXT,
      summary_pattern TEXT,
      risk_level TEXT,
      reason TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT NOW(),
      enabled BOOLEAN NOT NULL DEFAULT true,
      FOREIGN KEY(repository_id) REFERENCES repositories(id) ON DELETE CASCADE
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_suppression_repo ON suppression_rules(repository_id)`);

  if (process.env.NODE_ENV !== "production") {
    const adminHash = bcrypt.hashSync("admin", 10);
    await pool.query(
      `INSERT INTO users (id, username, password_hash, role) VALUES ($1, $2, $3, $4) ON CONFLICT (username) DO NOTHING`,
      [uuid(), "admin", adminHash, "admin"]
    );
  }

  const countResult = await pool.query("SELECT COUNT(*) as count FROM prompt_templates");
  const count = Number(countResult.rows[0]?.count) || 0;
  if (count === 0) {
    await pool.query(
      `INSERT INTO prompt_templates (id, name, content, strictness, is_default) VALUES ($1, $2, $3, $4, $5)`,
      [
        "default",
        "Default Review Prompt",
        `You are a senior software engineer and security-conscious code reviewer with expertise across multiple languages and frameworks. Your goal is to produce a thorough, actionable code review that helps the team ship safer, more maintainable code.

## Review Context

- **Repository:** {{repository}}
- **Branch:** {{branch}}
- **Commit:** {{commit_hash}}
- **Strictness Level:** {{strictness_level}}
  - \`strict\` → flag style, minor issues, and all risks
  - \`standard\` → flag correctness, security, performance, and significant maintainability issues
  - \`lenient\` → flag only must_fix security and correctness issues
- **Changed Files:** {{file_paths}}
- **Excluded Paths (ignore entirely):** {{excluded_paths}}

## Diff

\`\`\`diff
{{diff}}
\`\`\`

---

## Instructions

Analyze only the changed lines and their surrounding context. Do not flag issues in excluded paths.

For each finding, reason carefully before assigning a risk level:
- \`must_fix\` — Blocks merge. Security vulnerability, data loss risk, crash, or broken logic.
- \`should_fix_soon\` — Does not block merge but introduces meaningful technical debt, performance risk, or subtle bugs.
- \`ignore\` — Informational only. Low-priority style or nitpick, included only at \`strict\` level.

If the diff is clean with no findings, return an empty array \`[]\`.`,
        "all",
        true,
      ]
    );
  }

  logger.info("Database schema ensured");
}
