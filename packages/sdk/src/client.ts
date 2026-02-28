import {
  ApiErrorSchema,
  CapabilitiesResponseSchema,
  ChatRequestSchema,
  ChatResponseSchema,
  GetJobResponseSchema,
  GetVideoResponseSchema,
  IngestVideoRequestSchema,
  IngestVideoResponseSchema,
  LibraryHealthResponseSchema,
  LibraryRepairRequestSchema,
  LibraryRepairResponseSchema,
  LibrarySearchRequestSchema,
  LibrarySearchResponseSchema,
  ListCuesResponseSchema,
  ListEntitiesResponseSchema,
  ListJobLogsResponseSchema,
  ListLibraryVideosResponseSchema,
  ListTranscriptsResponseSchema,
  ResolveVideoRequestSchema,
  ResolveVideoResponseSchema,
  SearchRequestSchema,
  SearchResponseSchema,
} from "@yt/contracts";

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

function joinUrl(baseUrl: string, path: string): string {
  const b = baseUrl.replace(/\/$/, "");
  if (!path.startsWith("/")) path = `/${path}`;
  return `${b}${path}`;
}

async function readError(res: Response): Promise<never> {
  const txt = await res.text().catch(() => "");
  try {
    const parsed = ApiErrorSchema.parse(JSON.parse(txt));
    throw new YitApiError({ code: parsed.error.code, message: parsed.error.message, status: res.status, details: parsed.error.details });
  } catch {}
  throw new YitApiError({ code: "http_error", message: txt || `HTTP ${res.status}`, status: res.status });
}

export type YitClient = ReturnType<typeof createYitClient>;

export function createYitClient(opts?: { baseUrl?: string; fetch?: FetchLike }) {
  const baseUrl = opts?.baseUrl ?? "";
  const f: FetchLike = opts?.fetch ?? fetch;

  async function getJson<T>(path: string, schema: { parse: (v: unknown) => T }): Promise<T> {
    const res = await f(joinUrl(baseUrl, path));
    if (!res.ok) return readError(res);
    const json = await res.json();
    return schema.parse(json);
  }

  async function postJson<T>(
    path: string,
    body: unknown,
    schema: { parse: (v: unknown) => T }
  ): Promise<T> {
    const res = await f(joinUrl(baseUrl, path), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return readError(res);
    const json = await res.json();
    return schema.parse(json);
  }

  return {
    capabilities: () => getJson("/api/capabilities", CapabilitiesResponseSchema),

    resolveVideo: (req: unknown) => postJson("/api/videos/resolve", ResolveVideoRequestSchema.parse(req), ResolveVideoResponseSchema),
    getVideo: (videoId: string) => getJson(`/api/videos/${videoId}`, GetVideoResponseSchema),
    listLibraryVideos: (opts?: { limit?: number; offset?: number }) => {
      const sp = new URLSearchParams();
      if (opts?.limit != null) sp.set("limit", String(opts.limit));
      if (opts?.offset != null) sp.set("offset", String(opts.offset));
      const qs = sp.toString();
      return getJson(`/api/videos${qs ? `?${qs}` : ""}`, ListLibraryVideosResponseSchema);
    },

    ingestVideo: (videoId: string, req: unknown) =>
      postJson(`/api/videos/${videoId}/ingest`, IngestVideoRequestSchema.parse(req), IngestVideoResponseSchema),

    getJob: (jobId: string) => getJson(`/api/jobs/${jobId}`, GetJobResponseSchema),
    listJobLogs: (jobId: string, opts?: { limit?: number }) => {
      const sp = new URLSearchParams();
      if (opts?.limit != null) sp.set("limit", String(opts.limit));
      const qs = sp.toString();
      return getJson(`/api/jobs/${jobId}/logs${qs ? `?${qs}` : ""}`, ListJobLogsResponseSchema);
    },

    listTranscripts: (videoId: string) => getJson(`/api/videos/${videoId}/transcripts`, ListTranscriptsResponseSchema),
    listCues: (transcriptId: string, opts?: { cursor?: number; limit?: number }) => {
      const sp = new URLSearchParams();
      if (opts?.cursor != null) sp.set("cursor", String(opts.cursor));
      if (opts?.limit != null) sp.set("limit", String(opts.limit));
      const qs = sp.toString();
      return getJson(`/api/transcripts/${transcriptId}/cues${qs ? `?${qs}` : ""}`, ListCuesResponseSchema);
    },

    searchVideo: (videoId: string, req: unknown) =>
      postJson(`/api/videos/${videoId}/search`, SearchRequestSchema.parse(req), SearchResponseSchema),
    searchLibrary: (req: unknown) => postJson("/api/search", LibrarySearchRequestSchema.parse(req), LibrarySearchResponseSchema),

    listEntities: (videoId: string, opts?: { at_ms?: number; window_ms?: number }) => {
      const sp = new URLSearchParams();
      if (opts?.at_ms != null) sp.set("at_ms", String(opts.at_ms));
      if (opts?.window_ms != null) sp.set("window_ms", String(opts.window_ms));
      const qs = sp.toString();
      return getJson(`/api/videos/${videoId}/entities${qs ? `?${qs}` : ""}`, ListEntitiesResponseSchema);
    },

    chat: (videoId: string, req: unknown) => postJson(`/api/videos/${videoId}/chat`, ChatRequestSchema.parse(req), ChatResponseSchema),

    libraryHealth: (opts?: { limit?: number; offset?: number }) => {
      const sp = new URLSearchParams();
      if (opts?.limit != null) sp.set("limit", String(opts.limit));
      if (opts?.offset != null) sp.set("offset", String(opts.offset));
      const qs = sp.toString();
      return getJson(`/api/library/health${qs ? `?${qs}` : ""}`, LibraryHealthResponseSchema);
    },

    libraryRepair: (req: unknown) =>
      postJson(`/api/library/repair`, LibraryRepairRequestSchema.parse(req), LibraryRepairResponseSchema),
  };
}

