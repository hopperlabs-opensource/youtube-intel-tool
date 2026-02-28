import type pg from "pg";
import {
  SpeakerSegmentSchema,
  VideoSpeakerSchema,
  type SpeakerSegment,
  type VideoSpeaker,
} from "@yt/contracts";

function clampInt(n: number, min: number, max: number): number {
  const x = Math.floor(n);
  if (x < min) return min;
  if (x > max) return max;
  return x;
}

export async function upsertVideoSpeaker(
  client: pg.PoolClient,
  input: { video_id: string; key: string; source: string }
): Promise<VideoSpeaker> {
  const res = await client.query(
    `
    INSERT INTO video_speakers (video_id, key, source)
    VALUES ($1::uuid, $2::text, $3::text)
    ON CONFLICT (video_id, key)
    DO UPDATE SET
      source = EXCLUDED.source,
      updated_at = now()
    RETURNING
      id::text as id,
      video_id::text as video_id,
      key,
      label,
      source,
      created_at::text as created_at,
      updated_at::text as updated_at
    `,
    [input.video_id, input.key, input.source]
  );
  return VideoSpeakerSchema.parse(res.rows[0]);
}

export async function listVideoSpeakers(client: pg.PoolClient, videoId: string): Promise<VideoSpeaker[]> {
  const res = await client.query(
    `
    SELECT
      id::text as id,
      video_id::text as video_id,
      key,
      label,
      source,
      created_at::text as created_at,
      updated_at::text as updated_at
    FROM video_speakers
    WHERE video_id = $1::uuid
    ORDER BY key ASC
    `,
    [videoId]
  );
  return res.rows.map((r) => VideoSpeakerSchema.parse(r));
}

export async function updateVideoSpeakerLabel(
  client: pg.PoolClient,
  input: { video_id: string; speaker_id: string; label: string | null }
): Promise<VideoSpeaker> {
  const res = await client.query(
    `
    UPDATE video_speakers
    SET label = $3::text,
        updated_at = now()
    WHERE id = $1::uuid
      AND video_id = $2::uuid
    RETURNING
      id::text as id,
      video_id::text as video_id,
      key,
      label,
      source,
      created_at::text as created_at,
      updated_at::text as updated_at
    `,
    [input.speaker_id, input.video_id, input.label]
  );
  if (res.rowCount === 0) throw new Error("speaker not found");
  return VideoSpeakerSchema.parse(res.rows[0]);
}

export async function listSpeakerSegmentsForVideo(
  client: pg.PoolClient,
  input: { video_id: string; transcript_id?: string | null; limit?: number }
): Promise<SpeakerSegment[]> {
  const limit = Math.min(input.limit ?? 5000, 50_000);
  if (input.transcript_id) {
    const res = await client.query(
      `
      SELECT
        id::text as id,
        video_id::text as video_id,
        transcript_id::text as transcript_id,
        speaker_id::text as speaker_id,
        start_ms,
        end_ms,
        confidence,
        source,
        created_at::text as created_at
      FROM speaker_segments
      WHERE video_id = $1::uuid
        AND transcript_id = $2::uuid
      ORDER BY start_ms ASC
      LIMIT $3
      `,
      [input.video_id, input.transcript_id, limit]
    );
    return res.rows.map((r) => SpeakerSegmentSchema.parse(r));
  }

  // If transcript not provided, use the latest transcript for the video.
  const res = await client.query(
    `
    WITH t AS (
      SELECT id
      FROM transcripts
      WHERE video_id = $1::uuid
      ORDER BY fetched_at DESC
      LIMIT 1
    )
    SELECT
      s.id::text as id,
      s.video_id::text as video_id,
      s.transcript_id::text as transcript_id,
      s.speaker_id::text as speaker_id,
      s.start_ms,
      s.end_ms,
      s.confidence,
      s.source,
      s.created_at::text as created_at
    FROM speaker_segments s
    JOIN t ON t.id = s.transcript_id
    ORDER BY s.start_ms ASC
    LIMIT $2
    `,
    [input.video_id, limit]
  );
  return res.rows.map((r) => SpeakerSegmentSchema.parse(r));
}

export async function replaceDiarizationForTranscript(
  client: pg.PoolClient,
  input: {
    video_id: string;
    transcript_id: string;
    source: string;
    speakers: Array<{
      key: string;
      segments: Array<{ start_ms: number; end_ms: number; confidence?: number | null }>;
    }>;
    cue_assignments: Array<{ cue_id: string; speaker_key: string; confidence?: number | null }>;
  }
): Promise<{
  speakers: number;
  segments: number;
  cue_assignments: number;
}> {
  // Upsert speakers first (preserve existing labels).
  const speakerKeyToId = new Map<string, string>();
  for (const s of input.speakers) {
    const key = String(s.key || "").trim();
    if (!key) continue;
    if (speakerKeyToId.has(key)) continue;
    const sp = await upsertVideoSpeaker(client, { video_id: input.video_id, key, source: input.source });
    speakerKeyToId.set(key, sp.id);
  }

  // Replace transcript-scoped artifacts (segments + cue mapping).
  await client.query(`DELETE FROM cue_speakers WHERE transcript_id = $1::uuid`, [input.transcript_id]);
  await client.query(`DELETE FROM speaker_segments WHERE transcript_id = $1::uuid`, [input.transcript_id]);

  // Insert segments (batched).
  const segRows: Array<{
    speaker_id: string;
    start_ms: number;
    end_ms: number;
    confidence: number | null;
  }> = [];
  for (const s of input.speakers) {
    const speaker_id = speakerKeyToId.get(String(s.key || "").trim());
    if (!speaker_id) continue;
    for (const seg of s.segments || []) {
      const start_ms = clampInt(Number(seg.start_ms), 0, Number.MAX_SAFE_INTEGER);
      const end_ms = clampInt(Number(seg.end_ms), 0, Number.MAX_SAFE_INTEGER);
      if (!(end_ms > start_ms)) continue;
      segRows.push({
        speaker_id,
        start_ms,
        end_ms,
        confidence:
          seg.confidence == null
            ? null
            : Number.isFinite(Number(seg.confidence))
              ? Math.max(0, Math.min(1, Number(seg.confidence)))
              : null,
      });
    }
  }

  for (let i = 0; i < segRows.length; i += 1000) {
    const batch = segRows.slice(i, i + 1000);
    const values: any[] = [];
    const params: string[] = [];
    for (let j = 0; j < batch.length; j++) {
      const b = batch[j];
      const base = j * 7;
      values.push(input.video_id, input.transcript_id, b.speaker_id, b.start_ms, b.end_ms, b.confidence, input.source);
      params.push(
        `($${base + 1}::uuid,$${base + 2}::uuid,$${base + 3}::uuid,$${base + 4}::int,$${base + 5}::int,$${base + 6}::real,$${base + 7}::text)`
      );
    }
    await client.query(
      `
      INSERT INTO speaker_segments (video_id, transcript_id, speaker_id, start_ms, end_ms, confidence, source)
      VALUES ${params.join(",")}
      `,
      values
    );
  }

  // Insert cue assignments (batched).
  const cueRows: Array<{ cue_id: string; speaker_id: string; confidence: number | null }> = [];
  for (const a of input.cue_assignments) {
    const speaker_id = speakerKeyToId.get(String(a.speaker_key || "").trim());
    if (!speaker_id) continue;
    const cue_id = String(a.cue_id || "").trim();
    if (!cue_id) continue;
    cueRows.push({
      cue_id,
      speaker_id,
      confidence:
        a.confidence == null
          ? null
          : Number.isFinite(Number(a.confidence))
            ? Math.max(0, Math.min(1, Number(a.confidence)))
            : null,
    });
  }

  for (let i = 0; i < cueRows.length; i += 2000) {
    const batch = cueRows.slice(i, i + 2000);
    const values: any[] = [];
    const params: string[] = [];
    for (let j = 0; j < batch.length; j++) {
      const b = batch[j];
      const base = j * 5;
      values.push(b.cue_id, input.transcript_id, b.speaker_id, b.confidence, input.source);
      params.push(
        `($${base + 1}::uuid,$${base + 2}::uuid,$${base + 3}::uuid,$${base + 4}::real,$${base + 5}::text)`
      );
    }
    await client.query(
      `
      INSERT INTO cue_speakers (cue_id, transcript_id, speaker_id, confidence, source)
      VALUES ${params.join(",")}
      ON CONFLICT (cue_id)
      DO UPDATE SET
        speaker_id = EXCLUDED.speaker_id,
        confidence = EXCLUDED.confidence,
        source = EXCLUDED.source,
        created_at = now()
      `,
      values
    );
  }

  return {
    speakers: speakerKeyToId.size,
    segments: segRows.length,
    cue_assignments: cueRows.length,
  };
}
