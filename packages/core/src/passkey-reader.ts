import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import type { ReaderIdentity } from "./reader-crypto";

// Version 2 deliberately replaces the mnemonic-based derivation. No migration.
export const PASSKEY_PRF_INPUT = "stateless-reader/passkey/v2";
const utf8 = (text: string) => new TextEncoder().encode(text);

/** Derive the reader seed directly from the credential's WebAuthn PRF output. */
export async function readerFromPasskey(prf: Uint8Array): Promise<ReaderIdentity> {
  if (prf.length !== 32) throw new Error("Invalid passkey PRF output");
  return {
    seed: hkdf(sha256, prf, utf8("stateless-reader/passkey-seed/v2"), utf8("reader-seed"), 64),
  };
}
