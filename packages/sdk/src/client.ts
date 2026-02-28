import {
  ApiErrorSchema,
  CapabilitiesResponseSchema,
  ChatRequestSchema,
  ChatResponseSchema,
  ChatStreamEventSchema,
  GetChatTurnResponseSchema,
  GetContextResponseSchema,
  GetJobResponseSchema,
  GetVideoResponseSchema,
  HealthResponseSchema,
  IngestVideoRequestSchema,
  IngestVideoResponseSchema,
  LibraryHealthResponseSchema,
  LibraryRepairRequestSchema,
  LibraryRepairResponseSchema,
  LibrarySearchRequestSchema,
  LibrarySearchResponseSchema,
  ListChatTurnsResponseSchema,
  ListCuesResponseSchema,
  ListEntitiesResponseSchema,
  ListEntityMentionsResponseSchema,
  ListJobLogsResponseSchema,
  ListLibraryChannelsResponseSchema,
  ListLibraryPeopleResponseSchema,
  ListLibraryTopicsResponseSchema,
  ListLibraryVideosResponseSchema,
  ListSpeakerSegmentsResponseSchema,
  ListTranscriptsResponseSchema,
  ListVideoChaptersResponseSchema,
  ListVideoSpeakersResponseSchema,
  ListVideoTagsResponseSchema,
  JobStreamEventSchema,
  ResolveVideoRequestSchema,
  ResolveVideoResponseSchema,
  SearchRequestSchema,
  SearchResponseSchema,
  SettingsOpenAIResponseSchema,
  UpdateVideoSpeakerRequestSchema,
  UpdateVideoSpeakerResponseSchema,
  YouTubeChannelUploadsRequestSchema,
  YouTubeChannelUploadsResponseSchema,
  YouTubePlaylistItemsRequestSchema,
  YouTubePlaylistItemsResponseSchema,
  YouTubeSearchRequestSchema,
  YouTubeSearchResponseSchema,
} from "@yt/contracts";
import type { z } from "zod";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class YitApiError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(opts: { code: string; message: string; status: number; details?: unknown }) {
    super(opts.message);
    this.name = "YitApiError";
    this.code = opts.code;
    this.status = opts.status;
    this.details = opts.details;
  }
}

function cleanBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) throw new Error("baseUrl is required");
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function joinPath(baseUrl: string, path: string): string {
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

function withQuery(path: string, query?: Record<string, string | number | boolean | null | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(query || {})) {
    if (v === undefined || v === null) continue;
    sp.set(k, String(v));
  }
  const qs = sp.toString();
  return qs ? `${path}?${qs}` : path;
}

function mergeHeaders(base?: HeadersInit, extra?: HeadersInit): Headers {
  const headers = new Headers(base);
  if (extra) {
    const next = new Headers(extra);
    next.forEach((v, k) => headers.set(k, v));
  }
  return headers;
}

async function readError(res: Response): Promise<never> {
  const txt = await res.text().catch(() => "");
  try {
    const parsed = ApiErrorSchema.parse(JSON.parse(txt));
    throw new YitApiError({
      code: parsed.error.code,
      message: parsed.error.message,
      status: res.status,
      details: parsed.error.details,
    });
  } catch (err) {
    if (err instanceof YitApiError) throw err;
  }
  throw new YitApiError({ code: "http_error", message: txt || `HTTP ${res.status}`, status: res.status });
}

function parseSseBuffer(buffer: string): { events: unknown[]; rest: string } {
  const events: unknown[] = [];
  let rest = buffer;
  while (true) {
    const sep = rest.indexOf("\n\n");
    if (sep === -1) break;
    const raw = rest.slice(0, sep);
    rest = rest.slice(sep + 2);
    const lines = raw.split("\n");
    const dataLines = lines.filter((line) => line.startsWith("data:"));
    if (!dataLines.length) continue;
    const payload = dataLines.map((line) => line.slice(5).trimStart()).join("\n");
    try {
      events.push(JSON.parse(payload));
    } catch {
      // Ignore non-JSON frames.
    }
  }
  return { events, rest };
}

export type YitClient = ReturnType<typeof createYitClient>;

export function createYitClient(opts: { baseUrl: string; fetch?: FetchLike; headers?: HeadersInit }) {
  const baseUrl = cleanBaseUrl(opts.baseUrl);
  const f: FetchLike = opts.fetch ?? fetch;
  const defaultHeaders = new Headers(opts.headers);

  async function request(path: string, init?: RequestInit): Promise<Response> {
    const headers = mergeHeaders(defaultHeaders, init?.headers);
    return f(joinPath(baseUrl, path), { ...init, headers });
  }

  async function getJson<T>(path: string, schema: z.ZodType<T>, query?: Record<string, string | number | boolean | null | undefined>): Promise<T> {
    const res = await request(withQuery(path, query), {
      method: "GET",
      headers: { accept: "application/json" },
    });
    if (!res.ok) return readError(res);
    return schema.parse(await res.json());
  }

  async function getText(path: string, query?: Record<string, string | number | boolean | null | undefined>): Promise<string> {
    const res = await request(withQuery(path, query), {
      method: "GET",
      headers: { accept: "text/plain, text/vtt, */*" },
    });
    if (!res.ok) return readError(res);
    return res.text();
  }

  async function sendJson<T>(
    method: "POST" | "PATCH",
    path: string,
    body: unknown,
    schema: z.ZodType<T>,
  ): Promise<T> {
    const res = await request(path, {
      method,
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return readError(res);
    return schema.parse(await res.json());
  }

  async function* streamSse<TSchema extends z.ZodTypeAny>(opts: {
    path: string;
    schema: TSchema;
    method?: "GET" | "POST";
    query?: Record<string, string | number | boolean | null | undefined>;
    body?: unknown;
    signal?: AbortSignal;
  }): AsyncGenerator<z.infer<TSchema>, void, void> {
    const path = withQuery(opts.path, opts.query);
    const res = await request(path, {
      method: opts.method ?? "GET",
      signal: opts.signal,
      headers:
        opts.method === "POST"
          ? { accept: "text/event-stream", "content-type": "application/json" }
          : { accept: "text/event-stream" },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    if (!res.ok || !res.body) return readError(res);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parsed = parseSseBuffer(buf);
      buf = parsed.rest;
      for (const event of parsed.events) {
        const out = opts.schema.safeParse(event);
        if (!out.success) continue;
        yield out.data;
      }
    }
  }

  return {
    health: () => getJson("/api/health", HealthResponseSchema),
    metricsText: () => getText("/api/metrics"),
    capabilities: () => getJson("/api/capabilities", CapabilitiesResponseSchema),
    settingsOpenAI: () => getJson("/api/settings/openai", SettingsOpenAIResponseSchema),

    resolveVideo: (req: unknown) => sendJson("POST", "/api/videos/resolve", ResolveVideoRequestSchema.parse(req), ResolveVideoResponseSchema),
    getVideo: (videoId: string) => getJson(`/api/videos/${videoId}`, GetVideoResponseSchema),
    listLibraryVideos: (opts?: { limit?: number; offset?: number }) => getJson("/api/videos", ListLibraryVideosResponseSchema, opts),
    ingestVideo: (videoId: string, req: unknown) =>
      sendJson("POST", `/api/videos/${videoId}/ingest`, IngestVideoRequestSchema.parse(req), IngestVideoResponseSchema),

    getJob: (jobId: string) => getJson(`/api/jobs/${jobId}`, GetJobResponseSchema),
    listJobLogs: (jobId: string, opts?: { limit?: number }) => getJson(`/api/jobs/${jobId}/logs`, ListJobLogsResponseSchema, opts),
    streamJob: (jobId: string, opts?: { cursor_ts?: string; cursor_id?: string; signal?: AbortSignal }) =>
      streamSse({
        path: `/api/jobs/${jobId}/stream`,
        schema: JobStreamEventSchema,
        query: { cursor_ts: opts?.cursor_ts, cursor_id: opts?.cursor_id },
        signal: opts?.signal,
      }),

    listTranscripts: (videoId: string) => getJson(`/api/videos/${videoId}/transcripts`, ListTranscriptsResponseSchema),
    listCues: (transcriptId: string, opts?: { cursor?: number; limit?: number }) =>
      getJson(`/api/transcripts/${transcriptId}/cues`, ListCuesResponseSchema, opts),
    exportTranscript: (transcriptId: string, format: "txt" | "vtt" = "txt") =>
      getText(`/api/transcripts/${transcriptId}/export`, { format }),

    searchVideo: (videoId: string, req: unknown) =>
      sendJson("POST", `/api/videos/${videoId}/search`, SearchRequestSchema.parse(req), SearchResponseSchema),
    searchLibrary: (req: unknown) => sendJson("POST", "/api/search", LibrarySearchRequestSchema.parse(req), LibrarySearchResponseSchema),

    listEntities: (videoId: string, opts?: { at_ms?: number; window_ms?: number }) =>
      getJson(`/api/videos/${videoId}/entities`, ListEntitiesResponseSchema, opts),
    listEntityMentions: (videoId: string, entityId: string, opts?: { limit?: number }) =>
      getJson(`/api/videos/${videoId}/entities/${entityId}/mentions`, ListEntityMentionsResponseSchema, opts),
    listContext: (videoId: string, opts?: { at_ms?: number; window_ms?: number }) =>
      getJson(`/api/videos/${videoId}/context`, GetContextResponseSchema, opts),

    listVideoTags: (videoId: string) => getJson(`/api/videos/${videoId}/tags`, ListVideoTagsResponseSchema),
    listVideoChapters: (videoId: string, opts?: { transcript_id?: string }) =>
      getJson(`/api/videos/${videoId}/chapters`, ListVideoChaptersResponseSchema, opts),
    listVideoSpeakers: (videoId: string) => getJson(`/api/videos/${videoId}/speakers`, ListVideoSpeakersResponseSchema),
    listSpeakerSegments: (videoId: string, opts?: { transcript_id?: string; limit?: number }) =>
      getJson(`/api/videos/${videoId}/speakers/segments`, ListSpeakerSegmentsResponseSchema, opts),
    updateVideoSpeaker: (videoId: string, speakerId: string, req: unknown) =>
      sendJson("PATCH", `/api/videos/${videoId}/speakers/${speakerId}`, UpdateVideoSpeakerRequestSchema.parse(req), UpdateVideoSpeakerResponseSchema),

    chat: (videoId: string, req: unknown) =>
      sendJson("POST", `/api/videos/${videoId}/chat`, ChatRequestSchema.parse(req), ChatResponseSchema),
    streamChat: (videoId: string, req: unknown, opts?: { signal?: AbortSignal }) =>
      streamSse({
        path: `/api/videos/${videoId}/chat/stream`,
        method: "POST",
        schema: ChatStreamEventSchema,
        body: ChatRequestSchema.parse(req),
        signal: opts?.signal,
      }),
    listChatTurns: (videoId: string, opts?: { limit?: number }) =>
      getJson(`/api/videos/${videoId}/chat/turns`, ListChatTurnsResponseSchema, opts),
    getChatTurn: (turnId: string) => getJson(`/api/chat/turns/${turnId}`, GetChatTurnResponseSchema),

    listLibraryChannels: (opts?: { limit?: number }) => getJson("/api/library/channels", ListLibraryChannelsResponseSchema, opts),
    listLibraryTopics: (opts?: { limit?: number }) => getJson("/api/library/topics", ListLibraryTopicsResponseSchema, opts),
    listLibraryPeople: (opts?: { limit?: number }) => getJson("/api/library/people", ListLibraryPeopleResponseSchema, opts),
    libraryHealth: (opts?: { limit?: number; offset?: number }) => getJson("/api/library/health", LibraryHealthResponseSchema, opts),
    libraryRepair: (req: unknown) => sendJson("POST", "/api/library/repair", LibraryRepairRequestSchema.parse(req), LibraryRepairResponseSchema),

    youtubeSearch: (req: unknown) =>
      sendJson("POST", "/api/youtube/search", YouTubeSearchRequestSchema.parse(req), YouTubeSearchResponseSchema),
    youtubeChannelUploads: (req: unknown) =>
      sendJson("POST", "/api/youtube/channel/uploads", YouTubeChannelUploadsRequestSchema.parse(req), YouTubeChannelUploadsResponseSchema),
    youtubePlaylistItems: (req: unknown) =>
      sendJson("POST", "/api/youtube/playlist/items", YouTubePlaylistItemsRequestSchema.parse(req), YouTubePlaylistItemsResponseSchema),
  };
}
