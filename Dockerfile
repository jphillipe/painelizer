# Panelizer web no Cloud Run (docs/12-hospedagem-cloud-run.md). Build em três estágios: dependências do
# workspace pnpm, build do Next em modo standalone, e uma imagem final só com o que o rastreio de arquivos lista.
# `gcloud run deploy --source .` usa este arquivo na raiz do monorepo.

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.8.1 --activate
WORKDIR /app

# Só os manifestos primeiro: a camada de dependências é reaproveitada enquanto eles não mudarem.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json packages/core/
COPY packages/cli/package.json packages/cli/
COPY packages/extract/package.json packages/extract/
COPY packages/web/package.json packages/web/
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/core/node_modules ./packages/core/node_modules
COPY --from=deps /app/packages/cli/node_modules ./packages/cli/node_modules
COPY --from=deps /app/packages/extract/node_modules ./packages/extract/node_modules
COPY --from=deps /app/packages/web/node_modules ./packages/web/node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter web build

FROM node:22-bookworm-slim AS run
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Cloud Run manda a porta em $PORT (8080) e espera o servidor em todas as interfaces.
ENV PORT=8080
ENV HOSTNAME=0.0.0.0
WORKDIR /app
RUN groupadd --system app && useradd --system --gid app --home /app app
COPY --from=build --chown=app:app /app/packages/web/.next/standalone ./
COPY --from=build --chown=app:app /app/packages/web/.next/static ./packages/web/.next/static
COPY --from=build --chown=app:app /app/packages/web/public ./packages/web/public
USER app
EXPOSE 8080
CMD ["node", "packages/web/server.js"]
