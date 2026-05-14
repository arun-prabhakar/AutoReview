# AutoReview Agent

AutoReview is an AI-powered code review application for Bitbucket Cloud repositories.

Currently an internal tool, intended to be released as open-source in the future.

---

## Product Overview

AutoReview allows users to:

- Connect Bitbucket Cloud repositories using credentials and app passwords
- Perform manual or automatic code reviews
- Analyze commits using AI (OpenAI-compatible LLM providers)
- Classify findings based on severity
- Generate structured email drafts with review results

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js, Express, TypeScript |
| Frontend | React 19, Vite, TypeScript |
| UI Components | Radix UI primitives, Framer Motion |
| Styling | Tailwind CSS 3.4 |
| State Management | Redux Toolkit |
| AI Integration | OpenAI SDK (direct — supports any OpenAI-compatible API) |
| Database | PostgreSQL (via pg) |
| Authentication | JWT (bcryptjs + jsonwebtoken) |
| Encryption | AES-256-GCM (credential and API key storage) |
| VCS Integration | Bitbucket Cloud REST API |
| Deployment | Docker Compose (single app service) |

---

## Admin Setup

The application provides an admin interface where users can configure:

- Bitbucket Cloud credentials (multiple accounts supported)
- App password per account
- Repository details
- Repository-to-credential mapping (each repo can use a different account's app password)
- Review mode (Manual / Automatic)
- Toggle for automatic reviews (On/Off)
- Poll interval (in minutes)
- Trigger events (new commits, PR updates — toggled individually)
- File exclusion patterns
- Notification recipients
- Review strictness level (strict, balanced, light)
- LLM provider and model (per repository)

### Security Requirements

- Store credentials securely (AES-256-GCM encrypted at rest)
- Never expose credentials in logs or UI
- Mask sensitive values in API responses
- Maintain audit logs for credential and provider changes
- JWT-based authentication with role-based access (admin/user)
- Rate limiting: 20 login attempts per 15 minutes, 100 API requests per minute

---

## Review Modes

### 1. Manual Review Mode

User inputs:

- Repository
- Commit ID

### Workflow

1. Validate repository access
2. Check if commit has already been reviewed (by repository + commit hash)
3. If already reviewed → fetch existing findings from database, display results, skip AI analysis
4. If not reviewed → proceed with new review:
   1. Fetch commit details and diff via Bitbucket Cloud API
   2. Analyze changes using AI (OpenAI-compatible provider)
   3. Generate findings
   4. Classify findings by severity
   5. Store review and findings in database
   6. Generate email draft

---

### 2. Automatic Review Mode

When enabled:

- AutoReview polls Bitbucket Cloud API to detect new commits and PR updates
- Polling uses the app password mapped to that repository
- Multiple Bitbucket accounts can be configured to distribute API load across repos
- No repository admin access required
- Poll interval is configured by admin in application settings
- Trigger events are toggled individually by admin:
  - New commits (on/off)
  - Pull request updates (on/off)
- All automatic review settings are configurable per repository

### Deduplication

- Before triggering a review, check the database for an existing review of the same commit (matched by repository + commit hash)
- If a completed review exists → skip, do not re-analyze
- If a failed review exists → delete old failed review and retry
- If no review exists → proceed with new review
- This prevents duplicate reviews when:
  - A commit is detected by multiple polling cycles
  - A user manually triggers a review for an already-reviewed commit
  - Both commit and PR triggers fire for the same change

---

## Finding Classification

Each finding must include:

- File path
- Line number (if available)
- Issue summary
- Explanation
- Risk level
- Suggested fix
- Recommendation category (security, performance, correctness, maintainability, style)

### File Exclusions

The following paths are excluded from review by default (enforced server-side in review-engine):

- `node_modules/`
- `vendor/`
- `*.min.js`, `*.min.css`
- `package-lock.json`, `yarn.lock`
- `*.generated.*`
- Dist and build output directories

Per-repository exclusion patterns can be configured via admin settings.

---

## Recommendation Levels

### Ignore for Now

Low-risk issues that do not block development.

Examples:
- Minor readability improvements
- Naming suggestions
- Non-critical refactoring

---

### Should Fix Soon

Medium-risk issues affecting quality or maintainability.

Examples:
- Missing validations
- Weak error handling
- Duplicate logic
- Performance concerns

---

### Must Fix

High-risk issues that may break functionality or cause failures.

Examples:
- Security vulnerabilities
- Null pointer risks
- Incorrect business logic
- Authorization issues
- Data corruption risks

---

## Email Draft Generation

AutoReview generates an email draft after each review.

### Email Mode

- **Enabled** — AutoReview sends the email automatically via SMTP (requires SMTP configuration in admin settings)
- **Disabled** — Email draft is displayed in the UI. User copies the content and sends it manually.

Configurable per repository in admin settings.

### SMTP Configuration (when email is enabled)

| Setting | Description |
|---|---|
| SMTP Host | Mail server address |
| SMTP Port | Mail server port |
| SMTP User | Authentication username |
| SMTP Password | Authentication password (encrypted at rest) |
| From Address | Sender email address |

### Notification Recipients

Configurable per repository:

- Team mailing list
- Commit author
- Custom recipients (comma-separated emails)

Admin configures recipients in repository settings.

### Subject

Code Review Findings for <repo-name> - Commit <commit-id>

### Body

Hi Team,

AutoReview completed the code review.

Repository: <repo-name>
Branch: <branch-name>
Commit ID: <commit-id>

Summary:

Must Fix: X
Should Fix Soon: Y
Can Ignore for Now: Z

Must Fix:

<finding summary> File: <file-path> Reason: <explanation> Suggested Fix: <fix>

Should Fix Soon:

<finding summary>

Can Ignore for Now:

<finding summary>

Regards,
AutoReview

---

## Server Architecture

### Entry Point

`server/src/index.ts` — Express application bootstrap:

1. Load environment via dotenv
2. Configure rate limiting (auth: 20/15min, API: 100/min)
3. Apply middleware: CORS, JSON parsing, request logger
4. Mount public routes: `/api/auth/login`, `/api/auth`, `/api/health`
5. Apply JWT authentication to all `/api/*` routes
6. Mount protected routes (some admin-only via `requireRole("admin")`)
7. Serve static files (React build) with SPA fallback
8. Initialize database and start auto-review polling
9. Graceful shutdown on SIGTERM/SIGINT

### API Endpoints

**Authentication** (`/api/auth`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/login` | None | Authenticate user, returns JWT token |
| GET | `/api/auth/me` | JWT | Current user info from token |
| GET | `/api/auth/users` | Admin | List all users |
| POST | `/api/auth/users` | Admin | Create new user (username, password, role) |
| PUT | `/api/auth/users/:id/password` | Admin | Update user password |
| DELETE | `/api/auth/users/:id` | Admin | Delete user |

**Reviews** (`/api/reviews`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/reviews` | JWT | List reviews (filters: repository_id, status, limit, offset) |
| GET | `/api/reviews/:id` | JWT | Single review with findings |
| POST | `/api/reviews/manual` | JWT | Trigger manual review (repository_id, commit_hash) |

**Repositories** (`/api/repositories` — admin only)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/repositories` | Admin | List repositories |
| GET | `/api/repositories/:id` | Admin | Get single repository |
| POST | `/api/repositories` | Admin | Create repository |
| PUT | `/api/repositories/:id` | Admin | Update repository (whitelisted fields only) |
| DELETE | `/api/repositories/:id` | Admin | Delete repository |

**Settings** (`/api/settings` — admin only)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/settings/llm` | Admin | LLM settings per repository |
| GET | `/api/settings/smtp` | Admin | SMTP settings per repository |
| PUT | `/api/settings/llm/:repo_id` | Admin | Update LLM config for a repository |
| PUT | `/api/settings/smtp/:repo_id` | Admin | Update SMTP config for a repository |

**Credentials** (`/api/credentials` — admin only)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/credentials` | Admin | List credentials (masked) |
| POST | `/api/credentials` | Admin | Create credential (encrypted) |
| DELETE | `/api/credentials/:id` | Admin | Delete credential |

**LLM Providers** (`/api/providers` — admin only)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/providers` | Admin | List providers (public info only) |
| POST | `/api/providers` | Admin | Create provider (API key encrypted) |
| PUT | `/api/providers/:id` | Admin | Update provider |
| DELETE | `/api/providers/:id` | Admin | Delete provider |

**Prompt Templates** (`/api/settings/prompt-template` — admin only)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/settings/prompt-template` | Admin | List all templates |
| GET | `/api/settings/prompt-template/:id` | Admin | Get template by id |
| POST | `/api/settings/prompt-template` | Admin | Create template |
| PUT | `/api/settings/prompt-template/:id` | Admin | Update template |
| DELETE | `/api/settings/prompt-template/:id` | Admin | Delete template (cannot delete default) |
| POST | `/api/settings/prompt-template/enhance` | Admin | Enhance template via LLM |
| POST | `/api/settings/prompt-template/test` | Admin | Render template with sample data |

**Health**

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | None | Health check (returns `{ status: "ok" }`) |

### Services

| Service | File | Purpose |
|---|---|---|
| review-engine | `services/review-engine.ts` | Core AI analysis: builds prompt, calls OpenAI-compatible API, parses and filters findings |
| manual-review-service | `services/manual-review-service.ts` | Orchestrates manual review flow: dedup → Bitbucket fetch → AI analysis → store → notify |
| automatic-review-service | `services/automatic-review-service.ts` | Background polling loop for auto-review on enabled repos |
| bitbucket-client | `services/bitbucket-client.ts` | Bitbucket REST API client: diffs, commits, PRs, comments, retry with backoff |
| provider-service | `services/provider-service.ts` | LLM provider CRUD and API key decryption |
| credential-service | `services/credential-service.ts` | Bitbucket credential CRUD and password decryption |
| encryption-service | `services/encryption-service.ts` | AES-256-GCM encrypt/decrypt utilities |
| storage-service | `services/storage-service.ts` | Review and finding persistence with dedup |
| finding-classifier | `services/finding-classifier.ts` | Groups findings by risk level |
| email-draft-service | `services/email-draft-service.ts` | Email generation and SMTP sending |
| repository-service | `services/repository-service.ts` | Repository config access |

### Middleware

| Middleware | File | Purpose |
|---|---|---|
| jwtAuth | `middleware/jwt-auth.ts` | JWT validation, populates `req.user` (id, username, role) |
| requireRole | `middleware/jwt-auth.ts` | Role-based access control helper |
| requestLogger | `middleware/index.ts` | Logs method, path, status, duration for every request |
| errorHandler | `middleware/index.ts` | Centralized error response (structured JSON) |

### Configuration

`server/src/config.ts` — JWT secret management:
- Production: `JWT_SECRET` environment variable required (throws if missing)
- Development: Falls back to `"autoreview-dev-secret"` with a warning

`ENCRYPTION_KEY` environment variable is required for credential and API key encryption.

---

## Database Schema

PostgreSQL. Schema versioned with `ensureSchema` check on startup. All tables created on first run.

### users

| Column | Type | Description |
|---|---|---|
| id | TEXT (UUID) | Primary key |
| username | TEXT | Unique username |
| password_hash | TEXT | bcrypt hash |
| role | TEXT | `admin` or `user` |
| created_at | TEXT | ISO 8601 timestamp |
| updated_at | TEXT | ISO 8601 timestamp |

### llm_providers

| Column | Type | Description |
|---|---|---|
| id | TEXT (UUID) | Primary key |
| name | TEXT | Unique provider name |
| api_base | TEXT | OpenAI-compatible API base URL |
| api_key_encrypted | TEXT | AES-256-GCM encrypted API key |
| created_at | TEXT | ISO 8601 timestamp |
| updated_at | TEXT | ISO 8601 timestamp |

### credentials

| Column | Type | Description |
|---|---|---|
| id | TEXT (UUID) | Primary key |
| username | TEXT | Bitbucket username |
| app_password_encrypted | TEXT | AES-256-GCM encrypted app password |
| workspace | TEXT | Bitbucket workspace (nullable) |
| created_at | TEXT | ISO 8601 timestamp |
| updated_at | TEXT | ISO 8601 timestamp |

### repositories

| Column | Type | Description |
|---|---|---|
| id | TEXT (UUID) | Primary key |
| name | TEXT | Display name |
| slug | TEXT | Repository slug |
| workspace | TEXT | Bitbucket workspace |
| credential_id | TEXT (FK) | Reference to credential |
| branch | TEXT | Default branch (default: `main`) |
| review_mode | TEXT | `manual` or `automatic` |
| auto_review_enabled | INTEGER | 0 or 1 |
| poll_interval_minutes | INTEGER | Polling frequency (default: 5) |
| trigger_on_commit | INTEGER | 0 or 1 (default: 1) |
| trigger_on_pr_update | INTEGER | 0 or 1 (default: 1) |
| strictness | TEXT | `strict`, `balanced`, or `light` (default: `balanced`) |
| generate_email | INTEGER | 0 or 1 (default: 1) |
| post_to_bitbucket | INTEGER | 0 or 1 (default: 0) |
| excluded_paths | TEXT | Comma-separated patterns |
| notification_recipients | TEXT | Comma-separated emails |
| include_commit_author | INTEGER | 0 or 1 (default: 0) |
| llm_provider | TEXT | Provider name |
| llm_provider_id | TEXT (FK) | Reference to llm_providers |
| llm_model | TEXT | Model name (default: `gpt-4`) |
| llm_max_tokens | INTEGER | Max response tokens (default: 4096) |
| llm_temperature | REAL | Sampling temperature (default: 0.2) |
| smtp_host | TEXT | SMTP server |
| smtp_port | INTEGER | SMTP port |
| smtp_user | TEXT | SMTP username |
| smtp_password_encrypted | TEXT | AES-256-GCM encrypted SMTP password |
| smtp_from_address | TEXT | Sender email |
| created_at | TEXT | ISO 8601 timestamp |
| updated_at | TEXT | ISO 8601 timestamp |

### reviews

| Column | Type | Description |
|---|---|---|
| id | TEXT (UUID) | Primary key |
| repository_id | TEXT (FK) | Reference to repository |
| commit_hash | TEXT | Commit SHA |
| branch | TEXT | Branch name |
| status | TEXT | `pending`, `completed`, `failed` |
| strictness | TEXT | `strict`, `balanced`, `light` |
| review_mode | TEXT | `manual`, `automatic` |
| error_message | TEXT | Failure reason (nullable) |
| created_at | TEXT | ISO 8601 timestamp |
| completed_at | TEXT | ISO 8601 timestamp (nullable) |

**Unique constraint**: `(repository_id, commit_hash)` — one review per commit per repository.

### findings

| Column | Type | Description |
|---|---|---|
| id | TEXT (UUID) | Primary key |
| review_id | TEXT (FK) | Reference to review |
| file_path | TEXT | File where issue was found |
| line_number | INTEGER | Line number (nullable) |
| summary | TEXT | Short issue description |
| explanation | TEXT | Detailed explanation |
| risk_level | TEXT | `must_fix`, `should_fix_soon`, `ignore` |
| suggested_fix | TEXT | Fix suggestion (nullable) |
| category | TEXT | `security`, `performance`, `correctness`, `maintainability`, `style` |

### prompt_templates

| Column | Type | Description |
|---|---|---|
| id | TEXT (UUID) | Primary key |
| name | TEXT | Template name |
| content | TEXT | Full prompt template text with placeholders |
| strictness | TEXT | `strict`, `balanced`, `light`, or `all` |
| is_default | INTEGER | 1 if system default |
| created_at | TEXT | ISO 8601 timestamp |
| updated_at | TEXT | ISO 8601 timestamp |

### Indices

- `idx_users_username` on `users(username)`
- `idx_reviews_repo_status` on `reviews(repository_id, status)`
- `idx_findings_review` on `findings(review_id)`
- `idx_prompt_templates_strictness` on `prompt_templates(strictness)`

### Seed Data

- In non-production mode: creates admin user (`admin` / `admin`) automatically
- Seeds a default prompt template on first run if none exists

---

## Frontend Architecture

### Stack

- **React 19** — UI framework
- **Vite 6** — Build tool and dev server
- **Radix UI** — Accessible UI primitives (Dialog, Select, Tabs, Toast, etc.)
- **Framer Motion** — Page transitions and micro-interactions
- **Redux Toolkit** — Global state management
- **React Router 7** — Client-side routing
- **Tailwind CSS 3.4** — Utility-first styling

### Routing

Defined in `client/src/App.tsx` with `RequireAuth` wrapper for protected routes and `Layout` (sidebar + header).

| Route | Page | Description |
|---|---|---|
| `/login` | Login | Authentication form |
| `/` | Dashboard | Review history, summary cards, filters |
| `/reviews/:id` | Review Detail | Findings for a specific review |
| `/reviews/manual` | Manual Review | Trigger a manual review by repo + commit |
| `/settings` | Settings | Admin configuration (7 tabs) |

### State Structure (Redux)

```
{
  auth: { user, token, isAuthenticated, loading, error },
  repositories: { items[], loading, error },
  reviews: { items[], loading, error },
  reviewDetail: { review, findings, loading },
  settings: { credentials, smtp, llmConfig, loading, error },
  promptTemplate: { current, versions[], loading },
  ui: { toasts, modals, sidebarOpen }
}
```

### Key Pages

**Dashboard** (`pages/Dashboard.tsx`)
- Review history table with status badges
- Summary cards (pending / completed / failed counts)
- Filters: repository, status

**Manual Review** (`pages/ManualReview.tsx`)
- Form: repository dropdown, commit ID input
- Submit triggers review (or fetches existing if already reviewed)
- Results rendered inline after completion

**Review Detail** (`pages/ReviewDetail.tsx`)
- Review metadata (repo, branch, commit, mode, strictness, timestamps)
- Findings list grouped by risk level (Must Fix, Should Fix Soon, Ignore)
- Each finding: file path, line number, summary, explanation, suggested fix
- Email draft preview (collapsible, copy to clipboard)

**Settings** (`pages/Settings.tsx`)
- 7 tabs: LLM Providers, Credentials, Repositories, Review Config, LLM, Prompt Template, Notifications
- LLM Providers: CRUD for OpenAI-compatible providers with presets (OpenAI, Anthropic, Gemini, ZAI, Custom)
- Credentials: Bitbucket credential management (encrypted)
- Repositories: Full CRUD with credential mapping
- Review Config: Per-repo review mode, strictness, auto-review toggle, poll interval, excluded paths
- LLM: Per-repo provider/model assignment, max tokens, temperature
- Prompt Template: Editor with strictness-level tabs, AI enhance feature, variable placeholders
- Notifications: Per-repo SMTP config, recipients, commit author inclusion

**Login** (`pages/Login.tsx`)
- Username/password form
- JWT token stored in localStorage
- Redirects to dashboard on success

### API Client

`client/src/services/api.ts` — Fetch wrapper:
- Attaches JWT Bearer token from localStorage
- Returns parsed JSON directly (not raw Response)
- Handles 401 by clearing auth and redirecting to `/login`
- Methods: `get<T>`, `post<T>`, `put<T>`, `del<T>`

### UI Design

Based on a monochromatic architectural aesthetic (see `DESIGN.MD`):
- High-contrast black-and-white theme (Achromatic)
- Surface ladder for visual hierarchy
- Risk-first color system: red (Must Fix), amber (Should Fix), muted (Ignore)
- Support for Light and Dark modes with automatic persistence
- Powered by Tailwind CSS, Radix UI, and Framer Motion for smooth transitions

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Bitbucket API unreachable | Retry with exponential backoff (3 retries, respects Retry-After) |
| LLM provider error | Retry once, then mark review as failed |
| Commit too large for context window | Truncate diff at 100K chars, flag as incomplete |
| Expired or invalid Bitbucket credentials | Alert to logs, mark review failed |
| Rate limited by Bitbucket (429) | Respect Retry-After header, backoff |
| Polling fails to detect commit | Manual trigger available as fallback |

---

## Concurrency

- Reviews are processed sequentially by default (one at a time, globally)
- Incoming reviews during processing are queued in the database (status: `pending`)
- Deduplication check runs before queueing — already-reviewed commits are skipped
- Configurable worker count for parallel processing (future enhancement)

---

## Review Strictness Levels

### Strict

- Report **all** findings regardless of confidence level
- Includes low-risk and low-confidence issues
- More findings, more noise
- Best for: security-sensitive code, critical services

### Balanced (default)

- Report **medium and high** confidence findings
- Skips low-confidence suggestions
- Best for: general day-to-day reviews

### Light

- Report **only high-confidence, high-impact** issues
- Only "Must Fix" and critical "Should Fix Soon" findings
- Minimal noise, quick to read
- Best for: teams that want to avoid review fatigue

The strictness level affects the AI prompt — how aggressively the model flags issues and what it filters out.

---

## LLM Provider Presets

Built-in presets in the Settings UI for quick setup:

| Preset | API Base | Models |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | gpt-4, gpt-4o, gpt-4o-mini, gpt-4-turbo, o1, o1-mini, o3-mini |
| Anthropic | `https://api.anthropic.com/v1` | claude-sonnet-4-20250514, claude-3.5-sonnet, claude-3.5-haiku, claude-3-opus |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | gemini-2.5-pro, gemini-2.5-flash, gemini-2.0-flash, gemini-2.0-flash-lite |
| ZAI | `https://api.z.ai/api/coding/paas/v4` | glm-5.1, glm-4-plus, glm-4-flash, glm-4-air |
| Custom | (user-defined) | (user-defined) |

---

## Docker Deployment

Single app service in Docker Compose:

- **app** — Node.js application (API server + React frontend)
- Multi-stage Dockerfile (builder + runner)
- Port mapping: `3000:3001`
- Volumes: `app-logs`
- Health check: `GET /api/health`
- Restart policy: `unless-stopped`

Database connection is managed via `DATABASE_URL` environment variable.

### Environment Variables

Set via `docker-compose.yml` environment section or `.env` file:

| Variable | Description | Required |
|---|---|---|
| `PORT` | Server port (default: 3001) | No |
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `NODE_ENV` | `production` or `development` | No |
| `STATIC_DIR` | React build output directory | No |
| `LOG_DIR` | Log file directory | No |
| `ENCRYPTION_KEY` | 64-char hex string for AES-256-GCM | Yes |
| `JWT_SECRET` | JWT signing secret | Yes (in production) |

---

## Logging

All application logs are written to both stdout and a log file (`LOG_DIR/autoreview.log`).

- stdout — for `docker compose logs` access
- File — persistent log stored in a mounted volume

Logged events:

- Review requests (manual and automatic)
- Findings generated
- Errors and failures
- API calls to Bitbucket and LLM providers
- Credential and provider changes (audit)
- Polling activity
- Request method/path/status/duration (every request)

---

## Automatic Review Configuration

All settings are configured through the admin UI. No YAML or config file editing required.

### Available Settings

**Automatic Review**

| Setting | Description |
|---|---|
| Enabled | Toggle automatic reviews on/off |
| Poll Interval | How often to check for new commits/PRs (in minutes) |
| Trigger on Commit | Review new commits (on/off) |
| Trigger on PR Update | Review PR updates (on/off) |

**Review**

| Setting | Description |
|---|---|
| Strictness Level | `strict`, `balanced`, or `light` |
| Generate Email Draft | Send email after review (on/off) |
| Post Findings to Bitbucket | Comment findings on PR (on/off) |
| Excluded Paths | File patterns to skip during review |

**Notifications**

| Setting | Description |
|---|---|
| Recipients | Email addresses (comma-separated) |
| Include Commit Author | Add commit author to recipients (on/off) |

**LLM**

| Setting | Description |
|---|---|
| Provider | LLM provider (select from configured providers) |
| Model | Model name (dropdown for known providers, free text for custom) |
| Max Tokens | Maximum tokens for LLM response |
| Temperature | LLM sampling temperature (0.0–1.0) |

### Prompt Template Management

The review prompt template is managed within the Settings page (Prompt Template tab).

- Full text editor for the review prompt
- Strictness-level tabs — separate prompt variations for `strict`, `balanced`, and `light` modes
- AI enhancement — improve the template using the configured LLM provider
- Variable placeholders supported:
  - `{{diff}}` — the code diff
  - `{{file_paths}}` — list of changed files
  - `{{strictness_level}}` — current strictness setting
  - `{{excluded_paths}}` — configured exclusion patterns
  - `{{commit_hash}}` — commit SHA
  - `{{commit_message}}` — commit message text
  - `{{branch}}` — branch name
  - `{{repository}}` — repository name
- Default template is provided out-of-the-box
- Changes take effect immediately for new reviews (existing reviews are not re-analyzed)

---

## Tests

Server-side tests use Vitest:

| Test File | Coverage |
|---|---|
| `__tests__/auth-routes.test.ts` | Login flow, /me endpoint, user CRUD (admin) |
| `__tests__/jwt-auth.test.ts` | JWT middleware validation, role-based access |
| `__tests__/review-engine.test.ts` | Finding parsing, path filtering, diff extraction, AI analysis |
| `__tests__/finding-classifier.test.ts` | Risk level classification |
| `__tests__/encryption-service.test.ts` | Encrypt/decrypt roundtrip, tampering detection, unicode support |

Run: `npm test` (server)

---

## Agent Responsibilities

The agent must:

- Fetch commit and diff data
- Analyze only changed code (diff-first approach)
- Generate high-quality, actionable feedback
- Avoid unnecessary or low-confidence comments
- Respect repository-level configuration
- Store findings for dashboard visibility

---

## Review Principles

- Be precise and actionable
- Avoid noise
- Prioritize high-impact issues
- Explain the reasoning
- Suggest fixes where possible
- Respect developer intent

---

## Non-Goals (v1)

- Auto-fixing code
- Auto-merging commits
- Full repository scanning
- GitHub/GitLab support
- Replacing human reviewers

---

## Open Source Principles

AutoReview should be:

- Self-hostable
- Transparent
- Configurable
- Privacy-first
- Modular

---

## License

Recommended:

- Apache 2.0
- MIT

---

## Tagline

AutoReview — AI-powered code reviews for Bitbucket.
