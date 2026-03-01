import { NextResponse } from "next/server";
import { initMetrics } from "@yt/core";
import { estimateVisionCost } from "@yt/core";
import { CostEstimateSchema } from "@yt/contracts";
import { jsonError } from "@/lib/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ videoId: string }> }) {
  const metrics = initMetrics();
  try {
    await ctx.params; // validate params exist

    const url = new URL(req.url);
    const provider = url.searchParams.get("provider") || "claude";
    const model = url.searchParams.get("model") || "claude-sonnet-4-20250514";
    const maxFrames = parseInt(url.searchParams.get("maxFrames") || "200", 10);

    const estimate = estimateVisionCost({
      provider,
      model,
      frameCount: maxFrames,
    });

    metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/visual/estimate", method: "GET", status: "200" });
    return NextResponse.json(CostEstimateSchema.parse(estimate));
  } catch (err: unknown) {
    metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/visual/estimate", method: "GET", status: "500" });
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError("internal_error", msg, { status: 500 });
  }
}
