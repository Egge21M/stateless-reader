import { openProfile, unlockReader, closeProfile, closeDialog, lockReader, selectArticle } from "./reader-journey";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { expect, test } from "@playwright/test";

// Do not retain credential-bearing traces.
test.use({ trace: "off" });

import vector from "../../packages/core/test-vectors/passkey-v2.json" with { type: "json" };
const prf = [...Buffer.from(vector.prf, "hex")];

test("an unpaid reader sees a bound QR and copyable request without transmitting secrets", async ({ page, context }) => {
  const { decodePaymentRequest } = await import("@cashu/cashu-ts");
  const traffic: string[] = [];
  const logs: string[] = [];
  page.on("request", (request) => traffic.push(JSON.stringify({ url: request.url(), headers: request.headers(), data: request.postData() })));
  page.on("console", (message) => logs.push(message.text()));
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await openProfile(page);
  await unlockReader(page, prf);
  await expect(page.getByText("Reader unlocked", { exact: true })).toBeVisible();
  const responsePromise = page.waitForResponse((response) => response.url().includes("/article/the-quiet-web"));
  await selectArticle(page, "The quiet web");
  expect((await responsePromise).status()).toBe(402);
  const request = page.getByLabel("Payment request", { exact: true });
  await expect(request).toBeVisible();
  const encoded = await request.inputValue();
  const decoded = decodePaymentRequest(encoded);
  expect(decoded.amount?.toNumber()).toBe(21);
  expect(decoded.mints).toHaveLength(1);
  expect(decoded.mints![0]).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  expect(decoded.unit).toBe("sat");
  expect(decoded.transport).toHaveLength(1);
  expect(decoded.transport?.[0]?.type).toBe("post");
  expect(decoded.transport?.[0]?.target).toContain(`/payment/the-quiet-web/${vector.publicKey}`);
  const qr = page.getByRole("img", { name: "Payment request QR code" });
  await expect(qr).toBeVisible();
  const png = PNG.sync.read(await qr.screenshot());
  expect(jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data).toBe(encoded);
  await expect(page.getByText("Excess payment is retained. No change or refunds.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Copy payment request" }).click();
  await expect(page.getByText("Payment request copied.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(encoded);
  const secondResponse = page.waitForResponse((response) => response.url().includes("/article/a-library-in-your-pocket"));
  await selectArticle(page, "A library in your pocket");
  expect((await secondResponse).status()).toBe(402);
  await expect(request).not.toHaveValue(encoded);
  expect(decodePaymentRequest(await request.inputValue()).transport?.[0]?.target)
    .toMatch(/\/payment\/a-library-in-your-pocket\/[0-9a-f]{64}$/);
  for (const secret of [vector.seed, vector.prf]) {
    expect(traffic.join("\n")).not.toContain(secret);
    expect(logs.join("\n")).not.toContain(secret);
  }
  await lockReader(page);
  await expect(request).toHaveCount(0);
  await expect(page.getByRole("img", { name: "Payment request QR code" })).toHaveCount(0);
});

for (const action of ["lock", "replace reader", "select another", "clear selection"] as const) {
  test(`a delayed article response cannot revive the previous view after ${action}`, async ({ page }) => {
    let release!: () => void;
    let received!: () => void;
    let finished!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const requested = new Promise<void>((resolve) => { received = resolve; });
    const completed = new Promise<void>((resolve) => { finished = resolve; });
    // Hold every request from the original reader, including StrictMode's replay.
    // A one-use route can be consumed by an aborted development request before
    // its handler runs. Replacement readers must still reach the real publisher.
    let delayedKey: string | undefined;
    await page.route("**/article/the-quiet-web", async (route) => {
      const key = route.request().headers().authorization?.split(" ")[1]?.split(".")[0];
      delayedKey ??= key;
      if (key !== delayedKey) { await route.continue(); return; }
      const response = await route.fetch();
      received();
      await pending;
      try { await route.fulfill({ response }); } finally { finished(); }
    });
    await page.goto("/");
    await openProfile(page);
    await unlockReader(page, prf);
    await expect(page.getByText("Reader unlocked", { exact: true })).toBeVisible();
    await selectArticle(page, "The quiet web");
    await test.step("publisher response reaches the delay", () => requested);
    const payment = page.getByLabel("Payment request", { exact: true });
    let replacement: string | undefined;
    try {
      if (action === "lock") await lockReader(page);
      if (action === "clear selection") {
        await closeDialog(page);
        await page.getByRole("button", { name: "Clear selection" }).click();
      }
      if (action === "select another") {
        await selectArticle(page, "A library in your pocket");
      }
      if (action === "replace reader") {
        await openProfile(page);
        await unlockReader(page);
      }
      if (action === "replace reader") {
        await expect(page.getByText("Reader unlocked", { exact: true })).toBeVisible();
        await closeProfile(page);
      }
      if (action === "replace reader" || action === "select another") {
        await expect(payment).toBeVisible();
        replacement = await payment.inputValue();
        const { decodePaymentRequest } = await import("@cashu/cashu-ts");
        expect(decodePaymentRequest(replacement).transport?.[0]?.target)
          .not.toContain(vector.publicKey);
      }
    } finally { release(); }
    await test.step("delayed response is released", () => completed);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    if (replacement) await expect(payment).toHaveValue(replacement);
    else await expect(payment).toHaveCount(0);
  });
}

test("a fresh browser restores the same article key and checks only the selected article", async ({ browser }) => {
  const { decodePaymentRequest } = await import("@cashu/cashu-ts");
  const keys: string[] = [];
  for (let visit = 0; visit < 2; visit++) {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const articlePaths: string[] = [];
      page.on("request", (request) => {
        const path = new URL(request.url()).pathname;
        if (path.startsWith("/article/")) articlePaths.push(path);
      });
      await page.goto("/");
      await openProfile(page);
      await unlockReader(page, prf);
      await expect(page.getByText("Reader unlocked", { exact: true })).toBeVisible();
      expect(articlePaths).toEqual([]);
      await selectArticle(page, "The quiet web");
      const payment = page.getByLabel("Payment request", { exact: true });
      await expect(payment).toBeVisible();
      const target = decodePaymentRequest(await payment.inputValue()).transport?.[0]?.target;
      keys.push(target!.split("/").at(-1)!);
      expect([...new Set(articlePaths)]).toEqual(["/article/the-quiet-web"]);
    } finally { await context.close(); }
  }
  expect(keys).toEqual(Array(2).fill(vector.publicKey));
});
