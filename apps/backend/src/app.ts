import { verifyArticleRequest, READER_PROTOCOL_VERSION } from "@stateless-reader/core";
import { PaymentRequest, PaymentRequestTransportType } from "@cashu/cashu-ts";
import { and, eq, sql } from "drizzle-orm";
import { openDatabase } from "./db";
import { sameDatabaseFile } from "./db/paths";
import { articles, publicCatalogue, type PublisherArticle } from "./articles";
import { accessGrants } from "./db/schema";
import type { Settlement } from "./settlement";
import { PaymentError, paymentHeaders, paymentToken, validPublicKey } from "./payment";
import { frontendFiles } from "./frontend";

export interface PublisherOptions {
  databasePath: string;
  hostname?: string;
  port?: number;
  /** Trusted external HTTPS origin; defaults to the listener for loopback development. */
  publicOrigin?: string;
  settlement?: Settlement;
  /** Override only for isolated mint tests; operator entry point fixes Minibits. */
  mint?: string;
  /** Publisher-owned fixture edition. Preserve IDs for corrections; never reuse them. */
  articles?: readonly PublisherArticle[];
  /** Optional Vite production build; only index.html and public assets are served. */
  frontendDirectory?: string;
}

export function startPublisher(options: PublisherOptions) {
  const frontend = options.frontendDirectory ? frontendFiles(options.frontendDirectory) : undefined;
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
  const catalogue = (options.articles ?? articles).map(article => ({ ...article, offer: {
    ...article.offer, mint: options.mint ?? article.offer.mint,
  } }));
  if (options.settlement?.databasePath && sameDatabaseFile(options.databasePath, options.settlement.databasePath)) {
    throw new Error('Application grants and Coco require separate database files');
  }
  const database = openDatabase(options.databasePath);
  // One process owns these grants and the check → swap → grant critical section.
  const payments = new Map<string, Promise<unknown>>();
  const activePayments = new Set<Promise<void>>();
  let draining = false;
  async function serialized<T>(pair: string, task: () => Promise<T>): Promise<T> {
    const previous = payments.get(pair) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(task);
    payments.set(pair, current);
    try { return await current; }
    finally { if (payments.get(pair) === current) payments.delete(pair); }
  }
  const hasGrant = (articleId: string, publicKey: string) => database.db.select().from(accessGrants).where(and(
    eq(accessGrants.articleId, articleId), eq(accessGrants.publicKey, publicKey),
    eq(accessGrants.protocolVersion, READER_PROTOCOL_VERSION),
  )).get();

  try {
    // Read the required schema without creating or migrating it. Fail before listening.
    try {
      database.db.select().from(accessGrants).limit(0).all();
    } catch {
      throw new Error("Application database is not prepared. Run the application migration command before starting the publisher.");
    }
    const server = Bun.serve({
      hostname: options.hostname ?? "127.0.0.1",
      port: options.port ?? 3000,
      routes: {
        "/articles": {
          GET: () => Response.json({ articles: publicCatalogue(catalogue) }),
        },
        "/article/:articleId": {
          GET: (request) => {
            const headers = { "Cache-Control": "no-store" };
            const article = catalogue.find((article) => article.id === request.params.articleId);
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
            if (hasGrant(article.id, publicKey)) {
              return Response.json({ articleId: article.id, publicKey, protocolVersion: READER_PROTOCOL_VERSION,
                title: article.title, body: article.body }, { headers });
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
        "/payment/:articleId/:publicKey": {
          OPTIONS: () => new Response(null, { status: 204, headers: paymentHeaders }),
          POST: async (request) => {
            let finished!: () => void;
            const active = new Promise<void>(resolve => { finished = resolve; });
            activePayments.add(active);
            try {
              if (draining) throw new PaymentError("Publisher shutting down", 503);
              const { articleId, publicKey } = request.params;
              const article = catalogue.find(a => a.id === articleId);
              if (!article) throw new PaymentError("Not found", 404);
              if (!validPublicKey(publicKey)) throw new PaymentError("Invalid article public key");
              const token = await paymentToken(request, article.offer);
              return await serialized(`${READER_PROTOCOL_VERSION}:${articleId}:${publicKey}`, async () => {
                if (hasGrant(articleId, publicKey)) throw new PaymentError("Article access already granted", 409);
                if (!options.settlement) throw new PaymentError("Payments unavailable", 503);
                const result = await options.settlement.receive(token);
                if (result.state !== "finalized") throw new PaymentError("Payment not finalized", 422);
                // Deliberate crash gap: mint settlement and this insert are not atomic.
                database.db.insert(accessGrants).values({ articleId, publicKey, protocolVersion: READER_PROTOCOL_VERSION }).run();
                return Response.json({ status: "paid", articleId, publicKey, protocolVersion: READER_PROTOCOL_VERSION }, { headers: paymentHeaders });
              });
            } catch (error) {
              return Response.json({ error: error instanceof PaymentError ? error.message : "Payment could not be completed" },
                { status: error instanceof PaymentError ? error.status : 422, headers: paymentHeaders });
            } finally {
              finished();
              activePayments.delete(active);
            }
          },
        },
      },
      fetch(request) {
        if (request.method === "GET" || request.method === "HEAD") {
          const file = frontend?.get(new URL(request.url).pathname);
          if (file) return file(request.method === "HEAD");
        }
        return Response.json({ error: "Not found" }, { status: 404 });
      },
      error() {
        return Response.json({ error: "Internal server error" }, { status: 500 });
      },
    });

    let stopping: Promise<void> | undefined;
    return {
      url: server.url,
      stop() {
        stopping ??= (async () => {
          draining = true;
          const stopped = server.stop(false);
          server.closeIdleConnections();
          // A disconnected wallet must not let its still-running swap outlive SQLite.
          await Promise.allSettled([...activePayments]);
          await stopped;
          // Bun can retain idle keep-alive sockets after a graceful stop.
          server.closeIdleConnections();
          try { await options.settlement?.close?.(); }
          finally { database.close(); }
        })();
        return stopping;
      },
    };
  } catch (error) {
    database.close();
    throw error;
  }
}
