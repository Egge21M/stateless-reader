import { expect, test } from "bun:test";
import { readerFromPasskey, deriveArticleKey } from "./index";
import vector from "../test-vectors/passkey-v2.json";

test("passkey v2 directly derives the seed matching an independent Python vector", async () => {
  const reader = await readerFromPasskey(Buffer.from(vector.prf, "hex"));
  expect(Object.keys(reader)).toEqual(["seed"]);
  expect(Buffer.from(reader.seed).toString("hex")).toBe(vector.seed);
  expect(deriveArticleKey(reader.seed, vector.articleId).publicKey).toBe(vector.publicKey);
  expect((await readerFromPasskey(Buffer.from(vector.prf, "hex"))).seed).toEqual(reader.seed);
  expect((await readerFromPasskey(new Uint8Array(32).fill(17))).seed).not.toEqual(reader.seed);
});

test("passkey derivation rejects missing or truncated PRF output", async () => {
  for (const size of [0, 16, 31, 33, 64]) {
    await expect(readerFromPasskey(new Uint8Array(size))).rejects.toThrow("Invalid passkey PRF output");
  }
});
