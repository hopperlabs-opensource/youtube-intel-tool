import type pg from "pg";
import { EntitySchema, type Entity, EntityMentionSchema, type EntityMention } from "@yt/contracts";

export async function upsertEntity(
  client: pg.PoolClient,
  input: { video_id: string; type: string; canonical_name: string; aliases?: string[] }
): Promise<Entity> {
  const res = await client.query(
    `
    INSERT INTO entities (video_id, type, canonical_name, aliases)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (video_id, type, canonical_name)
    DO UPDATE SET aliases = (
      SELECT ARRAY(SELECT DISTINCT unnest(entities.aliases || EXCLUDED.aliases))
    )
    RETURNING
      id::text as id,
      video_id::text as video_id,
      type,
      canonical_name,
      aliases,
      created_at::text as created_at
    `,
    [input.video_id, input.type, input.canonical_name, input.aliases ?? []]
  );
  return EntitySchema.parse(res.rows[0]);
}

export async function insertEntityMention(
  client: pg.PoolClient,
  input: {
    video_id: string;
    entity_id: string;
    cue_id: string;
    start_ms: number;
    end_ms: number;
    surface: string;
    confidence?: number | null;
  }
): Promise<EntityMention> {
  const res = await client.query(
    `
    INSERT INTO entity_mentions (video_id, entity_id, cue_id, start_ms, end_ms, surface, confidence)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING
      id::text as id,
      entity_id::text as entity_id,
      cue_id::text as cue_id,
      start_ms,
      end_ms,
      surface,
      confidence,
      created_at::text as created_at
    `,
    [
      input.video_id,
      input.entity_id,
      input.cue_id,
      input.start_ms,
      input.end_ms,
      input.surface,
      input.confidence ?? null,
    ]
  );
  return EntityMentionSchema.parse(res.rows[0]);
}

export async function listEntitiesForVideoInWindow(
  client: pg.PoolClient,
  videoId: string,
  opts?: { at_ms?: number; window_ms?: number; limit?: number }
): Promise<Entity[]> {
  const at = opts?.at_ms ?? null;
  const window = opts?.window_ms ?? 120_000;
  const limit = Math.min(opts?.limit ?? 200, 500);

  // If at is null, just list all entities for video.
  if (at == null) {
    const res = await client.query(
      `
      SELECT
        id::text as id,
        video_id::text as video_id,
        type,
        canonical_name,
        aliases,
        created_at::text as created_at
      FROM entities
      WHERE video_id = $1
      ORDER BY canonical_name ASC
      LIMIT $2
      `,
      [videoId, limit]
    );
    return res.rows.map((r) => EntitySchema.parse(r));
  }

  const start = Math.max(0, at - window);
  const end = at + window;

  const res = await client.query(
    `
    SELECT
      e.id::text as id,
      e.video_id::text as video_id,
      e.type,
      e.canonical_name,
      e.aliases,
      e.created_at::text as created_at
    FROM entities e
    JOIN (
      SELECT entity_id, count(*) as mention_count
      FROM entity_mentions
      WHERE video_id = $1
        AND start_ms <= $3
        AND end_ms >= $2
      GROUP BY entity_id
      ORDER BY mention_count DESC
      LIMIT $4
    ) m ON m.entity_id = e.id
    ORDER BY e.canonical_name ASC
    `,
    [videoId, start, end, limit]
  );
  return res.rows.map((r) => EntitySchema.parse(r));
}

export async function clearEntitiesForVideo(client: pg.PoolClient, videoId: string): Promise<void> {
  // Cascades to entity_mentions + context_items via FK constraints.
  await client.query(`DELETE FROM entities WHERE video_id = $1`, [videoId]);
}

export async function listMentionsForEntity(
  client: pg.PoolClient,
  entityId: string,
  opts?: { limit?: number }
): Promise<EntityMention[]> {
  const limit = Math.min(opts?.limit ?? 500, 2000);
  const res = await client.query(
    `
    SELECT
      id::text as id,
      entity_id::text as entity_id,
      cue_id::text as cue_id,
      start_ms,
      end_ms,
      surface,
      confidence,
      created_at::text as created_at
    FROM entity_mentions
    WHERE entity_id = $1
    ORDER BY start_ms ASC
    LIMIT $2
    `,
    [entityId, limit]
  );
  return res.rows.map((r) => EntityMentionSchema.parse(r));
}
