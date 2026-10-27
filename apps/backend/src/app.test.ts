import type { ArticleOffer, PaymentRequiredResponse } from "@stateless-reader/core";
import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startPublisher } from "./app";
import { migrateApplication } from "./db/migrate";

const publishers: ReturnType<typeof startPublisher>[] = [];
const directories: string[] = [];

interface CatalogueResponse {
  articles: {
    id: string;
    title: string;
    preview: string;
    offer: ArticleOffer;
  }[];
}

async function temporaryDatabase(prepared = true) {
  const directory = await mkdtemp(join(tmpdir(), "publisher-test-"));
  directories.push(directory);
  const path = join(directory, "application.sqlite");
  if (prepared) migrateApplication(path);
  return path;
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

test("publisher startup requires explicit application migration before serving signed reads", async () => {
  const databasePath = await temporaryDatabase(false);
  // The initial application migration is pending. Neither attempt may apply it.
  for (let attempt = 0; attempt < 2; attempt++) {
    expect(() => {
      const publisher = startPublisher({ port: 0, databasePath });
      publishers.push(publisher);
    }).toThrow("Application database is not prepared");
  }

  const migration = Bun.spawn([process.execPath, new URL("./db/migrate.ts", import.meta.url).pathname], {
    env: { ...process.env, DATABASE_PATH: databasePath }, stdout: "pipe", stderr: "pipe",
  });
  expect(await migration.exited).toBe(0);
  expect(await new Response(migration.stderr).text()).toBe("");

  const publisher = startPublisher({ port: 0, databasePath });
  publishers.push(publisher);
  const { readerFromPasskey, signArticleRequest } = await import("@stateless-reader/core");
  const { seed } = await readerFromPasskey(new Uint8Array(32).fill(1));
  const path = "/article/the-quiet-web";
  const response = await fetch(new URL(path, publisher.url), { headers: {
    authorization: signArticleRequest(seed, {
      articleId: "the-quiet-web", method: "GET", path, timestamp: Math.floor(Date.now() / 1000),
    }),
  } });
  expect(response.status).toBe(402);
  expect((await response.json() as PaymentRequiredResponse).offer.amount).toBe(21);
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

test("a production publisher serves the built reader and assets without exposing private files or masking API errors", async () => {
  const databasePath = await temporaryDatabase();
  const frontendDirectory = databasePath + ".frontend";
  await mkdir(join(frontendDirectory, "assets"), { recursive: true });
  await writeFile(join(frontendDirectory, "index.html"), '<!doctype html><script src="/assets/reader.js"></script>');
  await writeFile(join(frontendDirectory, "assets/reader.js"), 'document.title = "Reader";');
  await writeFile(join(frontendDirectory, ".env"), "private configuration");
  await symlink(databasePath, join(frontendDirectory, "assets/private.js"));
  const publisher = startPublisher({ port: 0, databasePath, frontendDirectory });
  publishers.push(publisher);

  const page = await fetch(new URL("/", publisher.url));
  expect(page.status).toBe(200);
  expect(page.headers.get("content-type")).toContain("text/html");
  expect(page.headers.get("cache-control")).toBe("no-store");
  expect(await page.text()).toContain('/assets/reader.js');
  const asset = await fetch(new URL("/assets/reader.js", publisher.url));
  expect(asset.status).toBe(200);
  expect(asset.headers.get("content-type")).toContain("javascript");
  expect(await asset.text()).toBe('document.title = "Reader";');
  expect((await fetch(new URL("/articles", publisher.url))).status).toBe(200);
  expect((await fetch(new URL("/article/the-quiet-web", publisher.url))).status).toBe(401);
  for (const path of ["/missing", "/assets/missing.js", "/.env", "/application.sqlite", "/assets/private.js", "/assets/%2e%2e/.env", "/src/articles.ts"]) {
    const response = await fetch(new URL(path, publisher.url));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found" });
  }
  expect((await fetch(publisher.url, { method: "POST" })).status).toBe(404);
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
  const frontendDirectory = databasePath + ".frontend";
  await mkdir(join(frontendDirectory, "assets"), { recursive: true });
  await writeFile(join(frontendDirectory, "index.html"), '<!doctype html><title>Built reader</title>');
  const child = Bun.spawn([process.execPath, new URL("./index.ts", import.meta.url).pathname], {
    env: { ...process.env, HOST: "127.0.0.1", PORT: "0", DATABASE_PATH: databasePath,
      FRONTEND_DIST_PATH: frontendDirectory,
      COCO_DATABASE_PATH: databasePath + ".coco", PUBLISHER_SEED_HEX: "2a".repeat(64) },
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
    const page = await fetch(url);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('<title>Built reader</title>');
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

test("an unpaid signed article returns an ordinary NUT-18 bound to its fixed offer and reader key", async () => {
  const { signArticleRequest, readerFromPasskey } = await import("@stateless-reader/core");
  const { decodePaymentRequest, PaymentRequestTransportType } = await import("@cashu/cashu-ts");
  const publisher = startPublisher({ port: 0, databasePath: await temporaryDatabase() });
  publishers.push(publisher);
  const { seed } = await readerFromPasskey(new Uint8Array(32).fill(1));
  const path = "/article/the-quiet-web";
  const authorization = signArticleRequest(seed, {
    articleId: "the-quiet-web", method: "GET", path, timestamp: Math.floor(Date.now() / 1000),
  });
  for (let replay = 0; replay < 2; replay++) {
    const response = await fetch(new URL(path, publisher.url), { headers: { authorization } });
    expect(response.status).toBe(402);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json() as PaymentRequiredResponse;
    expect(Object.keys(body).sort()).toEqual(["articleId", "offer", "paymentRequest", "protocolVersion", "publicKey"]);
    expect(body.articleId).toBe("the-quiet-web");
    expect(body.protocolVersion).toBe(1);
    expect(body.offer).toEqual({ amount: 21, mint: "https://mint.minibits.cash/Bitcoin", unit: "sat" });
    expect(body.publicKey).toBe("9fe9c11b3dbf30b805ba584655084ffe8c8007ea3f8f27ffdd4c7e588d42b9b8");
    expect(body.paymentRequest).toMatch(/^creqA[A-Za-z0-9_=-]+$/);
    const payment = decodePaymentRequest(body.paymentRequest);
    expect(payment.amount?.toNumber()).toBe(21);
    expect(payment.unit).toBe("sat");
    expect(payment.mints).toEqual(["https://mint.minibits.cash/Bitcoin"]);
    expect(payment.singleUse).toBe(true);
    // CDK 0.17.7 requires an array when the CBOR transport g member is present.
    // Pinned external parser evidence: docs/evidence/issue-7/cdk-interop.md.
    expect(payment.transport).toEqual([{ type: PaymentRequestTransportType.POST, tags: [],
      target: `${publisher.url.origin}/payment/the-quiet-web/${body.publicKey}` }]);
  }
});

test("HTTP rejects altered, malformed, stale and wrong-key authorization without disclosure", async () => {
  const { signArticleRequest, readerFromPasskey } = await import("@stateless-reader/core");
  const publisher = startPublisher({ port: 0, databasePath: await temporaryDatabase() });
  publishers.push(publisher);
  const { seed } = await readerFromPasskey(new Uint8Array(32).fill(1));
  const now = Math.floor(Date.now() / 1000);
  const binding = { articleId: "the-quiet-web", method: "GET", path: "/article/the-quiet-web", timestamp: now };
  const valid = signArticleRequest(seed, binding);
  const cases = [
    { path: binding.path, authorization: "garbage" },
    { path: binding.path, authorization: valid.slice(0, -1) + (valid.endsWith("f") ? "e" : "f") },
    { path: binding.path, authorization: valid.replace("9fe9c11b3dbf30b805ba584655084ffe8c8007ea3f8f27ffdd4c7e588d42b9b8", "0d174f330614021cad5085b2325d6fabb9a0d0fe18ffe5c6663fc0ade32efbc3") },
    { path: binding.path, authorization: signArticleRequest(seed, { ...binding, timestamp: now - 65 }) },
    { path: binding.path, authorization: signArticleRequest(seed, { ...binding, timestamp: now + 65 }) },
    { path: binding.path, authorization: signArticleRequest(seed, { ...binding, method: "POST" }) },
    { path: binding.path, authorization: signArticleRequest(seed, { ...binding, articleId: "a-library-in-your-pocket" }) },
    { path: binding.path + "?changed=1", authorization: valid },
    { path: "/article/a-library-in-your-pocket", authorization: valid },
  ];
  for (const { path, authorization } of cases) {
    const response = await fetch(new URL(path, publisher.url), { headers: { authorization } });
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "Article authorization required" });
  }
  const unknown = await fetch(new URL("/article/missing", publisher.url), { headers: { authorization: valid } });
  expect(unknown.status).toBe(404);
  expect(await unknown.json()).toEqual({ error: "Not found" });
  const wrongMethod = await fetch(new URL(binding.path, publisher.url), { method: "POST", headers: { authorization: valid } });
  expect(wrongMethod.status).toBe(404);
  expect(await wrongMethod.json()).toEqual({ error: "Not found" });
});

test("NUT-18 uses the configured HTTPS origin rather than caller-controlled hosts", async () => {
  const { signArticleRequest, readerFromPasskey } = await import("@stateless-reader/core");
  const { decodePaymentRequest } = await import("@cashu/cashu-ts");
  const publisher = startPublisher({ port: 0, databasePath: await temporaryDatabase(), publicOrigin: "https://publisher.example" });
  publishers.push(publisher);
  const { seed } = await readerFromPasskey(new Uint8Array(32).fill(1));
  const path = "/article/the-quiet-web";
  const authorization = signArticleRequest(seed, { articleId: "the-quiet-web", path, method: "GET", timestamp: Math.floor(Date.now() / 1000) });
  const response = await fetch(new URL(path, publisher.url), {
    headers: { authorization, Host: "attacker.example", "X-Forwarded-Host": "attacker.example", "X-Forwarded-Proto": "http" },
  });
  expect(response.status).toBe(402);
  const body = await response.json() as PaymentRequiredResponse;
  expect(decodePaymentRequest(body.paymentRequest).transport?.[0]?.target)
    .toBe(`https://publisher.example/payment/the-quiet-web/${body.publicKey}`);
});

test.each(['', 'not-a-seed', 'ab'.repeat(32)])('operator startup rejects missing/malformed publisher seed without leaking it', async (secret) => {
  const child = Bun.spawn([process.execPath, new URL('./index.ts', import.meta.url).pathname], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: '0', DATABASE_PATH: await temporaryDatabase(), PUBLISHER_SEED_HEX: secret },
    stdout: 'pipe', stderr: 'pipe',
  });
  const timeout = setTimeout(() => child.kill(), 1000);
  try {
    expect(await child.exited).toBe(1);
    expect(await new Response(child.stdout).text()).toBe('');
    const error = await new Response(child.stderr).text();
    expect(error).toContain('Publisher startup failed');
    if (secret) expect(error).not.toContain(secret);
  } finally { clearTimeout(timeout); }
});

test('operator startup rejects using one file for both application and Coco state', async () => {
  const path = await temporaryDatabase();
  const child = Bun.spawn([process.execPath, new URL('./index.ts', import.meta.url).pathname], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: '0', DATABASE_PATH: path,
      COCO_DATABASE_PATH: path, PUBLISHER_SEED_HEX: '2a'.repeat(64) },
    stdout: 'pipe', stderr: 'pipe',
  });
  expect(await child.exited).toBe(1);
  expect(await new Response(child.stdout).text()).toBe('');
  expect(await new Response(child.stderr).text()).toContain('Publisher startup failed');
});
