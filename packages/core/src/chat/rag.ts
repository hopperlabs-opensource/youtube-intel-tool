import type pg from "pg";
import type { SearchHit, TranscriptCue } from "@yt/contracts";
import { ChatSourceSchema, type ChatSource } from "@yt/contracts";
import { createEmbedderFromEnv } from "../embeddings/provider";
import { listCuesInWindow } from "../repos/cues";
import { getChunksByIds } from "../repos/chunks";
import { searchCuesByVideo, searchChunksByVideoSemantic } from "../repos/search";
import { getLatestTranscriptForVideo } from "../repos/transcripts";

function formatHms(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function cleanSnippet(s: string, maxLen: number): string {
  const oneLine = s.replace(/\s+/g, " ").trim();
  if (oneLine.length <= maxLen) return oneLine;
  return `${oneLine.slice(0, Math.max(0, maxLen - 3))}...`;
}

function pickCenteredWindowCues(cues: TranscriptCue[], atMs: number | null, max: number): TranscriptCue[] {
  if (cues.length <= max) return cues;
  if (atMs == null) return cues.slice(0, max);

  // Find cue whose start is closest but <= atMs.
  let best = 0;
  let lo = 0;
  let hi = cues.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].start_ms <= atMs) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  const half = Math.floor(max / 2);
  const start = Math.max(0, best - half);
  const end = Math.min(cues.length, start + max);
  return cues.slice(start, end);
}

export function extractCitedRefsFromAnswer(answer: string): string[] {
  const matches = answer.match(/\[S\d+\]/g) ?? [];
  const refs = matches.map((m) => m.slice(1, -1));
  return Array.from(new Set(refs));
}

export async function buildRagForVideoChat(
  client: pg.PoolClient,
  opts: {
    videoId: string;
    at_ms: number | null;
    language: string;
    query: string;
    window_ms: number;
    semantic_k: number;
    keyword_k: number;
    max_window_cues?: number;
    max_sources?: number;
  }
): Promise<{
  transcript_id: string;
  system_prompt: string;
  sources: ChatSource[];
  retrieval: {
    transcript_id: string;
    window: { start_ms: number; end_ms: number };
    window_cues: number;
    semantic_hits: number;
    keyword_hits: number;
    embedding_error: string | null;
  };
}> {
  const transcript = await getLatestTranscriptForVideo(client, opts.videoId, { language: opts.language });
  if (!transcript) throw new Error("No transcript found. Run ingest first.");

  const atMs = opts.at_ms ?? 0;
  const half = Math.floor(opts.window_ms / 2);
  const windowStart = Math.max(0, atMs - half);
  const windowEnd = atMs + half;

  const maxWindowCues = Math.min(opts.max_window_cues ?? 60, 200);
  const allWindowCues = await listCuesInWindow(client, transcript.id, {
    start_ms: windowStart,
    end_ms: windowEnd,
    limit: 2000,
  });
  const windowCues = pickCenteredWindowCues(allWindowCues, opts.at_ms, maxWindowCues);

  const keywordHits =
    opts.keyword_k > 0
      ? await searchCuesByVideo(client, opts.videoId, opts.query, { limit: opts.keyword_k, language: opts.language })
      : [];

  let semanticHits: SearchHit[] = [];
  let embeddingError: string | null = null;
  let chunkTextById = new Map<string, string>();

  if (opts.semantic_k > 0) {
    try {
      const embedder = createEmbedderFromEnv();
      const embedding = await embedder.embed(opts.query);
      if (embedding.length !== 768) throw new Error(`expected 768 dims, got ${embedding.length}`);
      semanticHits = await searchChunksByVideoSemantic(client, opts.videoId, embedding, {
        limit: opts.semantic_k,
        language: opts.language,
        model_id: embedder.model_id,
      });

      const chunkIds = semanticHits.map((h) => h.chunk_id).filter(Boolean) as string[];
      const chunks = await getChunksByIds(client, chunkIds);
      for (const ch of chunks) chunkTextById.set(ch.id, ch.text);
    } catch (err: any) {
      embeddingError = String(err?.message || err);
      semanticHits = [];
    }
  }

  const maxSources = Math.min(opts.max_sources ?? 80, 120);
  const sources: ChatSource[] = [];
  const seen = new Set<string>();

  function addSource(s: Omit<ChatSource, "ref">) {
    if (sources.length >= maxSources) return;
    const key = `${s.type}:${s.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    const ref = `S${sources.length + 1}`;
    sources.push(ChatSourceSchema.parse({ ...s, ref }));
  }

  // 1) "Now" window cues (time-aligned; best for follow-along).
  for (const c of windowCues) {
    addSource({
      type: "cue",
      id: c.id,
      start_ms: c.start_ms,
      end_ms: c.end_ms,
      snippet: cleanSnippet(c.text, 240),
    });
  }

  // 2) Semantic chunks (best for conceptual grounding).
  for (const h of semanticHits) {
    if (!h.chunk_id) continue;
    const full = chunkTextById.get(h.chunk_id) ?? h.snippet;
    addSource({
      type: "chunk",
      id: h.chunk_id,
      start_ms: h.start_ms,
      end_ms: h.end_ms,
      score: h.score,
      snippet: cleanSnippet(full, 900),
    });
  }

  // 3) Keyword cues (best for exact term match).
  for (const h of keywordHits) {
    addSource({
      type: "cue",
      id: h.cue_id,
      start_ms: h.start_ms,
      end_ms: h.end_ms,
      score: h.score,
      snippet: cleanSnippet(h.snippet, 240),
    });
  }

  const nowLine =
    opts.at_ms == null ? "Playhead: unknown." : `Playhead: t=${formatHms(opts.at_ms)} (at_ms=${opts.at_ms}).`;

  const sourcesText = sources
    .map((s) => {
      const t = `${formatHms(s.start_ms)}-${formatHms(s.end_ms)}`;
      return `[${s.ref}|${s.type}|${t}|start_ms=${s.start_ms}|end_ms=${s.end_ms}] ${s.snippet}`;
    })
    .join("\n");

  const system_prompt = [
    "You are a grounded assistant for a YouTube video's transcript and derived context.",
    "Use ONLY the SOURCES below; do not guess beyond them.",
    "When you use a source, cite it inline using the bracket form like [S1] or [S2].",
    "If the SOURCES are insufficient, say what is missing and ask a clarifying question.",
    nowLine,
    "",
    "SOURCES:",
    sourcesText || "(no sources)",
  ].join("\n");

  return {
    transcript_id: transcript.id,
    system_prompt,
    sources,
    retrieval: {
      transcript_id: transcript.id,
      window: { start_ms: windowStart, end_ms: windowEnd },
      window_cues: windowCues.length,
      semantic_hits: semanticHits.length,
      keyword_hits: keywordHits.length,
      embedding_error: embeddingError,
    },
  };
}
