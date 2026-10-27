import { startPublisher } from "./app";
import { databasePath } from "./db/config";

export { startPublisher } from "./app";
export type { PublisherOptions } from "./app";

if (import.meta.main) {
  const publisher = startPublisher({
    hostname: process.env.HOST ?? "127.0.0.1",
    port: Number(process.env.PORT ?? 3000),
    databasePath,
    publicOrigin: process.env.PUBLIC_ORIGIN,
  });

  console.log(`Backend listening on ${publisher.url}`);

  let stopping = false;
  async function shutdown() {
    if (stopping) return;
    stopping = true;
    await publisher.stop();
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
