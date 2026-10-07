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
bun run dev                          # API on :3000, web app on http://localhost:5173
```

The web dev server proxies `/api` to the API, so the session cookie is same-origin.
To try the mobile layout on your phone, keep the API running and start the web dev server with `bun run dev -- --host` from `apps/web` (same network).

Or run the whole stack in containers: `docker compose up -d --build`.

## Commands

| Command | What it does |
|---|---|
| `bun run build` | Production build of the web app (`apps/web/dist`) |
| `bun run test` | All tests via Turborepo (API tests need Postgres running) |
| `bun run typecheck` | TypeScript across all packages |
| `bun run lint` / `bun run format` | Biome check / fix |
| `cd apps/api && bun run db:generate` | Generate a migration after editing `src/db/schema.ts` |
| `bun run seed:user --email <e> [--timezone <IANA>]` | Create the single user account |

Migrations run automatically when the API starts. `seed:user` applies pending migrations itself, so it works on a fresh database.
