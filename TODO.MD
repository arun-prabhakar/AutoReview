# AutoReview — Findings & Remediation Tracker

Verified against codebase. Items with `[x]` are confirmed fixed. Items with `[ ]` are pending.

---

## 🔴 CRITICAL — Backend

- [ ] **#1 — Unreachable Route `GET /api/reviews/open-prs/:repositoryId`**
  `server/src/routes/reviews.ts` — `/:id` (line 113) is registered **before** `open-prs/:repositoryId` (line 140). Express matches `/:id` first, so open-prs never fires.
  **Fix**: Move `open-prs` handler before `/:id`.

- [ ] **#2 — TOCTOU Race Condition in Review Dedup**
  `server/src/db/schema.ts` — No `UNIQUE` constraint on `(repository_id, commit_hash)`. Two concurrent review requests for the same commit create duplicate rows. The `ON CONFLICT DO NOTHING` in `createReview` is a no-op without a unique index.
  **Fix**: Add `CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_repo_commit ON reviews(repository_id, commit_hash)`.

- [x] **#3 — Synchronous File I/O on Every DB Write**
  ~~`server/src/db/queries.ts:11` — `fs.writeFileSync`~~ — Migrated to PostgreSQL. No `writeFileSync`/`appendFileSync` in codebase. Confirmed clean.

- [x] **#4 — No Graceful Shutdown — Data Loss on SIGTERM**
  `server/src/index.ts:137-146` — `shutdown()` function calls `server.close()` then `closePool()`. SIGTERM + SIGINT handlers registered. 5-second force-exit timeout. Confirmed fixed.

- [ ] **#5 — Dual Schema Migration Paths Conflict**
  `server/src/db/schema.ts:6-155` — `ensureSchema()` runs both `CREATE TABLE IF NOT EXISTS` (full schema) AND `ALTER TABLE ADD COLUMN IF NOT EXISTS` (incremental migrations) every boot. If a column is added to the `CREATE TABLE` block but the corresponding `ALTER TABLE` is removed, existing databases that already have the table will never get the new column. No `schema_migrations` tracking table.
  **Fix**: Add a `schema_migrations` table. Track applied migrations. Run only pending ones.

- [ ] **#6 — Default Admin Credentials `admin:admin` in Dev Mode**
  `server/src/db/schema.ts:225-231` — Auto-creates `admin:admin` when `NODE_ENV !== "production"`. Acceptable for dev convenience, but should be documented prominently and ideally forced to change on first login (it does set `must_change_password` implicitly via the default, but the INSERT doesn't set it).
  **Note**: Skipped per user request.

- [ ] **#7 — Hardcoded Encryption Key in `.env.example`**
  `.env.example:7` — Contains `ENCRYPTION_KEY=61a1d5ef...` which looks like a real key. Also references `DB_PATH=./data/autoreview.db` which is stale (project uses PostgreSQL).
  **Note**: Skipped per user request.

- [x] **#8 — Silent Error Swallowing — Reviews Appear "Clean" on Parse Failure**
  `server/src/services/review-engine.ts` — `parseFindings()` now logs malformed output. Confirmed via previous commits.

---

## 🟠 HIGH — Backend

- [ ] **#9 — Wildcard CORS + No Security Headers**
  `server/src/index.ts:35` — `app.use(cors())` allows all origins. No `helmet` for security headers (CSP, X-Frame-Options, etc.).
  **Fix**: Restrict CORS to frontend origin. Add `helmet()`.

- [x] **#10 — Hardcoded JWT Dev Secret Fallback**
  `server/src/config.ts` — Fixed in prior commit.

- [x] **#11 — No Foreign Key Constraints**
  `server/src/db/schema.ts` — FK constraints now present: `reviews.repository_id`, `findings.review_id`, `notifications.user_id`, `share_tokens.review_id`. Confirmed.

- [x] **#12 — Delete Without Dependency Checks**
  Provider/credential deletion now checks for dependent repositories. Confirmed.

- [x] **#13 — JWT in localStorage (XSS Vector)**
  Now uses httpOnly cookie (`res.cookie("token", ...)`) as primary auth. Bearer token also supported for API clients. Confirmed.

- [x] **#14 — Client-Side Role Spoofing**
  `validateSession` thunk re-fetches from `/api/auth/me` on app load. localStorage data not trusted without server validation. Confirmed.

- [x] **#15 — Prepared Statement Memory Leak on Error**
  Migrated to PostgreSQL pool. `stmt.free()` is a SQLite concern — no longer applicable.

- [ ] **#16 — LLM Prompt Injection via Template Enhancement**
  `server/src/routes/prompt-templates.ts:91-147` — User-supplied content passed to LLM for prompt enhancement without sanitization. An attacker could inject instructions that corrupt the review prompt.
  **Fix**: Sanitize user input before including in LLM prompts. Strip instruction-like patterns.

- [x] **#17 — Route-Level Error Handling is Inconsistent**
  Routes now use `next()` error handling. Confirmed.

---

## 🟡 MEDIUM — Already Fixed

- [x] **#18–#30** — All confirmed fixed in prior work:
  - Async bcrypt (#18), consistent password policy (#19), token revocation (#20)
  - Configurable encryption salt (#21), code dedup (#22), Settings decomposition (#23)
  - React.lazy code splitting (#24), auto-review error logging (#25)
  - OpenAI client cache (#26), SMTP transport cache (#27), configurable model (#28)
  - Dynamic polling interval (#29), async logger (#30)

---

## 🟢 LOW — Already Fixed

- [x] **#31–#38** — All confirmed fixed:
  - Dead code removed (#31–#34), duplicate constant extracted (#35)
  - Patch scripts deleted (#36), 404 catch-all route (#37), aria-labels added (#38)

---

## 🔵 UI — Already Implemented

- [x] **UI-1 through UI-8** — All confirmed implemented:
  - Animation bloat removed, decorative components deleted
  - Login defaults conditional, password dialog reusable
  - Empty states with CTAs, settings loading states
  - Dashboard pagination, type safety fixes

---

## 🎨 DESIGN REVIEW — From DESIGN_REVIEW.md

Verified against current codebase (Dashboard = reference standard).

### Section 1: Design Token Drift

- [ ] **DR-1.1 — DESIGN.MD vs CSS tokens mismatch**
  `index.css:38` — `--radius: 0.625rem` (10px) vs DESIGN.MD spec of 14px card radius, 10px input/button radius. DESIGN.MD should be updated to match implementation, or vice versa.
  **Effort**: 1 hr to audit and align

### Section 2: Typography

- [ ] **DR-2.1 — `text-[10px]` magic number in Dashboard stat labels**
  `Dashboard.tsx:207` — Uses `text-[10px]` which is below the type scale minimum (12px). Should use `text-xs` (12px) or a design token.
  **Effort**: 5 min

- [x] **DR-2.2 — Inconsistent label styling**
  Standardized: ManualReview, Analytics, ReviewDetail, SharedReview all use `text-xs font-bold uppercase tracking-wider text-muted-foreground`. Login and Users use `<Label>` with `text-sm font-medium` which is appropriate for form contexts. Two valid patterns co-existing intentionally.

- [ ] **DR-2.3 — Heading hierarchy is flat**
  Every page title uses `text-2xl font-bold tracking-tight`. No visual distinction between page title and card title. DESIGN.MD defines a full type scale but only one size is used.
  **Effort**: Low priority — current flat hierarchy works for the minimal design.

### Section 3: Color Usage

- [ ] **DR-3.1 — Success card border on ManualReview result is misleading**
  `ManualReview.tsx:279` — `border-success/30` always applied regardless of finding severity. Should reflect worst finding: `border-destructive/30` for must-fix, `border-warning/30` for should-fix, `border-success/30` for clean.
  **Effort**: 15 min

- [x] **DR-3.2 — Inconsistent status badge coloring**
  Dashboard no longer uses inline Badge coloring — it uses `statusIcon()` with SVG icons (XCircle, AlertTriangle, CheckCircle2) colored by severity. This is better than Badge variants. Confirmed resolved.

- [ ] **DR-3.3 — `bg-secondary/50` used inconsistently**
  Dashboard stat cards and filter bar use `bg-secondary/50`. Analytics uses `bg-card`. Other pages use `bg-secondary`. Three slightly different surface treatments.
  **Effort**: 30 min to standardize

### Section 4: Spacing & Layout

- [ ] **DR-4.1 — Dashboard uses `space-y-4`, all other pages use `space-y-6`**
  `Dashboard.tsx:188` — `space-y-4` (16px). All other pages use `space-y-6` (24px). Should be unified.
  **Effort**: 5 min — change Dashboard to `space-y-6`

- [ ] **DR-4.2 — Stat card density differs between Dashboard and Analytics**
  Dashboard cards: `py-3 px-4` (compact). Analytics cards: `pt-6 pb-5` (spacious). Same component type, different density.
  **Effort**: 30 min to standardize

- [ ] **DR-4.3 — Max-width inconsistency across pages**
  | Page | Max Width |
  |---|---|
  | Dashboard | None (full width) |
  | ManualReview | `max-w-xl` (576px) |
  | ReviewDetail | `max-w-5xl` (1024px) |
  | Analytics | `max-w-6xl` (1152px) |
  | Settings | None (full width) |
  | Users | None (full width) |

  Form pages are correctly narrow. Dashboard/Settings/Users being full-width is acceptable for data-heavy views.
  **Effort**: Low priority — current widths work for content type.

### Section 5: Responsive Design

- [ ] **DR-5.1 — Settings tabs overflow on mobile**
  `Settings.tsx:52` — `TabsList` with `flex-wrap h-auto gap-1`. Seven tabs with icons wrap into 2-3 rows on mobile.
  **Effort**: 2 hr — add horizontal scroll or Sheet-based mobile nav

- [ ] **DR-5.2 — Dashboard table has no mobile card fallback**
  8-column table with `overflow-x-auto`. Works but requires horizontal scroll on small screens.
  **Effort**: Low priority — horizontal scroll is acceptable for data tables

- [ ] **DR-5.3 — ReviewDetail finding cards lack mobile optimization**
  Finding summary + badges use `justify-between` which wraps awkwardly on mobile.
  **Effort**: 30 min — add `flex-col sm:flex-row` responsive stacking

- [ ] **DR-5.4 — Mobile header has no page title**
  `Layout.tsx:215-262` — Mobile header shows logo + action buttons only. No current page title or breadcrumb.
  **Effort**: 30 min

### Section 6: Component Design (Skipped per user request)

### Section 7: Interaction Patterns (Skipped per user request)

### Section 8: Dark Mode

- [ ] **DR-8.1 — Diff viewer uses hardcoded Tailwind colors**
  `ReviewDetail.tsx:308-312` — Uses `bg-emerald-500/10 text-emerald-600 dark:text-emerald-400` and `bg-red-500/10 text-red-600 dark:text-red-400`. Bypasses design token system.
  **Effort**: 30 min — create `--diff-add`, `--diff-remove`, `--diff-hunk` semantic tokens

### Section 9: Accessibility

- [ ] **DR-9.1 — No `aria-live` regions in toast notifications**
  `toaster.tsx` / `toast.tsx` — No `aria-live="polite"` attribute. Screen readers don't announce toasts.
  **Effort**: 15 min — add `aria-live="polite"` to the Toaster viewport

- [ ] **DR-9.2 — Status icons lack `aria-label` for context**
  Dashboard status icons use `<span title="...">` but no `aria-label`. Screen readers get no context.
  **Effort**: 15 min — add `aria-label` to each status icon span

### Section 10: Specific Page Suggestions

- [ ] **DR-10.1 — ManualReview result card border should reflect severity** (same as DR-3.1)

- [ ] **DR-10.2 — Diff viewer has no line numbers**
  `ReviewDetail.tsx:301-318` — Diff lines are rendered without line numbers. Essential for cross-referencing findings.
  **Effort**: 1 hr

---

## 📊 SUMMARY

| Category | Total | Fixed | Pending |
|---|---|---|---|
| 🔴 CRITICAL | 8 | 3 | 5 (3 actionable, 2 skipped) |
| 🟠 HIGH | 9 | 7 | 2 |
| 🟡 MEDIUM | 13 | 13 | 0 |
| 🟢 LOW | 8 | 8 | 0 |
| 🔵 UI | 8 | 8 | 0 |
| 🎨 DESIGN | 16 | 2 | 14 |
| **Total** | **62** | **41** | **21** |

### Actionable Pending Items (excludes #6, #7 which are skipped):

| Priority | ID | Description | Effort |
|---|---|---|---|
| 🔴 | #1 | Move open-prs route before /:id | 1 min |
| 🔴 | #2 | Add UNIQUE index on (repository_id, commit_hash) | 1 min |
| 🔴 | #5 | Consolidate schema migration paths | 2 hr |
| 🟠 | #9 | Restrict CORS + add helmet | 30 min |
| 🟠 | #16 | Sanitize LLM prompt enhancement input | 1 hr |
| 🎨 | DR-2.1 | Replace `text-[10px]` with `text-xs` | 5 min |
| 🎨 | DR-3.1 | Conditional result card border by severity | 15 min |
| 🎨 | DR-3.3 | Standardize `bg-secondary` usage | 30 min |
| 🎨 | DR-4.1 | Unify Dashboard spacing to `space-y-6` | 5 min |
| 🎨 | DR-4.2 | Standardize stat card density | 30 min |
| 🎨 | DR-5.1 | Settings mobile tab navigation | 2 hr |
| 🎨 | DR-5.3 | ReviewDetail finding cards mobile stacking | 30 min |
| 🎨 | DR-5.4 | Mobile header page title | 30 min |
| 🎨 | DR-8.1 | Diff viewer semantic color tokens | 30 min |
| 🎨 | DR-9.1 | Toast aria-live regions | 15 min |
| 🎨 | DR-9.2 | Status icon aria-labels | 15 min |
| 🎨 | DR-10.2 | Diff viewer line numbers | 1 hr |
