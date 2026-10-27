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

The publisher and frontend implement the deterministic purchase and reader flow.
The live external-wallet demonstration remains unverified. See the
[HTTPS demo runbook](docs/demo/live-wallet.md) and
[validation evidence](docs/evidence/issue-7/README.md), the
[glossary](GLOSSARY.md), [access-model decision](docs/adr/0001-accountless-article-access.md),
and [request-authentication decision](docs/adr/0002-short-lived-signed-article-requests.md)
for the agreed scope and privacy boundaries.

## Recovering purchases

Create a reader phrase and back up its twelve words privately before paying.
Use a separate Cashu wallet to pay the article's request. Each article has its
own derived key and purchase: buying one does not unlock another.

To return in a fresh browser, enter the same twelve words in **Restore reader
recovery phrase**, choose **Restore reader**, then open a purchased article.
Repeat for the second purchase; neither requires another payment. Restoration
does not scan the catalogue or produce a purchase history. Access is checked
only for the article you open. Existing grants allow repeated reads without
expiry while the publisher offers the article, including corrections and updates
under its original identity. Publishers must never reuse an ID for unrelated
content.

The phrase, reader seed and article private keys stay in tab memory. **Lock
reader** clears active application state, and reloading leaves the reader locked;
there is no saved browser credential to recover it automatically. Restore the
phrase again to read. JavaScript cannot guarantee erasure of every memory copy.
Losing the phrase loses access; sharing it shares access to all its purchases.
There is no publisher-assisted password reset. Do not enter your Cashu wallet
phrase in the reader.

Recovery also requires the publisher's retained grants and available articles.
A reader phrase cannot reconstruct a lost publisher database. For a normal
publisher restart, stop gracefully with SIGINT/SIGTERM and await completion,
then start with the same application database, separate Coco database and stable
publisher seed. Back up those files after shutdown and protect the seed; see
the [backend configuration](apps/backend/README.md). Reopening those files
preserves grants and Coco-managed spendable funds. It does not run a reader
purchase scan or require a new payment.

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
bun run dev:backend  # Start the backend at http://127.0.0.1:3000
bun run start:backend # Start the backend without watch mode
bun run db:generate # Generate SQL migrations from the backend schema
bun run db:migrate  # Apply backend database migrations
bun run start      # Run the reader once
bun run build      # Build applications into their respective dist directories
bun run lint       # Lint workspaces that provide a lint script
bun run typecheck  # Check every workspace
bun run test       # Run HTTP, crypto-vector, and real-Coco tests
bun run test:browser # Run the real frontend/publisher purchase checks
bun run test:browser:production # Run those checks against the production build
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
