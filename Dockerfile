# マルチアーキテクチャ対応の共通ベース。
FROM node:22-bookworm-slim AS base
ARG TARGETPLATFORM
ARG BUILDPLATFORM
ARG TARGETOS
ARG TARGETARCH

WORKDIR /app

# 依存解決とビルドに必要なツールのみを持つステージ。
FROM base AS build-deps
ARG DEBIAN_FRONTEND=noninteractive

RUN set -eux; \
  echo "BUILDPLATFORM=$BUILDPLATFORM TARGETPLATFORM=$TARGETPLATFORM TARGETOS=$TARGETOS TARGETARCH=$TARGETARCH"; \
  node -e 'console.log("node:",process.version,"arch:",process.arch,"platform:",process.platform)'; \
  apt-get update; \
  apt-get install -y --no-install-recommends \
    ca-certificates \
    build-essential \
    python3; \
  rm -rf /var/lib/apt/lists/*

# 依存関係のキャッシュを効かせるため、先にマニフェストだけをコピーする。
COPY package.json package-lock.json turbo.json ./
COPY apps/server/package.json ./apps/server/
COPY apps/client/package.json ./apps/client/

RUN npm ci --no-audit --no-fund

# Prisma Client を先に生成してキャッシュを効かせる。
COPY apps/server/prisma ./apps/server/prisma

WORKDIR /app/apps/server
RUN npx prisma generate

# 実アプリをビルドするステージ。
FROM build-deps AS builder

WORKDIR /app
COPY apps/server ./apps/server
COPY apps/client ./apps/client

# 以前のビルド成果物が混ざらないように明示的に削除する。
RUN rm -rf /app/apps/server/static

# ホスト依存の esbuild バイナリを避けるため、コンテナ環境で再構築する。
RUN npm rebuild esbuild --workspace=@caramelboard/server || npm rebuild esbuild || true \
 && npx --yes esbuild --version

WORKDIR /app/apps/client
ENV NODE_ENV=production
RUN npm run build

WORKDIR /app/apps/server
RUN npm run build

# クライアント成果物をサーバー配信用ディレクトリへ集約する。
RUN rm -rf /app/apps/server/static \
 && cp -r /app/apps/client/dist /app/apps/server/static

# 実行に必要なものだけを含む軽量ステージ。
FROM node:22-bookworm-slim AS runtime
ARG DEBIAN_FRONTEND=noninteractive

WORKDIR /app

RUN set -eux; \
  apt-get update; \
  apt-get install -y --no-install-recommends \
    ca-certificates \
    ffmpeg \
    poppler-utils; \
  rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/server/package.json ./apps/server/
COPY apps/server/prisma ./apps/server/prisma

# server ワークスペースの本番依存だけを新規インストールする。
RUN PRISMA_SKIP_POSTINSTALL_GENERATE=true npm ci --omit=dev --workspace=@caramelboard/server --include-workspace-root=false --no-audit --no-fund

# runtime 側の node_modules 配置に合わせて Prisma Client を生成する。
WORKDIR /app/apps/server
RUN npx prisma generate
WORKDIR /app

COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/static ./apps/server/static

ENV NODE_ENV=production
ENV PORT=6766

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nodejs \
  && chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 6766

# curl を入れずに Node の fetch でヘルスチェックする。
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:6766/api/v1/health').then((response)=>{if(!response.ok)process.exit(1);}).catch(()=>process.exit(1));"]

WORKDIR /app/apps/server
CMD ["npm", "run", "start:prod"]
