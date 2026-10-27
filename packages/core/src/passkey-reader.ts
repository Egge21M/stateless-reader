import { entropyToMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { restoreReader } from "./reader-crypto";

// Recovery protocol constants. Changing any byte creates a different reader.
export const PASSKEY_PRF_INPUT = "stateless-reader/passkey/v1";
const utf8 = (text: string) => new TextEncoder().encode(text);

/** Convert a WebAuthn PRF output to the existing BIP39 reader protocol. */
export async function readerFromPasskey(prf: Uint8Array) {
  if (prf.length !== 32) throw new Error("Invalid passkey PRF output");
  const entropy = hkdf(
    sha256, prf, utf8("stateless-reader/passkey-seed/v1"),
    utf8("BIP39/english/128"), 16,
  );
  try {
    return await restoreReader(entropyToMnemonic(entropy, wordlist));
  } finally {
    entropy.fill(0);
  }
}
