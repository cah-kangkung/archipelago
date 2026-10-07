FROM oven/bun:1.4.2-alpine
WORKDIR /app

# Install with only the manifests first so the dependency layer caches.
# Every workspace package.json must be listed here or --frozen-lockfile fails
# (Phase 2 adds apps/web).
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/ui-tokens/package.json packages/ui-tokens/
COPY apps/web/package.json apps/web/
RUN bun install --frozen-lockfile --production

COPY packages ./packages
COPY apps/api ./apps/api

WORKDIR /app/apps/api
ENV NODE_ENV=production
EXPOSE 3000
CMD ["bun", "src/server.ts"]
