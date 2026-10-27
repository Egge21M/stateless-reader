import { expect, test } from "bun:test";
import { restoreReader, deriveArticleKey, signArticleRequest } from "./index";
import fixture from "../test-vectors/reader-v1.json";

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");

test("empty-passphrase BIP39 recovery and article signatures match independent v1 vectors", async () => {
  const reader = await restoreReader(fixture.phrase);
  expect(hex(reader.seed)).toBe(fixture.seed);
  for (const vector of fixture.vectors) {
    const key = deriveArticleKey(reader.seed, vector.articleId);
    expect(hex(key.privateKey)).toBe(vector.privateKey);
    expect(key.publicKey).toBe(vector.publicKey);
    expect(signArticleRequest(reader.seed, {
      articleId: vector.articleId, method: "GET", path: `/article/${vector.articleId}`,
      timestamp: vector.timestamp,
    })).toBe(vector.authorization);
  }
});

test("restoration validates twelve-word English checksums and normalizes whitespace", async () => {
  for (const phrase of ["", "abandon ".repeat(12), "password ".repeat(12), "abandon ".repeat(11), fixture.phrase.toUpperCase()]) {
    await expect(restoreReader(phrase)).rejects.toThrow("Invalid reader recovery phrase");
  }
  const restored = await restoreReader(` \n${fixture.phrase.replaceAll(" ", "\t ")}  `);
  expect(restored.phrase).toBe(fixture.phrase);
  expect(hex(restored.seed)).toBe(fixture.seed);
  const first = deriveArticleKey(restored.seed, fixture.vectors[0]!.articleId);
  const second = deriveArticleKey(restored.seed, fixture.vectors[1]!.articleId);
  expect(first.publicKey).not.toBe(second.publicKey);
});

test("new reader phrases are random, twelve words, and recoverable", async () => {
  const { generateReaderPhrase } = await import("./index");
  const phrases = new Set(Array.from({ length: 8 }, () => generateReaderPhrase()));
  expect(phrases.size).toBe(8);
  for (const phrase of phrases) {
    expect(phrase.split(" ")).toHaveLength(12);
    expect((await restoreReader(phrase)).seed).toHaveLength(64);
  }
});

test("v1 signatures verify only their bound request and the inclusive 60-second window", async () => {
  const { verifyArticleRequest } = await import("./index");
  const vector = fixture.vectors[0]!;
  const request = { articleId: vector.articleId, method: "GET", path: `/article/${vector.articleId}` };
  for (const delta of [-60, 0, 60]) {
    expect(verifyArticleRequest(vector.authorization, request, vector.timestamp + delta)).toBe(vector.publicKey);
  }
  for (const delta of [-61, 61]) expect(verifyArticleRequest(vector.authorization, request, vector.timestamp + delta)).toBeNull();
  for (const changed of [
    { ...request, articleId: "the-price-of-a-page" },
    { ...request, method: "POST" },
    { ...request, path: `${request.path}?different=1` },
  ]) expect(verifyArticleRequest(vector.authorization, changed, vector.timestamp)).toBeNull();
  for (const header of [null, "", vector.authorization.replace("Reader-v1", "Reader-v2"),
    vector.authorization.replace(vector.publicKey, fixture.vectors[1]!.publicKey),
    vector.authorization.slice(0, -2) + "00", vector.authorization.replace(String(vector.timestamp), "0" + vector.timestamp),
    vector.authorization.replace(String(vector.timestamp), String(vector.timestamp + 1))]) {
    expect(verifyArticleRequest(header, request, vector.timestamp)).toBeNull();
  }
});

test("v1 rejects noncanonical identifiers, methods, timestamps and header suffixes", async () => {
  const { verifyArticleRequest } = await import("./index");
  const reader = await restoreReader(fixture.phrase);
  const vector = fixture.vectors[0]!;
  const request = { articleId: vector.articleId, method: "GET", path: `/article/${vector.articleId}`, timestamp: vector.timestamp };
  expect(verifyArticleRequest(vector.authorization + "\n", request, vector.timestamp)).toBeNull();
  for (const articleId of ["", "article/other", "UPPER", "the-quiet-web\n", "a".repeat(129)]) {
    expect(() => deriveArticleKey(reader.seed, articleId)).toThrow();
  }
  for (const timestamp of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    expect(() => signArticleRequest(reader.seed, { ...request, timestamp })).toThrow();
  }
  expect(() => signArticleRequest(reader.seed, { ...request, method: "get" })).toThrow();
});
