# Authenticate article requests without stored challenges

Use short-lived requests signed with the reader's article key, binding the authorization to the article, HTTP method/path, and timestamp. Use HTTPS and a validity window of approximately 60 seconds instead of maintaining server-issued single-use nonces or login sessions.

This deliberately accepts replay of a captured authorization within its validity window in exchange for avoiding server-side challenge state in the POC. Reusing an authorization must not permit access to a different article.

Use BIP39 seed conversion, HKDF-SHA-256 for article-specific derivation, and Ed25519 signatures through scure/noble libraries. Version the derivation format and omit a publisher namespace for this POC. The exact derivation encoding and signed-message format still need to be frozen before implementation; the choice of primitives alone is not a complete interoperable format.
