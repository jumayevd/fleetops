# FleetOps design system — "Graphite"

A control-room aesthetic that works in daylight and at night. Cool graphite neutrals, one confident
**blue accent** for actions, selection, focus and live state, an amber brand mark, semantic status
colours and tabular numerals. Compact, calm, modern. Every page must look right in **both** themes.

## Principles

1. **Signal over decoration.** Colour means something: blue = action/selected/live, green = good,
   orange = caution, red = problem, cyan = informational, violet = in progress, amber = the brand
   mark only. Everything else is graphite. Key numbers carry a small tinted icon tile (`TONE_SOFT`).
2. **Compact.** 13 px tables, 36 px rows, 44 px top bar, 56 px icon rail. Dense but breathable:
   whitespace comes from alignment, not padding.
3. **Numbers are first-class.** Metrics, IDs, money, distances use `font-mono tabular-nums`
   (class `num`). Labels, chips and table headers are sentence case, never ALL CAPS (small labels use `.eyebrow`).
4. **One filled button per view.** The main action is the blue `primary` button; everything else is
   `secondary` (white, hairline) or `ghost`.
5. **Hairlines and a whisper of depth.** 1 px `line` borders plus `shadow-card` on cards and buttons;
   `shadow-float` only on floating layers (menus, drawers, dialogs). Cards are `rounded-lg` (12 px),
   controls `rounded-md` (8 px).
6. **Motion is quick and quiet.** Pages fade up on navigation (`template.tsx`, 240 ms), menus pop in
   (140 ms), buttons press (`active:scale-[0.97]`), a 2 px accent bar tracks page loads and every route
   streams behind a skeleton (`loading.tsx` → `PageSkeleton`). All of it is off for reduced motion.
6. **Tokens only.** Never write `slate-500`, `#fff`, `bg-white`, `text-gray-*`. Use the tokens
   below so both themes work. ESLint will not catch this — reviewers will.

## Tokens (Tailwind utilities)

| Role | Utility | Light (Day) | Dark (Night) |
|---|---|---|---|
| Page background | `bg-canvas` | #F4F5F7 | #0B0D10 |
| Card / panel | `bg-surface` | #FFFFFF | #12151A |
| Elevated / hover row | `bg-raised` | #F8F9FB | #171B21 |
| Inset / table head / input | `bg-sunken` | #EEF0F3 | #0E1115 |
| Floating layer | `bg-overlay` | #FFFFFF | #1A1F27 |
| Hairline | `border-line` | #E2E5EA | #232933 |
| Strong line | `border-line-strong` | #C9CED6 | #343C48 |
| Text | `text-fg` | #14171C | #E8EBEF |
| Secondary text | `text-fg-muted` | #4F5866 | #A3ACB9 |
| Tertiary text | `text-fg-subtle` | #7C8696 | #6F7A89 |
| Placeholder / disabled | `text-fg-faint` | #A5ADBA | #4C5563 |
| Accent (fill) | `bg-accent` / `ring-accent` / `border-accent` | #F5A524 | #F5A524 |
| Accent (text on light surfaces) | `text-accent` | #9A6700 | #F5B742 |
| Accent wash | `bg-accent-soft` | #FFF4DD | rgba(245,165,36,.14) |
| Text on accent | `text-on-accent` | #1C1400 | #1C1400 |
| Primary button | `bg-primary text-on-primary` | #14171C / #FFF | #E8EBEF / #0B0D10 |
| Good | `text-ok` `bg-ok-soft` `bg-ok` | #15803D / #E7F6EC | #3DD68C / rgba(61,214,140,.14) |
| Caution | `text-warn` `bg-warn-soft` `bg-warn` | #C2410C / #FFEFE5 | #FB923C / rgba(251,146,60,.14) |
| Problem | `text-danger` `bg-danger-soft` `bg-danger` | #B91C1C / #FDECEC | #F76B6B / rgba(247,107,107,.14) |
| Info | `text-info` `bg-info-soft` `bg-info` | #1D4ED8 / #E8EFFD | #60A5FA / rgba(96,165,250,.14) |
| In progress | `text-progress` `bg-progress-soft` `bg-progress` | #6D28D9 / #F0EAFE | #A78BFA / rgba(167,139,250,.14) |
| Neutral chip | `bg-neutral-soft` | #EEF0F3 | rgba(255,255,255,.06) |

Radii: controls `rounded-md` (6 px), cards `rounded-lg` (10 px), chips `rounded` (4 px). Pills
only for live status dots.

Typography: Geist Sans (UI) + Geist Mono (`num`, IDs, codes). Sizes: page title 18/600,
section title 13/600, body 13–14, table 13, table header 12/500 `text-fg-muted`, eyebrow 12/400 `text-fg-muted`,
chips 11/500.

## Components (`src/components/ui.tsx`)

`PageHeader` (title, eyebrow/breadcrumb, actions) · `Card` (title, actions, `bodyClassName`,
`flush`) · `Stat` (label, value, delta, spark) · `Badge` (status map → tone) · `Chip` (quiet flag,
e.g. HOLD, NO RC) · `Button`/`LinkButton` (`primary | accent | secondary | ghost | danger`,
`sm | md`) · `Input`/`Select`/`Textarea`/`Field` · `Table` (sticky head, `dense`, zebra off,
row hover `bg-raised`) · `EmptyState` · `DL` · `Progress` · `Tabs` · `SegmentedControl` ·
`Kbd` · `LiveDot` · `ExpiryBadge` · `Drawer` (right side panel) · `Menu` (row actions).

Status → tone map lives in one place (`STATUS_TONE` in ui.tsx). Add new statuses there, never
inline.

## Shell

- **Sidebar** (240 px, labelled) with grouped sections, open by default; collapses to a 56 px icon rail
  that expands on hover (`nav` cookie, so the first paint has the right width). The active item is a
  blue tint (`bg-accent-soft text-accent-text`). Nav counts and the alert bell stream in after the
  shell renders, so they never hold up a page.
- **Top bar** (48 px): breadcrumb, global search `⌘K`, theme toggle (Day / Night / Auto),
  alerts, user menu. Sticky, `bg-canvas/80 backdrop-blur`, hairline bottom.
- **Command palette**: navigation + entity search (loads, drivers, trucks, trailers, customers,
  invoices) + quick actions ("New load"). Keyboard: `⌘K`, `↑↓`, `↵`, `esc`; `g d` → dashboard,
  `g l` → loads, `g b` → board.
- Content is fluid (no max-width) with 20 px padding; dense pages (boards, tables) use the full
  width.

## Theme mechanics

`<html data-theme="light|dark">` set server-side from the `theme` cookie. **Day is the default** when no cookie
is set; Night and Auto are opt-in from the toggle, and "auto" is resolved by an inline script before paint from
`prefers-color-scheme`. Tailwind `dark:` variant =
`[data-theme=dark]`. Leaflet tiles are inverted/desaturated in dark mode via CSS filter.
Charts read tokens at runtime (`useChartTheme()` in `charts.tsx`).

## Copy

Sentence case everywhere. No exclamation marks in system copy. Buttons are verb-first.
Empty states say what to do next. Errors say what happened and how to fix it.

## Overview layout

The overview is the calmest page in the app and the template for new summary pages:

1. Greeting and one summary line (date · trucks moving · items to review), one primary action.
2. One strip of six key numbers (`KpiStrip`): label, value, one short line. Colour only the words that need a
   look (`Flag`), never the whole line, and no sparklines.
3. "Needs attention" (top six, critical first, a filter chip per kind, "View all") beside a tabbed "Today" card
   (pickups, recent activity).
4. Live fleet map beside billing and this week's production; roles without the map get the three cards in a row.
5. One performance card: a chart plus a short metric list (`MetricList`).

Rules of thumb: show the top items and link to the full list; in long lists one severity dot replaces badges;
secondary forms and hints (recover to another unit, keyboard shortcuts) start collapsed.

## Personal appearance

Everyone can tune the look from the palette icon in the top bar (also on My account). Choices live in cookies
(`theme`, `accent`, `density`, `font`, `nav`), so the server renders the first paint with them: no flash.

- **Accent**: blue (default), indigo, violet, teal, green, amber, graphite. Palettes in `globals.css`
  (`:root[data-accent=…]`, plus a Night variant each); every accent-tinted element follows, including charts
  and map markers.
- **Density**: compact (13 px root), default (14 px), roomy (15.5 px). Only rem-based spacing and control
  heights scale; text sizes stay put.
- **Font**: Inter (default), Geist, or the system UI font. Numbers use the same face with tabular figures.
- **Overview**: "Customize" shows or hides each section (`overview` cookie); hidden sections are not queried.

Keep new UI on tokens (`accent`, `accent-soft`, `primary`…) so it follows every accent and density.
