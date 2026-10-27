import { defineConfig } from "drizzle-kit";
import { databasePath } from "./src/db/config";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: databasePath },
});
