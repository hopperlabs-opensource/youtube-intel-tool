import { getPool, initMetrics, listCuesByTranscript } from "@yt/core";
import { jsonError, classifyApiError } from "@/lib/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function formatVttTime(ms: number): string {
  const total = Math.max(0, ms);
  const h = Math.floor(total / 3_600_000);
  const m = Math.floor((total % 3_600_000) / 60_000);
  const s = Math.floor((total % 60_000) / 1000);
  const msPart = total % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(msPart).padStart(3, "0")}`;
}

export async function GET(req: Request, ctx: { params: Promise<{ transcriptId: string }> }) {
  const metrics = initMetrics();
  try {
    const { transcriptId } = await ctx.params;
    const url = new URL(req.url);
    const format = (url.searchParams.get("format") || "txt").toLowerCase();

    const pool = getPool();
    const client = await pool.connect();
    try {
      const { cues } = await listCuesByTranscript(client, transcriptId, { cursorIdx: 0, limit: 5000 });

      if (format === "txt") {
        const body = cues.map((c) => c.text).join("\n");
        metrics.httpRequestsTotal.inc({ route: "/api/transcripts/:id/export", method: "GET", status: "200" });
        return new Response(body, {
          status: 200,
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "content-disposition": `attachment; filename=\"${transcriptId}.txt\"`,
          },
        });
      }

      if (format === "vtt") {
        let out = "WEBVTT\n\n";
        for (const c of cues) {
          out += `${formatVttTime(c.start_ms)} --> ${formatVttTime(c.end_ms)}\n`;
          out += `${c.text}\n\n`;
        }
        metrics.httpRequestsTotal.inc({ route: "/api/transcripts/:id/export", method: "GET", status: "200" });
        return new Response(out, {
          status: 200,
          headers: {
            "content-type": "text/vtt; charset=utf-8",
            "content-disposition": `attachment; filename=\"${transcriptId}.vtt\"`,
          },
        });
      }

      return jsonError("invalid_format", "format must be txt or vtt", { status: 400 });
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const apiErr = classifyApiError(err);
    metrics.httpRequestsTotal.inc({ route: "/api/transcripts/:id/export", method: "GET", status: String(apiErr.status) });
    return jsonError(apiErr.code, apiErr.message, { status: apiErr.status, details: apiErr.details });
  }
}
