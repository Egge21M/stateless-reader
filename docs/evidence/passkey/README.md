# Passkey deployment — 2026-10-27

Deployed and verified at <https://stateless-reader-egge21m.fly.dev>.

- Source: `849e0c2b404e994d6555f5e387d6f5661ca95381`.
- Image: `registry.fly.io/stateless-reader-egge21m@sha256:e9d0f6b73f1a174569252fcefaa6d7d8ce0b08f7e0c94b4a1a98a860700ab0dd`.
- Fly deployment tag: `deployment-01M5Z81V23JKXRZNBMZ2KY3MB6`.
- Updated at 17:56:23 UTC; one Machine `d8911675b26578`, version 4, in `fra`, started with its health check passing.
- Retained encrypted volume `vol_v3gxkn2y12w90zw4` (`publisher_data`, 1 GB), attached to the same Machine. No application migration, secret rotation, or scaling change.
- Remote build used Bun 1.3.14 and `bun install --frozen-lockfile`. Deployment used `--remote-only --ha=false --strategy immediate`. Pre-existing untracked research notes were excluded by the Docker context allowlist; all runtime source was committed.

## Automated verification

Typecheck, lint, workspace build, and 56 backend/core tests passed. The new derivation matches an independent Python HKDF/BIP39/Ed25519 vector. All 38 production Playwright tests passed, including existing purchase/recovery regressions and nine passkey scenarios. Development tests initially exposed a stale copy assertion and the native WebAuthn test's unsupported numeric RP hostname; after using localhost and updating the assertion, all affected tests passed.

Passkey coverage includes missing/malformed PRF output, cancellation without credential creation, explicit creation followed by PRF assertion, abort and stale-result handling, native Chromium PRF creation/discovery/reload, fake-mint paid access with the same credential, and independent phrase recovery in a fresh browser. Phrase-only readers remain compatible. Browser tests do not retain phrase-bearing traces.

## Deployed HTTPS verification

[Sanitized results](live-check.json) were recorded using Chromium 156.0.8078.4 and an ephemeral PRF-capable virtual authenticator. Root and health returned 200; the served bundle was `/assets/index-DXAHpaiL.js`, matching the tested build. Native creation succeeded, rediscovery after reload reproduced the phrase, and recovery in a fresh context reproduced the same article public key. An unpaid request correctly returned 402. No app storage, cookies, page errors, or POST requests were observed. Desktop and mobile profile layouts were inspected; mobile had no horizontal overflow.

No real money was spent and no live purchase was performed. Native WebAuthn was exercised, but this does not verify Apple/Google/third-party passkey synchronization, physical authenticators, or cross-device transport. Keep the phrase backup until the user's provider/device combination has been checked. A newly created passkey represents a separate reader and does not migrate previous purchases.
