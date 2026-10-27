import { expect, test } from "bun:test";
import { deriveArticleKey, signArticleRequest } from "./index";
import fixture from "../test-vectors/reader-v1.json";

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");

test("article keys and signatures match independent raw-seed v1 vectors", async () => {
  const reader = { seed: Buffer.from(fixture.seed, "hex") };
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

test("article keys are distinct and reject invalid seed lengths", () => {
  const seed = Buffer.from(fixture.seed, "hex");
  expect(deriveArticleKey(seed, fixture.vectors[0]!.articleId).publicKey)
    .not.toBe(deriveArticleKey(seed, fixture.vectors[1]!.articleId).publicKey);
  for (const size of [0, 32, 63, 65]) expect(() => deriveArticleKey(new Uint8Array(size), "the-quiet-web")).toThrow();
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
  const reader = { seed: Buffer.from(fixture.seed, "hex") };
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
