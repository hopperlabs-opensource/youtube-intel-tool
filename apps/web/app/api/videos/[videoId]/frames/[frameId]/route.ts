import { NextResponse } from "next/server";
import fs from "fs/promises";
import { getPool, initMetrics } from "@yt/core";
import { getFrameById, getFrameAnalysisForFrame } from "@yt/core";
import { GetFrameAnalysisResponseSchema } from "@yt/contracts";
import { jsonError } from "@/lib/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ videoId: string; frameId: string }> }) {
  const metrics = initMetrics();
  try {
    const { videoId, frameId } = await ctx.params;
    const url = new URL(req.url);
    const wantImage = url.searchParams.get("image") === "true";

    const pool = getPool();
    const client = await pool.connect();
    try {
      const frame = await getFrameById(client, videoId, frameId);
      if (!frame) {
        metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/frames/:fid", method: "GET", status: "404" });
        return jsonError("not_found", "frame not found", { status: 404 });
      }

      // If ?image=true, serve the raw JPEG binary
      if (wantImage) {
        try {
          const data = await fs.readFile(frame.file_path);
          return new NextResponse(data, {
            headers: {
              "content-type": frame.file_path.endsWith(".png") ? "image/png" : "image/jpeg",
              "cache-control": "public, max-age=86400",
            },
          });
        } catch {
          return jsonError("file_not_found", "frame image file not found", { status: 404 });
        }
      }

      const analysis = await getFrameAnalysisForFrame(client, frameId);

      metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/frames/:fid", method: "GET", status: "200" });
      return NextResponse.json(GetFrameAnalysisResponseSchema.parse({ frame, analysis }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/frames/:fid", method: "GET", status: "500" });
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError("internal_error", msg, { status: 500 });
  }
}
