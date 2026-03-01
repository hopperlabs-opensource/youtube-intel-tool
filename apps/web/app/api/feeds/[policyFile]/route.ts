import { NextResponse } from "next/server";
import { getLatestCompletedPolicyRun, getPool, getSavedPolicyByIdAndToken, initMetrics, listPolicyFeedItems } from "@yt/core";
import { FeedJsonResponseSchema } from "@yt/contracts";
import { jsonError, classifyApiError } from "@/lib/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function withTimestamp(videoUrl: string, startMs: number): string {
  try {
    const u = new URL(videoUrl);
    u.searchParams.set("t", `${Math.floor(startMs / 1000)}s`);
    return u.toString();
  } catch {
    return videoUrl;
  }
}

export async function GET(req: Request, ctx: { params: Promise<{ policyFile: string }> }) {
  const metrics = initMetrics();
  try {
    const { policyFile } = await ctx.params;
    const match = policyFile.match(/^(.+)\.(json|rss)$/);
    if (!match) return jsonError("invalid_request", "expected /api/feeds/<policyId>.json|rss", { status: 400 });
    const policyId = match[1]!;
    const format = match[2]!;

    const url = new URL(req.url);
    const token = url.searchParams.get("token")?.trim() ?? "";
    if (!token) return jsonError("unauthorized", "missing feed token", { status: 401 });

    const pool = getPool();
    const client = await pool.connect();
    try {
      const policy = await getSavedPolicyByIdAndToken(client, policyId, token);
      if (!policy) return jsonError("unauthorized", "invalid feed token", { status: 401 });

      const run = await getLatestCompletedPolicyRun(client, policy.id);
      const items = run
        ? await listPolicyFeedItems(client, {
            policy_id: policy.id,
            run_id: run.id,
            buckets: ["high", "medium"],
            limit: 200,
          })
        : [];

      if (format === "json") {
        metrics.httpRequestsTotal.inc({ route: "/api/feeds/:policyFile", method: "GET", status: "200" });
        return NextResponse.json(
          FeedJsonResponseSchema.parse({
            policy: { id: policy.id, name: policy.name },
            run: run && run.finished_at ? { id: run.id, finished_at: run.finished_at } : null,
            generated_at: new Date().toISOString(),
            items,
          })
        );
      }

      const feedTitle = `${policy.name} - YouTube Intel Feed`;
      const feedLink = `${url.origin}/api/feeds/${policy.id}.rss?token=${encodeURIComponent(token)}`;
      const now = new Date().toUTCString();
      const rssItems = items
        .map((item) => {
          const atLink = withTimestamp(item.video_url, item.start_ms);
          const pubDate = new Date(item.run_finished_at).toUTCString();
          const title = item.title || item.provider_video_id;
          const desc = `${item.snippet} [${item.priority_bucket.toUpperCase()} ${item.priority_score.toFixed(3)}]`;
          return [
            "<item>",
            `  <guid isPermaLink="false">${escapeXml(item.hit_id)}</guid>`,
            `  <title>${escapeXml(title)}</title>`,
            `  <link>${escapeXml(atLink)}</link>`,
            `  <description>${escapeXml(desc)}</description>`,
            `  <pubDate>${escapeXml(pubDate)}</pubDate>`,
            "</item>",
          ].join("\n");
        })
        .join("\n");

      const xml = [
        `<?xml version="1.0" encoding="UTF-8"?>`,
        `<rss version="2.0">`,
        `<channel>`,
        `  <title>${escapeXml(feedTitle)}</title>`,
        `  <link>${escapeXml(feedLink)}</link>`,
        `  <description>${escapeXml("Prioritized policy hits from YouTube Intel Tool")}</description>`,
        `  <lastBuildDate>${escapeXml(now)}</lastBuildDate>`,
        rssItems,
        `</channel>`,
        `</rss>`,
      ].join("\n");

      metrics.httpRequestsTotal.inc({ route: "/api/feeds/:policyFile", method: "GET", status: "200" });
      return new Response(xml, {
        status: 200,
        headers: {
          "content-type": "application/rss+xml; charset=utf-8",
          "cache-control": "no-store",
        },
      });
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const apiErr = classifyApiError(err);
    metrics.httpRequestsTotal.inc({ route: "/api/feeds/:policyFile", method: "GET", status: String(apiErr.status) });
    return jsonError(apiErr.code, apiErr.message, { status: apiErr.status, details: apiErr.details });
  }
}
