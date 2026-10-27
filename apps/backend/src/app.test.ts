import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startPublisher } from "./app";

const publishers: ReturnType<typeof startPublisher>[] = [];
const directories: string[] = [];

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
