import { NextResponse } from "next/server";
import { createEmbedderFromEnv, getPool, initMetrics, searchChunksByVideoSemantic, searchCuesByVideo } from "@yt/core";
import { SearchRequestSchema, SearchResponseSchema } from "@yt/contracts";
import type { SearchHit } from "@yt/contracts";
import { jsonError } from "@/lib/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ videoId: string }> }) {
  const metrics = initMetrics();
  try {
    const { videoId } = await ctx.params;
    const body = SearchRequestSchema.parse(await req.json());

    const pool = getPool();
    const client = await pool.connect();
    try {
      let hits;
      let embedding_error: string | null = null;

      if (body.mode === "keyword") {
        hits = await searchCuesByVideo(client, videoId, body.query, { limit: body.limit, language: "en" });
      } else if (body.mode === "semantic") {
        try {
          const embedder = createEmbedderFromEnv();
          const emb = await embedder.embed(body.query);
          if (emb.length !== 768) return jsonError("embed_dim_mismatch", `expected 768 dims, got ${emb.length}`, { status: 500 });
          hits = await searchChunksByVideoSemantic(client, videoId, emb, {
            limit: body.limit,
            language: "en",
            model_id: embedder.model_id,
          });
        } catch (err: unknown) {
          embedding_error = err instanceof Error ? err.message : String(err);
          // Best-effort fallback: semantic search unavailable; return keyword hits so the UX doesn't dead-end.
          hits = await searchCuesByVideo(client, videoId, body.query, { limit: body.limit, language: "en" });
        }
      } else {
        // Hybrid = keyword + semantic merged by cue_id
        const kw = await searchCuesByVideo(client, videoId, body.query, { limit: body.limit, language: "en" });
        let sem: typeof kw = [];
        try {
          const embedder = createEmbedderFromEnv();
          const emb = await embedder.embed(body.query);
          if (emb.length === 768) {
            sem = await searchChunksByVideoSemantic(client, videoId, emb, {
              limit: body.limit,
              language: "en",
              model_id: embedder.model_id,
            });
          }
        } catch (err: unknown) {
          embedding_error = err instanceof Error ? err.message : String(err);
          sem = [];
        }

        const byCue = new Map<string, SearchHit>();
        for (const h of sem) byCue.set(h.cue_id, { ...h, score: h.score * 1.2 });
        for (const h of kw) {
          const existing = byCue.get(h.cue_id);
          if (!existing) byCue.set(h.cue_id, h);
          else byCue.set(h.cue_id, { ...existing, score: Math.max(existing.score, h.score), snippet: existing.snippet || h.snippet });
        }
        hits = Array.from(byCue.values()).sort((a, b) => b.score - a.score).slice(0, body.limit);
      }

      metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/search", method: "POST", status: "200" });
      return NextResponse.json(SearchResponseSchema.parse({ hits, embedding_error }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/search", method: "POST", status: "400" });
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError("invalid_request", msg, { status: 400 });
  }
}
