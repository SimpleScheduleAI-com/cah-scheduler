import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";

// DATABASE_PATH lets hosted deploys (Railway) point the DB at a persistent
// volume (e.g. /data/cah-scheduler.db) — the container filesystem is wiped on
// every redeploy. Unset locally, it falls back to the project directory.
const dbPath = process.env.DATABASE_PATH ?? path.join(process.cwd(), "cah-scheduler.db");
const sqlite = new Database(dbPath);

sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
export { schema };
