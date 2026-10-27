import { expect, test } from "bun:test";
import { readerFromPasskey, restoreReader, deriveArticleKey } from "./index";
import vector from "../test-vectors/passkey-v1.json";

test("passkey v1 matches the independent Python vector and phrase recovery", async () => {
  const reader = await readerFromPasskey(Buffer.from(vector.prf, "hex"));
  expect(reader.phrase).toBe(vector.phrase);
  expect(Buffer.from(reader.seed).toString("hex")).toBe(vector.seed);
  expect(deriveArticleKey(reader.seed, vector.articleId).publicKey).toBe(vector.publicKey);
  const restored = await restoreReader(reader.phrase);
  expect(restored.seed).toEqual(reader.seed);
  const repeated = await readerFromPasskey(Buffer.from(vector.prf, "hex"));
  expect(repeated.seed).toEqual(reader.seed);
  const different = await readerFromPasskey(new Uint8Array(32).fill(17));
  expect(different.seed).not.toEqual(reader.seed);
});

test("passkey derivation rejects missing or truncated PRF output", async () => {
  for (const size of [0, 16, 31, 33, 64]) {
    await expect(readerFromPasskey(new Uint8Array(size))).rejects.toThrow("Invalid passkey PRF output");
  }
});
