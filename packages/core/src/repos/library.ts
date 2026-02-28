import type pg from "pg";
import {
  LibraryChannelSchema,
  LibraryPersonSchema,
  LibraryTopicSchema,
  type LibraryChannel,
  type LibraryPerson,
  type LibraryTopic,
} from "@yt/contracts";

export async function listLibraryChannels(
  client: pg.PoolClient,
  opts?: { limit?: number; offset?: number }
): Promise<LibraryChannel[]> {
  const limit = Math.min(opts?.limit ?? 200, 1000);
  const offset = Math.max(0, opts?.offset ?? 0);

  const res = await client.query(
    `
    SELECT
      COALESCE(NULLIF(BTRIM(v.channel_name), ''), '(unknown)') as channel_name,
      COUNT(*)::int as videos,
      SUM(CASE WHEN t.id IS NULL THEN 0 ELSE 1 END)::int as ingested
    FROM videos v
    LEFT JOIN LATERAL (
      SELECT id
      FROM transcripts
      WHERE video_id = v.id
      ORDER BY fetched_at DESC
      LIMIT 1
    ) t ON true
    GROUP BY 1
    ORDER BY videos DESC, channel_name ASC
    LIMIT $1
    OFFSET $2
    `,
    [limit, offset]
  );

  return res.rows.map((r) => LibraryChannelSchema.parse(r));
}

export async function listLibraryTopics(
  client: pg.PoolClient,
  opts?: { limit?: number; offset?: number }
): Promise<LibraryTopic[]> {
  const limit = Math.min(opts?.limit ?? 200, 1000);
  const offset = Math.max(0, opts?.offset ?? 0);

  const res = await client.query(
    `
    SELECT
      vt.tag as topic,
      COUNT(DISTINCT vt.video_id)::int as videos
    FROM video_tags vt
    GROUP BY vt.tag
    ORDER BY videos DESC, topic ASC
    LIMIT $1
    OFFSET $2
    `,
    [limit, offset]
  );

  return res.rows.map((r) => LibraryTopicSchema.parse(r));
}

export async function listLibraryPeople(
  client: pg.PoolClient,
  opts?: { limit?: number; offset?: number }
): Promise<LibraryPerson[]> {
  const limit = Math.min(opts?.limit ?? 200, 1000);
  const offset = Math.max(0, opts?.offset ?? 0);

  const res = await client.query(
    `
    SELECT
      e.canonical_name as name,
      COUNT(DISTINCT e.video_id)::int as videos,
      COUNT(m.id)::int as mentions
    FROM entities e
    LEFT JOIN entity_mentions m ON m.entity_id = e.id
    WHERE e.type = 'person'
    GROUP BY e.canonical_name
    ORDER BY videos DESC, mentions DESC, name ASC
    LIMIT $1
    OFFSET $2
    `,
    [limit, offset]
  );

  return res.rows.map((r) => LibraryPersonSchema.parse(r));
}

