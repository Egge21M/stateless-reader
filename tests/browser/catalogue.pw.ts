import { expect, test } from "@playwright/test";

test("a reader browses the publisher catalogue without an account or recovery phrase", async ({ page, request }) => {
  const response = await request.get("/articles");
  expect(response.ok()).toBe(true);
  const { articles } = await response.json();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Find your next good read." })).toBeVisible();
  const listings = page.getByRole("list", { name: "Articles" }).getByRole("listitem");
  await expect(listings).toHaveCount(articles.length);
  for (const article of articles) {
    const listing = listings.filter({ has: page.getByRole("heading", { name: article.title, exact: true }) });
    await expect(listing).toContainText(article.preview);
    await expect(listing).toContainText(`${article.offer.amount} ${article.offer.unit}`);
    await expect(listing.getByRole("button", { name: `Select ${article.title}` })).toBeVisible();
  }
});

test("selecting an article identifies the intended read without claiming access", async ({ page }) => {
  await page.goto("/");
  const first = page.getByRole("button", { name: "Select The quiet web", exact: true });
  await first.focus();
  await page.keyboard.press("Enter");
  const selection = page.getByRole("region", { name: "Selected article" });
  await expect(selection).toBeVisible();
  await expect(selection.getByRole("heading", { name: "The quiet web", exact: true })).toBeFocused();
  await expect(selection).toContainText("21 sat");
  await expect(selection).toContainText("Full article locked");
  await expect(selection).toContainText("Purchasing is not available yet.");
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("A quiet website begins with a stopping point.", { exact: false })).toHaveCount(0);

  const second = page.getByRole("button", { name: "Select A library in your pocket", exact: true });
  await second.click();
  await expect(selection.getByRole("heading", { name: "A library in your pocket", exact: true })).toBeFocused();
  await expect(first).toHaveAttribute("aria-pressed", "false");
  await expect(second).toHaveAttribute("aria-pressed", "true");
  await selection.getByRole("button", { name: "Clear selection" }).click();
  await expect(selection).toHaveCount(0);
  await expect(second).toBeFocused();
});

test("a pending catalogue request explains that articles are loading", async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/articles", async (route) => {
    await pending;
    await route.continue();
  });
  try {
    await page.goto("/");
    await expect(page.getByRole("status")).toContainText("Loading articles");
    await expect(page.getByText("0 articles", { exact: true })).toHaveCount(0);
  } finally {
    release();
  }
  await expect(page.getByRole("heading", { name: "The quiet web", exact: true })).toBeVisible();
  await expect(page.getByText("Loading articles")).toHaveCount(0);
});

test("an empty catalogue explains the absence and lets the reader check again", async ({ page }) => {
  // Substitute only the HTTP response at the browser boundary for this rare state.
  await page.route("**/articles", (route) => route.fulfill({ json: { articles: [] } }));
  await page.goto("/");
  await expect(page.getByRole("status")).toContainText("No articles available yet");
  await expect(page.getByText("The publisher has not listed any articles. Check back soon.")).toBeVisible();
  await page.unroute("**/articles");
  await page.getByRole("button", { name: "Check again" }).click();
  await expect(page.getByRole("heading", { name: "The quiet web", exact: true })).toBeVisible();
});

test("a failed catalogue request has a retry that recovers from the publisher", async ({ page }) => {
  await page.route("**/articles", (route) => route.fulfill({ status: 503, json: { error: "Unavailable" } }));
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("Could not load articles");
  await expect(page.getByRole("alert")).toContainText("Check your connection and try again.");
  await page.unroute("**/articles");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "The quiet web", exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("an unusable catalogue response shows an error instead of breaking the page", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/articles", (route) => route.fulfill({ json: { articles: [{ id: "incomplete" }] } }));
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("Could not load articles");
  expect(errors).toEqual([]);
  await page.unroute("**/articles");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "The quiet web", exact: true })).toBeVisible();
});

test("the frontend cannot serve publisher-only fixture source", async ({ request }) => {
  const source = new URL("../../apps/backend/src/articles.ts", import.meta.url).pathname;
  for (const suffix of ["", "?raw"]) {
    const response = await request.get(`/@fs${source}${suffix}`);
    expect(response.status()).toBe(403);
    expect(await response.text()).not.toContain("A quiet website begins with a stopping point.");
  }
});
