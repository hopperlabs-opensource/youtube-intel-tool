import type pg from "pg";
import { ChatTurnSchema, ChatTurnSummarySchema, type ChatTurn, type ChatTurnSummary } from "@yt/contracts";

export async function createChatTurn(
  client: pg.PoolClient,
  input: {
    video_id: string;
    transcript_id: string;
    trace_id: string;
    provider: string;
    model_id: string;
    at_ms: number | null;
    request_json: unknown;
    retrieval_json: unknown;
  }
): Promise<{ id: string }> {
  const res = await client.query(
    `
    INSERT INTO chat_turns (
      video_id,
      transcript_id,
      trace_id,
      provider,
      model_id,
      status,
      at_ms,
      request_json,
      retrieval_json
    )
    VALUES ($1::uuid, $2::uuid, $3::text, $4::text, $5::text, 'running', $6::int, $7::jsonb, $8::jsonb)
    RETURNING id::text as id
    `,
    [
      input.video_id,
      input.transcript_id,
      input.trace_id,
      input.provider,
      input.model_id,
      input.at_ms,
      input.request_json ?? null,
      input.retrieval_json ?? null,
    ]
  );
  return { id: res.rows[0].id };
}

export async function finishChatTurn(
  client: pg.PoolClient,
  input: {
    id: string;
    status: "completed" | "failed" | "canceled";
    response_text: string | null;
    response_json: unknown;
    error: string | null;
    duration_ms: number | null;
  }
): Promise<void> {
  await client.query(
    `
    UPDATE chat_turns
    SET
      status = $2::text,
      response_text = $3::text,
      response_json = $4::jsonb,
      error = $5::text,
      finished_at = now(),
      duration_ms = $6::int
    WHERE id = $1::uuid
    `,
    [input.id, input.status, input.response_text, input.response_json ?? null, input.error, input.duration_ms]
  );
}

export async function listChatTurnsForVideo(
  client: pg.PoolClient,
  videoId: string,
  opts?: { limit?: number }
): Promise<ChatTurnSummary[]> {
  const limit = Math.min(opts?.limit ?? 50, 200);
  const res = await client.query(
    `
    SELECT
      id::text as id,
      trace_id,
      status,
      provider,
      model_id,
      at_ms,
      error,
      created_at::text as created_at,
      finished_at::text as finished_at,
      duration_ms
    FROM chat_turns
    WHERE video_id = $1::uuid
    ORDER BY created_at DESC
    LIMIT $2
    `,
    [videoId, limit]
  );
  return res.rows.map((r) => ChatTurnSummarySchema.parse(r));
}

export async function getChatTurnById(client: pg.PoolClient, turnId: string): Promise<ChatTurn | null> {
  const res = await client.query(
    `
    SELECT
      id::text as id,
      video_id::text as video_id,
      transcript_id::text as transcript_id,
      trace_id,
      status,
      provider,
      model_id,
      at_ms,
      error,
      request_json,
      retrieval_json,
      response_text,
      response_json,
      created_at::text as created_at,
      finished_at::text as finished_at,
      duration_ms
    FROM chat_turns
    WHERE id = $1::uuid
    LIMIT 1
    `,
    [turnId]
  );
  if (res.rowCount === 0) return null;
  return ChatTurnSchema.parse(res.rows[0]);
}
