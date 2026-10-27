# #7 preparation evidence — LIVE demonstration pending

**Deployment update:** the reviewed implementation is now deployed to personal
Fly. See [deployment and public HTTPS evidence](fly-deployment.md).
The user subsequently confirmed Macadamia receives HTTP 415 and reported generic
delivery failures from Cashu.me/CDK. The earlier phrase “it does work” is ambiguous:
no successful wallet/build, purchase, or restoration has been identified.
See [Macadamia Content-Type fix and local regression evidence](macadamia-content-type.md).
Live wallet acceptance remains pending. The following is the earlier preparation snapshot.

Validation date: **2026-10-27 UTC**. This record does **not** complete #7.
No external wallet payment, deployment, resource provisioning, account creation,
or expenditure occurred. No funded wallet was supplied; the parent request for
live prerequisites remained unanswered during implementation.

## Identified builds and configuration

- Implemented publisher commit: **`f3ce50da57f1667609a8af5b336d8c475e55c06b`**
  (`feat: prepare reproducible HTTPS wallet demo for #7`). Subsequent evidence-only
  commits do not change this publisher implementation. For any later integrated
  live run, record the actual deployed full SHA/image digest again.
- Isolated branch: `feat/prepare-live-wallet-demo`.
- Integration base: `0654c5c05ecbc84615ee5017d2664bc88e9d1600`, verified with
  `git merge-base --is-ancestor` before implementation. Integration remained at
  that tip during preparation; the implementer merges its latest tip before return.
- Bun **1.3.14**; frozen `bun.lock`; Coco core and Bun SQLite adapter **2.0.0**;
  cashu-ts **5.0.0-rc.4**. Root/backend TypeScript **7.0.2**, frontend **6.0.2**.
  Coco declares TypeScript `^5`; this peer mismatch remains. This install emitted
  no warning. Passing builds with `skipLibCheck` do not establish upstream support.
- Configured live mint: `https://mint.minibits.cash/Bitcoin`; unit **sat**.
- Chosen source-compatible wallet candidate: Cashu.me tag **`0.3`**, full commit
  **`f14b942ea3795a0396ca7ddea19e25a4a7f882be`**, released **2026-06-11**.
  Its HTTP JSON sender and full keyset ID decoding were source-verified in the
  supplied research. Live compatibility remains unverified. The currently hosted
  `wallet.cashu.me` build was not established as this release.
- Deployed publisher origin/image digest and observed wallet build: **PENDING**.

Local built-artifact SHA-256 values (Bun build, not a deployed image):

```text
18851b2f5a27b87d276c5a6e8783cd2957057a9751e55b26580b19db0e2f80c4  apps/backend/dist/index.js
81d43a067a72751627c11a29abf28b6c41a3e09e3f363bc1ee58ca1687f738eb  apps/frontend/dist/index.html
```

The frontend HTML references its hashed JS/CSS/font assets; those must travel
with the build. These are artifact identifiers, not evidence of a live purchase.

## Public Minibits observation

Read-only primary-source GETs began at **2026-10-27T13:38:09.628843+00:00**.
Both `/v1/keysets` and `/v1/info` returned HTTP 200. The timestamp is the observer's
request time; the info body also supplies its own mint timestamp. Full non-secret
responses are in [minibits-metadata.json](minibits-metadata.json).

All listed keysets use sat and reported `input_fee_ppk: 0`:

- `00107937db0cc865` — inactive.
- `01fc0ec0e59cd6fa01b7a88f8cd77fce81fd1e64bca67d752e984992b7a3c3a821` — active.
- `00500550f0494146` — inactive.

Info reported `cdk-mintd/0.17.7` and NUT-12 support. No mint/swap/melt/quote request
was made against Minibits. Zero fees were observed, not guaranteed for a later
payment; recheck all applicable input keysets immediately before the live run.
A changed fee invalidates this POC's assumption and must be reported.

Sources: [Minibits keysets](https://mint.minibits.cash/Bitcoin/v1/keysets),
[Minibits info](https://mint.minibits.cash/Bitcoin/v1/info).
The sandbox could not resolve Minibits; the approved read-only network retry
succeeded with TLS verification enabled. No managed network-policy/credential
readiness claim is made: its policy file and runtime-status tool were unavailable.

## Implemented and observed locally

The deployment gap was a missing production frontend server. The publisher now
optionally loads the Vite build via `FRONTEND_DIST_PATH` and serves `/` plus its
regular, allowlisted asset files on the API listener. Private paths, symlinks,
source, and API errors do not fall back to the HTML shell. CLI startup wires that
configuration, preserves migrations, and retains graceful signal handling.

TDD used the already approved public HTTP seam:

1. New production-shell test failed with **expected 200, received 404** before
   static hosting was implemented; then passed with public/private path checks.
2. Existing operator signal tests were extended with the configured frontend;
   both SIGINT/SIGTERM cases failed with **expected 200, received 404** before the
   environment wiring, then passed. A sandbox listener denial was retried outside
   the sandbox and was not counted as the red behavior evidence.

Automated checks passed on the implementation:

- `bun install --frozen-lockfile`.
- `bun test`: **38 passed, 0 failed**, including HTTP, compatibility vectors and
  actual Coco settlement/retention/restart against valueless local mint proofs.
- `bun run test:browser`: **23 passed** with the existing Vite development harness.
- `bun run test:browser:production`: **23 passed** with built assets served directly
  by the publisher. These are the same acceptance cases in a second hosting mode,
  including two independent purchases, fresh restore, polling and secret handling.
- `bun run typecheck`, `bun run build`, `bun run lint`, `git diff --check`: passed.
- Fly example parsed as TOML. **Docker image build and Fly deployment were not run**;
  no Docker executable is available in this environment.

A separate local smoke copied only backend `dist/`, sibling `drizzle/`, and
frontend `dist/` into a temporary directory with **no node_modules**, using temporary
application/Coco files and a valueless dummy publisher seed. On first start and
normal restart, the compiled CLI produced these observed outcomes:

```text
GET /                          200 HTML referencing built assets
GET /health                    200 JSON
GET /articles                  200 JSON
OPTIONS /payment/<test pair>   204, Access-Control-Allow-Origin: *
POST /payment/<test pair> {}    400 JSON, Access-Control-Allow-Origin: *
SIGTERM                        exit 0, no stderr
```

This smoke verifies bundled migration-path resolution, runtime packaging layout,
CORS/JSON and graceful reopening. It did not submit valid payment proofs and did
not demonstrate real received funds. The deterministic Coco tests establish
normal fund retention using only a controlled local mint.

This is historical evidence for the preparation build identified above. The
review fix for #1/#2 separates application migration from startup: current builds
ship `dist/migrate.js`, which must run explicitly against retained application
state before serving it. Follow the updated [runbook](../../demo/live-wallet.md),
not the original build's implicit migration behavior. Coco's separate automatic
wallet migrations and the pending live checks below are unchanged.

No live-wallet-specific interoperability fix is claimed: the changes above are
operator-path support, and the existing HTTP payment contract remains intact.

## Remaining live prerequisites and checks

The [runbook](../../demo/live-wallet.md) gives concrete commands/configuration and
explains database ownership, private seed provisioning, backup/restoration,
privacy limits, crash gap and expected failures. The parent/operator must supply:

1. An authorized public HTTPS deployment or temporary tunnel. Provision durable
   application/Coco storage and the stable publisher seed privately, configure
   the actual public origin, and keep exactly one publisher process. For Fly,
   validate/build the container and attach one volume. Neither hosting path was
   provisioned here.
2. An identified compatible external wallet build with authorized real Minibits
   sat ecash. The first two fixture prices total 55 sat, plus any wallet-side costs.
   The implementer has no authorization to spend, wallet funds, or wallet secrets.
3. A wallet operator/browser and a second fresh reader browser/profile to perform
   the real sequence. Keep phrases/proofs/Authorization headers out of screenshots,
   HARs, logs, traces and committed evidence; Cashu.me's console can print tokens.

Explicitly **PENDING / NOT PERFORMED**:

- [ ] LIVE public HTTPS reachability and CORS from the actual wallet origin/device.
- [ ] LIVE first QR/paste → wallet HTTP POST → reader polling to full content.
- [ ] LIVE repeat reading without another payment.
- [ ] LIVE independent second article payment with a distinct article key.
- [ ] LIVE fresh-browser phrase restoration and both articles read without payment.
- [ ] LIVE normal publisher restart, retained access, and Coco public balance totals.
- [ ] Record actual publisher/wallet builds, UTC time, observations and any fixes.

The paid-but-ungranted crash gap, publisher data loss recovery, distributed
writers, withdrawal UI and general fee handling remain outside the POC. Do not
close #7 or describe the live demonstration as successful from this evidence.
