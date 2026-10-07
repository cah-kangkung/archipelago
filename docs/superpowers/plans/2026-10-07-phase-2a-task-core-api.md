# Phase 2a: Task Core API — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Projects, milestones and tasks with full create/read/update/delete, deterministic hex-plot assignment, task complete/reopen (no rewards yet) and `GET /world`, all behind the existing auth.

**Architecture:**
- Pure hex-grid maths, request schemas and DTO types live in `packages/shared`, so the web app (Phase 2b) reuses them.
- In `apps/api`, each resource gets a service module (database logic in one transaction, ownership-scoped) and a thin Hono route module mounted in `createApp`.
- Plot and district assignment lock the project row (`SELECT … FOR UPDATE`) so concurrent creates cannot collide. Unique indexes back this up.

**Tech Stack:** Bun 1.4.2, Hono 4.13, Drizzle ORM 0.45 (postgres.js), zod 4, Postgres 16, `bun test`.

**Spec:** `docs/superpowers/specs/2026-10-07-archipelago-task-game-design.md` (sections 5, 6, 10 Phase 2 row, and section 11 Phase 2 addendum).

## Global Constraints

- All Phase 1 constraints still apply:
  - Base path is `/api/v1`.
  - Errors use the `{ error: { code, message, fields? } }` shape, with codes `bad_request` 400, `unauthorized` 401, `not_found` 404, `conflict` 409, `validation_failed` 422, `rate_limited` 429, `internal` 500.
  - TypeScript `strict` + `noUncheckedIndexedAccess`; no `any`; no `!` in `src/`.
  - Biome formatting (single quotes, no semicolons, width 100).
  - Conventional Commits with NO AI attribution or `Co-Authored-By` trailers.
- Every route in this plan uses `requireAuth(deps)`, so both the session cookie and the bearer token work. Token management stays on `requireSession`.
- Resources the caller does not own, and malformed (non-UUID) path ids, return `404 not_found`. Never `403`, never `500`.
- Hex coordinates are axial `(q, r)`. Plot columns are `plot_x = q`, `plot_y = r`. District centres are 5 hexes apart (`DISTRICT_SPACING = 5`). The commons district centre is `(0, 0)`. Milestone centres are never `(0, 0)`.
- Landmark types cycle `lighthouse`, `town_hall`, `windmill`, `observatory`, `market` by the count of the project's existing milestones at creation.
- Ring-walk start direction for plots is `island_seed mod 6`.
- `PATCH /tasks/:id` can never set `status` to `done`. Completion goes only through `POST /tasks/:id/complete`. Reopening goes only through `POST /tasks/:id/reopen`.
- A milestone is complete if and only if it has at least one task and all of its tasks are `done`. This is re-evaluated after every task create, update, move, delete, complete or reopen that touches it.
- Archived projects are excluded from `GET /world` and still listed by `GET /projects`.
- API tests run inside `withRollback` against the real test database (Compose Postgres on `127.0.0.1:5433`).

## Review Focus

1. **Cross-user access.** User B passing user A's project, milestone or task id, in a path or as a body field (`projectId`, `milestoneId`), must get `404`/`422`, and A's data is untouched. Pinned in Tasks 4–7.
2. **Milestone from a different project.** Creating or moving a task into a milestone of another project (even one the caller owns) returns `422` with a `milestoneId` field error. Pinned in Task 6.
3. **Plot collisions.** Many tasks in one district, tasks moved between districts, and a deleted milestone's tasks falling back to the commons must never produce two tasks on the same plot, or a task on a district centre. Pinned in Tasks 5 and 6.
4. **Done-state bypass.** `PATCH { status: 'done' }`, completing an already-done task, and reopening a not-done task must be rejected (`422` / `409`) without changing the task. Pinned in Tasks 6 and 7.
5. **Bad dates and ids in input.** `dueDate: '2026-02-30'`, `dueDate: 'tomorrow'`, `projectId: 'abc'` and `?project=abc` return `422`, never `500`. Pinned in Tasks 2 and 6.

## File Structure

```
packages/shared/src/
  hex.ts              Hex type, directions, ring/spiral walks, district/slot/plot pickers, landmarks
  hex.test.ts
  resources.ts        zod input schemas for projects, milestones, tasks, task list query
  resources.test.ts
  dto.ts              ProjectDto, MilestoneDto, TaskDto, BuildingDto, WorldDto (types only)
  index.ts            (modify) re-export hex, resources, dto

apps/api/
  drizzle/0001_*.sql  milestones.district_q/r + unique indexes
  src/db/schema.ts    (modify) milestones district columns, unique indexes
  src/http/params.ts  idParam(): validates uuid path params → 404
  src/http/serialize.ts  row → DTO mappers
  src/world/plots.ts  occupied-plot set, task plot assignment, milestone completion sync
  src/projects/service.ts
  src/milestones/service.ts
  src/tasks/service.ts
  src/world/service.ts
  src/routes/projects.ts, projects.test.ts    /projects (+ nested POST /projects/:id/milestones)
  src/routes/milestones.ts, milestones.test.ts
  src/routes/tasks.ts, tasks.test.ts
  src/routes/world.ts, world.test.ts
  src/app.ts          (modify) mount the new routes
  test/auth.ts        authedApp(db): app + cookie-authenticated request helpers, readJson
```

---

### Task 1: Hex-grid maths in `packages/shared`

**Files:**
- Create: `packages/shared/src/hex.ts`
- Test: `packages/shared/src/hex.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (from `@archipelago/shared`):
  - `type Hex = { q: number; r: number }`
  - `HEX_DIRECTIONS: readonly Hex[]` (6 entries)
  - `hexKey(h: Hex): string` (`"q,r"`)
  - `hexAdd(a: Hex, b: Hex): Hex`, `hexScale(h: Hex, k: number): Hex`, `hexDistance(a: Hex, b: Hex): number`
  - `hexRing(center: Hex, radius: number, startDirection?: number): Hex[]`
  - `hexSpiral(center: Hex, startDirection?: number): Generator<Hex>`
  - `DISTRICT_SPACING = 5`, `COMMONS_CENTER: Hex = { q: 0, r: 0 }`
  - `nextDistrictCenter(taken: ReadonlySet<string>): Hex`
  - `nextArchipelagoSlot(taken: ReadonlySet<string>): Hex`
  - `nearestFreePlot(center: Hex, startDirection: number, isTaken: (h: Hex) => boolean): Hex`
  - `seedDirection(seed: number): number` (0–5)
  - `LANDMARK_TYPES` (readonly tuple), `type LandmarkType`, `landmarkForIndex(i: number): LandmarkType`

- [ ] **Step 1: Write the failing tests**

`packages/shared/src/hex.test.ts`:
```ts
import { describe, expect, test } from 'bun:test'
import {
  COMMONS_CENTER,
  DISTRICT_SPACING,
  hexDistance,
  hexKey,
  hexRing,
  hexSpiral,
  LANDMARK_TYPES,
  landmarkForIndex,
  nearestFreePlot,
  nextArchipelagoSlot,
  nextDistrictCenter,
  seedDirection,
} from './hex'

const origin = { q: 0, r: 0 }
const keys = (hexes: { q: number; r: number }[]) => hexes.map(hexKey)

describe('hexRing', () => {
  test('radius 0 is the centre itself', () => {
    expect(hexRing(origin, 0)).toEqual([origin])
  })

  test('radius r has 6r unique hexes, all exactly r away', () => {
    for (const radius of [1, 2, 3]) {
      const ring = hexRing({ q: 2, r: -1 }, radius)
      expect(ring).toHaveLength(6 * radius)
      expect(new Set(keys(ring)).size).toBe(6 * radius)
      for (const h of ring) expect(hexDistance(h, { q: 2, r: -1 })).toBe(radius)
    }
  })

  test('start direction rotates the walk but not the set', () => {
    const a = hexRing(origin, 2, 0)
    const b = hexRing(origin, 2, 3)
    expect(a[0]).not.toEqual(b[0])
    expect(new Set(keys(a))).toEqual(new Set(keys(b)))
  })
})

describe('hexSpiral', () => {
  test('yields the centre, then ring 1, then ring 2', () => {
    const first = Array.from({ length: 19 }, (_, i) => i)
    const spiral = hexSpiral(origin)
    const got = first.map(() => spiral.next().value as { q: number; r: number })
    expect(got[0]).toEqual(origin)
    for (const h of got.slice(1, 7)) expect(hexDistance(h, origin)).toBe(1)
    for (const h of got.slice(7, 19)) expect(hexDistance(h, origin)).toBe(2)
  })
})

describe('nextDistrictCenter', () => {
  test('never returns the commons centre and spaces centres 5 apart', () => {
    const taken = new Set<string>()
    const centres = []
    for (let i = 0; i < 7; i++) {
      const c = nextDistrictCenter(taken)
      taken.add(hexKey(c))
      centres.push(c)
    }
    expect(DISTRICT_SPACING).toBe(5)
    for (const c of centres) expect(c).not.toEqual(COMMONS_CENTER)
    for (const c of centres.slice(0, 6)) expect(hexDistance(c, origin)).toBe(5)
    expect(hexDistance(centres[6] ?? origin, origin)).toBe(10)
    expect(new Set(keys(centres)).size).toBe(7)
  })

  test('reuses a freed slot first', () => {
    const first = nextDistrictCenter(new Set())
    const second = nextDistrictCenter(new Set([hexKey(first)]))
    expect(nextDistrictCenter(new Set([hexKey(second)]))).toEqual(first)
  })
})

describe('nextArchipelagoSlot', () => {
  test('the first island sits at the origin, the next ones around it', () => {
    expect(nextArchipelagoSlot(new Set())).toEqual(origin)
    const second = nextArchipelagoSlot(new Set([hexKey(origin)]))
    expect(hexDistance(second, origin)).toBe(1)
  })
})

describe('nearestFreePlot', () => {
  test('never returns the centre and fills ring 1 before ring 2', () => {
    const centre = { q: 5, r: -5 }
    const taken = new Set<string>()
    const plots = []
    for (let i = 0; i < 8; i++) {
      const p = nearestFreePlot(centre, 0, (h) => taken.has(hexKey(h)))
      taken.add(hexKey(p))
      plots.push(p)
    }
    for (const p of plots) expect(p).not.toEqual(centre)
    for (const p of plots.slice(0, 6)) expect(hexDistance(p, centre)).toBe(1)
    for (const p of plots.slice(6)) expect(hexDistance(p, centre)).toBe(2)
  })

  test('skips plots reported as taken', () => {
    const blocked = hexRing(origin, 1)
    const p = nearestFreePlot(origin, 0, (h) => blocked.some((b) => hexKey(b) === hexKey(h)))
    expect(hexDistance(p, origin)).toBe(2)
  })

  test('different seeds start the walk in different directions', () => {
    const none = () => false
    expect(nearestFreePlot(origin, seedDirection(0), none)).not.toEqual(
      nearestFreePlot(origin, seedDirection(1), none),
    )
  })
})

describe('seedDirection and landmarks', () => {
  test('seedDirection is always 0..5, including negative seeds', () => {
    for (const seed of [0, 1, 5, 6, 7, 123456789, -1, -7]) {
      const d = seedDirection(seed)
      expect(d).toBeGreaterThanOrEqual(0)
      expect(d).toBeLessThan(6)
    }
  })

  test('landmarks cycle in a fixed order', () => {
    expect(LANDMARK_TYPES).toEqual(['lighthouse', 'town_hall', 'windmill', 'observatory', 'market'])
    expect(landmarkForIndex(0)).toBe('lighthouse')
    expect(landmarkForIndex(4)).toBe('market')
    expect(landmarkForIndex(5)).toBe('lighthouse')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/shared && bun test src/hex.test.ts`
Expected: FAIL with `Cannot find module './hex'`.

- [ ] **Step 3: Implement**

`packages/shared/src/hex.ts`:
```ts
export type Hex = { q: number; r: number }

export const HEX_DIRECTIONS: readonly Hex[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
]

export const DISTRICT_SPACING = 5
export const COMMONS_CENTER: Hex = { q: 0, r: 0 }
// Far beyond any realistic island; prevents an endless search if a caller marks everything taken.
const MAX_SPIRAL_RADIUS = 64

const mod = (n: number, m: number): number => ((n % m) + m) % m

const direction = (i: number): Hex => HEX_DIRECTIONS[mod(i, 6)] ?? { q: 1, r: 0 }

export const hexKey = (h: Hex): string => `${h.q},${h.r}`
export const hexAdd = (a: Hex, b: Hex): Hex => ({ q: a.q + b.q, r: a.r + b.r })
export const hexScale = (h: Hex, k: number): Hex => ({ q: h.q * k, r: h.r * k })

export function hexDistance(a: Hex, b: Hex): number {
  const dq = a.q - b.q
  const dr = a.r - b.r
  return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2
}

/** All hexes exactly `radius` from `center`, walked starting from a rotation of `startDirection`. */
export function hexRing(center: Hex, radius: number, startDirection = 0): Hex[] {
  if (radius === 0) return [center]
  const ring: Hex[] = []
  let hex = hexAdd(center, hexScale(direction(startDirection + 4), radius))
  for (let side = 0; side < 6; side++) {
    for (let step = 0; step < radius; step++) {
      ring.push(hex)
      hex = hexAdd(hex, direction(startDirection + side))
    }
  }
  return ring
}

/** The centre, then each ring outward. */
export function* hexSpiral(center: Hex, startDirection = 0): Generator<Hex> {
  for (let radius = 0; radius <= MAX_SPIRAL_RADIUS; radius++) {
    yield* hexRing(center, radius, startDirection)
  }
}

export function nextDistrictCenter(taken: ReadonlySet<string>): Hex {
  for (const unit of hexSpiral(COMMONS_CENTER)) {
    if (unit.q === 0 && unit.r === 0) continue
    const centre = hexScale(unit, DISTRICT_SPACING)
    if (!taken.has(hexKey(centre))) return centre
  }
  throw new Error('No free district centre')
}

export function nextArchipelagoSlot(taken: ReadonlySet<string>): Hex {
  for (const slot of hexSpiral({ q: 0, r: 0 })) {
    if (!taken.has(hexKey(slot))) return slot
  }
  throw new Error('No free archipelago slot')
}

export function nearestFreePlot(
  center: Hex,
  startDirection: number,
  isTaken: (h: Hex) => boolean,
): Hex {
  for (const hex of hexSpiral(center, startDirection)) {
    if (hex.q === center.q && hex.r === center.r) continue
    if (!isTaken(hex)) return hex
  }
  throw new Error('No free plot near district centre')
}

export const seedDirection = (seed: number): number => mod(seed, 6)

export const LANDMARK_TYPES = ['lighthouse', 'town_hall', 'windmill', 'observatory', 'market'] as const
export type LandmarkType = (typeof LANDMARK_TYPES)[number]

export const landmarkForIndex = (i: number): LandmarkType =>
  LANDMARK_TYPES[mod(i, LANDMARK_TYPES.length)] ?? 'lighthouse'
```

Append to `packages/shared/src/index.ts`:
```ts
export * from './hex'
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd packages/shared && bun test && cd ../.. && bun run typecheck && bun run lint`
Expected: all shared tests PASS; typecheck and lint clean (run `bun run format` if Biome reports only formatting).

- [ ] **Step 5: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): add axial hex grid maths for districts and plots"
```

---

### Task 2: Resource schemas and DTO types in `packages/shared`

**Files:**
- Create: `packages/shared/src/resources.ts`, `packages/shared/src/dto.ts`
- Test: `packages/shared/src/resources.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: `TASK_PRIORITIES`, `TASK_SIZES`, `TASK_STATUSES` (`domain.ts`), `LandmarkType` (Task 1).
- Produces (from `@archipelago/shared`):
  - `createProjectInputSchema` → `{ name: string }`
  - `updateProjectInputSchema` → `{ name?: string; archived?: boolean }` (at least one key)
  - `createMilestoneInputSchema` → `{ name: string }`
  - `updateMilestoneInputSchema` → `{ name?: string; sortOrder?: number }` (at least one key)
  - `createTaskInputSchema` → `{ projectId: string; milestoneId: string | null; title: string; notes: string; dueDate: string | null; priority: TaskPriority; size: TaskSize }` (defaults: `milestoneId` null, `notes` '', `dueDate` null, `priority` 'med', `size` 'M')
  - `updateTaskInputSchema` → `{ title?; notes?; dueDate?: string | null; priority?; size?; status?: 'todo' | 'doing'; milestoneId?: string | null; sortOrder?: number }` (at least one key)
  - `taskListQuerySchema` → `{ project?: string; milestone?: string; status?: TaskStatus }`
  - Types `CreateProjectInput`, `UpdateProjectInput`, `CreateMilestoneInput`, `UpdateMilestoneInput`, `CreateTaskInput`, `UpdateTaskInput`, `TaskListQuery`
  - DTO types `ProjectDto`, `MilestoneDto`, `TaskDto`, `BuildingDto`, `WorldDto` (timestamps as ISO strings, `dueDate` as `YYYY-MM-DD`)

- [ ] **Step 1: Write the failing tests**

`packages/shared/src/resources.test.ts`:
```ts
import { describe, expect, test } from 'bun:test'
import {
  createMilestoneInputSchema,
  createProjectInputSchema,
  createTaskInputSchema,
  taskListQuerySchema,
  updateMilestoneInputSchema,
  updateProjectInputSchema,
  updateTaskInputSchema,
} from './resources'

const projectId = '7f9c2e1a-3b4d-4c5e-8f6a-1b2c3d4e5f60'

const paths = (r: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) =>
  r.error?.issues.map((i) => i.path.join('.')) ?? []

describe('project and milestone schemas', () => {
  test('names are trimmed and must be 1..80 characters', () => {
    expect(createProjectInputSchema.parse({ name: '  Beta  ' }).name).toBe('Beta')
    expect(createProjectInputSchema.safeParse({ name: '   ' }).success).toBe(false)
    expect(createProjectInputSchema.safeParse({ name: 'x'.repeat(81) }).success).toBe(false)
    expect(createMilestoneInputSchema.parse({ name: ' MVP ' }).name).toBe('MVP')
  })

  test('updates need at least one field', () => {
    expect(updateProjectInputSchema.safeParse({}).success).toBe(false)
    expect(updateProjectInputSchema.parse({ archived: true })).toEqual({ archived: true })
    expect(updateMilestoneInputSchema.safeParse({}).success).toBe(false)
    expect(updateMilestoneInputSchema.safeParse({ sortOrder: -1 }).success).toBe(false)
  })
})

describe('createTaskInputSchema', () => {
  test('applies defaults', () => {
    expect(createTaskInputSchema.parse({ projectId, title: ' Write spec ' })).toEqual({
      projectId,
      milestoneId: null,
      title: 'Write spec',
      notes: '',
      dueDate: null,
      priority: 'med',
      size: 'M',
    })
  })

  test('rejects impossible and non-ISO due dates', () => {
    for (const dueDate of ['2026-02-30', 'tomorrow', '2026-1-5', '2026-10-07T00:00:00Z']) {
      const r = createTaskInputSchema.safeParse({ projectId, title: 'x', dueDate })
      expect(r.success).toBe(false)
      expect(paths(r)).toContain('dueDate')
    }
    expect(createTaskInputSchema.parse({ projectId, title: 'x', dueDate: '2026-02-28' }).dueDate).toBe(
      '2026-02-28',
    )
  })

  test('rejects non-uuid ids and unknown enums', () => {
    const r = createTaskInputSchema.safeParse({
      projectId: 'abc',
      milestoneId: 'nope',
      title: 'x',
      priority: 'urgent',
      size: 'XL',
    })
    expect(paths(r)).toEqual(expect.arrayContaining(['projectId', 'milestoneId', 'priority', 'size']))
  })
})

describe('updateTaskInputSchema', () => {
  test('cannot set status to done', () => {
    const r = updateTaskInputSchema.safeParse({ status: 'done' })
    expect(r.success).toBe(false)
    expect(paths(r)).toContain('status')
    expect(updateTaskInputSchema.parse({ status: 'doing' })).toEqual({ status: 'doing' })
  })

  test('allows clearing the due date and the milestone', () => {
    expect(updateTaskInputSchema.parse({ dueDate: null, milestoneId: null })).toEqual({
      dueDate: null,
      milestoneId: null,
    })
  })

  test('needs at least one field', () => {
    expect(updateTaskInputSchema.safeParse({}).success).toBe(false)
  })
})

describe('taskListQuerySchema', () => {
  test('accepts filters and rejects malformed ids', () => {
    expect(taskListQuerySchema.parse({ status: 'todo' })).toEqual({ status: 'todo' })
    expect(paths(taskListQuerySchema.safeParse({ project: 'abc' }))).toContain('project')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/shared && bun test src/resources.test.ts`
Expected: FAIL with `Cannot find module './resources'`.

- [ ] **Step 3: Implement**

`packages/shared/src/resources.ts`:
```ts
import { z } from 'zod'
import { TASK_PRIORITIES, TASK_SIZES, TASK_STATUSES } from './domain'

const name = z.string().trim().min(1).max(80)
const title = z.string().trim().min(1).max(200)
const notes = z.string().max(5000)
const dueDate = z.iso.date()
const atLeastOneField = (value: object) => Object.keys(value).length > 0
const NEEDS_A_FIELD = 'Provide at least one field to update'

export const createProjectInputSchema = z.object({ name })
export type CreateProjectInput = z.infer<typeof createProjectInputSchema>

export const updateProjectInputSchema = z
  .object({ name: name.optional(), archived: z.boolean().optional() })
  .refine(atLeastOneField, NEEDS_A_FIELD)
export type UpdateProjectInput = z.infer<typeof updateProjectInputSchema>

export const createMilestoneInputSchema = z.object({ name })
export type CreateMilestoneInput = z.infer<typeof createMilestoneInputSchema>

export const updateMilestoneInputSchema = z
  .object({ name: name.optional(), sortOrder: z.int().min(0).optional() })
  .refine(atLeastOneField, NEEDS_A_FIELD)
export type UpdateMilestoneInput = z.infer<typeof updateMilestoneInputSchema>

export const createTaskInputSchema = z.object({
  projectId: z.uuid(),
  milestoneId: z.uuid().nullable().default(null),
  title,
  notes: notes.default(''),
  dueDate: dueDate.nullable().default(null),
  priority: z.enum(TASK_PRIORITIES).default('med'),
  size: z.enum(TASK_SIZES).default('M'),
})
export type CreateTaskInput = z.infer<typeof createTaskInputSchema>

export const updateTaskInputSchema = z
  .object({
    title: title.optional(),
    notes: notes.optional(),
    dueDate: dueDate.nullable().optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    size: z.enum(TASK_SIZES).optional(),
    // `done` is deliberately absent: completion goes through POST /tasks/:id/complete.
    status: z.enum(['todo', 'doing']).optional(),
    milestoneId: z.uuid().nullable().optional(),
    sortOrder: z.int().min(0).optional(),
  })
  .refine(atLeastOneField, NEEDS_A_FIELD)
export type UpdateTaskInput = z.infer<typeof updateTaskInputSchema>

export const taskListQuerySchema = z.object({
  project: z.uuid().optional(),
  milestone: z.uuid().optional(),
  status: z.enum(TASK_STATUSES).optional(),
})
export type TaskListQuery = z.infer<typeof taskListQuerySchema>
```

`packages/shared/src/dto.ts`:
```ts
import type { TaskPriority, TaskSize, TaskStatus } from './domain'
import type { LandmarkType } from './hex'

export type ProjectDto = {
  id: string
  name: string
  islandSeed: number
  archipelagoX: number
  archipelagoY: number
  archivedAt: string | null
  createdAt: string
}

export type MilestoneDto = {
  id: string
  projectId: string
  name: string
  sortOrder: number
  landmarkType: LandmarkType
  districtQ: number
  districtR: number
  completedAt: string | null
  createdAt: string
}

export type TaskDto = {
  id: string
  projectId: string
  milestoneId: string | null
  title: string
  notes: string
  dueDate: string | null
  priority: TaskPriority
  size: TaskSize
  status: TaskStatus
  completedAt: string | null
  plotX: number
  plotY: number
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export type BuildingDto = {
  id: string
  projectId: string
  type: string
  plotX: number
  plotY: number
  rotation: number
  placedAt: string
}

export type WorldDto = {
  projects: ProjectDto[]
  milestones: MilestoneDto[]
  tasks: TaskDto[]
  buildings: BuildingDto[]
}
```

Append to `packages/shared/src/index.ts`:
```ts
export * from './dto'
export * from './resources'
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd packages/shared && bun test && cd ../.. && bun run typecheck && bun run lint`
Expected: PASS; clean. If `z.iso.date()` accepts `2026-02-30` on the installed zod, STOP and report it. Do not weaken the test.

- [ ] **Step 5: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): add project, milestone and task schemas and DTO types"
```

---
### Task 3: Migration, test helpers, serializers and plot assignment

**Files:**
- Modify: `apps/api/src/db/schema.ts`, `apps/api/src/db/schema.test.ts`
- Generate: `apps/api/drizzle/0001_*.sql` (+ `drizzle/meta`)
- Create: `apps/api/src/http/params.ts`, `apps/api/src/http/serialize.ts`, `apps/api/src/world/plots.ts`
- Create: `apps/api/test/auth.ts`
- Modify: `apps/api/test/fixtures.ts` (add `insertProject`, `insertMilestone`, `insertTask`)
- Test: `apps/api/src/world/plots.test.ts`

**Interfaces:**
- Consumes: `Db` (`src/db/client.ts`), `AppError` (`src/errors.ts`), `createApp`, `createSession`, `insertUser`, `testConfig`. From shared: `COMMONS_CENTER`, `hexKey`, `nearestFreePlot`, `seedDirection`, `Hex`, DTO types (Tasks 1–2).
- Produces:
  - Schema: `milestones.districtQ`, `milestones.districtR` (integer, not null), plus unique indexes `milestones_project_district_unique (project_id, district_q, district_r)`, `tasks_project_plot_unique (project_id, plot_x, plot_y)` and `projects_user_slot_unique (user_id, archipelago_x, archipelago_y)`.
  - `src/http/params.ts`: `idParam(value: string | undefined, what: string): string`. Throws `AppError('not_found', '<what> not found')` for a missing or non-UUID value.
  - `src/http/serialize.ts`: `toProjectDto`, `toMilestoneDto`, `toTaskDto`, `toBuildingDto` (row → DTO).
  - `src/world/plots.ts`:
    - `type ProjectRow = typeof projects.$inferSelect`, `type MilestoneRow = typeof milestones.$inferSelect`, `type TaskRow = typeof tasks.$inferSelect`
    - `lockOwnedProject(tx: Db, userId: string, projectId: string): Promise<ProjectRow | null>` (`SELECT … FOR UPDATE`, scoped by owner)
    - `findMilestoneInProject(tx: Db, milestoneId: string, projectId: string): Promise<MilestoneRow | null>`
    - `takenPlots(tx: Db, projectId: string): Promise<Set<string>>` (task plots, building plots, every milestone centre, and the commons centre, as `hexKey` strings)
    - `assignTaskPlot(tx: Db, project: ProjectRow, milestone: MilestoneRow | null): Promise<Hex>`
    - `syncMilestoneCompletion(tx: Db, milestoneId: string | null, now: Date): Promise<'completed' | 'reopened' | 'unchanged'>`
  - `test/fixtures.ts`:
    - `insertProject(db: Db, userId: string, overrides?: Partial<typeof projects.$inferInsert>): Promise<ProjectRow>`
    - `insertMilestone(db: Db, projectId: string, overrides?: Partial<typeof milestones.$inferInsert>): Promise<MilestoneRow>`
    - `insertTask(db: Db, projectId: string, overrides?: Partial<typeof tasks.$inferInsert>): Promise<TaskRow>`
  - `test/auth.ts`:
    - `authedApp(db: Db): Promise<{ app; user; get(path); post(path, body?); patch(path, body); del(path) }>`. It uses a real session cookie. `post` sends a JSON body only when one is given.
    - `readJson<T>(res: Response): Promise<T>`

- [ ] **Step 1: Schema changes**

In `apps/api/src/db/schema.ts`, first make row timestamps distinct within a transaction. Postgres `now()` is fixed for the whole transaction, so "oldest first" ordering would tie. Add `sql` to the `drizzle-orm` import and change the two helpers near the top:
```ts
import { sql } from 'drizzle-orm'

const timestamptz = () => timestamp({ withTimezone: true })
// clock_timestamp() advances within a transaction, unlike now(), so creation order is stable.
const createdAt = () => timestamptz().notNull().default(sql`clock_timestamp()`)
```
Also change `tasks.updatedAt` and `buildings.placedAt` from `.defaultNow()` to `.default(sql\`clock_timestamp()\`)`.

Then change the `milestones` table to:
```ts
export const milestones = pgTable(
  'milestones',
  {
    id: uuid().primaryKey().defaultRandom(),
    projectId: uuid()
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    sortOrder: integer().notNull().default(0),
    landmarkType: text().notNull(),
    // Axial hex centre of this milestone's district on its island; the landmark stands here.
    districtQ: integer().notNull(),
    districtR: integer().notNull(),
    completedAt: timestamptz(),
    createdAt: createdAt(),
  },
  (t) => [
    index('milestones_project_id_idx').on(t.projectId),
    uniqueIndex('milestones_project_district_unique').on(t.projectId, t.districtQ, t.districtR),
  ],
)
```
In the `tasks` table's index list, add:
```ts
    uniqueIndex('tasks_project_plot_unique').on(t.projectId, t.plotX, t.plotY),
```
In the `projects` table's index list, add:
```ts
    uniqueIndex('projects_user_slot_unique').on(t.userId, t.archipelagoX, t.archipelagoY),
```

Run: `cd apps/api && bun run db:generate && ls drizzle && cd ../..`
Expected: a new `drizzle/0001_<name>.sql` that adds the `district_q` and `district_r` columns (NOT NULL), the three unique indexes, and `SET DEFAULT clock_timestamp()` on the timestamp columns. Every environment's `milestones` table is empty today, so NOT NULL without a default is safe.

The new task-plot unique index breaks two Phase 1 schema tests that insert two tasks on plot `(0,0)`. In `apps/api/src/db/schema.test.ts`, change the native-tasks test's insert to:
```ts
      await tx
        .insert(tasks)
        .values([newTask(project.id), newTask(project.id, { plotX: 1, plotY: 0 })])
```
In the external-ref test, change the second insert to:
```ts
      await tx.insert(tasks).values(newTask(project.id, { ...ref, plotX: 1, plotY: 0 }))
```
Then add this test inside the `describe('schema', …)` block:
```ts
  test('two tasks cannot share a plot on the same island', async () => {
    let caught: unknown
    await withRollback(async (tx) => {
      const user = await insertUser(tx)
      const [project] = await tx.insert(projects).values(newProject(user.id)).returning()
      if (!project) throw new Error('no project')
      await tx.insert(tasks).values(newTask(project.id))
      await tx.insert(tasks).values(newTask(project.id))
    }).catch((err) => {
      caught = err
    })
    expect(isUniqueViolation(caught)).toBe(true)
  })
```

Run: `cd apps/api && bun test src/db`
Expected: PASS. `test/setup.ts` applies migration 0001 to the test DB on load.

- [ ] **Step 2: Fixtures and the authenticated-app helper**

Add these imports to the top of `apps/api/test/fixtures.ts`:
```ts
import { buildings, milestones, projects, tasks } from '../src/db/schema'
```
(merge with the existing `users` import) and append:
```ts
export async function insertProject(
  db: Db,
  userId: string,
  overrides: Partial<typeof projects.$inferInsert> = {},
) {
  const [project] = await db
    .insert(projects)
    .values({
      userId,
      name: 'Beta',
      islandSeed: 0,
      archipelagoX: Math.floor(Math.random() * 1_000_000),
      archipelagoY: 0,
      ...overrides,
    })
    .returning()
  if (!project) throw new Error('insertProject: no row returned')
  return project
}

export async function insertMilestone(
  db: Db,
  projectId: string,
  overrides: Partial<typeof milestones.$inferInsert> = {},
) {
  const [milestone] = await db
    .insert(milestones)
    .values({
      projectId,
      name: 'MVP',
      landmarkType: 'lighthouse',
      districtQ: 5,
      districtR: 0,
      ...overrides,
    })
    .returning()
  if (!milestone) throw new Error('insertMilestone: no row returned')
  return milestone
}

export async function insertTask(
  db: Db,
  projectId: string,
  overrides: Partial<typeof tasks.$inferInsert> = {},
) {
  const [task] = await db
    .insert(tasks)
    .values({
      projectId,
      title: 'Task',
      plotX: Math.floor(Math.random() * 1_000_000) + 100,
      plotY: 0,
      ...overrides,
    })
    .returning()
  if (!task) throw new Error('insertTask: no row returned')
  return task
}

export async function insertBuilding(
  db: Db,
  projectId: string,
  overrides: Partial<typeof buildings.$inferInsert> = {},
) {
  const [building] = await db
    .insert(buildings)
    .values({ projectId, type: 'tree', plotX: 0, plotY: 1, ...overrides })
    .returning()
  if (!building) throw new Error('insertBuilding: no row returned')
  return building
}
```
(The random far-away plot and slot defaults keep fixtures from colliding with the unique indexes, or with real assignments near the origin, unless a test sets them on purpose.)

`apps/api/test/auth.ts`:
```ts
import { createApp } from '../src/app'
import { createSession } from '../src/auth/sessions'
import type { Db } from '../src/db/client'
import { insertUser, testConfig } from './fixtures'

export const readJson = async <T>(res: Response): Promise<T> => (await res.json()) as T

/** A real app plus request helpers authenticated as a fresh user via a session cookie. */
export async function authedApp(db: Db) {
  const user = await insertUser(db)
  const { token } = await createSession(db, user.id, 30)
  const app = createApp({ db, config: testConfig })
  const cookie = `session=${token}`

  const send = (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers:
        body === undefined ? { cookie } : { cookie, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })

  return {
    app,
    user,
    get: (path: string) => send('GET', path),
    post: (path: string, body?: unknown) => send('POST', path, body),
    patch: (path: string, body: unknown) => send('PATCH', path, body),
    del: (path: string) => send('DELETE', path),
  }
}
```

- [ ] **Step 3: Write the failing plot tests**

`apps/api/src/world/plots.test.ts`:
```ts
import { describe, expect, test } from 'bun:test'
import { hexDistance, hexKey } from '@archipelago/shared'
import { eq } from 'drizzle-orm'
import { withRollback } from '../../test/db'
import {
  insertBuilding,
  insertMilestone,
  insertProject,
  insertTask,
  insertUser,
} from '../../test/fixtures'
import { milestones } from '../db/schema'
import {
  assignTaskPlot,
  findMilestoneInProject,
  lockOwnedProject,
  syncMilestoneCompletion,
  takenPlots,
} from './plots'

describe('lockOwnedProject / findMilestoneInProject', () => {
  test('only returns rows the user owns / that belong to the project', async () => {
    await withRollback(async (tx) => {
      const owner = await insertUser(tx)
      const other = await insertUser(tx)
      const project = await insertProject(tx, owner.id)
      const otherProject = await insertProject(tx, owner.id)
      const milestone = await insertMilestone(tx, project.id)
      expect((await lockOwnedProject(tx, owner.id, project.id))?.id).toBe(project.id)
      expect(await lockOwnedProject(tx, other.id, project.id)).toBeNull()
      expect((await findMilestoneInProject(tx, milestone.id, project.id))?.id).toBe(milestone.id)
      expect(await findMilestoneInProject(tx, milestone.id, otherProject.id)).toBeNull()
    })
  })
})

describe('takenPlots', () => {
  test('includes tasks, buildings, district centres and the commons centre', async () => {
    await withRollback(async (tx) => {
      const user = await insertUser(tx)
      const project = await insertProject(tx, user.id)
      await insertMilestone(tx, project.id, { districtQ: 5, districtR: 0 })
      await insertTask(tx, project.id, { plotX: 1, plotY: 0 })
      await insertBuilding(tx, project.id, { plotX: 0, plotY: 1 })
      const taken = await takenPlots(tx, project.id)
      for (const key of ['0,0', '5,0', '1,0', '0,1']) expect(taken.has(key)).toBe(true)
    })
  })
})

describe('assignTaskPlot', () => {
  test('loose tasks go next to the commons centre, milestone tasks next to their district', async () => {
    await withRollback(async (tx) => {
      const user = await insertUser(tx)
      const project = await insertProject(tx, user.id, { islandSeed: 3 })
      const milestone = await insertMilestone(tx, project.id, { districtQ: -5, districtR: 5 })
      const loose = await assignTaskPlot(tx, project, null)
      const inDistrict = await assignTaskPlot(tx, project, milestone)
      expect(hexDistance(loose, { q: 0, r: 0 })).toBe(1)
      expect(hexDistance(inDistrict, { q: -5, r: 5 })).toBe(1)
    })
  })

  test('never reuses an occupied plot', async () => {
    await withRollback(async (tx) => {
      const user = await insertUser(tx)
      const project = await insertProject(tx, user.id)
      const seen = new Set<string>()
      for (let i = 0; i < 8; i++) {
        const plot = await assignTaskPlot(tx, project, null)
        expect(seen.has(hexKey(plot))).toBe(false)
        seen.add(hexKey(plot))
        await insertTask(tx, project.id, { plotX: plot.q, plotY: plot.r })
      }
    })
  })
})

describe('syncMilestoneCompletion', () => {
  test('completes when all tasks are done and reopens when one is not', async () => {
    await withRollback(async (tx) => {
      const user = await insertUser(tx)
      const project = await insertProject(tx, user.id)
      const milestone = await insertMilestone(tx, project.id)
      const now = new Date('2026-10-07T10:00:00Z')
      expect(await syncMilestoneCompletion(tx, milestone.id, now)).toBe('unchanged')

      await insertTask(tx, project.id, { milestoneId: milestone.id, status: 'done' })
      expect(await syncMilestoneCompletion(tx, milestone.id, now)).toBe('completed')
      const [done] = await tx.select().from(milestones).where(eq(milestones.id, milestone.id))
      expect(done?.completedAt?.toISOString()).toBe(now.toISOString())
      expect(await syncMilestoneCompletion(tx, milestone.id, now)).toBe('unchanged')

      await insertTask(tx, project.id, { milestoneId: milestone.id, status: 'todo' })
      expect(await syncMilestoneCompletion(tx, milestone.id, now)).toBe('reopened')
      expect(await syncMilestoneCompletion(tx, null, now)).toBe('unchanged')
    })
  })
})
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `cd apps/api && bun test src/world/plots.test.ts`
Expected: FAIL with `Cannot find module './plots'`.

- [ ] **Step 5: Implement**

`apps/api/src/http/params.ts`:
```ts
import { z } from 'zod'
import { AppError } from '../errors'

const uuid = z.uuid()

/** Path ids that are not UUIDs would make Postgres throw (22P02); treat them as plain 404s. */
export function idParam(value: string | undefined, what: string): string {
  if (value === undefined || !uuid.safeParse(value).success) {
    throw new AppError('not_found', `${what} not found`)
  }
  return value
}
```

`apps/api/src/http/serialize.ts`:
```ts
import type {
  BuildingDto,
  LandmarkType,
  MilestoneDto,
  ProjectDto,
  TaskDto,
} from '@archipelago/shared'
import type { buildings, milestones, projects, tasks } from '../db/schema'

const iso = (d: Date | null): string | null => d?.toISOString() ?? null

export const toProjectDto = (row: typeof projects.$inferSelect): ProjectDto => ({
  id: row.id,
  name: row.name,
  islandSeed: row.islandSeed,
  archipelagoX: row.archipelagoX,
  archipelagoY: row.archipelagoY,
  archivedAt: iso(row.archivedAt),
  createdAt: row.createdAt.toISOString(),
})

export const toMilestoneDto = (row: typeof milestones.$inferSelect): MilestoneDto => ({
  id: row.id,
  projectId: row.projectId,
  name: row.name,
  sortOrder: row.sortOrder,
  // Only ever written from LANDMARK_TYPES by the milestone service.
  landmarkType: row.landmarkType as LandmarkType,
  districtQ: row.districtQ,
  districtR: row.districtR,
  completedAt: iso(row.completedAt),
  createdAt: row.createdAt.toISOString(),
})

export const toTaskDto = (row: typeof tasks.$inferSelect): TaskDto => ({
  id: row.id,
  projectId: row.projectId,
  milestoneId: row.milestoneId,
  title: row.title,
  notes: row.notes,
  dueDate: row.dueDate,
  priority: row.priority,
  size: row.size,
  status: row.status,
  completedAt: iso(row.completedAt),
  plotX: row.plotX,
  plotY: row.plotY,
  sortOrder: row.sortOrder,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
})

export const toBuildingDto = (row: typeof buildings.$inferSelect): BuildingDto => ({
  id: row.id,
  projectId: row.projectId,
  type: row.type,
  plotX: row.plotX,
  plotY: row.plotY,
  rotation: row.rotation,
  placedAt: row.placedAt.toISOString(),
})
```

`apps/api/src/world/plots.ts`:
```ts
import {
  COMMONS_CENTER,
  type Hex,
  hexKey,
  nearestFreePlot,
  seedDirection,
} from '@archipelago/shared'
import { and, eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { buildings, milestones, projects, tasks } from '../db/schema'

export type ProjectRow = typeof projects.$inferSelect
export type MilestoneRow = typeof milestones.$inferSelect
export type TaskRow = typeof tasks.$inferSelect

/** Row-locks the project for the rest of the transaction, so plot/district picks cannot race. */
export async function lockOwnedProject(
  tx: Db,
  userId: string,
  projectId: string,
): Promise<ProjectRow | null> {
  const [project] = await tx
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .for('update')
  return project ?? null
}

export async function findMilestoneInProject(
  tx: Db,
  milestoneId: string,
  projectId: string,
): Promise<MilestoneRow | null> {
  const [milestone] = await tx
    .select()
    .from(milestones)
    .where(and(eq(milestones.id, milestoneId), eq(milestones.projectId, projectId)))
  return milestone ?? null
}

export async function takenPlots(tx: Db, projectId: string): Promise<Set<string>> {
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
  const taken = new Set([...taskPlots, ...buildingPlots, ...centres].map(hexKey))
  taken.add(hexKey(COMMONS_CENTER))
  return taken
}

export async function assignTaskPlot(
  tx: Db,
  project: ProjectRow,
  milestone: MilestoneRow | null,
): Promise<Hex> {
  const taken = await takenPlots(tx, project.id)
  const centre = milestone ? { q: milestone.districtQ, r: milestone.districtR } : COMMONS_CENTER
  return nearestFreePlot(centre, seedDirection(project.islandSeed), (h) => taken.has(hexKey(h)))
}

/** A milestone is complete iff it has at least one task and every task is done. */
export async function syncMilestoneCompletion(
  tx: Db,
  milestoneId: string | null,
  now: Date,
): Promise<'completed' | 'reopened' | 'unchanged'> {
  if (milestoneId === null) return 'unchanged'
  const [milestone] = await tx
    .select({ completedAt: milestones.completedAt })
    .from(milestones)
    .where(eq(milestones.id, milestoneId))
  if (!milestone) return 'unchanged'

  const statuses = await tx
    .select({ status: tasks.status })
    .from(tasks)
    .where(eq(tasks.milestoneId, milestoneId))
  const complete = statuses.length > 0 && statuses.every((t) => t.status === 'done')

  if (complete && milestone.completedAt === null) {
    await tx.update(milestones).set({ completedAt: now }).where(eq(milestones.id, milestoneId))
    return 'completed'
  }
  if (!complete && milestone.completedAt !== null) {
    await tx.update(milestones).set({ completedAt: null }).where(eq(milestones.id, milestoneId))
    return 'reopened'
  }
  return 'unchanged'
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd apps/api && bun test && cd ../.. && bun run typecheck && bun run lint`
Expected: all API tests PASS (Phase 1 suite + new plot tests); clean.

- [ ] **Step 7: Commit**

```bash
git add apps/api
git commit -m "feat(api): add district columns, plot assignment and resource test helpers"
```

---
### Task 4: Projects (service + `/projects` routes)

**Files:**
- Create: `apps/api/src/projects/service.ts`, `apps/api/src/routes/projects.ts`
- Modify: `apps/api/src/app.ts` (mount `/projects`)
- Test: `apps/api/src/routes/projects.test.ts`

**Interfaces:**
- Consumes: `idParam`, `toProjectDto` (Task 3), `createProjectInputSchema`, `updateProjectInputSchema`, `nextArchipelagoSlot`, `hexKey` (Tasks 1–2), `requireAuth`, `jsonBody`, `AppError`, `Deps`, `AppEnv`; test helpers `authedApp`, `readJson`, `insertProject`, `insertMilestone`, `insertTask`.
- Produces:
  - `src/projects/service.ts`:
    - `listProjects(db: Db, userId: string): Promise<ProjectDto[]>` (oldest first)
    - `createProject(db: Db, userId: string, input: CreateProjectInput): Promise<ProjectDto>`
    - `updateProject(db: Db, userId: string, projectId: string, input: UpdateProjectInput, now: Date): Promise<ProjectDto>`
    - `deleteProject(db: Db, userId: string, projectId: string): Promise<void>`

    The last two throw `404` when the project is not owned.
  - `src/routes/projects.ts`: `projectRoutes(deps: Deps)`, mounted at `/api/v1/projects`:
    - `GET /` → `{ projects }`
    - `POST /` → `201 { project }`
    - `PATCH /:id` → `{ project }`
    - `DELETE /:id` → `204`

    Task 5 adds `POST /:id/milestones`.

- [ ] **Step 1: Write the failing tests**

`apps/api/src/routes/projects.test.ts`:
```ts
import { describe, expect, test } from 'bun:test'
import type { ErrorBody, ProjectDto } from '@archipelago/shared'
import { hexDistance } from '@archipelago/shared'
import { eq } from 'drizzle-orm'
import { authedApp, readJson } from '../../test/auth'
import { withRollback } from '../../test/db'
import { insertMilestone, insertProject, insertTask, testConfig } from '../../test/fixtures'
import { createApp } from '../app'
import { milestones, tasks } from '../db/schema'

const PROJECTS = '/api/v1/projects'
type One = { project: ProjectDto }
type Many = { projects: ProjectDto[] }

describe('/projects', () => {
  test('requires authentication', async () => {
    await withRollback(async (tx) => {
      const res = await createApp({ db: tx, config: testConfig }).request(PROJECTS)
      expect(res.status).toBe(401)
    })
  })

  test('the first island takes the origin slot, the next one a neighbouring slot', async () => {
    await withRollback(async (tx) => {
      const me = await authedApp(tx)
      const first = await me.post(PROJECTS, { name: '  Beta  ' })
      expect(first.status).toBe(201)
      const a = (await readJson<One>(first)).project
      expect(a).toMatchObject({ name: 'Beta', archipelagoX: 0, archipelagoY: 0, archivedAt: null })
      expect(Number.isInteger(a.islandSeed)).toBe(true)
      expect(a.islandSeed).toBeGreaterThanOrEqual(0)

      const b = (await readJson<One>(await me.post(PROJECTS, { name: 'Gamma' }))).project
      expect(hexDistance({ q: b.archipelagoX, r: b.archipelagoY }, { q: 0, r: 0 })).toBe(1)
    })
  })

  test("lists only the caller's projects, oldest first", async () => {
    await withRollback(async (tx) => {
      const me = await authedApp(tx)
      const other = await authedApp(tx)
      await me.post(PROJECTS, { name: 'One' })
      await me.post(PROJECTS, { name: 'Two' })
      await other.post(PROJECTS, { name: 'Theirs' })
      const { projects } = await readJson<Many>(await me.get(PROJECTS))
      expect(projects.map((p) => p.name)).toEqual(['One', 'Two'])
    })
  })

  test('rename, archive and unarchive; re-archiving keeps the first timestamp', async () => {
    await withRollback(async (tx) => {
      const me = await authedApp(tx)
      const { project } = await readJson<One>(await me.post(PROJECTS, { name: 'Beta' }))
      const url = `${PROJECTS}/${project.id}`

      const renamed = await readJson<One>(await me.patch(url, { name: 'Beta 2' }))
      expect(renamed.project.name).toBe('Beta 2')

      const archived = (await readJson<One>(await me.patch(url, { archived: true }))).project
      expect(archived.archivedAt).not.toBeNull()
      const again = (await readJson<One>(await me.patch(url, { archived: true }))).project
      expect(again.archivedAt).toBe(archived.archivedAt)

      const restored = (await readJson<One>(await me.patch(url, { archived: false }))).project
      expect(restored.archivedAt).toBeNull()
    })
  })

  test('invalid bodies → 422', async () => {
    await withRollback(async (tx) => {
      const me = await authedApp(tx)
      expect((await me.post(PROJECTS, { name: '' })).status).toBe(422)
      const { project } = await readJson<One>(await me.post(PROJECTS, { name: 'Beta' }))
      expect((await me.patch(`${PROJECTS}/${project.id}`, {})).status).toBe(422)
    })
  })

  test("another user's project and malformed ids → 404", async () => {
    await withRollback(async (tx) => {
      const me = await authedApp(tx)
      const other = await authedApp(tx)
      const theirs = await insertProject(tx, other.user.id)
      for (const res of [
        await me.patch(`${PROJECTS}/${theirs.id}`, { name: 'Mine now' }),
        await me.del(`${PROJECTS}/${theirs.id}`),
        await me.del(`${PROJECTS}/abc`),
      ]) {
        expect(res.status).toBe(404)
        expect((await readJson<ErrorBody>(res)).error.code).toBe('not_found')
      }
      expect((await readJson<Many>(await other.get(PROJECTS))).projects[0]?.name).toBe('Beta')
    })
  })

  test('delete removes the project with its milestones and tasks', async () => {
    await withRollback(async (tx) => {
      const me = await authedApp(tx)
      const project = await insertProject(tx, me.user.id)
      const milestone = await insertMilestone(tx, project.id)
      await insertTask(tx, project.id, { milestoneId: milestone.id })
      expect((await me.del(`${PROJECTS}/${project.id}`)).status).toBe(204)
      expect(await tx.select().from(milestones).where(eq(milestones.projectId, project.id))).toHaveLength(0)
      expect(await tx.select().from(tasks).where(eq(tasks.projectId, project.id))).toHaveLength(0)
    })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && bun test src/routes/projects.test.ts`
Expected: FAIL. `/api/v1/projects` returns `404 not_found` because it is not mounted.

- [ ] **Step 3: Implement**

`apps/api/src/projects/service.ts`:
```ts
import {
  type CreateProjectInput,
  hexKey,
  nextArchipelagoSlot,
  type ProjectDto,
  type UpdateProjectInput,
} from '@archipelago/shared'
import { and, asc, eq, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { projects, users } from '../db/schema'
import { AppError } from '../errors'
import { toProjectDto } from '../http/serialize'

/** Non-negative 31-bit integer, so it fits a Postgres `integer`. */
const randomSeed = (): number => (crypto.getRandomValues(new Uint32Array(1))[0] ?? 0) >>> 1

const notFound = () => new AppError('not_found', 'Project not found')

export async function listProjects(db: Db, userId: string): Promise<ProjectDto[]> {
  const rows = await db
    .select()
    .from(projects)
    .where(eq(projects.userId, userId))
    .orderBy(asc(projects.createdAt), asc(projects.id))
  return rows.map(toProjectDto)
}

export async function createProject(
  db: Db,
  userId: string,
  input: CreateProjectInput,
): Promise<ProjectDto> {
  return db.transaction(async (tx) => {
    // Lock the owner so two concurrent creates cannot pick the same archipelago slot.
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update')
    const existing = await tx
      .select({ q: projects.archipelagoX, r: projects.archipelagoY })
      .from(projects)
      .where(eq(projects.userId, userId))
    const slot = nextArchipelagoSlot(new Set(existing.map(hexKey)))
    const [row] = await tx
      .insert(projects)
      .values({
        userId,
        name: input.name,
        islandSeed: randomSeed(),
        archipelagoX: slot.q,
        archipelagoY: slot.r,
      })
      .returning()
    if (!row) throw new Error('createProject: no row returned')
    return toProjectDto(row)
  })
}

export async function updateProject(
  db: Db,
  userId: string,
  projectId: string,
  input: UpdateProjectInput,
  now: Date,
): Promise<ProjectDto> {
  const changes: Partial<typeof projects.$inferInsert> = {}
  if (input.name !== undefined) changes.name = input.name
  if (input.archived === false) changes.archivedAt = null
  const [row] = await db
    .update(projects)
    .set(
      input.archived === true
        ? // Keep the original archive time if it is already archived.
          { ...changes, archivedAt: sql`coalesce(${projects.archivedAt}, ${now})` }
        : changes,
    )
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .returning()
  if (!row) throw notFound()
  return toProjectDto(row)
}

export async function deleteProject(db: Db, userId: string, projectId: string): Promise<void> {
  const deleted = await db
    .delete(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .returning({ id: projects.id })
  if (deleted.length === 0) throw notFound()
}
```

`apps/api/src/routes/projects.ts`:
```ts
import { createProjectInputSchema, updateProjectInputSchema } from '@archipelago/shared'
import { Hono } from 'hono'
import { requireAuth } from '../auth/middleware'
import { idParam } from '../http/params'
import { createProject, deleteProject, listProjects, updateProject } from '../projects/service'
import type { AppEnv, Deps } from '../types'
import { jsonBody } from '../validate'

export function projectRoutes(deps: Deps) {
  const { db } = deps
  const now = () => deps.now?.() ?? new Date()

  return new Hono<AppEnv>()
    .use(requireAuth(deps))
    .get('/', async (c) => c.json({ projects: await listProjects(db, c.get('user').id) }))
    .post('/', jsonBody(createProjectInputSchema), async (c) => {
      const project = await createProject(db, c.get('user').id, c.req.valid('json'))
      return c.json({ project }, 201)
    })
    .patch('/:id', jsonBody(updateProjectInputSchema), async (c) => {
      const id = idParam(c.req.param('id'), 'Project')
      const project = await updateProject(db, c.get('user').id, id, c.req.valid('json'), now())
      return c.json({ project })
    })
    .delete('/:id', async (c) => {
      await deleteProject(db, c.get('user').id, idParam(c.req.param('id'), 'Project'))
      return c.body(null, 204)
    })
}
```

In `apps/api/src/app.ts`, add `import { projectRoutes } from './routes/projects'` and extend the chain after `/tokens`:
```ts
    .route('/projects', projectRoutes(deps))
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && bun test && cd ../.. && bun run typecheck && bun run lint`
Expected: all PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add apps/api
git commit -m "feat(api): add project CRUD with archipelago slot assignment"
```

---

### Task 5: Milestones (districts, landmarks, delete falls back to the commons)

**Files:**
- Create: `apps/api/src/milestones/service.ts`, `apps/api/src/routes/milestones.ts`
- Modify: `apps/api/src/routes/projects.ts` (add `POST /:id/milestones`), `apps/api/src/app.ts` (mount `/milestones`)
- Test: `apps/api/src/routes/milestones.test.ts`

**Interfaces:**
- Consumes: `lockOwnedProject`, `takenPlots`, `assignTaskPlot`, `MilestoneRow`, `toMilestoneDto`, `idParam` (Task 3); `nextDistrictCenter`, `landmarkForIndex`, `createMilestoneInputSchema`, `updateMilestoneInputSchema` (Tasks 1–2); `projectRoutes` (Task 4).
- Produces:
  - `src/milestones/service.ts`:
    - `createMilestone(db: Db, userId: string, projectId: string, input: CreateMilestoneInput): Promise<MilestoneDto>`
    - `updateMilestone(db: Db, userId: string, milestoneId: string, input: UpdateMilestoneInput): Promise<MilestoneDto>`
    - `deleteMilestone(db: Db, userId: string, milestoneId: string, now: Date): Promise<void>`
    - `findOwnedMilestone(tx: Db, userId: string, milestoneId: string): Promise<MilestoneRow | null>`
  - Routes:
    - `POST /api/v1/projects/:id/milestones` → `201 { milestone }`
    - `PATCH /api/v1/milestones/:id` → `{ milestone }`
    - `DELETE /api/v1/milestones/:id` → `204`

- [ ] **Step 1: Write the failing tests**

`apps/api/src/routes/milestones.test.ts`:
```ts
import { describe, expect, test } from 'bun:test'
import type { MilestoneDto, ProjectDto } from '@archipelago/shared'
import { hexDistance, hexKey } from '@archipelago/shared'
import { eq } from 'drizzle-orm'
import { authedApp, readJson } from '../../test/auth'
import { withRollback } from '../../test/db'
import { insertProject, insertTask } from '../../test/fixtures'
import type { Db } from '../db/client'
import { milestones, tasks } from '../db/schema'

const origin = { q: 0, r: 0 }
type One = { milestone: MilestoneDto }

async function setup(tx: Db) {
  const me = await authedApp(tx)
  const res = await me.post('/api/v1/projects', { name: 'Beta' })
  const { project } = await readJson<{ project: ProjectDto }>(res)
  const addMilestone = async (name: string) =>
    (await readJson<One>(await me.post(`/api/v1/projects/${project.id}/milestones`, { name })))
      .milestone
  return { me, project, addMilestone }
}

describe('POST /projects/:id/milestones', () => {
  test('places districts 5 hexes from the commons, cycling landmarks and sort order', async () => {
    await withRollback(async (tx) => {
      const { addMilestone } = await setup(tx)
      const created: MilestoneDto[] = []
      for (const name of ['M1', 'M2', 'M3', 'M4', 'M5', 'M6']) created.push(await addMilestone(name))

      expect(created.map((m) => m.landmarkType)).toEqual([
        'lighthouse',
        'town_hall',
        'windmill',
        'observatory',
        'market',
        'lighthouse',
      ])
      expect(created.map((m) => m.sortOrder)).toEqual([0, 1, 2, 3, 4, 5])
      const centres = created.map((m) => ({ q: m.districtQ, r: m.districtR }))
      for (const c of centres) expect(hexDistance(c, origin)).toBe(5)
      expect(new Set(centres.map(hexKey)).size).toBe(6)
      expect(created[0]?.completedAt).toBeNull()
    })
  })

  test("another user's project and malformed ids → 404; blank name → 422", async () => {
    await withRollback(async (tx) => {
      const { me, project } = await setup(tx)
      const other = await authedApp(tx)
      const theirs = await insertProject(tx, other.user.id)
      expect((await me.post(`/api/v1/projects/${theirs.id}/milestones`, { name: 'x' })).status).toBe(404)
      expect((await me.post('/api/v1/projects/abc/milestones', { name: 'x' })).status).toBe(404)
      expect((await me.post(`/api/v1/projects/${project.id}/milestones`, { name: ' ' })).status).toBe(
        422,
      )
    })
  })
})

describe('PATCH /milestones/:id', () => {
  test('renames and reorders; other users and malformed ids get 404', async () => {
    await withRollback(async (tx) => {
      const { me, addMilestone } = await setup(tx)
      const other = await authedApp(tx)
      const m = await addMilestone('Launch')
      const updated = await readJson<One>(
        await me.patch(`/api/v1/milestones/${m.id}`, { name: 'Launch v2', sortOrder: 4 }),
      )
      expect(updated.milestone).toMatchObject({ name: 'Launch v2', sortOrder: 4 })
      expect((await other.patch(`/api/v1/milestones/${m.id}`, { name: 'Stolen' })).status).toBe(404)
      expect((await other.patch('/api/v1/milestones/abc', { name: 'x' })).status).toBe(404)
    })
  })
})

describe('DELETE /milestones/:id', () => {
  test("moves the milestone's tasks to free plots in the commons, then deletes it", async () => {
    await withRollback(async (tx) => {
      const { me, project, addMilestone } = await setup(tx)
      const m = await addMilestone('MVP')
      for (let i = 1; i <= 3; i++) {
        await insertTask(tx, project.id, {
          milestoneId: m.id,
          plotX: m.districtQ + i,
          plotY: m.districtR - i,
        })
      }
      await insertTask(tx, project.id, { plotX: 1, plotY: 0 }) // an existing loose task

      expect((await me.del(`/api/v1/milestones/${m.id}`)).status).toBe(204)
      expect(await tx.select().from(milestones).where(eq(milestones.id, m.id))).toHaveLength(0)

      const all = await tx.select().from(tasks).where(eq(tasks.projectId, project.id))
      expect(all).toHaveLength(4)
      const plots = all.map((t) => ({ q: t.plotX, r: t.plotY }))
      expect(new Set(plots.map(hexKey)).size).toBe(4)
      for (const t of all) {
        expect(t.milestoneId).toBeNull()
        expect(hexDistance({ q: t.plotX, r: t.plotY }, origin)).toBe(1)
      }
    })
  })

  test("another user's milestone → 404 and nothing changes", async () => {
    await withRollback(async (tx) => {
      const { addMilestone } = await setup(tx)
      const other = await authedApp(tx)
      const m = await addMilestone('MVP')
      expect((await other.del(`/api/v1/milestones/${m.id}`)).status).toBe(404)
      expect(await tx.select().from(milestones).where(eq(milestones.id, m.id))).toHaveLength(1)
    })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && bun test src/routes/milestones.test.ts`
Expected: FAIL. `POST /projects/:id/milestones` and `/milestones/:id` return `404 not_found` (not mounted).

- [ ] **Step 3: Implement**

`apps/api/src/milestones/service.ts`:
```ts
import {
  type CreateMilestoneInput,
  landmarkForIndex,
  type MilestoneDto,
  nextDistrictCenter,
  type UpdateMilestoneInput,
} from '@archipelago/shared'
import { and, asc, eq, getTableColumns } from 'drizzle-orm'
import type { Db } from '../db/client'
import { milestones, projects, tasks } from '../db/schema'
import { AppError } from '../errors'
import { toMilestoneDto } from '../http/serialize'
import {
  assignTaskPlot,
  lockOwnedProject,
  type MilestoneRow,
  takenPlots,
} from '../world/plots'

const notFound = () => new AppError('not_found', 'Milestone not found')

export async function findOwnedMilestone(
  tx: Db,
  userId: string,
  milestoneId: string,
): Promise<MilestoneRow | null> {
  const [row] = await tx
    .select(getTableColumns(milestones))
    .from(milestones)
    .innerJoin(projects, eq(projects.id, milestones.projectId))
    .where(and(eq(milestones.id, milestoneId), eq(projects.userId, userId)))
  return row ?? null
}

export async function createMilestone(
  db: Db,
  userId: string,
  projectId: string,
  input: CreateMilestoneInput,
): Promise<MilestoneDto> {
  return db.transaction(async (tx) => {
    const project = await lockOwnedProject(tx, userId, projectId)
    if (!project) throw new AppError('not_found', 'Project not found')
    const existingCount = (
      await tx.select({ id: milestones.id }).from(milestones).where(eq(milestones.projectId, projectId))
    ).length
    // Avoid every occupied hex, not only other centres, so a centre never lands on a task.
    const centre = nextDistrictCenter(await takenPlots(tx, projectId))
    const [row] = await tx
      .insert(milestones)
      .values({
        projectId,
        name: input.name,
        sortOrder: existingCount,
        landmarkType: landmarkForIndex(existingCount),
        districtQ: centre.q,
        districtR: centre.r,
      })
      .returning()
    if (!row) throw new Error('createMilestone: no row returned')
    return toMilestoneDto(row)
  })
}

export async function updateMilestone(
  db: Db,
  userId: string,
  milestoneId: string,
  input: UpdateMilestoneInput,
): Promise<MilestoneDto> {
  const owned = await findOwnedMilestone(db, userId, milestoneId)
  if (!owned) throw notFound()
  const [row] = await db
    .update(milestones)
    .set({ name: input.name, sortOrder: input.sortOrder })
    .where(eq(milestones.id, milestoneId))
    .returning()
  if (!row) throw notFound()
  return toMilestoneDto(row)
}

export async function deleteMilestone(
  db: Db,
  userId: string,
  milestoneId: string,
  now: Date,
): Promise<void> {
  await db.transaction(async (tx) => {
    const owned = await findOwnedMilestone(tx, userId, milestoneId)
    if (!owned) throw notFound()
    const project = await lockOwnedProject(tx, userId, owned.projectId)
    if (!project) throw notFound()

    const orphans = await tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(eq(tasks.milestoneId, milestoneId))
      .orderBy(asc(tasks.sortOrder), asc(tasks.createdAt), asc(tasks.id))
    // One at a time: each assignment sees the plots taken by the previous one.
    for (const orphan of orphans) {
      const plot = await assignTaskPlot(tx, project, null)
      await tx
        .update(tasks)
        .set({ milestoneId: null, plotX: plot.q, plotY: plot.r, updatedAt: now })
        .where(eq(tasks.id, orphan.id))
    }
    await tx.delete(milestones).where(eq(milestones.id, milestoneId))
  })
}
```

Drizzle skips `undefined` values in `.set()`, so a PATCH that omits `name` or `sortOrder` leaves that column untouched. The schema guarantees at least one field is present.

`apps/api/src/routes/milestones.ts`:
```ts
import { updateMilestoneInputSchema } from '@archipelago/shared'
import { Hono } from 'hono'
import { requireAuth } from '../auth/middleware'
import { idParam } from '../http/params'
import { deleteMilestone, updateMilestone } from '../milestones/service'
import type { AppEnv, Deps } from '../types'
import { jsonBody } from '../validate'

export function milestoneRoutes(deps: Deps) {
  const { db } = deps
  const now = () => deps.now?.() ?? new Date()

  return new Hono<AppEnv>()
    .use(requireAuth(deps))
    .patch('/:id', jsonBody(updateMilestoneInputSchema), async (c) => {
      const id = idParam(c.req.param('id'), 'Milestone')
      const milestone = await updateMilestone(db, c.get('user').id, id, c.req.valid('json'))
      return c.json({ milestone })
    })
    .delete('/:id', async (c) => {
      await deleteMilestone(db, c.get('user').id, idParam(c.req.param('id'), 'Milestone'), now())
      return c.body(null, 204)
    })
}
```

In `apps/api/src/routes/projects.ts`, add imports `createMilestoneInputSchema` (from `@archipelago/shared`) and `createMilestone` (from `../milestones/service`). Then append to the chain, after `.delete('/:id', …)`:
```ts
    .post('/:id/milestones', jsonBody(createMilestoneInputSchema), async (c) => {
      const projectId = idParam(c.req.param('id'), 'Project')
      const milestone = await createMilestone(db, c.get('user').id, projectId, c.req.valid('json'))
      return c.json({ milestone }, 201)
    })
```

In `apps/api/src/app.ts`, add `import { milestoneRoutes } from './routes/milestones'` and append to the chain:
```ts
    .route('/milestones', milestoneRoutes(deps))
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && bun test && cd ../.. && bun run typecheck && bun run lint`
Expected: all PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add apps/api
git commit -m "feat(api): add milestones with district placement and landmark cycling"
```

---
### Task 6: Tasks (create, list, update, move, delete)

**Files:**
- Create: `apps/api/src/tasks/service.ts`, `apps/api/src/routes/tasks.ts`
- Modify: `apps/api/src/validate.ts` (add `queryParams`), `apps/api/src/app.ts` (mount `/tasks`)
- Test: `apps/api/src/routes/tasks.test.ts`

**Interfaces:**
- Consumes: `lockOwnedProject`, `findMilestoneInProject`, `assignTaskPlot`, `syncMilestoneCompletion`, `TaskRow`, `toTaskDto`, `idParam` (Task 3); `createTaskInputSchema`, `updateTaskInputSchema`, `taskListQuerySchema` (Task 2); `toFieldErrors`, `jsonBody`, `AppError`.
- Produces:
  - `src/validate.ts`: `queryParams(schema)`, a Hono `validator('query')` that throws `AppError('validation_failed', 'Query is invalid', fields)`.
  - `src/tasks/service.ts`:
    - `findOwnedTask(tx: Db, userId: string, taskId: string): Promise<TaskRow | null>`
    - `listTasks(db: Db, userId: string, query: TaskListQuery): Promise<TaskDto[]>` (sortOrder, createdAt, id ascending)
    - `createTask(db: Db, userId: string, input: CreateTaskInput, now: Date): Promise<TaskDto>`
    - `updateTask(db: Db, userId: string, taskId: string, input: UpdateTaskInput, now: Date): Promise<TaskDto>`
    - `deleteTask(db: Db, userId: string, taskId: string, now: Date): Promise<void>`
  - Error rules:
    - A body `projectId` the caller doesn't own → `422` with `fields.projectId`.
    - A `milestoneId` not in the task's project → `422` with `fields.milestoneId` "Milestone does not belong to this project".
    - Changing `status` on a done task → `409 conflict`.
  - Routes under `/api/v1/tasks`:
    - `GET /` (query `project`, `milestone`, `status`) → `{ tasks }`
    - `POST /` → `201 { task }`
    - `PATCH /:id` → `{ task }`
    - `DELETE /:id` → `204`

- [ ] **Step 1: Write the failing tests**

`apps/api/src/routes/tasks.test.ts`:
```ts
import { describe, expect, test } from 'bun:test'
import type { ErrorBody, MilestoneDto, ProjectDto, TaskDto } from '@archipelago/shared'
import { hexDistance, hexKey } from '@archipelago/shared'
import { eq } from 'drizzle-orm'
import { authedApp, readJson } from '../../test/auth'
import { withRollback } from '../../test/db'
import { insertProject, insertTask } from '../../test/fixtures'
import type { Db } from '../db/client'
import { milestones, tasks } from '../db/schema'

const TASKS = '/api/v1/tasks'
const origin = { q: 0, r: 0 }
type One = { task: TaskDto }

async function setup(tx: Db) {
  const me = await authedApp(tx)
  const newProject = async (name: string) =>
    (await readJson<{ project: ProjectDto }>(await me.post('/api/v1/projects', { name }))).project
  const newMilestone = async (projectId: string, name: string) =>
    (
      await readJson<{ milestone: MilestoneDto }>(
        await me.post(`/api/v1/projects/${projectId}/milestones`, { name }),
      )
    ).milestone
  const project = await newProject('Beta')
  const milestone = await newMilestone(project.id, 'MVP')
  const addTask = async (body: Record<string, unknown>) =>
    (await readJson<One>(await me.post(TASKS, { projectId: project.id, ...body }))).task
  return { me, project, milestone, newProject, newMilestone, addTask }
}

describe('POST /tasks', () => {
  test('a loose task gets defaults and a plot next to the commons centre', async () => {
    await withRollback(async (tx) => {
      const { me, project } = await setup(tx)
      const res = await me.post(TASKS, { projectId: project.id, title: '  Write spec ' })
      expect(res.status).toBe(201)
      const { task } = await readJson<One>(res)
      expect(task).toMatchObject({
        projectId: project.id,
        milestoneId: null,
        title: 'Write spec',
        notes: '',
        dueDate: null,
        priority: 'med',
        size: 'M',
        status: 'todo',
        completedAt: null,
        sortOrder: 0,
      })
      expect(hexDistance({ q: task.plotX, r: task.plotY }, origin)).toBe(1)
    })
  })

  test('tasks fill ring 1 around their district before ring 2, never the centre', async () => {
    await withRollback(async (tx) => {
      const { milestone, addTask } = await setup(tx)
      const centre = { q: milestone.districtQ, r: milestone.districtR }
      const created: TaskDto[] = []
      for (let i = 0; i < 7; i++) created.push(await addTask({ title: `T${i}`, milestoneId: milestone.id }))
      const plots = created.map((t) => ({ q: t.plotX, r: t.plotY }))
      expect(new Set(plots.map(hexKey)).size).toBe(7)
      for (const p of plots.slice(0, 6)) expect(hexDistance(p, centre)).toBe(1)
      expect(hexDistance(plots[6] ?? centre, centre)).toBe(2)
    })
  })

  test('a milestone from another project → 422 on milestoneId, nothing created', async () => {
    await withRollback(async (tx) => {
      const { me, project, newProject, newMilestone } = await setup(tx)
      const elsewhere = await newMilestone((await newProject('Gamma')).id, 'Other')
      const res = await me.post(TASKS, { projectId: project.id, milestoneId: elsewhere.id, title: 'x' })
      expect(res.status).toBe(422)
      expect((await readJson<ErrorBody>(res)).error.fields?.milestoneId).toEqual([
        'Milestone does not belong to this project',
      ])
      expect(await tx.select().from(tasks).where(eq(tasks.projectId, project.id))).toHaveLength(0)
    })
  })

  test("another user's project, an unknown project and bad input → 422", async () => {
    await withRollback(async (tx) => {
      const { me } = await setup(tx)
      const other = await authedApp(tx)
      const theirs = await insertProject(tx, other.user.id)
      for (const [body, field] of [
        [{ projectId: theirs.id, title: 'x' }, 'projectId'],
        [{ projectId: crypto.randomUUID(), title: 'x' }, 'projectId'],
        [{ projectId: 'abc', title: 'x' }, 'projectId'],
        [{ projectId: theirs.id, title: 'x', dueDate: '2026-02-30' }, 'dueDate'],
      ] as const) {
        const res = await me.post(TASKS, body)
        expect(res.status).toBe(422)
        expect(Object.keys((await readJson<ErrorBody>(res)).error.fields ?? {})).toContain(field)
      }
      expect(await tx.select().from(tasks).where(eq(tasks.projectId, theirs.id))).toHaveLength(0)
    })
  })

  test('adding a todo task to a completed milestone reopens it', async () => {
    await withRollback(async (tx) => {
      const { project, milestone, addTask } = await setup(tx)
      await insertTask(tx, project.id, { milestoneId: milestone.id, status: 'done' })
      await tx.update(milestones).set({ completedAt: new Date() }).where(eq(milestones.id, milestone.id))
      await addTask({ title: 'More work', milestoneId: milestone.id })
      const [m] = await tx.select().from(milestones).where(eq(milestones.id, milestone.id))
      expect(m?.completedAt).toBeNull()
    })
  })
})

describe('GET /tasks', () => {
  test("filters by project, milestone and status, and never shows another user's tasks", async () => {
    await withRollback(async (tx) => {
      const { me, project, milestone, newProject, addTask } = await setup(tx)
      const gamma = await newProject('Gamma')
      await addTask({ title: 'Loose' })
      await addTask({ title: 'In MVP', milestoneId: milestone.id })
      await me.post(TASKS, { projectId: gamma.id, title: 'Gamma task' })
      const other = await authedApp(tx)
      await insertTask(tx, (await insertProject(tx, other.user.id)).id, { title: 'Not mine' })

      const titles = async (qs: string) =>
        (await readJson<{ tasks: TaskDto[] }>(await me.get(`${TASKS}${qs}`))).tasks.map((t) => t.title)
      // Ordered by per-project sortOrder, then creation time.
      expect(await titles('')).toEqual(['Loose', 'Gamma task', 'In MVP'])
      expect(await titles(`?project=${project.id}`)).toEqual(['Loose', 'In MVP'])
      expect(await titles(`?milestone=${milestone.id}`)).toEqual(['In MVP'])
      expect(await titles('?status=done')).toEqual([])
      expect((await me.get(`${TASKS}?project=abc`)).status).toBe(422)
    })
  })
})

describe('PATCH /tasks/:id', () => {
  test('updates fields, including clearing the due date', async () => {
    await withRollback(async (tx) => {
      const { me, addTask } = await setup(tx)
      const task = await addTask({ title: 'Draft', dueDate: '2026-10-10' })
      const res = await me.patch(`${TASKS}/${task.id}`, {
        title: 'Final',
        notes: 'Ship it',
        dueDate: null,
        priority: 'high',
        size: 'L',
        status: 'doing',
      })
      expect(res.status).toBe(200)
      expect((await readJson<One>(res)).task).toMatchObject({
        title: 'Final',
        notes: 'Ship it',
        dueDate: null,
        priority: 'high',
        size: 'L',
        status: 'doing',
      })
    })
  })

  test('status done is rejected (422); status changes on a done task conflict (409)', async () => {
    await withRollback(async (tx) => {
      const { me, addTask } = await setup(tx)
      const task = await addTask({ title: 'x' })
      expect((await me.patch(`${TASKS}/${task.id}`, { status: 'done' })).status).toBe(422)

      await tx.update(tasks).set({ status: 'done', completedAt: new Date() }).where(eq(tasks.id, task.id))
      const res = await me.patch(`${TASKS}/${task.id}`, { status: 'todo' })
      expect(res.status).toBe(409)
      const [row] = await tx.select().from(tasks).where(eq(tasks.id, task.id))
      expect(row?.status).toBe('done')
    })
  })

  test('moving between districts re-plots; moving to another project’s milestone → 422', async () => {
    await withRollback(async (tx) => {
      const { me, project, milestone, newMilestone, newProject, addTask } = await setup(tx)
      const second = await newMilestone(project.id, 'Launch')
      const task = await addTask({ title: 'Mover', milestoneId: milestone.id })

      const moved = (await readJson<One>(await me.patch(`${TASKS}/${task.id}`, { milestoneId: second.id })))
        .task
      expect(moved.milestoneId).toBe(second.id)
      expect(hexDistance({ q: moved.plotX, r: moved.plotY }, { q: second.districtQ, r: second.districtR })).toBe(1)

      const loose = (await readJson<One>(await me.patch(`${TASKS}/${task.id}`, { milestoneId: null }))).task
      expect(loose.milestoneId).toBeNull()
      expect(hexDistance({ q: loose.plotX, r: loose.plotY }, origin)).toBe(1)

      const foreign = await newMilestone((await newProject('Gamma')).id, 'Other')
      const res = await me.patch(`${TASKS}/${task.id}`, { milestoneId: foreign.id })
      expect(res.status).toBe(422)
      const [row] = await tx.select().from(tasks).where(eq(tasks.id, task.id))
      expect(row?.milestoneId).toBeNull()
    })
  })

  test("another user's task and malformed ids → 404", async () => {
    await withRollback(async (tx) => {
      const { addTask } = await setup(tx)
      const task = await addTask({ title: 'Mine' })
      const other = await authedApp(tx)
      expect((await other.patch(`${TASKS}/${task.id}`, { title: 'Stolen' })).status).toBe(404)
      expect((await other.del(`${TASKS}/${task.id}`)).status).toBe(404)
      expect((await other.patch(`${TASKS}/abc`, { title: 'x' })).status).toBe(404)
      const [row] = await tx.select().from(tasks).where(eq(tasks.id, task.id))
      expect(row?.title).toBe('Mine')
    })
  })
})

describe('DELETE /tasks/:id', () => {
  test('deletes the task and re-evaluates its milestone', async () => {
    await withRollback(async (tx) => {
      const { me, project, milestone, addTask } = await setup(tx)
      await insertTask(tx, project.id, { milestoneId: milestone.id, status: 'done' })
      const open = await addTask({ title: 'Last open one', milestoneId: milestone.id })
      expect((await me.del(`${TASKS}/${open.id}`)).status).toBe(204)
      expect(await tx.select().from(tasks).where(eq(tasks.id, open.id))).toHaveLength(0)
      const [m] = await tx.select().from(milestones).where(eq(milestones.id, milestone.id))
      expect(m?.completedAt).not.toBeNull()
    })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && bun test src/routes/tasks.test.ts`
Expected: FAIL. `/api/v1/tasks` returns `404 not_found` (not mounted).

- [ ] **Step 3: Implement**

Append to `apps/api/src/validate.ts`:
```ts
export const queryParams = <T extends z.ZodType>(schema: T) =>
  validator('query', (value): z.output<T> => {
    const result = schema.safeParse(value)
    if (!result.success) {
      throw new AppError('validation_failed', 'Query is invalid', toFieldErrors(result.error))
    }
    return result.data
  })
```

`apps/api/src/tasks/service.ts`:
```ts
import type {
  CreateTaskInput,
  TaskDto,
  TaskListQuery,
  UpdateTaskInput,
} from '@archipelago/shared'
import { and, asc, eq, getTableColumns, type SQL } from 'drizzle-orm'
import type { Db } from '../db/client'
import { projects, tasks } from '../db/schema'
import { AppError } from '../errors'
import { toTaskDto } from '../http/serialize'
import {
  assignTaskPlot,
  findMilestoneInProject,
  lockOwnedProject,
  syncMilestoneCompletion,
  type TaskRow,
} from '../world/plots'

const notFound = () => new AppError('not_found', 'Task not found')
const invalid = (field: string, message: string) =>
  new AppError('validation_failed', 'Request body is invalid', { [field]: [message] })
const wrongMilestone = () => invalid('milestoneId', 'Milestone does not belong to this project')

export async function findOwnedTask(
  tx: Db,
  userId: string,
  taskId: string,
): Promise<TaskRow | null> {
  const [row] = await tx
    .select(getTableColumns(tasks))
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(and(eq(tasks.id, taskId), eq(projects.userId, userId)))
  return row ?? null
}

export async function listTasks(db: Db, userId: string, query: TaskListQuery): Promise<TaskDto[]> {
  const filters: SQL[] = [eq(projects.userId, userId)]
  if (query.project) filters.push(eq(tasks.projectId, query.project))
  if (query.milestone) filters.push(eq(tasks.milestoneId, query.milestone))
  if (query.status) filters.push(eq(tasks.status, query.status))
  const rows = await db
    .select(getTableColumns(tasks))
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(and(...filters))
    .orderBy(asc(tasks.sortOrder), asc(tasks.createdAt), asc(tasks.id))
  return rows.map(toTaskDto)
}

export async function createTask(
  db: Db,
  userId: string,
  input: CreateTaskInput,
  now: Date,
): Promise<TaskDto> {
  return db.transaction(async (tx) => {
    const project = await lockOwnedProject(tx, userId, input.projectId)
    if (!project) throw invalid('projectId', 'Project not found')
    const milestone = input.milestoneId
      ? await findMilestoneInProject(tx, input.milestoneId, project.id)
      : null
    if (input.milestoneId && !milestone) throw wrongMilestone()

    const plot = await assignTaskPlot(tx, project, milestone)
    const sortOrder = (
      await tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.projectId, project.id))
    ).length
    const [row] = await tx
      .insert(tasks)
      .values({
        projectId: project.id,
        milestoneId: milestone?.id ?? null,
        title: input.title,
        notes: input.notes,
        dueDate: input.dueDate,
        priority: input.priority,
        size: input.size,
        plotX: plot.q,
        plotY: plot.r,
        sortOrder,
        updatedAt: now,
      })
      .returning()
    if (!row) throw new Error('createTask: no row returned')
    await syncMilestoneCompletion(tx, row.milestoneId, now)
    return toTaskDto(row)
  })
}

export async function updateTask(
  db: Db,
  userId: string,
  taskId: string,
  input: UpdateTaskInput,
  now: Date,
): Promise<TaskDto> {
  return db.transaction(async (tx) => {
    const task = await findOwnedTask(tx, userId, taskId)
    if (!task) throw notFound()
    const project = await lockOwnedProject(tx, userId, task.projectId)
    if (!project) throw notFound()
    if (input.status !== undefined && task.status === 'done') {
      throw new AppError('conflict', 'Task is done; reopen it before changing its status')
    }

    // Undefined values are skipped by Drizzle; an explicit null clears dueDate.
    const changes: Partial<typeof tasks.$inferInsert> = {
      title: input.title,
      notes: input.notes,
      dueDate: input.dueDate,
      priority: input.priority,
      size: input.size,
      status: input.status,
      sortOrder: input.sortOrder,
      updatedAt: now,
    }

    const moves = input.milestoneId !== undefined && input.milestoneId !== task.milestoneId
    if (moves) {
      const target = input.milestoneId
        ? await findMilestoneInProject(tx, input.milestoneId, task.projectId)
        : null
      if (input.milestoneId && !target) throw wrongMilestone()
      const plot = await assignTaskPlot(tx, project, target)
      changes.milestoneId = target?.id ?? null
      changes.plotX = plot.q
      changes.plotY = plot.r
    }

    const [row] = await tx.update(tasks).set(changes).where(eq(tasks.id, taskId)).returning()
    if (!row) throw notFound()
    if (moves) {
      await syncMilestoneCompletion(tx, task.milestoneId, now)
      await syncMilestoneCompletion(tx, row.milestoneId, now)
    }
    return toTaskDto(row)
  })
}

export async function deleteTask(db: Db, userId: string, taskId: string, now: Date): Promise<void> {
  await db.transaction(async (tx) => {
    const task = await findOwnedTask(tx, userId, taskId)
    if (!task) throw notFound()
    await tx.delete(tasks).where(eq(tasks.id, taskId))
    await syncMilestoneCompletion(tx, task.milestoneId, now)
  })
}
```

`apps/api/src/routes/tasks.ts`:
```ts
import {
  createTaskInputSchema,
  taskListQuerySchema,
  updateTaskInputSchema,
} from '@archipelago/shared'
import { Hono } from 'hono'
import { requireAuth } from '../auth/middleware'
import { idParam } from '../http/params'
import { createTask, deleteTask, listTasks, updateTask } from '../tasks/service'
import type { AppEnv, Deps } from '../types'
import { jsonBody, queryParams } from '../validate'

export function taskRoutes(deps: Deps) {
  const { db } = deps
  const now = () => deps.now?.() ?? new Date()

  return new Hono<AppEnv>()
    .use(requireAuth(deps))
    .get('/', queryParams(taskListQuerySchema), async (c) =>
      c.json({ tasks: await listTasks(db, c.get('user').id, c.req.valid('query')) }),
    )
    .post('/', jsonBody(createTaskInputSchema), async (c) => {
      const task = await createTask(db, c.get('user').id, c.req.valid('json'), now())
      return c.json({ task }, 201)
    })
    .patch('/:id', jsonBody(updateTaskInputSchema), async (c) => {
      const id = idParam(c.req.param('id'), 'Task')
      const task = await updateTask(db, c.get('user').id, id, c.req.valid('json'), now())
      return c.json({ task })
    })
    .delete('/:id', async (c) => {
      await deleteTask(db, c.get('user').id, idParam(c.req.param('id'), 'Task'), now())
      return c.body(null, 204)
    })
}
```

In `apps/api/src/app.ts`, add `import { taskRoutes } from './routes/tasks'` and append `.route('/tasks', taskRoutes(deps))` to the chain.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && bun test && cd ../.. && bun run typecheck && bun run lint`
Expected: all PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add apps/api
git commit -m "feat(api): add task CRUD with plot assignment and milestone moves"
```

---

### Task 7: Complete and reopen

**Files:**
- Modify: `apps/api/src/tasks/service.ts` (add `completeTask`, `reopenTask`), `apps/api/src/routes/tasks.ts` (add the two routes)
- Test: `apps/api/src/routes/task-completion.test.ts`

**Interfaces:**
- Consumes: `findOwnedTask`, `syncMilestoneCompletion`, `toTaskDto`, `idParam` (Tasks 3, 6).
- Produces:
  - `completeTask(db: Db, userId: string, taskId: string, now: Date): Promise<{ task: TaskDto; milestoneCompleted: boolean }>`. A task that is already done → `409`.
  - `reopenTask(db: Db, userId: string, taskId: string, now: Date): Promise<{ task: TaskDto; milestoneReopened: boolean }>`. A task that is not done → `409`.
  - Routes:
    - `POST /api/v1/tasks/:id/complete` → `200 { task, milestoneCompleted }`
    - `POST /api/v1/tasks/:id/reopen` → `200 { task, milestoneReopened }`

  Phase 3 extends both response bodies with rewards.

- [ ] **Step 1: Write the failing tests**

`apps/api/src/routes/task-completion.test.ts`:
```ts
import { describe, expect, test } from 'bun:test'
import type { MilestoneDto, ProjectDto, TaskDto } from '@archipelago/shared'
import { eq } from 'drizzle-orm'
import { authedApp, readJson } from '../../test/auth'
import { withRollback } from '../../test/db'
import type { Db } from '../db/client'
import { milestones, tasks } from '../db/schema'

const TASKS = '/api/v1/tasks'
type Completed = { task: TaskDto; milestoneCompleted: boolean }
type Reopened = { task: TaskDto; milestoneReopened: boolean }

async function setup(tx: Db) {
  const me = await authedApp(tx)
  const { project } = await readJson<{ project: ProjectDto }>(
    await me.post('/api/v1/projects', { name: 'Beta' }),
  )
  const { milestone } = await readJson<{ milestone: MilestoneDto }>(
    await me.post(`/api/v1/projects/${project.id}/milestones`, { name: 'MVP' }),
  )
  const addTask = async (title: string, milestoneId: string | null = null) =>
    (await readJson<{ task: TaskDto }>(await me.post(TASKS, { projectId: project.id, title, milestoneId })))
      .task
  return { me, milestone, addTask }
}

describe('POST /tasks/:id/complete and /reopen', () => {
  test('complete sets done + completedAt; completing again → 409 and nothing changes', async () => {
    await withRollback(async (tx) => {
      const { me, addTask } = await setup(tx)
      const task = await addTask('Loose')
      const res = await me.post(`${TASKS}/${task.id}/complete`)
      expect(res.status).toBe(200)
      const body = await readJson<Completed>(res)
      expect(body.task.status).toBe('done')
      expect(body.task.completedAt).not.toBeNull()
      expect(body.milestoneCompleted).toBe(false)

      const again = await me.post(`${TASKS}/${task.id}/complete`)
      expect(again.status).toBe(409)
      const [row] = await tx.select().from(tasks).where(eq(tasks.id, task.id))
      expect(row?.completedAt?.toISOString()).toBe(body.task.completedAt ?? '')
    })
  })

  test("completing the milestone's last open task completes it; reopening reopens it", async () => {
    await withRollback(async (tx) => {
      const { me, milestone, addTask } = await setup(tx)
      const a = await addTask('A', milestone.id)
      const b = await addTask('B', milestone.id)

      expect((await readJson<Completed>(await me.post(`${TASKS}/${a.id}/complete`))).milestoneCompleted).toBe(
        false,
      )
      expect((await readJson<Completed>(await me.post(`${TASKS}/${b.id}/complete`))).milestoneCompleted).toBe(
        true,
      )
      const [done] = await tx.select().from(milestones).where(eq(milestones.id, milestone.id))
      expect(done?.completedAt).not.toBeNull()

      const reopened = await readJson<Reopened>(await me.post(`${TASKS}/${b.id}/reopen`))
      expect(reopened.task).toMatchObject({ status: 'todo', completedAt: null })
      expect(reopened.milestoneReopened).toBe(true)
      const [open] = await tx.select().from(milestones).where(eq(milestones.id, milestone.id))
      expect(open?.completedAt).toBeNull()
    })
  })

  test('reopening a task that is not done → 409', async () => {
    await withRollback(async (tx) => {
      const { me, addTask } = await setup(tx)
      const task = await addTask('Open')
      expect((await me.post(`${TASKS}/${task.id}/reopen`)).status).toBe(409)
    })
  })

  test("another user's task and malformed ids → 404", async () => {
    await withRollback(async (tx) => {
      const { addTask } = await setup(tx)
      const task = await addTask('Mine')
      const other = await authedApp(tx)
      expect((await other.post(`${TASKS}/${task.id}/complete`)).status).toBe(404)
      expect((await other.post(`${TASKS}/abc/reopen`)).status).toBe(404)
      const [row] = await tx.select().from(tasks).where(eq(tasks.id, task.id))
      expect(row?.status).toBe('todo')
    })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && bun test src/routes/task-completion.test.ts`
Expected: FAIL. `POST /tasks/:id/complete` returns `404 not_found` (route does not exist).

- [ ] **Step 3: Implement**

Append to `apps/api/src/tasks/service.ts`:
```ts
export async function completeTask(
  db: Db,
  userId: string,
  taskId: string,
  now: Date,
): Promise<{ task: TaskDto; milestoneCompleted: boolean }> {
  return db.transaction(async (tx) => {
    const task = await findOwnedTask(tx, userId, taskId)
    if (!task) throw notFound()
    if (task.status === 'done') throw new AppError('conflict', 'Task is already done')
    const [row] = await tx
      .update(tasks)
      .set({ status: 'done', completedAt: now, updatedAt: now })
      .where(eq(tasks.id, taskId))
      .returning()
    if (!row) throw notFound()
    const milestone = await syncMilestoneCompletion(tx, row.milestoneId, now)
    return { task: toTaskDto(row), milestoneCompleted: milestone === 'completed' }
  })
}

export async function reopenTask(
  db: Db,
  userId: string,
  taskId: string,
  now: Date,
): Promise<{ task: TaskDto; milestoneReopened: boolean }> {
  return db.transaction(async (tx) => {
    const task = await findOwnedTask(tx, userId, taskId)
    if (!task) throw notFound()
    if (task.status !== 'done') throw new AppError('conflict', 'Task is not done')
    const [row] = await tx
      .update(tasks)
      .set({ status: 'todo', completedAt: null, updatedAt: now })
      .where(eq(tasks.id, taskId))
      .returning()
    if (!row) throw notFound()
    const milestone = await syncMilestoneCompletion(tx, row.milestoneId, now)
    return { task: toTaskDto(row), milestoneReopened: milestone === 'reopened' }
  })
}
```

In `apps/api/src/routes/tasks.ts`, add `completeTask` and `reopenTask` to the service import, and append to the chain:
```ts
    .post('/:id/complete', async (c) => {
      const id = idParam(c.req.param('id'), 'Task')
      return c.json(await completeTask(db, c.get('user').id, id, now()))
    })
    .post('/:id/reopen', async (c) => {
      const id = idParam(c.req.param('id'), 'Task')
      return c.json(await reopenTask(db, c.get('user').id, id, now()))
    })
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && bun test && cd ../.. && bun run typecheck && bun run lint`
Expected: all PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add apps/api
git commit -m "feat(api): add task complete and reopen with milestone completion"
```

---

### Task 8: `GET /world` and the end-to-end check

**Files:**
- Create: `apps/api/src/world/service.ts`, `apps/api/src/routes/world.ts`
- Modify: `apps/api/src/app.ts` (mount `/world`)
- Test: `apps/api/src/routes/world.test.ts`

**Interfaces:**
- Consumes: serializers (Task 3), `createApiToken` (Phase 1, `src/auth/api-tokens.ts`), test helpers.
- Produces:
  - `getWorld(db: Db, userId: string): Promise<WorldDto>`. It includes only non-archived projects, plus those projects' milestones (by sortOrder), tasks (by sortOrder, createdAt) and buildings.
  - `GET /api/v1/world` → `WorldDto`.

- [ ] **Step 1: Write the failing tests**

`apps/api/src/routes/world.test.ts`:
```ts
import { describe, expect, test } from 'bun:test'
import type { WorldDto } from '@archipelago/shared'
import { authedApp, readJson } from '../../test/auth'
import { withRollback } from '../../test/db'
import {
  insertBuilding,
  insertMilestone,
  insertProject,
  insertTask,
  testConfig,
} from '../../test/fixtures'
import { createApp } from '../app'
import { createApiToken } from '../auth/api-tokens'

const WORLD = '/api/v1/world'

describe('GET /world', () => {
  test('an empty world for a new user', async () => {
    await withRollback(async (tx) => {
      const me = await authedApp(tx)
      expect(await readJson<WorldDto>(await me.get(WORLD))).toEqual({
        projects: [],
        milestones: [],
        tasks: [],
        buildings: [],
      })
    })
  })

  test("returns the caller's active islands with everything on them; hides archived and others'", async () => {
    await withRollback(async (tx) => {
      const me = await authedApp(tx)
      const active = await insertProject(tx, me.user.id, { name: 'Active' })
      const milestone = await insertMilestone(tx, active.id)
      await insertTask(tx, active.id, { title: 'On island', milestoneId: milestone.id })
      await insertBuilding(tx, active.id)

      const archived = await insertProject(tx, me.user.id, { name: 'Old', archivedAt: new Date() })
      await insertTask(tx, archived.id, { title: 'Archived task' })

      const other = await authedApp(tx)
      const theirs = await insertProject(tx, other.user.id, { name: 'Theirs' })
      await insertTask(tx, theirs.id, { title: 'Their task' })

      const world = await readJson<WorldDto>(await me.get(WORLD))
      expect(world.projects.map((p) => p.name)).toEqual(['Active'])
      expect(world.milestones.map((m) => m.id)).toEqual([milestone.id])
      expect(world.tasks.map((t) => t.title)).toEqual(['On island'])
      expect(world.buildings).toHaveLength(1)
    })
  })

  test('works with a bearer API token', async () => {
    await withRollback(async (tx) => {
      const me = await authedApp(tx)
      await insertProject(tx, me.user.id)
      const { token } = await createApiToken(tx, me.user.id, 'integration')
      const app = createApp({ db: tx, config: testConfig })
      const res = await app.request(WORLD, { headers: { authorization: `Bearer ${token}` } })
      expect(res.status).toBe(200)
      expect((await readJson<WorldDto>(res)).projects).toHaveLength(1)
    })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && bun test src/routes/world.test.ts`
Expected: FAIL. `/api/v1/world` returns `404 not_found`.

- [ ] **Step 3: Implement**

`apps/api/src/world/service.ts`:
```ts
import type { WorldDto } from '@archipelago/shared'
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import type { Db } from '../db/client'
import { buildings, milestones, projects, tasks } from '../db/schema'
import { toBuildingDto, toMilestoneDto, toProjectDto, toTaskDto } from '../http/serialize'

export async function getWorld(db: Db, userId: string): Promise<WorldDto> {
  const projectRows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.userId, userId), isNull(projects.archivedAt)))
    .orderBy(asc(projects.createdAt), asc(projects.id))
  const ids = projectRows.map((p) => p.id)
  if (ids.length === 0) return { projects: [], milestones: [], tasks: [], buildings: [] }

  const [milestoneRows, taskRows, buildingRows] = await Promise.all([
    db
      .select()
      .from(milestones)
      .where(inArray(milestones.projectId, ids))
      .orderBy(asc(milestones.sortOrder), asc(milestones.createdAt)),
    db
      .select()
      .from(tasks)
      .where(inArray(tasks.projectId, ids))
      .orderBy(asc(tasks.sortOrder), asc(tasks.createdAt), asc(tasks.id)),
    db.select().from(buildings).where(inArray(buildings.projectId, ids)),
  ])

  return {
    projects: projectRows.map(toProjectDto),
    milestones: milestoneRows.map(toMilestoneDto),
    tasks: taskRows.map(toTaskDto),
    buildings: buildingRows.map(toBuildingDto),
  }
}
```

`apps/api/src/routes/world.ts`:
```ts
import { Hono } from 'hono'
import { requireAuth } from '../auth/middleware'
import type { AppEnv, Deps } from '../types'
import { getWorld } from '../world/service'

export function worldRoutes(deps: Deps) {
  return new Hono<AppEnv>()
    .use(requireAuth(deps))
    .get('/', async (c) => c.json(await getWorld(deps.db, c.get('user').id)))
}
```

In `apps/api/src/app.ts`, add `import { worldRoutes } from './routes/world'` and append `.route('/world', worldRoutes(deps))` to the chain.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && bun test && cd ../.. && bun run test && bun run typecheck && bun run lint`
Expected: all packages PASS; clean.

- [ ] **Step 5: End-to-end check in Docker**

Run:
```bash
docker compose up -d --build
docker compose exec -T api bun run seed:user --email boss@example.com --password 'correct horse battery staple'
JAR=$(mktemp)
curl -s -c "$JAR" -H 'content-type: application/json' \
  -d '{"email":"boss@example.com","password":"correct horse battery staple"}' \
  localhost:3000/api/v1/auth/login > /dev/null
PROJECT=$(curl -s -b "$JAR" -H 'content-type: application/json' -d '{"name":"Beta"}' \
  localhost:3000/api/v1/projects | sed -E 's/.*"id":"([^"]+)".*/\1/')
MILESTONE=$(curl -s -b "$JAR" -H 'content-type: application/json' -d '{"name":"MVP"}' \
  "localhost:3000/api/v1/projects/$PROJECT/milestones" | sed -E 's/.*"milestone":\{"id":"([^"]+)".*/\1/')
TASK=$(curl -s -b "$JAR" -H 'content-type: application/json' \
  -d "{\"projectId\":\"$PROJECT\",\"milestoneId\":\"$MILESTONE\",\"title\":\"Ship it\"}" \
  localhost:3000/api/v1/tasks | sed -E 's/.*"task":\{"id":"([^"]+)".*/\1/')
curl -s -b "$JAR" -X POST "localhost:3000/api/v1/tasks/$TASK/complete"; echo
curl -s -b "$JAR" localhost:3000/api/v1/world; echo
rm -f "$JAR"
docker compose down -v && docker compose up -d postgres
```
Expected:
- The complete call returns `"status":"done"` and `"milestoneCompleted":true`.
- The world JSON contains 1 project, 1 milestone with a non-null `completedAt`, and 1 done task.
- The plot is 1 hex from the milestone's district centre.
- `docker compose logs api` shows no stack traces.

- [ ] **Step 6: Commit**

```bash
git add apps/api
git commit -m "feat(api): add world endpoint for the islands view"
```

---

## Phase 2a Done When

- [ ] `bun run test`, `bun run typecheck` and `bun run lint` are green.
- [ ] Projects, milestones and tasks support full create/read/update/delete through `/api/v1`, scoped to the caller, with 404/422 on foreign or malformed ids.
- [ ] Plots and district centres are deterministic, unique per island and never collide. Moving or orphaning tasks re-plots them.
- [ ] `complete`/`reopen` work and keep milestone completion in sync. `PATCH` can never mark a task done.
- [ ] `GET /world` returns the caller's active islands, ready for Phase 2b's web app.
