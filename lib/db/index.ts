import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/**
 * Single pg Pool for the process, created lazily on first query so `next
 * build` never needs a database. The `pg` driver works unchanged against
 * both a local Postgres and Neon (Vercel), so there's one code path
 * everywhere. Cached on globalThis so Next.js dev hot-reload doesn't leak
 * connections.
 */

type Db = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __db?: Db };

export function getDb(): Db {
  if (!globalForDb.__db) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not set. See README.md for setup.");
    }
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5, // serverless functions should hold few connections
    });
    globalForDb.__db = drizzle(pool, { schema });
  }
  return globalForDb.__db;
}

export * from "./schema";
