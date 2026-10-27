# Reader protocol v1 (frozen)

This is the compatibility contract for #4. Changes require a new version; never
reinterpret an existing grant. No durable grants are issued in this slice.

## Recovery and article keys

- Generate 128 random bits using the browser CSPRNG and encode with the English
  BIP39 wordlist (12 words, including its checksum). Restoration normalizes NFKD,
  trims surrounding whitespace, collapses whitespace to ASCII spaces, then
  validates exactly 12 lowercase English words and their checksum. Other lengths,
  unknown words and bad checksums fail. There is no user-supplied passphrase.
- BIP39 seed: PBKDF2-HMAC-SHA512, 2048 iterations, password UTF-8 of the normalized
  mnemonic, salt UTF-8 `mnemonic` (empty BIP39 passphrase), output 64 bytes.
- Article IDs are 1–128 ASCII characters matching `[a-z0-9]+(-[a-z0-9]+)*`.
- HKDF-SHA256: IKM = 64-byte BIP39 seed; salt = UTF-8
  `stateless-reader/article-key/v1`; info = UTF-8 of compact JSON array
  `["Ed25519","<articleId>"]`; output length 32 bytes. This is an Ed25519 private
  seed, not a scalar. Derive the standard RFC8032 Ed25519 public key from it.
- No publisher namespace, origin, wallet seed, or extra password enters derivation.
  The same reader phrase and article ID at another publisher produce the same key.

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
- No 200 premium response, grant creation, payment redemption, or unpaid checkout
  persistence is implemented by #4. Payment POST remains unavailable until #5.

The ordinary NUT-18 CBOR request uses `creqA` and URL-safe base64 (`+` → `-`, `/`
→ `_`, padding retained), with exactly one `post` transport. Its target is
`<PUBLIC_ORIGIN>/payment/<articleId>/<publicKey>`. No Nostr, Cashu402, or NUT-26.
Set a trusted HTTPS PUBLIC_ORIGIN in deployment; request Host/forwarding headers
never determine this origin. Loopback development defaults to the bound listener.
Amount, `sat` unit, and the single Minibits mint come from the fixed article offer;
`singleUse` is true and description is the article title. No request ID is needed.
cashu-ts is pinned to `5.0.0-rc.4` per the integration research.

## Secrets and compatibility evidence

Reader phrases, seed and derived private keys stay in browser memory. Lock,
replacement/restoration and reload drop the active identity and payment view.
Async work is invalidated on identity changes so stale results cannot restore it.
This does not promise JavaScript memory erasure. Never log or persist reader
credentials. Backup is reader-controlled; loss loses access, sharing shares access.
The reader phrase is separate from an external Cashu wallet's recovery phrase.

`packages/core/test-vectors/reader-v1.json` contains fixed expected bytes and
signatures. `derive-reader-v1.py` independently produces them using Python's
hashlib PBKDF2 and cryptography/OpenSSL HKDF and Ed25519, without scure/noble or
application imports. The zero-entropy English BIP39 mnemonic is the standard
`abandon` × 11 + `about` example, with the required empty passphrase. Tests compare
the public compatibility API with these committed values, not runtime-derived
expectations. These are public test secrets only.
