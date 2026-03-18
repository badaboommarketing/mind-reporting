import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getPool } from "../db/pool.js";

async function main() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const schemaPath = path.resolve(__dirname, "../../db/schema.sql");
  const sql = await readFile(schemaPath, "utf8");
  const pool = getPool();
  await pool.query(sql);
  console.log("Applied db/schema.sql successfully.");
  await pool.end();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
