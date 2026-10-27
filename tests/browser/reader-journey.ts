import { expect, type Page } from "@playwright/test";

export async function closeDialog(page: Page) {
  if (await page.getByRole("dialog").count()) {
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
}

export async function openProfile(page: Page) {
  if (
    await page.getByRole("dialog", { name: "Your reader profile" }).isVisible()
  )
    return;
  await closeDialog(page);
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Your reader profile" }),
  ).toBeVisible();
}

export async function lockReader(page: Page) {
  await openProfile(page);
  await page.getByRole("button", { name: "Lock reader", exact: true }).click();
}

export async function selectArticle(page: Page, title: string) {
  await closeDialog(page);
  await page
    .getByRole("button", { name: `Select ${title}`, exact: true })
    .click();
}

// Restoring a selected article hands off to payment as soon as Profile closes.
export async function closeProfile(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Your reader profile" })).toHaveCount(0);
}
