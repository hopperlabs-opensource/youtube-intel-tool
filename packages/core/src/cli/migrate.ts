import path from "path";
import { fileURLToPath } from "url";
import { getPool } from "../db/pool";
import { migrateDb } from "../db/migrate";

const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "migrations");

async function main() {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const res = await migrateDb({ client, migrationsDir });
    // Keep CLI output stable and simple for scripting.
    console.log(JSON.stringify({ ok: true, applied: res.applied }, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err?.message || err) }, null, 2));
  process.exit(1);
});
