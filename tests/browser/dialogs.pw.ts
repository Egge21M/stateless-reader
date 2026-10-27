import { expect, test } from "@playwright/test";

// Never retain phrase-bearing DOM snapshots or screenshots.
test.use({ trace: "off" });

test("profile owns backup and draft, dismisses accessibly and returns focus", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Create reader phrase", exact: true }),
  ).toHaveCount(0);
  const trigger = page.getByRole("button", { name: "Profile", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Your reader profile" });
  await expect(dialog).toBeVisible();
  await page
    .getByRole("button", { name: "Create reader phrase", exact: true })
    .click();
  await expect(
    dialog.getByLabel("Your reader recovery phrase", { exact: true }),
  ).toBeVisible();
  await dialog
    .getByLabel("Restore reader recovery phrase", { exact: true })
    .fill("unfinished draft");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByLabel("Your reader recovery phrase", { exact: true }),
  ).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(
    dialog.getByLabel("Restore reader recovery phrase", { exact: true }),
  ).toHaveValue("");
  await expect(
    dialog.getByLabel("Your reader recovery phrase", { exact: true }),
  ).toHaveCount(0);
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    await expect
      .poll(() => dialog.evaluate((el) => el.contains(document.activeElement)))
      .toBe(true);
  }
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(trigger).toBeFocused();
});

for (const dismissal of ["Escape", "outside", "Close"] as const) {
  test(`payment dialog traps focus and stops checking on ${dismissal}, then checks afresh`, async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Profile", exact: true }).click();
    await page
      .getByRole("button", { name: "Create reader phrase", exact: true })
      .click();
    await expect(
      page.getByText("Reader unlocked", { exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const authorizations: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/article/the-quiet-web")
        authorizations.push(request.headers()["authorization"]);
    });
    await page
      .getByRole("button", { name: "Select The quiet web", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "Read The quiet web" });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByLabel("Payment request", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(
      page.getByLabel("Your reader recovery phrase", { exact: true }),
    ).toHaveCount(0);
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      await expect
        .poll(() =>
          dialog.evaluate((el) => el.contains(document.activeElement)),
        )
        .toBe(true);
    }
    if (dismissal === "Escape") await page.keyboard.press("Escape");
    else if (dismissal === "outside") await page.mouse.click(4, 4);
    else
      await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const count = authorizations.length;
    await page.waitForTimeout(1800);
    expect(authorizations).toHaveLength(count);
    const reopen = page.getByRole("button", {
      name: "Check article access",
      exact: true,
    });
    await expect(reopen).toBeFocused();
    await reopen.click();
    await expect(dialog).toBeVisible();
    expect(authorizations.length).toBeGreaterThan(count);
    expect(authorizations.at(-1)).not.toBe(authorizations[count - 1]);
  });
}

test("locked article opens profile, returns focus, and waits for profile dismissal before payment", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Select The quiet web", exact: true })
    .click();
  const entry = page.getByRole("button", {
    name: "Set up reading access",
    exact: true,
  });
  await entry.click();
  await expect(
    page.getByRole("dialog", { name: "Your reader profile" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(entry).toBeFocused();
  await entry.click();
  await page
    .getByRole("button", { name: "Create reader phrase", exact: true })
    .click();
  await expect(
    page.getByLabel("Your reader recovery phrase", { exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(1800);
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(page.getByLabel("Payment request", { exact: true })).toHaveCount(
    0,
  );
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Read The quiet web" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(
    page.getByLabel("Your reader recovery phrase", { exact: true }),
  ).toHaveCount(0);
  await expect
    .poll(() =>
      page
        .getByRole("dialog")
        .evaluate((el) => el.contains(document.activeElement)),
    )
    .toBe(true);
});

test("dismissing profile during phrase creation cannot unlock a hidden reader", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  // Two real controls, before the asynchronous derivation can finish.
  await page.getByRole("dialog").evaluate((dialog) => {
    const buttons = [...dialog.querySelectorAll("button")];
    buttons
      .find((button) => button.textContent?.trim() === "Create reader phrase")!
      .click();
    buttons.find((button) => button.textContent?.trim() === "Close")!.click();
  });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await expect(page.getByText("Reader locked", { exact: true })).toBeVisible();
  await expect(
    page.getByLabel("Your reader recovery phrase", { exact: true }),
  ).toHaveCount(0);
});
