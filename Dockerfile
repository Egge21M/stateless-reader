FROM oven/bun:1.3.14 AS build
WORKDIR /build
COPY . .
RUN bun install --frozen-lockfile && bun run build

FROM oven/bun:1.3.14
WORKDIR /app
COPY --from=build /build/apps/backend/dist /app/backend/dist
COPY --from=build /build/apps/backend/drizzle /app/backend/drizzle
COPY --from=build /build/apps/frontend/dist /app/frontend/dist
ENV HOST=0.0.0.0 PORT=3000 \
    DATABASE_PATH=/data/application.sqlite \
    COCO_DATABASE_PATH=/data/coco.sqlite \
    FRONTEND_DIST_PATH=/app/frontend/dist
RUN mkdir -p /data && chmod 700 /data
EXPOSE 3000
STOPSIGNAL SIGTERM
# Prepare the mounted application DB separately with /app/backend/dist/migrate.js.
# This default command starts only the publisher; it never runs app migrations.
CMD ["sh", "-c", "umask 077; exec bun /app/backend/dist/index.js"]
