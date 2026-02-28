import { getEmbeddingsStatus, initMetrics } from "@yt/core";
import { NextResponse } from "next/server";
import { getEmbeddingsEnvForRequest, getOpenAIKeySourceForRequest } from "@/lib/server/openai_key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const metrics = initMetrics();
  try {
    const key = getOpenAIKeySourceForRequest(req);
    const embeddings = getEmbeddingsStatus(getEmbeddingsEnvForRequest(req));
    metrics.httpRequestsTotal.inc({ route: "/api/settings/openai", method: "GET", status: "200" });
    return NextResponse.json({
      openai: {
        env_available: key.envAvailable,
        request_key_provided: key.headerProvided,
        effective_source: key.effectiveSource,
      },
      embeddings,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    metrics.httpRequestsTotal.inc({ route: "/api/settings/openai", method: "GET", status: "400" });
    return NextResponse.json(
      { error: { code: "settings_openai_failed", message } },
      { status: 400 }
    );
  }
}

