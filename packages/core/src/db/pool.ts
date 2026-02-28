import pg from "pg";
import { z } from "zod";

const { Pool } = pg;

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1).optional(),
});

let _pool: pg.Pool | null = null;

export function getPool(env: Record<string, string | undefined> = process.env): pg.Pool {
  if (_pool) return _pool;
  const parsed = EnvSchema.parse(env);
  const connectionString =
    parsed.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:55432/youtube_intel";
  _pool = new Pool({ connectionString });
  return _pool;
}
