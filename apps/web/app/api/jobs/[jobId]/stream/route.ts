import { getJobById, getPool, initMetrics, listJobLogsAfter } from "@yt/core";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sseEncode(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

function isTerminal(status: string | undefined): boolean {
  return status === "completed" || status === "failed" || status === "canceled";
}

export async function GET(req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const metrics = initMetrics();
  const trace_id = randomUUID();

  const { jobId } = await ctx.params;
  const url = new URL(req.url);
  let cursor_ts = url.searchParams.get("cursor_ts");
  let cursor_id = url.searchParams.get("cursor_id");

  const pool = getPool();

  const stream = new ReadableStream({
    start: async (controller) => {
      const enc = new TextEncoder();
      const send = (obj: unknown) => controller.enqueue(enc.encode(sseEncode(obj)));

      send({ type: "hello", trace_id, job_id: jobId });

      let lastJobSig = "";
      let lastHeartbeatAt = 0;

      while (!req.signal.aborted) {
        try {
          const client = await pool.connect();
          try {
            const job = await getJobById(client, jobId);
            if (!job) {
              send({ type: "error", error: { code: "not_found", message: "job not found" } });
              controller.close();
              return;
            }

            const sig = JSON.stringify({
              status: job.status,
              progress: job.progress,
              error: job.error,
              started_at: job.started_at,
              finished_at: job.finished_at,
              output_json: job.output_json,
            });
            if (sig !== lastJobSig) {
              lastJobSig = sig;
              send({ type: "job", job });
            }

            const logs = await listJobLogsAfter(client, jobId, { cursor_ts, cursor_id, limit: 2000 });
            for (const log of logs) {
              send({ type: "log", log });
              cursor_ts = log.ts;
              cursor_id = log.id;
            }

            if (isTerminal(job.status)) {
              metrics.httpRequestsTotal.inc({ route: "/api/jobs/:id/stream", method: "GET", status: "200" });
              send({ type: "done", job });
              controller.close();
              return;
            }
          } finally {
            client.release();
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          metrics.httpRequestsTotal.inc({ route: "/api/jobs/:id/stream", method: "GET", status: "400" });
          send({ type: "error", error: { code: "stream_failed", message: msg } });
          controller.close();
          return;
        }

        // Heartbeat (helps keep proxies from buffering forever).
        if (Date.now() - lastHeartbeatAt > 15_000) {
          lastHeartbeatAt = Date.now();
          send({ type: "heartbeat", ts: new Date().toISOString() });
        }

        await new Promise((r) => setTimeout(r, 750));
      }

      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-trace-id": trace_id,
    },
  });
}
