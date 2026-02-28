import type pg from "pg";
import { ContextItemSchema, type ContextItem } from "@yt/contracts";

export async function upsertContextItem(
  client: pg.PoolClient,
  input: {
    entity_id: string;
    source: string;
    source_id: string;
    title: string;
    snippet: string;
    url?: string | null;
    payload_json?: unknown;
    expires_at?: string | null;
  }
): Promise<ContextItem> {
  const res = await client.query(
    `
    INSERT INTO context_items (entity_id, source, source_id, title, snippet, url, payload_json, expires_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT (entity_id, source, source_id)
    DO UPDATE SET
      title = EXCLUDED.title,
      snippet = EXCLUDED.snippet,
      url = EXCLUDED.url,
      payload_json = EXCLUDED.payload_json,
      fetched_at = now(),
      expires_at = EXCLUDED.expires_at
    RETURNING
      id::text as id,
      entity_id::text as entity_id,
      source,
      source_id,
      title,
      snippet,
      url,
      fetched_at::text as fetched_at,
      expires_at::text as expires_at
    `,
    [
      input.entity_id,
      input.source,
      input.source_id,
      input.title,
      input.snippet,
      input.url ?? null,
      input.payload_json ?? null,
      input.expires_at ?? null,
    ]
  );
  return ContextItemSchema.parse(res.rows[0]);
}

export async function listContextItemsForEntities(
  client: pg.PoolClient,
  entityIds: string[],
  opts?: { limitPerEntity?: number }
): Promise<Record<string, ContextItem[]>> {
  if (entityIds.length === 0) return {};
  const limitPerEntity = Math.min(opts?.limitPerEntity ?? 5, 20);

  const res = await client.query(
    `
    SELECT
      id::text as id,
      entity_id::text as entity_id,
      source,
      source_id,
      title,
      snippet,
      url,
      fetched_at::text as fetched_at,
      expires_at::text as expires_at
    FROM context_items
    WHERE entity_id = ANY($1::uuid[])
    ORDER BY fetched_at DESC
    `,
    [entityIds]
  );

  const grouped: Record<string, ContextItem[]> = {};
  for (const row of res.rows) {
    const item = ContextItemSchema.parse(row);
    grouped[item.entity_id] ||= [];
    if (grouped[item.entity_id].length < limitPerEntity) grouped[item.entity_id].push(item);
  }
  return grouped;
}

