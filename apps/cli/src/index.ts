#!/usr/bin/env node
import { Command } from "commander";
import {
  ChatRequestSchema,
  ChatResponseSchema,
  CapabilitiesResponseSchema,
  GetContextResponseSchema,
  GetJobResponseSchema,
  GetVideoResponseSchema,
  IngestVideoRequestSchema,
  IngestVideoResponseSchema,
  LibrarySearchRequestSchema,
  LibrarySearchResponseSchema,
  ListChatTurnsResponseSchema,
  ListCuesResponseSchema,
  ListEntitiesResponseSchema,
  ListEntityMentionsResponseSchema,
  ListJobLogsResponseSchema,
	  ListLibraryVideosResponseSchema,
    ListLibraryChannelsResponseSchema,
    ListLibraryTopicsResponseSchema,
    ListLibraryPeopleResponseSchema,
	  ListSpeakerSegmentsResponseSchema,
	  ListVideoChaptersResponseSchema,
	  ListVideoSpeakersResponseSchema,
	  ListVideoTagsResponseSchema,
	  ListTranscriptsResponseSchema,
	  ResolveVideoRequestSchema,
	  ResolveVideoResponseSchema,
	  SearchRequestSchema,
	  SearchResponseSchema,
	  UpdateVideoSpeakerRequestSchema,
	  UpdateVideoSpeakerResponseSchema,
    YouTubeSearchRequestSchema,
    YouTubeSearchResponseSchema,
    YouTubeChannelUploadsRequestSchema,
    YouTubeChannelUploadsResponseSchema,
    YouTubePlaylistItemsRequestSchema,
    YouTubePlaylistItemsResponseSchema,
} from "@yt/contracts";
import { apiJson, apiText, HttpError, makeApiClient } from "./http.js";
import { formatMs, printTable, truncate } from "./format.js";
import { readSse } from "./sse.js";
import { writeFileSync } from "node:fs";

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

function parseCsvList(input: string | undefined): string[] {
  if (!input) return [];
  return input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
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

program.parseAsync(process.argv).catch(handleErr);
