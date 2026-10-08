# Phase 5a Shop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Buy decorations from a fixed catalogue by placing them on free island plots, and remove them for a half refund.

**Architecture:** The catalogue, land rule and refund maths are pure functions in `packages/shared`, used by the API (authoritative) and the web app (glow set, fake API). The API adds `GET /shop`, `POST /buildings` and `DELETE /buildings/:id`, writing `purchase` / `refund` ledger entries under the project → user lock order. The web app adds a shop panel in `EditorFrame`, a placement mode held in `WorldScreen`, pickable plot glows and a ghost in the scene, and decoration models rendered as instanced meshes.

**Tech Stack:** Bun 1.4, TS 7 strict, zod 4, Hono 4, Drizzle 0.45 + Postgres 16, React 19, TanStack Query/Router, three 0.186 + R3F 9.8, Vitest 5 + RTL, `@react-three/test-renderer`.

**Spec:** `docs/superpowers/specs/2026-10-07-archipelago-task-game-design.md` section 15 (Phase 5a), with sections 12.5, 12.7 and 13.3 for the rules it builds on.

## Global Constraints

- Biome: single quotes, no semicolons, line width 100. `bun run lint` must stay at the one known info.
- TS strict with `noUncheckedIndexedAccess` and `verbatimModuleSyntax` (`import type` for types).
- Prices: pine 30, palm 40, garden 60, lamp 80, well 120, stall 160, fountain 220, statue 350. `refundFor(price) = floor(price × 0.5)`.
- Land rule: `islandRadius` = max hex distance from origin to an occupied hex + 2, minimum 4. Placeable = within `radius − 2`, not occupied, not the commons centre `(0, 0)`. Occupied = task plots, district centres, decoration plots. The radius is measured before the new decoration is added.
- Rotation: `decorationRotation(plot)` in 0…5 (60° steps), chosen by the server.
- Lock order: project (`FOR UPDATE`) then user (`FOR NO KEY UPDATE`), as section 12.7.
- Errors: unknown type / off-land / commons → `422 validation_failed`; occupied (incl. race) → `409 conflict` "That plot is taken"; balance negative → `409 insufficient_supplies` "Balance is negative"; balance below price → `409 insufficient_supplies` "Not enough Supplies"; another user's or an archived project, another user's building → `404`.
- Copy: toast "<Name> placed · −<price>" (U+2212 minus), toast "+<refund> Supplies", confirm "Remove <name> for <refund> Supplies back?", bar "Tap a glowing plot", button "Place · <price>", "Need <n> more", "Balance is negative", "No free land. Islands grow as you add tasks."
- Colours in the scene only from `scenePalette`. Decoration models stay within 0.6 world units of the plot centre horizontally so any rotation stays inside the hex.
- Commit messages: conventional (`feat(web): …`), no AI attribution or `Co-Authored-By` trailer.
- Commands: shared `cd packages/shared && bun test <file>`; API `cd apps/api && bun test <file>` (needs `DATABASE_URL_TEST`); web `cd apps/web && bunx vitest run <file>`; all `bun run test`, `bun run typecheck`, `bun run lint` from the root.

## Review Focus

1. A pan that starts on a glowing plot (pointer moved > 6px) must not move the ghost. Pinned in Task 5.
2. A balance exactly equal to the price buys the item. Pinned in Task 2 (API) and Task 6 (panel).
3. A legacy building whose `type` is not in the catalogue: removing it refunds 0 and writes no ledger row; the scene skips drawing it but it still keeps the island from shrinking. Pinned in Task 2 and Task 4.
4. Double-tapping confirm sends one `POST /buildings`. Pinned in Task 7.
5. A route change while placing (island deleted, back, switcher chip) ends placement with nothing spent. Pinned in Task 7.

---

### Task 1: Shared catalogue, land rule, ledger kind and error code

**Files:**
- Create: `packages/shared/src/shop.ts`, `packages/shared/src/shop.test.ts`
- Create: `packages/shared/src/land.ts`, `packages/shared/src/land.test.ts`
- Modify: `packages/shared/src/index.ts`, `packages/shared/src/domain.ts`, `packages/shared/src/errors.ts`
- Modify: `apps/web/src/scene/model/terrain.ts`, `apps/web/src/scene/model/scene-model.ts`, `apps/web/src/scene/model/foundations.test.ts` (imports only)

**Interfaces:**
- Produces (all exported from `@archipelago/shared`):
  - `DECORATION_TYPES`, `type DecorationType`, `isDecorationType(type: string): type is DecorationType`
  - `type ShopItemDto = { type: DecorationType; name: string; price: number }`, `SHOP_ITEMS: readonly ShopItemDto[]`, `shopItem(type: string): ShopItemDto | undefined`, `refundFor(price: number): number`
  - `placeBuildingInputSchema`, `type PlaceBuildingInput = { projectId: string; type: DecorationType; plotX: number; plotY: number }`
  - `type PlaceBuildingResultDto = { building: BuildingDto; balance: number }`, `type RemoveBuildingResultDto = { refund: number; balance: number }`
  - `MIN_ISLAND_RADIUS = 4`, `SHORE_RINGS = 2`, `islandRadius(occupied: readonly Hex[]): number`, `placeablePlots(occupied: readonly Hex[]): Hex[]`, `isPlaceable(occupied: readonly Hex[], plot: Hex): boolean`, `decorationRotation(plot: Hex): number`
  - `LEDGER_KINDS` gains `'refund'`; `ERROR_CODES` gains `'insufficient_supplies'` (status 409).

- [ ] **Step 1: Write the failing shop test** — `packages/shared/src/shop.test.ts`

```ts
import { describe, expect, test } from 'bun:test'
import {
  DECORATION_TYPES,
  isDecorationType,
  placeBuildingInputSchema,
  refundFor,
  SHOP_ITEMS,
  shopItem,
} from './shop'

describe('shop catalogue', () => {
  test('lists every decoration type once, with the spec prices', () => {
    expect(SHOP_ITEMS.map((i) => [i.type, i.price])).toEqual([
      ['pine', 30],
      ['palm', 40],
      ['garden', 60],
      ['lamp', 80],
      ['well', 120],
      ['stall', 160],
      ['fountain', 220],
      ['statue', 350],
    ])
    expect(SHOP_ITEMS.map((i) => i.type)).toEqual([...DECORATION_TYPES])
    for (const item of SHOP_ITEMS) {
      expect(Number.isInteger(item.price) && item.price > 0).toBe(true)
      expect(item.name.length).toBeGreaterThan(0)
    }
  })

  test('shopItem finds by type and returns undefined for unknown types', () => {
    expect(shopItem('pine')?.name).toBe('Pine tree')
    expect(shopItem('tree')).toBeUndefined()
    expect(isDecorationType('statue')).toBe(true)
    expect(isDecorationType('tree')).toBe(false)
  })

  test('refund is half the price, rounded down', () => {
    expect(refundFor(30)).toBe(15)
    expect(refundFor(45)).toBe(22)
    expect(refundFor(0)).toBe(0)
  })

  test('placement input requires a known type and integer plot', () => {
    const projectId = '7f9c2e1a-3b4d-4c5e-8f6a-1b2c3d4e5f60'
    expect(placeBuildingInputSchema.safeParse({ projectId, type: 'pine', plotX: 1, plotY: -1 }).success).toBe(true)
    expect(placeBuildingInputSchema.safeParse({ projectId, type: 'tree', plotX: 1, plotY: 0 }).success).toBe(false)
    expect(placeBuildingInputSchema.safeParse({ projectId, type: 'pine', plotX: 1.5, plotY: 0 }).success).toBe(false)
  })
})
```

- [ ] **Step 2: Write the failing land test** — `packages/shared/src/land.test.ts`

```ts
import { describe, expect, test } from 'bun:test'
import { hexDistance, hexKey } from './hex'
import { decorationRotation, islandRadius, isPlaceable, placeablePlots } from './land'

const O = { q: 0, r: 0 }

describe('land rule', () => {
  test('islandRadius is furthest occupied + 2, at least 4', () => {
    expect(islandRadius([])).toBe(4)
    expect(islandRadius([{ q: 1, r: 0 }])).toBe(4)
    expect(islandRadius([{ q: 5, r: 0 }])).toBe(7)
    expect(islandRadius([{ q: 5, r: -1 }, { q: 1, r: 0 }])).toBe(7)
  })

  test('placeable plots are the free flat interior, without the commons centre', () => {
    const occupied = [{ q: 1, r: 0 }]
    const plots = placeablePlots(occupied)
    // radius 4 → interior radius 2 → 19 hexes, minus the centre and one occupied hex.
    expect(plots).toHaveLength(17)
    const keys = new Set(plots.map(hexKey))
    expect(keys.has('0,0')).toBe(false)
    expect(keys.has('1,0')).toBe(false)
    expect(plots.every((p) => hexDistance(O, p) <= 2)).toBe(true)
    expect(keys.size).toBe(plots.length)
  })

  test('isPlaceable rejects occupied, commons, shore and off-island plots', () => {
    const occupied = [{ q: 1, r: 0 }]
    expect(isPlaceable(occupied, { q: 0, r: 1 })).toBe(true)
    expect(isPlaceable(occupied, { q: 1, r: 0 })).toBe(false)
    expect(isPlaceable(occupied, { q: 0, r: 0 })).toBe(false)
    expect(isPlaceable(occupied, { q: 3, r: 0 })).toBe(false)
    expect(isPlaceable(occupied, { q: 9, r: 0 })).toBe(false)
  })

  test('a decoration at the interior edge keeps the island from shrinking', () => {
    const task = { q: 5, r: 0 }
    const edge = { q: 5, r: -1 }
    expect(isPlaceable([task], edge)).toBe(true)
    // With the task gone, the decoration alone still holds radius 7.
    expect(islandRadius([edge])).toBe(7)
    expect(isPlaceable([edge], { q: 5, r: -2 })).toBe(true)
  })

  test('decorationRotation is deterministic and in 0..5', () => {
    const plots = placeablePlots([])
    const turns = plots.map(decorationRotation)
    expect(turns.every((t) => Number.isInteger(t) && t >= 0 && t <= 5)).toBe(true)
    expect(new Set(turns).size).toBeGreaterThan(1)
    expect(decorationRotation({ q: -3, r: 2 })).toBe(decorationRotation({ q: -3, r: 2 }))
  })
})
```

- [ ] **Step 3: Run both, expect failure**

Run: `cd packages/shared && bun test src/shop.test.ts src/land.test.ts`
Expected: FAIL, modules `./shop` and `./land` not found.

- [ ] **Step 4: Implement `packages/shared/src/shop.ts`**

```ts
import { z } from 'zod'
import type { BuildingDto } from './dto'

export const DECORATION_TYPES = [
  'pine',
  'palm',
  'garden',
  'lamp',
  'well',
  'stall',
  'fountain',
  'statue',
] as const
export type DecorationType = (typeof DECORATION_TYPES)[number]

export type ShopItemDto = { type: DecorationType; name: string; price: number }

/** The fixed decoration catalogue (spec 15.1). */
export const SHOP_ITEMS: readonly ShopItemDto[] = Object.freeze([
  { type: 'pine', name: 'Pine tree', price: 30 },
  { type: 'palm', name: 'Palm tree', price: 40 },
  { type: 'garden', name: 'Flower garden', price: 60 },
  { type: 'lamp', name: 'Bench and lamp', price: 80 },
  { type: 'well', name: 'Well', price: 120 },
  { type: 'stall', name: 'Market stall', price: 160 },
  { type: 'fountain', name: 'Fountain', price: 220 },
  { type: 'statue', name: 'Statue', price: 350 },
])

export const isDecorationType = (type: string): type is DecorationType =>
  (DECORATION_TYPES as readonly string[]).includes(type)

export const shopItem = (type: string): ShopItemDto | undefined =>
  SHOP_ITEMS.find((item) => item.type === type)

export const refundFor = (price: number): number => Math.floor(price * 0.5)

export const placeBuildingInputSchema = z.object({
  projectId: z.uuid(),
  type: z.enum(DECORATION_TYPES),
  plotX: z.int32(),
  plotY: z.int32(),
})
export type PlaceBuildingInput = z.infer<typeof placeBuildingInputSchema>

export type PlaceBuildingResultDto = { building: BuildingDto; balance: number }
export type RemoveBuildingResultDto = { refund: number; balance: number }
```

- [ ] **Step 5: Implement `packages/shared/src/land.ts`**

```ts
import { COMMONS_CENTER, type Hex, hexDistance, hexKey, hexRing } from './hex'

export const MIN_ISLAND_RADIUS = 4
/** Rings of lower shore around the flat interior. */
export const SHORE_RINGS = 2

/** Rings needed so every occupied hex is flat land with a two-ring shore beyond it. */
export function islandRadius(occupied: readonly Hex[]): number {
  const furthest = occupied.reduce((max, h) => Math.max(max, hexDistance(COMMONS_CENTER, h)), 0)
  return Math.max(MIN_ISLAND_RADIUS, furthest + SHORE_RINGS)
}

/**
 * Free plots on the flat interior, ring by ring outward. The radius comes from what is already on
 * the island, so a new decoration can never grow it.
 */
export function placeablePlots(occupied: readonly Hex[]): Hex[] {
  const taken = new Set(occupied.map(hexKey))
  const interior = islandRadius(occupied) - SHORE_RINGS
  const plots: Hex[] = []
  for (let ring = 1; ring <= interior; ring++) {
    for (const hex of hexRing(COMMONS_CENTER, ring)) {
      if (!taken.has(hexKey(hex))) plots.push(hex)
    }
  }
  return plots
}

export function isPlaceable(occupied: readonly Hex[], plot: Hex): boolean {
  if (plot.q === COMMONS_CENTER.q && plot.r === COMMONS_CENTER.r) return false
  if (occupied.some((h) => h.q === plot.q && h.r === plot.r)) return false
  return hexDistance(COMMONS_CENTER, plot) <= islandRadius(occupied) - SHORE_RINGS
}

/** A fixed 60° step per plot, so decorations face different ways without the user turning them. */
export function decorationRotation(plot: Hex): number {
  return (((plot.q * 7 + plot.r * 13) % 6) + 6) % 6
}
```

- [ ] **Step 6: Wire exports, ledger kind and error code**

`packages/shared/src/index.ts` — add two lines in alphabetical position:

```ts
export * from './land'
export * from './shop'
```

`packages/shared/src/domain.ts` — `LEDGER_KINDS` becomes:

```ts
export const LEDGER_KINDS = [
  'task_reward',
  'milestone_bonus',
  'streak_bonus',
  'daily_bonus',
  'purchase',
  'refund',
  'reversal',
] as const
```

`packages/shared/src/errors.ts` — add `'insufficient_supplies'` to `ERROR_CODES` after `'conflict'`, and `insufficient_supplies: 409,` to `ERROR_STATUS` after `conflict: 409,`.

- [ ] **Step 7: Move the web radius to shared**

In `apps/web/src/scene/model/terrain.ts`: delete the local `MIN_ISLAND_RADIUS`, `SHORE_RINGS` and `islandRadius` definitions, import `SHORE_RINGS` (and `MIN_ISLAND_RADIUS` if still used) from `@archipelago/shared`, and keep `islandTerrain` unchanged. Then run `grep -rn "islandRadius\|MIN_ISLAND_RADIUS\|SHORE_RINGS" apps/web/src` and change every import of these names to come from `@archipelago/shared` (currently `scene-model.ts` and `foundations.test.ts`).

- [ ] **Step 8: Run tests and typecheck**

Run: `cd packages/shared && bun test` — Expected: PASS.
Run: `bun run typecheck` (root) — Expected: PASS for all packages. If an exhaustive `switch`/`Record` over `LedgerKind` or `ErrorCode` fails to compile, add the new member there with the obvious value and note it in the report.
Run: `cd apps/web && bunx vitest run src/scene/model` — Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/shared apps/web/src/scene/model
git commit -m "feat(shared): add the decoration catalogue, land rule, refund kind and supplies error"
```

---

### Task 2: API shop and buildings

**Files:**
- Create: `apps/api/drizzle/0003_*.sql` (generated), `apps/api/drizzle/meta/*` (generated)
- Create: `apps/api/src/buildings/service.ts`
- Create: `apps/api/src/routes/buildings.ts`, `apps/api/src/routes/shop.ts`
- Create: `apps/api/src/routes/buildings.test.ts`
- Modify: `apps/api/src/world/plots.ts`, `apps/api/src/app.ts`, `apps/api/src/economy/ledger.ts` (comment only)

**Interfaces:**
- Consumes: Task 1 exports.
- Produces:
  - `occupiedHexes(tx: Db, projectId: string): Promise<Hex[]>` in `world/plots.ts` (`takenPlots` now built on it).
  - `placeBuilding(db, userId, input: PlaceBuildingInput, now): Promise<PlaceBuildingResultDto>`, `removeBuilding(db, userId, buildingId, now): Promise<RemoveBuildingResultDto>`.
  - Routes `GET /api/v1/shop` → `{ items }`, `POST /api/v1/buildings` → 201 `PlaceBuildingResultDto`, `DELETE /api/v1/buildings/:id` → 200 `RemoveBuildingResultDto`. All require auth. Typed on `AppType` so `hono/client` sees `v1.shop`, `v1.buildings`.

- [ ] **Step 1: Generate the migration**

The `ledger_kind` pg enum is built from `LEDGER_KINDS`, so Task 1 already changed the schema.
Run: `cd apps/api && bun run db:generate`
Expected: a new `drizzle/0003_*.sql` containing `ALTER TYPE "public"."ledger_kind" ADD VALUE 'refund' BEFORE 'reversal';` (or without `BEFORE`; either is fine). Nothing else should appear in it; if it does, stop and report.

- [ ] **Step 2: Write the failing route tests** — `apps/api/src/routes/buildings.test.ts`

```ts
import { describe, expect, test } from 'bun:test'
import type { BuildingDto, PlaceBuildingResultDto, RemoveBuildingResultDto, ShopItemDto, WorldDto } from '@archipelago/shared'
import { SHOP_ITEMS } from '@archipelago/shared'
import { and, eq } from 'drizzle-orm'
import { authedApp, readJson } from '../../test/auth'
import { testDb, withRollback } from '../../test/db'
import { insertBuilding, insertProject, insertTask, testConfig } from '../../test/fixtures'
import { createApp } from '../app'
import type { Db } from '../db/client'
import { ledger, users } from '../db/schema'
import { insertEntry } from '../economy/ledger'

const BUILDINGS = '/api/v1/buildings'
const NOW = new Date('2026-10-08T05:00:00.000Z')

async function setup(db: Db, funds = 500) {
  const me = await authedApp(db, { now: () => NOW })
  const project = await insertProject(db, me.user.id)
  if (funds !== 0) await insertEntry(db, me.user.id, { kind: 'daily_bonus', amount: funds }, NOW)
  const place = (body: Record<string, unknown>) =>
    me.post(BUILDINGS, { projectId: project.id, type: 'pine', plotX: 1, plotY: 0, ...body })
  const balance = async () =>
    (await readJson<WorldDto>(await me.get('/api/v1/world'))).economy.balance
  return { me, project, place, balance }
}

describe('/shop', () => {
  test('requires auth, then lists the catalogue', async () => {
    await withRollback(async (tx) => {
      const anon = createApp({ db: tx, config: testConfig })
      expect((await anon.request('/api/v1/shop')).status).toBe(401)
      const me = await authedApp(tx)
      const res = await me.get('/api/v1/shop')
      expect(res.status).toBe(200)
      expect(await readJson<{ items: ShopItemDto[] }>(res)).toEqual({ items: [...SHOP_ITEMS] })
    })
  })
})

describe('POST /buildings', () => {
  test('requires auth', async () => {
    await withRollback(async (tx) => {
      const anon = createApp({ db: tx, config: testConfig })
      const res = await anon.request(BUILDINGS, { method: 'POST' })
      expect(res.status).toBe(401)
      expect((await anon.request(`${BUILDINGS}/${crypto.randomUUID()}`, { method: 'DELETE' })).status).toBe(401)
    })
  })

  test('places, charges the price and writes a purchase entry', async () => {
    await withRollback(async (tx) => {
      const s = await setup(tx)
      const res = await s.place({ type: 'pine', plotX: 0, plotY: 1 })
      expect(res.status).toBe(201)
      const body = await readJson<PlaceBuildingResultDto>(res)
      expect(body.balance).toBe(470)
      expect(body.building).toMatchObject({ projectId: s.project.id, type: 'pine', plotX: 0, plotY: 1 })
      expect(body.building.rotation).toBeGreaterThanOrEqual(0)
      expect(body.building.rotation).toBeLessThanOrEqual(5)
      const entries = await tx
        .select()
        .from(ledger)
        .where(and(eq(ledger.userId, s.me.user.id), eq(ledger.kind, 'purchase')))
      expect(entries).toHaveLength(1)
      expect(entries[0]).toMatchObject({ amount: -30, refType: 'building', refId: body.building.id })
      const world = await readJson<WorldDto>(await s.me.get('/api/v1/world'))
      expect(world.buildings.map((b) => b.id)).toEqual([body.building.id])
      expect(world.economy.balance).toBe(470)
    })
  })

  test('a balance exactly equal to the price is enough', async () => {
    await withRollback(async (tx) => {
      const s = await setup(tx, 30)
      const res = await s.place({ type: 'pine' })
      expect(res.status).toBe(201)
      expect((await readJson<PlaceBuildingResultDto>(res)).balance).toBe(0)
    })
  })

  test('blocks a purchase above the balance, and any purchase while negative', async () => {
    await withRollback(async (tx) => {
      const s = await setup(tx, 20)
      const short = await s.place({ type: 'pine' })
      expect(short.status).toBe(409)
      expect(await short.json()).toEqual({
        error: { code: 'insufficient_supplies', message: 'Not enough Supplies' },
      })
      await insertEntry(tx, s.me.user.id, { kind: 'purchase', amount: -25 }, NOW)
      const negative = await s.place({ type: 'pine' })
      expect(negative.status).toBe(409)
      expect(await negative.json()).toEqual({
        error: { code: 'insufficient_supplies', message: 'Balance is negative' },
      })
      expect(await s.balance()).toBe(-5)
    })
  })

  test('422 for unknown types and plots that are not free flat land', async () => {
    await withRollback(async (tx) => {
      const s = await setup(tx)
      for (const body of [
        { type: 'tree' },
        { plotX: 0, plotY: 0 }, // commons centre
        { plotX: 3, plotY: 0 }, // shore of a radius-4 island
        { plotX: 9, plotY: 0 }, // open sea
      ]) {
        const res = await s.place(body)
        expect(res.status).toBe(422)
        expect((await readJson<{ error: { code: string } }>(res)).error.code).toBe('validation_failed')
      }
      expect(await s.balance()).toBe(500)
    })
  })

  test('409 when the plot holds a task, a district centre or a decoration', async () => {
    await withRollback(async (tx) => {
      const s = await setup(tx)
      await insertTask(tx, s.project.id, { plotX: 1, plotY: 0 })
      await insertBuilding(tx, s.project.id, { type: 'pine', plotX: 0, plotY: 1 })
      for (const body of [{ plotX: 1, plotY: 0 }, { plotX: 0, plotY: 1 }]) {
        const res = await s.place(body)
        expect(res.status).toBe(409)
        expect(await res.json()).toEqual({ error: { code: 'conflict', message: 'That plot is taken' } })
      }
    })
  })

  test('404 for another user’s project and for an archived project', async () => {
    await withRollback(async (tx) => {
      const s = await setup(tx)
      const other = await authedApp(tx)
      const theirs = await insertProject(tx, other.user.id)
      expect((await s.place({ projectId: theirs.id })).status).toBe(404)
      const archived = await insertProject(tx, s.me.user.id, { archivedAt: NOW })
      expect((await s.place({ projectId: archived.id })).status).toBe(404)
    })
  })

  test('a decoration at the interior edge keeps the island when its task is deleted', async () => {
    await withRollback(async (tx) => {
      const s = await setup(tx)
      const task = await insertTask(tx, s.project.id, { plotX: 5, plotY: 0 })
      expect((await s.place({ plotX: 5, plotY: -1 })).status).toBe(201)
      expect((await s.me.del(`/api/v1/tasks/${task.id}`)).status).toBe(204)
      expect((await s.place({ plotX: 5, plotY: -2 })).status).toBe(201)
    })
  })

  test('deleting the project keeps the purchase in the ledger', async () => {
    await withRollback(async (tx) => {
      const s = await setup(tx)
      await s.place({ type: 'statue' })
      expect((await s.me.del(`/api/v1/projects/${s.project.id}`)).status).toBe(204)
      expect(await s.balance()).toBe(150)
    })
  })
})

describe('DELETE /buildings/:id', () => {
  test('removes, refunds half and writes a refund entry', async () => {
    await withRollback(async (tx) => {
      const s = await setup(tx)
      const { building } = await readJson<{ building: BuildingDto }>(await s.place({ type: 'pine' }))
      const res = await s.me.del(`${BUILDINGS}/${building.id}`)
      expect(res.status).toBe(200)
      expect(await readJson<RemoveBuildingResultDto>(res)).toEqual({ refund: 15, balance: 485 })
      const refunds = await tx
        .select()
        .from(ledger)
        .where(and(eq(ledger.userId, s.me.user.id), eq(ledger.kind, 'refund')))
      expect(refunds).toHaveLength(1)
      expect(refunds[0]).toMatchObject({ amount: 15, refType: 'building', refId: building.id })
      const world = await readJson<WorldDto>(await s.me.get('/api/v1/world'))
      expect(world.buildings).toEqual([])
      expect((await s.me.del(`${BUILDINGS}/${building.id}`)).status).toBe(404)
    })
  })

  test('a building of an unknown type refunds 0 and writes no entry', async () => {
    await withRollback(async (tx) => {
      const s = await setup(tx)
      const legacy = await insertBuilding(tx, s.project.id, { type: 'tree', plotX: 0, plotY: 1 })
      const res = await s.me.del(`${BUILDINGS}/${legacy.id}`)
      expect(await readJson<RemoveBuildingResultDto>(res)).toEqual({ refund: 0, balance: 500 })
      const refunds = await tx.select().from(ledger).where(eq(ledger.kind, 'refund'))
      expect(refunds.filter((r) => r.userId === s.me.user.id)).toHaveLength(0)
    })
  })

  test('404 for another user’s building and a malformed id', async () => {
    await withRollback(async (tx) => {
      const s = await setup(tx)
      const other = await authedApp(tx)
      const theirs = await insertProject(tx, other.user.id)
      const building = await insertBuilding(tx, theirs.id, { type: 'pine', plotX: 0, plotY: 1 })
      expect((await s.me.del(`${BUILDINGS}/${building.id}`)).status).toBe(404)
      expect((await s.me.del(`${BUILDINGS}/not-a-uuid`)).status).toBe(404)
    })
  })
})

describe('placement under concurrency', () => {
  test('two placements on one plot: one 201, one 409', async () => {
    // Real transactions on separate connections; cleaned up by deleting the user.
    const me = await authedApp(testDb, { now: () => NOW })
    try {
      const project = await insertProject(testDb, me.user.id)
      await insertEntry(testDb, me.user.id, { kind: 'daily_bonus', amount: 500 }, NOW)
      const body = { projectId: project.id, type: 'pine', plotX: 1, plotY: 0 }
      const results = await Promise.all([me.post(BUILDINGS, body), me.post(BUILDINGS, body)])
      expect(results.map((r) => r.status).sort()).toEqual([201, 409])
    } finally {
      await testDb.delete(users).where(eq(users.id, me.user.id))
    }
  })
})
```

- [ ] **Step 3: Run, expect failure**

Run: `cd apps/api && bun test src/routes/buildings.test.ts`
Expected: FAIL (404 route not found for `/shop` and `/buildings`).

- [ ] **Step 4: Add `occupiedHexes` to `apps/api/src/world/plots.ts`**

Replace `takenPlots` with:

```ts
/** Task plots, decoration plots and district centres on the island; the commons centre is not included. */
export async function occupiedHexes(tx: Db, projectId: string): Promise<Hex[]> {
  const [taskPlots, buildingPlots, centres] = await Promise.all([
    tx.select({ q: tasks.plotX, r: tasks.plotY }).from(tasks).where(eq(tasks.projectId, projectId)),
    tx
      .select({ q: buildings.plotX, r: buildings.plotY })
      .from(buildings)
      .where(eq(buildings.projectId, projectId)),
    tx
      .select({ q: milestones.districtQ, r: milestones.districtR })
      .from(milestones)
      .where(eq(milestones.projectId, projectId)),
  ])
  return [...taskPlots, ...buildingPlots, ...centres]
}

export async function takenPlots(tx: Db, projectId: string): Promise<Set<string>> {
  const taken = new Set((await occupiedHexes(tx, projectId)).map(hexKey))
  taken.add(hexKey(COMMONS_CENTER))
  return taken
}
```

- [ ] **Step 5: Implement `apps/api/src/buildings/service.ts`**

```ts
import {
  decorationRotation,
  hexKey,
  isPlaceable,
  type PlaceBuildingInput,
  type PlaceBuildingResultDto,
  type RemoveBuildingResultDto,
  refundFor,
  shopItem,
} from '@archipelago/shared'
import { and, eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { isUniqueViolation } from '../db/pg-errors'
import { buildings, projects } from '../db/schema'
import { getBalance, insertEntry, lockUser } from '../economy/ledger'
import { AppError } from '../errors'
import { toBuildingDto } from '../http/serialize'
import { lockOwnedProject, occupiedHexes } from '../world/plots'

const plotTaken = () => new AppError('conflict', 'That plot is taken')
const notLand = () =>
  new AppError('validation_failed', 'Request body is invalid', {
    plot: ['Plot is not free land on this island'],
  })

export async function placeBuilding(
  db: Db,
  userId: string,
  input: PlaceBuildingInput,
  now: Date,
): Promise<PlaceBuildingResultDto> {
  try {
    return await db.transaction(async (tx) => {
      const project = await lockOwnedProject(tx, userId, input.projectId)
      if (!project || project.archivedAt !== null) {
        throw new AppError('not_found', 'Project not found')
      }
      const item = shopItem(input.type)
      if (!item) throw new AppError('validation_failed', 'Request body is invalid', { type: ['Unknown decoration'] })
      const plot = { q: input.plotX, r: input.plotY }
      const occupied = await occupiedHexes(tx, project.id)
      if (occupied.some((h) => hexKey(h) === hexKey(plot))) throw plotTaken()
      if (!isPlaceable(occupied, plot)) throw notLand()

      await lockUser(tx, userId)
      const balance = await getBalance(tx, userId)
      if (balance < 0) throw new AppError('insufficient_supplies', 'Balance is negative')
      if (balance < item.price) throw new AppError('insufficient_supplies', 'Not enough Supplies')

      const [row] = await tx
        .insert(buildings)
        .values({
          projectId: project.id,
          type: item.type,
          plotX: plot.q,
          plotY: plot.r,
          rotation: decorationRotation(plot),
          placedAt: now,
        })
        .returning()
      if (!row) throw new Error('placeBuilding: no row returned')
      await insertEntry(
        tx,
        userId,
        { kind: 'purchase', amount: -item.price, refType: 'building', refId: row.id },
        now,
      )
      return { building: toBuildingDto(row), balance: balance - item.price }
    })
  } catch (err) {
    // The project lock serialises placements; the unique index is the last line of defence.
    if (isUniqueViolation(err)) throw plotTaken()
    throw err
  }
}

export async function removeBuilding(
  db: Db,
  userId: string,
  buildingId: string,
  now: Date,
): Promise<RemoveBuildingResultDto> {
  const notFound = () => new AppError('not_found', 'Building not found')
  return db.transaction(async (tx) => {
    const [found] = await tx
      .select({ projectId: buildings.projectId })
      .from(buildings)
      .innerJoin(projects, eq(projects.id, buildings.projectId))
      .where(and(eq(buildings.id, buildingId), eq(projects.userId, userId)))
    if (!found) throw notFound()
    await lockOwnedProject(tx, userId, found.projectId)
    const [row] = await tx.delete(buildings).where(eq(buildings.id, buildingId)).returning()
    if (!row) throw notFound()

    await lockUser(tx, userId)
    // A type no longer in the catalogue has no price to refund.
    const refund = refundFor(shopItem(row.type)?.price ?? 0)
    if (refund > 0) {
      await insertEntry(
        tx,
        userId,
        { kind: 'refund', amount: refund, refType: 'building', refId: row.id },
        now,
      )
    }
    return { refund, balance: await getBalance(tx, userId) }
  })
}
```

- [ ] **Step 6: Routes** — `apps/api/src/routes/buildings.ts`

```ts
import { placeBuildingInputSchema } from '@archipelago/shared'
import { Hono } from 'hono'
import { requireAuth } from '../auth/middleware'
import { placeBuilding, removeBuilding } from '../buildings/service'
import { idParam, validId } from '../http/params'
import type { AppEnv, Deps } from '../types'
import { jsonBody } from '../validate'

export function buildingRoutes(deps: Deps) {
  const { db } = deps
  const now = () => deps.now?.() ?? new Date()

  return new Hono<AppEnv>()
    .use(requireAuth(deps))
    .post('/', jsonBody(placeBuildingInputSchema), async (c) =>
      c.json(await placeBuilding(db, c.get('user').id, c.req.valid('json'), now()), 201),
    )
    .delete('/:id', validId('Building'), async (c) => {
      const id = idParam(c.req.param('id'), 'Building')
      return c.json(await removeBuilding(db, c.get('user').id, id, now()))
    })
}
```

`apps/api/src/routes/shop.ts`

```ts
import { SHOP_ITEMS } from '@archipelago/shared'
import { Hono } from 'hono'
import { requireAuth } from '../auth/middleware'
import type { AppEnv, Deps } from '../types'

export function shopRoutes(deps: Deps) {
  return new Hono<AppEnv>().use(requireAuth(deps)).get('/', (c) => c.json({ items: [...SHOP_ITEMS] }))
}
```

In `apps/api/src/app.ts` import both and chain `.route('/shop', shopRoutes(deps))` and `.route('/buildings', buildingRoutes(deps))` after `/economy`. In `economy/ledger.ts` change the `toRewardDto` comment to "reversals, purchases and refunds are not rewards".

- [ ] **Step 7: Run tests**

Run: `cd apps/api && bun test` — Expected: PASS, including every pre-existing test (plot assignment now uses `occupiedHexes`).
Run: `bun run typecheck` (root) — Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api
git commit -m "feat(api): sell decorations by placing them on free land and refund half on removal"
```

---
### Task 3: Web API client, fake API and shop mutations

**Files:**
- Modify: `apps/web/src/api/api.ts`, `apps/web/src/api/api.test.ts`
- Modify: `apps/web/src/world/selectors.ts`, `apps/web/src/world/selectors.test.ts`
- Modify: `apps/web/src/test/fake-api.ts`
- Create: `apps/web/src/test/fake-api-shop.test.ts`
- Create: `apps/web/src/shop/use-shop-actions.ts`

**Interfaces:**
- Consumes: Task 1 exports; Task 2 routes (typed through `AppType`).
- Produces:
  - `api.placeBuilding(input: PlaceBuildingInput): Promise<PlaceBuildingResultDto>`, `api.removeBuilding(id: string): Promise<RemoveBuildingResultDto>`.
  - `islandOccupied(world: Pick<WorldDto, 'tasks' | 'milestones' | 'buildings'>, projectId: string): Hex[]` in `world/selectors.ts`.
  - `fakeBuilding(overrides?: Partial<BuildingDto>): BuildingDto` in `test/fake-api.ts`; fake `placeBuilding` / `removeBuilding` with the server's rules; fake `deleteProject` also drops the project's buildings.
  - `usePlaceBuilding()` and `useRemoveBuilding()` in `shop/use-shop-actions.ts`: TanStack mutations that patch `world.economy.balance` from the response, toast, and invalidate `['world']`. Callers pass per-call `onSuccess` / `onError` to `mutate`.

- [ ] **Step 1: Failing tests**

Append to `apps/web/src/api/api.test.ts` inside `describe('createApi', …)`:

```ts
  test('placeBuilding() POSTs JSON to /api/v1/buildings', async () => {
    const { api, requests } = harness(() => json({ building: { id: 'b1' }, balance: 10 }, 201))
    const input = {
      projectId: '7f9c2e1a-3b4d-4c5e-8f6a-1b2c3d4e5f60',
      type: 'pine' as const,
      plotX: 1,
      plotY: 0,
    }
    expect(await api.placeBuilding(input)).toEqual({ building: { id: 'b1' }, balance: 10 })
    expect(requests[0]?.method).toBe('POST')
    expect(requests[0]?.url).toBe('http://test/api/v1/buildings')
    expect(await requests[0]?.json()).toEqual(input)
  })

  test('removeBuilding() DELETEs /api/v1/buildings/:id', async () => {
    const { api, requests } = harness(() => json({ refund: 15, balance: 25 }))
    expect(await api.removeBuilding('b1')).toEqual({ refund: 15, balance: 25 })
    expect(requests[0]?.method).toBe('DELETE')
    expect(requests[0]?.url).toBe('http://test/api/v1/buildings/b1')
  })

  test('an insufficient_supplies error keeps its code', async () => {
    const { api } = harness(() =>
      json({ error: { code: 'insufficient_supplies', message: 'Not enough Supplies' } }, 409),
    )
    await expect(api.removeBuilding('b1')).rejects.toMatchObject({
      status: 409,
      code: 'insufficient_supplies',
      message: 'Not enough Supplies',
    })
  })
```

Append to `apps/web/src/world/selectors.test.ts`:

```ts
describe('islandOccupied', () => {
  test('collects task plots, district centres and decoration plots of one island', () => {
    const beta = fakeProject()
    const other = fakeProject()
    const world = {
      tasks: [fakeTask({ projectId: beta.id, plotX: 1, plotY: 0 }), fakeTask({ projectId: other.id, plotX: 2, plotY: 0 })],
      milestones: [fakeMilestone({ projectId: beta.id, districtQ: 5, districtR: 0 })],
      buildings: [fakeBuilding({ projectId: beta.id, plotX: 0, plotY: 1 })],
    }
    expect(islandOccupied(world, beta.id)).toEqual([
      { q: 1, r: 0 },
      { q: 5, r: 0 },
      { q: 0, r: 1 },
    ])
  })
})
```

(Import `fakeBuilding`, `fakeMilestone`, `fakeProject`, `fakeTask` from `../test/fake-api` and `islandOccupied` from `./selectors`, adding to existing imports.)

Create `apps/web/src/test/fake-api-shop.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { createFakeApi, fakeBuilding, fakeEntry, fakeProject, fakeTask } from './fake-api'

function seeded(funds: number) {
  const beta = fakeProject()
  const fake = createFakeApi({
    world: {
      projects: [beta],
      milestones: [],
      tasks: [fakeTask({ projectId: beta.id, plotX: 1, plotY: 0 })],
      buildings: [],
    },
    ledger: funds === 0 ? [] : [fakeEntry({ kind: 'daily_bonus', amount: funds })],
  })
  return { beta, ...fake }
}

describe('fake api shop', () => {
  test('places, charges and refunds half', async () => {
    const { api, beta, state } = seeded(100)
    const placed = await api.placeBuilding({ projectId: beta.id, type: 'pine', plotX: 0, plotY: 1 })
    expect(placed.balance).toBe(70)
    expect(state.world.buildings).toHaveLength(1)
    expect(await api.removeBuilding(placed.building.id)).toEqual({ refund: 15, balance: 85 })
    expect(state.world.buildings).toHaveLength(0)
  })

  test('applies the server errors', async () => {
    const { api, beta } = seeded(35)
    const place = (plotX: number, plotY: number, type: 'pine' | 'palm' = 'pine') =>
      api.placeBuilding({ projectId: beta.id, type, plotX, plotY })
    await expect(place(1, 0)).rejects.toMatchObject({ status: 409, code: 'conflict' })
    await expect(place(0, 0)).rejects.toMatchObject({ status: 422 })
    await expect(place(3, 0)).rejects.toMatchObject({ status: 422 })
    await expect(place(0, 1, 'palm')).rejects.toMatchObject({
      status: 409,
      code: 'insufficient_supplies',
      message: 'Not enough Supplies',
    })
    await expect(api.removeBuilding('nope')).rejects.toMatchObject({ status: 404 })
  })

  test('deleting a project drops its buildings', async () => {
    const beta = fakeProject()
    const { api, state } = createFakeApi({
      world: { projects: [beta], milestones: [], tasks: [], buildings: [fakeBuilding({ projectId: beta.id })] },
    })
    await api.deleteProject(beta.id)
    expect(state.world.buildings).toEqual([])
  })
})
```

- [ ] **Step 2: Run, expect failure**

Run: `cd apps/web && bunx vitest run src/api/api.test.ts src/world/selectors.test.ts src/test/fake-api-shop.test.ts`
Expected: FAIL (missing `placeBuilding`, `islandOccupied`, `fakeBuilding`).

- [ ] **Step 3: API client** — in `apps/web/src/api/api.ts` add the type imports `PlaceBuildingInput`, `PlaceBuildingResultDto`, `RemoveBuildingResultDto` and, after `reopenTask`:

```ts

    placeBuilding: async (input: PlaceBuildingInput) =>
      unwrap<PlaceBuildingResultDto>(await v1.buildings.$post({ json: input })),
    removeBuilding: async (id: string) =>
      unwrap<RemoveBuildingResultDto>(await v1.buildings[':id'].$delete({ param: { id } })),
```

- [ ] **Step 4: Selector** — in `apps/web/src/world/selectors.ts` (import `type Hex` from `@archipelago/shared`):

```ts
/** Everything standing on one island: task plots, district centres, then decoration plots. */
export function islandOccupied(
  world: Pick<WorldDto, 'tasks' | 'milestones' | 'buildings'>,
  projectId: string,
): Hex[] {
  return [
    ...world.tasks.filter((t) => t.projectId === projectId).map((t) => ({ q: t.plotX, r: t.plotY })),
    ...world.milestones
      .filter((m) => m.projectId === projectId)
      .map((m) => ({ q: m.districtQ, r: m.districtR })),
    ...world.buildings
      .filter((b) => b.projectId === projectId)
      .map((b) => ({ q: b.plotX, r: b.plotY })),
  ]
}
```

- [ ] **Step 5: Fake API** — in `apps/web/src/test/fake-api.ts`:

Add imports `type BuildingDto`, `decorationRotation`, `isPlaceable`, `shopItem`, `refundFor` from `@archipelago/shared`, and `import { islandOccupied } from '../world/selectors'`.

Add next to the other factories:

```ts
export const fakeBuilding = (overrides: Partial<BuildingDto> = {}): BuildingDto => ({
  id: nextId(),
  projectId: nextId(),
  type: 'pine',
  plotX: 0,
  plotY: 1,
  rotation: 0,
  placedAt: stamp,
  ...overrides,
})
```

In `deleteProject`, add `state.world.buildings = state.world.buildings.filter((b) => b.projectId !== id)`.

Add to the `api` object:

```ts
    placeBuilding: async (input) => {
      authed('placeBuilding')
      const project = state.world.projects.find(
        (p) => p.id === input.projectId && p.archivedAt === null,
      )
      if (!project) throw new ApiError(404, 'not_found', 'Project not found')
      const item = shopItem(input.type)
      if (!item) {
        throw new ApiError(422, 'validation_failed', 'Request body is invalid', {
          type: ['Unknown decoration'],
        })
      }
      const plot = { q: input.plotX, r: input.plotY }
      const occupied = islandOccupied(state.world, project.id)
      if (occupied.some((h) => h.q === plot.q && h.r === plot.r)) {
        throw new ApiError(409, 'conflict', 'That plot is taken')
      }
      if (!isPlaceable(occupied, plot)) {
        throw new ApiError(422, 'validation_failed', 'Request body is invalid', {
          plot: ['Plot is not free land on this island'],
        })
      }
      if (balance() < 0) throw new ApiError(409, 'insufficient_supplies', 'Balance is negative')
      if (balance() < item.price) {
        throw new ApiError(409, 'insufficient_supplies', 'Not enough Supplies')
      }
      const building = fakeBuilding({
        projectId: project.id,
        type: item.type,
        plotX: plot.q,
        plotY: plot.r,
        rotation: decorationRotation(plot),
      })
      state.world.buildings.push(building)
      state.ledger.push({ kind: 'purchase', amount: -item.price, day: state.today, taskId: null, milestoneId: null, live: true })
      return { building: { ...building }, balance: balance() }
    },
    removeBuilding: async (id) => {
      authed('removeBuilding')
      const building = state.world.buildings.find((b) => b.id === id)
      if (!building) throw new ApiError(404, 'not_found', 'Building not found')
      state.world.buildings = state.world.buildings.filter((b) => b.id !== id)
      const refund = refundFor(shopItem(building.type)?.price ?? 0)
      if (refund > 0) {
        state.ledger.push({ kind: 'refund', amount: refund, day: state.today, taskId: null, milestoneId: null, live: true })
      }
      return { refund, balance: balance() }
    },
```

- [ ] **Step 6: Mutations** — create `apps/web/src/shop/use-shop-actions.ts`

```ts
import { type PlaceBuildingInput, shopItem } from '@archipelago/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/api'
import { useApi } from '../api/context'
import { useToast } from '../app/toast'
import { worldQuery } from '../world/use-world'

const failed = (error: Error) =>
  error instanceof ApiError ? error.message : 'Something went wrong. Try again.'

export function usePlaceBuilding() {
  const api = useApi()
  const queryClient = useQueryClient()
  const toast = useToast()
  const key = worldQuery(api).queryKey

  return useMutation({
    mutationFn: (input: PlaceBuildingInput) => api.placeBuilding(input),
    onSuccess: ({ building, balance }) => {
      queryClient.setQueryData(key, (world) =>
        world ? { ...world, economy: { ...world.economy, balance } } : world,
      )
      const item = shopItem(building.type)
      if (item) toast.show(`${item.name} placed · −${item.price}`)
      void queryClient.invalidateQueries({ queryKey: key })
    },
    onError: (error) => {
      toast.show(failed(error))
      void queryClient.invalidateQueries({ queryKey: key })
    },
  })
}

export function useRemoveBuilding() {
  const api = useApi()
  const queryClient = useQueryClient()
  const toast = useToast()
  const key = worldQuery(api).queryKey

  return useMutation({
    mutationFn: (buildingId: string) => api.removeBuilding(buildingId),
    onSuccess: ({ refund, balance }) => {
      queryClient.setQueryData(key, (world) =>
        world ? { ...world, economy: { ...world.economy, balance } } : world,
      )
      if (refund > 0) toast.show(`+${refund} Supplies`)
      void queryClient.invalidateQueries({ queryKey: key })
    },
    onError: (error) => {
      toast.show(failed(error))
      void queryClient.invalidateQueries({ queryKey: key })
    },
  })
}
```

The `world` updater parameter is typed by `worldQuery`'s key, exactly as in `economy/use-claim-daily.ts`.

- [ ] **Step 7: Run tests**

Run: `cd apps/web && bunx vitest run src/api src/world src/test` — Expected: PASS.
Run: `bun run typecheck` — Expected: PASS (the fake must satisfy `Api`).

- [ ] **Step 8: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): add building calls, a rule-faithful fake shop and shop mutations"
```

---

### Task 4: Scene model decorations and decoration models

**Files:**
- Modify: `apps/web/src/scene/model/scene-model.ts`, `apps/web/src/scene/model/scene-model.test.ts`
- Create: `apps/web/src/scene/models/decorations.ts`
- Modify: `apps/web/src/scene/models/structures.ts`, `apps/web/src/scene/models/models.test.ts`
- Modify: `apps/web/src/scene/materials.ts`

**Interfaces:**
- Consumes: `islandOccupied` (Task 3), `isDecorationType`, `DECORATION_TYPES`, `placeablePlots` (Task 1).
- Produces:
  - `SceneDecoration = { buildingId: string; type: DecorationType; position: Point; rotation: number }` (rotation = step 0…5); `SceneIsland.decorations: SceneDecoration[]`.
  - `ModelKind` now includes every `DecorationType` and `'plot'`; `MODEL_KINDS` lists them; `modelGeometry(kind)` builds them.
  - `plotMaterial` (glow, MeshBasic, vertex colours, transparent 0.35, depthWrite false) and `placementGhostMaterial` (Lambert, vertex colours, flat, transparent 0.5, depthWrite false) in `scene/materials.ts`.

- [ ] **Step 1: Failing model tests** — append to `apps/web/src/scene/model/scene-model.test.ts` (reuse its existing imports and `today`/`economy` fixtures; add `fakeBuilding` and `placeablePlots`/`islandRadius` imports):

```ts
describe('decorations', () => {
  test('appear per island with position and rotation; unknown types are skipped', () => {
    const beta = fakeProject()
    const pine = fakeBuilding({ projectId: beta.id, type: 'pine', plotX: 0, plotY: 1, rotation: 3 })
    const legacy = fakeBuilding({ projectId: beta.id, type: 'tree', plotX: 1, plotY: 1 })
    const model = buildSceneModel(
      { projects: [beta], milestones: [], tasks: [], buildings: [pine, legacy], economy },
      today,
    )
    expect(model.islands[0]?.decorations).toEqual([
      { buildingId: pine.id, type: 'pine', position: hexToWorld({ q: 0, r: 1 }), rotation: 3 },
    ])
  })

  test('decoration plots, known or not, count toward the island radius', () => {
    const beta = fakeProject()
    const edge = fakeBuilding({ projectId: beta.id, type: 'tree', plotX: 5, plotY: -1 })
    const model = buildSceneModel(
      { projects: [beta], milestones: [], tasks: [], buildings: [edge], economy },
      today,
    )
    expect(model.islands[0]?.radius).toBe(7)
  })
})
```

Append to `apps/web/src/scene/models/models.test.ts`:

```ts
describe('decoration models', () => {
  test.each(DECORATION_TYPES)('%s stays within 0.6 of the plot centre, so any turn fits the hex', (type) => {
    const g = modelGeometry(type)
    g.computeBoundingBox()
    const box = g.boundingBox ?? new THREE.Box3()
    for (const v of [box.min.x, box.max.x, box.min.z, box.max.z]) {
      expect(Math.abs(v)).toBeLessThanOrEqual(0.6)
    }
    expect(box.min.y).toBeGreaterThanOrEqual(-1e-6)
  })
})
```

(Import `DECORATION_TYPES` from `@archipelago/shared`.) Because `MODEL_KINDS` grows, the existing `test.each(MODEL_KINDS)` palette and footprint checks cover the new kinds automatically.

- [ ] **Step 2: Run, expect failure**

Run: `cd apps/web && bunx vitest run src/scene/model/scene-model.test.ts src/scene/models/models.test.ts`
Expected: FAIL (`decorations` undefined, unknown kinds).

- [ ] **Step 3: Scene model** — in `apps/web/src/scene/model/scene-model.ts`:

```ts
export type SceneDecoration = {
  buildingId: string
  type: DecorationType
  position: Point
  /** 60° steps, 0…5. */
  rotation: number
}
```

Add `decorations: SceneDecoration[]` to `SceneIsland`. In `buildSceneModel`, replace the local `occupied` with `islandOccupied(world, project.id)` (import from `../../world/selectors`; `islandRadius` from `@archipelago/shared`), carry `buildings: world.buildings.filter((b) => b.projectId === project.id)` through `prepared`, and add to each island:

```ts
    decorations: buildings.flatMap((b): SceneDecoration[] =>
      isDecorationType(b.type)
        ? [
            {
              buildingId: b.id,
              type: b.type,
              position: hexToWorld({ q: b.plotX, r: b.plotY }),
              rotation: b.rotation,
            },
          ]
        : [],
    ),
```

- [ ] **Step 4: Decoration models** — create `apps/web/src/scene/models/decorations.ts`

```ts
import { DECORATION_TYPES, type DecorationType } from '@archipelago/shared'
import * as THREE from 'three'
import { box, cone, part, prism } from './build'

export { DECORATION_TYPES }

const leaf = (i: number) => (i * 2 * Math.PI) / 5

/** Low-poly decorations; every part stays within 0.6 of the centre so a turn never leaves the hex. */
export const decorationBuilders: Record<DecorationType, () => THREE.BufferGeometry[]> = {
  pine: () => [
    part(prism(0.05, 0.07, 0.2), 'woodDark'),
    part(cone(0.32, 0.45, 6), 'grass', [0, 0.2, 0]),
    part(cone(0.24, 0.35, 6), 'meadow', [0, 0.5, 0]),
  ],
  palm: () => [
    part(prism(0.04, 0.06, 0.7), 'wood'),
    ...[0, 1, 2, 3, 4].map((i) =>
      part(box(0.36, 0.03, 0.1), 'grass', [Math.cos(leaf(i)) * 0.18, 0.68, -Math.sin(leaf(i)) * 0.18], leaf(i)),
    ),
  ],
  garden: () => [
    part(box(0.7, 0.08, 0.7), 'woodDark'),
    part(box(0.62, 0.05, 0.62), 'grass', [0, 0.08, 0]),
    ...[
      [-0.18, -0.18],
      [0.18, -0.15],
      [0, 0.12],
      [-0.2, 0.2],
      [0.2, 0.2],
    ].map(([x = 0, z = 0]) => part(box(0.1, 0.1, 0.1), 'glow', [x, 0.13, z])),
  ],
  lamp: () => [
    part(box(0.5, 0.05, 0.16), 'wood', [-0.05, 0.18, 0.1]),
    part(box(0.5, 0.16, 0.04), 'wood', [-0.05, 0.2, 0.2]),
    part(box(0.04, 0.18, 0.12), 'woodDark', [-0.26, 0, 0.1]),
    part(box(0.04, 0.18, 0.12), 'woodDark', [0.16, 0, 0.1]),
    part(box(0.04, 0.7, 0.04), 'stone', [0.3, 0, -0.2]),
    part(box(0.12, 0.12, 0.12), 'glow', [0.3, 0.7, -0.2]),
  ],
  well: () => [
    part(prism(0.3, 0.32, 0.3, 8), 'stone'),
    part(prism(0.24, 0.24, 0.02, 8), 'shallows', [0, 0.3, 0]),
    part(box(0.05, 0.5, 0.05), 'woodDark', [-0.26, 0.3, 0]),
    part(box(0.05, 0.5, 0.05), 'woodDark', [0.26, 0.3, 0]),
    part(cone(0.4, 0.22, 4), 'roof', [0, 0.78, 0], Math.PI / 4),
  ],
  stall: () => [
    part(box(0.7, 0.32, 0.36), 'wall', [0, 0, 0.1]),
    part(box(0.7, 0.04, 0.4), 'wood', [0, 0.32, 0.1]),
    ...[-0.32, 0.32].map((x) => part(box(0.04, 0.7, 0.04), 'woodDark', [x, 0, -0.18])),
    part(box(0.8, 0.05, 0.6), 'roof', [0, 0.7, 0]),
  ],
  fountain: () => [
    part(prism(0.5, 0.52, 0.18, 8), 'stone'),
    part(prism(0.44, 0.44, 0.02, 8), 'shallows', [0, 0.18, 0]),
    part(prism(0.07, 0.09, 0.45, 6), 'stone', [0, 0.18, 0]),
    part(prism(0.2, 0.08, 0.08, 8), 'stone', [0, 0.6, 0]),
    part(prism(0.16, 0.16, 0.02, 8), 'shallows', [0, 0.68, 0]),
  ],
  statue: () => [
    part(box(0.44, 0.24, 0.44), 'stone'),
    part(prism(0.12, 0.15, 0.5, 6), 'plaza', [0, 0.24, 0]),
    part(new THREE.IcosahedronGeometry(0.11, 0), 'plaza', [0, 0.85, 0]),
    part(box(0.36, 0.06, 0.06), 'plaza', [0, 0.62, 0]),
  ],
}
```

If `palm` leaves or any part breaks the 0.6 or palette tests, adjust sizes, not the tests. Only colour names that exist in `scenePalette` are allowed (`shallows`, `glow`, `plaza`, `stone`, `wood`, `woodDark`, `grass`, `meadow`, `wall`, `roof` all exist).

- [ ] **Step 5: Register the kinds** — in `apps/web/src/scene/models/structures.ts`:

```ts
import { DECORATION_TYPES, type DecorationType } from '@archipelago/shared'
import { decorationBuilders } from './decorations'

export type ModelKind =
  | StructureKind
  | DecorationType
  | 'jib'
  | 'storm'
  | 'lantern'
  | 'shadow'
  | 'selection'
  | 'plot'
export const MODEL_KINDS: readonly ModelKind[] = [
  ...STRUCTURE_KINDS,
  ...DECORATION_TYPES,
  'jib',
  'storm',
  'lantern',
  'shadow',
  'selection',
  'plot',
]
```

In `builders`, spread `...decorationBuilders,` and add:

```ts
  // A flat hex just above the land; turned 30° so its corners meet the hex's corners.
  plot: () => [
    part(new THREE.CircleGeometry(0.8, 6).rotateX(-Math.PI / 2), 'selection', [0, 0.03, 0], Math.PI / 6),
  ],
```

Drop the `export { DECORATION_TYPES }` line from `decorations.ts` if Biome flags it as an unused re-export.

- [ ] **Step 6: Materials** — append to `apps/web/src/scene/materials.ts`:

```ts
/** The glow on plots a decoration can go on. */
export const plotMaterial = new THREE.MeshBasicMaterial({
  vertexColors: true,
  transparent: true,
  opacity: 0.35,
  depthWrite: false,
})
/** The decoration about to be placed. */
export const placementGhostMaterial = new THREE.MeshLambertMaterial({
  vertexColors: true,
  flatShading: true,
  transparent: true,
  opacity: 0.5,
  depthWrite: false,
})
```

- [ ] **Step 7: Run tests**

Run: `cd apps/web && bunx vitest run src/scene` — Expected: PASS.
Run: `bun run typecheck` — Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/scene
git commit -m "feat(web): model decorations on islands and build their low-poly geometry"
```

---

### Task 5: Scene rendering — decorations, selection, plot glow and ghost

**Files:**
- Modify: `apps/web/src/scene/model-instances.tsx`, `apps/web/src/scene/island.tsx`, `apps/web/src/scene/world-contents.tsx`, `apps/web/src/scene/world-scene.tsx`
- Modify: `apps/web/src/scene/world-contents.test.tsx`
- Modify: `apps/web/src/world/world-view.tsx`, `apps/web/src/layout/world-screen.tsx` (temporary inert props only; Task 7 replaces them)

**Interfaces:**
- Consumes: Task 4 (`SceneIsland.decorations`, decoration `ModelKind`s, `'plot'`, `plotMaterial`, `placementGhostMaterial`), `decorationRotation` (Task 1).
- Produces (in `scene/world-contents.tsx`):

```ts
export type Placement = {
  /** The island being decorated; only it shows the glow and ghost. */
  projectId: string
  plots: readonly Hex[]
  ghost: { type: DecorationType; plot: Hex } | null
}
export type SceneHandlers = {
  onSelect: (taskId: string | null) => void
  onSelectBuilding: (buildingId: string) => void
  onPickPlot: (plot: Hex) => void
  onOpenIsland: (projectId: string) => void
  onOpenDistrict: (projectId: string, milestoneId: string) => void
}
export type WorldContentsProps = SceneHandlers & {
  model: SceneModel
  focus: Focus
  selectedTaskId: string | null
  selectedBuildingId: string | null
  placement: Placement | null
  animate: boolean
}
```

  `WorldSceneProps` gains `selectedBuildingId`, `placement`, `onSelectBuilding`, `onPickPlot` (it already spreads into `WorldContents`). `WorldView` gains the same four as required props and passes them to `WorldScene`.
- Scene node names tests rely on: decoration meshes are named by type (`pine`, …), the glow is `plot`, the ghost is `ghost`, the ring is `selection`.

- [ ] **Step 1: Failing scene-graph tests** — in `apps/web/src/scene/world-contents.test.tsx`:

Change `handlers` and `render` to:

```ts
const handlers = () => ({
  onSelect: vi.fn(),
  onSelectBuilding: vi.fn(),
  onPickPlot: vi.fn(),
  onOpenIsland: vi.fn(),
  onOpenDistrict: vi.fn(),
})

async function render(
  world: WorldDto,
  focus: Focus,
  selectedTaskId: string | null = null,
  extra: Partial<Pick<WorldContentsProps, 'selectedBuildingId' | 'placement'>> = {},
) {
  const h = handlers()
  const renderer = await ReactThreeTestRenderer.create(
    <WorldContents
      model={buildSceneModel(world, today)}
      focus={focus}
      selectedTaskId={selectedTaskId}
      selectedBuildingId={extra.selectedBuildingId ?? null}
      placement={extra.placement ?? null}
      animate={false}
      {...h}
    />,
  )
  return { renderer, ...h }
}
```

Append a new `describe`:

```ts
describe('decorations and placement', () => {
  function decorated() {
    const s = seeded()
    const pine = fakeBuilding({ projectId: s.beta.id, type: 'pine', plotX: 0, plotY: 1, rotation: 2 })
    const well = fakeBuilding({ projectId: s.beta.id, type: 'well', plotX: -1, plotY: 1 })
    return { ...s, pine, well, world: { ...s.world, buildings: [pine, well] } }
  }

  test('draws decorations per type, each with a shadow', async () => {
    const { world, beta } = decorated()
    const { renderer } = await render(world, { kind: 'island', projectId: beta.id })
    const island = one(renderer.scene, `island:${beta.id}`)
    expect(instanceCount(island, 'pine')).toBe(1)
    expect(instanceCount(island, 'well')).toBe(1)
    expect(instanceCount(island, 'shadow')).toBe(6)
  })

  test('a decoration tap on the focused island selects it; the ring follows', async () => {
    const { world, beta, pine } = decorated()
    const { renderer, onSelectBuilding } = await render(world, { kind: 'island', projectId: beta.id })
    await renderer.fireEvent(one(renderer.scene, 'pine'), 'click', { instanceId: 0, delta: 1 })
    expect(onSelectBuilding).toHaveBeenCalledWith(pine.id)
    const again = await render(world, { kind: 'island', projectId: beta.id }, null, {
      selectedBuildingId: pine.id,
    })
    const ring = one(again.renderer.scene, 'selection')
    expect(ring.props.position).toEqual([expect.closeTo(hexToWorld({ q: 0, r: 1 }).x), LAND_HEIGHT, expect.closeTo(hexToWorld({ q: 0, r: 1 }).z)])
  })

  test('placement glows each plot; a tap picks it, a pan does not', async () => {
    const { world, beta } = decorated()
    const plots = [{ q: 1, r: -1 }, { q: 2, r: -1 }, { q: -2, r: 1 }]
    const { renderer, onPickPlot } = await render(world, { kind: 'island', projectId: beta.id }, null, {
      placement: { projectId: beta.id, plots, ghost: null },
    })
    const glow = one(renderer.scene, 'plot')
    expect((glow.instance as THREE.InstancedMesh).count).toBe(3)
    await renderer.fireEvent(glow, 'click', { instanceId: 2, delta: 20 })
    expect(onPickPlot).not.toHaveBeenCalled()
    await renderer.fireEvent(glow, 'click', { instanceId: 2, delta: 2 })
    expect(onPickPlot).toHaveBeenCalledWith({ q: -2, r: 1 })
    expect(named(renderer.scene, 'ghost')).toHaveLength(0)
  })

  test('the ghost stands on its plot, turned like the server will turn it', async () => {
    const { world, beta } = decorated()
    const plot = { q: 2, r: -1 }
    const { renderer } = await render(world, { kind: 'island', projectId: beta.id }, null, {
      placement: { projectId: beta.id, plots: [plot], ghost: { type: 'fountain', plot } },
    })
    const ghost = one(renderer.scene, 'ghost')
    const at = hexToWorld(plot)
    expect(ghost.props.position).toEqual([at.x, LAND_HEIGHT, at.z])
    expect(ghost.props.rotation).toEqual([0, (decorationRotation(plot) * Math.PI) / 3, 0])
  })

  test('while placing, nothing else answers a tap', async () => {
    const { world, beta, gamma } = decorated()
    const r = await render(world, { kind: 'island', projectId: beta.id }, null, {
      placement: { projectId: beta.id, plots: [{ q: 1, r: -1 }], ghost: null },
    })
    const island = one(r.renderer.scene, `island:${beta.id}`)
    await r.renderer.fireEvent(one(island, 'scaffold'), 'click', { instanceId: 0, delta: 1 })
    await r.renderer.fireEvent(one(island, 'pine'), 'click', { instanceId: 0, delta: 1 })
    await r.renderer.fireEvent(one(island, 'terrain'), 'click', { delta: 1 })
    await r.renderer.fireEvent(one(r.renderer.scene, 'sea'), 'click', { delta: 1 })
    await r.renderer.fireEvent(one(r.renderer.scene, `island:${gamma.id}`), 'click', { delta: 1 })
    expect(r.onSelect).not.toHaveBeenCalled()
    expect(r.onSelectBuilding).not.toHaveBeenCalled()
    expect(r.onOpenIsland).not.toHaveBeenCalled()
    // The landmark: tap it the same way the existing district-navigation test does.
    expect(r.onOpenDistrict).not.toHaveBeenCalled()
  })

  test('only the island being decorated shows the glow', async () => {
    const { world, beta, gamma } = decorated()
    const { renderer } = await render(world, { kind: 'island', projectId: beta.id }, null, {
      placement: { projectId: gamma.id, plots: [{ q: 1, r: -1 }], ghost: null },
    })
    expect(named(one(renderer.scene, `island:${beta.id}`), 'plot')).toHaveLength(0)
  })
})
```

Add imports: `decorationRotation` from `@archipelago/shared`; `fakeBuilding` from `../test/fake-api`; `hexToWorld`, `LAND_HEIGHT` from `./model/hex-space`; `type WorldContentsProps` from `./world-contents`. In the "nothing else answers" test, also fire a tap on the MVP landmark exactly as the existing district-navigation test in this file does, before the last `expect`. If `expect.closeTo` inside `toEqual` on a tuple is awkward, compare the three numbers separately with `toBeCloseTo`.

- [ ] **Step 2: Run, expect failure**

Run: `cd apps/web && bunx vitest run src/scene/world-contents.test.tsx`
Expected: FAIL (no decoration meshes, no `plot`/`ghost`).

- [ ] **Step 3: Per-instance turns** — `apps/web/src/scene/model-instances.tsx`: add a prop `turns?: readonly number[]` (radians about y, one per point) and set each matrix with it:

```ts
    const matrix = new THREE.Matrix4()
    points.forEach((p, i) => {
      matrix.makeRotationY(turns?.[i] ?? 0).setPosition(p.x, LAND_HEIGHT, p.z)
      mesh.setMatrixAt(i, matrix)
    })
```

and add `turns` to the layout effect's dependencies.

- [ ] **Step 4: Island** — `apps/web/src/scene/island.tsx`. New props: `selectedBuildingId: string | null`, `placement: Placement | null` (already filtered to this island by `WorldContents`), plus the two new handlers from `SceneHandlers`. Add, keeping existing code:

```ts
/** One rotation step is 60°. */
const TURN = Math.PI / 3
```

```ts
  const decorationLayers = useMemo(
    () =>
      DECORATION_TYPES.map((type) => {
        const decorations = island.decorations.filter((d) => d.type === type)
        return {
          type,
          decorations,
          points: decorations.map((d) => d.position),
          turns: decorations.map((d) => d.rotation * TURN),
        }
      }),
    [island.decorations],
  )
  const plotPoints = useMemo(() => placement?.plots.map(hexToWorld) ?? [], [placement?.plots])
```

Change `shadows` in `layers` to `[...island.structures, ...island.decorations].map((s) => s.position)` and add `island.decorations` to that memo's dependencies.

Render, after the structure layers:

```tsx
      {decorationLayers.map(({ type, decorations, points, turns }) => (
        <ModelInstances
          key={type}
          kind={type}
          points={points}
          turns={turns}
          onPick={
            focused
              ? (i) => {
                  const d = decorations[i]
                  if (d) onSelectBuilding(d.buildingId)
                }
              : undefined
          }
        />
      ))}
      {placement && (
        <ModelInstances
          kind="plot"
          points={plotPoints}
          material={plotMaterial}
          onPick={(i) => {
            const plot = placement.plots[i]
            if (plot) onPickPlot(plot)
          }}
        />
      )}
      {placement?.ghost && (
        <Ghost type={placement.ghost.type} plot={placement.ghost.plot} />
      )}
```

with, in the same file:

```tsx
/** The decoration about to be bought; no handlers, so taps fall through to the glow beneath. */
function Ghost({ type, plot }: { type: DecorationType; plot: Hex }) {
  const at = hexToWorld(plot)
  return (
    <mesh
      name="ghost"
      geometry={modelGeometry(type)}
      material={placementGhostMaterial}
      position={[at.x, LAND_HEIGHT, at.z]}
      rotation={[0, decorationRotation(plot) * TURN, 0]}
    />
  )
}
```

The selection ring: replace `const selected = …` with

```ts
  const selected =
    island.structures.find((s) => s.taskId === selectedTaskId) ??
    island.decorations.find((d) => d.buildingId === selectedBuildingId)
```

(the ring JSX already reads only `selected.position`).

- [ ] **Step 5: WorldContents** — `apps/web/src/scene/world-contents.tsx`: export `Placement`, extend `SceneHandlers` and `WorldContentsProps` as in Interfaces, and make every handler except `onPickPlot` inert while placing:

```tsx
const ignore = () => {}

export function WorldContents({
  model,
  focus,
  selectedTaskId,
  selectedBuildingId,
  placement,
  animate,
  ...handlers
}: WorldContentsProps) {
  // While placing, only a glowing plot answers a tap (spec 15.5).
  const live: SceneHandlers = placement
    ? {
        onSelect: ignore,
        onSelectBuilding: ignore,
        onOpenIsland: ignore,
        onOpenDistrict: ignore,
        onPickPlot: handlers.onPickPlot,
      }
    : handlers
```

Use `live` wherever `handlers` was used (`Sea`'s `onTapSea`, the `Island` spread), and pass each `Island` `selectedBuildingId={selectedBuildingId}` and `placement={placement?.projectId === island.projectId ? placement : null}`.

- [ ] **Step 6: Plumb the props without behaviour yet**

- `scene/world-scene.tsx`: add `selectedBuildingId: string | null` and `placement: Placement | null` to `WorldSceneProps` (the two handlers come with `SceneHandlers`). `WorldContents` already receives `{...props}`.
- `world/world-view.tsx`: add required props `selectedBuildingId: string | null`, `placement: Placement | null`, `onSelectBuilding: (buildingId: string) => void`, `onPickPlot: (plot: Hex) => void`, and pass all four to `<WorldScene>`.
- `layout/world-screen.tsx`: pass `selectedBuildingId={null}`, `placement={null}`, `onSelectBuilding={() => {}}`, `onPickPlot={() => {}}` to `WorldView`. Task 7 replaces these four lines; leave a one-line comment `// Wired up with placement mode.` above them.

- [ ] **Step 7: Run tests**

Run: `cd apps/web && bunx vitest run` — Expected: PASS (all web tests; the integration stubs ignore the extra props).
Run: `bun run typecheck && bun run lint` — Expected: PASS / known info only.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): draw decorations, select them, and glow placeable plots with a ghost"
```

---

### Task 6: Shop panel, decoration icons and the HUD chip

**Files:**
- Create: `apps/web/src/shop/decoration-icon.tsx`, `apps/web/src/shop/shop-panel.tsx`, `apps/web/src/shop/shop-panel.test.tsx`
- Modify: `apps/web/src/world/world-hud.tsx`

**Interfaces:**
- Consumes: `SHOP_ITEMS`, `DecorationType` (Task 1).
- Produces:
  - `ShopPanel({ balance, hasFreeLand, onPick }: { balance: number; hasFreeLand: boolean; onPick: (type: DecorationType) => void })`.
  - `DecorationIcon({ type }: { type: DecorationType })` — a 40×40 decorative SVG (`aria-hidden`).
  - `WorldHud` gains `onOpenShop?: () => void`; a `Shop` chip renders in island and district views when it is set.

- [ ] **Step 1: Failing test** — `apps/web/src/shop/shop-panel.test.tsx`

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { ShopPanel } from './shop-panel'

const item = (name: RegExp) => screen.getByRole('button', { name })

describe('ShopPanel', () => {
  test('lists every item with its price; affordable ones pick', async () => {
    const onPick = vi.fn()
    render(<ShopPanel balance={50} hasFreeLand onPick={onPick} />)
    expect(screen.getAllByRole('button')).toHaveLength(8)
    expect(item(/Pine tree.*30/)).toBeEnabled()
    expect(item(/Palm tree.*40/)).toBeEnabled()
    expect(item(/Flower garden.*60/)).toBeDisabled()
    expect(item(/Flower garden/)).toHaveAccessibleDescription('Need 10 more')
    await userEvent.click(item(/Palm tree/))
    expect(onPick).toHaveBeenCalledWith('palm')
  })

  test('a balance equal to the price is enough', () => {
    render(<ShopPanel balance={30} hasFreeLand onPick={() => {}} />)
    expect(item(/Pine tree/)).toBeEnabled()
    expect(item(/Palm tree/)).toHaveAccessibleDescription('Need 10 more')
  })

  test('a negative balance disables everything and says why', () => {
    render(<ShopPanel balance={-5} hasFreeLand onPick={() => {}} />)
    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled()
      expect(button).toHaveAccessibleDescription('Balance is negative')
    }
  })

  test('no free land disables everything with one message', () => {
    render(<ShopPanel balance={1000} hasFreeLand={false} onPick={() => {}} />)
    expect(screen.getByText('No free land. Islands grow as you add tasks.')).toBeInTheDocument()
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled()
  })
})
```

- [ ] **Step 2: Run, expect failure**

Run: `cd apps/web && bunx vitest run src/shop/shop-panel.test.tsx` — Expected: FAIL (module not found).

- [ ] **Step 3: Icons** — `apps/web/src/shop/decoration-icon.tsx`

```tsx
import type { DecorationType } from '@archipelago/shared'
import type { ReactNode } from 'react'

const shapes: Record<DecorationType, ReactNode> = {
  pine: (
    <>
      <path className="fill-success" d="M20 4 30 22H10Z M20 12 33 32H7Z" />
      <rect className="fill-warning" x="18" y="32" width="4" height="5" />
    </>
  ),
  palm: (
    <>
      <path className="fill-warning" d="M19 14h3l2 23h-6Z" />
      <path className="fill-success" d="M20 14C14 6 6 8 4 12c6-2 11 0 16 2Zm0 0c6-8 14-6 16-2-6-2-11 0-16 2Zm0 0c-2-6-8-9-11-8 5 2 8 5 11 8Z" />
    </>
  ),
  garden: (
    <>
      <rect className="fill-success" x="6" y="22" width="28" height="12" rx="2" />
      <circle className="fill-warning" cx="13" cy="20" r="3" />
      <circle className="fill-error" cx="20" cy="17" r="3" />
      <circle className="fill-brand-secondary" cx="27" cy="20" r="3" />
    </>
  ),
  lamp: (
    <>
      <rect className="fill-text-secondary" x="28" y="8" width="3" height="29" />
      <rect className="fill-warning" x="25" y="5" width="9" height="7" rx="1" />
      <rect className="fill-warning" x="5" y="24" width="18" height="4" />
      <rect className="fill-warning" x="5" y="17" width="18" height="3" />
    </>
  ),
  well: (
    <>
      <path className="fill-brand-secondary" d="M8 6h24l-4 7H12Z" />
      <rect className="fill-text-secondary" x="9" y="24" width="22" height="13" rx="2" />
      <rect className="fill-warning" x="10" y="12" width="2" height="12" />
      <rect className="fill-warning" x="28" y="12" width="2" height="12" />
    </>
  ),
  stall: (
    <>
      <path className="fill-brand-secondary" d="M4 10h32l-3 7H7Z" />
      <rect className="fill-surface-secondary stroke-border-secondary" x="8" y="24" width="24" height="13" />
      <rect className="fill-warning" x="8" y="17" width="2" height="8" />
      <rect className="fill-warning" x="30" y="17" width="2" height="8" />
    </>
  ),
  fountain: (
    <>
      <ellipse className="fill-text-secondary" cx="20" cy="32" rx="16" ry="5" />
      <ellipse className="fill-brand-secondary" cx="20" cy="30" rx="13" ry="3" />
      <rect className="fill-text-secondary" x="18" y="14" width="4" height="16" />
      <path className="fill-brand-secondary" d="M20 4c4 4 4 8 0 10-4-2-4-6 0-10Z" />
    </>
  ),
  statue: (
    <>
      <rect className="fill-text-secondary" x="10" y="28" width="20" height="9" />
      <rect className="fill-border-secondary" x="16" y="13" width="8" height="15" />
      <circle className="fill-border-secondary" cx="20" cy="9" r="4" />
    </>
  ),
}

/** A flat silhouette of each decoration, so the shop never loads the 3D chunk. */
export function DecorationIcon({ type }: { type: DecorationType }) {
  return (
    <svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true" className="shrink-0">
      {shapes[type]}
    </svg>
  )
}
```

Use only colour utilities that exist in the A'raf Tailwind theme (`apps/web/src/styles.css`); if one of the classes above is not defined there, swap it for the nearest defined token.

- [ ] **Step 4: Panel** — `apps/web/src/shop/shop-panel.tsx`

```tsx
import { type DecorationType, SHOP_ITEMS } from '@archipelago/shared'
import { useId } from 'react'
import { DecorationIcon } from './decoration-icon'

function shortfall(price: number, balance: number): string | null {
  if (balance < 0) return 'Balance is negative'
  if (price > balance) return `Need ${price - balance} more`
  return null
}

export function ShopPanel({
  balance,
  hasFreeLand,
  onPick,
}: {
  balance: number
  hasFreeLand: boolean
  onPick: (type: DecorationType) => void
}) {
  const id = useId()
  return (
    <div className="space-y-3">
      {!hasFreeLand && (
        <p className="text-sm text-text-secondary">No free land. Islands grow as you add tasks.</p>
      )}
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {SHOP_ITEMS.map((item) => {
          const reason = hasFreeLand ? shortfall(item.price, balance) : null
          const reasonId = `${id}-${item.type}`
          return (
            <li key={item.type}>
              <button
                type="button"
                disabled={!hasFreeLand || reason !== null}
                aria-describedby={reason ? reasonId : undefined}
                onClick={() => onPick(item.type)}
                className="flex min-h-11 w-full items-center gap-2 rounded-md bg-surface-secondary p-2 text-left disabled:opacity-50"
              >
                <DecorationIcon type={item.type} />
                <span className="flex flex-col">
                  <span className="text-sm text-text-primary">{item.name}</span>
                  <span className="text-xs text-text-secondary">{item.price} Supplies</span>
                  {reason && (
                    <span id={reasonId} className="text-xs text-error">
                      {reason}
                    </span>
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
```

- [ ] **Step 5: HUD chip** — `apps/web/src/world/world-hud.tsx`: add `onOpenShop?: () => void` to the props, and in both the island and district branches, as the last chip:

```tsx
          {onOpenShop && (
            <button type="button" onClick={onOpenShop} className={`${chip} text-brand`}>
              Shop
            </button>
          )}
```

- [ ] **Step 6: Run tests**

Run: `cd apps/web && bunx vitest run src/shop src/world` — Expected: PASS.
Run: `bun run typecheck && bun run lint` — Expected: PASS / known info only.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/shop apps/web/src/world/world-hud.tsx
git commit -m "feat(web): add the shop panel with affordability and the HUD shop chip"
```

---

### Task 7: Placement mode and removal on the world screen

**Files:**
- Create: `apps/web/src/shop/placement-bar.tsx`, `apps/web/src/shop/building-bar.tsx`
- Modify: `apps/web/src/layout/world-screen.tsx`, `apps/web/src/world/world-view.tsx`
- Create: `apps/web/src/layout/world-shop.test.tsx`

**Interfaces:**
- Consumes: `usePlaceBuilding`, `useRemoveBuilding`, `islandOccupied` (Task 3); `Placement`, the four scene props (Task 5); `ShopPanel`, `WorldHud.onOpenShop` (Task 6); `placeablePlots`, `shopItem`, `refundFor` (Task 1).
- Produces: user-visible behaviour only (spec 15.4–15.6).
  - `PlacementBar({ item, hasGhost, pending, onConfirm, onCancel })`, `BuildingBar({ name, refund, pending, onRemove })`.
  - `WorldView` gains `onOpenShop?: () => void`, passed to `WorldHud`.

**Behaviour to build in `WorldScreen`** (all state lives here):

- New state: `placing: { type: DecorationType; plot: Hex | null } | null`, `selectedBuildingId: string | null`, `submitting: boolean`. `Editor` gains `{ kind: 'shop' }` titled `Shop`.
- `plots = useMemo(() => project ? placeablePlots(islandOccupied(world.data, project.id)) : [], [world.data, project?.id])` — compute it before the early returns using `world.data`/route params, or memoise on `world.data` and the resolved project id; it must not change identity between renders when the world has not changed.
- `ghostPlot` = `placing?.plot` only if it is still in `plots` (a refetch that takes the plot clears the ghost without an effect).
- `Shop` chip: `onOpenShop={project ? () => setEditor({ kind: 'shop' }) : undefined}` on `WorldView`.
- Picking an item: close the editor, `setPlacing({ type, plot: null })`, clear both selections, `setSheetDetent(0)`.
- `onPickPlot(plot)`: `setPlacing((p) => (p ? { ...p, plot } : p))`.
- Confirm: if `submitting` or no ghost, return; `setSubmitting(true)`; `place.mutate({ projectId, type, plotX, plotY }, { onSuccess: () => setPlacing(null), onError: () => setPlacing((p) => (p ? { ...p, plot: null } : p)), onSettled: () => setSubmitting(false) })`. A React state flag (not the mutation's `isPending`, which flips asynchronously) is what stops a double tap.
- Cancel: the bar's `Cancel`, `Esc` (checked before the editor/step-out branches in `onEscape`), and the route-change effect (which also clears `selectedBuildingId`).
- Selection: `onSelect(taskId)` also clears `selectedBuildingId`; `onSelectBuilding(id)` sets it and clears `selectedTaskId`. `selectedBuilding = world.data.buildings.find(...)` — a building gone after a refetch drops the bar.
- Remove: `BuildingBar` confirms with `window.confirm(\`Remove ${name} for ${refund} Supplies back?\`)`, then `remove.mutate(id, { onSuccess: () => setSelectedBuildingId(null) })`.
- `PanelFrame accessory`: the `PlacementBar` while placing, else the `BuildingBar` when a known-type building is selected, else the `IslandSwitcher`.
- Pass `placement={placing && project ? { projectId: project.id, plots, ghost: ghostPlot ? { type: placing.type, plot: ghostPlot } : null } : null}` (memoise it), `selectedBuildingId`, `onSelectBuilding`, `onPickPlot` to `WorldView`, replacing Task 5's inert values and comment.

- [ ] **Step 1: Bars** — `apps/web/src/shop/placement-bar.tsx`

```tsx
import type { ShopItemDto } from '@archipelago/shared'

const bar =
  'pointer-events-auto flex min-h-11 items-center justify-between gap-2 rounded-md bg-surface-primary/95 px-3 py-1 shadow'
const action = 'inline-flex min-h-11 items-center rounded-md px-3'

export function PlacementBar({
  item,
  hasGhost,
  pending,
  onConfirm,
  onCancel,
}: {
  item: ShopItemDto
  hasGhost: boolean
  pending: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div role="toolbar" aria-label={`Placing ${item.name}`} className={bar}>
      {hasGhost ? (
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending}
          className={`${action} bg-brand text-text-on-brand disabled:opacity-50`}
        >
          {pending ? 'Placing…' : `Place · ${item.price}`}
        </button>
      ) : (
        <p className="text-sm text-text-secondary">Tap a glowing plot</p>
      )}
      <button type="button" onClick={onCancel} className={`${action} text-text-secondary`}>
        Cancel
      </button>
    </div>
  )
}
```

`apps/web/src/shop/building-bar.tsx`

```tsx
const bar =
  'pointer-events-auto flex min-h-11 items-center justify-between gap-2 rounded-md bg-surface-primary/95 px-3 py-1 shadow'

export function BuildingBar({
  name,
  refund,
  pending,
  onRemove,
}: {
  name: string
  refund: number
  pending: boolean
  onRemove: () => void
}) {
  return (
    <div role="toolbar" aria-label={name} className={bar}>
      <p className="text-sm text-text-primary">{name}</p>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (window.confirm(`Remove ${name} for ${refund} Supplies back?`)) onRemove()
        }}
        className="inline-flex min-h-11 items-center rounded-md px-3 text-error disabled:opacity-50"
      >
        Remove (+{refund})
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Failing screen tests** — `apps/web/src/layout/world-shop.test.tsx`

```tsx
import { act, fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import type { WorldSceneProps } from '../scene/world-scene'
import { createFakeApi, fakeBuilding, fakeEntry, fakeProject, fakeTask } from '../test/fake-api'
import { renderApp } from '../test/render-app'

vi.mock('../scene/webgl', () => ({ hasWebGL: () => true, resetWebGLProbe: () => {} }))

// Stands in for the canvas: exposes placement plots, decorations and structures as buttons.
vi.mock('../scene/world-scene', () => ({
  WorldScene: ({
    model,
    placement,
    selectedBuildingId,
    coveredBottom,
    onPickPlot,
    onSelectBuilding,
    onSelect,
  }: WorldSceneProps) => (
    <div
      data-testid="scene"
      data-covered={coveredBottom}
      data-plots={placement?.plots.length ?? 0}
      data-ghost={placement?.ghost ? `${placement.ghost.plot.q},${placement.ghost.plot.r}` : ''}
      data-building={selectedBuildingId ?? ''}
    >
      {placement?.plots.map((p) => (
        <button key={`${p.q},${p.r}`} type="button" onClick={() => onPickPlot(p)}>
          plot {p.q},{p.r}
        </button>
      ))}
      {model.islands.flatMap((island) => [
        ...island.decorations.map((d) => (
          <button key={d.buildingId} type="button" onClick={() => onSelectBuilding(d.buildingId)}>
            decoration {d.type}
          </button>
        )),
        ...island.structures.map((s) => (
          <button key={s.taskId} type="button" onClick={() => onSelect(s.taskId)}>
            structure {s.taskId}
          </button>
        )),
      ])}
    </div>
  ),
}))

function seeded(funds = 100) {
  const beta = fakeProject({ name: 'Beta' })
  const task = fakeTask({ projectId: beta.id, title: 'Ship', plotX: 1, plotY: 0 })
  const pine = fakeBuilding({ projectId: beta.id, type: 'pine', plotX: -1, plotY: 0 })
  const fake = createFakeApi({
    world: { projects: [beta], milestones: [], tasks: [task], buildings: [pine] },
    ledger: [fakeEntry({ kind: 'daily_bonus', amount: funds })],
  })
  return { beta, task, pine, ...fake }
}

const scene = () => screen.getByTestId('scene')

async function startPlacing(user: ReturnType<typeof renderApp>['user'], name = /Pine tree/) {
  await user.click(await screen.findByRole('button', { name: 'Shop' }))
  const dialog = await screen.findByRole('dialog', { name: 'Shop' })
  await user.click(within(dialog).getByRole('button', { name }))
}

describe('shop on the world screen', () => {
  test('the Shop chip shows on an island, not on the archipelago', async () => {
    const { api, beta } = seeded()
    const { router } = renderApp({ api, path: '/' })
    await screen.findByTestId('scene')
    expect(screen.queryByRole('button', { name: 'Shop' })).not.toBeInTheDocument()
    await act(() => router.navigate({ to: '/p/$projectId', params: { projectId: beta.id } }))
    expect(await screen.findByRole('button', { name: 'Shop' })).toBeInTheDocument()
  })

  test('pick, place and pay', async () => {
    const { api, beta, state } = seeded()
    const { user } = renderApp({ api, path: `/p/${beta.id}` })
    await screen.findByTestId('scene')
    const coveredBefore = Number(scene().dataset.covered)
    await startPlacing(user)
    expect(screen.queryByRole('dialog', { name: 'Shop' })).not.toBeInTheDocument()
    // The sheet drops to its lowest detent, so less of the world is covered.
    expect(Number(scene().dataset.covered)).toBeLessThan(coveredBefore)
    expect(screen.getByText('Tap a glowing plot')).toBeInTheDocument()
    expect(Number(scene().dataset.plots)).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: 'plot 0,1' }))
    expect(scene().dataset.ghost).toBe('0,1')
    await user.click(screen.getByRole('button', { name: 'Place · 30' }))
    expect(await screen.findByText('Pine tree placed · −30')).toBeInTheDocument()
    expect(screen.queryByRole('toolbar', { name: 'Placing Pine tree' })).not.toBeInTheDocument()
    expect(state.world.buildings.map((b) => [b.plotX, b.plotY])).toContainEqual([0, 1])
  })

  test('a double tap on Place buys once', async () => {
    const { api, beta, calls } = seeded()
    const { user } = renderApp({ api, path: `/p/${beta.id}` })
    await startPlacing(user)
    await user.click(screen.getByRole('button', { name: 'plot 0,1' }))
    const place = screen.getByRole('button', { name: 'Place · 30' })
    fireEvent.click(place)
    fireEvent.click(place)
    await screen.findByText('Pine tree placed · −30')
    expect(calls.filter((c) => c === 'placeBuilding')).toHaveLength(1)
  })

  test('a taken plot keeps placement open and clears the ghost', async () => {
    const { api, beta, state } = seeded()
    const { user } = renderApp({ api, path: `/p/${beta.id}` })
    await startPlacing(user)
    await user.click(screen.getByRole('button', { name: 'plot 0,1' }))
    state.world.tasks.push(fakeTask({ projectId: beta.id, plotX: 0, plotY: 1 }))
    await user.click(screen.getByRole('button', { name: 'Place · 30' }))
    expect(await screen.findByText('That plot is taken')).toBeInTheDocument()
    expect(screen.getByText('Tap a glowing plot')).toBeInTheDocument()
    expect(scene().dataset.ghost).toBe('')
  })

  test('a refetch that takes the ghost’s plot clears the ghost', async () => {
    const { api, beta, state } = seeded()
    const { user, queryClient } = renderApp({ api, path: `/p/${beta.id}` })
    await startPlacing(user)
    await user.click(screen.getByRole('button', { name: 'plot 0,1' }))
    state.world.tasks.push(fakeTask({ projectId: beta.id, plotX: 0, plotY: 1 }))
    await act(() => queryClient.invalidateQueries({ queryKey: ['world'] }))
    expect(scene().dataset.ghost).toBe('')
    expect(screen.getByText('Tap a glowing plot')).toBeInTheDocument()
  })

  test('Cancel, Escape and a route change all end placement with nothing spent', async () => {
    const { api, beta, calls } = seeded()
    const { user, router } = renderApp({ api, path: `/p/${beta.id}`, desktop: true })
    await startPlacing(user)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(scene().dataset.plots).toBe('0')

    await startPlacing(user)
    await user.keyboard('{Escape}')
    expect(scene().dataset.plots).toBe('0')
    expect(router.state.location.pathname).toBe(`/p/${beta.id}`)

    await startPlacing(user)
    await act(() => router.navigate({ to: '/' }))
    await act(() => router.navigate({ to: '/p/$projectId', params: { projectId: beta.id } }))
    expect(scene().dataset.plots).toBe('0')
    expect(calls).not.toContain('placeBuilding')
  })

  test('select a decoration, remove it for half back', async () => {
    const { api, beta, task, pine, state } = seeded()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { user } = renderApp({ api, path: `/p/${beta.id}` })
    const shipRow = () => screen.getByText('Ship').closest('li')
    await user.click(await screen.findByRole('button', { name: `structure ${task.id}` }))
    expect(shipRow()).toHaveAttribute('aria-current', 'true')
    await user.click(screen.getByRole('button', { name: 'decoration pine' }))
    expect(scene().dataset.building).toBe(pine.id)
    // Selecting a decoration clears the selected task.
    expect(shipRow()).not.toHaveAttribute('aria-current')
    await user.click(screen.getByRole('button', { name: 'Remove (+15)' }))
    expect(confirm).toHaveBeenCalledWith('Remove Pine tree for 15 Supplies back?')
    expect(await screen.findByText('+15 Supplies')).toBeInTheDocument()
    expect(state.world.buildings).toEqual([])
    confirm.mockRestore()
  })
})
```

Notes for this step:
- If the shop `dialog` is not exposed with role `dialog` and name `Shop` on phone (vaul), query it the way existing editor tests find an open editor.

- [ ] **Step 3: Run, expect failure**

Run: `cd apps/web && bunx vitest run src/layout/world-shop.test.tsx` — Expected: FAIL (no Shop chip wired).

- [ ] **Step 4: Wire `WorldView`** — `world/world-view.tsx`: add `onOpenShop?: () => void` and pass it to `<WorldHud onOpenShop={onOpenShop} … />` (not to `CardWorld`: placement needs the scene).

- [ ] **Step 5: Wire `WorldScreen`** — implement the behaviour list above in `layout/world-screen.tsx`, rendering the shop as

```tsx
          {editor.kind === 'shop' && (
            <ShopPanel
              balance={world.data.economy.balance}
              hasFreeLand={plots.length > 0}
              onPick={(type) => {
                setEditor(null)
                setSelectedTaskId(null)
                setSelectedBuildingId(null)
                setPlacing({ type, plot: null })
                setSheetDetent(0)
              }}
            />
          )}
```

and the accessory as

```tsx
        accessory={
          placingItem ? (
            <PlacementBar
              item={placingItem}
              hasGhost={ghostPlot !== null}
              pending={submitting}
              onConfirm={confirmPlacement}
              onCancel={() => setPlacing(null)}
            />
          ) : selectedBuildingItem && selectedBuilding ? (
            <BuildingBar
              name={selectedBuildingItem.name}
              refund={refundFor(selectedBuildingItem.price)}
              pending={remove.isPending}
              onRemove={() =>
                remove.mutate(selectedBuilding.id, { onSuccess: () => setSelectedBuildingId(null) })
              }
            />
          ) : (
            <IslandSwitcher
              summaries={summaries}
              currentProjectId={project?.id ?? null}
              variant={isDesktop ? 'panel' : 'floating'}
            />
          )
        }
```

where `placingItem = placing ? shopItem(placing.type) : undefined` and `selectedBuildingItem = selectedBuilding ? shopItem(selectedBuilding.type) : undefined`. Hooks (`usePlaceBuilding`, `useRemoveBuilding`, `useMemo` for `plots` and `placement`) must sit above the early returns, like the existing `useState`s.

- [ ] **Step 6: Run tests**

Run: `cd apps/web && bunx vitest run` — Expected: PASS, including all pre-existing world-screen, integration and fallback tests.
Run: `bun run test && bun run typecheck && bun run lint && bun run build` (root) — Expected: all green, lint at the one known info, three.js still only in the world-scene chunk.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): place decorations from the shop and remove them for a refund"
```

- [ ] **Step 8: Manual check (report, do not block)**

`bun run --cwd apps/api dev` and `bun run --cwd apps/web dev -- --host`; on desktop and a phone: open an island, Shop, buy a pine with a daily claim's Supplies, tap glowing plots, place, select it, remove it.
