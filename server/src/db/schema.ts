import type { Pool } from "pg";
import bcrypt from "bcryptjs";
import { v4 as uuid } from "uuid";
import { logger } from "../middleware/index.js";

/**
 * Migration system:
 *
 * 1. `createTables()` runs `CREATE TABLE IF NOT EXISTS` with the CURRENT full schema.
 *    This gives brand-new databases everything in one pass.
 *
 * 2. `schema_migrations` table tracks which numbered migrations have been applied.
 *
 * 3. `runPendingMigrations()` runs only migrations not yet recorded.
 *    For existing databases that were created before a column/table was added.
 *
 * To add a new schema change:
 *    - Add the column/table to the CREATE TABLE block (for new databases)
 *    - Add a numbered migration in MIGRATIONS array (for existing databases)
 */

async function createTables(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      name TEXT,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      must_change_password BOOLEAN NOT NULL DEFAULT false,
      token_version INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS llm_providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      api_base TEXT NOT NULL,
      api_key_encrypted TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS credentials (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      app_password_encrypted TEXT NOT NULL,
      workspace TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
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
      failure_category TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      created_by TEXT,
      ai_overview TEXT,
      parent_review_id TEXT,
      tokens_prompt INTEGER,
      tokens_completion INTEGER,
      tokens_total INTEGER,
      estimated_cost REAL,
      project_context TEXT,
      commit_author TEXT,
      diff_text TEXT,
      pr_head_commit TEXT,
      llm_model TEXT,
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
      disposition_at TIMESTAMPTZ,
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
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

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
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS share_tokens (
      id TEXT PRIMARY KEY,
      review_id TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      enabled BOOLEAN NOT NULL DEFAULT true,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by TEXT NOT NULL,
      FOREIGN KEY(review_id) REFERENCES reviews(id) ON DELETE CASCADE
    )
  `);
}

async function createIndexes(pool: Pool): Promise<void> {
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read)`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_share_tokens_token ON share_tokens(token)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_share_tokens_review ON share_tokens(review_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_reviews_repo_status ON reviews(repository_id, status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON reviews(created_at)`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_repo_commit ON reviews(repository_id, commit_hash)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_findings_review ON findings(review_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_findings_risk_disposition ON findings(risk_level, disposition)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_prompt_templates_strictness ON prompt_templates(strictness)`);
}

const MIGRATIONS: { id: string; description: string; sql: string[] }[] = [
  {
    id: "001",
    description: "Add name column to users",
    sql: [`ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT`],
  },
  {
    id: "002",
    description: "Add review metadata columns",
    sql: [
      `ALTER TABLE reviews ADD COLUMN IF NOT EXISTS ai_overview TEXT`,
      `ALTER TABLE reviews ADD COLUMN IF NOT EXISTS parent_review_id TEXT`,
      `ALTER TABLE reviews ADD COLUMN IF NOT EXISTS tokens_prompt INTEGER`,
      `ALTER TABLE reviews ADD COLUMN IF NOT EXISTS tokens_completion INTEGER`,
      `ALTER TABLE reviews ADD COLUMN IF NOT EXISTS tokens_total INTEGER`,
      `ALTER TABLE reviews ADD COLUMN IF NOT EXISTS estimated_cost REAL`,
      `ALTER TABLE reviews ADD COLUMN IF NOT EXISTS project_context TEXT`,
      `ALTER TABLE reviews ADD COLUMN IF NOT EXISTS error_message TEXT`,
      `ALTER TABLE reviews ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ`,
      `ALTER TABLE reviews ADD COLUMN IF NOT EXISTS created_by TEXT`,
      `ALTER TABLE reviews ADD COLUMN IF NOT EXISTS commit_author TEXT`,
    ],
  },
  {
    id: "003",
    description: "Convert text timestamps to TIMESTAMPTZ",
    sql: buildTimestampMigrations(),
  },
  {
    id: "004",
    description: "Add diff storage columns to reviews",
    sql: [
      `ALTER TABLE reviews ADD COLUMN IF NOT EXISTS diff_text TEXT`,
    ],
  },
  {
    id: "005",
    description: "Add failure_category and pr_head_commit to reviews",
    sql: [
      `ALTER TABLE reviews ADD COLUMN IF NOT EXISTS failure_category TEXT`,
      `ALTER TABLE reviews ADD COLUMN IF NOT EXISTS pr_head_commit TEXT`,
    ],
  },
  {
    id: "006",
    description: "Add persistent_issue_id to findings",
    sql: [
      `ALTER TABLE findings ADD COLUMN IF NOT EXISTS persistent_issue_id TEXT`,
    ],
  },
  {
    id: "007",
    description: "Add llm_model to reviews",
    sql: [
      `ALTER TABLE reviews ADD COLUMN IF NOT EXISTS llm_model TEXT`,
    ],
  },
];

function buildTimestampMigrations(): string[] {
  const columns: [string, string][] = [
    ["users", "created_at"],
    ["users", "updated_at"],
    ["llm_providers", "created_at"],
    ["llm_providers", "updated_at"],
    ["credentials", "created_at"],
    ["credentials", "updated_at"],
    ["repositories", "created_at"],
    ["repositories", "updated_at"],
    ["reviews", "created_at"],
    ["reviews", "completed_at"],
    ["prompt_templates", "created_at"],
    ["prompt_templates", "updated_at"],
    ["notifications", "created_at"],
    ["share_tokens", "created_at"],
    ["share_tokens", "expires_at"],
  ];

  return columns.map(([table, col]) => `
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = '${table.replace(/'/g, "''")}' AND column_name = '${col.replace(/'/g, "''")}' AND data_type = 'text') THEN
        EXECUTE 'ALTER TABLE "${table}" ALTER COLUMN "${col}" TYPE TIMESTAMPTZ USING "${col}"::TIMESTAMPTZ';
      END IF;
    END$$
  `);
}

async function runPendingMigrations(pool: Pool): Promise<void> {
  const { rows } = await pool.query("SELECT id FROM schema_migrations");
  const applied = new Set(rows.map((r: { id: string }) => r.id));

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;

    logger.info(`Running migration ${migration.id}: ${migration.description}`);
    for (const sql of migration.sql) {
      await pool.query(sql);
    }
    await pool.query(
      "INSERT INTO schema_migrations (id, applied_at) VALUES ($1, NOW())",
      [migration.id]
    );
    logger.info(`Migration ${migration.id} applied`);
  }
}

async function seedData(pool: Pool): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    const adminHash = await bcrypt.hash("admin", 12);
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
}

export async function ensureSchema(pool: Pool): Promise<void> {
  await createTables(pool);
  await createIndexes(pool);
  await runPendingMigrations(pool);
  await seedData(pool);

  logger.info("Database schema ensured");
}
