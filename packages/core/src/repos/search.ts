import type pg from "pg";
import { LibrarySearchHitSchema, SearchHitSchema, type LibrarySearchHit, type SearchHit, type SearchSourceType } from "@yt/contracts";

function toPgVector(v: number[]): string {
  // pgvector accepts a string literal in the form: '[1,2,3]'.
  return `[${v.join(",")}]`;
}

type GlobalSearchScope = {
  video_ids?: string[] | undefined;
  channel_names?: string[] | undefined;
  topics?: string[] | undefined;
  people?: string[] | undefined;
};

function cleanList(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out = v.map((s) => String(s).trim()).filter(Boolean);
  return out.length ? out : null;
}

function cleanScope(scope: GlobalSearchScope | undefined): {
  video_ids: string[] | null;
  channel_names: string[] | null;
  topics: string[] | null;
  people: string[] | null;
} {
  return {
    video_ids: cleanList(scope?.video_ids),
    channel_names: cleanList(scope?.channel_names),
    topics: cleanList(scope?.topics),
    people: cleanList(scope?.people),
  };
}

function parseSearchHitRow(row: Record<string, unknown>): SearchHit {
  return SearchHitSchema.parse({
    ...row,
    chunk_id: row.chunk_id ?? undefined,
  });
}

export async function searchCuesByVideo(
  client: pg.PoolClient,
  videoId: string,
  query: string,
  opts?: { limit?: number; language?: string }
): Promise<SearchHit[]> {
  const limit = Math.min(opts?.limit ?? 20, 50);
  const language = opts?.language ?? "en";
  const res = await client.query(
    `
    WITH t AS (
      SELECT id
      FROM transcripts
      WHERE video_id = $1
        AND language = $3
      ORDER BY fetched_at DESC
      LIMIT 1
    ),
    q AS (
      SELECT websearch_to_tsquery('english', $2) as q
    )
    SELECT
      c.id::text as cue_id,
      c.start_ms,
      c.end_ms,
      CASE
        WHEN q.q = ''::tsquery THEN 0.01
        ELSE ts_rank_cd(c.tsv, q.q)
      END as score,
      c.text as snippet
    FROM transcript_cues c
    JOIN t ON t.id = c.transcript_id
    JOIN q ON true
    WHERE (q.q <> ''::tsquery AND c.tsv @@ q.q)
       OR (q.q = ''::tsquery AND c.text ILIKE ('%' || $2 || '%'))
    ORDER BY score DESC
    LIMIT $4
    `,
    [videoId, query, language, limit]
  );
  return res.rows.map((r) => parseSearchHitRow(r));
}

export async function searchChunksByVideoSemantic(
  client: pg.PoolClient,
  videoId: string,
  queryEmbedding: number[],
  opts?: { limit?: number; language?: string; model_id?: string }
): Promise<SearchHit[]> {
  const limit = Math.min(opts?.limit ?? 20, 50);
  const language = opts?.language ?? "en";
  const modelId = opts?.model_id ?? "nomic-embed-text";

  const v = toPgVector(queryEmbedding);

  const res = await client.query(
    `
    WITH t AS (
      SELECT id
      FROM transcripts
      WHERE video_id = $1
        AND language = $2
      ORDER BY fetched_at DESC
      LIMIT 1
    ),
    hits AS (
      SELECT
        ch.id as chunk_id,
        ch.start_ms,
        ch.end_ms,
        ch.cue_start_idx,
        (1 - (e.embedding <=> $3::vector)) as score,
        ch.text as snippet
      FROM transcript_chunks ch
      JOIN embeddings e ON e.chunk_id = ch.id
      JOIN t ON t.id = ch.transcript_id
      WHERE e.model_id = $4
      ORDER BY e.embedding <=> $3::vector
      LIMIT $5
    )
    SELECT
      c.id::text as cue_id,
      hits.chunk_id::text as chunk_id,
      hits.start_ms,
      hits.end_ms,
      hits.score,
      substring(hits.snippet from 1 for 240) as snippet
    FROM hits
    JOIN t ON true
    JOIN transcript_cues c ON c.transcript_id = t.id AND c.idx = hits.cue_start_idx
    ORDER BY hits.score DESC
    `,
    [videoId, language, v, modelId, limit]
  );

  return res.rows.map((r) => parseSearchHitRow(r));
}

export async function searchCuesKeywordGlobal(
  client: pg.PoolClient,
  query: string,
  opts?: { limit?: number; language?: string; scope?: GlobalSearchScope }
): Promise<LibrarySearchHit[]> {
  const limit = Math.min(opts?.limit ?? 20, 50);
  const language = opts?.language ?? "en";
  const scope = cleanScope(opts?.scope);

  const res = await client.query(
    `
    WITH q AS (
      SELECT websearch_to_tsquery('english', $1) as q
    ),
    latest AS (
      SELECT DISTINCT ON (video_id)
        id,
        video_id
      FROM transcripts
      WHERE language = $2
      ORDER BY video_id, fetched_at DESC
    )
    SELECT
      v.id::text as video_id,
      v.provider,
      v.provider_video_id,
      v.url as video_url,
      v.title,
      v.channel_name,
      v.thumbnail_url,
      c.id::text as cue_id,
      c.start_ms,
      c.end_ms,
      CASE
        WHEN q.q = ''::tsquery THEN 0.01
        ELSE ts_rank_cd(c.tsv, q.q)
      END as score,
      substring(c.text from 1 for 240) as snippet
    FROM latest t
    JOIN videos v ON v.id = t.video_id
    JOIN transcript_cues c ON c.transcript_id = t.id
    JOIN q ON true
    WHERE (
          (q.q <> ''::tsquery AND c.tsv @@ q.q)
       OR (q.q = ''::tsquery AND c.text ILIKE ('%' || $1 || '%'))
    )
      AND ($4::uuid[] IS NULL OR v.id = ANY($4::uuid[]))
      AND ($5::text[] IS NULL OR v.channel_name = ANY($5::text[]))
      AND ($6::text[] IS NULL OR EXISTS (
        SELECT 1 FROM video_tags vt WHERE vt.video_id = v.id AND vt.tag = ANY($6::text[])
      ))
      AND ($7::text[] IS NULL OR EXISTS (
        SELECT 1 FROM entities e WHERE e.video_id = v.id AND e.type = 'person' AND e.canonical_name = ANY($7::text[])
      ))
    ORDER BY score DESC
    LIMIT $3
    `,
    [query, language, limit, scope.video_ids, scope.channel_names, scope.topics, scope.people]
  );
  return res.rows.map((r) => LibrarySearchHitSchema.parse(r));
}

export async function searchChunksSemanticGlobal(
  client: pg.PoolClient,
  queryEmbedding: number[],
  opts?: { limit?: number; language?: string; model_id?: string; scope?: GlobalSearchScope }
): Promise<LibrarySearchHit[]> {
  const limit = Math.min(opts?.limit ?? 20, 50);
  const language = opts?.language ?? "en";
  const modelId = opts?.model_id ?? "nomic-embed-text";
  const scope = cleanScope(opts?.scope);

  const v = toPgVector(queryEmbedding);

  const res = await client.query(
    `
    WITH latest AS (
      SELECT DISTINCT ON (video_id)
        id,
        video_id
      FROM transcripts
      WHERE language = $2
      ORDER BY video_id, fetched_at DESC
    ),
    hits AS (
      SELECT
        t.id as transcript_id,
        v.id as video_id,
        v.provider,
        v.provider_video_id,
        v.url as video_url,
        v.title,
        v.channel_name,
        v.thumbnail_url,
        ch.id as chunk_id,
        ch.start_ms,
        ch.end_ms,
        ch.cue_start_idx,
        (1 - (e.embedding <=> $1::vector)) as score,
        ch.text as snippet
      FROM latest t
      JOIN videos v ON v.id = t.video_id
      JOIN transcript_chunks ch ON ch.transcript_id = t.id
      JOIN embeddings e ON e.chunk_id = ch.id
      WHERE e.model_id = $3
        AND ($5::uuid[] IS NULL OR v.id = ANY($5::uuid[]))
        AND ($6::text[] IS NULL OR v.channel_name = ANY($6::text[]))
        AND ($7::text[] IS NULL OR EXISTS (
          SELECT 1 FROM video_tags vt WHERE vt.video_id = v.id AND vt.tag = ANY($7::text[])
        ))
        AND ($8::text[] IS NULL OR EXISTS (
          SELECT 1 FROM entities e WHERE e.video_id = v.id AND e.type = 'person' AND e.canonical_name = ANY($8::text[])
        ))
      ORDER BY e.embedding <=> $1::vector
      LIMIT $4
    )
    SELECT
      hits.video_id::text as video_id,
      hits.provider,
      hits.provider_video_id,
      hits.video_url,
      hits.title,
      hits.channel_name,
      hits.thumbnail_url,
      c.id::text as cue_id,
      hits.chunk_id::text as chunk_id,
      hits.start_ms,
      hits.end_ms,
      hits.score,
      substring(hits.snippet from 1 for 240) as snippet
    FROM hits
    JOIN transcript_cues c ON c.transcript_id = hits.transcript_id AND c.idx = hits.cue_start_idx
    ORDER BY hits.score DESC
    `,
    [v, language, modelId, limit, scope.video_ids, scope.channel_names, scope.topics, scope.people]
  );

  return res.rows.map((r) => LibrarySearchHitSchema.parse(r));
}

// ─── Visual Search ───────────────────────────────────────────────────────────

/**
 * Keyword search across both transcript cues and frame analyses (UNION ALL).
 * Returns results with source_type='transcript' or source_type='visual'.
 */
export async function searchCuesByVideoUnified(
  client: pg.PoolClient,
  videoId: string,
  query: string,
  opts?: { limit?: number; language?: string; sourceType?: SearchSourceType }
): Promise<SearchHit[]> {
  const limit = Math.min(opts?.limit ?? 20, 50);
  const language = opts?.language ?? "en";
  const sourceType = opts?.sourceType ?? "all";

  if (sourceType === "visual") {
    return searchFrameAnalysesByVideo(client, videoId, query, { limit });
  }

  if (sourceType === "dense_visual") {
    return searchDenseActionCuesByVideo(client, videoId, query, { limit });
  }

  if (sourceType === "transcript") {
    return searchCuesByVideo(client, videoId, query, { limit, language });
  }

  // "all": UNION ALL transcript + visual
  const res = await client.query(
    `
    WITH t AS (
      SELECT id
      FROM transcripts
      WHERE video_id = $1
        AND language = $3
      ORDER BY fetched_at DESC
      LIMIT 1
    ),
    q AS (
      SELECT websearch_to_tsquery('english', $2) as q
    ),
    transcript_hits AS (
      SELECT
        c.id::text as cue_id,
        NULL::text as chunk_id,
        c.start_ms,
        c.end_ms,
        CASE
          WHEN q.q = ''::tsquery THEN 0.01
          ELSE ts_rank_cd(c.tsv, q.q)
        END as score,
        c.text as snippet,
        'transcript' as source_type
      FROM transcript_cues c
      JOIN t ON t.id = c.transcript_id
      JOIN q ON true
      WHERE (q.q <> ''::tsquery AND c.tsv @@ q.q)
         OR (q.q = ''::tsquery AND c.text ILIKE ('%' || $2 || '%'))
    ),
    visual_hits AS (
      SELECT
        fa.id::text as cue_id,
        NULL::text as chunk_id,
        fa.start_ms,
        fa.end_ms,
        CASE
          WHEN q.q = ''::tsquery THEN 0.01
          ELSE ts_rank_cd(fa.tsv, q.q)
        END as score,
        fa.description as snippet,
        'visual' as source_type
      FROM frame_analyses fa
      JOIN q ON true
      WHERE fa.video_id = $1
        AND ((q.q <> ''::tsquery AND fa.tsv @@ q.q)
          OR (q.q = ''::tsquery AND (fa.description ILIKE ('%' || $2 || '%') OR fa.text_overlay ILIKE ('%' || $2 || '%'))))
    ),
    dense_visual_hits AS (
      SELECT
        atc.id::text as cue_id,
        NULL::text as chunk_id,
        atc.start_ms,
        atc.end_ms,
        CASE
          WHEN q.q = ''::tsquery THEN 0.01
          ELSE ts_rank_cd(atc.tsv, q.q)
        END as score,
        atc.description as snippet,
        'dense_visual' as source_type
      FROM action_transcript_cues atc
      JOIN q ON true
      WHERE atc.video_id = $1
        AND ((q.q <> ''::tsquery AND atc.tsv @@ q.q)
          OR (q.q = ''::tsquery AND atc.description ILIKE ('%' || $2 || '%')))
    )
    SELECT * FROM transcript_hits
    UNION ALL
    SELECT * FROM visual_hits
    UNION ALL
    SELECT * FROM dense_visual_hits
    ORDER BY score DESC
    LIMIT $4
    `,
    [videoId, query, language, limit]
  );
  return res.rows.map((r) => parseSearchHitRow(r));
}

/**
 * Keyword search over frame_analyses only.
 */
async function searchFrameAnalysesByVideo(
  client: pg.PoolClient,
  videoId: string,
  query: string,
  opts?: { limit?: number }
): Promise<SearchHit[]> {
  const limit = Math.min(opts?.limit ?? 20, 50);
  const res = await client.query(
    `
    WITH q AS (
      SELECT websearch_to_tsquery('english', $2) as q
    )
    SELECT
      fa.id::text as cue_id,
      fa.start_ms,
      fa.end_ms,
      CASE
        WHEN q.q = ''::tsquery THEN 0.01
        ELSE ts_rank_cd(fa.tsv, q.q)
      END as score,
      fa.description as snippet,
      'visual' as source_type
    FROM frame_analyses fa
    JOIN q ON true
    WHERE fa.video_id = $1
      AND ((q.q <> ''::tsquery AND fa.tsv @@ q.q)
        OR (q.q = ''::tsquery AND (fa.description ILIKE ('%' || $2 || '%') OR fa.text_overlay ILIKE ('%' || $2 || '%'))))
    ORDER BY score DESC
    LIMIT $3
    `,
    [videoId, query, limit]
  );
  return res.rows.map((r) => parseSearchHitRow(r));
}

/**
 * Keyword search over action_transcript_cues only.
 */
async function searchDenseActionCuesByVideo(
  client: pg.PoolClient,
  videoId: string,
  query: string,
  opts?: { limit?: number }
): Promise<SearchHit[]> {
  const limit = Math.min(opts?.limit ?? 20, 50);
  const res = await client.query(
    `
    WITH q AS (
      SELECT websearch_to_tsquery('english', $2) as q
    )
    SELECT
      atc.id::text as cue_id,
      atc.start_ms,
      atc.end_ms,
      CASE
        WHEN q.q = ''::tsquery THEN 0.01
        ELSE ts_rank_cd(atc.tsv, q.q)
      END as score,
      atc.description as snippet,
      'dense_visual' as source_type
    FROM action_transcript_cues atc
    JOIN q ON true
    WHERE atc.video_id = $1
      AND ((q.q <> ''::tsquery AND atc.tsv @@ q.q)
        OR (q.q = ''::tsquery AND atc.description ILIKE ('%' || $2 || '%')))
    ORDER BY score DESC
    LIMIT $3
    `,
    [videoId, query, limit]
  );
  return res.rows.map((r) => parseSearchHitRow(r));
}

/**
 * Semantic search over visual frame chunks.
 */
export async function searchFrameChunksByVideoSemantic(
  client: pg.PoolClient,
  videoId: string,
  queryEmbedding: number[],
  opts?: { limit?: number; model_id?: string }
): Promise<SearchHit[]> {
  const limit = Math.min(opts?.limit ?? 20, 50);
  const modelId = opts?.model_id ?? "nomic-embed-text";

  const v = toPgVector(queryEmbedding);

  const res = await client.query(
    `
    SELECT
      fc.id::text as cue_id,
      fc.id::text as chunk_id,
      fc.start_ms,
      fc.end_ms,
      (1 - (e.embedding <=> $1::vector)) as score,
      substring(fc.text from 1 for 240) as snippet,
      'visual' as source_type
    FROM frame_chunks fc
    JOIN embeddings e ON e.frame_chunk_id = fc.id
    WHERE fc.video_id = $2
      AND e.model_id = $3
      AND e.source_type = 'visual'
    ORDER BY e.embedding <=> $1::vector
    LIMIT $4
    `,
    [v, videoId, modelId, limit]
  );

  return res.rows.map((r) => parseSearchHitRow(r));
}
