# AutoReview Agent

AutoReview is an AI-powered code review application for Bitbucket Cloud repositories.

Currently an internal tool, intended to be released as open-source in the future.

---

## Product Overview

AutoReview allows users to:

- Connect Bitbucket Cloud repositories using credentials and app passwords
- Perform manual or automatic code reviews
- Analyze commits using AI
- Classify findings based on severity
- Generate structured email drafts with review results

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js |
| Frontend | React + shadcn/ui (component library) |
| State Management | Redux Toolkit |
| AI Gateway | LiteLLM (supports multiple LLM providers) |
| Database | SQLite (file-based, simple deployment) |
| Hosting | Docker Compose |
| VCS | Bitbucket Cloud |

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
- LLM provider and model

### Security Requirements

- Store credentials securely (encrypted at rest)
- Never expose credentials in logs or UI
- Mask sensitive values
- Maintain audit logs for credential changes

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
   2. Analyze changes using AI
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
- If a failed review exists → retry according to error handling rules
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
- Recommendation category

### File Exclusions

The following paths should be excluded from review by default:

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
| SMTP Password | Authentication password |
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

## Database Schema

SQLite file-based storage. Tables:

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
| created_at | TEXT (ISO 8601) | When review was requested |
| completed_at | TEXT (ISO 8601) | When review finished (nullable) |

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
| category | TEXT | Recommendation category |

---

## Core Modules

- frontend-ui
- api-server
- credential-service
- repository-service
- bitbucket-client
- manual-review-service
- automatic-review-service
- review-engine
- finding-classifier
- email-draft-service
- settings-service
- storage-service

---

## Application Authentication

Internal deployment. Access control options (choose one):

- VPN-only (no app-level auth)
- Basic auth with a shared username/password
- SSO / corporate LDAP integration

Default for v1: VPN-only or basic auth. SSO can be added later.

---

## Dashboard

The dashboard displays:

- Recent reviews with status (pending, completed, failed)
- Finding trends over time
- Per-repository breakdown
- Filtering by severity, date, repository

---

## Frontend Architecture

### Stack

- **React** — UI framework
- **shadcn/ui** — Component library (Tailwind CSS-based, copy-paste components)
- **Redux Toolkit** — Global state management
- **React Router** — Client-side routing
- **Tailwind CSS** — Utility-first styling (required by shadcn/ui)

### Routing

| Route | Page | Description |
|---|---|---|
| `/` | Dashboard | Review history, trends, filtering |
| `/reviews/:id` | Review Detail | Findings for a specific review |
| `/reviews/manual` | Manual Review | Trigger a manual review by repo + commit |
| `/settings` | Settings | Admin configuration (credentials, repos, LLM, notifications) |
| `/settings/prompt-template` | Prompt Template | Edit, preview, and version prompt templates for reviews |

### State Structure (Redux)

```
{
  auth: { user, isAuthenticated },
  repositories: { items[], loading, error },
  reviews: { items[], pagination, filters, loading },
  reviewDetail: { review, findings, loading },
  settings: { credentials, smtp, llmConfig, loading },
  promptTemplate: { current, versions[], strictnessOverrides, preview, loading },
  ui: { toasts, modals, sidebarOpen }
}
```

### Key Pages

**Dashboard**
- Review history table with status badges
- Summary cards (Must Fix / Should Fix / Ignore counts)
- Trend chart (findings over time by severity)
- Filters: repository, severity, date range, status

**Manual Review**
- Form: repository dropdown, commit ID input
- Submit → triggers review (or fetches existing if already reviewed)
- Results rendered inline after completion

**Review Detail**
- Review metadata (repo, branch, commit, mode, strictness, timestamps)
- Findings list grouped by risk level (Must Fix → Should Fix → Ignore)
- Each finding: file path, line number, summary, explanation, suggested fix
- Email draft preview (collapsible)

**Settings**
- Tabs: Credentials | Repositories | Review Config | LLM | Notifications | Prompt Template
- Forms for CRUD operations on each config area
- Credential values masked in UI
- LLM tab: provider/model selection, token budget, temperature
- Prompt Template tab: full editor, live preview, version history, per-strictness overrides

**Prompt Template**
- Code editor for prompt text with syntax highlighting for placeholders
- Split view: editor (left) | rendered preview with sample data (right)
- Version history sidebar — click to restore a previous version
- Strictness-level tabs to define overrides per level
- "Test with sample diff" button to validate prompt output

### shadcn/ui Components Used

- `Table` — review history, findings list
- `Card` — dashboard summary cards
- `Form` + `Input` + `Select` — settings, manual review form
- `Dialog` — confirmation modals
- `Tabs` — settings page sections
- `Badge` — status indicators (pending/completed/failed), severity labels
- `Toast` — operation feedback
- `Sheet` — mobile sidebar
- `Collapsible` — email draft, finding details
- `Skeleton` — loading states
- `Textarea` — prompt template editor
- `ScrollArea` — version history list

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Bitbucket API unreachable | Queue review, retry with exponential backoff |
| LiteLLM / LLM provider error | Retry once, then mark review as failed |
| Commit too large for context window | Truncate diff, review what fits, flag incomplete review |
| Expired or invalid credentials | Alert admin, skip review, log failure reason |
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

## Docker Compose

Two services:

- **app** — Node.js application (API server + React frontend)
- **litellm** — LiteLLM proxy for LLM API calls

SQLite database is stored as a mounted volume inside the app container.

---

## Logging

All application logs are written to both stdout and a log file.

- stdout — for `docker compose logs` access
- File — persistent log stored in a mounted volume

Logged events:

- Review requests (manual and automatic)
- Findings generated
- Errors and failures
- API calls to Bitbucket and LiteLLM
- Credential changes (audit)
- Polling activity

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
| Strictness Level | `strict`, `balanced`, or `light` (see below) |
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
| Provider | LLM provider (via LiteLLM) |
| Model | Model name (e.g., gpt-4, claude-sonnet-4-6) |
| Max Tokens | Maximum tokens for LLM response |
| Temperature | LLM sampling temperature (0.0–1.0) |

### Prompt Template Management

The review prompt template is managed through a dedicated UI in settings.

**Prompt Template Page** (`/settings/prompt-template`)

- Full text editor for the review prompt
- Preview panel showing how the prompt renders with sample data
- Version history — previous prompt versions are saved and can be restored
- Per-strictness-level overrides — separate prompt variations for `strict`, `balanced`, and `light` modes
- Variable placeholders supported:
  - `{{diff}}` — the code diff
  - `{{file_paths}}` — list of changed files
  - `{{strictness_level}}` — current strictness setting
  - `{{excluded_paths}}` — configured exclusion patterns
  - `{{commit_message}}` — commit message text
  - `{{branch}}` — branch name
- Default template is provided out-of-the-box
- Admin can modify, test, and revert the template at any time
- Changes take effect immediately for new reviews (existing reviews are not re-analyzed)

**Prompt Template Storage**

Prompt templates are stored in the `settings` table in SQLite. Each template includes:

| Column | Type | Description |
|---|---|---|
| id | TEXT (UUID) | Primary key |
| name | TEXT | Template name (e.g., `default`, `strict_override`) |
| content | TEXT | Full prompt template text with placeholders |
| strictness | TEXT | `strict`, `balanced`, `light`, or `all` (applies to all levels) |
| is_default | BOOLEAN | Whether this is the system default |
| created_at | TEXT (ISO 8601) | When template was created |
| updated_at | TEXT (ISO 8601) | Last modification |

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
