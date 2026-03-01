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

export const HealthResponseSchema = z.object({
  ok: z.boolean(),
  service: z.string().min(1),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

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
  source_type: z.enum(["transcript", "visual"]).default("transcript"),
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

// ─── Unified LLM Configuration (early — used by IngestVideo/IngestVisual) ───

export const TextProviderSchema = z.enum([
  "claude-cli", "gemini-cli", "codex-cli",
  "claude", "openai", "gemini",
]);
export type TextProvider = z.infer<typeof TextProviderSchema>;

export const LlmConfigSchema = z.object({
  textProvider: TextProviderSchema.optional(),
  textModel: z.string().optional(),
  visionProvider: z.lazy(() => VisionProviderSchema).optional(),
  visionModel: z.string().optional(),
  temperature: z.number().default(0.2),
  maxTokensPerCall: z.number().int().default(4096),
  preferLocal: z.boolean().default(true),
  maxTotalTokens: z.number().int().positive().optional(),
  maxCostUsd: z.number().positive().optional(),
});
export type LlmConfig = z.infer<typeof LlmConfigSchema>;

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
  llmConfig: LlmConfigSchema.optional(),
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
  source_type: z.enum(["transcript", "visual", "all"]).default("all"),
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

export const ChatSourceTypeSchema = z.enum(["cue", "chunk", "vis", "vis-kw", "vis-sem"]);
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

export const ChatStreamMetaEventSchema = z.object({
  type: z.literal("meta"),
  trace_id: z.string().min(1),
});
export type ChatStreamMetaEvent = z.infer<typeof ChatStreamMetaEventSchema>;

export const ChatStreamTextEventSchema = z.object({
  type: z.literal("text"),
  delta: z.string(),
});
export type ChatStreamTextEvent = z.infer<typeof ChatStreamTextEventSchema>;

export const ChatStreamDoneEventSchema = z.object({
  type: z.literal("done"),
  response: ChatResponseSchema,
});
export type ChatStreamDoneEvent = z.infer<typeof ChatStreamDoneEventSchema>;

export const ChatStreamErrorEventSchema = z.object({
  type: z.literal("error"),
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
  }),
});
export type ChatStreamErrorEvent = z.infer<typeof ChatStreamErrorEventSchema>;

export const ChatStreamEventSchema = z.discriminatedUnion("type", [
  ChatStreamMetaEventSchema,
  ChatStreamTextEventSchema,
  ChatStreamDoneEventSchema,
  ChatStreamErrorEventSchema,
]);
export type ChatStreamEvent = z.infer<typeof ChatStreamEventSchema>;

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

// Saved policies + prioritized feed outputs.
export const PolicyRunStatusSchema = z.enum(["queued", "running", "completed", "failed"]);
export type PolicyRunStatus = z.infer<typeof PolicyRunStatusSchema>;

export const PolicyRunTriggerSchema = z.enum(["manual", "cli", "cron", "ci"]);
export type PolicyRunTrigger = z.infer<typeof PolicyRunTriggerSchema>;

export const PriorityBucketSchema = z.enum(["high", "medium", "low"]);
export type PriorityBucket = z.infer<typeof PriorityBucketSchema>;

export const PolicyPriorityWeightsSchema = z.object({
  recency: z.number().min(0).max(1).default(0.3),
  relevance: z.number().min(0).max(1).default(0.6),
  channel_boost: z.number().min(0).max(1).default(0.1),
});
export type PolicyPriorityWeights = z.infer<typeof PolicyPriorityWeightsSchema>;

export const PolicyPriorityThresholdsSchema = z.object({
  high: z.number().min(0).max(2).default(0.85),
  medium: z.number().min(0).max(2).default(0.55),
});
export type PolicyPriorityThresholds = z.infer<typeof PolicyPriorityThresholdsSchema>;

export const PriorityConfigSchema = z.object({
  weights: PolicyPriorityWeightsSchema.default({}),
  thresholds: PolicyPriorityThresholdsSchema.default({}),
});
export type PriorityConfig = z.infer<typeof PriorityConfigSchema>;

export const PolicySearchPayloadSchema = LibrarySearchRequestSchema;
export type PolicySearchPayload = z.infer<typeof PolicySearchPayloadSchema>;

export const SavedPolicySchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  description: z.string().nullable(),
  enabled: z.boolean(),
  search_payload: PolicySearchPayloadSchema,
  priority_config: PriorityConfigSchema,
  feed_token: z.string().min(16),
  created_at: IsoDateTimeSchema,
  updated_at: IsoDateTimeSchema,
});
export type SavedPolicy = z.infer<typeof SavedPolicySchema>;

export const PolicyRunStatsSchema = z.object({
  total_hits: z.number().int().nonnegative(),
  high: z.number().int().nonnegative(),
  medium: z.number().int().nonnegative(),
  low: z.number().int().nonnegative(),
  embedding_error: z.string().nullable().default(null),
});
export type PolicyRunStats = z.infer<typeof PolicyRunStatsSchema>;

export const PolicyRunSchema = z.object({
  id: IdSchema,
  policy_id: IdSchema,
  status: PolicyRunStatusSchema,
  triggered_by: PolicyRunTriggerSchema,
  error: z.string().nullable(),
  stats: PolicyRunStatsSchema.nullable(),
  created_at: IsoDateTimeSchema,
  started_at: IsoDateTimeSchema.nullable(),
  finished_at: IsoDateTimeSchema.nullable(),
});
export type PolicyRun = z.infer<typeof PolicyRunSchema>;

export const PolicyHitReasonSchema = z.object({
  base_score: z.number(),
  normalized_relevance: z.number().min(0).max(1),
  recency_norm: z.number().min(0).max(1),
  channel_boost: z.number().min(0).max(1),
  weights: PolicyPriorityWeightsSchema,
});
export type PolicyHitReason = z.infer<typeof PolicyHitReasonSchema>;

export const PolicyHitSchema = z.object({
  id: IdSchema,
  run_id: IdSchema,
  policy_id: IdSchema,
  video_id: IdSchema,
  cue_id: IdSchema,
  start_ms: MsSchema,
  snippet: z.string().min(1),
  base_score: z.number(),
  priority_score: z.number(),
  priority_bucket: PriorityBucketSchema,
  reasons: PolicyHitReasonSchema,
  created_at: IsoDateTimeSchema,
});
export type PolicyHit = z.infer<typeof PolicyHitSchema>;

export const CreatePolicyRequestSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().nullable().optional(),
  enabled: z.boolean().default(true),
  search_payload: PolicySearchPayloadSchema,
  priority_config: PriorityConfigSchema.default({}),
});
export type CreatePolicyRequest = z.infer<typeof CreatePolicyRequestSchema>;

export const CreatePolicyResponseSchema = z.object({
  policy: SavedPolicySchema,
});
export type CreatePolicyResponse = z.infer<typeof CreatePolicyResponseSchema>;

export const ListPoliciesResponseSchema = z.object({
  policies: z.array(SavedPolicySchema),
});
export type ListPoliciesResponse = z.infer<typeof ListPoliciesResponseSchema>;

export const GetPolicyResponseSchema = z.object({
  policy: SavedPolicySchema,
  latest_run: PolicyRunSchema.nullable(),
});
export type GetPolicyResponse = z.infer<typeof GetPolicyResponseSchema>;

export const UpdatePolicyRequestSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().nullable().optional(),
  enabled: z.boolean().optional(),
  search_payload: PolicySearchPayloadSchema.optional(),
  priority_config: PriorityConfigSchema.optional(),
  rotate_feed_token: z.boolean().default(false),
});
export type UpdatePolicyRequest = z.infer<typeof UpdatePolicyRequestSchema>;

export const UpdatePolicyResponseSchema = z.object({
  policy: SavedPolicySchema,
});
export type UpdatePolicyResponse = z.infer<typeof UpdatePolicyResponseSchema>;

export const RunPolicyRequestSchema = z.object({
  triggered_by: PolicyRunTriggerSchema.default("manual"),
});
export type RunPolicyRequest = z.infer<typeof RunPolicyRequestSchema>;

export const RunPolicyResponseSchema = z.object({
  run: PolicyRunSchema,
  hits_count: z.number().int().nonnegative(),
});
export type RunPolicyResponse = z.infer<typeof RunPolicyResponseSchema>;

export const ListPolicyRunsResponseSchema = z.object({
  runs: z.array(PolicyRunSchema),
});
export type ListPolicyRunsResponse = z.infer<typeof ListPolicyRunsResponseSchema>;

export const ListPolicyHitsResponseSchema = z.object({
  hits: z.array(PolicyHitSchema),
});
export type ListPolicyHitsResponse = z.infer<typeof ListPolicyHitsResponseSchema>;

export const PolicyFeedItemSchema = z.object({
  hit_id: IdSchema,
  run_id: IdSchema,
  video_id: IdSchema,
  provider_video_id: z.string().min(1),
  video_url: z.string().url(),
  title: z.string().nullable(),
  channel_name: z.string().nullable(),
  start_ms: MsSchema,
  snippet: z.string().min(1),
  priority_score: z.number(),
  priority_bucket: PriorityBucketSchema,
  reasons: PolicyHitReasonSchema,
  run_finished_at: IsoDateTimeSchema,
});
export type PolicyFeedItem = z.infer<typeof PolicyFeedItemSchema>;

export const FeedJsonResponseSchema = z.object({
  policy: z.object({
    id: IdSchema,
    name: z.string().min(1),
  }),
  run: z
    .object({
      id: IdSchema,
      finished_at: IsoDateTimeSchema,
    })
    .nullable(),
  generated_at: IsoDateTimeSchema,
  items: z.array(PolicyFeedItemSchema),
});
export type FeedJsonResponse = z.infer<typeof FeedJsonResponseSchema>;

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

export const SettingsOpenAIResponseSchema = z.object({
  openai: z.object({
    env_available: z.boolean(),
    request_key_provided: z.boolean(),
    effective_source: z.enum(["env", "header", "none"]),
  }),
  embeddings: z.object({
    enabled: z.boolean(),
    provider: z.string().nullable(),
    model_id: z.string().nullable(),
    dimensions: z.number().int().nullable(),
    reason: z.string().nullable(),
  }),
});
export type SettingsOpenAIResponse = z.infer<typeof SettingsOpenAIResponseSchema>;

export const JobStreamHelloEventSchema = z.object({
  type: z.literal("hello"),
  trace_id: z.string().min(1),
  job_id: IdSchema,
});
export type JobStreamHelloEvent = z.infer<typeof JobStreamHelloEventSchema>;

export const JobStreamJobEventSchema = z.object({
  type: z.literal("job"),
  job: JobSchema,
});
export type JobStreamJobEvent = z.infer<typeof JobStreamJobEventSchema>;

export const JobStreamLogEventSchema = z.object({
  type: z.literal("log"),
  log: JobLogSchema,
});
export type JobStreamLogEvent = z.infer<typeof JobStreamLogEventSchema>;

export const JobStreamHeartbeatEventSchema = z.object({
  type: z.literal("heartbeat"),
  ts: IsoDateTimeSchema,
});
export type JobStreamHeartbeatEvent = z.infer<typeof JobStreamHeartbeatEventSchema>;

export const JobStreamDoneEventSchema = z.object({
  type: z.literal("done"),
  job: JobSchema,
});
export type JobStreamDoneEvent = z.infer<typeof JobStreamDoneEventSchema>;

export const JobStreamErrorEventSchema = z.object({
  type: z.literal("error"),
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
  }),
});
export type JobStreamErrorEvent = z.infer<typeof JobStreamErrorEventSchema>;

export const JobStreamEventSchema = z.discriminatedUnion("type", [
  JobStreamHelloEventSchema,
  JobStreamJobEventSchema,
  JobStreamLogEventSchema,
  JobStreamHeartbeatEventSchema,
  JobStreamDoneEventSchema,
  JobStreamErrorEventSchema,
]);
export type JobStreamEvent = z.infer<typeof JobStreamEventSchema>;

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

// Karaoke domain (local party mode)
export const KaraokeTrackReadyStateSchema = z.enum(["pending", "ready", "failed"]);
export type KaraokeTrackReadyState = z.infer<typeof KaraokeTrackReadyStateSchema>;

export const KaraokeTrackSchema = z.object({
  id: IdSchema,
  video_id: IdSchema,
  provider_video_id: z.string().min(1),
  title: z.string().nullable(),
  channel_name: z.string().nullable(),
  thumbnail_url: z.string().url().nullable().default(null),
  duration_ms: MsSchema.nullable(),
  language: z.string().min(1),
  ready_state: KaraokeTrackReadyStateSchema,
  cue_count: z.number().int().nonnegative(),
  created_at: IsoDateTimeSchema,
  updated_at: IsoDateTimeSchema,
});
export type KaraokeTrack = z.infer<typeof KaraokeTrackSchema>;

export const KaraokeSessionStatusSchema = z.enum(["draft", "active", "paused", "completed"]);
export type KaraokeSessionStatus = z.infer<typeof KaraokeSessionStatusSchema>;

export const KaraokeSessionHostModeSchema = z.enum(["single_host"]);
export type KaraokeSessionHostMode = z.infer<typeof KaraokeSessionHostModeSchema>;

export const KaraokeSessionSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  status: KaraokeSessionStatusSchema,
  theme_id: z.string().min(1),
  host_mode: KaraokeSessionHostModeSchema,
  created_at: IsoDateTimeSchema,
  updated_at: IsoDateTimeSchema,
});
export type KaraokeSession = z.infer<typeof KaraokeSessionSchema>;

export const KaraokeQueueStatusSchema = z.enum(["queued", "playing", "skipped", "completed"]);
export type KaraokeQueueStatus = z.infer<typeof KaraokeQueueStatusSchema>;

export const KaraokeQueueItemSchema = z.object({
  id: IdSchema,
  session_id: IdSchema,
  track_id: IdSchema,
  requested_by: z.string().min(1),
  position: z.number().int().nonnegative(),
  status: KaraokeQueueStatusSchema,
  started_at: IsoDateTimeSchema.nullable(),
  ended_at: IsoDateTimeSchema.nullable(),
  created_at: IsoDateTimeSchema,
  updated_at: IsoDateTimeSchema,
});
export type KaraokeQueueItem = z.infer<typeof KaraokeQueueItemSchema>;

export const KaraokeScoreEventSchema = z.object({
  id: IdSchema,
  session_id: IdSchema,
  queue_item_id: IdSchema,
  player_name: z.string().min(1),
  cue_id: IdSchema,
  expected_at_ms: MsSchema,
  actual_at_ms: MsSchema,
  timing_error_ms: z.number().int().nonnegative(),
  awarded_points: z.number().int().nonnegative(),
  created_at: IsoDateTimeSchema,
});
export type KaraokeScoreEvent = z.infer<typeof KaraokeScoreEventSchema>;

export const KaraokeLeaderboardEntrySchema = z.object({
  player_name: z.string().min(1),
  total_points: z.number().int().nonnegative(),
  rounds_played: z.number().int().nonnegative(),
  avg_timing_error_ms: z.number().int().nonnegative(),
  streak_best: z.number().int().nonnegative(),
});
export type KaraokeLeaderboardEntry = z.infer<typeof KaraokeLeaderboardEntrySchema>;

export const KaraokeThemeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  class_name: z.string().min(1),
  palette: z
    .object({
      primary: z.string().min(1),
      accent: z.string().min(1),
      background: z.string().min(1),
      surface: z.string().min(1),
      text: z.string().min(1),
    })
    .nullable()
    .optional()
    .default(null),
  skin_hint: z.string().min(1).nullable().optional().default(null),
});
export type KaraokeTheme = z.infer<typeof KaraokeThemeSchema>;

export const KaraokeResolveTrackRequestSchema = z.object({
  url: z.string().url(),
  language: z.string().min(1).default("en"),
});
export type KaraokeResolveTrackRequest = z.infer<typeof KaraokeResolveTrackRequestSchema>;

export const KaraokeResolveTrackResponseSchema = z.object({
  track: KaraokeTrackSchema,
  video: VideoSchema,
  ingest_job: JobSchema.nullable(),
});
export type KaraokeResolveTrackResponse = z.infer<typeof KaraokeResolveTrackResponseSchema>;

export const ListKaraokeTracksResponseSchema = z.object({
  tracks: z.array(KaraokeTrackSchema),
});
export type ListKaraokeTracksResponse = z.infer<typeof ListKaraokeTracksResponseSchema>;

export const GetKaraokeTrackResponseSchema = z.object({
  track: KaraokeTrackSchema,
});
export type GetKaraokeTrackResponse = z.infer<typeof GetKaraokeTrackResponseSchema>;

export const CreateKaraokeSessionRequestSchema = z.object({
  name: z.string().trim().min(1),
  theme_id: z.string().min(1).default("gold-stage"),
  host_mode: KaraokeSessionHostModeSchema.default("single_host"),
  seed_track_ids: z.array(IdSchema).default([]),
});
export type CreateKaraokeSessionRequest = z.infer<typeof CreateKaraokeSessionRequestSchema>;

export const CreateKaraokeSessionResponseSchema = z.object({
  session: KaraokeSessionSchema,
  queue: z.array(KaraokeQueueItemSchema),
});
export type CreateKaraokeSessionResponse = z.infer<typeof CreateKaraokeSessionResponseSchema>;

export const UpdateKaraokeSessionRequestSchema = z.object({
  name: z.string().trim().min(1).optional(),
  status: KaraokeSessionStatusSchema.optional(),
  theme_id: z.string().min(1).optional(),
});
export type UpdateKaraokeSessionRequest = z.infer<typeof UpdateKaraokeSessionRequestSchema>;

export const UpdateKaraokeSessionResponseSchema = z.object({
  session: KaraokeSessionSchema,
});
export type UpdateKaraokeSessionResponse = z.infer<typeof UpdateKaraokeSessionResponseSchema>;

export const GetKaraokeSessionResponseSchema = z.object({
  session: KaraokeSessionSchema,
  queue: z.array(KaraokeQueueItemSchema),
  active_item: KaraokeQueueItemSchema.nullable(),
  leaderboard: z.array(KaraokeLeaderboardEntrySchema),
});
export type GetKaraokeSessionResponse = z.infer<typeof GetKaraokeSessionResponseSchema>;

export const AddKaraokeQueueItemRequestSchema = z.object({
  track_id: IdSchema,
  requested_by: z.string().trim().min(1),
});
export type AddKaraokeQueueItemRequest = z.infer<typeof AddKaraokeQueueItemRequestSchema>;

export const AddKaraokeQueueItemResponseSchema = z.object({
  item: KaraokeQueueItemSchema,
});
export type AddKaraokeQueueItemResponse = z.infer<typeof AddKaraokeQueueItemResponseSchema>;

export const KaraokeQueueActionSchema = z.enum(["play_now", "skip", "complete", "move"]);
export type KaraokeQueueAction = z.infer<typeof KaraokeQueueActionSchema>;

export const UpdateKaraokeQueueItemRequestSchema = z.object({
  action: KaraokeQueueActionSchema,
  new_position: z.number().int().nonnegative().optional(),
});
export type UpdateKaraokeQueueItemRequest = z.infer<typeof UpdateKaraokeQueueItemRequestSchema>;

export const UpdateKaraokeQueueItemResponseSchema = z.object({
  item: KaraokeQueueItemSchema,
  queue: z.array(KaraokeQueueItemSchema),
});
export type UpdateKaraokeQueueItemResponse = z.infer<typeof UpdateKaraokeQueueItemResponseSchema>;

export const StartKaraokeRoundRequestSchema = z.object({
  queue_item_id: IdSchema,
});
export type StartKaraokeRoundRequest = z.infer<typeof StartKaraokeRoundRequestSchema>;

export const StartKaraokeRoundResponseSchema = z.object({
  item: KaraokeQueueItemSchema,
});
export type StartKaraokeRoundResponse = z.infer<typeof StartKaraokeRoundResponseSchema>;

export const RecordKaraokeScoreEventRequestSchema = z.object({
  queue_item_id: IdSchema,
  player_name: z.string().trim().min(1),
  cue_id: IdSchema,
  expected_at_ms: MsSchema,
  actual_at_ms: MsSchema,
});
export type RecordKaraokeScoreEventRequest = z.infer<typeof RecordKaraokeScoreEventRequestSchema>;

export const RecordKaraokeScoreEventResponseSchema = z.object({
  event: KaraokeScoreEventSchema,
  leaderboard: z.array(KaraokeLeaderboardEntrySchema),
});
export type RecordKaraokeScoreEventResponse = z.infer<typeof RecordKaraokeScoreEventResponseSchema>;

export const GetKaraokeLeaderboardResponseSchema = z.object({
  entries: z.array(KaraokeLeaderboardEntrySchema),
});
export type GetKaraokeLeaderboardResponse = z.infer<typeof GetKaraokeLeaderboardResponseSchema>;

export const ListKaraokeThemesResponseSchema = z.object({
  themes: z.array(KaraokeThemeSchema),
});
export type ListKaraokeThemesResponse = z.infer<typeof ListKaraokeThemesResponseSchema>;

export const KaraokePlaylistSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  description: z.string().nullable(),
  created_at: IsoDateTimeSchema,
  updated_at: IsoDateTimeSchema,
});
export type KaraokePlaylist = z.infer<typeof KaraokePlaylistSchema>;

export const KaraokePlaylistItemSchema = z.object({
  id: IdSchema,
  playlist_id: IdSchema,
  track_id: IdSchema,
  position: z.number().int().nonnegative(),
  added_at: IsoDateTimeSchema,
});
export type KaraokePlaylistItem = z.infer<typeof KaraokePlaylistItemSchema>;

export const CreateKaraokePlaylistRequestSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().max(2_000).optional().nullable(),
});
export type CreateKaraokePlaylistRequest = z.infer<typeof CreateKaraokePlaylistRequestSchema>;

export const CreateKaraokePlaylistResponseSchema = z.object({
  playlist: KaraokePlaylistSchema,
});
export type CreateKaraokePlaylistResponse = z.infer<typeof CreateKaraokePlaylistResponseSchema>;

export const ListKaraokePlaylistsResponseSchema = z.object({
  playlists: z.array(KaraokePlaylistSchema),
});
export type ListKaraokePlaylistsResponse = z.infer<typeof ListKaraokePlaylistsResponseSchema>;

export const GetKaraokePlaylistResponseSchema = z.object({
  playlist: KaraokePlaylistSchema,
  items: z.array(KaraokePlaylistItemSchema),
});
export type GetKaraokePlaylistResponse = z.infer<typeof GetKaraokePlaylistResponseSchema>;

export const UpdateKaraokePlaylistRequestSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().max(2_000).optional().nullable(),
});
export type UpdateKaraokePlaylistRequest = z.infer<typeof UpdateKaraokePlaylistRequestSchema>;

export const UpdateKaraokePlaylistResponseSchema = z.object({
  playlist: KaraokePlaylistSchema,
});
export type UpdateKaraokePlaylistResponse = z.infer<typeof UpdateKaraokePlaylistResponseSchema>;

export const DeleteKaraokePlaylistResponseSchema = z.object({
  ok: z.literal(true),
});
export type DeleteKaraokePlaylistResponse = z.infer<typeof DeleteKaraokePlaylistResponseSchema>;

export const AddKaraokePlaylistItemRequestSchema = z.object({
  track_id: IdSchema,
  position: z.number().int().nonnegative().optional(),
});
export type AddKaraokePlaylistItemRequest = z.infer<typeof AddKaraokePlaylistItemRequestSchema>;

export const AddKaraokePlaylistItemResponseSchema = z.object({
  item: KaraokePlaylistItemSchema,
});
export type AddKaraokePlaylistItemResponse = z.infer<typeof AddKaraokePlaylistItemResponseSchema>;

export const UpdateKaraokePlaylistItemRequestSchema = z.object({
  position: z.number().int().nonnegative(),
});
export type UpdateKaraokePlaylistItemRequest = z.infer<typeof UpdateKaraokePlaylistItemRequestSchema>;

export const UpdateKaraokePlaylistItemResponseSchema = z.object({
  item: KaraokePlaylistItemSchema,
  items: z.array(KaraokePlaylistItemSchema),
});
export type UpdateKaraokePlaylistItemResponse = z.infer<typeof UpdateKaraokePlaylistItemResponseSchema>;

export const DeleteKaraokePlaylistItemResponseSchema = z.object({
  ok: z.literal(true),
  items: z.array(KaraokePlaylistItemSchema),
});
export type DeleteKaraokePlaylistItemResponse = z.infer<typeof DeleteKaraokePlaylistItemResponseSchema>;

export const QueueFromKaraokePlaylistRequestSchema = z.object({
  playlist_id: IdSchema,
  requested_by: z.string().trim().min(1).default("playlist"),
});
export type QueueFromKaraokePlaylistRequest = z.infer<typeof QueueFromKaraokePlaylistRequestSchema>;

export const QueueFromKaraokePlaylistResponseSchema = z.object({
  added: z.array(KaraokeQueueItemSchema),
});
export type QueueFromKaraokePlaylistResponse = z.infer<typeof QueueFromKaraokePlaylistResponseSchema>;

export const KaraokeGuestRequestStatusSchema = z.enum(["pending", "approved", "rejected", "queued"]);
export type KaraokeGuestRequestStatus = z.infer<typeof KaraokeGuestRequestStatusSchema>;

export const KaraokeGuestRequestSchema = z.object({
  id: IdSchema,
  session_id: IdSchema,
  track_id: IdSchema,
  guest_name: z.string().min(1),
  status: KaraokeGuestRequestStatusSchema,
  created_at: IsoDateTimeSchema,
  handled_at: IsoDateTimeSchema.nullable(),
});
export type KaraokeGuestRequest = z.infer<typeof KaraokeGuestRequestSchema>;

export const CreateKaraokeGuestTokenRequestSchema = z.object({
  ttl_minutes: z.number().int().positive().max(24 * 60).optional().default(240),
});
export type CreateKaraokeGuestTokenRequest = z.infer<typeof CreateKaraokeGuestTokenRequestSchema>;

export const CreateKaraokeGuestTokenResponseSchema = z.object({
  token: z.string().min(16),
  expires_at: IsoDateTimeSchema,
  join_path: z.string().min(1),
});
export type CreateKaraokeGuestTokenResponse = z.infer<typeof CreateKaraokeGuestTokenResponseSchema>;

export const CreateKaraokeGuestRequestRequestSchema = z.object({
  track_id: IdSchema,
  guest_name: z.string().trim().min(1).max(120),
});
export type CreateKaraokeGuestRequestRequest = z.infer<typeof CreateKaraokeGuestRequestRequestSchema>;

export const CreateKaraokeGuestRequestResponseSchema = z.object({
  request: KaraokeGuestRequestSchema,
});
export type CreateKaraokeGuestRequestResponse = z.infer<typeof CreateKaraokeGuestRequestResponseSchema>;

export const ListKaraokeGuestRequestsResponseSchema = z.object({
  requests: z.array(KaraokeGuestRequestSchema),
});
export type ListKaraokeGuestRequestsResponse = z.infer<typeof ListKaraokeGuestRequestsResponseSchema>;

export const UpdateKaraokeGuestRequestRequestSchema = z.object({
  action: z.enum(["approve", "reject"]),
  requested_by: z.string().trim().min(1).optional().default("host"),
});
export type UpdateKaraokeGuestRequestRequest = z.infer<typeof UpdateKaraokeGuestRequestRequestSchema>;

export const UpdateKaraokeGuestRequestResponseSchema = z.object({
  request: KaraokeGuestRequestSchema,
  queue_item: KaraokeQueueItemSchema.nullable(),
});
export type UpdateKaraokeGuestRequestResponse = z.infer<typeof UpdateKaraokeGuestRequestResponseSchema>;

// ─── Visual Intelligence (Action Transcripts) ───────────────────────────────

export const ExtractionStrategySchema = z.enum(["scene_detect", "uniform", "keyframe"]);
export type ExtractionStrategy = z.infer<typeof ExtractionStrategySchema>;

export const VideoFrameRowSchema = z.object({
  id: IdSchema,
  video_id: IdSchema,
  frame_index: z.number().int().nonnegative(),
  timestamp_ms: MsSchema,
  file_path: z.string().min(1),
  width: z.number().int().positive().nullable().default(null),
  height: z.number().int().positive().nullable().default(null),
  file_size_bytes: z.number().int().nonnegative().nullable().default(null),
  extraction_method: ExtractionStrategySchema.default("scene_detect"),
  scene_score: z.number().nullable().default(null),
  sharpness: z.number().nullable().default(null),
  is_blank: z.boolean().default(false),
  created_at: IsoDateTimeSchema,
});
export type VideoFrameRow = z.infer<typeof VideoFrameRowSchema>;

export const SceneTypeSchema = z.enum([
  "presentation",
  "talking_head",
  "screencast",
  "outdoor",
  "whiteboard",
  "diagram",
  "text_heavy",
  "b_roll",
  "animation",
  "other",
]);
export type SceneType = z.infer<typeof SceneTypeSchema>;

export const DetectedObjectSchema = z.object({
  label: z.string().min(1),
  confidence: z.number().min(0).max(1).optional(),
  bbox: z
    .object({
      x: z.number(),
      y: z.number(),
      w: z.number(),
      h: z.number(),
    })
    .optional(),
});
export type DetectedObject = z.infer<typeof DetectedObjectSchema>;

export const FrameAnalysisRowSchema = z.object({
  id: IdSchema,
  video_id: IdSchema,
  frame_id: IdSchema,
  start_ms: MsSchema,
  end_ms: MsSchema,
  description: z.string().min(1),
  objects: z.array(DetectedObjectSchema).default([]),
  text_overlay: z.string().nullable().default(null),
  scene_type: SceneTypeSchema.nullable().default(null),
  provider: z.string().min(1),
  model: z.string().min(1),
  prompt_tokens: z.number().int().nonnegative().nullable().default(null),
  completion_tokens: z.number().int().nonnegative().nullable().default(null),
  created_at: IsoDateTimeSchema,
});
export type FrameAnalysisRow = z.infer<typeof FrameAnalysisRowSchema>;

export const FrameChunkRowSchema = z.object({
  id: IdSchema,
  video_id: IdSchema,
  chunk_index: z.number().int().nonnegative(),
  start_ms: MsSchema,
  end_ms: MsSchema,
  text: z.string().min(1),
  token_estimate: z.number().int().nonnegative().default(0),
  created_at: IsoDateTimeSchema,
});
export type FrameChunkRow = z.infer<typeof FrameChunkRowSchema>;

export const VisionProviderSchema = z.enum([
  "claude", "openai", "gemini", "ollama",
  "claude-cli", "gemini-cli", "codex-cli",
]);
export type VisionProvider = z.infer<typeof VisionProviderSchema>;

export const PromptTemplateSchema = z.enum(["describe", "caption", "ocr", "slide", "audit"]);
export type PromptTemplate = z.infer<typeof PromptTemplateSchema>;

export const VisionConfigSchema = z.object({
  provider: VisionProviderSchema,
  model: z.string().min(1),
  baseUrl: z.string().url().optional(),
  apiKey: z.string().min(1).optional(),
  maxTokensPerFrame: z.number().int().min(50).max(4096).default(512),
  temperature: z.number().min(0).max(2).default(0.2),
  contextCarryover: z.boolean().default(true),
  promptTemplate: PromptTemplateSchema.default("describe"),
});
export type VisionConfig = z.infer<typeof VisionConfigSchema>;

export const FrameExtractionConfigSchema = z.object({
  strategy: ExtractionStrategySchema.default("scene_detect"),
  framesPerMinute: z.number().min(0.1).max(60).default(2),
  sceneThreshold: z.number().min(0).max(1).default(0.27),
  adaptiveThreshold: z.boolean().default(false),
  minSharpness: z.number().min(0).default(15),
  blankThreshold: z.number().min(0).max(255).default(20),
  maxFrames: z.number().int().min(1).max(2000).default(200),
  outputFormat: z.enum(["jpg", "png"]).default("jpg"),
  outputQuality: z.number().int().min(1).max(100).default(85),
  maxWidth: z.number().int().min(320).max(3840).default(1280),
});
export type FrameExtractionConfig = z.infer<typeof FrameExtractionConfigSchema>;

export const SearchSourceTypeSchema = z.enum(["transcript", "visual", "dense_visual", "all"]);
export type SearchSourceType = z.infer<typeof SearchSourceTypeSchema>;

export const EmbeddingSourceTypeSchema = z.enum(["transcript", "visual"]);
export type EmbeddingSourceType = z.infer<typeof EmbeddingSourceTypeSchema>;

export const ActionTranscriptCueSchema = z.object({
  frame_id: IdSchema,
  timestamp_ms: MsSchema,
  start_ms: MsSchema,
  end_ms: MsSchema,
  description: z.string().min(1),
  objects: z.array(DetectedObjectSchema).default([]),
  text_overlay: z.string().nullable().default(null),
  scene_type: SceneTypeSchema.nullable().default(null),
});
export type ActionTranscriptCue = z.infer<typeof ActionTranscriptCueSchema>;

export const ActionTranscriptSchema = z.object({
  video_id: IdSchema,
  cues: z.array(ActionTranscriptCueSchema),
  total_frames: z.number().int().nonnegative(),
  total_analyzed: z.number().int().nonnegative(),
  provider: z.string().min(1),
  model: z.string().min(1),
});
export type ActionTranscript = z.infer<typeof ActionTranscriptSchema>;

export const IngestVisualRequestSchema = z.object({
  extraction: FrameExtractionConfigSchema.optional(),
  vision: VisionConfigSchema,
  force: z.boolean().default(false),
  llmConfig: LlmConfigSchema.optional(),
});
export type IngestVisualRequest = z.infer<typeof IngestVisualRequestSchema>;

export const IngestVisualResponseSchema = z.object({
  job: JobSchema,
});
export type IngestVisualResponse = z.infer<typeof IngestVisualResponseSchema>;

export const VisualStatusSchema = z.object({
  video_id: IdSchema,
  has_visual: z.boolean(),
  frames_extracted: z.number().int().nonnegative(),
  frames_analyzed: z.number().int().nonnegative(),
  frame_chunks: z.number().int().nonnegative(),
  visual_embeddings: z.number().int().nonnegative(),
  total_tokens_used: z.number().int().nonnegative().nullable(),
  vision_provider: z.string().nullable(),
  vision_model: z.string().nullable(),
  extraction_strategy: z.string().nullable(),
  completed_at: IsoDateTimeSchema.nullable(),
});
export type VisualStatus = z.infer<typeof VisualStatusSchema>;

export const GetVisualStatusResponseSchema = z.object({
  status: VisualStatusSchema,
});
export type GetVisualStatusResponse = z.infer<typeof GetVisualStatusResponseSchema>;

export const ListFramesResponseSchema = z.object({
  frames: z.array(VideoFrameRowSchema),
});
export type ListFramesResponse = z.infer<typeof ListFramesResponseSchema>;

export const GetFrameAnalysisResponseSchema = z.object({
  frame: VideoFrameRowSchema,
  analysis: FrameAnalysisRowSchema.nullable(),
});
export type GetFrameAnalysisResponse = z.infer<typeof GetFrameAnalysisResponseSchema>;

export const GetActionTranscriptResponseSchema = z.object({
  transcript: ActionTranscriptSchema,
});
export type GetActionTranscriptResponse = z.infer<typeof GetActionTranscriptResponseSchema>;

export const ListFrameChunksResponseSchema = z.object({
  chunks: z.array(FrameChunkRowSchema),
});
export type ListFrameChunksResponse = z.infer<typeof ListFrameChunksResponseSchema>;

export const VisualJobsMetaSchema = z.object({
  id: IdSchema,
  video_id: IdSchema,
  extraction_strategy: z.string().min(1),
  frames_per_minute: z.number().nullable(),
  scene_threshold: z.number().nullable(),
  vision_provider: z.string().min(1),
  vision_model: z.string().min(1),
  total_frames_extracted: z.number().int().nonnegative().nullable(),
  total_frames_analyzed: z.number().int().nonnegative().nullable(),
  total_tokens_used: z.number().int().nonnegative().nullable(),
  cache_key: z.string().nullable(),
  started_at: IsoDateTimeSchema.nullable(),
  completed_at: IsoDateTimeSchema.nullable(),
  created_at: IsoDateTimeSchema,
});
export type VisualJobsMeta = z.infer<typeof VisualJobsMetaSchema>;

// Cost Estimation & Token Budgets
export const CostEstimateSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  frameCount: z.number().int().nonnegative(),
  estimatedInputTokens: z.number().int().nonnegative(),
  estimatedOutputTokens: z.number().int().nonnegative(),
  estimatedTotalTokens: z.number().int().nonnegative(),
  estimatedCostUsd: z.number().nonnegative(),
  isLocal: z.boolean(),
});
export type CostEstimate = z.infer<typeof CostEstimateSchema>;

export const TokenBudgetSchema = z.object({
  maxTotalTokens: z.number().int().positive().optional(),
  maxCostUsd: z.number().positive().optional(),
});
export type TokenBudget = z.infer<typeof TokenBudgetSchema>;

// Narrative Synthesis
export const NarrativeSynthesisSchema = z.object({
  video_id: IdSchema,
  summary: z.string().min(1),
  key_moments: z.array(
    z.object({
      timestamp_ms: MsSchema,
      description: z.string().min(1),
    }),
  ),
  visual_themes: z.array(z.string().min(1)),
  scene_breakdown: z.array(
    z.object({
      scene_type: SceneTypeSchema,
      count: z.number().int().nonnegative(),
      percentage: z.number().min(0).max(100),
    }),
  ),
  provider: z.string().min(1),
  model: z.string().min(1),
  total_frames: z.number().int().nonnegative(),
});
export type NarrativeSynthesis = z.infer<typeof NarrativeSynthesisSchema>;

export const GetNarrativeSynthesisResponseSchema = z.object({
  narrative: NarrativeSynthesisSchema,
});
export type GetNarrativeSynthesisResponse = z.infer<typeof GetNarrativeSynthesisResponseSchema>;

// ─── Unified LLM Configuration (continued) ──────────────────────────────────

export const ResolvedLlmConfigSchema = z.object({
  textProvider: TextProviderSchema,
  textModel: z.string(),
  visionProvider: VisionProviderSchema,
  visionModel: z.string(),
  temperature: z.number(),
  maxTokensPerCall: z.number().int(),
  preferLocal: z.boolean(),
  maxTotalTokens: z.number().int().positive().optional(),
  maxCostUsd: z.number().positive().optional(),
});
export type ResolvedLlmConfig = z.infer<typeof ResolvedLlmConfigSchema>;

export const LlmProviderDetectionSchema = z.object({
  provider: z.string().min(1),
  type: z.enum(["api", "cli", "local"]),
  available: z.boolean(),
  free: z.boolean(),
  supportsText: z.boolean(),
  supportsVision: z.boolean(),
});
export type LlmProviderDetection = z.infer<typeof LlmProviderDetectionSchema>;

// ─── Dense Action Transcript ─────────────────────────────────────────────────

export const DenseActionCueSchema = z.object({
  id: IdSchema,
  video_id: IdSchema,
  start_ms: MsSchema,
  end_ms: MsSchema,
  description: z.string().min(1),
  interpolated: z.boolean(),
  scene_type: z.string().nullable().default(null),
  source_frame_id: IdSchema.nullable().default(null),
  confidence: z.number().nullable().default(null),
  metadata_json: z.unknown().default({}),
  created_at: IsoDateTimeSchema,
});
export type DenseActionCue = z.infer<typeof DenseActionCueSchema>;

export const DenseActionTranscriptSchema = z.object({
  video_id: IdSchema,
  cues: z.array(DenseActionCueSchema),
  total_cues: z.number().int().nonnegative(),
  interpolated_cues: z.number().int().nonnegative(),
  direct_cues: z.number().int().nonnegative(),
});
export type DenseActionTranscript = z.infer<typeof DenseActionTranscriptSchema>;

export const BuildDenseTranscriptRequestSchema = z.object({
  force: z.boolean().default(false),
  llmConfig: LlmConfigSchema.optional(),
});
export type BuildDenseTranscriptRequest = z.infer<typeof BuildDenseTranscriptRequestSchema>;

export const BuildDenseTranscriptResponseSchema = z.object({
  job: JobSchema,
});
export type BuildDenseTranscriptResponse = z.infer<typeof BuildDenseTranscriptResponseSchema>;

export const GetDenseTranscriptResponseSchema = z.object({
  transcript: DenseActionTranscriptSchema,
});
export type GetDenseTranscriptResponse = z.infer<typeof GetDenseTranscriptResponseSchema>;

// ─── Auto-Chapters + Significant Marks ───────────────────────────────────────

export const SignificantMarkTypeSchema = z.enum([
  "slide_change", "demo_start", "key_statement", "topic_shift",
  "speaker_change", "visual_transition", "text_appears", "text_disappears",
]);
export type SignificantMarkType = z.infer<typeof SignificantMarkTypeSchema>;

export const SignificantMarkSchema = z.object({
  id: IdSchema,
  video_id: IdSchema,
  timestamp_ms: MsSchema,
  mark_type: SignificantMarkTypeSchema,
  confidence: z.number().min(0).max(1),
  description: z.string().nullable().default(null),
  metadata_json: z.unknown().default({}),
  chapter_id: IdSchema.nullable().default(null),
  created_at: IsoDateTimeSchema,
});
export type SignificantMark = z.infer<typeof SignificantMarkSchema>;

export const ChapterSignalSchema = z.enum([
  "visual_transition", "ocr_change", "topic_shift", "speaker_change", "phash_jump",
]);
export type ChapterSignal = z.infer<typeof ChapterSignalSchema>;

export const AutoChapterSchema = z.object({
  id: IdSchema,
  video_id: IdSchema,
  transcript_id: IdSchema.nullable().default(null),
  start_ms: MsSchema,
  end_ms: MsSchema,
  title: z.string().min(1),
  source: z.string().min(1),
  signals: z.array(ChapterSignalSchema).default([]),
  confidence: z.number().nullable().default(null),
  created_at: IsoDateTimeSchema,
});
export type AutoChapter = z.infer<typeof AutoChapterSchema>;

export const DetectAutoChaptersRequestSchema = z.object({
  force: z.boolean().default(false),
  min_signals: z.number().int().min(1).default(2),
  window_ms: z.number().int().min(500).default(3000),
  llmConfig: LlmConfigSchema.optional(),
});
export type DetectAutoChaptersRequest = z.infer<typeof DetectAutoChaptersRequestSchema>;

export const DetectAutoChaptersResponseSchema = z.object({
  job: JobSchema,
});
export type DetectAutoChaptersResponse = z.infer<typeof DetectAutoChaptersResponseSchema>;

export const GetAutoChaptersResponseSchema = z.object({
  chapters: z.array(AutoChapterSchema),
  marks: z.array(SignificantMarkSchema),
});
export type GetAutoChaptersResponse = z.infer<typeof GetAutoChaptersResponseSchema>;

// ─── Face Indexing ───────────────────────────────────────────────────────────

export const BboxSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});
export type Bbox = z.infer<typeof BboxSchema>;

export const FaceDetectionSchema = z.object({
  id: IdSchema,
  video_id: IdSchema,
  frame_id: IdSchema,
  bbox_json: BboxSchema,
  det_score: z.number(),
  identity_id: IdSchema.nullable().default(null),
  created_at: IsoDateTimeSchema,
});
export type FaceDetection = z.infer<typeof FaceDetectionSchema>;

export const FaceIdentitySchema = z.object({
  id: IdSchema,
  video_id: IdSchema,
  label: z.string().min(1),
  display_name: z.string().nullable().default(null),
  representative_frame_id: IdSchema.nullable().default(null),
  speaker_id: IdSchema.nullable().default(null),
  created_at: IsoDateTimeSchema,
});
export type FaceIdentity = z.infer<typeof FaceIdentitySchema>;

export const FaceAppearanceSchema = z.object({
  id: IdSchema,
  video_id: IdSchema,
  identity_id: IdSchema,
  start_ms: MsSchema,
  end_ms: MsSchema,
  frame_count: z.number().int().min(1).default(1),
  avg_det_score: z.number().nullable().default(null),
  created_at: IsoDateTimeSchema,
});
export type FaceAppearance = z.infer<typeof FaceAppearanceSchema>;

export const IngestFacesRequestSchema = z.object({
  det_threshold: z.number().min(0).max(1).default(0.5),
  cluster_threshold: z.number().min(0).max(1).default(0.68),
  force: z.boolean().default(false),
});
export type IngestFacesRequest = z.infer<typeof IngestFacesRequestSchema>;

export const IngestFacesResponseSchema = z.object({
  job: JobSchema,
});
export type IngestFacesResponse = z.infer<typeof IngestFacesResponseSchema>;

export const ListFaceIdentitiesResponseSchema = z.object({
  identities: z.array(FaceIdentitySchema),
});
export type ListFaceIdentitiesResponse = z.infer<typeof ListFaceIdentitiesResponseSchema>;

export const ListFaceAppearancesResponseSchema = z.object({
  appearances: z.array(FaceAppearanceSchema),
});
export type ListFaceAppearancesResponse = z.infer<typeof ListFaceAppearancesResponseSchema>;

export const ListFaceDetectionsResponseSchema = z.object({
  detections: z.array(FaceDetectionSchema),
});
export type ListFaceDetectionsResponse = z.infer<typeof ListFaceDetectionsResponseSchema>;

export const UpdateFaceIdentityRequestSchema = z.object({
  display_name: z.string().min(1),
});
export type UpdateFaceIdentityRequest = z.infer<typeof UpdateFaceIdentityRequestSchema>;

export const UpdateFaceIdentityResponseSchema = z.object({
  identity: FaceIdentitySchema,
});
export type UpdateFaceIdentityResponse = z.infer<typeof UpdateFaceIdentityResponseSchema>;

// ─── Voice Fingerprinting / Cross-Video Speaker Recognition ──────────────────

export const SpeakerEmbeddingSchema = z.object({
  id: IdSchema,
  speaker_id: IdSchema,
  video_id: IdSchema,
  model_id: z.string().min(1),
  segment_count: z.number().int().min(1).default(1),
  created_at: IsoDateTimeSchema,
});
export type SpeakerEmbedding = z.infer<typeof SpeakerEmbeddingSchema>;

export const GlobalSpeakerSchema = z.object({
  id: IdSchema,
  display_name: z.string().min(1),
  face_identity_id: IdSchema.nullable().default(null),
  created_at: IsoDateTimeSchema,
  updated_at: IsoDateTimeSchema,
});
export type GlobalSpeaker = z.infer<typeof GlobalSpeakerSchema>;

export const GlobalSpeakerLinkSchema = z.object({
  id: IdSchema,
  global_speaker_id: IdSchema,
  speaker_id: IdSchema,
  confidence: z.number().nullable().default(null),
  source: z.string().min(1).default("auto"),
  created_at: IsoDateTimeSchema,
});
export type GlobalSpeakerLink = z.infer<typeof GlobalSpeakerLinkSchema>;

export const MatchSpeakerResponseSchema = z.object({
  matches: z.array(
    z.object({
      global_speaker_id: IdSchema,
      display_name: z.string(),
      confidence: z.number(),
      videos: z.array(
        z.object({
          video_id: IdSchema,
          speaker_id: IdSchema,
          title: z.string().nullable(),
        }),
      ),
    }),
  ),
});
export type MatchSpeakerResponse = z.infer<typeof MatchSpeakerResponseSchema>;

export const CreateGlobalSpeakerRequestSchema = z.object({
  display_name: z.string().min(1),
  speaker_id: IdSchema,
  video_id: IdSchema,
});
export type CreateGlobalSpeakerRequest = z.infer<typeof CreateGlobalSpeakerRequestSchema>;

export const CreateGlobalSpeakerResponseSchema = z.object({
  global_speaker: GlobalSpeakerSchema,
  link: GlobalSpeakerLinkSchema,
});
export type CreateGlobalSpeakerResponse = z.infer<typeof CreateGlobalSpeakerResponseSchema>;

export const ListGlobalSpeakersResponseSchema = z.object({
  global_speakers: z.array(GlobalSpeakerSchema),
});
export type ListGlobalSpeakersResponse = z.infer<typeof ListGlobalSpeakersResponseSchema>;

export const GetGlobalSpeakerResponseSchema = z.object({
  global_speaker: GlobalSpeakerSchema,
  links: z.array(GlobalSpeakerLinkSchema),
});
export type GetGlobalSpeakerResponse = z.infer<typeof GetGlobalSpeakerResponseSchema>;

export const UpdateGlobalSpeakerRequestSchema = z.object({
  display_name: z.string().min(1).optional(),
});
export type UpdateGlobalSpeakerRequest = z.infer<typeof UpdateGlobalSpeakerRequestSchema>;

export const UpdateGlobalSpeakerResponseSchema = z.object({
  global_speaker: GlobalSpeakerSchema,
});
export type UpdateGlobalSpeakerResponse = z.infer<typeof UpdateGlobalSpeakerResponseSchema>;

export const IngestVoiceRequestSchema = z.object({
  force: z.boolean().default(false),
});
export type IngestVoiceRequest = z.infer<typeof IngestVoiceRequestSchema>;

export const IngestVoiceResponseSchema = z.object({
  job: JobSchema,
});
export type IngestVoiceResponse = z.infer<typeof IngestVoiceResponseSchema>;

export const ListSignificantMarksResponseSchema = z.object({
  marks: z.array(SignificantMarkSchema),
});
export type ListSignificantMarksResponse = z.infer<typeof ListSignificantMarksResponseSchema>;

export const GetSpeakerVoiceResponseSchema = z.object({
  embedding: SpeakerEmbeddingSchema.nullable(),
});
export type GetSpeakerVoiceResponse = z.infer<typeof GetSpeakerVoiceResponseSchema>;
