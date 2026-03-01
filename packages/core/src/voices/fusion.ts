import type pg from "pg";

/**
 * Fuse face and voice identities: if a face_identity is linked to a speaker
 * and that speaker matches a global_speaker, propagate the link.
 */
export async function fuseFaceAndVoice(
  client: pg.PoolClient,
  videoId: string,
): Promise<Array<{ face_identity_id: string; global_speaker_id: string; confidence: number }>> {
  const res = await client.query(
    `SELECT
       fi.id::text as face_identity_id,
       gsl.global_speaker_id::text,
       (COALESCE(gsl.confidence, 0.5) * 0.6 + 0.4) as confidence
     FROM face_identities fi
     JOIN global_speaker_links gsl ON gsl.speaker_id = fi.speaker_id
     WHERE fi.video_id = $1
       AND fi.speaker_id IS NOT NULL`,
    [videoId],
  );

  // Update face_identities with the linked global speaker info
  for (const row of res.rows) {
    await client.query(
      `UPDATE face_identities SET display_name = COALESCE(
         (SELECT display_name FROM global_speakers WHERE id = $2),
         display_name
       )
       WHERE id = $1 AND display_name IS NULL`,
      [row.face_identity_id, row.global_speaker_id],
    );
  }

  return res.rows.map((r) => ({
    face_identity_id: r.face_identity_id,
    global_speaker_id: r.global_speaker_id,
    confidence: parseFloat(r.confidence),
  }));
}
