# Phase 5b Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish Phase 5: reward animations (floats, pop, balance count-up), the performance pass (adaptive quality, ticker on demand, delta clamp, `?perf` overlay, `scene/tuning.ts`) and the triaged carry-overs from Phases 2b–5a.

**Architecture:** Mutations push short-lived `RewardEvent`s into one app-wide reward store (a plain `get`/`subscribe` object shared through a React context, like the edge-indicator store); the lazily loaded scene reads it and animates pops and floats in `useFrame`, while the balance chip counts up with a DOM `requestAnimationFrame`. Every pure piece (pop curve, float frame, float anchor, quality reducer, ticker demand) lives in `scene/model/` with unit tests; components only wire them. Device-tunable constants move unchanged into `scene/tuning.ts`.

**Tech Stack:** Bun 1.4, TS 7 strict, React 19, TanStack Query/Router, three 0.186 + R3F 9.8 + drei 10.7 (`PerformanceMonitor`, `Html`), Vitest 5 + RTL, `@react-three/test-renderer` 9.1, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-10-07-archipelago-task-game-design.md` section 16 (Phase 5b), with sections 13.3, 14 and 15 for the systems it refines.

## Global Constraints

- Biome: single quotes, no semicolons, line width 100. `bun run lint` must stay at the one known info.
- TS strict with `noUncheckedIndexedAccess` and `verbatimModuleSyntax` (`import type` for types).
- three.js stays only in the lazy world-scene chunk: nothing under `apps/web/src/rewards/`, `economy/`, `world/`, `layout/`, `shop/` or `app/` may import `three`, `@react-three/*`, or a `scene/` module that does. `scene/tuning.ts`, `scene/model/*`, `scene/perf-store.ts` and `scene/use-reduced-motion.ts` are three-free and may be imported from the app.
- Reward event: `RewardEvent { id, target: { kind: 'task' | 'building', id } | null, amounts: number[], at }`; expires 1.6s after `at`; pushed only from a mutation's server response (never from a refetch or world diff, never on error rollback).
- Producers: task complete → target the task, `amounts` = the response's reward amounts in response order; placement → target the new building, `amounts: []`; reopen, removal, daily claim → no event. Toasts unchanged.
- Float: `+N` in a drei `<Html>`, `warning` text on a `surface-primary` pill, rises 1.2 world units and fades over 1.4s, lines stagger 150ms; above the target structure when its island is focused (island or district view), above the island centre otherwise; no float for a target not in the scene model.
- Pop: scale 0 → 1.15 → 1 over 400ms, ease-out back; `ModelInstances` gains `pop?: { index, startedAt }`.
- Count-up: 600ms, DOM `requestAnimationFrame`; `aria-label` always the true balance.
- Reduced motion: no floats, no pop, chip snaps, ticker never runs.
- Quality: `'high'` (start) `dpr={[1, 2]}`, sea wave on; `'low'` `dpr={1}`, sea frozen flat (shallows ring stays). drei's monitor gets only `bounds`, `onDecline` → low and `onIncline` → high (no `flipflops`/`onFallback`: drei counts every signal as a flip). `nextQuality` counts real tier changes and settles on `low` after 3 for the rest of the page load. The monitor is mounted only while the ticker runs, so on a world with nothing ticking `low` is effectively sticky for the page load. The 55fps reading is a manual `?perf` panning check. Not persisted.
- Ticker (33ms) runs only while: sea wave on (`high` and motion allowed), a crane exists (a `doing` task), a reward event is alive, or a camera flight/spring runs.
- Every `useFrame` consumer clamps `delta` to 100ms (`MAX_FRAME_DELTA = 0.1` s).
- `?perf` read once at load; overlay shows fps (last second of rendered frames), tier, draw calls, triangles, DPR.
- Copy: streak popover "Next bonus at N days: +X" or "Top streak bonus reached"; placement button "Placing…" with a `Spinner`.
- Commit messages: conventional (`feat(web): …`, `fix(web): …`, `test(api): …`), no AI attribution or `Co-Authored-By` trailer.
- Commands: shared `cd packages/shared && bun test <file>`; API `cd apps/api && bun test <file>` (needs `DATABASE_URL_TEST`); web `cd apps/web && bunx vitest run <file>`; per package `bun run --cwd apps/web test`, `bun run --cwd apps/api test`, `bun run --cwd packages/shared test`; gate from the root: `bun run test`, `bun run typecheck`, `bun run lint`, `bun run build`.

## Review Focus

1. A world refetch that lands before the completion response (the optimistic flip already shows the house) must not pop or float; only the response does, once. Pinned in Task 2 (producer test counts pushes across an explicit refetch).
2. After three real tier changes settle the tier on `low`, a later `onIncline` must not bring `high` back for the rest of the page load. Pinned in Task 6 (`nextQuality` unit test).
3. A second balance change while the chip is still counting continues from the number on screen, not from the old target and not with a jump. Pinned in Task 3.
4. A pop whose index no longer exists (a refetch removed instances of that kind mid-pop) is ignored without throwing, and the other instances keep their matrices. Pinned in Task 5.
5. `?perf` combined with other query parameters (`?x=1&perf`) still enables the overlay; `?perform` does not. Pinned in Task 7.

---

### Task 1: Rotation hash and the shop test gaps

**Files:**
- Modify: `packages/shared/src/land.ts`, `packages/shared/src/land.test.ts`
- Modify: `apps/api/src/routes/buildings.test.ts`
- Modify: `apps/web/src/test/fake-api-shop.test.ts`
- Modify: `apps/web/src/scene/world-contents.test.tsx`

**Interfaces:**
- Produces: `decorationRotation(plot: Hex): number` (same signature, new integer hash, still 0…5). Callers (API service, fake API, ghost in `island.tsx`) are unchanged.

- [ ] **Step 1: Failing shared test** — in `packages/shared/src/land.test.ts`, add inside `describe('land rule')`:

```ts
  test('decorationRotation varies along every anti-diagonal', () => {
    // The old (q*7 + r*13) % 6 reduces to (q + r) % 6: one turn per anti-diagonal.
    for (const sum of [-2, 0, 1, 3]) {
      const turns = new Set<number>()
      for (let k = -4; k <= 4; k++) turns.add(decorationRotation({ q: k, r: sum - k }))
      expect(turns.size).toBeGreaterThan(1)
    }
  })
```

- [ ] **Step 2: Run, expect failure**

Run: `cd packages/shared && bun test src/land.test.ts`
Expected: FAIL in "varies along every anti-diagonal" (size 1).

- [ ] **Step 3: Implement** — replace `decorationRotation` in `packages/shared/src/land.ts`:

```ts
/**
 * A fixed 60° step per plot, so decorations face different ways without the user turning them.
 * An integer hash of both coordinates: any linear form in q and r repeats along a line of hexes.
 */
export function decorationRotation(plot: Hex): number {
  let h = Math.imul(plot.q, 0x27d4eb2d) ^ Math.imul(plot.r, 0x165667b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h ^= h >>> 13
  return (h >>> 0) % 6
}
```

Run: `cd packages/shared && bun test src/land.test.ts` — Expected: PASS (the existing "deterministic and in 0..5" test also passes).

- [ ] **Step 4: API test inserts a real milestone** — in `apps/api/src/routes/buildings.test.ts` add `insertMilestone` to the `../../test/fixtures` import and replace the body of the test `'409 when the plot holds a task, a district centre or a decoration'` with:

```ts
    await withRollback(async (tx) => {
      const s = await setup(tx)
      await insertTask(tx, s.project.id, { plotX: 1, plotY: 0 })
      await insertMilestone(tx, s.project.id, { districtQ: -1, districtR: 1 })
      await insertBuilding(tx, s.project.id, { type: 'pine', plotX: 0, plotY: 1 })
      for (const body of [
        { plotX: 1, plotY: 0 },
        { plotX: -1, plotY: 1 },
        { plotX: 0, plotY: 1 },
      ]) {
        const res = await s.place(body)
        expect(res.status).toBe(409)
        expect(await res.json()).toEqual({
          error: { code: 'conflict', message: 'That plot is taken' },
        })
      }
    })
```

(`(-1, 1)` is one ring out, inside the flat interior of a radius-4 island, so only the occupancy check can reject it.)

Run: `cd apps/api && bun test src/routes/buildings.test.ts` — Expected: PASS.

- [ ] **Step 5: Fake API shop branches** — append to `describe('fake api shop')` in `apps/web/src/test/fake-api-shop.test.ts` (add `decorationRotation` from `@archipelago/shared` to the imports):

```ts
  test('a balance equal to the price buys; the stored rotation is the shared hash', async () => {
    const { api, beta } = seeded(30)
    const placed = await api.placeBuilding({ projectId: beta.id, type: 'pine', plotX: -1, plotY: 1 })
    expect(placed.balance).toBe(0)
    expect(placed.building.rotation).toBe(decorationRotation({ q: -1, r: 1 }))
  })

  test('a negative balance, an unknown type and an archived island are refused', async () => {
    const { api, beta, state } = seeded(0)
    state.ledger.push(fakeEntry({ kind: 'purchase', amount: -5 }))
    await expect(
      api.placeBuilding({ projectId: beta.id, type: 'pine', plotX: 0, plotY: 1 }),
    ).rejects.toMatchObject({ status: 409, code: 'insufficient_supplies', message: 'Balance is negative' })
    await expect(
      api.placeBuilding({
        projectId: beta.id,
        type: 'tree' as unknown as 'pine',
        plotX: 0,
        plotY: 1,
      }),
    ).rejects.toMatchObject({ status: 422, code: 'validation_failed' })
    const archived = fakeProject({ archivedAt: '2026-10-07T00:00:00.000Z' })
    state.world.projects.push(archived)
    await expect(
      api.placeBuilding({ projectId: archived.id, type: 'pine', plotX: 0, plotY: 1 }),
    ).rejects.toMatchObject({ status: 404 })
  })

  test('removing a legacy decoration refunds nothing and writes no ledger row', async () => {
    const beta = fakeProject()
    const legacy = fakeBuilding({ projectId: beta.id, type: 'obelisk' })
    const { api, state } = createFakeApi({
      world: { projects: [beta], milestones: [], tasks: [], buildings: [legacy] },
    })
    expect(await api.removeBuilding(legacy.id)).toEqual({ refund: 0, balance: 0 })
    expect(state.ledger).toEqual([])
  })
```

Run: `cd apps/web && bunx vitest run src/test/fake-api-shop.test.ts` — Expected: PASS (these pin existing behaviour; if one fails, fix `fake-api.ts` to match the API rule it names).

- [ ] **Step 6: Scene rotation matrices** — in `apps/web/src/scene/world-contents.test.tsx` change `import type * as THREE from 'three'` to `import * as THREE from 'three'` and add to `describe('decorations and placement')`:

```ts
  test('placed decorations stand on their plot, turned by their stored rotation', async () => {
    const { world, beta } = decorated()
    const { renderer } = await render(world, { kind: 'island', projectId: beta.id })
    const island = one(renderer.scene, `island:${beta.id}`)
    const check = (name: string, plot: { q: number; r: number }, rotation: number) => {
      const mesh = one(island, name).instance as THREE.InstancedMesh
      const actual = new THREE.Matrix4()
      mesh.getMatrixAt(0, actual)
      const at = hexToWorld(plot)
      const expected = new THREE.Matrix4()
        .makeRotationY((rotation * Math.PI) / 3)
        .setPosition(at.x, LAND_HEIGHT, at.z)
      actual.elements.forEach((v, i) => expect(v).toBeCloseTo(expected.elements[i] ?? Number.NaN))
    }
    check('pine', { q: 0, r: 1 }, 2)
    check('well', { q: -1, r: 1 }, 0)
  })
```

Run: `cd apps/web && bunx vitest run src/scene/world-contents.test.tsx` — Expected: PASS.

- [ ] **Step 7: Gate and commit**

Run: `bun run test && bun run typecheck && bun run lint` (root) — Expected: green, lint at the one known info.

```bash
git add packages/shared/src/land.ts packages/shared/src/land.test.ts apps/api/src/routes/buildings.test.ts apps/web/src/test/fake-api-shop.test.ts apps/web/src/scene/world-contents.test.tsx
git commit -m "fix(shared): hash both plot coordinates for decoration rotation and close the shop test gaps"
```

---

### Task 2: Reward store, provider and producers

**Files:**
- Create: `apps/web/src/rewards/reward-store.ts`, `apps/web/src/rewards/reward-store.test.ts`
- Create: `apps/web/src/rewards/reward-context.tsx`, `apps/web/src/rewards/producers.test.tsx`
- Modify: `apps/web/src/app/providers.tsx`, `apps/web/src/test/render-app.tsx`
- Modify: `apps/web/src/tasks/use-task-actions.ts`, `apps/web/src/shop/use-shop-actions.ts`

**Interfaces:**
- Produces (`apps/web/src/rewards/reward-store.ts`, no React, no three):

```ts
export type RewardTarget = { kind: 'task' | 'building'; id: string }
export type RewardEvent = {
  id: number
  target: RewardTarget | null
  amounts: readonly number[]
  /** `Date.now()` when pushed. */
  at: number
}
export type RewardInput = Pick<RewardEvent, 'target' | 'amounts'>
export const REWARD_LIFETIME_MS = 1600
export type RewardStore = {
  get: () => readonly RewardEvent[]
  push: (input: RewardInput) => RewardEvent
  subscribe: (listener: () => void) => () => void
}
export function createRewardStore(now?: () => number): RewardStore
```

- Produces (`apps/web/src/rewards/reward-context.tsx`): `RewardProvider({ store?, children })`, `useRewardStore(): RewardStore`.
- `AppProviders` gains an optional `rewards?: RewardStore` prop; `renderApp` returns `rewards` as well.
- Later tasks read events with `useSyncExternalStore(store.subscribe, store.get)`; `get()` returns the same array until the next push or expiry.

- [ ] **Step 1: Failing store test** — `apps/web/src/rewards/reward-store.test.ts`

```ts
import { afterEach, describe, expect, test, vi } from 'vitest'
import { createRewardStore, REWARD_LIFETIME_MS } from './reward-store'

afterEach(() => vi.useRealTimers())

describe('reward store', () => {
  test('push stamps an id and the time, notifies, and each event expires 1.6s after it', () => {
    vi.useFakeTimers({ now: 1000 })
    const store = createRewardStore()
    const listener = vi.fn()
    store.subscribe(listener)
    const a = store.push({ target: { kind: 'task', id: 't1' }, amounts: [25, 12] })
    expect(a).toEqual({ id: 1, target: { kind: 'task', id: 't1' }, amounts: [25, 12], at: 1000 })
    expect(store.get()).toEqual([a])
    vi.advanceTimersByTime(800)
    const b = store.push({ target: null, amounts: [] })
    vi.advanceTimersByTime(REWARD_LIFETIME_MS - 800 - 1)
    expect(store.get()).toEqual([a, b])
    vi.advanceTimersByTime(1)
    expect(store.get()).toEqual([b])
    vi.advanceTimersByTime(800)
    expect(store.get()).toEqual([])
    // Two pushes and two expiries.
    expect(listener).toHaveBeenCalledTimes(4)
  })

  test('get is stable between changes; unsubscribing stops notifications', () => {
    vi.useFakeTimers()
    const store = createRewardStore()
    const first = store.get()
    expect(store.get()).toBe(first)
    const listener = vi.fn()
    const stop = store.subscribe(listener)
    store.push({ target: null, amounts: [5] })
    const second = store.get()
    expect(second).not.toBe(first)
    expect(store.get()).toBe(second)
    stop()
    store.push({ target: null, amounts: [5] })
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
```

Run: `cd apps/web && bunx vitest run src/rewards/reward-store.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 2: Implement the store** — `apps/web/src/rewards/reward-store.ts`

```ts
/** Short-lived reward effects, handed from mutations to the scene without React state. */
export type RewardTarget = { kind: 'task' | 'building'; id: string }
export type RewardEvent = {
  id: number
  target: RewardTarget | null
  amounts: readonly number[]
  /** `Date.now()` when pushed. */
  at: number
}
export type RewardInput = Pick<RewardEvent, 'target' | 'amounts'>

export const REWARD_LIFETIME_MS = 1600

export type RewardStore = {
  get: () => readonly RewardEvent[]
  push: (input: RewardInput) => RewardEvent
  subscribe: (listener: () => void) => () => void
}

export function createRewardStore(now: () => number = () => Date.now()): RewardStore {
  let events: readonly RewardEvent[] = []
  let nextId = 0
  const listeners = new Set<() => void>()
  const notify = () => {
    for (const listener of [...listeners]) listener()
  }
  const prune = () => {
    const t = now()
    const alive = events.filter((e) => t - e.at < REWARD_LIFETIME_MS)
    if (alive.length === events.length) return
    events = alive
    notify()
  }
  return {
    get: () => events,
    push(input) {
      const event: RewardEvent = { ...input, id: ++nextId, at: now() }
      events = [...events, event]
      setTimeout(prune, REWARD_LIFETIME_MS)
      notify()
      return event
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
```

Run: `cd apps/web && bunx vitest run src/rewards/reward-store.test.ts` — Expected: PASS.

- [ ] **Step 3: Provider** — `apps/web/src/rewards/reward-context.tsx`

```tsx
import { createContext, type ReactNode, useContext, useState } from 'react'
import { createRewardStore, type RewardStore } from './reward-store'

const RewardContext = createContext<RewardStore | null>(null)

/** One store per app: mutations push into it, the scene and HUD read it. */
export function RewardProvider({ store, children }: { store?: RewardStore; children: ReactNode }) {
  const [value] = useState(() => store ?? createRewardStore())
  return <RewardContext.Provider value={value}>{children}</RewardContext.Provider>
}

export function useRewardStore(): RewardStore {
  const store = useContext(RewardContext)
  if (!store) throw new Error('useRewardStore must be used inside <RewardProvider>')
  return store
}
```

`apps/web/src/app/providers.tsx` becomes:

```tsx
import { type QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { Api } from '../api/api'
import { ApiProvider } from '../api/context'
import { RewardProvider } from '../rewards/reward-context'
import type { RewardStore } from '../rewards/reward-store'
import { ToastProvider } from './toast'

export function AppProviders({
  api,
  queryClient,
  rewards,
  children,
}: {
  api: Api
  queryClient: QueryClient
  /** Test seam: the store to share; a fresh one otherwise. */
  rewards?: RewardStore
  children: ReactNode
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <ApiProvider api={api}>
        <RewardProvider store={rewards}>
          <ToastProvider>{children}</ToastProvider>
        </RewardProvider>
      </ApiProvider>
    </QueryClientProvider>
  )
}
```

In `apps/web/src/test/render-app.tsx` add `import { createRewardStore } from '../rewards/reward-store'`, create `const rewards = createRewardStore()` next to `user`, pass `rewards={rewards}` to `AppProviders`, and return `{ router, queryClient, user, rewards }`.

- [ ] **Step 4: Failing producer tests** — `apps/web/src/rewards/producers.test.tsx`

```tsx
import type { TaskDto } from '@archipelago/shared'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, test, vi } from 'vitest'
import { ApiError } from '../api/api'
import { AppProviders } from '../app/providers'
import { createQueryClient } from '../app/query-client'
import { useClaimDaily } from '../economy/use-claim-daily'
import { usePlaceBuilding, useRemoveBuilding } from '../shop/use-shop-actions'
import { useAdvanceTask } from '../tasks/use-task-actions'
import {
  createFakeApi,
  fakeBuilding,
  fakeEntry,
  fakeMilestone,
  fakeProject,
  fakeTask,
} from '../test/fake-api'
import { useWorld } from '../world/use-world'
import { createRewardStore } from './reward-store'

function setup(status: TaskDto['status'] = 'doing') {
  const beta = fakeProject({ name: 'Beta' })
  const mvp = fakeMilestone({ projectId: beta.id })
  const task = fakeTask({ projectId: beta.id, milestoneId: mvp.id, size: 'M', status, plotX: 1 })
  const pine = fakeBuilding({ projectId: beta.id, type: 'pine', plotX: -1, plotY: 0 })
  const fake = createFakeApi({
    today: '2026-10-07',
    world: { projects: [beta], milestones: [mvp], tasks: [task], buildings: [pine] },
    ledger: status === 'done' ? [fakeEntry({ taskId: task.id, amount: 25 })] : [fakeEntry({ kind: 'daily_bonus', day: '2026-10-06', amount: 100 })],
  })
  const queryClient = createQueryClient(() => {}, false)
  const rewards = createRewardStore()
  const push = vi.spyOn(rewards, 'push')
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AppProviders api={fake.api} queryClient={queryClient} rewards={rewards}>
      {children}
    </AppProviders>
  )
  return { ...fake, beta, task, pine, queryClient, push, wrapper }
}

describe('reward producers', () => {
  test('completing a task pushes one event with the server amounts, after any refetch', async () => {
    const s = setup()
    const { result } = renderHook(() => ({ advance: useAdvanceTask(), world: useWorld() }), {
      wrapper: s.wrapper,
    })
    await waitFor(() => expect(result.current.world.data).toBeDefined())
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const complete = s.api.completeTask
    s.api.completeTask = async (id) => {
      await gate
      return complete(id)
    }
    act(() => result.current.advance.mutate(s.task))
    // A refetch that lands before the response must not replay or invent an effect.
    await act(() => s.queryClient.invalidateQueries({ queryKey: ['world'] }))
    expect(s.push).not.toHaveBeenCalled()
    await act(async () => release())
    await waitFor(() => expect(result.current.advance.isSuccess).toBe(true))
    expect(s.push).toHaveBeenCalledTimes(1)
    expect(s.push).toHaveBeenCalledWith({
      target: { kind: 'task', id: s.task.id },
      amounts: [25, 12],
    })
  })

  test('a reopen and a failed completion push nothing', async () => {
    const done = setup('done')
    const reopen = renderHook(() => useAdvanceTask(), { wrapper: done.wrapper })
    await act(async () => {
      await reopen.result.current.mutateAsync(done.task)
    })
    expect(done.push).not.toHaveBeenCalled()

    const failing = setup()
    failing.api.completeTask = async () => {
      throw new ApiError(409, 'conflict', 'Task is already done')
    }
    const fail = renderHook(() => useAdvanceTask(), { wrapper: failing.wrapper })
    await act(async () => {
      await fail.result.current.mutateAsync(failing.task).catch(() => {})
    })
    expect(failing.push).not.toHaveBeenCalled()
  })

  test('a placement pushes a pop with no amounts; removal and the daily claim push nothing', async () => {
    const s = setup()
    const { result } = renderHook(
      () => ({ place: usePlaceBuilding(), remove: useRemoveBuilding(), claim: useClaimDaily() }),
      { wrapper: s.wrapper },
    )
    let placedId = ''
    await act(async () => {
      const placed = await result.current.place.mutateAsync({
        projectId: s.beta.id,
        type: 'pine',
        plotX: 0,
        plotY: 1,
      })
      placedId = placed.building.id
    })
    expect(s.push).toHaveBeenCalledTimes(1)
    expect(s.push).toHaveBeenCalledWith({ target: { kind: 'building', id: placedId }, amounts: [] })
    await act(async () => {
      await result.current.remove.mutateAsync(s.pine.id)
      await result.current.claim.mutateAsync()
    })
    expect(s.push).toHaveBeenCalledTimes(1)
  })
})
```

(The ledger line in `setup` is longer than 100 columns; `bun run format` wraps it.)

Run: `cd apps/web && bunx vitest run src/rewards/producers.test.tsx` — Expected: FAIL (`push` never called for the completion and the placement).

- [ ] **Step 5: Push from the completion** — `apps/web/src/tasks/use-task-actions.ts`: import `useRewardStore` from `'../rewards/reward-context'`; inside `useWorldCache` add `const rewards = useRewardStore()` and extend `reward`:

```ts
    reward(result: AdvanceResult) {
      if (!('balance' in result)) return
      edit((w) => ({ ...w, economy: { ...w.economy, balance: result.balance } }))
      // Only the server's answer starts an effect; a refetch never does (spec 16.1).
      if ('rewards' in result) {
        rewards.push({
          target: { kind: 'task', id: result.task.id },
          amounts: result.rewards.map((r) => r.amount),
        })
      }
      const message =
        'rewards' in result ? formatRewards(result.rewards) : formatReversals(result.reversals)
      if (message) toast.show(message)
    },
```

- [ ] **Step 6: Push from the placement** — `apps/web/src/shop/use-shop-actions.ts`: import `useRewardStore`; in `usePlaceBuilding` add `const rewards = useRewardStore()` and, first thing in `onSuccess`:

```ts
      rewards.push({ target: { kind: 'building', id: building.id }, amounts: [] })
```

- [ ] **Step 7: Run tests**

Run: `cd apps/web && bunx vitest run src/rewards` — Expected: PASS.
Run: `cd apps/web && bunx vitest run` — Expected: PASS (every `renderApp` test now has a provider).

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/rewards apps/web/src/app/providers.tsx apps/web/src/test/render-app.tsx apps/web/src/tasks/use-task-actions.ts apps/web/src/shop/use-shop-actions.ts
git commit -m "feat(web): push reward events from task completion and placement responses"
```

---

### Task 3: Balance count-up

**Files:**
- Modify: `apps/web/src/test/viewport.ts` (listeners + a reduced-motion flag)
- Create: `apps/web/src/economy/use-count-up.ts`, `apps/web/src/economy/use-count-up.test.ts`
- Modify: `apps/web/src/economy/economy-bar.tsx`, `apps/web/src/economy/economy-bar.test.tsx`

**Interfaces:**
- Produces: `useCountUp(value: number, durationMs?: number): number` and `COUNT_UP_MS = 600` (`economy/use-count-up.ts`, no three).
- Produces (test helpers, `test/viewport.ts`): `setDesktop(value)` now also notifies `matchMedia` change listeners (wrap calls after render in `act`); new `setReducedMotion(value: boolean)`. Both reset to `false` after each test. Task 8 relies on the notifying `setDesktop`.

- [ ] **Step 1: Make the matchMedia mock live** — replace `apps/web/src/test/viewport.ts`:

```ts
import { afterEach } from 'vitest'

let desktop = false
let reducedMotion = false
const listeners = new Set<() => void>()

const notify = () => {
  for (const listener of [...listeners]) listener()
}

/** jsdom has no matchMedia; this mock answers `(min-width: 1024px)` from a test-controlled flag. */
export function setDesktop(value: boolean): void {
  desktop = value
  notify()
}

/** Answers `(prefers-reduced-motion: reduce)`. */
export function setReducedMotion(value: boolean): void {
  reducedMotion = value
  notify()
}

const answer = (query: string) => {
  if (query.includes('min-width: 1024px')) return desktop
  if (query.includes('prefers-reduced-motion: reduce')) return reducedMotion
  return false
}

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string): MediaQueryList => ({
    get matches() {
      return answer(query)
    },
    media: query,
    onchange: null,
    addEventListener: (_type: string, listener: EventListenerOrEventListenerObject | null) => {
      if (typeof listener === 'function') listeners.add(listener as () => void)
    },
    removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject | null) => {
      if (typeof listener === 'function') listeners.delete(listener as () => void)
    },
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
})

afterEach(() => {
  desktop = false
  reducedMotion = false
})
```

Run: `cd apps/web && bunx vitest run` — Expected: PASS (no behaviour change for existing tests).

- [ ] **Step 2: Failing hook test** — `apps/web/src/economy/use-count-up.test.ts`

```ts
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { setReducedMotion } from '../test/viewport'
import { useCountUp } from './use-count-up'

afterEach(() => vi.useRealTimers())
const fakeFrames = () =>
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
const mount = (v: number) => renderHook(({ v }) => useCountUp(v), { initialProps: { v } })

describe('useCountUp', () => {
  test('shows the first value at once, then eases to a new one over 600ms', () => {
    fakeFrames()
    const { result, rerender } = mount(10)
    expect(result.current).toBe(10)
    rerender({ v: 110 })
    expect(result.current).toBe(10)
    act(() => vi.advanceTimersByTime(300))
    expect(result.current).toBeGreaterThan(10)
    expect(result.current).toBeLessThan(110)
    act(() => vi.advanceTimersByTime(400))
    expect(result.current).toBe(110)
  })

  test('a new value mid-count continues from the number on screen', () => {
    fakeFrames()
    const { result, rerender } = mount(0)
    rerender({ v: 100 })
    act(() => vi.advanceTimersByTime(200))
    const mid = result.current
    expect(mid).toBeGreaterThan(0)
    rerender({ v: 0 })
    const seen: number[] = []
    for (let i = 0; i < 45; i++) {
      act(() => vi.advanceTimersByTime(16))
      seen.push(result.current)
    }
    // Downward from where it was: never back up toward 100, never a jump to 0.
    expect(Math.max(...seen)).toBeLessThanOrEqual(mid)
    expect(seen[0]).toBeGreaterThan(0)
    expect(seen.at(-1)).toBe(0)
  })

  test('reduced motion shows the new value at once', () => {
    setReducedMotion(true)
    const { result, rerender } = mount(10)
    rerender({ v: 110 })
    expect(result.current).toBe(110)
  })
})
```

Run: `cd apps/web && bunx vitest run src/economy/use-count-up.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `apps/web/src/economy/use-count-up.ts`

```ts
import { useEffect, useRef, useState } from 'react'
import { usePrefersReducedMotion } from '../scene/use-reduced-motion'

export const COUNT_UP_MS = 600

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3

/**
 * The number to display for `value`: eases from whatever is on screen to `value` with DOM animation
 * frames (not the scene's loop). Snaps under reduced motion.
 */
export function useCountUp(value: number, durationMs = COUNT_UP_MS): number {
  const reduced = usePrefersReducedMotion()
  const [shown, setShown] = useState(value)
  const onScreen = useRef(value)

  useEffect(() => {
    const from = onScreen.current
    if (reduced || from === value) {
      onScreen.current = value
      setShown(value)
      return
    }
    const start = performance.now()
    let frame = requestAnimationFrame(function step() {
      const t = Math.min(1, (performance.now() - start) / durationMs)
      const next = t >= 1 ? value : Math.round(from + (value - from) * easeOutCubic(t))
      onScreen.current = next
      setShown(next)
      if (t < 1) frame = requestAnimationFrame(step)
    })
    return () => cancelAnimationFrame(frame)
  }, [value, reduced, durationMs])

  return shown
}
```

Run: `cd apps/web && bunx vitest run src/economy/use-count-up.test.ts` — Expected: PASS.

- [ ] **Step 4: Failing chip test** — append to `describe('EconomyBar')` in `apps/web/src/economy/economy-bar.test.tsx` (import `setReducedMotion` from `'../test/viewport'`):

```ts
  test('the chip counts up to a new balance; its label states the true balance at once', async () => {
    const { api } = createFakeApi({ today: TODAY })
    const { user } = renderApp({ api, path: '/' })
    expect(await screen.findByLabelText('0 Supplies')).toHaveTextContent('◆ 0')
    await user.click(await screen.findByRole('button', { name: 'Claim +15' }))
    const chip = await screen.findByLabelText('15 Supplies')
    await waitFor(() => expect(chip).toHaveTextContent('◆ 15'))
  })

  test('under reduced motion the chip shows the new balance immediately', async () => {
    setReducedMotion(true)
    const { api } = createFakeApi({ today: TODAY })
    const { user } = renderApp({ api, path: '/' })
    await user.click(await screen.findByRole('button', { name: 'Claim +15' }))
    expect(await screen.findByLabelText('15 Supplies')).toHaveTextContent('◆ 15')
  })
```

The first test passes today (the chip shows the value directly); the second guards the snap. Both must still pass after Step 5.

- [ ] **Step 5: Wire the chip** — in `apps/web/src/economy/economy-bar.tsx` import `useCountUp` from `'./use-count-up'` and move the balance chip into its own component, mounted only once the world has loaded, so the first value shows at once instead of counting up from 0:

```tsx
function BalanceChip({ balance }: { balance: number }) {
  const shown = useCountUp(balance)
  return (
    <span
      role="img"
      aria-label={`${balance} Supplies`}
      className={`${pill} ${balance < 0 ? 'text-error' : 'text-text-primary'}`}
    >
      ◆ {shown}
    </span>
  )
}
```

and in `EconomyBar` replace the existing balance `<span role="img" …>◆ {balance}</span>` with `<BalanceChip balance={balance} />`.

- [ ] **Step 6: Run tests**

Run: `cd apps/web && bunx vitest run src/economy` — Expected: PASS.
Run: `cd apps/web && bunx vitest run` — Expected: PASS (every `findByLabelText('N Supplies')` still matches at once).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/test/viewport.ts apps/web/src/economy
git commit -m "feat(web): count the balance chip up to new values"
```

---

### Task 4: `scene/tuning.ts`, delta clamp and flight frame capture

**Files:**
- Create: `apps/web/src/scene/tuning.ts`, `apps/web/src/scene/tuning.test.ts`
- Modify: `apps/web/src/scene/world-contents.tsx`, `apps/web/src/scene/sea.tsx`, `apps/web/src/scene/crane-jibs.tsx`, `apps/web/src/scene/framing.tsx`, `apps/web/src/scene/camera-rig.tsx`
- Modify: `apps/web/src/scene/model/camera-motion.ts`, `apps/web/src/scene/model/indicators.ts`, `apps/web/src/world/edge-indicators.tsx`
- Test: `apps/web/src/scene/camera-rig.test.tsx`

**Interfaces:**
- Produces (`apps/web/src/scene/tuning.ts`, three-free): `HEMISPHERE_INTENSITY`, `DIRECTIONAL_INTENSITY`, `SEA_WAVE_HEIGHT`, `SEA_WAVE_SPEED`, `JIB_TURN_SPEED`, `FLY_MIN_MS`, `FLY_MAX_MS`, `SPRING_MS`, `FRAMING_MS`, `HOP_FILL`, `MS_PER_PX`, `PX_PER_DOUBLING`, `BAND_SHARE`, `INDICATOR_INSET`, `INDICATOR_SPACING`, `MARKER_SIZE_PX`, `MARKER_LOOK`, `MAX_FRAME_DELTA`, `clampDelta(delta: number): number`. Tasks 5 and 6 add their constants to this file.
- `camera-motion.ts` and `indicators.ts` keep re-exporting the names they exported before (`FLY_MIN_MS`, `FLY_MAX_MS`, `SPRING_MS`, `FRAMING_MS`, `INDICATOR_INSET`, `INDICATOR_SPACING`), so no importer changes.

- [ ] **Step 1: Failing tests** — `apps/web/src/scene/tuning.test.ts` pins the moved values (the move must not retune anything):

```ts
import { describe, expect, test } from 'vitest'
import * as tuning from './tuning'

describe('tuning', () => {
  test('carries the values shipped before 5b, unchanged', () => {
    expect(tuning.HEMISPHERE_INTENSITY).toBeCloseTo(Math.PI * 0.55)
    expect(tuning.DIRECTIONAL_INTENSITY).toBeCloseTo(Math.PI * 0.6)
    expect(tuning.SEA_WAVE_HEIGHT).toBe(0.05)
    expect(tuning.SEA_WAVE_SPEED).toBe(1)
    expect(tuning.JIB_TURN_SPEED).toBe(0.6)
    expect([tuning.FLY_MIN_MS, tuning.FLY_MAX_MS, tuning.SPRING_MS, tuning.FRAMING_MS]).toEqual([
      450, 900, 300, 250,
    ])
    expect([tuning.HOP_FILL, tuning.MS_PER_PX, tuning.PX_PER_DOUBLING]).toEqual([0.8, 0.5, 200])
    expect(tuning.BAND_SHARE).toBe(0.25)
    expect([tuning.INDICATOR_INSET, tuning.INDICATOR_SPACING, tuning.MARKER_SIZE_PX]).toEqual([
      28, 48, 44,
    ])
  })

  test('clampDelta caps a frame at 100ms', () => {
    expect(tuning.clampDelta(0.016)).toBe(0.016)
    expect(tuning.clampDelta(5)).toBe(0.1)
  })
})
```

In `apps/web/src/scene/camera-rig.test.tsx`:
- add `hopZoom` and `flyFrame` to the `./model/camera-motion` import;
- give `RigProps` an optional `covered?: number` and pass it through: `const scene = ({ model, focus, animate = true, covered = 0 }: RigProps) => (<><CameraRig model={model} focus={focus} animate={animate} covered={covered} /><Grab /></>)`;
- add a third island straight "down-screen" from Beta, so a hop is limited by the canvas height (which the sheet cover changes), not its width:

```ts
const delta = fakeProject({ name: 'Delta', archipelagoX: 0, archipelagoY: 3 })
const tall = buildSceneModel(worldOf([beta, delta]), today)
const onBeta: Focus = { kind: 'island', projectId: beta.id }
const onDelta: Focus = { kind: 'island', projectId: delta.id }
const canvas = { width: 400, height: 800, covered: 0, framed: 0 }
```

and append to `describe('CameraRig')`:

```ts
  test('a long first frame (a hidden tab) moves a flight by at most 100ms', async () => {
    const r = await mount({ model: both, focus: archipelago })
    const start = view()
    const goal = cameraTarget(both, onGamma)
    await r.update(scene({ model: both, focus: onGamma }))
    await r.advanceFrames(1, 5)
    expectView(view(), flyFrame(start, goal, 100 / flyDuration(start, goal), canvas))
  })

  test('a cover change mid-flight leaves the hop zoom alone', async () => {
    const from = cameraTarget(tall, onBeta)
    const to = cameraTarget(tall, onDelta)
    // Sanity: this hop is height-limited, so a recomputed frame would change it.
    expect(hopZoom(from, to, canvas)).not.toBeCloseTo(
      hopZoom(from, to, { ...canvas, covered: 600, framed: 384 }) ?? 0,
    )
    const fly = async (coverMidway: number) => {
      const r = await mount({ model: tall, focus: onBeta })
      await r.update(scene({ model: tall, focus: onDelta }))
      await r.advanceFrames(2, 0.1)
      await r.update(scene({ model: tall, focus: onDelta, covered: coverMidway }))
      await r.advanceFrames(2, 0.1)
      const v = view()
      await r.unmount()
      return v
    }
    const steady = await fly(0)
    const covered = await fly(600)
    expect(steady.zoom).toBeLessThan(ISLAND_ZOOM)
    expectView(covered, steady)
  })

  test('momentum that carries the camera past the edge after release springs back', async () => {
    const r = await mount({ model: both, focus: onGamma })
    const { maxX } = both.bounds
    const c = controls()
    c.dispatchEvent({ type: 'start' })
    const push = maxX - 1 - c.target.x
    c.target.x += push
    camera().position.x += push
    c.dispatchEvent({ type: 'change' })
    c.dispatchEvent({ type: 'end' })
    // Damping keeps moving the target after the finger lifts.
    for (const step of [2, 2, 2]) {
      c.target.x += step
      camera().position.x += step
      c.dispatchEvent({ type: 'change' })
    }
    expect(view().x).toBeGreaterThan(maxX)
    await r.advanceFrames(8, 0.1)
    expect(view().x).toBeCloseTo(maxX)
  })
```

- [ ] **Step 2: Run, expect failure**

Run: `cd apps/web && bunx vitest run src/scene/tuning.test.ts src/scene/camera-rig.test.tsx`
Expected: FAIL — `./tuning` missing; the long frame finishes the flight (view equals the goal); the covered flight's zoom differs. The momentum test may already pass: it pins existing behaviour.

- [ ] **Step 3: Create** `apps/web/src/scene/tuning.ts`

```ts
/**
 * Every value worth tuning on a real device (spec 16.5), with the values shipped in 4a–5a.
 * Three-free: the app shell imports the marker look from here.
 */

// Lights. Lambert divides by π; ×π lets a top face lit by both lights read near its token (§13.3).
export const HEMISPHERE_INTENSITY = Math.PI * 0.55
export const DIRECTIONAL_INTENSITY = Math.PI * 0.6

// Sea and cranes.
export const SEA_WAVE_HEIGHT = 0.05
/** How fast the wave pattern moves: 1 = one radian of phase per second. */
export const SEA_WAVE_SPEED = 1
/** Crane jib turn, radians per second. */
export const JIB_TURN_SPEED = 0.6

// Camera (spec §14).
export const FLY_MIN_MS = 450
export const FLY_MAX_MS = 900
export const SPRING_MS = 300
export const FRAMING_MS = 250
/** At the widest point of a hop, both endpoints sit inside this share of the visible area. */
export const HOP_FILL = 0.8
/** Flight time per pixel of on-screen travel, and the travel one zoom doubling counts as. */
export const MS_PER_PX = 0.5
export const PX_PER_DOUBLING = 200
/** The rubber band stretches at most this share of the visible short side. */
export const BAND_SHARE = 0.25

// Edge markers (spec §14.4).
export const INDICATOR_INSET = 28
export const INDICATOR_SPACING = 48
export const MARKER_SIZE_PX = 44
export const MARKER_LOOK = {
  overdue: { button: 'bg-error text-text-on-brand', arrow: 'border-l-error', words: 'overdue' },
  'due-soon': {
    button: 'bg-warning text-text-primary',
    arrow: 'border-l-warning',
    words: 'due soon',
  },
} as const

// Frames.
/** The longest step any animation takes in one frame, in seconds (spec 16.4). */
export const MAX_FRAME_DELTA = 0.1
export const clampDelta = (delta: number): number => Math.min(delta, MAX_FRAME_DELTA)
```

- [ ] **Step 4: Point the users at it**

- `scene/world-contents.tsx`: delete the two intensity constants and their comment; `import { DIRECTIONAL_INTENSITY, HEMISPHERE_INTENSITY } from './tuning'`.
- `scene/model/camera-motion.ts`: delete `FLY_MIN_MS`, `FLY_MAX_MS`, `SPRING_MS`, `FRAMING_MS`, `HOP_FILL`, `MS_PER_PX`, `PX_PER_DOUBLING` and their comments; add

```ts
import {
  BAND_SHARE,
  FLY_MAX_MS,
  FLY_MIN_MS,
  FRAMING_MS,
  HOP_FILL,
  MS_PER_PX,
  PX_PER_DOUBLING,
  SPRING_MS,
} from '../tuning'

export { FLY_MAX_MS, FLY_MIN_MS, FRAMING_MS, SPRING_MS }
```

  and in `bandLimit` return `(Math.min(width, height) * BAND_SHARE) / zoom` (the comment stays: a quarter of the visible short side).
- `scene/model/indicators.ts`: delete the two constants; `import { INDICATOR_INSET, INDICATOR_SPACING } from '../tuning'` and `export { INDICATOR_INSET, INDICATOR_SPACING }`.
- `world/edge-indicators.tsx`: delete the local `look`; `import { MARKER_LOOK, MARKER_SIZE_PX } from '../scene/tuning'`; use `const style = MARKER_LOOK[i.urgency]`, drop `h-11 w-11` from the button class and set `style={{ left: i.left, top: i.top, width: MARKER_SIZE_PX, height: MARKER_SIZE_PX }}`.

- [ ] **Step 5: Clamp every frame step**

`scene/sea.tsx` — import `clampDelta, SEA_WAVE_HEIGHT, SEA_WAVE_SPEED` from `./tuning`, delete the local `WAVE_HEIGHT`, add `useRef` to the React import, and drive the wave from clamped time instead of the clock:

```ts
  const time = useRef(0)
  useFrame((_, delta) => {
    if (!animate) return
    time.current += clampDelta(delta) * SEA_WAVE_SPEED
    const t = time.current
    const position = geometry.getAttribute('position')
    for (let i = 0; i < position.count; i++) {
      const x = rest[i * 3] ?? 0
      const z = rest[i * 3 + 2] ?? 0
      position.setY(
        i,
        SEA_LEVEL + SEA_WAVE_HEIGHT * Math.sin(x * 0.6 + t) * Math.cos(z * 0.6 + t * 0.8),
      )
    }
    position.needsUpdate = true
  })
```

`scene/crane-jibs.tsx` — import `clampDelta, JIB_TURN_SPEED` from `./tuning`; in `place` use `matrix.makeRotationY(time * JIB_TURN_SPEED + i * 1.7)`; replace the frame hook with

```ts
  const time = useRef(0)
  useFrame((_, delta) => {
    if (!animate) return
    time.current += clampDelta(delta)
    place(time.current)
  })
```

`scene/framing.tsx` — import `clampDelta` from `./tuning` and use `e.elapsed += clampDelta(delta) * 1000`.

`scene/camera-rig.tsx` — import `clampDelta` from `./tuning` and `type Frame` from `./model/screen`. Capture the frame at flight start:

```ts
type Motion =
  | { kind: 'idle' }
  | { kind: 'fly'; from: View; to: View; elapsed: number; duration: number; frame: Frame }
  | { kind: 'spring'; from: Point; to: Point; elapsed: number; duration: number }
```

In the route `useLayoutEffect`, `const { target: to, animate: smooth, frame: startFrame } = latest.current` and `motion.current = { kind: 'fly', from, to, elapsed: 0, duration, frame: startFrame }`. In `useFrame((_, delta) => …)` declare `const step = clampDelta(delta) * 1000` at the top, use `m.elapsed += step` in both the fly and spring branches, and `show(flyFrame(m.from, m.to, t, m.frame))` (a cover change mid-flight no longer moves the hop zoom).

- [ ] **Step 6: Run tests**

Run: `cd apps/web && bunx vitest run src/scene src/world` — Expected: PASS, including the existing camera, framing, indicator and edge-marker tests.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/scene apps/web/src/world/edge-indicators.tsx
git commit -m "refactor(web): gather scene tuning, clamp frame deltas and fix the flight frame at start"
```

---

### Task 5: Pop and floating "+N" in the scene

**Files:**
- Modify: `apps/web/src/scene/tuning.ts` (pop and float timings)
- Create: `apps/web/src/scene/model/reward-motion.ts`, `apps/web/src/scene/model/reward-motion.test.ts`
- Create: `apps/web/src/scene/reward-floats.tsx`
- Modify: `apps/web/src/scene/model-instances.tsx`, `apps/web/src/scene/island.tsx`, `apps/web/src/scene/world-contents.tsx`, `apps/web/src/scene/world-scene.tsx`, `apps/web/src/world/world-view.tsx`
- Test: `apps/web/src/scene/world-contents.test.tsx`

**Interfaces:**
- Consumes: `RewardEvent`, `RewardStore` (Task 2), `useRewardStore` (Task 2), `clampDelta` (Task 4).
- Produces (`scene/model/reward-motion.ts`, three-free):

```ts
export type Pop = { index: number; startedAt: number }
export function popScale(t: number): number // 0 → peak 1.15 → 1, t in 0…1
export function resolvePop(
  ids: readonly string[],
  kind: 'task' | 'building',
  events: readonly RewardEvent[],
): Pop | undefined
export type FloatFrame = { rise: number; opacity: number; visible: boolean }
export function floatFrame(elapsedMs: number, line: number): FloatFrame
export type FloatAnchor = { x: number; y: number; z: number }
export function floatAnchor(
  model: SceneModel,
  focus: Focus,
  target: RewardEvent['target'],
): FloatAnchor | null
```

- `ModelInstances` gains `pop?: Pop`. `startedAt` is the event's `at`: it identifies the pop (a new value restarts it); the animation's own clock starts when the instance first renders with it, so a pop that waits for the refetch still plays in full.
- `WorldContentsProps` gains `rewards: readonly RewardEvent[]`; `Island` gains `rewards: readonly RewardEvent[]`; `WorldSceneProps` gains `rewards: RewardStore`. Scene node name tests use: each float line is a group named `float`.

- [ ] **Step 1: Tuning values** — append to `apps/web/src/scene/tuning.ts`:

```ts
// Reward effects (spec 16.2).
export const POP_MS = 400
/** Ease-out-back overshoot constant that peaks the pop at 1.15. */
export const POP_BACK = 2.1645
export const FLOAT_RISE = 1.2
export const FLOAT_MS = 1400
export const FLOAT_STAGGER_MS = 150
/** Where a float starts, in world units above the land: over a structure, or over an island. */
export const FLOAT_ABOVE_STRUCTURE = 1.4
/** Clear of the island name label (drawn at 1.6). */
export const FLOAT_ABOVE_ISLAND = 2.4
```

- [ ] **Step 2: Failing model test** — `apps/web/src/scene/model/reward-motion.test.ts`

```ts
import type { WorldDto } from '@archipelago/shared'
import { describe, expect, test } from 'vitest'
import type { RewardEvent } from '../../rewards/reward-store'
import { fakeBuilding, fakeMilestone, fakeProject, fakeTask } from '../../test/fake-api'
import { FLOAT_ABOVE_ISLAND, FLOAT_ABOVE_STRUCTURE, FLOAT_RISE } from '../tuning'
import { hexToWorld, LAND_HEIGHT } from './hex-space'
import { floatAnchor, floatFrame, popScale, resolvePop } from './reward-motion'
import { buildSceneModel } from './scene-model'

const event = (target: RewardEvent['target'], at = 1, id = 1): RewardEvent => ({
  id,
  target,
  amounts: [25],
  at,
})

describe('popScale', () => {
  test('grows from 0, overshoots to 1.15 and settles at 1', () => {
    expect(popScale(0)).toBe(0)
    expect(popScale(1)).toBe(1)
    expect(popScale(2)).toBe(1)
    let peak = 0
    for (let i = 0; i <= 1000; i++) peak = Math.max(peak, popScale(i / 1000))
    expect(peak).toBeCloseTo(1.15, 2)
  })
})

describe('resolvePop', () => {
  test('finds the latest event aimed at one of the ids, by kind', () => {
    const events = [
      event({ kind: 'task', id: 'b' }, 10, 1),
      event({ kind: 'building', id: 'a' }, 20, 2),
      event({ kind: 'task', id: 'a' }, 30, 3),
    ]
    expect(resolvePop(['a', 'b'], 'task', events)).toEqual({ index: 0, startedAt: 30 })
    expect(resolvePop(['x', 'b'], 'task', events)).toEqual({ index: 1, startedAt: 10 })
    expect(resolvePop(['b'], 'building', events)).toBeUndefined()
    expect(resolvePop(['a'], 'task', [event(null)])).toBeUndefined()
  })
})

describe('floatFrame', () => {
  test('rises 1.2 and fades over 1.4s; later lines wait 150ms each', () => {
    expect(floatFrame(0, 0)).toEqual({ rise: 0, opacity: 1, visible: true })
    const mid = floatFrame(700, 0)
    expect(mid.rise).toBeGreaterThan(0)
    expect(mid.rise).toBeLessThan(FLOAT_RISE)
    expect(mid.opacity).toBeCloseTo(0.5)
    expect(floatFrame(1400, 0).visible).toBe(false)
    expect(floatFrame(100, 1).visible).toBe(false)
    expect(floatFrame(150, 1)).toEqual({ rise: 0, opacity: 1, visible: true })
    expect(floatFrame(1549, 1).visible).toBe(true)
    expect(floatFrame(1550, 1).visible).toBe(false)
  })
})

describe('floatAnchor', () => {
  const economy: WorldDto['economy'] = {
    balance: 0,
    streak: { days: 0, activeToday: false, next: null },
    daily: { amount: 15, claimedToday: false },
  }
  const beta = fakeProject({ archipelagoX: 0, archipelagoY: 0 })
  const gamma = fakeProject({ archipelagoX: 1, archipelagoY: 0 })
  const mvp = fakeMilestone({ projectId: beta.id })
  const task = fakeTask({ projectId: beta.id, milestoneId: mvp.id, plotX: 2, plotY: -1 })
  const pine = fakeBuilding({ projectId: beta.id, plotX: 0, plotY: 1 })
  const model = buildSceneModel(
    { projects: [beta, gamma], milestones: [mvp], tasks: [task], buildings: [pine], economy },
    '2026-10-07',
  )
  const betaIsland = model.islands[0]
  if (!betaIsland) throw new Error('no island')

  test('above the target when its island is focused, island or district view', () => {
    const at = hexToWorld({ q: 2, r: -1 })
    const above = {
      x: betaIsland.origin.x + at.x,
      y: LAND_HEIGHT + FLOAT_ABOVE_STRUCTURE,
      z: betaIsland.origin.z + at.z,
    }
    const target = { kind: 'task', id: task.id } as const
    expect(floatAnchor(model, { kind: 'island', projectId: beta.id }, target)).toEqual(above)
    expect(
      floatAnchor(model, { kind: 'district', projectId: beta.id, milestoneId: mvp.id }, target),
    ).toEqual(above)
    const p = hexToWorld({ q: 0, r: 1 })
    expect(
      floatAnchor(model, { kind: 'island', projectId: beta.id }, { kind: 'building', id: pine.id }),
    ).toEqual({ x: betaIsland.origin.x + p.x, y: LAND_HEIGHT + FLOAT_ABOVE_STRUCTURE, z: betaIsland.origin.z + p.z })
  })

  test('above the island centre in the archipelago or from another island', () => {
    const centre = {
      x: betaIsland.origin.x,
      y: LAND_HEIGHT + FLOAT_ABOVE_ISLAND,
      z: betaIsland.origin.z,
    }
    const target = { kind: 'task', id: task.id } as const
    expect(floatAnchor(model, { kind: 'archipelago' }, target)).toEqual(centre)
    expect(floatAnchor(model, { kind: 'island', projectId: gamma.id }, target)).toEqual(centre)
  })

  test('nothing for a missing target or none at all', () => {
    expect(floatAnchor(model, { kind: 'archipelago' }, { kind: 'task', id: 'gone' })).toBeNull()
    expect(floatAnchor(model, { kind: 'archipelago' }, null)).toBeNull()
  })
})
```

Run: `cd apps/web && bunx vitest run src/scene/model/reward-motion.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `apps/web/src/scene/model/reward-motion.ts`

```ts
import type { RewardEvent } from '../../rewards/reward-store'
import type { Focus } from '../../world/selectors'
import {
  FLOAT_ABOVE_ISLAND,
  FLOAT_ABOVE_STRUCTURE,
  FLOAT_MS,
  FLOAT_RISE,
  FLOAT_STAGGER_MS,
  POP_BACK,
} from '../tuning'
import { LAND_HEIGHT } from './hex-space'
import type { SceneModel } from './scene-model'

export type Pop = { index: number; startedAt: number }

/** Ease-out back, 0 → 1.15 → 1 (spec 16.2). */
export function popScale(t: number): number {
  if (t <= 0) return 0
  if (t >= 1) return 1
  const u = t - 1
  return 1 + (POP_BACK + 1) * u ** 3 + POP_BACK * u ** 2
}

/** The newest live event aimed at one of `ids` (instance order), as a pop of that instance. */
export function resolvePop(
  ids: readonly string[],
  kind: 'task' | 'building',
  events: readonly RewardEvent[],
): Pop | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]
    if (!e || e.target?.kind !== kind) continue
    const index = ids.indexOf(e.target.id)
    if (index >= 0) return { index, startedAt: e.at }
  }
  return undefined
}

export type FloatFrame = { rise: number; opacity: number; visible: boolean }

/** Line `line` of a float, `elapsedMs` after the float appeared: rising, fading, staggered. */
export function floatFrame(elapsedMs: number, line: number): FloatFrame {
  const t = (elapsedMs - line * FLOAT_STAGGER_MS) / FLOAT_MS
  if (t < 0) return { rise: 0, opacity: 0, visible: false }
  if (t >= 1) return { rise: FLOAT_RISE, opacity: 0, visible: false }
  return { rise: FLOAT_RISE * (1 - (1 - t) ** 2), opacity: 1 - t, visible: true }
}

export type FloatAnchor = { x: number; y: number; z: number }

/**
 * Where an event's floats start: above the target on its focused island, otherwise above that
 * island's centre; null when the target is not in the scene model.
 */
export function floatAnchor(
  model: SceneModel,
  focus: Focus,
  target: RewardEvent['target'],
): FloatAnchor | null {
  if (!target) return null
  for (const island of model.islands) {
    const spot =
      target.kind === 'task'
        ? island.structures.find((s) => s.taskId === target.id)?.position
        : island.decorations.find((d) => d.buildingId === target.id)?.position
    if (!spot) continue
    const focused = focus.kind !== 'archipelago' && focus.projectId === island.projectId
    return focused
      ? {
          x: island.origin.x + spot.x,
          y: LAND_HEIGHT + FLOAT_ABOVE_STRUCTURE,
          z: island.origin.z + spot.z,
        }
      : { x: island.origin.x, y: LAND_HEIGHT + FLOAT_ABOVE_ISLAND, z: island.origin.z }
  }
  return null
}
```

Run: `cd apps/web && bunx vitest run src/scene/model/reward-motion.test.ts` — Expected: PASS.

- [ ] **Step 4: Failing scene-graph tests** — in `apps/web/src/scene/world-contents.test.tsx`:

At the top (after the imports), stub drei's DOM overlay; the tests read the scene graph, and `Html` needs a real canvas parent:

```ts
vi.mock('@react-three/drei', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@react-three/drei')>()),
  Html: () => null,
}))
```

Widen `render`'s `extra` to `Partial<Pick<WorldContentsProps, 'selectedBuildingId' | 'placement' | 'rewards' | 'animate'>>` and pass `rewards={extra.rewards ?? []}` and `animate={extra.animate ?? false}` (replacing the fixed `animate={false}`). Add imports: `type RewardEvent` from `'../rewards/reward-store'`, `ModelInstances` from `'./model-instances'`. Append:

```ts
describe('reward effects', () => {
  const reward = (target: RewardEvent['target'], amounts: number[] = [25]): RewardEvent => ({
    id: 1,
    target,
    amounts,
    at: 5000,
  })
  const scaleOf = (node: Node, index: number) => {
    const m = new THREE.Matrix4()
    ;(node.instance as THREE.InstancedMesh).getMatrixAt(index, m)
    return new THREE.Vector3().setFromMatrixScale(m).y
  }
  const shippedOf = (s: ReturnType<typeof seeded>) => {
    const shipped = s.tasks[2]
    if (!shipped) throw new Error('no task')
    return shipped
  }

  test('a completed structure pops past 1 and settles at 1', async () => {
    const s = seeded()
    const { renderer } = await render(s.world, { kind: 'island', projectId: s.beta.id }, null, {
      animate: true,
      rewards: [reward({ kind: 'task', id: shippedOf(s).id })],
    })
    const hut = one(one(renderer.scene, `island:${s.beta.id}`), 'hut')
    expect(scaleOf(hut, 0)).toBeCloseTo(0)
    let peak = 0
    for (let i = 0; i < 10; i++) {
      await renderer.advanceFrames(1, 0.05)
      peak = Math.max(peak, scaleOf(hut, 0))
    }
    expect(peak).toBeGreaterThan(1.05)
    expect(scaleOf(hut, 0)).toBeCloseTo(1)
  })

  test('a placed decoration pops; its neighbours keep their size', async () => {
    const s = seeded()
    const pine = fakeBuilding({ projectId: s.beta.id, type: 'pine', plotX: 0, plotY: 1 })
    const other = fakeBuilding({ projectId: s.beta.id, type: 'pine', plotX: -1, plotY: 1 })
    const world = { ...s.world, buildings: [other, pine] }
    const { renderer } = await render(world, { kind: 'island', projectId: s.beta.id }, null, {
      animate: true,
      rewards: [reward({ kind: 'building', id: pine.id }, [])],
    })
    const pines = one(one(renderer.scene, `island:${s.beta.id}`), 'pine')
    expect(scaleOf(pines, 1)).toBeCloseTo(0)
    expect(scaleOf(pines, 0)).toBeCloseTo(1)
    await renderer.advanceFrames(10, 0.05)
    expect(scaleOf(pines, 1)).toBeCloseTo(1)
    // A pop carries no amounts, so no float.
    expect(named(renderer.scene, 'float')).toHaveLength(0)
  })

  test('a pop index past the instances is ignored', async () => {
    const points = [hexToWorld({ q: 0, r: 1 }), hexToWorld({ q: 1, r: 0 })]
    const renderer = await ReactThreeTestRenderer.create(
      <ModelInstances kind="pine" points={points} pop={{ index: 5, startedAt: 1 }} />,
    )
    await renderer.advanceFrames(3, 0.05)
    const mesh = one(renderer.scene, 'pine')
    expect(scaleOf(mesh, 0)).toBeCloseTo(1)
    expect(scaleOf(mesh, 1)).toBeCloseTo(1)
  })

  test('floats rise above the focused structure, one line per amount, then disappear', async () => {
    const s = seeded()
    const shipped = shippedOf(s)
    const { renderer } = await render(s.world, { kind: 'island', projectId: s.beta.id }, null, {
      animate: true,
      rewards: [reward({ kind: 'task', id: shipped.id }, [25, 12])],
    })
    const floats = named(renderer.scene, 'float').map((n) => n.instance as THREE.Group)
    expect(floats).toHaveLength(2)
    const [first, second] = floats
    if (!first || !second) throw new Error('no floats')
    const island = buildSceneModel(s.world, today).islands[0]
    const at = hexToWorld({ q: shipped.plotX, r: shipped.plotY })
    expect(first.position.x).toBeCloseTo((island?.origin.x ?? 0) + at.x)
    expect(first.position.z).toBeCloseTo((island?.origin.z ?? 0) + at.z)
    const startY = first.position.y
    await renderer.advanceFrames(1, 0.1)
    expect(first.visible).toBe(true)
    expect(first.position.y).toBeGreaterThan(startY)
    // The second line waits 150ms.
    expect(second.visible).toBe(false)
    await renderer.advanceFrames(20, 0.1)
    expect(first.visible).toBe(false)
    expect(second.visible).toBe(false)
  })

  test('a target outside the scene model shows no float', async () => {
    const s = seeded()
    const { renderer } = await render(s.world, { kind: 'archipelago' }, null, {
      animate: true,
      rewards: [reward({ kind: 'task', id: 'deleted' })],
    })
    expect(named(renderer.scene, 'float')).toHaveLength(0)
  })

  test('reduced motion shows neither the pop nor the float', async () => {
    const s = seeded()
    const { renderer } = await render(s.world, { kind: 'island', projectId: s.beta.id }, null, {
      animate: false,
      rewards: [reward({ kind: 'task', id: shippedOf(s).id })],
    })
    const hut = one(one(renderer.scene, `island:${s.beta.id}`), 'hut')
    expect(scaleOf(hut, 0)).toBeCloseTo(1)
    expect(named(renderer.scene, 'float')).toHaveLength(0)
  })
})
```

Run: `cd apps/web && bunx vitest run src/scene/world-contents.test.tsx` — Expected: FAIL (type errors on `rewards`/`pop`; no pops, no floats).

- [ ] **Step 5: Pop in ModelInstances** — `apps/web/src/scene/model-instances.tsx` becomes:

```tsx
import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'
import * as THREE from 'three'
import { solidMaterial } from './materials'
import { LAND_HEIGHT, type Point } from './model/hex-space'
import { type Pop, popScale } from './model/reward-motion'
import { type ModelKind, modelGeometry } from './models/structures'
import { onTap } from './tap'
import { clampDelta, POP_MS } from './tuning'

const matrix = new THREE.Matrix4()
const scale = new THREE.Vector3()

function compose(p: Point, turn: number, size: number) {
  matrix.makeRotationY(turn)
  if (size !== 1) matrix.scale(scale.setScalar(size))
  return matrix.setPosition(p.x, LAND_HEIGHT, p.z)
}

/**
 * One InstancedMesh drawing `kind` at every point; `onPick` receives the tapped point's index.
 * `pop` scales one instance 0 → 1.15 → 1; a new `startedAt` restarts it.
 */
export function ModelInstances({
  kind,
  points,
  turns,
  material = solidMaterial,
  pop,
  onPick,
}: {
  kind: ModelKind
  points: readonly Point[]
  /** Radians about y, one per point. */
  turns?: readonly number[]
  material?: THREE.Material
  pop?: Pop
  onPick?: (index: number) => void
}) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const invalidate = useThree((s) => s.invalidate)
  // The pop's own clock: it starts when the instance first renders with this pop.
  const popClock = useRef<{ startedAt: number; elapsed: number } | null>(null)
  const popIndex = pop?.index
  const popStartedAt = pop?.startedAt

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    if (popStartedAt === undefined) popClock.current = null
    else if (popClock.current?.startedAt !== popStartedAt) {
      popClock.current = { startedAt: popStartedAt, elapsed: 0 }
    }
    const clock = popClock.current
    points.forEach((p, i) => {
      const size = clock && i === popIndex ? popScale(clock.elapsed / POP_MS) : 1
      mesh.setMatrixAt(i, compose(p, turns?.[i] ?? 0, size))
    })
    mesh.instanceMatrix.needsUpdate = true
    // Raycasting tests against the instances' bounds, so they must follow the matrices.
    mesh.computeBoundingSphere()
    invalidate()
  }, [points, turns, popIndex, popStartedAt, invalidate])

  useFrame((_, delta) => {
    const mesh = ref.current
    const clock = popClock.current
    if (!mesh || !clock || popIndex === undefined || clock.elapsed >= POP_MS) return
    clock.elapsed = Math.min(POP_MS, clock.elapsed + clampDelta(delta) * 1000)
    // A refetch can shrink the layer under a running pop; a stale index is skipped.
    const p = points[popIndex]
    if (!p) return
    mesh.setMatrixAt(popIndex, compose(p, turns?.[popIndex] ?? 0, popScale(clock.elapsed / POP_MS)))
    mesh.instanceMatrix.needsUpdate = true
    if (clock.elapsed < POP_MS) invalidate()
  })

  if (points.length === 0) return null
  return (
    <instancedMesh
      // The instance count is fixed at construction; a new count needs a new mesh.
      key={points.length}
      ref={ref}
      name={kind}
      args={[modelGeometry(kind), material, points.length]}
      onClick={
        onPick
          ? onTap<MouseEvent>((event) => {
              if (event.instanceId !== undefined) onPick(event.instanceId)
            })
          : undefined
      }
    />
  )
}
```

- [ ] **Step 6: Floats** — `apps/web/src/scene/reward-floats.tsx`

```tsx
import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type * as THREE from 'three'
import type { RewardEvent } from '../rewards/reward-store'
import type { Focus } from '../world/selectors'
import { type FloatAnchor, floatAnchor, floatFrame } from './model/reward-motion'
import type { SceneModel } from './model/scene-model'
import { clampDelta } from './tuning'

/** Below the HUD (z-20), like the labels. */
const FLOAT_Z: [number, number] = [10, 0]
const pill =
  'pointer-events-none select-none whitespace-nowrap rounded-full bg-surface-primary px-2 py-0.5 text-sm font-semibold text-warning shadow'

/** One rising "+N" per amount of each live reward event (spec 16.2). */
export function RewardFloats({
  model,
  focus,
  events,
}: {
  model: SceneModel
  focus: Focus
  events: readonly RewardEvent[]
}) {
  return events.flatMap((event) => {
    const anchor = floatAnchor(model, focus, event.target)
    if (!anchor) return []
    return event.amounts.map((amount, line) => (
      <FloatLine key={`${event.id}:${line}`} anchor={anchor} amount={amount} line={line} />
    ))
  })
}

function FloatLine({ anchor, amount, line }: { anchor: FloatAnchor; amount: number; line: number }) {
  const group = useRef<THREE.Group>(null)
  const label = useRef<HTMLSpanElement>(null)
  const elapsed = useRef(0)

  useFrame((_, delta) => {
    elapsed.current += clampDelta(delta) * 1000
    const f = floatFrame(elapsed.current, line)
    const g = group.current
    if (g) {
      g.position.y = anchor.y + f.rise
      g.visible = f.visible
    }
    if (label.current) label.current.style.opacity = String(f.opacity)
  })

  return (
    <group ref={group} name="float" position={[anchor.x, anchor.y, anchor.z]} visible={false}>
      <Html center zIndexRange={FLOAT_Z}>
        <span ref={label} className={pill} style={{ opacity: 0 }}>
          +{amount}
        </span>
      </Html>
    </group>
  )
}
```

- [ ] **Step 7: Wire through the scene**

`scene/island.tsx`: add `import type { RewardEvent } from '../rewards/reward-store'`, `import { resolvePop } from './model/reward-motion'`, `import type { StructureKind } from './model/state'` (merge with the existing `STRUCTURE_KINDS` import); add the prop `rewards: readonly RewardEvent[]` (destructure it); above the component:

```ts
/** Only a newly finished building pops; scaffolds and cranes never do. */
const BUILT: ReadonlySet<StructureKind> = new Set(['hut', 'house', 'workshop'])
```

and pass pops to the structure and decoration layers:

```tsx
      {layers.byKind.map(({ kind, structures, points }) => (
        <ModelInstances
          key={kind}
          kind={kind}
          points={points}
          pop={
            animate && BUILT.has(kind)
              ? resolvePop(
                  structures.map((s) => s.taskId),
                  'task',
                  rewards,
                )
              : undefined
          }
          onPick={picker(structures)}
        />
      ))}
```

```tsx
      {decorationLayers.map(({ type, decorations, points, turns }) => (
        <ModelInstances
          key={type}
          kind={type}
          points={points}
          turns={turns}
          pop={
            animate
              ? resolvePop(
                  decorations.map((d) => d.buildingId),
                  'building',
                  rewards,
                )
              : undefined
          }
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
```

`scene/world-contents.tsx`: add `rewards: readonly RewardEvent[]` to `WorldContentsProps` (import the type), destructure it, pass `rewards={rewards}` to every `Island`, and render after the islands:

```tsx
      {animate && <RewardFloats model={model} focus={focus} events={rewards} />}
```

`scene/world-scene.tsx`: add `rewards: RewardStore` to `WorldSceneProps` (import the type from `'../rewards/reward-store'`), read the live events and hand them down:

```tsx
export function WorldScene(props: WorldSceneProps) {
  const animate = !usePrefersReducedMotion()
  const rewards = useSyncExternalStore(props.rewards.subscribe, props.rewards.get)
```

```tsx
      <WorldContents {...props} rewards={rewards} animate={animate} />
```

(add `useSyncExternalStore` to the React import).

`world/world-view.tsx`: `import { useRewardStore } from '../rewards/reward-context'`, `const rewards = useRewardStore()` next to `navigate`, and pass `rewards={rewards}` to `<WorldScene>`. The RTL stub scenes ignore it.

- [ ] **Step 8: Run tests**

Run: `cd apps/web && bunx vitest run src/scene` — Expected: PASS.
Run: `cd apps/web && bunx vitest run && bun run typecheck && bun run lint` — Expected: PASS / known info only.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/scene apps/web/src/world/world-view.tsx
git commit -m "feat(web): pop new buildings and float reward amounts in the scene"
```

---

### Task 6: Adaptive quality and the ticker on demand

**Files:**
- Modify: `apps/web/src/scene/tuning.ts` (quality constants)
- Create: `apps/web/src/scene/model/quality.ts`, `apps/web/src/scene/model/quality.test.ts`
- Create: `apps/web/src/scene/adaptive-quality.tsx`, `apps/web/src/scene/adaptive-quality.test.tsx`
- Modify: `apps/web/src/scene/ticker.ts`, `apps/web/src/scene/ticker.test.ts`
- Modify: `apps/web/src/scene/sea.tsx`, `apps/web/src/scene/world-contents.tsx`, `apps/web/src/scene/camera-rig.tsx`, `apps/web/src/scene/world-scene.tsx`
- Test: `apps/web/src/scene/camera-rig.test.tsx`

**Interfaces:**
- Consumes: `RewardStore` events in `WorldScene` (Task 5), `tuning.ts` (Task 4).
- Produces:
  - `scene/model/quality.ts`: `type Quality = 'high' | 'low'`, `type QualityState = { tier: Quality; settled: boolean; changes: number }`, `START_QUALITY: QualityState`, `type QualitySignal = 'decline' | 'incline'`, `nextQuality(state: QualityState, signal: QualitySignal): QualityState`, `qualityDpr(tier: Quality): number | [number, number]`.
  - `scene/ticker.ts`: `type TickerDemand = { animate: boolean; seaWave: boolean; cranes: boolean; effects: boolean; camera: boolean }`, `tickerWanted(d: TickerDemand): boolean`.
  - `scene/adaptive-quality.tsx`: `AdaptiveQuality({ tier, monitoring, onSignal })`.
  - `CameraRig` gains `onMotion?: (moving: boolean) => void`, called when a flight or spring starts or ends.
  - `WorldContentsProps` gains `seaWave?: boolean` (defaults to `animate`).
  - `WorldScene` keeps `quality` state; Task 7 reads `quality.tier`.

- [ ] **Step 1: Tuning** — append to `apps/web/src/scene/tuning.ts`:

```ts
// Adaptive quality (spec 16.3).
/**
 * fps below / above which the monitor declines / inclines. drei's defaults (40 / 60) assume a
 * continuous loop; this scene draws at the 33ms ticker, so they would decline every device.
 */
export const QUALITY_MONITOR_BOUNDS: [lower: number, upper: number] = [22, 28]
/** Real tier changes (high↔low) after which the tier settles on `low` for the page load. */
export const QUALITY_FLIPFLOPS = 3
```

- [ ] **Step 2: Failing unit tests**

`apps/web/src/scene/model/quality.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { QUALITY_FLIPFLOPS } from '../tuning'
import { nextQuality, qualityDpr, START_QUALITY } from './quality'

describe('quality', () => {
  test('starts high; decline lowers, incline raises', () => {
    expect(START_QUALITY).toEqual({ tier: 'high', settled: false, changes: 0 })
    const low = nextQuality(START_QUALITY, 'decline')
    expect(low).toEqual({ tier: 'low', settled: false, changes: 1 })
    expect(nextQuality(low, 'incline')).toEqual({ tier: 'high', settled: false, changes: 2 })
  })

  test('a signal that keeps the tier changes nothing and never settles', () => {
    let high = START_QUALITY
    for (let i = 0; i < 10; i++) high = nextQuality(high, 'incline')
    expect(high).toBe(START_QUALITY)
    const low = nextQuality(START_QUALITY, 'decline')
    let still = low
    for (let i = 0; i < 10; i++) still = nextQuality(still, 'decline')
    expect(still).toBe(low)
  })

  test('three real changes settle on low for good: a later incline is ignored', () => {
    expect(QUALITY_FLIPFLOPS).toBe(3)
    const once = nextQuality(START_QUALITY, 'decline')
    const twice = nextQuality(once, 'incline')
    const settled = nextQuality(twice, 'decline')
    expect(settled).toEqual({ tier: 'low', settled: true, changes: 3 })
    expect(nextQuality(settled, 'incline')).toBe(settled)
    expect(nextQuality(settled, 'decline')).toBe(settled)
  })

  test('high allows up to 2× DPR; low draws at 1×', () => {
    expect(qualityDpr('high')).toEqual([1, 2])
    expect(qualityDpr('low')).toBe(1)
  })
})
```

Append to `apps/web/src/scene/ticker.test.ts` (import `tickerWanted` and `type TickerDemand` from `./ticker`):

```ts
describe('tickerWanted', () => {
  const still: TickerDemand = {
    animate: true,
    seaWave: false,
    cranes: false,
    effects: false,
    camera: false,
  }

  test('runs while anything moves, each condition on its own', () => {
    expect(tickerWanted(still)).toBe(false)
    for (const key of ['seaWave', 'cranes', 'effects', 'camera'] as const) {
      expect(tickerWanted({ ...still, [key]: true })).toBe(true)
    }
  })

  test('never runs under reduced motion', () => {
    expect(
      tickerWanted({ animate: false, seaWave: true, cranes: true, effects: true, camera: true }),
    ).toBe(false)
  })
})
```

Run: `cd apps/web && bunx vitest run src/scene/model/quality.test.ts src/scene/ticker.test.ts` — Expected: FAIL (missing exports).

- [ ] **Step 3: Implement the pure parts**

`apps/web/src/scene/model/quality.ts`:

```ts
import { QUALITY_FLIPFLOPS } from '../tuning'

export type Quality = 'high' | 'low'
/**
 * `changes` counts real high↔low tier changes; once it reaches `QUALITY_FLIPFLOPS` the state is
 * `settled`: low for the rest of the page load.
 */
export type QualityState = { tier: Quality; settled: boolean; changes: number }
export type QualitySignal = 'decline' | 'incline'

export const START_QUALITY: QualityState = { tier: 'high', settled: false, changes: 0 }

/**
 * Settling is counted here rather than with drei's `flipflops`/`onFallback`: drei counts every
 * incline or decline call, so a healthy device repeatedly inclining at the ticker's 30fps would
 * fall back to low within seconds. Only a signal that actually changes the tier counts; any other
 * signal returns the same state object.
 */
export function nextQuality(state: QualityState, signal: QualitySignal): QualityState {
  if (state.settled) return state
  const tier: Quality = signal === 'decline' ? 'low' : 'high'
  if (tier === state.tier) return state
  const changes = state.changes + 1
  if (changes >= QUALITY_FLIPFLOPS) return { tier: 'low', settled: true, changes }
  return { tier, settled: false, changes }
}

export function qualityDpr(tier: Quality): number | [number, number] {
  return tier === 'high' ? [1, 2] : 1
}
```

Append to `apps/web/src/scene/ticker.ts`:

```ts
export type TickerDemand = {
  /** False under prefers-reduced-motion. */
  animate: boolean
  /** The sea wave is on (`high` tier). */
  seaWave: boolean
  /** A crane is in the scene (a `doing` task). */
  cranes: boolean
  /** A reward event is alive. */
  effects: boolean
  /** A camera flight or spring is running. */
  camera: boolean
}

/** The ticker runs only while something moves (spec 16.4); otherwise frames come on change. */
export function tickerWanted(d: TickerDemand): boolean {
  return d.animate && (d.seaWave || d.cranes || d.effects || d.camera)
}
```

Run: `cd apps/web && bunx vitest run src/scene/model/quality.test.ts src/scene/ticker.test.ts` — Expected: PASS.

- [ ] **Step 4: Failing scene tests**

`apps/web/src/scene/adaptive-quality.test.tsx`:

```tsx
import { useThree } from '@react-three/fiber'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import type * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { AdaptiveQuality } from './adaptive-quality'
import { SEA_LEVEL } from './models/terrain-geometry'
import { Sea } from './sea'

const grab: { dpr?: number } = {}
function Grab() {
  grab.dpr = useThree((s) => s.viewport.dpr)
  return null
}

const original = window.devicePixelRatio
beforeEach(() => Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 }))
afterEach(() =>
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: original }),
)

const bounds = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 }
const heights = (sea: THREE.Mesh) => {
  const position = sea.geometry.getAttribute('position')
  return Array.from({ length: position.count }, (_, i) => position.getY(i))
}

describe('adaptive quality', () => {
  test('the high tier allows 2× DPR; the low tier draws at 1×', async () => {
    const quality = (tier: 'high' | 'low') => (
      <>
        <AdaptiveQuality tier={tier} monitoring={false} onSignal={() => {}} />
        <Grab />
      </>
    )
    const r = await ReactThreeTestRenderer.create(quality('high'))
    expect(grab.dpr).toBe(2)
    await r.update(quality('low'))
    expect(grab.dpr).toBe(1)
  })

  test('the sea waves on high and lies flat when the wave is turned off', async () => {
    const sea = (animate: boolean) => <Sea bounds={bounds} animate={animate} onTapSea={() => {}} />
    const r = await ReactThreeTestRenderer.create(sea(true))
    await r.advanceFrames(3, 0.1)
    const mesh = r.scene.findAll((n) => n.props.name === 'sea')[0]?.instance as THREE.Mesh
    expect(heights(mesh).some((y) => Math.abs(y - SEA_LEVEL) > 1e-3)).toBe(true)
    await r.update(sea(false))
    await r.advanceFrames(3, 0.1)
    expect(heights(mesh).every((y) => Math.abs(y - SEA_LEVEL) < 1e-9)).toBe(true)
  })
})
```

In `apps/web/src/scene/camera-rig.test.tsx`, give `RigProps` `onMotion?: (moving: boolean) => void`, pass it to `CameraRig` in `scene`, and append:

```ts
  test('reports when a flight starts and when it ends', async () => {
    const onMotion = vi.fn()
    const r = await mount({ model: both, focus: archipelago, onMotion })
    expect(onMotion).not.toHaveBeenCalled()
    await r.update(scene({ model: both, focus: onGamma, onMotion }))
    expect(onMotion).toHaveBeenLastCalledWith(true)
    await r.advanceFrames(20, 0.1)
    expect(onMotion).toHaveBeenLastCalledWith(false)
    expect(onMotion).toHaveBeenCalledTimes(2)
  })
```

Run: `cd apps/web && bunx vitest run src/scene/adaptive-quality.test.tsx src/scene/camera-rig.test.tsx`
Expected: FAIL (`./adaptive-quality` missing; the sea stays wavy; `onMotion` never called).

- [ ] **Step 5: AdaptiveQuality** — `apps/web/src/scene/adaptive-quality.tsx`

```tsx
import { PerformanceMonitor } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { type Quality, type QualitySignal, qualityDpr } from './model/quality'
import { QUALITY_MONITOR_BOUNDS } from './tuning'

const bounds = () => QUALITY_MONITOR_BOUNDS

/**
 * Applies the tier's DPR and, while the scene is drawing steadily, lets drei's monitor move the
 * tier (spec 16.3). The monitor samples rendered frames, so it is only mounted while the ticker
 * runs: sparse on-change frames would read as a slow device.
 */
export function AdaptiveQuality({
  tier,
  monitoring,
  onSignal,
}: {
  tier: Quality
  monitoring: boolean
  onSignal: (signal: QualitySignal) => void
}) {
  const setDpr = useThree((s) => s.setDpr)
  // The Canvas `dpr` prop sets the same value; this keeps the store in step when the tier changes.
  useEffect(() => {
    setDpr(qualityDpr(tier))
  }, [tier, setDpr])
  if (!monitoring) return null
  // No `flipflops`/`onFallback`: drei counts every signal as a flip-flop, so settling is counted
  // on real tier changes in `nextQuality` instead.
  return (
    <PerformanceMonitor
      bounds={bounds}
      onDecline={() => onSignal('decline')}
      onIncline={() => onSignal('incline')}
    />
  )
}
```

- [ ] **Step 6: Flatten the frozen sea** — in `apps/web/src/scene/sea.tsx` add `useThree` to the fiber import and `useLayoutEffect` to the React import, and after the `rest` memo:

```ts
  const invalidate = useThree((s) => s.invalidate)
  // Low tier (or reduced motion): the wave stops flat at sea level; the shallows ring is terrain.
  useLayoutEffect(() => {
    if (animate) return
    const position = geometry.getAttribute('position')
    ;(position.array as Float32Array).set(rest)
    position.needsUpdate = true
    invalidate()
  }, [animate, geometry, rest, invalidate])
```

In `apps/web/src/scene/world-contents.tsx` add `seaWave?: boolean` to `WorldContentsProps` (doc: "The sea wave runs; false on the low tier. Defaults to `animate`."), destructure `seaWave = animate`, and pass `animate={seaWave}` to `<Sea>`.

- [ ] **Step 7: Camera motion reports** — in `apps/web/src/scene/camera-rig.tsx` add `onMotion?: (moving: boolean) => void` to `CameraRigProps` and destructure it; after `const motion = useRef<Motion>(IDLE)`:

```ts
  const onMotionRef = useRef(onMotion)
  onMotionRef.current = onMotion
  // Every motion change goes through here, so the ticker hears when the camera starts and stops.
  const setMotion = useCallback((next: Motion) => {
    const was = motion.current.kind !== 'idle'
    motion.current = next
    const is = next.kind !== 'idle'
    if (was !== is) onMotionRef.current?.(is)
  }, [])
```

Replace every `motion.current = …` assignment in the file (route effect: two; `useFrame`: three; `onStart`: one) with `setMotion(…)`, and add `setMotion` to the dependency lists of `onStart` (the route effect keeps its biome-ignore).

- [ ] **Step 8: Wire WorldScene** — `apps/web/src/scene/world-scene.tsx` becomes:

```tsx
import { Canvas, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { RewardStore } from '../rewards/reward-store'
import type { Focus } from '../world/selectors'
import { AdaptiveQuality } from './adaptive-quality'
import { CameraRig, ISO_DISTANCE } from './camera-rig'
import { Framing } from './framing'
import { IndicatorProbe } from './indicator-probe'
import type { IndicatorStore } from './indicator-store'
import { Labels } from './labels'
import { ARCHIPELAGO_ZOOM } from './model/camera'
import type { IslandUrgency } from './model/indicators'
import { scenePalette } from './model/palette'
import { nextQuality, qualityDpr, START_QUALITY } from './model/quality'
import type { SceneModel } from './model/scene-model'
import { startTicker, tickerWanted } from './ticker'
import { usePrefersReducedMotion } from './use-reduced-motion'
import { type Placement, type SceneHandlers, WorldContents } from './world-contents'

export type WorldSceneProps = SceneHandlers & {
  model: SceneModel
  focus: Focus
  selectedTaskId: string | null
  selectedBuildingId: string | null
  placement: Placement | null
  coveredBottom: number
  anchor: string | null
  urgent: readonly IslandUrgency[]
  indicators: IndicatorStore
  rewards: RewardStore
}

function AnimationTicker({ enabled }: { enabled: boolean }) {
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => (enabled ? startTicker(() => invalidate()) : undefined), [enabled, invalidate])
  return null
}

/** The 3D world. Renders on demand; the ticker adds frames only while something moves. */
export function WorldScene(props: WorldSceneProps) {
  const animate = !usePrefersReducedMotion()
  const rewards = useSyncExternalStore(props.rewards.subscribe, props.rewards.get)
  const [quality, setQuality] = useState(START_QUALITY)
  const [cameraMoving, setCameraMoving] = useState(false)
  const cranes = useMemo(
    () => props.model.islands.some((i) => i.structures.some((s) => s.kind === 'crane')),
    [props.model],
  )
  const seaWave = animate && quality.tier === 'high'
  const ticking = tickerWanted({
    animate,
    seaWave,
    cranes,
    effects: rewards.length > 0,
    camera: cameraMoving,
  })
  return (
    <Canvas
      frameloop="demand"
      dpr={qualityDpr(quality.tier)}
      orthographic
      flat
      camera={{
        position: [ISO_DISTANCE, ISO_DISTANCE, ISO_DISTANCE],
        zoom: ARCHIPELAGO_ZOOM,
        near: 0.1,
        far: 2000,
      }}
      className="touch-none"
    >
      <color attach="background" args={[scenePalette.sea]} />
      <WorldContents {...props} rewards={rewards} animate={animate} seaWave={seaWave} />
      <Labels model={props.model} focus={props.focus} />
      <CameraRig
        model={props.model}
        focus={props.focus}
        covered={props.coveredBottom}
        anchor={props.anchor}
        animate={animate}
        onMotion={setCameraMoving}
      />
      <Framing covered={props.coveredBottom} animate={animate} />
      <IndicatorProbe
        model={props.model}
        urgent={props.urgent}
        currentProjectId={props.focus.kind === 'archipelago' ? null : props.focus.projectId}
        covered={props.coveredBottom}
        store={props.indicators}
      />
      <AdaptiveQuality
        tier={quality.tier}
        monitoring={ticking && !quality.settled}
        onSignal={(signal) => setQuality((q) => nextQuality(q, signal))}
      />
      <AnimationTicker enabled={ticking} />
    </Canvas>
  )
}
```

- [ ] **Step 9: Run tests**

Run: `cd apps/web && bunx vitest run src/scene` — Expected: PASS.
Run: `cd apps/web && bunx vitest run && bun run typecheck && bun run lint && bun run build` (build from the root) — Expected: PASS; `drei`'s `PerformanceMonitor` lands in the world-scene chunk only.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/scene
git commit -m "feat(web): adapt render quality to the device and tick only while something moves"
```

---

### Task 7: The `?perf` overlay

**Files:**
- Create: `apps/web/src/world/perf-flag.ts`, `apps/web/src/world/perf-flag.test.ts`
- Create: `apps/web/src/scene/perf-store.ts`, `apps/web/src/scene/perf-store.test.ts`
- Create: `apps/web/src/scene/perf-probe.tsx`, `apps/web/src/world/perf-overlay.tsx`
- Modify: `apps/web/src/scene/world-scene.tsx`, `apps/web/src/world/world-view.tsx`
- Test: `apps/web/src/layout/world-scene-integration.test.tsx`

**Interfaces:**
- Consumes: `quality.tier` in `WorldScene` (Task 6), `type Quality` (Task 6).
- Produces:
  - `world/perf-flag.ts`: `perfEnabled(): boolean` (reads `window.location.search` once per page load), `resetPerfFlag(): void` (test seam).
  - `scene/perf-store.ts` (three-free): `type PerfReading = { fps: number; calls: number; triangles: number; dpr: number; tier: Quality }`, `type PerfStore = { get(): PerfReading | null; set(r: PerfReading): void; subscribe(l: () => void): () => void }`, `createPerfStore(): PerfStore`.
  - `WorldSceneProps` gains `perf?: PerfStore | null`; `PerfProbe({ store, tier })` inside the Canvas; `PerfOverlay({ store })` over it (an `aside` named "Performance").

- [ ] **Step 1: Failing unit tests**

`apps/web/src/world/perf-flag.test.ts`:

```ts
import { afterEach, describe, expect, test } from 'vitest'
import { perfEnabled, resetPerfFlag } from './perf-flag'

afterEach(() => {
  window.history.replaceState(null, '', '/')
  resetPerfFlag()
})

const at = (search: string) => {
  window.history.replaceState(null, '', `/${search}`)
  resetPerfFlag()
  return perfEnabled()
}

describe('perfEnabled', () => {
  test('is on for a perf parameter, alone or among others', () => {
    expect(at('?perf')).toBe(true)
    expect(at('?perf=1')).toBe(true)
    expect(at('?x=1&perf')).toBe(true)
  })

  test('is off without it, including for look-alikes', () => {
    expect(at('')).toBe(false)
    expect(at('?perform')).toBe(false)
    expect(at('?x=perf')).toBe(false)
  })

  test('is read once per page load', () => {
    expect(at('?perf')).toBe(true)
    window.history.replaceState(null, '', '/')
    expect(perfEnabled()).toBe(true)
  })
})
```

`apps/web/src/scene/perf-store.test.ts`:

```ts
import { describe, expect, test, vi } from 'vitest'
import { createPerfStore } from './perf-store'

describe('perf store', () => {
  test('starts empty and notifies only when the reading changes', () => {
    const store = createPerfStore()
    expect(store.get()).toBeNull()
    const listener = vi.fn()
    store.subscribe(listener)
    const reading = { fps: 30, calls: 40, triangles: 9000, dpr: 2, tier: 'high' as const }
    store.set(reading)
    store.set({ ...reading })
    expect(listener).toHaveBeenCalledTimes(1)
    store.set({ ...reading, fps: 29 })
    expect(listener).toHaveBeenCalledTimes(2)
    expect(store.get()).toEqual({ ...reading, fps: 29 })
  })
})
```

Run: `cd apps/web && bunx vitest run src/world/perf-flag.test.ts src/scene/perf-store.test.ts` — Expected: FAIL (modules missing).

- [ ] **Step 2: Implement flag and store**

`apps/web/src/world/perf-flag.ts`:

```ts
let cached: boolean | null = null

/** True when the page was loaded with `?perf` (spec 16.5). Read once per page load. */
export function perfEnabled(): boolean {
  if (cached === null) cached = new URLSearchParams(window.location.search).has('perf')
  return cached
}

/** Test seam: forget the cached flag. */
export function resetPerfFlag(): void {
  cached = null
}
```

`apps/web/src/scene/perf-store.ts`:

```ts
import type { Quality } from './model/quality'

/** What the `?perf` overlay shows; written by the render loop, read by the DOM. */
export type PerfReading = { fps: number; calls: number; triangles: number; dpr: number; tier: Quality }

export type PerfStore = {
  get: () => PerfReading | null
  set: (next: PerfReading) => void
  subscribe: (listener: () => void) => () => void
}

const same = (a: PerfReading, b: PerfReading) =>
  a.fps === b.fps &&
  a.calls === b.calls &&
  a.triangles === b.triangles &&
  a.dpr === b.dpr &&
  a.tier === b.tier

export function createPerfStore(): PerfStore {
  let current: PerfReading | null = null
  const listeners = new Set<() => void>()
  return {
    get: () => current,
    set(next) {
      if (current && same(current, next)) return
      current = next
      for (const listener of [...listeners]) listener()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
```

Run: `cd apps/web && bunx vitest run src/world/perf-flag.test.ts src/scene/perf-store.test.ts` — Expected: PASS.

- [ ] **Step 3: Failing app test** — in `apps/web/src/layout/world-scene-integration.test.tsx` import `resetPerfFlag` from `'../world/perf-flag'` and append to the main `describe`:

```ts
  test('?perf shows the performance overlay; without it there is none', async () => {
    const { api } = seeded()
    renderApp({ api, path: '/' })
    await screen.findByTestId('scene')
    expect(screen.queryByRole('complementary', { name: 'Performance' })).toBeNull()
    cleanup()
    window.history.replaceState(null, '', '/?perf')
    resetPerfFlag()
    try {
      renderApp({ api, path: '/' })
      const overlay = await screen.findByRole('complementary', { name: 'Performance' })
      // The stub scene renders no frames, so the overlay is still waiting.
      expect(overlay).toHaveTextContent('Waiting for frames')
    } finally {
      window.history.replaceState(null, '', '/')
      resetPerfFlag()
    }
  })
```

Run: `cd apps/web && bunx vitest run src/layout/world-scene-integration.test.tsx` — Expected: FAIL (no overlay).

- [ ] **Step 4: Probe and overlay**

`apps/web/src/scene/perf-probe.tsx`:

```tsx
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Quality } from './model/quality'
import type { PerfStore } from './perf-store'

/** Samples each rendered frame for the `?perf` overlay: fps over the last second, draw stats. */
export function PerfProbe({ store, tier }: { store: PerfStore; tier: Quality }) {
  const frames = useRef<number[]>([])
  useFrame(({ gl, viewport }) => {
    const now = performance.now()
    const recent = frames.current
    recent.push(now)
    while ((recent[0] ?? now) <= now - 1000) recent.shift()
    // info.render is reset at the start of each render, so this is the previous frame's count.
    store.set({
      fps: recent.length,
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      dpr: viewport.dpr,
      tier,
    })
  })
  return null
}
```

`apps/web/src/world/perf-overlay.tsx`:

```tsx
import { useSyncExternalStore } from 'react'
import type { PerfStore } from '../scene/perf-store'

/** The `?perf` corner panel (spec 16.5). */
export function PerfOverlay({ store }: { store: PerfStore }) {
  const r = useSyncExternalStore(store.subscribe, store.get, store.get)
  return (
    <aside
      aria-label="Performance"
      className="pointer-events-none absolute top-2 right-2 z-30 rounded-md bg-text-primary/80 px-2 py-1 font-mono text-xs leading-5 text-text-on-brand"
    >
      {r ? (
        <>
          <p>
            {r.fps} fps · {r.tier}
          </p>
          <p>
            {r.calls} calls · {r.triangles} tris
          </p>
          <p>dpr {r.dpr}</p>
        </>
      ) : (
        <p>Waiting for frames</p>
      )}
    </aside>
  )
}
```

`scene/world-scene.tsx`: add `perf?: PerfStore | null` to `WorldSceneProps` (import the type from `'./perf-store'`, and `PerfProbe` from `'./perf-probe'`) and render, after `AnimationTicker`:

```tsx
      {props.perf && <PerfProbe store={props.perf} tier={quality.tier} />}
```

`world/world-view.tsx`: import `createPerfStore` from `'../scene/perf-store'`, `perfEnabled` from `'./perf-flag'` and `PerfOverlay` from `'./perf-overlay'`; next to the indicator store:

```ts
  // Without `?perf` nothing is created, sampled or drawn.
  const [perf] = useState(() => (perfEnabled() ? createPerfStore() : null))
```

pass `perf={perf}` to `<WorldScene>`, and render `{perf && <PerfOverlay store={perf} />}` after `<EdgeIndicatorLayer …/>`.

- [ ] **Step 5: Run tests**

Run: `cd apps/web && bunx vitest run` — Expected: PASS.
Run: `bun run typecheck && bun run lint && bun run build` (root) — Expected: PASS; the overlay and flag are in the app chunk, the probe in the world-scene chunk.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/world apps/web/src/scene apps/web/src/layout/world-scene-integration.test.tsx
git commit -m "feat(web): add the ?perf overlay with fps, tier, draw calls and DPR"
```

---

### Task 8: Sheet, editor dialog and resize-handle carry-overs

**Files:**
- Modify: `apps/web/src/layout/panel-frame.tsx`
- Modify: `apps/web/src/editors/editor-frame.tsx`, `apps/web/src/editors/project-form.tsx`, `apps/web/src/editors/milestone-form.tsx`, `apps/web/src/editors/task-form.tsx`
- Create: `apps/web/src/editors/editor-frame.test.tsx`
- Test: `apps/web/src/layout/world-screen.test.tsx`, `apps/web/src/layout/world-scene-integration.test.tsx`

**Interfaces:**
- Consumes: the notifying `setDesktop` (Task 3).
- Produces: both resize handles have `role="separator"`; tests find them with `getByRole('separator', { name: 'Resize task sheet' | 'Resize task panel' })`. The phone sheet's accessory wrapper carries `data-testid="sheet-accessory"`.

Already in the code (verify, do not redo): the sheet's `dragged` flag is cleared on the next `pointerdown` (no microtask) and a `pointercancel` restores the previous detent — both pinned by the existing "sheet dragging" tests in `world-screen.test.tsx`. This task removes the dead `_event`/`MouseEvent` parameter, adds the separator ARIA, and clamps the tallest detent (spec 16.6 "Switcher strip").

- [ ] **Step 1: Point the existing tests at the separator role**

```bash
sed -i "s/getByRole('button', { name: 'Resize task sheet' })/getByRole('separator', { name: 'Resize task sheet' })/; s/getByRole('button', { name: 'Resize task panel' })/getByRole('separator', { name: 'Resize task panel' })/" apps/web/src/layout/world-screen.test.tsx apps/web/src/layout/world-scene-integration.test.tsx
```

(`sed -i` without `g` replaces the first match per line, which is every match: one per line.)

- [ ] **Step 2: Failing sheet tests** — append inside `describe('sheet dragging')` in `apps/web/src/layout/world-screen.test.tsx`:

```ts
    test('the handles are separators that state their value', async () => {
      const { api } = seeded()
      renderApp({ api, path: '/' })
      const handle = await screen.findByRole('separator', { name: 'Resize task sheet' })
      expect(handle).toHaveAttribute('aria-orientation', 'horizontal')
      expect(handle).toHaveAttribute('aria-valuemin', '0')
      expect(handle).toHaveAttribute('aria-valuemax', '2')
      expect(handle).toHaveAttribute('aria-valuenow', '1')
      fireEvent.keyDown(handle, { key: 'ArrowUp' })
      expect(handle).toHaveAttribute('aria-valuenow', '2')
    })

    test('desktop: the panel handle states its width in px', async () => {
      const { api } = seeded()
      renderApp({ api, path: '/', desktop: true })
      const handle = await screen.findByRole('separator', { name: 'Resize task panel' })
      expect(handle).toHaveAttribute('aria-orientation', 'vertical')
      expect(handle).toHaveAttribute('aria-valuemin', '320')
      expect(handle).toHaveAttribute('aria-valuemax', '640')
      expect(handle).toHaveAttribute('aria-valuenow', '400')
      fireEvent.keyDown(handle, { key: 'ArrowLeft' })
      expect(handle).toHaveAttribute('aria-valuenow', '416')
    })

    test('on a short phone the tallest detent leaves the strip above it on screen', async () => {
      setHeight(700)
      const measured = vi
        .spyOn(HTMLElement.prototype, 'offsetHeight', 'get')
        .mockImplementation(function (this: HTMLElement) {
          return this.dataset.testid === 'sheet-accessory' ? 72 : 0
        })
      try {
        const { api } = seeded()
        renderApp({ api, path: '/' })
        const sheet = await screen.findByTestId('task-sheet')
        fireEvent.keyDown(screen.getByRole('separator', { name: 'Resize task sheet' }), {
          key: 'ArrowUp',
        })
        expect(sheet).toHaveAttribute('data-detent', '2')
        // 92% of 700 is 644px; with a 72px strip on top that would leave the strip 16px off screen.
        expect(sheet.style.height).toBe('628px')
        setHeight(1000)
        fireEvent(window, new Event('resize'))
        await waitFor(() => expect(sheet.style.height).toBe('92dvh'))
      } finally {
        measured.mockRestore()
      }
    })
```

Run: `cd apps/web && bunx vitest run src/layout/world-screen.test.tsx`
Expected: FAIL — no `separator` role (every sheet test now fails to find its handle), and the tall detent is `92dvh`.

- [ ] **Step 3: Implement in `apps/web/src/layout/panel-frame.tsx`**

- Drop `type MouseEvent` from the React import.
- Below `DETENTS` add:

```ts
const TOP = DETENTS.length - 1

/**
 * A detent's height in px. On a short phone the tallest one gives way so the strip riding on top
 * of the sheet stays inside the viewport.
 */
function detentPx(index: number, vh: number, strip: number): number {
  const px = DETENTS[index]?.px(vh) ?? 0
  return index === TOP ? Math.min(px, vh - strip) : px
}
```

- In `MobileSheet`, the cover effect becomes `onCoverChange?.(Math.round(detentPx(detent, windowHeight, stripHeight) + stripHeight))`.
- In `onPointerDown`: `const startHeight = measured > 0 ? measured : detentPx(detent, window.innerHeight, stripHeight)`, `const maxHeight = () => detentPx(TOP, window.innerHeight, stripHeight)`, and in the snap loop compare `detentPx(i, vh, stripHeight)` with `detentPx(nearest, vh, stripHeight)` instead of `d.px(vh)` / `best.px(vh)`:

```ts
        let nearest = 0
        const vh = window.innerHeight
        DETENTS.forEach((_, i) => {
          const gap = Math.abs(detentPx(i, vh, stripHeight) - height)
          if (gap < Math.abs(detentPx(nearest, vh, stripHeight) - height)) nearest = i
        })
        setDetent(nearest)
```

- `const onClick = () => {` (the dead parameter goes).
- The resting height: before the `return`,

```ts
  const topPx = detentPx(TOP, windowHeight, stripHeight)
  const resting =
    detent === TOP && topPx < (DETENTS[TOP]?.px(windowHeight) ?? 0)
      ? `${Math.round(topPx)}px`
      : DETENTS[detent]?.label
```

  and `style={{ height: dragHeight ?? resting }}`.
- The accessory wrapper: `<div ref={stripRef} data-testid="sheet-accessory" className="absolute inset-x-0 bottom-full">`.
- The sheet handle gains:

```tsx
        role="separator"
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={TOP}
        aria-valuenow={detent}
```

- The desktop handle gains:

```tsx
        role="separator"
        aria-orientation="vertical"
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={MAX_WIDTH}
        aria-valuenow={width}
```

Run: `cd apps/web && bunx vitest run src/layout` — Expected: PASS (all old sheet tests included).

- [ ] **Step 4: Failing editor tests** — `apps/web/src/editors/editor-frame.test.tsx`

```tsx
import { act, render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { setDesktop } from '../test/viewport'
import { EditorFrame } from './editor-frame'

const ui = (
  <EditorFrame title="Edit island" onClose={() => {}}>
    <label>
      Name
      <input />
    </label>
  </EditorFrame>
)

describe('EditorFrame', () => {
  test('crossing the breakpoint while open re-opens the editor in the new layout', () => {
    setDesktop(true)
    const { baseElement } = render(ui)
    const dialog = () => baseElement.querySelector('dialog')
    expect(dialog()).toHaveAttribute('open')
    expect(dialog()).not.toHaveClass('relative')
    act(() => setDesktop(false))
    expect(dialog()).toBeNull()
    expect(screen.getByTestId('editor-sheet')).toBeInTheDocument()
    act(() => setDesktop(true))
    expect(dialog()).toHaveAttribute('open')
    expect(screen.getByLabelText('Name')).toHaveFocus()
  })

  test('the phone sheet does not focus a field (no keyboard pops up on open)', () => {
    render(ui)
    expect(screen.getByTestId('editor-sheet')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).not.toHaveFocus()
  })
})
```

Add to `apps/web/src/editors/forms.test.tsx`, inside `describe('editors')`:

```ts
  test('phone: opening a form does not focus its first field', async () => {
    const { api } = seeded()
    const { user } = renderApp({ api, path: '/' })
    await user.click(await screen.findByRole('button', { name: 'New island' }))
    await screen.findByTestId('editor-sheet')
    expect(screen.getByLabelText('Name')).not.toHaveFocus()
  })
```

Run: `cd apps/web && bunx vitest run src/editors` — Expected: FAIL (the dialog stays closed after the round trip; it has `relative`; the phone form's `autoFocus` focuses Name).

- [ ] **Step 5: Implement**

`apps/web/src/editors/editor-frame.tsx` — the effect re-runs per layout, and the class loses `relative`:

```tsx
  // Each layout mounts its own element: a new <dialog> needs showModal again (spec 16.6). Only the
  // desktop dialog moves focus to the first field; on a phone that would pop the keyboard.
  useEffect(() => {
    const dialog = dialogRef.current
    if (!isDesktop || !dialog) return
    if (!dialog.open) dialog.showModal()
    dialog.querySelector<HTMLElement>('input, textarea, select')?.focus()
    return () => {
      if (dialog.open) dialog.close()
    }
  }, [isDesktop])
```

```tsx
        className="m-auto w-full max-w-lg rounded-lg bg-surface-primary p-6 shadow-xl backdrop:bg-text-primary/40"
```

In `project-form.tsx`, `milestone-form.tsx` and `task-form.tsx` delete the `autoFocus` attribute and the `// biome-ignore lint/a11y/noAutofocus: …` comment above it; the desktop dialog's effect focuses the first field.

- [ ] **Step 6: Run tests**

Run: `cd apps/web && bunx vitest run` — Expected: PASS (including "desktop editor is a modal dialog and focuses the first field").
Run: `bun run typecheck && bun run lint` — Expected: PASS / known info only.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/layout apps/web/src/editors
git commit -m "fix(web): separator ARIA on resize handles, a viewport-safe tall sheet and a breakpoint-proof editor"
```

---

### Task 9: HUD carry-overs — markers clear the HUD, streak popover

**Files:**
- Modify: `apps/web/src/scene/model/indicators.ts`, `apps/web/src/scene/model/indicators.test.ts`
- Modify: `apps/web/src/scene/indicator-probe.tsx`, `apps/web/src/scene/world-scene.tsx`
- Modify: `apps/web/src/world/world-hud.tsx`, `apps/web/src/world/world-view.tsx`
- Modify: `apps/web/src/economy/economy-bar.tsx`, `apps/web/src/economy/economy-bar.test.tsx`
- Test: `apps/web/src/layout/world-scene-integration.test.tsx`

**Interfaces:**
- Produces: `edgeIndicators(islands, view, frame, topInset = 0)`; `IndicatorProbe` gains `topInset: number`; `WorldSceneProps` gains `hudInset: number`; `WorldHud` gains `onHeight?: (px: number) => void` and its root carries `data-testid="world-hud"`.

- [ ] **Step 1: Failing marker test** — append to `describe('edgeIndicators')` in `apps/web/src/scene/model/indicators.test.ts`:

```ts
  test('a top inset moves the top edge below the HUD chips', () => {
    const up = edgeIndicators([islandAt(0, -1000)], view, frame, 60)[0]
    expect(up).toMatchObject({ left: 200, top: INDICATOR_INSET + 60 })
    // Other edges are untouched.
    const down = edgeIndicators([islandAt(0, 1000)], view, frame, 60)[0]
    expect(down).toMatchObject({ top: 800 - INDICATOR_INSET })
  })
```

In `apps/web/src/layout/world-scene-integration.test.tsx` add `hudInset` to the stub's destructured props and `data-hud-inset={hudInset}` to its root `div`, then append:

```ts
  test('the scene learns the HUD height, so edge markers can sit below it', async () => {
    const measured = vi
      .spyOn(HTMLElement.prototype, 'offsetHeight', 'get')
      .mockImplementation(function (this: HTMLElement) {
        return this.dataset.testid === 'world-hud' ? 68 : 0
      })
    try {
      const { api } = seeded()
      renderApp({ api, path: '/' })
      const scene = await screen.findByTestId('scene')
      await waitFor(() => expect(scene).toHaveAttribute('data-hud-inset', '68'))
    } finally {
      measured.mockRestore()
    }
  })
```

Run: `cd apps/web && bunx vitest run src/scene/model/indicators.test.ts src/layout/world-scene-integration.test.tsx`
Expected: FAIL (the top marker sits at 28; `data-hud-inset` is empty).

- [ ] **Step 2: Implement the inset**

`scene/model/indicators.ts` — the signature and rectangle:

```ts
export function edgeIndicators(
  islands: readonly UrgentIsland[],
  view: View,
  frame: Frame,
  /** Canvas px the HUD chips cover at the top (spec 16.6). */
  topInset = 0,
): EdgeIndicator[] {
```

```ts
  const rect: Rect = {
    left: INDICATOR_INSET,
    top: INDICATOR_INSET + topInset,
    right: visible.width - INDICATOR_INSET,
    bottom: visible.height - INDICATOR_INSET,
  }
```

`scene/indicator-probe.tsx` — add the prop `topInset: number`, add it to the re-check effect's dependency list (`[urgent, currentProjectId, covered, topInset, invalidate]`), and call `store.set(edgeIndicators(islands, view, frame, topInset))`. Update the `probe` helper in `framing-and-indicators.test.tsx` to pass `topInset={0}`.

`scene/world-scene.tsx` — add `hudInset: number` to `WorldSceneProps` and pass `topInset={props.hudInset}` to `IndicatorProbe`.

`world/world-hud.tsx` — measure and report the chip area's height:

```tsx
import { Link } from '@tanstack/react-router'
import { useLayoutEffect, useRef } from 'react'
```

add the prop `onHeight?: (px: number) => void`, and in the component:

```tsx
  const root = useRef<HTMLDivElement>(null)
  const report = useRef(onHeight)
  report.current = onHeight
  // Edge markers keep below the chips (spec 16.6); the chips wrap, so follow their real height.
  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    report.current?.(el.offsetHeight)
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => report.current?.(el.offsetHeight))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
```

with `ref={root}` and `data-testid="world-hud"` on the root `div`.

`world/world-view.tsx` — `const [hudHeight, setHudHeight] = useState(0)`; pass `onHeight={setHudHeight}` to `WorldHud` and `hudInset={hudHeight}` to `WorldScene`.

Run: `cd apps/web && bunx vitest run src/scene src/layout` — Expected: PASS.

- [ ] **Step 3: Failing streak tests** — append to `describe('EconomyBar')` in `apps/web/src/economy/economy-bar.test.tsx`:

```ts
  test('tapping the streak chip shows the next bonus; tapping again hides it', async () => {
    const { api } = createFakeApi({ today: TODAY, ledger: [fakeEntry({ day: TODAY })] })
    const { user } = renderApp({ api, path: '/' })
    const chip = await screen.findByRole('button', { name: '1-day streak' })
    expect(chip).toHaveAttribute('aria-expanded', 'false')
    expect(chip).toHaveAttribute('title', 'Next bonus at 3 days: +20')
    await user.click(chip)
    expect(chip).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Next bonus at 3 days: +20')).toBeVisible()
    await user.click(chip)
    expect(screen.queryByText('Next bonus at 3 days: +20')).toBeNull()
  })

  test('past the last bonus the popover says the top bonus is reached', async () => {
    const ledger = Array.from({ length: 30 }, (_, i) => fakeEntry({ day: addDays(TODAY, -i) }))
    const { api } = createFakeApi({ today: TODAY, ledger })
    const { user } = renderApp({ api, path: '/' })
    await user.click(await screen.findByRole('button', { name: '30-day streak' }))
    expect(screen.getByText('Top streak bonus reached')).toBeInTheDocument()
  })
```

Run: `cd apps/web && bunx vitest run src/economy/economy-bar.test.tsx` — Expected: FAIL (the chip is an `img`, not a button).

- [ ] **Step 4: Implement the popover** — in `apps/web/src/economy/economy-bar.tsx` add `import type { WorldDto } from '@archipelago/shared'` and `import { useId, useState } from 'react'`, and add:

```tsx
/** The streak chip; a tap shows the next-bonus hint that `title` alone hid from touch screens. */
function StreakChip({ streak }: { streak: WorldDto['economy']['streak'] }) {
  const [open, setOpen] = useState(false)
  const hintId = useId()
  const hint = streak.next
    ? `Next bonus at ${streak.next.days} days: +${streak.next.amount}`
    : 'Top streak bonus reached'
  return (
    <span className="relative">
      <button
        type="button"
        aria-label={`${streak.days}-day streak`}
        aria-expanded={open}
        aria-controls={open ? hintId : undefined}
        title={hint}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        className={`${pill} ${streak.activeToday ? 'text-warning' : 'text-text-secondary'}`}
      >
        {streak.days}d
      </button>
      {open && (
        <span
          id={hintId}
          className="absolute top-full right-0 z-50 mt-2 w-max max-w-64 rounded-md bg-surface-primary px-3 py-2 text-sm text-text-primary shadow-lg"
        >
          {hint}
        </span>
      )}
    </span>
  )
}
```

In `EconomyBar` delete the `next` constant and replace the streak `<span role="img" …>` with `<StreakChip streak={streak} />`. Existing tests that use `getByLabelText('2-day streak')` keep matching the button.

- [ ] **Step 5: Run tests**

Run: `cd apps/web && bunx vitest run` — Expected: PASS.
Run: `bun run typecheck && bun run lint` — Expected: PASS / known info only.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/scene apps/web/src/world apps/web/src/economy apps/web/src/layout/world-scene-integration.test.tsx
git commit -m "feat(web): keep edge markers below the HUD and show the streak hint on tap"
```

---

### Task 10: Shop carry-overs — late settle, scene-ready chip, panel accessibility, spinner, single remove

**Files:**
- Create: `apps/web/src/app/spinner.tsx`, `apps/web/src/app/spinner.test.tsx`
- Modify: `apps/web/src/shop/shop-panel.tsx`, `apps/web/src/shop/shop-panel.test.tsx`, `apps/web/src/shop/placement-bar.tsx`
- Modify: `apps/web/src/layout/world-screen.tsx`, `apps/web/src/world/world-view.tsx`, `apps/web/src/scene/world-scene.tsx`
- Test: `apps/web/src/layout/world-shop.test.tsx`

**Interfaces:**
- Produces: `Spinner({ className? })` in `app/spinner.tsx` (decorative, `aria-hidden`); `WorldSceneProps` gains `onReady?: () => void`, called from the Canvas's `onCreated`.

- [ ] **Step 1: Failing unit tests**

`apps/web/src/app/spinner.test.tsx`:

```tsx
import { render } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { Spinner } from './spinner'

describe('Spinner', () => {
  test('is a decorative ring that spins only when motion is allowed', () => {
    const { container } = render(<Spinner />)
    const ring = container.firstElementChild
    expect(ring).toHaveAttribute('aria-hidden', 'true')
    expect(ring).toHaveClass('rounded-full', 'border-2', 'motion-safe:animate-spin')
    expect(ring).not.toHaveClass('animate-spin')
  })
})
```

Append to `describe('ShopPanel')` in `apps/web/src/shop/shop-panel.test.tsx`:

```ts
  test('the reason is read once, as the description, and sits outside the dimmed card', () => {
    render(<ShopPanel balance={50} hasFreeLand onPick={() => {}} />)
    const garden = item(/Flower garden/)
    expect(garden).not.toHaveAccessibleName(/Need/)
    expect(garden).toHaveAccessibleDescription('Need 10 more')
    expect(garden).not.toContainElement(screen.getByText('Need 10 more'))
  })
```

Run: `cd apps/web && bunx vitest run src/app/spinner.test.tsx src/shop/shop-panel.test.tsx` — Expected: FAIL (no spinner module; the reason is inside the button and in its name).

- [ ] **Step 2: Implement Spinner and the panel**

`apps/web/src/app/spinner.tsx`:

```tsx
/** A small ring for in-flight buttons; static under reduced motion. Decorative: say it in text. */
export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin ${className}`}
    />
  )
}
```

`apps/web/src/shop/shop-panel.tsx` — the card is the `li`; only the button dims; the reason sits below it, referenced by `aria-describedby`:

```tsx
            <li key={item.type} className="rounded-md bg-surface-secondary">
              <button
                type="button"
                disabled={!hasFreeLand || reason !== null}
                aria-describedby={reason ? reasonId : undefined}
                onClick={() => onPick(item.type)}
                className="flex min-h-11 w-full items-center gap-2 p-2 text-left disabled:opacity-50"
              >
                <DecorationIcon type={item.type} />
                <span className="flex flex-col">
                  <span className="text-sm text-text-primary">{item.name}</span>
                  <span className="text-xs text-text-secondary">{item.price} Supplies</span>
                </span>
              </button>
              {reason && (
                <p id={reasonId} className="px-2 pb-2 text-xs text-error">
                  {reason}
                </p>
              )}
            </li>
```

`apps/web/src/shop/placement-bar.tsx` — `import { Spinner } from '../app/spinner'`; add `gap-2` to `action`; the confirm button's content becomes:

```tsx
          {pending ? (
            <>
              <Spinner />
              Placing…
            </>
          ) : (
            `Place · ${item.price}`
          )}
```

(The accessible name stays "Placing…".)

Run: `cd apps/web && bunx vitest run src/app src/shop` — Expected: PASS.

- [ ] **Step 3: Failing app tests** — in `apps/web/src/layout/world-shop.test.tsx`:

Replace the `vi.mock('../scene/world-scene', …)` block so the stub reports ready like the real Canvas (unless a test holds it back) and offers a manual trigger:

```tsx
const sceneControl = vi.hoisted(() => ({ holdReady: false }))

// Stands in for the canvas: exposes placement plots, decorations and structures as buttons.
vi.mock('../scene/world-scene', async () => {
  const { useEffect } = await import('react')
  return {
    WorldScene: ({
      model,
      placement,
      selectedBuildingId,
      coveredBottom,
      onPickPlot,
      onSelectBuilding,
      onSelect,
      onReady,
    }: WorldSceneProps) => {
      useEffect(() => {
        if (!sceneControl.holdReady) onReady?.()
      }, [onReady])
      return (
        <div
          data-testid="scene"
          data-covered={coveredBottom}
          data-plots={placement?.plots.length ?? 0}
          data-ghost={placement?.ghost ? `${placement.ghost.plot.q},${placement.ghost.plot.r}` : ''}
          data-building={selectedBuildingId ?? ''}
        >
          <button type="button" onClick={() => onReady?.()}>
            report ready
          </button>
          {placement?.plots.map((p) => (
            <button key={`${p.q},${p.r}`} type="button" onClick={() => onPickPlot(p)}>
              plot {p.q},{p.r}
            </button>
          ))}
          {model.islands.flatMap((island) => [
            ...island.decorations.map((d) => (
              <button
                key={d.buildingId}
                type="button"
                onClick={() => onSelectBuilding(d.buildingId)}
              >
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
      )
    },
  }
})
```

Append to `describe('shop on the world screen')`:

```ts
  test('the Shop chip waits until the scene reports ready', async () => {
    sceneControl.holdReady = true
    try {
      const { api, beta } = seeded()
      const { user } = renderApp({ api, path: `/p/${beta.id}` })
      await screen.findByTestId('scene')
      expect(screen.queryByRole('button', { name: 'Shop' })).not.toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'report ready' }))
      expect(screen.getByRole('button', { name: 'Shop' })).toBeInTheDocument()
    } finally {
      sceneControl.holdReady = false
    }
  })

  test('a purchase from A settling after A→B→A leaves the new placement on A open', async () => {
    const { api, beta, state } = seeded()
    const gamma = fakeProject({ name: 'Gamma' })
    state.world.projects.push(gamma)
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const placeBuilding = api.placeBuilding
    api.placeBuilding = async (input) => {
      await gate
      return placeBuilding(input)
    }
    const { user, router } = renderApp({ api, path: `/p/${beta.id}` })
    await startPlacing(user)
    await user.click(screen.getByRole('button', { name: 'plot 0,1' }))
    await user.click(screen.getByRole('button', { name: 'Place · 30' }))
    const placing = screen.getByRole('button', { name: 'Placing…' })
    expect(placing.querySelector('.motion-safe\\:animate-spin')).not.toBeNull()

    await act(() => router.navigate({ to: '/p/$projectId', params: { projectId: gamma.id } }))
    await act(() => router.navigate({ to: '/p/$projectId', params: { projectId: beta.id } }))
    await startPlacing(user)
    await user.click(screen.getByRole('button', { name: 'plot -1,1' }))

    await act(async () => release())
    expect(await screen.findByText('Pine tree placed · −30')).toBeInTheDocument()
    expect(screen.getByRole('toolbar', { name: 'Placing Pine tree' })).toBeInTheDocument()
    await waitFor(() => expect(scene().dataset.ghost).toBe('-1,1'))
  })

  test('a double tap on Remove sends one request', async () => {
    const { api, beta, calls } = seeded()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { user } = renderApp({ api, path: `/p/${beta.id}` })
    await user.click(await screen.findByRole('button', { name: 'decoration pine' }))
    const remove = screen.getByRole('button', { name: 'Remove (+15)' })
    fireEvent.click(remove)
    fireEvent.click(remove)
    expect(await screen.findByText('+15 Supplies')).toBeInTheDocument()
    expect(calls.filter((c) => c === 'removeBuilding')).toHaveLength(1)
    confirm.mockRestore()
  })
```

Run: `cd apps/web && bunx vitest run src/layout/world-shop.test.tsx`
Expected: FAIL — the chip shows before ready; the late A settle ends the fresh placement (no toolbar); two `removeBuilding` calls. The earlier tests keep passing (the stub reports ready on mount).

- [ ] **Step 4: Scene ready** — `scene/world-scene.tsx`: add `onReady?: () => void` to `WorldSceneProps` and `onCreated={() => props.onReady?.()}` to `<Canvas>`. `world/world-view.tsx`:

```ts
  // The Shop needs the scene to place anything: hide its chip until the chunk has loaded and the
  // canvas exists (spec 16.6).
  const [sceneReady, setSceneReady] = useState(false)
  const markReady = useCallback(() => setSceneReady(true), [])
```

(add `useCallback` to the React import); pass `onReady={markReady}` to `<WorldScene>`; pass `onOpenShop={sceneReady ? onOpenShop : undefined}` to `<WorldHud>`; and in the `SceneBoundary` retry make it `onRetry={() => { setSceneReady(false); setWorldScene(createLazyWorldScene) }}`.

- [ ] **Step 5: Late settle and single remove** — `layout/world-screen.tsx`:

In `confirmPlacement`, only the latest attempt may touch placement:

```ts
      {
        // A purchase that settles after the route moved on (even back to this island) is stale.
        onSuccess: () => {
          if (attempt.current === id) setPlacing((p) => (p?.projectId === projectId ? null : p))
        },
        onError: () => {
          if (attempt.current === id) {
            setPlacing((p) => (p?.projectId === projectId ? { ...p, plot: null } : p))
          }
        },
        onSettled: () => {
          if (attempt.current === id) setSubmitting(false)
        },
      },
```

Next to `submitting`:

```ts
  // Set synchronously, like `submitting`: `remove.isPending` flips too late to stop a double tap.
  const removing = useRef(false)
```

and the `BuildingBar`'s `onRemove`:

```tsx
              onRemove={() => {
                if (removing.current) return
                removing.current = true
                remove.mutate(selectedBuilding.id, {
                  onSuccess: () => setSelectedBuildingId(null),
                  onSettled: () => {
                    removing.current = false
                  },
                })
              }}
```

- [ ] **Step 6: Run tests**

Run: `cd apps/web && bunx vitest run` — Expected: PASS (including "a slow purchase on one island leaves placement on the next alone").

- [ ] **Step 7: Full gate**

Run (root): `bun run test && bun run typecheck && bun run lint && bun run build`
Expected: all green; lint at the one known info; `bun run build` shows three, drei and `PerformanceMonitor` only in the world-scene chunk (check `apps/web/dist/assets`: the entry chunk must not contain `WebGLRenderer`):

```bash
grep -l WebGLRenderer apps/web/dist/assets/*.js
```

Expected: one file, the world-scene chunk.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src
git commit -m "fix(web): ignore stale purchase settles, wait for the scene before the Shop, and tidy shop accessibility"
```

- [ ] **Step 9: Manual check (report, do not block)**

`bun run --cwd apps/api dev` and `bun run --cwd apps/web dev -- --host`. On the owner's phone over the LAN open `/?perf`, enter the busiest island and pan for 10s: record fps, tier, calls, triangles and DPR. Read fps while a finger is moving: idle frames come only from the 30fps ticker, so an idle reading near 30 is expected (exit criterion, a manual check: ≥ 55fps on `high`, or the tier settles on `low` and shows ≥ 55fps). On phone and desktop: complete a task in a milestone (pop + two staggered floats + chip count-up), place a decoration (pop, no float), turn on reduced motion and repeat (no pop, no floats, chip snaps). Report the readings for the tuning follow-up.
