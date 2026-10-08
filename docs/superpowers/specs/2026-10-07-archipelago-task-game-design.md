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
