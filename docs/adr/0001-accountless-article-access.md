# Bind article purchases to reader-controlled article keys

The reader creation and recovery entry is extended by [ADR 0003](0003-passkey-reader-recovery.md): a passkey may recreate the same reader seed as its exported recovery phrase. The remaining access, payment and persistence decisions below still apply.

The proof of concept serves one publisher selling individual premium articles. Bind each purchase to a reader-controlled, deterministically derived article key instead of a publisher account. Keep a durable access grant for the article and public key, allowing repeat access without expiry while the article remains available. A reader must be able to regain access in a fresh browser using their seed without paying again; this also requires the publisher to retain the grant.

This trades account-based identity and recovery for reader-controlled access without a shared cryptographic identifier across different articles. Repeat access to the same article remains recognizable. Network and browser metadata are outside this privacy promise; complete payment or browsing unlinkability is not claimed.

The reader generates or restores a dedicated reader seed using a 12-word BIP39 mnemonic with an empty BIP39 passphrase: the twelve words alone are sufficient for recovery. Generate it randomly rather than from a reader-invented password. Keep it only in browser memory during use; reloading requires restoration, and a lock action clears it from application state. The reader is responsible for backing it up. There is no publisher-assisted reset: losing the seed loses access, and sharing it shares access to its purchases. For this single-publisher POC, derive article keys without a publisher namespace. Reusing the same seed and article identifier across publishers would therefore not provide publisher separation. Freeze and version the derivation scheme so future changes do not silently break existing grants.

Purchases cover corrections and updates under the same article identifier. Never reuse an identifier for unrelated content. Use one configured mint and unit, with a fixed price per article; changing prices during checkout is outside the POC. This allows the payment URL to identify an offer without a stored quote or an embedded price version.

Use regular Cashu payment requests with HTTP transport to an external wallet. Avoid accounts and stored unpaid checkout sessions. “Mostly stateless” describes that boundary, rather than an absence of all state: access grants and publisher funds persist across normal restarts. The publisher will use Coco for Cashu handling with its Bun SQLite adapter, which also persists wallet operation records. The application remains responsible for offer validation and article access grants; Coco's stored incoming-payment-request workflow would conflict with the decision to avoid stored unpaid checkout sessions. Withdrawal UI is outside the POC.

Demonstrate the flow with a public catalogue of 5–10 fixture articles showing titles, previews, and prices, without a publishing interface. Full article bodies require authorization. Show the payment request as a QR code and copyable text after a 402 response, then poll for access while the payment panel is open and display the article when authorized.

After restoring the reader seed, discover access when the reader opens an article. Do not automatically scan all articles or provide a separate purchase-history screen.

Reject duplicate payments for an already-granted article/public-key pair before redeeming any submitted proofs. Serialize payment handling per pair within the single backend process so concurrent submissions cannot both pass that check. Reject underpayments before redemption; accept amounts equal to or greater than the article price, retaining any excess without change or refunds. Make this behavior clear in the payment UI.

Use the Minibits mint at `https://mint.minibits.cash/Bitcoin`, with `sat` as the unit. The payer may use any compatible external wallet; the Minibits wallet is not required. General fee handling is outside scope, relying on the chosen mint's zero-input-fee setup. Its [public keyset metadata](https://mint.minibits.cash/Bitcoin/v1/keysets) advertised zero input fees for every listed keyset when checked on 2026-10-27; this is an operating assumption for the POC, not a permanent guarantee about the mint.

For this POC, crash recovery during payment processing is explicitly out of scope; a successful payment followed by a failure before the grant is stored may leave the reader without access.
