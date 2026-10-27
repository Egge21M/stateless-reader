# Stateless Reader

An accountless premium web reader proof of concept: readers buy individual
articles with Cashu and regain access using a passkey or a reader-owned
12-word recovery phrase. Article-specific keys avoid a shared cryptographic identifier across
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

Open **Profile** and choose **Continue with passkey**. Your device or password
manager offers existing passkeys and may offer another device. If that fails or
you cancel, **Create a new reader** explicitly creates a passkey for a new reader.
A new passkey does not recover purchases from an old passkey or phrase. Passkeys
must support WebAuthn PRF; unsupported providers leave the reader locked.

Back up the twelve-word phrase shown after creation privately before paying.
**Show backup** reveals it again later. It recovers the same reader independently
of the passkey. **Use a recovery phrase** also offers the original phrase-only
creation and restoration flow. Never import a wallet's phrase here.
Use a separate Cashu wallet to pay the article's request. Each article has its
own derived key and purchase: buying one does not unlock another.

To return, choose **Continue with passkey** and select the same credential, or
expand **Use a recovery phrase**, enter the same twelve words in **Restore reader
recovery phrase**, choose **Restore reader**, then open a purchased article.
Repeat for the second purchase; neither requires another payment. Restoration
does not scan the catalogue or produce a purchase history. Access is checked
only for the article you open. Existing grants allow repeated reads without
expiry while the publisher offers the article, including corrections and updates
under its original identity. Publishers must never reuse an ID for unrelated
content.

The phrase, reader seed and article private keys stay in tab memory. **Lock
reader** clears active application state, and reloading leaves the reader locked;
the app saves no credential ID, seed, or recovery blob. The passkey provider
stores the credential and may sync it. Unlock with the same passkey or restore
the phrase again to read. JavaScript cannot guarantee erasure of every memory
copy. Losing both passkey and phrase loses access; sharing either shares access.
Passkeys are tied to the site's hostname. Keep the phrase for domain changes
or providers that cannot reproduce the same PRF secret on another device.
See [passkey recovery v1](docs/protocol/passkey-reader-v1.md) for the frozen
derivation and compatibility limits.
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
