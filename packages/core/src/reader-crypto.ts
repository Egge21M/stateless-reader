import { mnemonicToSeed, validateMnemonic, generateMnemonic } from "@scure/bip39";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { ed25519 } from "@noble/curves/ed25519.js";

import { wordlist } from "@scure/bip39/wordlists/english.js";

function isArticleId(value: string) {
  return value.length <= 128 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.exec(value)?.[0] === value;
}

const utf8 = (value: string) => new TextEncoder().encode(value);
export const READER_PROTOCOL_VERSION = 1;

export interface ReaderIdentity {
  phrase: string;
  seed: Uint8Array;
}

export async function restoreReader(phrase: string): Promise<ReaderIdentity> {
  const normalized = phrase.normalize("NFKD").trim().split(/\s+/u).join(" ");
  if (normalized.split(" ").length !== 12 || !validateMnemonic(normalized, wordlist)) {
    throw new Error("Invalid reader recovery phrase");
  }
  return { phrase: normalized, seed: await mnemonicToSeed(normalized, "") };
}

export function deriveArticleKey(seed: Uint8Array, articleId: string) {
  if (seed.length !== 64 || !isArticleId(articleId)) {
    throw new Error("Invalid article key input");
  }
  const privateKey = hkdf(sha256, seed, utf8("stateless-reader/article-key/v1"),
    utf8(JSON.stringify(["Ed25519", articleId])), 32);
  return { privateKey, publicKey: bytesToHex(ed25519.getPublicKey(privateKey)) };
}

export interface ArticleRequest {
  articleId: string;
  method: string;
  path: string;
  timestamp: number;
}

function requestBytes(request: ArticleRequest, publicKey: string) {
  if (!isArticleId(request.articleId) || /^[A-Z]+$/.exec(request.method)?.[0] !== request.method || !request.path.startsWith("/")) {
    throw new Error("Invalid request binding");
  }
  if (!Number.isSafeInteger(request.timestamp) || request.timestamp < 0) {
    throw new Error("Invalid request timestamp");
  }
  return utf8(JSON.stringify(["stateless-reader/request/v1", request.articleId,
    publicKey, request.method, request.path, String(request.timestamp)]));
}

export function signArticleRequest(seed: Uint8Array, request: ArticleRequest): string {
  const key = deriveArticleKey(seed, request.articleId);
  try {
    const signature = bytesToHex(ed25519.sign(requestBytes(request, key.publicKey), key.privateKey));
    return `Reader-v1 ${key.publicKey}.${request.timestamp}.${signature}`;
  } finally {
    key.privateKey.fill(0);
  }
}

export function generateReaderPhrase(): string {
  return generateMnemonic(wordlist, 128);
}

/** Returns the proven article public key, or null. No replay/session state. */
export function verifyArticleRequest(
  authorization: string | null,
  request: Omit<ArticleRequest, "timestamp">,
  nowSeconds = Math.floor(Date.now() / 1000),
): string | null {
  if (!authorization || authorization.length > 240) return null;
  const match = /^Reader-v1 ([0-9a-f]{64})\.(0|[1-9][0-9]{0,15})\.([0-9a-f]{128})$/.exec(authorization);
  if (!match || match[0] !== authorization) return null;
  const [, publicKey, timestampText, signature] = match;
  const timestamp = Number(timestampText);
  if (!Number.isSafeInteger(timestamp) || !Number.isSafeInteger(nowSeconds) || Math.abs(nowSeconds - timestamp) > 60) return null;
  try {
    return ed25519.verify(hexToBytes(signature!), requestBytes({ ...request, timestamp }, publicKey!),
      hexToBytes(publicKey!), { zip215: false }) ? publicKey! : null;
  } catch {
    return null;
  }
}
