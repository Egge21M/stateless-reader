import { openProfile, unlockReader } from "./reader-journey";
import { expect, test } from "@playwright/test";

test.use({ trace: "off" });

test("profile traps focus and returns it on dismissal", async ({ page }) => {
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Profile", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Your reader profile" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("textbox")).toHaveCount(0);
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("Tab");
    await expect.poll(() => dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(trigger).toBeFocused();
});

for (const dismissal of ["Escape", "outside", "Close"] as const) {
  test(`payment dialog traps focus and stops checking on ${dismissal}, then checks afresh`, async ({ page }) => {
    await page.goto("/");
    await unlockReader(page);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const authorizations: string[] = [];
    page.on("request", request => {
      if (new URL(request.url()).pathname === "/article/the-quiet-web") authorizations.push(request.headers().authorization);
    });
    await page.getByRole("button", { name: "Select The quiet web", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Read The quiet web" });
    await expect(dialog.getByLabel("Payment request", { exact: true })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(1);
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      await expect.poll(() => dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
    }
    if (dismissal === "Escape") await page.keyboard.press("Escape");
    else if (dismissal === "outside") await page.mouse.click(4, 4);
    else await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const count = authorizations.length;
    await page.waitForTimeout(1800);
    expect(authorizations).toHaveLength(count);
    const reopen = page.getByRole("button", { name: "Check article access", exact: true });
    await expect(reopen).toBeFocused();
    await reopen.click();
    await expect(dialog).toBeVisible();
    expect(authorizations.length).toBeGreaterThan(count);
    expect(authorizations.at(-1)).not.toBe(authorizations[count - 1]);
  });
}

test("locked article opens profile and waits for its dismissal before payment", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Select The quiet web", exact: true }).click();
  const entry = page.getByRole("button", { name: "Set up reading access", exact: true });
  await entry.click();
  await expect(page.getByRole("dialog", { name: "Your reader profile" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(entry).toBeFocused();
  await entry.click();
  await unlockReader(page);
  await page.waitForTimeout(1800);
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(page.getByLabel("Payment request", { exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Read The quiet web" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect.poll(() => page.getByRole("dialog").evaluate(el => el.contains(document.activeElement))).toBe(true);
});

test("locking removes reader controls until the next unlock", async ({ page }) => {
  await page.goto("/");
  await unlockReader(page);
  await openProfile(page);
  await page.getByRole("button", { name: "Lock reader", exact: true }).click();
  await expect(page.getByRole("button", { name: "Login with passkey", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Lock reader", exact: true })).toHaveCount(0);
});
