import { NextResponse } from "next/server";
import { getPool, initMetrics } from "@yt/core";
import type { FrameAnalysis } from "@yt/core";
import { getFrameAnalysesByVideo, getVisualJobMeta } from "@yt/core";
import { getLatestTranscriptForVideo, listCuesByTranscript } from "@yt/core";
import { synthesizeNarrative } from "@yt/core";
import { resolveTextConfig, createTextLlm } from "@yt/core";
import {
  GetNarrativeSynthesisResponseSchema,
  SceneTypeSchema,
  type TranscriptCue,
} from "@yt/contracts";
import { jsonError } from "@/lib/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ videoId: string }> }) {
  const metrics = initMetrics();
  try {
    const { videoId } = await ctx.params;
    const pool = getPool();
    const client = await pool.connect();
    try {
      const meta = await getVisualJobMeta(client, videoId);
      if (!meta?.completed_at) {
        return jsonError("not_found", "No completed visual analysis found for this video", { status: 404 });
      }

      const analyses = await getFrameAnalysesByVideo(client, videoId);
      if (analyses.length === 0) {
        return jsonError("not_found", "No frame analyses found", { status: 404 });
      }

      // Load transcript cues for richer narrative
      let transcriptCues: TranscriptCue[] = [];
      try {
        const transcript = await getLatestTranscriptForVideo(client, videoId, { language: "en" });
        if (transcript) {
          const cuesRes = await listCuesByTranscript(client, transcript.id, { cursorIdx: 0, limit: 5000 });
          transcriptCues = cuesRes.cues;
        }
      } catch {
        // Transcript may not exist
      }

      // Map DB rows to FrameAnalysis shape
      const frameAnalyses: FrameAnalysis[] = analyses.map((a) => {
        const parsedSceneType = SceneTypeSchema.safeParse(a.scene_type);
        return {
          frameIndex: 0,
          timestampMs: a.start_ms,
          startMs: a.start_ms,
          endMs: a.end_ms,
          description: a.description,
          objects: Array.isArray(a.objects) ? a.objects : [],
          textOverlay: a.text_overlay,
          sceneType: parsedSceneType.success ? parsedSceneType.data : null,
          provider: a.provider,
          model: a.model,
          promptTokens: a.prompt_tokens,
          completionTokens: a.completion_tokens,
        };
      });

      // Create a text-only LLM call via the unified LLM adapter
      const llmConfig = resolveTextConfig();
      const textLlm = createTextLlm(llmConfig);

      const narrative = await synthesizeNarrative({
        analyses: frameAnalyses,
        transcriptCues,
        llmCall: async (prompt: string) => {
          const res = await textLlm.call(prompt);
          return res.text;
        },
      });

      const response = {
        narrative: {
          video_id: videoId,
          summary: narrative.summary,
          key_moments: narrative.keyMoments.map((m) => ({
            timestamp_ms: m.timestampMs,
            description: m.description,
          })),
          visual_themes: narrative.visualThemes,
          scene_breakdown: narrative.sceneBreakdown.map((s) => ({
            scene_type: s.sceneType,
            count: s.count,
            percentage: s.percentage,
          })),
          provider: llmConfig.textProvider,
          model: llmConfig.textModel,
          total_frames: narrative.totalFrames,
        },
      };

      metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/visual/narrative", method: "GET", status: "200" });
      return NextResponse.json(GetNarrativeSynthesisResponseSchema.parse(response));
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    metrics.httpRequestsTotal.inc({ route: "/api/videos/:id/visual/narrative", method: "GET", status: "500" });
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError("internal_error", msg, { status: 500 });
  }
}
