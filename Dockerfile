# Restaurante Hub — imagen única: API (NestJS) + app web compilada (servida por la API).
# Railway: un servicio con este Dockerfile + PostgreSQL + Redis.

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true ELECTRON_SKIP_BINARY_DOWNLOAD=1
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /app

FROM base AS build
# Dependencias (capa cacheable)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY packages/printing/package.json packages/printing/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/print-agent/package.json apps/print-agent/
RUN pnpm install --frozen-lockfile --filter @rh/api... --filter @rh/web... --filter @rh/shared --filter @rh/printing
# Código y compilación
COPY tsconfig.base.json ./
COPY packages packages
COPY apps/api apps/api
COPY apps/web apps/web
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm --filter @rh/shared build \
 && pnpm --filter @rh/printing build \
 && pnpm --filter @rh/api build \
 && pnpm --filter @rh/web exec vite build

FROM base AS runtime
ENV NODE_ENV=production PORT=3000 SERVE_WEB=true WEB_DIST_PATH=/app/apps/web/dist
# pg_dump para respaldos automáticos
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /app /app
WORKDIR /app/apps/api
EXPOSE 3000
# Aplica migraciones y arranca
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/db/bootstrap.js && node dist/main.js"]
