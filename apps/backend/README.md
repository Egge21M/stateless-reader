# Backend

A small HTTP server using `Bun.serve`, Bun's built-in SQLite driver, and
[Drizzle ORM](https://orm.drizzle.team/docs/get-started/bun-sqlite-new).

From the repository root:

```sh
bun install
bun run db:migrate
bun run dev:backend
curl http://127.0.0.1:3000/health
```

`GET /health` queries SQLite through Drizzle and returns `{"status":"ok"}`.
Unknown routes return JSON with HTTP 404.

## Configuration

Optionally copy `.env.example` to `.env` in this directory. Bun loads it
automatically when running the workspace scripts.

- `HOST`: bind address, defaults to `127.0.0.1`.
- `PORT`: HTTP port, defaults to `3000`.
- `DATABASE_PATH`: SQLite filename, defaults to `./data.sqlite` in this workspace.
  Relative paths resolve against the working directory; the parent directory must
  exist. Use an absolute path when running outside the workspace.

SQLite files and their journal files are ignored by Git. Connections enable WAL,
foreign key enforcement, and a five-second busy timeout.

## Database changes

1. Define tables in `src/db/schema.ts` using `drizzle-orm/sqlite-core`.
2. Run `bun run db:generate` from the repository root.
3. Review and commit the generated SQL and metadata in `drizzle/`.
4. Run `bun run db:migrate` to apply pending migrations with Bun's SQLite driver.

The initial schema is empty. Migrations run explicitly, before starting the
server; server startup does not modify the application schema.

`src/db/index.ts` owns the database connection and exports `openDatabase`.
Use `openDatabase(":memory:")` for isolated in-memory databases.

## Build and checks

Run `bun run build` and `bun run typecheck` from the repository root. The backend
bundle targets Bun. To run it, use `bun dist/index.js` from this directory.
Keep the migration files and runner available for the separate migration step.
