# AutoReview — Development Progress

## Project Setup

- [x] Create project directory structure (server/, client/)
- [x] Server: package.json, tsconfig.json, Express entry point
- [x] Client: package.json, tsconfig.json, Vite config, Tailwind config, shadcn/ui config
- [x] Docker Compose + Dockerfile + litellm-config.yaml
- [x] .gitignore + .env.example
- [x] Install dependencies (server + client)
- [x] Both projects type-check clean (`tsc --noEmit` passes)

---

## Server — Database

- [x] SQLite setup via sql.js (WASM-based, no native build issues)
- [x] DB schema: `credentials`, `repositories`, `reviews`, `findings`, `prompt_templates`
- [x] DB indexes (reviews by repo+status, findings by review, templates by strictness)
- [x] Default prompt template seeded on first run
- [x] Async query helper module (`run`, `all`, `get`)
- [x] DB auto-persists to disk on writes

---

## Server — Routes

- [x] `GET /api/health` — health check
- [x] `GET/POST /api/reviews` — list + manual trigger (with dedup + AI analysis)
- [x] `GET /api/reviews/:id` — review detail with findings
- [x] Full CRUD `/api/repositories`
- [x] `GET/PUT /api/settings/llm`, `/api/settings/smtp` — per-repo config
- [x] `GET/POST/DELETE /api/credentials` — encrypted credential management
- [x] Full CRUD `/api/settings/prompt-template` + test endpoint

---

## Server — Services

- [x] `storage-service` — review/finding persistence with dedup
- [x] `credential-service` — encrypted create/delete/read
- [x] `encryption-service` — AES-256-GCM encrypt/decrypt
- [x] `repository-service` — repo config access
- [x] `bitbucket-client` — diff/commit fetch, PR comment posting, PR lookup, retry with backoff
- [x] `manual-review-service` — full orchestration: dedup → Bitbucket → LLM → store → notify
- [x] `automatic-review-service` — polling loop with per-repo config
- [x] `review-engine` — LiteLLM integration, prompt substitution, diff truncation
- [x] `finding-classifier` — risk level grouping
- [x] `email-draft-service` — email generation + SMTP sending

---

## Server — Middleware

- [x] Request logger (method/path/status/duration)
- [x] Global error handler (structured JSON)
- [x] Basic auth (configurable via AUTH_USER/AUTH_PASS, skips if empty)
- [x] Static file serving (React build)
- [x] Audit logging for credential changes

---

## Server — Error Handling

- [x] Bitbucket API: exponential backoff (3 retries, respects Retry-After)
- [x] Bitbucket API: credential expiry detection (401/403)
- [x] Bitbucket API: rate limit handling (429)
- [x] LiteLLM: retry once on server errors
- [x] Large diffs: truncate at 100K chars, flag as incomplete
- [x] Expired credentials: alert to logs, mark review failed

---

## Client — Setup & Routing

- [x] Vite + React + TypeScript + Tailwind
- [x] 18 shadcn/ui components installed
- [x] `BrowserRouter` with 5 routes
- [x] Layout: sidebar + Sheet (mobile) + dark mode toggle
- [x] Toaster in App.tsx
- [x] API service + Redux store (7 slices)

---

## Client — Pages

- [x] Dashboard — summary cards, repo/status filters, review list, skeletons, empty state
- [x] ManualReview — form, toast notifications, result badge + detail link
- [x] ReviewDetail — metadata, findings by risk, email draft preview (collapsible + copy)
- [x] Settings — 5 tabs: Credentials, Repositories, Review Config, LLM, Notifications
- [x] PromptTemplate — editor, save, test, preview, variables, history
- [x] Dark mode toggle (persisted in localStorage)

---

## DevOps & Deployment

- [x] Docker Compose (app + litellm with health checks)
- [x] Multi-stage Dockerfile
- [x] litellm-config.yaml (GPT-4, GPT-4o, Claude)
- [x] .env.example with all config vars
- [x] Volume mounts for data + logs

---

## Security

- [x] AES-256-GCM credential encryption
- [x] Encryption key from env var
- [x] Masked values in API responses
- [x] Audit log for credential changes
- [x] Basic auth (optional, env-configured)
- [x] SMTP password encrypted at rest (settings route encrypts, email-draft-service decrypts)

---

## Post-Audit Fixes

- [x] Fix 1: Decrypt SMTP password in email-draft-service (was passing encrypted blob to nodemailer)
- [x] Fix 2: Failed review dedup — delete old failed review before retrying (was hitting unique constraint)
- [x] Fix 3: PR update trigger — automatic-review-service now polls open PRs when `trigger_on_pr_update` is set
- [x] Fix 4: Server-side file exclusion filtering — review-engine filters findings matching `excluded_paths` + default patterns (node_modules, vendor, dist, etc.)
- [x] Fix 5: File logging — logger writes to both stdout/stderr and `LOG_DIR/autoreview.log`; all `console.*` calls replaced
- [x] All `tsc --noEmit` checks pass clean (server + client)

---

## Testing

- [ ] Server: unit tests for services
- [ ] Server: integration tests for routes
- [ ] Client: component tests
- [ ] Client: Redux slice tests
- [ ] End-to-end test: manual review flow
