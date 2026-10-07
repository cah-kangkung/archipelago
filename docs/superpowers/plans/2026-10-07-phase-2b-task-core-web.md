# Phase 2b: Task Core Web App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A mobile-first responsive web app (`apps/web`) for managing projects, milestones and tasks against the Phase 2a API. It has:
- login
- an archipelago placeholder view with island cards and an island switcher
- a task panel that is a bottom sheet on phones and a side panel on desktop
- create/edit editors
- optimistic task actions

**Architecture:**
- **Stack:** Vite + React 19 + TypeScript, with TanStack Router (code-based routes) and TanStack Query.
- **API layer:** all server calls go through a small `Api` object built on Hono's typed client (`hc<AppType>`). It is provided via React context, so component tests swap in an in-memory fake API instead of mocking `fetch`.
- **Pure selectors** in `src/world/selectors.ts` derive everything the UI shows (due status, panel lists, island summaries) from the `WorldDto`.
- **Styling:** Tailwind CSS v4 with the A'raf palette, kept in sync with `packages/ui-tokens` by a test.

**Tech Stack:** Vite 8, React 19.3, @tanstack/react-router 1.170, @tanstack/react-query 5.104, Tailwind CSS 4.3 (`@tailwindcss/vite`), vaul 1.1, hono/client, Vitest 5 + React Testing Library 16 + jsdom, user-event 14.

**Spec:** `docs/superpowers/specs/2026-10-07-archipelago-task-game-design.md`. Section 7 covers screens, routing and responsive layout. Section 11.3 is the web stack, 11.4 the Phase 2 screens, and 10 the Phase 2 row.

## Global Constraints

- **Viewports:** mobile-first. Styles are written for 360–430px wide first, with breakpoints `< 768px` phone, `768–1023px` tablet (same as phone, sheet max-width ~640px, centred) and `≥ 1024px` desktop.
- **Desktop at 1024px and up:** a resizable right side panel (default 400px, min 320px, max 640px) replaces the bottom sheet. Editors open as centred dialogs.
- **Phone and tablet:** a 3-detent bottom sheet (`vaul`, snap points `['120px', 0.5, 0.92]`). Editors open as full-height sheets. Touch targets are at least 44px (`min-h-11` / `min-w-11`).
- **Overflow, not compression:** content that doesn't fit a phone (island cards, the island switcher) overflows and scrolls horizontally with swipe. Never compress it to fit.
- **Routes:**
  - `/login`
  - `/` (archipelago)
  - `/p/$projectId` (island)
  - `/p/$projectId/m/$milestoneId` (district)

  Refresh or a deep link restores the state. Unauthenticated users are redirected to `/login`.
- **Task panel content per route:**
  - archipelago: open tasks due today or overdue across all projects
  - island: that project's tasks
  - district: that milestone's tasks

  Done tasks are listed after open ones.
- **Due states** use the user's timezone (`/auth/me` → `timezone`):
  - overdue: not done and `dueDate` before today
  - due-soon: not done and `dueDate` is today or tomorrow
- **Status control:** todo → doing (`PATCH status`), doing → done (`POST /complete`), done → todo (`POST /reopen`). Status is never set to `done` through PATCH.
- **Optimistic updates:** task status changes and deletes update the `['world']` query cache optimistically. On failure they roll back and show a toast with the server message.
- **Keyboard shortcuts (desktop only):**
  - `N` opens the new-task editor on an island or district; it does nothing on the archipelago.
  - `/` focuses the task search box.
  - `Esc` closes an open editor, or else steps out one route level.

  `N` and `/` are ignored while typing in an input, textarea or select, or with a modifier key held. `Esc` always works.
- **Colours:** only the A'raf palette, via Tailwind theme colours generated from `@archipelago/ui-tokens` names (`--color-brand`, `--color-brand-secondary`, `--color-surface-primary`, …). Radii: `rounded-sm` 4px, `rounded-md` 6px, `rounded-lg` 8px.
- **Code style:** TypeScript `strict` + `noUncheckedIndexedAccess`; no `any`; no `!` in `src/` outside tests. Biome formatting (single quotes, no semicolons, width 100). Conventional Commits with NO AI attribution or `Co-Authored-By` trailers.
- **Accessibility:** every interactive element has an accessible name. Dialogs and sheets have a title. Errors are announced (`role="alert"`). Toasts use `role="status"`.

## Review Focus

1. **Expired session mid-use.** If any API call returns `401` after login (session expired or revoked), the user must land on `/login`, not see a broken screen. Pinned in Task 4.
2. **Deep link to something that does not exist.** `/p/<deleted-or-foreign-id>` or a bad milestone id must show a "not found" message with a link back to the archipelago, not a blank panel or crash. Pinned in Task 5.
3. **Rapid double-taps on the status button.** Two quick taps must not send `complete` twice (the second would get `409`). The button is disabled while its mutation is pending. Pinned in Task 6.
4. **Server validation the client didn't catch.** A `422` from the API (e.g. milestone not in the project) must show its field messages next to the right inputs. A `409` or `500` must show a toast and leave the editor open with the user's input intact. Pinned in Task 7.
5. **Timezone edge at midnight.** Due status uses the user's timezone, not the browser's. A task due "today" in `Asia/Jakarta` must show as due-soon even when the browser's UTC date is still yesterday. Pinned in Task 3.

## File Structure

```
apps/api/package.json          (modify) export ./app for the AppType type
apps/api/Dockerfile            (modify) COPY apps/web/package.json in the install layer
packages/shared/src/dto.ts     (modify) add AuthUserDto

apps/web/
  package.json, tsconfig.json, vite.config.ts, index.html
  src/main.tsx                 browser entry: providers + router
  src/styles.css               Tailwind import + A'raf @theme colours
  src/styles.test.ts           theme colours stay in sync with ui-tokens
  src/test/setup.ts            jest-dom, cleanup, viewport mock
  src/test/viewport.ts         controllable window.matchMedia (desktop vs phone)
  src/test/fake-api.ts         in-memory Api implementation for component tests
  src/test/render-app.tsx      renderApp({ api, path, desktop }) helper
  src/api/client.ts            hc<AppType> client factory
  src/api/api.ts               createApi(client) → Api, ApiError
  src/api/api.test.ts
  src/api/context.tsx          ApiProvider, useApi
  src/world/selectors.ts       todayIn, addDays, dueStatus, panelTasks, islandSummaries, focus helpers
  src/world/selectors.test.ts
  src/world/use-world.ts       useWorld(), useMe() query hooks
  src/app/router.tsx           route tree, createAppRouter
  src/app/providers.tsx        QueryClient + Api + Toast providers
  src/app/toast.tsx            ToastProvider, useToast
  src/auth/login-page.tsx
  src/auth/login-page.test.tsx
  src/layout/use-is-desktop.ts
  src/layout/app-shell.tsx     header (title, logout) + <Outlet/>
  src/layout/world-screen.tsx  composes world area, switcher, panel, editors
  src/layout/world-screen.test.tsx
  src/layout/panel-frame.tsx   MobileSheet (vaul) | DesktopPanel (resizable aside)
  src/world/world-area.tsx     island cards / milestone cards placeholder
  src/world/island-switcher.tsx
  src/tasks/task-panel.tsx     panel header, search, list
  src/tasks/task-row.tsx       status button, due badge, edit, delete
  src/tasks/use-task-actions.ts optimistic mutations
  src/tasks/task-panel.test.tsx
  src/editors/editor-frame.tsx  sheet (phone) | dialog (desktop)
  src/editors/project-form.tsx, milestone-form.tsx, task-form.tsx
  src/editors/forms.test.tsx
  src/layout/use-shortcuts.ts
```

---

### Task 1: Scaffold `apps/web` with Tailwind, Vitest and the A'raf theme

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/vite.config.ts`, `apps/web/index.html`
- Create: `apps/web/src/main.tsx`, `apps/web/src/styles.css`, `apps/web/src/test/setup.ts`, `apps/web/src/test/viewport.ts`
- Test: `apps/web/src/styles.test.ts`
- Modify: `apps/api/package.json` (add `exports`), `apps/api/Dockerfile` (copy the web manifest), `packages/shared/src/dto.ts` (add `AuthUserDto`)

**Interfaces:**
- Consumes: `toCssVariables` and `colors` from `@archipelago/ui-tokens`.
- Produces:
  - Workspace package `@archipelago/web` with scripts `dev` (Vite on 5173, proxies `/api` → `http://localhost:3000`), `build`, `test` (`vitest run`), `typecheck`.
  - `@archipelago/api/app` resolves to `apps/api/src/app.ts`, so `import type { AppType } from '@archipelago/api/app'` works.
  - `AuthUserDto = { id: string; email: string; timezone: string }` from `@archipelago/shared`.
  - `src/test/viewport.ts`: `setDesktop(value: boolean): void`. Installs a `window.matchMedia` mock where `(min-width: 1024px)` matches only when desktop is set. Resets to phone after each test.

- [ ] **Step 1: Package, configs and entry files**

`apps/web/package.json`:
```json
{
  "name": "@archipelago/web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@archipelago/tsconfig": "workspace:*"
  }
}
```

Install (from the repo root):
```bash
cd apps/web
bun add react react-dom @tanstack/react-router @tanstack/react-query vaul hono zod \
  @archipelago/shared@workspace:* @archipelago/ui-tokens@workspace:*
bun add -d vite @vitejs/plugin-react tailwindcss @tailwindcss/vite typescript @types/bun \
  @types/react @types/react-dom vitest jsdom @testing-library/react @testing-library/user-event \
  @testing-library/jest-dom @archipelago/api@workspace:*
cd ../..
```

`apps/web/tsconfig.json`:
```json
{
  "extends": "@archipelago/tsconfig/base.json",
  "compilerOptions": {
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "types": ["bun", "vite/client"]
  },
  "include": ["src", "vite.config.ts"]
}
```
(`bun` types are needed because importing `AppType` makes `tsc` type-check the API source, which uses Bun globals.)

`apps/web/vite.config.ts`:
```ts
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Same-origin in dev so the httpOnly session cookie just works.
    proxy: { '/api': 'http://localhost:3000' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
```

`apps/web/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#004990" />
    <title>Archipelago</title>
  </head>
  <body class="bg-surface-secondary text-text-primary antialiased">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`apps/web/src/main.tsx` (temporary; Task 4 replaces it with the router):
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

createRoot(root).render(
  <StrictMode>
    <main className="p-4 text-brand">Archipelago</main>
  </StrictMode>,
)
```

`apps/web/src/test/viewport.ts`:
```ts
import { afterEach } from 'vitest'

let desktop = false

/** jsdom has no matchMedia; this mock answers `(min-width: 1024px)` from a test-controlled flag. */
export function setDesktop(value: boolean): void {
  desktop = value
}

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string): MediaQueryList => ({
    matches: query.includes('min-width: 1024px') ? desktop : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
})

afterEach(() => {
  desktop = false
})
```

`apps/web/src/test/setup.ts`:
```ts
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import './viewport'

afterEach(() => {
  cleanup()
})
```

- [ ] **Step 2: Write the failing theme-sync test**

`apps/web/src/styles.test.ts`:
```ts
import { readFileSync } from 'node:fs'
import { toCssVariables } from '@archipelago/ui-tokens'
import { describe, expect, test } from 'vitest'

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')

describe('styles.css', () => {
  test('imports Tailwind', () => {
    expect(css).toContain('@import "tailwindcss";')
  })

  test('defines every A\'raf colour token in @theme, with the exact value', () => {
    const colourLines = toCssVariables()
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('--color-'))
    expect(colourLines.length).toBeGreaterThan(10)
    for (const line of colourLines) expect(css).toContain(line)
  })

  test('drops Tailwind default colours so only the palette is available', () => {
    expect(css).toContain('--color-*: initial;')
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd apps/web && bunx vitest run src/styles.test.ts`
Expected: FAIL. `styles.css` does not exist (ENOENT).

- [ ] **Step 4: Implement the stylesheet and supporting changes**

`apps/web/src/styles.css`:
```css
@import "tailwindcss";

/* A'raf Design System palette. Must match @archipelago/ui-tokens (see styles.test.ts). */
@theme {
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
}
```

`apps/api/package.json`: add a top-level `exports` field (type-only consumers; runtime never imports it):
```json
  "exports": {
    "./app": "./src/app.ts"
  },
```

`apps/api/Dockerfile`: in the manifest-copy block, after the `packages/ui-tokens/package.json` line, add:
```dockerfile
COPY apps/web/package.json apps/web/
```

Append to `packages/shared/src/dto.ts`:
```ts
export type AuthUserDto = {
  id: string
  email: string
  timezone: string
}
```

- [ ] **Step 5: Run the tests and checks**

Run:
```bash
cd apps/web && bunx vitest run && cd ../..
bun run typecheck && bun run lint
cd apps/web && bunx vite build && cd ../..
```
Expected:
- The 3 style tests PASS.
- Typecheck is green for all four packages.
- Lint is clean (run `bun run format` if only formatting is reported).
- `vite build` writes `apps/web/dist/`, which the root `.gitignore` already ignores via `dist/`.

If the `bun` and DOM type definitions conflict in `apps/web` typecheck, STOP and report the exact errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web apps/api/package.json apps/api/Dockerfile packages/shared/src/dto.ts bun.lock
git commit -m "feat(web): scaffold vite react app with tailwind a'raf theme"
```

---

### Task 2: Typed API client, `ApiError`, providers and the fake API

**Files:**
- Create: `apps/web/src/api/client.ts`, `apps/web/src/api/api.ts`, `apps/web/src/api/context.tsx`
- Create: `apps/web/src/app/toast.tsx`, `apps/web/src/app/providers.tsx`
- Create: `apps/web/src/test/fake-api.ts`
- Test: `apps/web/src/api/api.test.ts`

**Interfaces:**
- Consumes: `AppType` (`@archipelago/api/app`); `AuthUserDto`, `WorldDto`, `ProjectDto`, `MilestoneDto`, `TaskDto`, `ErrorBody`, `ErrorCode` and the input types from `@archipelago/shared`.
- Produces:
  - `createClient(baseUrl: string, fetchImpl?: typeof fetch)`, a Hono client.
  - `class ApiError extends Error { status: number; code: ErrorCode; fields: Record<string, string[]> }`
  - `createApi(client)` → `Api` with these methods, all async:
    - `me(): { user: AuthUserDto }`
    - `login(input: LoginInput): { user: AuthUserDto }`
    - `logout(): void`
    - `world(): WorldDto`
    - `createProject(input): { project }`, `updateProject(id, input): { project }`, `deleteProject(id): void`
    - `createMilestone(projectId, input): { milestone }`, `updateMilestone(id, input): { milestone }`, `deleteMilestone(id): void`
    - `createTask(input): { task }`, `updateTask(id, input): { task }`, `deleteTask(id): void`
    - `completeTask(id): { task; milestoneCompleted }`, `reopenTask(id): { task; milestoneReopened }`

    Any non-2xx response throws `ApiError`.
  - `type Api = ReturnType<typeof createApi>`
  - `ApiProvider({ api, children })`, `useApi(): Api`
  - `ToastProvider({ children })`, `useToast(): { show(message: string): void }`. Toasts render in a `role="status"` region and auto-dismiss after 5s.
  - `AppProviders({ api, queryClient, children })`, which wraps QueryClientProvider, ApiProvider and ToastProvider.
  - `test/fake-api.ts`: `createFakeApi(seed?: Partial<FakeState>)` → `{ api: Api; state: FakeState; calls: string[] }`.
    - `FakeState = { user: AuthUserDto | null; password: string; world: WorldDto }`.
    - It implements every method in memory with the server's rules: 401 when `user` is null, 409 for double-complete, 422 for a milestone from another project.
    - `calls` records method names.
    - Helpers `fakeProject(overrides?)`, `fakeMilestone(overrides?)`, `fakeTask(overrides?)` build DTOs.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/api/api.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { ApiError, createApi } from './api'
import { createClient } from './client'

type Responder = (req: Request) => Response | Promise<Response>

function harness(respond: Responder) {
  const requests: Request[] = []
  const fetchImpl: typeof fetch = async (input, init) => {
    const req = new Request(input, init)
    requests.push(req)
    return respond(req.clone())
  }
  const api = createApi(createClient('http://test', fetchImpl))
  return { api, requests }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('createApi', () => {
  test('world() GETs /api/v1/world and returns the body', async () => {
    const world = { projects: [], milestones: [], tasks: [], buildings: [] }
    const { api, requests } = harness(() => json(world))
    expect(await api.world()).toEqual(world)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.url).toBe('http://test/api/v1/world')
  })

  test('createTask() POSTs JSON to /api/v1/tasks', async () => {
    const { api, requests } = harness(() => json({ task: { id: 't1' } }, 201))
    await api.createTask({
      projectId: '7f9c2e1a-3b4d-4c5e-8f6a-1b2c3d4e5f60',
      milestoneId: null,
      title: 'Ship',
      notes: '',
      dueDate: null,
      priority: 'med',
      size: 'M',
    })
    const req = requests[0]
    expect(req?.method).toBe('POST')
    expect(req?.url).toBe('http://test/api/v1/tasks')
    expect(req?.headers.get('content-type')).toContain('application/json')
    expect(await req?.json()).toMatchObject({ title: 'Ship' })
  })

  test('completeTask() POSTs to /api/v1/tasks/:id/complete', async () => {
    const { api, requests } = harness(() => json({ task: { id: 't1' }, milestoneCompleted: false }))
    await api.completeTask('t1')
    expect(requests[0]?.method).toBe('POST')
    expect(requests[0]?.url).toBe('http://test/api/v1/tasks/t1/complete')
  })

  test('204 responses resolve to undefined', async () => {
    const { api } = harness(() => new Response(null, { status: 204 }))
    expect(await api.deleteTask('t1')).toBeUndefined()
  })

  test('error bodies become ApiError with status, code, message and fields', async () => {
    const { api } = harness(() =>
      json(
        {
          error: {
            code: 'validation_failed',
            message: 'Request body is invalid',
            fields: { milestoneId: ['Milestone does not belong to this project'] },
          },
        },
        422,
      ),
    )
    const err = await api.updateTask('t1', { title: 'x' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({
      status: 422,
      code: 'validation_failed',
      message: 'Request body is invalid',
      fields: { milestoneId: ['Milestone does not belong to this project'] },
    })
  })

  test('non-JSON failures still become ApiError(internal)', async () => {
    const { api } = harness(() => new Response('gateway down', { status: 502 }))
    const err = await api.world().catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 502, code: 'internal' })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && bunx vitest run src/api/api.test.ts`
Expected: FAIL with `Failed to resolve import "./api"`.

- [ ] **Step 3: Implement**

`apps/web/src/api/client.ts`:
```ts
import type { AppType } from '@archipelago/api/app'
import { hc } from 'hono/client'

export const createClient = (baseUrl: string, fetchImpl?: typeof fetch) =>
  hc<AppType>(baseUrl, fetchImpl ? { fetch: fetchImpl } : undefined)

export type Client = ReturnType<typeof createClient>
```

`apps/web/src/api/api.ts`:
```ts
import type {
  AuthUserDto,
  CreateMilestoneInput,
  CreateProjectInput,
  CreateTaskInput,
  ErrorBody,
  ErrorCode,
  LoginInput,
  MilestoneDto,
  ProjectDto,
  TaskDto,
  UpdateMilestoneInput,
  UpdateProjectInput,
  UpdateTaskInput,
  WorldDto,
} from '@archipelago/shared'
import type { Client } from './client'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly fields: Record<string, string[]> = {},
  ) {
    super(message)
  }
}

type RawResponse = { ok: boolean; status: number; json(): Promise<unknown> }

async function unwrap<T>(res: RawResponse): Promise<T> {
  if (res.ok) return (res.status === 204 ? undefined : await res.json()) as T
  let body: ErrorBody | null = null
  try {
    body = (await res.json()) as ErrorBody
  } catch {
    body = null
  }
  throw new ApiError(
    res.status,
    body?.error.code ?? 'internal',
    body?.error.message ?? `Request failed (${res.status})`,
    body?.error.fields ?? {},
  )
}

export function createApi(client: Client) {
  const v1 = client.api.v1
  return {
    me: async () => unwrap<{ user: AuthUserDto }>(await v1.auth.me.$get()),
    login: async (input: LoginInput) =>
      unwrap<{ user: AuthUserDto }>(await v1.auth.login.$post({ json: input })),
    logout: async () => unwrap<void>(await v1.auth.logout.$post()),
    world: async () => unwrap<WorldDto>(await v1.world.$get()),

    createProject: async (input: CreateProjectInput) =>
      unwrap<{ project: ProjectDto }>(await v1.projects.$post({ json: input })),
    updateProject: async (id: string, input: UpdateProjectInput) =>
      unwrap<{ project: ProjectDto }>(await v1.projects[':id'].$patch({ param: { id }, json: input })),
    deleteProject: async (id: string) =>
      unwrap<void>(await v1.projects[':id'].$delete({ param: { id } })),

    createMilestone: async (projectId: string, input: CreateMilestoneInput) =>
      unwrap<{ milestone: MilestoneDto }>(
        await v1.projects[':id'].milestones.$post({ param: { id: projectId }, json: input }),
      ),
    updateMilestone: async (id: string, input: UpdateMilestoneInput) =>
      unwrap<{ milestone: MilestoneDto }>(
        await v1.milestones[':id'].$patch({ param: { id }, json: input }),
      ),
    deleteMilestone: async (id: string) =>
      unwrap<void>(await v1.milestones[':id'].$delete({ param: { id } })),

    createTask: async (input: CreateTaskInput) =>
      unwrap<{ task: TaskDto }>(await v1.tasks.$post({ json: input })),
    updateTask: async (id: string, input: UpdateTaskInput) =>
      unwrap<{ task: TaskDto }>(await v1.tasks[':id'].$patch({ param: { id }, json: input })),
    deleteTask: async (id: string) => unwrap<void>(await v1.tasks[':id'].$delete({ param: { id } })),
    completeTask: async (id: string) =>
      unwrap<{ task: TaskDto; milestoneCompleted: boolean }>(
        await v1.tasks[':id'].complete.$post({ param: { id } }),
      ),
    reopenTask: async (id: string) =>
      unwrap<{ task: TaskDto; milestoneReopened: boolean }>(
        await v1.tasks[':id'].reopen.$post({ param: { id } }),
      ),
  }
}

export type Api = ReturnType<typeof createApi>
```

If the inferred Hono client is missing one of these paths (for example because a route's input type does not include `param`), STOP and report the exact TypeScript error. Do not cast the client to `any`.

`apps/web/src/api/context.tsx`:
```tsx
import { createContext, type ReactNode, useContext } from 'react'
import type { Api } from './api'

const ApiContext = createContext<Api | null>(null)

export function ApiProvider({ api, children }: { api: Api; children: ReactNode }) {
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>
}

export function useApi(): Api {
  const api = useContext(ApiContext)
  if (!api) throw new Error('useApi must be used inside <ApiProvider>')
  return api
}
```

`apps/web/src/app/toast.tsx`:
```tsx
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react'

type Toast = { id: number; message: string }
type ToastApi = { show(message: string): void }

const ToastContext = createContext<ToastApi | null>(null)
const DISMISS_AFTER_MS = 5000

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const show = useCallback((message: string) => {
    const id = Date.now() + Math.random()
    setToasts((current) => [...current, { id, message }])
    setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), DISMISS_AFTER_MS)
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
          <p
            key={t.id}
            className="pointer-events-auto max-w-sm rounded-lg bg-text-primary px-4 py-3 text-sm text-text-on-brand shadow-lg"
          >
            {t.message}
          </p>
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

`apps/web/src/app/providers.tsx`:
```tsx
import { type QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { Api } from '../api/api'
import { ApiProvider } from '../api/context'
import { ToastProvider } from './toast'

export function AppProviders({
  api,
  queryClient,
  children,
}: {
  api: Api
  queryClient: QueryClient
  children: ReactNode
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <ApiProvider api={api}>
        <ToastProvider>{children}</ToastProvider>
      </ApiProvider>
    </QueryClientProvider>
  )
}
```

`apps/web/src/test/fake-api.ts`:
```ts
import type {
  AuthUserDto,
  MilestoneDto,
  ProjectDto,
  TaskDto,
  WorldDto,
} from '@archipelago/shared'
import { type Api, ApiError } from '../api/api'

export type FakeState = { user: AuthUserDto | null; password: string; world: WorldDto }

let counter = 0
const nextId = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`
const stamp = '2026-10-07T00:00:00.000Z'

export const fakeUser = (): AuthUserDto => ({
  id: nextId(),
  email: 'boss@example.com',
  timezone: 'Asia/Jakarta',
})

export const fakeProject = (overrides: Partial<ProjectDto> = {}): ProjectDto => ({
  id: nextId(),
  name: 'Beta',
  islandSeed: 1,
  archipelagoX: 0,
  archipelagoY: 0,
  archivedAt: null,
  createdAt: stamp,
  ...overrides,
})

export const fakeMilestone = (overrides: Partial<MilestoneDto> = {}): MilestoneDto => ({
  id: nextId(),
  projectId: nextId(),
  name: 'MVP',
  sortOrder: 0,
  landmarkType: 'lighthouse',
  districtQ: 5,
  districtR: 0,
  completedAt: null,
  createdAt: stamp,
  ...overrides,
})

export const fakeTask = (overrides: Partial<TaskDto> = {}): TaskDto => ({
  id: nextId(),
  projectId: nextId(),
  milestoneId: null,
  title: 'Task',
  notes: '',
  dueDate: null,
  priority: 'med',
  size: 'M',
  status: 'todo',
  completedAt: null,
  plotX: 1,
  plotY: 0,
  sortOrder: 0,
  createdAt: stamp,
  updatedAt: stamp,
  ...overrides,
})

/** In-memory Api with the server's rules, for component tests. */
export function createFakeApi(seed: Partial<FakeState> = {}) {
  const state: FakeState = {
    user: seed.user === undefined ? fakeUser() : seed.user,
    password: seed.password ?? 'correct horse battery staple',
    world: seed.world ?? { projects: [], milestones: [], tasks: [], buildings: [] },
  }
  const calls: string[] = []

  const authed = (name: string) => {
    calls.push(name)
    if (!state.user) throw new ApiError(401, 'unauthorized', 'Authentication required')
  }
  const findTask = (id: string) => {
    const task = state.world.tasks.find((t) => t.id === id)
    if (!task) throw new ApiError(404, 'not_found', 'Task not found')
    return task
  }
  const replaceTask = (task: TaskDto) => {
    state.world.tasks = state.world.tasks.map((t) => (t.id === task.id ? task : t))
    return task
  }
  const checkMilestone = (projectId: string, milestoneId: string | null | undefined) => {
    if (!milestoneId) return
    const m = state.world.milestones.find((x) => x.id === milestoneId)
    if (!m || m.projectId !== projectId) {
      throw new ApiError(422, 'validation_failed', 'Request body is invalid', {
        milestoneId: ['Milestone does not belong to this project'],
      })
    }
  }

  const api: Api = {
    me: async () => {
      authed('me')
      return { user: state.user as AuthUserDto }
    },
    login: async (input) => {
      calls.push('login')
      if (input.password !== state.password) {
        throw new ApiError(401, 'unauthorized', 'Invalid email or password')
      }
      state.user = state.user ?? { ...fakeUser(), email: input.email }
      return { user: state.user }
    },
    logout: async () => {
      calls.push('logout')
      state.user = null
    },
    world: async () => {
      authed('world')
      // Like the server: archived islands (and everything on them) are hidden.
      const projects = state.world.projects.filter((p) => p.archivedAt === null)
      const ids = new Set(projects.map((p) => p.id))
      return structuredClone({
        projects,
        milestones: state.world.milestones.filter((m) => ids.has(m.projectId)),
        tasks: state.world.tasks.filter((t) => ids.has(t.projectId)),
        buildings: state.world.buildings.filter((b) => ids.has(b.projectId)),
      })
    },
    createProject: async (input) => {
      authed('createProject')
      const project = fakeProject({ name: input.name, archipelagoX: state.world.projects.length })
      state.world.projects.push(project)
      return { project }
    },
    updateProject: async (id, input) => {
      authed('updateProject')
      const project = state.world.projects.find((p) => p.id === id)
      if (!project) throw new ApiError(404, 'not_found', 'Project not found')
      if (input.name !== undefined) project.name = input.name
      if (input.archived !== undefined) project.archivedAt = input.archived ? stamp : null
      return { project: { ...project } }
    },
    deleteProject: async (id) => {
      authed('deleteProject')
      state.world.projects = state.world.projects.filter((p) => p.id !== id)
      state.world.milestones = state.world.milestones.filter((m) => m.projectId !== id)
      state.world.tasks = state.world.tasks.filter((t) => t.projectId !== id)
    },
    createMilestone: async (projectId, input) => {
      authed('createMilestone')
      const sortOrder = state.world.milestones.filter((m) => m.projectId === projectId).length
      const milestone = fakeMilestone({ projectId, name: input.name, sortOrder })
      state.world.milestones.push(milestone)
      return { milestone }
    },
    updateMilestone: async (id, input) => {
      authed('updateMilestone')
      const milestone = state.world.milestones.find((m) => m.id === id)
      if (!milestone) throw new ApiError(404, 'not_found', 'Milestone not found')
      if (input.name !== undefined) milestone.name = input.name
      if (input.sortOrder !== undefined) milestone.sortOrder = input.sortOrder
      return { milestone: { ...milestone } }
    },
    deleteMilestone: async (id) => {
      authed('deleteMilestone')
      state.world.milestones = state.world.milestones.filter((m) => m.id !== id)
      state.world.tasks = state.world.tasks.map((t) =>
        t.milestoneId === id ? { ...t, milestoneId: null } : t,
      )
    },
    createTask: async (input) => {
      authed('createTask')
      checkMilestone(input.projectId, input.milestoneId)
      const task = fakeTask({
        projectId: input.projectId,
        milestoneId: input.milestoneId ?? null,
        title: input.title,
        notes: input.notes ?? '',
        dueDate: input.dueDate ?? null,
        priority: input.priority ?? 'med',
        size: input.size ?? 'M',
        sortOrder: state.world.tasks.length,
      })
      state.world.tasks.push(task)
      return { task }
    },
    updateTask: async (id, input) => {
      authed('updateTask')
      const task = findTask(id)
      if (input.status !== undefined && task.status === 'done') {
        throw new ApiError(409, 'conflict', 'Task is done; reopen it before changing its status')
      }
      checkMilestone(task.projectId, input.milestoneId)
      const next: TaskDto = { ...task }
      if (input.title !== undefined) next.title = input.title
      if (input.notes !== undefined) next.notes = input.notes
      if (input.dueDate !== undefined) next.dueDate = input.dueDate
      if (input.priority !== undefined) next.priority = input.priority
      if (input.size !== undefined) next.size = input.size
      if (input.status !== undefined) next.status = input.status
      if (input.milestoneId !== undefined) next.milestoneId = input.milestoneId
      return { task: replaceTask(next) }
    },
    deleteTask: async (id) => {
      authed('deleteTask')
      findTask(id)
      state.world.tasks = state.world.tasks.filter((t) => t.id !== id)
    },
    completeTask: async (id) => {
      authed('completeTask')
      const task = findTask(id)
      if (task.status === 'done') throw new ApiError(409, 'conflict', 'Task is already done')
      return {
        task: replaceTask({ ...task, status: 'done', completedAt: stamp }),
        milestoneCompleted: false,
      }
    },
    reopenTask: async (id) => {
      authed('reopenTask')
      const task = findTask(id)
      if (task.status !== 'done') throw new ApiError(409, 'conflict', 'Task is not done')
      return {
        task: replaceTask({ ...task, status: 'todo', completedAt: null }),
        milestoneReopened: false,
      }
    },
  }

  return { api, state, calls }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && bunx vitest run && cd ../.. && bun run typecheck && bun run lint`
Expected: all web tests PASS; typecheck (including the fake's conformance to `Api`) and lint clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): add typed api client, error handling, providers and fake api"
```

---
### Task 3: World selectors (due status, panel lists, island summaries, focus)

**Files:**
- Create: `apps/web/src/world/selectors.ts`
- Test: `apps/web/src/world/selectors.test.ts`

**Interfaces:**
- Consumes: `WorldDto`, `TaskDto`, `ProjectDto`, `MilestoneDto` (shared).
- Produces (all pure):
  - `todayIn(timeZone: string, now?: Date): string` (`YYYY-MM-DD` in that zone)
  - `addDays(isoDate: string, days: number): string`
  - `type DueStatus = 'overdue' | 'due-soon' | 'none'`, `dueStatus(task: Pick<TaskDto, 'status' | 'dueDate'>, today: string): DueStatus`
  - `type Focus = { kind: 'archipelago' } | { kind: 'island'; projectId: string } | { kind: 'district'; projectId: string; milestoneId: string }`
  - `resolveFocus(world: WorldDto, params: { projectId?: string; milestoneId?: string }): { focus: Focus; project: ProjectDto | null; milestone: MilestoneDto | null; missing: boolean }`
  - `parentPath(focus: Focus): string | null` (district → `/p/<id>`, island → `/`, archipelago → `null`)
  - `panelTasks(world: WorldDto, focus: Focus, today: string): TaskDto[]`
  - `type IslandSummary = { project: ProjectDto; milestones: MilestoneDto[]; open: number; done: number; overdue: number; dueSoon: number }`
  - `islandSummaries(world: WorldDto, today: string): IslandSummary[]` (world order)
  - `urgencyOf(summary: Pick<IslandSummary, 'overdue' | 'dueSoon'>): DueStatus`

- [ ] **Step 1: Write the failing tests**

`apps/web/src/world/selectors.test.ts`:
```ts
import type { WorldDto } from '@archipelago/shared'
import { describe, expect, test } from 'vitest'
import { fakeMilestone, fakeProject, fakeTask } from '../test/fake-api'
import {
  addDays,
  dueStatus,
  islandSummaries,
  panelTasks,
  parentPath,
  resolveFocus,
  todayIn,
  urgencyOf,
} from './selectors'

describe('dates', () => {
  test('todayIn uses the given time zone, not the machine one', () => {
    const now = new Date('2026-10-06T18:30:00Z') // 01:30 on the 7th in Jakarta (UTC+7)
    expect(todayIn('Asia/Jakarta', now)).toBe('2026-10-07')
    expect(todayIn('UTC', now)).toBe('2026-10-06')
  })

  test('addDays crosses month and year boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('dueStatus', () => {
  const today = '2026-10-07'
  test('overdue before today, due-soon today or tomorrow, otherwise none', () => {
    expect(dueStatus({ status: 'todo', dueDate: '2026-10-06' }, today)).toBe('overdue')
    expect(dueStatus({ status: 'doing', dueDate: '2026-10-07' }, today)).toBe('due-soon')
    expect(dueStatus({ status: 'todo', dueDate: '2026-10-08' }, today)).toBe('due-soon')
    expect(dueStatus({ status: 'todo', dueDate: '2026-10-09' }, today)).toBe('none')
    expect(dueStatus({ status: 'todo', dueDate: null }, today)).toBe('none')
  })

  test('done tasks are never overdue or due-soon', () => {
    expect(dueStatus({ status: 'done', dueDate: '2026-01-01' }, today)).toBe('none')
  })

  test('a Jakarta "today" task is due-soon even while UTC is still on the previous day', () => {
    const today = todayIn('Asia/Jakarta', new Date('2026-10-06T18:30:00Z'))
    expect(dueStatus({ status: 'todo', dueDate: '2026-10-07' }, today)).toBe('due-soon')
  })
})

function sampleWorld(): WorldDto {
  const beta = fakeProject({ name: 'Beta' })
  const gamma = fakeProject({ name: 'Gamma' })
  const mvp = fakeMilestone({ projectId: beta.id, name: 'MVP' })
  return {
    projects: [beta, gamma],
    milestones: [mvp],
    tasks: [
      fakeTask({ projectId: beta.id, title: 'Overdue', dueDate: '2026-10-01', sortOrder: 2 }),
      fakeTask({ projectId: beta.id, title: 'Today', dueDate: '2026-10-07', sortOrder: 1 }),
      fakeTask({ projectId: beta.id, title: 'Later', dueDate: '2026-12-01', sortOrder: 0 }),
      fakeTask({ projectId: beta.id, title: 'In MVP', milestoneId: mvp.id, sortOrder: 3 }),
      fakeTask({ projectId: beta.id, title: 'Done MVP', milestoneId: mvp.id, status: 'done', sortOrder: 0 }),
      fakeTask({ projectId: gamma.id, title: 'Gamma overdue', dueDate: '2026-09-30', sortOrder: 0 }),
      fakeTask({ projectId: gamma.id, title: 'Gamma done', dueDate: '2026-09-01', status: 'done', sortOrder: 1 }),
    ],
    buildings: [],
  }
}

describe('panelTasks', () => {
  const today = '2026-10-07'

  test('archipelago: open tasks due today or earlier across projects, oldest due first', () => {
    const titles = panelTasks(sampleWorld(), { kind: 'archipelago' }, today).map((t) => t.title)
    expect(titles).toEqual(['Gamma overdue', 'Overdue', 'Today'])
  })

  test('island: all of the project’s tasks, open ones before done ones', () => {
    const world = sampleWorld()
    const beta = world.projects[0]
    if (!beta) throw new Error('fixture')
    const titles = panelTasks(world, { kind: 'island', projectId: beta.id }, today).map((t) => t.title)
    expect(titles).toEqual(['Later', 'Today', 'Overdue', 'In MVP', 'Done MVP'])
  })

  test('district: only the milestone’s tasks, done last', () => {
    const world = sampleWorld()
    const mvp = world.milestones[0]
    if (!mvp) throw new Error('fixture')
    const focus = { kind: 'district', projectId: mvp.projectId, milestoneId: mvp.id } as const
    expect(panelTasks(world, focus, today).map((t) => t.title)).toEqual(['In MVP', 'Done MVP'])
  })
})

describe('islandSummaries and urgency', () => {
  test('counts open, done, overdue and due-soon per island', () => {
    const [beta, gamma] = islandSummaries(sampleWorld(), '2026-10-07')
    expect(beta).toMatchObject({ open: 4, done: 1, overdue: 1, dueSoon: 1 })
    expect(beta?.milestones.map((m) => m.name)).toEqual(['MVP'])
    expect(gamma).toMatchObject({ open: 1, done: 1, overdue: 1, dueSoon: 0 })
    expect(urgencyOf({ overdue: 1, dueSoon: 3 })).toBe('overdue')
    expect(urgencyOf({ overdue: 0, dueSoon: 1 })).toBe('due-soon')
    expect(urgencyOf({ overdue: 0, dueSoon: 0 })).toBe('none')
  })
})

describe('resolveFocus and parentPath', () => {
  test('maps route params to a focus and flags missing islands or districts', () => {
    const world = sampleWorld()
    const beta = world.projects[0]
    const gamma = world.projects[1]
    const mvp = world.milestones[0]
    if (!beta || !gamma || !mvp) throw new Error('fixture')

    expect(resolveFocus(world, {})).toMatchObject({ focus: { kind: 'archipelago' }, missing: false })
    expect(resolveFocus(world, { projectId: beta.id })).toMatchObject({
      focus: { kind: 'island', projectId: beta.id },
      project: beta,
      missing: false,
    })
    expect(resolveFocus(world, { projectId: beta.id, milestoneId: mvp.id })).toMatchObject({
      focus: { kind: 'district', milestoneId: mvp.id },
      milestone: mvp,
      missing: false,
    })
    expect(resolveFocus(world, { projectId: 'nope' }).missing).toBe(true)
    // A real milestone under the wrong island is still "not found".
    expect(resolveFocus(world, { projectId: gamma.id, milestoneId: mvp.id }).missing).toBe(true)
  })

  test('parentPath steps out one level', () => {
    expect(parentPath({ kind: 'archipelago' })).toBeNull()
    expect(parentPath({ kind: 'island', projectId: 'p1' })).toBe('/')
    expect(parentPath({ kind: 'district', projectId: 'p1', milestoneId: 'm1' })).toBe('/p/p1')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && bunx vitest run src/world/selectors.test.ts`
Expected: FAIL with `Failed to resolve import "./selectors"`.

- [ ] **Step 3: Implement**

`apps/web/src/world/selectors.ts`:
```ts
import type { MilestoneDto, ProjectDto, TaskDto, WorldDto } from '@archipelago/shared'

export function todayIn(timeZone: string, now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export type DueStatus = 'overdue' | 'due-soon' | 'none'

export function dueStatus(task: Pick<TaskDto, 'status' | 'dueDate'>, today: string): DueStatus {
  if (task.status === 'done' || task.dueDate === null) return 'none'
  if (task.dueDate < today) return 'overdue'
  if (task.dueDate <= addDays(today, 1)) return 'due-soon'
  return 'none'
}

export type Focus =
  | { kind: 'archipelago' }
  | { kind: 'island'; projectId: string }
  | { kind: 'district'; projectId: string; milestoneId: string }

export function resolveFocus(
  world: WorldDto,
  params: { projectId?: string; milestoneId?: string },
): { focus: Focus; project: ProjectDto | null; milestone: MilestoneDto | null; missing: boolean } {
  const archipelago = { focus: { kind: 'archipelago' } as Focus, project: null, milestone: null }
  if (!params.projectId) return { ...archipelago, missing: false }
  const project = world.projects.find((p) => p.id === params.projectId) ?? null
  if (!project) return { ...archipelago, missing: true }
  if (!params.milestoneId) {
    return { focus: { kind: 'island', projectId: project.id }, project, milestone: null, missing: false }
  }
  const milestone =
    world.milestones.find((m) => m.id === params.milestoneId && m.projectId === project.id) ?? null
  if (!milestone) return { ...archipelago, missing: true }
  return {
    focus: { kind: 'district', projectId: project.id, milestoneId: milestone.id },
    project,
    milestone,
    missing: false,
  }
}

export function parentPath(focus: Focus): string | null {
  if (focus.kind === 'district') return `/p/${focus.projectId}`
  if (focus.kind === 'island') return '/'
  return null
}

const openFirstThenOrder = (a: TaskDto, b: TaskDto) =>
  Number(a.status === 'done') - Number(b.status === 'done') ||
  a.sortOrder - b.sortOrder ||
  a.createdAt.localeCompare(b.createdAt)

export function panelTasks(world: WorldDto, focus: Focus, today: string): TaskDto[] {
  if (focus.kind === 'archipelago') {
    const active = new Set(world.projects.map((p) => p.id))
    return world.tasks
      .filter(
        (t) =>
          active.has(t.projectId) && t.status !== 'done' && t.dueDate !== null && t.dueDate <= today,
      )
      .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '') || a.sortOrder - b.sortOrder)
  }
  const inScope =
    focus.kind === 'island'
      ? (t: TaskDto) => t.projectId === focus.projectId
      : (t: TaskDto) => t.milestoneId === focus.milestoneId
  return world.tasks.filter(inScope).sort(openFirstThenOrder)
}

export type IslandSummary = {
  project: ProjectDto
  milestones: MilestoneDto[]
  open: number
  done: number
  overdue: number
  dueSoon: number
}

export function islandSummaries(world: WorldDto, today: string): IslandSummary[] {
  return world.projects.map((project) => {
    const tasks = world.tasks.filter((t) => t.projectId === project.id)
    const statuses = tasks.map((t) => dueStatus(t, today))
    return {
      project,
      milestones: world.milestones
        .filter((m) => m.projectId === project.id)
        .sort((a, b) => a.sortOrder - b.sortOrder),
      open: tasks.filter((t) => t.status !== 'done').length,
      done: tasks.filter((t) => t.status === 'done').length,
      overdue: statuses.filter((s) => s === 'overdue').length,
      dueSoon: statuses.filter((s) => s === 'due-soon').length,
    }
  })
}

export function urgencyOf(summary: Pick<IslandSummary, 'overdue' | 'dueSoon'>): DueStatus {
  if (summary.overdue > 0) return 'overdue'
  if (summary.dueSoon > 0) return 'due-soon'
  return 'none'
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && bunx vitest run && cd ../.. && bun run typecheck && bun run lint`
Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): add world selectors for due status, panels and islands"
```

---

### Task 4: Routing, login, logout and session-expiry handling

**Files:**
- Create: `apps/web/src/world/use-world.ts`, `apps/web/src/app/query-client.ts`, `apps/web/src/app/router.tsx`, `apps/web/src/app/runtime.ts`
- Create: `apps/web/src/auth/login-page.tsx`, `apps/web/src/layout/app-shell.tsx`, `apps/web/src/layout/world-screen.tsx` (minimal; Task 5 expands it)
- Create: `apps/web/src/test/render-app.tsx`
- Modify: `apps/web/src/main.tsx`
- Test: `apps/web/src/auth/login-page.test.tsx`

**Interfaces:**
- Consumes: `Api`, `ApiError`, `createApi`, `createClient`, `AppProviders`, `useApi` (Task 2); `setDesktop` (Task 1).
- Produces:
  - `src/world/use-world.ts`: `meQuery(api)` and `worldQuery(api)` (TanStack `queryOptions` with keys `['me']` / `['world']`); `useMe()` and `useWorld()` hooks.
  - `src/app/query-client.ts`: `createQueryClient(onUnauthorized: () => void, retry?: boolean): QueryClient`. Any query or mutation error that is `ApiError` with status 401 calls `onUnauthorized`. 4xx errors are not retried.
  - `src/app/router.tsx`:
    - `type RouterContext = { queryClient: QueryClient; api: Api }`
    - `createAppRouter(context, history?)`
    - routes `/login`, plus a pathless `app` layout (auth guard, `AppShell`) containing `/`, `/p/$projectId` and `/p/$projectId/m/$milestoneId`, each rendering `WorldScreen`
  - `src/app/runtime.ts`: `createAppRuntime(api: Api, options?: { history?: RouterHistory; retry?: boolean }): { router; queryClient }`. It wires 401 → clear the cache → navigate to `/login`.
  - `src/test/render-app.tsx`: `renderApp({ api, path?, desktop? })` → `{ router, queryClient, user }`, where `user` is a userEvent instance.
  - `WorldScreen` (minimal): loads the world and lists project names under the heading "Your islands". Task 5 replaces its body.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/auth/login-page.test.tsx`:
```tsx
import { act, screen, waitFor } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { createFakeApi, fakeProject } from '../test/fake-api'
import { renderApp } from '../test/render-app'

describe('auth flow', () => {
  test('signed-out visitors to / land on the login form', async () => {
    const { api } = createFakeApi({ user: null })
    const { router } = renderApp({ api, path: '/' })
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
  })

  test('a wrong password shows the server message and stays on /login', async () => {
    const { api } = createFakeApi({ user: null })
    const { user, router } = renderApp({ api, path: '/login' })
    await user.type(await screen.findByLabelText('Email'), 'boss@example.com')
    await user.type(screen.getByLabelText('Password'), 'wrong password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password')
    expect(router.state.location.pathname).toBe('/login')
  })

  test('signing in goes to the archipelago', async () => {
    const { api } = createFakeApi({
      user: null,
      world: { projects: [fakeProject({ name: 'Beta' })], milestones: [], tasks: [], buildings: [] },
    })
    const { user, router } = renderApp({ api, path: '/login' })
    await user.type(await screen.findByLabelText('Email'), 'boss@example.com')
    await user.type(screen.getByLabelText('Password'), 'correct horse battery staple')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    // Beta appears on its island card and its switcher chip from Task 5 on.
    expect((await screen.findAllByText('Beta')).length).toBeGreaterThan(0)
    expect(router.state.location.pathname).toBe('/')
  })

  test('logging out returns to the login form', async () => {
    const { api, calls } = createFakeApi()
    const { user } = renderApp({ api, path: '/' })
    await user.click(await screen.findByRole('button', { name: 'Log out' }))
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(calls).toContain('logout')
  })

  test('a session that expires mid-use sends the user to /login', async () => {
    const { api, state } = createFakeApi({
      world: { projects: [fakeProject({ name: 'Beta' })], milestones: [], tasks: [], buildings: [] },
    })
    const { router, queryClient } = renderApp({ api, path: '/' })
    // Beta appears on its island card and its switcher chip from Task 5 on.
    expect((await screen.findAllByText('Beta')).length).toBeGreaterThan(0)

    state.user = null // server-side expiry
    await act(() => queryClient.invalidateQueries({ queryKey: ['world'] }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && bunx vitest run src/auth/login-page.test.tsx`
Expected: FAIL with `Failed to resolve import "../test/render-app"`.

- [ ] **Step 3: Implement**

`apps/web/src/world/use-world.ts`:
```ts
import { queryOptions, useQuery } from '@tanstack/react-query'
import type { Api } from '../api/api'
import { useApi } from '../api/context'

export const meQuery = (api: Api) =>
  queryOptions({ queryKey: ['me'], queryFn: () => api.me(), staleTime: Number.POSITIVE_INFINITY })

export const worldQuery = (api: Api) => queryOptions({ queryKey: ['world'], queryFn: () => api.world() })

export const useMe = () => useQuery(meQuery(useApi()))
export const useWorld = () => useQuery(worldQuery(useApi()))
```

`apps/web/src/app/query-client.ts`:
```ts
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/api'

export function createQueryClient(onUnauthorized: () => void, retry = true): QueryClient {
  const handle = (error: unknown) => {
    if (error instanceof ApiError && error.status === 401) onUnauthorized()
  }
  return new QueryClient({
    queryCache: new QueryCache({ onError: handle }),
    mutationCache: new MutationCache({ onError: handle }),
    defaultOptions: {
      queries: {
        retry: (failures, error) =>
          retry && !(error instanceof ApiError && error.status < 500) && failures < 2,
      },
      mutations: { retry: false },
    },
  })
}
```

`apps/web/src/app/router.tsx`:
```tsx
import type { QueryClient } from '@tanstack/react-query'
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  type RouterHistory,
  redirect,
} from '@tanstack/react-router'
import { type Api, ApiError } from '../api/api'
import { LoginPage } from '../auth/login-page'
import { AppShell } from '../layout/app-shell'
import { WorldScreen } from '../layout/world-screen'
import { meQuery } from '../world/use-world'

export type RouterContext = { queryClient: QueryClient; api: Api }

const rootRoute = createRootRouteWithContext<RouterContext>()({ component: Outlet })

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'login',
  component: LoginPage,
})

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  beforeLoad: async ({ context }) => {
    try {
      await context.queryClient.ensureQueryData(meQuery(context.api))
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) throw redirect({ to: '/login' })
      throw error
    }
  },
  component: AppShell,
})

const archipelagoRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  component: WorldScreen,
})

const islandRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'p/$projectId',
  component: WorldScreen,
})

const districtRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'p/$projectId/m/$milestoneId',
  component: WorldScreen,
})

const routeTree = rootRoute.addChildren([
  loginRoute,
  appRoute.addChildren([archipelagoRoute, islandRoute, districtRoute]),
])

export function createAppRouter(context: RouterContext, history?: RouterHistory) {
  return createRouter({ routeTree, context, history, defaultPreload: false })
}

export type AppRouter = ReturnType<typeof createAppRouter>

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter
  }
}
```

`apps/web/src/app/runtime.ts`:
```ts
import type { RouterHistory } from '@tanstack/react-router'
import type { Api } from '../api/api'
import { createQueryClient } from './query-client'
import { type AppRouter, createAppRouter } from './router'

export function createAppRuntime(api: Api, options: { history?: RouterHistory; retry?: boolean } = {}) {
  let router: AppRouter | undefined
  const queryClient = createQueryClient(() => {
    // Session expired or revoked: forget everything cached and go back to the login form.
    queryClient.clear()
    void router?.navigate({ to: '/login' })
  }, options.retry ?? true)
  router = createAppRouter({ api, queryClient }, options.history)
  return { router, queryClient }
}
```

`apps/web/src/auth/login-page.tsx`:
```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
import { ApiError } from '../api/api'
import { useApi } from '../api/context'
import { meQuery } from '../world/use-world'

const inputClass =
  'min-h-11 w-full rounded-md border border-border-secondary bg-surface-primary px-3 text-base focus:border-brand focus:outline-none'

export function LoginPage() {
  const api = useApi()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const login = useMutation({
    mutationFn: () => api.login({ email, password }),
    onSuccess: (data) => {
      queryClient.setQueryData(meQuery(api).queryKey, data)
      void navigate({ to: '/' })
    },
  })

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    login.mutate()
  }

  const error =
    login.error instanceof ApiError
      ? login.error.message
      : login.error
        ? 'Something went wrong. Try again.'
        : null

  return (
    <main className="flex min-h-dvh items-center justify-center bg-brand px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg bg-surface-primary p-6 shadow-lg"
      >
        <h1 className="text-xl font-semibold text-text-primary">Sign in</h1>
        <label className="block space-y-1 text-sm text-text-secondary">
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
        <label className="block space-y-1 text-sm text-text-secondary">
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
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={login.isPending}
          className="min-h-11 w-full rounded-md bg-brand font-medium text-text-on-brand disabled:opacity-60"
        >
          Sign in
        </button>
      </form>
    </main>
  )
}
```

`apps/web/src/layout/app-shell.tsx`:
```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, Outlet, useNavigate } from '@tanstack/react-router'
import { useApi } from '../api/context'

export function AppShell() {
  const api = useApi()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const logout = useMutation({
    mutationFn: () => api.logout(),
    onSettled: () => {
      queryClient.clear()
      void navigate({ to: '/login' })
    },
  })

  return (
    <div className="flex h-dvh flex-col bg-surface-secondary">
      <header className="flex h-14 shrink-0 items-center justify-between bg-brand px-4 text-text-on-brand">
        <Link to="/" className="flex min-h-11 items-center font-semibold">
          Archipelago
        </Link>
        <button
          type="button"
          onClick={() => logout.mutate()}
          className="min-h-11 rounded-md px-3 text-sm hover:bg-brand-secondary"
        >
          Log out
        </button>
      </header>
      <Outlet />
    </div>
  )
}
```

`apps/web/src/layout/world-screen.tsx` (minimal, replaced in Task 5):
```tsx
import { useWorld } from '../world/use-world'

export function WorldScreen() {
  const world = useWorld()
  if (world.isPending) return <p className="p-4 text-text-secondary">Loading your islands…</p>
  if (world.isError) {
    return (
      <p role="alert" className="p-4 text-error">
        Could not load your islands.
      </p>
    )
  }
  return (
    <section className="p-4">
      <h2 className="text-lg font-semibold">Your islands</h2>
      <ul>
        {world.data.projects.map((p) => (
          <li key={p.id}>{p.name}</li>
        ))}
      </ul>
    </section>
  )
}
```

`apps/web/src/test/render-app.tsx`:
```tsx
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Api } from '../api/api'
import { AppProviders } from '../app/providers'
import { createAppRuntime } from '../app/runtime'
import { setDesktop } from './viewport'

export function renderApp({
  api,
  path = '/',
  desktop = false,
}: {
  api: Api
  path?: string
  desktop?: boolean
}) {
  setDesktop(desktop)
  const history = createMemoryHistory({ initialEntries: [path] })
  const { router, queryClient } = createAppRuntime(api, { history, retry: false })
  const user = userEvent.setup()
  render(
    <AppProviders api={api} queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  return { router, queryClient, user }
}
```

Replace `apps/web/src/main.tsx`:
```tsx
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createApi } from './api/api'
import { createClient } from './api/client'
import { AppProviders } from './app/providers'
import { createAppRuntime } from './app/runtime'
import './styles.css'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

const api = createApi(createClient(window.location.origin))
const { router, queryClient } = createAppRuntime(api)

createRoot(root).render(
  <StrictMode>
    <AppProviders api={api} queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && bunx vitest run && cd ../.. && bun run typecheck && bun run lint`
Expected: all web tests PASS; clean. If TanStack Router's API differs from the code above (for example `redirect` or `createRootRouteWithContext` signatures on the installed version), STOP and report the exact error.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): add routing, login, logout and session expiry handling"
```

---
### Task 5: Responsive world screen (island cards, switcher, sheet / side panel, not-found)

**Files:**
- Create: `apps/web/src/layout/use-is-desktop.ts`, `apps/web/src/layout/panel-frame.tsx`
- Create: `apps/web/src/world/world-area.tsx`, `apps/web/src/world/island-switcher.tsx`
- Create: `apps/web/src/tasks/task-panel.tsx` (minimal list; Task 6 expands)
- Modify: `apps/web/src/layout/world-screen.tsx` (full composition)
- Test: `apps/web/src/layout/world-screen.test.tsx`

**Interfaces:**
- Consumes: `useWorld`, `useMe` (Task 4); selectors (Task 3); `renderApp`, `createFakeApi`, `fakeProject`, `fakeMilestone`, `fakeTask`.
- Produces:
  - `useIsDesktop(): boolean`, which tracks `(min-width: 1024px)`.
  - `PanelFrame({ title, children })`. On phone it renders a vaul bottom sheet (`data-testid="task-sheet"`, non-modal, not dismissible, snap points `['120px', 0.5, 0.92]`, starting at `0.5`). On desktop it renders a resizable `<aside aria-label={title}>` (`data-testid="task-side-panel"`). The aside is 400px by default, clamped to 320–640, and remembered in `localStorage` (`archipelago.panelWidth`, with read/write wrapped in try/catch). Its resize handle is a button "Resize task panel" that supports pointer drag and ArrowLeft/ArrowRight in ±16px steps.
  - `WorldArea({ world, resolved, summaries, today, onNewProject, onNewMilestone, onEditProject, onEditMilestone })`:
    - archipelago: a horizontally scrolling row of island cards (min width 16rem; never shrunk). Each card is a link to `/p/<id>` showing name, open/done counts and overdue/due-soon counts.
    - island: district cards (links to `/p/<id>/m/<mid>`), a "Commons" card and an "Edit island" button.
    - district: a landmark card with name, landmark type, done/total, and an "Edit milestone" button.
    - The `on*` callbacks are optional in this task; Task 7 wires them.
  - `IslandSwitcher({ summaries, currentProjectId })`: `<nav aria-label="Islands">` with horizontally scrolling chip links. The current chip has `aria-current="page"`. Each chip has an urgency dot with sr-only text "overdue" or "due soon".
  - `TaskPanel({ title, tasks })` (minimal): `<h2>` title plus a list of task titles. Task 6 replaces its props and body.
  - `WorldScreen`: resolves focus from route params. Unknown island or district → "That island or district doesn't exist." plus a link "Back to the archipelago".

- [ ] **Step 1: Write the failing tests**

`apps/web/src/layout/world-screen.test.tsx`:
```tsx
import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { createFakeApi, fakeMilestone, fakeProject, fakeTask } from '../test/fake-api'
import { renderApp } from '../test/render-app'
import { addDays, todayIn } from '../world/selectors'

function seeded() {
  const today = todayIn('Asia/Jakarta')
  const beta = fakeProject({ name: 'Beta' })
  const gamma = fakeProject({ name: 'Gamma' })
  const mvp = fakeMilestone({ projectId: beta.id, name: 'MVP', landmarkType: 'lighthouse' })
  const world = {
    projects: [beta, gamma],
    milestones: [mvp],
    tasks: [
      fakeTask({ projectId: beta.id, title: 'Late one', dueDate: addDays(today, -2) }),
      fakeTask({ projectId: beta.id, milestoneId: mvp.id, title: 'MVP task' }),
      fakeTask({ projectId: gamma.id, title: 'Soon one', dueDate: today }),
    ],
    buildings: [],
  }
  return { ...createFakeApi({ world }), beta, gamma, mvp }
}

describe('WorldScreen', () => {
  test('phone: island cards scroll horizontally, switcher shows urgency, panel is a bottom sheet', async () => {
    const { api } = seeded()
    renderApp({ api, path: '/' })
    const cards = await screen.findByTestId('island-cards')
    expect(cards).toHaveClass('overflow-x-auto')
    expect(within(cards).getByRole('link', { name: /Beta/ })).toHaveTextContent('2 open')

    const switcher = screen.getByRole('navigation', { name: 'Islands' })
    expect(within(switcher).getByRole('link', { name: /Beta/ })).toHaveTextContent('overdue')
    expect(within(switcher).getByRole('link', { name: /Gamma/ })).toHaveTextContent('due soon')

    expect(screen.getByTestId('task-sheet')).toBeInTheDocument()
    expect(screen.queryByTestId('task-side-panel')).not.toBeInTheDocument()
  })

  test('desktop: the panel is a resizable side panel', async () => {
    const { api } = seeded()
    renderApp({ api, path: '/', desktop: true })
    const panel = await screen.findByTestId('task-side-panel')
    expect(panel).toHaveStyle({ width: '400px' })
    const handle = screen.getByRole('button', { name: 'Resize task panel' })
    fireEvent.keyDown(handle, { key: 'ArrowLeft' })
    expect(panel).toHaveStyle({ width: '416px' })
    expect(screen.queryByTestId('task-sheet')).not.toBeInTheDocument()
  })

  test('navigates archipelago → island → district, and the panel follows', async () => {
    const { api, beta, mvp } = seeded()
    const { user, router } = renderApp({ api, path: '/', desktop: true })
    const cards = await screen.findByTestId('island-cards')
    await user.click(within(cards).getByRole('link', { name: /Beta/ }))
    expect(router.state.location.pathname).toBe(`/p/${beta.id}`)
    expect(await screen.findByRole('heading', { level: 2, name: 'Beta' })).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: /MVP/ }))
    expect(router.state.location.pathname).toBe(`/p/${beta.id}/m/${mvp.id}`)
    expect(await screen.findByRole('heading', { level: 2, name: 'MVP' })).toBeInTheDocument()
    expect(screen.getByText('MVP task')).toBeInTheDocument()
    expect(screen.queryByText('Late one')).not.toBeInTheDocument()
  })

  test('a deep link to a missing island shows not-found with a way back', async () => {
    const { api } = seeded()
    const { user, router } = renderApp({ api, path: '/p/00000000-0000-4000-8000-999999999999' })
    expect(await screen.findByText("That island or district doesn't exist.")).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Back to the archipelago' }))
    expect(router.state.location.pathname).toBe('/')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && bunx vitest run src/layout/world-screen.test.tsx`
Expected: FAIL. The minimal WorldScreen has no island cards, switcher or panel, so `findByRole('link', { name: /Beta/ })` times out.

- [ ] **Step 3: Implement**

`apps/web/src/layout/use-is-desktop.ts`:
```ts
import { useEffect, useState } from 'react'

const DESKTOP_QUERY = '(min-width: 1024px)'

export function useIsDesktop(): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(DESKTOP_QUERY).matches)
  useEffect(() => {
    const mql = window.matchMedia(DESKTOP_QUERY)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])
  return matches
}
```

`apps/web/src/layout/panel-frame.tsx`:
```tsx
import { type KeyboardEvent, type PointerEvent, type ReactNode, useEffect, useState } from 'react'
import { Drawer } from 'vaul'
import { useIsDesktop } from './use-is-desktop'

const SNAP_POINTS = ['120px', 0.5, 0.92]
const DEFAULT_WIDTH = 400
const MIN_WIDTH = 320
const MAX_WIDTH = 640
const KEY_STEP = 16
const STORAGE_KEY = 'archipelago.panelWidth'

const clampWidth = (w: number) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(w)))

function readStoredWidth(): number {
  try {
    const stored = Number(localStorage.getItem(STORAGE_KEY))
    return Number.isFinite(stored) && stored > 0 ? clampWidth(stored) : DEFAULT_WIDTH
  } catch {
    return DEFAULT_WIDTH
  }
}

export function PanelFrame({ title, children }: { title: string; children: ReactNode }) {
  return useIsDesktop() ? (
    <DesktopPanel title={title}>{children}</DesktopPanel>
  ) : (
    <MobileSheet title={title}>{children}</MobileSheet>
  )
}

function MobileSheet({ title, children }: { title: string; children: ReactNode }) {
  const [snap, setSnap] = useState<number | string | null>(0.5)
  return (
    <Drawer.Root
      open
      modal={false}
      dismissible={false}
      snapPoints={SNAP_POINTS}
      activeSnapPoint={snap}
      setActiveSnapPoint={setSnap}
    >
      <Drawer.Portal>
        <Drawer.Content
          data-testid="task-sheet"
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-30 mx-auto flex h-full max-h-[96dvh] max-w-[640px] flex-col rounded-t-lg border-t border-border-primary bg-surface-primary shadow-2xl"
        >
          <div aria-hidden className="mx-auto mt-2 h-1.5 w-12 shrink-0 rounded-full bg-border-secondary" />
          <Drawer.Title className="sr-only">{title}</Drawer.Title>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

function DesktopPanel({ title, children }: { title: string; children: ReactNode }) {
  const [width, setWidth] = useState(readStoredWidth)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(width))
    } catch {
      // Storage can be unavailable (private mode); the width just isn't remembered.
    }
  }, [width])

  // The panel sits on the right, so dragging the handle left widens it.
  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    const startX = event.clientX
    const startWidth = width
    const onMove = (move: globalThis.PointerEvent) =>
      setWidth(clampWidth(startWidth + (startX - move.clientX)))
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowLeft') setWidth((w) => clampWidth(w + KEY_STEP))
    if (event.key === 'ArrowRight') setWidth((w) => clampWidth(w - KEY_STEP))
  }

  return (
    <aside
      aria-label={title}
      data-testid="task-side-panel"
      style={{ width }}
      className="relative flex h-full shrink-0 flex-col border-l border-border-primary bg-surface-primary"
    >
      <button
        type="button"
        aria-label="Resize task panel"
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
        className="absolute inset-y-0 -left-1 w-2 cursor-col-resize focus:bg-brand-secondary focus:outline-none"
      />
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </aside>
  )
}
```

`apps/web/src/world/island-switcher.tsx`:
```tsx
import { Link } from '@tanstack/react-router'
import { type IslandSummary, urgencyOf } from './selectors'

const dot = { overdue: 'bg-error', 'due-soon': 'bg-warning', none: '' } as const
const label = { overdue: 'overdue', 'due-soon': 'due soon', none: '' } as const

export function IslandSwitcher({
  summaries,
  currentProjectId,
}: {
  summaries: IslandSummary[]
  currentProjectId: string | null
}) {
  if (summaries.length === 0) return null
  return (
    <nav aria-label="Islands" className="shrink-0 border-b border-border-primary bg-surface-primary">
      <ul className="flex gap-2 overflow-x-auto px-4 py-2">
        {summaries.map((s) => {
          const urgency = urgencyOf(s)
          const current = s.project.id === currentProjectId
          return (
            <li key={s.project.id} className="shrink-0">
              <Link
                to="/p/$projectId"
                params={{ projectId: s.project.id }}
                aria-current={current ? 'page' : undefined}
                className={`flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm ${
                  current
                    ? 'border-brand bg-brand text-text-on-brand'
                    : 'border-border-secondary bg-surface-primary text-text-primary'
                }`}
              >
                {s.project.name}
                {urgency !== 'none' && (
                  <>
                    <span aria-hidden className={`h-2 w-2 rounded-full ${dot[urgency]}`} />
                    <span className="sr-only">{label[urgency]}</span>
                  </>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
```

`apps/web/src/world/world-area.tsx`:
```tsx
import type { WorldDto } from '@archipelago/shared'
import { Link } from '@tanstack/react-router'
import type { IslandSummary, resolveFocus } from './selectors'

type Resolved = ReturnType<typeof resolveFocus>

const card =
  'flex min-h-28 w-64 shrink-0 flex-col justify-between rounded-lg border border-border-primary bg-surface-primary p-4 text-left shadow-sm'
const actionButton =
  'min-h-11 rounded-md border border-border-secondary px-3 text-sm text-text-secondary hover:border-brand'

export function WorldArea({
  world,
  resolved,
  summaries,
  onNewProject,
  onNewMilestone,
  onEditProject,
  onEditMilestone,
}: {
  world: WorldDto
  resolved: Resolved
  summaries: IslandSummary[]
  onNewProject?: () => void
  onNewMilestone?: () => void
  onEditProject?: () => void
  onEditMilestone?: () => void
}) {
  const { focus, project, milestone } = resolved

  if (focus.kind === 'archipelago') {
    return (
      <section aria-label="Archipelago" className="min-h-0 flex-1 overflow-y-auto py-4 pb-32 lg:pb-4">
        <div data-testid="island-cards" className="flex gap-3 overflow-x-auto px-4 pb-2">
          {summaries.map((s) => (
            <Link key={s.project.id} to="/p/$projectId" params={{ projectId: s.project.id }} className={card}>
              <span className="font-semibold text-text-primary">{s.project.name}</span>
              <span className="text-sm text-text-secondary">
                {s.open} open · {s.done} done
              </span>
              <span className="text-xs">
                {s.overdue > 0 && <span className="text-error">{s.overdue} overdue </span>}
                {s.dueSoon > 0 && <span className="text-warning">{s.dueSoon} due soon</span>}
              </span>
            </Link>
          ))}
          {onNewProject && (
            <button type="button" onClick={onNewProject} className={`${card} items-center justify-center border-dashed text-brand`}>
              New island
            </button>
          )}
        </div>
        {summaries.length === 0 && (
          <p className="px-4 text-text-secondary">No islands yet. Create one to start building.</p>
        )}
      </section>
    )
  }

  if (focus.kind === 'island' && project) {
    const districts = world.milestones
      .filter((m) => m.projectId === project.id)
      .sort((a, b) => a.sortOrder - b.sortOrder)
    const loose = world.tasks.filter((t) => t.projectId === project.id && t.milestoneId === null)
    return (
      <section aria-label={`${project.name} island`} className="min-h-0 flex-1 overflow-y-auto py-4 pb-32 lg:pb-4">
        <div className="flex items-center justify-between gap-2 px-4 pb-3">
          <Link to="/" className="min-h-11 content-center text-sm text-brand">
            ← Archipelago
          </Link>
          {onEditProject && (
            <button type="button" onClick={onEditProject} className={actionButton}>
              Edit island
            </button>
          )}
        </div>
        <div className="flex gap-3 overflow-x-auto px-4 pb-2">
          {districts.map((m) => {
            const tasks = world.tasks.filter((t) => t.milestoneId === m.id)
            const done = tasks.filter((t) => t.status === 'done').length
            return (
              <Link
                key={m.id}
                to="/p/$projectId/m/$milestoneId"
                params={{ projectId: project.id, milestoneId: m.id }}
                className={card}
              >
                <span className="font-semibold text-text-primary">{m.name}</span>
                <span className="text-sm text-text-secondary">
                  {m.landmarkType.replace('_', ' ')} · {done}/{tasks.length} done
                </span>
              </Link>
            )
          })}
          <div className={card}>
            <span className="font-semibold text-text-primary">Commons</span>
            <span className="text-sm text-text-secondary">{loose.length} loose tasks</span>
          </div>
          {onNewMilestone && (
            <button type="button" onClick={onNewMilestone} className={`${card} items-center justify-center border-dashed text-brand`}>
              New milestone
            </button>
          )}
        </div>
      </section>
    )
  }

  if (focus.kind === 'district' && project && milestone) {
    const tasks = world.tasks.filter((t) => t.milestoneId === milestone.id)
    const done = tasks.filter((t) => t.status === 'done').length
    return (
      <section aria-label={`${milestone.name} district`} className="min-h-0 flex-1 overflow-y-auto p-4 pb-32 lg:pb-4">
        <div className="flex items-center justify-between gap-2 pb-3">
          <Link to="/p/$projectId" params={{ projectId: project.id }} className="min-h-11 content-center text-sm text-brand">
            ← {project.name}
          </Link>
          {onEditMilestone && (
            <button type="button" onClick={onEditMilestone} className={actionButton}>
              Edit milestone
            </button>
          )}
        </div>
        <div className={`${card} w-full max-w-md`}>
          <span className="font-semibold text-text-primary">{milestone.landmarkType.replace('_', ' ')}</span>
          <span className="text-sm text-text-secondary">
            {done}/{tasks.length} done{milestone.completedAt ? ' · complete' : ''}
          </span>
        </div>
      </section>
    )
  }

  return null
}
```

`apps/web/src/tasks/task-panel.tsx` (minimal):
```tsx
import type { TaskDto } from '@archipelago/shared'

export function TaskPanel({ title, tasks }: { title: string; tasks: TaskDto[] }) {
  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
      <ul>
        {tasks.map((t) => (
          <li key={t.id}>{t.title}</li>
        ))}
      </ul>
    </div>
  )
}
```

Replace `apps/web/src/layout/world-screen.tsx`:
```tsx
import { Link, useParams } from '@tanstack/react-router'
import { TaskPanel } from '../tasks/task-panel'
import { IslandSwitcher } from '../world/island-switcher'
import { islandSummaries, panelTasks, resolveFocus, todayIn } from '../world/selectors'
import { useMe, useWorld } from '../world/use-world'
import { WorldArea } from '../world/world-area'
import { PanelFrame } from './panel-frame'

export function WorldScreen() {
  const params = useParams({ strict: false })
  const world = useWorld()
  const me = useMe()

  if (world.isPending) return <p className="p-4 text-text-secondary">Loading your islands…</p>
  if (world.isError) {
    return (
      <p role="alert" className="p-4 text-error">
        Could not load your islands.
      </p>
    )
  }

  const resolved = resolveFocus(world.data, {
    projectId: params.projectId,
    milestoneId: params.milestoneId,
  })
  if (resolved.missing) {
    return (
      <div className="space-y-3 p-4">
        <p className="text-text-primary">That island or district doesn't exist.</p>
        <Link to="/" className="inline-flex min-h-11 items-center text-brand">
          Back to the archipelago
        </Link>
      </div>
    )
  }

  const today = todayIn(me.data?.user.timezone ?? 'UTC')
  const summaries = islandSummaries(world.data, today)
  const panelTitle =
    resolved.milestone?.name ?? resolved.project?.name ?? 'Due today & overdue'

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div className="flex min-h-0 flex-1 flex-col">
        <IslandSwitcher summaries={summaries} currentProjectId={resolved.project?.id ?? null} />
        <WorldArea world={world.data} resolved={resolved} summaries={summaries} />
      </div>
      <PanelFrame title={panelTitle}>
        <TaskPanel title={panelTitle} tasks={panelTasks(world.data, resolved.focus, today)} />
      </PanelFrame>
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && bunx vitest run && cd ../.. && bun run typecheck && bun run lint`
Expected: all web tests PASS (including Task 4's auth tests, which still find project names); clean.

If vaul throws in jsdom (for example a missing browser API), STOP and report the exact error. Do not mock vaul away.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): add responsive world screen with island cards, switcher and task panel frame"
```

---

### Task 6: Task panel: rows, status cycle, search, delete, optimistic updates

**Files:**
- Create: `apps/web/src/tasks/use-task-actions.ts`, `apps/web/src/tasks/task-row.tsx`
- Modify: `apps/web/src/tasks/task-panel.tsx` (full), `apps/web/src/layout/world-screen.tsx` (new props)
- Test: `apps/web/src/tasks/task-panel.test.tsx`

**Interfaces:**
- Consumes: `useApi`, `ApiError` (Task 2); `useToast` (Task 2); `worldQuery` (Task 4); `dueStatus`, `Focus` (Task 3).
- Produces:
  - `src/tasks/use-task-actions.ts`:
    - `useAdvanceTask()` → `useMutation<…, ApiError, TaskDto>`. It applies todo → doing via `updateTask`, doing → done via `completeTask`, and done → todo via `reopenTask`.
    - `useDeleteTask()` → mutation over `TaskDto`.

    Both update `['world']` optimistically, roll back and toast `error.message` on failure, and invalidate `['world']` when settled.
  - `TaskRow({ task, today, projectName?, onEdit? })`. It owns its mutations, so pending state is per row.
    - Status button aria-label: `Mark "<title>" as doing` / `as done` / `as not done`. It is disabled while either mutation is pending.
    - Due badge text: "Overdue · <date>" or "Due soon · <date>".
    - `Edit "<title>"` button, rendered when `onEdit` is given.
    - `Delete "<title>"` button. It asks `window.confirm('Delete "<title>"?')` first.
  - `TaskPanel({ world, focus, title, today, searchRef?, onNewTask?, onEditTask? })`. It renders:
    - the `<h2>` title
    - a "New task" button when `onNewTask` is given and focus isn't the archipelago
    - a search box labelled "Search tasks" that filters by case-insensitive title
    - the rows
    - empty states: archipelago "Nothing due today. Nice work." and otherwise "No tasks here yet."

- [ ] **Step 1: Write the failing tests**

`apps/web/src/tasks/task-panel.test.tsx`:
```tsx
import type { TaskDto } from '@archipelago/shared'
import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { ApiError } from '../api/api'
import { createFakeApi, fakeProject, fakeTask } from '../test/fake-api'
import { renderApp } from '../test/render-app'
import { addDays, todayIn } from '../world/selectors'

function islandWith(tasks: Partial<TaskDto>[]) {
  const project = fakeProject({ name: 'Beta' })
  const fake = createFakeApi({
    world: {
      projects: [project],
      milestones: [],
      tasks: tasks.map((t) => fakeTask({ projectId: project.id, ...t })),
      buildings: [],
    },
  })
  return { ...fake, project, path: `/p/${project.id}` }
}

const panel = () => screen.getByTestId('task-side-panel')

describe('TaskPanel', () => {
  test('shows due badges in the user’s timezone', async () => {
    const today = todayIn('Asia/Jakarta')
    const { api, path } = islandWith([
      { title: 'Late', dueDate: addDays(today, -1) },
      { title: 'Soon', dueDate: today },
      { title: 'Later', dueDate: addDays(today, 10) },
    ])
    renderApp({ api, path, desktop: true })
    expect(await within(panel()).findByText(`Overdue · ${addDays(today, -1)}`)).toBeInTheDocument()
    expect(within(panel()).getByText(`Due soon · ${today}`)).toBeInTheDocument()
    expect(within(panel()).queryByText(new RegExp(addDays(today, 10)))).toBeNull()
  })

  test('the status button cycles todo → doing → done → todo through the right endpoints', async () => {
    const { api, calls, path } = islandWith([{ title: 'Ship' }])
    const { user } = renderApp({ api, path, desktop: true })
    // Each click must wait for the previous mutation to settle: the button is disabled while pending.
    const clickWhenReady = async (name: string) => {
      const button = await screen.findByRole('button', { name })
      await waitFor(() => expect(button).toBeEnabled())
      await user.click(button)
    }
    await clickWhenReady('Mark "Ship" as doing')
    await clickWhenReady('Mark "Ship" as done')
    await clickWhenReady('Mark "Ship" as not done')
    const back = await screen.findByRole('button', { name: 'Mark "Ship" as doing' })
    await waitFor(() => expect(back).toBeEnabled())
    expect(calls.filter((c) => ['updateTask', 'completeTask', 'reopenTask'].includes(c))).toEqual([
      'updateTask',
      'completeTask',
      'reopenTask',
    ])
  })

  test('a rapid second tap while completing is ignored (button disabled while pending)', async () => {
    const { api, calls, path } = islandWith([{ title: 'Ship', status: 'doing' }])
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const realComplete = api.completeTask
    api.completeTask = async (id) => {
      await gate
      return realComplete(id)
    }
    const { user } = renderApp({ api, path, desktop: true })
    const button = await screen.findByRole('button', { name: 'Mark "Ship" as done' })
    await user.click(button)
    // Optimistically "done" already; the control stays disabled until the server answers.
    const pending = await screen.findByRole('button', { name: 'Mark "Ship" as not done' })
    expect(pending).toBeDisabled()
    await user.click(pending)
    release()
    await waitFor(() => expect(pending).toBeEnabled())
    expect(calls.filter((c) => c === 'completeTask' || c === 'reopenTask')).toEqual(['completeTask'])
  })

  test('a failed update rolls back and toasts the server message', async () => {
    const { api, path } = islandWith([{ title: 'Ship' }])
    api.updateTask = async () => {
      throw new ApiError(500, 'internal', 'Server exploded')
    }
    const { user } = renderApp({ api, path, desktop: true })
    await user.click(await screen.findByRole('button', { name: 'Mark "Ship" as doing' }))
    expect(await screen.findByText('Server exploded')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Mark "Ship" as doing' })).toBeInTheDocument()
  })

  test('delete asks first; cancelling keeps the task', async () => {
    const { api, path } = islandWith([{ title: 'Keep me' }, { title: 'Bin me' }])
    const confirm = vi.spyOn(window, 'confirm')
    const { user } = renderApp({ api, path, desktop: true })

    confirm.mockReturnValueOnce(false)
    await user.click(await screen.findByRole('button', { name: 'Delete "Keep me"' }))
    expect(confirm).toHaveBeenCalledWith('Delete "Keep me"?')
    expect(within(panel()).getByText('Keep me')).toBeInTheDocument()

    confirm.mockReturnValueOnce(true)
    await user.click(screen.getByRole('button', { name: 'Delete "Bin me"' }))
    await waitFor(() => expect(within(panel()).queryByText('Bin me')).toBeNull())
    confirm.mockRestore()
  })

  test('search filters the list by title', async () => {
    const { api, path } = islandWith([{ title: 'Write spec' }, { title: 'Ship build' }])
    const { user } = renderApp({ api, path, desktop: true })
    await user.type(await screen.findByLabelText('Search tasks'), 'SPEC')
    expect(within(panel()).getByText('Write spec')).toBeInTheDocument()
    expect(within(panel()).queryByText('Ship build')).toBeNull()
  })

  test('the archipelago panel has a friendly empty state', async () => {
    const { api } = islandWith([{ title: 'No due date' }])
    renderApp({ api, path: '/', desktop: true })
    expect(await within(panel()).findByText('Nothing due today. Nice work.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && bunx vitest run src/tasks/task-panel.test.tsx`
Expected: FAIL. The minimal panel has no status buttons, badges or search (`findByRole('button', { name: 'Mark "Ship" as doing' })` times out).

- [ ] **Step 3: Implement**

`apps/web/src/tasks/use-task-actions.ts`:
```ts
import type { TaskDto, WorldDto } from '@archipelago/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type Api, ApiError } from '../api/api'
import { useApi } from '../api/context'
import { useToast } from '../app/toast'
import { worldQuery } from '../world/use-world'

type Snapshot = { previous: WorldDto | undefined }

function useWorldCache() {
  const api = useApi()
  const queryClient = useQueryClient()
  const toast = useToast()
  const key = worldQuery(api).queryKey

  return {
    async apply(update: (world: WorldDto) => WorldDto): Promise<Snapshot> {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData(key)
      if (previous) queryClient.setQueryData(key, update(previous))
      return { previous }
    },
    rollback(error: unknown, snapshot: Snapshot | undefined) {
      if (snapshot?.previous) queryClient.setQueryData(key, snapshot.previous)
      toast.show(error instanceof ApiError ? error.message : 'Something went wrong. Try again.')
    },
    settle: () => queryClient.invalidateQueries({ queryKey: key }),
  }
}

const patchTask = (world: WorldDto, id: string, patch: Partial<TaskDto>): WorldDto => ({
  ...world,
  tasks: world.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
})

function nextState(task: TaskDto, now: Date): Partial<TaskDto> {
  if (task.status === 'todo') return { status: 'doing' }
  if (task.status === 'doing') return { status: 'done', completedAt: now.toISOString() }
  return { status: 'todo', completedAt: null }
}

function advanceRequest(api: Api, task: TaskDto) {
  if (task.status === 'todo') return api.updateTask(task.id, { status: 'doing' })
  if (task.status === 'doing') return api.completeTask(task.id)
  return api.reopenTask(task.id)
}

export function useAdvanceTask() {
  const api = useApi()
  const cache = useWorldCache()
  return useMutation({
    mutationFn: (task: TaskDto) => advanceRequest(api, task),
    onMutate: (task) => cache.apply((w) => patchTask(w, task.id, nextState(task, new Date()))),
    onError: (error, _task, snapshot) => cache.rollback(error, snapshot),
    onSettled: () => cache.settle(),
  })
}

export function useDeleteTask() {
  const api = useApi()
  const cache = useWorldCache()
  return useMutation({
    mutationFn: (task: TaskDto) => api.deleteTask(task.id),
    onMutate: (task) =>
      cache.apply((w) => ({ ...w, tasks: w.tasks.filter((t) => t.id !== task.id) })),
    onError: (error, _task, snapshot) => cache.rollback(error, snapshot),
    onSettled: () => cache.settle(),
  })
}
```

`apps/web/src/tasks/task-row.tsx`:
```tsx
import type { TaskDto } from '@archipelago/shared'
import { dueStatus } from '../world/selectors'
import { useAdvanceTask, useDeleteTask } from './use-task-actions'

const nextLabel = { todo: 'doing', doing: 'done', done: 'not done' } as const
const statusStyle = {
  todo: 'border-border-secondary bg-surface-primary',
  doing: 'border-brand-secondary bg-brand-secondary/20',
  done: 'border-success bg-success text-text-on-brand',
} as const
const statusGlyph = { todo: '', doing: '…', done: '✓' } as const

export function TaskRow({
  task,
  today,
  projectName,
  onEdit,
}: {
  task: TaskDto
  today: string
  projectName?: string
  onEdit?: (task: TaskDto) => void
}) {
  const advance = useAdvanceTask()
  const remove = useDeleteTask()
  const busy = advance.isPending || remove.isPending
  const due = dueStatus(task, today)

  const onDelete = () => {
    if (window.confirm(`Delete "${task.title}"?`)) remove.mutate(task)
  }

  return (
    <li className="flex items-start gap-3 border-b border-border-primary px-4 py-3">
      <button
        type="button"
        aria-label={`Mark "${task.title}" as ${nextLabel[task.status]}`}
        disabled={busy}
        onClick={() => advance.mutate(task)}
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md border-2 text-lg disabled:opacity-60 ${statusStyle[task.status]}`}
      >
        {statusGlyph[task.status]}
      </button>
      <div className="min-w-0 flex-1 py-1">
        <p className={task.status === 'done' ? 'text-text-tertiary line-through' : 'text-text-primary'}>
          {task.title}
        </p>
        <p className="text-xs text-text-secondary">
          {projectName && <span>{projectName} · </span>}
          {due === 'overdue' && <span className="text-error">Overdue · {task.dueDate}</span>}
          {due === 'due-soon' && <span className="text-warning">Due soon · {task.dueDate}</span>}
        </p>
      </div>
      {onEdit && (
        <button
          type="button"
          aria-label={`Edit "${task.title}"`}
          onClick={() => onEdit(task)}
          className="min-h-11 rounded-md px-2 text-sm text-brand"
        >
          Edit
        </button>
      )}
      <button
        type="button"
        aria-label={`Delete "${task.title}"`}
        disabled={busy}
        onClick={onDelete}
        className="min-h-11 rounded-md px-2 text-sm text-error disabled:opacity-60"
      >
        Delete
      </button>
    </li>
  )
}
```

Replace `apps/web/src/tasks/task-panel.tsx`:
```tsx
import type { TaskDto, WorldDto } from '@archipelago/shared'
import { type RefObject, useState } from 'react'
import { type Focus, panelTasks } from '../world/selectors'
import { TaskRow } from './task-row'

export function TaskPanel({
  world,
  focus,
  title,
  today,
  searchRef,
  onNewTask,
  onEditTask,
}: {
  world: WorldDto
  focus: Focus
  title: string
  today: string
  searchRef?: RefObject<HTMLInputElement | null>
  onNewTask?: () => void
  onEditTask?: (task: TaskDto) => void
}) {
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const tasks = panelTasks(world, focus, today).filter(
    (t) => needle === '' || t.title.toLowerCase().includes(needle),
  )
  const projectNames = new Map(world.projects.map((p) => [p.id, p.name]))

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-2 px-4 pt-3">
        <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
        {onNewTask && focus.kind !== 'archipelago' && (
          <button
            type="button"
            onClick={onNewTask}
            className="min-h-11 rounded-md bg-brand px-3 text-sm font-medium text-text-on-brand"
          >
            New task
          </button>
        )}
      </div>
      <label className="block px-4 py-2">
        <span className="sr-only">Search tasks</span>
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tasks"
          className="min-h-11 w-full rounded-md border border-border-secondary px-3 text-base"
        />
      </label>
      {tasks.length === 0 ? (
        <p className="px-4 py-6 text-center text-text-secondary">
          {focus.kind === 'archipelago' ? 'Nothing due today. Nice work.' : 'No tasks here yet.'}
        </p>
      ) : (
        <ul>
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              today={today}
              projectName={focus.kind === 'archipelago' ? projectNames.get(task.projectId) : undefined}
              onEdit={onEditTask}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
```

In `apps/web/src/layout/world-screen.tsx`, replace the `<PanelFrame>` child with the full panel (remove the `panelTasks` import if it becomes unused):
```tsx
      <PanelFrame title={panelTitle}>
        <TaskPanel world={world.data} focus={resolved.focus} title={panelTitle} today={today} />
      </PanelFrame>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && bunx vitest run && cd ../.. && bun run typecheck && bun run lint`
Expected: all web tests PASS (Tasks 4–6); clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): add task rows with optimistic status cycle, delete and search"
```

---
### Task 7: Editors (project, milestone, task) and keyboard shortcuts

**Files:**
- Create: `apps/web/src/editors/editor-frame.tsx`, `apps/web/src/editors/fields.tsx`, `apps/web/src/editors/use-editor-mutation.ts`
- Create: `apps/web/src/editors/project-form.tsx`, `apps/web/src/editors/milestone-form.tsx`, `apps/web/src/editors/task-form.tsx`
- Create: `apps/web/src/layout/use-shortcuts.ts`
- Modify: `apps/web/src/layout/world-screen.tsx` (editor state, wiring, shortcuts)
- Test: `apps/web/src/editors/forms.test.tsx`

**Interfaces:**
- Consumes: `useApi`, `ApiError`, `useToast`, `worldQuery`, `useIsDesktop`, `WorldArea` callbacks (Task 5), `TaskPanel` `onNewTask`/`onEditTask`/`searchRef` (Task 6), `parentPath` (Task 3).
- Produces:
  - `EditorFrame({ title, onClose, children })`:
    - **Desktop:** a native `<dialog open aria-modal="true" aria-labelledby>` centred over a dimmed backdrop.
    - **Phone/tablet:** a modal vaul sheet (`data-testid="editor-sheet"`) at 92dvh with `Drawer.Title`.
    - Both have a "Close" button.
  - `Field({ label, errors, children })` (label wrapper; errors render as `<p role="alert">`) and `inputClass`.
  - `useEditorMutation(fn, onSuccess)` → `{ mutation, fieldErrors, setFieldErrors }`.
    - On success it invalidates `['world']` and then calls `onSuccess`.
    - On a 422 it sets `fieldErrors` from `ApiError.fields`.
    - On any other error it toasts `error.message`.
    - The editor stays open on errors.
  - `ProjectForm({ project?, onDone })`:
    - Field: Name.
    - Buttons: "Create island" or "Save".
    - When editing, also "Archive island" and "Delete island" (with confirm).
    - `onDone({ removed: boolean })`.
  - `MilestoneForm({ projectId, milestone?, onDone })`:
    - Field: Name.
    - Buttons: "Create milestone" or "Save".
    - When editing, also "Delete milestone" (with confirm).
    - `onDone({ removed: boolean })`.
  - `TaskForm({ world, projectId, task?, defaultMilestoneId?, onDone })`:
    - Fields: Title, Notes, Due date, Priority, Size, Milestone. Milestone offers "No milestone (commons)" plus that island's milestones.
    - Buttons: "Create task" or "Save".
    - `onDone()`.
  - Client checks: a blank name or title shows "Enter a name" / "Enter a title" without calling the API.
  - `useShortcuts({ enabled, onNew, onSearch, onEscape })`, with the semantics in Global Constraints.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/editors/forms.test.tsx`:
```tsx
import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { ApiError } from '../api/api'
import { createFakeApi, fakeMilestone, fakeProject, fakeTask } from '../test/fake-api'
import { renderApp } from '../test/render-app'

function seeded() {
  const beta = fakeProject({ name: 'Beta' })
  const mvp = fakeMilestone({ projectId: beta.id, name: 'MVP' })
  const ship = fakeTask({ projectId: beta.id, milestoneId: mvp.id, title: 'Ship' })
  const fake = createFakeApi({
    world: { projects: [beta], milestones: [mvp], tasks: [ship], buildings: [] },
  })
  return { ...fake, beta, mvp, ship }
}

const dialog = () => screen.getByRole('dialog')

describe('editors', () => {
  test('creates an island from the archipelago (desktop dialog)', async () => {
    const { api } = seeded()
    const { user } = renderApp({ api, path: '/', desktop: true })
    await user.click(await screen.findByRole('button', { name: 'New island' }))
    expect(within(dialog()).getByRole('heading', { name: 'New island' })).toBeInTheDocument()
    await user.type(within(dialog()).getByLabelText('Name'), 'Gamma')
    await user.click(within(dialog()).getByRole('button', { name: 'Create island' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(within(screen.getByTestId('island-cards')).getByRole('link', { name: /Gamma/ })).toBeInTheDocument()
  })

  test('phone: editors open as a sheet', async () => {
    const { api } = seeded()
    const { user } = renderApp({ api, path: '/' })
    await user.click(await screen.findByRole('button', { name: 'New island' }))
    expect(await screen.findByTestId('editor-sheet')).toBeInTheDocument()
  })

  test('creates a milestone on an island', async () => {
    const { api, beta } = seeded()
    const { user } = renderApp({ api, path: `/p/${beta.id}`, desktop: true })
    await user.click(await screen.findByRole('button', { name: 'New milestone' }))
    await user.type(within(dialog()).getByLabelText('Name'), 'Launch')
    await user.click(within(dialog()).getByRole('button', { name: 'Create milestone' }))
    expect(await screen.findByRole('link', { name: /Launch/ })).toBeInTheDocument()
  })

  test('N opens a new task preset to the current district; blank titles are caught locally', async () => {
    const { api, calls, beta, mvp } = seeded()
    const { user } = renderApp({ api, path: `/p/${beta.id}/m/${mvp.id}`, desktop: true })
    await screen.findByRole('heading', { level: 2, name: 'MVP' })
    await user.keyboard('n')
    expect(within(dialog()).getByLabelText('Milestone')).toHaveValue(mvp.id)

    await user.click(within(dialog()).getByRole('button', { name: 'Create task' }))
    expect(within(dialog()).getByRole('alert')).toHaveTextContent('Enter a title')
    expect(calls).not.toContain('createTask')

    await user.type(within(dialog()).getByLabelText('Title'), 'Write docs')
    await user.type(within(dialog()).getByLabelText('Due date'), '2026-12-01')
    await user.selectOptions(within(dialog()).getByLabelText('Priority'), 'high')
    await user.click(within(dialog()).getByRole('button', { name: 'Create task' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(within(screen.getByTestId('task-side-panel')).getByText('Write docs')).toBeInTheDocument()
  })

  test('server field errors appear next to the field and keep the input', async () => {
    const { api, beta } = seeded()
    api.createTask = async () => {
      throw new ApiError(422, 'validation_failed', 'Request body is invalid', {
        milestoneId: ['Milestone does not belong to this project'],
      })
    }
    const { user } = renderApp({ api, path: `/p/${beta.id}`, desktop: true })
    await user.click(await screen.findByRole('button', { name: 'New task' }))
    await user.type(within(dialog()).getByLabelText('Title'), 'Keep my text')
    await user.click(within(dialog()).getByRole('button', { name: 'Create task' }))
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(
      'Milestone does not belong to this project',
    )
    expect(within(dialog()).getByLabelText('Title')).toHaveValue('Keep my text')
  })

  test('conflicts toast and leave the editor open', async () => {
    const { api, beta } = seeded()
    api.updateTask = async () => {
      throw new ApiError(409, 'conflict', 'Task is done; reopen it before changing its status')
    }
    const { user } = renderApp({ api, path: `/p/${beta.id}`, desktop: true })
    await user.click(await screen.findByRole('button', { name: 'Edit "Ship"' }))
    await user.clear(within(dialog()).getByLabelText('Title'))
    await user.type(within(dialog()).getByLabelText('Title'), 'Ship v2')
    await user.click(within(dialog()).getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Task is done; reopen it before changing its status')).toBeInTheDocument()
    expect(within(dialog()).getByLabelText('Title')).toHaveValue('Ship v2')
  })

  test('editing a task saves the new title', async () => {
    const { api, beta } = seeded()
    const { user } = renderApp({ api, path: `/p/${beta.id}`, desktop: true })
    await user.click(await screen.findByRole('button', { name: 'Edit "Ship"' }))
    expect(within(dialog()).getByLabelText('Title')).toHaveValue('Ship')
    await user.clear(within(dialog()).getByLabelText('Title'))
    await user.type(within(dialog()).getByLabelText('Title'), 'Ship it')
    await user.click(within(dialog()).getByRole('button', { name: 'Save' }))
    expect(await within(screen.getByTestId('task-side-panel')).findByText('Ship it')).toBeInTheDocument()
  })

  test('Esc closes the editor, then steps out of the district; / focuses search', async () => {
    const { api, beta, mvp } = seeded()
    const { user, router } = renderApp({ api, path: `/p/${beta.id}/m/${mvp.id}`, desktop: true })
    await screen.findByRole('heading', { level: 2, name: 'MVP' })
    await user.keyboard('n')
    expect(dialog()).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(router.state.location.pathname).toBe(`/p/${beta.id}`))
    await user.keyboard('/')
    expect(screen.getByLabelText('Search tasks')).toHaveFocus()
  })

  test('archiving an island returns to the archipelago and hides it', async () => {
    const { api, beta } = seeded()
    const { user, router } = renderApp({ api, path: `/p/${beta.id}`, desktop: true })
    await user.click(await screen.findByRole('button', { name: 'Edit island' }))
    await user.click(within(dialog()).getByRole('button', { name: 'Archive island' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    await waitFor(() => expect(screen.queryByRole('link', { name: /Beta/ })).toBeNull())
  })

  test('deleting an island asks first, then returns to the archipelago', async () => {
    const { api, calls, beta } = seeded()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { user, router } = renderApp({ api, path: `/p/${beta.id}`, desktop: true })
    await user.click(await screen.findByRole('button', { name: 'Edit island' }))
    await user.click(within(dialog()).getByRole('button', { name: 'Delete island' }))
    expect(confirm).toHaveBeenCalledWith('Delete "Beta" and everything on it?')
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(calls).toContain('deleteProject')
    confirm.mockRestore()
  })
})
```


- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && bunx vitest run src/editors/forms.test.tsx`
Expected: FAIL. There are no "New island" / "New milestone" / "Edit island" buttons yet, so the `findByRole` calls time out.

- [ ] **Step 3: Implement**

`apps/web/src/editors/fields.tsx`:
```tsx
import type { ReactNode } from 'react'

export const inputClass =
  'min-h-11 w-full rounded-md border border-border-secondary bg-surface-primary px-3 text-base focus:border-brand focus:outline-none'

export function Field({
  label,
  errors,
  children,
}: {
  label: string
  errors?: string[]
  children: ReactNode
}) {
  return (
    <label className="block space-y-1 text-sm text-text-secondary">
      <span>{label}</span>
      {children}
      {errors?.map((message) => (
        <p key={message} role="alert" className="text-sm text-error">
          {message}
        </p>
      ))}
    </label>
  )
}
```

`apps/web/src/editors/use-editor-mutation.ts`:
```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ApiError } from '../api/api'
import { useApi } from '../api/context'
import { useToast } from '../app/toast'
import { worldQuery } from '../world/use-world'

export function useEditorMutation<T>(fn: () => Promise<T>, onSuccess: (result: T) => void) {
  const api = useApi()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})

  const mutation = useMutation({
    mutationFn: fn,
    onMutate: () => setFieldErrors({}),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: worldQuery(api).queryKey })
      onSuccess(result)
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 422 && Object.keys(error.fields).length > 0) {
        setFieldErrors(error.fields)
      } else {
        toast.show(error instanceof ApiError ? error.message : 'Something went wrong. Try again.')
      }
    },
  })

  return { mutation, fieldErrors, setFieldErrors }
}
```

`apps/web/src/editors/editor-frame.tsx`:
```tsx
import { type ReactNode, useId } from 'react'
import { Drawer } from 'vaul'
import { useIsDesktop } from '../layout/use-is-desktop'

const closeButton = 'min-h-11 min-w-11 rounded-md text-text-secondary hover:bg-surface-secondary'

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
  const titleId = useId()

  if (isDesktop) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-text-primary/40 p-4">
        <dialog
          open
          aria-modal="true"
          aria-labelledby={titleId}
          className="relative m-0 w-full max-w-lg rounded-lg bg-surface-primary p-6 shadow-xl"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 id={titleId} className="text-lg font-semibold text-text-primary">
              {title}
            </h2>
            <button type="button" onClick={onClose} className={closeButton}>
              Close
            </button>
          </div>
          {children}
        </dialog>
      </div>
    )
  }

  return (
    <Drawer.Root open onOpenChange={(open) => !open && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-text-primary/40" />
        <Drawer.Content
          data-testid="editor-sheet"
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 mx-auto flex h-[92dvh] max-w-[640px] flex-col rounded-t-lg bg-surface-primary"
        >
          <div className="flex items-center justify-between border-b border-border-primary px-4 py-2">
            <Drawer.Title className="text-lg font-semibold text-text-primary">{title}</Drawer.Title>
            <button type="button" onClick={onClose} className={closeButton}>
              Close
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
```

`apps/web/src/editors/project-form.tsx`:
```tsx
import type { ProjectDto } from '@archipelago/shared'
import { type FormEvent, useState } from 'react'
import { useApi } from '../api/context'
import { Field, inputClass } from './fields'
import { useEditorMutation } from './use-editor-mutation'

const primary = 'min-h-11 rounded-md bg-brand px-4 font-medium text-text-on-brand disabled:opacity-60'
const secondary = 'min-h-11 rounded-md border border-border-secondary px-4 text-text-secondary'
const danger = 'min-h-11 rounded-md px-4 text-error'

export function ProjectForm({
  project,
  onDone,
}: {
  project?: ProjectDto
  onDone: (result: { removed: boolean }) => void
}) {
  const api = useApi()
  const [name, setName] = useState(project?.name ?? '')
  const [localErrors, setLocalErrors] = useState<Record<string, string[]>>({})

  const save = useEditorMutation(
    () =>
      project
        ? api.updateProject(project.id, { name: name.trim() })
        : api.createProject({ name: name.trim() }),
    () => onDone({ removed: false }),
  )
  const archive = useEditorMutation(
    () => api.updateProject(project?.id ?? '', { archived: true }),
    () => onDone({ removed: true }),
  )
  const remove = useEditorMutation(
    () => api.deleteProject(project?.id ?? ''),
    () => onDone({ removed: true }),
  )

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (name.trim() === '') return setLocalErrors({ name: ['Enter a name'] })
    setLocalErrors({})
    save.mutation.mutate()
  }

  const errors = { ...save.fieldErrors, ...localErrors }
  const busy = save.mutation.isPending || archive.mutation.isPending || remove.mutation.isPending

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Name" errors={errors.name}>
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className={primary}>
          {project ? 'Save' : 'Create island'}
        </button>
        {project && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => archive.mutation.mutate()}
              className={secondary}
            >
              Archive island
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (window.confirm(`Delete "${project.name}" and everything on it?`)) {
                  remove.mutation.mutate()
                }
              }}
              className={danger}
            >
              Delete island
            </button>
          </>
        )}
      </div>
    </form>
  )
}
```

`apps/web/src/editors/milestone-form.tsx`:
```tsx
import type { MilestoneDto } from '@archipelago/shared'
import { type FormEvent, useState } from 'react'
import { useApi } from '../api/context'
import { Field, inputClass } from './fields'
import { useEditorMutation } from './use-editor-mutation'

const primary = 'min-h-11 rounded-md bg-brand px-4 font-medium text-text-on-brand disabled:opacity-60'
const danger = 'min-h-11 rounded-md px-4 text-error'

export function MilestoneForm({
  projectId,
  milestone,
  onDone,
}: {
  projectId: string
  milestone?: MilestoneDto
  onDone: (result: { removed: boolean }) => void
}) {
  const api = useApi()
  const [name, setName] = useState(milestone?.name ?? '')
  const [localErrors, setLocalErrors] = useState<Record<string, string[]>>({})

  const save = useEditorMutation(
    () =>
      milestone
        ? api.updateMilestone(milestone.id, { name: name.trim() })
        : api.createMilestone(projectId, { name: name.trim() }),
    () => onDone({ removed: false }),
  )
  const remove = useEditorMutation(
    () => api.deleteMilestone(milestone?.id ?? ''),
    () => onDone({ removed: true }),
  )

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (name.trim() === '') return setLocalErrors({ name: ['Enter a name'] })
    setLocalErrors({})
    save.mutation.mutate()
  }

  const errors = { ...save.fieldErrors, ...localErrors }
  const busy = save.mutation.isPending || remove.mutation.isPending

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Name" errors={errors.name}>
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className={primary}>
          {milestone ? 'Save' : 'Create milestone'}
        </button>
        {milestone && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (window.confirm(`Delete "${milestone.name}"? Its tasks move to the commons.`)) {
                remove.mutation.mutate()
              }
            }}
            className={danger}
          >
            Delete milestone
          </button>
        )}
      </div>
    </form>
  )
}
```

`apps/web/src/editors/task-form.tsx`:
```tsx
import type { TaskDto, TaskPriority, TaskSize, WorldDto } from '@archipelago/shared'
import { type FormEvent, useState } from 'react'
import { useApi } from '../api/context'
import { Field, inputClass } from './fields'
import { useEditorMutation } from './use-editor-mutation'

const primary = 'min-h-11 rounded-md bg-brand px-4 font-medium text-text-on-brand disabled:opacity-60'

export function TaskForm({
  world,
  projectId,
  task,
  defaultMilestoneId = null,
  onDone,
}: {
  world: WorldDto
  projectId: string
  task?: TaskDto
  defaultMilestoneId?: string | null
  onDone: () => void
}) {
  const api = useApi()
  const [title, setTitle] = useState(task?.title ?? '')
  const [notes, setNotes] = useState(task?.notes ?? '')
  const [dueDate, setDueDate] = useState(task?.dueDate ?? '')
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'med')
  const [size, setSize] = useState<TaskSize>(task?.size ?? 'M')
  const [milestoneId, setMilestoneId] = useState(task ? (task.milestoneId ?? '') : (defaultMilestoneId ?? ''))
  const [localErrors, setLocalErrors] = useState<Record<string, string[]>>({})

  const milestones = world.milestones
    .filter((m) => m.projectId === projectId)
    .sort((a, b) => a.sortOrder - b.sortOrder)

  const fields = () => ({
    title: title.trim(),
    notes,
    dueDate: dueDate === '' ? null : dueDate,
    priority,
    size,
    milestoneId: milestoneId === '' ? null : milestoneId,
  })

  const save = useEditorMutation(
    () => (task ? api.updateTask(task.id, fields()) : api.createTask({ projectId, ...fields() })),
    () => onDone(),
  )

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (title.trim() === '') return setLocalErrors({ title: ['Enter a title'] })
    setLocalErrors({})
    save.mutation.mutate()
  }

  const errors = { ...save.fieldErrors, ...localErrors }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Title" errors={errors.title}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
      </Field>
      <Field label="Notes" errors={errors.notes}>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className={`${inputClass} py-2`}
        />
      </Field>
      <Field label="Due date" errors={errors.dueDate}>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className={inputClass}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Priority" errors={errors.priority}>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority)}
            className={inputClass}
          >
            <option value="low">Low</option>
            <option value="med">Medium</option>
            <option value="high">High</option>
          </select>
        </Field>
        <Field label="Size" errors={errors.size}>
          <select
            value={size}
            onChange={(e) => setSize(e.target.value as TaskSize)}
            className={inputClass}
          >
            <option value="S">S — small</option>
            <option value="M">M — medium</option>
            <option value="L">L — large</option>
          </select>
        </Field>
      </div>
      <Field label="Milestone" errors={errors.milestoneId}>
        <select
          value={milestoneId}
          onChange={(e) => setMilestoneId(e.target.value)}
          className={inputClass}
        >
          <option value="">No milestone (commons)</option>
          {milestones.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </Field>
      <button type="submit" disabled={save.mutation.isPending} className={primary}>
        {task ? 'Save' : 'Create task'}
      </button>
    </form>
  )
}
```
(The `as TaskPriority` / `as TaskSize` casts are safe: the `<select>` only offers those values.)

`apps/web/src/layout/use-shortcuts.ts`:
```ts
import { useEffect } from 'react'

const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

export function useShortcuts({
  enabled,
  onNew,
  onSearch,
  onEscape,
}: {
  enabled: boolean
  onNew: () => void
  onSearch: () => void
  onEscape: () => void
}) {
  useEffect(() => {
    if (!enabled) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onEscape()
        return
      }
      const target = event.target instanceof HTMLElement ? event.target : null
      const typing = target !== null && (TYPING_TAGS.has(target.tagName) || target.isContentEditable)
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === 'n' || event.key === 'N') {
        event.preventDefault()
        onNew()
      } else if (event.key === '/') {
        event.preventDefault()
        onSearch()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [enabled, onNew, onSearch, onEscape])
}
```

Replace `apps/web/src/layout/world-screen.tsx`:
```tsx
import type { MilestoneDto, ProjectDto, TaskDto } from '@archipelago/shared'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { EditorFrame } from '../editors/editor-frame'
import { MilestoneForm } from '../editors/milestone-form'
import { ProjectForm } from '../editors/project-form'
import { TaskForm } from '../editors/task-form'
import { TaskPanel } from '../tasks/task-panel'
import { IslandSwitcher } from '../world/island-switcher'
import { islandSummaries, parentPath, resolveFocus, todayIn } from '../world/selectors'
import { useMe, useWorld } from '../world/use-world'
import { WorldArea } from '../world/world-area'
import { PanelFrame } from './panel-frame'
import { useIsDesktop } from './use-is-desktop'
import { useShortcuts } from './use-shortcuts'

type Editor =
  | { kind: 'new-project' }
  | { kind: 'edit-project'; project: ProjectDto }
  | { kind: 'new-milestone'; projectId: string }
  | { kind: 'edit-milestone'; milestone: MilestoneDto }
  | { kind: 'new-task'; projectId: string; milestoneId: string | null }
  | { kind: 'edit-task'; task: TaskDto }

const editorTitle: Record<Editor['kind'], string> = {
  'new-project': 'New island',
  'edit-project': 'Edit island',
  'new-milestone': 'New milestone',
  'edit-milestone': 'Edit milestone',
  'new-task': 'New task',
  'edit-task': 'Edit task',
}

export function WorldScreen() {
  const params = useParams({ strict: false })
  const navigate = useNavigate()
  const world = useWorld()
  const me = useMe()
  const isDesktop = useIsDesktop()
  const searchRef = useRef<HTMLInputElement>(null)
  const [editor, setEditor] = useState<Editor | null>(null)

  const resolved = world.data
    ? resolveFocus(world.data, { projectId: params.projectId, milestoneId: params.milestoneId })
    : null
  const focus = resolved?.focus ?? { kind: 'archipelago' as const }

  const openNewTask = () => {
    if (focus.kind === 'island') setEditor({ kind: 'new-task', projectId: focus.projectId, milestoneId: null })
    if (focus.kind === 'district') {
      setEditor({ kind: 'new-task', projectId: focus.projectId, milestoneId: focus.milestoneId })
    }
  }

  useShortcuts({
    enabled: isDesktop,
    onNew: openNewTask,
    onSearch: () => searchRef.current?.focus(),
    onEscape: () => {
      if (editor) return setEditor(null)
      const up = parentPath(focus)
      if (up) void navigate({ to: up })
    },
  })

  if (world.isPending) return <p className="p-4 text-text-secondary">Loading your islands…</p>
  if (world.isError || !resolved) {
    return (
      <p role="alert" className="p-4 text-error">
        Could not load your islands.
      </p>
    )
  }
  if (resolved.missing) {
    return (
      <div className="space-y-3 p-4">
        <p className="text-text-primary">That island or district doesn't exist.</p>
        <Link to="/" className="inline-flex min-h-11 items-center text-brand">
          Back to the archipelago
        </Link>
      </div>
    )
  }

  const today = todayIn(me.data?.user.timezone ?? 'UTC')
  const summaries = islandSummaries(world.data, today)
  const panelTitle = resolved.milestone?.name ?? resolved.project?.name ?? 'Due today & overdue'
  const { project, milestone } = resolved

  const closeEditor = () => setEditor(null)
  const afterRemoval = (to: string) => ({ removed }: { removed: boolean }) => {
    setEditor(null)
    if (removed) void navigate({ to })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div className="flex min-h-0 flex-1 flex-col">
        <IslandSwitcher summaries={summaries} currentProjectId={project?.id ?? null} />
        <WorldArea
          world={world.data}
          resolved={resolved}
          summaries={summaries}
          onNewProject={() => setEditor({ kind: 'new-project' })}
          onNewMilestone={project ? () => setEditor({ kind: 'new-milestone', projectId: project.id }) : undefined}
          onEditProject={project ? () => setEditor({ kind: 'edit-project', project }) : undefined}
          onEditMilestone={milestone ? () => setEditor({ kind: 'edit-milestone', milestone }) : undefined}
        />
      </div>
      <PanelFrame title={panelTitle}>
        <TaskPanel
          world={world.data}
          focus={resolved.focus}
          title={panelTitle}
          today={today}
          searchRef={searchRef}
          onNewTask={openNewTask}
          onEditTask={(task) => setEditor({ kind: 'edit-task', task })}
        />
      </PanelFrame>

      {editor && (
        <EditorFrame title={editorTitle[editor.kind]} onClose={closeEditor}>
          {editor.kind === 'new-project' && <ProjectForm onDone={closeEditor} />}
          {editor.kind === 'edit-project' && (
            <ProjectForm project={editor.project} onDone={afterRemoval('/')} />
          )}
          {editor.kind === 'new-milestone' && (
            <MilestoneForm projectId={editor.projectId} onDone={closeEditor} />
          )}
          {editor.kind === 'edit-milestone' && (
            <MilestoneForm
              projectId={editor.milestone.projectId}
              milestone={editor.milestone}
              onDone={afterRemoval(`/p/${editor.milestone.projectId}`)}
            />
          )}
          {editor.kind === 'new-task' && (
            <TaskForm
              world={world.data}
              projectId={editor.projectId}
              defaultMilestoneId={editor.milestoneId}
              onDone={closeEditor}
            />
          )}
          {editor.kind === 'edit-task' && (
            <TaskForm
              world={world.data}
              projectId={editor.task.projectId}
              task={editor.task}
              onDone={closeEditor}
            />
          )}
        </EditorFrame>
      )}
    </div>
  )
}
```

The hooks (`useShortcuts`, `useState`, `useRef`, `useNavigate`) run before the early returns, so the order of hooks is stable across renders.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && bunx vitest run && cd ../.. && bun run typecheck && bun run lint`
Expected: all web tests PASS (Tasks 1–7); clean.

If Biome's a11y rules flag a construct above (for example the backdrop `div` or `<dialog open>`), fix it the way the rule suggests, as long as the tests stay unchanged. Report what you changed.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): add project, milestone and task editors with keyboard shortcuts"
```

---

### Task 8: Dev workflow, production build and end-to-end check

**Files:**
- Modify: `README.md` (web dev instructions)
- Modify: `turbo.json` only if needed for `build` (see Step 1)

**Interfaces:**
- Consumes: everything above; the Phase 2a API.
- Produces: `bun run dev` starts the API (3000) and web (5173) together. `bun run build` produces `apps/web/dist`. A recorded manual check of login → create → complete in a real browser-less run.

- [ ] **Step 1: Root build task**

Add a `build` task to `turbo.json` so `bun run build` works across the repo:
```json
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
```
Add the root script `"build": "turbo run build"` to `package.json`.

Run: `bun run build`
Expected: `@archipelago/web#build` succeeds and writes `apps/web/dist/index.html` plus hashed assets. Other packages have no build script, which is fine.

- [ ] **Step 2: Dev servers together**

Run (in the background, then probe):
```bash
docker compose up -d postgres
bun run dev > /tmp/archipelago-dev.log 2>&1 &
DEV_PID=$!
for i in $(seq 1 30); do curl -sf localhost:5173/ > /dev/null && break; sleep 1; done
curl -s localhost:5173/ | grep -o '<div id="root"></div>'
curl -s localhost:5173/api/v1/health
kill $DEV_PID; wait $DEV_PID 2>/dev/null
```
Expected:
- The HTML contains `<div id="root"></div>`.
- The proxied health call returns `{"ok":true}`, which proves the Vite `/api` proxy reaches the API.
- `/tmp/archipelago-dev.log` shows both dev servers starting with no errors.

- [ ] **Step 3: End-to-end check through the proxy**

With the dev servers running as in Step 2 (start them again), run:
```bash
cd apps/api && bun run seed:user --email boss@example.com --password 'correct horse battery staple'; cd ../..
JAR=$(mktemp)
curl -s -c "$JAR" -H 'content-type: application/json' \
  -d '{"email":"boss@example.com","password":"correct horse battery staple"}' \
  localhost:5173/api/v1/auth/login
curl -s -b "$JAR" -H 'content-type: application/json' -d '{"name":"Beta"}' localhost:5173/api/v1/projects
curl -s -b "$JAR" localhost:5173/api/v1/world
rm -f "$JAR"
docker compose exec -T postgres psql -U archipelago -d archipelago -c "DELETE FROM users"
```
Expected:
- Login returns the user JSON.
- Project creation returns `{"project":{…"name":"Beta"…}}`.
- `/world` lists Beta.

This proves the cookie flow works through the same origin the browser will use.

- [ ] **Step 4: README**

In `README.md`, replace the "Local development" block with:
````markdown
## Local development

```bash
bun install
cp apps/api/.env.example apps/api/.env
docker compose up -d postgres        # Postgres 16 on 127.0.0.1:5433 (+ archipelago_test DB)
bun run seed:user --email you@example.com   # prompts for a password (min 12 chars)
bun run dev                          # API on :3000, web app on http://localhost:5173
```

The web dev server proxies `/api` to the API, so the session cookie is same-origin.
Open http://localhost:5173 on your phone (same network) with `bun run dev -- --host` in `apps/web` to try the mobile layout.
````
Add a row to the Commands table:
```markdown
| `bun run build` | Production build of the web app (`apps/web/dist`) |
```

- [ ] **Step 5: Full verification**

Run: `bun run test && bun run typecheck && bun run lint && bun run build`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add turbo.json package.json README.md
git commit -m "chore: add web build task and dev workflow docs"
```

---

## Phase 2b Done When

- [ ] `bun run test`, `bun run typecheck`, `bun run lint` and `bun run build` are green.
- [ ] A signed-in user can, on a phone-sized screen and on desktop:
  - browse the archipelago, islands and districts by URL
  - create, edit and delete islands, milestones and tasks
  - cycle task status and complete tasks
  - search tasks
- [ ] On a phone, island cards and the switcher overflow and scroll instead of shrinking, and the task panel is a 3-detent bottom sheet. On desktop it is a resizable side panel with N, / and Esc shortcuts.
- [ ] An expired session lands on `/login`. A bad deep link shows not-found with a way back. A double tap never double-completes.
