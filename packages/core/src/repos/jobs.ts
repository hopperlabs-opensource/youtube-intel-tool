import { JobLogSchema, JobSchema, type Job, type JobLog, type JobStatus } from "@yt/contracts";
import type pg from "pg";

export async function createJob(
  client: pg.PoolClient,
  input: { type: string; status: JobStatus; progress?: number | null; input_json?: unknown | null }
): Promise<Job> {
  const res = await client.query(
    `
    INSERT INTO jobs (type, status, progress, input_json)
    VALUES ($1, $2, $3, $4)
    RETURNING
      id::text as id,
      type,
      status,
      progress,
      input_json,
      output_json,
      error,
      created_at::text as created_at,
      started_at::text as started_at,
      finished_at::text as finished_at
    `,
    [input.type, input.status, input.progress ?? null, input.input_json ?? null]
  );
  return JobSchema.parse(res.rows[0]);
}

export async function getJobById(client: pg.PoolClient, jobId: string): Promise<Job | null> {
  const res = await client.query(
    `
    SELECT
      id::text as id,
      type,
      status,
      progress,
      input_json,
      output_json,
      error,
      created_at::text as created_at,
      started_at::text as started_at,
      finished_at::text as finished_at
    FROM jobs
    WHERE id = $1
    `,
    [jobId]
  );
  if (res.rowCount === 0) return null;
  return JobSchema.parse(res.rows[0]);
}

export async function updateJobStatus(
  client: pg.PoolClient,
  jobId: string,
  patch: Partial<{ status: JobStatus; progress: number | null; output_json: unknown | null; error: string | null }>
): Promise<Job> {
  const status = patch.status;
  const progress = patch.progress;
  const output_json = patch.output_json;
  const error = patch.error;

  const res = await client.query(
    `
    UPDATE jobs
    SET
      status = COALESCE($2, status),
      progress = COALESCE($3, progress),
      output_json = COALESCE($4, output_json),
      error = COALESCE($5, error),
      started_at = CASE WHEN $2 = 'running' AND started_at IS NULL THEN now() ELSE started_at END,
      finished_at = CASE WHEN $2 IN ('completed','failed','canceled') THEN now() ELSE finished_at END
    WHERE id = $1
    RETURNING
      id::text as id,
      type,
      status,
      progress,
      input_json,
      output_json,
      error,
      created_at::text as created_at,
      started_at::text as started_at,
      finished_at::text as finished_at
    `,
    [jobId, status ?? null, progress ?? null, output_json ?? null, error ?? null]
  );
  return JobSchema.parse(res.rows[0]);
}

export async function addJobLog(
  client: pg.PoolClient,
  jobId: string,
  input: { level?: string; message: string; data_json?: unknown }
): Promise<void> {
  await client.query(
    `INSERT INTO job_logs (job_id, level, message, data_json) VALUES ($1, $2, $3, $4)`,
    [jobId, input.level ?? "info", input.message, input.data_json ?? null]
  );
}

export async function listJobLogs(client: pg.PoolClient, jobId: string, opts?: { limit?: number }): Promise<JobLog[]> {
  const limit = Math.min(opts?.limit ?? 500, 2000);
  const res = await client.query(
    `
    SELECT
      id::text as id,
      job_id::text as job_id,
      ts::text as ts,
      level,
      message,
      data_json
    FROM job_logs
    WHERE job_id = $1
    ORDER BY ts ASC
    LIMIT $2
    `,
    [jobId, limit]
  );
  return res.rows.map((r) => JobLogSchema.parse(r));
}

export async function listJobLogsAfter(
  client: pg.PoolClient,
  jobId: string,
  opts?: { cursor_ts?: string | null; cursor_id?: string | null; limit?: number }
): Promise<JobLog[]> {
  const limit = Math.min(opts?.limit ?? 500, 2000);
  const cursorTs = opts?.cursor_ts ?? null;
  const cursorId = opts?.cursor_id ?? null;

  const res = await client.query(
    `
    SELECT
      id::text as id,
      job_id::text as job_id,
      ts::text as ts,
      level,
      message,
      data_json
    FROM job_logs
    WHERE job_id = $1
      AND (
        $2::timestamptz IS NULL
        OR (ts, id) > ($2::timestamptz, COALESCE($3::uuid, '00000000-0000-0000-0000-000000000000'::uuid))
      )
    ORDER BY ts ASC, id ASC
    LIMIT $4
    `,
    [jobId, cursorTs, cursorId, limit]
  );
  return res.rows.map((r) => JobLogSchema.parse(r));
}
