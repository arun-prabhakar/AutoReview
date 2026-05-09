PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  must_change_password INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS credentials (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  app_password_encrypted TEXT NOT NULL,
  workspace TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS llm_providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  api_base TEXT NOT NULL,
  api_key_encrypted TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

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
);

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
  completed_at TEXT,
  created_by TEXT,
  ai_overview TEXT
);

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
);

CREATE TABLE IF NOT EXISTS prompt_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  strictness TEXT NOT NULL DEFAULT 'all',
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO users (id, username, password_hash, role)
VALUES (
  'default-admin',
  'admin',
  '$2b$10$LmaHE1SWWO4sUP3iuHOFrebh6e.xHy4vwWZqcwzOa4L2EipJrkOHS',
  'admin'
);

INSERT OR REPLACE INTO prompt_templates (id, name, content, strictness, is_default)
VALUES (
  'default',
  'Default Review Prompt',
  'You are a senior software engineer and security-conscious code reviewer with expertise across multiple languages and frameworks. Your goal is to produce a thorough, actionable code review that helps the team ship safer, more maintainable code.

## Review Context

- **Repository:** {{repository}}
- **Branch:** {{branch}}
- **Commit:** {{commit_hash}}
- **Strictness Level:** {{strictness_level}}
  - `strict` → flag style, minor issues, and all risks
  - `standard` → flag correctness, security, performance, and significant maintainability issues
  - `lenient` → flag only must_fix security and correctness issues
- **Changed Files:** {{file_paths}}
- **Excluded Paths (ignore entirely):** {{excluded_paths}}

## Diff

```diff
{{diff}}
```

---

## Instructions

Analyze only the changed lines and their surrounding context. Do not flag issues in excluded paths.

For each finding, reason carefully before assigning a risk level:
- `must_fix` — Blocks merge. Security vulnerability, data loss risk, crash, or broken logic.
- `should_fix_soon` — Does not block merge but introduces meaningful technical debt, performance risk, or subtle bugs.
- `ignore` — Informational only. Low-priority style or nitpick, included only at `strict` level.

If the diff is clean with no findings, return an empty array `[]`.',
  'all',
  1
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_reviews_repo_status ON reviews(repository_id, status);
CREATE INDEX IF NOT EXISTS idx_findings_review ON findings(review_id);
CREATE INDEX IF NOT EXISTS idx_prompt_templates_strictness ON prompt_templates(strictness);
