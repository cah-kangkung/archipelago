# Phase 5j UI Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the web app the cozy game design language (tokens, Nunito, Phosphor icons, glass surfaces, a component kit) and move every existing screen onto it without changing layout, copy or behaviour.

**Architecture:**
- **Task 1:** tokens and contrast. New tokens go in `packages/ui-tokens`, along with a pure contrast module and its tests. `styles.css` gets the Tailwind `@theme` and the glass utilities.
- **Task 2:** assets. The self-hosted Nunito font, a Phosphor `Icon` wrapper, two custom SVG icons, and the `?noblur` flag.
- **Tasks 3–5:** the component kit in `apps/web/src/ui/`.
  - Radix-based overlays: Tooltip, Popover, Menu, Dialog, Tabs, and Sheet (vaul).
  - Controls: Button, IconButton, Chip, Badge, GlassPanel, Skeleton.
  - The toast, moved from `app/`.
- **Tasks 6–8:** migration of the existing screens. Each file swaps raw Tailwind controls and placeholder glyphs for kit components, in place.
- **Task 9:** a bundle-budget script and the visual sheet.

**Tech Stack:**
- React 19, Tailwind 4.3 (`@tailwindcss/vite`), Vitest 5 with jsdom and Testing Library, Bun 1.4 (`bun:test` in `packages/ui-tokens`).
- New dependencies:
  - `@radix-ui/react-dialog` 1.2.0, `@radix-ui/react-popover` 1.2.0, `@radix-ui/react-dropdown-menu` 2.1.25, `@radix-ui/react-tooltip` 1.3.0, `@radix-ui/react-tabs` 1.1.22;
  - `@phosphor-icons/react` 2.1.10;
  - `@fontsource-variable/nunito` 5.3.0.
- `vaul` 1.1.2 is already installed.

**Spec:** `docs/superpowers/specs/2026-10-07-archipelago-task-game-design.md`, section 25. This plan covers 25.1, the 5j lines of 25.5 (bundle, `?noblur`, fallbacks) and the 5j lines of 25.6.

## Global Constraints

- **Formatting:** Biome, with single quotes, no semicolons and line width 100. `bun run lint` must stay at the one known info. Format with `bunx biome check --write <files>`.
- **TypeScript:** strict, with `noUncheckedIndexedAccess` and `verbatimModuleSyntax` (use `import type` for types).
- **No behaviour change.** Routes, React Query usage, the world-screen state machine, copy, accessible names and the API are unchanged. A test may change only its selectors, or a glyph that the task replaces with an icon. Every behaviour assertion stays.
- **Colours:** UI colours come only from `@archipelago/ui-tokens`, through the Tailwind theme. There are no hex literals in components, except inside `ui/icons.tsx`, which uses token classes too. The scene palette (`scene/model/palette.ts`) is untouched.
- **three.js:** stays only in the lazy world-scene chunk. Nothing in `ui/` imports three or `scene/`.
- **Icons:** named imports from `@phosphor-icons/react` only, always rendered through `ui/icon.tsx`'s `Icon`.
- **Touch targets:** at least 44px (`min-h-11`, `min-w-11`) on every interactive element. The `sm` button is 36px only at `lg:` and up.
- **Commits:** conventional messages, with no AI attribution and no `Co-Authored-By` trailer. Check that `git branch --show-current` prints `phase-5j-ui-foundation` before every commit.
- **Commands:**
  - tokens: `cd packages/ui-tokens && bun test`;
  - web: `cd apps/web && bunx vitest run <file>`;
  - the gate, from the repo root: `bun run test`, `bun run typecheck`, `bun run lint`, `bun run build`.
- **Green commits:** every commit leaves the full suite green.

## Spec refinements made while planning (ledger them as rulings)

1. **Accent text shades.**
   - The spec's shades fail AA on the strong glass over `lagoon`, which the spec's own test demands. Measured: coral 4.31, leaf and lagoon 4.58 on their tints and glass, gold 3.32 as a label on gold.
   - The new values are `goldText #6b4500`, `coralText #b03a0a`, `leafText #136b41` and `lagoonText #09656f`. `sandText #7a5a1e` is kept.
   - They were measured as follows:
     - on white: 8.48, 6.08, 6.55, 6.77;
     - on the strong glass over lagoon: 7.07, 5.06, 5.46, 5.64;
     - on their tints: 7.49, 4.92, 5.69, 5.84;
     - `goldText` on `gold`: 4.76.
   - Task 1 amends spec 25.1.
2. **Which text goes on which glass.**
   - On the plain glass fill (62%), body text may only be `textPrimary`, `textSecondary` or `brand`. `brandSecondary` measures 3.76 and `error` 3.42 there.
   - Accent text and coral needs `glassFillStrong` (80%).
   - The test checks exactly these pairs. Task 1 adds the rule to 25.1.
3. **Badge colour.** Badges are `coralText` (`#b03a0a`) with white text (6.08). White on `coral` is 2.57.
4. **Panels stay solid in 5j.** The desktop side panel and the phone task sheet are not over the canvas as floating glass yet; that layout is 5k. In 5j, glass is used only on surfaces that float over the canvas: the HUD chips, the layer picker and the uncharted card. Panels, dialogs and sheets use `surfacePrimary` with the new radii and shadows.
5. **The editor dialog moves to Radix.** The desktop `<dialog>` element becomes a Radix `Dialog`, which still has `role="dialog"`, a heading and a "Close" button. `editor-frame.test.tsx` swaps its `querySelector('dialog')` for test ids: `editor-dialog` and the existing `editor-sheet`.
6. **The streak hint moves to Radix Popover.** The existing tests stay unchanged: `aria-expanded`, `title`, closing on an outside pointerdown, closing on Escape with focus returning, and `min-h-11`.
7. **Glyphs become icons.** The test assertion `toHaveTextContent('◆ 15')` becomes `toHaveTextContent('15')`. `text-error` on a negative balance becomes `text-coral-text`.
8. **Bundle baseline.** The current initial JS is 179.63 kB gzip, as Vite reports it on master at `2724e28` (`dist/assets/index-*.js`; the world-scene chunk is excluded). The budget for all of 5j–5m is +60 kB, a ceiling of 239.63 kB. 5j alone is held to 224.63 kB, which leaves 15 kB for motion's core in 5m. `cmdk` and sound load lazily.
9. **The noblur flag** is `?noblur`. It's read independently of `?perf`, so `?perf&noblur` works.

## Review Focus

1. **Opening an editor on desktop.** Focus lands in the first field, Escape closes the dialog, and focus returns to the button that opened it. The Radix swap could break any of these. Pinned in Task 3 (Dialog test) and Task 8 (EditorFrame test).
2. **A browser without `backdrop-filter`.** Older WebViews, or Firefox with the pref off, must get a solid glass fill, not text over a see-through panel. Pinned in Task 1 (the stylesheet carries the `@supports not` fallback for `.glass` and `.glass-strong`).
3. **Tapping an IconButton on a phone.** It fires once and never leaves a tooltip stuck open. Pinned in Task 4.
4. **A toast whose action is clicked.** It disappears at once, the action runs once, and the dismiss timer later does nothing. Pinned in Task 5.
5. **A slow or failed font download.** Text falls back to a metric-matched local font, so nothing jumps. Pinned in Task 1 (the stylesheet declares the `Nunito Fallback` face and `--font-sans` lists it second).

---

### Task 1: Tokens, contrast and the theme

**Files:**
- Modify: `packages/ui-tokens/src/index.ts`, `packages/ui-tokens/src/index.test.ts`, `apps/web/src/styles.css`, `apps/web/src/styles.test.ts`, `docs/superpowers/specs/2026-10-07-archipelago-task-game-design.md` (25.1)
- Create: `packages/ui-tokens/src/contrast.ts`, `packages/ui-tokens/src/contrast.test.ts`

**Interfaces:**
- Produces, exported from `@archipelago/ui-tokens`:
  - `colors`: the existing keys plus `gold`, `coral`, `leaf`, `lagoon`, `sand`, `goldText`, `coralText`, `leafText`, `lagoonText`, `sandText`, `goldTint`, `coralTint`, `leafTint`, `lagoonTint`, `sandTint`.
  - `glass = { fill: 0.62, fillStrong: 0.8, fillSolid: 0.92, border: 0.7, blur: 14, saturate: 1.4 }`.
  - `shadows` (keys `1`, `2`, `3`), `radius` (adds `lg`, `xl`, `2xl`, `full`).
  - `fontFamily.sans`, `fontSizes`, `fontWeights`, `durations`, `easing`, `springs`, and `toCssVariables()`.
  - `luminance(hex)`, `contrastRatio(a, b)`, `overWhiteGlass(alpha, backdropHex)`.
- Produces Tailwind classes: `bg-gold`, `text-gold-text`, `bg-gold-tint` (and the same for coral, leaf, lagoon and sand), `bg-glass-fill`, `rounded-lg` (now 12px), `rounded-xl`, `rounded-2xl`, `shadow-1`, `shadow-2`, `shadow-3`, `text-caption` … `text-hero`, `font-body`, `font-label`, `font-heading`, `ease-standard`, `glass`, `glass-strong`.

- [ ] **Step 1: Write the failing token tests.** Append to `packages/ui-tokens/src/index.test.ts`, inside the existing `describe`:

```ts
  test('tropical accents, text shades and tints are fixed values', () => {
    expect(colors.gold).toBe('#f5b82e')
    expect(colors.coral).toBe('#ff7a59')
    expect(colors.leaf).toBe('#2fb36f')
    expect(colors.lagoon).toBe('#1fb5c4')
    expect(colors.sand).toBe('#f3e3bf')
    expect(colors.goldText).toBe('#6b4500')
    expect(colors.coralText).toBe('#b03a0a')
    expect(colors.leafText).toBe('#136b41')
    expect(colors.lagoonText).toBe('#09656f')
    expect(colors.sandText).toBe('#7a5a1e')
    expect(colors.goldTint).toBe('#fdf0cf')
    expect(colors.coralTint).toBe('#ffe1d8')
    expect(colors.leafTint).toBe('#dcf5e6')
    expect(colors.lagoonTint).toBe('#d6f4f6')
    expect(colors.sandTint).toBe('#faf3e3')
  })

  test('glass, radii, type and motion scales', () => {
    expect(glass).toEqual({
      fill: 0.62,
      fillStrong: 0.8,
      fillSolid: 0.92,
      border: 0.7,
      blur: 14,
      saturate: 1.4,
    })
    expect(radius).toEqual({ sm: 4, md: 6, default: 8, lg: 12, xl: 16, '2xl': 20, full: 9999 })
    expect(Object.values(fontSizes)).toEqual([12, 13, 14, 15, 17, 20, 24, 32])
    expect(fontWeights).toEqual({ body: 600, label: 700, heading: 800 })
    expect(durations).toEqual({ fast: 120, base: 200, slow: 320 })
    expect(springs.sheet).toEqual({ stiffness: 400, damping: 40 })
    expect(springs.pop).toEqual({ stiffness: 600, damping: 22 })
    expect(fontFamily.sans.startsWith("'Nunito Variable', 'Nunito Fallback'")).toBe(true)
  })

  test('toCssVariables emits every group', () => {
    const css = toCssVariables()
    expect(css).toContain('  --color-gold-text: #6b4500;\n')
    expect(css).toContain('  --color-glass-fill: rgb(255 255 255 / 0.62);\n')
    expect(css).toContain('  --color-glass-fill-strong: rgb(255 255 255 / 0.8);\n')
    expect(css).toContain('  --color-glass-fill-solid: rgb(255 255 255 / 0.92);\n')
    expect(css).toContain('  --color-glass-border: rgb(255 255 255 / 0.7);\n')
    expect(css).toContain('  --radius-2xl: 20px;\n')
    expect(css).toContain('  --shadow-2: 0 8px 24px rgb(0 40 90 / 0.18);\n')
    expect(css).toContain('  --text-body: 15px;\n')
    expect(css).toContain('  --font-weight-heading: 800;\n')
    expect(css).toContain('  --ease-standard: cubic-bezier(0.2, 0.8, 0.2, 1);\n')
    expect(css).toContain('  --duration-base: 200ms;\n')
    expect(css).toContain('  --glass-blur: 14px;\n')
    expect(css).toContain('  --glass-saturate: 1.4;\n')
  })
```

Update the file's import line to:

```ts
import {
  colors,
  durations,
  fontFamily,
  fontSizes,
  fontWeights,
  glass,
  radius,
  spacing,
  springs,
  toCssVariables,
} from './index'
```

- [ ] **Step 2: Write the failing contrast tests.** Create `packages/ui-tokens/src/contrast.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import { contrastRatio, luminance, overWhiteGlass } from './contrast'
import { colors, glass } from './index'

const AA = 4.5
const backdrops = { white: '#ffffff', lagoon: colors.lagoon }

describe('contrast maths', () => {
  test('luminance of black and white', () => {
    expect(luminance('#000000')).toBe(0)
    expect(luminance('#ffffff')).toBeCloseTo(1, 5)
  })

  test('black on white is 21:1 either way round', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5)
  })

  test('white glass over a colour blends toward white by alpha', () => {
    expect(overWhiteGlass(0.62, '#1fb5c4')).toBe('#aae3e9')
    expect(overWhiteGlass(1, '#000000')).toBe('#ffffff')
    expect(overWhiteGlass(0, '#123456')).toBe('#123456')
  })
})

describe('glass legibility (spec 25.1)', () => {
  const plain = [colors.textPrimary, colors.textSecondary, colors.brand]
  const accents = [
    colors.goldText,
    colors.coralText,
    colors.leafText,
    colors.lagoonText,
    colors.sandText,
  ]

  for (const [name, backdrop] of Object.entries(backdrops)) {
    test(`body text on the plain glass over ${name}`, () => {
      const surface = overWhiteGlass(glass.fill, backdrop)
      for (const text of plain) expect(contrastRatio(text, surface)).toBeGreaterThanOrEqual(AA)
    })

    test(`body and accent text on the strong glass over ${name}`, () => {
      const surface = overWhiteGlass(glass.fillStrong, backdrop)
      for (const text of [...plain, ...accents]) {
        expect(contrastRatio(text, surface)).toBeGreaterThanOrEqual(AA)
      }
    })
  }

  test('accent text on its own tint', () => {
    const pairs = [
      [colors.goldText, colors.goldTint],
      [colors.coralText, colors.coralTint],
      [colors.leafText, colors.leafTint],
      [colors.lagoonText, colors.lagoonTint],
      [colors.sandText, colors.sandTint],
    ] as const
    for (const [text, tint] of pairs) expect(contrastRatio(text, tint)).toBeGreaterThanOrEqual(AA)
  })

  test('button and badge labels', () => {
    expect(contrastRatio(colors.textOnBrand, colors.brandSecondary)).toBeGreaterThanOrEqual(AA)
    expect(contrastRatio(colors.goldText, colors.gold)).toBeGreaterThanOrEqual(AA)
    expect(contrastRatio(colors.textOnBrand, colors.coralText)).toBeGreaterThanOrEqual(AA)
  })
})
```

- [ ] **Step 3: Run them to see them fail.** Run `cd packages/ui-tokens && bun test`. Expected: FAIL, because `./contrast` can't be found and the new exports are missing.

- [ ] **Step 4: Implement the tokens.** Replace `packages/ui-tokens/src/index.ts` with:

```ts
export const colors = {
  brand: '#004990',
  brandSecondary: '#0069d2',
  surfacePrimary: '#ffffff',
  surfaceSecondary: '#f9fafb',
  textPrimary: '#111827',
  textSecondary: '#4b5563',
  textTertiary: '#9ca3af',
  textOnBrand: '#ffffff',
  borderPrimary: '#e5e7eb',
  borderSecondary: '#d1d5db',
  success: '#16a34a',
  warning: '#ba7517',
  error: '#dc2626',
  info: '#0069d2',
  // Tropical accents (spec 25.1): the game layer's colours beside A'raf blue.
  gold: '#f5b82e',
  coral: '#ff7a59',
  leaf: '#2fb36f',
  lagoon: '#1fb5c4',
  sand: '#f3e3bf',
  // Text in an accent: AA on white, on the strong glass and on its tint.
  goldText: '#6b4500',
  coralText: '#b03a0a',
  leafText: '#136b41',
  lagoonText: '#09656f',
  sandText: '#7a5a1e',
  // Chip backgrounds.
  goldTint: '#fdf0cf',
  coralTint: '#ffe1d8',
  leafTint: '#dcf5e6',
  lagoonTint: '#d6f4f6',
  sandTint: '#faf3e3',
} as const

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  default: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
  '4xl': 48,
  '5xl': 64,
} as const

export const radius = { sm: 4, md: 6, default: 8, lg: 12, xl: 16, '2xl': 20, full: 9999 } as const

/** White glass: fill alphas, border alpha, blur (px) and saturation (spec 25.1). */
export const glass = {
  fill: 0.62,
  fillStrong: 0.8,
  fillSolid: 0.92,
  border: 0.7,
  blur: 14,
  saturate: 1.4,
} as const

export const shadows = {
  1: '0 2px 8px rgb(0 40 90 / 0.12)',
  2: '0 8px 24px rgb(0 40 90 / 0.18)',
  3: '0 16px 40px rgb(0 40 90 / 0.22)',
} as const

export const fontFamily = {
  sans: "'Nunito Variable', 'Nunito Fallback', system-ui, sans-serif",
} as const

export const fontSizes = {
  caption: 12,
  meta: 13,
  label: 14,
  body: 15,
  title: 17,
  heading: 20,
  display: 24,
  hero: 32,
} as const

export const fontWeights = { body: 600, label: 700, heading: 800 } as const

export const durations = { fast: 120, base: 200, slow: 320 } as const

export const easing = { standard: 'cubic-bezier(0.2, 0.8, 0.2, 1)' } as const

/** For `motion` (5m); not CSS. */
export const springs = {
  sheet: { stiffness: 400, damping: 40 },
  pop: { stiffness: 600, damping: 22 },
} as const

const kebab = (key: string): string => key.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`)
const white = (alpha: number): string => `rgb(255 255 255 / ${alpha})`

export function toCssVariables(): string {
  const lines = [
    ...Object.entries(colors).map(([k, v]) => `  --color-${kebab(k)}: ${v};`),
    `  --color-glass-fill: ${white(glass.fill)};`,
    `  --color-glass-fill-strong: ${white(glass.fillStrong)};`,
    `  --color-glass-fill-solid: ${white(glass.fillSolid)};`,
    `  --color-glass-border: ${white(glass.border)};`,
    ...Object.entries(spacing).map(([k, v]) => `  --spacing-${k}: ${v}px;`),
    ...Object.entries(radius).map(([k, v]) => `  --radius-${k}: ${v}px;`),
    ...Object.entries(shadows).map(([k, v]) => `  --shadow-${k}: ${v};`),
    `  --font-sans: ${fontFamily.sans};`,
    ...Object.entries(fontSizes).map(([k, v]) => `  --text-${k}: ${v}px;`),
    ...Object.entries(fontWeights).map(([k, v]) => `  --font-weight-${k}: ${v};`),
    `  --ease-standard: ${easing.standard};`,
    ...Object.entries(durations).map(([k, v]) => `  --duration-${k}: ${v}ms;`),
    `  --glass-blur: ${glass.blur}px;`,
    `  --glass-saturate: ${glass.saturate};`,
  ]
  return `:root {\n${lines.join('\n')}\n}\n`
}

export { contrastRatio, luminance, overWhiteGlass } from './contrast'
```

- [ ] **Step 5: Implement contrast.** Create `packages/ui-tokens/src/contrast.ts`:

```ts
const channels = (hex: string): [number, number, number] => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
]

const linear = (c: number): number => {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

/** WCAG relative luminance of a `#rrggbb` colour. */
export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map(linear) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio, 1–21, order-independent. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

/** The colour seen through white glass of `alpha` laid over `backdrop`. */
export function overWhiteGlass(alpha: number, backdrop: string): string {
  return `#${channels(backdrop)
    .map((c) =>
      Math.round(255 * alpha + c * (1 - alpha))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
}
```

- [ ] **Step 6: Run the token tests.** Run `cd packages/ui-tokens && bun test`. Expected: PASS.

- [ ] **Step 7: Write the failing stylesheet tests.** Replace the body of `describe('styles.css', …)` in `apps/web/src/styles.test.ts` with:

```ts
  test('imports Tailwind', () => {
    expect(css).toContain('@import "tailwindcss";')
  })

  test('declares every token variable with its exact value', () => {
    const lines = toCssVariables()
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('--'))
    expect(lines.length).toBeGreaterThan(60)
    for (const line of lines) expect(css).toContain(line)
  })

  test('drops Tailwind default colours so only the palette is available', () => {
    expect(css).toContain('--color-*: initial;')
  })

  test('glass falls back to a solid fill without backdrop-filter, and under .no-blur', () => {
    expect(css).toContain('@utility glass {')
    expect(css).toContain('@utility glass-strong {')
    expect(css).toMatch(/@supports not \(\(backdrop-filter: blur\(1px\)\) or/)
    expect(css).toContain('.no-blur .glass')
    expect(css).toContain('background-color: var(--color-glass-fill-solid);')
  })

  test('a metric-matched fallback face stands in while Nunito loads', () => {
    expect(css).toContain("font-family: 'Nunito Fallback';")
    expect(css).toContain("src: local('Arial');")
    expect(css).toContain('ascent-override:')
  })
```

- [ ] **Step 8: Run them to see them fail.** Run `cd apps/web && bunx vitest run src/styles.test.ts`. Expected: FAIL, because the new variables, the glass utilities and the fallback face are missing.

- [ ] **Step 9: Write the theme.** Replace `apps/web/src/styles.css` with:

```css
@import "tailwindcss";

/* Tokens from @archipelago/ui-tokens; styles.test.ts checks every line against toCssVariables(). */
@theme static {
  --color-*: initial;
  --color-brand: #004990;
  --color-brand-secondary: #0069d2;
  --color-surface-primary: #ffffff;
  --color-surface-secondary: #f9fafb;
  --color-text-primary: #111827;
  --color-text-secondary: #4b5563;
  --color-text-tertiary: #9ca3af;
  --color-text-on-brand: #ffffff;
  --color-border-primary: #e5e7eb;
  --color-border-secondary: #d1d5db;
  --color-success: #16a34a;
  --color-warning: #ba7517;
  --color-error: #dc2626;
  --color-info: #0069d2;
  --color-gold: #f5b82e;
  --color-coral: #ff7a59;
  --color-leaf: #2fb36f;
  --color-lagoon: #1fb5c4;
  --color-sand: #f3e3bf;
  --color-gold-text: #6b4500;
  --color-coral-text: #b03a0a;
  --color-leaf-text: #136b41;
  --color-lagoon-text: #09656f;
  --color-sand-text: #7a5a1e;
  --color-gold-tint: #fdf0cf;
  --color-coral-tint: #ffe1d8;
  --color-leaf-tint: #dcf5e6;
  --color-lagoon-tint: #d6f4f6;
  --color-sand-tint: #faf3e3;
  --color-glass-fill: rgb(255 255 255 / 0.62);
  --color-glass-fill-strong: rgb(255 255 255 / 0.8);
  --color-glass-fill-solid: rgb(255 255 255 / 0.92);
  --color-glass-border: rgb(255 255 255 / 0.7);
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-default: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-2xl: 20px;
  --radius-full: 9999px;
  --shadow-1: 0 2px 8px rgb(0 40 90 / 0.12);
  --shadow-2: 0 8px 24px rgb(0 40 90 / 0.18);
  --shadow-3: 0 16px 40px rgb(0 40 90 / 0.22);
  --font-sans: 'Nunito Variable', 'Nunito Fallback', system-ui, sans-serif;
  --text-caption: 12px;
  --text-meta: 13px;
  --text-label: 14px;
  --text-body: 15px;
  --text-title: 17px;
  --text-heading: 20px;
  --text-display: 24px;
  --text-hero: 32px;
  --font-weight-body: 600;
  --font-weight-label: 700;
  --font-weight-heading: 800;
  --ease-standard: cubic-bezier(0.2, 0.8, 0.2, 1);
}

/* Not Tailwind namespaces: plain variables. */
:root {
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 12px;
  --spacing-default: 16px;
  --spacing-lg: 20px;
  --spacing-xl: 24px;
  --spacing-2xl: 32px;
  --spacing-3xl: 40px;
  --spacing-4xl: 48px;
  --spacing-5xl: 64px;
  --duration-fast: 120ms;
  --duration-base: 200ms;
  --duration-slow: 320ms;
  --glass-blur: 14px;
  --glass-saturate: 1.4;
}

/* Arial shaped to Nunito's metrics (ascender 1011, descender 353, no line gap, per 1000 em). */
@font-face {
  font-family: 'Nunito Fallback';
  src: local('Arial');
  ascent-override: 101.1%;
  descent-override: 35.3%;
  line-gap-override: 0%;
  size-adjust: 100%;
}

@layer base {
  body {
    font-weight: var(--font-weight-body);
    font-variant-numeric: tabular-nums;
  }
}

@utility glass {
  background-color: var(--color-glass-fill);
  border: 1px solid var(--color-glass-border);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
}

@utility glass-strong {
  background-color: var(--color-glass-fill-strong);
  border: 1px solid var(--color-glass-border);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
}

/* No backdrop-filter, or ?noblur (spec 25.5): glass turns solid so text stays legible. */
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .glass,
  .glass-strong {
    background-color: var(--color-glass-fill-solid);
  }
}

.no-blur .glass,
.no-blur .glass-strong {
  background-color: var(--color-glass-fill-solid);
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
}
```

Notes:
- `rounded-lg` moves from 8px to 12px. That is intended (spec 25.1), and Tasks 6–8 restyle every user anyway.
- `font-variant-numeric: tabular-nums` on `body` gives every counter tabular figures (spec 25.1).

- [ ] **Step 10: Run the stylesheet tests.** Run `cd apps/web && bunx vitest run src/styles.test.ts`. Expected: PASS.

- [ ] **Step 11: Amend the spec.** In the 25.1 token table, replace the "Accent text" row with:

```markdown
| Accent text (AA on white, on the strong glass over `lagoon`, and on the accent's tint) | `goldText #6b4500`, `coralText #b03a0a`, `leafText #136b41`, `lagoonText #09656f`, `sandText #7a5a1e` |
```

Then, in the **Glass legibility** bullet, after "body text ≥ 4.5:1, large text and icons ≥ 3:1.", insert:

```markdown
On the plain glass fill, text is only `textPrimary`, `textSecondary` or `brand`; accent and coral text sits on `glassFillStrong` or on its tint. Badges are `coralText` with white text.
```

- [ ] **Step 12: Run the gate and commit.**
  - Run `bun run test && bun run typecheck && bun run lint && bun run build` from the repo root. Expected: all pass.
  - Check the branch, then commit:

```bash
git branch --show-current   # phase-5j-ui-foundation
git add packages/ui-tokens apps/web/src/styles.css apps/web/src/styles.test.ts docs/superpowers/specs/2026-10-07-archipelago-task-game-design.md
git commit -m "feat(ui-tokens): tropical accents, glass, type and motion tokens with a contrast check"
```

---

### Task 2: Font, icons and the noblur flag

**Files:**
- Modify: `apps/web/package.json` (dependencies), `apps/web/src/main.tsx`, `apps/web/src/world/perf-flag.ts`
- Create: `apps/web/src/ui/icon.tsx`, `apps/web/src/ui/icons.tsx`, `apps/web/src/ui/icon.test.tsx`, `apps/web/src/world/perf-flag.test.ts` (or extend it if it exists)

**Interfaces:**
- Consumes: the Tailwind classes from Task 1 (`fill-gold`, `fill-gold-text`, `fill-coral`, `fill-sand`, `fill-sand-text`).
- Produces:
  - `type IconSize = 16 | 20 | 24 | 32`.
  - `Icon({ icon, size = 20, active = false, className }: { icon: PhosphorIcon; size?: IconSize; active?: boolean; className?: string })`. It renders the Phosphor glyph with `aria-hidden`, weight `duotone` (or `fill` when `active`), and `width = height = size`.
  - `SuppliesIcon({ size = 20, className })` and `ChestIcon({ size = 20, className })`: inline SVGs, also `aria-hidden`.
  - `noBlurEnabled(): boolean` (`?noblur`) and `resetNoBlurFlag()` in `world/perf-flag.ts`.
  - The `no-blur` class on `<html>` when the flag is set.

- [ ] **Step 1: Install the dependencies.**

```bash
cd apps/web && bun add @phosphor-icons/react@2.1.10 @fontsource-variable/nunito@5.3.0
```

- [ ] **Step 2: Write the failing tests.** Create `apps/web/src/ui/icon.test.tsx`:

```tsx
import { Crane } from '@phosphor-icons/react'
import { render } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { Icon } from './icon'
import { ChestIcon, SuppliesIcon } from './icons'

describe('Icon', () => {
  test('is decorative and sized', () => {
    const { container } = render(<Icon icon={Crane} size={24} />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveAttribute('width', '24')
    expect(svg).toHaveAttribute('height', '24')
  })

  test('defaults to 20px and passes a class through', () => {
    const { container } = render(<Icon icon={Crane} className="text-brand" />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('width', '20')
    expect(svg).toHaveClass('text-brand')
  })

  test('active swaps the duotone weight for the filled one', () => {
    const a = render(<Icon icon={Crane} />).container.innerHTML
    const b = render(<Icon icon={Crane} active />).container.innerHTML
    expect(a).not.toBe(b)
  })
})

describe('custom icons', () => {
  test.each([
    ['SuppliesIcon', SuppliesIcon],
    ['ChestIcon', ChestIcon],
  ])('%s is decorative and sized', (_, Glyph) => {
    const { container } = render(<Glyph size={16} />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveAttribute('width', '16')
    expect(svg).toHaveAttribute('viewBox', '0 0 24 24')
  })
})
```

Then add the flag test. If `apps/web/src/world/perf-flag.test.ts` exists, append the `describe` below; otherwise create the file with the imports.

```ts
import { afterEach, describe, expect, test } from 'vitest'
import { noBlurEnabled, resetNoBlurFlag } from './perf-flag'

describe('noBlurEnabled', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/')
    resetNoBlurFlag()
  })

  test('is false without ?noblur', () => {
    expect(noBlurEnabled()).toBe(false)
  })

  test('reads ?noblur, alone or beside ?perf', () => {
    window.history.replaceState(null, '', '/?perf&noblur')
    expect(noBlurEnabled()).toBe(true)
  })
})
```

- [ ] **Step 3: Run them to see them fail.** Run `cd apps/web && bunx vitest run src/ui/icon.test.tsx src/world/perf-flag.test.ts`. Expected: FAIL, because the modules and exports are missing.

- [ ] **Step 4: Implement the icons.** Create `apps/web/src/ui/icon.tsx`:

```tsx
import type { Icon as PhosphorIcon } from '@phosphor-icons/react'

export type IconSize = 16 | 20 | 24 | 32

/** Every Phosphor glyph goes through here: duotone at rest, filled when active (spec 25.1). */
export function Icon({
  icon: Glyph,
  size = 20,
  active = false,
  className,
}: {
  icon: PhosphorIcon
  size?: IconSize
  active?: boolean
  className?: string
}) {
  return (
    <Glyph aria-hidden="true" size={size} weight={active ? 'fill' : 'duotone'} className={className} />
  )
}
```

Create `apps/web/src/ui/icons.tsx`:

```tsx
import type { IconSize } from './icon'

type Props = { size?: IconSize; className?: string }

/** The supplies coin: a gold disc with a darker rim and a diamond stamp. */
export function SuppliesIcon({ size = 20, className }: Props) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
    >
      <circle cx="12" cy="12" r="10" className="fill-gold-text" />
      <circle cx="12" cy="11" r="9" className="fill-gold" />
      <path d="M12 6.5 15.5 11 12 15.5 8.5 11Z" className="fill-gold-text" opacity="0.55" />
    </svg>
  )
}

/** The daily chest: a sand box, coral lid band, gold clasp. */
export function ChestIcon({ size = 20, className }: Props) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
    >
      <path d="M3 10a6 6 0 0 1 6-6h6a6 6 0 0 1 6 6v1H3Z" className="fill-coral" />
      <rect x="3" y="11" width="18" height="9" rx="2" className="fill-sand" />
      <rect x="3" y="11" width="18" height="2" className="fill-sand-text" opacity="0.35" />
      <rect x="10" y="9" width="4" height="6" rx="1" className="fill-gold" />
    </svg>
  )
}
```

- [ ] **Step 5: Implement the flag.** Append to `apps/web/src/world/perf-flag.ts`:

```ts
let noBlur: boolean | null = null

/** True when the page was loaded with `?noblur`: glass turns solid (spec 25.5). */
export function noBlurEnabled(): boolean {
  if (noBlur === null) noBlur = new URLSearchParams(window.location.search).has('noblur')
  return noBlur
}

/** Test seam: forget the cached flag. */
export function resetNoBlurFlag(): void {
  noBlur = null
}
```

- [ ] **Step 6: Load the font and apply the flag.** In `apps/web/src/main.tsx`:
  - Add `import '@fontsource-variable/nunito'` immediately before `import './styles.css'`.
  - Add `import { noBlurEnabled } from './world/perf-flag'`.
  - Right after the `if (!root) throw …` line, add:

```ts
if (noBlurEnabled()) document.documentElement.classList.add('no-blur')
```

- [ ] **Step 7: Run the tests.** Run `cd apps/web && bunx vitest run src/ui/icon.test.tsx src/world/perf-flag.test.ts`. Expected: PASS.

- [ ] **Step 8: Run the gate and commit.**
  - Run the full gate from the repo root. Expected: all pass. The build should emit `nunito-*-wght-normal-*.woff2` files.
  - Check the branch, then commit:

```bash
git branch --show-current   # phase-5j-ui-foundation
git add apps/web/package.json bun.lock apps/web/src/main.tsx apps/web/src/ui apps/web/src/world/perf-flag.ts apps/web/src/world/perf-flag.test.ts
git commit -m "feat(web): self-hosted Nunito, Phosphor icon wrapper, supplies and chest icons, ?noblur"
```

If the lockfile is named `bun.lockb`, stage that instead.

---

### Task 3: Overlay primitives (Radix and vaul)

**Files:**
- Modify: `apps/web/package.json`, `apps/web/src/test/setup.ts`
- Create: `apps/web/src/ui/cx.ts`, `apps/web/src/ui/tooltip.tsx`, `apps/web/src/ui/popover.tsx`, `apps/web/src/ui/menu.tsx`, `apps/web/src/ui/dialog.tsx`, `apps/web/src/ui/tabs.tsx`, `apps/web/src/ui/sheet.tsx`, and one `*.test.tsx` beside each component

**Interfaces:**
- Produces:
  - `cx(...parts: (string | false | null | undefined)[]): string`.
  - `Tooltip({ content, delay = 400, children }: { content: string; delay?: number; children: ReactElement })`.
  - `Popover` (Root), `PopoverTrigger` (Trigger), `PopoverContent({ className, children, ...Radix content props })`. The content is portalled glass-strong with radius `lg` and `shadow-2`.
  - `Menu` (Root), `MenuTrigger` (Trigger), `MenuContent({ children, align? })`, `MenuItem({ onSelect, tone = 'neutral' | 'danger', icon?, children })`.
  - `Dialog({ open, onOpenChange, title, testId?, children })`. It renders a portalled overlay plus content with `role="dialog"`, an `h2` title and a "Close" icon button. It focuses the first `input, textarea, select` on open and returns focus to the opener on close.
  - `Tabs` (Root), `TabsList`, `TabsTrigger`, `TabsContent`: skinned Radix Tabs, used from 5k.
  - `Sheet({ open, onClose, title, testId?, children })`: a vaul drawer at 92dvh with a title bar and a "Close" icon button.

- [ ] **Step 1: Install the dependencies and add the jsdom stubs.**

```bash
cd apps/web && bun add @radix-ui/react-dialog@1.2.0 @radix-ui/react-popover@1.2.0 @radix-ui/react-dropdown-menu@2.1.25 @radix-ui/react-tooltip@1.3.0 @radix-ui/react-tabs@1.1.22
```

Append to `apps/web/src/test/setup.ts`:

```ts
// jsdom lacks ResizeObserver and pointer capture; Radix's popper and dismiss layers call them.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}
if (typeof Element.prototype.hasPointerCapture !== 'function') {
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.releasePointerCapture = () => {}
}
```

Check: `world-hud.tsx` guards `typeof ResizeObserver === 'undefined'` and keeps working with the stub, since `observe` is a no-op. Run `cd apps/web && bunx vitest run` once after adding the stub. Expected: still all green.

- [ ] **Step 2: Write the failing tests.**

`apps/web/src/ui/tooltip.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { Tooltip } from './tooltip'

describe('Tooltip', () => {
  test('shows on hover and on keyboard focus, hides on Escape', async () => {
    const user = userEvent.setup()
    render(
      <Tooltip content="Shop" delay={0}>
        <button type="button">S</button>
      </Tooltip>,
    )
    expect(screen.queryByRole('tooltip')).toBeNull()
    await user.hover(screen.getByRole('button'))
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Shop')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('tooltip')).toBeNull()
    await user.unhover(screen.getByRole('button'))
    await user.tab()
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Shop')
  })
})
```

`apps/web/src/ui/popover.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { Popover, PopoverContent, PopoverTrigger } from './popover'

const ui = (
  <Popover>
    <PopoverTrigger>Open</PopoverTrigger>
    <PopoverContent>Hint</PopoverContent>
  </Popover>
)

describe('Popover', () => {
  test('toggles on tap and reports aria-expanded', async () => {
    const user = userEvent.setup()
    render(ui)
    const trigger = screen.getByRole('button', { name: 'Open' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Hint')).toBeVisible()
    await user.click(trigger)
    expect(screen.queryByText('Hint')).toBeNull()
  })

  test('an outside pointerdown or Escape closes it; Escape returns focus', async () => {
    const user = userEvent.setup()
    render(ui)
    const trigger = screen.getByRole('button', { name: 'Open' })
    await user.click(trigger)
    fireEvent.pointerDown(screen.getByText('Hint'))
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    fireEvent.pointerDown(document.body)
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await user.click(trigger)
    await user.keyboard('{Escape}')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveFocus()
  })
})
```

`apps/web/src/ui/menu.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { Menu, MenuContent, MenuItem, MenuTrigger } from './menu'

describe('Menu', () => {
  test('opens, moves with arrows, selects, and closes on Escape', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    render(
      <Menu>
        <MenuTrigger>More</MenuTrigger>
        <MenuContent>
          <MenuItem onSelect={onEdit}>Edit</MenuItem>
          <MenuItem tone="danger" onSelect={onDelete}>
            Delete
          </MenuItem>
        </MenuContent>
      </Menu>,
    )
    await user.click(screen.getByRole('button', { name: 'More' }))
    const items = screen.getAllByRole('menuitem')
    expect(items).toHaveLength(2)
    await user.keyboard('{ArrowDown}')
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(onEdit).not.toHaveBeenCalled()
  })
})
```

`apps/web/src/ui/dialog.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, test } from 'vitest'
import { Dialog } from './dialog'

function Harness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Edit island
      </button>
      <Dialog open={open} onOpenChange={setOpen} title="Edit island" testId="editor-dialog">
        <label>
          Name
          <input />
        </label>
      </Dialog>
    </>
  )
}

describe('Dialog', () => {
  test('titles itself, focuses the first field, closes on Escape and returns focus', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const opener = screen.getByRole('button', { name: 'Edit island' })
    await user.click(opener)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('data-testid', 'editor-dialog')
    expect(screen.getByRole('heading', { name: 'Edit island' })).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(opener).toHaveFocus()
  })

  test('the Close button closes it', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Edit island' }))
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
```

`apps/web/src/ui/tabs.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs'

describe('Tabs', () => {
  test('arrow keys move between tabs and show their panel', async () => {
    const user = userEvent.setup()
    render(
      <Tabs defaultValue="tasks">
        <TabsList aria-label="Panels">
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="shop">Shop</TabsTrigger>
        </TabsList>
        <TabsContent value="tasks">Task list</TabsContent>
        <TabsContent value="shop">Catalogue</TabsContent>
      </Tabs>,
    )
    expect(screen.getByRole('tablist', { name: 'Panels' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Tasks' })).toHaveAttribute('aria-selected', 'true')
    await user.click(screen.getByRole('tab', { name: 'Tasks' }))
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Shop' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Catalogue')
  })
})
```

`apps/web/src/ui/sheet.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { Sheet } from './sheet'

describe('Sheet', () => {
  test('a titled drawer whose Close button calls onClose', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <Sheet open onClose={onClose} title="New task" testId="editor-sheet">
        <p>Body</p>
      </Sheet>,
    )
    expect(screen.getByTestId('editor-sheet')).toBeInTheDocument()
    expect(screen.getByText('New task')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 3: Run them to see them fail.** Run `cd apps/web && bunx vitest run src/ui`. Expected: the new files FAIL with missing modules. `icon.test.tsx` still passes.

- [ ] **Step 4: Implement.**

`apps/web/src/ui/cx.ts`:

```ts
/** Joins class names, skipping falsy parts. */
export const cx = (...parts: (string | false | null | undefined)[]): string =>
  parts.filter(Boolean).join(' ')
```

`apps/web/src/ui/tooltip.tsx`:

```tsx
import * as T from '@radix-ui/react-tooltip'
import type { ReactElement } from 'react'

/** A hover and focus label; Radix keeps it shut on touch taps (spec 25.1). */
export function Tooltip({
  content,
  delay = 400,
  children,
}: {
  content: string
  delay?: number
  children: ReactElement
}) {
  return (
    <T.Provider delayDuration={delay}>
      <T.Root>
        <T.Trigger asChild>{children}</T.Trigger>
        <T.Portal>
          <T.Content
            sideOffset={6}
            className="z-50 rounded-lg bg-text-primary px-2 py-1 text-meta font-label text-text-on-brand shadow-2"
          >
            {content}
          </T.Content>
        </T.Portal>
      </T.Root>
    </T.Provider>
  )
}
```

`apps/web/src/ui/popover.tsx`:

```tsx
import * as P from '@radix-ui/react-popover'
import type { ComponentPropsWithoutRef } from 'react'
import { cx } from './cx'

export const Popover = P.Root
export const PopoverTrigger = P.Trigger

export function PopoverContent({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content
        sideOffset={8}
        collisionPadding={12}
        {...props}
        className={cx(
          'glass-strong z-50 max-w-64 rounded-lg px-3 py-2 text-label text-text-primary shadow-2',
          className,
        )}
      />
    </P.Portal>
  )
}
```

`apps/web/src/ui/menu.tsx`:

```tsx
import type { Icon as PhosphorIcon } from '@phosphor-icons/react'
import * as M from '@radix-ui/react-dropdown-menu'
import type { ReactNode } from 'react'
import { cx } from './cx'
import { Icon } from './icon'

export const Menu = M.Root
export const MenuTrigger = M.Trigger

export function MenuContent({
  children,
  align = 'end',
}: {
  children: ReactNode
  align?: 'start' | 'center' | 'end'
}) {
  return (
    <M.Portal>
      <M.Content
        align={align}
        sideOffset={6}
        collisionPadding={12}
        className="glass-strong z-50 min-w-44 rounded-lg p-1 shadow-2"
      >
        {children}
      </M.Content>
    </M.Portal>
  )
}

export function MenuItem({
  onSelect,
  tone = 'neutral',
  icon,
  children,
}: {
  onSelect: () => void
  tone?: 'neutral' | 'danger'
  icon?: PhosphorIcon
  children: ReactNode
}) {
  return (
    <M.Item
      onSelect={onSelect}
      className={cx(
        'flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-3 text-label font-label outline-none data-[highlighted]:bg-brand-secondary/10',
        tone === 'danger' ? 'text-coral-text' : 'text-text-primary',
      )}
    >
      {icon && <Icon icon={icon} />}
      {children}
    </M.Item>
  )
}
```

`apps/web/src/ui/dialog.tsx`:

```tsx
import { X } from '@phosphor-icons/react'
import * as D from '@radix-ui/react-dialog'
import { type ReactNode, useRef } from 'react'
import { Icon } from './icon'

/** A centred modal: focuses the first field, Escape and Close dismiss, focus returns (spec 25.1). */
export function Dialog({
  open,
  onOpenChange,
  title,
  testId,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  testId?: string
  children: ReactNode
}) {
  const content = useRef<HTMLDivElement>(null)
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-text-primary/40" />
        <D.Content
          ref={content}
          data-testid={testId}
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            const field = content.current?.querySelector<HTMLElement>('input, textarea, select')
            if (!field) return
            event.preventDefault()
            field.focus()
          }}
          className="fixed top-1/2 left-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-surface-primary p-6 shadow-3"
        >
          <div className="mb-4 flex items-center justify-between gap-2">
            <D.Title className="text-heading font-heading text-text-primary">{title}</D.Title>
            <D.Close
              aria-label="Close"
              className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-text-secondary hover:bg-surface-secondary"
            >
              <Icon icon={X} />
            </D.Close>
          </div>
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}
```

`apps/web/src/ui/tabs.tsx`:

```tsx
import * as T from '@radix-ui/react-tabs'
import type { ComponentPropsWithoutRef } from 'react'
import { cx } from './cx'

export const Tabs = T.Root
export const TabsContent = T.Content

export function TabsList({ className, ...props }: ComponentPropsWithoutRef<typeof T.List>) {
  return <T.List {...props} className={cx('flex gap-1', className)} />
}

export function TabsTrigger({ className, ...props }: ComponentPropsWithoutRef<typeof T.Trigger>) {
  return (
    <T.Trigger
      {...props}
      className={cx(
        'flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-xl px-3 text-caption font-label text-text-secondary data-[state=active]:bg-brand-secondary/10 data-[state=active]:text-brand',
        className,
      )}
    />
  )
}
```

`apps/web/src/ui/sheet.tsx`:

```tsx
import { X } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { Drawer } from 'vaul'
import { Icon } from './icon'

/** The phone's full-height editor drawer (spec 25.1); 92dvh as before. */
export function Sheet({
  open,
  onClose,
  title,
  testId,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  testId?: string
  children: ReactNode
}) {
  return (
    <Drawer.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-text-primary/40" />
        <Drawer.Content
          data-testid={testId}
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 mx-auto flex h-[92dvh] max-w-[640px] flex-col rounded-t-2xl bg-surface-primary shadow-3"
        >
          <span aria-hidden className="mx-auto mt-2 block h-1.5 w-12 rounded-full bg-border-secondary" />
          <div className="flex items-center justify-between gap-2 px-4 py-1">
            <Drawer.Title className="text-title font-heading text-text-primary">{title}</Drawer.Title>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-text-secondary hover:bg-surface-secondary"
            >
              <Icon icon={X} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
```

- [ ] **Step 5: Run the tests.** Run `cd apps/web && bunx vitest run src/ui`. Expected: PASS.
  - If the Tooltip test cannot see `role="tooltip"`: Radix renders the label twice (a visible copy plus a visually hidden `role="tooltip"` copy). Query the role, as written, and never `getByText`.
  - If Menu items need a pointer to open in jsdom: open with `user.click`, which sends pointerdown with button 0. Do not switch to `fireEvent.click`.

- [ ] **Step 6: Run the gate and commit.**
  - Run the full gate. Expected: all pass.
  - Check the branch, then commit:

```bash
git branch --show-current   # phase-5j-ui-foundation
git add apps/web/package.json bun.lock apps/web/src/test/setup.ts apps/web/src/ui
git commit -m "feat(web): Radix-based tooltip, popover, menu, dialog and tabs, and a vaul sheet"
```

---

### Task 4: Controls

**Files:**
- Create: `apps/web/src/ui/button.tsx`, `apps/web/src/ui/chip.tsx`, `apps/web/src/ui/glass-panel.tsx`, `apps/web/src/ui/skeleton.tsx`, and tests `button.test.tsx`, `chip.test.tsx`, `glass-panel.test.tsx`

**Interfaces:**
- Consumes: `Icon` (Task 2), `Tooltip` and `cx` (Task 3), `Spinner` (`apps/web/src/app/spinner.tsx`, unchanged).
- Produces:
  - `type ButtonVariant = 'primary' | 'accent' | 'ghost' | 'danger'` and `type ButtonSize = 'md' | 'sm'`.
  - `Button(props: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; loading?: boolean; icon?: PhosphorIcon })`. Defaults: `type="button"`, `variant="primary"`, `size="md"`.
  - `IconButton(props: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'> & { icon: PhosphorIcon; label: string; tooltip?: boolean; variant?: ButtonVariant; active?: boolean })`.
  - `buttonClass(variant, size): string`, for a `Link` that must look like a button.
  - `type Tone = 'neutral' | 'gold' | 'coral' | 'leaf' | 'lagoon' | 'brand'`.
  - `Chip(props: HTMLAttributes<HTMLSpanElement> & { tone?: Tone; icon?: PhosphorIcon })`.
  - `Badge({ count, label }: { count: number; label: string })`. It renders nothing when `count <= 0` and caps the count at `99+`.
  - `GlassPanel(props: HTMLAttributes<HTMLDivElement> & { elevation?: 1 | 2 | 3; strong?: boolean })`.
  - `Skeleton({ className }: { className?: string })`.

- [ ] **Step 1: Write the failing tests.**

`apps/web/src/ui/button.test.tsx`:

```tsx
import { PencilSimple } from '@phosphor-icons/react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { Button, IconButton } from './button'

describe('Button', () => {
  test('defaults to a 44px primary button of type button', () => {
    render(<Button>Save</Button>)
    const b = screen.getByRole('button', { name: 'Save' })
    expect(b).toHaveAttribute('type', 'button')
    expect(b).toHaveClass('min-h-11', 'bg-brand-secondary', 'text-text-on-brand')
  })

  test.each([
    ['accent', 'bg-gold'],
    ['ghost', 'text-brand'],
    ['danger', 'text-coral-text'],
  ] as const)('%s variant', (variant, cls) => {
    render(<Button variant={variant}>Go</Button>)
    expect(screen.getByRole('button')).toHaveClass(cls)
  })

  test('sm is 44px on touch widths and 36px from lg', () => {
    render(<Button size="sm">Go</Button>)
    expect(screen.getByRole('button')).toHaveClass('min-h-11', 'lg:min-h-9')
  })

  test('loading disables, marks busy and shows a spinner, keeping the label', async () => {
    const onClick = vi.fn()
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    )
    const b = screen.getByRole('button', { name: 'Save' })
    expect(b).toBeDisabled()
    expect(b).toHaveAttribute('aria-busy', 'true')
    expect(b.querySelector('.motion-safe\\:animate-spin')).not.toBeNull()
    await userEvent.setup().click(b)
    expect(onClick).not.toHaveBeenCalled()
  })

  test('submit type is kept when asked', () => {
    render(<Button type="submit">Create</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit')
  })
})

describe('IconButton', () => {
  test('its label is the accessible name and the target is 44px square', () => {
    render(<IconButton icon={PencilSimple} label="Edit island" />)
    const b = screen.getByRole('button', { name: 'Edit island' })
    expect(b).toHaveClass('min-h-11', 'min-w-11')
    expect(b.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  test('a touch tap fires once and leaves no tooltip open', async () => {
    const onClick = vi.fn()
    render(<IconButton icon={PencilSimple} label="Edit island" onClick={onClick} />)
    const b = screen.getByRole('button', { name: 'Edit island' })
    fireEvent.pointerDown(b, { pointerType: 'touch' })
    fireEvent.pointerUp(b, { pointerType: 'touch' })
    fireEvent.click(b)
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  test('tooltip={false} renders the bare button', () => {
    render(<IconButton icon={PencilSimple} label="Edit" tooltip={false} />)
    expect(screen.getByRole('button', { name: 'Edit' })).not.toHaveAttribute('data-state')
  })
})
```

`apps/web/src/ui/chip.test.tsx`:

```tsx
import { Fire } from '@phosphor-icons/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { Badge, Chip } from './chip'

describe('Chip', () => {
  test.each([
    ['neutral', 'bg-surface-secondary', 'text-text-secondary'],
    ['gold', 'bg-gold-tint', 'text-gold-text'],
    ['coral', 'bg-coral-tint', 'text-coral-text'],
    ['leaf', 'bg-leaf-tint', 'text-leaf-text'],
    ['lagoon', 'bg-lagoon-tint', 'text-lagoon-text'],
    ['brand', 'bg-brand-secondary/10', 'text-brand'],
  ] as const)('%s tone', (tone, bg, fg) => {
    render(<Chip tone={tone}>3d late</Chip>)
    expect(screen.getByText('3d late')).toHaveClass('rounded-full', bg, fg)
  })

  test('an icon is decorative', () => {
    const { container } = render(<Chip icon={Fire}>8</Chip>)
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('Badge', () => {
  test('nothing for zero', () => {
    const { container } = render(<Badge count={0} label="0 overdue" />)
    expect(container).toBeEmptyDOMElement()
  })

  test('shows the count visually and the label to screen readers', () => {
    render(<Badge count={3} label="3 overdue" />)
    expect(screen.getByText('3')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByText('3 overdue')).toHaveClass('sr-only')
  })

  test('caps at 99+', () => {
    render(<Badge count={250} label="250 overdue" />)
    expect(screen.getByText('99+')).toBeInTheDocument()
  })
})
```

`apps/web/src/ui/glass-panel.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { GlassPanel } from './glass-panel'
import { Skeleton } from './skeleton'

describe('GlassPanel', () => {
  test('plain glass at elevation 2 by default', () => {
    render(<GlassPanel>Hi</GlassPanel>)
    expect(screen.getByText('Hi')).toHaveClass('glass', 'shadow-2')
  })

  test('strong fill and elevation', () => {
    render(
      <GlassPanel strong elevation={3} className="rounded-2xl">
        Hi
      </GlassPanel>,
    )
    const el = screen.getByText('Hi')
    expect(el).toHaveClass('glass-strong', 'shadow-3', 'rounded-2xl')
    expect(el).not.toHaveClass('glass')
  })
})

describe('Skeleton', () => {
  test('decorative, pulsing only when motion is allowed', () => {
    const { container } = render(<Skeleton className="h-4 w-20" />)
    const el = container.firstElementChild
    expect(el).toHaveAttribute('aria-hidden', 'true')
    expect(el).toHaveClass('motion-safe:animate-pulse', 'h-4', 'w-20')
    expect(el).not.toHaveClass('animate-pulse')
  })
})
```

- [ ] **Step 2: Run them to see them fail.** Run `cd apps/web && bunx vitest run src/ui/button.test.tsx src/ui/chip.test.tsx src/ui/glass-panel.test.tsx`. Expected: FAIL, because the modules are missing.

- [ ] **Step 3: Implement.**

`apps/web/src/ui/button.tsx`:

```tsx
import type { Icon as PhosphorIcon } from '@phosphor-icons/react'
import type { ButtonHTMLAttributes } from 'react'
import { Spinner } from '../app/spinner'
import { cx } from './cx'
import { Icon } from './icon'
import { Tooltip } from './tooltip'

export type ButtonVariant = 'primary' | 'accent' | 'ghost' | 'danger'
export type ButtonSize = 'md' | 'sm'

const base =
  'inline-flex items-center justify-center gap-2 rounded-xl font-label transition-colors duration-(--duration-fast) ease-standard disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-secondary'

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-brand-secondary text-text-on-brand shadow-1 hover:bg-brand',
  accent: 'bg-gold text-gold-text shadow-1 hover:brightness-105',
  ghost: 'text-brand hover:bg-brand-secondary/10',
  danger: 'text-coral-text hover:bg-coral-tint',
}

const sizes: Record<ButtonSize, string> = {
  md: 'min-h-11 px-4 text-body',
  sm: 'min-h-11 px-3 text-label lg:min-h-9',
}

/** The classes of a button, for a router `Link` that must look like one. */
export const buttonClass = (variant: ButtonVariant = 'primary', size: ButtonSize = 'md') =>
  cx(base, variants[variant], sizes[size])

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  type = 'button',
  disabled,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: PhosphorIcon
}) {
  return (
    <button
      // biome-ignore lint/a11y/useButtonType: the type is a prop, defaulting to "button"
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(buttonClass(variant, size), className)}
      {...rest}
    >
      {loading ? <Spinner /> : icon && <Icon icon={icon} />}
      {children}
    </button>
  )
}

export function IconButton({
  icon,
  label,
  tooltip = true,
  variant = 'ghost',
  active = false,
  type = 'button',
  className,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'> & {
  icon: PhosphorIcon
  label: string
  tooltip?: boolean
  variant?: ButtonVariant
  active?: boolean
}) {
  const button = (
    <button
      // biome-ignore lint/a11y/useButtonType: the type is a prop, defaulting to "button"
      type={type}
      aria-label={label}
      className={cx(
        base,
        variants[variant],
        'min-h-11 min-w-11 shrink-0 shadow-none',
        className,
      )}
      {...rest}
    >
      <Icon icon={icon} active={active} />
    </button>
  )
  return tooltip ? <Tooltip content={label}>{button}</Tooltip> : button
}
```

The `biome-ignore` lines are only needed if Biome flags `type={type}`. Delete them if `bun run lint` is clean without them.

`apps/web/src/ui/chip.tsx`:

```tsx
import type { Icon as PhosphorIcon } from '@phosphor-icons/react'
import type { HTMLAttributes } from 'react'
import { cx } from './cx'
import { Icon } from './icon'

export type Tone = 'neutral' | 'gold' | 'coral' | 'leaf' | 'lagoon' | 'brand'

const tones: Record<Tone, string> = {
  neutral: 'bg-surface-secondary text-text-secondary',
  gold: 'bg-gold-tint text-gold-text',
  coral: 'bg-coral-tint text-coral-text',
  leaf: 'bg-leaf-tint text-leaf-text',
  lagoon: 'bg-lagoon-tint text-lagoon-text',
  brand: 'bg-brand-secondary/10 text-brand',
}

export function Chip({
  tone = 'neutral',
  icon,
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone; icon?: PhosphorIcon }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-meta font-label whitespace-nowrap',
        tones[tone],
        className,
      )}
      {...rest}
    >
      {icon && <Icon icon={icon} size={16} />}
      {children}
    </span>
  )
}

/** A coral count bubble; the number is visual, `label` is what a screen reader hears. */
export function Badge({ count, label }: { count: number; label: string }) {
  if (count <= 0) return null
  return (
    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-coral-text px-1.5 text-caption font-heading text-text-on-brand">
      <span aria-hidden="true">{count > 99 ? '99+' : count}</span>
      <span className="sr-only">{label}</span>
    </span>
  )
}
```

`apps/web/src/ui/glass-panel.tsx`:

```tsx
import type { HTMLAttributes } from 'react'
import { cx } from './cx'

const shadow = { 1: 'shadow-1', 2: 'shadow-2', 3: 'shadow-3' } as const

/** The glass surface primitive (spec 25.1); radius and padding are the caller's. */
export function GlassPanel({
  elevation = 2,
  strong = false,
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { elevation?: 1 | 2 | 3; strong?: boolean }) {
  return (
    <div className={cx(strong ? 'glass-strong' : 'glass', shadow[elevation], className)} {...rest} />
  )
}
```

`apps/web/src/ui/skeleton.tsx`:

```tsx
import { cx } from './cx'

/** A loading placeholder block; static under reduced motion. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx('block rounded-lg bg-border-primary motion-safe:animate-pulse', className)}
    />
  )
}
```

- [ ] **Step 4: Run the tests.** Run `cd apps/web && bunx vitest run src/ui`. Expected: PASS.

- [ ] **Step 5: Run the gate and commit.**
  - Run the full gate. Expected: all pass.
  - Check the branch, then commit:

```bash
git branch --show-current   # phase-5j-ui-foundation
git add apps/web/src/ui
git commit -m "feat(web): button, icon button, chip, badge, glass panel and skeleton"
```

---

### Task 5: Toast

**Files:**
- Create: `apps/web/src/ui/toast.tsx`, `apps/web/src/ui/toast.test.tsx`
- Delete: `apps/web/src/app/toast.tsx`
- Modify (import path only): `apps/web/src/app/providers.tsx`, `apps/web/src/shop/use-shop-actions.ts`, `apps/web/src/editors/use-editor-mutation.ts`, `apps/web/src/economy/use-claim-daily.ts`, `apps/web/src/layout/app-shell.tsx`, `apps/web/src/tasks/use-task-actions.ts`

**Interfaces:**
- Consumes: `Button` (Task 4), `Icon` (Task 2), `cx` (Task 3).
- Produces:
  - `type ToastTone = 'neutral' | 'success' | 'error'`.
  - `type ToastOptions = { tone?: ToastTone; action?: { label: string; onAction: () => void } }`.
  - `ToastProvider` and `useToast(): { show(message: string, options?: ToastOptions): void }`.
  - `show(message)` keeps working, with the neutral tone.
  - The container keeps `role="status"` and `aria-live="polite"`, and toasts still dismiss after 5000 ms.

- [ ] **Step 1: Write the failing test.** Create `apps/web/src/ui/toast.test.tsx`:

```tsx
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { type ToastOptions, ToastProvider, useToast } from './toast'

function Trigger({ message, options }: { message: string; options?: ToastOptions }) {
  const toast = useToast()
  return (
    <button type="button" onClick={() => toast.show(message, options)}>
      fire
    </button>
  )
}

const setup = (message: string, options?: ToastOptions) =>
  render(
    <ToastProvider>
      <Trigger message={message} options={options} />
    </ToastProvider>,
  )

describe('Toast', () => {
  afterEach(() => vi.useRealTimers())

  test('shows a message in the live region and dismisses after 5 s', () => {
    vi.useFakeTimers()
    setup('Saved')
    act(() => screen.getByRole('button', { name: 'fire' }).click())
    expect(screen.getByRole('status')).toHaveTextContent('Saved')
    act(() => vi.advanceTimersByTime(5000))
    expect(screen.getByRole('status')).not.toHaveTextContent('Saved')
  })

  test('error tone marks the toast', () => {
    setup('Could not save', { tone: 'error' })
    act(() => screen.getByRole('button', { name: 'fire' }).click())
    expect(screen.getByText('Could not save').closest('[data-tone]')).toHaveAttribute(
      'data-tone',
      'error',
    )
  })

  test('an action runs once, dismisses at once, and the timer later does nothing', async () => {
    const onAction = vi.fn()
    const user = userEvent.setup()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    setup('Task deleted', { action: { label: 'Undo', onAction } })
    await user.click(screen.getByRole('button', { name: 'fire' }))
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(onAction).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Task deleted')).toBeNull()
    act(() => vi.advanceTimersByTime(5000))
    expect(screen.queryByText('Task deleted')).toBeNull()
  })

  test('useToast outside the provider throws', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Trigger message="x" />)).toThrow('useToast must be used inside')
    spy.mockRestore()
  })
})
```

- [ ] **Step 2: Run it to see it fail.** Run `cd apps/web && bunx vitest run src/ui/toast.test.tsx`. Expected: FAIL, because the module is missing.

- [ ] **Step 3: Implement.** Create `apps/web/src/ui/toast.tsx`:

```tsx
import { CheckCircle, Info, WarningCircle } from '@phosphor-icons/react'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Button } from './button'
import { Icon } from './icon'

export type ToastTone = 'neutral' | 'success' | 'error'
export type ToastOptions = { tone?: ToastTone; action?: { label: string; onAction: () => void } }
type Toast = { id: number; message: string; tone: ToastTone; action?: ToastOptions['action'] }
type ToastApi = { show(message: string, options?: ToastOptions): void }

const ToastContext = createContext<ToastApi | null>(null)
const DISMISS_AFTER_MS = 5000

const toneIcon = {
  neutral: { icon: Info, className: 'text-brand' },
  success: { icon: CheckCircle, className: 'text-leaf-text' },
  error: { icon: WarningCircle, className: 'text-coral-text' },
} as const

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id)
    if (timer !== undefined) clearTimeout(timer)
    timers.current.delete(id)
    setToasts((current) => current.filter((t) => t.id !== id))
  }, [])

  const show = useCallback(
    (message: string, options: ToastOptions = {}) => {
      const id = Date.now() + Math.random()
      const tone = options.tone ?? 'neutral'
      setToasts((current) => [...current, { id, message, tone, action: options.action }])
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), DISMISS_AFTER_MS),
      )
    },
    [dismiss],
  )

  // Unmounting the provider must not leave timers firing into a dead tree.
  useEffect(() => {
    const live = timers.current
    return () => {
      for (const timer of live.values()) clearTimeout(timer)
      live.clear()
    }
  }, [])

  const value = useMemo(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            data-tone={t.tone}
            className="glass-strong pointer-events-auto flex max-w-sm items-center gap-2 rounded-xl py-2 pr-2 pl-3 text-label text-text-primary shadow-2"
          >
            <Icon icon={toneIcon[t.tone].icon} className={toneIcon[t.tone].className} />
            <p className="flex-1">{t.message}</p>
            {t.action && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  t.action?.onAction()
                  dismiss(t.id)
                }}
              >
                {t.action.label}
              </Button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const toast = useContext(ToastContext)
  if (!toast) throw new Error('useToast must be used inside <ToastProvider>')
  return toast
}
```

- [ ] **Step 4: Move the callers.**
  - Delete `apps/web/src/app/toast.tsx`.
  - Replace `from '../app/toast'` with `from '../ui/toast'` in `shop/use-shop-actions.ts`, `editors/use-editor-mutation.ts`, `economy/use-claim-daily.ts`, `layout/app-shell.tsx` and `tasks/use-task-actions.ts`.
  - In `app/providers.tsx`, replace `from './toast'` with `from '../ui/toast'`.
  - Then run `grep -rn "app/toast\|from './toast'" apps/web/src`. Expected: no output.

- [ ] **Step 5: Run the tests.** Run `cd apps/web && bunx vitest run`. Expected: PASS, including the existing toast assertions in `task-panel.test.tsx` and `forms.test.tsx`, which read `role="status"`.

- [ ] **Step 6: Run the gate and commit.**
  - Run the full gate. Expected: all pass.
  - Check the branch, then commit:

```bash
git branch --show-current   # phase-5j-ui-foundation
git add -A apps/web/src/ui apps/web/src/app apps/web/src/shop apps/web/src/editors apps/web/src/economy apps/web/src/layout apps/web/src/tasks
git commit -m "feat(web): glass toast with tones and an optional action, moved into the kit"
```

---

### Task 6: Migrate the shell and the world chrome

**Files:**
- Modify: `apps/web/src/layout/app-shell.tsx`, `apps/web/src/economy/economy-bar.tsx`, `apps/web/src/world/world-hud.tsx`, `apps/web/src/world/layer-picker.tsx`, `apps/web/src/world/uncharted-card.tsx`, `apps/web/src/world/card-world.tsx`, `apps/web/src/layout/world-screen.tsx` (the loading, error, missing and stale-data blocks only), `apps/web/src/world/world-view.tsx` (the Suspense fallback only), `apps/web/src/app/router.tsx` (`RouterError` only)
- Modify tests (selectors and glyphs only): `apps/web/src/economy/economy-bar.test.tsx`, `apps/web/src/layout/world-scene-integration.test.tsx`

**Interfaces:**
- Consumes: `Button`, `IconButton`, `buttonClass` (Task 4); `Popover`, `PopoverTrigger`, `PopoverContent`, `cx` (Task 3); `Icon` (Task 2); `SuppliesIcon`, `ChestIcon` (Task 2); `GlassPanel` (Task 4).
- Produces:
  - The back links' accessible names become `Back to Archipelago` and `Back to {project name}`. Their visible text is `Archipelago` and `{project name}` after an `ArrowLeft` icon. This avoids clashing with the header logo link, which is also named "Archipelago".
  - Every other accessible name is unchanged.

The edits below are the whole change for each file. Anything not mentioned stays byte-for-byte.

- [ ] **Step 1: Update the two tests first, so they fail.**
  - `economy/economy-bar.test.tsx`:
    - `toHaveTextContent('◆ 15')` becomes `toHaveTextContent('15')`.
    - `toHaveClass('text-error')` (line 54) becomes `toHaveClass('text-coral-text')`.
  - `layout/world-scene-integration.test.tsx`:
    - every `{ name: '← Archipelago' }` becomes `{ name: 'Back to Archipelago' }`;
    - every `{ name: '← Beta' }` becomes `{ name: 'Back to Beta' }`.
  - Run `cd apps/web && bunx vitest run src/economy/economy-bar.test.tsx src/layout/world-scene-integration.test.tsx`. Expected: FAIL on exactly those assertions.

- [ ] **Step 2: `layout/app-shell.tsx`.**
  - Add the imports `import { Sailboat, SignOut } from '@phosphor-icons/react'` and `import { Icon } from '../ui/icon'`.
  - Replace the returned JSX's `<header>` with:

```tsx
      <header className="flex h-14 shrink-0 items-center justify-between gap-2 bg-brand pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] text-text-on-brand shadow-1">
        <Link
          to="/"
          aria-label="Archipelago"
          className="flex min-h-11 items-center gap-2 text-title font-heading"
        >
          <Icon icon={Sailboat} size={24} active />
          <span aria-hidden className="hidden sm:inline">
            Archipelago
          </span>
        </Link>
        <EconomyBar />
        <button
          type="button"
          onClick={() => logout.mutate()}
          className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3 text-label font-label hover:bg-brand-secondary"
        >
          <Icon icon={SignOut} />
          <span className="sr-only sm:not-sr-only">Log out</span>
        </button>
      </header>
```

  This header is temporary: 5k removes it, so it doesn't go through `Button`, whose variants have no on-brand style. "Log out" stays the accessible name at every width.

- [ ] **Step 3: `economy/economy-bar.tsx`.** Replace the whole file with:

```tsx
import { Fire } from '@phosphor-icons/react'
import type { WorldDto } from '@archipelago/shared'
import { Button } from '../ui/button'
import { cx } from '../ui/cx'
import { Icon } from '../ui/icon'
import { ChestIcon, SuppliesIcon } from '../ui/icons'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { useWorld } from '../world/use-world'
import { useClaimDaily } from './use-claim-daily'
import { useCountUp } from './use-count-up'

const pill =
  'inline-flex items-center gap-1 rounded-full bg-surface-primary px-2 py-1 text-label font-heading tabular-nums shadow-1 sm:px-3'

function BalanceChip({ balance }: { balance: number }) {
  const shown = useCountUp(balance)
  return (
    <span
      role="img"
      aria-label={`${balance} Supplies`}
      className={cx(pill, balance < 0 ? 'text-coral-text' : 'text-text-primary')}
    >
      <SuppliesIcon size={16} /> {shown}
    </span>
  )
}

/** The streak chip; a tap shows the next-bonus hint that `title` alone hid from touch screens. */
function StreakChip({ streak }: { streak: WorldDto['economy']['streak'] }) {
  const hint = streak.next
    ? `Next bonus at ${streak.next.days} days: +${streak.next.amount}`
    : 'Top streak bonus reached'
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`${streak.days}-day streak`}
        title={hint}
        className="flex min-h-11 items-center"
      >
        <span className={cx(pill, streak.activeToday ? 'text-coral-text' : 'text-text-secondary')}>
          <Icon icon={Fire} size={16} active={streak.activeToday} />
          {streak.days}d
        </span>
      </PopoverTrigger>
      <PopoverContent align="end">{hint}</PopoverContent>
    </Popover>
  )
}

export function EconomyBar() {
  const { data: world } = useWorld()
  const claim = useClaimDaily()
  if (!world) return null
  const { balance, streak, daily } = world.economy

  return (
    <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
      <BalanceChip balance={balance} />
      <StreakChip streak={streak} />
      {!daily.claimedToday && (
        <Button
          variant="accent"
          size="sm"
          aria-label={`Claim +${daily.amount}`}
          loading={claim.isPending}
          onClick={() => claim.mutate()}
        >
          {!claim.isPending && <ChestIcon size={20} />}
          <span aria-hidden className="sm:hidden">
            +{daily.amount}
          </span>
          <span aria-hidden className="hidden sm:inline">
            Claim +{daily.amount}
          </span>
        </Button>
      )}
    </div>
  )
}
```

  The Popover keeps every streak behaviour the tests pin: `aria-expanded`, `title`, tap to toggle, closing on an outside pointerdown even without a blur, and Escape closing it with focus returning. The custom document listeners are gone.

- [ ] **Step 4: `world/world-hud.tsx`.**
  - Add the imports `import { ArrowLeft } from '@phosphor-icons/react'` and `import { Icon } from '../ui/icon'`.
  - Replace the `chip` constant with:

```ts
const chip =
  'glass pointer-events-auto inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-label font-label shadow-2'
```

  - Replace the two back links' contents:

```tsx
              <Link to="/" aria-label="Back to Archipelago" className={`${chip} text-brand`}>
                <Icon icon={ArrowLeft} />
                Archipelago
              </Link>
```

```tsx
              <Link
                to="/p/$projectId"
                params={{ projectId: project.id }}
                aria-label={`Back to ${project.name}`}
                className={`${chip} text-brand`}
              >
                <Icon icon={ArrowLeft} />
                {project.name}
              </Link>
```

  - Every other chip keeps its text, and `text-brand` or `text-text-secondary`. Both are allowed on the plain glass (spec 25.1).

- [ ] **Step 5: `world/layer-picker.tsx`.** Replace `selectClass` with:

```ts
const selectClass =
  'glass min-h-11 max-w-[70vw] truncate rounded-full px-4 text-label font-label text-text-primary shadow-2'
```

  The native `<select>` stays until 5k replaces it with the Islands tab.

- [ ] **Step 6: `world/uncharted-card.tsx`.** Replace the file body with:

```tsx
import { GlassPanel } from '../ui/glass-panel'
import { Button } from '../ui/button'

/** The empty world's prompt (spec 17.4): over the ghost island, or in the card view. */
export function UnchartedCard({ onCreate }: { onCreate?: () => void }) {
  return (
    <GlassPanel
      strong
      className="flex w-64 flex-col items-center gap-3 rounded-2xl p-4 text-center"
    >
      <h2 className="text-title font-heading text-text-primary">Uncharted waters</h2>
      {onCreate && <Button onClick={onCreate}>Create your first island</Button>}
    </GlassPanel>
  )
}
```

  Sort the imports as Biome wants: `bunx biome check --write`.

- [ ] **Step 7: `world/card-world.tsx`.**
  - Add the imports:

```ts
import { ArrowLeft, Flag, PencilSimple, Plus } from '@phosphor-icons/react'
import { Chip } from '../ui/chip'
import { Icon } from '../ui/icon'
import { Button } from '../ui/button'
```

  - Replace `card` and `actionButton` with:

```ts
const card =
  'flex min-h-28 w-64 shrink-0 flex-col justify-between rounded-2xl bg-surface-primary p-4 text-left shadow-1'
const newCard =
  'flex min-h-28 w-64 shrink-0 items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border-secondary p-4 text-label font-label text-brand hover:border-brand-secondary'
const backLink = 'inline-flex min-h-11 items-center gap-1.5 text-label font-label text-brand'
```

  - Make these edits inside the component:
    - Each island card's urgency line becomes:

```tsx
              <span className="flex gap-1">
                {s.overdue > 0 && <Chip tone="coral">{s.overdue} overdue</Chip>}
                {s.dueSoon > 0 && <Chip tone="gold">{s.dueSoon} due soon</Chip>}
              </span>
```

    - Card titles: `font-semibold text-text-primary` becomes `text-title font-heading text-text-primary`.
    - The "New island" button becomes:

```tsx
            <button type="button" onClick={onNewProject} className={newCard}>
              <Icon icon={Plus} />
              New island
            </button>
```

    - The "New milestone" button becomes the same, with the `Flag` icon and the text `New milestone`.
    - The island view's back link becomes:

```tsx
          <Link to="/" aria-label="Back to Archipelago" className={backLink}>
            <Icon icon={ArrowLeft} />
            Archipelago
          </Link>
```

    - The district view's back link becomes:

```tsx
          <Link
            to="/p/$projectId"
            params={{ projectId: project.id }}
            aria-label={`Back to ${project.name}`}
            className={backLink}
          >
            <Icon icon={ArrowLeft} />
            {project.name}
          </Link>
```

    - Both "Edit island" and "Edit milestone" become:

```tsx
            <Button variant="ghost" size="sm" icon={PencilSimple} onClick={onEditProject}>
              Edit island
            </Button>
```

    (Use `onEditMilestone` and the text `Edit milestone` for the second.)
  - `world-screen.test.tsx` asserts `overflow-x-auto` on the island cards row. Keep that class.

- [ ] **Step 8: `layout/world-screen.tsx`, the status blocks.**
  - Add the imports `import { ArrowClockwise } from '@phosphor-icons/react'`, `import { Button } from '../ui/button'` and `import { Skeleton } from '../ui/skeleton'`.
  - Delete the `retryButton` constant.
  - Replace the loading line with:

```tsx
  if (world.isPending) {
    return (
      <div className="space-y-3 p-4" aria-busy="true">
        <p className="text-label text-text-secondary">Loading your islands…</p>
        <Skeleton className="h-28 w-64" />
        <Skeleton className="h-4 w-48" />
      </div>
    )
  }
```

  - In the error block, the paragraph becomes `className="text-body text-error"` and the retry becomes:

```tsx
        <Button variant="ghost" icon={ArrowClockwise} onClick={() => void world.refetch()}>
          Try again
        </Button>
```

  - In the missing block, the link becomes `className={buttonClass('ghost')}`, imported from `../ui/button` beside `Button`.
  - In the stale-data strip:
    - the wrapper becomes `className="flex items-center justify-between gap-2 bg-gold-tint px-4 text-label text-gold-text"`;
    - its retry becomes `<Button variant="ghost" size="sm" icon={ArrowClockwise} onClick={() => void world.refetch()}>Try again</Button>`.

- [ ] **Step 9: `world/world-view.tsx` and `app/router.tsx`.**
  - World view: the Suspense fallback becomes `<p className="p-4 text-label font-label text-text-on-brand">Loading the world…</p>`. This is unchanged except for the type classes.
  - `RouterError`:
    - the alert gets `className="text-body text-error"`;
    - the button becomes `<Button onClick={() => void router.invalidate()}>Try again</Button>`, with `import { Button } from '../ui/button'`.

- [ ] **Step 10: Run the tests.** Run `cd apps/web && bunx vitest run`. Expected: PASS. Then run `bunx biome check --write` on every touched file.

- [ ] **Step 11: Run the gate and commit.**
  - Run the full gate. Expected: all pass.
  - Check the branch, then commit:

```bash
git branch --show-current   # phase-5j-ui-foundation
git add apps/web/src
git commit -m "feat(web): shell, economy, HUD and card view on the kit: icons, glass chips, popover streak"
```

---

### Task 7: Migrate the task panel, the shop and the panel frame

**Files:**
- Modify: `apps/web/src/editors/fields.tsx` (`inputClass` only), `apps/web/src/tasks/task-row.tsx`, `apps/web/src/tasks/task-panel.tsx`, `apps/web/src/shop/shop-panel.tsx`, `apps/web/src/shop/building-bar.tsx`, `apps/web/src/shop/placement-bar.tsx`, `apps/web/src/layout/panel-frame.tsx` (classes and the collapse button only)

**Interfaces:**
- Consumes: `Button`, `IconButton` (Task 4); `Chip` (Task 4); `Icon`, `SuppliesIcon` (Task 2).
- Produces:
  - `inputClass`, restyled. Task 8's editors and login consume it.
  - Every accessible name, toolbar label, description and copy string is unchanged. That includes `Place · 30`, `Cancel`, `Remove (+N)`, `Need N more`, `Overdue · {date}`, `Due soon · {date}`, `Mark "…" as …`, `Edit "…"`, `Delete "…"`, `Collapse task panel`, `Expand task panel` and `Resize task sheet`.

- [ ] **Step 1: Baseline.** Run `cd apps/web && bunx vitest run src/tasks src/shop src/layout`. Expected: PASS. These suites are the regression net for this task; no new tests are added.

- [ ] **Step 2: `editors/fields.tsx`.**
  - Replace `inputClass` with:

```ts
export const inputClass =
  'min-h-11 w-full rounded-xl border border-border-secondary bg-surface-primary px-3 text-body text-text-primary placeholder:text-text-tertiary focus:border-brand-secondary focus:ring-2 focus:ring-brand-secondary/20 focus:outline-none'
```

  - In `Field`:
    - the label class becomes `block text-label font-label text-text-secondary`;
    - the error paragraph class becomes `text-label text-error`.

- [ ] **Step 3: `tasks/task-row.tsx`.**
  - Add the imports:

```ts
import { Check, Hammer, PencilSimple, Trash } from '@phosphor-icons/react'
import { Button } from '../ui/button'
import { Icon } from '../ui/icon'
```

  - Replace `statusStyle` and `statusGlyph` with:

```ts
const statusStyle = {
  todo: 'border-border-secondary bg-surface-primary text-text-tertiary',
  doing: 'border-brand-secondary bg-brand-secondary/10 text-brand-secondary',
  done: 'border-leaf bg-leaf text-text-on-brand',
} as const
const statusIcon = { todo: null, doing: Hammer, done: Check } as const
```

  - Make these edits in the JSX:
    - The row `<li>` class becomes `flex items-start gap-3 border-b border-border-primary px-4 py-3` plus `bg-brand-secondary/10` when selected (the same condition as now).
    - The status button's class becomes ``flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 disabled:opacity-60 ${statusStyle[task.status]}``.
    - Add `const StatusIcon = statusIcon[task.status]` after `const due = …`. The button's child becomes:

```tsx
        {StatusIcon && <Icon icon={StatusIcon} size={24} />}
```

    - The title paragraph gets `text-body` added in both branches.
    - The meta line's class becomes `text-meta text-text-secondary`.
    - The overdue span becomes `text-coral-text` (was `text-error`), and the due-soon span becomes `text-gold-text` (was `text-warning`).
    - The Edit button becomes:

```tsx
        <Button
          variant="ghost"
          size="sm"
          icon={PencilSimple}
          aria-label={`Edit "${task.title}"`}
          onClick={() => onEdit(task)}
        >
          Edit
        </Button>
```

    - The Delete button becomes:

```tsx
      <Button
        variant="danger"
        size="sm"
        icon={Trash}
        aria-label={`Delete "${task.title}"`}
        disabled={busy}
        onClick={onDelete}
      >
        Delete
      </Button>
```

  - On phones the two text buttons crowd a 390px row. Hide the words below `sm` by wrapping each label in `<span className="sr-only sm:not-sr-only">…</span>`. The `aria-label` stays the accessible name.

- [ ] **Step 4: `tasks/task-panel.tsx`.**
  - Add the imports:

```ts
import { MagnifyingGlass, Plus } from '@phosphor-icons/react'
import { inputClass } from '../editors/fields'
import { Button } from '../ui/button'
import { Icon } from '../ui/icon'
```

  - Make these edits:
    - The heading class becomes `text-heading font-heading text-text-primary`.
    - The New task button becomes `<Button size="sm" icon={Plus} onClick={onNewTask} className="ml-auto">New task</Button>`.
    - The search label becomes:

```tsx
      <label className="relative block px-4 py-2">
        <span className="sr-only">Search tasks</span>
        <Icon
          icon={MagnifyingGlass}
          className="pointer-events-none absolute top-1/2 left-7 -translate-y-1/2 text-text-tertiary"
        />
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tasks"
          className={`${inputClass} pl-10`}
        />
      </label>
```

    - The empty paragraph becomes `px-4 py-6 text-center text-body text-text-secondary`.

- [ ] **Step 5: The shop files.**
  - `shop/shop-panel.tsx`:
    - Add the imports `import { Chip } from '../ui/chip'` and `import { SuppliesIcon } from '../ui/icons'`.
    - The item `<li>` class becomes `rounded-xl bg-surface-secondary`.
    - The button class becomes `flex min-h-11 w-full items-center gap-2 rounded-xl p-2 text-left hover:bg-brand-secondary/10 disabled:opacity-50`.
    - The name span becomes `text-label font-label text-text-primary`.
    - The price span becomes:

```tsx
                  <Chip tone="gold" className="mt-1 self-start">
                    <SuppliesIcon size={16} />
                    {item.price}
                    <span className="sr-only"> Supplies</span>
                  </Chip>
```

    - The reason paragraph becomes `px-2 pb-2 text-caption font-label text-coral-text`.
    - The "No free land" paragraph becomes `text-label text-text-secondary`.
  - `shop/building-bar.tsx`:
    - Add the imports `import { Trash } from '@phosphor-icons/react'` and `import { Button } from '../ui/button'`.
    - `bar` becomes `'pointer-events-auto flex min-h-11 items-center justify-between gap-2 rounded-xl bg-surface-primary px-3 py-1 shadow-2'`.
    - The name paragraph becomes `text-label font-label text-text-primary`.
    - The remove button becomes:

```tsx
      <Button
        variant="danger"
        size="sm"
        icon={Trash}
        disabled={pending}
        onClick={() => {
          if (window.confirm(`Remove ${name} for ${refund} Supplies back?`)) onRemove()
        }}
      >
        Remove (+{refund})
      </Button>
```

  - `shop/placement-bar.tsx`:
    - Replace the imports with `import { X } from '@phosphor-icons/react'`, `import type { ShopItemDto } from '@archipelago/shared'` and `import { Button } from '../ui/button'`.
    - Delete `action`.
    - `bar` becomes the same string as in `building-bar.tsx`.
    - The confirm button becomes:

```tsx
        <Button size="sm" loading={pending} onClick={onConfirm}>
          {pending ? 'Placing…' : `Place · ${item.price}`}
        </Button>
```

    - The hint paragraph becomes `text-label text-text-secondary`.
    - The cancel button becomes `<Button variant="ghost" size="sm" icon={X} onClick={onCancel}>Cancel</Button>`.

- [ ] **Step 6: `layout/panel-frame.tsx`, classes and the collapse button only.** Behaviour, handlers, `data-testid`s, ARIA and sizes are untouched.
  - Add the imports `import { CaretDoubleLeft, CaretDoubleRight } from '@phosphor-icons/react'` and `import { Icon } from '../ui/icon'`.
  - Phone sheet `<section>`: the class becomes `fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-[640px] flex-col rounded-t-2xl bg-surface-primary shadow-3`. The `border-t border-border-primary` and `shadow-2xl` go.
  - Desktop `<aside>`: the class becomes `relative flex h-full shrink-0 flex-col border-l border-border-primary bg-surface-primary shadow-1`.
  - `toggleButton` becomes `'flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-text-secondary hover:bg-surface-secondary'`.
  - The toggle's child `<span aria-hidden>{open ? '»' : '«'}</span>` becomes `<Icon icon={open ? CaretDoubleRight : CaretDoubleLeft} />`.
  - The `aria-label`, `title`, `aria-expanded` and `aria-controls` stay. This is deliberately not an `IconButton`: its tooltip would duplicate the existing `title` with the shortcut hint.

- [ ] **Step 7: Run the tests.** Run `cd apps/web && bunx vitest run`. Expected: PASS. Then run `bunx biome check --write` on the touched files.

- [ ] **Step 8: Run the gate and commit.**
  - Run the full gate. Expected: all pass.
  - Check the branch, then commit:

```bash
git branch --show-current   # phase-5j-ui-foundation
git add apps/web/src
git commit -m "feat(web): task rows, shop and panels on the kit: status icons, gold price chips, icon actions"
```

---

### Task 8: Migrate the editors and the login page

**Files:**
- Modify: `apps/web/src/editors/editor-frame.tsx`, `apps/web/src/editors/editor-frame.test.tsx`, `apps/web/src/editors/project-form.tsx`, `apps/web/src/editors/milestone-form.tsx`, `apps/web/src/editors/task-form.tsx`, `apps/web/src/auth/login-page.tsx`

**Interfaces:**
- Consumes: `Dialog`, `Sheet` (Task 3); `Button` (Task 4); `inputClass` and `Field` (restyled in Task 7); `Icon` (Task 2).
- Produces: `EditorFrame({ title, onClose, children })`, with the same props. On desktop it is a Radix `Dialog` with `data-testid="editor-dialog"`; on phones a `Sheet` with `data-testid="editor-sheet"`.

- [ ] **Step 1: Rewrite the EditorFrame test so it fails.** Replace `apps/web/src/editors/editor-frame.test.tsx` with:

```tsx
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { setDesktop } from '../test/viewport'
import { EditorFrame } from './editor-frame'

const ui = (onClose = () => {}) => (
  <EditorFrame title="Edit island" onClose={onClose}>
    <label>
      Name
      <input />
    </label>
  </EditorFrame>
)

describe('EditorFrame', () => {
  test('crossing the breakpoint while open re-opens the editor in the new layout', () => {
    setDesktop(true)
    render(ui())
    expect(screen.getByTestId('editor-dialog')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveFocus()
    act(() => setDesktop(false))
    expect(screen.queryByTestId('editor-dialog')).toBeNull()
    expect(screen.getByTestId('editor-sheet')).toBeInTheDocument()
    act(() => setDesktop(true))
    expect(screen.getByTestId('editor-dialog')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveFocus()
  })

  test('on desktop, Escape and the Close button both close it', async () => {
    setDesktop(true)
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(ui(onClose))
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  test('the dialog is titled by its heading', () => {
    setDesktop(true)
    render(ui())
    expect(screen.getByRole('dialog', { name: 'Edit island' })).toBeInTheDocument()
  })
})
```

  Run `cd apps/web && bunx vitest run src/editors/editor-frame.test.tsx`. Expected: FAIL, because there is no `editor-dialog` test id.

- [ ] **Step 2: Implement `editors/editor-frame.tsx`.** Replace the file with:

```tsx
import type { ReactNode } from 'react'
import { useIsDesktop } from '../layout/use-is-desktop'
import { Dialog } from '../ui/dialog'
import { Sheet } from '../ui/sheet'

/**
 * A centred dialog on desktop, a full-height sheet on a phone. Each layout mounts its own element,
 * so crossing the breakpoint while open re-opens the editor in the new layout (spec 16.6). Only the
 * desktop dialog moves focus to the first field; on a phone that would pop the keyboard.
 */
export function EditorFrame({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const isDesktop = useIsDesktop()
  if (isDesktop) {
    return (
      <Dialog
        open
        onOpenChange={(open) => !open && onClose()}
        title={title}
        testId="editor-dialog"
      >
        {children}
      </Dialog>
    )
  }
  return (
    <Sheet open onClose={onClose} title={title} testId="editor-sheet">
      {children}
    </Sheet>
  )
}
```

  Run the file's tests. Expected: PASS.

- [ ] **Step 3: The three forms.**
  - Each file drops its `primary`, `secondary` and `danger` constants and imports `import { Button } from '../ui/button'`.
  - `project-form.tsx`:

```tsx
        <Button type="submit" disabled={busy}>
          {project ? 'Save' : 'Create island'}
        </Button>
```

  and, inside `{project && (…)}`:

```tsx
            <Button variant="ghost" disabled={busy} onClick={() => archive.mutation.mutate()}>
              Archive island
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => {
                if (window.confirm(`Delete "${project.name}" and everything on it?`)) {
                  remove.mutation.mutate()
                }
              }}
            >
              Delete island
            </Button>
```

  - `milestone-form.tsx`: the submit button becomes `<Button type="submit" disabled={busy}>…</Button>`, and the delete button becomes `<Button variant="danger" disabled={busy} onClick={…}>Delete milestone</Button>`, with the same `onClick` body.
  - `task-form.tsx`: the submit button becomes `<Button type="submit" loading={save.mutation.isPending}>{task ? 'Save' : 'Create task'}</Button>`.
  - In all three, the form-level error paragraph's class becomes `text-label text-error`.
  - The textarea keeps `${inputClass} py-2`.
  - Selects and the date input keep `inputClass`, now restyled.

- [ ] **Step 4: `auth/login-page.tsx`.**
  - Delete the local `inputClass`, and import `inputClass` from `../editors/fields`. Also import `import { Sailboat } from '@phosphor-icons/react'`, `import { Button } from '../ui/button'` and `import { Icon } from '../ui/icon'`.
  - The returned JSX becomes:

```tsx
    <main className="flex min-h-dvh items-center justify-center bg-brand px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-2xl bg-surface-primary p-6 shadow-3"
      >
        <div className="flex items-center gap-2 text-brand">
          <Icon icon={Sailboat} size={32} active />
          <span className="text-display font-heading">Archipelago</span>
        </div>
        <h1 className="text-heading font-heading text-text-primary">Sign in</h1>
        <label className="block space-y-1 text-label font-label text-text-secondary">
          <span>Email</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block space-y-1 text-label font-label text-text-secondary">
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </label>
        {error && (
          <p role="alert" className="text-label text-error">
            {error}
          </p>
        )}
        <Button type="submit" loading={login.isPending} className="w-full">
          Sign in
        </Button>
      </form>
    </main>
```

  The animated login backdrop is 5l; this only moves the page onto the kit.

- [ ] **Step 5: Run the tests.** Run `cd apps/web && bunx vitest run`. Expected: PASS, including `forms.test.tsx`, `world-empty.test.tsx`, `world-scene-integration.test.tsx` (`getByRole('dialog')`, its heading, and the "Close" and "Create island" buttons) and `login-page.test.tsx`.
  - If a test fails because `getByRole('dialog')` now matches two elements: vaul's sheet and Radix's dialog never mount together, but check for a stale portal. Every test cleans up via `cleanup()` in `setup.ts`.
  - If a test fails because Radix's modal sets `pointer-events: none` on `body` and a user-event click outside the dialog throws: that click is behaviour the old `<dialog>` also blocked. Fix the test to close the dialog first, and note it in the report.

- [ ] **Step 6: Run the gate and commit.**
  - Run the full gate. Expected: all pass.
  - Check the branch, then commit:

```bash
git branch --show-current   # phase-5j-ui-foundation
git add apps/web/src
git commit -m "feat(web): editors on a Radix dialog and the kit sheet, forms and login on kit buttons"
```

---

### Task 9: Bundle budget, sweep and visual sheet

**Files:**
- Create: `apps/web/scripts/check-bundle.ts`
- Modify: `apps/web/package.json` (the `bundle:check` script)

**Interfaces:**
- Produces: `bun run --cwd apps/web bundle:check`. It exits 0 when the initial JS gzip is at or below `PHASE_CEILING_KB` (224.63), and 1 otherwise, printing the measurement.

- [ ] **Step 1: Write the script.** Create `apps/web/scripts/check-bundle.ts`:

```ts
// Measures the initial JS (scripts index.html loads, plus their modulepreloads) after `vite build`.
// Spec 25.5: at most +60 kB gzip over the pre-5j baseline across 5j–5m; 5j holds 15 kB back.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const BASELINE_KB = 179.63
const PHASE_CEILING_KB = 224.63
const SPEC_CEILING_KB = BASELINE_KB + 60

const dist = join(import.meta.dirname, '..', 'dist')
const html = readFileSync(join(dist, 'index.html'), 'utf8')
const files = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1] ?? '')
const kb = files.reduce((sum, f) => sum + gzipSync(readFileSync(join(dist, f))).length / 1000, 0)

console.log(`initial JS ${kb.toFixed(2)} kB gzip (${files.join(', ')})`)
console.log(`baseline ${BASELINE_KB}, 5j ceiling ${PHASE_CEILING_KB}, spec ceiling ${SPEC_CEILING_KB}`)
if (kb > PHASE_CEILING_KB) {
  console.error('over budget')
  process.exit(1)
}
```

  Add `"bundle:check": "bun scripts/check-bundle.ts"` to `apps/web/package.json` `scripts`.

- [ ] **Step 2: Measure.** Run `bun run build && bun run --cwd apps/web bundle:check` from the repo root. Expected: exit 0, and the printed figure goes in the report.
  - Note: Node's gzip and Vite's reporter can differ by about 2% (the Vite figure on master was 179.63 kB, Node's measured 175.4 KiB = 179.6 kB). The baseline is Vite's, so compare like with like: read the `index-*.js` gzip figure from Vite's build output too, and report both.
  - If it is over budget: check the lazy-scene boundary first, i.e. that nothing in `ui/` pulls in `scene/` or three, using `grep -rn "scene/\|from 'three'" apps/web/src/ui`. Then check that Phosphor imports are all named imports from `@phosphor-icons/react`, not `/dist/…` or barrel re-exports.

- [ ] **Step 3: Sweep for leftovers.** From `apps/web/src`, excluding `scene/` and tests:
  - `grep -rn "◆\|⛵\|»\|«\|←\|statusGlyph" --include=*.tsx . | grep -v "\.test\." | grep -v "^./scene/"`. Expected: no output.
  - `grep -rn "rounded-md bg-brand\|text-error\b" --include=*.tsx . | grep -v "\.test\." | grep -v "^./scene/"`. Expected: only form and alert error text (`role="alert"` paragraphs and `Field` errors), which keep `text-error` on solid surfaces.
  - `grep -rn "#[0-9a-fA-F]\{6\}" --include=*.tsx ./ui ./layout ./world ./tasks ./shop ./editors ./economy ./auth ./app`. Expected: no output.

  Fix anything else the sweep finds, using the kit.

- [ ] **Step 4: Visual sheet, done by the controller and not by a subagent.**
  - Dev servers: web on :5173, API on :3100. Seed with `bun run seed:demo`.
  - Use Playwright with headless Chromium (`--use-gl=angle --use-angle=swiftshader`) to capture, at 1440×900 and at 390×844:
    - login, the archipelago, an island, a district;
    - the task panel or sheet, the shop, the New task editor, the streak popover open;
    - the archipelago with `?noblur`.
  - Check by eye:
    - Nunito everywhere;
    - icons replacing every glyph;
    - glass HUD chips;
    - gold claim button;
    - coral overdue text;
    - no layout moved compared with master.
  - Attach the sheet to the final review.

- [ ] **Step 5: Run the gate and commit.**
  - Run the full gate. Expected: all pass.
  - Check the branch, then commit:

```bash
git branch --show-current   # phase-5j-ui-foundation
git add apps/web/scripts/check-bundle.ts apps/web/package.json
git commit -m "chore(web): bundle budget check for the initial JS"
```

  If the sweep in Step 3 found and fixed leftovers, commit them separately first with `fix(web): last glyphs and raw controls onto the kit`.

---

## Owner's check

- `bun run seed:demo`, then open the app on desktop and phone. Everything is where it was, but the UI now wears Nunito, Phosphor icons, glass HUD chips, a gold claim chest, coral overdue text and rounded kit buttons.
- Open an editor: focus is in the first field, and Escape closes it.
- Tap the streak: the hint pops up and closes on a tap elsewhere.
- `?noblur`: the glass chips turn solid. `?perf`: no tier drop.
