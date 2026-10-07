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

ledger       id, user_id, kind, amount, ref_type, ref_id, reverses_id, created_at
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
- **Assets:** CC0 low-poly glTF kits (Kenney, Quaternius) committed to the repo. Materials are remapped to the palette at load time.
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
| 4 | World | R3F scene: archipelago, islands, districts, task structures + states, landmarks, camera states, overflow panning, island switcher, edge indicators | The game renders the real data |
| 5 | Shop & polish | Shop catalogue, decoration placement, reward animations, performance pass on a real device | Decorations purchasable and placeable; 60fps target met |
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
