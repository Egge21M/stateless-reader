# Passkey-only deployment — 2026-10-27

Deployed source `0ea8503ff841965b3c00856989c44f70f4a4d69a` to
<https://stateless-reader-egge21m.fly.dev>. This intentionally replaces the
phrase-compatible reader with direct PRF → HKDF seed derivation, without
migrating previous reader keys or purchases. BIP39 APIs, dependency/lock entries,
word list, import/export controls and phrase-only tests were removed; purchase,
privacy and cancellation coverage now uses passkeys.

- Image: `registry.fly.io/stateless-reader-egge21m@sha256:f8b82483e71810a464c6f54da10f514e44e4bf995a2b06c9395ebc8d2f21c4cd`.
- Tag: `deployment-01M5ZBD8039RQTCD69PKVYXGKP`.
- Machine: `d8911675b26578`, version 5, `fra`, started at 18:54:57 UTC with its health check passing.
- Same encrypted volume `vol_v3gxkn2y12w90zw4`, no migrations, secret changes or scaling.
- Frozen Bun 1.3.14 remote build; `--ha=false --strategy immediate`. Pre-existing untracked research notes were excluded from the build context.

Typecheck, lint and workspace builds passed. All **55 backend/core tests** and
**34 production-browser tests** passed. Fixed vectors use an independent Python
HKDF/Ed25519 implementation. Native Chromium WebAuthn with a PRF-capable virtual
authenticator recovers paid access after lock and reload; fresh-context tests
model the same provider secret and retain two independent grants, unrelated
reader denial, no app credential storage and stale-response coverage.

[Live HTTPS checks](live-check.json) verified the tested bundle
`/assets/index-B_BsaEi3.js`, root/health 200, passkey-only controls, native creation,
and identical article public keys after reload. Unpaid access returned 402.
No persistent app storage, cookies, page errors or POST requests were observed.
The mobile profile had no horizontal overflow and its layout was inspected.

No real payment was performed. Physical authenticator, Apple/Google/third-party
sync and cross-device PRF compatibility remain unverified. Return now depends
solely on the same credential, RP hostname and provider PRF output; no phrase
fallback remains. Earlier deployment records describe historical releases.
