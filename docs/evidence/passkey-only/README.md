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

## Login entry simplification — 19:36 UTC

Source `3df12099243114f5187209e5323d44879f4416a5` renames the primary action to
**Login with passkey** and presents **First time? Create a reader** as a small
link-style button only after an unsuccessful attempt. Credential creation
remains explicit; derivation and cancellation behavior are unchanged.

Deployed image `registry.fly.io/stateless-reader-egge21m@sha256:2ddf9d27d7db5a2ba189f3138b26b6f8cd4abfa728dd486b887511e17c9b7e54`,
tag `deployment-01M5ZDS31XCS4D6KW9EEAJS90J`, on the same Machine (version 6),
healthy at 19:36:40 UTC. Typecheck, lint and the nine production passkey browser
tests passed. [Live checks](login-entry-live-check.json) confirmed the tested
bundle, native creation and same-key rediscovery after reload, no payment POSTs,
and empty app credential storage. The mobile fallback link was visually checked.

## First-visit creation — 19:40 UTC

Source `f54a779427357c3e5f1275ad4e6182cdb492b3b5` removes the failed-login
prerequisite. The small **First time? Create a reader** link is visible directly
below **Login with passkey** on first visit. Both actions are disabled during a
pending ceremony; creation remains explicit and does not follow cancellation.

Deployed image `registry.fly.io/stateless-reader-egge21m@sha256:5004444203f3eff3b0b3eff9ad7ceba0cea1b88ded156fca74991ed7d8dfefd3`,
tag `deployment-01M5ZE0CZ8FCBYFNQ762Y5SHQE`, on the same Machine (version 7),
healthy at 19:40:14 UTC. Typecheck, lint and all nine production passkey tests
passed. The native WebAuthn test now creates directly on first visit with no
mocked or failed discovery request. [Live checks](direct-create-live-check.json)
confirmed direct native creation, same-key recovery after reload, mobile layout,
no app credential storage and no payment POSTs.
