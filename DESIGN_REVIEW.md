# AutoReview — UI/UX Design Review

> **Date**: May 2026
> **Scope**: All client pages, components, design tokens, and interaction patterns
> **Stack**: React 19, Tailwind CSS 3.4, Radix UI, Framer Motion

---

## Overall Assessment

The design system is **well-defined and intentional**. The monochromatic architectural aesthetic (documented in `DESIGN.MD`) is consistently applied. The CSS custom properties, component variants, and Tailwind usage show strong design discipline. This is not a "random Tailwind project" — it has a clear design language.

That said, there are deviations from the `DESIGN.MD` spec, inconsistencies across pages, and several UX improvements that would elevate the product.

---

## 1. Design Token Drift — DESIGN.MD vs Implementation

The `DESIGN.MD` specifies precise values that don't always match the CSS tokens:

| Token | DESIGN.MD Spec | Implementation | Gap |
|---|---|---|---|
| Card radius | `14px` | `--radius: 0.625rem` (10px) in `index.css` | **4px off** |
| Input radius | `10px` | `rounded-md` (6px) in practice | **4px off** |
| Button radius | `10px` | `rounded-md` (6px) in `button.tsx` | **4px off** |
| Badge radius | `26px` | `rounded-full` (9999px) in `badge.tsx` | Pill instead of 26px |
| Card padding | `16px` | `p-6` (24px) in `CardHeader` | **8px off** |
| Section gap | `83px` | `space-y-4` / `space-y-6` (16–24px) | **Huge gap** |

**Suggestion**: Either update `DESIGN.MD` to reflect current implementation, or align the code with the spec. Having them diverge creates confusion for future contributors.

---

## 2. Typography

### What's Working

- `tracking-tight` on headings — consistent
- `font-mono` on commit hashes, identifiers — appropriate
- Custom utilities (`negative-tracking-display`, `negative-tracking-headline`) — good for brand

### Issues

#### A. `text-[10px]` magic numbers

`Dashboard.tsx:176` — stat labels use `text-[10px]` instead of a design token. This is below the type scale minimum (12px caption) defined in `DESIGN.MD`.

#### B. Inconsistent label styling

Three different label styles across the app:

| Page | Label Style |
|---|---|
| ManualReview | `text-xs font-bold uppercase tracking-wider text-muted-foreground` |
| Login | `text-sm font-medium` (via `<Label>` component) |
| Settings | `text-sm font-medium` (via `<Label>` component) |
| Dashboard | None (implicit from `<Select>`) |

**Suggestion**: Pick one pattern and apply everywhere.

#### C. Heading hierarchy is flat

Every page uses `text-2xl font-bold tracking-tight` for the page title. There's no visual distinction between page titles (`h2`) and card titles (`text-lg font-semibold`), or section headings. `DESIGN.MD` defines a full type scale (caption → body → heading → display) but only heading-size is used.

---

## 3. Color Usage

### What's Working

- Monochromatic palette is clean and intentional
- Risk color system (red/amber/muted) is clear and consistent
- `--success`, `--warning`, `--destructive` semantic tokens used correctly
- Dark mode colors are well-considered (not just inverted)

### Issues

#### A. Success card border is misleading

`ManualReview.tsx:279` — `border-success/30` on the result card. A green border implies success, but the review may have found Must Fix issues. The border color should reflect the worst finding severity, not the fact that the AI completed.

#### B. Inconsistent status badge coloring

`Dashboard.tsx:114-121` — Status badges use inline `bg-success/10 text-success border-success/20` classes. But the `<Badge>` component already has `success`, `warning`, `critical` variants. The inline approach bypasses the component's variant system:

```tsx
// Current (Dashboard.tsx)
<Badge variant="outline" className="bg-success/10 text-success border-success/20">

// Should be
<Badge variant="success">
```

#### C. `bg-secondary/50` used inconsistently

Dashboard stat cards use `bg-secondary/50` with inline classes. The filter bar also uses `bg-secondary/50`. But other pages use `bg-secondary` or `bg-card`. Three slightly different surface treatments for similar containers.

---

## 4. Spacing & Layout

### What's Working

- Sidebar with collapse animation is smooth
- Main content `p-6 md:p-8 lg:p-12` scales nicely
- Card internal spacing is generally consistent

### Issues

#### A. Page spacing inconsistency

| Page | Section Gap |
|---|---|
| Dashboard | `space-y-4` (16px) |
| ReviewDetail | `space-y-6` (24px) |
| Analytics | `space-y-6` (24px) |
| Settings | `space-y-6` (24px) |
| ManualReview | `space-y-6` (24px) |

Dashboard uses tighter spacing than every other page. Should be consistent.

#### B. Stat cards grid behaves differently per page

- Dashboard: `grid-cols-2 md:grid-cols-4` — 4 stat cards
- ReviewDetail: `grid-cols-2 md:grid-cols-4` — same 4-card layout
- Analytics: `grid-cols-1 md:grid-cols-3` — 3-card layout with different sizing

Analytics cards use `pt-6 pb-5` while Dashboard uses `py-3 px-4`. Completely different density for the same type of component.

#### C. Max-width inconsistency

| Page | Max Width |
|---|---|
| ManualReview | `max-w-xl` (576px) |
| ReviewDetail | `max-w-5xl` (1024px) |
| Analytics | `max-w-6xl` (1152px) |
| Dashboard | No max-width (full width) |
| Settings | No max-width (full width) |

Form pages (ManualReview) are correctly narrow. But Dashboard and Settings being full-width on wide monitors creates very long line lengths for table content.

---

## 5. Responsive Design

### What's Working

- Sidebar collapses on mobile (`<md`), replaced with Sheet
- `Skip to content` link for screen readers
- Filter bar wraps properly (`flex-wrap`)

### Issues

#### A. Settings tabs overflow on mobile

`Settings.tsx:52` — `TabsList` with `flex-wrap h-auto gap-1`. Seven tabs with icons will wrap into 2–3 rows on mobile, taking significant vertical space. A Sheet-based mobile navigation or horizontal scroll would be better.

#### B. Dashboard table on mobile

The 8-column table has no mobile card fallback. At `max-w-36` per column, the table becomes unusable below ~500px. The `overflow-x-auto` allows horizontal scroll, but this is not ideal for a primary view.

#### C. ReviewDetail finding cards lack mobile optimization

`ReviewDetail.tsx:480-501` — Finding cards have `justify-between` for summary + badges. On mobile, the badges wrap awkwardly. Should stack vertically on small screens.

#### D. Mobile header has no page title

`Layout.tsx:215-262` — The mobile header shows only the logo and action buttons. No current page title or breadcrumb. Users lose context on mobile.

---

## 6. Component Design

### Issues

#### A. Inline styling instead of component variants

Many pages duplicate Badge/Button/Card styling via inline `className` instead of using or creating proper variants. Examples:

- Dashboard status badges (custom `bg-success/10` instead of `variant="success"`)
- ManualReview tab switcher (custom buttons instead of Tabs component)
- ReviewDetail diff viewer (could be a reusable `DiffViewer` component)

#### B. Card is the only container

Every section is a `<Card>`. There's no visual distinction between:

- Data cards (stats)
- Container cards (table wrapper)
- Form cards (settings)
- Collapsible cards (email draft, diff)

The design would benefit from visual differentiation — e.g., form containers with a subtle left border, or data cards with colored top accents.

#### C. Missing Skeleton consistency

| Page | Skeleton Quality |
|---|---|
| Dashboard | 5-row skeleton with realistic proportions ✅ |
| Analytics | 4 generic `h-64` rectangles |
| ReviewDetail | 2 generic `h-32` + `h-64` rectangles |

Analytics and ReviewDetail skeletons don't match the actual layout, causing layout shift.

---

## 7. Interaction Patterns

### What's Working

- Dialog-based destructive actions (delete review) ✅
- Toast notifications with variant support ✅
- Forced password change blocks interaction ✅
- Hover prefetch on nav links ✅
- Loading overlay on Dashboard table during filter changes ✅
- Elapsed timer during review submission ✅

### Issues

#### A. No optimistic updates

Dashboard delete removes from UI only after server confirms. The 1–2 second delay feels sluggish. Optimistic removal with rollback on failure would feel instant.

#### B. No keyboard shortcut for common actions

No `Cmd+K` for search, no `Cmd+N` for new review. Power users would benefit from at least basic shortcuts.

#### C. No "Copy commit hash" interaction

In Dashboard and ReviewDetail, commit hashes are displayed but not copyable. A click-to-copy on the hash would be useful (similar to how the share link works).

#### D. Filter persistence

Dashboard filters reset on page navigation. No URL-based filter state, so sharing a filtered view is impossible.

---

## 8. Dark Mode

### What's Working

- Proper CSS custom property pairs (light + dark) ✅
- `prefers-reduced-motion` respected ✅
- `prefers-color-scheme: dark` auto-detection ✅
- Animated theme toggler is polished ✅

### Issues

#### A. Diff viewer colors may not work in dark mode

`ReviewDetail.tsx` — The diff viewer uses hardcoded Tailwind colors:

```
bg-emerald-500/10 text-emerald-600 dark:text-emerald-400
bg-red-500/10 text-red-600 dark:text-red-400
bg-blue-500/10 text-blue-600 dark:text-blue-400
```

This works but bypasses the design token system. Should use semantic tokens if possible.

#### B. Recharts tooltip hardcoded colors

`Analytics.tsx:118` — Tooltip uses `hsl(var(--card))` which is good, but chart bar colors use a hardcoded `COLORS` array with some non-token colors (`hsl(220, 70%, 50%)`, `hsl(160, 60%, 45%)`). These should reference design tokens.

---

## 9. Accessibility

### What's Working

- Skip-to-content link ✅
- `aria-label` on icon buttons ✅
- `role="button"` and `onKeyDown` on clickable table rows ✅
- Dialog `aria-describedby` via `DialogDescription` ✅
- `aria-expanded` on collapsibles ✅
- `aria-invalid` on login form inputs ✅

### Issues

#### A. Focus trap gaps

Forced password change dialog prevents outside interaction (`onInteractOutside`, `onEscapeKeyDown`), but the delete/re-review dialogs don't trap focus. Tab can escape to background content.

#### B. No `aria-live` regions

Toast notifications appear visually but have no `aria-live="polite"` for screen reader announcement. The Toaster component should use Radix's built-in announce capability.

#### C. Status badges lack `aria-label`

Dashboard status badges say "Completed" visually but provide no additional context. A screen reader navigating the table would benefit from `aria-label="Status: Completed"`.

---

## 10. Specific Page Suggestions

### Dashboard

- **Empty state for filters**: When filters produce zero results, show "No reviews match these filters" with a "Clear filters" CTA (currently just the generic empty state)
- **Stat cards**: Add hover effect to make them feel interactive (e.g., click to filter by that status)

### ManualReview

- **Result card**: The green `border-success/30` should be conditional on findings severity
- **PR metadata**: Show branch info for commit reviews too (currently only shown for PR reviews)

### ReviewDetail

- **Finding cards**: Group findings by file path instead of (or in addition to) risk level. Developers think in files, not severity buckets.
- **Email draft**: The email draft is admin-only. Consider making it visible to all users since it's read-only content.
- **Diff viewer**: The diff has no line numbers. For code review, line numbers are essential for cross-referencing with findings.

### Settings

- **Tab overflow**: On mobile, use a horizontal scrollable tab bar or a dropdown selector instead of wrapping
- **Form validation**: Settings forms validate only on submit. Inline validation (e.g., red border on empty required fields) would be more helpful.

### Analytics

- **Empty state**: Charts show "No data yet" as centered text. A more descriptive empty state with a CTA ("Run your first review to see analytics") would be more engaging.
- **Total Findings card**: Shows `tokens / 1000` with label "Total Findings" — this looks like a bug. Should show actual finding count, not token-derived value.

---

## Priority Summary

| Priority | Suggestion | Effort |
|---|---|---|
| 🟠 High | Fix Analytics "Total Findings" showing token-derived value (likely a bug) | 5 min |
| 🟠 High | Align DESIGN.MD tokens with actual CSS values | 1 hr |
| 🟠 High | Standardize label styling across pages (pick one pattern) | 2 hr |
| 🟡 Medium | Unify page spacing (`space-y-6` everywhere) | 15 min |
| 🟡 Medium | Unify stat card density (Dashboard vs Analytics) | 30 min |
| 🟡 Medium | Use Badge variants instead of inline status colors | 1 hr |
| 🟡 Medium | Add Settings mobile tab navigation | 2 hr |
| 🟡 Medium | Add line numbers to diff viewer | 1 hr |
| 🟢 Low | Add `aria-live` to Toast component | 30 min |
| 🟢 Low | Add click-to-copy on commit hashes | 30 min |
| 🟢 Low | Add Dashboard filter URL persistence | 2 hr |
| 🟢 Low | Add keyboard shortcuts (`Cmd+K`, `Cmd+N`) | 3 hr |
