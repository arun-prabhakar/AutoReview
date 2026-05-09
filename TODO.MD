# AutoReview — Findings & Remediation Tracker

Generated from application review. Checked items are completed.

---

## 🔴 CRITICAL

- [x] **#1 — Unreachable Route `GET /api/reviews/open-prs/:repositoryId`**
  `server/src/routes/reviews.ts:48,103` — `GET /:id` intercepts `GET /open-prs/...`. Fix: move open-prs handler before `/:id`.

- [x] **#2 — TOCTOU Race Condition in Review Dedup**
  `server/src/services/manual-review-service.ts:28-55` — No DB-level UNIQUE constraint on `(repository_id, commit_hash)`. Two concurrent requests create duplicate reviews.

- [x] **#3 — Synchronous File I/O on Every DB Write**
  `server/src/db/queries.ts:11` → `server/src/db/index.ts:45` — `fs.writeFileSync` in `persistDb()` blocks the event loop after every write.

- [x] **#4 — No Graceful Shutdown — Data Loss on SIGTERM**
  `server/src/index.ts:63-79` — HTTP server not stored for `close()`, no final `persistDb()` call.

- [ ] **#5 — Dual Schema Migration Paths Conflict**
  `server/src/db/schema.ts:6-13` — `init.sql` path skips versioned migrations entirely.

- [ ] **#6 — Default Admin Credentials `admin:admin` in Dev Mode**
  `server/src/db/schema.ts:167-175` — Trivially guessable admin account auto-created in non-production.

- [ ] **#7 — Hardcoded Encryption Key in `.env.example`**
  `.env.example:7` — Real-looking key committed to source control.

- [x] **#8 — Silent Error Swallowing — Reviews Appear "Clean" on Parse Failure**
  `server/src/services/review-engine.ts:191-193` — `parseFindings()` returns `[]` on malformed LLM output with no logging.

---

## 🟠 HIGH

- [ ] **#9 — Wildcard CORS + No Security Headers**
  `server/src/index.ts:35` — `app.use(cors())` + no `helmet`.

- [x] **#10 — Hardcoded JWT Dev Secret Fallback**
  `server/src/config.ts:18` — Falls back to `"autoreview-dev-secret"` when `JWT_SECRET` unset.

- [x] **#11 — No Foreign Key Constraints**
  `server/src/db/schema.ts` — No `REFERENCES` or `FOREIGN KEY` clauses. Orphaned records on deletion.

- [x] **#12 — Delete Without Dependency Checks**
  `server/src/services/provider-service.ts:60-63`, `credential-service.ts:27-29` — Deleting provider/credential leaves dangling references in repositories.

- [x] **#13 — JWT in localStorage (XSS Vector)**
  `client/src/services/api.ts:1,10`, `client/src/store/authSlice.ts:24-25` — Tokens accessible to any JS including XSS.

- [x] **#14 — Client-Side Role Spoofing**
  `client/src/store/authSlice.ts:25-26` — User object from localStorage trusted without server validation.

- [x] **#15 — Prepared Statement Memory Leak on Error**
  `server/src/db/queries.ts:16-29` — `stmt.free()` never called if `stmt.step()` throws.

- [ ] **#16 — LLM Prompt Injection via Template Enhancement**
  `server/src/routes/prompt-templates.ts:91-147` — User-supplied content passed to LLM without sanitization.

- [x] **#17 — Route-Level Error Handling is Inconsistent**
  `server/src/routes/repositories.ts`, `settings.ts` — No try/catch. Unhandled rejections crash the process.

---

## 🟡 MEDIUM

- [x] **#18 — Synchronous bcrypt Blocks Event Loop**
  `server/src/routes/auth.ts` — All `compareSync`/`hashSync` replaced with async `compare`/`hash`.

- [x] **#19 — Inconsistent Password Policy**
  `server/src/routes/auth.ts` — Single `MIN_PASSWORD_LENGTH = 8` constant enforced everywhere.

- [x] **#20 — No Token Revocation**
  `server/src/routes/auth.ts` — `token_version` column checked in `/me`; incremented on password change/delete.

- [x] **#21 — Static Salt in Key Derivation**
  `server/src/services/encryption-service.ts` — Salt now configurable via `ENCRYPTION_SALT` env var.

- [x] **#22 — Massive Code Duplication — `runManualReview` / `runPrReview`**
  `server/src/services/manual-review-service.ts` — Extracted shared `executeReview()`, `resolveCredentials()`, etc.

- [x] **#23 — Settings.tsx is a 711-Line Monolith**
  `client/src/pages/Settings.tsx` — Decomposed into 7 tab components under `client/src/components/settings/`.

- [x] **#24 — No Code Splitting / Lazy Loading**
  `client/src/App.tsx` — `React.lazy()` for all pages; `framer-motion` removed, using `motion/react`.

- [x] **#25 — Auto-Review Silently Swallows Errors**
  `server/src/services/automatic-review-service.ts` — `logger.error()` added in catch block.

- [x] **#26 — OpenAI Client Created Per-Request**
  `server/src/services/review-engine.ts` — Client cache (`Map<string, OpenAI>` with LRU eviction).

- [x] **#27 — SMTP Transport Created Per-Email**
  `server/src/services/email-draft-service.ts` — Transport cache (`Map<string, Transporter>` with LRU eviction).

- [x] **#28 — Hardcoded Model Name in Template Enhancement**
  `server/src/routes/prompt-templates.ts` — Model now configurable via `req.body.model`.

- [x] **#29 — Auto-Review Polling Interval Fixed at Startup**
  `server/src/services/automatic-review-service.ts` — `reschedulePolling()` recalculates interval dynamically.

- [x] **#30 — Synchronous Logger on Every Request**
  `server/src/middleware/index.ts` — `fs.promises.appendFile` replaces `appendFileSync`.

---

## 🟢 LOW

- [x] **#31 — Dead Code — `finding-classifier.ts`**
  Deleted `server/src/services/finding-classifier.ts` and its test.

- [x] **#32 — Dead Code — `client/src/lib/animations.tsx`**
  Deleted — no imports found across the codebase.

- [x] **#33 — Dead Redux State — `uiSlice`**
  Deleted `client/src/store/uiSlice.ts`; removed from store config.

- [x] **#34 — Dead Redux State — `promptTemplateSlice.versions` and `.strictnessOverrides`**
  Removed unused `versions` and `strictnessOverrides` from initial state.

- [x] **#35 — Duplicate `MAX_DIFF_SIZE` Constant**
  Extracted to module-level constant in `bitbucket-client.ts`.

- [x] **#36 — Root-Level Patch Scripts**
  Deleted all 10 `patch_*.js` files from project root.

- [x] **#37 — No 404 Catch-All Route**
  Added `NotFound` component and `<Route path="*" />` catch-all in `App.tsx`.

- [x] **#38 — Accessibility Gaps**
  Added `aria-label` to all 9 icon-only buttons across Settings, Users, and Layout.

---

## 🔵 UI IMPROVEMENTS

- [x] **UI-1 — Animation Bloat Removed from All Pages**
  Stripped BlurFade, BorderBeam, NumberTicker, ShimmerButton from Dashboard, ReviewDetail, ManualReview, Settings tabs, Users, Login, Layout. Kept `motion` only for Layout sidebar collapse and PromptTemplateTab AnimatePresence.

- [x] **UI-2 — Unused Decorative Components Deleted**
  Removed `animated-list.tsx`, `animated-shiny-text.tsx`, `sparkles-text.tsx`, `shine-border.tsx`, `blur-fade.tsx`, `number-ticker.tsx`, `border-beam.tsx`, `shimmer-button.tsx`.

- [x] **UI-3 — Login Default Credentials Conditional**
  Default username/password shown only in `import.meta.env.DEV` mode.

- [x] **UI-4 — Password Dialog Extracted to Reusable Component**
  Created `ChangePasswordForm.tsx` shared by forced + voluntary password change dialogs in `Layout.tsx`.

- [x] **UI-5 — Empty States with CTAs**
  Dashboard, ProvidersTab, CredentialsTab, RepositoriesTab all show contextual empty state with action button when no data.

- [x] **UI-6 — Settings Loading States**
  All 7 settings tab components show per-item loading spinners, disable inputs during save/delete operations.

- [x] **UI-7 — Dashboard Pagination**
  Backend returns `{ reviews, total, limit, offset }`. Client shows page controls with prev/next + page number buttons. Filters reset to page 0.

- [x] **UI-8 — Type Safety Fixes**
  Removed `Record<string, unknown>` and `as { id: string; name: string }[]` casts in Dashboard.tsx and ManualReview.tsx. Proper `Repository` and `Review` types used instead.
