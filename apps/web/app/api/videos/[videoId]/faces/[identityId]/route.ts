import { NextResponse } from "next/server";
import { getPool, initMetrics } from "@yt/core";
import { updateFaceIdentityDisplayName } from "@yt/core";
import { UpdateFaceIdentityRequestSchema, UpdateFaceIdentityResponseSchema } from "@yt/contracts";
import { jsonError, classifyApiError } from "@/lib/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ videoId: string; identityId: string }> },
) {
  const metrics = initMetrics();
  try {
    const { videoId, identityId } = await ctx.params;
    const body = UpdateFaceIdentityRequestSchema.parse(await req.json());
    const pool = getPool();
    const client = await pool.connect();
    try {
      let identity;
      try {
        identity = await updateFaceIdentityDisplayName(client, videoId, identityId, body.display_name);
      } catch (err: unknown) {
        if (err instanceof Error && err.message.includes("not found")) {
          metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/faces/:id", method: "PATCH", status: "404" });
          return jsonError("not_found", "Face identity not found", { status: 404 });
        }
        throw err;
      }
      if (!identity) {
        return jsonError("not_found", "Face identity not found", { status: 404 });
      }
      metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/faces/:id", method: "PATCH", status: "200" });
      return NextResponse.json(UpdateFaceIdentityResponseSchema.parse({ identity }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const apiErr = classifyApiError(err);
    metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/faces/:id", method: "PATCH", status: String(apiErr.status) });
    return jsonError(apiErr.code, apiErr.message, { status: apiErr.status, details: apiErr.details });
  }
}
