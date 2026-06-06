# AutoReview

AI-powered code review workflow for Bitbucket Cloud repositories.

## Overview

AutoReview is a self-hosted web app for reviewing Bitbucket commits and pull requests with an OpenAI-compatible LLM provider. It fetches diffs from Bitbucket, asks the configured model for structured findings, stores the review result, and presents it in a dashboard with history, sharing, notifications, analytics, and admin controls.

The app supports both manual review from the UI and scheduled automatic review through the cron endpoint. Reviews are stored in PostgreSQL and can be re-run without overwriting earlier results.

## Current Features

- **Manual commit reviews**: choose a configured repository and commit hash, then run a review on demand.
- **Pull request reviews**: fetch open Bitbucket PRs and review the selected PR diff.
- **Automatic review endpoint**: `/api/cron/auto-review` can poll configured repositories for new commits and PR updates.
- **Re-review history**: re-run a review for the same commit or PR while preserving older reviews in a linked history chain.
- **AI overview**: each completed review gets a compact, complete overview sentence for dashboards and email drafts.
- **Raw AI response storage**: stores the model's raw review output in `reviews.ai_response` for admin inspection.
- **Admin AI response viewer**: admins can open a formatted raw-response viewer from the review detail page.
- **Structured findings**: findings are grouped as `must_fix`, `should_fix_soon`, and `ignore`, with file, line, category, explanation, and suggested fix.
- **Configurable review strictness**: per-repository strictness controls how aggressively issues are flagged.
- **Prompt templates**: admins can manage prompt templates, view the fixed output format, test prompts, and enhance prompts with an LLM.
- **Multi-pass review mode**: optionally run specialized passes for security, performance, and maintainability, then deduplicate findings.
- **Path exclusions**: default and custom exclusion patterns prevent generated, vendor, build, and configured paths from being reported.
- **Bitbucket comments**: optionally post PR comments and inline comments back to Bitbucket.
- **Email drafts and SMTP delivery**: generate review email text and optionally send notifications via repository SMTP settings.
- **Review sharing**: create public share links with optional expiry; shared pages omit admin-only raw AI response data.
- **Notifications**: users receive review-completed notifications and can mark them read.
- **Cost analytics**: admins can inspect token usage, estimated cost, cost by model, and per-review cost.
- **Repository analytics**: endpoints expose findings over time, top files, and finding density.
- **User management**: admins can create users, update roles, reset passwords, and delete users.
- **Provider management**: configure OpenAI-compatible LLM providers, test provider connectivity, and fetch available models.
- **Secure secrets**: API keys, SMTP passwords, and Bitbucket app passwords are encrypted with AES-256-GCM.
- **JWT auth with cookies**: login uses JWT auth, an HTTP-only cookie, and role-based access controls.

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js, Express, TypeScript |
| Frontend | React 19, Vite 6, Redux Toolkit, Tailwind CSS |
| UI | Radix UI primitives, lucide-react icons |
| Database | PostgreSQL, Supabase-compatible |
| AI | OpenAI SDK against OpenAI-compatible providers |
| VCS | Bitbucket Cloud REST API |
| Auth | JWT, bcryptjs, HTTP-only cookies |
| Encryption | AES-256-GCM |
| Deployment | Docker / Docker Compose |

## Quick Start

### Prerequisites

- Node.js 20+
- npm
- PostgreSQL database
- Bitbucket Cloud app password for repositories you want to review
- An OpenAI-compatible LLM provider API key

### Server

```bash
cd server
cp .env.example .env
npm install
npm run db:init
npm run dev
```

Edit `server/.env` before starting the server:

```env
PORT=3001
DATABASE_URL=postgresql://user:password@host:5432/database
ENCRYPTION_KEY=64_hex_characters
JWT_SECRET=your_jwt_secret
```

The API runs on `http://localhost:3001`.

### Client

```bash
cd client
npm install
npm run dev
```

The client runs on `http://localhost:5173` and proxies `/api` requests to `http://localhost:3001`.

### Default Login

| Username | Password |
|---|---|
| `admin` | `admin` |

The default admin is seeded only when `NODE_ENV` is not `production`.

For local HTTP development, the auth cookie is marked `Secure` only when the incoming request is HTTPS. This allows login to work when `NODE_ENV=production` is set in a local `.env`.

## Environment Variables

| Variable | Description | Default | Required |
|---|---|---|---|
| `PORT` | Server port | `3001` | No |
| `DATABASE_URL` | PostgreSQL connection string | none | Yes |
| `NODE_ENV` | `development` or `production` | none | No |
| `CORS_ORIGIN` | Allowed browser origin | `http://localhost:5173` | No |
| `STATIC_DIR` | Directory for built client assets in production | `./public` | No |
| `LOG_DIR` | Server log directory | `./logs` | No |
| `ENCRYPTION_KEY` | 64-character hex key for AES-256-GCM | none | Yes |
| `JWT_SECRET` | JWT signing secret | development fallback only | Yes in production |
| `DEPLOYED_AT` | Build/deploy timestamp used for `/api/health` versioning | current startup time | No |

## Development Commands

Server:

```bash
cd server
npm run dev       # tsx watch server
npm run build     # TypeScript compile
npm test          # Vitest tests
npm run db:init   # create tables, indexes, migrations, seed data
```

Client:

```bash
cd client
npm run dev       # Vite dev server
npm run build     # TypeScript and production Vite build
npm run preview   # preview production build
```

## Database Notes

The schema is managed in `server/src/db/schema.ts`.

- New installs get the current full schema through `CREATE TABLE IF NOT EXISTS`.
- Existing installs are updated through `schema_migrations`.
- Reviews support repeated re-runs for the same repository and commit/PR. The `reviews(repository_id, commit_hash)` relationship is indexed but not unique.
- Raw model output is stored in `reviews.ai_response` as PostgreSQL `TEXT`.
- Diff text and project context are stored on review rows to support detail views and auditability.

## Review Lifecycle

1. The server fetches a Bitbucket commit or PR diff.
2. The review engine builds the prompt from repository settings and optional `.autoreview.md` project context.
3. The configured LLM returns a JSON findings array.
4. The raw model output is stored in `reviews.ai_response`.
5. Findings are parsed, sorted, filtered by exclusions, deduplicated, and stored.
6. A compact AI overview is generated and validated.
7. Notifications, optional email, and optional Bitbucket comments are sent.
8. Review details, diff, findings, email draft, history, and admin-only raw response are available in the UI.

## API Overview

All application APIs live under `/api`. Most endpoints require authentication; admin routes require the `admin` role.

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/health` | Public | Service health and version |
| `POST` | `/api/auth/login` | Public | Login and set auth cookie |
| `POST` | `/api/auth/logout` | Public | Clear auth cookie |
| `GET` | `/api/auth/me` | Public token check | Return current user |
| `POST` | `/api/auth/change-password` | User | Change own password |
| `GET` | `/api/auth/users` | Admin | List users |
| `POST` | `/api/auth/users` | Admin | Create user |
| `PUT` | `/api/auth/users/:id` | Admin | Update user profile or role |
| `PUT` | `/api/auth/users/:id/password` | Admin | Reset user password |
| `DELETE` | `/api/auth/users/:id` | Admin | Delete user |
| `GET` | `/api/reviews` | User | List reviews with filters and counts |
| `GET` | `/api/reviews/:id` | User | Review detail and findings |
| `POST` | `/api/reviews/manual` | User | Run commit review |
| `POST` | `/api/reviews/pr` | User | Run PR review |
| `POST` | `/api/reviews/:id/rereview` | User | Re-run an existing review |
| `GET` | `/api/reviews/:id/chain` | User | Get linked re-review history |
| `GET` | `/api/reviews/:id/ai-response` | Admin | Get raw stored AI response |
| `DELETE` | `/api/reviews/:id` | Admin | Delete review and findings |
| `GET` | `/api/reviews/authors` | User | List commit authors for filtering |
| `GET` | `/api/reviews/open-prs/:repositoryId` | User | Fetch open Bitbucket PRs |
| `POST` | `/api/share` | User | Create share link |
| `GET` | `/api/share/:token` | Public | View shared review |
| `DELETE` | `/api/share/:token` | User | Disable share link |
| `GET` | `/api/notifications` | User | List notifications |
| `GET` | `/api/notifications/unread-count` | User | Unread notification count |
| `PATCH` | `/api/notifications/:id/read` | User | Mark one notification read |
| `PATCH` | `/api/notifications/review/:reviewId/read` | User | Mark review notifications read |
| `POST` | `/api/notifications/mark-all-read` | User | Mark all notifications read |
| `GET` | `/api/repositories` | User | List repositories |
| `GET` | `/api/repositories/:id` | User | Repository detail |
| `POST` | `/api/repositories` | Admin | Create repository config |
| `PUT` | `/api/repositories/:id` | Admin | Update repository config |
| `DELETE` | `/api/repositories/:id` | Admin | Delete repository config |
| `GET` | `/api/credentials` | Admin | List Bitbucket credentials |
| `POST` | `/api/credentials` | Admin | Store encrypted Bitbucket credential |
| `DELETE` | `/api/credentials/:id` | Admin | Delete credential |
| `GET` | `/api/providers` | Admin | List LLM providers |
| `POST` | `/api/providers` | Admin | Create LLM provider |
| `PUT` | `/api/providers/:id` | Admin | Update LLM provider |
| `DELETE` | `/api/providers/:id` | Admin | Delete LLM provider |
| `POST` | `/api/providers/:id/test` | Admin | Test provider |
| `GET` | `/api/providers/:id/models` | Admin | Fetch provider models |
| `GET` | `/api/settings/llm` | Admin | List repository LLM settings |
| `PUT` | `/api/settings/llm/:repo_id` | Admin | Update repository LLM settings |
| `POST` | `/api/settings/llm/test` | Admin | Test LLM settings |
| `GET` | `/api/settings/smtp` | Admin | List SMTP settings |
| `PUT` | `/api/settings/smtp/:repo_id` | Admin | Update SMTP settings |
| `GET` | `/api/settings/prompt-template` | Admin | List prompt templates |
| `POST` | `/api/settings/prompt-template` | Admin | Create prompt template |
| `PUT` | `/api/settings/prompt-template/:id` | Admin | Update prompt template |
| `DELETE` | `/api/settings/prompt-template/:id` | Admin | Delete prompt template |
| `POST` | `/api/settings/prompt-template/enhance` | Admin | AI-enhance a prompt |
| `POST` | `/api/settings/prompt-template/test` | Admin | Test prompt against sample input |
| `GET` | `/api/settings/prompt-template/fixed-output-format` | Admin | View enforced output schema |
| `GET` | `/api/analytics/cost-summary` | Admin | Cost summary |
| `GET` | `/api/analytics/cost-by-model` | Admin | Cost grouped by model |
| `GET` | `/api/analytics/cost-per-review` | Admin | Per-review cost list |
| `GET` | `/api/analytics/findings-over-time` | Admin | Finding trend data |
| `GET` | `/api/analytics/top-files` | Admin | Most frequently flagged files |
| `GET` | `/api/analytics/finding-density` | Admin | Finding density by repository |
| `POST` | `/api/cron/auto-review` | Cron/public-limited | Poll configured repositories |

## UI Routes

| Route | Access | Description |
|---|---|---|
| `/login` | Public | Login |
| `/` | User | Dashboard and review history |
| `/reviews/manual` | User | Manual commit and PR review launcher |
| `/reviews/:id` | User | Review detail, findings, diff, sharing, history |
| `/shared/:token` | Public | Public shared review |
| `/analytics` | Admin | Cost analytics |
| `/settings` | Admin | Repositories, credentials, providers, prompt templates, LLM, SMTP |
| `/users` | Admin | User management |

## Docker Deployment

```bash
export ENCRYPTION_KEY=your_64_character_hex_key
export JWT_SECRET=your_jwt_secret
export DATABASE_URL=postgresql://user:password@host:5432/database

docker compose up -d --build
```

The Docker setup serves the built client and API together. See `docker-compose.yml` and `Dockerfile`.

## Project Structure

```text
AutoReview/
  client/                 React/Vite frontend
    src/
      components/         Shared UI and layout
      pages/              Dashboard, review detail, settings, users, analytics
      services/           API client wrapper
      store/              Redux slices
      types.ts            Shared frontend types
  server/                 Express API
    src/
      db/                 Schema and query helpers
      middleware/         Auth, logging, error handling
      routes/             API routers
      services/           Bitbucket, review engine, storage, email, providers
      __tests__/          Vitest tests
  supabase/               Supabase-related project files
  Dockerfile
  docker-compose.yml
```

## Operational Notes

- Existing reviews created before `ai_response` was added will not have raw AI response data.
- Re-review creates a new review row and links it to history instead of overwriting previous results.
- Shared review links intentionally do not expose raw AI responses or admin-only metadata.
- The server applies migrations during startup through `ensureSchema`.
- If local login fails after changing `NODE_ENV`, clear site data for `localhost` and log in again.

## License

To be determined.
