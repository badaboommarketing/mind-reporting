import { Pool } from "pg";

import { loadConfig } from "../config.js";

let pool: Pool | null = null;

export function getPool(): Pool {
  if (pool) {
    return pool;
  }

  const config = loadConfig();
  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL is not configured.");
  }

  pool = new Pool({
    connectionString: config.databaseUrl,
    ssl:
      config.databaseUrl.includes("localhost") || config.databaseUrl.includes("127.0.0.1")
        ? false
        : { rejectUnauthorized: false },
  });

  return pool;
}
