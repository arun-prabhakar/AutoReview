## Overview

AutoReview adopts the **Linear marketing canvas** — a deep, dark aesthetic built on `{colors.canvas}` (#010102). This pure black with a faint blue tint serves as the foundation for a high-density, professional tool for developers. On top sits a four-step surface ladder (`{colors.surface-1}` through `{colors.surface-4}`) for cards, panels, and lifted tiles, with hairline borders running from `{colors.hairline}` (#23252a).

The single chromatic accent is **AutoReview Lavender** `{colors.primary}` (#5e6ad2) — used for the primary brand mark, focus rings, and the primary CTA button. The semantic system uses `{colors.semantic-error}` (#f87171) for critical "Must Fix" findings, `{colors.semantic-warning}` (#fbbf24) for "Should Fix Soon", and `{colors.semantic-success}` (#34d399) for completed reviews.

Display type uses **Inter** (weight 500–700) with negative letter-spacing scaling. Code snippets, file paths, and commit hashes use **JetBrains Mono** to maintain technical clarity.

The interface is designed for **high-density data review**. Findings are grouped by risk level and presented in compact, lifted panels that maximize vertical space.

**Key Characteristics:**
- **Deep Dark Canvas** — `{colors.canvas}` (#010102) anchor.
- **Lavender Brand Accent** (`{colors.primary}` #5e6ad2) — used for primary actions.
- **Surface Ladder** — Hierarchy is carried by background shifts and hairline borders, never shadows.
- **Technical Typography** — Negative-tracked Inter paired with high-legibility Mono.
- **Risk-First Hierarchy** — Critical findings use semantic red highlights to grab attention.

## Colors

### Brand & Accent
- **Lavender** ({colors.primary}): Primary CTA, brand mark, link emphasis (#5e6ad2).
- **Lavender Hover** ({colors.primary-hover}): Lighter lavender (#828fff).
- **Lavender Focus** ({colors.primary-focus}): Focus-ring tint (#5e69d1).

### Surface (Dark)
- **Canvas** ({colors.canvas}): #010102.
- **Surface 1** ({colors.surface-1}): #09090b.
- **Surface 2** ({colors.surface-2}): #18181b.
- **Hairline**: #23252a.

### Surface (Light)
- **Canvas** ({colors.canvas}): #fafafa (Warm white).
- **Surface 1** ({colors.surface-1}): #ffffff (Pure white lift).
- **Surface 2** ({colors.surface-2}): #f4f4f5 (Light gray lift).
- **Hairline**: #e4e4e7 (Subtle gray).

### Text
- **Ink (Dark)**: #f7f8f8 (Primary) / #8a8f98 (Subtle).
- **Ink (Light)**: #09090b (Primary) / #71717a (Subtle).

### Semantic
- **Must Fix (Error)**: #f87171 (Dark) / #ef4444 (Light).
- **Should Fix (Warning)**: #fbbf24 (Dark) / #f59e0b (Light).
- **Success**: #34d399 (Dark) / #10b981 (Light).

## Typography

| Token | Size | Weight | Line Height | Letter Spacing | Use |
|---|---|---|---|---|---|
| `{typography.display}` | 32px | 600 | 1.20 | -1.2px | Page titles |
| `{typography.headline}` | 20px | 600 | 1.25 | -0.6px | Section headings |
| `{typography.body}` | 14px | 400 | 1.50 | -0.05px | Default text |
| `{typography.body-sm}` | 13px | 400 | 1.50 | 0 | Card metadata |
| `{typography.mono}` | 13px | 400 | 1.50 | 0 | Code, paths, hashes |

## Components

### Finding Cards
Used on the Review Detail page to display AI-generated findings.
- **Container**: `{colors.surface-1}`, `{rounded.lg}`, 1px `{colors.hairline}`.
- **Top Edge**: A subtle 1px white highlight at 5% opacity on the top border.
- **Content**: Summary (bold), File Path (mono), Explanation (body).
- **Fix Suggestion**: Nested `{colors.surface-2}` block with `Ink Mono` text.

### Risk Badges
- **Must Fix**: Border and text in `{colors.semantic-error}`, background at 10% opacity.
- **Should Fix Soon**: Border and text in `{colors.semantic-warning}`, background at 10% opacity.
- **Ignore**: Border and text in `{colors.semantic-muted}`, background at 10% opacity.

### Stats Cards
Used on the Dashboard for high-level summaries.
- **Style**: Centered large number, small label above in `{colors.ink-muted}`.
- **Lift**: Uses `{colors.surface-1}` to stand out from the canvas.

### Email Draft Preview
- **Container**: `{colors.surface-1}` with a monospaced text block.
- **Action**: Secondary button for "Copy to Clipboard".

## Layout & Spacing

### Spacing System
- **Base unit**: 4px.
- **Tokens**: `{spacing.xs}` 8px · `{spacing.sm}` 12px · `{spacing.md}` 16px · `{spacing.lg}` 24px · `{spacing.xl}` 32px · `{spacing.section}` 64px.
- **Card Padding**: `{spacing.lg}` (24px) for findings and dashboard cards.
- **Page Margins**: `{spacing.xl}` (32px) on desktop, `{spacing.md}` (16px) on mobile.

### Grid & Container
- **Max Width**: 1200px for content area.
- **Dashboard Grid**: 4-up stats on desktop → 2-up on tablet → 1-up on mobile.

## Elevation & Depth

| Level | Treatment | Use |
|---|---|---|
| 0 (Canvas) | `{colors.canvas}` (#010102) | Default background |
| 1 (Lift) | `{colors.surface-1}` (#09090b) + 1px `{colors.hairline}` | Default cards, sidebar |
| 2 (High Lift) | `{colors.surface-2}` (#18181b) + 1px `{colors.hairline-strong}` | Hovered cards, nested blocks |
| 3 (Overlay) | `{colors.surface-3}` (#27272a) | Dropdowns, dialogs |

## Shapes

### Border Radius
- **Small** (`{rounded.sm}`): 6px — Tags, badges, small buttons.
- **Medium** (`{rounded.md}`): 8px — Primary buttons, form inputs.
- **Large** (`{rounded.lg}`): 12px — Cards, finding containers.
- **Full** (`{rounded.full}`): 9999px — Avatars, status pills.

## Micro-interactions

- **Page Transitions**: 300ms cubic-bezier(0.23, 1, 0.32, 1) fade + 12px vertical slide.
- **Hover Lift**: Cards should transition background and border color smoothly (200ms).
- **Stagger**: Apply a 0.04s delay per item in lists for a "fluid" loading feel.

## Known Gaps (Resolved)

- **Error States**: Inline alerts use semantic colors with 1px border.
- **Skeletons**: Pulse animation using surface-2.
- **Dual Themes**: AutoReview supports both "Linear Dark" (default) and "Linear Light" themes.
