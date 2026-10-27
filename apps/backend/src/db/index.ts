import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { databasePath } from "./config";
import * as schema from "./schema";

export function openDatabase(path = databasePath) {
  const sqlite = new Database(path, { create: true, strict: true });
  sqlite.exec("PRAGMA journal_mode = WAL;");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  sqlite.exec("PRAGMA busy_timeout = 5000;");

  const db = drizzle(sqlite, { schema });
  return { db, close: () => sqlite.close() };
}
