# Retired passkey-derived reader v1

The phrase-compatible passkey derivation shipped in source revision `849e0c2` is retired by [ADR 0004](../adr/0004-passkey-only-readers.md). Its implementation and vectors are removed. The POC deliberately does not migrate earlier reader keys or purchases.

Use [passkey reader v2](passkey-reader-v2.md) for the current direct derivation and lifecycle. The old design and its deployment evidence remain available in Git history.
