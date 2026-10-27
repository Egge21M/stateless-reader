import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startPublisher } from "./app";

const publishers: ReturnType<typeof startPublisher>[] = [];
const directories: string[] = [];

interface CatalogueResponse {
  articles: {
    id: string;
    title: string;
    preview: string;
    offer: { amount: number; unit: string; mint: string };
  }[];
}

async function temporaryDatabase() {
  const directory = await mkdtemp(join(tmpdir(), "publisher-test-"));
  directories.push(directory);
  return join(directory, "application.sqlite");
}

afterEach(async () => {
  await Promise.all(publishers.splice(0).map((publisher) => publisher.stop()));
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

test("an isolated publisher serves health using its temporary database", async () => {
  const publisher = startPublisher({
    hostname: "127.0.0.1",
    port: 0,
    databasePath: await temporaryDatabase(),
  });
  publishers.push(publisher);

  const response = await fetch(new URL("/health", publisher.url));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: "ok" });
});

test("importing the entry point neither starts a listener nor installs signal handlers", async () => {
  const entryPoint = new URL("./index.ts", import.meta.url).href;
  const child = Bun.spawn([
    process.execPath,
    "--eval",
    `await import(${JSON.stringify(entryPoint)});
     console.log(JSON.stringify({
       SIGINT: process.listenerCount("SIGINT"),
       SIGTERM: process.listenerCount("SIGTERM"),
     }));
     process.exit(0);`,
  ], {
    env: { ...process.env, HOST: "127.0.0.1", PORT: "0", DATABASE_PATH: await temporaryDatabase() },
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(exitCode).toBe(0);
  expect(stderr).toBe("");
  expect(stdout).toBe('{"SIGINT":0,"SIGTERM":0}\n');
});

test("unknown routes retain the JSON not-found response", async () => {
  const publisher = startPublisher({ port: 0, databasePath: await temporaryDatabase() });
  publishers.push(publisher);

  const response = await fetch(new URL("/missing", publisher.url));
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: "Not found" });
});

test("readers can browse stable article metadata and fixed sat offers without authentication", async () => {
  const publisher = startPublisher({ port: 0, databasePath: await temporaryDatabase() });
  publishers.push(publisher);

  const response = await fetch(new URL("/articles", publisher.url));
  expect(response.status).toBe(200);
  const catalogue = await response.json() as CatalogueResponse;
  expect(catalogue.articles.length).toBeGreaterThanOrEqual(5);
  expect(catalogue.articles.length).toBeLessThanOrEqual(10);
  expect(new Set(catalogue.articles.map((article) => article.id)).size)
    .toBe(catalogue.articles.length);
  for (const article of catalogue.articles) {
    // This allowlist is the public disclosure contract, including nested offer fields.
    expect(Object.keys(article).sort()).toEqual(["id", "offer", "preview", "title"]);
    expect(article.id).toMatch(/^[a-z0-9-]+$/);
    expect(article.title.length).toBeGreaterThan(0);
    expect(article.preview.length).toBeGreaterThan(0);
    expect(Object.keys(article.offer).sort()).toEqual(["amount", "mint", "unit"]);
    expect(article.offer.unit).toBe("sat");
    expect(article.offer.mint).toBe("https://mint.minibits.cash/Bitcoin");
    expect(Number.isSafeInteger(article.offer.amount)).toBe(true);
    expect(article.offer.amount).toBeGreaterThan(0);
  }
  expect(catalogue.articles[0]).toEqual({
    id: "the-quiet-web",
    title: "The quiet web",
    preview: "What happens when we build places to read, instead of places to scroll?",
    offer: { amount: 21, unit: "sat", mint: "https://mint.minibits.cash/Bitcoin" },
  });

  await publisher.stop();
  const restarted = startPublisher({ port: 0, databasePath: await temporaryDatabase() });
  publishers.push(restarted);
  const afterRestart = await fetch(new URL("/articles", restarted.url));
  expect(await afterRestart.json()).toEqual(catalogue);
});

test("public browsing and direct unauthenticated requests never disclose premium bodies", async () => {
  const publisher = startPublisher({ port: 0, databasePath: await temporaryDatabase() });
  publishers.push(publisher);
  const response = await fetch(new URL("/articles", publisher.url));
  const catalogueText = await response.text();
  const { articles } = JSON.parse(catalogueText) as CatalogueResponse;
  const privatePassages = [
    "A quiet website begins with a stopping point.",
    "The most useful library is not the largest one.",
    "One page can be the right unit of exchange.",
    "At a repair table, the first tool is a question:",
    "The slow train reveals the seams between places.",
    "An exit is part of a product.",
  ];
  for (const passage of privatePassages) expect(catalogueText).not.toContain(passage);

  for (const article of articles) {
    const unauthenticated = await fetch(new URL(`/article/${article.id}`, publisher.url));
    expect(unauthenticated.status).toBe(401);
    expect(await unauthenticated.json()).toEqual({ error: "Article authorization required" });
    const invalid = await fetch(new URL(`/article/${article.id}`, publisher.url), {
      headers: { Authorization: "Bearer not-an-article-signature" },
    });
    expect(invalid.status).toBe(401);
    expect(await invalid.json()).toEqual({ error: "Article authorization required" });
  }
  for (const path of ["/article/not-an-article", "/articles/the-quiet-web", "/fixtures", "/articles.json", "/src/articles.ts"]) {
    const missing = await fetch(new URL(path, publisher.url));
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "Not found" });
  }
});

test("publishers stop independently and release their ports for restart", async () => {
  const firstPath = await temporaryDatabase();
  const secondPath = await temporaryDatabase();
  const first = startPublisher({ port: 0, databasePath: firstPath });
  publishers.push(first);
  const second = startPublisher({ port: 0, databasePath: secondPath });
  publishers.push(second);

  expect(first.url.port).not.toBe(second.url.port);
  for (const publisher of [first, second]) {
    const response = await fetch(new URL("/health", publisher.url));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  }

  await Promise.all([first.stop(), first.stop()]);
  await expect(fetch(new URL("/health", first.url))).rejects.toThrow();
  const remaining = await fetch(new URL("/health", second.url));
  expect(remaining.status).toBe(200);
  expect(await remaining.json()).toEqual({ status: "ok" });

  const restarted = startPublisher({ port: Number(first.url.port), databasePath: firstPath });
  publishers.push(restarted);
  const response = await fetch(new URL("/health", restarted.url));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: "ok" });
});

test.each(["SIGINT", "SIGTERM"] as const)("CLI startup serves HTTP and shuts down on %s", async (signal) => {
  const databasePath = await temporaryDatabase();
  const child = Bun.spawn([process.execPath, new URL("./index.ts", import.meta.url).pathname], {
    env: { ...process.env, HOST: "127.0.0.1", PORT: "0", DATABASE_PATH: databasePath },
    stdout: "pipe",
    stderr: "pipe",
  });
  const deadline = setTimeout(() => child.kill("SIGKILL"), 4000);

  try {
    const reader = child.stdout.getReader();
    const { value } = await reader.read();
    reader.releaseLock();
    const output = new TextDecoder().decode(value).trim();
    expect(output).toStartWith("Backend listening on http://127.0.0.1:");
    const url = new URL(output.slice("Backend listening on ".length));
    const response = await fetch(new URL("/health", url));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });

    child.kill(signal);
    expect(await child.exited).toBe(0);
    expect(await new Response(child.stderr).text()).toBe("");

    const restarted = startPublisher({ port: Number(url.port), databasePath });
    publishers.push(restarted);
    const afterRestart = await fetch(new URL("/health", restarted.url));
    expect(afterRestart.status).toBe(200);
    expect(await afterRestart.json()).toEqual({ status: "ok" });
  } finally {
    clearTimeout(deadline);
    if (child.exitCode === null) child.kill("SIGKILL");
    await child.exited;
  }
});
