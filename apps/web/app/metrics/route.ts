import { initMetrics } from "@yt/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const metrics = initMetrics();
  return new Response(await metrics.register.metrics(), {
    status: 200,
    headers: { "content-type": metrics.register.contentType },
  });
}

