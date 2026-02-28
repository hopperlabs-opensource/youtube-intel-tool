import fs from "fs";
import path from "path";
import type pg from "pg";

export async function migrateDb({
  client,
  migrationsDir,
}: {
  client: pg.PoolClient;
  migrationsDir: string;
}): Promise<{ applied: string[] }> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id serial PRIMARY KEY,
      filename text NOT NULL UNIQUE,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const appliedRows = await client.query<{ filename: string }>(
    "SELECT filename FROM schema_migrations ORDER BY filename ASC"
  );
  const applied = new Set(appliedRows.rows.map((r) => r.filename));

  const pending = files.filter((f) => !applied.has(f));
  const newlyApplied: string[] = [];

  for (const filename of pending) {
    const sql = fs.readFileSync(path.join(migrationsDir, filename), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [filename]);
      await client.query("COMMIT");
      newlyApplied.push(filename);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  }

  return { applied: newlyApplied };
}

