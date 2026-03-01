import { NextResponse } from "next/server";
import { createEmbedderFromEnv, getPool, initMetrics, searchChunksByVideoSemantic, searchCuesByVideo, searchCuesByVideoUnified, searchFrameChunksByVideoSemantic } from "@yt/core";
import { SearchRequestSchema, SearchResponseSchema } from "@yt/contracts";
import type { SearchHit } from "@yt/contracts";
import { jsonError } from "@/lib/server/api";
import { getEmbeddingsEnvForRequest } from "@/lib/server/openai_key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ videoId: string }> }) {
  const metrics = initMetrics();
  try {
    const { videoId } = await ctx.params;
    const body = SearchRequestSchema.parse(await req.json());
    const embedEnv = getEmbeddingsEnvForRequest(req);
    const sourceType = body.source_type ?? "all";

    const pool = getPool();
    const client = await pool.connect();
    try {
      let hits: SearchHit[];
      let embedding_error: string | null = null;

      if (body.mode === "keyword") {
        hits = await searchCuesByVideoUnified(client, videoId, body.query, {
          limit: body.limit,
          language: "en",
          sourceType,
        });
      } else if (body.mode === "semantic") {
        try {
          const embedder = createEmbedderFromEnv(embedEnv);
          const emb = await embedder.embed(body.query);
          if (emb.length !== 768) return jsonError("embed_dim_mismatch", `expected 768 dims, got ${emb.length}`, { status: 500 });

          if (sourceType === "visual") {
            hits = await searchFrameChunksByVideoSemantic(client, videoId, emb, {
              limit: body.limit,
              model_id: embedder.model_id,
            });
          } else if (sourceType === "transcript") {
            hits = await searchChunksByVideoSemantic(client, videoId, emb, {
              limit: body.limit,
              language: "en",
              model_id: embedder.model_id,
            });
          } else {
            // "all": merge transcript + visual semantic
            const transcriptHits = await searchChunksByVideoSemantic(client, videoId, emb, {
              limit: body.limit,
              language: "en",
              model_id: embedder.model_id,
            });
            let visualHits: SearchHit[] = [];
            try {
              visualHits = await searchFrameChunksByVideoSemantic(client, videoId, emb, {
                limit: Math.min(body.limit, 10),
                model_id: embedder.model_id,
              });
            } catch {
              // Visual search may not be available
            }
            const merged = [...transcriptHits, ...visualHits]
              .sort((a, b) => b.score - a.score)
              .slice(0, body.limit);
            hits = merged;
          }
        } catch (err: unknown) {
          embedding_error = err instanceof Error ? err.message : String(err);
          hits = await searchCuesByVideoUnified(client, videoId, body.query, {
            limit: body.limit,
            language: "en",
            sourceType,
          });
        }
      } else {
        // Hybrid = keyword + semantic merged by cue_id
        const kw = await searchCuesByVideoUnified(client, videoId, body.query, {
          limit: body.limit,
          language: "en",
          sourceType,
        });
        let sem: SearchHit[] = [];
        try {
          const embedder = createEmbedderFromEnv(embedEnv);
          const emb = await embedder.embed(body.query);
          if (emb.length === 768) {
            if (sourceType === "visual") {
              sem = await searchFrameChunksByVideoSemantic(client, videoId, emb, {
                limit: body.limit,
                model_id: embedder.model_id,
              });
            } else if (sourceType === "transcript") {
              sem = await searchChunksByVideoSemantic(client, videoId, emb, {
                limit: body.limit,
                language: "en",
                model_id: embedder.model_id,
              });
            } else {
              const tSem = await searchChunksByVideoSemantic(client, videoId, emb, {
                limit: body.limit,
                language: "en",
                model_id: embedder.model_id,
              });
              let vSem: SearchHit[] = [];
              try {
                vSem = await searchFrameChunksByVideoSemantic(client, videoId, emb, {
                  limit: Math.min(body.limit, 10),
                  model_id: embedder.model_id,
                });
              } catch {
                // Visual search may not be available
              }
              sem = [...tSem, ...vSem];
            }
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
