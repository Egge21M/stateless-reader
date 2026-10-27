# Personal Fly deployment — 2026-10-27

**Deployed and checked; live wallet payments/recovery remain pending.**
This updates the preparation-only status in the original evidence record.
The wallet operator confirmed a funded wallet and will operate it personally.
No wallet secrets, proofs, reader phrases or authorization headers are recorded.

- Origin: https://stateless-reader-egge21m.fly.dev
- Fly app/organization: `stateless-reader-egge21m` / `personal`.
- Publisher/config commit: `c8f31ff23cfd4ceebab8e6b74b1d868f03b608d4`.
- Runtime image: `registry.fly.io/stateless-reader-egge21m@sha256:8bc62a918551bfd2d5b84ee6939baa3b47939e2d9593d84132e58b37bfd792ba`.
- One Machine `d8911675b26578`, Frankfurt (`fra`), shared CPU, 512 MB RAM.
- One encrypted 1 GB volume `vol_v3gxkn2y12w90zw4`, mounted at `/data`, with
  automatic snapshots enabled. Separate application and Coco SQLite files.
- Stable publisher seed privately provisioned as a Fly runtime secret. A private
  local backup exists outside the repository; its value is not part of the build.

The remote Docker build passed. Maintenance configuration started one Machine
without a publisher listener. The explicit compiled migration completed on its
mounted volume, then the server configuration deployed the same immutable image.
The health check passed and the volume remained attached to the same Machine.
Root `fly.toml` and `fly.migrate.toml` contain the concrete deployment settings.

Both final review findings are resolved: `ArticleOffer` is shared, and application
migrations execute separately from startup. Final local validation passed 39 Bun
tests (507 assertions), 23 development browser tests, 23 production browser tests,
typecheck, build and lint. A compiled-runtime test also checked explicit migration
and retained purchased access through restart.

## Public HTTPS checks

Observed at **2026-10-27 14:02 UTC**, without real payments:

- Health and catalogue: 200 JSON, six public articles, no premium bodies.
- Unsigned article: 401; valid public test-vector signature: 402.
- Decoded NUT-18 request targets the deployed HTTPS payment endpoint.
- Payment OPTIONS: 204 with CORS; invalid empty POST: 400 JSON with CORS.
- Requests for backend source, database paths and `.env`: 404.
- Current Minibits keysets: three sat keysets, all `input_fee_ppk: 0`, including
  active `01fc0ec0e59cd6fa01b7a88f8cd77fce81fd1e64bca67d752e984992b7a3c3a821`.

At **14:03 UTC**, Chromium `156.0.8078.4` loaded the deployed reader, rendered all
six articles, restored a public compatibility-test identity, showed the unpaid
QR/copy panel, and cleared it on lock. No page errors occurred. No payment was
submitted. T3 preview could not start its sandbox as root, so the permitted
Playwright fallback was used without traces or secret-bearing screenshots.

## Still required for #7

Record the operator's actual wallet/build, both real purchases and polling-to-read
transitions, repeat reads, and fresh-browser recovery of both purchases. Then
perform a coordinated normal publisher restart and confirm retained access and
Coco balances through its public API. The operator has been given the live URL
and the first two article prices (21 and 34 sat). Keep #7 and parent #1 open until
these observations are complete. Public smoke checks do not establish external
wallet interoperability.
