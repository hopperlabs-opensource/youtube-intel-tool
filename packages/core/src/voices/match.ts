import type pg from "pg";

/**
 * Find similar speaker embeddings across videos using pgvector cosine search.
 */
export async function matchSpeakerAcrossVideos(
  client: pg.PoolClient,
  speakerId: string,
  opts?: { threshold?: number; limit?: number; excludeVideoId?: string },
): Promise<
  Array<{
    speaker_id: string;
    video_id: string;
    similarity: number;
    model_id: string;
  }>
> {
  const threshold = opts?.threshold ?? 0.85;
  const limit = Math.min(opts?.limit ?? 10, 50);
  const excludeVideoId = opts?.excludeVideoId ?? null;

  const res = await client.query(
    `WITH source AS (
       SELECT embedding, model_id
       FROM speaker_embeddings
       WHERE speaker_id = $1
       LIMIT 1
     )
     SELECT
       se.speaker_id::text,
       se.video_id::text,
       (1 - (se.embedding <=> source.embedding)) as similarity,
       se.model_id
     FROM speaker_embeddings se
     CROSS JOIN source
     WHERE se.speaker_id <> $1
       AND se.model_id = source.model_id
       AND ($3::uuid IS NULL OR se.video_id <> $3)
       AND (1 - (se.embedding <=> source.embedding)) >= $4
     ORDER BY se.embedding <=> source.embedding ASC
     LIMIT $2`,
    [speakerId, limit, excludeVideoId, threshold],
  );

  return res.rows.map((r) => ({
    speaker_id: r.speaker_id,
    video_id: r.video_id,
    similarity: parseFloat(r.similarity),
    model_id: r.model_id,
  }));
}

/**
 * Create a global speaker or link a per-video speaker to an existing global speaker.
 */
export async function createOrLinkGlobalSpeaker(
  client: pg.PoolClient,
  opts: {
    displayName: string;
    speakerId: string;
    videoId: string;
    existingGlobalSpeakerId?: string;
    confidence?: number;
  },
): Promise<{ globalSpeakerId: string; linkId: string }> {
  let globalSpeakerId: string;

  if (opts.existingGlobalSpeakerId) {
    globalSpeakerId = opts.existingGlobalSpeakerId;
  } else {
    // Get the speaker's embedding if available
    const embRes = await client.query(
      `SELECT embedding FROM speaker_embeddings WHERE speaker_id = $1 LIMIT 1`,
      [opts.speakerId],
    );

    const embedding = embRes.rows.length > 0 ? embRes.rows[0].embedding : null;

    const gsRes = await client.query(
      `INSERT INTO global_speakers (display_name, representative_embedding)
       VALUES ($1, $2)
       RETURNING id::text`,
      [opts.displayName, embedding],
    );
    globalSpeakerId = gsRes.rows[0].id;
  }

  const linkRes = await client.query(
    `INSERT INTO global_speaker_links (global_speaker_id, speaker_id, confidence, source)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (speaker_id) DO UPDATE SET
       global_speaker_id = EXCLUDED.global_speaker_id,
       confidence = EXCLUDED.confidence
     RETURNING id::text`,
    [globalSpeakerId, opts.speakerId, opts.confidence ?? null, "manual"],
  );

  return { globalSpeakerId, linkId: linkRes.rows[0].id };
}
