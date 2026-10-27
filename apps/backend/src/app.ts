import { sql } from "drizzle-orm";
import { openDatabase } from "./db";

export interface PublisherOptions {
  databasePath: string;
  hostname?: string;
  port?: number;
}

export function startPublisher(options: PublisherOptions) {
  const database = openDatabase(options.databasePath);

  try {
    const server = Bun.serve({
      hostname: options.hostname ?? "127.0.0.1",
      port: options.port ?? 3000,
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

    let stopping: Promise<void> | undefined;
    return {
      url: server.url,
      stop() {
        stopping ??= (async () => {
          // Close keep-alive connections before releasing their database.
          await server.stop(true);
          database.close();
        })();
        return stopping;
      },
    };
  } catch (error) {
    database.close();
    throw error;
  }
}
