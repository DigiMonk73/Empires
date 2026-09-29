# syntax=docker/dockerfile:1.7
# Empires — web build served by a zero-dependency Node server on :80.
# Build stages run on the build machine's native platform; only the tiny runtime stage is per-arch.

FROM --platform=$BUILDPLATFORM node:22-slim AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY *.html vite.config.ts tsconfig*.json ./
COPY src ./src
COPY public ./public
COPY assets ./assets
RUN npx vite build

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
