# Archipelago — Gamified Task Manager: Design Spec

- **Date:** 2026-10-07
- **Status:** Approved
- **Owner:** hafizhun.alim

## 1. Purpose

A personal, gamified task manager covering all of the owner's projects. Each project is a low-poly island in a 3D isometric archipelago; completing work visibly builds the island out. Success means the owner wants to open it daily and can see completed work in the world.

### Confirmed requirements

- Single user (no teams, no multiplayer, no public sign-up).
- 3D isometric low-poly style, built with Three.js (via React Three Fiber).
- Responsive web app, **mobile-first**, with full desktop support.
- Visual identity uses the Badr Interactive palette from the A'raf Design System (section 7.1).
- Native task management now; data model and backend ready for external integrations later (inbound via our API/webhooks, outbound via third-party APIs).
- Self-hosted on the owner's VPS.

## 2. Theme: Archipelago

- **Project:** a floating low-poly island on a navy and blue sea.
- **Milestone:** a district on the island, centred on a landmark such as a lighthouse, town hall or windmill.
- **Task:** a structure in its milestone's district, or in the island's loose-task area if it has no milestone.

### Task and milestone states

| State | Visual |
|---|---|
| Task: todo | Scaffold |
| Task: doing | Scaffold with animated crane |
| Task: done | Finished building; variant by size: S=hut, M=house, L=workshop |
| Task: overdue (not done, past due) | Small red storm cloud above structure |
| Task: due within 48h (not done) | Amber lantern |
| Milestone: in progress | Landmark translucent / partially built, filling in with progress |
| Milestone: complete | Landmark fully built |

Decorations bought with Supplies (trees, docks, gardens, etc.) are placed on free plots chosen by the user.

## 3. Gamification (v1: growth + light economy)

- **Currency:** a single currency, *Supplies*.
- **Task rewards:** S=10, M=25, L=60. A ×1.5 multiplier applies when the task is completed on or before its due date. Tasks without a due date get no bonus.
- **Milestone bonus:** awarded when the milestone's last open task is completed. The amount is the sum of that milestone's task base rewards × 0.5, rounded down.
- **Daily bonus:** a claimable 15 Supplies once per calendar day, in the user's timezone.
- **Streaks:** a streak is the number of consecutive days, in the user's timezone, with at least one completed task. Bonuses of 20, 50 and 200 Supplies are paid when the streak reaches 3, 7 and 30 days.
- **Spending:** decorations from the shop, each with a fixed price.
- **Reopen safety:** reopening a completed task reverses every reward that completion produced (task reward, milestone bonus, and streak bonus if the threshold is no longer met). Toggling a task cannot farm Supplies.
- **Overdraw:** if reversing a reward would make the balance negative, the balance is allowed to go negative. Purchases are blocked until it recovers.

Out of v1, planned later: XP, levels, achievements, unlockable building sets, seasonal events (post-v1 RPG layer). The ledger (section 5) holds full history so these can be derived from it.

## 4. Architecture

### 4.1 Repository layout (Turborepo + Bun workspaces)

```
project-beta/
├─ apps/
│  ├─ web/        Vite + React + React Three Fiber + drei, PWA (vite-plugin-pwa)
│  └─ api/        Hono on Bun, Drizzle ORM → Postgres 16
├─ packages/
│  ├─ shared/     zod schemas, domain types, economy rules (pure TS)
│  ├─ ui-tokens/  A'raf palette, spacing, radii as CSS vars + TS constants
│  └─ tsconfig/   shared TS configs
├─ turbo.json     build / dev / test / lint pipelines
└─ package.json   bun workspaces
```

- **Runtime:** Bun runs the API (`Bun.serve` + Hono) and manages packages. Turborepo caches build, test and lint per package.
- **Type-safe contract:** `apps/api` exports its Hono app type, and `apps/web` consumes it via `hono/client`. A change to an endpoint shape breaks the web build at compile time.
- **Validation:** zod schemas in `packages/shared` validate API input and type the client.
- **Economy rules:** pure functions in `packages/shared`. The API is authoritative and executes them. The web app uses the same functions only for optimistic UI.
- **Database:** Drizzle schemas and migrations (drizzle-kit) live in `apps/api`.
- **Lint and format:** Biome.

## 5. Data Model

```
users        id, email, password_hash, timezone, created_at
sessions     id, user_id, expires_at
api_tokens   id, user_id, name, token_hash, last_used_at, created_at

projects     id, user_id, name, island_seed, archipelago_x, archipelago_y,
             archived_at, created_at
milestones   id, project_id, name, sort_order, landmark_type, completed_at
tasks        id, project_id, milestone_id (nullable),
             title, notes, due_date, priority (low|med|high),
             size (S|M|L), status (todo|doing|done), completed_at,
             plot_x, plot_y, sort_order,
             external_source, external_id, external_url

ledger       id, user_id, kind, amount, ref_type, ref_id, reverses_id,
             source_task_id, streak_start, streak_days, created_at
buildings    id, project_id, type, plot_x, plot_y, rotation, placed_at
```

### Rules

- **Ledger:** append-only. Balance is the sum of the user's ledger entries and is never stored. `kind` takes one of these values:
  - `task_reward`
  - `milestone_bonus`
  - `streak_bonus`
  - `daily_bonus`
  - `purchase`
  - `reversal`

  A reversal references the entry it reverses via `reverses_id`, which is unique, so an entry can be reversed at most once.
- **Streaks:** derived from `tasks.completed_at` in `users.timezone`. No stored counter.
- **Task plots:** assigned once, at task creation, from `island_seed` and the milestone's district. They never reshuffle. If a task moves to another milestone, it gets a new plot in that district.
- **Landmarks:** a milestone landmark occupies its district's centre plot.
- **Decorations:** `buildings` rows are user-placed on free plots. Placement is validated server-side: the plot must be free and on land.
- **Integrations:** `(external_source, external_id)` is unique where non-null, so future importers can upsert. In v1 every task is native and these columns are null.
- **Ownership:** every query is scoped by `user_id`, directly or through the project.

## 6. API (`/api/v1`)

```
auth        POST /auth/login · POST /auth/logout · GET /auth/me
projects    GET/POST /projects · PATCH/DELETE /projects/:id
milestones  POST /projects/:id/milestones · PATCH/DELETE /milestones/:id
tasks       GET /tasks?project=&milestone=&status= · POST /tasks
            PATCH /tasks/:id · DELETE /tasks/:id
            POST /tasks/:id/complete · POST /tasks/:id/reopen
economy     GET /economy            (balance, streak, daily-bonus state)
            POST /economy/daily-claim
shop        GET /shop               (decoration catalogue + prices)
buildings   GET /projects/:id/buildings · POST /buildings · DELETE /buildings/:id
world       GET /world              (projects + milestones + tasks + buildings + economy)
tokens      GET/POST/DELETE /tokens
```

### 6.1 Completing a task

This runs in a single DB transaction:

1. Set `status=done`, `completed_at=now`.
2. Insert a `task_reward` ledger entry.
3. If this was the milestone's last open task, set `milestones.completed_at` and insert a `milestone_bonus` entry.
4. Recompute the streak. If it crosses a threshold not previously awarded for this streak run, insert a `streak_bonus` entry.
5. Return a reward event: `{ task, rewards: [...], milestoneCompleted?, newBalance }`.

`POST /tasks/:id/reopen` is the mirror operation. It reverts the status, clears `completed_at` (and the milestone's `completed_at` if set), and inserts `reversal` entries for every reward tied to that completion.

`DELETE /tasks/:id` on a completed task also reverses its rewards.

Setting `status=done` through `PATCH /tasks/:id` is rejected. Completion must go through `/complete`.

### 6.2 Errors

- **Shape:** every error uses `{ error: { code, message, fields? } }`.
- **Validation failures:** `422` with field errors. A malformed JSON body returns `400 bad_request`.
- **Auth:** `401` when unauthenticated, `404` for resources the user doesn't own (no existence leak).
- **Business rules:** `409` for conflicts, such as an occupied plot or insufficient Supplies.
- **Rate limit exceeded:** `429 rate_limited`.
- **Rate limit:** `POST /auth/login` is rate-limited per IP.

### 6.3 Auth

- **Web app:** an httpOnly, Secure, SameSite=Lax session cookie. Passwords are hashed with `Bun.password` (argon2id).
- **API tokens:** sent as `Authorization: Bearer <token>`. Only a hash is stored, and the plaintext is shown once at creation. Tokens are accepted on the same routes (future webhook routes too).

## 7. Frontend

### 7.1 Palette (A'raf Design System)

| Token | Hex | World use |
|---|---|---|
| brand | `#004990` | Deep sea |
| brand-secondary / info | `#0069d2` | Shallows, UI accents |
| surface primary / secondary | `#ffffff` / `#f9fafb` | UI surfaces, foam, clouds |
| text primary / secondary / tertiary | `#111827` / `#4b5563` / `#9ca3af` | UI text, rock, stone |
| border primary / secondary | `#e5e7eb` / `#d1d5db` | UI borders |
| success | `#16a34a` | Vegetation, completion feedback |
| warning | `#ba7517` | Due-soon lanterns, wood |
| error / destructive | `#dc2626` | Overdue storm, destructive actions |

UI spacing follows the A'raf scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64. Radii are 4, 6 and 8. Tokens live in `packages/ui-tokens` and feed Tailwind and the 3D material mapping.

### 7.2 Screens

- **Login.**
- **World** (main): the 3D scene plus the task panel (bottom sheet on mobile, side panel on desktop).
- **Task / milestone / project editor.**
- **Shop:** pick a decoration, then tap a free plot to place it.
- **Settings:** timezone, API tokens.

### 7.3 Camera states and routing

| State | URL | Panel content |
|---|---|---|
| Archipelago | `/` | Due today + overdue across all projects |
| Island | `/p/:projectId` | That project's milestones and tasks |
| District | `/p/:projectId/m/:milestoneId` | That milestone's tasks |

- **Navigation:** tap an island or landmark to fly in. Back gesture, browser back or `Esc` steps out one level.
- **Deep links:** URLs restore state on refresh or deep link.

### 7.4 Framing and overflow (mobile-first)

- **Fixed scale:** the world renders at a fixed minimum readable scale. Structures stay at least 44px tap targets on phones. The world is never compressed to fit the viewport.
- **Overflow:** the archipelago and large islands overflow the viewport. Swipe or drag to pan with momentum and soft bounds at the world edges. Pinch or wheel zoom is clamped and never goes below the readability minimum.
- **Opening focus:** the camera centres on the island with the most overdue or due-today tasks, or else the last-viewed island.
- **Island switcher:** a chip strip above the task panel. Tapping a chip flies to that island.
- **Edge indicators:** markers at the screen edge point toward off-screen islands with overdue tasks (red) or due-soon tasks (amber).
- **Camera controls:** orthographic camera at a true isometric angle. Pan and zoom only, no free rotation.

### 7.5 Responsive layout

| Breakpoint | Layout |
|---|---|
| < 768px (phone, primary target) | Full-screen world, 3-detent non-modal bottom sheet (custom), full-screen editor sheets (`vaul`, modal), touch gestures, ≥ 44px targets |
| 768–1023px (tablet) | Same as phone, sheet max-width ~640px, centred |
| ≥ 1024px (desktop) | Resizable right side panel (~400px default) replacing the sheet. Editors and shop open as centred dialogs. Wheel zoom, click-drag pan, hover tooltips (title + due date). Shortcuts: `N` new task, `Esc` back, `/` search |

### 7.6 Rendering

- **Stack:** React Three Fiber with drei, orthographic isometric camera, `frameloop="demand"`.
- **Islands:**
  - A low-poly hex grid generated deterministically from `island_seed`, flat-shaded.
  - Terrain is merged into one mesh per island.
  - Island size grows with the project's task count, so there are always enough plots.
- **Sea:** a navy plane with a subtle animated vertex wave, and a shallows ring in `#0069d2`.
- **Assets:** procedural low-poly models built in code from palette colours (decided in section 13.3). Custom Blender models stay on the post-v1 roadmap.
- **Performance:**
  - Instanced meshes for repeated models.
  - Device pixel ratio capped at 2.
  - One directional light plus ambient light, and blob-decal shadows instead of shadow maps.
  - `PerformanceMonitor` for adaptive quality.
  - Target: 60fps on a mid-range Android phone.
- **Reward feedback:** a floating "+N Supplies" rises from the structure, the build animation plays, and the header balance chip counts up.

### 7.7 Data on the client

- **Loading:** TanStack Query loads `GET /world` and caches it.
- **Mutations:** optimistic updates with rollback and an error toast on failure.
- **Reward animations:** driven by the server's reward event (section 6.1). The optimistic animation is reconciled with the server result.

### 7.8 PWA / offline

- **Install:** installable via a manifest with A'raf-branded icons and theme colour.
- **Service worker:** precaches the app shell and assets, and caches the last `GET /world` response (network-first, falling back to cache).
- **Offline mode:**
  - Shows an "Offline: view only" banner.
  - Disables mutation controls.
  - No offline write queue in v1.

## 8. Testing

TDD throughout.

### `packages/shared`

Unit tests for the economy rules:
- reward per size
- the early-finish multiplier, including the no-due-date case
- milestone bonus
- streak calculation across timezones and DST/day boundaries
- daily-bonus eligibility
- reversal maths

### `apps/api`

`bun test` against a real Postgres test database, with each test wrapped in a rolled-back transaction. Coverage:
- every route's success path
- validation (422), auth (401), ownership (404) and conflict (409) failures
- the full completion flow (ledger, milestone bonus, streak bonus, reward event)
- reopen and delete reversal
- the complete/reopen toggle-farming guard
- negative-balance purchase block

### `apps/web`

- **Vitest + React Testing Library:**
  - mapping world state to the structure and state list
  - panel filtering by camera state
  - optimistic update and rollback
  - responsive layout switch at 1024px
- **Scene:** a smoke test that it mounts with a fixture world.

### End to end

A Playwright smoke test that logs in, creates a project and a task, completes it, and asserts the balance increased. It runs at 390×844 (iPhone 14) and 1440×900.

`turbo test` runs everything with caching.

## 9. Deployment and Operations

- **Docker Compose on the VPS:**
  - `postgres:16`, with a named volume.
  - `api`, a Bun image. It runs Drizzle migrations on startup.
  - `caddy`, which serves `apps/web/dist`, reverse-proxies `/api` and provides automatic HTTPS.
- **Backups:** a nightly `pg_dump` cron to a backup directory on the VPS, with 7-day retention.
- **Bootstrap:** a `bun run seed:user` CLI creates the single user account. There's no sign-up route.
- **Configuration:** env vars `DATABASE_URL`, `COOKIE_SECURE`, `TRUST_PROXY`, `SESSION_TTL_DAYS` and `PORT`, set via a `.env` file that is not committed. `APP_ORIGIN` is added in Phase 6. Session tokens are random and stored hashed, so no signing secret is needed.

## 10. Scope

### v1 (this spec)

- Single-user auth and personal API tokens.
- Full create, edit and delete for projects, milestones and tasks.
- Archipelago, island and district views with a responsive task panel, overflow panning, island switcher and edge indicators.
- Supplies economy: task rewards, milestone bonus, streaks, daily bonus, decoration shop and placement.
- Installable PWA with offline viewing.
- Docker Compose deployment with backups.

### v1 delivery phases

v1 is built in phases. Each phase is a vertical slice that gets its own implementation plan, has passing tests, and leaves the app in a working state.

| # | Phase | Contents | Done when |
|---|---|---|---|
| 1 | Foundation | Turborepo + Bun scaffold, `packages/shared`, `ui-tokens`, `tsconfig`; Drizzle schema + migrations; auth (sessions, login rate limit, `seed:user`, personal API tokens + bearer auth); error shape; Docker Compose (Postgres + API) for local dev | Can log in against a real DB; `turbo test` green |
| — | 3D spike (optional, throwaway) | Minimal R3F scene: one seeded, palette-recoloured island, isometric ortho camera, pan/zoom; tested on a real phone | Performance and feel validated, or risks recorded |
| 2 | Task core | Projects/milestones/tasks CRUD, complete/reopen (no rewards), `GET /world`, plot assignment (section 11.1), plain responsive list UI (bottom sheet on mobile / side panel on desktop), routing for the three states | Usable task manager on phone and desktop |
| 3 | Economy | Ledger, complete/reopen with rewards, milestone bonus, streaks, daily bonus, `GET /economy`, reward events in the UI | Completing tasks earns Supplies, reversals are correct |
| 4 | World (4a scene, section 13; 4b camera, section 14) | R3F scene: archipelago, islands, districts, task structures + states, landmarks, camera states, overflow panning, island switcher, edge indicators | The game renders the real data |
| 5 | Shop & polish (5a shop, section 15; 5b polish, section 16) | Shop catalogue, decoration placement, reward animations, performance pass on a real device | Decorations purchasable and placeable; 60fps target met |
| 6 | Ship | PWA + offline viewing, web build served by Caddy with HTTPS on the VPS, backups, Playwright smoke tests on both viewports | Live on the VPS and installable |

### Post-v1 roadmap (not in v1)

1. RPG layer: XP, levels, achievements, unlockable building sets, seasonal events.
2. Integrations: inbound webhooks, GitLab/Jira importers using the `external_*` columns and API tokens.
3. Full offline editing with a sync queue.
4. Custom Blender models replacing CC0 assets.

### Explicitly excluded

Multi-user features, tags, subtasks, recurring tasks, attachments, task dependencies, camera rotation.

## 11. Phase 2 Design Addendum (approved 2026-10-07)

### 11.1 Island and plot layout

- **Grid:** each island is a hex grid using axial coordinates `(q, r)`. Plot columns are stored as `plot_x = q`, `plot_y = r`.
- **Projects:** a new project takes the next free archipelago slot on a spiral of island slots around the archipelago origin, stored as `archipelago_x/y`. It gets a random 31-bit `island_seed`.
- **Districts:**
  - A new milestone takes the next free district centre on a spiral of centres 5 hexes apart around the island origin.
  - The centre is stored on the milestone (`district_q`, `district_r`, added by a migration).
  - The centre hex holds the landmark.
  - `landmark_type` cycles through `lighthouse`, `town_hall`, `windmill`, `observatory`, `market` in milestone-creation order.
- **Commons district:** loose tasks (no milestone) use a fixed commons district centred on the island origin `(0, 0)`. Milestone centres never use `(0, 0)`.
- **Task plots:**
  - A task takes the nearest free hex, by ring distance, around its district centre.
  - The ring-walk start direction is chosen by `island_seed`, so islands differ.
  - A hex is free if no task or building on the island occupies it and it is not a district centre.
  - Moving a task to another milestone (or to loose) assigns a new plot in the target district.
  - Plots never change otherwise.
- **Ownership rule:** a task's milestone must belong to the task's own project. The API enforces this with a service check, and a mismatch returns `422`.

### 11.2 Completion before the economy

- `POST /tasks/:id/complete` and `/reopen` ship in Phase 2.
- They set `status` and `completed_at`.
- A milestone's `completed_at` is set when its last open task completes and cleared when any of its tasks reopens.
- Phase 3 adds ledger rewards inside the same transaction.

### 11.3 Web stack (`apps/web`)

- **App:** Vite + React + TypeScript, TanStack Router (typed routes `/login`, `/`, `/p/$projectId`, `/p/$projectId/m/$milestoneId`), TanStack Query.
- **API calls:** Hono's typed client (`hono/client`) over the API's exported `AppType`.
- **Styling:** Tailwind CSS with A'raf tokens from `packages/ui-tokens`.
- **Task panel:** a custom non-modal 3-detent bottom sheet below 1024px (the world above stays interactive), and a resizable side panel at 1024px and up. `vaul` is used only for the modal editor sheets: vaul 1.1.2 cannot render a non-modal drawer because it never passes `modal` through to the Radix dialog.
- **Dev setup:** the Vite dev server proxies `/api` to the API, so the session cookie is same-origin.
- **Tests:** Vitest + React Testing Library.

### 11.4 Phase 2 screens

- **Login.**
- **World screen:**
  - A placeholder world area (one card per island until Phase 4).
  - An island switcher strip.
  - The task panel, filtered by route: due today and overdue across all projects, then one project, then one milestone.
- **Editors:** project, milestone and task editors as sheets on mobile and dialogs on desktop.
- **Task actions:** todo, doing and done toggles, and delete.

## 12. Phase 3 Design Addendum (approved 2026-10-07)

This section refines sections 3, 5 and 6 for the economy. Where they disagree, this section wins.

### 12.1 Amounts

- **Task reward:** base S=10, M=25, L=60. If the task has a due date and its completion day (in `users.timezone`) is on or before it, the reward is `floor(base × 1.5)` (S=15, M=37, L=90).
- **Milestone bonus:** `floor(sum of base rewards of the milestone's tasks × 0.5)`, computed when it is awarded and never recomputed.
- **Daily bonus:** 15. **Streak bonuses:** 20 at 3 days, 50 at 7, 200 at 30.
- All amounts and rules are pure functions in `packages/shared/src/economy.ts`.

### 12.2 Ledger linkage

Migration adds three nullable columns to `ledger`:

- `source_task_id uuid` — the task whose completion produced the entry (`task_reward`, `milestone_bonus`, `streak_bonus`). No foreign key: entries outlive deleted tasks.
- `streak_start date`, `streak_days smallint` — on `streak_bonus` entries, the run's first day and the threshold paid.

`ref_type`/`ref_id` are `task`/task id for `task_reward` and `milestone`/milestone id for `milestone_bonus`. A *live* entry is a non-reversal entry with no reversal pointing at it. Every ledger insert uses the request's `now` as `created_at`.

### 12.3 Milestone bonus: one live bonus

- Paid only by `POST /tasks/:id/complete`, when that completion completes the milestone **and** the milestone has no live `milestone_bonus`.
- Tied to the completing task: reversed only when that task is reopened or deleted.
- Other paths that reopen a milestone (adding or moving a task in) keep the bonus; finishing the milestone again pays nothing while it is live.
- Completion through other paths (deleting or moving out the last open task) pays no bonus.

### 12.4 Streaks

- **Completion days:** the local dates (in `users.timezone`) of the user's *live* `task_reward` entries. This replaces "derived from `tasks.completed_at`": a reopen or task delete removes a day, a project delete does not.
- **Current streak:** the length of the run of consecutive completion days ending today; if today has none, the run ending yesterday; else 0.
- **Award (on complete):** for the run ending today (start `S`, length `L`), each threshold `T ≤ L` with no live `streak_bonus (S, T)` is paid.
- **Reversal (on reopen/delete):** after the task's rewards are reversed, every live `streak_bonus (S, T)` whose window `S … S+T−1` contains the task's completion day is reversed if any day in that window no longer has a completion.

### 12.5 Reopen, delete and overdraw

- Reopen and task delete reverse every live entry with `source_task_id` = the task except `streak_bonus` (handled by 12.4), then apply 12.4.
- Deleting a project or milestone reverses nothing.
- The balance may go negative. Purchases (Phase 5) are blocked while it is negative.

### 12.6 Daily bonus

`POST /economy/daily-claim` inserts a `daily_bonus` entry unless one exists whose `created_at` falls on today in the user's timezone; then `409 conflict`.

### 12.7 Locking

Complete, reopen and task delete lock the project row, then the user row (`FOR NO KEY UPDATE`). The daily claim locks only the user row. Lock order is always project → user.

### 12.8 API shapes

```
RewardDto   { kind: 'task_reward'|'milestone_bonus'|'streak_bonus'|'daily_bonus', amount, streakDays: number|null }
EconomyDto  { balance, streak: { days, activeToday, next: { days, amount } | null },
              daily: { amount, claimedToday } }

POST /tasks/:id/complete  → { task, milestoneCompleted, rewards: RewardDto[], balance }
POST /tasks/:id/reopen    → { task, milestoneReopened, reversals: RewardDto[], balance }   (amounts positive: what was taken back)
DELETE /tasks/:id         → 204 (rewards reversed server-side)
GET /economy              → { economy: EconomyDto }
POST /economy/daily-claim → { reward: RewardDto, economy: EconomyDto }
GET /world                → adds `economy: EconomyDto`, read in the same snapshot
```

This replaces `newBalance` in section 6.1 with `balance`. Create and update responses are unchanged: the milestone sync on those paths has no economic effect, and the client refetches `/world`.

### 12.9 Phase 3 web

- **Header:** Supplies balance (red when negative), streak days, and a "Claim +15" button while the daily bonus is unclaimed. Balance and streak come from `world.economy`. Below 640px the brand text collapses to keep everything on one row.
- **Reward feedback:** after completing, one toast lists the rewards ("+37 Supplies · Milestone bonus +40 · 3-day streak +20"). After a reopen that took Supplies back, a toast says how many. The cached balance is patched from the response before the world refetch.
- **Delete:** confirming the delete of a done task warns that its Supplies will be reversed.
- Full reward animations stay in Phase 5.

## 13. Phase 4a Design Addendum (approved 2026-10-07)

Phase 4 ships in two halves. **4a (this section)** replaces the placeholder cards with the 3D scene: terrain, sea, districts, landmarks and task structures with every state, a camera framed per route, and taps that navigate or select. **4b** (section 14) adds fly-in transitions, soft pan bounds, opening focus, edge indicators, island-switcher placement and sheet-aware framing. This section refines sections 7.3, 7.4 and 7.6; where they disagree, this section wins.

### 13.1 Stack

- `three` 0.186, `@react-three/fiber` 9.8 (peer React < 19.4), `@react-three/drei` 10.7; `@react-three/test-renderer` 9.1 for scene tests.
- The scene is a lazily loaded chunk (`React.lazy`), so Three.js stays out of the login bundle.

### 13.2 Scene model (pure, `apps/web/src/scene/model/`)

No Three.js imports; all of it is unit-tested.

- **Hex to world:** pointy-top hexes of size 1 world unit, y up. `hexToWorld({q, r})` → `{x, z}`.
- **Island radius:** the largest hex distance from the island origin to any of its task plots or district centres, plus 2, with a minimum of 4. Islands grow as tasks and milestones are added.
- **Archipelago layout:** an island's origin is `hexToWorld(hexScale(slot, spacing))`, where `slot` is the stored `(archipelagoX, archipelagoY)` and `spacing = 2 × (largest island radius in the world) + 3`. Islands never overlap and the layout is deterministic.
- **Terrain:** `islandTerrain(seed, radius)` returns hex tiles `{q, r, height, tone}`. Every hex within `radius − 2` is flat land at height 1, so all plots are level. The two outer rings are shore: heights and tones come from a mulberry32 PRNG seeded with `island_seed`, and some outer-ring hexes are dropped for a ragged coast. Same seed and radius, same island.
- **Structure state:** `structureFor(task, today)` → `{kind, marker}`.
  - kind: `scaffold` (todo), `crane` (doing), `hut` / `house` / `workshop` (done, size S / M / L).
  - marker: `storm` (overdue), `lantern` (due within 48h), else `null`, using `dueStatus` from `world/selectors.ts`.
- **Landmark progress:** `landmarkFor(milestone, tasks)` → `{type, progress}`; progress = done ÷ total, 0 with no tasks, and 1 whenever `completedAt` is set.
- **Commons:** the commons centre `(0, 0)` is a stone plaza tile, with no landmark.
- **Output:** `buildSceneModel(world, today)` → `{islands: [{projectId, origin, radius, tiles, districts, structures}], bounds}`, memoised on the `world` object.
- **Colours** come only from `@archipelago/ui-tokens`. Darker and lighter tones are derived with a fixed mix toward `brand` or white.

### 13.3 Rendering (`apps/web/src/scene/`)

- **Canvas:** `<Canvas frameloop="demand" dpr={[1, 2]} orthographic flat>` (no tone mapping, so palette colours render true), true isometric camera (45° around y, 35.264° elevation), one directional light plus hemisphere light, no shadow maps; each structure gets a blob shadow decal.
- **Terrain:** one merged hex-prism `BufferGeometry` per island with vertex colours and flat shading, rebuilt only when that island's tiles change.
- **Sea:** a large `brand` plane whose vertices bob in a gentle wave (updated on the CPU at the ticker rate), and a `brand-secondary` shallows hexagon under each island.
- **Models:** procedural, no glTF. Each kind (scaffold, crane, hut, house, workshop, storm, lantern, plaza, five landmarks) is built once in `scene/models/*.ts` as a merged low-poly geometry with palette vertex colours, and rendered as one `InstancedMesh` per kind. The crane jib is its own instanced mesh so it can turn.
- **Landmark progress:** each landmark is a stack of `n` segments; the first `ceil(progress × n)` are solid, the rest a translucent ghost at 35% opacity.
- **Animation:** the sea wave and crane jibs need frames, so a ticker calls `invalidate()` at about 30fps while the document is visible. With `prefers-reduced-motion: reduce` there is no ticker and the scene redraws only on change.
- **Labels:** drei `<Html>` name tags: island names in archipelago view, milestone names in island view.
- **WebGL fallback:** if a WebGL context cannot be created, the Phase 2 card view (renamed `CardWorld`) renders instead. jsdom takes this path, so app-level tests run without WebGL.

### 13.4 Camera (4a)

- `cameraTarget(model, focus)` is pure and returns a look-at point and a zoom:
  - **Archipelago:** the centre of `model.bounds`, at zoom 10, where an island of radius 4 is about 158px across.
  - **Island:** the island origin, at zoom 48 (pixels per world unit): a hex is about 83px wide and its footprint about 48px tall on screen, so structures clear the 44px tap target.
  - **District:** the district centre, at 1.5× the island zoom.
  - The camera sits on the `(1, 1, 1)` diagonal from its look-at point, which is the true isometric angle.
- The camera snaps to the target on route change (the fly animation is 4b).
- **Pan and zoom:** drei `MapControls` with rotation disabled and damping on. Zoom is clamped between the state's zoom and 3× it. The pan target is clamped to `model.bounds` (soft bounds are 4b).

### 13.5 Interaction

- **Tap vs drag:** a pointer press is a tap only if it moved 6px or less (R3F `event.delta`), so panning never navigates or selects.
- **Archipelago view:** tapping any part of an island navigates to `/p/:projectId`.
- **Island and district views:** tapping a landmark navigates to `/p/:projectId/m/:milestoneId`. Tapping a structure selects its task. Tapping sea or terrain clears the selection.
- **Selection:**
  - `selectedTaskId` lives in `WorldScreen` and clears on route change.
  - The selected structure gets a `brand` ring beneath it.
  - The task panel scrolls the row into view and marks it `aria-current="true"` with a highlight.
  - If the panel's search filter hides the row, the filter is cleared.
  - On phone and tablet, a collapsed sheet rises to its middle detent. The detent state is lifted out of the sheet component for this.
- **HUD:** the card view's controls move to a floating bar over the canvas: back (`← Archipelago` / `← <project>`), `Edit island` / `Edit milestone`, `New island` / `New milestone`. With no projects, "No islands yet" and `New island` sit over the empty sea.
- The island switcher stays where it is in 4a.

### 13.6 Testing

- **Model:** hex maths, island radius growth, no-overlap spacing over random worlds, terrain determinism with a flat interior under every plot, the full structure-state table (including the 48h boundary and a non-UTC `today`), landmark progress (0 tasks, partial, `completedAt`), camera targets per focus.
- **Model geometry:** each builder returns a non-empty geometry with a colour per vertex, inside its hex footprint, coloured only from the scene palette.
- **Scene graph** (`@react-three/test-renderer`): instance counts and colours per kind match the model; an island click navigates; a structure click selects; a click with delta > 6px does nothing; reduced motion runs no ticker.
- **App** (RTL): existing world-screen tests still pass on the WebGL fallback. Selection and HUD tests replace the lazy scene module with a stub that calls `onSelect` / renders the HUD: selecting highlights and scrolls the row and raises the sheet; HUD buttons open the right editors.
- **Manual:** `bun dev` on desktop and on a phone over the LAN; real-device fps tuning is Phase 5.

## 14. Phase 4b Design Addendum (approved 2026-10-08)

4b completes the world's camera on top of the 4a scene (section 13): fly-in transitions, soft pan bounds, opening focus, sheet-aware framing, edge indicators and the island switcher's final place. It also closes three parked 4a items: scene-boundary recovery, bounds that shrink after a refetch, and the archipelago zoom floor. It refines sections 7.4 and 13.4–13.5; where they disagree, this section wins.

### 14.1 Camera motion (pure, `apps/web/src/scene/model/camera-motion.ts`)

No Three.js imports; unit-tested. `CameraRig` keeps drei `MapControls` and drives these functions from `useFrame`.

- **Fly-in:** a change of `focusKey` starts a flight from the current view `{x, z, zoom}` to `cameraTarget(...)`. The first framing after the scene mounts snaps; only later route changes fly. A refetch never moves the camera.
  - `flyFrame(from, to, t)` → `{x, z, zoom}` for `t ∈ [0, 1]`. Position follows ease-in-out cubic. Zoom interpolates in log space.
  - **Hop:** when the two endpoints do not both fit on screen at the smaller of the two zooms, zoom dips mid-flight to the zoom at which both fit, then returns. A short flight does not dip.
  - `flyDuration(from, to, viewport)` → 450–900ms, growing with the on-screen distance travelled.
  - **Interruption:** a pointer-down or wheel on the canvas (MapControls `start`) ends the flight where it is; the user takes over.
  - During a flight the pan clamp and zoom limits are suspended; they apply again on landing.
- **Soft bounds (rubber band):** while dragging, the rig keeps the raw target MapControls would have reached and shows a banded one. Overshoot past a bound edge is displayed as `band(over, limit) = limit · (1 − 1/(over/limit + 1))`, where `limit` is a quarter of the uncovered viewport's short side in world units at the current zoom.
  - **Spring-back:** when the drag and its momentum end outside the bounds, the momentum is cancelled and the target eases back to the clamped point over 300ms (ease-out).
  - The same spring runs when a refetch shrinks `model.bounds` while the camera sits outside them and nobody is touching it.
- **Reduced motion:** flight and spring durations are 0 (snap). The 4a momentum-spend before a snap stays.
- **Zoom floor:** archipelago `minZoom` stays 10, the section 7.4 readability floor. A large archipelago is covered by panning, the switcher and edge indicators, not by zooming out.

### 14.2 Opening focus

- Whenever the route becomes `/`, the archipelago camera (zoom 10) centres on `openingIsland(summaries, previous, lastViewed)`, first match wins:
  1. **Stepping out:** the island of the previous route, if the user came from `/p/:id` or one of its districts.
  2. **Urgency:** the island with the most overdue tasks, ties broken by more due-soon tasks, then switcher order; it needs at least one of either.
  3. **Last viewed:** the island in localStorage `archipelago.lastIsland`, written whenever an island or district route is shown. Reads and writes are wrapped in try/catch. A deleted island is ignored.
  4. **Fallback:** the centre of `model.bounds`, as in 4a.
- Section 7.4 says "due-today"; due-soon covers today and tomorrow, so ranking overdue first and due-soon second keeps today's work on top without a new summary field.
- It runs only on a route change into `/`, never on a refetch. The first view after a page load snaps; later entries fly.

### 14.3 Sheet-aware framing

- **Phone and tablet (< 1024px):** `PanelFrame` reports the sheet's top edge through a `ResizeObserver`. `WorldView` turns it into `coveredBottom`: canvas pixels hidden behind the sheet, including the switcher strip riding on it.
- `camera.setViewOffset` shifts the projection so the look-at point sits in the centre of the uncovered area. Cover counts up to 50dvh; at the 92dvh detent the framing stays as at the middle detent.
- The offset eases over 250ms (snaps under reduced motion) when the detent settles, not during a drag.
- Pan bounds and edge indicators measure against the uncovered area.
- **Desktop:** the side panel sits beside the canvas, so `coveredBottom` is 0.

### 14.4 Edge indicators

- One per island that has overdue or due-soon tasks, is not the current island, and lies wholly outside the uncovered viewport. Shown in every view.
- **Placement (pure):** `edgeIndicators(islands, viewport, inset)` projects each island centre to the screen, casts a ray from the centre of the uncovered area toward it, and places the marker where the ray meets the viewport rectangle inset by 28px, with an arrow angle pointing at the island. Markers closer than 48px along an edge are pushed apart.
- **Look:** a 44px circular button, `error` for overdue and `warning` for due-soon, with an arrow and the island's urgent-task count. Accessible name, e.g. "Alpha island, 3 overdue, off screen". Tapping navigates to `/p/:id`, which flies.
- **Plumbing:** an in-canvas component computes the list after each rendered frame and reports it upward only when it changes (positions rounded to whole pixels). `WorldView` renders the markers as DOM buttons at z-10, under the HUD (z-20) and the sheet (z-30).

### 14.5 Island switcher placement

- Resolves section 7.4's "a chip strip above the task panel".
- **Phone and tablet:** the chip strip sits directly above the sheet's top edge (`bottom: 100%` of the sheet) and moves with it; detent heights are unchanged. The strip background is transparent; each chip keeps its own surface and shadow. Its height counts toward `coveredBottom`.
- **Desktop:** a strip at the top of the side panel, above its content.
- `PanelFrame` gains an `accessory` slot; the top bar above the world is removed. Chip behaviour and `aria-current` are unchanged, and the switcher still hides when there are no islands.

### 14.6 Recovery and sheet fixes

- **Scene boundary:** `SceneBoundary` resets on route change, so a transient failure retries on the next navigation, at most 2 resets per page load. After that the card view stays.
- **Sheet drag (parked from Phase 2b):** the `dragged` flag clears on the next pointer-down instead of in a microtask, so a mouse drag's trailing click no longer toggles the detent. A pointer cancel restores the previous detent instead of snapping to the detent nearest `clientY` 0.

### 14.7 Testing

- **Model:** `flyFrame` endpoints exact, monotonic easing, log-space zoom midpoint at the geometric mean, a long hop dips and keeps both endpoints in view, a short hop does not; `flyDuration` within 450–900ms and growing with distance; `band` zero at the edge, monotonic, below the limit, continuous; spring lands on the clamped point; `openingIsland` precedence, ties, the deleted last-viewed island and the bounds fallback; `edgeIndicators` for on-screen islands, all four edges and corners, angle, inset, push-apart and a covered bottom; framing offset is half the covered height, capped at 50dvh, and 0 on desktop.
- **Scene graph** (`@react-three/test-renderer`, frames driven with `advanceFrames`): a route change lands on the target after the duration and sits partway mid-flight; a controls `start` stops the flight in place; reduced motion snaps in one frame; a bounds-shrinking refetch springs the camera back inside; an off-screen urgent island reports an indicator and the current island never does.
- **App** (RTL, stub-scene seam): the switcher renders in the sheet accessory on phone and in the side panel on desktop, the top bar is gone, chips navigate; a stub-reported indicator renders as a labelled button that navigates; `coveredBottom` follows the detent, caps at 50dvh, and is 0 on desktop; the last-viewed island is written on island routes and throwing storage is harmless; `SceneBoundary` falls back, retries on route change, and stays on cards after two failures; a mouse drag then click does not toggle the detent; a pointer cancel restores the previous detent.
- **Manual:** fly feel on desktop and on a phone over the LAN, the rubber band at all four edges, framing at each detent, indicators while panning, switcher chips over the world.

## 15. Phase 5a Design Addendum (approved 2026-10-08)

Phase 5 ships in two halves. **5a (this section)** adds the decoration shop: a fixed catalogue, buying a decoration by placing it on a free plot, and removing it for a half refund. **5b** covers reward animations (including a placement animation), the real-device performance pass and the Phase 4a/4b carry-overs; 5a uses plain toasts. This section refines sections 3, 5, 6, 7.2 and 7.6; where they disagree, this section wins.

### 15.1 Catalogue (`packages/shared/src/shop.ts`)

A fixed list of `{ type, name, price }`. Each type has one procedural model.

| Type | Name | Price |
|---|---|---|
| `pine` | Pine tree | 30 |
| `palm` | Palm tree | 40 |
| `garden` | Flower garden | 60 |
| `lamp` | Bench and lamp | 80 |
| `well` | Well | 120 |
| `stall` | Market stall | 160 |
| `fountain` | Fountain | 220 |
| `statue` | Statue | 350 |

- `refundFor(price) = floor(price × 0.5)`.
- The catalogue lives in code, not the database. The web app imports it directly; `GET /shop` serves it to API-token clients.

### 15.2 Land rule (`packages/shared`)

- `islandRadius(occupied)` moves from `apps/web/src/scene/model/terrain.ts` to `packages/shared`, unchanged: the largest hex distance from the island origin to an occupied hex, plus 2, minimum 4.
- **Occupied** now means task plots, district centres **and decoration plots**. Decorations keep the island from shrinking under them when tasks are deleted.
- `placeablePlots(occupied)` returns every hex within `islandRadius(occupied) − 2` of the origin (the flat interior) that is not occupied and is not the commons centre.
- A placement is checked against the radius **before** the new decoration is added, so decorations never grow an island. Islands grow only from tasks and milestones.
- **Rotation** is not chosen by the user: the server stores `rotation = hash(plotX, plotY) mod 6` (60° steps) for variety.

### 15.3 API

```
GET    /shop                → { items: ShopItemDto[] }                  ShopItemDto { type, name, price }
POST   /buildings           { projectId, type, plotX, plotY }
                            → 201 { building: BuildingDto, balance }
DELETE /buildings/:id       → { refund: number, balance }
```

- **Purchase** (`POST /buildings`), one transaction:
  1. lock the project (owned by the user, not archived), then the user row (`FOR NO KEY UPDATE`), the same order as section 12.7;
  2. validate `type` against the catalogue and the plot against `placeablePlots`;
  3. require `balance ≥ 0` and `balance ≥ price`;
  4. insert a `purchase` ledger entry (`amount = −price`, `ref_type 'building'`, `ref_id` = the building id) and the `buildings` row.
- **Remove** (`DELETE /buildings/:id`): lock the project then the user, insert a `refund` ledger entry (`amount = refundFor(price)`, `ref_type 'building'`, `ref_id` = the building id), delete the row. The purchase entry stays live: a refund is not a reversal.
- **Ledger:** the `ledger_kind` enum gains `refund` (migration `ALTER TYPE … ADD VALUE`). Ledger rows have no foreign key to buildings, so history outlives them.
- **Project delete** cascades its buildings and refunds nothing, as section 12.5 reverses nothing on project delete.
- **Errors:**
  - unknown `type`, or a plot that is off the flat interior or the commons centre: `422 validation_failed`;
  - a plot already occupied, including two placements racing for one plot (the unique index decides): `409 conflict`;
  - balance negative or below the price: `409 insufficient_supplies`, a new error code;
  - a project or building the user does not own: `404`.
- `GET /projects/:id/buildings` from section 6 is dropped; `GET /world` already returns buildings.
- `GET /economy` and the balance need no change: the balance is the sum of ledger entries, purchases and refunds included.

### 15.4 Shop panel (web)

- A `Shop` chip in the HUD in island and district views. It is hidden in the archipelago view (too far out to pick a plot) and on the card fallback (placement needs the scene).
- The shop opens in `EditorFrame`: a full-screen sheet on phone, a centred dialog on desktop.
- A grid of items: a static SVG silhouette per type (the shop never loads the 3D chunk), the name and the price.
- An item is disabled when the price exceeds the balance, with the reason: "Need N more", or "Balance is negative" below zero.
- If the island has no placeable plot, every item is disabled and the panel says "No free land. Islands grow as you add tasks."

### 15.5 Placement mode (web)

- `WorldScreen` holds `placing: { type, plot: Hex | null } | null`.
- **Enter:** picking an item closes the shop, collapses the sheet to its lowest detent, and outlines every placeable plot of the current island with a soft `brand` hex glow (one instanced mesh). A bar replaces the switcher strip: "Tap a glowing plot" and `Cancel`.
- **Pick:** tapping a glowing plot puts a ghost there (the decoration's model at 50% opacity), and the bar becomes `Place · <price>` / `Cancel`. Tapping another glowing plot moves the ghost. Taps on structures, landmarks, sea or non-glowing terrain do nothing. Panning works as usual; the 6px tap rule (section 13.5) applies.
- **Tap to plot:** the glowing outlines are one pickable instanced mesh (a flat hex disc per placeable plot, just above the land); its instance id is the tapped plot. The ghost has no handlers, so taps pass through it to the glow below.
- **Cancel:** the `Cancel` button, `Esc`, back, and any route change.
- **Confirm:** `POST /buildings`; the button is disabled with a spinner while in flight. On success: patch the cached balance from the response, refetch `/world`, leave placement mode, toast "<Name> placed · −<price>". On `409`/`422`: an error toast with the server message, and placement stays open on the same item with the ghost cleared.
- Placement is not optimistic: the server decides validity.
- **Refetch while placing:** the glowing set is recomputed from the new world; if the ghost's plot is no longer placeable, the ghost clears.

### 15.6 Removing (web)

- Outside placement mode, tapping a decoration selects it with the `brand` ring used for tasks; selecting a decoration clears any selected task and vice versa.
- A bar shows "<Name> · Remove (+<refund>)". Remove asks "Remove <name> for <refund> Supplies back?"; confirming calls `DELETE`, patches the balance, refetches and toasts "+<refund> Supplies".

### 15.7 Rendering

- `buildSceneModel` adds `decorations: { buildingId, type, position, rotation }[]` per island and passes decoration plots to `islandRadius`.
- `scene/models/decorations.ts` builds each type once as a merged low-poly geometry with palette vertex colours, inside its hex footprint; one `InstancedMesh` per type with a blob shadow, the same pattern as structures (section 13.3).
- The web fake API gains `GET /shop`, `POST /buildings` and `DELETE /buildings/:id`, enforcing the same rules through the shared functions.

### 15.8 Testing

- **Shared:** `islandRadius` with decorations; `placeablePlots` excludes occupied hexes, the commons centre and the shore; `refundFor`; catalogue prices are positive integers with unique types.
- **API:** every route's success path; 401, 404 (another user's project or building, an archived project), 422 (unknown type, shore plot, commons centre, off-island plot) and 409 (occupied plot, negative balance, balance below price); two concurrent placements on one plot → one 201, one 409; the purchase and refund ledger entries and the returned balance; deleting tasks after placing an edge decoration keeps the island radius; project delete leaves the ledger untouched.
- **Model:** decorations appear in the scene model with their rotation; decoration plots count toward the island radius; the web placeable set for an island equals `placeablePlots` over that island's occupied hexes.
- **Scene graph:** decoration instance counts per type; in placement mode, a tap on a glowing plot reports that plot and a tap on a structure or landmark reports nothing; a decoration tap selects it.
- **App** (RTL, stub-scene seam): the `Shop` chip shows only in island and district views on the scene; affordability states (enough, short, negative, no free land); picking enters placement and collapses the sheet; every cancel path; confirm success patches the balance and toasts; a 409 keeps placement open; remove confirm and refund toast.
- **Manual:** buy, place and remove on a phone over the LAN and on desktop.

## 16. Phase 5b Design Addendum (approved 2026-10-08)

Phase 5b finishes Phase 5: reward animations (section 7.6 "Reward feedback", section 7.7), the performance pass (section 7.6 "Performance"), and the triaged carry-overs from Phases 2b, 3, 4a, 4b and 5a. This section refines sections 7.6, 7.7, 13, 14 and 15; where they disagree, this section wins.

### 16.1 Reward events (`apps/web/src/rewards/`)

- `reward-store.ts` holds short-lived events, built like the edge-indicator store (`get`/`subscribe`, no React state in the scene loop):
  `RewardEvent { id, target: { kind: 'task' | 'building', id } | null, amounts: number[], at }`.
- An event expires 1.6s after `at`. Events are pushed only from a mutation's server response, never from a refetch or a world diff, so a refetch never replays an effect.
- **Producers:**
  - task complete (`useTaskActions`): target the task, `amounts` = the response's reward amounts in order (task reward, milestone bonus, streak bonus);
  - task reopen: no event (the balance chip counts down);
  - placement (`usePlaceBuilding`): target the new building, `amounts: []` (a pop, no float; the cost is in the toast and chip);
  - removal and daily claim: no event (chip only).
- **Reconciliation:** the optimistic status flip shows the finished building at once; the pop and floats wait for the server response. On an error rollback no event is pushed.
- Toasts stay unchanged as the full text breakdown.

### 16.2 Effects

- **Floating "+N":** a drei `<Html>` per amount (`+37`, palette `warning` text on a `surface-primary` pill), rising 1.2 world units and fading out over 1.4s. Lines stagger by 150ms. It starts above the target structure when the target's island is the focused island (island or district view); in the archipelago view it starts above the island centre. A target not in the scene model shows no float.
- **Pop:** a newly done structure or a newly placed decoration scales 0 → 1.15 → 1 over 400ms (ease-out back). `ModelInstances` gains an optional `pop: { index, startedAt }` and animates only that instance's matrix in `useFrame`; the target index is resolved from the scene model after the refetch puts the building in place.
- **Balance chip:** `useCountUp(value)` eases the displayed number from the previous value to the new one over 600ms with a DOM `requestAnimationFrame` (not three). The chip's `aria-label` always states the true balance.
- **Reduced motion:** no floats, no pop, the chip shows the new value at once.

### 16.3 Adaptive quality

- drei `<PerformanceMonitor>` inside the Canvas sets a `quality` state held by `WorldScene`: `'high' | 'low'`.
  - `high` (start): `dpr={[1, 2]}`, sea wave on.
  - `low`: `dpr={1}`, sea wave frozen flat (the shallows ring stays).
  - The monitor gets only `bounds`, `onDecline` and `onIncline` (no `flipflops`/`onFallback`: drei counts every incline or decline call as a flip-flop, so a healthy device inclining repeatedly would fall back within seconds).
  - `onDecline` → `low`, `onIncline` → `high`. `nextQuality` counts only real tier changes (high↔low); after 3 it settles on `low` for the rest of the page load. The tier is not persisted.
  - The monitor samples rendered frames, so it is mounted only while the ticker runs. On a world where nothing ticks (low tier, no crane, no reward, no camera motion) it is unmounted, so `low` is effectively sticky for the page load.

### 16.4 Ticker on demand

- The 30fps ticker (section 13.3) runs only while something moves: the sea wave is on (`high` tier), a crane is in the scene (the world has a `doing` task), a reward effect is alive, or a camera flight or spring is running. Otherwise the scene renders on change only.
- Under `prefers-reduced-motion: reduce` it never runs, as before.
- Every `useFrame` consumer (camera rig, sea, crane jibs, pop, floats) clamps `delta` to 100ms, so the first frame after a hidden tab cannot skip a flight.
- A motion that starts from rest (a camera flight, a pop, a float line) ignores the delta of its first frame: with the ticker idle that delta is the whole idle gap, not motion time.
- A camera flight captures its frame (cover and viewport) at flight start; a cover change mid-flight no longer jumps the hop zoom.

### 16.5 Instrumentation and tuning

- **`?perf` overlay:** when the page URL has `?perf` (read once at load), a small corner panel shows fps over the last second of rendered frames, quality tier, draw calls and triangles (`gl.info.render`) and the current DPR. It ships in production builds and costs nothing without the flag.
- **`scene/tuning.ts`** gathers every device-tunable value: hemisphere and directional light intensities, sea amplitude and speed, flight and spring durations, band strength, marker size and colour, pop and float timings. 5b moves today's values there unchanged.
- **Exit criterion:** a manual `?perf` check on the owner's phone: the overlay shows ≥ 55fps on `high` while panning the busiest island for 10s (idle readings cap near the 30fps ticker), or the tier settles on `low` and shows ≥ 55fps there. The 55fps reading is the panning check only; the monitor's own bounds sit below the ticker's 30fps. Constants are tuned in a short follow-up from those readings.

### 16.6 Carry-over fixes

- **Sheet (`panel-frame.tsx`):** the `dragged` flag clears on the next `pointerdown`, not in a microtask, so a mouse drag no longer fires a click; `pointercancel` restores the previous detent; the dead `_event`/`MouseEvent` parameter goes.
- **Editor dialog (`editor-frame.tsx`):** crossing the 1024px breakpoint while open re-runs `showModal`/`close` for the new layout (the form remounts in the new container, so unsaved input resets; acceptable for a rare resize or rotation); the stray `relative` class goes; `autoFocus` applies on desktop only.
- **Resize handles:** `role="separator"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax` and `aria-orientation`.
- **Streak hint:** tapping the streak chip opens a small popover with "Next bonus at N days: +X" (or "Top streak bonus reached" when there is no next bonus); a tap outside it, Escape or a blur closes it; the chip's tap target is 44px tall; the `title` stays for hover.
- **Switcher strip:** at the 92dvh detent its top is clamped to stay inside the viewport on short phones.
- **Edge markers:** the top inset grows by the HUD chips' measured height, so no marker sits under them.
- **Placement late settle:** `onSuccess`/`onError` of a purchase check the attempt id, so a purchase from island A settling after A→B→A cannot end a fresh placement on A.
- **Shop chip:** hidden until the scene chunk has loaded and reported ready (`onReady` from `WorldScene`).
- **Rotation:** `decorationRotation(plot)` becomes an integer hash of `(q, r)` mod 6 in `packages/shared`, so turns no longer repeat along anti-diagonals. New placements only; stored rotations are not migrated.
- **Shop panel:** the disabled reason is read once (in `aria-describedby` only, not in the name); the dimming applies to the card body, not the red reason; "Placing…" gains a small spinner (a new `Spinner` in `apps/web/src/app/spinner.tsx`: a bordered `animate-spin` circle, static under reduced motion).
- **Remove:** a synchronous in-flight ref, so a fast double tap sends one `DELETE`.
- **Still parked:** refund at the price paid, the `removedProject` ref in `WorldScreen`, removal on archived projects, the forward-only marker sweep.

### 16.7 Testing

- **Unit:** reward store (push, expiry, subscribe); `useCountUp` (eases, snaps under reduced motion, label stays true); ticker demand (on and off for each condition); `decorationRotation` varies along an anti-diagonal.
- **Producers:** completing a task pushes an event with the server's amounts in order; a reopen, removal, claim or failed request pushes none; a placement pushes a pop event.
- **Scene graph** (`advanceFrames`): the pop instance's scale passes above 1 and settles at 1; a float appears and is gone after expiry; reduced motion shows neither; the `low` tier sets DPR 1 and freezes the sea; delta clamp keeps a long frame from finishing a flight; a cover change mid-flight leaves the hop zoom unchanged; momentum past the edge springs back.
- **App** (RTL): `?perf` renders the overlay only with the flag; the shop chip waits for scene ready; the A→B→A settle leaves the new placement open; a double-tap remove sends one request; the streak popover opens on tap; the sheet drag/click, `pointercancel` and breakpoint dialog fixes; resize-handle ARIA values.
- **API:** the "district centre" 409 test inserts a real milestone. **Fake API:** the shop branches the 5a test skipped. **Scene:** placed decorations' rotation matrices.
- **Manual:** the `?perf` reading on the owner's phone (section 16.5), and a look at floats, pop and count-up on phone and desktop.

## 17. Phase 5c Design Addendum: Sea Dressing (approved 2026-10-08)

Phase 5c makes the open sea read as a place rather than an empty plane, before Phase 6 ships. It adds faceted gradient water, static open-water props, a soft horizon, an empty-state island and progress-driven ambient life. It refines sections 13.3, 16.3 and 16.4; where they disagree, this section wins. No API or DTO change: everything derives client-side from `GET /world`.

### 17.1 Faceted water

- The sea keeps its one plane and its wave (section 13.3). `seaMaterial` gains `vertexColors: true` (it is already flat-shaded), so the existing wave catches the light as low-poly facets on `high`.
- **Depth gradient:** each sea vertex is coloured by its distance to the nearest island's shallows edge (`islandExtent(radius) + SHALLOWS_MARGIN`): `scenePalette.shallows`-tinted `sea` at the edge, blending to a new `seaDeep` token (`mix(colors.brand, colors.textPrimary, 0.35)`) at `SEA_DEEP_DISTANCE` world units and beyond. The colours are computed once per geometry (bounds and island layout), not per frame.
- With no islands the whole plane is `seaDeep` blending to `sea` around the empty-state island (17.4).
- `SEA_SEGMENTS` moves to `scene/tuning.ts`; facet size is tuned on device.

### 17.2 Open-water scatter (`scene/model/sea-scatter.ts`, pure)

- **Types:** `rock`, `islet` (a tiny grassy hex with one palm), `sandbar`, `buoy`. Low-poly models in `scene/models/`, coloured from `scenePalette` only.
- **Placement is per sea-grid cell, never per island:** the world is cut into square cells of `SCATTER_CELL` world units. Each cell's integer hash of `(cx, cz)` (the same hash family as `decorationRotation`) decides whether the cell holds a prop, which type, its offset inside the cell and its rotation. Adding, growing or moving an island never reshuffles a prop in a cell it does not cover.
- **Exclusions:** a cell's prop is dropped when it sits within `SCATTER_CLEARANCE` of any island's shallows edge, or within `LANE_HALF_WIDTH` of a sea route (17.5). Only cells within `SCATTER_EXTENT` of the islands' bounds are considered, which caps instance counts; each type is also capped at `SCATTER_MAX_PER_TYPE`.
- **Rendering:** one instanced mesh per type, static, on both tiers. Props are not tappable; a tap on one counts as a tap on the sea.

### 17.3 Soft horizon

- **Fog:** a linear `THREE.Fog` in `seaDeep`, which also becomes the scene background, so the sea's far edge dissolves into the background instead of ending at a hard line.
- The camera is orthographic at a fixed `ISO_DISTANCE` along (1, 1, 1), so its distance never changes with zoom and a fog keyed on it would do nothing. Instead a `FogRig` sets `near` to the view depth of the farthest corner of the islands' bounds plus `FOG_MARGIN`, and `far = near + FOG_DEPTH`, on every rendered frame (pan moves the depths; it rides the existing frame loop and adds no ticker demand). No island is ever fogged; the sea, scatter and life beyond the archipelago's far edge (the top of the screen) fade into the background.
- Island labels, floats and edge markers are DOM and are unaffected by fog.
- **Vignette:** a `pointer-events-none` CSS radial gradient over the canvas (transparent centre, `seaDeep` at about 25% opacity at the corners), under the HUD and sheet. It is absent in the card fallback.

### 17.4 Empty state: "Uncharted waters"

- With zero projects, the scene shows a ghost island at the origin: radius-1 terrain from a fixed seed, drawn with `ghostMaterial`, no label, no structures.
- A drei `<Html>` card anchored above it reads **"Uncharted waters"** with a **Create your first island** button that opens the existing new-island editor (`onNewProject`). It replaces the HUD's "No islands yet" text chip; the HUD's "New island" chip stays.
- When the first project appears, the ghost and the card unmount and the opening focus (section 14.2) frames the new island.
- **Card fallback (no WebGL):** "No islands yet" becomes the same heading plus a Create your first island button.
- Nothing on the empty state animates; it sits like any island.

### 17.5 Ambient life (`scene/model/ambient-life.ts`, pure)

`buildAmbientLife(scene, world, now)` returns plain data (routes, centres, phases, spots); no three.js.

- **Sea routes** (`seaRoutes(islands, bounds)`, shared with 17.2): the layout puts neighbouring islands' shallows only about 0.8 world units apart, so there is no lane between adjacent islands. A **lane** joins two islands whose slots are at most 2 apart when the straight line between their origins stays at least `shallows + LANE_HALF_WIDTH` from every other island and the water between their shallows (less `BOAT_OFFSHORE` at each end) is at least `MIN_LANE` long, which in practice means across an empty slot. A boat sails a lane out and back. With no qualifying lane there is one **loop**: a circle `BOAT_OFFSHORE` beyond the shallows of a lone island, or around the islands' bounds. Routes depend only on the layout, never on progress.

| Life | Driven by | Rule |
|---|---|---|
| Boats | tasks with `completedAt` in the last 7 days | `min(4, ceil(done / 3))` boats, spread over the sea routes from a seeded start, each at a seeded phase; none at 0 |
| Gulls | islands with a completion in the last 24h | 3 gulls circling each, at most 3 islands, most recent completion first |
| Whale | `economy.streak.activeToday` | one breach every 25–40s (seeded) at an open-water spot at least `WHALE_CLEARANCE` from every island, with a splash ring; none when false |
| Foam rings | every island | a hex ring at the shallows edge, static geometry, always present; opacity pulses slowly on `high` |

- **Seeds** come from project ids and island seeds, not from list order. Boat `i` keeps its lane and phase when a later completion adds boat `i+1`; a later `now` within the same windows yields the same data.
- **Rendering:** one instanced mesh for boats, one for gulls, one foam-ring instanced mesh, one whale and one splash mesh. Life is not tappable.
- **Frames:** life adds no ticker. `TickerDemand` gains `life` (true when the tier is `high`, motion is allowed and any boat, gull or whale exists), so life keeps animating if the sea wave is ever idled; until then it rides the sea's ticker on `high` at no extra frame cost.
- **`low` tier and reduced motion:** boats freeze at their seeded phase on their lane, gulls freeze mid-circle, the whale and the foam pulse are hidden. No frames are requested for life.

### 17.6 Tuning

`scene/tuning.ts` gains a "Sea dressing" block: `SEA_SEGMENTS`, `SEA_DEEP_DISTANCE`, `SCATTER_CELL`, `SCATTER_CLEARANCE`, `SCATTER_EXTENT`, `SCATTER_MAX_PER_TYPE`, scatter type weights and fill probability, `LANE_HALF_WIDTH`, `MIN_LANE`, `BOAT_OFFSHORE`, `FOG_MARGIN`, `FOG_DEPTH`, vignette opacity, boat speed, gull radius and speed, whale interval range and `WHALE_CLEARANCE`, foam pulse period.

### 17.7 Testing

- **Pure model (`*.test.ts`):**
  - Sea dressing: scatter is deterministic for a world; adding an island never moves a prop in a cell it does not cover; no prop lies within the clearance of any shallows or on a sea route; adjacent islands get no lane, an empty slot between two islands gives one, and no lane falls back to the loop; the depth gradient is darkest far from land and lightest at the shallows.
  - Ambient life: boats at 0, 1–3, 4–6 and >12 completions in 7 days (cap 4); a completion older than 7 days does not count; a lone island gives a loop; gulls only on islands with a completion in 24h, at most 3, most recent first; the whale only when `activeToday` and clear of every island; the same world at a later `now` in the same windows gives identical data; one extra completion leaves existing boats unchanged.
  - `tickerWanted`: cases for `life`.
- **Scene graph** (test renderer, `advanceFrames`): the sea material is flat-shaded with vertex colours; fog is set, and its near distance clears every island's far corner after a pan; one instanced mesh per scatter type with the expected count; on `high` boat and gull instance matrices change across frames; on `low` and under reduced motion they do not, and the whale and foam pulse are absent; sea and life on `high` start one ticker, not two.
- **App** (RTL): zero projects renders the "Uncharted waters" card and its button opens the new-island editor; creating the first island removes the ghost and frames the island; the card fallback shows the same heading and button; the vignette renders over the canvas only.
- **Manual (exit criterion):** the owner's `?perf` reading on their phone while panning, on both tiers: draw calls at most 12 above the 5b baseline and no tier drop on `high` attributable to 5c. Constants are tuned from those readings.

## 18. Phase 5d Design Addendum: Island Growth (approved 2026-10-08)

Phase 5d fills the island interiors, which sections 9 and 13 leave as a flat green slab. Islands gain seeded scenery, hills, paths and a dock that grow with the number of finished tasks on them, so each island is a visible record of the work done there. It refines sections 13 and 17; where they disagree, this section wins. No API or DTO change: everything derives client-side from `GET /world`, and the land rule (section 15.2) is untouched: hills and scenery are visual only.

### 18.1 Stages

An island's **stage** comes from its count of tasks with `status === 'done'` (`doing` and `todo` do not count):

| Finished tasks | 0–2 | 3–7 | 8–14 | 15–29 | 30+ |
|---|---|---|---|---|---|
| Stage | 0 bare | 1 sprouting | 2 green | 3 lush | 4 overgrown |

Thresholds live in `scene/tuning.ts` (`GROWTH_THRESHOLDS = [3, 8, 15, 30]`). Growth only goes backwards if finished tasks are deleted.

### 18.2 Growth model (`scene/model/island-growth.ts`, pure)

`islandGrowth({ seed, radius, stage, tiles, occupied, paths })` returns plain data, no three.js:

- **Growth order:** every hex of the island that is not the commons centre gets a fixed rank in [0, 1) from its own salted integer hash of `(seed, q, r)` (`hashInts` with `RANK_SALT`, section 17.2's family), independent of the hill noise's lattice hash. A hex is revealed when its rank is below its stage's fill (below), so a higher stage only adds pieces: every piece at stage N is unchanged (type, offset, turn, scale) at stage N+1.
- **Fill:** at stage `s` about `GROWTH_FILL[s]` of the free interior hexes are revealed (`[0.05, 0.2, 0.4, 0.6, 0.75]`). Shore hexes (the outer `SHORE_RINGS`, never plots) fill at half that share. Each hex decides alone, so the share is statistical, not exact.
- **Exclusions:** no scenery on an occupied hex (a task's plot or a decoration's plot), a path hex or the dock hex (18.4), or the commons centre. The dock hex is kept free of scenery at every stage, although the dock itself appears only from stage 2, so the dock never lands on a hex scenery already grew on. Occupying a hex hides only that hex's scenery; the rank of every other hex is unchanged.
- **Clusters:** a revealed hex holds 1–3 pieces at seeded offsets within `0.55` of the hex centre, each with a seeded turn at any angle and a scale in `[0.8, 1.2]`.
- **Types by place:** interior hexes draw from `tree`, `flowers`, `grass`; interior hexes adjacent to the shore draw from `bush`, `rock`; shore hexes draw from `rock`, `reeds`, `driftwood`. Weights in tuning.
- **Shop distinction:** scenery is smaller than decorations (tree canopy at most 0.6 of the shop pine's height), muted (`scenePalette` scenery tokens, darker and less saturated than the decoration colours) and clustered, so the shop's single-standing pine and palm still read as purchases.
- **`low` tier:** a fixed, seeded half of the revealed hexes keep their whole cluster (bit 0 of a second hash of `(seed, q, r)`); same layout, thinner, and stable across stages.

### 18.3 Terrain (`scene/model/terrain.ts`)

`islandTerrain(seed, radius, stage, paths)` replaces `islandTerrain(seed, radius)`:

- **Hills:** interior tile height is `LAND_HEIGHT + step(noise(seed, q, r) · HILL_MAX[stage])`, where `noise` is a smooth seeded value noise over hex coordinates, `step` rounds to `HILL_STEP` (0.15), and `HILL_MAX = [0.15, 0.3, 0.4, 0.5, 0.6]`. The commons centre is always exactly `LAND_HEIGHT`. Shore heights are unchanged.
- **Tone by stage:** stage 0 grass uses a new `grassDry` token; each stage blends one step from `grassDry` to `grass`, and the meadow share rises from 0.1 at stage 0 to 0.35 at stage 4.
- **Path tone:** path hexes (18.4) get a new `path` tone (sand, `scenePalette.path`).
- **Heights reach everything on the land:** `buildSceneModel` gives every structure, district and decoration position a `y` (its hex's tile height). Structures, landmarks, decorations, shadows, crane jibs, labels, plot highlights, the placement ghost and reward floats stand at `position.y` instead of `LAND_HEIGHT`. `Point` stays `{ x, z }`; positions on the land become `Spot = Point & { y: number }`.

### 18.4 Paths and dock

- **Paths:** for each milestone with at least one finished task, the hexes of the straight hex line (`hexLine`, added to `packages/shared/src/hex.ts`) from the commons centre to the milestone's district hex, excluding both ends, are path hexes. Structures may still stand on a path hex; it only changes the tile tone and hides scenery.
- **Dock:** from stage 2, one wooden jetty stands on an outer-shore hex chosen from the island's seed (the first outer-shore hex in hash order that is present, i.e. not cut for the ragged coast), turned to point away from the island centre. The same seed always picks the same hex while the radius is unchanged.

### 18.5 Scene model and rendering

- `SceneIsland` gains `stage: number`, `paths: Hex[]`, `scenery: SceneryPiece[]` (`{ id, type, position: Spot, turn, scale, low }`, `id` being `q,r:k` for the hex and the piece's index in its cluster) and `dock: { position: Spot, turn } | null`.
- **Placement ghost:** while placing a decoration, the scenery on the ghost's plot is hidden (`SceneryLayer`'s `hidden` prop), since a purchase clears that plot (plots win, 18.2). Hiding is applied when items are built, not to the stable key, so it never counts as a stage change and nothing grows in when the ghost moves away.
- **Terrain:** hills, tones and paths are baked into each island's existing terrain mesh (tile heights and vertex colours), adding no draw call. The terrain geometry memo keys on seed, radius, stage and the path set, not on the island object.
- **Scenery layer** (`scene/scenery.tsx`): one instanced mesh per scenery type across the whole archipelago (7 types), plus one for docks: 8 draw calls however many islands exist. Positions are world-space (island origin plus local spot). The layer is not tappable (`raycast` disabled), so a tap reaches the terrain or island beneath. It rebuilds only when some island's growth inputs change (the stable-key pattern of `use-stable-shores.ts`), not on every refetch.
- **Grow-in:** when an island's stage rises while the scene is mounted, the newly revealed pieces scale from 0 to their scale over `GROW_IN_MS` (600) with an ease-out. Only on `high` with motion allowed; `TickerDemand` gains `growth`, true only while a grow-in runs. Otherwise new pieces simply appear. A first mount never grows in.
- **Models** (`scene/models/scenery.ts`): low-poly, 12–40 triangles each, coloured from `scenePalette` only.

### 18.6 Tuning

`scene/tuning.ts` gains an "Island growth" block: `GROWTH_THRESHOLDS`, `GROWTH_FILL`, shore fill factor, `HILL_STEP`, `HILL_MAX`, meadow share by stage, scenery type weights, cluster offset and scale range, `GROW_IN_MS`.

### 18.7 Testing

- **Pure model (`*.test.ts`):**
  - Stage at 0, 2, 3, 7, 8, 15 and 30 finished tasks; `doing` and `todo` tasks do not count.
  - Growth only adds: for several seeds, every piece at stage N is present and identical at N+1.
  - Determinism: the same inputs give the same scenery.
  - No scenery on an occupied hex, a path hex or the commons centre; occupying one hex removes only that hex's pieces.
  - Fill per stage within tolerance of `GROWTH_FILL`; shore types only on shore hexes, interior types only inland.
  - Hills: the centre is flat, heights are multiples of `HILL_STEP` above `LAND_HEIGHT`, and the maximum rise respects `HILL_MAX[stage]`. Structures, districts and decorations report their tile's height.
  - Paths only for milestones with a finished task, along `hexLine`, with the `path` tone. `hexLine` gets its own tests in `packages/shared`.
  - Dock absent below stage 2, on a present outer-shore hex, turned outward, and stable as the stage rises.
  - `low` keeps about half the hexes, whole clusters at a time, and is a subset of `high`.
  - `tickerWanted`: cases for `growth`.
- **Scene graph** (test renderer): one instanced mesh per scenery type plus the dock mesh for a multi-island world; taps on scenery reach the terrain; a refetch with identical content does not rebuild the scenery; on `high` a stage rise animates new instances' scale and requests the ticker only during the grow-in; on `low` or reduced motion new pieces appear at full scale with no ticker.
- **App** (RTL): finishing the task that crosses a threshold reaches the scene as the island's new stage.
- **Gate:** web and API tests, typecheck, lint and build; three.js only in the world-scene chunk; the three-free boundary (world/, layout/ and app/ import only `scene/model/*`, `scene/tuning.ts` and `scene/use-reduced-motion.ts`) holds.
- **Manual (exit criterion):** the owner's `?perf` reading on their phone while panning, on both tiers: draw calls at most 8 above the 5c reading and no tier drop on `high` attributable to 5d; a visual pass on desktop and phone. Constants are tuned from those readings.

## 19. Phase 5e Design Addendum: Layer Focus and Island Picker (approved 2026-10-08)

Phase 5e makes each layer (archipelago, island, district) feel like its own room. The camera stays inside the current layer, island selection moves out of the drawer into a picker at the top of the scene, the island drawer gains a milestone filter that navigates, and the archipelago is spaced out on a lighter sea. It refines sections 13.4, 14, 16 and 17; where they disagree, this section wins. No API or DTO change.

### 19.1 Camera bounds and zoom per layer (`scene/model/camera.ts`, pure)

- `focusBounds(model, focus): Bounds`:
  - **Archipelago:** `model.bounds` (unchanged).
  - **Island:** the island's shallows square: origin ± `shallowsRadius(radius)` on x and z.
  - **District:** the axis-aligned box around the district's landmark and every task plot of that milestone, grown by `DISTRICT_MARGIN` (2 hexes, `2 × SQRT3` world units) on each side, in world space.
  - An unknown island or milestone falls back a level, as `cameraTarget` does.
- `focusOutline(model, focus): Point[]`: what the opening zoom must show. **Island:** 12 points on the circle of radius `shallowsRadius(radius)` around the origin (it encloses the shallows hexagon without the square's empty corners). **District:** the four corners of the district box. **Archipelago:** the four corners of `model.bounds`.
- `fitZoom(outline, viewport): number`: the largest zoom at which every outline point, projected through the isometric screen basis (`toScreen`), fits inside `viewport` (canvas px minus the HUD inset at the top and the sheet cover at the bottom), times `FIT_MARGIN` (0.9). With no viewport it is 0, so the floors below apply.
- `cameraTarget(model, focus, anchor, viewport)`:
  - **Archipelago:** unchanged.
  - **Island:** the island origin at `max(fitZoom(focusOutline), ISLAND_ZOOM)`.
  - **District:** the centre of the district box at `max(fitZoom(focusOutline), DISTRICT_ZOOM)`.
  - `ISLAND_ZOOM` (48) and `DISTRICT_ZOOM` (72) stay the readability floors of 13.4: a large island opens at the floor and is panned within its bounds rather than shrunk below the 44px tap target.
- **Camera rig:** the pan target is clamped (and rubber-banded, 14.3) to `focusBounds` of the current focus instead of `model.bounds`. Zoom is clamped between the target's zoom and `MAX_ZOOM_FACTOR` × it, so zooming out never shows more than the current layer's area. Flights (14.1) keep their timing; only their end point and zoom change. The fit is recomputed when the viewport or the sheet cover changes, never on a data refetch alone (14.3's focus-key rule).

### 19.2 Spacing and a lighter sea

- `ISLAND_GAP` (`scene/model/scene-model.ts`) goes from 3 to 8 hex rings of open sea between neighbouring islands' land. Island origins stay `slot × (2 × largest radius + ISLAND_GAP)` (section 9); shallows of neighbouring radius-4 islands now sit about 9.4 world units apart (0.8 before), so the sea-route rule of 17.5 finds lanes between neighbours.
- **Palette** (`scene/model/palette.ts`), all blends of A'raf tokens, lightest at the coast:

| Key | Was | Becomes | Hex |
|---|---|---|---|
| `shallows` (island plate) | `brandSecondary` | `mix(brandSecondary, surfacePrimary, 0.6)` | `#99c3ed` |
| `seaShallow` (sea at the coast) | `mix(brand, brandSecondary, 0.3)` | `mix(brandSecondary, surfacePrimary, 0.45)` | `#73ade6` |
| `sea` | `brand` | `mix(brandSecondary, surfacePrimary, 0.3)` | `#4d96e0` |
| `seaDeep` (open sea, fog, background) | `mix(brand, textPrimary, 0.35)` | `mix(brandSecondary, surfacePrimary, 0.15)` | `#2680d9` |

  The scene background, fog, vignette and the world view's section background follow `seaDeep` as before. Values are tuned on the owner's screen.

### 19.3 Island picker

- A native `<select>` styled as a pill, accessible name "Island", in the world HUD:
  - **Desktop:** centred at the top of the scene, on the HUD's row (HUD chips stay left).
  - **Phone:** centred on its own first row; the HUD chips wrap to the row below. The HUD inset measured for edge markers (14.4) covers both rows.
- **Options:** "All islands" (the archipelago), then every active island in switcher order, labelled with its urgency: `Name · N overdue`, `Name · due soon`, or just `Name`.
- **Value:** "All islands" on the archipelago; the current island on the island and district layers.
- **Change:** routes to `/` or `/p/:projectId`; the camera flies as for any route change.
- The `IslandSwitcher` is removed from the drawer (desktop panel and phone floating strip). The drawer's accessory slot keeps the placement bar and the building bar (15.5, 15.6). The archipelago drawer ("Due today & overdue", search, list) is unchanged.

### 19.4 Milestone filter (island and district drawers)

- A native `<select>` with accessible name "Milestone", under the drawer title beside "New task", on the island and district layers only.
- **Options:** "All tasks", "No milestone", then the island's milestones in `sortOrder`.
- **Behaviour:**

| Pick | Effect |
|---|---|
| A milestone | Routes to `/p/:projectId/m/:milestoneId`; the camera flies into the district; the list shows that district's tasks. |
| "All tasks" | From a district, routes to `/p/:projectId`; on the island, clears the filter. |
| "No milestone" | Stays on the island route; the list shows only tasks with `milestoneId === null`. Local state, not a route. |

- **Value:** the district's milestone on a district route; "All tasks" or "No milestone" on the island route. The "No milestone" filter resets when the route changes.
- **New task** inherits it: on a district, or with "No milestone" picked, the task form's milestone defaults to that milestone (or none).

### 19.5 Testing

- **Pure:** `focusBounds` per layer and its fallbacks (the district box contains the landmark and every plot of the milestone, plus the margin); `fitZoom` fits every projected outline point inside the viewport and grows when the viewport grows; `cameraTarget` never goes below `ISLAND_ZOOM`/`DISTRICT_ZOOM`; islands keep at least `ISLAND_GAP` rings of sea between their land; every palette colour is still a token or a blend of tokens.
- **Scene graph:** on an island route, a pan past the island is pulled back inside its shallows square and the zoom-out stops at the target zoom; the same for a district.
- **App (RTL):** the picker renders on all three layers on desktop and phone with the right value and urgency labels, and changing it routes; no island chips remain in the drawer or above the sheet; the archipelago drawer still reads "Due today & overdue"; the milestone select routes into and out of districts, "No milestone" filters and resets on leaving the island, and New task defaults to the filter's milestone.
- **Manual:** the owner's visual pass on desktop and phone (colours, spacing, how big islands open), and `?perf` with no regression from 5d.

## 20. Phase 5f Design Addendum: Spotlight, Layer Taps and the Layer Picker (approved 2026-10-08)

Phase 5f finishes the "each layer is a room" idea of section 19. Entering an island or a district dims everything outside it, taps outside it do nothing, the camera centre stays on the layer, and the top-centre picker lists the current layer's contents (islands on the archipelago, milestones on an island). The drawer's milestone filter of 19.4 is removed; the task search is the drawer's only filter. It refines sections 14, 16 and 19; where they disagree, this section wins. No API or DTO change.

### 20.1 The layer area (`scene/model/camera.ts`, pure)

- `type Area = Bounds & { round?: number }`: a rounded rectangle in world x/z, the box `min..max` grown by `round` with round corners. A plain `Bounds` (no `round`) is a box with square corners; a box shrunk to a point with `round` r is a circle.
- `layerArea(model, focus): Area | null`:
  - **Archipelago:** `null` (no spotlight, nothing dead).
  - **Island:** the point box at the island origin with `round = islandExtent(radius)`: a circle out to the coastline.
  - **District:** the box around the landmark and every task plot of that milestone (as 19.1's district box, before margin), with `round = AREA_MARGIN` (half a hex, `SQRT3 / 2`).
  - An unknown island or milestone falls back a level.
- `panArea(model, focus): Area`: `layerArea`, or on the archipelago `model.bounds` with `round` 0. It replaces `focusBounds` everywhere the rig clamps.
- `areaDistance(area, p): number`: signed distance from `p` to the area's edge (negative inside). `insideArea(area, p)` is `areaDistance ≤ 0`. The spotlight shader computes the same distance in GLSL with the same constants.
- `clampToArea(area, p): Point`: the nearest point of the area to `p` (`p` itself when inside).
- `focusOutline` and `fitZoom` (19.1) are unchanged: the opening zoom still frames the shallows circle (island) or the district box grown by `DISTRICT_MARGIN`.

### 20.2 Panning

- The camera rig clamps the pan target to `panArea` of the current focus. Past the edge, the rubber band (14.3) is measured along the outward direction from `clampToArea(area, p)`: `shown = edge + dir × band(distance, limit)`, and `unband` inverts it the same way. Release springs to `clampToArea`.
- On the archipelago, `panArea` is the world box with square corners, so every existing behaviour there is unchanged.
- Island: the centre stays over land (about 40% less diagonal travel than 19.1's shallows square). District: half a hex of margin instead of two hexes.
- Zoom limits, the fitted zoom and flights are unchanged.

### 20.3 Spotlight

Amended 2026-10-09: the grey-and-darken look was too strong; the haze replaced it.

- Shared spotlight uniforms: the area's box (`vec4`), its `round`, a feather width and a strength 0..1. The shared scene materials (`solidMaterial`, `seaMaterial`, `shadowMaterial`, `foamMaterial`, `splashMaterial`, `plotMaterial`, the ghost materials) are patched once (`onBeforeCompile`) to pass the world x/z to the fragment shader and, after the fog (so fogged sea hazes too) and outside the area, blend the colour toward `scenePalette.sea` by `SPOTLIGHT_HAZE` (0.2), with a smoothstep edge `SPOTLIGHT_FEATHER` wide (two hexes, `2 × SQRT3`), all scaled by the strength. Instanced meshes use their instance matrix. No new draw calls, no per-object work.
- The clear colour (seen past the sea mesh) hazes with the sea: `hazeHex(seaDeep, strength)`, the shader's maths in sRGB, so no bright seam shows at the world's edge.
- District labels whose anchor is outside the area fade to `SPOTLIGHT_LABEL_OPACITY` (0.6). Edge markers (the HUD's shortcut to other urgent islands) and reward floats are unchanged.
- Transitions over `SPOTLIGHT_MS` (300), eased:
  - Archipelago → island or district: the area is set, the strength goes 0 → 1.
  - Island ↔ island, island ↔ district: the strength stays 1 and the area's box and `round` interpolate from the old shape to the new.
  - Any layer → archipelago: the strength goes to 0 (the area stays until it is 0).
  - Reduced motion: every change is instant. The tween holds a `spotlight` ticker demand only while it runs.
- Every spotlight number lives in `scene/tuning.ts`.

### 20.4 Taps outside the layer

- **Island:** another island's group no longer opens it; a tap there behaves like a tap on open sea (clears the selection).
- **District:** other districts' landmarks do not open; decorations whose position is outside the area do not select; tasks of other milestones keep 16's rule (a tap clears the selection). A neighbouring district's task that sits inside this district's area is lit but still does not select.
- **Placement:** in a district only plots inside the area are offered.
- Inside the area everything works as before. The ways out are the layer picker, "← Archipelago" and the parent link.

### 20.5 Layer picker (replaces 19.3's island picker and 19.4's milestone filter)

- One native `<select>` at the top centre of the scene, on every layer, phone and desktop.
- **Archipelago:** accessible name "Island"; options "All islands" then every island as 19.3 (`Name · N overdue`, `Name · due soon`, or the name). Picking an island flies there.
- **Island and district:** accessible name "Milestone"; options `"<Island name> (whole island)"` then the island's milestones by `sortOrder`, each labelled `Name · N overdue`, `Name · due soon` or the name (counts over that milestone's open tasks). On the island the first option is selected; in a district its milestone is. Picking a milestone flies into its district; picking the first option flies back to the island. An island with no milestones lists only the first option.
- The drawer loses its milestone select, including "No milestone" and its local filter (and the 5e rule that cleared it on a scene tap). New task still takes its milestone from the current layer.
- The archipelago drawer ("Due today & overdue") is unchanged.

### 20.6 Testing

- Pure: `layerArea` per layer and its fallbacks; `areaDistance`/`insideArea` for a circle and a box; `clampToArea`, the banded and unbanded targets on a circle and a box, with a square-cornered box reproducing 14.3's numbers along each side (at a corner the band now stretches outward from the corner rather than per axis).
- Spotlight: the patched materials carry the shared uniforms; the shader chunk and `areaDistance` share their constants; the tween reaches strength 1 in `SPOTLIGHT_MS`, slides the area island → island at strength 1, fades to 0 on the archipelago, is instant under reduced motion, and releases its ticker demand.
- Taps: on an island a neighbour's tap does not call `onOpenIsland`; in a district other landmarks have no open handler and outside decorations do not select; placement plots are filtered to the area.
- Rig: a diagonal pan on an island stops at the coastline circle, short of 19.1's square corner; the archipelago clamp is unchanged.
- Picker: island list on the archipelago; "(whole island)" plus milestones with urgency on an island and in a district, with the current one selected; picking flies both ways; no milestone select in the drawer.
- Owner's check: `bun run seed:demo`, desktop and phone; `?perf` shows no new draw calls and no tier drop; the spotlight edge reads on the lighter sea.

## 21. Phase 5g Design Addendum: Cloud Ring (approved 2026-10-09)

Phase 5g opens the light-and-mood phase with a cloud ring: soft low-poly clouds gather in a band just outside the current island or district, and part when you leave for the archipelago. It is the layer's main edge cue; the sea haze of 20.3 stays underneath at `SPOTLIGHT_HAZE` 0.2. It refines section 20; where they disagree, this section wins. No API or DTO change. Taps, panning and the haze are unchanged.

### 21.1 The ring (`scene/model/clouds.ts`, pure)

- `cloudRing(c: CloudArea): CloudPuff[]` with `CloudArea = { area, inset, seed }` and `CloudPuff = { x, z, nx, nz, scale, turn, phase }`: world x/z on the ground the puff appears over (before the height offset of 21.2), its unit outward direction from the ring, and a 0–1 phase that staggers its gather and offsets its drift.
  - Puffs sit in a band outside `area` (an `Area`, 20.1): the band's inner edge is the area's edge grown by `inset`, its depth `CLOUD_BAND` (two hexes, `2 × SQRT3`).
  - Puffs are spread along the band's centre line at `CLOUD_DENSITY` puffs per world unit of its length (perimeter of the rounded rectangle grown to the band's middle), each jittered across the band and along it by a seeded hash of `(seed, index)`. Scale 0.8–1.4, turn 0–2π, from the same hash. Total capped at `CLOUD_MAX` (120); past the cap the density thins evenly.
  - Same area and seed → the same ring.
- `cloudArea(model, focus): { area: Area; inset: number; seed: number } | null`:
  - **Archipelago:** `null` (no clouds).
  - **Island:** the island's layer area (20.1) with `inset = SHALLOWS_MARGIN` (the band starts at the shallows edge); seed = the island's seed.
  - **District:** by `CLOUD_DISTRICT_RING`: `'district'` (default) — the district's layer area with `inset = AREA_MARGIN`, over the island's own land; `'coast'` — the island's ring as above. Seed = `hashInts(island seed, district index + 1)`, the district's place in the island's milestone order.
  - Unknown ids fall back a level, as `layerArea` does.
- **Switches** (in `scene/tuning.ts`): `CLOUD_DENSITY` 1.0 gives the closed band; about 0.4 gives scattered puffs. `CLOUD_DISTRICT_RING` `'district' | 'coast'`.

### 21.2 Look

- Each puff is one shared low-poly geometry: 3–5 merged low-detail icosahedra, flat-shaded, built once in `scene/models/cloud.ts`.
- Colour: a new palette key `cloud = mix(surfacePrimary, brandSecondary, 0.15)` (every scene colour is a token or a blend of tokens). Material: an opaque flat-shaded Lambert `cloudMaterial` that is **not** spotlight-patched (clouds are outside the layer by design and must not haze).
- Height `CLOUD_HEIGHT` 3, above the tallest landmark. The isometric camera looks down (1, 1, 1), so a point raised by h shows over the ground point shifted by −h in x and z; puffs are drawn at `(x + h, h, z + h)` so the ring wraps the layer on screen.
- One `InstancedMesh` for every puff (old and new rings share it during a switch), `raycast` disabled: taps pass through to whatever is below.

### 21.3 Motion

- A layer change replaces the ring: the old ring's puffs shrink to 0 while drifting outward 1.5 hexes; the new ring's puffs grow from 0 while gliding in from 1.5 hexes further out. Each puff's start is staggered by up to 25% of `CLOUD_MS` (600) by its hash; ease-out. Archipelago → layer: gather only. Layer → archipelago: part only. A refetch whose `cloudArea` is unchanged (same area value and seed) does nothing.
- On the `high` tier (the sea wave is on, so the 30fps ticker already runs), resting puffs sway along the ring by `CLOUD_SWAY` (0.3) over `CLOUD_SWAY_S` (20 s) and bob by `CLOUD_BOB` (0.08) over `CLOUD_BOB_S` (6 s), each offset by its phase and each zero when the drift begins, so a finished gather never jumps. On `low`, they gather and part but rest still.
- Changing layer mid-gather parts every visible puff from the size it had reached. The first mount shows its ring at once (like the camera's first framing); route changes after it gather.
- Reduced motion: rings appear and vanish at once; no drift.
- A `clouds` ticker demand is held only while a gather or part runs.

### 21.4 Cost

- One extra draw call, up to `CLOUD_MAX` × 2 instances during a switch. Ring positions are computed only on a layer change; per-frame work is instance matrices while gathering, parting or drifting on `high`.

### 21.5 Testing

- Pure: every puff of `cloudRing` lies outside the area, between its edge + `inset` and edge + `inset` + `CLOUD_BAND`; deterministic for the same area and seed; count scales with `CLOUD_DENSITY` and respects `CLOUD_MAX`; `cloudArea` is null on the archipelago, the island ring on an island, and follows `CLOUD_DISTRICT_RING` in a district; unknown ids fall back. The height offset: a puff drawn at `(x + h, h, z + h)` projects to the same screen point as ground `(x, 0, z)` (via `toScreen`).
- Transition model: gather/part progress per puff with stagger; old and new rings during a switch; finished state has only the new ring; reduced motion is instant.
- Scene: one instanced mesh with raycast disabled; its count follows the rings; the ticker demand is held only while transitioning; no drift on `low`; a refetch with the same cloud area does not restart the gather.
- The headless WebGL compile check covers `cloudMaterial`.
- Owner's check: `bun run seed:demo`; `?perf` shows at most one more draw call than 5f and no tier drop; judge the band (B) against scattered (A, `CLOUD_DENSITY` ≈ 0.4) and the district ring against `'coast'`.
