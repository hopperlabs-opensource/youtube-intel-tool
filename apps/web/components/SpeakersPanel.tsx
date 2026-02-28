"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { SpeakerSegment, VideoSpeaker } from "@yt/contracts";
import { ErrorWithRetry } from "@/components/ErrorWithRetry";
import { SkeletonLines } from "@/components/Skeleton";
import { getApiClient, toErrorMessage } from "@/lib/api_client";
import { formatHms } from "@/lib/time";

const EMPTY_SPEAKERS: VideoSpeaker[] = [];
const EMPTY_SEGMENTS: SpeakerSegment[] = [];

function findActiveSpeakerId(segments: SpeakerSegment[], atMs: number): string | null {
  if (!segments.length) return null;
  // segments are sorted by start_ms (API contract).
  let lo = 0;
  let hi = segments.length - 1;
  let best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segments[mid].start_ms <= atMs) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  // Scan forward a few in case of overlaps.
  for (let i = best; i < Math.min(segments.length, best + 6); i++) {
    const s = segments[i];
    if (s.start_ms <= atMs && atMs < s.end_ms) return s.speaker_id;
  }
  // Scan backward a bit as well.
  for (let i = best; i >= Math.max(0, best - 6); i--) {
    const s = segments[i];
    if (s.start_ms <= atMs && atMs < s.end_ms) return s.speaker_id;
  }
  return null;
}

export function SpeakersPanel(props: {
  videoId: string;
  transcriptId: string | null;
  atMs: number;
  onSeekToMs: (ms: number) => void;
}) {
  const api = getApiClient();
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState("");

  const speakersQ = useQuery({
    queryKey: ["videoSpeakers", props.videoId],
    queryFn: async () => (await api.listVideoSpeakers(props.videoId)).speakers as VideoSpeaker[],
  });

  const segmentsQ = useQuery({
    enabled: Boolean(props.transcriptId),
    queryKey: ["speakerSegments", props.videoId, props.transcriptId],
    queryFn: async () =>
      (
        await api.listSpeakerSegments(props.videoId, {
          transcript_id: props.transcriptId || undefined,
          limit: 50_000,
        })
      ).segments as SpeakerSegment[],
  });

  const speakers = speakersQ.data ?? EMPTY_SPEAKERS;
  const segments = segmentsQ.data ?? EMPTY_SEGMENTS;
  const activeSpeakerId = useMemo(() => findActiveSpeakerId(segments, props.atMs), [segments, props.atMs]);

  const bySpeaker = useMemo(() => {
    const map = new Map<string, SpeakerSegment[]>();
    for (const s of segments) {
      const arr = map.get(s.speaker_id);
      if (!arr) map.set(s.speaker_id, [s]);
      else arr.push(s);
    }
    return map;
  }, [segments]);

  const speakerStats = useMemo(() => {
    const stats = new Map<string, { total_ms: number; last_ms: number }>();
    for (const seg of segments) {
      const dur = Math.max(0, seg.end_ms - seg.start_ms);
      const ex = stats.get(seg.speaker_id) || { total_ms: 0, last_ms: 0 };
      ex.total_ms += dur;
      ex.last_ms = Math.max(ex.last_ms, seg.end_ms);
      stats.set(seg.speaker_id, ex);
    }
    return stats;
  }, [segments]);

  const selected = useMemo(
    () => speakers.find((s) => s.id === selectedSpeakerId) || null,
    [speakers, selectedSpeakerId]
  );

  const rename = useMutation({
    mutationFn: async (input: { speakerId: string; label: string | null }) => {
      try {
        const json = await api.updateVideoSpeaker(props.videoId, input.speakerId, { label: input.label });
        return json.speaker as VideoSpeaker;
      } catch (err: unknown) {
        throw new Error(toErrorMessage(err, "rename failed"));
      }
    },
    onSuccess: () => {
      void speakersQ.refetch();
    },
  });

  const selectedSegments = useMemo(() => {
    if (!selectedSpeakerId) return [];
    const arr = bySpeaker.get(selectedSpeakerId) || [];
    if (!arr.length) return [];

    // Show a window around the current time.
    let idx = 0;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i].start_ms <= props.atMs) idx = i;
      else break;
    }
    const start = Math.max(0, idx - 10);
    const end = Math.min(arr.length, start + 40);
    return arr.slice(start, end);
  }, [bySpeaker, selectedSpeakerId, props.atMs]);

  return (
    <div className="flex h-full flex-col">
      <div className="px-3 py-2 text-sm font-semibold">Speakers</div>
      <div className="h-full overflow-auto px-3 pb-4">
        {speakersQ.isPending && <SkeletonLines lines={4} />}
        {speakersQ.isError && (
          <ErrorWithRetry message="Failed to load speakers." onRetry={() => speakersQ.refetch()} isRetrying={speakersQ.isRefetching} />
        )}
        {!speakersQ.isPending && !speakersQ.isError && speakers.length === 0 && (
          <div className="text-sm text-zinc-500">No diarization yet. Re-ingest with diarization enabled.</div>
        )}

        <div className="flex flex-col gap-2">
          {speakers.map((s) => {
            const isSelected = selectedSpeakerId === s.id;
            const isActive = activeSpeakerId === s.id;
            const label = s.label || s.key;
            const stat = speakerStats.get(s.id);

            return (
              <button
                key={s.id}
                className={`rounded-lg border px-3 py-2 text-left hover:border-amber-300 ${
                  isSelected ? "border-amber-400 bg-amber-50" : "border-zinc-200 bg-white"
                }`}
                onClick={() => {
                  setSelectedSpeakerId(s.id);
                  setLabelDraft(s.label || "");
                }}
                title={s.id}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-zinc-900">
                      {label} {isActive ? <span className="text-xs text-amber-700">(speaking)</span> : null}
                    </div>
                    <div className="mt-0.5 text-[11px] text-zinc-500">{s.key}</div>
                  </div>
                  <div className="shrink-0 text-right text-[11px] text-zinc-500">
                    {stat ? `${Math.round(stat.total_ms / 1000)}s` : ""}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {selected && (
          <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-3">
            <div className="text-xs font-semibold text-zinc-700">Label</div>
            <div className="mt-2 flex gap-2">
              <input
                value={labelDraft}
                onChange={(e) => setLabelDraft(e.target.value)}
                placeholder="e.g. Lex"
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs outline-none focus:border-amber-400"
              />
              <button
                className="rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
                disabled={rename.isPending}
                onClick={() => {
                  const label = labelDraft.trim();
                  rename.mutate({ speakerId: selected.id, label: label ? label : null });
                }}
              >
                Save
              </button>
              <button
                className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium hover:bg-zinc-50 disabled:opacity-60"
                disabled={rename.isPending}
                onClick={() => {
                  setLabelDraft("");
                  rename.mutate({ speakerId: selected.id, label: null });
                }}
              >
                Clear
              </button>
            </div>
            {rename.isError && <div className="mt-2 text-xs text-red-600">Rename failed: {String(rename.error?.message || "")}</div>}
          </div>
        )}

        {selectedSpeakerId && (
          <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold text-zinc-700">Segments</div>
              <button
                className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] font-medium hover:bg-zinc-50"
                onClick={() => segmentsQ.refetch()}
              >
                Refresh
              </button>
            </div>

            {segmentsQ.isPending && <div className="mt-2"><SkeletonLines lines={4} /></div>}
            {segmentsQ.isError && (
              <div className="mt-2">
                <ErrorWithRetry message="Failed to load segments." onRetry={() => segmentsQ.refetch()} isRetrying={segmentsQ.isRefetching} />
              </div>
            )}
            {!segmentsQ.isPending && !segmentsQ.isError && selectedSegments.length === 0 && (
              <div className="mt-2 text-sm text-zinc-500">No segments.</div>
            )}

            <div className="mt-2 flex flex-col gap-2">
              {selectedSegments.map((seg) => (
                <button
                  key={seg.id}
                  className="rounded-lg bg-zinc-50 px-2 py-2 text-left hover:bg-amber-50"
                  onClick={() => props.onSeekToMs(seg.start_ms)}
                  title="Seek to segment"
                >
                  <div className="text-xs font-medium tabular-nums text-zinc-700">
                    {formatHms(seg.start_ms)}-{formatHms(seg.end_ms)}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
