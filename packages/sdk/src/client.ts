import {
  ApiErrorSchema,
  CapabilitiesResponseSchema,
  CreateKaraokeSessionRequestSchema,
  CreateKaraokeSessionResponseSchema,
  ChatRequestSchema,
  ChatResponseSchema,
  ChatStreamEventSchema,
  CreatePolicyRequestSchema,
  CreatePolicyResponseSchema,
  FeedJsonResponseSchema,
  GetKaraokeLeaderboardResponseSchema,
  GetKaraokeSessionResponseSchema,
  GetKaraokeTrackResponseSchema,
  GetChatTurnResponseSchema,
  GetContextResponseSchema,
  GetJobResponseSchema,
  GetPolicyResponseSchema,
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
  ListPoliciesResponseSchema,
  ListPolicyHitsResponseSchema,
  ListPolicyRunsResponseSchema,
  ListSpeakerSegmentsResponseSchema,
  ListTranscriptsResponseSchema,
  ListVideoChaptersResponseSchema,
  ListVideoSpeakersResponseSchema,
  ListVideoTagsResponseSchema,
  JobStreamEventSchema,
  KaraokeResolveTrackRequestSchema,
  KaraokeResolveTrackResponseSchema,
  ResolveVideoRequestSchema,
  ResolveVideoResponseSchema,
  ListKaraokeThemesResponseSchema,
  ListKaraokeTracksResponseSchema,
  RunPolicyRequestSchema,
  RunPolicyResponseSchema,
  SearchRequestSchema,
  SearchResponseSchema,
  SettingsOpenAIResponseSchema,
  AddKaraokeQueueItemRequestSchema,
  AddKaraokeQueueItemResponseSchema,
  RecordKaraokeScoreEventRequestSchema,
  RecordKaraokeScoreEventResponseSchema,
  StartKaraokeRoundRequestSchema,
  StartKaraokeRoundResponseSchema,
  UpdatePolicyRequestSchema,
  UpdatePolicyResponseSchema,
  UpdateKaraokeQueueItemRequestSchema,
  UpdateKaraokeQueueItemResponseSchema,
  UpdateKaraokeSessionRequestSchema,
  UpdateKaraokeSessionResponseSchema,
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
  GetFrameAnalysisResponseSchema,
  GetActionTranscriptResponseSchema,
  ListFrameChunksResponseSchema,
  CostEstimateSchema,
  GetNarrativeSynthesisResponseSchema,
  BuildDenseTranscriptRequestSchema,
  BuildDenseTranscriptResponseSchema,
  GetDenseTranscriptResponseSchema,
  DetectAutoChaptersRequestSchema,
  DetectAutoChaptersResponseSchema,
  GetAutoChaptersResponseSchema,
  ListFaceIdentitiesResponseSchema,
  UpdateFaceIdentityRequestSchema,
  UpdateFaceIdentityResponseSchema,
  ListFaceAppearancesResponseSchema,
  ListFaceDetectionsResponseSchema,
  MatchSpeakerResponseSchema,
  ListGlobalSpeakersResponseSchema,
  CreateGlobalSpeakerRequestSchema,
  CreateGlobalSpeakerResponseSchema,
  GetGlobalSpeakerResponseSchema,
  UpdateGlobalSpeakerRequestSchema,
  UpdateGlobalSpeakerResponseSchema,
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
    listPolicies: (opts?: { limit?: number; offset?: number }) =>
      getJson("/api/policies", ListPoliciesResponseSchema, opts),
    createPolicy: (req: unknown) =>
      sendJson("POST", "/api/policies", CreatePolicyRequestSchema.parse(req), CreatePolicyResponseSchema),
    getPolicy: (policyId: string) => getJson(`/api/policies/${policyId}`, GetPolicyResponseSchema),
    updatePolicy: (policyId: string, req: unknown) =>
      sendJson("PATCH", `/api/policies/${policyId}`, UpdatePolicyRequestSchema.parse(req), UpdatePolicyResponseSchema),
    runPolicy: (policyId: string, req?: unknown) =>
      sendJson("POST", `/api/policies/${policyId}/run`, RunPolicyRequestSchema.parse(req ?? {}), RunPolicyResponseSchema),
    listPolicyRuns: (policyId: string, opts?: { limit?: number; offset?: number }) =>
      getJson(`/api/policies/${policyId}/runs`, ListPolicyRunsResponseSchema, opts),
    listPolicyHits: (
      policyId: string,
      opts?: { run_id?: string; bucket?: "high" | "medium" | "low"; limit?: number; offset?: number },
    ) => getJson(`/api/policies/${policyId}/hits`, ListPolicyHitsResponseSchema, opts),
    getPolicyFeedJson: (policyId: string, token: string) =>
      getJson(`/api/feeds/${policyId}.json`, FeedJsonResponseSchema, { token }),
    getPolicyFeedRss: (policyId: string, token: string) =>
      getText(`/api/feeds/${policyId}.rss`, { token }),

    karaokeResolveTrack: (req: unknown) =>
      sendJson("POST", "/api/karaoke/tracks/resolve", KaraokeResolveTrackRequestSchema.parse(req), KaraokeResolveTrackResponseSchema),
    listKaraokeTracks: (opts?: {
      q?: string;
      language?: string;
      ready_state?: "pending" | "ready" | "failed";
      limit?: number;
      offset?: number;
      sort?: "updated_desc" | "title_asc";
    }) => getJson("/api/karaoke/tracks", ListKaraokeTracksResponseSchema, opts),
    getKaraokeTrack: (trackId: string) => getJson(`/api/karaoke/tracks/${trackId}`, GetKaraokeTrackResponseSchema),
    createKaraokeSession: (req: unknown) =>
      sendJson("POST", "/api/karaoke/sessions", CreateKaraokeSessionRequestSchema.parse(req), CreateKaraokeSessionResponseSchema),
    getKaraokeSession: (sessionId: string) =>
      getJson(`/api/karaoke/sessions/${sessionId}`, GetKaraokeSessionResponseSchema),
    updateKaraokeSession: (sessionId: string, req: unknown) =>
      sendJson("PATCH", `/api/karaoke/sessions/${sessionId}`, UpdateKaraokeSessionRequestSchema.parse(req), UpdateKaraokeSessionResponseSchema),
    addKaraokeQueueItem: (sessionId: string, req: unknown) =>
      sendJson("POST", `/api/karaoke/sessions/${sessionId}/queue`, AddKaraokeQueueItemRequestSchema.parse(req), AddKaraokeQueueItemResponseSchema),
    updateKaraokeQueueItem: (sessionId: string, itemId: string, req: unknown) =>
      sendJson("PATCH", `/api/karaoke/sessions/${sessionId}/queue/${itemId}`, UpdateKaraokeQueueItemRequestSchema.parse(req), UpdateKaraokeQueueItemResponseSchema),
    startKaraokeRound: (sessionId: string, req: unknown) =>
      sendJson("POST", `/api/karaoke/sessions/${sessionId}/rounds/start`, StartKaraokeRoundRequestSchema.parse(req), StartKaraokeRoundResponseSchema),
    recordKaraokeScoreEvent: (sessionId: string, req: unknown) =>
      sendJson(
        "POST",
        `/api/karaoke/sessions/${sessionId}/scores/events`,
        RecordKaraokeScoreEventRequestSchema.parse(req),
        RecordKaraokeScoreEventResponseSchema
      ),
    getKaraokeLeaderboard: (sessionId: string) =>
      getJson(`/api/karaoke/sessions/${sessionId}/leaderboard`, GetKaraokeLeaderboardResponseSchema),
    listKaraokeThemes: () => getJson("/api/karaoke/themes", ListKaraokeThemesResponseSchema),

    youtubeSearch: (req: unknown) =>
      sendJson("POST", "/api/youtube/search", YouTubeSearchRequestSchema.parse(req), YouTubeSearchResponseSchema),
    youtubeChannelUploads: (req: unknown) =>
      sendJson("POST", "/api/youtube/channel/uploads", YouTubeChannelUploadsRequestSchema.parse(req), YouTubeChannelUploadsResponseSchema),
    youtubePlaylistItems: (req: unknown) =>
      sendJson("POST", "/api/youtube/playlist/items", YouTubePlaylistItemsRequestSchema.parse(req), YouTubePlaylistItemsResponseSchema),

    // Visual Intelligence
    ingestVisual: (videoId: string, req: unknown) =>
      sendJson("POST", `/api/videos/${videoId}/visual/ingest`, IngestVisualRequestSchema.parse(req), IngestVisualResponseSchema),
    getVisualStatus: (videoId: string) =>
      getJson(`/api/videos/${videoId}/visual/status`, GetVisualStatusResponseSchema),
    listFrames: (videoId: string, opts?: { limit?: number; offset?: number }) =>
      getJson(`/api/videos/${videoId}/frames`, ListFramesResponseSchema, opts),
    getFrameAnalysis: (videoId: string, frameId: string) =>
      getJson(`/api/videos/${videoId}/frames/${frameId}`, GetFrameAnalysisResponseSchema),
    getActionTranscript: (videoId: string) =>
      getJson(`/api/videos/${videoId}/visual/transcript`, GetActionTranscriptResponseSchema),
    getFrameChunks: (videoId: string) =>
      getJson(`/api/videos/${videoId}/visual/chunks`, ListFrameChunksResponseSchema),
    estimateCost: (videoId: string, opts?: { provider?: string; model?: string; maxFrames?: number }) => {
      const q = new URLSearchParams();
      if (opts?.provider) q.set("provider", opts.provider);
      if (opts?.model) q.set("model", opts.model);
      if (opts?.maxFrames) q.set("maxFrames", String(opts.maxFrames));
      const qs = q.toString() ? `?${q}` : "";
      return getJson(`/api/videos/${videoId}/visual/estimate${qs}`, CostEstimateSchema);
    },
    getNarrative: (videoId: string) =>
      getJson(`/api/videos/${videoId}/visual/narrative`, GetNarrativeSynthesisResponseSchema),

    // Dense Action Transcript
    getDenseTranscript: (videoId: string) =>
      getJson(`/api/videos/${videoId}/visual/dense-transcript`, GetDenseTranscriptResponseSchema),
    buildDenseTranscript: (videoId: string, req?: unknown) =>
      sendJson("POST", `/api/videos/${videoId}/visual/dense-transcript`, BuildDenseTranscriptRequestSchema.parse(req ?? {}), BuildDenseTranscriptResponseSchema),

    // Auto-Chapters + Marks
    getAutoChapters: (videoId: string) =>
      getJson(`/api/videos/${videoId}/auto-chapters`, GetAutoChaptersResponseSchema),
    detectAutoChapters: (videoId: string, req?: unknown) =>
      sendJson("POST", `/api/videos/${videoId}/auto-chapters`, DetectAutoChaptersRequestSchema.parse(req ?? {}), DetectAutoChaptersResponseSchema),
    listSignificantMarks: (videoId: string, opts?: { type?: string }) =>
      getJson(`/api/videos/${videoId}/marks`, GetAutoChaptersResponseSchema, opts),

    // Face Indexing
    listFaceIdentities: (videoId: string) =>
      getJson(`/api/videos/${videoId}/faces`, ListFaceIdentitiesResponseSchema),
    updateFaceIdentity: (videoId: string, identityId: string, req: unknown) =>
      sendJson("PATCH", `/api/videos/${videoId}/faces/${identityId}`, UpdateFaceIdentityRequestSchema.parse(req), UpdateFaceIdentityResponseSchema),
    listFaceAppearances: (videoId: string, identityId: string) =>
      getJson(`/api/videos/${videoId}/faces/${identityId}/appearances`, ListFaceAppearancesResponseSchema),
    listFaceDetections: (videoId: string, opts?: { identityId?: string }) =>
      getJson(`/api/videos/${videoId}/faces/${opts?.identityId ?? "_"}/detections`, ListFaceDetectionsResponseSchema),

    // Voice Fingerprinting
    matchSpeaker: (videoId: string, speakerId: string) =>
      sendJson("POST", `/api/videos/${videoId}/speakers/${speakerId}/match`, {}, MatchSpeakerResponseSchema),

    // Global Speakers
    listGlobalSpeakers: () =>
      getJson("/api/global-speakers", ListGlobalSpeakersResponseSchema),
    createGlobalSpeaker: (req: unknown) =>
      sendJson("POST", "/api/global-speakers", CreateGlobalSpeakerRequestSchema.parse(req), CreateGlobalSpeakerResponseSchema),
    getGlobalSpeaker: (id: string) =>
      getJson(`/api/global-speakers/${id}`, GetGlobalSpeakerResponseSchema),
    updateGlobalSpeaker: (id: string, req: unknown) =>
      sendJson("PATCH", `/api/global-speakers/${id}`, UpdateGlobalSpeakerRequestSchema.parse(req), UpdateGlobalSpeakerResponseSchema),
  };
}
