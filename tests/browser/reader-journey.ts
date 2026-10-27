import { randomBytes } from "node:crypto";
import { expect, type Page } from "@playwright/test";

export async function closeDialog(page: Page) {
  if (await page.getByRole("dialog").count()) {
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
}

export async function openProfile(page: Page) {
  if (await page.getByRole("dialog", { name: "Your reader profile" }).isVisible()) return;
  await closeDialog(page);
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Your reader profile" })).toBeVisible();
}

// Model a provider returning the same secret on another visit/device. Native
// WebAuthn is exercised separately; this double does not claim sync support.
export async function unlockReader(page: Page, prf = [...randomBytes(32)]) {
  await openProfile(page);
  if (await page.getByRole("button", { name: "Lock reader", exact: true }).isVisible())
    await page.getByRole("button", { name: "Lock reader", exact: true }).click();
  await page.evaluate((bytes) => {
    Object.defineProperty(navigator.credentials, "get", { configurable: true, value: async () => ({
      type: "public-key", getClientExtensionResults: () => ({ prf: { results: { first: new Uint8Array(bytes).buffer } } }),
    }) });
  }, prf);
  await page.getByRole("button", { name: "Continue with passkey", exact: true }).click();
  await expect(page.getByText("Reader unlocked", { exact: true })).toBeVisible();
  return prf;
}

export async function lockReader(page: Page) {
  await openProfile(page);
  await page.getByRole("button", { name: "Lock reader", exact: true }).click();
}

export async function selectArticle(page: Page, title: string) {
  await closeDialog(page);
  await page.getByRole("button", { name: `Select ${title}`, exact: true }).click();
}

export async function closeProfile(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Your reader profile" })).toHaveCount(0);
}
