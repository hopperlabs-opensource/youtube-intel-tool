import { z } from "zod";

export const IdSchema = z.string().min(1);
export type Id = z.infer<typeof IdSchema>;

export const MsSchema = z.number().int().nonnegative();
export type Ms = z.infer<typeof MsSchema>;

export const IsoDateTimeSchema = z.string().min(1);
export type IsoDateTime = z.infer<typeof IsoDateTimeSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const VideoProviderSchema = z.enum(["youtube"]);
export type VideoProvider = z.infer<typeof VideoProviderSchema>;

export const VideoSchema = z.object({
  id: IdSchema,
  provider: VideoProviderSchema,
  provider_video_id: z.string().min(1),
  url: z.string().url(),
  title: z.string().nullable(),
  channel_name: z.string().nullable(),
  duration_ms: MsSchema.nullable(),
  thumbnail_url: z.string().url().nullable().default(null),
  created_at: IsoDateTimeSchema,
  updated_at: IsoDateTimeSchema,
});
export type Video = z.infer<typeof VideoSchema>;

export const TranscriptSourceSchema = z.enum(["official", "best_effort", "stt"]);
export type TranscriptSource = z.infer<typeof TranscriptSourceSchema>;

export const TranscriptSchema = z.object({
  id: IdSchema,
  video_id: IdSchema,
  language: z.string().min(1),
  source: TranscriptSourceSchema,
  is_generated: z.boolean(),
  fetched_at: IsoDateTimeSchema,
});
export type Transcript = z.infer<typeof TranscriptSchema>;

export const TranscriptCueSchema = z.object({
  id: IdSchema,
  transcript_id: IdSchema,
  idx: z.number().int().nonnegative(),
  start_ms: MsSchema,
  end_ms: MsSchema,
  text: z.string(),
  // Optional, derived from diarization. When absent/null: unknown speaker for this cue.
  speaker_id: IdSchema.nullable().optional(),
});
export type TranscriptCue = z.infer<typeof TranscriptCueSchema>;

export const JobStatusSchema = z.enum(["queued", "running", "completed", "failed", "canceled"]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const JobSchema = z.object({
  id: IdSchema,
  type: z.string().min(1),
  status: JobStatusSchema,
  progress: z.number().int().min(0).max(100).nullable(),
  input_json: z.unknown().nullable(),
  output_json: z.unknown().nullable(),
  error: z.string().nullable(),
  created_at: IsoDateTimeSchema,
  started_at: IsoDateTimeSchema.nullable(),
  finished_at: IsoDateTimeSchema.nullable(),
});
export type Job = z.infer<typeof JobSchema>;

export const JobLogSchema = z.object({
  id: IdSchema,
  job_id: IdSchema,
  ts: IsoDateTimeSchema,
  level: z.string().min(1),
  message: z.string().min(1),
  data_json: z.unknown().nullable(),
});
export type JobLog = z.infer<typeof JobLogSchema>;

export const SearchModeSchema = z.enum(["keyword", "semantic", "hybrid"]);
export type SearchMode = z.infer<typeof SearchModeSchema>;

export const SearchHitSchema = z.object({
  cue_id: IdSchema,
  chunk_id: IdSchema.optional(),
  start_ms: MsSchema,
  end_ms: MsSchema,
  score: z.number(),
  snippet: z.string(),
});
export type SearchHit = z.infer<typeof SearchHitSchema>;

export const EntityTypeSchema = z.enum(["person", "org", "location", "product", "event", "other"]);
export type EntityType = z.infer<typeof EntityTypeSchema>;

export const EntitySchema = z.object({
  id: IdSchema,
  video_id: IdSchema,
  type: EntityTypeSchema,
  canonical_name: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  created_at: IsoDateTimeSchema,
});
export type Entity = z.infer<typeof EntitySchema>;

export const EntityMentionSchema = z.object({
  id: IdSchema,
  entity_id: IdSchema,
  cue_id: IdSchema,
  start_ms: MsSchema,
  end_ms: MsSchema,
  surface: z.string().min(1),
  confidence: z.number().min(0).max(1).nullable(),
  created_at: IsoDateTimeSchema,
});
export type EntityMention = z.infer<typeof EntityMentionSchema>;

export const ListEntityMentionsResponseSchema = z.object({
  mentions: z.array(EntityMentionSchema),
});

// Speakers (diarization)
export const VideoSpeakerSchema = z.object({
  id: IdSchema,
  video_id: IdSchema,
  key: z.string().min(1),
  label: z.string().nullable(),
  source: z.string().min(1),
  created_at: IsoDateTimeSchema,
  updated_at: IsoDateTimeSchema,
});
export type VideoSpeaker = z.infer<typeof VideoSpeakerSchema>;

export const SpeakerSegmentSchema = z.object({
  id: IdSchema,
  video_id: IdSchema,
  transcript_id: IdSchema,
  speaker_id: IdSchema,
  start_ms: MsSchema,
  end_ms: MsSchema,
  confidence: z.number().min(0).max(1).nullable(),
  source: z.string().min(1),
  created_at: IsoDateTimeSchema,
});
export type SpeakerSegment = z.infer<typeof SpeakerSegmentSchema>;

export const ContextSourceSchema = z.enum(["wikipedia", "db", "custom"]);
export type ContextSource = z.infer<typeof ContextSourceSchema>;

export const ContextItemSchema = z.object({
  id: IdSchema,
  entity_id: IdSchema,
  source: ContextSourceSchema,
  source_id: z.string().min(1),
  title: z.string().min(1),
  snippet: z.string().min(1),
  url: z.string().url().nullable(),
  fetched_at: IsoDateTimeSchema,
  expires_at: IsoDateTimeSchema.nullable(),
});
export type ContextItem = z.infer<typeof ContextItemSchema>;

// Endpoint schemas (request/response)
export const ResolveVideoRequestSchema = z.object({
  url: z.string().url(),
});
export const ResolveVideoResponseSchema = z.object({
  video: VideoSchema,
});

export const GetVideoResponseSchema = z.object({
  video: VideoSchema,
});

export const IngestVideoRequestSchema = z.object({
  language: z.string().min(1).default("en"),
  steps: z.array(z.string()).optional(),
});
export const IngestVideoResponseSchema = z.object({
  job: JobSchema,
});

export const GetJobResponseSchema = z.object({
  job: JobSchema,
});

export const ListJobLogsResponseSchema = z.object({
  logs: z.array(JobLogSchema),
});

export const ListTranscriptsResponseSchema = z.object({
  transcripts: z.array(TranscriptSchema),
});

export const ListCuesResponseSchema = z.object({
  cues: z.array(TranscriptCueSchema),
  next_cursor: z.number().int().nullable(),
});

export const ListVideoSpeakersResponseSchema = z.object({
  speakers: z.array(VideoSpeakerSchema),
});

export const ListSpeakerSegmentsResponseSchema = z.object({
  segments: z.array(SpeakerSegmentSchema),
});

export const UpdateVideoSpeakerRequestSchema = z.object({
  label: z.string().trim().min(1).nullable(),
});

export const UpdateVideoSpeakerResponseSchema = z.object({
  speaker: VideoSpeakerSchema,
});

export const SearchRequestSchema = z.object({
  query: z.string().min(1),
  mode: SearchModeSchema.default("keyword"),
  limit: z.number().int().min(1).max(50).default(20),
});
export const SearchResponseSchema = z.object({
  hits: z.array(SearchHitSchema),
  // Null when semantic search is unavailable or when keyword-only modes are used.
  embedding_error: z.string().nullable().optional().default(null),
});

export const ListEntitiesResponseSchema = z.object({
  entities: z.array(EntitySchema),
});

export const GetContextResponseSchema = z.object({
  cards: z.array(
    z.object({
      entity: EntitySchema,
      items: z.array(ContextItemSchema),
    })
  ),
});

// Chat
export const ChatRoleSchema = z.enum(["system", "user", "assistant"]);
export type ChatRole = z.infer<typeof ChatRoleSchema>;

export const ChatMessageSchema = z.object({
  role: ChatRoleSchema,
  content: z.string().min(1),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatProviderSchema = z.enum(["ollama", "mock", "cli"]);
export type ChatProvider = z.infer<typeof ChatProviderSchema>;

export const ChatSourceTypeSchema = z.enum(["cue", "chunk"]);
export type ChatSourceType = z.infer<typeof ChatSourceTypeSchema>;

export const ChatSourceSchema = z.object({
  // Prompt reference, e.g. "S1". This is what the model should cite as [S1].
  ref: z.string().min(1),
  type: ChatSourceTypeSchema,
  // `id` is either a `cue_id` or a `chunk_id` depending on `type`.
  id: IdSchema,
  start_ms: MsSchema,
  end_ms: MsSchema,
  score: z.number().optional(),
  snippet: z.string().min(1),
});
export type ChatSource = z.infer<typeof ChatSourceSchema>;

export const ChatRequestSchema = z.object({
  provider: ChatProviderSchema.default("cli"),
  model_id: z.string().min(1).optional(),
  language: z.string().min(1).default("en"),
  at_ms: MsSchema.nullable().default(null),
  window_ms: MsSchema.default(180_000),
  semantic_k: z.number().int().min(0).max(20).default(6),
  keyword_k: z.number().int().min(0).max(20).default(6),
  messages: z.array(ChatMessageSchema).min(1),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export const ChatResponseSchema = z.object({
  trace_id: z.string().min(1),
  answer: z.string(),
  sources: z.array(ChatSourceSchema),
  // Unique refs (e.g. ["S1","S2"]) extracted from the assistant answer.
  cited_refs: z.array(z.string().min(1)),
  retrieval: z.object({
    transcript_id: IdSchema,
    window: z.object({
      start_ms: MsSchema,
      end_ms: MsSchema,
    }),
    window_cues: z.number().int().nonnegative(),
    semantic_hits: z.number().int().nonnegative(),
    keyword_hits: z.number().int().nonnegative(),
    embedding_error: z.string().nullable(),
  }),
});
export type ChatResponse = z.infer<typeof ChatResponseSchema>;

export const ChatTurnSummarySchema = z.object({
  id: IdSchema,
  trace_id: z.string().min(1),
  status: z.string().min(1),
  provider: z.string().min(1),
  model_id: z.string().min(1),
  at_ms: MsSchema.nullable(),
  error: z.string().nullable(),
  created_at: IsoDateTimeSchema,
  finished_at: IsoDateTimeSchema.nullable(),
  duration_ms: z.number().int().nullable(),
});
export type ChatTurnSummary = z.infer<typeof ChatTurnSummarySchema>;

export const ListChatTurnsResponseSchema = z.object({
  turns: z.array(ChatTurnSummarySchema),
});

export const ChatTurnSchema = ChatTurnSummarySchema.extend({
  video_id: IdSchema,
  transcript_id: IdSchema,
  request_json: z.unknown().nullable(),
  retrieval_json: z.unknown().nullable(),
  response_text: z.string().nullable(),
  response_json: z.unknown().nullable(),
});
export type ChatTurn = z.infer<typeof ChatTurnSchema>;

export const GetChatTurnResponseSchema = z.object({
  turn: ChatTurnSchema,
});

// Library
export const LibraryVideoSchema = z.object({
  video: VideoSchema,
  latest_transcript: TranscriptSchema.nullable(),
});
export type LibraryVideo = z.infer<typeof LibraryVideoSchema>;

export const ListLibraryVideosResponseSchema = z.object({
  items: z.array(LibraryVideoSchema),
});

export const LibraryChannelSchema = z.object({
  channel_name: z.string().min(1),
  videos: z.number().int().nonnegative(),
  ingested: z.number().int().nonnegative(),
});
export type LibraryChannel = z.infer<typeof LibraryChannelSchema>;

export const ListLibraryChannelsResponseSchema = z.object({
  channels: z.array(LibraryChannelSchema),
});

export const LibraryTopicSchema = z.object({
  topic: z.string().min(1),
  videos: z.number().int().nonnegative(),
});
export type LibraryTopic = z.infer<typeof LibraryTopicSchema>;

export const ListLibraryTopicsResponseSchema = z.object({
  topics: z.array(LibraryTopicSchema),
});

export const LibraryPersonSchema = z.object({
  name: z.string().min(1),
  videos: z.number().int().nonnegative(),
  mentions: z.number().int().nonnegative(),
});
export type LibraryPerson = z.infer<typeof LibraryPersonSchema>;

export const ListLibraryPeopleResponseSchema = z.object({
  people: z.array(LibraryPersonSchema),
});

// YouTube discovery (best-effort, no API keys).
export const VideoSourceSchema = z.object({
  id: IdSchema,
  provider: VideoProviderSchema,
  provider_video_id: z.string().min(1),
  url: z.string().url(),
  title: z.string().nullable(),
  channel_name: z.string().nullable(),
  thumbnail_url: z.string().url().nullable().default(null),
  duration_ms: MsSchema.nullable(),
  rank: z.number().int().nonnegative(),
  discovered_via: z.string().min(1),
  discovered_key: z.string().nullable(),
  fetched_at: IsoDateTimeSchema,
  expires_at: IsoDateTimeSchema.nullable(),
});
export type VideoSource = z.infer<typeof VideoSourceSchema>;

export const YouTubeSearchRequestSchema = z.object({
  query: z.string().min(1),
  take: z.number().int().min(1).max(50).default(10),
  cache_hours: z.number().int().min(0).max(168).default(24),
  refresh: z.boolean().default(false),
});
export type YouTubeSearchRequest = z.infer<typeof YouTubeSearchRequestSchema>;

export const YouTubeSearchResponseSchema = z.object({
  items: z.array(VideoSourceSchema),
});
export type YouTubeSearchResponse = z.infer<typeof YouTubeSearchResponseSchema>;

export const YouTubeChannelUploadsRequestSchema = z.object({
  handle_or_url: z.string().min(1),
  take: z.number().int().min(1).max(200).default(50),
  cache_hours: z.number().int().min(0).max(168).default(24),
  refresh: z.boolean().default(false),
});
export type YouTubeChannelUploadsRequest = z.infer<typeof YouTubeChannelUploadsRequestSchema>;

export const YouTubeChannelUploadsResponseSchema = z.object({
  items: z.array(VideoSourceSchema),
});
export type YouTubeChannelUploadsResponse = z.infer<typeof YouTubeChannelUploadsResponseSchema>;

export const YouTubePlaylistItemsRequestSchema = z.object({
  url: z.string().min(1),
  take: z.number().int().min(1).max(500).default(200),
  cache_hours: z.number().int().min(0).max(168).default(24),
  refresh: z.boolean().default(false),
});
export type YouTubePlaylistItemsRequest = z.infer<typeof YouTubePlaylistItemsRequestSchema>;

export const YouTubePlaylistItemsResponseSchema = z.object({
  items: z.array(VideoSourceSchema),
});
export type YouTubePlaylistItemsResponse = z.infer<typeof YouTubePlaylistItemsResponseSchema>;

// Global Search (across library)
export const LibrarySearchScopeSchema = z.object({
  video_ids: z.array(IdSchema).optional(),
  channel_names: z.array(z.string().min(1)).optional(),
  topics: z.array(z.string().min(1)).optional(),
  people: z.array(z.string().min(1)).optional(),
});
export type LibrarySearchScope = z.infer<typeof LibrarySearchScopeSchema>;

export const LibrarySearchRequestSchema = z.object({
  query: z.string().min(1),
  mode: SearchModeSchema.default("hybrid"),
  limit: z.number().int().min(1).max(50).default(20),
  language: z.string().min(1).default("en"),
  scope: LibrarySearchScopeSchema.optional(),
});
export type LibrarySearchRequest = z.infer<typeof LibrarySearchRequestSchema>;

export const LibrarySearchHitSchema = z.object({
  video_id: IdSchema,
  provider: VideoProviderSchema,
  provider_video_id: z.string().min(1),
  video_url: z.string().url(),
  title: z.string().nullable(),
  channel_name: z.string().nullable().default(null),
  thumbnail_url: z.string().url().nullable().default(null),
  cue_id: IdSchema,
  chunk_id: IdSchema.optional(),
  start_ms: MsSchema,
  end_ms: MsSchema,
  score: z.number(),
  snippet: z.string(),
});
export type LibrarySearchHit = z.infer<typeof LibrarySearchHitSchema>;

export const LibrarySearchResponseSchema = z.object({
  hits: z.array(LibrarySearchHitSchema),
  embedding_error: z.string().nullable(),
});
export type LibrarySearchResponse = z.infer<typeof LibrarySearchResponseSchema>;

// Capabilities (UI feature gating)
export const CapabilitiesResponseSchema = z.object({
  embeddings: z.object({
    enabled: z.boolean(),
    provider: z.string().nullable(),
    model_id: z.string().nullable(),
    dimensions: z.number().int().nullable(),
    reason: z.string().nullable(),
  }),
  stt: z.object({
    enabled: z.boolean(),
    provider: z.string().nullable(),
    model_id: z.string().nullable(),
    reason: z.string().nullable(),
  }),
  diarization: z.object({
    enabled: z.boolean(),
    backend: z.string().nullable(),
    reason: z.string().nullable(),
  }),
  cli: z.object({
    gemini: z.boolean(),
    claude: z.boolean(),
    codex: z.boolean(),
    default_provider: z.string().nullable(),
  }),
  tools: z.object({
    yt_dlp: z.boolean(),
    ffmpeg: z.boolean(),
    python: z.boolean(),
  }),
});
export type CapabilitiesResponse = z.infer<typeof CapabilitiesResponseSchema>;

// Library health/repair
export const LibraryHealthItemSchema = z.object({
  video: VideoSchema,
  latest_transcript: TranscriptSchema.nullable(),
  cues: z.number().int().nonnegative().nullable(),
  chunks: z.number().int().nonnegative().nullable(),
  embeddings: z.number().int().nonnegative().nullable(),
  entities: z.number().int().nonnegative().nullable(),
  speakers: z.number().int().nonnegative().nullable(),
  context_items: z.number().int().nonnegative().nullable(),
});
export type LibraryHealthItem = z.infer<typeof LibraryHealthItemSchema>;

export const LibraryHealthResponseSchema = z.object({
  items: z.array(LibraryHealthItemSchema),
  embeddings_model_id: z.string().nullable(),
});
export type LibraryHealthResponse = z.infer<typeof LibraryHealthResponseSchema>;

export const LibraryRepairRequestSchema = z.object({
  video_ids: z.array(IdSchema).min(1),
  language: z.string().min(1).default("en"),
  steps: z.array(z.string()).optional(),
});
export type LibraryRepairRequest = z.infer<typeof LibraryRepairRequestSchema>;

export const LibraryRepairResponseSchema = z.object({
  jobs: z.array(JobSchema),
});
export type LibraryRepairResponse = z.infer<typeof LibraryRepairResponseSchema>;

// CLI Enrichment (structured output consumed from external CLIs like gemini/claude/codex)
export const CliEnrichmentEntitySchema = z.object({
  type: EntityTypeSchema,
  canonical_name: z.string().min(1),
  aliases: z.array(z.string()).default([]),
});
export type CliEnrichmentEntity = z.infer<typeof CliEnrichmentEntitySchema>;

export const CliChapterSchema = z.object({
  start_ms: MsSchema,
  end_ms: MsSchema,
  title: z.string().min(1),
});
export type CliChapter = z.infer<typeof CliChapterSchema>;

export const CliEnrichmentOutputSchema = z.object({
  entities: z.array(CliEnrichmentEntitySchema),
  tags: z.array(z.string().min(1)).default([]),
  chapters: z.array(CliChapterSchema).default([]),
});
export type CliEnrichmentOutput = z.infer<typeof CliEnrichmentOutputSchema>;

// Tags + chapters (stored)
export const ListVideoTagsResponseSchema = z.object({
  tags: z.array(z.string().min(1)),
});
export type ListVideoTagsResponse = z.infer<typeof ListVideoTagsResponseSchema>;

export const VideoChapterSchema = z.object({
  id: IdSchema,
  video_id: IdSchema,
  transcript_id: IdSchema,
  start_ms: MsSchema,
  end_ms: MsSchema,
  title: z.string().min(1),
  source: z.string().min(1),
  created_at: IsoDateTimeSchema,
});
export type VideoChapter = z.infer<typeof VideoChapterSchema>;

export const ListVideoChaptersResponseSchema = z.object({
  chapters: z.array(VideoChapterSchema),
});
export type ListVideoChaptersResponse = z.infer<typeof ListVideoChaptersResponseSchema>;
