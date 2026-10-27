# Stateless Reader

An accountless premium web reader proof of concept: readers buy individual
articles with Cashu and return using a passkey. Article-specific keys avoid a
shared cryptographic identifier across different articles, while the publisher
retains access grants and its Cashu wallet state.

The publisher and frontend implement the deterministic purchase and reader flow.
The live external-wallet demonstration remains unverified. See the
[HTTPS demo runbook](docs/demo/live-wallet.md), [validation evidence](docs/evidence/issue-7/README.md),
[glossary](GLOSSARY.md), and [passkey-only decision](docs/adr/0004-passkey-only-readers.md).

## Returning to purchases

Open **Profile → Continue with passkey**. Your device or password manager offers
existing credentials and may offer another device. If that fails or you cancel,
**Create a new reader** explicitly creates a passkey for a new reader. A new
passkey does not recover another reader's purchases. The browser/provider must
support WebAuthn PRF; unsupported credentials leave the reader locked.

Reader seeds are derived directly from the passkey secret using HKDF. There is
no recovery phrase, import/export or publisher reset. Keep the same credential
available through your passkey provider. Sync and cross-device PRF behavior
must be verified with the devices/providers you intend to use. Passkeys are tied
to the site's hostname; losing access to the credential or its PRF output loses
access to purchases. Sharing the credential shares access.

Use a separate Cashu wallet to pay the article's request. Each article has its
own derived key and purchase. Returning with the same passkey recreates those
keys without paying again. Access is checked only when an article is opened;
there is no catalogue scan or purchase history. Grants cover corrections and
updates under the same article identity; publishers must never reuse an ID for
unrelated content.

The app retains seeds and article private keys only in tab memory. **Lock reader**
and reload clear active application state. Pending operations are aborted and
stale results discarded. No credential ID, seed or recovery blob is stored by
the app. The passkey provider stores the credential and may sync it. JavaScript
cannot guarantee erasure of every memory copy.

[Passkey derivation v2](docs/protocol/passkey-reader-v2.md) intentionally replaces
the earlier phrase-compatible derivation. Previous reader keys and purchases
are not migrated in this POC. The publisher's data and wallet are retained.

Recovery still requires the publisher's grants and available articles. For a
normal publisher restart, stop gracefully with SIGINT/SIGTERM, await completion,
and restart with the same application database, separate Coco database and
stable publisher seed. See [backend configuration](apps/backend/README.md).

Payment settlement and grant storage are not atomic. A crash after the mint
swap but before the grant is stored can leave a paid reader without access;
this POC does not reconcile that gap, recover publisher data loss, or coordinate
multiple backend processes. Different articles have different public keys, but
repeat reading of one article is recognizable. Payment binds to an article/key;
publisher separation and network/browser anonymity are not promised.

The automated recovery evidence uses the real frontend and publisher with a
valueless local mint and the real Coco Bun SQLite adapter. It covers two purchases,
both restored keys, an unrelated reader's denial, repeated reads, lock/reload,
on-demand access, and empty browser storage plus secret-free request/console
observations throughout the journey. HTTP tests also read a corrected fixture
through its original grant ten simulated years later, and the existing Coco test
reopens both databases and checks spendable funds through its public balance API.
These checks do not demonstrate a live external wallet or Minibits payment;
that remains the separate live validation in ticket #7.

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
bun run dev:backend  # Start the backend at http://127.0.0.1:3000 (migrate first)
bun run start:backend # Start the backend without watch mode (migrate first)
bun run db:generate # Generate SQL migrations from the backend schema
bun run db:migrate  # Explicitly apply application migrations before backend startup
bun run start      # Run the reader once
bun run build      # Build applications into their respective dist directories
bun run lint       # Lint workspaces that provide a lint script
bun run typecheck  # Check every workspace
bun run test       # Run HTTP, crypto-vector, and real-Coco tests
bun run test:browser # Run the real frontend/publisher purchase checks
bun run test:browser:production # Run those checks against the production build
```

With the backend environment configured, run `bun run db:migrate` before the
first publisher start and after installing new application migrations. Starting
the server never applies application migrations. Coco initializes its own
separate wallet database automatically. Compiled/container deployments include
`apps/backend/dist/migrate.js`; see the [operator runbook](docs/demo/live-wallet.md)
for explicit migration on retained storage before starting the server.

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
