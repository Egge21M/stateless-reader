import jsQR from "jsqr";
import { PNG } from "pngjs";
import { expect, test } from "@playwright/test";

// Recovery tests must not record phrase-bearing DOM snapshots in failure traces.
test.use({ trace: "off" });

const phrase = "abandon ".repeat(11) + "about";

test("reader creates a phrase, backs it up, locks and restores without persistent credentials", async ({ page, context }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create reader phrase", exact: true }).click();
  const backup = page.getByLabel("Your reader recovery phrase", { exact: true });
  await expect(backup).toBeVisible();
  const created = await backup.inputValue();
  expect(created.split(" ")).toHaveLength(12);
  await expect(page.getByText("Losing it loses access. Sharing it shares access.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Hide backup" }).click();
  await expect(backup).toHaveCount(0);
  await page.getByRole("button", { name: "Show backup" }).click();
  await expect(backup).toHaveValue(created);
  await page.getByRole("button", { name: "Lock reader", exact: true }).click();
  await expect(backup).toHaveCount(0);
  await page.getByLabel("Restore reader recovery phrase", { exact: true }).fill(created);
  await page.getByRole("button", { name: "Restore reader", exact: true }).click();
  await expect(page.getByText("Reader unlocked", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Show backup" }).click();
  await expect(backup).toHaveValue(created);
  const storage = await page.evaluate(async () => ({
    local: { ...localStorage }, session: { ...sessionStorage },
    databases: await indexedDB.databases(), caches: await caches.keys(),
  }));
  expect(storage).toEqual({ local: {}, session: {}, databases: [], caches: [] });
  expect(await context.cookies()).toEqual([]);
  await page.reload();
  await expect(page.getByText("Reader locked", { exact: true })).toBeVisible();
  await expect(backup).toHaveCount(0);
});

test("an unpaid reader sees a bound QR and copyable request without transmitting secrets", async ({ page, context }) => {
  const { decodePaymentRequest } = await import("@cashu/cashu-ts");
  const traffic: string[] = [];
  const logs: string[] = [];
  page.on("request", (request) => traffic.push(JSON.stringify({ url: request.url(), headers: request.headers(), data: request.postData() })));
  page.on("console", (message) => logs.push(message.text()));
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await page.getByLabel("Restore reader recovery phrase", { exact: true }).fill(phrase);
  await page.getByRole("button", { name: "Restore reader", exact: true }).click();
  await expect(page.getByText("Reader unlocked", { exact: true })).toBeVisible();
  const responsePromise = page.waitForResponse((response) => response.url().includes("/article/the-quiet-web"));
  await page.getByRole("button", { name: "Select The quiet web", exact: true }).click();
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
  expect(decoded.transport?.[0]?.target).toMatch(/\/payment\/the-quiet-web\/360fc8d6daaa8ef054dbd8a3721cd3237f863dc9b9cc87f6df596abdfdde8dfb$/);
  const qr = page.getByRole("img", { name: "Payment request QR code" });
  await expect(qr).toBeVisible();
  const png = PNG.sync.read(await qr.screenshot());
  expect(jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data).toBe(encoded);
  await expect(page.getByText("Excess payment is retained. No change or refunds.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Copy payment request" }).click();
  await expect(page.getByText("Payment request copied.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(encoded);
  const secondResponse = page.waitForResponse((response) => response.url().includes("/article/a-library-in-your-pocket"));
  await page.getByRole("button", { name: "Select A library in your pocket", exact: true }).click();
  expect((await secondResponse).status()).toBe(402);
  await expect(request).not.toHaveValue(encoded);
  expect(decodePaymentRequest(await request.inputValue()).transport?.[0]?.target)
    .toMatch(/\/payment\/a-library-in-your-pocket\/0d174f330614021cad5085b2325d6fabb9a0d0fe18ffe5c6663fc0ade32efbc3$/);
  for (const secret of [phrase,
    "5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc19a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4",
    "3e9d5d05b835a34af0cf8943d4f03aaa13373ae2c2a4611384b9edd4b0ec9e42"]) {
    expect(traffic.join("\n")).not.toContain(secret);
    expect(logs.join("\n")).not.toContain(secret);
  }
  await page.getByRole("button", { name: "Lock reader", exact: true }).click();
  await expect(request).toHaveCount(0);
  await expect(page.getByRole("img", { name: "Payment request QR code" })).toHaveCount(0);
});

test("invalid restoration clears the previous reader, backup, draft and payment view", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Restore reader recovery phrase", { exact: true }).fill(phrase);
  await page.getByRole("button", { name: "Restore reader", exact: true }).click();
  await expect(page.getByText("Reader unlocked", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Show backup" }).click();
  await page.getByRole("button", { name: "Select The quiet web", exact: true }).click();
  await expect(page.getByLabel("Payment request", { exact: true })).toBeVisible();
  await page.getByLabel("Restore reader recovery phrase", { exact: true }).fill("abandon ".repeat(12));
  await page.getByRole("button", { name: "Restore reader", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Invalid reader recovery phrase");
  await expect(page.getByText("Reader locked", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Your reader recovery phrase", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Payment request", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Restore reader recovery phrase", { exact: true })).toHaveValue("");
});

test("locking during asynchronous recovery cannot resurrect the reader", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Restore reader recovery phrase", { exact: true }).fill(phrase);
  // Both user actions occur before pending PBKDF2 promises can complete.
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll("button")];
    buttons.find((button) => button.textContent === "Restore reader")!.click();
    buttons.find((button) => button.textContent === "Lock reader")!.click();
  });
  await expect(page.getByText("Reader locked", { exact: true })).toBeVisible();
  // Let the real async KDF finish, then observe through the rendered UI.
  await page.waitForTimeout(400);
  await expect(page.getByText("Reader locked", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Show backup" })).toHaveCount(0);
  await page.getByRole("button", { name: "Select The quiet web", exact: true }).click();
  await expect(page.getByLabel("Payment request", { exact: true })).toHaveCount(0);
});

test("a newer invalid restoration wins over an earlier pending phrase creation", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Restore reader recovery phrase", { exact: true }).fill("invalid phrase");
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll("button")];
    buttons.find((button) => button.textContent === "Create reader phrase")!.click();
    buttons.find((button) => button.textContent === "Restore reader")!.click();
  });
  await expect(page.getByRole("alert")).toContainText("Invalid reader recovery phrase");
  await page.waitForTimeout(400);
  await expect(page.getByText("Reader locked", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Your reader recovery phrase", { exact: true })).toHaveCount(0);
});

for (const action of ["lock", "restore", "select another", "clear selection"] as const) {
  test(`a delayed article response cannot revive the previous view after ${action}`, async ({ page }) => {
    let release!: () => void;
    let received!: () => void;
    let finished!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const requested = new Promise<void>((resolve) => { received = resolve; });
    const completed = new Promise<void>((resolve) => { finished = resolve; });
    // Delay a real publisher 402 at the HTTP boundary, not a fabricated service result.
    await page.route("**/article/the-quiet-web", async (route) => {
      const response = await route.fetch();
      received();
      await pending;
      try { await route.fulfill({ response }); } finally { finished(); }
    }, { times: 1 });
    await page.goto("/");
    await page.getByLabel("Restore reader recovery phrase", { exact: true }).fill(phrase);
    await page.getByRole("button", { name: "Restore reader", exact: true }).click();
    await expect(page.getByText("Reader unlocked", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Select The quiet web", exact: true }).click();
    await requested;
    const payment = page.getByLabel("Payment request", { exact: true });
    let replacement: string | undefined;
    try {
      if (action === "lock") await page.getByRole("button", { name: "Lock reader", exact: true }).click();
      if (action === "clear selection") await page.getByRole("button", { name: "Clear selection" }).click();
      if (action === "select another") {
        await page.getByRole("button", { name: "Select A library in your pocket", exact: true }).click();
      }
      if (action === "restore") {
        await page.getByLabel("Restore reader recovery phrase", { exact: true })
          .fill("legal winner thank year wave sausage worth useful legal winner thank yellow");
        await page.getByRole("button", { name: "Restore reader", exact: true }).click();
      }
      if (action === "restore" || action === "select another") {
        await expect(payment).toBeVisible();
        replacement = await payment.inputValue();
        const { decodePaymentRequest } = await import("@cashu/cashu-ts");
        expect(decodePaymentRequest(replacement).transport?.[0]?.target)
          .not.toContain("360fc8d6daaa8ef054dbd8a3721cd3237f863dc9b9cc87f6df596abdfdde8dfb");
      }
    } finally { release(); }
    await completed;
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
      await page.getByLabel("Restore reader recovery phrase", { exact: true }).fill(phrase);
      await page.getByRole("button", { name: "Restore reader", exact: true }).click();
      await expect(page.getByText("Reader unlocked", { exact: true })).toBeVisible();
      expect(articlePaths).toEqual([]);
      await page.getByRole("button", { name: "Select The quiet web", exact: true }).click();
      const payment = page.getByLabel("Payment request", { exact: true });
      await expect(payment).toBeVisible();
      const target = decodePaymentRequest(await payment.inputValue()).transport?.[0]?.target;
      keys.push(target!.split("/").at(-1)!);
      expect([...new Set(articlePaths)]).toEqual(["/article/the-quiet-web"]);
    } finally { await context.close(); }
  }
  expect(keys).toEqual(Array(2).fill("360fc8d6daaa8ef054dbd8a3721cd3237f863dc9b9cc87f6df596abdfdde8dfb"));
});
