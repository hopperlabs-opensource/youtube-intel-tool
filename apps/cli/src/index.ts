#!/usr/bin/env node
import { Command } from "commander";
import {
  ChatRequestSchema,
  ChatResponseSchema,
  CapabilitiesResponseSchema,
  CreateKaraokeSessionRequestSchema,
  CreateKaraokeSessionResponseSchema,
  CreateKaraokePlaylistRequestSchema,
  CreateKaraokePlaylistResponseSchema,
  ListKaraokePlaylistsResponseSchema,
  GetKaraokePlaylistResponseSchema,
  UpdateKaraokePlaylistRequestSchema,
  UpdateKaraokePlaylistResponseSchema,
  DeleteKaraokePlaylistResponseSchema,
  AddKaraokePlaylistItemRequestSchema,
  AddKaraokePlaylistItemResponseSchema,
  UpdateKaraokePlaylistItemRequestSchema,
  UpdateKaraokePlaylistItemResponseSchema,
  DeleteKaraokePlaylistItemResponseSchema,
  QueueFromKaraokePlaylistRequestSchema,
  QueueFromKaraokePlaylistResponseSchema,
  CreateKaraokeGuestTokenRequestSchema,
  CreateKaraokeGuestTokenResponseSchema,
  CreateKaraokeGuestRequestRequestSchema,
  CreateKaraokeGuestRequestResponseSchema,
  ListKaraokeGuestRequestsResponseSchema,
  UpdateKaraokeGuestRequestRequestSchema,
  UpdateKaraokeGuestRequestResponseSchema,
  CreatePolicyRequestSchema,
  CreatePolicyResponseSchema,
  FeedJsonResponseSchema,
  GetKaraokeLeaderboardResponseSchema,
  GetKaraokeSessionResponseSchema,
  GetKaraokeTrackResponseSchema,
  GetContextResponseSchema,
  GetJobResponseSchema,
  GetPolicyResponseSchema,
  GetVideoResponseSchema,
  IngestVideoRequestSchema,
  IngestVideoResponseSchema,
  LibrarySearchRequestSchema,
  LibrarySearchResponseSchema,
  ListKaraokeThemesResponseSchema,
  ListKaraokeTracksResponseSchema,
  BootstrapKaraokeLibraryRequestSchema,
  BootstrapKaraokeLibraryResponseSchema,
  KaraokeLibraryImportResponseSchema,
  KaraokeLibraryManifestSchema,
  KaraokeLibraryStatsResponseSchema,
  ListChatTurnsResponseSchema,
  ListCuesResponseSchema,
  ListEntitiesResponseSchema,
  ListEntityMentionsResponseSchema,
  ListJobLogsResponseSchema,
  ListLibraryChannelsResponseSchema,
  ListLibraryPeopleResponseSchema,
  ListLibraryTopicsResponseSchema,
  ListLibraryVideosResponseSchema,
  ListPoliciesResponseSchema,
  ListPolicyHitsResponseSchema,
  ListPolicyRunsResponseSchema,
  ListSpeakerSegmentsResponseSchema,
  ListTranscriptsResponseSchema,
  ListVideoChaptersResponseSchema,
  ListVideoSpeakersResponseSchema,
  ListVideoTagsResponseSchema,
  ResolveVideoRequestSchema,
  ResolveVideoResponseSchema,
  KaraokeResolveTrackRequestSchema,
  KaraokeResolveTrackResponseSchema,
  AddKaraokeQueueItemRequestSchema,
  AddKaraokeQueueItemResponseSchema,
  UpdateKaraokeQueueItemRequestSchema,
  UpdateKaraokeQueueItemResponseSchema,
  StartKaraokeRoundRequestSchema,
  StartKaraokeRoundResponseSchema,
  RecordKaraokeScoreEventRequestSchema,
  RecordKaraokeScoreEventResponseSchema,
  UpdateKaraokeSessionRequestSchema,
  UpdateKaraokeSessionResponseSchema,
  RunPolicyRequestSchema,
  RunPolicyResponseSchema,
  SearchRequestSchema,
  SearchResponseSchema,
  UpdatePolicyResponseSchema,
  UpdatePolicyRequestSchema,
  UpdateVideoSpeakerRequestSchema,
  UpdateVideoSpeakerResponseSchema,
  YouTubeChannelUploadsRequestSchema,
  YouTubeChannelUploadsResponseSchema,
  YouTubePlaylistItemsRequestSchema,
  YouTubePlaylistItemsResponseSchema,
  YouTubeSearchRequestSchema,
  YouTubeSearchResponseSchema,
  IngestVisualRequestSchema,
  IngestVisualResponseSchema,
  GetVisualStatusResponseSchema,
  ListFramesResponseSchema,
  GetActionTranscriptResponseSchema,
  ListFrameChunksResponseSchema,
  GetFrameAnalysisResponseSchema,
  CostEstimateSchema,
  GetNarrativeSynthesisResponseSchema,
  BuildDenseTranscriptRequestSchema,
  BuildDenseTranscriptResponseSchema,
  GetDenseTranscriptResponseSchema,
  DetectAutoChaptersRequestSchema,
  DetectAutoChaptersResponseSchema,
  GetAutoChaptersResponseSchema,
  ListSignificantMarksResponseSchema,
  ListFaceIdentitiesResponseSchema,
  ListFaceAppearancesResponseSchema,
  UpdateFaceIdentityRequestSchema,
  UpdateFaceIdentityResponseSchema,
  IngestFacesResponseSchema,
  IngestVoiceResponseSchema,
  MatchSpeakerResponseSchema,
  ListGlobalSpeakersResponseSchema,
  CreateGlobalSpeakerRequestSchema,
  CreateGlobalSpeakerResponseSchema,
  GetGlobalSpeakerResponseSchema,
  UpdateGlobalSpeakerRequestSchema,
  UpdateGlobalSpeakerResponseSchema,
  GetSpeakerVoiceResponseSchema,
} from "@yt/contracts";
import { apiJson, apiText, HttpError, makeApiClient } from "./http.js";
import { formatMs, printTable, truncate } from "./format.js";
import { readSse } from "./sse.js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function asObject(v: unknown): Record<string, unknown> | null {
  if (typeof v !== "object" || v === null) return null;
  return v as Record<string, unknown>;
}

function isProbablyUrl(s: string): boolean {
  return /^https?:\/\//i.test(s.trim());
}

function asInt(input: string, fallback: number): number {
  const n = Number(input);
  return Number.isFinite(n) ? n : fallback;
}

function asFloat(input: string | undefined, fallback: number): number {
  if (input === undefined) return fallback;
  const n = Number(input);
  return Number.isFinite(n) ? n : fallback;
}

function parseCsvList(input: string | undefined): string[] {
  if (!input) return [];
  return input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function readJsonFile(path: string): unknown {
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw);
}

async function resolveVideoId(client: ReturnType<typeof makeApiClient>, videoIdOrUrl: string): Promise<string> {
  if (!isProbablyUrl(videoIdOrUrl)) return videoIdOrUrl;
  const body = ResolveVideoRequestSchema.parse({ url: videoIdOrUrl });
  const { data } = await apiJson({
    client,
    method: "POST",
    path: "/api/videos/resolve",
    body,
    schema: ResolveVideoResponseSchema,
  });
  return data.video.id;
}

async function resolvePolicyFeedToken(
  client: ReturnType<typeof makeApiClient>,
  policyId: string,
  explicitToken?: string
): Promise<string> {
  const token = explicitToken?.trim();
  if (token) return token;
  const { data } = await apiJson({
    client,
    method: "GET",
    path: `/api/policies/${policyId}`,
    schema: GetPolicyResponseSchema,
  });
  return data.policy.feed_token;
}

function handleErr(err: unknown): never {
  if (err instanceof HttpError) {
    const code = err.code ? ` (${err.code})` : "";
    console.error(`error: HTTP ${err.status}${code}: ${err.message}`);
    process.exit(1);
  }
  if (err instanceof Error) {
    console.error(`error: ${err.message}`);
    process.exit(1);
  }
  console.error(`error: ${String(err)}`);
  process.exit(1);
}

const program = new Command();
program
  .name("yit")
  .description("YouTube Intel Tool CLI")
  .option("--base-url <url>", "API base URL (or env YIT_BASE_URL)", process.env.YIT_BASE_URL)
  .option("--json", "Machine-friendly JSON output", false);

program
  .command("health")
  .description("Check the API is reachable")
  .action(async () => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const res = await fetch(client.baseUrl + "/api/health", { method: "GET" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json().catch(() => ({}));
      if (opts.json) console.log(JSON.stringify(data, null, 2));
      else console.log(`${client.baseUrl} ok`);
    } catch (err) {
      handleErr(err);
    }
  });

program
  .command("capabilities")
  .description("Show backend capabilities and dependency status")
  .action(async () => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const { data } = await apiJson({
        client,
        method: "GET",
        path: "/api/capabilities",
        schema: CapabilitiesResponseSchema,
      });

      if (opts.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }

      const rows = [
        {
          feature: "embeddings",
          enabled: data.embeddings.enabled ? "yes" : "no",
          details: data.embeddings.enabled
            ? `${data.embeddings.provider || "unknown"} ${data.embeddings.model_id || ""}`.trim()
            : data.embeddings.reason || "disabled",
        },
        {
          feature: "stt",
          enabled: data.stt.enabled ? "yes" : "no",
          details: data.stt.enabled
            ? `${data.stt.provider || "unknown"} ${data.stt.model_id || ""}`.trim()
            : data.stt.reason || "disabled",
        },
        {
          feature: "diarization",
          enabled: data.diarization.enabled ? "yes" : "no",
          details: data.diarization.enabled
            ? data.diarization.backend || "enabled"
            : data.diarization.reason || "disabled",
        },
        {
          feature: "cli tools",
          enabled: data.cli.gemini || data.cli.claude || data.cli.codex ? "yes" : "no",
          details: `gemini=${data.cli.gemini ? "yes" : "no"} claude=${data.cli.claude ? "yes" : "no"} codex=${data.cli.codex ? "yes" : "no"}`,
        },
        {
          feature: "system tools",
          enabled: data.tools.yt_dlp && data.tools.ffmpeg && data.tools.python ? "yes" : "partial",
          details: `yt-dlp=${data.tools.yt_dlp ? "yes" : "no"} ffmpeg=${data.tools.ffmpeg ? "yes" : "no"} python=${data.tools.python ? "yes" : "no"}`,
        },
      ];

      console.log(`base_url: ${client.baseUrl}`);
      printTable(rows);
    } catch (err) {
      handleErr(err);
    }
  });

program
  .command("smoke")
  .description("End-to-end smoke test (API + optional UI routes)")
  .requiredOption("--url <url>", "YouTube URL to ingest")
  .option("--poll-ms <n>", "Job poll interval (ms)", "1000")
  .option("--timeout-s <n>", "Timeout (seconds)", "240")
  .option("--require-embeddings", "Fail if embeddings are not built", false)
  .option("--ingest-steps <csv>", "Comma-separated ingest steps (e.g. enrich_cli)", "")
  .option("--require-enrichment", "Fail if tags/chapters enrichment is empty", false)
  .option("--check-ui", "Also fetch UI routes (/, /library, /search, /videos/:id)", false)
  .option("--chat-provider <p>", "Chat provider: mock|ollama|cli", "mock")
  .action(
    async (cmd: {
      url: string;
      pollMs: string;
      timeoutS: string;
      requireEmbeddings: boolean;
      ingestSteps: string;
      requireEnrichment: boolean;
      checkUi: boolean;
      chatProvider: string;
    }) => {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });

      const startedAt = Date.now();
      const warnings: string[] = [];
      const results: Record<string, unknown> = {
        base_url: client.baseUrl,
        url: cmd.url,
        started_at: new Date().toISOString(),
      };

      const pollMs = Math.max(250, asInt(cmd.pollMs, 1000));
      const timeoutMs = Math.max(10_000, asInt(cmd.timeoutS, 240) * 1000);

      const step = async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
        const t0 = Date.now();
        try {
          const out = await fn();
          (results as any)[name] = { ok: true, ms: Date.now() - t0 };
          return out;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          (results as any)[name] = { ok: false, ms: Date.now() - t0, error: msg };
          throw err;
        }
      };

      const checkUiRoute = async (path: string): Promise<void> => {
        const res = await fetch(client.baseUrl + path, { method: "GET" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        if (html.length < 200) throw new Error("response too small");
      };

      try {
        await step("health", async () => {
          const res = await fetch(client.baseUrl + "/api/health", { method: "GET" });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json().catch(() => ({}));
        });

        await step("metrics", async () => {
          const res = await fetch(client.baseUrl + "/metrics", { method: "GET" });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const text = await res.text();
          if (!text.includes("yt_http_requests_total")) throw new Error("missing yt_http_requests_total");
        });

        if (cmd.checkUi) {
          await step("ui_home", async () => checkUiRoute("/"));
          await step("ui_library", async () => checkUiRoute("/library"));
          await step("ui_search", async () => checkUiRoute("/search"));
        }

        const resolved = await step("resolve", async () => {
          const body = ResolveVideoRequestSchema.parse({ url: cmd.url });
          const { data } = await apiJson({ client, method: "POST", path: "/api/videos/resolve", body, schema: ResolveVideoResponseSchema });
          return data.video;
        });
        (results as any).video_id = resolved.id;

        const video = await step("video_get", async () => {
          const { data } = await apiJson({ client, method: "GET", path: `/api/videos/${resolved.id}`, schema: GetVideoResponseSchema });
          return data.video;
        });
        (results as any).video = { id: video.id, provider_video_id: video.provider_video_id, title: video.title, channel_name: video.channel_name };

        await step("library_list", async () => {
          const { data } = await apiJson({
            client,
            method: "GET",
            path: "/api/videos",
            query: { limit: 5, offset: 0 },
            schema: ListLibraryVideosResponseSchema,
          });
          if (data.items.length === 0) throw new Error("library empty");
          (results as any).library_items = data.items.length;
        });

        if (cmd.checkUi) {
          await step("ui_video", async () => checkUiRoute(`/videos/${resolved.id}`));
        }

	        const ingest = await step("ingest", async () => {
	          const steps = parseCsvList(cmd.ingestSteps);
	          const body = IngestVideoRequestSchema.parse({ language: "en", steps: steps.length ? steps : undefined });
	          const { data, res } = await apiJson({
	            client,
	            method: "POST",
	            path: `/api/videos/${resolved.id}/ingest`,
	            body,
            schema: IngestVideoResponseSchema,
          });
          const trace_id = res.headers.get("x-trace-id");
          return { job: data.job, trace_id };
        });
        (results as any).job_id = ingest.job.id;
        (results as any).trace_id = ingest.trace_id ?? null;

        const job = await step("job_wait", async () => {
          const t0 = Date.now();
          let lastStatus = "";
          while (true) {
            const { data } = await apiJson({
              client,
              method: "GET",
              path: `/api/jobs/${ingest.job.id}`,
              schema: GetJobResponseSchema,
            });

            if (data.job.status !== lastStatus && !opts.json) {
              lastStatus = data.job.status;
              console.error(`job status: ${data.job.status} (${data.job.progress ?? 0}%)`);
            }

            if (["completed", "failed", "canceled"].includes(data.job.status)) return data.job;
            if (Date.now() - t0 > timeoutMs) throw new Error(`timeout waiting for job (${Math.round(timeoutMs / 1000)}s)`);
            await sleep(pollMs);
          }
        });

        (results as any).job = { id: job.id, status: job.status, progress: job.progress, error: job.error, output_json: job.output_json };
        if (job.status !== "completed") throw new Error(`job ended with status '${job.status}'`);

        await step("job_logs", async () => {
          const { data } = await apiJson({
            client,
            method: "GET",
            path: `/api/jobs/${ingest.job.id}/logs`,
            query: { limit: 50 },
            schema: ListJobLogsResponseSchema,
          });
          if (data.logs.length === 0) throw new Error("no job logs");
          (results as any).job_logs = data.logs.length;
        });

        const out = asObject(job.output_json);
        let canSemantic = false;
        if (out) {
          const embeddings = out.embeddings;
          const embeddings_error = out.embeddings_error;
          if (typeof embeddings_error === "string" && embeddings_error.trim()) warnings.push(`embeddings_error: ${embeddings_error}`);
          if (typeof embeddings === "number" && embeddings === 0) warnings.push("embeddings_count=0");
          canSemantic = typeof embeddings === "number" && embeddings > 0 && (typeof embeddings_error !== "string" || !embeddings_error.trim());
          if (cmd.requireEmbeddings) {
            if (typeof embeddings_error === "string" && embeddings_error.trim()) throw new Error(`embeddings failed: ${embeddings_error}`);
            if (typeof embeddings !== "number" || embeddings <= 0) throw new Error("embeddings missing");
          }
        }

        const transcripts = await step("transcripts", async () => {
          const { data } = await apiJson({
            client,
            method: "GET",
            path: `/api/videos/${resolved.id}/transcripts`,
            schema: ListTranscriptsResponseSchema,
          });
          if (data.transcripts.length === 0) throw new Error("no transcripts found");
          return data.transcripts;
        });
        const transcriptId = transcripts[0]!.id;
        (results as any).transcript_id = transcriptId;

        const cues = await step("cues", async () => {
          const { data } = await apiJson({
            client,
            method: "GET",
            path: `/api/transcripts/${transcriptId}/cues`,
            query: { cursor: 0, limit: 200 },
            schema: ListCuesResponseSchema,
          });
          if (data.cues.length === 0) throw new Error("no cues found");
          return data.cues;
        });
        (results as any).cues = cues.length;

        const stop = new Set([
          "this",
          "that",
          "what",
          "when",
          "where",
          "which",
          "with",
          "from",
          "your",
          "have",
          "will",
          "about",
          "they",
          "them",
          "then",
          "there",
          "here",
          "into",
          "like",
          "just",
          "really",
          "because",
        ]);
        const token = (() => {
          for (const cue of cues.slice(0, 80)) {
            const words = cue.text
              .match(/[a-zA-Z][a-zA-Z0-9_-]{3,}/g)
              ?.map((s) => s.toLowerCase())
              .filter((s) => !stop.has(s) && s.length >= 4);
            const w = words?.[0];
            if (w) return w;
          }
          return "code";
        })();

        await step("video_search_keyword", async () => {
          const body = SearchRequestSchema.parse({ query: token, mode: "keyword", limit: 5 });
          const { data } = await apiJson({
            client,
            method: "POST",
            path: `/api/videos/${resolved.id}/search`,
            body,
            schema: SearchResponseSchema,
          });
          (results as any).video_search_hits = data.hits.length;
          if (data.hits.length === 0) warnings.push(`video_keyword_search_0_hits(query=${token})`);
          return data.hits.length;
        });

        if (canSemantic) {
          await step("video_search_semantic", async () => {
            const body = SearchRequestSchema.parse({ query: token, mode: "semantic", limit: 5 });
            const { data } = await apiJson({
              client,
              method: "POST",
              path: `/api/videos/${resolved.id}/search`,
              body,
              schema: SearchResponseSchema,
            });
            (results as any).video_search_semantic_hits = data.hits.length;
            if (data.hits.length === 0) warnings.push(`video_semantic_search_0_hits(query=${token})`);
            return data.hits.length;
          });
        }

        await step("global_search_hybrid", async () => {
          const body = LibrarySearchRequestSchema.parse({ query: token, mode: "hybrid", limit: 5, language: "en" });
          const { data } = await apiJson({ client, method: "POST", path: "/api/search", body, schema: LibrarySearchResponseSchema });
          (results as any).global_search_hits = data.hits.length;
          if (data.embedding_error) warnings.push(`global_embedding_error: ${data.embedding_error}`);
          return data.hits.length;
        });

        if (canSemantic) {
          await step("global_search_semantic", async () => {
            const body = LibrarySearchRequestSchema.parse({ query: token, mode: "semantic", limit: 5, language: "en" });
            const { data } = await apiJson({ client, method: "POST", path: "/api/search", body, schema: LibrarySearchResponseSchema });
            (results as any).global_search_semantic_hits = data.hits.length;
            if (data.embedding_error) warnings.push(`global_embedding_error(semantic): ${data.embedding_error}`);
            return data.hits.length;
          });
        }

        await step("transcript_export_txt", async () => {
          const { text } = await apiText({ client, method: "GET", path: `/api/transcripts/${transcriptId}/export`, query: { format: "txt" } });
          if (text.trim().length < 40) throw new Error("exported transcript is empty/suspiciously small");
          (results as any).export_txt_bytes = Buffer.byteLength(text, "utf8");
        });

        await step("transcript_export_vtt", async () => {
          const { text } = await apiText({ client, method: "GET", path: `/api/transcripts/${transcriptId}/export`, query: { format: "vtt" } });
          if (!text.startsWith("WEBVTT")) throw new Error("missing WEBVTT header");
          (results as any).export_vtt_bytes = Buffer.byteLength(text, "utf8");
        });

	        await step("entities", async () => {
	          const { data } = await apiJson({
	            client,
	            method: "GET",
            path: `/api/videos/${resolved.id}/entities`,
            schema: ListEntitiesResponseSchema,
	          });
	          (results as any).entities = data.entities.length;
	          return data.entities;
	        }).then(async (entities) => {
          if (entities.length === 0) return;
          const entityId = entities[0]!.id;
          await step("entity_mentions", async () => {
            const { data } = await apiJson({
              client,
              method: "GET",
              path: `/api/videos/${resolved.id}/entities/${entityId}/mentions`,
              schema: ListEntityMentionsResponseSchema,
            });
	            (results as any).entity_mentions = data.mentions.length;
	          });
	        });

	        const tags = await step("video_tags", async () => {
	          const { data } = await apiJson({
	            client,
	            method: "GET",
	            path: `/api/videos/${resolved.id}/tags`,
	            schema: ListVideoTagsResponseSchema,
	          });
	          (results as any).tags = data.tags.length;
	          return data.tags;
	        });

	        const chapters = await step("video_chapters", async () => {
	          const { data } = await apiJson({
	            client,
	            method: "GET",
	            path: `/api/videos/${resolved.id}/chapters`,
	            schema: ListVideoChaptersResponseSchema,
	          });
	          (results as any).chapters = data.chapters.length;
	          return data.chapters;
	        });

	        if (cmd.requireEnrichment) {
	          if (tags.length === 0) throw new Error("enrichment missing: tags");
	          if (chapters.length === 0) throw new Error("enrichment missing: chapters");
	        }

	        await step("context", async () => {
	          const { data } = await apiJson({
	            client,
	            method: "GET",
            path: `/api/videos/${resolved.id}/context`,
            query: { at_ms: 0, window_ms: 120_000 },
            schema: GetContextResponseSchema,
          });
          (results as any).context_cards = data.cards.length;
        });

	        await step("chat_stream", async () => {
	          const provider = cmd.chatProvider === "ollama" ? "ollama" : cmd.chatProvider === "cli" ? "cli" : "mock";
	          const body = ChatRequestSchema.parse({
	            provider,
	            at_ms: 0,
	            messages: [{ role: "user", content: "Give one sentence summary and cite [S1] if you can." }],
	          });

          const res = await fetch(client.baseUrl + `/api/videos/${resolved.id}/chat/stream`, {
            method: "POST",
            headers: { accept: "text/event-stream", "content-type": "application/json" },
            body: JSON.stringify(body),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);

          let sawDone = false;
          let chars = 0;
          for await (const ev of readSse(res)) {
            if (ev.type === "text" && typeof (ev as any).delta === "string") chars += ((ev as any).delta as string).length;
            if (ev.type === "done") sawDone = true;
            if (ev.type === "error") {
              const e = (ev as any).error;
              throw new Error(`${e?.code ?? "error"}: ${e?.message ?? "unknown error"}`);
            }
          }
          if (!sawDone) throw new Error("chat stream ended without done event");
          if (chars < 10) throw new Error("chat stream returned too little text");
        });

        // Verify chat turn got persisted.
        await step("chat_turns", async () => {
          const { data } = await apiJson({
            client,
            method: "GET",
            path: `/api/videos/${resolved.id}/chat/turns`,
            schema: ListChatTurnsResponseSchema,
          });
          if (data.turns.length === 0) throw new Error("no chat turns found");
          (results as any).chat_turns = data.turns.length;
          return data.turns.length;
        });

        (results as any).warnings = warnings;
        (results as any).duration_ms = Date.now() - startedAt;

        if (opts.json) {
          console.log(JSON.stringify({ ok: true, ...results }, null, 2));
        } else {
          console.log("smoke ok");
          console.log(`video: ${resolved.id}`);
          console.log(`transcript: ${transcriptId} (${cues.length} cues)`);
          if (warnings.length) console.log(`warnings: ${warnings.join(" | ")}`);
          console.log(`duration: ${Math.round((Date.now() - startedAt) / 1000)}s`);
        }
      } catch (err: unknown) {
        (results as any).warnings = warnings;
        (results as any).duration_ms = Date.now() - startedAt;
        if (opts.json) {
          console.log(JSON.stringify({ ok: false, ...results }, null, 2));
        }
        handleErr(err);
      }
    }
  );

program
  .command("resolve")
  .description("Resolve a YouTube URL into a video record (creates it if missing)")
  .argument("<url>", "YouTube URL")
  .action(async (url: string) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const body = ResolveVideoRequestSchema.parse({ url });
      const { data } = await apiJson({
        client,
        method: "POST",
        path: "/api/videos/resolve",
        body,
        schema: ResolveVideoResponseSchema,
      });
      if (opts.json) console.log(JSON.stringify(data, null, 2));
      else console.log(data.video.id);
    } catch (err) {
      handleErr(err);
    }
  });

program
  .command("library")
  .description("List videos in the local library")
  .option("--limit <n>", "Limit", "50")
  .option("--offset <n>", "Offset", "0")
  .action(async (cmd: { limit: string; offset: string }) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const { data } = await apiJson({
        client,
        method: "GET",
        path: "/api/videos",
        query: { limit: asInt(cmd.limit, 50), offset: asInt(cmd.offset, 0) },
        schema: ListLibraryVideosResponseSchema,
      });
      if (opts.json) return void console.log(JSON.stringify(data, null, 2));

      const rows = data.items.map((it) => ({
        video_id: it.video.id,
        title: truncate(it.video.title ?? it.video.provider_video_id, 48),
        channel: truncate(it.video.channel_name ?? "", 22),
        transcript: it.latest_transcript ? `${it.latest_transcript.language}/${it.latest_transcript.source}` : "-",
      }));
      printTable(rows);
    } catch (err) {
      handleErr(err);
    }
  });

const facets = program.command("facets").description("List library facets (channels/topics/people)");

facets
  .command("channels")
  .description("List channels in the library")
  .option("--limit <n>", "Limit", "200")
  .option("--offset <n>", "Offset", "0")
  .action(async (cmd: { limit: string; offset: string }) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const { data } = await apiJson({
        client,
        method: "GET",
        path: "/api/library/channels",
        query: { limit: asInt(cmd.limit, 200), offset: asInt(cmd.offset, 0) },
        schema: ListLibraryChannelsResponseSchema,
      });
      if (opts.json) return void console.log(JSON.stringify(data, null, 2));
      printTable(
        data.channels.map((c) => ({
          channel: truncate(c.channel_name, 40),
          videos: String(c.videos),
          ingested: String(c.ingested),
        }))
      );
    } catch (err) {
      handleErr(err);
    }
  });

facets
  .command("topics")
  .description("List topics/tags in the library")
  .option("--limit <n>", "Limit", "200")
  .option("--offset <n>", "Offset", "0")
  .action(async (cmd: { limit: string; offset: string }) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const { data } = await apiJson({
        client,
        method: "GET",
        path: "/api/library/topics",
        query: { limit: asInt(cmd.limit, 200), offset: asInt(cmd.offset, 0) },
        schema: ListLibraryTopicsResponseSchema,
      });
      if (opts.json) return void console.log(JSON.stringify(data, null, 2));
      printTable(
        data.topics.map((t) => ({
          topic: truncate(t.topic, 36),
          videos: String(t.videos),
        }))
      );
    } catch (err) {
      handleErr(err);
    }
  });

facets
  .command("people")
  .description("List people (person entities) in the library")
  .option("--limit <n>", "Limit", "200")
  .option("--offset <n>", "Offset", "0")
  .action(async (cmd: { limit: string; offset: string }) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const { data } = await apiJson({
        client,
        method: "GET",
        path: "/api/library/people",
        query: { limit: asInt(cmd.limit, 200), offset: asInt(cmd.offset, 0) },
        schema: ListLibraryPeopleResponseSchema,
      });
      if (opts.json) return void console.log(JSON.stringify(data, null, 2));
      printTable(
        data.people.map((p) => ({
          person: truncate(p.name, 40),
          videos: String(p.videos),
          mentions: String(p.mentions),
        }))
      );
    } catch (err) {
      handleErr(err);
    }
  });

program
  .command("search")
  .description("Search across the entire library")
  .argument("<query...>", "Search query")
  .option("--mode <mode>", "keyword|semantic|hybrid", "hybrid")
  .option("--limit <n>", "Limit (1-50)", "20")
  .option("--language <code>", "Language", "en")
  .option("--channels <csv>", "Comma-separated channel names (scope)", "")
  .option("--topics <csv>", "Comma-separated topics/tags (scope)", "")
  .option("--people <csv>", "Comma-separated people names (scope)", "")
  .option("--video-ids <csv>", "Comma-separated video ids (scope)", "")
  .action(
    async (
      queryParts: string[],
      cmd: { mode: string; limit: string; language: string; channels: string; topics: string; people: string; videoIds: string }
    ) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const scope: Record<string, unknown> = {};
      const channels = parseCsvList(cmd.channels);
      const topics = parseCsvList(cmd.topics);
      const people = parseCsvList(cmd.people);
      const video_ids = parseCsvList(cmd.videoIds);
      if (channels.length) scope.channel_names = channels;
      if (topics.length) scope.topics = topics;
      if (people.length) scope.people = people;
      if (video_ids.length) scope.video_ids = video_ids;

      const body = LibrarySearchRequestSchema.parse({
        query: queryParts.join(" "),
        mode: cmd.mode,
        limit: asInt(cmd.limit, 20),
        language: cmd.language,
        scope: Object.keys(scope).length ? scope : undefined,
      });
      const { data } = await apiJson({ client, method: "POST", path: "/api/search", body, schema: LibrarySearchResponseSchema });
      if (opts.json) return void console.log(JSON.stringify(data, null, 2));

      const rows = data.hits.map((h) => ({
        at: formatMs(h.start_ms),
        title: truncate(h.title ?? h.provider_video_id, 36),
        channel: truncate(h.channel_name ?? "", 22),
        video_id: h.video_id,
        cue_id: h.cue_id,
        score: h.score.toFixed(3),
      }));
      printTable(rows);
      if (data.embedding_error) console.error(`warn: embedding_error: ${data.embedding_error}`);
    } catch (err) {
      handleErr(err);
    }
  });

const policy = program.command("policy").description("Saved policy operations");

policy
  .command("list")
  .description("List saved policies")
  .option("--limit <n>", "Limit", "100")
  .option("--offset <n>", "Offset", "0")
  .action(async (cmd: { limit: string; offset: string }) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const { data } = await apiJson({
        client,
        method: "GET",
        path: "/api/policies",
        query: { limit: asInt(cmd.limit, 100), offset: asInt(cmd.offset, 0) },
        schema: ListPoliciesResponseSchema,
      });
      if (opts.json) return void console.log(JSON.stringify(data, null, 2));
      printTable(
        data.policies.map((p) => ({
          policy_id: p.id,
          name: truncate(p.name, 28),
          enabled: p.enabled ? "yes" : "no",
          mode: p.search_payload.mode,
          query: truncate(p.search_payload.query, 30),
          updated_at: p.updated_at,
        }))
      );
    } catch (err) {
      handleErr(err);
    }
  });

policy
  .command("create")
  .description("Create a saved policy")
  .requiredOption("--name <name>", "Policy name")
  .requiredOption("--query <query>", "Search query")
  .option("--description <text>", "Optional description")
  .option("--mode <mode>", "keyword|semantic|hybrid", "hybrid")
  .option("--limit <n>", "Result limit (1-50)", "20")
  .option("--language <code>", "Language", "en")
  .option("--channels <csv>", "Comma-separated channel names (scope)", "")
  .option("--topics <csv>", "Comma-separated topics/tags (scope)", "")
  .option("--people <csv>", "Comma-separated people names (scope)", "")
  .option("--video-ids <csv>", "Comma-separated video ids (scope)", "")
  .option("--w-recency <n>", "Weight for recency", "0.3")
  .option("--w-relevance <n>", "Weight for relevance", "0.6")
  .option("--w-channel <n>", "Weight for channel boost", "0.1")
  .option("--high <n>", "High threshold", "0.85")
  .option("--medium <n>", "Medium threshold", "0.55")
  .option("--disabled", "Create disabled policy", false)
  .action(
    async (cmd: {
      name: string;
      query: string;
      description?: string;
      mode: string;
      limit: string;
      language: string;
      channels: string;
      topics: string;
      people: string;
      videoIds: string;
      wRecency: string;
      wRelevance: string;
      wChannel: string;
      high: string;
      medium: string;
      disabled: boolean;
    }) => {
      try {
        const opts = program.opts<{ baseUrl?: string; json: boolean }>();
        const client = makeApiClient({ baseUrl: opts.baseUrl });

        const scope: Record<string, unknown> = {};
        const channels = parseCsvList(cmd.channels);
        const topics = parseCsvList(cmd.topics);
        const people = parseCsvList(cmd.people);
        const video_ids = parseCsvList(cmd.videoIds);
        if (channels.length) scope.channel_names = channels;
        if (topics.length) scope.topics = topics;
        if (people.length) scope.people = people;
        if (video_ids.length) scope.video_ids = video_ids;

        const body = CreatePolicyRequestSchema.parse({
          name: cmd.name,
          description: cmd.description ?? null,
          enabled: !cmd.disabled,
          search_payload: {
            query: cmd.query,
            mode: cmd.mode,
            limit: asInt(cmd.limit, 20),
            language: cmd.language,
            scope: Object.keys(scope).length ? scope : undefined,
          },
          priority_config: {
            weights: {
              recency: asFloat(cmd.wRecency, 0.3),
              relevance: asFloat(cmd.wRelevance, 0.6),
              channel_boost: asFloat(cmd.wChannel, 0.1),
            },
            thresholds: {
              high: asFloat(cmd.high, 0.85),
              medium: asFloat(cmd.medium, 0.55),
            },
          },
        });

        const { data } = await apiJson({
          client,
          method: "POST",
          path: "/api/policies",
          body,
          schema: CreatePolicyResponseSchema,
        });
        if (opts.json) return void console.log(JSON.stringify(data, null, 2));
        console.log(`policy: ${data.policy.id}`);
        console.log(`feed token: ${data.policy.feed_token}`);
      } catch (err) {
        handleErr(err);
      }
    }
  );

policy
  .command("show")
  .description("Show a single policy")
  .argument("<policyId>", "Policy ID")
  .action(async (policyId: string) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const { data } = await apiJson({
        client,
        method: "GET",
        path: `/api/policies/${policyId}`,
        schema: GetPolicyResponseSchema,
      });
      if (opts.json) return void console.log(JSON.stringify(data, null, 2));
      console.log(`policy_id: ${data.policy.id}`);
      console.log(`name: ${data.policy.name}`);
      console.log(`enabled: ${data.policy.enabled ? "yes" : "no"}`);
      console.log(`query: ${data.policy.search_payload.query}`);
      console.log(`feed_token: ${data.policy.feed_token}`);
      if (data.latest_run) {
        console.log(`latest_run: ${data.latest_run.id} (${data.latest_run.status})`);
      }
    } catch (err) {
      handleErr(err);
    }
  });

policy
  .command("update")
  .description("Update a policy")
  .argument("<policyId>", "Policy ID")
  .option("--name <name>", "Policy name")
  .option("--description <text>", "Set description text")
  .option("--clear-description", "Clear description", false)
  .option("--enabled <bool>", "true|false")
  .option("--query <query>", "Update search query")
  .option("--mode <mode>", "keyword|semantic|hybrid")
  .option("--limit <n>", "Result limit (1-50)")
  .option("--language <code>", "Language")
  .option("--channels <csv>", "Comma-separated channel names (scope)", "")
  .option("--topics <csv>", "Comma-separated topics/tags (scope)", "")
  .option("--people <csv>", "Comma-separated people names (scope)", "")
  .option("--video-ids <csv>", "Comma-separated video ids (scope)", "")
  .option("--w-recency <n>", "Weight for recency")
  .option("--w-relevance <n>", "Weight for relevance")
  .option("--w-channel <n>", "Weight for channel boost")
  .option("--high <n>", "High threshold")
  .option("--medium <n>", "Medium threshold")
  .option("--rotate-feed-token", "Rotate feed token", false)
  .action(
    async (
      policyId: string,
      cmd: {
        name?: string;
        description?: string;
        clearDescription: boolean;
        enabled?: string;
        query?: string;
        mode?: string;
        limit?: string;
        language?: string;
        channels: string;
        topics: string;
        people: string;
        videoIds: string;
        wRecency?: string;
        wRelevance?: string;
        wChannel?: string;
        high?: string;
        medium?: string;
        rotateFeedToken: boolean;
      }
    ) => {
      try {
        const opts = program.opts<{ baseUrl?: string; json: boolean }>();
        const client = makeApiClient({ baseUrl: opts.baseUrl });

        const current = await apiJson({
          client,
          method: "GET",
          path: `/api/policies/${policyId}`,
          schema: GetPolicyResponseSchema,
        });
        const currentPolicy = current.data.policy;

        const scopeFromFlags: Record<string, unknown> = {};
        const channels = parseCsvList(cmd.channels);
        const topics = parseCsvList(cmd.topics);
        const people = parseCsvList(cmd.people);
        const video_ids = parseCsvList(cmd.videoIds);
        if (channels.length) scopeFromFlags.channel_names = channels;
        if (topics.length) scopeFromFlags.topics = topics;
        if (people.length) scopeFromFlags.people = people;
        if (video_ids.length) scopeFromFlags.video_ids = video_ids;

        const nextSearch =
          cmd.query ||
          cmd.mode ||
          cmd.limit ||
          cmd.language ||
          Object.keys(scopeFromFlags).length > 0
            ? {
                query: cmd.query ?? currentPolicy.search_payload.query,
                mode: cmd.mode ?? currentPolicy.search_payload.mode,
                limit: cmd.limit ? asInt(cmd.limit, currentPolicy.search_payload.limit) : currentPolicy.search_payload.limit,
                language: cmd.language ?? currentPolicy.search_payload.language,
                scope:
                  Object.keys(scopeFromFlags).length > 0
                    ? scopeFromFlags
                    : currentPolicy.search_payload.scope,
              }
            : undefined;

        const nextPriority =
          cmd.wRecency || cmd.wRelevance || cmd.wChannel || cmd.high || cmd.medium
            ? {
                weights: {
                  recency: asFloat(cmd.wRecency, currentPolicy.priority_config.weights.recency),
                  relevance: asFloat(cmd.wRelevance, currentPolicy.priority_config.weights.relevance),
                  channel_boost: asFloat(cmd.wChannel, currentPolicy.priority_config.weights.channel_boost),
                },
                thresholds: {
                  high: asFloat(cmd.high, currentPolicy.priority_config.thresholds.high),
                  medium: asFloat(cmd.medium, currentPolicy.priority_config.thresholds.medium),
                },
              }
            : undefined;

        const enabled =
          cmd.enabled === undefined
            ? undefined
            : ["1", "true", "yes", "on"].includes(String(cmd.enabled).trim().toLowerCase());

        const rawPatch: Record<string, unknown> = {};
        if (cmd.name !== undefined) rawPatch.name = cmd.name;
        if (cmd.clearDescription) rawPatch.description = null;
        else if (cmd.description !== undefined) rawPatch.description = cmd.description;
        if (enabled !== undefined) rawPatch.enabled = enabled;
        if (nextSearch !== undefined) rawPatch.search_payload = nextSearch;
        if (nextPriority !== undefined) rawPatch.priority_config = nextPriority;
        if (cmd.rotateFeedToken) rawPatch.rotate_feed_token = true;

        const patch = UpdatePolicyRequestSchema.parse(rawPatch);

        const hasMutation =
          patch.name !== undefined ||
          Object.prototype.hasOwnProperty.call(patch, "description") ||
          patch.enabled !== undefined ||
          patch.search_payload !== undefined ||
          patch.priority_config !== undefined ||
          patch.rotate_feed_token;
        if (!hasMutation) throw new Error("no updates specified");

        const { data } = await apiJson({
          client,
          method: "PATCH",
          path: `/api/policies/${policyId}`,
          body: patch,
          schema: UpdatePolicyResponseSchema,
        });

        if (opts.json) return void console.log(JSON.stringify(data, null, 2));
        console.log(`policy: ${data.policy.id}`);
        console.log(`feed token: ${data.policy.feed_token}`);
      } catch (err) {
        handleErr(err);
      }
    }
  );

policy
  .command("run")
  .description("Run a policy now")
  .argument("<policyId>", "Policy ID")
  .option("--triggered-by <source>", "manual|cli|cron|ci", "cli")
  .action(async (policyId: string, cmd: { triggeredBy: string }) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const body = RunPolicyRequestSchema.parse({ triggered_by: cmd.triggeredBy || "cli" });
      const { data } = await apiJson({
        client,
        method: "POST",
        path: `/api/policies/${policyId}/run`,
        body,
        schema: RunPolicyResponseSchema,
      });
      if (opts.json) return void console.log(JSON.stringify(data, null, 2));
      console.log(`run: ${data.run.id}`);
      console.log(`status: ${data.run.status}`);
      console.log(`hits: ${data.hits_count}`);
    } catch (err) {
      handleErr(err);
    }
  });

policy
  .command("runs")
  .description("List policy runs")
  .argument("<policyId>", "Policy ID")
  .option("--limit <n>", "Limit", "50")
  .option("--offset <n>", "Offset", "0")
  .action(async (policyId: string, cmd: { limit: string; offset: string }) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const { data } = await apiJson({
        client,
        method: "GET",
        path: `/api/policies/${policyId}/runs`,
        query: { limit: asInt(cmd.limit, 50), offset: asInt(cmd.offset, 0) },
        schema: ListPolicyRunsResponseSchema,
      });
      if (opts.json) return void console.log(JSON.stringify(data, null, 2));
      printTable(
        data.runs.map((r) => ({
          run_id: r.id,
          status: r.status,
          trigger: r.triggered_by,
          total_hits: String(r.stats?.total_hits ?? 0),
          finished_at: r.finished_at ?? "",
        }))
      );
    } catch (err) {
      handleErr(err);
    }
  });

policy
  .command("hits")
  .description("List policy hits")
  .argument("<policyId>", "Policy ID")
  .option("--run-id <id>", "Filter to a run id")
  .option("--bucket <bucket>", "high|medium|low")
  .option("--limit <n>", "Limit", "100")
  .option("--offset <n>", "Offset", "0")
  .action(
    async (
      policyId: string,
      cmd: { runId?: string; bucket?: "high" | "medium" | "low"; limit: string; offset: string }
    ) => {
      try {
        const opts = program.opts<{ baseUrl?: string; json: boolean }>();
        const client = makeApiClient({ baseUrl: opts.baseUrl });
        const { data } = await apiJson({
          client,
          method: "GET",
          path: `/api/policies/${policyId}/hits`,
          query: {
            run_id: cmd.runId,
            bucket: cmd.bucket,
            limit: asInt(cmd.limit, 100),
            offset: asInt(cmd.offset, 0),
          },
          schema: ListPolicyHitsResponseSchema,
        });
        if (opts.json) return void console.log(JSON.stringify(data, null, 2));
        printTable(
          data.hits.map((h) => ({
            hit_id: h.id,
            run_id: truncate(h.run_id, 12),
            bucket: h.priority_bucket,
            score: h.priority_score.toFixed(3),
            at: formatMs(h.start_ms),
            snippet: truncate(h.snippet, 44),
          }))
        );
      } catch (err) {
        handleErr(err);
      }
    }
  );

const feed = program.command("feed").description("Feed operations for saved policies");

feed
  .command("url")
  .description("Print JSON and RSS feed URLs for a policy")
  .argument("<policyId>", "Policy ID")
  .option("--token <token>", "Explicit feed token (defaults to policy token)")
  .action(async (policyId: string, cmd: { token?: string }) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const token = await resolvePolicyFeedToken(client, policyId, cmd.token);
      const out = {
        json: `${client.baseUrl}/api/feeds/${policyId}.json?token=${encodeURIComponent(token)}`,
        rss: `${client.baseUrl}/api/feeds/${policyId}.rss?token=${encodeURIComponent(token)}`,
      };
      if (opts.json) return void console.log(JSON.stringify(out, null, 2));
      console.log(`json: ${out.json}`);
      console.log(`rss:  ${out.rss}`);
    } catch (err) {
      handleErr(err);
    }
  });

feed
  .command("print")
  .description("Fetch and print a policy feed")
  .argument("<policyId>", "Policy ID")
  .option("--token <token>", "Explicit feed token (defaults to policy token)")
  .option("--format <format>", "json|rss", "json")
  .option("--out <path>", "Write feed output to a file")
  .action(async (policyId: string, cmd: { token?: string; format: string; out?: string }) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const token = await resolvePolicyFeedToken(client, policyId, cmd.token);
      const format = String(cmd.format || "json").toLowerCase();

      if (format === "json") {
        const { data } = await apiJson({
          client,
          method: "GET",
          path: `/api/feeds/${policyId}.json`,
          query: { token },
          schema: FeedJsonResponseSchema,
        });
        const payload = JSON.stringify(data, null, 2);
        if (cmd.out) {
          writeFileSync(cmd.out, payload, "utf8");
          if (!opts.json) console.error(`wrote: ${cmd.out}`);
          return;
        }
        console.log(payload);
        return;
      }

      if (format !== "rss") throw new Error(`unsupported format: ${format}`);
      const { text } = await apiText({
        client,
        method: "GET",
        path: `/api/feeds/${policyId}.rss`,
        query: { token },
      });
      if (cmd.out) {
        writeFileSync(cmd.out, text, "utf8");
        if (!opts.json) console.error(`wrote: ${cmd.out}`);
        return;
      }
      process.stdout.write(text);
    } catch (err) {
      handleErr(err);
    }
  });

const youtube = program.command("youtube").description("YouTube discovery (best-effort, no API keys)");

youtube
  .command("search")
  .description("Search YouTube (requires yt-dlp installed on the server)")
  .argument("<query...>", "Search query")
  .option("--take <n>", "Results to return (1-50)", "12")
  .option("--cache-hours <n>", "Cache TTL in hours (0 disables)", "24")
  .option("--refresh", "Bypass cache", false)
  .action(async (queryParts: string[], cmd: { take: string; cacheHours: string; refresh: boolean }) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const body = YouTubeSearchRequestSchema.parse({
        query: queryParts.join(" "),
        take: asInt(cmd.take, 12),
        cache_hours: asInt(cmd.cacheHours, 24),
        refresh: Boolean(cmd.refresh),
      });

      const { data } = await apiJson({
        client,
        method: "POST",
        path: "/api/youtube/search",
        body,
        schema: YouTubeSearchResponseSchema,
      });

      if (opts.json) return void console.log(JSON.stringify(data, null, 2));

      const rows = data.items.map((v) => ({
        title: truncate(v.title ?? v.provider_video_id, 50),
        channel: truncate(v.channel_name ?? "", 24),
        id: v.provider_video_id,
        url: v.url,
      }));
      printTable(rows);
    } catch (err) {
      handleErr(err);
    }
  });

youtube
  .command("channel")
  .description("List latest uploads for a channel (handle, id, or URL)")
  .argument("<handleOrUrl>", "Channel handle like @lexfridman, channel id (UC...), or URL")
  .option("--take <n>", "Results to return (1-200)", "50")
  .option("--cache-hours <n>", "Cache TTL in hours (0 disables)", "24")
  .option("--refresh", "Bypass cache", false)
  .action(async (handleOrUrl: string, cmd: { take: string; cacheHours: string; refresh: boolean }) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const body = YouTubeChannelUploadsRequestSchema.parse({
        handle_or_url: handleOrUrl,
        take: asInt(cmd.take, 50),
        cache_hours: asInt(cmd.cacheHours, 24),
        refresh: Boolean(cmd.refresh),
      });

      const { data } = await apiJson({
        client,
        method: "POST",
        path: "/api/youtube/channel/uploads",
        body,
        schema: YouTubeChannelUploadsResponseSchema,
      });

      if (opts.json) return void console.log(JSON.stringify(data, null, 2));
      printTable(
        data.items.map((v) => ({
          title: truncate(v.title ?? v.provider_video_id, 52),
          channel: truncate(v.channel_name ?? "", 24),
          id: v.provider_video_id,
          url: v.url,
        }))
      );
    } catch (err) {
      handleErr(err);
    }
  });

youtube
  .command("playlist")
  .description("List items in a playlist URL")
  .argument("<url>", "Playlist URL")
  .option("--take <n>", "Results to return (1-500)", "200")
  .option("--cache-hours <n>", "Cache TTL in hours (0 disables)", "24")
  .option("--refresh", "Bypass cache", false)
  .action(async (url: string, cmd: { take: string; cacheHours: string; refresh: boolean }) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const body = YouTubePlaylistItemsRequestSchema.parse({
        url,
        take: asInt(cmd.take, 200),
        cache_hours: asInt(cmd.cacheHours, 24),
        refresh: Boolean(cmd.refresh),
      });

      const { data } = await apiJson({
        client,
        method: "POST",
        path: "/api/youtube/playlist/items",
        body,
        schema: YouTubePlaylistItemsResponseSchema,
      });

      if (opts.json) return void console.log(JSON.stringify(data, null, 2));
      printTable(
        data.items.map((v) => ({
          title: truncate(v.title ?? v.provider_video_id, 52),
          channel: truncate(v.channel_name ?? "", 24),
          id: v.provider_video_id,
          url: v.url,
        }))
      );
    } catch (err) {
      handleErr(err);
    }
  });

const video = program.command("video").description("Video operations");

video
  .command("get")
  .description("Get a video by id")
  .argument("<videoId>", "Video ID")
  .action(async (videoId: string) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const { data } = await apiJson({ client, method: "GET", path: `/api/videos/${videoId}`, schema: GetVideoResponseSchema });
      if (opts.json) console.log(JSON.stringify(data, null, 2));
      else console.log(`${data.video.id}  ${data.video.title ?? data.video.url}`);
    } catch (err) {
      handleErr(err);
    }
  });

video
  .command("transcripts")
  .description("List transcripts for a video")
  .argument("<videoIdOrUrl>", "Video ID or URL")
  .action(async (videoIdOrUrl: string) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const videoId = await resolveVideoId(client, videoIdOrUrl);
      const { data } = await apiJson({
        client,
        method: "GET",
        path: `/api/videos/${videoId}/transcripts`,
        schema: ListTranscriptsResponseSchema,
      });
      if (opts.json) return void console.log(JSON.stringify(data, null, 2));
      const rows = data.transcripts.map((t) => ({
        transcript_id: t.id,
        language: t.language,
        source: t.source,
        generated: String(t.is_generated),
        fetched_at: t.fetched_at,
      }));
      printTable(rows);
    } catch (err) {
      handleErr(err);
    }
  });

video
  .command("search")
  .description("Search within a single video")
  .argument("<videoIdOrUrl>", "Video ID or URL")
  .argument("<query...>", "Search query")
  .option("--mode <mode>", "keyword|semantic|hybrid", "hybrid")
  .option("--limit <n>", "Limit (1-50)", "20")
  .action(async (videoIdOrUrl: string, queryParts: string[], cmd: { mode: string; limit: string }) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const videoId = await resolveVideoId(client, videoIdOrUrl);
      const body = SearchRequestSchema.parse({
        query: queryParts.join(" "),
        mode: cmd.mode,
        limit: asInt(cmd.limit, 20),
      });
      const { data } = await apiJson({
        client,
        method: "POST",
        path: `/api/videos/${videoId}/search`,
        body,
        schema: SearchResponseSchema,
      });
      if (opts.json) return void console.log(JSON.stringify(data, null, 2));

      if (data.embedding_error && cmd.mode !== "keyword") {
        console.error(`warn: semantic search unavailable; keyword fallback used: ${data.embedding_error}`);
      }

      const rows = data.hits.map((h) => ({
        at: formatMs(h.start_ms),
        cue_id: h.cue_id,
        score: h.score.toFixed(3),
        snippet: truncate(h.snippet, 48),
      }));
      printTable(rows);
      console.log(`${client.baseUrl}/videos/${videoId}`);
    } catch (err) {
      handleErr(err);
    }
  });

video
  .command("tags")
  .description("List tags for a video")
  .argument("<videoIdOrUrl>", "Video ID or URL")
  .option("--source <source>", "Filter by source (optional)")
  .action(async (videoIdOrUrl: string, cmd: { source?: string }) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const videoId = await resolveVideoId(client, videoIdOrUrl);
      const { data } = await apiJson({
        client,
        method: "GET",
        path: `/api/videos/${videoId}/tags`,
        query: cmd.source ? { source: cmd.source } : undefined,
        schema: ListVideoTagsResponseSchema,
      });
      if (opts.json) return void console.log(JSON.stringify(data, null, 2));
      if (data.tags.length === 0) return;
      for (const t of data.tags) console.log(t);
    } catch (err) {
      handleErr(err);
    }
  });

video
  .command("chapters")
  .description("List chapters for a video")
  .argument("<videoIdOrUrl>", "Video ID or URL")
  .option("--source <source>", "Filter by source (optional)")
  .action(async (videoIdOrUrl: string, cmd: { source?: string }) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const videoId = await resolveVideoId(client, videoIdOrUrl);
      const { data } = await apiJson({
        client,
        method: "GET",
        path: `/api/videos/${videoId}/chapters`,
        query: cmd.source ? { source: cmd.source } : undefined,
        schema: ListVideoChaptersResponseSchema,
      });
      if (opts.json) return void console.log(JSON.stringify(data, null, 2));
      if (data.chapters.length === 0) return;
      printTable(
        data.chapters.map((c) => ({
          at: formatMs(c.start_ms),
          title: truncate(c.title, 54),
          source: truncate(c.source, 24),
        }))
      );
      console.log(`${client.baseUrl}/videos/${videoId}`);
    } catch (err) {
      handleErr(err);
    }
  });

video
  .command("speakers")
  .description("List diarization speakers for a video")
  .argument("<videoIdOrUrl>", "Video ID or URL")
  .action(async (videoIdOrUrl: string) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const videoId = await resolveVideoId(client, videoIdOrUrl);
      const { data } = await apiJson({
        client,
        method: "GET",
        path: `/api/videos/${videoId}/speakers`,
        schema: ListVideoSpeakersResponseSchema,
      });
      if (opts.json) return void console.log(JSON.stringify(data, null, 2));
      if (data.speakers.length === 0) return;
      printTable(
        data.speakers.map((s) => ({
          speaker_id: s.id,
          key: s.key,
          label: s.label ?? "",
          source: truncate(s.source, 28),
        }))
      );
      console.log(`${client.baseUrl}/videos/${videoId}`);
    } catch (err) {
      handleErr(err);
    }
  });

video
  .command("segments")
  .description("List diarization segments for a video")
  .argument("<videoIdOrUrl>", "Video ID or URL")
  .option("--transcript-id <id>", "Transcript ID (optional)")
  .option("--limit <n>", "Limit", "200")
  .action(async (videoIdOrUrl: string, cmd: { transcriptId?: string; limit: string }) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const videoId = await resolveVideoId(client, videoIdOrUrl);
      const { data } = await apiJson({
        client,
        method: "GET",
        path: `/api/videos/${videoId}/speakers/segments`,
        query: {
          transcript_id: cmd.transcriptId,
          limit: asInt(cmd.limit, 200),
        },
        schema: ListSpeakerSegmentsResponseSchema,
      });
      if (opts.json) return void console.log(JSON.stringify(data, null, 2));
      if (data.segments.length === 0) return;
      printTable(
        data.segments.map((s) => ({
          at: formatMs(s.start_ms),
          end: formatMs(s.end_ms),
          speaker_id: truncate(s.speaker_id, 10),
          source: truncate(s.source, 18),
        }))
      );
      console.log(`${client.baseUrl}/videos/${videoId}`);
    } catch (err) {
      handleErr(err);
    }
  });

const speaker = program.command("speaker").description("Speaker operations");

speaker
  .command("rename")
  .description("Rename (label) a diarization speaker")
  .argument("<videoIdOrUrl>", "Video ID or URL")
  .argument("<speakerKeyOrId>", "Speaker key (speaker_0) or speaker id (uuid)")
  .argument("[label...]", "New label (omit or use --clear to remove)")
  .option("--clear", "Clear label", false)
  .action(async (videoIdOrUrl: string, speakerKeyOrId: string, labelParts: string[], cmd: { clear: boolean }) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const videoId = await resolveVideoId(client, videoIdOrUrl);

      const speakersRes = await apiJson({
        client,
        method: "GET",
        path: `/api/videos/${videoId}/speakers`,
        schema: ListVideoSpeakersResponseSchema,
      });
      const speakers = speakersRes.data.speakers;

      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(speakerKeyOrId);
      const sp =
        isUuid
          ? speakers.find((s) => s.id === speakerKeyOrId)
          : speakers.find((s) => s.key === speakerKeyOrId) || speakers.find((s) => (s.label || "").toLowerCase() === speakerKeyOrId.toLowerCase());
      if (!sp) throw new Error(`speaker not found: ${speakerKeyOrId}`);

      const label = cmd.clear ? null : labelParts.join(" ").trim() || null;
      if (!cmd.clear && !label) throw new Error("label is required (or pass --clear to remove it)");
      const body = UpdateVideoSpeakerRequestSchema.parse({ label });
      const { data } = await apiJson({
        client,
        method: "PATCH",
        path: `/api/videos/${videoId}/speakers/${sp.id}`,
        body,
        schema: UpdateVideoSpeakerResponseSchema,
      });

      if (opts.json) console.log(JSON.stringify(data, null, 2));
      else console.log(`${data.speaker.key}  ${data.speaker.label ?? ""}`.trim());
    } catch (err) {
      handleErr(err);
    }
  });

program
  .command("ingest")
  .description("Enqueue ingest job for a video (fetch transcript, chunk, entities, etc.)")
  .argument("<videoIdOrUrl>", "Video ID or URL")
  .option("--language <code>", "Language", "en")
  .option("--steps <csv>", "Comma-separated ingest steps (e.g. enrich_cli,diarize)", "")
  .option("--enrich-cli", "Enable CLI enrichment (entities/tags/chapters)", false)
  .option("--diarize", "Enable speaker diarization (speakers/segments)", false)
  .option("--no-stt", "Disable STT fallback (captions-disabled videos will fail)", undefined)
  .option("--wait", "Wait for job completion", false)
  .option("--poll-ms <n>", "Poll interval in ms", "1000")
  .option("--logs", "While waiting, print job logs as they arrive", false)
  .action(
    async (
      videoIdOrUrl: string,
      cmd: { language: string; steps: string; enrichCli: boolean; diarize: boolean; stt?: boolean; wait: boolean; pollMs: string; logs: boolean }
    ) => {
      try {
        const opts = program.opts<{ baseUrl?: string; json: boolean }>();
        const client = makeApiClient({ baseUrl: opts.baseUrl });
        const videoId = await resolveVideoId(client, videoIdOrUrl);
        const steps = [
          ...(cmd.enrichCli ? ["enrich_cli"] : []),
          ...(cmd.diarize ? ["diarize"] : []),
          ...parseCsvList(cmd.steps),
        ];

        // If the caller is explicitly providing a steps allowlist, keep STT fallback on by default
        // to avoid ingest failures on captions-disabled videos (unless explicitly disabled).
        if (steps.length > 0 && cmd.stt !== false && !steps.includes("stt")) steps.push("stt");

        const body = IngestVideoRequestSchema.parse({ language: cmd.language, steps: steps.length ? steps : undefined });
        const { data, res } = await apiJson({
          client,
          method: "POST",
          path: `/api/videos/${videoId}/ingest`,
          body,
          schema: IngestVideoResponseSchema,
        });

        const traceId = res.headers.get("x-trace-id");
        if (opts.json) console.log(JSON.stringify({ ...data, trace_id: traceId }, null, 2));
        else {
          console.log(`job: ${data.job.id}${traceId ? `  trace: ${traceId}` : ""}`);
        }

        if (!cmd.wait) return;

        const pollMs = asInt(cmd.pollMs, 1000);
        let lastLogCount = 0;
        while (true) {
          const { data: jobData } = await apiJson({
            client,
            method: "GET",
            path: `/api/jobs/${data.job.id}`,
            schema: GetJobResponseSchema,
          });

          if (!opts.json) {
            const p = jobData.job.progress ?? 0;
            console.error(`status: ${jobData.job.status}  progress: ${p}%`);
          }

          if (cmd.logs) {
            const { data: logsData } = await apiJson({
              client,
              method: "GET",
              path: `/api/jobs/${data.job.id}/logs`,
              query: { limit: 500 },
              schema: ListJobLogsResponseSchema,
            });
            const newLogs = logsData.logs.slice(lastLogCount);
            for (const l of newLogs) console.error(`${l.ts} [${l.level}] ${l.message}`);
            lastLogCount = logsData.logs.length;
          }

          if (["completed", "failed", "canceled"].includes(jobData.job.status)) {
            if (opts.json) console.log(JSON.stringify(jobData, null, 2));
            return;
          }
          await new Promise((r) => setTimeout(r, pollMs));
        }
      } catch (err) {
        handleErr(err);
      }
    }
  );

const job = program.command("job").description("Job operations");

job
  .command("get")
  .description("Get job status")
  .argument("<jobId>", "Job ID")
  .action(async (jobId: string) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const { data } = await apiJson({ client, method: "GET", path: `/api/jobs/${jobId}`, schema: GetJobResponseSchema });
      if (opts.json) console.log(JSON.stringify(data, null, 2));
      else console.log(`${data.job.id}  ${data.job.status}  ${data.job.progress ?? 0}%`);
    } catch (err) {
      handleErr(err);
    }
  });

job
  .command("logs")
  .description("List job logs (most recent first)")
  .argument("<jobId>", "Job ID")
  .option("--limit <n>", "Limit", "50")
  .action(async (jobId: string, cmd: { limit: string }) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const { data } = await apiJson({
        client,
        method: "GET",
        path: `/api/jobs/${jobId}/logs`,
        query: { limit: asInt(cmd.limit, 50) },
        schema: ListJobLogsResponseSchema,
      });
      if (opts.json) return void console.log(JSON.stringify(data, null, 2));
      for (const l of data.logs) console.log(`${l.ts} [${l.level}] ${l.message}`);
    } catch (err) {
      handleErr(err);
    }
  });

const transcript = program.command("transcript").description("Transcript operations");

transcript
  .command("cues")
  .description("List transcript cues")
  .argument("<transcriptId>", "Transcript ID")
  .option("--cursor <n>", "Cursor index", "0")
  .option("--limit <n>", "Limit", "100")
  .action(async (transcriptId: string, cmd: { cursor: string; limit: string }) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const { data } = await apiJson({
        client,
        method: "GET",
        path: `/api/transcripts/${transcriptId}/cues`,
        query: { cursor: asInt(cmd.cursor, 0), limit: asInt(cmd.limit, 100) },
        schema: ListCuesResponseSchema,
      });
      if (opts.json) return void console.log(JSON.stringify(data, null, 2));
      const rows = data.cues.map((c) => ({
        idx: String(c.idx),
        at: formatMs(c.start_ms),
        cue_id: c.id,
        text: truncate(c.text, 56),
      }));
      printTable(rows);
      if (data.next_cursor !== null) console.log(`next_cursor: ${data.next_cursor}`);
    } catch (err) {
      handleErr(err);
    }
  });

transcript
  .command("export")
  .description("Export transcript as txt or vtt")
  .argument("<transcriptId>", "Transcript ID")
  .option("--format <fmt>", "txt|vtt", "txt")
  .option("--out <path>", "Write output to a file instead of stdout")
  .action(async (transcriptId: string, cmd: { format: string; out?: string }) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const fmt = String(cmd.format || "txt").toLowerCase();
      const { text } = await apiText({
        client,
        method: "GET",
        path: `/api/transcripts/${transcriptId}/export`,
        query: { format: fmt },
      });
      if (cmd.out) {
        writeFileSync(cmd.out, text, "utf8");
        if (!opts.json) console.error(`wrote: ${cmd.out}`);
      } else {
        process.stdout.write(text);
      }
    } catch (err) {
      handleErr(err);
    }
  });

const chat = program.command("chat").description("Chat with grounded sources");

chat
  .command("turns")
  .description("List stored chat turns for a video")
  .argument("<videoIdOrUrl>", "Video ID or URL")
  .action(async (videoIdOrUrl: string) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const videoId = await resolveVideoId(client, videoIdOrUrl);
      const { data } = await apiJson({
        client,
        method: "GET",
        path: `/api/videos/${videoId}/chat/turns`,
        schema: ListChatTurnsResponseSchema,
      });
      if (opts.json) return void console.log(JSON.stringify(data, null, 2));
      const rows = data.turns.map((t) => ({
        turn_id: t.id,
        status: t.status,
        provider: t.provider,
        created_at: t.created_at,
      }));
      printTable(rows);
    } catch (err) {
      handleErr(err);
    }
  });

chat
  .command("ask")
  .description("Ask a question about a video (streams by default)")
  .argument("<videoIdOrUrl>", "Video ID or URL")
  .argument("<prompt...>", "Prompt")
  .option("--provider <p>", "ollama|cli|mock", "cli")
  .option("--model <id>", "Model id (ollama or cli)", undefined)
  .option("--language <code>", "Language", "en")
  .option("--at-ms <n>", "Current playback time (ms)", undefined)
  .option("--no-stream", "Disable streaming (use JSON endpoint)")
  .action(
    async (
      videoIdOrUrl: string,
      promptParts: string[],
      cmd: {
        provider: string;
        model?: string;
        language: string;
        atMs?: string;
        stream: boolean;
      }
    ) => {
      try {
        const opts = program.opts<{ baseUrl?: string; json: boolean }>();
        const client = makeApiClient({ baseUrl: opts.baseUrl });
        const videoId = await resolveVideoId(client, videoIdOrUrl);

        const body = ChatRequestSchema.parse({
          provider: cmd.provider,
          model_id: cmd.model,
          language: cmd.language,
          at_ms: cmd.atMs ? asInt(cmd.atMs, 0) : null,
          messages: [{ role: "user", content: promptParts.join(" ") }],
        });

        if (!cmd.stream) {
          const { data, res } = await apiJson({
            client,
            method: "POST",
            path: `/api/videos/${videoId}/chat`,
            body,
            schema: ChatResponseSchema,
          });
          if (opts.json) return void console.log(JSON.stringify({ ...data, trace_id: res.headers.get("x-trace-id") }, null, 2));
          console.log(data.answer.trimEnd());
          return;
        }

        const url = new URL(client.baseUrl + `/api/videos/${videoId}/chat/stream`);
        const res = await fetch(url, {
          method: "POST",
          headers: { accept: "text/event-stream", "content-type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          // Try to parse the error SSE payload or fall back to normal error parsing.
          const text = await res.text().catch(() => "");
          throw new Error(text || `chat stream failed (${res.status})`);
        }

        let final: unknown = null;
        for await (const ev of readSse(res)) {
          if (ev.type === "text" && typeof ev.delta === "string") {
            process.stdout.write(ev.delta);
          } else if (ev.type === "done") {
            final = (ev as { response?: unknown }).response ?? null;
          } else if (ev.type === "error") {
            const e = (ev as { error?: { code?: string; message?: string } }).error;
            throw new Error(`${e?.code ?? "error"}: ${e?.message ?? "unknown error"}`);
          }
        }
        process.stdout.write("\n");
        if (opts.json && final) console.log(JSON.stringify(final, null, 2));
      } catch (err) {
        handleErr(err);
      }
    }
  );

// ─── Visual Intelligence Commands ────────────────────────────────────────────

const visual = program.command("visual").description("Visual intelligence (action transcripts)");

visual
  .command("ingest <videoId>")
  .description("Run visual intelligence pipeline on a video")
  .option("--provider <p>", "Vision provider: claude|openai|gemini|ollama|claude-cli|gemini-cli|codex-cli|auto")
  .option("--model <m>", "Vision model name")
  .option("--prefer-local", "Prefer free local/CLI providers over paid API providers", false)
  .option("--prompt-template <t>", "Prompt template: describe|caption|ocr|slide|audit", "describe")
  .option("--strategy <s>", "Extraction strategy: scene_detect|uniform|keyframe", "scene_detect")
  .option("--frames-per-minute <n>", "Frames per minute (uniform strategy)", "2")
  .option("--scene-threshold <n>", "Scene detection threshold 0-1", "0.27")
  .option("--max-frames <n>", "Maximum frames to extract", "200")
  .option("--force", "Force re-processing", false)
  .action(async (videoId: string, cmd: {
    provider?: string;
    model?: string;
    preferLocal: boolean;
    promptTemplate: string;
    strategy: string;
    framesPerMinute: string;
    sceneThreshold: string;
    maxFrames: string;
    force: boolean;
  }) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      videoId = await resolveVideoId(client, videoId);

      let provider = cmd.provider as string | undefined;
      let model = cmd.model;

      // Auto-select or prefer-local: resolve provider on the client side and send to API
      if (!provider || provider === "auto" || cmd.preferLocal) {
        // Send prefer_local hint to API for server-side auto-selection
        provider = cmd.preferLocal ? "auto-local" : "claude";
      }

      if (!model) {
        const modelDefaults: Record<string, string> = {
          "claude": "claude-sonnet-4-20250514",
          "openai": "gpt-4o",
          "gemini": "gemini-2.0-flash",
          "ollama": "llava",
          "claude-cli": "sonnet",
          "gemini-cli": "gemini-2.0-flash",
          "codex-cli": "o4-mini",
        };
        model = modelDefaults[provider] || "claude-sonnet-4-20250514";
      }

      const body = IngestVisualRequestSchema.parse({
        extraction: {
          strategy: cmd.strategy,
          framesPerMinute: parseFloat(cmd.framesPerMinute),
          sceneThreshold: parseFloat(cmd.sceneThreshold),
          maxFrames: parseInt(cmd.maxFrames, 10),
        },
        vision: {
          provider,
          model,
        },
        force: cmd.force,
      });

      const { data } = await apiJson({
        client,
        method: "POST",
        path: `/api/videos/${videoId}/visual/ingest`,
        body,
        schema: IngestVisualResponseSchema,
      });

      if (opts.json) {
        console.log(JSON.stringify(data, null, 2));
      } else {
        console.log(`visual ingest job queued: ${data.job.id} (provider: ${provider})`);
        console.log(`track with: yit job ${data.job.id} --follow`);
      }
    } catch (err) {
      handleErr(err);
    }
  });

visual
  .command("providers")
  .description("List available vision providers (API, CLI, local)")
  .action(async () => {
    try {
      const { detectAvailableProviders } = await import("@yt/core");
      const opts = program.opts<{ json: boolean }>();
      const providers = detectAvailableProviders();

      if (opts.json) {
        console.log(JSON.stringify(providers, null, 2));
        return;
      }

      console.log("Available Vision Providers:\n");
      for (const p of providers) {
        const status = p.available ? "available" : "not found";
        const cost = p.free ? "FREE" : "paid (API key)";
        const mark = p.available ? "+" : "-";
        console.log(`  [${mark}] ${p.provider.padEnd(12)} ${p.type.padEnd(6)} ${cost.padEnd(16)} ${status}`);
      }

      const recommended = providers.find((p) => p.free && p.available);
      if (recommended) {
        console.log(`\nRecommended (free): --provider ${recommended.provider}`);
      }
      console.log("\nUse --prefer-local with 'visual ingest' to auto-select free providers.");
    } catch (err) {
      handleErr(err);
    }
  });

visual
  .command("status <videoId>")
  .description("Show visual processing status for a video")
  .action(async (videoId: string) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      videoId = await resolveVideoId(client, videoId);

      const { data } = await apiJson({
        client,
        method: "GET",
        path: `/api/videos/${videoId}/visual/status`,
        schema: GetVisualStatusResponseSchema,
      });

      if (opts.json) {
        console.log(JSON.stringify(data, null, 2));
      } else {
        const s = data.status;
        console.log(`has_visual:     ${s.has_visual}`);
        console.log(`frames:         ${s.frames_extracted}`);
        console.log(`analyzed:       ${s.frames_analyzed}`);
        console.log(`chunks:         ${s.frame_chunks}`);
        console.log(`embeddings:     ${s.visual_embeddings}`);
        console.log(`tokens:         ${s.total_tokens_used ?? "n/a"}`);
        console.log(`provider:       ${s.vision_provider ?? "n/a"}`);
        console.log(`model:          ${s.vision_model ?? "n/a"}`);
        console.log(`strategy:       ${s.extraction_strategy ?? "n/a"}`);
        console.log(`completed:      ${s.completed_at ?? "n/a"}`);
      }
    } catch (err) {
      handleErr(err);
    }
  });

visual
  .command("transcript <videoId>")
  .description("Show the action transcript (visual descriptions)")
  .option("--format <f>", "Output format: text|json|srt", "text")
  .action(async (videoId: string, cmd: { format: string }) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      videoId = await resolveVideoId(client, videoId);

      const { data } = await apiJson({
        client,
        method: "GET",
        path: `/api/videos/${videoId}/visual/transcript`,
        schema: GetActionTranscriptResponseSchema,
      });

      if (opts.json || cmd.format === "json") {
        console.log(JSON.stringify(data, null, 2));
        return;
      }

      if (cmd.format === "srt") {
        for (let i = 0; i < data.transcript.cues.length; i++) {
          const cue = data.transcript.cues[i];
          const startSrt = formatSrtTime(cue.start_ms);
          const endSrt = formatSrtTime(cue.end_ms);
          console.log(`${i + 1}`);
          console.log(`${startSrt} --> ${endSrt}`);
          console.log(cue.description);
          console.log();
        }
        return;
      }

      // text format
      console.log(`Action Transcript (${data.transcript.total_analyzed} frames, ${data.transcript.provider}/${data.transcript.model})\n`);
      for (const cue of data.transcript.cues) {
        const ts = formatMs(cue.timestamp_ms);
        const scene = cue.scene_type ? ` [${cue.scene_type}]` : "";
        console.log(`[${ts}]${scene} ${cue.description}`);
        if (cue.text_overlay) console.log(`  TEXT: ${cue.text_overlay}`);
      }
    } catch (err) {
      handleErr(err);
    }
  });

visual
  .command("frames <videoId>")
  .description("List extracted frames for a video")
  .option("--limit <n>", "Max frames to show", "20")
  .option("--offset <n>", "Offset for pagination", "0")
  .action(async (videoId: string, cmd: { limit: string; offset: string }) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      videoId = await resolveVideoId(client, videoId);

      const { data } = await apiJson({
        client,
        method: "GET",
        path: `/api/videos/${videoId}/frames`,
        query: { limit: parseInt(cmd.limit, 10), offset: parseInt(cmd.offset, 10) },
        schema: ListFramesResponseSchema,
      });

      if (opts.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }

      const rows = data.frames.map((f) => ({
        index: String(f.frame_index),
        timestamp: formatMs(f.timestamp_ms),
        method: f.extraction_method || "",
        sharpness: f.sharpness != null ? f.sharpness.toFixed(1) : "n/a",
        blank: f.is_blank ? "yes" : "no",
        size: f.file_size_bytes != null ? `${Math.round(f.file_size_bytes / 1024)}KB` : "n/a",
      }));
      printTable(rows);
    } catch (err) {
      handleErr(err);
    }
  });

visual
  .command("frame <videoId> <frameId>")
  .description("Show frame detail + analysis")
  .action(async (videoId: string, frameId: string) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      videoId = await resolveVideoId(client, videoId);

      const { data } = await apiJson({
        client,
        method: "GET",
        path: `/api/videos/${videoId}/frames/${frameId}`,
        schema: GetFrameAnalysisResponseSchema,
      });

      if (opts.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }

      console.log(`Frame #${data.frame.frame_index} @ ${formatMs(data.frame.timestamp_ms)}`);
      console.log(`  file: ${data.frame.file_path}`);
      if (data.analysis) {
        console.log(`  description: ${data.analysis.description}`);
        if (data.analysis.text_overlay) console.log(`  text_overlay: ${data.analysis.text_overlay}`);
        if (data.analysis.scene_type) console.log(`  scene_type: ${data.analysis.scene_type}`);
        if (data.analysis.objects && Array.isArray(data.analysis.objects) && data.analysis.objects.length > 0) {
          console.log(`  objects: ${data.analysis.objects.map((o: any) => o.label).join(", ")}`);
        }
      } else {
        console.log("  (not analyzed)");
      }
    } catch (err) {
      handleErr(err);
    }
  });

visual
  .command("estimate <videoId>")
  .description("Estimate cost of visual analysis before running it")
  .option("--provider <p>", "Vision provider: claude|openai|gemini|ollama", "claude")
  .option("--model <m>", "Vision model name")
  .option("--max-frames <n>", "Estimated max frames", "200")
  .action(async (videoId: string, cmd: { provider: string; model?: string; maxFrames: string }) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      videoId = await resolveVideoId(client, videoId);

      const { data } = await apiJson({
        client,
        method: "GET",
        path: `/api/videos/${videoId}/visual/estimate`,
        query: {
          provider: cmd.provider,
          model: cmd.model || (cmd.provider === "claude" ? "claude-sonnet-4-20250514" : cmd.provider === "openai" ? "gpt-4o" : cmd.provider === "gemini" ? "gemini-2.0-flash" : "llava"),
          maxFrames: parseInt(cmd.maxFrames, 10),
        },
        schema: CostEstimateSchema,
      });

      if (opts.json) {
        console.log(JSON.stringify(data, null, 2));
      } else {
        console.log(`Cost Estimate: ${data.frameCount} frames via ${data.provider}/${data.model}`);
        if (data.isLocal) {
          console.log("  Local provider — no API cost");
        } else {
          console.log(`  Input tokens:  ~${data.estimatedInputTokens.toLocaleString()}`);
          console.log(`  Output tokens: ~${data.estimatedOutputTokens.toLocaleString()}`);
          console.log(`  Total tokens:  ~${data.estimatedTotalTokens.toLocaleString()}`);
          console.log(`  Est. cost:     ~$${data.estimatedCostUsd.toFixed(4)} USD`);
        }
      }
    } catch (err) {
      handleErr(err);
    }
  });

visual
  .command("narrative <videoId>")
  .description("Generate or show narrative synthesis of visual content")
  .action(async (videoId: string) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      videoId = await resolveVideoId(client, videoId);

      const { data } = await apiJson({
        client,
        method: "GET",
        path: `/api/videos/${videoId}/visual/narrative`,
        schema: GetNarrativeSynthesisResponseSchema,
      });

      if (opts.json) {
        console.log(JSON.stringify(data, null, 2));
      } else {
        const n = data.narrative;
        console.log("=== Visual Narrative ===\n");
        console.log(n.summary);

        if (n.key_moments.length > 0) {
          console.log("\n--- Key Moments ---");
          for (const m of n.key_moments) {
            console.log(`  [${formatMs(m.timestamp_ms)}] ${m.description}`);
          }
        }

        if (n.visual_themes.length > 0) {
          console.log(`\n--- Visual Themes ---`);
          console.log(`  ${n.visual_themes.join(", ")}`);
        }

        if (n.scene_breakdown.length > 0) {
          console.log("\n--- Scene Breakdown ---");
          for (const s of n.scene_breakdown) {
            console.log(`  ${s.scene_type}: ${s.count} (${s.percentage}%)`);
          }
        }

        console.log(`\n(${n.total_frames} frames, ${n.provider}/${n.model})`);
      }
    } catch (err) {
      handleErr(err);
    }
  });

function formatSrtTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const millis = ms % 1000;
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const pad3 = (n: number) => String(n).padStart(3, "0");
  return `${pad2(h)}:${pad2(m)}:${pad2(s)},${pad3(millis)}`;
}

// ─── Dense Action Transcript Commands ────────────────────────────────────────

visual
  .command("dense-transcript <videoId>")
  .description("Show or build the dense second-by-second action transcript")
  .option("--build", "Trigger building the dense transcript", false)
  .option("--format <f>", "Output format: table|json|vtt", "table")
  .option("--force", "Force rebuild even if exists", false)
  .action(async (videoId: string, cmd: { build: boolean; format: string; force: boolean }) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      videoId = await resolveVideoId(client, videoId);

      if (cmd.build) {
        const body = BuildDenseTranscriptRequestSchema.parse({ force: cmd.force });
        const { data } = await apiJson({
          client,
          method: "POST",
          path: `/api/videos/${videoId}/visual/dense-transcript`,
          body,
          schema: BuildDenseTranscriptResponseSchema,
        });
        if (opts.json) return void console.log(JSON.stringify(data, null, 2));
        console.log(`dense transcript build job queued: ${data.job.id}`);
        console.log(`track with: yit job ${data.job.id} --follow`);
        return;
      }

      const { data } = await apiJson({
        client,
        method: "GET",
        path: `/api/videos/${videoId}/visual/dense-transcript`,
        schema: GetDenseTranscriptResponseSchema,
      });

      if (opts.json || cmd.format === "json") {
        return void console.log(JSON.stringify(data, null, 2));
      }

      if (cmd.format === "vtt") {
        console.log("WEBVTT\n");
        for (const cue of data.transcript.cues) {
          const startVtt = formatSrtTime(cue.start_ms).replace(",", ".");
          const endVtt = formatSrtTime(cue.end_ms).replace(",", ".");
          console.log(`${startVtt} --> ${endVtt}`);
          console.log(cue.description);
          console.log();
        }
        return;
      }

      // table format
      console.log(`Dense Transcript (${data.transcript.total_cues} cues: ${data.transcript.direct_cues} direct, ${data.transcript.interpolated_cues} interpolated)\n`);
      const rows = data.transcript.cues.map((c) => ({
        time: formatMs(c.start_ms),
        type: c.interpolated ? "interp" : "direct",
        scene: c.scene_type ?? "",
        description: truncate(c.description, 60),
      }));
      printTable(rows);
    } catch (err) {
      handleErr(err);
    }
  });

// ─── Auto-Chapters + Marks Commands ──────────────────────────────────────────

const autoChapters = program.command("auto-chapters").description("Multi-signal auto-detected chapters");

autoChapters
  .command("show <videoId>")
  .description("Show auto-detected chapters for a video")
  .action(async (videoId: string) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      videoId = await resolveVideoId(client, videoId);

      const { data } = await apiJson({
        client,
        method: "GET",
        path: `/api/videos/${videoId}/auto-chapters`,
        schema: GetAutoChaptersResponseSchema,
      });

      if (opts.json) return void console.log(JSON.stringify(data, null, 2));

      console.log(`Auto-Chapters (${data.chapters.length} chapters, ${data.marks.length} marks)\n`);
      for (const ch of data.chapters) {
        const signals = ch.signals.length ? ` [${ch.signals.join(", ")}]` : "";
        const conf = ch.confidence != null ? ` (${(ch.confidence * 100).toFixed(0)}%)` : "";
        console.log(`  ${formatMs(ch.start_ms)} - ${formatMs(ch.end_ms)}  ${ch.title}${signals}${conf}`);
      }
    } catch (err) {
      handleErr(err);
    }
  });

autoChapters
  .command("detect <videoId>")
  .description("Trigger auto-chapter detection for a video")
  .option("--min-signals <n>", "Minimum signals for boundary", "2")
  .option("--window-ms <n>", "Signal window in ms", "3000")
  .option("--force", "Force re-detection", false)
  .action(async (videoId: string, cmd: { minSignals: string; windowMs: string; force: boolean }) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      videoId = await resolveVideoId(client, videoId);

      const body = DetectAutoChaptersRequestSchema.parse({
        force: cmd.force,
        min_signals: asInt(cmd.minSignals, 2),
        window_ms: asInt(cmd.windowMs, 3000),
      });
      const { data } = await apiJson({
        client,
        method: "POST",
        path: `/api/videos/${videoId}/auto-chapters`,
        body,
        schema: DetectAutoChaptersResponseSchema,
      });
      if (opts.json) return void console.log(JSON.stringify(data, null, 2));
      console.log(`auto-chapter detection job queued: ${data.job.id}`);
      console.log(`track with: yit job ${data.job.id} --follow`);
    } catch (err) {
      handleErr(err);
    }
  });

const marks = program.command("marks").description("Significant marks within a video");

marks
  .command("list <videoId>")
  .description("List significant marks for a video")
  .option("--type <type>", "Filter by mark type (e.g. slide_change, speaker_change)")
  .option("--limit <n>", "Limit results", "200")
  .action(async (videoId: string, cmd: { type?: string; limit: string }) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      videoId = await resolveVideoId(client, videoId);

      const query: Record<string, string | number | boolean | null | undefined> = { limit: asInt(cmd.limit, 200) };
      if (cmd.type) query.type = cmd.type;

      const { data } = await apiJson({
        client,
        method: "GET",
        path: `/api/videos/${videoId}/marks`,
        query,
        schema: ListSignificantMarksResponseSchema,
      });

      if (opts.json) return void console.log(JSON.stringify(data, null, 2));

      const rows = data.marks.map((m) => ({
        time: formatMs(m.timestamp_ms),
        type: m.mark_type,
        confidence: (m.confidence * 100).toFixed(0) + "%",
        description: truncate(m.description ?? "", 50),
      }));
      printTable(rows);
    } catch (err) {
      handleErr(err);
    }
  });

// ─── Face Indexing Commands ──────────────────────────────────────────────────

const faces = program.command("faces").description("Face identity operations");

faces
  .command("list <videoId>")
  .description("List face identities for a video")
  .action(async (videoId: string) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      videoId = await resolveVideoId(client, videoId);

      const { data } = await apiJson({
        client,
        method: "GET",
        path: `/api/videos/${videoId}/faces`,
        schema: ListFaceIdentitiesResponseSchema,
      });

      if (opts.json) return void console.log(JSON.stringify(data, null, 2));

      const rows = data.identities.map((f) => ({
        id: f.id,
        label: f.label,
        display_name: f.display_name ?? "",
        speaker: f.speaker_id ?? "",
      }));
      printTable(rows);
    } catch (err) {
      handleErr(err);
    }
  });

faces
  .command("appearances <videoId> <identityId>")
  .description("Show timeline of face appearances")
  .action(async (videoId: string, identityId: string) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      videoId = await resolveVideoId(client, videoId);

      const { data } = await apiJson({
        client,
        method: "GET",
        path: `/api/videos/${videoId}/faces/${identityId}/appearances`,
        schema: ListFaceAppearancesResponseSchema,
      });

      if (opts.json) return void console.log(JSON.stringify(data, null, 2));

      const rows = data.appearances.map((a) => ({
        start: formatMs(a.start_ms),
        end: formatMs(a.end_ms),
        frames: String(a.frame_count),
        det_score: a.avg_det_score != null ? a.avg_det_score.toFixed(2) : "n/a",
      }));
      printTable(rows);
    } catch (err) {
      handleErr(err);
    }
  });

faces
  .command("rename <videoId> <identityId> <name>")
  .description("Set a display name for a face identity")
  .action(async (videoId: string, identityId: string, name: string) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      videoId = await resolveVideoId(client, videoId);

      const body = UpdateFaceIdentityRequestSchema.parse({ display_name: name });
      const { data } = await apiJson({
        client,
        method: "PATCH",
        path: `/api/videos/${videoId}/faces/${identityId}`,
        body,
        schema: UpdateFaceIdentityResponseSchema,
      });

      if (opts.json) return void console.log(JSON.stringify(data, null, 2));
      console.log(`renamed: ${data.identity.label} -> ${data.identity.display_name}`);
    } catch (err) {
      handleErr(err);
    }
  });

faces
  .command("ingest <videoId>")
  .description("Run face detection and clustering pipeline on a video")
  .option("--det-threshold <n>", "Detection confidence threshold 0-1", "0.5")
  .option("--cluster-threshold <n>", "Clustering distance threshold 0-1", "0.68")
  .option("--force", "Force re-processing (clears existing face data)", false)
  .action(async (videoId: string, cmd: {
    detThreshold: string;
    clusterThreshold: string;
    force: boolean;
  }) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      videoId = await resolveVideoId(client, videoId);

      const body = {
        det_threshold: parseFloat(cmd.detThreshold),
        cluster_threshold: parseFloat(cmd.clusterThreshold),
        force: cmd.force,
      };

      const { data } = await apiJson({
        client,
        method: "POST",
        path: `/api/videos/${videoId}/faces/ingest`,
        body,
        schema: IngestFacesResponseSchema,
      });

      if (opts.json) {
        console.log(JSON.stringify(data, null, 2));
      } else {
        console.log(`face ingest job queued: ${data.job.id}`);
        console.log(`track with: yit job ${data.job.id} --follow`);
      }
    } catch (err) {
      handleErr(err);
    }
  });

// ─── Voice Fingerprinting Commands ───────────────────────────────────────────

const voice = program.command("voice").description("Voice fingerprinting and cross-video speaker recognition");

voice
  .command("info <videoId> <speakerId>")
  .description("Show voice embedding info for a speaker")
  .action(async (videoId: string, speakerId: string) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      videoId = await resolveVideoId(client, videoId);

      const { data } = await apiJson({
        client,
        method: "GET",
        path: `/api/videos/${videoId}/speakers/${speakerId}/voice`,
        schema: GetSpeakerVoiceResponseSchema,
      });

      if (opts.json) return void console.log(JSON.stringify(data, null, 2));

      if (data.embedding) {
        console.log(`speaker:        ${data.embedding.speaker_id}`);
        console.log(`model:          ${data.embedding.model_id}`);
        console.log(`segments:       ${data.embedding.segment_count}`);
        console.log(`created:        ${data.embedding.created_at}`);
      } else {
        console.log("No voice embedding found for this speaker.");
        console.log("Run voice embedding extraction first.");
      }
    } catch (err) {
      handleErr(err);
    }
  });

voice
  .command("match <videoId> <speakerId>")
  .description("Find cross-video matches for a speaker's voice")
  .action(async (videoId: string, speakerId: string) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      videoId = await resolveVideoId(client, videoId);

      const { data } = await apiJson({
        client,
        method: "POST",
        path: `/api/videos/${videoId}/speakers/${speakerId}/match`,
        schema: MatchSpeakerResponseSchema,
      });

      if (opts.json) return void console.log(JSON.stringify(data, null, 2));

      if (data.matches.length === 0) {
        console.log("No cross-video matches found.");
        return;
      }

      for (const match of data.matches) {
        console.log(`\n  ${match.display_name}  confidence: ${(match.confidence * 100).toFixed(1)}%`);
        for (const v of match.videos) {
          console.log(`    video: ${v.video_id}  speaker: ${v.speaker_id}${v.title ? `  "${v.title}"` : ""}`);
        }
      }
    } catch (err) {
      handleErr(err);
    }
  });

voice
  .command("ingest <videoId>")
  .description("Run voice embedding extraction pipeline on a video")
  .option("--force", "Force re-processing (clears existing voice data)", false)
  .action(async (videoId: string, cmd: { force: boolean }) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      videoId = await resolveVideoId(client, videoId);

      const body = { force: cmd.force };

      const { data } = await apiJson({
        client,
        method: "POST",
        path: `/api/videos/${videoId}/speakers/voice-ingest`,
        body,
        schema: IngestVoiceResponseSchema,
      });

      if (opts.json) {
        console.log(JSON.stringify(data, null, 2));
      } else {
        console.log(`voice ingest job queued: ${data.job.id}`);
        console.log(`track with: yit job ${data.job.id} --follow`);
      }
    } catch (err) {
      handleErr(err);
    }
  });

// ─── Global Speakers Commands ────────────────────────────────────────────────

const globalSpeakers = program.command("global-speakers").description("Cross-video global speaker identities");

globalSpeakers
  .command("list")
  .description("List all global speakers")
  .action(async () => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });

      const { data } = await apiJson({
        client,
        method: "GET",
        path: "/api/global-speakers",
        schema: ListGlobalSpeakersResponseSchema,
      });

      if (opts.json) return void console.log(JSON.stringify(data, null, 2));

      if (data.global_speakers.length === 0) {
        console.log("No global speakers found.");
        return;
      }

      const rows = data.global_speakers.map((gs) => ({
        id: gs.id,
        display_name: gs.display_name,
        created: gs.created_at,
      }));
      printTable(rows);
    } catch (err) {
      handleErr(err);
    }
  });

globalSpeakers
  .command("create <speakerId> <name>")
  .description("Create a global speaker from a per-video speaker")
  .requiredOption("--video <videoId>", "Video ID of the source speaker")
  .action(async (speakerId: string, name: string, cmd: { video: string }) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });

      const body = CreateGlobalSpeakerRequestSchema.parse({
        display_name: name,
        speaker_id: speakerId,
        video_id: cmd.video,
      });
      const { data } = await apiJson({
        client,
        method: "POST",
        path: "/api/global-speakers",
        body,
        schema: CreateGlobalSpeakerResponseSchema,
      });

      if (opts.json) return void console.log(JSON.stringify(data, null, 2));
      console.log(`global speaker: ${data.global_speaker.id}  "${data.global_speaker.display_name}"`);
      console.log(`linked: ${data.link.speaker_id} -> ${data.link.global_speaker_id}`);
    } catch (err) {
      handleErr(err);
    }
  });

globalSpeakers
  .command("show <id>")
  .description("Show a global speaker with linked per-video speakers")
  .action(async (id: string) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });

      const { data } = await apiJson({
        client,
        method: "GET",
        path: `/api/global-speakers/${id}`,
        schema: GetGlobalSpeakerResponseSchema,
      });

      if (opts.json) return void console.log(JSON.stringify(data, null, 2));

      console.log(`${data.global_speaker.id}  "${data.global_speaker.display_name}"`);
      if (data.links.length === 0) {
        console.log("  No linked speakers.");
      } else {
        console.log("  Linked speakers:");
        for (const link of data.links) {
          const conf = link.confidence != null ? ` (${(link.confidence * 100).toFixed(0)}%)` : "";
          console.log(`    ${link.speaker_id}  source: ${link.source}${conf}`);
        }
      }
    } catch (err) {
      handleErr(err);
    }
  });

globalSpeakers
  .command("rename <id> <name>")
  .description("Update a global speaker's display name")
  .action(async (id: string, name: string) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });

      const body = UpdateGlobalSpeakerRequestSchema.parse({ display_name: name });
      const { data } = await apiJson({
        client,
        method: "PATCH",
        path: `/api/global-speakers/${id}`,
        body,
        schema: UpdateGlobalSpeakerResponseSchema,
      });

      if (opts.json) return void console.log(JSON.stringify(data, null, 2));
      console.log(`updated: ${data.global_speaker.id}  "${data.global_speaker.display_name}"`);
    } catch (err) {
      handleErr(err);
    }
  });

// ─── Config Commands ─────────────────────────────────────────────────────────

const config = program.command("config").description("LLM and provider configuration");

config
  .command("show")
  .description("Display the resolved LLM configuration")
  .action(async () => {
    try {
      const { resolveTextConfig } = await import("@yt/core");
      const opts = program.opts<{ json: boolean }>();
      const resolved = resolveTextConfig();

      if (opts.json) {
        console.log(JSON.stringify(resolved, null, 2));
        return;
      }

      console.log("Resolved LLM Configuration:\n");
      console.log(`  text_provider:       ${resolved.textProvider}`);
      console.log(`  text_model:          ${resolved.textModel}`);
      console.log(`  vision_provider:     ${resolved.visionProvider}`);
      console.log(`  vision_model:        ${resolved.visionModel}`);
      console.log(`  temperature:         ${resolved.temperature}`);
      console.log(`  max_tokens_per_call: ${resolved.maxTokensPerCall}`);
      console.log(`  prefer_local:        ${resolved.preferLocal}`);
      if (resolved.maxTotalTokens != null) console.log(`  max_total_tokens:    ${resolved.maxTotalTokens}`);
      if (resolved.maxCostUsd != null) console.log(`  max_cost_usd:        $${resolved.maxCostUsd}`);
    } catch (err) {
      handleErr(err);
    }
  });

config
  .command("providers")
  .description("List all available LLM providers with status")
  .action(async () => {
    try {
      const { detectAllProviders } = await import("@yt/core");
      const opts = program.opts<{ json: boolean }>();
      const providers = detectAllProviders();

      if (opts.json) {
        console.log(JSON.stringify(providers, null, 2));
        return;
      }

      console.log("Available LLM Providers:\n");
      for (const p of providers) {
        const status = p.available ? "available" : "not found";
        const cost = p.free ? "FREE" : "paid (API key)";
        const mark = p.available ? "+" : "-";
        const text = p.supportsText ? "text" : "";
        const vision = p.supportsVision ? "vision" : "";
        const caps = [text, vision].filter(Boolean).join("+") || "none";
        console.log(`  [${mark}] ${p.provider.padEnd(12)} ${p.type.padEnd(6)} ${cost.padEnd(16)} ${caps.padEnd(12)} ${status}`);
      }
    } catch (err) {
      handleErr(err);
    }
  });

const karaoke = program.command("karaoke").description("Karaoke sessions, queue, and scoring");
const karaokeTrack = karaoke.command("track").description("Karaoke track catalog");
const karaokeSession = karaoke.command("session").description("Karaoke sessions");
const karaokeQueue = karaoke.command("queue").description("Karaoke queue operations");
const karaokeRound = karaoke.command("round").description("Karaoke round operations");
const karaokeScore = karaoke.command("score").description("Karaoke scoring operations");
const karaokeLibrary = karaoke.command("library").description("Karaoke library bootstrap tools");
const karaokePlaylist = karaoke.command("playlist").description("Karaoke playlists");
const karaokeGuest = karaoke.command("guest").description("Karaoke guest join and moderation");

karaokeTrack
  .command("add")
  .description("Resolve a YouTube URL into a karaoke track")
  .requiredOption("--url <url>", "YouTube video URL")
  .option("--language <code>", "Language", "en")
  .action(async (cmd: { url: string; language: string }) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const body = KaraokeResolveTrackRequestSchema.parse({ url: cmd.url, language: cmd.language });
      const { data } = await apiJson({
        client,
        method: "POST",
        path: "/api/karaoke/tracks/resolve",
        body,
        schema: KaraokeResolveTrackResponseSchema,
      });
      if (opts.json) return void console.log(JSON.stringify(data, null, 2));
      console.log(`track: ${data.track.id}`);
      console.log(`video: ${data.video.provider_video_id}  state: ${data.track.ready_state}  cues: ${data.track.cue_count}`);
      if (data.ingest_job) console.log(`ingest_job: ${data.ingest_job.id}`);
    } catch (err) {
      handleErr(err);
    }
  });

karaokeTrack
  .command("list")
  .description("List karaoke tracks")
  .option("--q <query>", "Filter text")
  .option("--state <state>", "pending|ready|failed")
  .option("--language <code>", "Language filter")
  .option("--limit <n>", "Limit", "50")
  .option("--offset <n>", "Offset", "0")
  .option("--sort <sort>", "updated_desc|title_asc", "updated_desc")
  .action(
    async (cmd: { q?: string; state?: string; language?: string; limit: string; offset: string; sort: string }) => {
      try {
        const opts = program.opts<{ baseUrl?: string; json: boolean }>();
        const client = makeApiClient({ baseUrl: opts.baseUrl });
        const { data } = await apiJson({
          client,
          method: "GET",
          path: "/api/karaoke/tracks",
          query: {
            q: cmd.q,
            ready_state: cmd.state,
            language: cmd.language,
            limit: asInt(cmd.limit, 50),
            offset: asInt(cmd.offset, 0),
            sort: cmd.sort,
          },
          schema: ListKaraokeTracksResponseSchema,
        });
        if (opts.json) return void console.log(JSON.stringify(data, null, 2));
        printTable(
          data.tracks.map((t) => ({
            track_id: t.id,
            provider_video_id: t.provider_video_id,
            state: t.ready_state,
            cues: t.cue_count,
            title: truncate(t.title || "", 56),
          }))
        );
      } catch (err) {
        handleErr(err);
      }
    }
  );

karaokeTrack
  .command("get")
  .description("Get one karaoke track")
  .argument("<trackId>", "Track ID")
  .action(async (trackId: string) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const { data } = await apiJson({
        client,
        method: "GET",
        path: `/api/karaoke/tracks/${trackId}`,
        schema: GetKaraokeTrackResponseSchema,
      });
      if (opts.json) return void console.log(JSON.stringify(data, null, 2));
      console.log(`${data.track.id}  ${data.track.ready_state}  cues=${data.track.cue_count}  ${data.track.title || data.track.provider_video_id}`);
    } catch (err) {
      handleErr(err);
    }
  });

karaokeLibrary
  .command("stats")
  .description("Show karaoke library totals by readiness state")
  .action(async () => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const { data } = await apiJson({
        client,
        method: "GET",
        path: "/api/karaoke/library/stats",
        schema: KaraokeLibraryStatsResponseSchema,
      });
      if (opts.json) return void console.log(JSON.stringify(data, null, 2));
      printTable([
        {
          tracks_total: data.tracks_total,
          tracks_ready: data.tracks_ready,
          tracks_pending: data.tracks_pending,
          tracks_failed: data.tracks_failed,
          playlists_total: data.playlists_total,
          playlist_items_total: data.playlist_items_total,
        },
      ]);
    } catch (err) {
      handleErr(err);
    }
  });

karaokeLibrary
  .command("manifest-init")
  .description("Write a starter karaoke manifest JSON file")
  .option("--file <path>", "Output file path", "manifests/karaoke/library.local.json")
  .action(async (cmd: { file: string }) => {
    try {
      const manifest = KaraokeLibraryManifestSchema.parse({
        version: 1,
        language: "en",
        tracks: [{ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }],
        playlists: [
          {
            name: "Party Starters",
            description: "Warmup songs for local sessions",
            tracks: [{ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }],
          },
        ],
      });
      mkdirSync(dirname(cmd.file), { recursive: true });
      writeFileSync(cmd.file, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
      console.log(`wrote: ${cmd.file}`);
    } catch (err) {
      handleErr(err);
    }
  });

karaokeLibrary
  .command("manifest-validate")
  .description("Validate a karaoke manifest against contract schema")
  .requiredOption("--file <path>", "Manifest JSON file")
  .action(async (cmd: { file: string }) => {
    try {
      const manifest = KaraokeLibraryManifestSchema.parse(readJsonFile(cmd.file));
      const totalPlaylistTracks = manifest.playlists.reduce((sum, playlist) => sum + playlist.tracks.length, 0);
      const summary = {
        version: manifest.version,
        language: manifest.language,
        root_tracks: manifest.tracks.length,
        playlists: manifest.playlists.length,
        playlist_tracks: totalPlaylistTracks,
      };
      const opts = program.opts<{ json: boolean }>();
      if (opts.json) {
        console.log(JSON.stringify({ ok: true, summary }, null, 2));
      } else {
        console.log("manifest valid");
        printTable([summary]);
      }
    } catch (err) {
      handleErr(err);
    }
  });

karaokeLibrary
  .command("manifest-import")
  .description("Import a karaoke manifest into local tracks/playlists")
  .requiredOption("--file <path>", "Manifest JSON file")
  .action(async (cmd: { file: string }) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const manifest = KaraokeLibraryManifestSchema.parse(readJsonFile(cmd.file));
      const { data } = await apiJson({
        client,
        method: "POST",
        path: "/api/karaoke/library/import",
        body: { manifest },
        schema: KaraokeLibraryImportResponseSchema,
      });
      if (opts.json) return void console.log(JSON.stringify(data, null, 2));
      console.log(
        `imported tracks=${data.imported_track_count}, new_playlists=${data.imported_playlist_count}, playlist_items=${data.imported_playlist_item_count}`
      );
      if (data.failed.length) {
        printTable(data.failed.map((f) => ({ url: truncate(f.url, 72), reason: truncate(f.reason, 80) })));
      }
    } catch (err) {
      handleErr(err);
    }
  });

karaokeLibrary
  .command("bootstrap")
  .description("Seed a starter karaoke catalog and playlists via yt-dlp discovery")
  .option("--target <n>", "Target number of tracks", "1000")
  .option("--language <code>", "Track language", "en")
  .option("--pack <pack>", "Query pack (default|quick)", "default")
  .action(async (cmd: { target: string; language: string; pack: string }) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const body = BootstrapKaraokeLibraryRequestSchema.parse({
        target_count: asInt(cmd.target, 1000),
        language: cmd.language,
        query_pack: cmd.pack === "quick" ? "quick" : "default",
      });
      const { data } = await apiJson({
        client,
        method: "POST",
        path: "/api/karaoke/library/bootstrap",
        body,
        schema: BootstrapKaraokeLibraryResponseSchema,
      });
      if (opts.json) return void console.log(JSON.stringify(data, null, 2));
      console.log(`seeded tracks: ${data.seeded_track_count}/${data.target_count}`);
      if (data.playlists.length) {
        printTable(data.playlists.map((p) => ({ playlist: p.name, playlist_id: p.id, added: p.added_count })));
      }
    } catch (err) {
      handleErr(err);
    }
  });

karaoke
  .command("themes")
  .description("List built-in karaoke themes")
  .action(async () => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const { data } = await apiJson({
        client,
        method: "GET",
        path: "/api/karaoke/themes",
        schema: ListKaraokeThemesResponseSchema,
      });
      if (opts.json) return void console.log(JSON.stringify(data, null, 2));
      printTable(data.themes.map((t) => ({ id: t.id, name: t.name, class: t.class_name })));
    } catch (err) {
      handleErr(err);
    }
  });

karaokeSession
  .command("create")
  .description("Create a karaoke session")
  .requiredOption("--name <name>", "Session name")
  .option("--theme <id>", "Theme ID", "gold-stage")
  .option("--seed <ids>", "Comma-separated track IDs", "")
  .action(async (cmd: { name: string; theme: string; seed: string }) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const body = CreateKaraokeSessionRequestSchema.parse({
        name: cmd.name,
        theme_id: cmd.theme,
        seed_track_ids: parseCsvList(cmd.seed),
      });
      const { data } = await apiJson({
        client,
        method: "POST",
        path: "/api/karaoke/sessions",
        body,
        schema: CreateKaraokeSessionResponseSchema,
      });
      if (opts.json) return void console.log(JSON.stringify(data, null, 2));
      console.log(`session: ${data.session.id}  queue=${data.queue.length}`);
    } catch (err) {
      handleErr(err);
    }
  });

karaokeSession
  .command("show")
  .description("Get karaoke session state")
  .requiredOption("--id <sessionId>", "Session ID")
  .action(async (cmd: { id: string }) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const { data } = await apiJson({
        client,
        method: "GET",
        path: `/api/karaoke/sessions/${cmd.id}`,
        schema: GetKaraokeSessionResponseSchema,
      });
      if (opts.json) return void console.log(JSON.stringify(data, null, 2));
      console.log(`session: ${data.session.name} (${data.session.status}) theme=${data.session.theme_id}`);
      printTable(
        data.queue.map((q) => ({
          pos: q.position,
          item_id: q.id,
          track_id: q.track_id,
          requested_by: q.requested_by,
          status: q.status,
        }))
      );
    } catch (err) {
      handleErr(err);
    }
  });

karaokeSession
  .command("update")
  .description("Patch a karaoke session")
  .requiredOption("--id <sessionId>", "Session ID")
  .option("--name <name>", "Session name")
  .option("--status <status>", "draft|active|paused|completed")
  .option("--theme <id>", "Theme ID")
  .action(async (cmd: { id: string; name?: string; status?: string; theme?: string }) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const body = UpdateKaraokeSessionRequestSchema.parse({
        name: cmd.name,
        status: cmd.status,
        theme_id: cmd.theme,
      });
      const { data } = await apiJson({
        client,
        method: "PATCH",
        path: `/api/karaoke/sessions/${cmd.id}`,
        body,
        schema: UpdateKaraokeSessionResponseSchema,
      });
      if (opts.json) return void console.log(JSON.stringify(data, null, 2));
      console.log(`session: ${data.session.id}  status=${data.session.status}  theme=${data.session.theme_id}`);
    } catch (err) {
      handleErr(err);
    }
  });

karaokeQueue
  .command("add")
  .description("Add track to session queue")
  .requiredOption("--session <sessionId>", "Session ID")
  .requiredOption("--track <trackId>", "Track ID")
  .requiredOption("--player <name>", "Requested by")
  .action(async (cmd: { session: string; track: string; player: string }) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const body = AddKaraokeQueueItemRequestSchema.parse({ track_id: cmd.track, requested_by: cmd.player });
      const { data } = await apiJson({
        client,
        method: "POST",
        path: `/api/karaoke/sessions/${cmd.session}/queue`,
        body,
        schema: AddKaraokeQueueItemResponseSchema,
      });
      if (opts.json) return void console.log(JSON.stringify(data, null, 2));
      console.log(`item: ${data.item.id}  pos=${data.item.position}  status=${data.item.status}`);
    } catch (err) {
      handleErr(err);
    }
  });

karaokeQueue
  .command("move")
  .description("Move queue item position")
  .requiredOption("--session <sessionId>", "Session ID")
  .requiredOption("--item <itemId>", "Queue item ID")
  .requiredOption("--position <n>", "New position")
  .action(async (cmd: { session: string; item: string; position: string }) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const body = UpdateKaraokeQueueItemRequestSchema.parse({ action: "move", new_position: asInt(cmd.position, 0) });
      const { data } = await apiJson({
        client,
        method: "PATCH",
        path: `/api/karaoke/sessions/${cmd.session}/queue/${cmd.item}`,
        body,
        schema: UpdateKaraokeQueueItemResponseSchema,
      });
      if (opts.json) return void console.log(JSON.stringify(data, null, 2));
      console.log(`item: ${data.item.id}  pos=${data.item.position}`);
    } catch (err) {
      handleErr(err);
    }
  });

karaokeQueue
  .command("skip")
  .description("Skip a queue item")
  .requiredOption("--session <sessionId>", "Session ID")
  .requiredOption("--item <itemId>", "Queue item ID")
  .action(async (cmd: { session: string; item: string }) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const body = UpdateKaraokeQueueItemRequestSchema.parse({ action: "skip" });
      const { data } = await apiJson({
        client,
        method: "PATCH",
        path: `/api/karaoke/sessions/${cmd.session}/queue/${cmd.item}`,
        body,
        schema: UpdateKaraokeQueueItemResponseSchema,
      });
      if (opts.json) return void console.log(JSON.stringify(data, null, 2));
      console.log(`item: ${data.item.id}  status=${data.item.status}`);
    } catch (err) {
      handleErr(err);
    }
  });

karaokeQueue
  .command("complete")
  .description("Complete a queue item")
  .requiredOption("--session <sessionId>", "Session ID")
  .requiredOption("--item <itemId>", "Queue item ID")
  .action(async (cmd: { session: string; item: string }) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const body = UpdateKaraokeQueueItemRequestSchema.parse({ action: "complete" });
      const { data } = await apiJson({
        client,
        method: "PATCH",
        path: `/api/karaoke/sessions/${cmd.session}/queue/${cmd.item}`,
        body,
        schema: UpdateKaraokeQueueItemResponseSchema,
      });
      if (opts.json) return void console.log(JSON.stringify(data, null, 2));
      console.log(`item: ${data.item.id}  status=${data.item.status}`);
    } catch (err) {
      handleErr(err);
    }
  });

karaokeQueue
  .command("play-now")
  .description("Immediately start playing a queue item")
  .requiredOption("--session <sessionId>", "Session ID")
  .requiredOption("--item <itemId>", "Queue item ID")
  .action(async (cmd: { session: string; item: string }) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const body = UpdateKaraokeQueueItemRequestSchema.parse({ action: "play_now" });
      const { data } = await apiJson({
        client,
        method: "PATCH",
        path: `/api/karaoke/sessions/${cmd.session}/queue/${cmd.item}`,
        body,
        schema: UpdateKaraokeQueueItemResponseSchema,
      });
      if (opts.json) return void console.log(JSON.stringify(data, null, 2));
      console.log(`item: ${data.item.id}  status=${data.item.status}`);
    } catch (err) {
      handleErr(err);
    }
  });

karaokeRound
  .command("start")
  .description("Start round playback for a queue item")
  .requiredOption("--session <sessionId>", "Session ID")
  .requiredOption("--item <itemId>", "Queue item ID")
  .action(async (cmd: { session: string; item: string }) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const body = StartKaraokeRoundRequestSchema.parse({ queue_item_id: cmd.item });
      const { data } = await apiJson({
        client,
        method: "POST",
        path: `/api/karaoke/sessions/${cmd.session}/rounds/start`,
        body,
        schema: StartKaraokeRoundResponseSchema,
      });
      if (opts.json) return void console.log(JSON.stringify(data, null, 2));
      console.log(`item: ${data.item.id}  status=${data.item.status}`);
    } catch (err) {
      handleErr(err);
    }
  });

karaokeScore
  .command("add")
  .description("Record one karaoke score event")
  .requiredOption("--session <sessionId>", "Session ID")
  .requiredOption("--item <itemId>", "Queue item ID")
  .requiredOption("--player <name>", "Player name")
  .requiredOption("--cue <cueId>", "Cue ID")
  .requiredOption("--expected <ms>", "Expected timestamp (ms)")
  .requiredOption("--actual <ms>", "Actual timestamp (ms)")
  .action(
    async (cmd: { session: string; item: string; player: string; cue: string; expected: string; actual: string }) => {
      try {
        const opts = program.opts<{ baseUrl?: string; json: boolean }>();
        const client = makeApiClient({ baseUrl: opts.baseUrl });
        const body = RecordKaraokeScoreEventRequestSchema.parse({
          queue_item_id: cmd.item,
          player_name: cmd.player,
          cue_id: cmd.cue,
          expected_at_ms: asInt(cmd.expected, 0),
          actual_at_ms: asInt(cmd.actual, 0),
        });
        const { data } = await apiJson({
          client,
          method: "POST",
          path: `/api/karaoke/sessions/${cmd.session}/scores/events`,
          body,
          schema: RecordKaraokeScoreEventResponseSchema,
        });
        if (opts.json) return void console.log(JSON.stringify(data, null, 2));
        console.log(`event: ${data.event.id}  points=${data.event.awarded_points}  error_ms=${data.event.timing_error_ms}`);
      } catch (err) {
        handleErr(err);
      }
    }
  );

karaoke
  .command("leaderboard")
  .description("Get current session leaderboard")
  .requiredOption("--session <sessionId>", "Session ID")
  .action(async (cmd: { session: string }) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const { data } = await apiJson({
        client,
        method: "GET",
        path: `/api/karaoke/sessions/${cmd.session}/leaderboard`,
        schema: GetKaraokeLeaderboardResponseSchema,
      });
      if (opts.json) return void console.log(JSON.stringify(data, null, 2));
      printTable(
        data.entries.map((e) => ({
          player: e.player_name,
          points: e.total_points,
          rounds: e.rounds_played,
          avg_error_ms: e.avg_timing_error_ms,
          streak_best: e.streak_best,
        }))
      );
    } catch (err) {
      handleErr(err);
    }
  });

karaokePlaylist
  .command("create")
  .description("Create a karaoke playlist")
  .requiredOption("--name <name>", "Playlist name")
  .option("--description <text>", "Playlist description")
  .action(async (cmd: { name: string; description?: string }) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const body = CreateKaraokePlaylistRequestSchema.parse({ name: cmd.name, description: cmd.description });
      const { data } = await apiJson({
        client,
        method: "POST",
        path: "/api/karaoke/playlists",
        body,
        schema: CreateKaraokePlaylistResponseSchema,
      });
      if (opts.json) return void console.log(JSON.stringify(data, null, 2));
      console.log(`playlist: ${data.playlist.id}  ${data.playlist.name}`);
    } catch (err) {
      handleErr(err);
    }
  });

karaokePlaylist
  .command("list")
  .description("List karaoke playlists")
  .option("--limit <n>", "Limit", "50")
  .option("--offset <n>", "Offset", "0")
  .action(async (cmd: { limit: string; offset: string }) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const { data } = await apiJson({
        client,
        method: "GET",
        path: "/api/karaoke/playlists",
        query: { limit: asInt(cmd.limit, 50), offset: asInt(cmd.offset, 0) },
        schema: ListKaraokePlaylistsResponseSchema,
      });
      if (opts.json) return void console.log(JSON.stringify(data, null, 2));
      printTable(
        data.playlists.map((p) => ({
          id: p.id,
          name: p.name,
          description: truncate(p.description || "", 56),
          updated_at: p.updated_at,
        }))
      );
    } catch (err) {
      handleErr(err);
    }
  });

karaokePlaylist
  .command("show")
  .description("Get one playlist with items")
  .requiredOption("--id <playlistId>", "Playlist ID")
  .action(async (cmd: { id: string }) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const { data } = await apiJson({
        client,
        method: "GET",
        path: `/api/karaoke/playlists/${cmd.id}`,
        schema: GetKaraokePlaylistResponseSchema,
      });
      if (opts.json) return void console.log(JSON.stringify(data, null, 2));
      console.log(`playlist: ${data.playlist.name} (${data.playlist.id}) items=${data.items.length}`);
      printTable(
        data.items.map((i) => ({
          pos: i.position,
          item_id: i.id,
          track_id: i.track_id,
        }))
      );
    } catch (err) {
      handleErr(err);
    }
  });

karaokePlaylist
  .command("update")
  .description("Update playlist metadata")
  .requiredOption("--id <playlistId>", "Playlist ID")
  .option("--name <name>", "Playlist name")
  .option("--description <text>", "Playlist description")
  .option("--clear-description", "Clear description", false)
  .action(async (cmd: { id: string; name?: string; description?: string; clearDescription?: boolean }) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const body = UpdateKaraokePlaylistRequestSchema.parse({
        name: cmd.name,
        description: cmd.clearDescription ? null : cmd.description,
      });
      const { data } = await apiJson({
        client,
        method: "PATCH",
        path: `/api/karaoke/playlists/${cmd.id}`,
        body,
        schema: UpdateKaraokePlaylistResponseSchema,
      });
      if (opts.json) return void console.log(JSON.stringify(data, null, 2));
      console.log(`playlist: ${data.playlist.id}  ${data.playlist.name}`);
    } catch (err) {
      handleErr(err);
    }
  });

karaokePlaylist
  .command("delete")
  .description("Delete a playlist")
  .requiredOption("--id <playlistId>", "Playlist ID")
  .action(async (cmd: { id: string }) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const { data } = await apiJson({
        client,
        method: "DELETE",
        path: `/api/karaoke/playlists/${cmd.id}`,
        schema: DeleteKaraokePlaylistResponseSchema,
      });
      if (opts.json) return void console.log(JSON.stringify(data, null, 2));
      if (!data.ok) throw new Error("playlist delete failed");
      console.log(`deleted: ${cmd.id}`);
    } catch (err) {
      handleErr(err);
    }
  });

karaokePlaylist
  .command("add-item")
  .description("Add track to playlist")
  .requiredOption("--playlist <playlistId>", "Playlist ID")
  .requiredOption("--track <trackId>", "Track ID")
  .option("--position <n>", "Position")
  .action(async (cmd: { playlist: string; track: string; position?: string }) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const body = AddKaraokePlaylistItemRequestSchema.parse({
        track_id: cmd.track,
        position: cmd.position !== undefined ? asInt(cmd.position, 0) : undefined,
      });
      const { data } = await apiJson({
        client,
        method: "POST",
        path: `/api/karaoke/playlists/${cmd.playlist}/items`,
        body,
        schema: AddKaraokePlaylistItemResponseSchema,
      });
      if (opts.json) return void console.log(JSON.stringify(data, null, 2));
      console.log(`item: ${data.item.id}  pos=${data.item.position}`);
    } catch (err) {
      handleErr(err);
    }
  });

karaokePlaylist
  .command("move-item")
  .description("Move one playlist item")
  .requiredOption("--playlist <playlistId>", "Playlist ID")
  .requiredOption("--item <itemId>", "Playlist item ID")
  .requiredOption("--position <n>", "Position")
  .action(async (cmd: { playlist: string; item: string; position: string }) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const body = UpdateKaraokePlaylistItemRequestSchema.parse({ position: asInt(cmd.position, 0) });
      const { data } = await apiJson({
        client,
        method: "PATCH",
        path: `/api/karaoke/playlists/${cmd.playlist}/items/${cmd.item}`,
        body,
        schema: UpdateKaraokePlaylistItemResponseSchema,
      });
      if (opts.json) return void console.log(JSON.stringify(data, null, 2));
      console.log(`item: ${data.item.id}  pos=${data.item.position}  total=${data.items.length}`);
    } catch (err) {
      handleErr(err);
    }
  });

karaokePlaylist
  .command("remove-item")
  .description("Remove one playlist item")
  .requiredOption("--playlist <playlistId>", "Playlist ID")
  .requiredOption("--item <itemId>", "Playlist item ID")
  .action(async (cmd: { playlist: string; item: string }) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const { data } = await apiJson({
        client,
        method: "DELETE",
        path: `/api/karaoke/playlists/${cmd.playlist}/items/${cmd.item}`,
        schema: DeleteKaraokePlaylistItemResponseSchema,
      });
      if (opts.json) return void console.log(JSON.stringify(data, null, 2));
      console.log(`removed: ${cmd.item}  remaining=${data.items.length}`);
    } catch (err) {
      handleErr(err);
    }
  });

karaokePlaylist
  .command("queue")
  .description("Queue all tracks from a playlist into a session")
  .requiredOption("--session <sessionId>", "Session ID")
  .requiredOption("--playlist <playlistId>", "Playlist ID")
  .option("--requested-by <name>", "Requested-by label", "playlist")
  .action(async (cmd: { session: string; playlist: string; requestedBy: string }) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const body = QueueFromKaraokePlaylistRequestSchema.parse({
        playlist_id: cmd.playlist,
        requested_by: cmd.requestedBy,
      });
      const { data } = await apiJson({
        client,
        method: "POST",
        path: `/api/karaoke/sessions/${cmd.session}/queue/from-playlist`,
        body,
        schema: QueueFromKaraokePlaylistResponseSchema,
      });
      if (opts.json) return void console.log(JSON.stringify(data, null, 2));
      console.log(`queued: ${data.added.length} tracks`);
    } catch (err) {
      handleErr(err);
    }
  });

karaokeGuest
  .command("token")
  .description("Create a guest join token for a session")
  .requiredOption("--session <sessionId>", "Session ID")
  .option("--ttl <minutes>", "TTL in minutes", "240")
  .action(async (cmd: { session: string; ttl: string }) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const body = CreateKaraokeGuestTokenRequestSchema.parse({ ttl_minutes: asInt(cmd.ttl, 240) });
      const { data } = await apiJson({
        client,
        method: "POST",
        path: `/api/karaoke/sessions/${cmd.session}/guest-token`,
        body,
        schema: CreateKaraokeGuestTokenResponseSchema,
      });
      if (opts.json) return void console.log(JSON.stringify(data, null, 2));
      console.log(`token: ${data.token}`);
      console.log(`join_path: ${data.join_path}`);
      console.log(`expires_at: ${data.expires_at}`);
    } catch (err) {
      handleErr(err);
    }
  });

karaokeGuest
  .command("request-add")
  .description("Submit one guest song request via join token")
  .requiredOption("--token <token>", "Guest token")
  .requiredOption("--track <trackId>", "Track ID")
  .requiredOption("--name <guestName>", "Guest name")
  .action(async (cmd: { token: string; track: string; name: string }) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const body = CreateKaraokeGuestRequestRequestSchema.parse({ track_id: cmd.track, guest_name: cmd.name });
      const { data } = await apiJson({
        client,
        method: "POST",
        path: `/api/karaoke/join/${cmd.token}/requests`,
        body,
        schema: CreateKaraokeGuestRequestResponseSchema,
      });
      if (opts.json) return void console.log(JSON.stringify(data, null, 2));
      console.log(`request: ${data.request.id}  status=${data.request.status}`);
    } catch (err) {
      handleErr(err);
    }
  });

karaokeGuest
  .command("request-list")
  .description("List guest requests for a session")
  .requiredOption("--session <sessionId>", "Session ID")
  .action(async (cmd: { session: string }) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const { data } = await apiJson({
        client,
        method: "GET",
        path: `/api/karaoke/sessions/${cmd.session}/guest-requests`,
        schema: ListKaraokeGuestRequestsResponseSchema,
      });
      if (opts.json) return void console.log(JSON.stringify(data, null, 2));
      printTable(
        data.requests.map((r) => ({
          id: r.id,
          guest: r.guest_name,
          track_id: r.track_id,
          status: r.status,
          created_at: r.created_at,
        }))
      );
    } catch (err) {
      handleErr(err);
    }
  });

karaokeGuest
  .command("request-handle")
  .description("Approve or reject a guest request")
  .requiredOption("--session <sessionId>", "Session ID")
  .requiredOption("--request <requestId>", "Guest request ID")
  .requiredOption("--action <action>", "approve|reject")
  .option("--requested-by <name>", "Requested-by label when approving", "guest")
  .action(async (cmd: { session: string; request: string; action: string; requestedBy: string }) => {
    try {
      const opts = program.opts<{ baseUrl?: string; json: boolean }>();
      const client = makeApiClient({ baseUrl: opts.baseUrl });
      const body = UpdateKaraokeGuestRequestRequestSchema.parse({
        action: cmd.action,
        requested_by: cmd.requestedBy,
      });
      const { data } = await apiJson({
        client,
        method: "PATCH",
        path: `/api/karaoke/sessions/${cmd.session}/guest-requests/${cmd.request}`,
        body,
        schema: UpdateKaraokeGuestRequestResponseSchema,
      });
      if (opts.json) return void console.log(JSON.stringify(data, null, 2));
      const queued = data.queue_item ? ` queue_item=${data.queue_item.id}` : "";
      console.log(`request: ${data.request.id}  status=${data.request.status}${queued}`);
    } catch (err) {
      handleErr(err);
    }
  });

program.parseAsync(process.argv).catch(handleErr);
