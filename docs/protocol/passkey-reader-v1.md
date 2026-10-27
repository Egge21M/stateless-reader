# Passkey-derived reader v1

This is a local recovery adapter for [reader v1](reader-v1.md), not server authentication. The publisher still receives only article-specific signed requests. No credential registration, assertion, public key, user handle, PRF output, mnemonic, seed, or recovery blob is sent to the publisher.

## Frozen byte encoding

1. Use a discoverable WebAuthn credential, scoped to the current `location.hostname` as its RP ID. Creation requests `residentKey: required`, `userVerification: required`, `attestation: none`, and a fresh random 32-byte user ID. Assertions also require user verification. The display label is `My reader`; it is not an identity input.
2. Pass `extensions.prf.eval.first = UTF8("stateless-reader/passkey/v1")` on both creation and assertions. This is the input to the **WebAuthn PRF extension**, not the raw CTAP hmac-secret input: the browser performs the WebAuthn-defined input hashing. Do not prehash it. Require a 32-byte `getClientExtensionResults().prf.results.first` output.
3. Apply HKDF-SHA256 to that output: salt = `UTF8("stateless-reader/passkey-seed/v1")`, info = `UTF8("BIP39/english/128")`, output length = 16 bytes. Strings have no terminator, newline or BOM.
4. Encode those 128 bits of entropy as the standard English twelve-word BIP39 mnemonic, with its checksum. Apply existing BIP39 seed conversion with an empty passphrase, then unchanged reader-v1 article derivation and signatures.

Fresh random 32-byte WebAuthn challenges are generated client-side for each ceremony. Challenges, credential IDs, user handles, signatures, and device metadata never enter the seed derivation. The challenge is not a server authorization proof; the browser/authenticator boundary releases the local PRF secret after user verification. Existing signed article requests authenticate to the publisher.

The [public vector](../../packages/core/test-vectors/passkey-v1.json) fixes PRF bytes `00..1f`, expected mnemonic, seed, and article public key. The accompanying [Python oracle](../../packages/core/test-vectors/derive-passkey-v1.py) independently implements HKDF and BIP39 conversion; it reads only the standard English word list from the installed package.

## Ceremony and lifecycle

“Continue with passkey” calls `credentials.get` with no credential allowlist. The browser/password manager handles discovery and may offer another device. It cannot reliably report whether a passkey exists before user interaction. Failure leaves the reader locked and offers retry, explicit creation, and phrase recovery. Never create automatically after `NotAllowedError` or any other failure.

Creation requests PRF evaluation. If the provider reports only `prf.enabled`, follow with an assertion restricted to the just-created credential, using the same PRF input. A cancelled follow-up may leave an unused credential in the provider; retry Continue with passkey, rather than creating repeatedly. An unsupported credential may likewise remain in the provider but cannot unlock a reader. Never substitute a random seed, signature, or credential ID for missing PRF output.

Active seed and phrase live in tab memory only. No cookies, localStorage, sessionStorage, IndexedDB, cache entries, server recovery records, or saved credential IDs are introduced. Lock, unmount and profile dismissal during recovery abort pending ceremonies and invalidate their results. Mutable intermediate buffers and old seeds are overwritten when possible; JavaScript strings and runtime/browser copies cannot guarantee secure erasure.

The same credential with the same PRF input must recover the same reader. A new credential is a new reader; no migration of old purchases is implied. A synced passkey is usable only where the provider/browser preserves and exposes the same PRF secret. Back up the phrase before relying on portability or changing RP domains. A phrase can recover independently on another supported instance, subject to the existing publisher retaining its grants. Do not change these constants or repurpose a deployed RP ID as a new derivation version.

## Verification boundaries

Automated tests cover independent derivation vectors, mocked provider failures and cancellation, native Chromium WebAuthn through a PRF-capable virtual authenticator, and fake-mint paid access recovered with the same passkey and with its phrase in a fresh browser. They do not prove Apple/Google/third-party sync, physical authenticator behavior, cross-device transport, or real Cashu payment compatibility. Those require separate live checks. Passkey-provider synchronization is optional external infrastructure; the app does not depend on a relay or publisher identity service.
