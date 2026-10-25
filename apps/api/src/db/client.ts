import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { config } from "../config.js";
import * as schema from "./schema.js";

const pool = new pg.Pool({ connectionString: config.databaseUrl });

// An idle client that errors (Postgres restart, network drop) emits 'error' on
// the pool. Without a listener that is an uncaughtException and kills the API.
pool.on("error", (err) => {
  console.warn("[db] idle client error:", (err as Error).message);
});

export const db = drizzle(pool, { schema });
export { pool };
