import { NextResponse } from "next/server";
import { getPool, initMetrics } from "@yt/core";
import { updateFaceIdentityDisplayName } from "@yt/core";
import { UpdateFaceIdentityRequestSchema, UpdateFaceIdentityResponseSchema } from "@yt/contracts";
import { jsonError } from "@/lib/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ videoId: string; identityId: string }> },
) {
  const metrics = initMetrics();
  try {
    const { identityId } = await ctx.params;
    const body = UpdateFaceIdentityRequestSchema.parse(await req.json());
    const pool = getPool();
    const client = await pool.connect();
    try {
      const identity = await updateFaceIdentityDisplayName(client, identityId, body.display_name);
      if (!identity) {
        return jsonError("not_found", "Face identity not found", { status: 404 });
      }
      metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/faces/:id", method: "PATCH", status: "200" });
      return NextResponse.json(UpdateFaceIdentityResponseSchema.parse({ identity }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/faces/:id", method: "PATCH", status: "400" });
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError("invalid_request", msg, { status: 400 });
  }
}
