# Stateless Reader

Bun and TypeScript monorepo. Use Bun 1.3.14 or newer.

## Getting started

```sh
bun install
bun run dev
```

The starter prints `Stateless Reader is ready.` and watches for changes.

## Workspaces

- `apps/reader`: runnable application entry point.
- `packages/core`: shared TypeScript package, imported by the reader using `workspace:*`.

Shared packages export TypeScript source directly for Bun to run or bundle.
Add new workspaces under `apps/` or `packages/`, give each a unique package
name and a `typecheck` script, then run `bun install` to link them.

## Commands

Run these from the repository root:

```sh
bun run dev        # Start the reader in watch mode
bun run start      # Run the reader once
bun run build      # Bundle the reader into apps/reader/dist
bun run typecheck  # Check every workspace
bun run test       # Run Bun tests (no tests are included yet)
```

Commit `bun.lock` when dependencies change. For reproducible installs, use
`bun install --frozen-lockfile`.

Workspace configuration follows the [Bun workspace documentation](https://bun.sh/docs/pm/workspaces).
