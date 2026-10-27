import { expect, test, type Page } from "@playwright/test";
import { decodePaymentRequest } from "@cashu/cashu-ts";
import { openProfile, unlockReader, closeProfile, selectArticle } from "./reader-journey";
import vector from "../../packages/core/test-vectors/passkey-v2.json" with { type: "json" };

test.use({ trace: "off" });

async function profile(page: Page, url = "/") {
  await page.goto(url);
  await page.getByRole("button", { name: "Profile", exact: true }).click();
}

// Browser-boundary doubles exercise providers/errors that a virtual authenticator
// cannot model. The separate native test below uses Chromium's real WebAuthn API.
async function mockPasskey(page: Page, mode: "success" | "cancel" | "unsupported" | "short" | "create" | "delayed") {
  await page.addInitScript(({ mode }) => {
    const calls: { operation: string; allowed: number; input: string; challenge: string }[] = [];
    Object.assign(window, { passkeyCalls: calls });
    const credential = (enabledOnly = false) => ({
      type: "public-key", rawId: new Uint8Array([1, 2, 3]).buffer,
      getClientExtensionResults: () => mode === "unsupported" ? {} : ({ prf: enabledOnly ? { enabled: true } : {
        results: { first: Uint8Array.from({ length: mode === "short" ? 16 : 32 }, (_, i) => i).buffer },
      } }),
    });
    Object.defineProperty(navigator.credentials, "get", { configurable: true, value: async (options: CredentialRequestOptions) => {
      const pk = options.publicKey!;
      const bytes = (value: BufferSource) => ArrayBuffer.isView(value)
        ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength) : new Uint8Array(value);
      calls.push({ operation: "get", allowed: pk.allowCredentials?.length ?? 0,
        input: new TextDecoder().decode(bytes(pk.extensions!.prf!.eval!.first)),
        challenge: [...bytes(pk.challenge)].join(",") });
      if (mode === "cancel" || (mode === "create" && calls.length === 1)) throw new DOMException("Cancelled", "NotAllowedError");
      if (mode === "delayed") return new Promise(resolve => {
        Object.assign(window, { finishPasskey: () => resolve(credential()), passkeySignal: options.signal });
      });
      return credential();
    } });
    Object.defineProperty(navigator.credentials, "create", { configurable: true, value: async () => {
      calls.push({ operation: "create", allowed: 0, input: "", challenge: "" });
      return credential(true);
    } });
  }, { mode });
}

test("one passkey entry restores the vector without an account, storage, or identity request", async ({ page, context }) => {
  await mockPasskey(page, "success");
  const traffic: string[] = [];
  context.on("request", r => traffic.push(r.url(), JSON.stringify(r.headers()), r.postData() ?? ""));
  await profile(page);
  await expect(page.getByRole("button", { name: "Create a new reader", exact: true })).toHaveCount(0);
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await page.getByRole("button", { name: "Continue with passkey", exact: true }).click();
  await expect(page.getByText("Reader unlocked", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
  const result = page.waitForResponse(r => new URL(r.url()).pathname === "/article/the-quiet-web");
  await selectArticle(page, "The quiet web");
  expect((await (await result).json()).publicKey).toBe(vector.publicKey);
  await page.reload();
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await expect(page.getByText("Reader locked", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Continue with passkey", exact: true }).click();
  await expect(page.getByText("Reader unlocked", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
  expect(await page.evaluate(async () => ({ local: localStorage.length, session: sessionStorage.length,
    databases: await indexedDB.databases(), caches: await caches.keys() }))).toEqual({ local: 0, session: 0, databases: [], caches: [] });
  expect(await context.cookies()).toEqual([]);
  for (const secret of [vector.seed, vector.prf]) expect(traffic.join("\n")).not.toContain(secret);
  expect(traffic.some(s => /\/login|\/register|\/credential/.test(s))).toBe(false);
});

for (const mode of ["cancel", "unsupported", "short"] as const) {
  test(`${mode} leaves the reader locked without creating a credential`, async ({ page }) => {
    await mockPasskey(page, mode);
    await profile(page);
    await page.getByRole("button", { name: "Continue with passkey", exact: true }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByText("Reader locked", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create a new reader", exact: true })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { passkeyCalls: { operation: string }[] }).passkeyCalls.map(c => c.operation))).toEqual(["get"]);
  });
}

test("explicit creation evaluates PRF on the created credential when the provider requires a second prompt", async ({ page }) => {
  await mockPasskey(page, "create");
  await profile(page);
  await page.getByRole("button", { name: "Continue with passkey", exact: true }).click();
  await page.getByRole("button", { name: "Create a new reader", exact: true }).click();
  await expect(page.getByText("Reader unlocked", { exact: true })).toBeVisible();
  const calls = await page.evaluate(() => (window as unknown as { passkeyCalls: { operation: string; allowed: number; input: string; challenge: string }[] }).passkeyCalls);
  expect(calls.map(c => c.operation)).toEqual(["get", "create", "get"]);
  expect(calls[0].allowed).toBe(0);
  expect(calls[2].allowed).toBe(1);
  expect(calls[0].input).toBe("stateless-reader/passkey/v2");
  expect(calls[2].input).toBe(calls[0].input);
  expect(calls[2].challenge).not.toBe(calls[0].challenge);
});

for (const action of ["dismiss", "cancel", "retry"] as const) {
  test(`a late passkey result cannot revive a reader after ${action}`, async ({ page }) => {
    await mockPasskey(page, "delayed");
    await profile(page);
    await page.getByRole("button", { name: "Continue with passkey", exact: true }).click();
    await expect(page.getByText("Unlocking reader…", { exact: true })).toBeVisible();
    if (action === "dismiss") await page.keyboard.press("Escape");
    if (action !== "dismiss") await page.getByRole("button", { name: "Cancel", exact: true }).click();
    if (action === "retry") await unlockReader(page, [...Buffer.from(vector.prf, "hex")]);
    expect(await page.evaluate(() => (window as unknown as { passkeySignal: AbortSignal }).passkeySignal.aborted)).toBe(true);
    await page.evaluate(() => (window as unknown as { finishPasskey: () => void }).finishPasskey());
    await page.waitForTimeout(300);
    if (action === "dismiss") await page.getByRole("button", { name: "Profile", exact: true }).click();
    await expect(page.getByText(action === "retry" ? "Reader unlocked" : "Reader locked", { exact: true })).toBeVisible();
  });
}

test("native WebAuthn PRF creates and rediscovers a paid reader after lock and reload", async ({ page, context, request }) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: {
    protocol: "ctap2", ctap2Version: "ctap2_1", transport: "internal", hasResidentKey: true,
    hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf: true,
  } });
  // Simulate cancellation of the first discovery prompt; creation and all later
  // assertions use the native browser API and virtual authenticator unchanged.
  await profile(page, "http://localhost:4173");
  await page.evaluate(() => {
    const native = navigator.credentials.get.bind(navigator.credentials);
    let first = true;
    navigator.credentials.get = options => {
      if (first) { first = false; return Promise.reject(new DOMException("Cancelled", "NotAllowedError")); }
      return native(options);
    };
  });
  await page.getByRole("button", { name: "Continue with passkey", exact: true }).click();
  await page.getByRole("button", { name: "Create a new reader", exact: true }).click();
  await expect(page.getByText("Reader unlocked", { exact: true })).toBeVisible();
  await selectArticle(page, "The quiet web");
  const encoded = page.getByLabel("Payment request", { exact: true });
  await expect(encoded).toBeVisible();
  const payment = decodePaymentRequest(await encoded.inputValue());
  const token = await request.get(`${payment.mints![0]}/test/issue?amount=${payment.amount!.toNumber()}`);
  expect((await request.post(payment.transport![0]!.target, { data: await token.json() })).status()).toBe(200);
  await expect(page.getByRole("article")).toContainText("A quiet website begins with a stopping point.");
  await openProfile(page);
  await page.getByRole("button", { name: "Lock reader", exact: true }).click();
  await page.getByRole("button", { name: "Continue with passkey", exact: true }).click();
  await expect(page.getByText("Reader unlocked", { exact: true })).toBeVisible();
  await closeProfile(page);
  await expect(page.getByRole("article")).toContainText("A quiet website begins with a stopping point.");
  await page.reload();
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await expect(page.getByText("Reader locked", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Continue with passkey", exact: true }).click();
  await expect(page.getByText("Reader unlocked", { exact: true })).toBeVisible();
  await selectArticle(page, "The quiet web");
  await expect(page.getByRole("article")).toContainText("A quiet website begins with a stopping point.");
});
