# UI — Style Reference
> Layered dark surfaces with a purple accent pulse — precise, tool-like forms on a deep canvas.

**Theme:** dark (primary) · light (secondary)

This design system feels like a professional automation or developer tool. The visual mood is focused and purposeful, built on deep near-black surfaces layered with subtle elevation. A restrained purple/violet accent cuts through the monochrome to signal active state and brand identity. Geometric forms are consistent — rounded cards and panels, icon-only sidebars, dot-grid backgrounds that add texture without noise. Colorful category icons provide wayfinding within dense list panels, each color semantically tied to an action type. Typography is clean and compact, favoring small-caps category labels and high-contrast white primary text.

## Tokens — Colors

### Core Palette

| Name | Value | Token | Role |
|------|-------|-------|------|
| Deep Canvas | `#0d0d0f` | `--color-deep-canvas` | Page background. Near-black with the faintest cool undertone. |
| Elevated Panel | `#161618` | `--color-elevated-panel` | Sidebar, cards, action panels. First lift above canvas. |
| Surface 2 | `#1c1c1f` | `--color-surface-2` | Tab groups, input backgrounds, secondary containers. |
| Surface 3 | `#252528` | `--color-surface-3` | Hover states, active rows within panels. |
| Subtle Border | `#2a2a2d` | `--color-subtle-border` | Card borders, dividers, input outlines. |
| Muted Text | `#6b6b6b` | `--color-muted-text` | Category labels (small caps), placeholders, secondary icons. |
| Secondary Text | `#a3a3a3` | `--color-secondary-text` | Inactive tab labels, breadcrumb ancestors, helper text. |
| Primary Text | `#f5f5f5` | `--color-primary-text` | Body copy, action labels, headings. Near-white. |
| Purple Accent | `#7c3aed` | `--color-purple-accent` | Active sidebar icons, status badges (Draft/Active), focus rings. Brand pulse. |
| Purple Dim | `#2d1b69` | `--color-purple-dim` | Active sidebar icon background. Dark tint of the accent. |
| Callout Red | `#ef4444` | `--color-callout-red` | Destructive actions, error states. |
| Success Green | `#22c55e` | `--color-success-green` | Success states, positive confirmations. |

### Icon Color System (Action Categories)

Each action category maps to a semantic icon color. Use these only for icons — never for backgrounds or text.

| Category | Color | Hex | Use |
|----------|-------|-----|-----|
| Messages / Email | Blue | `#60a5fa` | Email send, notification actions |
| Data / Sync | Green | `#4ade80` | Subscription updates, CRM sync |
| Data / Webhook | Orange | `#fb923c` | Webhooks, external API calls |
| Delays / Wait | Pink | `#f472b6` | Wait-until, conditional pause |
| Delays / Time | Red-Orange | `#f87171` | Timed delays, scheduled holds |
| Flow / Branch | Teal | `#2dd4bf` | True/false branch, conditionals |
| Flow / Enroll | Indigo | `#818cf8` | Enroll in automation, sub-flows |
| Templates | Gray | `#a3a3a3` | Template placeholders, defaults |

### Light Theme Colors (Secondary)

| Name | Value | Token | Role |
|------|-------|-------|------|
| Canvas White | `#ffffff` | `--color-canvas-white` | Page background, primary card surfaces. |
| Ghost Gray | `#f2f2f2` | `--color-ghost-gray` | Secondary backgrounds, badge fills. |
| Subtle Ash | `#e5e5e5` | `--color-subtle-ash` | Borders, dividers. |
| Midtone Gray | `#737373` | `--color-midtone-gray` | Muted text, placeholders. |
| Rich Black | `#0a0a0a` | `--color-rich-black` | Primary text. |
| Deep Black | `#000000` | `--color-deep-black` | Headings, active buttons. |
| Callout Red | `#c22b10` | `--color-callout-red` | Destructive actions. |
| Success Green | `#10c22b` | `--color-success-green` | Success states. |

## Tokens — Typography

### Inter (or Geist) — Primary brand font for all UI text. · `--font-primary`
- **Substitute:** system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI"
- **Weights:** 400, 500, 600
- **Sizes:** 11px, 12px, 13px, 14px, 16px, 18px, 48px
- **Line height:** 1.00, 1.20, 1.33, 1.43, 1.50
- **Letter spacing:** -0.05em at 48px; 0.08em for small-caps labels (uppercase, tracking-wide)
- **Role:** Primary font. Used for all body, labels, headings, and nav items.

### Geist Mono — Code and monospaced fields. · `--font-mono`
- **Substitute:** IBM Plex Mono, ui-monospace, Menlo
- **Weights:** 400
- **Sizes:** 13px, 14px
- **Role:** Code snippets, PR hashes, diff output, timestamp values.

### Type Scale

| Role | Size | Weight | Line Height | Letter Spacing | Token |
|------|------|--------|-------------|----------------|-------|
| category-label | 11px | 500 | 1.5 | 0.08em (uppercase) | `--text-category-label` |
| caption | 12px | 400 | 1.5 | — | `--text-caption` |
| body | 14px | 400 | 1.43 | — | `--text-body` |
| action-item | 14px | 500 | 1.43 | — | `--text-action-item` |
| heading | 18px | 600 | 1.33 | -0.45px | `--text-heading` |
| display | 48px | 600 | 1 | -2.4px | `--text-display` |

## Tokens — Spacing & Shapes

**Density:** compact

### Spacing Scale

| Name | Value | Token |
|------|-------|-------|
| 4 | 4px | `--spacing-4` |
| 6 | 6px | `--spacing-6` |
| 8 | 8px | `--spacing-8` |
| 10 | 10px | `--spacing-10` |
| 12 | 12px | `--spacing-12` |
| 16 | 16px | `--spacing-16` |
| 20 | 20px | `--spacing-20` |
| 24 | 24px | `--spacing-24` |
| 32 | 32px | `--spacing-32` |
| 40 | 40px | `--spacing-40` |
| 48 | 48px | `--spacing-48` |
| 80 | 80px | `--spacing-80` |

### Border Radius

| Element | Value |
|---------|-------|
| pill | 9999px |
| badge | 20px |
| cards / panels | 12px |
| input | 8px |
| buttons | 8px |
| sidebar icon button | 8px |
| tab group | 10px |
| action row | 8px |

### Borders

All borders use `1px solid` with `--color-subtle-border` (`#2a2a2d`). Panels use border rather than shadow for elevation on dark backgrounds.

### Shadows

| Name | Value | Token | Use |
|------|-------|-------|-----|
| focus-ring | `0 0 0 2px rgba(124, 58, 237, 0.5)` | `--shadow-focus` | Keyboard focus state on interactive elements. Purple tint. |
| panel-lift | `0 1px 3px rgba(0,0,0,0.4), 0 0 0 1px #2a2a2d` | `--shadow-panel` | Floating panels and dropdowns above the canvas. |

### Layout

- **Sidebar width:** 48px (icon-only)
- **Content area left margin:** 48px (flush against sidebar)
- **Panel / card padding:** 16px
- **Action row padding:** 10px 14px
- **Section gap:** 24px (between category groups inside panels)
- **Element gap:** 8px (between items in a row)
- **Category label margin-bottom:** 8px

## Background Patterns

### Dot Grid

The main content canvas uses a subtle dot grid to add texture without distraction. Dots are nearly invisible against the dark background — present but not competing with content.

```css
.canvas-dot-grid {
  background-color: var(--color-deep-canvas);
  background-image: radial-gradient(
    circle,
    #2a2a2d 1px,
    transparent 1px
  );
  background-size: 20px 20px;
}
```

Use on: the main content area behind panels. Do not use inside panels or the sidebar.

## Surfaces

### Dark (Primary)

| Level | Name | Value | Purpose |
|-------|------|-------|---------|
| 0 | Deep Canvas | `#0d0d0f` | Page background. Dot-grid texture applied here. |
| 1 | Elevated Panel | `#161618` | Sidebar, action panels, main cards. |
| 2 | Surface 2 | `#1c1c1f` | Tab group backgrounds, input fills, nested containers. |
| 3 | Surface 3 | `#252528` | Hover state backgrounds on action rows. |
| Accent | Purple Dim | `#2d1b69` | Active sidebar icon pill background. |

### Light (Secondary)

| Level | Name | Value | Purpose |
|-------|------|-------|---------|
| 0 | Canvas White | `#ffffff` | Page background. |
| 1 | Elevated Card | `#ffffff` | Cards, bordered. |
| 2 | Input Surface | `#ffffff` | Inputs, search bars. |
| 3 | Overlay | `#ffffff` | Popovers, dropdowns. |
| 4 | Ghost Gray | `#f2f2f2` | Badges, secondary buttons. |

## Components

### Icon-Only Sidebar

A narrow (48px) fixed left sidebar containing only icon buttons. No labels. The active icon gets a purple-dim pill background with a purple-accent icon color. All other icons use muted gray.

- **Background:** `--color-elevated-panel` (`#161618`)
- **Width:** 48px
- **Icon size:** 18px
- **Icon button size:** 32×32px, border-radius 8px
- **Active icon background:** `--color-purple-dim` (`#2d1b69`)
- **Active icon color:** `--color-purple-accent` (`#7c3aed`)
- **Inactive icon color:** `--color-muted-text` (`#6b6b6b`)
- **Hover background:** `--color-surface-2` (`#1c1c1f`)
- **Top slot:** Logo mark (white on dark, diamond/star shape), 32×32px
- **Create button:** `+` icon button, same sizing as nav icons, positioned below logo with extra gap
- **Border right:** `1px solid --color-subtle-border`

### Breadcrumb with Status Badge

Horizontal breadcrumb row at the top of the content area. Ancestor links are muted gray, the current page is white and bold. A colored status badge follows immediately after the page title.

- **Ancestor text:** `--color-secondary-text`, weight 400, 14px
- **Separator:** `>` in `--color-muted-text`
- **Current page:** `--color-primary-text`, weight 600, 14px
- **Status Badge (Draft):** Purple fill (`--color-purple-accent`), white text, 20px border-radius, 4px 10px padding, 12px font
- **Status Badge (Active):** Green fill (`--color-success-green`), white text
- **Status Badge (Paused):** Gray fill (`--color-surface-3`), secondary text

### Tab Group Navigation

A pill-shaped container that holds 3–5 tab labels. The active tab is white text; inactive tabs are secondary-text gray. The container itself provides the visual grouping — no individual tab borders.

- **Container background:** `--color-surface-2` (`#1c1c1f`)
- **Container border-radius:** 10px
- **Container padding:** 4px
- **Tab padding:** 6px 16px
- **Active tab:** `--color-primary-text`, weight 500, background `--color-surface-3` (`#252528`), border-radius 8px
- **Inactive tab:** `--color-secondary-text`, weight 400
- **Tab font size:** 14px
- **Gap between tabs:** 2px

### Action Panel

A bordered panel on `--color-elevated-panel` that lists categorized actions. Used for command palettes, workflow action selectors, and side panels.

- **Panel background:** `--color-elevated-panel` (`#161618`)
- **Panel border:** `1px solid --color-subtle-border`
- **Panel border-radius:** 12px
- **Panel padding:** 16px
- **Panel header:** Title (`--color-primary-text`, 16px, weight 600) + expand icon right-aligned (`--color-muted-text`)
- **Category label:** Uppercase, 11px, weight 500, `--color-muted-text`, letter-spacing 0.08em. Margin-bottom 8px. Margin-top 20px (except first category).
- **Action row:** `display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 8px;`
  - Icon: 18px, colored per icon color system
  - Label: 14px, weight 500, `--color-primary-text`
  - Drag handle (⋮⋮): right-aligned, `--color-muted-text`, visible only on hover
- **Action row hover:** background `--color-surface-3` (`#252528`)
- **Footer row (Template):** same as action row but with a chevron `›` right-aligned; separated by a top border `1px solid --color-subtle-border`, margin-top 8px

### Primary Action Button

Solid `--color-primary-text` (`#f5f5f5`) background with `--color-deep-canvas` (`#0d0d0f`) text. Border-radius 8px, padding 8px 20px. For dark theme — inverted from the canvas.

### Ghost Button

Transparent background, `--color-secondary-text` text, border `1px solid --color-subtle-border`. Border-radius 8px, padding 6px 14px.

### Plain Input Field

Background `--color-surface-2`, border `1px solid --color-subtle-border`, border-radius 8px, padding 8px 12px. Text `--color-primary-text`. Placeholder `--color-muted-text`. Focus: border-color `--color-purple-accent`, box-shadow `--shadow-focus`.

### Tag Badge — Status

| Variant | Background | Text | Use |
|---------|------------|------|-----|
| Draft | `#7c3aed` | `#ffffff` | Unpublished, in-progress |
| Active | `#22c55e` | `#ffffff` | Running, live |
| Paused | `#252528` | `#a3a3a3` | Suspended |
| Error | `#ef4444` | `#ffffff` | Failed, needs attention |

All badges: border-radius 20px, padding 3px 10px, font 12px weight 500.

### Elevated Card

Background `--color-elevated-panel`, border `1px solid --color-subtle-border`, border-radius 12px, padding 16px. Use `border` not `box-shadow` for elevation on dark backgrounds.

## CSS Custom Properties

```css
:root {
  /* Dark theme (primary) */
  --color-deep-canvas: #0d0d0f;
  --color-elevated-panel: #161618;
  --color-surface-2: #1c1c1f;
  --color-surface-3: #252528;
  --color-subtle-border: #2a2a2d;
  --color-muted-text: #6b6b6b;
  --color-secondary-text: #a3a3a3;
  --color-primary-text: #f5f5f5;
  --color-purple-accent: #7c3aed;
  --color-purple-dim: #2d1b69;
  --color-callout-red: #ef4444;
  --color-success-green: #22c55e;

  /* Icon color system */
  --icon-messages: #60a5fa;
  --icon-data-sync: #4ade80;
  --icon-data-webhook: #fb923c;
  --icon-delay-wait: #f472b6;
  --icon-delay-time: #f87171;
  --icon-flow-branch: #2dd4bf;
  --icon-flow-enroll: #818cf8;

  /* Light theme colors */
  --color-canvas-white: #ffffff;
  --color-ghost-gray: #f2f2f2;
  --color-subtle-ash: #e5e5e5;
  --color-midtone-gray: #737373;
  --color-rich-black: #0a0a0a;
  --color-deep-black: #000000;

  /* Typography */
  --font-primary: 'Inter', 'Geist', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-mono: 'Geist Mono', 'IBM Plex Mono', ui-monospace, Menlo, Monaco, Consolas, monospace;

  /* Type scale */
  --text-category-label: 11px;
  --text-caption: 12px;
  --text-body: 14px;
  --text-action-item: 14px;
  --text-heading: 18px;
  --text-display: 48px;

  /* Spacing */
  --spacing-4: 4px;
  --spacing-6: 6px;
  --spacing-8: 8px;
  --spacing-10: 10px;
  --spacing-12: 12px;
  --spacing-16: 16px;
  --spacing-20: 20px;
  --spacing-24: 24px;
  --spacing-32: 32px;
  --spacing-40: 40px;
  --spacing-48: 48px;
  --spacing-80: 80px;

  /* Layout */
  --sidebar-width: 48px;
  --card-padding: 16px;
  --action-row-padding: 10px 14px;
  --element-gap: 8px;

  /* Border radius */
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-badge: 20px;
  --radius-tab-group: 10px;
  --radius-pill: 9999px;

  /* Shadows / Elevation */
  --shadow-focus: 0 0 0 2px rgba(124, 58, 237, 0.5);
  --shadow-panel: 0 1px 3px rgba(0,0,0,0.4), 0 0 0 1px #2a2a2d;
}
```

## Tailwind v4

```css
@theme {
  /* Colors */
  --color-deep-canvas: #0d0d0f;
  --color-elevated-panel: #161618;
  --color-surface-2: #1c1c1f;
  --color-surface-3: #252528;
  --color-subtle-border: #2a2a2d;
  --color-muted-text: #6b6b6b;
  --color-secondary-text: #a3a3a3;
  --color-primary-text: #f5f5f5;
  --color-purple-accent: #7c3aed;
  --color-purple-dim: #2d1b69;
  --color-callout-red: #ef4444;
  --color-success-green: #22c55e;

  /* Icon palette */
  --color-icon-messages: #60a5fa;
  --color-icon-data-sync: #4ade80;
  --color-icon-data-webhook: #fb923c;
  --color-icon-delay-wait: #f472b6;
  --color-icon-delay-time: #f87171;
  --color-icon-flow-branch: #2dd4bf;
  --color-icon-flow-enroll: #818cf8;

  /* Light theme */
  --color-canvas-white: #ffffff;
  --color-ghost-gray: #f2f2f2;
  --color-subtle-ash: #e5e5e5;
  --color-rich-black: #0a0a0a;

  /* Typography */
  --font-primary: 'Inter', 'Geist', ui-sans-serif, system-ui, sans-serif;
  --font-mono: 'Geist Mono', 'IBM Plex Mono', ui-monospace, Menlo, monospace;

  /* Spacing */
  --spacing-4: 4px;
  --spacing-6: 6px;
  --spacing-8: 8px;
  --spacing-10: 10px;
  --spacing-12: 12px;
  --spacing-16: 16px;
  --spacing-20: 20px;
  --spacing-24: 24px;
  --spacing-32: 32px;
  --spacing-48: 48px;
  --spacing-80: 80px;

  /* Border radius */
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-badge: 20px;
  --radius-tab-group: 10px;
  --radius-pill: 9999px;
}
```

## Do's and Don'ts

### Do
- Use `--color-deep-canvas` (`#0d0d0f`) as the base — it's cooler and darker than pure black.
- Apply the dot-grid pattern on the main content canvas area, behind panels.
- Use `--color-purple-accent` exclusively for active/selected states and status badges — keep it rare so it retains meaning.
- Use `border: 1px solid --color-subtle-border` for panel elevation; avoid `box-shadow` on dark backgrounds.
- Keep the sidebar icon-only at 48px wide — labels belong in tooltips, not in the nav.
- Use small-caps category labels (`text-transform: uppercase; letter-spacing: 0.08em; font-size: 11px`) to group items inside panels.
- Apply the semantic icon color palette consistently — blue for email, green for sync, orange for webhooks, etc.
- Use weight 500 for action item labels to distinguish them from body text without going bold.

### Don't
- Don't use colored backgrounds for anything except status badges and the active sidebar icon — surfaces stay dark and neutral.
- Don't introduce colors outside the defined palette; the icon color system is the only place for hue variation.
- Don't add heavy shadows — the dark theme uses borders for depth, not dramatic drop shadows.
- Don't use white (`#ffffff`) for text — use `--color-primary-text` (`#f5f5f5`) to avoid harshness against dark surfaces.
- Don't make the sidebar wider or add text labels — the narrow icon-only sidebar is intentional.
- Don't use the dot-grid background inside panels or cards — it belongs only on the raw canvas.
- Don't use purple for anything other than active/selected states — overusing the accent destroys its signal value.
- Don't use `box-shadow` with light colors on dark backgrounds — they become invisible.

## Imagery

Icons are the primary visual element. Each icon category has a semantic color (see icon color system). Icons are 18px, with a simple outline or filled style — not decorative. No photography, illustrations, or gradients. The dot-grid background is the only texture. Product UI screenshots or component previews can appear as inset panels on the canvas, always within a bordered elevated card.

## Layout

The global layout is: **fixed icon sidebar (48px)** | **main content area** (remaining width, dot-grid background). The content area hosts panel cards that float over the dot-grid. Breadcrumb + status badge sit at the top of the content area. Below that, a tab group switches between panel views. Panel content scrolls independently. Max content width is unset — panels size to their content or to a defined max-width (e.g., 480px for action selector panels).

## Agent Prompt Guide

### Quick Color Reference (Dark Mode)
- **Text Primary:** #f5f5f5
- **Text Muted:** #6b6b6b
- **Background (canvas):** #0d0d0f
- **Panel surface:** #161618
- **Border:** #2a2a2d
- **Accent (Purple):** #7c3aed
- **Active icon bg:** #2d1b69
- **CTA background:** #f5f5f5
- **CTA text:** #0d0d0f

### Example Component Prompts

1. **Sidebar:** 48px wide, `#161618` background, `border-right: 1px solid #2a2a2d`. Top: 32×32 logo mark in white. Below: `+` icon button. Nav icons at 18px in `#6b6b6b`; active icon in `#7c3aed` on `#2d1b69` pill background, border-radius 8px.

2. **Breadcrumb row:** `Automations` in `#a3a3a3` 14px → `›` separator in `#6b6b6b` → `Workflow` in `#f5f5f5` weight 600 → `Draft` badge in `#7c3aed` fill, white text, border-radius 20px, padding 3px 10px, font 12px weight 500.

3. **Tab group:** Container `background: #1c1c1f; border-radius: 10px; padding: 4px`. Tabs `Overview | Workflow | Settings | Export`, 14px. Active: `background: #252528; border-radius: 8px; color: #f5f5f5; font-weight: 500`. Inactive: `color: #a3a3a3`.

4. **Action Panel:** `background: #161618; border: 1px solid #2a2a2d; border-radius: 12px; padding: 16px`. Header: "Actions" in `#f5f5f5` 16px weight 600, expand icon right. Category label "MESSAGES" in `#6b6b6b` 11px uppercase letter-spacing 0.08em. Action row: 18px blue icon (`#60a5fa`) + "Send Email" in `#f5f5f5` 14px weight 500 + drag handle on hover. Row hover: `background: #252528; border-radius: 8px`.

5. **Dot-grid canvas:** `background-color: #0d0d0f; background-image: radial-gradient(circle, #2a2a2d 1px, transparent 1px); background-size: 20px 20px`.

## Similar Brands

- **Linear** — Deep dark surfaces, purple accent for active states, icon-only sidebar, dot-grid background, compact dense lists.
- **Loops** — Email automation tool with dark theme, colorful category icons, action panels with sectioned lists.
- **Vercel** — Near-black canvas, monochromatic discipline, clean navigation, developer-tool aesthetic.
- **Raycast** — Dark command palette with colorful category icons, keyboard-first navigation, compact rows.
- **Liveblocks** — Dark panel design with purple accent, action lists, clean icon hierarchy.
