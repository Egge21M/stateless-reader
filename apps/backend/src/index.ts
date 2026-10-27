import { sql } from "drizzle-orm";
import { openDatabase } from "./db";

const database = openDatabase();

const server = Bun.serve({
  hostname: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 3000),
  routes: {
    "/health": {
      GET: () => {
        database.db.get(sql`SELECT 1`);
        return Response.json({ status: "ok" });
      },
    },
  },
  fetch() {
    return Response.json({ error: "Not found" }, { status: 404 });
  },
  error(error) {
    console.error(error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  },
});

console.log(`Backend listening on ${server.url}`);

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  await server.stop();
  database.close();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
