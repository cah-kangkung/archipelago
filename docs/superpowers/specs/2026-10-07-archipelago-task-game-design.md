# Archipelago — Gamified Task Manager: Design Spec

- **Date:** 2026-10-07
- **Status:** Draft, awaiting review
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

Out of v1, planned later: XP, levels, achievements, unlockable building sets, seasonal events (RPG phase). The ledger (section 5) holds full history so these can be derived from it.

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

ledger       id, user_id, kind, amount, ref_type, ref_id, created_at
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

  A reversal references the entry it reverses.
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
- **Validation failures:** `422` with field errors.
- **Auth:** `401` when unauthenticated, `404` for resources the user doesn't own (no existence leak).
- **Business rules:** `409` for conflicts, such as an occupied plot or insufficient Supplies.
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
| < 768px (phone, primary target) | Full-screen world, 3-detent bottom sheet (`vaul`), full-screen editor sheets, touch gestures, ≥ 44px targets |
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
- **Configuration:** env vars (`DATABASE_URL`, `SESSION_SECRET`, `APP_ORIGIN`) via a `.env` file that is not committed.

## 10. Scope

### v1 (this spec)

- Single-user auth and personal API tokens.
- Full create, edit and delete for projects, milestones and tasks.
- Archipelago, island and district views with a responsive task panel, overflow panning, island switcher and edge indicators.
- Supplies economy: task rewards, milestone bonus, streaks, daily bonus, decoration shop and placement.
- Installable PWA with offline viewing.
- Docker Compose deployment with backups.

### Later phases (not in v1)

1. RPG layer: XP, levels, achievements, unlockable building sets, seasonal events.
2. Integrations: inbound webhooks, GitLab/Jira importers using the `external_*` columns and API tokens.
3. Full offline editing with a sync queue.
4. Custom Blender models replacing CC0 assets.

### Explicitly excluded

Multi-user features, tags, subtasks, recurring tasks, attachments, task dependencies, camera rotation.
