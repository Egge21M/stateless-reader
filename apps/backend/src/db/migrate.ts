import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { openDatabase } from "./index";

const database = openDatabase();

try {
  migrate(database.db, {
    migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)),
  });
  console.log("Database migrations applied.");
} finally {
  database.close();
}
