# Publisher backend

The Bun HTTP publisher serves six fixture articles and accepts ordinary NUT-18
HTTP payments. Drizzle stores durable access grants; Coco stores received ecash
and wallet operation records in a **separate SQLite file**. One backend process
must own these files. There are no accounts, unpaid checkout records, or stored
signing challenges.

## Operator configuration

Install with `bun install --frozen-lockfile`. Configure these variables privately
before `bun run dev:backend` or `bun run start:backend` from the repository root:

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
uses TypeScript 7; installation warns, but the workspace typecheck and build pass.

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

Opening the application database applies the versioned SQL in `drizzle/` before
listening. `bun run db:migrate` also applies it explicitly. Define changes in
`src/db/schema.ts`, run `bun run db:generate`, and commit the generated SQL and
metadata. The grant primary key is `(article_id, public_key, protocol_version)`
and grants have no expiry. Coco owns its own migrations and proof/operation tables;
the application never reads or modifies them through Drizzle.

Importing `src/app.ts` or `src/index.ts` has no listener/signal side effects.
`startPublisher({ databasePath, port: 0, settlement? })` starts an isolated
publisher and reports its URL. Without settlement it serves the catalogue and
signed access requests but rejects payments with 503. `settlement` is the external
Cashu test boundary; routes/authentication/offers/migrations/grants remain real.
`openCocoSettlement({ databasePath, mint, seed })` supplies the actual adapter and
exposes `balance()` through Coco's public `wallet.balances.total` API. The optional
programmatic `mint` override is for valueless local-mint tests; the CLI does not
expose a mint override.

A started publisher owns its settlement adapter. `stop()` is idempotent: stop
accepting connections, drain all accepted payment handlers (even disconnected
clients), close idle keep-alives, dispose Coco, then close SQLite. SIGINT/SIGTERM
await the same path. Callers retain responsibility for closing a supplied adapter
if `startPublisher` itself throws before returning. There is no forced drain
deadline; allow active mint requests to finish during deployment shutdown.

`bun run build` produces `dist/index.js`. Ship the sibling `drizzle/` directory
with that bundle. Run `bun dist/index.js` from the backend workspace with the same
operator configuration and durable file paths.

## Deterministic verification and follow-up

`bun test` exercises the public HTTP API using temporary SQLite and a controlled
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
These are useful foundations for #6's broader restart/recovery acceptance checks.
Live external-wallet/Minibits interoperability and HTTPS deployment remain #7;
automated success does not establish that live demonstration.
