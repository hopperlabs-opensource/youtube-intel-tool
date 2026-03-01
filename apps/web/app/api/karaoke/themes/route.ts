import { NextResponse } from "next/server";
import { KARAOKE_THEMES, initMetrics } from "@yt/core";
import { ListKaraokeThemesResponseSchema } from "@yt/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const metrics = initMetrics();
  metrics.httpRequestsTotal.inc({ route: "/api/karaoke/themes", method: "GET", status: "200" });
  return NextResponse.json(ListKaraokeThemesResponseSchema.parse({ themes: KARAOKE_THEMES }));
}
