# Passkey-derived reader v2

This is the current reader seed derivation. It intentionally replaces passkey v1 and phrase recovery, with no migration of earlier reader keys or purchases. The publisher still receives only article-specific signed requests under [article/request v1](reader-v1.md). WebAuthn credentials, assertions, user handles, PRF outputs and reader seeds remain local.

## Exact derivation

1. Use a discoverable WebAuthn credential, scoped to `location.hostname` as its RP ID. Creation requests `residentKey: required`, `userVerification: required`, `attestation: none`, a random 32-byte user ID, and the label `My reader`. Assertions also require user verification.
2. Request `extensions.prf.eval.first = UTF8("stateless-reader/passkey/v2")`. This is the input to the WebAuthn PRF extension: the browser applies the extension's specified input hashing. Do not prehash it or pass it directly to CTAP hmac-secret. Require exactly 32 bytes in `getClientExtensionResults().prf.results.first`.
3. Derive the **64-byte reader seed directly** with HKDF-SHA256: IKM = PRF output, salt = `UTF8("stateless-reader/passkey-seed/v2")`, info = `UTF8("reader-seed")`, length = 64. Strings have no BOM, terminator or newline. There is no mnemonic or password-based KDF.
4. Apply unchanged article-key and request-signature v1 to this seed. The longer HKDF output does not increase the PRF's entropy.

Each ceremony uses a fresh random 32-byte challenge generated client-side. Challenges, credential IDs, signatures, user handles and device metadata never enter the derivation. This is local secret release through the browser/authenticator, not server login authentication. The signed article request proves possession to the publisher.

[Public test vectors](../../packages/core/test-vectors/passkey-v2.json) and their [independent Python oracle](../../packages/core/test-vectors/derive-passkey-v2.py) freeze PRF bytes `00..1f`, the resulting seed and an article public key.

## Entry and lifecycle

“Continue with passkey” calls `credentials.get` with no stored credential allowlist. Discovery and optional other-device choices are handled by the user's provider. Failure or cancellation leaves the reader locked; it never automatically creates another credential. Creation requires an explicit “Create a new reader” action.

If creation returns only `prf.enabled`, request a further assertion restricted to the newly created credential, with the same PRF input. An interrupted or unsupported creation may leave a credential in the provider; retry Continue before creating again. Missing or malformed PRF output must not fall back to another seed source.

The app has no phrase creation, import, export or backup controls. It stores no cookies, localStorage, sessionStorage, IndexedDB, cache entries, server recovery records or credential IDs. Active seeds live in tab memory. Lock, cancellation, profile dismissal during unlock and unmount abort pending work and invalidate stale results. Mutable secrets are overwritten where possible; JavaScript/browser memory erasure cannot be guaranteed.

Returning requires the same credential, RP hostname and PRF output. Creating another passkey creates another reader. The provider may sync the credential, but physical devices, cross-device transport, and Apple/Google/third-party synchronization require live compatibility testing. There is no app-assisted recovery if the credential is lost or its PRF secret becomes unavailable. No relays or publisher identity service are involved.

## Verification

Core tests compare the direct derivation with an independent Python implementation. Browser tests cover provider errors, cancellation, explicit creation, aborts/stale results, native Chromium PRF creation and repeat access after lock/reload, and real publisher/fake-mint purchases. Fresh-context purchase tests model the same provider PRF result; they do not establish real provider synchronization support.
