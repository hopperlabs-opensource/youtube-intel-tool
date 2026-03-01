import { getPool } from "@yt/core";
import {
  addJobLog,
  buildChunksFromCues,
  createTranscriptIfMissing,
  createEmbedderFromEnv,
  fetchYouTubeOEmbed,
  getVideoById,
  hashText,
  insertCues,
  insertEmbedding,
  listCuesByTranscript,
  listEntitiesForVideoInWindow,
  listChunksForTranscript,
  listTranscriptsForVideo,
  normalizeCueText,
  rebuildChunksForTranscript,
  replaceDiarizationForTranscript,
  upsertEntity,
  insertEntityMention,
  clearEntitiesForVideo,
  updateJobStatus,
  upsertContextItem,
  updateVideoMetadata,
  fetchWikipediaSummary,
  replaceVideoChapters,
  replaceVideoTags,
  runClaudeCliStructured,
  runCodexCliStructured,
  runGeminiCliStructured,
  resolveTextConfig,
  createTextLlm,
} from "@yt/core";
import { extractEntitiesFromText } from "@yt/core";
import {
  CliEnrichmentOutputSchema,
  type CliEnrichmentOutput,
  type CliEnrichmentEntity,
  type CliChapter,
  type EntityType,
  type LlmConfig,
} from "@yt/contracts";
import { fetchTranscriptBestEffort } from "../providers/transcript";
import { diarizeYouTubeBestEffort } from "../providers/diarize";
import { transcribeYouTubeBestEffort } from "../providers/stt";

type IngestJobData = {
  videoId: string;
  language: string;
  trace_id?: string;
  steps?: string[] | null;
  llmConfig?: LlmConfig;
};

function normalizeStepName(s: string): string {
  return s.trim().toLowerCase().replace(/-/g, "_");
}

function parseSteps(raw: unknown): Set<string> | null {
  // `null` means "caller did not provide steps" -> default behavior.
  // An explicit empty array `[]` means "run no optional steps".
  if (!Array.isArray(raw)) return null;
  const out = new Set<string>();
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const n = normalizeStepName(v);
    if (n) out.add(n);
  }
  return out;
}

function stepEnabled(steps: Set<string> | null, name: string): boolean {
  if (!steps) return true;
  return steps.has(normalizeStepName(name));
}

function clampInt(n: number, min: number, max: number): number {
  const x = Math.floor(n);
  if (x < min) return min;
  if (x > max) return max;
  return x;
}

function normAlias(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .replace(/[.,;:!?]+$/g, "");
}

function uniqStrings(items: string[], opts?: { max?: number }): string[] {
  const max = Math.max(1, opts?.max ?? 1000);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of items) {
    const s = String(v).trim();
    if (!s) continue;
    const key = normAlias(s);
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

function buildClaudeJsonSchema(): unknown {
  // JSON Schema for CliEnrichmentOutputSchema (kept local to avoid extra deps).
  return {
    type: "object",
    additionalProperties: false,
    required: ["entities", "tags", "chapters"],
    properties: {
      entities: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["type", "canonical_name", "aliases"],
          properties: {
            type: { type: "string", enum: ["person", "org", "location"] },
            canonical_name: { type: "string", minLength: 1 },
            aliases: { type: "array", items: { type: "string" } },
          },
        },
      },
      tags: { type: "array", items: { type: "string", minLength: 1 } },
      chapters: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["start_ms", "end_ms", "title"],
          properties: {
            start_ms: { type: "integer", minimum: 0 },
            end_ms: { type: "integer", minimum: 0 },
            title: { type: "string", minLength: 1 },
          },
        },
      },
    },
  };
}

function sanitizeCliOutput(
  raw: CliEnrichmentOutput,
  opts: { transcriptEndMs: number }
): { entities: CliEnrichmentEntity[]; tags: string[]; chapters: CliChapter[] } {
  const transcriptEndMs = Math.max(0, Math.floor(opts.transcriptEndMs));

  const entities = (raw.entities || [])
    .map((e) => ({
      type: e.type,
      canonical_name: String(e.canonical_name || "").trim(),
      aliases: uniqStrings([...(e.aliases || []), String(e.canonical_name || "")], { max: 64 }),
    }))
    .filter((e) => e.canonical_name.length > 0)
    .slice(0, 250);

  const tags = uniqStrings(raw.tags || [], { max: 100 })
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0)
    .slice(0, 100);

  const chapters = (raw.chapters || [])
    .map((c) => {
      const start_ms = clampInt(Number(c.start_ms), 0, transcriptEndMs || Number.MAX_SAFE_INTEGER);
      const end_ms = clampInt(Number(c.end_ms), 0, transcriptEndMs || Number.MAX_SAFE_INTEGER);
      const title = String(c.title || "").trim();
      return { start_ms, end_ms, title };
    })
    .filter((c) => c.title.length > 0 && c.end_ms > c.start_ms)
    .sort((a, b) => a.start_ms - b.start_ms)
    .slice(0, 200);

  // Ensure chapters don't have obviously invalid overlaps (best-effort).
  const cleaned: CliChapter[] = [];
  for (const ch of chapters) {
    const prev = cleaned[cleaned.length - 1];
    if (!prev) {
      cleaned.push(ch);
      continue;
    }
    if (ch.start_ms < prev.end_ms) {
      // If it overlaps heavily, skip; if it's a tiny overlap, nudge.
      const nudgedStart = prev.end_ms;
      if (ch.end_ms <= nudgedStart) continue;
      cleaned.push({ ...ch, start_ms: nudgedStart });
      continue;
    }
    cleaned.push(ch);
  }

  return { entities, tags, chapters: cleaned };
}

function buildCliPrompt(): string {
  return [
    "You are a strict JSON generator for video transcript enrichment.",
    "",
    "You will receive JSON on stdin with:",
    "- video metadata",
    "- transcript stats",
    "- compromise NER candidate mentions (surface forms + counts + example timestamps)",
    "- a trimmed list of transcript chunks with {start_ms,end_ms,text}",
    "",
    "Return ONLY valid JSON (no markdown, no prose) matching:",
    "{",
    '  "entities": Array<{ "type": "person"|"org"|"location", "canonical_name": string, "aliases": string[] }>,',
    '  "tags": string[],',
    '  "chapters": Array<{ "start_ms": number, "end_ms": number, "title": string }>',
    "}",
    "",
    "Rules:",
    "- Entities: dedupe/canonicalize fuzzy matches (aliases should include common variants found). Keep it high-signal (avoid generic words).",
    "- Tags: 10-30 short lowercase topics.",
    "- Chapters: 8-25, ordered, non-overlapping, covering major sections of the video. Use ms (integers).",
  ].join("\n");
}

function trimChunksForPrompt(chunks: Array<{ start_ms: number; end_ms: number; text: string }>, maxChars: number) {
  const out: Array<{ start_ms: number; end_ms: number; text: string }> = [];
  let used = 0;
  const budget = Math.max(10_000, maxChars);
  for (const ch of chunks) {
    if (used >= budget) break;
    const remain = budget - used;
    const text = ch.text.length > remain ? ch.text.slice(0, remain) : ch.text;
    out.push({ start_ms: ch.start_ms, end_ms: ch.end_ms, text });
    used += text.length;
  }
  return out;
}

export async function runIngestVideo(jobId: string, data: IngestJobData) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await updateJobStatus(client, jobId, { status: "running", progress: 0 });
    await addJobLog(client, jobId, { message: "Ingest started", data_json: data });

    const video = await getVideoById(client, data.videoId);
    if (!video) {
      await updateJobStatus(client, jobId, { status: "failed", error: "Video not found", progress: 100 });
      return;
    }

    const steps = parseSteps(data.steps);

    // Best-effort: update title/channel metadata for nicer UI.
    const meta = await fetchYouTubeOEmbed({ url: video.url, timeoutMs: 2000 });
    if (meta) {
      await updateVideoMetadata(client, video.id, {
        title: meta.title,
        channel_name: meta.author_name ?? null,
        thumbnail_url: meta.thumbnail_url ?? null,
      });
    }

    // 1) Transcript
    await addJobLog(client, jobId, { message: "Transcript: start", data_json: { step: "transcript" } });
    let transcriptSource: "best_effort" | "stt" = "best_effort";
    let providerRes: { is_generated: boolean; cues: Array<{ start: number; duration: number; text: string }> };
    let providerPayload: unknown = { provider: "python_youtube_transcript_api" };
    try {
      await addJobLog(client, jobId, { message: "Fetching transcript (best_effort)", data_json: { step: "transcript", provider: "best_effort" } });
      providerRes = await fetchTranscriptBestEffort({
        providerVideoId: video.provider_video_id,
        language: data.language,
      });
    } catch (e: any) {
      const msg = String(e?.message || e);
      await addJobLog(client, jobId, { level: "warn", message: "Transcript best_effort failed", data_json: { step: "transcript", error: msg } });

      // Optional fallback: STT (audio transcription) when subtitles are disabled.
      const sttProvider = (process.env.YIT_STT_PROVIDER || "").trim();
      // STT fallback is tied to transcript acquisition. Allow explicit per-job opt-out when
      // the caller provides a `steps` allowlist.
      const wantsStt = Boolean(sttProvider) && (steps ? stepEnabled(steps, "stt") : true);
      if (!wantsStt) throw e;

      await addJobLog(client, jobId, { message: "Transcribing audio (STT)", data_json: { step: "transcript", provider: sttProvider } });
      const stt = await transcribeYouTubeBestEffort({ url: video.url, language: data.language });
      providerRes = { is_generated: true, cues: stt.cues };
      transcriptSource = "stt";
      providerPayload = { provider: `stt:${stt.provider}`, model: stt.model };
    }

    const { transcript } = await createTranscriptIfMissing(client, {
      video_id: video.id,
      language: data.language,
      source: transcriptSource,
      is_generated: providerRes.is_generated,
      provider_payload: providerPayload,
    });

    // Insert cues (idempotent on transcript_id, idx)
    const cuesNormalized = providerRes.cues
      .map((c, idx) => {
        const start_ms = Math.max(0, Math.round(c.start * 1000));
        const end_ms = Math.max(start_ms, Math.round((c.start + c.duration) * 1000));
        const text = normalizeCueText(c.text);
        const norm_text = normalizeCueText(c.text).toLowerCase();
        return { idx, start_ms, end_ms, text, norm_text };
      })
      .filter((c) => c.text.length > 0);

    await insertCues(client, { video_id: video.id, transcript_id: transcript.id, cues: cuesNormalized });
    await updateJobStatus(client, jobId, { progress: 35 });
    await addJobLog(client, jobId, {
      message: `Transcript stored`,
      data_json: { step: "transcript", transcript_id: transcript.id, source: transcript.source, cues: cuesNormalized.length },
    });

    const allCuesRes = await listCuesByTranscript(client, transcript.id, { cursorIdx: 0, limit: 5000 });
    const allCues = allCuesRes.cues;
    const transcriptEndMs = allCues.length ? allCues[allCues.length - 1].end_ms : 0;

    // 2) Chunks (for semantic search + chat windows)
    await addJobLog(client, jobId, { message: "Building chunks" });
    const chunks = buildChunksFromCues(allCues, { maxChars: 1800, minChars: 400, overlapCues: 1 });
    await rebuildChunksForTranscript(client, transcript.id, chunks);
    await updateJobStatus(client, jobId, { progress: 45 });
    await addJobLog(client, jobId, { message: "Chunks stored", data_json: { chunks: chunks.length } });

    // 3) Embeddings (optional; requires Ollama running)
    let embeddingsCount = 0;
    let embeddingsError: string | null = null;
    let embeddingsModelId: string | null = null;
    try {
      const embedder = createEmbedderFromEnv();
      embeddingsModelId = embedder.model_id;
      await addJobLog(client, jobId, {
        message: "Building embeddings",
        data_json: { step: "embeddings", provider: embedder.provider, model_id: embedder.model_id, dimensions: embedder.dimensions },
      });

      const dbChunks = await listChunksForTranscript(client, transcript.id);
      for (const ch of dbChunks) {
        const embedding = await embedder.embed(ch.text);
        if (embedding.length !== 768) throw new Error(`Embedding dimensions mismatch: got ${embedding.length}, expected 768`);
        await insertEmbedding(client, {
          transcript_id: transcript.id,
          chunk_id: ch.id,
          model_id: embedder.model_id,
          dimensions: embedding.length,
          embedding,
          text_hash: hashText(ch.text),
        });
        embeddingsCount += 1;
      }
      await updateJobStatus(client, jobId, { progress: 60 });
      await addJobLog(client, jobId, { message: "Embeddings stored", data_json: { embeddings: embeddingsCount } });
    } catch (e: any) {
      embeddingsError = String(e?.message || e);
      await addJobLog(client, jobId, { level: "warn", message: "Embeddings skipped/failed", data_json: { error: embeddingsError } });
      // Keep going: keyword search + NER + context still work.
    }

    // 4) Speaker diarization (optional; requires local tools like yt-dlp + pyannote).
    const diarizeEnvBackend = (process.env.YIT_DIARIZE_BACKEND || "").trim().toLowerCase();
    const diarizeBackend = diarizeEnvBackend || (steps && stepEnabled(steps, "diarize") ? "pyannote" : "");
    const wantsDiarize =
      Boolean(diarizeBackend) && (steps ? stepEnabled(steps, "diarize") : true);

    let diarize: {
      backend: string;
      model?: string | null;
      device?: string | null;
      durationMs: number;
      providerMs?: number | null;
      speakers: number;
      segments: number;
      cue_assignments: number;
      error?: string;
    } | null = null;

    if (wantsDiarize) {
      const startedAt = Date.now();
      await addJobLog(client, jobId, {
        message: "Diarization started",
        data_json: { backend: diarizeBackend, transcript_end_ms: transcriptEndMs },
      });
      try {
        const res = await diarizeYouTubeBestEffort({
          url: video.url,
          backend: diarizeBackend,
          transcriptEndMs,
        });

        const flatSegs = res.speakers
          .flatMap((s) =>
            (s.segments || []).map((seg) => ({
              speaker_key: s.key,
              start_ms: seg.start_ms,
              end_ms: seg.end_ms,
            }))
          )
          .filter((seg) => seg.end_ms > seg.start_ms)
          .sort((a, b) => a.start_ms - b.start_ms || a.end_ms - b.end_ms);

        // Assign a single best speaker per cue based on overlap duration.
        let j = 0;
        const cueAssignments: Array<{ cue_id: string; speaker_key: string; confidence: number | null }> = [];
        for (const cue of allCues) {
          while (j < flatSegs.length && flatSegs[j].end_ms <= cue.start_ms) j++;
          let k = j;
          const overlapBySpeaker = new Map<string, number>();
          while (k < flatSegs.length && flatSegs[k].start_ms < cue.end_ms) {
            const seg = flatSegs[k];
            const overlap = Math.min(cue.end_ms, seg.end_ms) - Math.max(cue.start_ms, seg.start_ms);
            if (overlap > 0) {
              overlapBySpeaker.set(seg.speaker_key, (overlapBySpeaker.get(seg.speaker_key) || 0) + overlap);
            }
            k++;
          }
          if (overlapBySpeaker.size === 0) continue;

          let bestKey: string | null = null;
          let bestOverlap = 0;
          for (const [key, ms] of overlapBySpeaker.entries()) {
            if (ms > bestOverlap) {
              bestOverlap = ms;
              bestKey = key;
            }
          }
          if (!bestKey) continue;
          const cueDur = Math.max(1, cue.end_ms - cue.start_ms);
          const conf = Math.max(0, Math.min(1, bestOverlap / cueDur));
          cueAssignments.push({ cue_id: cue.id, speaker_key: bestKey, confidence: conf });
        }

        const source = `diarize:${res.backend}${res.model ? `:${res.model}` : ""}`;
        const stored = await replaceDiarizationForTranscript(client, {
          video_id: video.id,
          transcript_id: transcript.id,
          source,
          speakers: res.speakers,
          cue_assignments: cueAssignments,
        });

        diarize = {
          backend: res.backend,
          model: res.model,
          device: res.device,
          durationMs: Date.now() - startedAt,
          providerMs: res.duration_ms,
          speakers: stored.speakers,
          segments: stored.segments,
          cue_assignments: stored.cue_assignments,
        };

        await addJobLog(client, jobId, {
          message: "Diarization stored",
          data_json: { ...diarize },
        });
        await updateJobStatus(client, jobId, { progress: 65 });
      } catch (e: any) {
        const msg = String(e?.message || e);
        diarize = {
          backend: diarizeBackend,
          durationMs: Date.now() - startedAt,
          providerMs: null,
          speakers: 0,
          segments: 0,
          cue_assignments: 0,
          error: msg,
        };
        await addJobLog(client, jobId, { level: "warn", message: "Diarization failed (skipping)", data_json: diarize });
      }
    }

    // 4b) Optional: enqueue voice embedding after diarization
    let voiceEnqueued = false;
    if (diarize && !diarize.error && diarize.speakers > 0 && stepEnabled(steps, "voice")) {
      try {
        const { Queue } = await import("bullmq");
        const { QUEUE_NAME, createJob } = await import("@yt/core");
        const redisUrl = new URL(process.env.REDIS_URL || "redis://localhost:6379");
        const queue = new Queue(QUEUE_NAME, {
          connection: {
            host: redisUrl.hostname,
            port: Number(redisUrl.port) || 6379,
            password: redisUrl.password || undefined,
          },
        });
        try {
          const voiceJob = await createJob(client, {
            type: "ingest_voice",
            status: "queued",
            input_json: { videoId: data.videoId },
          });
          await queue.add("ingest_voice", { videoId: data.videoId }, { jobId: voiceJob.id });
          voiceEnqueued = true;
          await addJobLog(client, jobId, { message: `Enqueued ingest_voice job: ${voiceJob.id}` });
        } finally {
          await queue.close();
        }
      } catch (e: any) {
        await addJobLog(client, jobId, {
          level: "warn",
          message: "Failed to enqueue voice embedding (non-blocking)",
          data_json: { error: String(e?.message || e) },
        });
      }
    }

    // 5) NER (simple; per cue)
    await addJobLog(client, jobId, { message: "Extracting entity candidates (compromise)" });
    const mentionCandidates: Array<{
      type: EntityType;
      surface: string;
      cue_id: string;
      start_ms: number;
      end_ms: number;
      confidence: number;
    }> = [];
    for (const cue of allCues) {
      const entities = extractEntitiesFromText(cue.text);
      for (const e of entities) {
        const surface = e.name.trim();
        if (!surface) continue;
        mentionCandidates.push({
          type: e.type,
          surface,
          cue_id: cue.id,
          start_ms: cue.start_ms,
          end_ms: cue.end_ms,
          confidence: e.confidence,
        });
      }
    }

    const agg = new Map<
      string,
      { type: EntityType; surface: string; count: number; examples_ms: number[] }
    >();
    for (const m of mentionCandidates) {
      const k = `${m.type}:${m.surface.toLowerCase()}`;
      const ex = agg.get(k);
      if (!ex) {
        agg.set(k, { type: m.type, surface: m.surface, count: 1, examples_ms: [m.start_ms] });
        continue;
      }
      ex.count += 1;
      if (ex.examples_ms.length < 3) ex.examples_ms.push(m.start_ms);
    }

    const sortedCandidates = Array.from(agg.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 350);

    const envProvider = (process.env.YIT_ENRICH_CLI_PROVIDER || "").trim().toLowerCase();
    const cliProvider = envProvider || (steps && stepEnabled(steps, "enrich_cli") ? "gemini" : "");
    const cliModel = (process.env.YIT_ENRICH_CLI_MODEL || "").trim() || undefined;
    const cliTimeoutMs = (() => {
      const raw = (process.env.YIT_ENRICH_CLI_TIMEOUT_MS || "").trim();
      if (!raw) return 180_000;
      const n = Number(raw);
      return Number.isFinite(n) ? Math.max(1000, Math.floor(n)) : 180_000;
    })();

    let cli: {
      provider: string;
      model?: string;
      durationMs: number;
      entities: number;
      tags: number;
      chapters: number;
      error?: string;
    } | null = null;

    let finalEntities: Array<{ type: EntityType; canonical_name: string; aliases: string[] }> | null =
      null;
    let finalTags: string[] | null = null;
    let finalChapters: CliChapter[] | null = null;

    const wantsCli =
      Boolean(cliProvider) &&
      // If explicit steps are provided, require enrich_cli to be present.
      (steps ? stepEnabled(steps, "enrich_cli") : true);

    if (wantsCli) {
      await addJobLog(client, jobId, {
        message: "CLI enrichment started",
        data_json: { provider: cliProvider, model: cliModel ?? null, timeout_ms: cliTimeoutMs },
      });
      const input = {
        video: {
          id: video.id,
          provider: video.provider,
          provider_video_id: video.provider_video_id,
          url: video.url,
          title: video.title,
          channel_name: (video as any).channel_name ?? null,
        },
        transcript: {
          language: transcript.language,
          cues: allCues.length,
          chunks: chunks.length,
          end_ms: transcriptEndMs,
        },
        entity_candidates: sortedCandidates,
        chunks: trimChunksForPrompt(
          chunks.map((c) => ({ start_ms: c.start_ms, end_ms: c.end_ms, text: c.text })),
          80_000
        ),
      };

      const cliStartedAt = Date.now();
      let cliSpawnMs: number | null = null;
      try {
        let structured: unknown;
        // Use unified LLM config if available, otherwise fall back to legacy env vars
        const llmConfig = resolveTextConfig(data.llmConfig);
        const textLlm = createTextLlm(llmConfig);
        const enrichRes = await textLlm.callStructured(buildCliPrompt(), {
          schema: buildClaudeJsonSchema(),
          input: JSON.stringify(input),
          timeoutMs: cliTimeoutMs,
        });
        structured = enrichRes.structured;
        cliSpawnMs = enrichRes.durationMs;

        const parsed = CliEnrichmentOutputSchema.parse(structured);
        const sanitized = sanitizeCliOutput(parsed, { transcriptEndMs });
        const cliEntities = sanitized.entities;
        const cliTags = sanitized.tags;
        const cliChapters = sanitized.chapters;
        finalEntities = cliEntities;
        finalTags = cliTags;
        finalChapters = cliChapters;
        cli = {
          provider: cliProvider,
          model: cliModel,
          durationMs: Date.now() - cliStartedAt,
          entities: cliEntities.length,
          tags: cliTags.length,
          chapters: cliChapters.length,
        };

        // Persist tags/chapters best-effort (requires migration 0003).
        const source = `cli:${cliProvider}${cliModel ? `:${cliModel}` : ""}`;
        try {
          await replaceVideoTags(client, { video_id: video.id, source, tags: cliTags });
        } catch (e: any) {
          await addJobLog(client, jobId, { level: "warn", message: "Storing tags failed", data_json: { error: String(e?.message || e) } });
        }
        try {
          await replaceVideoChapters(client, { video_id: video.id, transcript_id: transcript.id, source, chapters: cliChapters });
        } catch (e: any) {
          await addJobLog(client, jobId, { level: "warn", message: "Storing chapters failed", data_json: { error: String(e?.message || e) } });
        }

        await addJobLog(client, jobId, {
          message: "CLI enrichment completed",
          data_json: {
            provider: cliProvider,
            model: cliModel ?? null,
            ms: cli.durationMs,
            spawn_ms: cliSpawnMs,
            entities: cliEntities.length,
            tags: cliTags.length,
            chapters: cliChapters.length,
          },
        });
      } catch (e: any) {
        const msg = String(e?.message || e);
        cli = {
          provider: cliProvider,
          model: cliModel,
          durationMs: Date.now() - cliStartedAt,
          entities: 0,
          tags: 0,
          chapters: 0,
          error: msg,
        };
        await addJobLog(client, jobId, { level: "warn", message: "CLI enrichment failed (falling back to deterministic)", data_json: { provider: cliProvider, model: cliModel ?? null, error: msg } });
        finalEntities = null;
        finalTags = null;
        finalChapters = null;
      }
    }

	    // Materialize entities + mentions into DB (CLI output if available, else deterministic).
	    await clearEntitiesForVideo(client, video.id);
	    const entityCache = new Map<string, { entity_id: string; type: string; canonical_name: string }>();
	    const aliasIndex = new Map<string, string>(); // key: `${type}:${normAlias(surface)}`
	    const usingCliEntities = Boolean(finalEntities && finalEntities.length && cli && !cli.error);
	    let mentionsInserted = 0;
	    let mentionsSkipped = 0;
	    let fallbackEntitiesCreated = 0;

    const upsertAndIndex = async (ent: { type: EntityType; canonical_name: string; aliases: string[] }) => {
      const canonical_name = ent.canonical_name.trim();
      if (!canonical_name) return null;
      const aliases = uniqStrings(ent.aliases || [], { max: 64 });
      const created = await upsertEntity(client, {
        video_id: video.id,
        type: ent.type,
        canonical_name,
        aliases,
      });

      const key = `${ent.type}:${canonical_name.toLowerCase()}`;
      entityCache.set(key, { entity_id: created.id, type: ent.type, canonical_name });

      const allAliases = uniqStrings([canonical_name, ...aliases], { max: 128 });
      for (const a of allAliases) {
        const k = `${ent.type}:${normAlias(a)}`;
        if (!k.endsWith(":")) aliasIndex.set(k, created.id);
      }
      return created.id;
    };

    if (finalEntities && finalEntities.length) {
      // Deduplicate by type + canonical_name.
      const dedup = new Map<string, { type: EntityType; canonical_name: string; aliases: Set<string> }>();
      for (const e of finalEntities) {
        const canonical = String(e.canonical_name || "").trim();
        if (!canonical) continue;
        const key = `${e.type}:${canonical.toLowerCase()}`;
        const ex = dedup.get(key);
        if (!ex) {
          dedup.set(key, { type: e.type, canonical_name: canonical, aliases: new Set(uniqStrings(e.aliases || [], { max: 64 })) });
        } else {
          for (const a of uniqStrings(e.aliases || [], { max: 64 })) ex.aliases.add(a);
        }
      }
      for (const e of dedup.values()) {
        await upsertAndIndex({ type: e.type, canonical_name: e.canonical_name, aliases: Array.from(e.aliases) });
      }
    } else {
      // Deterministic: create entities from extracted surfaces directly.
      for (const cand of sortedCandidates) {
        await upsertAndIndex({ type: cand.type, canonical_name: cand.surface, aliases: [] });
      }
    }

	    const getEntityForSurface = async (type: EntityType, surface: string): Promise<string | null> => {
	      const candidates = [
	        surface,
	        surface.replace(/^the\\s+/i, ""),
	        surface.replace(/\\s+inc\\.?$/i, ""),
	        surface.replace(/\\s+llc\\.?$/i, ""),
	      ];
      for (const s of candidates) {
        const k = `${type}:${normAlias(s)}`;
        const id = aliasIndex.get(k);
	        if (id) return id;
	      }

	      // When CLI has provided a canonical set, skip unmatched surfaces to avoid polluting entities with low-signal
	      // compromise artifacts.
	      if (usingCliEntities) return null;

	      // Deterministic fallback: create a new entity to avoid losing mentions.
	      const created = await upsertEntity(client, { video_id: video.id, type, canonical_name: surface.trim(), aliases: [] });
	      fallbackEntitiesCreated += 1;
	      const k = `${type}:${normAlias(surface)}`;
	      aliasIndex.set(k, created.id);
	      entityCache.set(`${type}:${surface.trim().toLowerCase()}`, { entity_id: created.id, type, canonical_name: surface.trim() });
	      return created.id;
	    };

	    for (const m of mentionCandidates) {
	      const entity_id = await getEntityForSurface(m.type, m.surface);
	      if (!entity_id) {
	        mentionsSkipped += 1;
	        continue;
	      }
	      await insertEntityMention(client, {
	        video_id: video.id,
	        entity_id,
	        cue_id: m.cue_id,
	        start_ms: m.start_ms,
	        end_ms: m.end_ms,
	        surface: m.surface,
	        confidence: m.confidence,
	      });
	      mentionsInserted += 1;
	    }

	    await updateJobStatus(client, jobId, { progress: 75 });
	    await addJobLog(client, jobId, {
	      message: "Entities stored",
	      data_json: {
	        entities: entityCache.size,
	        mentions: mentionCandidates.length,
	        mentions_inserted: mentionsInserted,
	        mentions_skipped: mentionsSkipped,
	        fallback_entities_created: fallbackEntitiesCreated,
	        cli,
	      },
	    });

    // 5) Context (Wikipedia) for entities around the start of the video (or current window is undefined here).
    // For V1, just take the first window at 2 minutes.
    const entities = await listEntitiesForVideoInWindow(client, video.id, { at_ms: 60_000, window_ms: 120_000, limit: 20 });
    let contextCount = 0;
    for (const ent of entities) {
      const summary = await fetchWikipediaSummary(ent.canonical_name);
      if (!summary) continue;
      const pageUrl = summary.content_urls?.desktop?.page ?? null;
      await upsertContextItem(client, {
        entity_id: ent.id,
        source: "wikipedia",
        source_id: summary.title,
        title: summary.title,
        snippet: summary.extract.slice(0, 500),
        url: pageUrl,
        payload_json: summary,
        expires_at: null,
      });
      contextCount += 1;
    }

    await updateJobStatus(client, jobId, {
      status: "completed",
      progress: 100,
      output_json: {
        video_id: video.id,
        transcript_id: transcript.id,
        cues: cuesNormalized.length,
	        chunks: chunks.length,
	        diarize,
	        embeddings: embeddingsCount,
	        embeddings_model_id: embeddingsModelId,
	        embeddings_error: embeddingsError,
	        entities: entityCache.size,
	        mentions: mentionCandidates.length,
	        mentions_inserted: mentionsInserted,
	        mentions_skipped: mentionsSkipped,
	        fallback_entities_created: fallbackEntitiesCreated,
	        cli_enrich: cli,
	        tags_source: cli ? `cli:${cli.provider}${cli.model ? `:${cli.model}` : ""}` : null,
	        tags: finalTags ? finalTags.length : null,
	        chapters: finalChapters ? finalChapters.length : null,
	        context_items: contextCount,
	        voice_enqueued: voiceEnqueued,
        trace_id: data.trace_id ?? null,
      },
    });

    await addJobLog(client, jobId, { message: "Ingest completed", data_json: { context_items: contextCount } });

    // (Optional) show you what transcripts exist after ingest for debugging
    await listTranscriptsForVideo(client, video.id);
  } catch (err: any) {
    await updateJobStatus(client, jobId, { status: "failed", progress: 100, error: String(err?.message || err) });
    await addJobLog(client, jobId, { level: "error", message: "Ingest failed", data_json: { error: String(err?.message || err) } });
  } finally {
    client.release();
  }
}
