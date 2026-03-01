import type pg from "pg";
import {
  SpeakerEmbeddingSchema,
  GlobalSpeakerSchema,
  GlobalSpeakerLinkSchema,
  type SpeakerEmbedding,
  type GlobalSpeaker,
  type GlobalSpeakerLink,
} from "@yt/contracts";

function toPgVector(v: number[]): string {
  return `[${v.join(",")}]`;
}

// ─── Speaker Embeddings ──────────────────────────────────────────────────────

export async function insertSpeakerEmbeddings(
  client: pg.PoolClient,
  embeddings: Array<{
    speaker_id: string;
    video_id: string;
    embedding: number[];
    model_id: string;
    segment_count: number;
  }>,
): Promise<void> {
  for (const emb of embeddings) {
    await client.query(
      `INSERT INTO speaker_embeddings (speaker_id, video_id, embedding, model_id, segment_count)
       VALUES ($1, $2, $3::vector, $4, $5)
       ON CONFLICT (speaker_id, model_id) DO UPDATE SET
         embedding = EXCLUDED.embedding,
         segment_count = EXCLUDED.segment_count`,
      [emb.speaker_id, emb.video_id, toPgVector(emb.embedding), emb.model_id, emb.segment_count],
    );
  }
}

export async function getSpeakerEmbedding(
  client: pg.PoolClient,
  speakerId: string,
): Promise<SpeakerEmbedding | null> {
  const res = await client.query(
    `SELECT id::text, speaker_id::text, video_id::text, model_id, segment_count, created_at::text
     FROM speaker_embeddings
     WHERE speaker_id = $1
     LIMIT 1`,
    [speakerId],
  );
  if (res.rows.length === 0) return null;
  return SpeakerEmbeddingSchema.parse(res.rows[0]);
}

// ─── Global Speakers ─────────────────────────────────────────────────────────

export async function upsertGlobalSpeaker(
  client: pg.PoolClient,
  input: { display_name: string; representative_embedding?: number[] | null },
): Promise<GlobalSpeaker> {
  const res = await client.query(
    `INSERT INTO global_speakers (display_name, representative_embedding)
     VALUES ($1, $2)
     RETURNING id::text, display_name, face_identity_id::text, created_at::text, updated_at::text`,
    [input.display_name, input.representative_embedding ? toPgVector(input.representative_embedding) : null],
  );
  return GlobalSpeakerSchema.parse(res.rows[0]);
}

export async function listGlobalSpeakers(
  client: pg.PoolClient,
  opts?: { limit?: number },
): Promise<GlobalSpeaker[]> {
  const limit = Math.min(opts?.limit ?? 100, 500);
  const res = await client.query(
    `SELECT id::text, display_name, face_identity_id::text, created_at::text, updated_at::text
     FROM global_speakers
     ORDER BY display_name ASC
     LIMIT $1`,
    [limit],
  );
  return res.rows.map((r) => GlobalSpeakerSchema.parse(r));
}

export async function getGlobalSpeaker(
  client: pg.PoolClient,
  globalSpeakerId: string,
): Promise<GlobalSpeaker | null> {
  const res = await client.query(
    `SELECT id::text, display_name, face_identity_id::text, created_at::text, updated_at::text
     FROM global_speakers
     WHERE id = $1`,
    [globalSpeakerId],
  );
  if (res.rows.length === 0) return null;
  return GlobalSpeakerSchema.parse(res.rows[0]);
}

export async function updateGlobalSpeakerDisplayName(
  client: pg.PoolClient,
  globalSpeakerId: string,
  displayName: string,
): Promise<GlobalSpeaker> {
  const res = await client.query(
    `UPDATE global_speakers SET display_name = $2, updated_at = now()
     WHERE id = $1
     RETURNING id::text, display_name, face_identity_id::text, created_at::text, updated_at::text`,
    [globalSpeakerId, displayName],
  );
  if (res.rows.length === 0) throw new Error("Global speaker not found");
  return GlobalSpeakerSchema.parse(res.rows[0]);
}

// ─── Global Speaker Links ────────────────────────────────────────────────────

export async function linkSpeakerToGlobal(
  client: pg.PoolClient,
  input: {
    global_speaker_id: string;
    speaker_id: string;
    confidence?: number | null;
    source?: string;
  },
): Promise<GlobalSpeakerLink> {
  const res = await client.query(
    `INSERT INTO global_speaker_links (global_speaker_id, speaker_id, confidence, source)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (speaker_id) DO UPDATE SET
       global_speaker_id = EXCLUDED.global_speaker_id,
       confidence = EXCLUDED.confidence,
       source = EXCLUDED.source
     RETURNING id::text, global_speaker_id::text, speaker_id::text, confidence, source, created_at::text`,
    [input.global_speaker_id, input.speaker_id, input.confidence ?? null, input.source ?? "auto"],
  );
  return GlobalSpeakerLinkSchema.parse(res.rows[0]);
}

export async function getGlobalSpeakerLinks(
  client: pg.PoolClient,
  globalSpeakerId: string,
): Promise<GlobalSpeakerLink[]> {
  const res = await client.query(
    `SELECT id::text, global_speaker_id::text, speaker_id::text, confidence, source, created_at::text
     FROM global_speaker_links
     WHERE global_speaker_id = $1
     ORDER BY created_at ASC`,
    [globalSpeakerId],
  );
  return res.rows.map((r) => GlobalSpeakerLinkSchema.parse(r));
}

export async function unlinkSpeaker(
  client: pg.PoolClient,
  speakerId: string,
): Promise<void> {
  await client.query(`DELETE FROM global_speaker_links WHERE speaker_id = $1`, [speakerId]);
}

// ─── Search ──────────────────────────────────────────────────────────────────

export async function findSimilarSpeakerEmbeddings(
  client: pg.PoolClient,
  embedding: number[],
  opts?: { threshold?: number; excludeVideoId?: string; limit?: number },
): Promise<Array<{ speaker_id: string; video_id: string; similarity: number }>> {
  const threshold = opts?.threshold ?? 0.85;
  const limit = Math.min(opts?.limit ?? 10, 50);
  const v = toPgVector(embedding);

  const res = await client.query(
    `SELECT
       speaker_id::text,
       video_id::text,
       (1 - (embedding <=> $1::vector)) as similarity
     FROM speaker_embeddings
     WHERE ($3::uuid IS NULL OR video_id <> $3)
       AND (1 - (embedding <=> $1::vector)) >= $4
     ORDER BY embedding <=> $1::vector ASC
     LIMIT $2`,
    [v, limit, opts?.excludeVideoId ?? null, threshold],
  );

  return res.rows.map((r) => ({
    speaker_id: r.speaker_id,
    video_id: r.video_id,
    similarity: parseFloat(r.similarity),
  }));
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────

export async function deleteVoiceDataForVideo(
  client: pg.PoolClient,
  videoId: string,
): Promise<void> {
  await client.query(`DELETE FROM speaker_embeddings WHERE video_id = $1`, [videoId]);
}
