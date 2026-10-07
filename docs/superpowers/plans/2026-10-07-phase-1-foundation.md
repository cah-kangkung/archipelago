# Phase 1: Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Turborepo + Bun monorepo with shared packages, a Postgres schema with migrations, and a Hono API supporting single-user login (session cookie), personal API tokens (bearer auth), a login rate limit and a `seed:user` CLI, running locally in Docker Compose.

**Architecture:** Bun workspaces orchestrated by Turborepo. `packages/shared` holds zod schemas, domain enums and error codes, consumed as TypeScript source with no build step. `apps/api` is a Hono app built by `createApp(deps)` with injected `db` and `config`, so tests run each case inside a rolled-back Postgres transaction. Drizzle ORM (postgres.js driver, snake_case casing) owns the schema and migrations.

**Tech Stack:** Bun 1.4.2, Turborepo 2.11, TypeScript (strict), Hono 4.13, Drizzle ORM 0.45 + drizzle-kit 0.31, postgres.js 3.4, zod 4, Biome 2.5, Postgres 16 (Docker).

**Spec:** `docs/superpowers/specs/2026-10-07-archipelago-task-game-design.md` (Phase 1 row in section 10, plus sections 4, 5 and 6).

## Global Constraints

- Package manager and runtime: Bun `1.4.2`, declared as `"packageManager": "bun@1.4.2"` in the root `package.json`.
- Workspace package names use the `@archipelago/` scope.
- API base path: `/api/v1`.
- Every error response has the shape `{ "error": { "code", "message", "fields"? } }`. Codes and statuses: `bad_request` 400, `unauthorized` 401, `not_found` 404, `conflict` 409, `validation_failed` 422, `rate_limited` 429, `internal` 500.
- A resource the caller doesn't own returns `404`, never `403` (no existence leak).
- Passwords are hashed with argon2id via `Bun.password`. The minimum password length for `seed:user` is 12 characters.
- Session cookie: name `session`, `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` when `COOKIE_SECURE=true` (the default). Default TTL is 30 days.
- Session tokens and API tokens are random 32-byte base64url strings. Only their SHA-256 hex digest is stored. API tokens carry the prefix `arch_`.
- Login rate limit: 10 attempts per 15 minutes per client IP.
- Postgres 16. All primary keys are `uuid` with `defaultRandom()`, except `sessions.id`, which is the token hash.
- TypeScript `strict` with `noUncheckedIndexedAccess`. No `any`, and no non-null assertions (`!`) in `src/`.
- Formatting and linting with Biome: single quotes, no semicolons, 2-space indent, line width 100.
- Commit messages use Conventional Commits. No AI attribution lines or `Co-Authored-By` trailers.

## Review Focus

1. **Email case and whitespace.** A login with `"  Boss@Example.COM "` must match a user seeded as `boss@example.com`. Pinned in Task 1 (schema test) and Task 6 (route test).
2. **Malformed JSON body.** A POST with a broken or empty JSON body must return `400 bad_request` in the error shape, never a 500. Pinned in Task 4 and Task 6.
3. **Bad credentials.** Garbage, expired or revoked credentials (cookie or bearer) must return `401`, never a 500. Pinned in Task 6 and Task 8.
4. **Non-UUID path ids.** `DELETE /tokens/abc` must return `404`, not a 500 from Postgres rejecting an invalid uuid. Pinned in Task 8.
5. **Spoofed `X-Forwarded-For`.** When `TRUST_PROXY=false`, a forged header must not give an attacker a fresh rate-limit bucket. Pinned in Task 7.

## File Structure

```
package.json                    root workspaces + scripts
turbo.json                      typecheck / test / dev pipelines
biome.json                      lint + format config
.gitignore                      (modify) add node_modules, .turbo, .env, dist
docker-compose.yml              postgres (+ api in Task 10)
docker/postgres-init/01-test-db.sql   creates archipelago_test database
README.md                       local dev instructions (Task 10)

packages/tsconfig/
  package.json, base.json       shared compiler options

packages/shared/
  package.json, tsconfig.json
  src/index.ts                  re-exports
  src/errors.ts                 ERROR_CODES, ERROR_STATUS, errorBodySchema
  src/domain.ts                 TASK_PRIORITIES, TASK_SIZES, TASK_STATUSES, LEDGER_KINDS
  src/timezone.ts               isValidTimezone
  src/auth.ts                   emailSchema, loginInputSchema, seedUserInputSchema,
                                createApiTokenInputSchema, PASSWORD_MIN_LENGTH
  src/*.test.ts

packages/ui-tokens/
  package.json, tsconfig.json
  src/index.ts                  colors, spacing, radius, toCssVariables()
  src/index.test.ts

apps/api/
  package.json, tsconfig.json, bunfig.toml, drizzle.config.ts, .env.example, Dockerfile
  drizzle/                      generated SQL migrations (committed)
  src/config.ts                 loadConfig(env) → Config
  src/types.ts                  Deps, AppEnv
  src/errors.ts                 AppError, errorBody, handleError
  src/validate.ts               jsonBody(schema), toFieldErrors
  src/app.ts                    createApp(deps), AppType
  src/server.ts                 entrypoint: migrate + Bun.serve
  src/db/schema.ts              all tables + enums
  src/db/client.ts              createDb, Database, Db
  src/db/migrate.ts             runMigrations
  src/db/pg-errors.ts           isUniqueViolation
  src/auth/crypto.ts            generateToken, sha256Hex
  src/auth/passwords.ts         hashPassword, verifyPassword
  src/auth/sessions.ts          createSession, findSessionUser, deleteSession, AuthUser
  src/auth/middleware.ts        requireAuth(deps), SESSION_COOKIE
  src/auth/rate-limit.ts        createFixedWindowLimiter, RateLimiter
  src/auth/client-ip.ts         clientIp(c, trustProxy)
  src/auth/api-tokens.ts        createApiToken, listApiTokens, deleteApiToken, findApiTokenUser
  src/auth/seed-user.ts         seedUser, SeedUserError
  src/cli/seed-user.ts          CLI wrapper
  src/routes/auth.ts            /auth/login, /auth/logout, /auth/me
  src/routes/tokens.ts          /tokens
  src/**/*.test.ts              colocated tests
  test/setup.ts                 preload: migrate test DB
  test/db.ts                    testDb, withRollback
  test/fixtures.ts              insertUser, insertUserWithPassword, testConfig
  test/http.ts                  postJson, sessionCookieFrom
```

---

### Task 1: Monorepo scaffold and `packages/shared`

**Files:**
- Create: `package.json`, `turbo.json`, `biome.json`
- Modify: `.gitignore`
- Create: `packages/tsconfig/package.json`, `packages/tsconfig/base.json`
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`
- Create: `packages/shared/src/{index,errors,domain,timezone,auth}.ts`
- Test: `packages/shared/src/{errors,timezone,auth}.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (from `@archipelago/shared`):
  - `ERROR_CODES` (readonly tuple), `type ErrorCode`, `ERROR_STATUS: Record<ErrorCode, number>`, `errorBodySchema`, `type ErrorBody`
  - `TASK_PRIORITIES = ['low','med','high']`, `TASK_SIZES = ['S','M','L']`, `TASK_STATUSES = ['todo','doing','done']`, `LEDGER_KINDS = ['task_reward','milestone_bonus','streak_bonus','daily_bonus','purchase','reversal']`, and their element types `TaskPriority`, `TaskSize`, `TaskStatus`, `LedgerKind`
  - `isValidTimezone(tz: string): boolean`
  - `emailSchema`, `loginInputSchema` → `LoginInput { email; password }`, `PASSWORD_MIN_LENGTH = 12`, `seedUserInputSchema` → `SeedUserInput { email; password; timezone }`, `createApiTokenInputSchema` → `CreateApiTokenInput { name }`

- [ ] **Step 1: Root workspace files**

`package.json`:
```json
{
  "name": "archipelago",
  "private": true,
  "packageManager": "bun@1.4.2",
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "turbo run dev",
    "test": "turbo run test",
    "typecheck": "turbo run typecheck",
    "lint": "biome check .",
    "format": "biome check --write ."
  }
}
```

`turbo.json`:
```json
{
  "$schema": "https://turborepo.dev/schema.json",
  "tasks": {
    "typecheck": { "dependsOn": ["^typecheck"] },
    "test": { "env": ["DATABASE_URL_TEST"] },
    "dev": { "cache": false, "persistent": true }
  }
}
```

`biome.json`:
```json
{
  "$schema": "https://biomejs.dev/schemas/2.5.15/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": { "includes": ["**", "!**/drizzle/meta"] },
  "formatter": { "indentStyle": "space", "indentWidth": 2, "lineWidth": 100 },
  "javascript": { "formatter": { "quoteStyle": "single", "semicolons": "asNeeded" } },
  "linter": { "enabled": true, "rules": { "recommended": true } }
}
```

Append to `.gitignore`:
```
node_modules/
.turbo/
dist/
coverage/
.env
```

- [ ] **Step 2: `packages/tsconfig`**

`packages/tsconfig/package.json`:
```json
{
  "name": "@archipelago/tsconfig",
  "private": true,
  "files": ["base.json"]
}
```

`packages/tsconfig/base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2023"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "noEmit": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "resolveJsonModule": true,
    "allowImportingTsExtensions": true,
    "types": ["bun"]
  }
}
```

- [ ] **Step 3: `packages/shared` package files**

`packages/shared/package.json`:
```json
{
  "name": "@archipelago/shared",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "bun test",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@archipelago/tsconfig": "workspace:*"
  }
}
```

`packages/shared/tsconfig.json`:
```json
{
  "extends": "@archipelago/tsconfig/base.json",
  "include": ["src"]
}
```

Install the dependencies:
```bash
bun add -d turbo @biomejs/biome typescript @types/bun
cd packages/shared && bun add zod && bun add -d typescript @types/bun && cd ../..
```

- [ ] **Step 4: Write the failing tests**

`packages/shared/src/errors.test.ts`:
```ts
import { describe, expect, test } from 'bun:test'
import { ERROR_CODES, ERROR_STATUS, errorBodySchema } from './errors'

describe('error codes', () => {
  test('every code maps to an HTTP status', () => {
    for (const code of ERROR_CODES) expect(ERROR_STATUS[code]).toBeNumber()
  })

  test('statuses match the spec', () => {
    expect(ERROR_STATUS).toEqual({
      bad_request: 400,
      unauthorized: 401,
      not_found: 404,
      conflict: 409,
      validation_failed: 422,
      rate_limited: 429,
      internal: 500,
    })
  })

  test('errorBodySchema accepts the standard shape with optional fields', () => {
    expect(
      errorBodySchema.safeParse({ error: { code: 'not_found', message: 'Nope' } }).success,
    ).toBe(true)
    expect(
      errorBodySchema.safeParse({
        error: { code: 'validation_failed', message: 'Bad', fields: { email: ['Invalid'] } },
      }).success,
    ).toBe(true)
    expect(errorBodySchema.safeParse({ error: { code: 'teapot', message: 'x' } }).success).toBe(
      false,
    )
  })
})
```

`packages/shared/src/timezone.test.ts`:
```ts
import { expect, test } from 'bun:test'
import { isValidTimezone } from './timezone'

test('accepts IANA timezones', () => {
  expect(isValidTimezone('Asia/Jakarta')).toBe(true)
  expect(isValidTimezone('UTC')).toBe(true)
  expect(isValidTimezone('America/New_York')).toBe(true)
})

test('rejects unknown or empty timezones', () => {
  expect(isValidTimezone('Mars/Olympus_Mons')).toBe(false)
  expect(isValidTimezone('')).toBe(false)
  expect(isValidTimezone('   ')).toBe(false)
})
```

`packages/shared/src/auth.test.ts`:
```ts
import { describe, expect, test } from 'bun:test'
import {
  createApiTokenInputSchema,
  loginInputSchema,
  PASSWORD_MIN_LENGTH,
  seedUserInputSchema,
} from './auth'

describe('loginInputSchema', () => {
  test('normalises email case and whitespace', () => {
    const parsed = loginInputSchema.parse({ email: '  Boss@Example.COM ', password: 'x' })
    expect(parsed.email).toBe('boss@example.com')
  })

  test('rejects invalid email and empty password', () => {
    const r = loginInputSchema.safeParse({ email: 'not-an-email', password: '' })
    expect(r.success).toBe(false)
    if (!r.success) {
      const paths = r.error.issues.map((i) => i.path.join('.'))
      expect(paths).toContain('email')
      expect(paths).toContain('password')
    }
  })
})

describe('seedUserInputSchema', () => {
  const valid = { email: 'boss@example.com', password: 'x'.repeat(12), timezone: 'Asia/Jakarta' }

  test('accepts a valid seed input', () => {
    expect(seedUserInputSchema.safeParse(valid).success).toBe(true)
  })

  test(`rejects passwords shorter than ${PASSWORD_MIN_LENGTH}`, () => {
    expect(seedUserInputSchema.safeParse({ ...valid, password: 'short' }).success).toBe(false)
  })

  test('rejects unknown timezones', () => {
    expect(seedUserInputSchema.safeParse({ ...valid, timezone: 'Nowhere/Land' }).success).toBe(
      false,
    )
  })
})

describe('createApiTokenInputSchema', () => {
  test('trims the name', () => {
    expect(createApiTokenInputSchema.parse({ name: '  GitLab sync ' }).name).toBe('GitLab sync')
  })

  test('rejects blank and over-long names', () => {
    expect(createApiTokenInputSchema.safeParse({ name: '   ' }).success).toBe(false)
    expect(createApiTokenInputSchema.safeParse({ name: 'x'.repeat(65) }).success).toBe(false)
  })
})
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `cd packages/shared && bun test`
Expected: FAIL with `Cannot find module './errors'` (and the same for `./timezone` and `./auth`).

- [ ] **Step 6: Implement**

`packages/shared/src/errors.ts`:
```ts
import { z } from 'zod'

export const ERROR_CODES = [
  'bad_request',
  'unauthorized',
  'not_found',
  'conflict',
  'validation_failed',
  'rate_limited',
  'internal',
] as const
export type ErrorCode = (typeof ERROR_CODES)[number]

export const ERROR_STATUS = {
  bad_request: 400,
  unauthorized: 401,
  not_found: 404,
  conflict: 409,
  validation_failed: 422,
  rate_limited: 429,
  internal: 500,
} as const satisfies Record<ErrorCode, number>

export const errorBodySchema = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string(),
    fields: z.record(z.string(), z.array(z.string())).optional(),
  }),
})
export type ErrorBody = z.infer<typeof errorBodySchema>
```

`packages/shared/src/domain.ts`:
```ts
export const TASK_PRIORITIES = ['low', 'med', 'high'] as const
export type TaskPriority = (typeof TASK_PRIORITIES)[number]

export const TASK_SIZES = ['S', 'M', 'L'] as const
export type TaskSize = (typeof TASK_SIZES)[number]

export const TASK_STATUSES = ['todo', 'doing', 'done'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export const LEDGER_KINDS = [
  'task_reward',
  'milestone_bonus',
  'streak_bonus',
  'daily_bonus',
  'purchase',
  'reversal',
] as const
export type LedgerKind = (typeof LEDGER_KINDS)[number]
```

`packages/shared/src/timezone.ts`:
```ts
export function isValidTimezone(tz: string): boolean {
  if (tz.trim() === '') return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}
```

`packages/shared/src/auth.ts`:
```ts
import { z } from 'zod'
import { isValidTimezone } from './timezone'

export const PASSWORD_MIN_LENGTH = 12

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email())

export const loginInputSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(1024),
})
export type LoginInput = z.infer<typeof loginInputSchema>

export const seedUserInputSchema = z.object({
  email: emailSchema,
  password: z.string().min(PASSWORD_MIN_LENGTH).max(1024),
  timezone: z.string().refine(isValidTimezone, 'Unknown IANA timezone'),
})
export type SeedUserInput = z.infer<typeof seedUserInputSchema>

export const createApiTokenInputSchema = z.object({
  name: z.string().trim().min(1).max(64),
})
export type CreateApiTokenInput = z.infer<typeof createApiTokenInputSchema>
```

`packages/shared/src/index.ts`:
```ts
export * from './auth'
export * from './domain'
export * from './errors'
export * from './timezone'
```

- [ ] **Step 7: Run the tests and checks to verify they pass**

Run: `cd packages/shared && bun test && cd ../.. && bun run typecheck && bun run lint`
Expected: all tests PASS; `turbo run typecheck` succeeds for `@archipelago/shared`; Biome reports no errors. If Biome only reports formatting, run `bun run format` and re-run.

- [ ] **Step 8: Commit**

```bash
git add package.json bun.lock turbo.json biome.json .gitignore packages/tsconfig packages/shared
git commit -m "feat: scaffold turborepo workspace and shared package"
```

---

### Task 2: `packages/ui-tokens`

**Files:**
- Create: `packages/ui-tokens/package.json`, `packages/ui-tokens/tsconfig.json`, `packages/ui-tokens/src/index.ts`
- Test: `packages/ui-tokens/src/index.test.ts`

**Interfaces:**
- Consumes: `@archipelago/tsconfig`.
- Produces (from `@archipelago/ui-tokens`): `colors`, `spacing`, `radius` (const objects) and `toCssVariables(): string`, which returns a `:root { ... }` block. Phase 2 imports these into Tailwind, and Phase 4 into the 3D material mapping.

- [ ] **Step 1: Package files**

`packages/ui-tokens/package.json`:
```json
{
  "name": "@archipelago/ui-tokens",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "bun test",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@archipelago/tsconfig": "workspace:*"
  }
}
```

`packages/ui-tokens/tsconfig.json`:
```json
{
  "extends": "@archipelago/tsconfig/base.json",
  "include": ["src"]
}
```

Run: `cd packages/ui-tokens && bun add -d typescript @types/bun && cd ../..`

- [ ] **Step 2: Write the failing test**

`packages/ui-tokens/src/index.test.ts`:
```ts
import { describe, expect, test } from 'bun:test'
import { colors, radius, spacing, toCssVariables } from './index'

describe('A\'raf tokens', () => {
  test('brand colours match the design system', () => {
    expect(colors.brand).toBe('#004990')
    expect(colors.brandSecondary).toBe('#0069d2')
    expect(colors.success).toBe('#16a34a')
    expect(colors.warning).toBe('#ba7517')
    expect(colors.error).toBe('#dc2626')
  })

  test('spacing scale never uses odd values', () => {
    for (const value of Object.values(spacing)) expect(value % 2).toBe(0)
  })

  test('toCssVariables emits kebab-case custom properties', () => {
    const css = toCssVariables()
    expect(css.startsWith(':root {\n')).toBe(true)
    expect(css).toContain('  --color-brand: #004990;\n')
    expect(css).toContain('  --color-brand-secondary: #0069d2;\n')
    expect(css).toContain('  --spacing-2xl: 32px;\n')
    expect(css).toContain(`  --radius-md: ${radius.md}px;\n`)
    expect(css.endsWith('}\n')).toBe(true)
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd packages/ui-tokens && bun test`
Expected: FAIL. The module exports nothing yet (`colors` undefined or module not found).

- [ ] **Step 4: Implement**

`packages/ui-tokens/src/index.ts`:
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

export const radius = { sm: 4, md: 6, default: 8 } as const

const kebab = (key: string): string => key.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`)

export function toCssVariables(): string {
  const lines = [
    ...Object.entries(colors).map(([k, v]) => `  --color-${kebab(k)}: ${v};`),
    ...Object.entries(spacing).map(([k, v]) => `  --spacing-${k}: ${v}px;`),
    ...Object.entries(radius).map(([k, v]) => `  --radius-${k}: ${v}px;`),
  ]
  return `:root {\n${lines.join('\n')}\n}\n`
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd packages/ui-tokens && bun test && cd ../.. && bun run typecheck && bun run lint`
Expected: PASS; typecheck and lint clean.

- [ ] **Step 6: Commit**

```bash
git add packages/ui-tokens bun.lock
git commit -m "feat: add A'raf design tokens package"
```

---
### Task 3: Postgres, Drizzle schema, migrations and test harness

**Files:**
- Create: `docker-compose.yml`, `docker/postgres-init/01-test-db.sql`
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/bunfig.toml`, `apps/api/drizzle.config.ts`, `apps/api/.env.example`
- Create: `apps/api/src/db/{schema,client,migrate,pg-errors}.ts`
- Create: `apps/api/test/{setup,db,fixtures}.ts`
- Generate: `apps/api/drizzle/0000_*.sql` and `apps/api/drizzle/meta/*`
- Test: `apps/api/src/db/schema.test.ts`

**Interfaces:**
- Consumes: `TASK_PRIORITIES`, `TASK_SIZES`, `TASK_STATUSES`, `LEDGER_KINDS` from `@archipelago/shared`.
- Produces:
  - `src/db/schema.ts`: tables `users`, `sessions`, `apiTokens`, `projects`, `milestones`, `tasks`, `ledger`, `buildings`, and enums `taskPriority`, `taskSize`, `taskStatus`, `ledgerKind`.
  - `src/db/client.ts`: `type Schema`, `type Database` (top-level db), `type Db` (accepts either the db or a transaction; **all services take `Db`**), and `createDb(url: string): { db: Database; close(): Promise<void> }`.
  - `src/db/migrate.ts`: `runMigrations(db: Database): Promise<void>`.
  - `src/db/pg-errors.ts`: `isUniqueViolation(err: unknown): boolean`.
  - `test/db.ts`: `testDb: Database`, `withRollback(fn: (tx: Db) => Promise<void>): Promise<void>`.
  - `test/fixtures.ts`: `insertUser(db: Db, overrides?: { email?: string; timezone?: string; passwordHash?: string })`, which returns the inserted `users` row.

- [ ] **Step 1: Docker Compose Postgres**

`docker-compose.yml`:
```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: archipelago
      POSTGRES_PASSWORD: archipelago
      POSTGRES_DB: archipelago
    ports:
      - "127.0.0.1:5433:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./docker/postgres-init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U archipelago"]
      interval: 2s
      timeout: 3s
      retries: 15

volumes:
  pgdata:
```

`docker/postgres-init/01-test-db.sql`:
```sql
CREATE DATABASE archipelago_test;
```

Run: `docker compose up -d postgres && docker compose ps`
Expected: `postgres` is `healthy`. Init scripts only run on a fresh volume. If the database was created earlier without the test DB, run `docker compose down -v` and start it again.

- [ ] **Step 2: `apps/api` package files**

`apps/api/package.json`:
```json
{
  "name": "@archipelago/api",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "bun --watch src/server.ts",
    "test": "bun test",
    "typecheck": "tsc --noEmit",
    "db:generate": "bunx --bun drizzle-kit generate",
    "seed:user": "bun src/cli/seed-user.ts"
  },
  "devDependencies": {
    "@archipelago/tsconfig": "workspace:*"
  }
}
```

`apps/api/tsconfig.json`:
```json
{
  "extends": "@archipelago/tsconfig/base.json",
  "include": ["src", "test", "drizzle.config.ts"]
}
```

`apps/api/bunfig.toml`:
```toml
[test]
preload = ["./test/setup.ts"]
```

`apps/api/.env.example`:
```
DATABASE_URL=postgres://archipelago:archipelago@localhost:5433/archipelago
DATABASE_URL_TEST=postgres://archipelago:archipelago@localhost:5433/archipelago_test
COOKIE_SECURE=false
TRUST_PROXY=false
```

Run:
```bash
cp apps/api/.env.example apps/api/.env
cd apps/api
bun add hono drizzle-orm postgres zod @archipelago/shared@workspace:*
bun add -d drizzle-kit typescript @types/bun
cd ../..
```

`apps/api/drizzle.config.ts`:
```ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  casing: 'snake_case',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
})
```

- [ ] **Step 3: Schema, client, migrator, error helper**

`apps/api/src/db/schema.ts`:
```ts
import { LEDGER_KINDS, TASK_PRIORITIES, TASK_SIZES, TASK_STATUSES } from '@archipelago/shared'
import {
  type AnyPgColumn,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

export const taskPriority = pgEnum('task_priority', TASK_PRIORITIES)
export const taskSize = pgEnum('task_size', TASK_SIZES)
export const taskStatus = pgEnum('task_status', TASK_STATUSES)
export const ledgerKind = pgEnum('ledger_kind', LEDGER_KINDS)

const timestamptz = () => timestamp({ withTimezone: true })
const createdAt = () => timestamptz().notNull().defaultNow()

export const users = pgTable('users', {
  id: uuid().primaryKey().defaultRandom(),
  email: text().notNull().unique(),
  passwordHash: text().notNull(),
  timezone: text().notNull(),
  createdAt: createdAt(),
})

export const sessions = pgTable(
  'sessions',
  {
    // SHA-256 hex digest of the session token; the token itself is never stored.
    id: text().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamptz().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('sessions_user_id_idx').on(t.userId)],
)

export const apiTokens = pgTable(
  'api_tokens',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    tokenHash: text().notNull().unique(),
    lastUsedAt: timestamptz(),
    createdAt: createdAt(),
  },
  (t) => [index('api_tokens_user_id_idx').on(t.userId)],
)

export const projects = pgTable(
  'projects',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    islandSeed: integer().notNull(),
    archipelagoX: integer().notNull(),
    archipelagoY: integer().notNull(),
    archivedAt: timestamptz(),
    createdAt: createdAt(),
  },
  (t) => [index('projects_user_id_idx').on(t.userId)],
)

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
    completedAt: timestamptz(),
    createdAt: createdAt(),
  },
  (t) => [index('milestones_project_id_idx').on(t.projectId)],
)

export const tasks = pgTable(
  'tasks',
  {
    id: uuid().primaryKey().defaultRandom(),
    projectId: uuid()
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    milestoneId: uuid().references(() => milestones.id, { onDelete: 'set null' }),
    title: text().notNull(),
    notes: text().notNull().default(''),
    dueDate: date({ mode: 'string' }),
    priority: taskPriority().notNull().default('med'),
    size: taskSize().notNull().default('M'),
    status: taskStatus().notNull().default('todo'),
    completedAt: timestamptz(),
    plotX: integer().notNull(),
    plotY: integer().notNull(),
    sortOrder: integer().notNull().default(0),
    externalSource: text(),
    externalId: text(),
    externalUrl: text(),
    createdAt: createdAt(),
    updatedAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    index('tasks_project_id_idx').on(t.projectId),
    index('tasks_milestone_id_idx').on(t.milestoneId),
    // NULLs are distinct in Postgres, so native tasks (both columns null) never collide.
    uniqueIndex('tasks_external_ref_unique').on(t.externalSource, t.externalId),
  ],
)

export const ledger = pgTable(
  'ledger',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: ledgerKind().notNull(),
    amount: integer().notNull(),
    refType: text(),
    refId: uuid(),
    reversesId: uuid().references((): AnyPgColumn => ledger.id),
    createdAt: createdAt(),
  },
  (t) => [
    index('ledger_user_id_idx').on(t.userId),
    uniqueIndex('ledger_reverses_id_unique').on(t.reversesId),
  ],
)

export const buildings = pgTable(
  'buildings',
  {
    id: uuid().primaryKey().defaultRandom(),
    projectId: uuid()
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    type: text().notNull(),
    plotX: integer().notNull(),
    plotY: integer().notNull(),
    rotation: smallint().notNull().default(0),
    placedAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [uniqueIndex('buildings_project_plot_unique').on(t.projectId, t.plotX, t.plotY)],
)
```

`apps/api/src/db/client.ts`:
```ts
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { drizzle, type PostgresJsDatabase, type PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

export type Schema = typeof schema
export type Database = PostgresJsDatabase<Schema>
/** Either the top-level database or a transaction. Every service accepts this. */
export type Db = PgDatabase<PostgresJsQueryResultHKT, Schema>

export function createDb(url: string): { db: Database; close: () => Promise<void> } {
  const client = postgres(url, { max: 10, onnotice: () => {} })
  const db = drizzle({ client, schema, casing: 'snake_case' })
  return { db, close: () => client.end() }
}
```

`apps/api/src/db/migrate.ts`:
```ts
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import type { Database } from './client'

const MIGRATIONS_FOLDER = new URL('../../drizzle', import.meta.url).pathname

export async function runMigrations(db: Database): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })
}
```

`apps/api/src/db/pg-errors.ts`:
```ts
const UNIQUE_VIOLATION = '23505'

const pgCode = (err: unknown): string | undefined => {
  if (typeof err !== 'object' || err === null) return undefined
  if ('code' in err && typeof err.code === 'string') return err.code
  // Drizzle >= 0.44 wraps driver errors in DrizzleQueryError with the original as `cause`.
  if ('cause' in err) return pgCode(err.cause)
  return undefined
}

export const isUniqueViolation = (err: unknown): boolean => pgCode(err) === UNIQUE_VIOLATION
```

- [ ] **Step 4: Generate the initial migration**

Run: `cd apps/api && bun run db:generate && ls drizzle && cd ../..`
Expected: `drizzle/0000_<name>.sql` and `drizzle/meta/` exist. Open the SQL and confirm it creates all 8 tables, 4 enums, the `tasks_external_ref_unique`, `ledger_reverses_id_unique` and `buildings_project_plot_unique` indexes, and snake_case columns (for example `password_hash`, `island_seed`).

- [ ] **Step 5: Test harness**

`apps/api/test/db.ts`:
```ts
import { type Db, createDb } from '../src/db/client'

const url = process.env.DATABASE_URL_TEST
if (!url) throw new Error('DATABASE_URL_TEST is not set. Copy apps/api/.env.example to apps/api/.env')

const { db, close } = createDb(url)
export const testDb = db
export const closeTestDb = close

class Rollback extends Error {}

/** Runs `fn` inside a transaction that is always rolled back, so tests never leak rows. */
export async function withRollback(fn: (tx: Db) => Promise<void>): Promise<void> {
  try {
    await testDb.transaction(async (tx) => {
      await fn(tx)
      throw new Rollback()
    })
  } catch (err) {
    if (!(err instanceof Rollback)) throw err
  }
}
```

`apps/api/test/setup.ts`:
```ts
import { afterAll } from 'bun:test'
import { runMigrations } from '../src/db/migrate'
import { closeTestDb, testDb } from './db'

await runMigrations(testDb)

afterAll(async () => {
  await closeTestDb()
})
```

`apps/api/test/fixtures.ts`:
```ts
import type { Db } from '../src/db/client'
import { users } from '../src/db/schema'

export async function insertUser(
  db: Db,
  overrides: { email?: string; timezone?: string; passwordHash?: string } = {},
) {
  const [user] = await db
    .insert(users)
    .values({
      email: overrides.email ?? `user-${crypto.randomUUID()}@example.com`,
      timezone: overrides.timezone ?? 'Asia/Jakarta',
      passwordHash: overrides.passwordHash ?? 'not-a-real-hash',
    })
    .returning()
  if (!user) throw new Error('insertUser: no row returned')
  return user
}
```

- [ ] **Step 6: Write the failing schema tests**

`apps/api/src/db/schema.test.ts`:
```ts
import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { insertUser } from '../../test/fixtures'
import { withRollback } from '../../test/db'
import { isUniqueViolation } from './pg-errors'
import { ledger, projects, tasks, users } from './schema'

const newProject = (userId: string) => ({
  userId,
  name: 'Beta',
  islandSeed: 42,
  archipelagoX: 0,
  archipelagoY: 0,
})

const newTask = (projectId: string, extra: Partial<typeof tasks.$inferInsert> = {}) => ({
  projectId,
  title: 'Write spec',
  plotX: 0,
  plotY: 0,
  ...extra,
})

describe('schema', () => {
  test('inserts a user with defaults', async () => {
    await withRollback(async (tx) => {
      const user = await insertUser(tx, { email: 'boss@example.com' })
      expect(user.id).toMatch(/^[0-9a-f-]{36}$/)
      expect(user.createdAt).toBeInstanceOf(Date)
    })
  })

  test('user email is unique', async () => {
    let caught: unknown
    await withRollback(async (tx) => {
      await insertUser(tx, { email: 'dup@example.com' })
      await insertUser(tx, { email: 'dup@example.com' })
    }).catch((err) => {
      caught = err
    })
    expect(isUniqueViolation(caught)).toBe(true)
  })

  test('task defaults are todo / med / M with empty notes', async () => {
    await withRollback(async (tx) => {
      const user = await insertUser(tx)
      const [project] = await tx.insert(projects).values(newProject(user.id)).returning()
      if (!project) throw new Error('no project')
      const [task] = await tx.insert(tasks).values(newTask(project.id)).returning()
      expect(task).toMatchObject({ status: 'todo', priority: 'med', size: 'M', notes: '' })
    })
  })

  test('native tasks never collide on the external ref index', async () => {
    await withRollback(async (tx) => {
      const user = await insertUser(tx)
      const [project] = await tx.insert(projects).values(newProject(user.id)).returning()
      if (!project) throw new Error('no project')
      await tx.insert(tasks).values([newTask(project.id), newTask(project.id)])
    })
  })

  test('the same external ref cannot be imported twice', async () => {
    let caught: unknown
    await withRollback(async (tx) => {
      const user = await insertUser(tx)
      const [project] = await tx.insert(projects).values(newProject(user.id)).returning()
      if (!project) throw new Error('no project')
      const ref = { externalSource: 'gitlab', externalId: '123' }
      await tx.insert(tasks).values(newTask(project.id, ref))
      await tx.insert(tasks).values(newTask(project.id, ref))
    }).catch((err) => {
      caught = err
    })
    expect(isUniqueViolation(caught)).toBe(true)
  })

  test('a ledger entry can be reversed at most once', async () => {
    let caught: unknown
    await withRollback(async (tx) => {
      const user = await insertUser(tx)
      const [entry] = await tx
        .insert(ledger)
        .values({ userId: user.id, kind: 'task_reward', amount: 25 })
        .returning()
      if (!entry) throw new Error('no entry')
      const reversal = { userId: user.id, kind: 'reversal' as const, amount: -25, reversesId: entry.id }
      await tx.insert(ledger).values(reversal)
      await tx.insert(ledger).values(reversal)
    }).catch((err) => {
      caught = err
    })
    expect(isUniqueViolation(caught)).toBe(true)
  })

  test('deleting a user cascades to their projects', async () => {
    await withRollback(async (tx) => {
      const user = await insertUser(tx)
      await tx.insert(projects).values(newProject(user.id))
      await tx.delete(users).where(eq(users.id, user.id))
      const remaining = await tx.select().from(projects).where(eq(projects.userId, user.id))
      expect(remaining).toHaveLength(0)
    })
  })
})
```

- [ ] **Step 7: Run the tests**

Run: `cd apps/api && bun test src/db`
Expected: PASS. Tests written against an already-complete schema would pass immediately, so check them by mutation instead: temporarily delete the `tasks_external_ref_unique` line from `schema.ts`, run `bun run db:generate`, and confirm "the same external ref cannot be imported twice" FAILS. Then restore the line, delete the extra generated migration file and its `drizzle/meta` snapshot/journal entry (`git checkout apps/api/drizzle && git clean -fd apps/api/drizzle`), recreate the test database with `docker compose exec postgres psql -U archipelago -c "DROP DATABASE archipelago_test" -c "CREATE DATABASE archipelago_test"`, and re-run until everything PASSES.

- [ ] **Step 8: Typecheck, lint, commit**

Run: `bun run typecheck && bun run lint`
Expected: clean.

```bash
git add docker-compose.yml docker apps/api bun.lock
git commit -m "feat(api): add postgres schema, migrations and test harness"
```

---

### Task 4: API config, error handling and app skeleton

**Files:**
- Create: `apps/api/src/{config,types,errors,validate,app}.ts`
- Modify: `apps/api/test/fixtures.ts` (add `testConfig`)
- Create: `apps/api/test/http.ts`
- Test: `apps/api/src/config.test.ts`, `apps/api/src/errors.test.ts`, `apps/api/src/app.test.ts`

**Interfaces:**
- Consumes: `Db` (Task 3), `ERROR_STATUS`, `ErrorCode`, `ErrorBody` (Task 1).
- Produces:
  - `src/config.ts`: `type Config = { databaseUrl: string; port: number; cookieSecure: boolean; trustProxy: boolean; sessionTtlDays: number }` and `loadConfig(env: Record<string, string | undefined>): Config` (throws on invalid input).
  - `src/types.ts`: `type Deps = { db: Db; config: Config; now?: () => Date }`. Task 7 adds `loginLimiter?`. Also `type AppEnv = { Variables: { user: AuthUser } }`, with `AuthUser` defined here as `{ id: string; email: string; timezone: string }` and re-exported by Task 5.
  - `src/errors.ts`: `class AppError(code: ErrorCode, message: string, fields?: Record<string, string[]>)` with a `.status` getter, `errorBody(code, message, fields?): ErrorBody`, and `handleError(err: Error, c: Context): Response`.
  - `src/validate.ts`: `jsonBody(schema)`, a Hono validator middleware that throws `AppError('validation_failed', ...)`, and `toFieldErrors(err: z.ZodError): Record<string, string[]>`.
  - `src/app.ts`: `createApp(deps: Deps)` returns the Hono app based at `/api/v1`, plus `type AppType`. `GET /api/v1/health` → `{ ok: true }`. Unknown routes → `404 not_found`.
  - `test/fixtures.ts`: `testConfig: Config`.
  - `test/http.ts`: `postJson(app, path, body, headers?)`, `sessionCookieFrom(res): string` (returns `session=<token>`).

- [ ] **Step 1: Write the failing tests**

`apps/api/src/config.test.ts`:
```ts
import { expect, test } from 'bun:test'
import { loadConfig } from './config'

const base = { DATABASE_URL: 'postgres://u:p@localhost:5432/db' }

test('applies defaults', () => {
  expect(loadConfig(base)).toEqual({
    databaseUrl: base.DATABASE_URL,
    port: 3000,
    cookieSecure: true,
    trustProxy: false,
    sessionTtlDays: 30,
  })
})

test('parses booleans and numbers from strings', () => {
  const config = loadConfig({ ...base, PORT: '8080', COOKIE_SECURE: 'false', TRUST_PROXY: 'true' })
  expect(config).toMatchObject({ port: 8080, cookieSecure: false, trustProxy: true })
})

test('fails loudly when DATABASE_URL is missing or not postgres', () => {
  expect(() => loadConfig({})).toThrow(/DATABASE_URL/)
  expect(() => loadConfig({ DATABASE_URL: 'mysql://x' })).toThrow(/DATABASE_URL/)
})
```

`apps/api/src/errors.test.ts`:
```ts
import { expect, test } from 'bun:test'
import { Hono } from 'hono'
import { z } from 'zod'
import { AppError, handleError } from './errors'
import { jsonBody } from './validate'

const app = new Hono()
app.onError(handleError)
app.post('/echo', jsonBody(z.object({ name: z.string().min(1) })), (c) =>
  c.json(c.req.valid('json')),
)
app.get('/conflict', () => {
  throw new AppError('conflict', 'Plot is occupied')
})
app.get('/boom', () => {
  throw new Error('secret internals')
})

const post = (body: string) =>
  app.request('/echo', { method: 'POST', headers: { 'content-type': 'application/json' }, body })

test('valid body passes through', async () => {
  const res = await post(JSON.stringify({ name: 'Ada' }))
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ name: 'Ada' })
})

test('schema failure → 422 with field errors', async () => {
  const res = await post(JSON.stringify({ name: '' }))
  expect(res.status).toBe(422)
  const body = await res.json()
  expect(body.error.code).toBe('validation_failed')
  expect(body.error.fields.name).toBeArray()
})

test('malformed JSON → 400 bad_request, not 500', async () => {
  const res = await post('{"name":')
  expect(res.status).toBe(400)
  expect((await res.json()).error.code).toBe('bad_request')
})

test('empty JSON body → 400 bad_request', async () => {
  const res = await post('')
  expect(res.status).toBe(400)
  expect((await res.json()).error.code).toBe('bad_request')
})

test('AppError maps to its status', async () => {
  const res = await app.request('/conflict')
  expect(res.status).toBe(409)
  expect(await res.json()).toEqual({ error: { code: 'conflict', message: 'Plot is occupied' } })
})

test('unexpected errors → 500 without leaking internals', async () => {
  const res = await app.request('/boom')
  expect(res.status).toBe(500)
  const text = await res.text()
  expect(text).not.toContain('secret internals')
  expect(JSON.parse(text).error.code).toBe('internal')
})
```

`apps/api/src/app.test.ts`:
```ts
import { expect, test } from 'bun:test'
import { testConfig } from '../test/fixtures'
import { testDb } from '../test/db'
import { createApp } from './app'

const app = createApp({ db: testDb, config: testConfig })

test('GET /api/v1/health', async () => {
  const res = await app.request('/api/v1/health')
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ ok: true })
})

test('unknown routes return the error shape', async () => {
  const res = await app.request('/api/v1/nope')
  expect(res.status).toBe(404)
  expect((await res.json()).error.code).toBe('not_found')
})
```

Add to `apps/api/test/fixtures.ts`:
```ts
import type { Config } from '../src/config'

export const testConfig: Config = {
  databaseUrl: process.env.DATABASE_URL_TEST ?? '',
  port: 0,
  cookieSecure: true,
  trustProxy: true,
  sessionTtlDays: 30,
}
```

`apps/api/test/http.ts`:
```ts
type Requestable = { request: (input: string, init?: RequestInit) => Response | Promise<Response> }

export function postJson(
  app: Requestable,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

/** Extracts `session=<token>` from a Set-Cookie header, ready to send back as a Cookie header. */
export function sessionCookieFrom(res: Response): string {
  const match = (res.headers.get('set-cookie') ?? '').match(/(?:^|,\s*)session=([^;]*)/)
  if (!match?.[1]) throw new Error('No session cookie in response')
  return `session=${match[1]}`
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && bun test src/config.test.ts src/errors.test.ts src/app.test.ts`
Expected: FAIL with `Cannot find module './config'` / `'./errors'` / `'./app'`.

- [ ] **Step 3: Implement**

`apps/api/src/config.ts`:
```ts
import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'must be a postgres:// URL'),
  PORT: z.coerce.number().int().positive().default(3000),
  COOKIE_SECURE: z.stringbool().default(true),
  TRUST_PROXY: z.stringbool().default(false),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
})

export type Config = {
  databaseUrl: string
  port: number
  cookieSecure: boolean
  trustProxy: boolean
  sessionTtlDays: number
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  const parsed = envSchema.safeParse(env)
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
    throw new Error(`Invalid environment: ${details.join('; ')}`)
  }
  const e = parsed.data
  return {
    databaseUrl: e.DATABASE_URL,
    port: e.PORT,
    cookieSecure: e.COOKIE_SECURE,
    trustProxy: e.TRUST_PROXY,
    sessionTtlDays: e.SESSION_TTL_DAYS,
  }
}
```

`apps/api/src/types.ts`:
```ts
import type { Config } from './config'
import type { Db } from './db/client'

export type AuthUser = { id: string; email: string; timezone: string }

export type Deps = {
  db: Db
  config: Config
  now?: () => Date
}

export type AppEnv = { Variables: { user: AuthUser } }
```

`apps/api/src/errors.ts`:
```ts
import { ERROR_STATUS, type ErrorBody, type ErrorCode } from '@archipelago/shared'
import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly fields?: Record<string, string[]>,
  ) {
    super(message)
  }

  get status(): ContentfulStatusCode {
    return ERROR_STATUS[this.code]
  }
}

export function errorBody(
  code: ErrorCode,
  message: string,
  fields?: Record<string, string[]>,
): ErrorBody {
  return { error: fields ? { code, message, fields } : { code, message } }
}

export function handleError(err: Error, c: Context): Response {
  if (err instanceof AppError) return c.json(errorBody(err.code, err.message, err.fields), err.status)
  if (err instanceof HTTPException && err.status === 400) {
    return c.json(errorBody('bad_request', err.message || 'Bad request'), 400)
  }
  console.error(err)
  return c.json(errorBody('internal', 'Internal server error'), 500)
}
```

`apps/api/src/validate.ts`:
```ts
import { validator } from 'hono/validator'
import type { z } from 'zod'
import { AppError } from './errors'

export function toFieldErrors(err: z.ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {}
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_'
    fields[key] ??= []
    fields[key].push(issue.message)
  }
  return fields
}

export const jsonBody = <T extends z.ZodType>(schema: T) =>
  validator('json', (value): z.output<T> => {
    const result = schema.safeParse(value)
    if (!result.success) {
      throw new AppError('validation_failed', 'Request body is invalid', toFieldErrors(result.error))
    }
    return result.data
  })
```

`apps/api/src/app.ts`:
```ts
import { Hono } from 'hono'
import { errorBody, handleError } from './errors'
import type { AppEnv, Deps } from './types'

export function createApp(_deps: Deps) {
  const app = new Hono<AppEnv>().basePath('/api/v1')
  app.onError(handleError)
  app.notFound((c) => c.json(errorBody('not_found', 'Route not found'), 404))

  return app.get('/health', (c) => c.json({ ok: true }))
}

export type AppType = ReturnType<typeof createApp>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && bun test`
Expected: all PASS, including Task 3's schema tests.

Hono's `validator('json', ...)` throws `HTTPException(400)` for malformed or empty JSON when the content type is JSON, and `handleError` maps that to `bad_request`. If either 400 test gets a 422 instead, the Hono version differs from 4.13. Stop and report it rather than loosening the test.

- [ ] **Step 5: Typecheck, lint, commit**

Run: `bun run typecheck && bun run lint`
Expected: clean.

```bash
git add apps/api
git commit -m "feat(api): add config loader, error shape and app skeleton"
```

---
### Task 5: Password hashing and session store

**Files:**
- Create: `apps/api/src/auth/{crypto,passwords,sessions}.ts`
- Modify: `apps/api/test/fixtures.ts` (add `insertUserWithPassword`)
- Test: `apps/api/src/auth/passwords.test.ts`, `apps/api/src/auth/sessions.test.ts`

**Interfaces:**
- Consumes: `Db`, `users`, `sessions` (Task 3) and `AuthUser` (Task 4, `src/types.ts`).
- Produces:
  - `src/auth/crypto.ts`: `generateToken(prefix?: string): string` (prefix + 32 random bytes as base64url) and `sha256Hex(value: string): string`.
  - `src/auth/passwords.ts`: `hashPassword(pw: string): Promise<string>` (argon2id) and `verifyPassword(pw: string, hash: string): Promise<boolean>`.
  - `src/auth/sessions.ts`:
    - `createSession(db: Db, userId: string, ttlDays: number, now?: Date): Promise<{ token: string; expiresAt: Date }>`
    - `findSessionUser(db: Db, token: string, now?: Date): Promise<AuthUser | null>`
    - `deleteSession(db: Db, token: string): Promise<void>`
  - `test/fixtures.ts`: `insertUserWithPassword(db: Db, overrides?: { email?: string; timezone?: string }): Promise<{ user; password: string }>`.

- [ ] **Step 1: Write the failing tests**

`apps/api/src/auth/passwords.test.ts`:
```ts
import { expect, test } from 'bun:test'
import { hashPassword, verifyPassword } from './passwords'

test('hashes with argon2id and verifies', async () => {
  const hash = await hashPassword('correct horse battery staple')
  expect(hash.startsWith('$argon2id$')).toBe(true)
  expect(hash).not.toContain('correct horse')
  expect(await verifyPassword('correct horse battery staple', hash)).toBe(true)
  expect(await verifyPassword('wrong password', hash)).toBe(false)
})
```

`apps/api/src/auth/sessions.test.ts`:
```ts
import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { withRollback } from '../../test/db'
import { insertUser } from '../../test/fixtures'
import { sessions } from '../db/schema'
import { createSession, deleteSession, findSessionUser } from './sessions'

const DAY_MS = 86_400_000

describe('sessions', () => {
  test('a created session resolves to its user', async () => {
    await withRollback(async (tx) => {
      const user = await insertUser(tx, { email: 'boss@example.com' })
      const { token, expiresAt } = await createSession(tx, user.id, 30)
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * DAY_MS)
      expect(await findSessionUser(tx, token)).toEqual({
        id: user.id,
        email: 'boss@example.com',
        timezone: 'Asia/Jakarta',
      })
    })
  })

  test('only the token hash is stored', async () => {
    await withRollback(async (tx) => {
      const user = await insertUser(tx)
      const { token } = await createSession(tx, user.id, 30)
      const rows = await tx.select().from(sessions).where(eq(sessions.userId, user.id))
      expect(rows).toHaveLength(1)
      expect(rows[0]?.id).not.toBe(token)
      expect(rows[0]?.id).toMatch(/^[0-9a-f]{64}$/)
    })
  })

  test('expired sessions do not resolve', async () => {
    await withRollback(async (tx) => {
      const user = await insertUser(tx)
      const { token } = await createSession(tx, user.id, 1, new Date(Date.now() - 2 * DAY_MS))
      expect(await findSessionUser(tx, token)).toBeNull()
    })
  })

  test('unknown and empty tokens do not resolve', async () => {
    await withRollback(async (tx) => {
      expect(await findSessionUser(tx, 'not-a-real-token')).toBeNull()
      expect(await findSessionUser(tx, '')).toBeNull()
    })
  })

  test('deleted sessions do not resolve', async () => {
    await withRollback(async (tx) => {
      const user = await insertUser(tx)
      const { token } = await createSession(tx, user.id, 30)
      await deleteSession(tx, token)
      expect(await findSessionUser(tx, token)).toBeNull()
    })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && bun test src/auth`
Expected: FAIL with `Cannot find module './passwords'` / `'./sessions'`.

- [ ] **Step 3: Implement**

`apps/api/src/auth/crypto.ts`:
```ts
export function generateToken(prefix = ''): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return prefix + Buffer.from(bytes).toString('base64url')
}

export function sha256Hex(value: string): string {
  return new Bun.CryptoHasher('sha256').update(value).digest('hex')
}
```

`apps/api/src/auth/passwords.ts`:
```ts
export const hashPassword = (password: string): Promise<string> =>
  Bun.password.hash(password, { algorithm: 'argon2id' })

export const verifyPassword = (password: string, hash: string): Promise<boolean> =>
  Bun.password.verify(password, hash)
```

`apps/api/src/auth/sessions.ts`:
```ts
import { and, eq, gt } from 'drizzle-orm'
import type { Db } from '../db/client'
import { sessions, users } from '../db/schema'
import type { AuthUser } from '../types'
import { generateToken, sha256Hex } from './crypto'

const DAY_MS = 86_400_000

export async function createSession(
  db: Db,
  userId: string,
  ttlDays: number,
  now: Date = new Date(),
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken()
  const expiresAt = new Date(now.getTime() + ttlDays * DAY_MS)
  await db.insert(sessions).values({ id: sha256Hex(token), userId, expiresAt })
  return { token, expiresAt }
}

export async function findSessionUser(
  db: Db,
  token: string,
  now: Date = new Date(),
): Promise<AuthUser | null> {
  if (token === '') return null
  const [row] = await db
    .select({ id: users.id, email: users.email, timezone: users.timezone })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sha256Hex(token)), gt(sessions.expiresAt, now)))
    .limit(1)
  return row ?? null
}

export async function deleteSession(db: Db, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sha256Hex(token)))
}
```

Add to `apps/api/test/fixtures.ts`:
```ts
import { hashPassword } from '../src/auth/passwords'

export async function insertUserWithPassword(
  db: Db,
  overrides: { email?: string; timezone?: string } = {},
) {
  const password = 'correct horse battery staple'
  const user = await insertUser(db, { ...overrides, passwordHash: await hashPassword(password) })
  return { user, password }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && bun test`
Expected: all PASS.

- [ ] **Step 5: Typecheck, lint, commit**

Run: `bun run typecheck && bun run lint`

```bash
git add apps/api
git commit -m "feat(api): add argon2id password hashing and hashed session store"
```

---

### Task 6: Login, logout, `/me` and the session middleware

**Files:**
- Create: `apps/api/src/auth/middleware.ts`, `apps/api/src/routes/auth.ts`
- Modify: `apps/api/src/app.ts` (mount `/auth`)
- Test: `apps/api/src/routes/auth.test.ts`

**Interfaces:**
- Consumes: `Deps`, `AppEnv` (Task 4); `jsonBody`, `AppError` (Task 4); `createSession`, `findSessionUser`, `deleteSession`, `hashPassword`, `verifyPassword` (Task 5); `loginInputSchema` (Task 1).
- Produces:
  - `src/auth/middleware.ts`: `SESSION_COOKIE = 'session'` and `requireAuth(deps: Deps)`, a Hono middleware that sets `c.get('user'): AuthUser` or throws `401`. Task 8 extends it with bearer tokens.
  - `src/routes/auth.ts`: `authRoutes(deps: Deps)`, mounted at `/api/v1/auth`:
    - `POST /login` with `{ email, password }` → `200 { user: AuthUser }` and sets the session cookie
    - `POST /logout` → `204` and clears the cookie (idempotent, needs no auth)
    - `GET /me` → `200 { user: AuthUser }` or `401`

- [ ] **Step 1: Write the failing tests**

`apps/api/src/routes/auth.test.ts`:
```ts
import { describe, expect, test } from 'bun:test'
import { withRollback } from '../../test/db'
import { insertUserWithPassword, testConfig } from '../../test/fixtures'
import { postJson, sessionCookieFrom } from '../../test/http'
import { createApp } from '../app'
import { createSession } from '../auth/sessions'
import type { Config } from '../config'
import type { Db } from '../db/client'

const appFor = (db: Db, config: Config = testConfig) => createApp({ db, config })
const LOGIN = '/api/v1/auth/login'
const ME = '/api/v1/auth/me'
const LOGOUT = '/api/v1/auth/logout'

describe('POST /auth/login', () => {
  test('valid credentials → 200, user body and a hardened session cookie', async () => {
    await withRollback(async (tx) => {
      const { user, password } = await insertUserWithPassword(tx, { email: 'boss@example.com' })
      const res = await postJson(appFor(tx), LOGIN, { email: 'boss@example.com', password })
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({
        user: { id: user.id, email: 'boss@example.com', timezone: 'Asia/Jakarta' },
      })
      const cookie = res.headers.get('set-cookie') ?? ''
      expect(cookie).toContain('session=')
      expect(cookie).toContain('HttpOnly')
      expect(cookie).toContain('SameSite=Lax')
      expect(cookie).toContain('Path=/')
      expect(cookie).toContain('Secure')
    })
  })

  test('cookie omits Secure when COOKIE_SECURE=false', async () => {
    await withRollback(async (tx) => {
      const { password } = await insertUserWithPassword(tx, { email: 'boss@example.com' })
      const app = appFor(tx, { ...testConfig, cookieSecure: false })
      const res = await postJson(app, LOGIN, { email: 'boss@example.com', password })
      expect(res.headers.get('set-cookie') ?? '').not.toContain('Secure')
    })
  })

  test('email is matched case- and whitespace-insensitively', async () => {
    await withRollback(async (tx) => {
      const { password } = await insertUserWithPassword(tx, { email: 'boss@example.com' })
      const res = await postJson(appFor(tx), LOGIN, { email: '  Boss@Example.COM ', password })
      expect(res.status).toBe(200)
    })
  })

  test('wrong password and unknown email return the same 401', async () => {
    await withRollback(async (tx) => {
      await insertUserWithPassword(tx, { email: 'boss@example.com' })
      const app = appFor(tx)
      const wrongPw = await postJson(app, LOGIN, { email: 'boss@example.com', password: 'nope' })
      const unknown = await postJson(app, LOGIN, { email: 'ghost@example.com', password: 'nope' })
      const expected = { error: { code: 'unauthorized', message: 'Invalid email or password' } }
      expect(wrongPw.status).toBe(401)
      expect(await wrongPw.json()).toEqual(expected)
      expect(unknown.status).toBe(401)
      expect(await unknown.json()).toEqual(expected)
      expect(wrongPw.headers.get('set-cookie')).toBeNull()
    })
  })

  test('missing fields → 422 with field errors', async () => {
    await withRollback(async (tx) => {
      const res = await postJson(appFor(tx), LOGIN, {})
      expect(res.status).toBe(422)
      const body = await res.json()
      expect(body.error.code).toBe('validation_failed')
      expect(Object.keys(body.error.fields)).toEqual(expect.arrayContaining(['email', 'password']))
    })
  })

  test('malformed JSON → 400', async () => {
    await withRollback(async (tx) => {
      const res = await appFor(tx).request(LOGIN, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"email":',
      })
      expect(res.status).toBe(400)
      expect((await res.json()).error.code).toBe('bad_request')
    })
  })
})

describe('GET /auth/me', () => {
  test('returns the user for a valid session', async () => {
    await withRollback(async (tx) => {
      const { user, password } = await insertUserWithPassword(tx, { email: 'boss@example.com' })
      const app = appFor(tx)
      const cookie = sessionCookieFrom(
        await postJson(app, LOGIN, { email: 'boss@example.com', password }),
      )
      const res = await app.request(ME, { headers: { cookie } })
      expect(res.status).toBe(200)
      expect((await res.json()).user.id).toBe(user.id)
    })
  })

  test('401 without a cookie, with a garbage cookie, or with an expired session', async () => {
    await withRollback(async (tx) => {
      const { user } = await insertUserWithPassword(tx)
      const app = appFor(tx)
      const expired = await createSession(tx, user.id, 1, new Date(Date.now() - 2 * 86_400_000))
      for (const headers of [
        {},
        { cookie: 'session=garbage' },
        { cookie: 'session=%E0%A4%A' },
        { cookie: `session=${expired.token}` },
      ]) {
        const res = await app.request(ME, { headers })
        expect(res.status).toBe(401)
        expect((await res.json()).error.code).toBe('unauthorized')
      }
    })
  })
})

describe('POST /auth/logout', () => {
  test('invalidates the session and clears the cookie', async () => {
    await withRollback(async (tx) => {
      const { password } = await insertUserWithPassword(tx, { email: 'boss@example.com' })
      const app = appFor(tx)
      const cookie = sessionCookieFrom(
        await postJson(app, LOGIN, { email: 'boss@example.com', password }),
      )
      const res = await app.request(LOGOUT, { method: 'POST', headers: { cookie } })
      expect(res.status).toBe(204)
      expect(res.headers.get('set-cookie') ?? '').toContain('Max-Age=0')
      expect((await app.request(ME, { headers: { cookie } })).status).toBe(401)
    })
  })

  test('is idempotent without a session', async () => {
    await withRollback(async (tx) => {
      const res = await appFor(tx).request(LOGOUT, { method: 'POST' })
      expect(res.status).toBe(204)
    })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && bun test src/routes/auth.test.ts`
Expected: FAIL. The routes return `404 not_found` because `/auth` is not mounted yet.

- [ ] **Step 3: Implement**

`apps/api/src/auth/middleware.ts`:
```ts
import { getCookie } from 'hono/cookie'
import { createMiddleware } from 'hono/factory'
import { AppError } from '../errors'
import type { AppEnv, Deps } from '../types'
import { findSessionUser } from './sessions'

export const SESSION_COOKIE = 'session'

export const requireAuth = (deps: Deps) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const now = deps.now?.() ?? new Date()
    const token = getCookie(c, SESSION_COOKIE)
    const user = token ? await findSessionUser(deps.db, token, now) : null
    if (!user) throw new AppError('unauthorized', 'Authentication required')
    c.set('user', user)
    await next()
  })
```

`apps/api/src/routes/auth.ts`:
```ts
import { loginInputSchema } from '@archipelago/shared'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { requireAuth, SESSION_COOKIE } from '../auth/middleware'
import { hashPassword, verifyPassword } from '../auth/passwords'
import { createSession, deleteSession } from '../auth/sessions'
import { users } from '../db/schema'
import { AppError } from '../errors'
import type { AppEnv, Deps } from '../types'
import { jsonBody } from '../validate'

// Verifying against a dummy hash for unknown emails keeps response time
// the same, so timing does not reveal which emails exist.
let dummyHash: Promise<string> | undefined
const getDummyHash = () => {
  dummyHash ??= hashPassword('timing-equaliser-not-a-real-password')
  return dummyHash
}

export function authRoutes(deps: Deps) {
  const { db, config } = deps
  const now = () => deps.now?.() ?? new Date()

  return new Hono<AppEnv>()
    .post('/login', jsonBody(loginInputSchema), async (c) => {
      const { email, password } = c.req.valid('json')
      const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)
      const valid = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()))
      if (!user || !valid) throw new AppError('unauthorized', 'Invalid email or password')

      const { token, expiresAt } = await createSession(db, user.id, config.sessionTtlDays, now())
      setCookie(c, SESSION_COOKIE, token, {
        httpOnly: true,
        secure: config.cookieSecure,
        sameSite: 'Lax',
        path: '/',
        expires: expiresAt,
      })
      return c.json({ user: { id: user.id, email: user.email, timezone: user.timezone } })
    })
    .post('/logout', async (c) => {
      const token = getCookie(c, SESSION_COOKIE)
      if (token) await deleteSession(db, token)
      deleteCookie(c, SESSION_COOKIE, { path: '/', secure: config.cookieSecure })
      return c.body(null, 204)
    })
    .get('/me', requireAuth(deps), (c) => c.json({ user: c.get('user') }))
}
```

Replace `apps/api/src/app.ts`:
```ts
import { Hono } from 'hono'
import { errorBody, handleError } from './errors'
import { authRoutes } from './routes/auth'
import type { AppEnv, Deps } from './types'

export function createApp(deps: Deps) {
  const app = new Hono<AppEnv>().basePath('/api/v1')
  app.onError(handleError)
  app.notFound((c) => c.json(errorBody('not_found', 'Route not found'), 404))

  return app.get('/health', (c) => c.json({ ok: true })).route('/auth', authRoutes(deps))
}

export type AppType = ReturnType<typeof createApp>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && bun test`
Expected: all PASS.

- [ ] **Step 5: Typecheck, lint, commit**

Run: `bun run typecheck && bun run lint`

```bash
git add apps/api
git commit -m "feat(api): add login, logout and session-authenticated /me"
```

---
### Task 7: Login rate limiting

**Files:**
- Create: `apps/api/src/auth/rate-limit.ts`, `apps/api/src/auth/client-ip.ts`
- Modify: `apps/api/src/types.ts` (add `loginLimiter?` to `Deps`), `apps/api/src/routes/auth.ts` (apply the limiter to `/login`)
- Test: `apps/api/src/auth/rate-limit.test.ts`, `apps/api/src/routes/auth-rate-limit.test.ts`

**Interfaces:**
- Consumes: `authRoutes`, `Deps`, `AppError` (Tasks 4 and 6).
- Produces:
  - `src/auth/rate-limit.ts`: `type RateLimiter = { hit(key: string, nowMs: number): boolean }` (returns `true` when allowed), `createFixedWindowLimiter(opts: { limit: number; windowMs: number }): RateLimiter`, and `LOGIN_RATE_LIMIT = { limit: 10, windowMs: 900_000 }`.
  - `src/auth/client-ip.ts`: `clientIp(c: Context, trustProxy: boolean): string`.
  - `Deps.loginLimiter?: RateLimiter`. Defaults to a fresh limiter per `createApp` call.

- [ ] **Step 1: Write the failing tests**

`apps/api/src/auth/rate-limit.test.ts`:
```ts
import { expect, test } from 'bun:test'
import { createFixedWindowLimiter } from './rate-limit'

test('allows up to the limit, then blocks', () => {
  const limiter = createFixedWindowLimiter({ limit: 3, windowMs: 1000 })
  expect([1, 2, 3, 4].map(() => limiter.hit('a', 0))).toEqual([true, true, true, false])
})

test('keys are independent', () => {
  const limiter = createFixedWindowLimiter({ limit: 1, windowMs: 1000 })
  expect(limiter.hit('a', 0)).toBe(true)
  expect(limiter.hit('a', 0)).toBe(false)
  expect(limiter.hit('b', 0)).toBe(true)
})

test('the window resets', () => {
  const limiter = createFixedWindowLimiter({ limit: 1, windowMs: 1000 })
  expect(limiter.hit('a', 0)).toBe(true)
  expect(limiter.hit('a', 999)).toBe(false)
  expect(limiter.hit('a', 1000)).toBe(true)
})
```

`apps/api/src/routes/auth-rate-limit.test.ts`:
```ts
import { describe, expect, test } from 'bun:test'
import { withRollback } from '../../test/db'
import { testConfig } from '../../test/fixtures'
import { postJson } from '../../test/http'
import { createApp } from '../app'

const LOGIN = '/api/v1/auth/login'
// An empty body fails validation (422) without hashing, so the tests stay fast.
// The limiter runs before validation, so these attempts still count.
const attempt = (app: ReturnType<typeof createApp>, ip: string) =>
  postJson(app, LOGIN, {}, { 'x-forwarded-for': ip })

describe('login rate limit', () => {
  test('the 11th attempt from one IP within 15 minutes → 429', async () => {
    await withRollback(async (tx) => {
      const app = createApp({ db: tx, config: testConfig })
      for (let i = 0; i < 10; i++) expect((await attempt(app, '203.0.113.7')).status).toBe(422)
      const res = await attempt(app, '203.0.113.7')
      expect(res.status).toBe(429)
      expect((await res.json()).error.code).toBe('rate_limited')
      expect((await attempt(app, '198.51.100.1')).status).toBe(422)
    })
  })

  test('the limit lifts after the window', async () => {
    await withRollback(async (tx) => {
      let clock = new Date('2026-10-07T00:00:00Z')
      const app = createApp({ db: tx, config: testConfig, now: () => clock })
      for (let i = 0; i < 10; i++) await attempt(app, '203.0.113.7')
      expect((await attempt(app, '203.0.113.7')).status).toBe(429)
      clock = new Date(clock.getTime() + 15 * 60_000)
      expect((await attempt(app, '203.0.113.7')).status).toBe(422)
    })
  })

  test('spoofed X-Forwarded-For is ignored when TRUST_PROXY=false', async () => {
    await withRollback(async (tx) => {
      const app = createApp({ db: tx, config: { ...testConfig, trustProxy: false } })
      for (let i = 0; i < 10; i++) await attempt(app, `10.0.0.${i}`)
      expect((await attempt(app, '10.0.0.99')).status).toBe(429)
    })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && bun test src/auth/rate-limit.test.ts src/routes/auth-rate-limit.test.ts`
Expected: FAIL. `./rate-limit` is not found, and the 11th route attempt returns 422 instead of 429.

- [ ] **Step 3: Implement**

`apps/api/src/auth/rate-limit.ts`:
```ts
export type RateLimiter = { hit(key: string, nowMs: number): boolean }

export const LOGIN_RATE_LIMIT = { limit: 10, windowMs: 15 * 60_000 }

const SWEEP_THRESHOLD = 10_000

export function createFixedWindowLimiter(opts: { limit: number; windowMs: number }): RateLimiter {
  const buckets = new Map<string, { count: number; resetAt: number }>()

  return {
    hit(key, nowMs) {
      if (buckets.size > SWEEP_THRESHOLD) {
        for (const [k, b] of buckets) if (nowMs >= b.resetAt) buckets.delete(k)
      }
      const bucket = buckets.get(key)
      if (!bucket || nowMs >= bucket.resetAt) {
        buckets.set(key, { count: 1, resetAt: nowMs + opts.windowMs })
        return true
      }
      bucket.count += 1
      return bucket.count <= opts.limit
    },
  }
}
```

`apps/api/src/auth/client-ip.ts`:
```ts
import type { Context } from 'hono'
import { getConnInfo } from 'hono/bun'

/**
 * With TRUST_PROXY=true the API sits behind Caddy, which overwrites
 * X-Forwarded-For from untrusted clients, so the first entry is the real client.
 * Otherwise the header is attacker-controlled and ignored.
 */
export function clientIp(c: Context, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    if (forwarded) return forwarded
  }
  try {
    return getConnInfo(c).remote.address ?? 'unknown'
  } catch {
    return 'unknown'
  }
}
```

In `apps/api/src/types.ts`, add `import type { RateLimiter } from './auth/rate-limit'` and extend `Deps`:
```ts
export type Deps = {
  db: Db
  config: Config
  now?: () => Date
  loginLimiter?: RateLimiter
}
```

In `apps/api/src/routes/auth.ts`, add these imports:
```ts
import { createMiddleware } from 'hono/factory'
import { clientIp } from '../auth/client-ip'
import { createFixedWindowLimiter, LOGIN_RATE_LIMIT } from '../auth/rate-limit'
```
Inside `authRoutes`, after `const now = ...`, add:
```ts
  const limiter = deps.loginLimiter ?? createFixedWindowLimiter(LOGIN_RATE_LIMIT)
  const loginRateLimit = createMiddleware<AppEnv>(async (c, next) => {
    if (!limiter.hit(clientIp(c, config.trustProxy), now().getTime())) {
      throw new AppError('rate_limited', 'Too many login attempts. Try again later.')
    }
    await next()
  })
```
Change the login route's first line to `.post('/login', loginRateLimit, jsonBody(loginInputSchema), async (c) => {`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && bun test`
Expected: all PASS. The Task 6 login tests are unaffected because each test builds its own app and limiter.

- [ ] **Step 5: Typecheck, lint, commit**

Run: `bun run typecheck && bun run lint`

```bash
git add apps/api
git commit -m "feat(api): rate-limit login attempts per client IP"
```

---

### Task 8: Personal API tokens and bearer authentication

**Files:**
- Create: `apps/api/src/auth/api-tokens.ts`, `apps/api/src/routes/tokens.ts`
- Modify: `apps/api/src/auth/middleware.ts` (accept `Authorization: Bearer`), `apps/api/src/app.ts` (mount `/tokens`)
- Test: `apps/api/src/routes/tokens.test.ts`

**Interfaces:**
- Consumes: `generateToken`, `sha256Hex` (Task 5); `requireAuth`, `SESSION_COOKIE` (Task 6); `createApiTokenInputSchema` (Task 1); `jsonBody`, `AppError` (Task 4).
- Produces:
  - `src/auth/api-tokens.ts`:
    - `API_TOKEN_PREFIX = 'arch_'`
    - `type ApiTokenView = { id: string; name: string; createdAt: string; lastUsedAt: string | null }` (ISO strings)
    - `createApiToken(db: Db, userId: string, name: string): Promise<{ token: string; apiToken: ApiTokenView }>`
    - `listApiTokens(db: Db, userId: string): Promise<ApiTokenView[]>` (newest first)
    - `deleteApiToken(db: Db, userId: string, id: string): Promise<boolean>`
    - `findApiTokenUser(db: Db, token: string, now?: Date): Promise<AuthUser | null>` (also stamps `lastUsedAt`)
  - `requireAuth` accepts either the session cookie or `Authorization: Bearer <token>`. When an `Authorization` header is present, only it is checked.
  - Routes under `/api/v1/tokens` (all require auth):
    - `GET /` → `200 { apiTokens: ApiTokenView[] }`
    - `POST /` with `{ name }` → `201 { token, apiToken }`. The plaintext token is returned only here.
    - `DELETE /:id` → `204`, or `404` if the token is missing, belongs to another user, or the id isn't a UUID.

- [ ] **Step 1: Write the failing tests**

`apps/api/src/routes/tokens.test.ts`:
```ts
import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { withRollback } from '../../test/db'
import { insertUserWithPassword, testConfig } from '../../test/fixtures'
import { postJson, sessionCookieFrom } from '../../test/http'
import { createApp } from '../app'
import type { Db } from '../db/client'
import { apiTokens } from '../db/schema'

const TOKENS = '/api/v1/tokens'
const ME = '/api/v1/auth/me'

async function signedIn(db: Db) {
  const app = createApp({ db, config: testConfig })
  const { user, password } = await insertUserWithPassword(db)
  const cookie = sessionCookieFrom(
    await postJson(app, '/api/v1/auth/login', { email: user.email, password }),
  )
  return { app, user, cookie }
}

describe('/tokens', () => {
  test('requires authentication', async () => {
    await withRollback(async (tx) => {
      const app = createApp({ db: tx, config: testConfig })
      expect((await app.request(TOKENS)).status).toBe(401)
      expect((await postJson(app, TOKENS, { name: 'x' })).status).toBe(401)
    })
  })

  test('creates a token, returns plaintext once and stores only its hash', async () => {
    await withRollback(async (tx) => {
      const { app, cookie } = await signedIn(tx)
      const res = await postJson(app, TOKENS, { name: '  GitLab sync ' }, { cookie })
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.token).toMatch(/^arch_[A-Za-z0-9_-]{43}$/)
      expect(body.apiToken).toMatchObject({ name: 'GitLab sync', lastUsedAt: null })

      const [row] = await tx.select().from(apiTokens).where(eq(apiTokens.id, body.apiToken.id))
      expect(row?.tokenHash).toMatch(/^[0-9a-f]{64}$/)
      expect(row?.tokenHash).not.toBe(body.token)
    })
  })

  test('list never exposes token material', async () => {
    await withRollback(async (tx) => {
      const { app, cookie } = await signedIn(tx)
      await postJson(app, TOKENS, { name: 'one' }, { cookie })
      const res = await app.request(TOKENS, { headers: { cookie } })
      const { apiTokens: list } = await res.json()
      expect(list).toHaveLength(1)
      expect(Object.keys(list[0]).sort()).toEqual(['createdAt', 'id', 'lastUsedAt', 'name'])
    })
  })

  test('rejects blank names with 422', async () => {
    await withRollback(async (tx) => {
      const { app, cookie } = await signedIn(tx)
      expect((await postJson(app, TOKENS, { name: '  ' }, { cookie })).status).toBe(422)
    })
  })

  test('bearer token authenticates and stamps lastUsedAt', async () => {
    await withRollback(async (tx) => {
      const { app, user, cookie } = await signedIn(tx)
      const { token } = await (await postJson(app, TOKENS, { name: 'ci' }, { cookie })).json()
      const res = await app.request(ME, { headers: { authorization: `Bearer ${token}` } })
      expect(res.status).toBe(200)
      expect((await res.json()).user.id).toBe(user.id)
      const [row] = await tx.select().from(apiTokens).where(eq(apiTokens.userId, user.id))
      expect(row?.lastUsedAt).toBeInstanceOf(Date)
    })
  })

  test('bad bearer credentials → 401, never 500', async () => {
    await withRollback(async (tx) => {
      const { app, cookie } = await signedIn(tx)
      for (const authorization of ['Bearer garbage', 'Bearer arch_nope', 'Bearer', 'Basic abc']) {
        // A valid cookie alongside does not rescue an invalid Authorization header.
        const res = await app.request(ME, { headers: { authorization, cookie } })
        expect(res.status).toBe(401)
      }
    })
  })

  test('revoked tokens stop working immediately', async () => {
    await withRollback(async (tx) => {
      const { app, cookie } = await signedIn(tx)
      const created = await (await postJson(app, TOKENS, { name: 'ci' }, { cookie })).json()
      const del = await app.request(`${TOKENS}/${created.apiToken.id}`, {
        method: 'DELETE',
        headers: { cookie },
      })
      expect(del.status).toBe(204)
      const res = await app.request(ME, { headers: { authorization: `Bearer ${created.token}` } })
      expect(res.status).toBe(401)
    })
  })

  test("cannot delete another user's token, and invalid ids → 404", async () => {
    await withRollback(async (tx) => {
      const owner = await signedIn(tx)
      const other = await signedIn(tx)
      const created = await (
        await postJson(owner.app, TOKENS, { name: 'mine' }, { cookie: owner.cookie })
      ).json()

      const stolen = await other.app.request(`${TOKENS}/${created.apiToken.id}`, {
        method: 'DELETE',
        headers: { cookie: other.cookie },
      })
      expect(stolen.status).toBe(404)
      const stillWorks = await owner.app.request(ME, {
        headers: { authorization: `Bearer ${created.token}` },
      })
      expect(stillWorks.status).toBe(200)

      const bogus = await owner.app.request(`${TOKENS}/abc`, {
        method: 'DELETE',
        headers: { cookie: owner.cookie },
      })
      expect(bogus.status).toBe(404)
      expect((await bogus.json()).error.code).toBe('not_found')
    })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && bun test src/routes/tokens.test.ts`
Expected: FAIL. `/api/v1/tokens` returns `404 not_found` (not mounted), so the 401 and 201 assertions fail.

- [ ] **Step 3: Implement**

`apps/api/src/auth/api-tokens.ts`:
```ts
import { and, desc, eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { apiTokens, users } from '../db/schema'
import type { AuthUser } from '../types'
import { generateToken, sha256Hex } from './crypto'

export const API_TOKEN_PREFIX = 'arch_'

export type ApiTokenView = {
  id: string
  name: string
  createdAt: string
  lastUsedAt: string | null
}

const toView = (row: typeof apiTokens.$inferSelect): ApiTokenView => ({
  id: row.id,
  name: row.name,
  createdAt: row.createdAt.toISOString(),
  lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
})

export async function createApiToken(
  db: Db,
  userId: string,
  name: string,
): Promise<{ token: string; apiToken: ApiTokenView }> {
  const token = generateToken(API_TOKEN_PREFIX)
  const [row] = await db
    .insert(apiTokens)
    .values({ userId, name, tokenHash: sha256Hex(token) })
    .returning()
  if (!row) throw new Error('createApiToken: no row returned')
  return { token, apiToken: toView(row) }
}

export async function listApiTokens(db: Db, userId: string): Promise<ApiTokenView[]> {
  const rows = await db
    .select()
    .from(apiTokens)
    .where(eq(apiTokens.userId, userId))
    .orderBy(desc(apiTokens.createdAt))
  return rows.map(toView)
}

export async function deleteApiToken(db: Db, userId: string, id: string): Promise<boolean> {
  const deleted = await db
    .delete(apiTokens)
    .where(and(eq(apiTokens.id, id), eq(apiTokens.userId, userId)))
    .returning({ id: apiTokens.id })
  return deleted.length > 0
}

export async function findApiTokenUser(
  db: Db,
  token: string,
  now: Date = new Date(),
): Promise<AuthUser | null> {
  if (!token.startsWith(API_TOKEN_PREFIX)) return null
  const [match] = await db
    .update(apiTokens)
    .set({ lastUsedAt: now })
    .where(eq(apiTokens.tokenHash, sha256Hex(token)))
    .returning({ userId: apiTokens.userId })
  if (!match) return null
  const [user] = await db
    .select({ id: users.id, email: users.email, timezone: users.timezone })
    .from(users)
    .where(eq(users.id, match.userId))
    .limit(1)
  return user ?? null
}
```

Replace `apps/api/src/auth/middleware.ts`:
```ts
import { getCookie } from 'hono/cookie'
import { createMiddleware } from 'hono/factory'
import { AppError } from '../errors'
import type { AppEnv, AuthUser, Deps } from '../types'
import { findApiTokenUser } from './api-tokens'
import { findSessionUser } from './sessions'

export const SESSION_COOKIE = 'session'

const BEARER = /^Bearer\s+(\S+)$/i

export const requireAuth = (deps: Deps) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const now = deps.now?.() ?? new Date()
    const authorization = c.req.header('authorization')
    let user: AuthUser | null = null

    if (authorization !== undefined) {
      // An explicit Authorization header is authoritative: it is never combined with the cookie.
      const token = authorization.match(BEARER)?.[1]
      user = token ? await findApiTokenUser(deps.db, token, now) : null
    } else {
      const token = getCookie(c, SESSION_COOKIE)
      user = token ? await findSessionUser(deps.db, token, now) : null
    }

    if (!user) throw new AppError('unauthorized', 'Authentication required')
    c.set('user', user)
    await next()
  })
```

`apps/api/src/routes/tokens.ts`:
```ts
import { createApiTokenInputSchema } from '@archipelago/shared'
import { Hono } from 'hono'
import { z } from 'zod'
import { createApiToken, deleteApiToken, listApiTokens } from '../auth/api-tokens'
import { requireAuth } from '../auth/middleware'
import { AppError } from '../errors'
import type { AppEnv, Deps } from '../types'
import { jsonBody } from '../validate'

const uuid = z.uuid()

export function tokenRoutes(deps: Deps) {
  const { db } = deps

  return new Hono<AppEnv>()
    .use(requireAuth(deps))
    .get('/', async (c) => c.json({ apiTokens: await listApiTokens(db, c.get('user').id) }))
    .post('/', jsonBody(createApiTokenInputSchema), async (c) => {
      const { name } = c.req.valid('json')
      return c.json(await createApiToken(db, c.get('user').id, name), 201)
    })
    .delete('/:id', async (c) => {
      const id = c.req.param('id')
      // Non-UUID ids would make Postgres throw (22P02), so they are a plain 404.
      const deleted = uuid.safeParse(id).success && (await deleteApiToken(db, c.get('user').id, id))
      if (!deleted) throw new AppError('not_found', 'API token not found')
      return c.body(null, 204)
    })
}
```

In `apps/api/src/app.ts`, add `import { tokenRoutes } from './routes/tokens'` and extend the chain:
```ts
  return app
    .get('/health', (c) => c.json({ ok: true }))
    .route('/auth', authRoutes(deps))
    .route('/tokens', tokenRoutes(deps))
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && bun test`
Expected: all PASS, including the Task 6 session tests (the cookie path is unchanged when no `Authorization` header is sent).

- [ ] **Step 5: Typecheck, lint, commit**

Run: `bun run typecheck && bun run lint`

```bash
git add apps/api
git commit -m "feat(api): add personal API tokens with bearer authentication"
```

---
### Task 9: `seed:user` CLI

**Files:**
- Create: `apps/api/src/auth/seed-user.ts`, `apps/api/src/cli/seed-user.ts`
- Modify: root `package.json` (add `seed:user` script)
- Test: `apps/api/src/auth/seed-user.test.ts`

**Interfaces:**
- Consumes: `seedUserInputSchema` (Task 1); `hashPassword` (Task 5); `isUniqueViolation`, `createDb`, `runMigrations` (Task 3); `loadConfig` (Task 4).
- Produces:
  - `src/auth/seed-user.ts`: `class SeedUserError extends Error` and `seedUser(db: Db, input: unknown): Promise<AuthUser>`. It throws `SeedUserError` for invalid input or a duplicate email.
  - CLI: `bun run seed:user --email <email> [--password <pw>] [--timezone <IANA>]`. It prompts for the password when `--password` is omitted (keeping it out of shell history), defaults the timezone to `Asia/Jakarta`, runs pending migrations first, and exits with code 1 and a one-line message on a `SeedUserError`.

- [ ] **Step 1: Write the failing tests**

`apps/api/src/auth/seed-user.test.ts`:
```ts
import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { withRollback } from '../../test/db'
import { users } from '../db/schema'
import { verifyPassword } from './passwords'
import { SeedUserError, seedUser } from './seed-user'

const valid = {
  email: '  Boss@Example.com ',
  password: 'correct horse battery staple',
  timezone: 'Asia/Jakarta',
}

describe('seedUser', () => {
  test('creates the user with a normalised email and an argon2id hash', async () => {
    await withRollback(async (tx) => {
      const user = await seedUser(tx, valid)
      expect(user).toMatchObject({ email: 'boss@example.com', timezone: 'Asia/Jakarta' })
      const [row] = await tx.select().from(users).where(eq(users.id, user.id))
      expect(row?.passwordHash.startsWith('$argon2id$')).toBe(true)
      expect(await verifyPassword(valid.password, row?.passwordHash ?? '')).toBe(true)
    })
  })

  test('a duplicate email is a SeedUserError, not a raw database error', async () => {
    let caught: unknown
    await withRollback(async (tx) => {
      await seedUser(tx, valid)
      await seedUser(tx, { ...valid, email: 'boss@example.com' })
    }).catch((err) => {
      caught = err
    })
    expect(caught).toBeInstanceOf(SeedUserError)
    expect((caught as Error).message).toBe('A user with email boss@example.com already exists')
  })

  test('invalid input is a SeedUserError naming the bad fields', async () => {
    await withRollback(async (tx) => {
      const attempt = seedUser(tx, { ...valid, password: 'short', timezone: 'Nowhere/Land' })
      await expect(attempt).rejects.toBeInstanceOf(SeedUserError)
      await expect(attempt).rejects.toThrow(/password.*timezone|timezone.*password/)
    })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && bun test src/auth/seed-user.test.ts`
Expected: FAIL with `Cannot find module './seed-user'`.

- [ ] **Step 3: Implement**

`apps/api/src/auth/seed-user.ts`:
```ts
import { seedUserInputSchema } from '@archipelago/shared'
import type { Db } from '../db/client'
import { isUniqueViolation } from '../db/pg-errors'
import { users } from '../db/schema'
import type { AuthUser } from '../types'
import { hashPassword } from './passwords'

export class SeedUserError extends Error {}

export async function seedUser(db: Db, input: unknown): Promise<AuthUser> {
  const parsed = seedUserInputSchema.safeParse(input)
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
    throw new SeedUserError(`Invalid input: ${details.join('; ')}`)
  }
  const { email, password, timezone } = parsed.data

  try {
    const [user] = await db
      .insert(users)
      .values({ email, timezone, passwordHash: await hashPassword(password) })
      .returning({ id: users.id, email: users.email, timezone: users.timezone })
    if (!user) throw new Error('seedUser: no row returned')
    return user
  } catch (err) {
    if (isUniqueViolation(err)) throw new SeedUserError(`A user with email ${email} already exists`)
    throw err
  }
}
```

`apps/api/src/cli/seed-user.ts`:
```ts
import { parseArgs } from 'node:util'
import { SeedUserError, seedUser } from '../auth/seed-user'
import { loadConfig } from '../config'
import { createDb } from '../db/client'
import { runMigrations } from '../db/migrate'

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    password: { type: 'string' },
    timezone: { type: 'string', default: 'Asia/Jakarta' },
  },
})

const password = values.password ?? prompt('Password (min 12 characters):') ?? ''
const config = loadConfig(process.env)
const { db, close } = createDb(config.databaseUrl)

try {
  await runMigrations(db)
  const user = await seedUser(db, { email: values.email ?? '', password, timezone: values.timezone })
  console.log(`Created user ${user.email} (${user.id}), timezone ${user.timezone}`)
} catch (err) {
  if (!(err instanceof SeedUserError)) throw err
  console.error(err.message)
  process.exitCode = 1
} finally {
  await close()
}
```

In the root `package.json` `scripts`, add:
```json
"seed:user": "cd apps/api && bun run seed:user"
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && bun test`
Expected: all PASS.

- [ ] **Step 5: Exercise the CLI against the dev database**

Run:
```bash
bun run seed:user --email boss@example.com --password 'correct horse battery staple'
bun run seed:user --email boss@example.com --password 'correct horse battery staple'; echo "exit=$?"
bun run seed:user --email x@example.com --password short; echo "exit=$?"
```
Expected:
- The first run prints `Created user boss@example.com (<uuid>), timezone Asia/Jakarta`.
- The second prints `A user with email boss@example.com already exists` and `exit=1`.
- The third prints `Invalid input: password: ...` and `exit=1`.
- None of them prints a stack trace.

Reset the dev DB afterwards: `docker compose exec postgres psql -U archipelago -d archipelago -c "DELETE FROM users"`.

- [ ] **Step 6: Typecheck, lint, commit**

Run: `bun run typecheck && bun run lint`

```bash
git add package.json apps/api
git commit -m "feat(api): add seed:user CLI for the single account"
```

---

### Task 10: Server entrypoint, API container and local dev docs

**Files:**
- Create: `apps/api/src/server.ts`, `apps/api/Dockerfile`, `.dockerignore`, `README.md`
- Modify: `docker-compose.yml` (add the `api` service)

**Interfaces:**
- Consumes: `loadConfig`, `createDb`, `runMigrations`, `createApp` (Tasks 3, 4 and 6–8).
- Produces: a running API on `127.0.0.1:3000` via `docker compose up`, or via `bun run dev` against the Compose Postgres. Phase 2 adds the `apps/web` service and a `COPY apps/web/package.json` line to the Dockerfile's install layer.

- [ ] **Step 1: Server entrypoint**

`apps/api/src/server.ts`:
```ts
import { createApp } from './app'
import { loadConfig } from './config'
import { createDb } from './db/client'
import { runMigrations } from './db/migrate'

const config = loadConfig(process.env)
const { db } = createDb(config.databaseUrl)
await runMigrations(db)

const app = createApp({ db, config })
// Bun passes the server as the second fetch argument, which hono/bun's getConnInfo reads.
const server = Bun.serve({ port: config.port, fetch: app.fetch })
console.log(`API listening on :${server.port}`)
```

Run (Postgres from Task 3 must be up): `cd apps/api && timeout 5 bun src/server.ts; cd ../..`
Expected: prints `API listening on :3000`, then exits after 5 seconds with no errors.

- [ ] **Step 2: Container**

`.dockerignore`:
```
**/node_modules
**/.turbo
**/.env
.git
docs
```

`apps/api/Dockerfile`:
```dockerfile
FROM oven/bun:1.4.2-alpine
WORKDIR /app

# Install with only the manifests first so the dependency layer caches.
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/ui-tokens/package.json packages/ui-tokens/
RUN bun install --frozen-lockfile --production

COPY packages ./packages
COPY apps/api ./apps/api

WORKDIR /app/apps/api
ENV NODE_ENV=production
EXPOSE 3000
CMD ["bun", "src/server.ts"]
```

Run: `docker pull oven/bun:1.4.2-alpine`
Expected: the image pulls. If the tag doesn't exist, use `oven/bun:1.4.2` in the `FROM` line instead and note it in the commit message.

Add to `docker-compose.yml` under `services:`:
```yaml
  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    environment:
      DATABASE_URL: postgres://archipelago:archipelago@postgres:5432/archipelago
      COOKIE_SECURE: "false"
      TRUST_PROXY: "false"
    ports:
      - "127.0.0.1:3000:3000"
    depends_on:
      postgres:
        condition: service_healthy
```

- [ ] **Step 3: End-to-end check in Docker**

Run:
```bash
docker compose up -d --build
curl -s localhost:3000/api/v1/health
docker compose exec api bun run seed:user --email boss@example.com --password 'correct horse battery staple'
JAR=$(mktemp)
curl -s -c "$JAR" -H 'content-type: application/json' \
  -d '{"email":"Boss@Example.com","password":"correct horse battery staple"}' \
  localhost:3000/api/v1/auth/login
curl -s -b "$JAR" localhost:3000/api/v1/auth/me
TOKEN=$(curl -s -b "$JAR" -H 'content-type: application/json' -d '{"name":"smoke"}' \
  localhost:3000/api/v1/tokens | sed -E 's/.*"token":"([^"]+)".*/\1/')
curl -s -H "authorization: Bearer $TOKEN" localhost:3000/api/v1/auth/me
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/api/v1/auth/me
rm -f "$JAR"
```
Expected, in order:
1. `{"ok":true}`
2. `Created user boss@example.com ...`
3. `{"user":{"id":"...","email":"boss@example.com","timezone":"Asia/Jakarta"}}`
4. The same user JSON from `/me` via the cookie.
5. The same user JSON via the bearer token.
6. `401` without credentials.

`docker compose logs api` shows the listening line and no stack traces.

Then reset: `docker compose down -v`. This drops the dev DB volume. The test DB is recreated by the init script on the next `up`.

- [ ] **Step 4: README**

`README.md`:
````markdown
# Archipelago

A gamified task manager: each project is a low-poly island that grows as work gets done.
Design: `docs/superpowers/specs/2026-10-07-archipelago-task-game-design.md`.

## Requirements

- Bun 1.4.2
- Docker with Compose

## Local development

```bash
bun install
cp apps/api/.env.example apps/api/.env
docker compose up -d postgres        # Postgres 16 on 127.0.0.1:5433 (+ archipelago_test DB)
bun run seed:user --email you@example.com   # prompts for a password (min 12 chars)
bun run dev                          # API on http://localhost:3000/api/v1
```

Or run the whole stack in containers: `docker compose up -d --build`.

## Commands

| Command | What it does |
|---|---|
| `bun run test` | All tests via Turborepo (API tests need Postgres running) |
| `bun run typecheck` | TypeScript across all packages |
| `bun run lint` / `bun run format` | Biome check / fix |
| `cd apps/api && bun run db:generate` | Generate a migration after editing `src/db/schema.ts` |
| `bun run seed:user --email <e> [--timezone <IANA>]` | Create the single user account |

Migrations run automatically when the API starts.
````

- [ ] **Step 5: Full verification**

Run:
```bash
docker compose up -d postgres
bun run test && bun run typecheck && bun run lint
```
Expected: every package's tests PASS, typecheck is clean, and Biome reports no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/server.ts apps/api/Dockerfile .dockerignore docker-compose.yml README.md
git commit -m "feat(api): add server entrypoint, api container and dev docs"
```

---

## Phase 1 Done When

- [ ] `bun run test`, `bun run typecheck` and `bun run lint` are all green.
- [ ] `docker compose up -d --build` serves `GET /api/v1/health`.
- [ ] A seeded user can log in (cookie), call `/auth/me`, create an API token and authenticate with it.
- [ ] All 8 tables from spec section 5 exist via the committed migration.
