# syntax=docker/dockerfile:1.7
# Empires — web build served by a zero-dependency Node server on :80.
# Build stages run on the build machine's native platform; only the tiny runtime stage is per-arch.

# 1. Bake sprites (code-built 3D → 2D atlases) with headless Chromium on software GL (SwiftShader).
#    Only art sources feed this stage, so gameplay changes don't invalidate the bake cache (DECISIONS D5).
FROM --platform=$BUILDPLATFORM mcr.microsoft.com/playwright:v1.56.1-noble AS bake
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY vite.config.ts tsconfig*.json bake.html ./
COPY src/art ./src/art
COPY tools/bake ./tools/bake
RUN node tools/bake/cli.ts --software

# 2. Build the web app.
FROM --platform=$BUILDPLATFORM node:22-slim AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY *.html vite.config.ts tsconfig*.json ./
COPY src ./src
COPY public ./public
COPY assets ./assets
COPY --from=bake /src/public/baked ./public/baked
RUN npx vite build

# 3. Runtime.
FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    PORT=80 \
    HOST=0.0.0.0 \
    DIST_DIR=/app/dist \
    DATA_DIR=/data
WORKDIR /app
COPY --from=build /src/dist ./dist
COPY server ./server
RUN mkdir -p /data
EXPOSE 80
CMD ["node", "/app/server/serve.mjs"]
