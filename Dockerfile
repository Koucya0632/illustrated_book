# syntax=docker/dockerfile:1
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Like Vercel's production build: migrate first, then prerender with live data.
RUN --mount=type=secret,id=env sh -c 'set -a && . /run/secrets/env && set +a && npx tsx scripts/migrate.ts && npx next build'
# Vercel builds URLs from the Host header; standalone builds them from HOSTNAME:PORT
# (http://0.0.0.0:8080), which breaks auth redirects and same-origin checks. Turn on
# trustHostHeader and let it win over the bind address. Fail the build if Next moves either.
RUN sed -i 's/"trustHostHeader":false/"trustHostHeader":true/' .next/standalone/server.js \
 && grep -q '"trustHostHeader":true' .next/standalone/server.js \
 && sed -i 's/const initUrl = this.fetchHostname && this.port ?/const initUrl = !this.nextConfig.experimental.trustHostHeader \&\& this.fetchHostname \&\& this.port ?/' .next/standalone/node_modules/next/dist/server/next-server.js \
 && grep -q 'const initUrl = !this.nextConfig.experimental.trustHostHeader' .next/standalone/node_modules/next/dist/server/next-server.js

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=8080 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Next writes unstable_cache entries (word catalogue, choices, examples) under
# .next/cache. /app is root-owned, so without this every write fails with EACCES
# and each study-queue request rebuilds the catalogue from the DB (16-45 s).
RUN mkdir -p .next/cache && chown -R node:node .next/cache
USER node
EXPOSE 8080
CMD ["node", "server.js"]
