# Live external-wallet demonstration (#7)

**Status: prepared, LIVE payment NOT PERFORMED. #7 remains incomplete.** No funded
external wallet or authorization to spend was supplied. Nothing was deployed,
provisioned, or paid during preparation. Follow this runbook only after the
operator supplies an authorized HTTPS host and a funded compatible wallet.
The [evidence record](../evidence/issue-7/README.md) distinguishes automated results,
public mint observations, and pending live checks.

## Build and persistence

Use Bun **1.3.14** and the committed lockfile, from the repository root:

```sh
git rev-parse HEAD                  # Record full publisher commit, not a branch name.
git status --porcelain             # Must be empty for reproducible live evidence.
bun install --frozen-lockfile
bun run typecheck
bun run build
bun run lint
bun test
bun run test:browser:production
```

The production runtime is `apps/backend/dist/index.js`, the adjacent
`apps/backend/drizzle/` directory, and `apps/frontend/dist/`. Ship all three.
`FRONTEND_DIST_PATH` points at the built frontend: the Bun publisher serves `/`
and its assets on the same origin as `/articles`, `/article/*`, and `/payment/*`.
It does not run Vite, serve source files, or turn unknown API paths into HTML.
It snapshots the frontend at startup; rebuild and restart to publish changes.
Vite dev/preview are not this deployment's production server.

One process must exclusively own **two separate durable SQLite files**:

- `DATABASE_PATH`: application grants. Opening the publisher applies committed
  Drizzle SQL before listening; `bun run db:migrate` can also apply it explicitly.
  This is application migration ownership, not Coco migration ownership.
- `COCO_DATABASE_PATH`: received proofs, counters and operation records. The
  pinned Coco initializer applies its own migrations. Do not run Drizzle on this
  file or inspect/change wallet tables to establish a balance.
- `PUBLISHER_SEED_HEX`: one stable private **64-byte** seed, encoded as **128 hex
  characters**. It is unrelated to any reader phrase or payer-wallet seed. Missing
  or malformed seeds fail startup. A different but well-formed seed is not detected
  as a rotation: the operator must retain the same seed with the same Coco file.

Relative database paths use the process working directory, which differs between
workspace scripts and direct launches. Use absolute paths. Directories must exist
and be writable by the runtime user. Keep state outside the checkout/image and
outside the frontend directory. Run with a private umask; never put seeds in build
arguments, an image, shell history, screenshots, or committed files.

For a **new, empty deployment only**, create a private directory owned by the
runtime operator, e.g. `/srv/stateless-reader-state` with mode 0700. This example
creates its seed/config once without printing it, refuses existing database state,
and refuses to overwrite the config. Replace the origin and absolute checkout
path first. It is an operator setup step, not something executed in preparation:

```sh
umask 077
python3 - <<'PY'
from pathlib import Path
import os, secrets
state = Path('/srv/stateless-reader-state')
checkout = Path('/srv/stateless-reader')
origin = 'https://REPLACE_WITH_AUTHORIZED_PUBLISHER_HOST'
assert 'REPLACE_' not in origin, 'Set the authorized HTTPS origin first'
assert state.is_dir(), 'Create the private operator-owned directory first'
assert not any(state.glob('*.sqlite*')), 'Existing state needs its original seed'
fd = os.open(state / 'publisher.env', os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'w') as f:
    f.write(f'PUBLISHER_SEED_HEX={secrets.token_hex(64)}\n')
    f.write(f'DATABASE_PATH={state}/application.sqlite\n')
    f.write(f'COCO_DATABASE_PATH={state}/coco.sqlite\n')
    f.write(f'FRONTEND_DIST_PATH={checkout}/apps/frontend/dist\n')
    f.write(f'PUBLIC_ORIGIN={origin}\nHOST=127.0.0.1\nPORT=3000\n')
PY
# From the publisher checkout; ensure no inherited variables override this file.
bun --env-file=/srv/stateless-reader-state/publisher.env apps/backend/src/db/migrate.ts
bun --env-file=/srv/stateless-reader-state/publisher.env apps/backend/dist/index.js
```

The explicit migration command operates only on application state. Startup also
applies application migrations, and initializes Coco separately. Stop/restart
uses the same command and same private file; do not regenerate the seed. A
supervisor must deliver SIGTERM to Bun and wait for accepted payments to drain.

Dependencies remain pinned at Coco core/Bun **2.0.0** and cashu-ts
**5.0.0-rc.4**. Both Coco packages declare TypeScript `^5`, while the root/backend
use **7.0.2** (frontend uses **6.0.2**). The frozen install here emitted no peer
warning; that does not resolve the declared mismatch. Typecheck/build passing
with `skipLibCheck` is narrower evidence than declared upstream support.

## HTTPS hosting choices (not deployed)

Use one public HTTPS origin for the reader and API, and set `PUBLIC_ORIGIN` to
that exact origin (no path/query/credentials). TLS terminates at the authorized
proxy, which forwards unchanged paths, Authorization headers, and JSON bodies to
Bun. Do not add cookie login, email access gates, or bot interstitials in front of
payment POST/OPTIONS. Do not enable request-body or Authorization logging. The
payment URL itself exposes a public article/key association; redact it from
shared access logs/evidence if that association is unwanted. Disable proxy/CDN
caching of article/payment routes; the app sends `Cache-Control: no-store`.

**Persistent host / Fly option.** `Dockerfile` builds a pinned Bun image containing
only the compiled runtime, migrations, and built frontend. `.dockerignore`
restricts build inputs; runtime state/seed are supplied separately. Copy
`deploy/fly.toml.example` to `fly.toml`, select the authorized app/region, and replace
`PUBLIC_ORIGIN`. A parent/operator must explicitly authorize the following
resource actions before executing them:

1. Select/create the app and **one** `publisher_data` volume in its region. Mount
   it at `/data`, retaining both database files across deployments.
2. Provision the original `PUBLISHER_SEED_HEX` through a private runtime secret
   channel. For Fly, `fly secrets import --stage -a APP` can consume a private file
   containing only that assignment via stdin; do not paste its value into chat or
   a command argument, and do not import host-specific filesystem settings.
3. Validate the edited configuration and build the image. For first deployment,
   `fly deploy -c fly.toml --ha=false` disables the default spare Machine. Inspect
   the resulting Machine count and volume attachment: exactly **one** writer.
   Do not scale out or use blue/green or canary deployments.
4. Fly terminates HTTPS on public port 443 and forwards to `0.0.0.0:3000`; health
   checks use `/health`. Its success checks SQLite connectivity, not mint health,
   seed correctness against existing funds, or a completed payment.
5. For updates, pause the demo and wait for wallet operations to finish before
   stopping the old process. Confirm it exited before bringing up a replacement
   on the retained volume. The configured 300-second platform kill timeout is
   finite; it is not a guarantee that a stalled mint operation will finish.

There is intentionally no Fly `release_command`: release Machines do not mount
application volumes. Migrations run in the actual publisher process with its
volume. Volume backups and a separately protected seed are still required.
See [Fly app configuration](https://docs.fly.io/reference/configuration) and
[volume persistence](https://docs.fly.io/launch/volume-storage). Docker is not
installed in the preparation environment; the Docker build/deploy is pending.
The compiled runtime layout was exercised independently without `node_modules`.

**Temporary HTTPS / Cloudflare option.** If installation/exposure is authorized,
start the built publisher on loopback, then run
`cloudflared tunnel --url http://127.0.0.1:3000`. Record its temporary HTTPS URL,
stop the publisher gracefully, update `PUBLIC_ORIGIN` privately to that URL,
and restart the publisher while leaving the tunnel running. Only then create
payment requests. A changed tunnel URL requires updating the origin and reopening
payment panels to obtain new requests. Keep databases/seed on durable local disk.
This is temporary exposure, not durable hosting; no tunnel was started here.
[Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)
have changing hostnames and no uptime guarantee. They must remain available to
the external wallet. An authenticated browser-only gate would block wallet POSTs.

Do not assume a private tailnet address or an installed Tailscale client supplies
public HTTPS. Do not expose the T3 control service as the publisher.

## Wallet and current mint preflight

Source-compatible target: **Cashu.me tag `0.3`, commit
`f14b942ea3795a0396ca7ddea19e25a4a7f882be`, released 2026-06-11**.
This is a candidate for the live run, not an observed successful wallet payment.
Its `package.json` version `0.0.1` does not identify the release. The hosted wallet
at `wallet.cashu.me` was not proven to run this commit. Use a verifiably pinned
wallet or record its actual deployed build as a different test target.

To build the pinned wallet on an authorized operator machine, use Node >=22.4.0:

```sh
git clone https://github.com/cashubtc/cashu.me.git cashume-demo
cd cashume-demo
git checkout --detach f14b942ea3795a0396ca7ddea19e25a4a7f882be
git rev-parse HEAD
npm ci
npm run build:pwa
```

Serve `dist/pwa` through an authorized HTTPS static host with the wallet's history
fallback, preferably using a fresh browser profile to avoid an older service
worker. Retain the release's package-lock; do not silently regenerate dependencies
if installation fails. That wallet build/hosting step has not been executed here.
[Release](https://github.com/cashubtc/cashu.me/releases/tag/0.3),
[package](https://github.com/cashubtc/cashu.me/blob/f14b942ea3795a0396ca7ddea19e25a4a7f882be/package.json),
[HTTP sender](https://github.com/cashubtc/cashu.me/blob/f14b942ea3795a0396ca7ddea19e25a4a7f882be/src/stores/payment-request.ts#L293).

Add the exact mint URL `https://mint.minibits.cash/Bitcoin` to the wallet before
pasting/scanning a request; select **sat**. Obtain authorized real sat ecash there
sufficient for both article prices (currently 21 + 34 = 55 sat for the first two),
and any wallet-side funding/send costs. No funds have been supplied or spent.
Reader recovery phrases and Cashu wallet phrases must remain separate.

Immediately before paying, GET and retain only public metadata:

```sh
date -u +%FT%TZ
curl --fail --silent --show-error https://mint.minibits.cash/Bitcoin/v1/keysets
curl --fail --silent --show-error https://mint.minibits.cash/Bitcoin/v1/info
```

The [2026-10-27 13:38 UTC observation](../evidence/issue-7/minibits-metadata.json)
reported three sat keysets, all `input_fee_ppk: 0`, and `cdk-mintd/0.17.7` with
NUT-12 support. The active keyset has a full v2 ID, which the pinned wallet source
handles. Recheck **every applicable input keyset**, including inactive ones the
payer may hold. If any applicable input fee is nonzero or metadata is unavailable,
stop the live demonstration and record the mismatch; do not add fee handling or
assume an earlier observation is current. No public GET proves spendability.

## Check the deployed HTTP contract without funds

Set `PUBLISHER_ORIGIN` to the actual HTTPS origin and `WALLET_ORIGIN` to the actual
wallet origin. The fixed public test key below is non-secret compatibility-vector
data. Empty `{}` is intentionally invalid and cannot spend funds:

```sh
PUBLISHER_ORIGIN=https://REPLACE_WITH_AUTHORIZED_PUBLISHER_HOST
WALLET_ORIGIN=https://REPLACE_WITH_ACTUAL_WALLET_HOST
payment_path=/payment/the-quiet-web/360fc8d6daaa8ef054dbd8a3721cd3237f863dc9b9cc87f6df596abdfdde8dfb
curl --fail --silent --show-error "$PUBLISHER_ORIGIN/health"
curl --fail --silent --show-error "$PUBLISHER_ORIGIN/articles"
curl --silent --show-error -i -X OPTIONS "$PUBLISHER_ORIGIN$payment_path" \
  -H "Origin: $WALLET_ORIGIN" -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type'
curl --silent --show-error -i "$PUBLISHER_ORIGIN$payment_path" \
  -H "Origin: $WALLET_ORIGIN" -H 'Content-Type: application/json' --data '{}'
```

Expected: health/catalogue 200 JSON; OPTIONS 204 with allow-origin `*`, methods
`POST, OPTIONS`, headers `Content-Type`; invalid POST 400 JSON **with CORS on the
error too**. No credentials/cookies are required. Cross-origin reader GETs are
not the design: the reader uses the same origin. Verify the actual wallet's
browser preflight too; curl alone does not enforce browser CORS or prove reachability
from a wallet device. Verify the QR decodes to `creqA`, contains only `post`
transport, and targets the **public HTTPS** `/payment/{articleId}/{publicKey}`.

## LIVE sequence — every step below is still pending

Record UTC time, publisher commit/image digest, wallet commit/build and origin,
browser versions, HTTPS publisher origin, configured mint/unit, rechecked fees,
and the results below. Keep only statuses, timings, amount totals and redacted
article/key aliases. Do not save request bodies, Authorization headers, QR/text
payloads, HAR files, wallet console logs, seeds or recovery phrases. In particular,
the pinned Cashu.me sender logs a token to its console. Do not export that console
or record a screen showing it. Playwright traces are for disposable deterministic
tests only; never run that trace configuration with a real wallet or reader phrase.

1. Visit the public catalogue in browser A. Create a new reader phrase, privately
   back up twelve words, then hide the phrase. Select **The quiet web** (21 sat).
   A fresh signed GET must return 402 and open its QR/copyable request. Label its
   public key **A1** in the private operator notes; it is not a wallet credential.
2. Scan or paste the request into the pinned, funded wallet. Confirm mint/unit,
   price, HTTPS target, and authorization to spend. Pay once. Observe wallet POST
   200 JSON `{status:"paid",...}` and the reader's fresh signed polling change
   from 402 to 200/full article. Wallet-side success alone is insufficient evidence.
3. Close/reopen the article and read again: signed GET 200 without another POST.
   Select **A library in your pocket** (34 sat). It must still return 402; label
   its different key **A2** and record `A1 != A2`. Pay its separate request once;
   observe a second POST 200 and polling-to-content. Do not pay a request twice.
4. Lock or reload browser A; it must require restoration. In a **fresh browser B
   or clean profile**, restore the same twelve words privately. Restoration must
   not scan purchases. Open the two articles individually: both return 200 with
   the corresponding original key, with no wallet payment. A third unpurchased
   article remains 402. Optionally verify a different generated phrase gets 402
   for the first article without paying.
5. After all requests settle, close payment panels and stop Bun gracefully with
   SIGTERM/SIGINT. Wait for exit; preserve the two files and publisher seed. Take
   the stopped backup described below. Restart the exact build/config, restore
   the reader if necessary, and reopen both articles: 200 without repayment.
6. Verify Coco's retained balance before/after a normal restart using its public
   balance API, while the HTTP process is stopped (example below). Record only
   sat totals. An empty publisher should have gained 55 sat for exact-price
   purchases; overpayment is retained, so record actual submitted totals.
7. Record every observed failure and fix with commit/version and rerun affected
   checks. Until the wallet POST, polling, independent purchases, recovery and
   normal restart above are actually observed, leave #7 explicitly incomplete.

## Balance, stopped backups and restoration

Use `openCocoSettlement(...).balance()` (Coco `wallet.balances.total`) rather than
SQL over wallet tables. With the HTTP publisher **stopped**, run from the checkout
using its same private environment file. This prints amounts only, and hides
underlying errors which could include proofs. Initialization may resume Coco
operations; do not run it concurrently with the publisher or treat it as a
read-only repair tool for an interrupted payment:

```sh
bun --env-file=/srv/stateless-reader-state/publisher.env -e '
import { openCocoSettlement } from "./apps/backend/src/coco.ts";
let wallet;
try {
  const secret = process.env.PUBLISHER_SEED_HEX;
  if (!secret || !/^[0-9a-fA-F]{128}$/.test(secret) || !process.env.COCO_DATABASE_PATH) throw Error();
  const seed = Uint8Array.from(Buffer.from(secret, "hex"));
  try { wallet = await openCocoSettlement({ databasePath: process.env.COCO_DATABASE_PATH,
    mint: "https://mint.minibits.cash/Bitcoin", seed }); } finally { seed.fill(0); }
  const b = await wallet.balance();
  console.log(JSON.stringify({ unit: "sat", spendable: b.spendable.toString(),
    reserved: b.reserved.toString(), total: b.total.toString() }));
} catch { console.error("Balance inspection failed; no secrets logged."); process.exitCode = 1; }
finally { try { await wallet?.close(); } catch { console.error("Wallet close failed."); process.exitCode = 1; } }
'
```

After graceful shutdown and balance-tool exit, privately copy the **whole state
directory**, including any SQLite WAL/SHM/journal sidecars still present, and the
matching publisher seed/config. Record the publisher SHA and fixed protocol
version alongside the protected backup. Keep an encrypted backup outside the
host and protect access; databases contain spendable funds and grant associations.
Do not commit or attach the backup. Do not copy only the main SQLite files from
a running publisher. Do not delete sidecars by hand.

For a routine move/restoration, stop all writers, restore that latest consistent
stopped snapshot to the operator-owned private paths, supply the same seed and
compatible build/migrations, then start one process. Verify health, balances and
signed reads. Never run both the old and restored copies. An outdated wallet
snapshot is not a guarantee of fund recovery or safe counter reuse. Publisher
data loss, wallet disaster recovery, and paid-but-ungranted repair are not solved
by the reader's phrase or this runbook. Normal restart is reopening retained state,
not Coco `wallet.restore()` or a mint scan.

## Expected failures and limits

- Unknown article/path: 404 JSON. Missing, malformed, wrong-article or stale
  signature: 401 without content. Valid unpaid signature: 402 offer. Keep client
  and publisher clocks synchronized; replay inside the inclusive 60-second window
  is intentionally accepted.
- Malformed/wrong mint/unit/underpaid payload: 400, before redemption. Wrong
  content type: 415. Oversized body: 413. An already-granted pair: 409 before
  another redemption (malformed payloads can fail validation first).
- Invalid/spent/unredeemable proofs or unsuccessful settlement: 422 without a
  grant. Unsupported fees/unavailable settlement/draining: 503. A timeout or
  ambiguous failure does not prove proofs remain spendable: do not blindly pay
  again. Underlying mint errors are deliberately not printed.
- Closing a payment panel/locking stops reader polling, not a wallet payment
  already sent. Reopen with a fresh signature to discover a completed grant.
  Exact price or more is accepted; excess stays with the publisher, no refunds
  or change. Cashu.me may show a generic HTTP failure; retain the status only.
- Grants and publisher funds persist. The mint swap and application grant write
  are **not atomic**. A crash after swap can leave payment received without access;
  Coco's startup recovery does not reconcile missing application grants. There
  are no distributed locks or guarantees for multiple publisher processes.
- No publisher accounts, stored unpaid checkouts or common article key across
  different articles. Repeat reads of one article remain recognizable; payment
  binds to article/public key. The derivation has no publisher namespace, so the
  same phrase/article ID at another publisher produces the same key. Network,
  browser and payment correlation, malicious frontend code, and anonymity are
  outside the privacy promise.
- The reader keeps secrets only in tab memory; JS cannot guarantee erasure of
  every copy. Losing the phrase loses access; sharing it shares access. A phrase
  cannot restore deleted publisher grants. Article corrections retain the same
  identity/grants; never reuse an ID for unrelated content.
