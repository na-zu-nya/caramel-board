# Multi-architecture friendly base image (BuildKit picks the platform automatically).
FROM node:22-bookworm-slim AS base
ARG TARGETPLATFORM
ARG BUILDPLATFORM
ARG TARGETOS
ARG TARGETARCH

# Log resolved build platforms for troubleshooting.
RUN echo "BUILDPLATFORM=$BUILDPLATFORM TARGETPLATFORM=$TARGETPLATFORM TARGETOS=$TARGETOS TARGETARCH=$TARGETARCH" \
 && node -e 'console.log("node:",process.version, "arch:",process.arch, "platform:",process.platform)'

# Install system dependencies in a single non-interactive layer.
ARG DEBIAN_FRONTEND=noninteractive
RUN set -eux; \
  apt-get update; \
  apt-get install -y --no-install-recommends \
    ca-certificates \
    ffmpeg \
    curl \
    build-essential \
    python3; \
  rm -rf /var/lib/apt/lists/*

# Relax file descriptor limit for runtime heavy IO.
RUN ulimit -Sn 65536

WORKDIR /app

# Seed workspace manifests for dependency installation.
COPY package.json package-lock.json turbo.json ./
COPY apps/server/package.json ./apps/server/
COPY apps/client/package.json ./apps/client/

# Install dependencies (node_modules remain inside the image).
RUN npm ci --no-audit

# Copy Prisma schema before generating the client.
COPY apps/server/prisma ./apps/server/prisma

# Generate Prisma client early to leverage caching.
WORKDIR /app/apps/server
RUN npx prisma generate

# Copy application sources.
WORKDIR /app
COPY apps/server ./apps/server
COPY apps/client ./apps/client

# Remove stale static assets from previous builds.
RUN rm -rf /app/apps/server/static

# Rebuild esbuild for the container architecture to avoid host binary issues.
RUN npm rebuild esbuild --workspace=@caramelboard/server || npm rebuild esbuild || true \
 && npx --yes esbuild --version

# Build client bundle in production mode.
WORKDIR /app/apps/client
# Set production env only for the build step.
ENV NODE_ENV=production
RUN npm run build

# Build server bundle.
WORKDIR /app/apps/server
RUN npm run build

# Sanity check ffmpeg availability.
RUN ffmpeg -version

# Copy client build output into the server static directory.
RUN rm -rf /app/apps/server/static && \
    cp -r /app/apps/client/dist /app/apps/server/static && \
    echo "Static files copied successfully"

# Create a dedicated runtime user.
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nodejs

# Ensure runtime ownership.
RUN chown -R nodejs:nodejs /app

EXPOSE 9000

# Health check served by the application.
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:9000/api/v1/health || exit 1

# Default command: start the production server.
WORKDIR /app/apps/server
CMD ["npm", "run", "start:prod"]
