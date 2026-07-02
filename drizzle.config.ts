import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  schema: "./src/db/schema.ts",
  dialect: "sqlite",
  dbCredentials: {
    // Must match src/db/index.ts — `npm run build` runs db:push, and on Railway
    // it has to migrate the volume-mounted DB, not a file in the app dir.
    url: process.env.DATABASE_PATH ?? "./cah-scheduler.db",
  },
});
