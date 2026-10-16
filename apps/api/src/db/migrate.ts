import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { config } from "../config.js";

async function main() {
  const pool = new pg.Pool({ connectionString: config.databaseUrl });
  const db = drizzle(pool);
  const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../drizzle");
  console.log("Running migrations from", migrationsFolder);
  await migrate(db, { migrationsFolder });
  console.log("Migrations complete");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
