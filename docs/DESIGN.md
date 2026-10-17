# Design System: "Control Room Glass"

The web app (`web/app`) is styled as a broadcast control room built from Apple-style materials.
This file is the source of truth for tokens, materials and component rules. Code must follow it.

## Principles
- **Identity, not template.** The signature details are:
  - a red ON AIR tally pill for playing channels
  - tabular timecode numerals for clocks, durations and progress
  - segmented controls
  - the channel number shown as a broadcast "bug" (`#101`).
- **Avoid:** purple/indigo hero gradients, emoji, rainbow stat cards, grids of identical icon-in-circle tiles, gradient text, drop shadows on text, and more than one accent colour.
- **Materials over decoration.** Depth comes from translucent materials, hairline borders, a 1px specular top highlight and long soft shadows. It does not come from colour.
- **Only the chrome is blurred.** Real `backdrop-filter` is used only on shell chrome: the sidebar, top bar, mobile tab bar, dialogs, sheets and the viewer HUD. Content cards use the non-blurred `.surface-card`, which is translucent with no backdrop-filter. Never nest blurred elements inside each other.
- **Motion** animates transform and opacity only (see `src/lib/motion/tokens.ts`). Looping animations stop in lite and reduced modes.

## Themes
- `<html data-theme="dark|light">` always holds the **resolved** theme.
  - The user preference (`system|light|dark`) is stored in localStorage key `theme` and mirrored to `data-theme-pref`.
  - `src/lib/theme.ts` resolves `system` with `matchMedia('(prefers-color-scheme: dark)')` and listens for changes.
  - An inline script in `index.html` applies it before first paint.
- Default is dark.
- **The viewer is always dark.** The viewer root carries `.scheme-dark`, which re-declares the dark tokens. Light/dark applies to admin, login, home and 404.

## Tokens (CSS custom properties in `src/index.css`)

| Token | Dark | Light | Use |
|---|---|---|---|
| `--surface-0` | `#07080a` | `#f2f2f5` | app background |
| `--surface-1` | `#111215` | `#ffffff` | cards |
| `--surface-2` | `#18191d` | `#f7f7f9` | raised / input |
| `--surface-3` | `#222328` | `#e9e9ee` | hover / pressed |
| `--fg` | `#f5f5f7` | `#1d1d1f` | primary text |
| `--fg-muted` | `#a1a1a6` | `#6e6e73` | secondary text |
| `--fg-subtle` | `#6e6e73` | `#8e8e93` | labels, captions |
| `--hairline` | `rgb(255 255 255 / .09)` | `rgb(0 0 0 / .08)` | borders, dividers |
| `--hairline-strong` | `rgb(255 255 255 / .16)` | `rgb(0 0 0 / .14)` | focused borders |
| `--accent` | `#0a84ff` | `#007aff` | the only accent |
| `--accent-soft` | `rgb(10 132 255 / .18)` | `rgb(0 122 255 / .12)` | selected rows, focus halo |
| `--live` | `#30d158` | `#248a3d` | healthy / live |
| `--onair` | `#ff453a` | `#ff3b30` | ON AIR tally |
| `--idle` | `#ff9f0a` | `#c45500` | idle / filler |
| `--danger` | `#ff453a` | `#d70015` | destructive |
| `--mat-ultrathin` | `rgb(30 31 36 / .34)` | `rgb(255 255 255 / .45)` | material fills |
| `--mat-thin` | `rgb(28 29 34 / .50)` | `rgb(255 255 255 / .60)` | |
| `--mat-regular` | `rgb(24 25 30 / .64)` | `rgb(255 255 255 / .72)` | |
| `--mat-thick` | `rgb(20 21 25 / .80)` | `rgb(250 250 252 / .86)` | |
| `--mat-hud` | `rgb(14 15 18 / .52)` | (always dark) | viewer HUD |
| `--mat-fallback` | `rgb(22 23 27 / .97)` | `rgb(252 252 253 / .97)` | no-blur fallback |
| `--card` | `rgb(17 18 21 / .72)` | `rgb(255 255 255 / .78)` | `.surface-card` fill |
| `--specular` | `inset 0 1px 0 rgb(255 255 255 / .07)` | `inset 0 1px 0 rgb(255 255 255 / .8)` | top highlight |
| `--shadow-1` | `0 1px 2px rgb(0 0 0 / .35), 0 10px 30px -12px rgb(0 0 0 / .55)` | `0 1px 2px rgb(0 0 0 / .05), 0 10px 30px -12px rgb(0 0 0 / .14)` | cards |
| `--shadow-2` | `0 2px 8px rgb(0 0 0 / .35), 0 30px 80px -20px rgb(0 0 0 / .7)` | `0 2px 8px rgb(0 0 0 / .06), 0 30px 80px -20px rgb(0 0 0 / .22)` | dialogs, sheets |

- Blur: `--blur-thin: 18px`, `--blur-regular: 30px`, `--blur-thick: 44px`, `--blur-hud: 24px`. Every blur is paired with `saturate(180%)`.
- Radii: `control` 10px (buttons, inputs), `tile` 14px (list rows, small tiles), `card` 20px, `sheet` 28px.
- Fonts:
  - `--font-system`: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI Variable Text", "Segoe UI", Inter, system-ui, sans-serif`
  - `--font-mono`: `ui-monospace, "SF Mono", "Cascadia Mono", "Segoe UI Mono", Menlo, monospace`
- The motion tokens (`--dur-*`, `--ease-spring`) are unchanged.
- The old names `--bg-primary`, `--bg-secondary`, `--bg-tertiary`, `--text-primary`, `--text-secondary` and `--border` stay as aliases of the new tokens for compatibility.

### Tailwind mapping (`@theme inline`)
- `--color-surface-0..3`, `--color-fg`, `--color-fg-muted`, `--color-fg-subtle`, `--color-hairline`, `--color-hairline-strong`, `--color-accent`, `--color-accent-soft`, `--color-live`, `--color-onair`, `--color-idle`, `--color-danger` → classes such as `bg-surface-1`, `text-fg-muted`, `border-hairline` and `bg-onair/15`.
- `--radius-control`, `--radius-tile`, `--radius-card`, `--radius-sheet` → `rounded-control`, `rounded-tile`, and so on.
- `--font-sans: var(--font-system)` and `--font-mono: var(--font-mono)`.
- Custom variants:
  - `@custom-variant tv (html[data-ui="tv"] &);`
  - `@custom-variant mobile (html[data-ui="mobile"] &);`
  - `@custom-variant light (html[data-theme="light"] &);`

## Material classes
- `.glass-ultrathin`, `.glass-thin`, `.glass` (regular), `.glass-thick` and `.glass-hud` each apply:
  - `background-color: var(--mat-*)`
  - a 3% SVG noise grain as `background-image`, inline data URI (`--noise`)
  - `border: 1px solid var(--hairline)`
  - `box-shadow: var(--specular), var(--shadow-1)`
  - `backdrop-filter: blur(var(--blur-*)) saturate(180%)`, also with the `-webkit-` prefix.
- `.surface-card`: `var(--card)` fill, hairline border, specular plus `--shadow-1`, **no backdrop-filter**.
- **Fallback.** The backdrop-filter is removed and the fill becomes `--mat-fallback` when any of these holds:
  - `html[data-ui="tv"]` or `html[data-ui="mobile"]`
  - `html[data-motion="lite"]` or `html[data-motion="reduced"]`
  - `@media (prefers-reduced-transparency: reduce)`
  - `@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))`
- On the viewer the fallback for `.glass-hud` is `rgb(14 15 18 / .9)`.

## Typography helpers
- `.large-title`: 30px, line-height 1.1, weight 700, letter-spacing -0.022em (TV: clamp up).
- `.title`: 17px, weight 600, letter-spacing -0.01em.
- `.label-caps`: 11px, weight 600, uppercase, letter-spacing 0.08em, `--fg-subtle`.
- `.timecode`: `--font-mono`, `font-variant-numeric: tabular-nums`, letter-spacing 0. Use it for clocks, durations, progress, channel numbers and counts.

## Focus
- Desktop `:focus-visible`: 2px solid `--accent` outline, 2px offset, plus a `--accent-soft` halo.
- The TV focus ring rules in `index.css` stay as they are (4px white, glow, scale 1.06).

## Components (`src/components/ui/`, plain React + Tailwind, no new dependencies, never import `motion`)
| Component | Props | Notes |
|---|---|---|
| `GlassPanel` | `material?: 'ultrathin'\|'thin'\|'regular'\|'thick'\|'hud'`, `as?`, `className`, rest | `rounded-card` by default |
| `Button` | `variant?: 'primary'\|'secondary'\|'ghost'\|'danger'\|'glass'`, `size?: 'sm'\|'md'\|'lg'\|'icon'`, rest of `<button>` | `rounded-control`; md height 36px with `mobile:min-h-11`; primary = accent fill, white text; secondary = `surface-2` + hairline; ghost = transparent with hover `surface-3`; danger = `danger/15` text `danger`; visible disabled state |
| `Card` | `className`, `children`, `as?` | `.surface-card rounded-card` |
| `StatTile` | `label`, `value`, `hint?`, `tone?: 'neutral'\|'live'\|'onair'\|'idle'\|'danger'` | label in `.label-caps`, value in `.timecode` at 28px; tone only tints a 6px dot and the hint, never the background |
| `Field` | `label`, `htmlFor`, `hint?`, `error?`, `children` | label must stay associated (tests use `getByLabelText`) |
| `Input` / `Select` / `Textarea` | native props | `surface-2` fill, hairline, `rounded-control`, accent focus halo, 36px tall, `mobile:min-h-11` |
| `StatusPill` | `status: 'onair'\|'live'\|'idle'\|'stopped'\|'error'`, `children` | `onair` = red tally with a pulsing dot (`.animate-live-pulse`); text comes from the caller (tests assert `PLAYING`, `IDLE`, `STOPPED`) |
| `SegmentedControl<T>` | `options: {value: T, label: ReactNode, icon?}[]`, `value`, `onChange`, `ariaLabel` | `role="radiogroup"`, buttons `role="radio"` with `aria-checked`; the selected thumb is a raised `surface-1` pill with shadow |
| `ThemeToggle` | `compact?` | `SegmentedControl` of system/light/dark with lucide `Monitor`/`Sun`/`Moon` icons and i18n labels |
| `EmptyState` | `art?: string`, `title`, `description?`, `action?` | art is a 160px rounded-card image with a soft mask fade at the bottom |
| `ChannelArt` | `channelId: number`, `src?`, `className`, `children` | `src`, or a placeholder picked by `channelId % 3`; CSS background with `bg-cover`; children overlay it |

- `AmbientBackground` lives in `src/features/admin/components/` so the wallpapers load only in the admin chunk.
  - It is a fixed, full-screen, `aria-hidden`, `pointer-events-none` layer.
  - Dark and light wallpapers are stacked, and the one matching `data-theme` is shown. Portrait versions are used below 768px.
  - On top sits a `--surface-0` scrim at 35% (dark) or 20% (light).
  - It drifts slowly: opacity 0.85–1 and scale 1–1.04 over 40s, alternating. The drift is off in lite and reduced modes.

## Assets (`src/assets/`, WebP, generated with imagine-agy, no baked-in text)
`wall-{dark,light}.webp` and `wall-{dark,light}-portrait.webp`, `login-hero.webp`, `idle-art.webp`, `empty-{media,playlist,channels}.webp`, `not-found.webp`, `channel-placeholder-{1,2,3}.webp`.
The server idle frame `assets/filler/siaran_segera_kembali.jpg` is built from `idle-art`, with its text drawn by ffmpeg.

## Layout patterns
- **Admin shell:**
  - The desktop sidebar is a 248px `.glass-thick` source list on the wallpaper, made of these parts:
    - brand row
    - sections with `.label-caps` headings
    - nav rows (`rounded-tile`, selected = `accent-soft` fill + `fg` text + accent icon)
    - footer with the ON AIR count, theme toggle and logout.
  - The top bar is a sticky `.glass-thin` with a `.large-title` page title and actions on the right.
  - On mobile the tab bar floats: an inset 12px `.glass-thick` pill with `rounded-sheet`.
- **Overview (control room bento):**
  - A row of `StatTile`s, using only data the existing endpoints return.
  - Below it, a grid of channel tiles. Each tile has `ChannelArt` 16:9, a bug (`#101`), a `StatusPill`, the now-playing title, a timecode progress bar (a 2px track whose fill uses `transform: scaleX`), up next, and the skip button.
- **Tables** become stacked rows on mobile. Rows use `rounded-tile`, hover `surface-3/50`, and hairline dividers. Numeric columns use `.timecode`.
- **Viewer HUD:**
  - `.glass-hud` bottom bar inset 24px with `rounded-sheet`: bug, title, `StatusPill`, timecode progress, controls (`Button variant="glass" size="icon"`).
  - The top-left channel bug is always visible on idle.
  - The gradient scrim stays under the HUD for legibility.
