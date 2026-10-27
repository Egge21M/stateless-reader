# Reader protocol v1 (frozen)

This specifies article-key derivation and signed HTTP requests. Reader seed
creation is specified separately by [passkey v2](passkey-reader-v2.md); its
intentional breaking change does not alter the article/request wire format.

## Recovery and article keys

- Reader seed: the 64-byte output of passkey v2. No phrase conversion.
- Article IDs are 1–128 ASCII characters matching `[a-z0-9]+(-[a-z0-9]+)*`.
- HKDF-SHA256: IKM = 64-byte reader seed; salt = UTF-8
  `stateless-reader/article-key/v1`; info = UTF-8 of compact JSON array
  `["Ed25519","<articleId>"]`; output length 32 bytes. This is an Ed25519 private
  seed, not a scalar. Derive the standard RFC8032 Ed25519 public key from it.
- No publisher namespace, origin, wallet seed, or extra password enters derivation.
  The same reader seed and article ID at another publisher produce the same key.

## Signed HTTP requests

Use HTTPS in deployment. Loopback HTTP is permitted for local development/tests.
Send a header, never a query credential:

`Authorization: Reader-v1 <publicKey>.<timestamp>.<signature>`

Public key is exactly 32 bytes in lowercase hex (64 characters). Signature is
exactly 64 bytes in lowercase hex (128 characters). Timestamp is canonical decimal
Unix seconds: nonnegative safe integer, no sign, fraction, exponent or leading
zero (except `0`).

Sign the UTF-8 bytes of this compact JSON array (no spaces or trailing newline):

`["stateless-reader/request/v1","<articleId>","<publicKey>","<METHOD>","<path>","<timestamp>"]`

All elements are strings. METHOD is uppercase. Path is the exact HTTP URL pathname
plus query string as observed by the server; no percent-decoding or query sorting.
Clients use `GET` and `/article/<articleId>` with no query. JSON serialization uses
standard string escaping. The ASCII ID/public-key/timestamp constraints remove
Unicode ambiguity for those fields. Public key is both signed and used to verify.
Ed25519 verification uses strict RFC8032 semantics (`zip215: false`).

The server rejects malformed authorization and signatures, and accepts time iff
`abs(floor(serverUnixMilliseconds / 1000) - timestamp) <= 60`. Both endpoints of
this interval are inclusive; clocks may differ up to 60 seconds. Replaying the
same authorization inside the window is deliberately accepted. There are no
nonces, challenges, sessions or replay records. Changing article, key, method,
path/query, timestamp or protocol version invalidates authorization.

## HTTP responses and payment request

- Unknown article/route: 404 `{"error":"Not found"}`.
- Known article with missing/invalid/stale authorization: 401
  `{"error":"Article authorization required"}`.
- Valid signed GET for an unpaid article: 402 JSON with `paymentRequest` (encoded
  NUT-18), `articleId`, `publicKey`, `protocolVersion: 1`, and `offer`
  (`amount`, `unit`, `mint`). All article responses use `Cache-Control: no-store`.
- A durable grant permits a 200 premium response for its article/public-key pair.
  Payment POST settles Cashu before recording that grant; unpaid checkout state is not persisted.

The ordinary NUT-18 CBOR request uses `creqA` and URL-safe base64 (`+` → `-`, `/`
→ `_`, padding retained), with exactly one `post` transport. Its target is
`<PUBLIC_ORIGIN>/payment/<articleId>/<publicKey>`. No Nostr, Cashu402, or NUT-26.
Set a trusted HTTPS PUBLIC_ORIGIN in deployment; request Host/forwarding headers
never determine this origin. Loopback development defaults to the bound listener.
Amount, `sat` unit, and the single Minibits mint come from the fixed article offer;
`singleUse` is true and description is the article title. No request ID is needed.
cashu-ts is pinned to `5.0.0-rc.4` per the integration research.

## Secrets and compatibility evidence

Reader seeds and derived private keys stay in browser memory. Lock, replacement
and reload drop the active identity and payment view. Async work is invalidated
on identity changes so stale results cannot restore it. This does not promise
JavaScript memory erasure. Never log or persist reader credentials. Passkey
availability and recovery limitations are described in the passkey v2 contract.

`packages/core/test-vectors/reader-v1.json` contains fixed expected article keys
and signatures for the public raw seed `00..3f`. `derive-reader-v1.py` independently
produces them using Python cryptography/OpenSSL HKDF and Ed25519, without
application imports. Passkey v2 has separate end-to-end seed derivation vectors.
