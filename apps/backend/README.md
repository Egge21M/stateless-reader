# Publisher backend

The Bun HTTP publisher serves six fixture articles and accepts ordinary NUT-18
HTTP payments. Drizzle stores durable access grants; Coco stores received ecash
and wallet operation records in a **separate SQLite file**. One backend process
must own these files. There are no accounts, unpaid checkout records, or stored
signing challenges.

## Operator configuration

Install with `bun install --frozen-lockfile`. Configure these variables privately
before `bun run db:migrate`, then `bun run dev:backend` or `bun run start:backend`
from the repository root:

- `PUBLISHER_SEED_HEX`: required, exactly 128 hexadecimal characters representing
  a stable 64-byte publisher seed. Provision this once using a secure source and
  retain it across restarts. It is unrelated to reader recovery phrases. There is
  no generated fallback. Missing or malformed seeds fail startup without a listener.
- `DATABASE_PATH`: application grants file, default `./data.sqlite`.
- `COCO_DATABASE_PATH`: Coco wallet file, default `./coco.sqlite`. It must differ
  from the application file. CLI startup rejects shared files and in-memory paths.
- `HOST` / `PORT`: default `127.0.0.1` / `3000`.
- `PUBLIC_ORIGIN`: trusted external HTTPS origin, e.g. `https://publisher.example`.
  Required behind a TLS proxy; HTTP origins are accepted only for loopback
  development. When omitted, targets use the listener origin, never request Host
  or forwarding headers.
- `FRONTEND_DIST_PATH`: optional absolute path to `apps/frontend/dist` after
  `bun run build`. Serves the built reader at `/` and its assets on the API
  listener. Unknown paths remain JSON 404; source/state files are not served.
  The build is loaded at startup, so deploy frontend changes with a restart.

Relative file paths resolve against the process working directory (the backend
workspace for workspace scripts); parent directories must already exist. Use
absolute paths for deployments. Back up both SQLite databases and the publisher
seed privately. Never log seeds, proof-bearing requests, or wallet transport
bodies. Startup/errors intentionally omit underlying Cashu exception details.

The operator entry point fixes `https://mint.minibits.cash/Bitcoin` and `sat`.
Coco initializes at startup; mint metadata is loaded when receiving payments.
Before prepare/execute, input keysets must belong to the configured mint, support
the submitted denomination, use sat, and have zero input fees. Inactive input
keysets are accepted. Prepared receive terms must match the validated input
amount and have zero fees. Nonzero fees fail safely; general fee handling is not
implemented. Recheck the mint's current metadata before a live demonstration.

Pinned packages are `@cashu/coco-core@2.0.0`, `@cashu/coco-sqlite-bun@2.0.0`, and
`@cashu/cashu-ts@5.0.0-rc.4`. Coco declares a TypeScript 5 peer while this repository
uses TypeScript 7 (the frontend uses TypeScript 6). The frozen install in #7 did
not emit a peer warning, but the declared mismatch remains. Workspace typecheck
and build pass with `skipLibCheck`; this is not a claim of upstream TS 7 support.

## HTTP contract

- `GET /health`: SQLite health check, `{ "status": "ok" }`.
- `GET /articles`: public `{ articles: [{ id, title, preview, offer }] }`. Full
  bodies remain publisher-only. Article IDs are never reassigned; corrections
  under the same ID remain covered by existing grants.
- `GET /article/:articleId`: verifies the frozen [reader v1 signature](../../docs/protocol/reader-v1.md).
  Missing/invalid/stale authorization returns 401. Unknown articles return 404.
  Valid unpaid requests return 402 with `{ articleId, publicKey, protocolVersion,
  offer, paymentRequest }`. Valid granted requests return 200 with `{ articleId,
  publicKey, protocolVersion, title, body }`. Article responses use `no-store`;
  replay inside the inclusive 60-second validity window remains accepted.
- `POST /payment/:articleId/:publicKey`: accepts JSON `{ mint, unit, proofs,
  id?, memo? }`. This is a NUT-18 payment payload, not an encoded token or a
  reader-signed request. Optional `id` is not stored as a checkout. The URL binds
  the article/key; grants use protocol version 1.
- `OPTIONS /payment/:articleId/:publicKey`: 204 preflight allowing POST and
  Content-Type, with `Access-Control-Allow-Origin: *` and no credentials. All
  payment POST responses, including errors, carry these CORS headers and `no-store`.

Payment bodies are limited to 128 KiB and 256 proofs. Proof amounts and sums must
be positive safe integers. Proof shape, duplicate secrets, key encoding,
article, mint, unit and price are validated before settlement. Underpayment
returns 400 without redemption. Exact payment or overpayment is accepted; the
publisher keeps the entire amount with no change/refunds. Payload errors return
400, oversized bodies 413, and wrong content type 415.

A process-local per-pair queue serializes the existing-grant check, Coco receive,
and unique grant insert. An already-granted pair returns 409 before redeeming
additional proofs. Only `manager.ops.receive.execute()` returning `finalized`
authorizes a grant. Preparation or a spent-state check is insufficient. Invalid,
spent or otherwise unsuccessful settlement returns 422 and no grant; unsupported
fee assumptions or unavailable settlement return 503. Success returns JSON
`{ status: "paid", articleId, publicKey, protocolVersion: 1 }`, never premium content.

There is deliberately **no atomic transaction between mint settlement and the
application grant write**. A crash/storage failure after a successful swap may
leave funds received without access granted. Crash recovery, distributed locking,
refunds and withdrawal UI are out of scope. Coco still performs its own startup
operation recovery; disabled workers do not disable that recovery.

## Persistence, migration and lifecycle

Application migrations are explicit and separate from opening the database or
starting the server. With the publisher stopped, run `bun run db:migrate` against
the retained `DATABASE_PATH` before the first start and whenever new migrations
are shipped. It applies the versioned SQL in `drizzle/` and closes the connection.
Startup reads the required grant schema and fails before listening if it is
missing or unusable; it never applies SQL migrations. This check is not a pending
migration detector: operators must apply each release's migrations. Define changes in
`src/db/schema.ts`, run `bun run db:generate`, and commit the generated SQL and
metadata. The grant primary key is `(article_id, public_key, protocol_version)`
and grants have no expiry. Coco owns its own migrations and proof/operation tables;
the application never reads or modifies them through Drizzle.

Importing `src/app.ts` or `src/index.ts` has no listener/signal side effects.
Explicitly call `migrateApplication(databasePath)` from `src/db/migrate.ts` to
prepare temporary databases in test setup. Importing it does not migrate anything.
`startPublisher({ databasePath, port: 0, settlement? })` starts an isolated
publisher and reports its URL. Without settlement it serves the catalogue and
signed access requests but rejects payments with 503. `settlement` is the external
Cashu test boundary; routes/authentication/offers/migrations/grants remain real.
`openCocoSettlement({ databasePath, mint, seed })` supplies the actual adapter and
exposes `balance()` through Coco's public `wallet.balances.total` API. The optional
programmatic `mint` override is for valueless local-mint tests; the CLI does not
expose a mint override.

The programmatic `articles` option supplies a publisher-owned fixture edition;
the CLI defaults to `src/articles.ts`. Catalogue metadata and authorized content
use the same edition. To publish a correction, update its title, preview or body
while preserving its ID and offer, then restart normally with the retained grant
database. Never reuse an ID for unrelated content. This is startup configuration,
not a publishing endpoint or a reader-supplied catalogue.

A started publisher owns its settlement adapter. `stop()` is idempotent: stop
accepting connections, drain all accepted payment handlers (even disconnected
clients), close idle keep-alives, dispose Coco, then close SQLite. SIGINT/SIGTERM
await the same path. Callers retain responsibility for closing a supplied adapter
if `startPublisher` itself throws before returning. There is no forced drain
deadline; allow active mint requests to finish during deployment shutdown.

`bun run build` produces `dist/index.js` and the standalone `dist/migrate.js`.
Ship both with the sibling `drizzle/` directory. From the backend workspace,
run `bun dist/migrate.js` explicitly while the publisher is stopped, then run
`bun dist/index.js`, with the same absolute `DATABASE_PATH`. Neither the migration
bundle nor the server needs source files or `node_modules` in the deployment.
The migration command only opens application state; Coco still initializes and
migrates its separate wallet file automatically during publisher startup.

## Deterministic verification and follow-up

`bun test` exercises the public HTTP API using explicitly migrated temporary SQLite and a controlled
settlement boundary, plus real Coco with the valueless HTTP mint in
`tests/fake-mint.ts`. The fixture verifies signatures/spentness, blind-signs real
outputs, and supports restore/checkstate. Its `/test/issue` route exists only in
the test mint, never in the publisher. No real mint or live funds are required.

`src/coco.test.ts` demonstrates reopening both files with the same seed and
checking retained spendable funds via `balance()` plus signed access through HTTP.
`src/purchase.test.ts` covers concurrency, failure, under/overpayment, duplicates,
CORS, persistence and draining shutdown. `tests/browser/purchase.pw.ts` at the repo
root covers two independent purchases, fresh-browser recovery, fresh signed
polling, cancellation and delayed paid responses using the real publisher/Coco.
The recovery journey restores both purchases with their original distinct keys,
checks that an unrelated phrase remains unpaid, and verifies no access scans or
hidden browser credentials. `src/purchase.test.ts` also deploys a corrected fixture
edition and reads it repeatedly with the existing grant ten simulated years later,
without a settlement adapter. See [reader recovery and its limits](../../README.md#recovering-purchases).
Live external-wallet/Minibits interoperability and HTTPS deployment remain #7;
automated success does not establish that live demonstration.

The [live-wallet runbook](../../docs/demo/live-wallet.md) covers the compiled
single-listener deployment, stable seed provisioning, Docker/Fly and temporary
HTTPS options, wallet pin, live steps, backups and expected failures. Run
`bun run test:browser:production` from the root to exercise the browser suite
against built assets on the publisher, without a Vite development server.
