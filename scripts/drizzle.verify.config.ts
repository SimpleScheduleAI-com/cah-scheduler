import { defineConfig } from "drizzle-kit";
import path from "path";
import os from "os";

/**
 * Drizzle config for the schedule-period verification harness
 * (scripts/verify-schedule-periods.ts). Points at a SCRATCH database in the
 * OS temp directory so verification never touches the development database.
 */
export default defineConfig({
  out: "./drizzle",
  schema: "./src/db/schema.ts",
  dialect: "sqlite",
  dbCredentials: {
    url: path.join(os.tmpdir(), "cah-verify", "cah-scheduler.db"),
  },
});
