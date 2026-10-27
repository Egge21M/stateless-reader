import { verifyArticleRequest, READER_PROTOCOL_VERSION } from "@stateless-reader/core";
import { PaymentRequest, PaymentRequestTransportType } from "@cashu/cashu-ts";
import { sql } from "drizzle-orm";
import { openDatabase } from "./db";
import { articles, publicCatalogue } from "./articles";

export interface PublisherOptions {
  databasePath: string;
  hostname?: string;
  port?: number;
  /** Trusted external HTTPS origin; defaults to the listener for loopback development. */
  publicOrigin?: string;
}

export function startPublisher(options: PublisherOptions) {
  let publicOrigin: string | undefined;
  if (options.publicOrigin) {
    const origin = new URL(options.publicOrigin);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
    if ((origin.protocol !== "https:" && !(origin.protocol === "http:" && loopback)) ||
        origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
      throw new Error("PUBLIC_ORIGIN must be an HTTPS origin (HTTP only on loopback)");
    }
    publicOrigin = origin.origin;
  }
  const database = openDatabase(options.databasePath);

  try {
    const server = Bun.serve({
      hostname: options.hostname ?? "127.0.0.1",
      port: options.port ?? 3000,
      routes: {
        "/articles": {
          GET: () => Response.json({ articles: publicCatalogue() }),
        },
        "/article/:articleId": {
          GET: (request) => {
            const headers = { "Cache-Control": "no-store" };
            const article = articles.find((article) => article.id === request.params.articleId);
            if (!article) {
              return Response.json({ error: "Not found" }, { status: 404, headers });
            }
            const url = new URL(request.url);
            const publicKey = verifyArticleRequest(request.headers.get("authorization"), {
              articleId: article.id, method: request.method, path: url.pathname + url.search,
            });
            if (!publicKey) {
              return Response.json({ error: "Article authorization required" }, { status: 401, headers });
            }
            const payment = new PaymentRequest(
              [{ type: PaymentRequestTransportType.POST,
                target: `${publicOrigin ?? server.url.origin}/payment/${article.id}/${publicKey}` }],
              undefined, article.offer.amount, article.offer.unit, [article.offer.mint], article.title, true,
            );
            return Response.json({
              articleId: article.id, publicKey, protocolVersion: READER_PROTOCOL_VERSION,
              offer: article.offer,
              paymentRequest: payment.toEncodedCreqA().replace(/\+/g, "-").replace(/\//g, "_"),
            }, { status: 402, headers });
          },
        },
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
