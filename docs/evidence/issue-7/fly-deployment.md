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

## Editorial and wallet compatibility release — 14:39 UTC

Deployed publisher commit `43542274c17a8a53ee05f60a7567f7e1e0531247` using
`registry.fly.io/stateless-reader-egge21m@sha256:14ab24147940dab07615c74208045217e77e6d8843ed9a3ad0551d9912489b85`.
The remote Docker build succeeded. The same Machine and encrypted volume remain
attached; no schema change or seed replacement was needed. Fly health is passing.

The editorial layout now contains reader creation, recovery, backup and locking
inside a profile dialog. Payment QR/copy controls appear in a separate accessible
dialog; closing it cancels polling. Successful access returns focus to the article.
Desktop, mobile, dark-mode and payment screenshots were visually reviewed, along
with a fresh screenshot of the deployed catalogue.

This release also includes the [Macadamia header compatibility fix](macadamia-content-type.md)
and [verified CDK compatibility fixes](cdk-interop.md). JSON payment bodies may omit
Content-Type or use the evidenced Foundation default. NUT-18 transport tags are
an empty array, and optional payment metadata permits null. Validation and
settlement requirements remain intact. CDK parser/client reproduction passes;
the controlled client reaches disabled-settlement 503, which is not a payment.
Cashu.me's reported delivery failure remains unreproduced.

Integrated validation passed **54 Bun tests (951 assertions), 29 development and
29 production browser scenarios**, lint, typecheck, build and whitespace checks.
The original 23 browser scenarios remain covered.

Fresh public HTTPS checks at **14:39 UTC** passed without funds or Cashu proofs:

- Health/catalogue 200, six articles without premium bodies, unsigned access 401,
  and signed unpaid access 402.
- Decoded payment requests bind the HTTPS origin and include empty transport tags.
- Payment preflight 204; empty JSON bodies return 400 with CORS for JSON, absent,
  and Foundation-default Content-Type, confirming they reach JSON validation.
- Backend source, database paths and `.env` return 404.
- All three Minibits sat keysets still report zero input fees.
- Chromium `156.0.8078.4` rendered the editorial catalogue, restored a public test
  identity inside Profile, opened and dismissed the payment dialog, and locked
  the reader without page errors. No live payment was performed.

The Playwright fallback was used because T3's browser cannot start its sandbox
as root. No traces or secret-bearing screenshots were captured. Existing saved
payment requests do not gain the CDK encoding correction; generate a fresh request
from the updated site when retesting.

## Still required for #7

Record the operator's actual wallet/build, both real purchases and polling-to-read
transitions, repeat reads, and fresh-browser recovery of both purchases. Then
perform a coordinated normal publisher restart and confirm retained access and
Coco balances through its public API. The operator has been given the live URL
and the first two article prices (21 and 34 sat). Keep #7 and parent #1 open until
these observations are complete. Public smoke checks do not establish external
wallet interoperability.
