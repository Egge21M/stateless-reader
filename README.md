# Stateless Reader

An accountless premium web reader proof of concept: readers buy individual
articles with Cashu and regain access using a reader-owned 12-word recovery
phrase. Article-specific keys avoid a shared cryptographic identifier across
different articles, while the publisher retains access grants and its Cashu
wallet state.

The planned demo serves 5–10 articles from one publisher, uses regular Cashu
payment requests with HTTP transport, and delegates backend Cashu operations
to Coco. The defining demonstration is buying an article, then restoring access
in a fresh browser using only the recovery phrase, without paying again.

The repository currently contains the application scaffolding. See the
[glossary](GLOSSARY.md), [access-model decision](docs/adr/0001-accountless-article-access.md),
and [request-authentication decision](docs/adr/0002-short-lived-signed-article-requests.md)
for the agreed scope and privacy boundaries.

Bun and TypeScript monorepo. Use Bun 1.3.14 or newer.

## Getting started

```sh
bun install
bun run dev
```

The starter prints `Stateless Reader is ready.` and watches for changes.

## Workspaces

- `apps/reader`: runnable application entry point.
- `apps/frontend`: React + TypeScript frontend from the shadcn Vite starter,
  using Tailwind CSS, the Nova preset, and Base UI components.
- `apps/backend`: Bun HTTP backend using `bun:sqlite` and Drizzle ORM.
- `packages/core`: shared TypeScript package, imported by the reader using `workspace:*`.

Shared packages export TypeScript source directly for Bun to run or bundle.
Add new workspaces under `apps/` or `packages/`, give each a unique package
name and a `typecheck` script, then run `bun install` to link them.

## Commands

Run these from the repository root:

```sh
bun run dev        # Start the reader in watch mode
bun run dev:frontend # Start the frontend Vite development server
bun run dev:backend  # Start the backend at http://127.0.0.1:3000
bun run start:backend # Start the backend without watch mode
bun run db:generate # Generate SQL migrations from the backend schema
bun run db:migrate  # Apply backend database migrations
bun run start      # Run the reader once
bun run build      # Build applications into their respective dist directories
bun run lint       # Lint workspaces that provide a lint script
bun run typecheck  # Check every workspace
bun run test       # Run Bun tests (no tests are included yet)
```

Commit `bun.lock` when dependencies change. For reproducible installs, use
`bun install --frozen-lockfile`.

Workspace configuration follows the [Bun workspace documentation](https://bun.sh/docs/pm/workspaces).

## Frontend components and agent skill

Add shadcn components from the repository root:

```sh
bunx --bun shadcn@latest add card -c apps/frontend
```

Frontend components live in `apps/frontend/src/components/ui`; its
`components.json` configures the CLI and `@/` resolves to its `src/` directory.

The official [shadcn skill](https://github.com/shadcn-ui/ui/tree/main/skills/shadcn)
is installed locally in `.agents/skills/shadcn` and is versioned with this project.

## Backend

See [apps/backend/README.md](apps/backend/README.md) for configuration and the
database migration workflow. `GET /health` checks the SQLite connection.
