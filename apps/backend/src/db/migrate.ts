import { openDatabase } from "./index";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { migrationsFolder } from "../migration-path";

/** Explicit application preparation. Coco migrates its own separate file. */
export function migrateApplication(path?: string) {
  const database = openDatabase(path);
  try { migrate(database.db, { migrationsFolder }); }
  finally { database.close(); }
}

if (import.meta.main) {
  migrateApplication();
  console.log("Database migrations applied.");
}
