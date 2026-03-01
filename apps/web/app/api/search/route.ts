import { NextResponse } from "next/server";
import {
  createEmbedderFromEnv,
  getPool,
  initMetrics,
  searchChunksSemanticGlobal,
  searchCuesKeywordGlobal,
} from "@yt/core";
import {
  LibrarySearchRequestSchema,
  LibrarySearchResponseSchema,
  type LibrarySearchHit,
} from "@yt/contracts";
import { jsonError, classifyApiError } from "@/lib/server/api";
import { getEmbeddingsEnvForRequest } from "@/lib/server/openai_key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const metrics = initMetrics();
  try {
    const body = LibrarySearchRequestSchema.parse(await req.json().catch(() => ({})));
    const pool = getPool();
    const client = await pool.connect();
    try {
      let embedding_error: string | null = null;

      if (body.mode === "keyword") {
        const hits = await searchCuesKeywordGlobal(client, body.query, {
          limit: body.limit,
          language: body.language,
          scope: body.scope,
        });
        metrics.httpRequestsTotal.inc({ route: "/api/search", method: "POST", status: "200" });
        return NextResponse.json(LibrarySearchResponseSchema.parse({ hits, embedding_error }));
      }

      const embedder = (() => {
        try {
          return createEmbedderFromEnv(getEmbeddingsEnvForRequest(req));
        } catch (err: unknown) {
          embedding_error = err instanceof Error ? err.message : String(err);
          return null;
        }
      })();

      const semantic = async (): Promise<LibrarySearchHit[]> => {
        if (!embedder) throw new Error(embedding_error || "semantic search unavailable");
        const emb = await embedder.embed(body.query);
        if (emb.length !== 768) throw new Error(`expected 768 dims, got ${emb.length}`);
        return searchChunksSemanticGlobal(client, emb, {
          limit: body.limit,
          language: body.language,
          model_id: embedder.model_id,
          scope: body.scope,
        });
      };

      if (body.mode === "semantic") {
        let hits: LibrarySearchHit[] = [];
        if (embedder) {
          try {
            hits = await semantic();
          } catch (err: unknown) {
            embedding_error = err instanceof Error ? err.message : String(err);
            hits = [];
          }
        } else {
          hits = [];
        }
        metrics.httpRequestsTotal.inc({ route: "/api/search", method: "POST", status: "200" });
        return NextResponse.json(LibrarySearchResponseSchema.parse({ hits, embedding_error }));
      }

      // Hybrid: semantic + keyword merged by (video_id,cue_id)
      const kw = await searchCuesKeywordGlobal(client, body.query, {
        limit: body.limit,
        language: body.language,
        scope: body.scope,
      });

      let sem: LibrarySearchHit[] = [];
      if (embedder) {
        try {
          sem = await semantic();
        } catch (err: unknown) {
          embedding_error = err instanceof Error ? err.message : String(err);
          sem = [];
        }
      } else {
        sem = [];
      }

      const byKey = new Map<string, LibrarySearchHit>();
      for (const h of sem) {
        const key = `${h.video_id}:${h.cue_id}`;
        byKey.set(key, { ...h, score: h.score * 1.2 });
      }
      for (const h of kw) {
        const key = `${h.video_id}:${h.cue_id}`;
        const existing = byKey.get(key);
        if (!existing) byKey.set(key, h);
        else
          byKey.set(key, {
            ...existing,
            score: Math.max(existing.score, h.score),
            snippet: existing.snippet || h.snippet,
          });
      }

      const hits = Array.from(byKey.values()).sort((a, b) => b.score - a.score).slice(0, body.limit);
      metrics.httpRequestsTotal.inc({ route: "/api/search", method: "POST", status: "200" });
      return NextResponse.json(LibrarySearchResponseSchema.parse({ hits, embedding_error }));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const apiErr = classifyApiError(err);
    metrics.httpRequestsTotal.inc({ route: "/api/search", method: "POST", status: String(apiErr.status) });
    return jsonError(apiErr.code, apiErr.message, { status: apiErr.status, details: apiErr.details });
  }
}
