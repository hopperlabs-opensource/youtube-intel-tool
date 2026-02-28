"use client";

import { useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { formatHms } from "@/lib/time";
import clsx from "clsx";
import type { TranscriptCue } from "@yt/contracts";

function findActiveIndex(cues: TranscriptCue[], atMs: number): number {
  let lo = 0;
  let hi = cues.length - 1;
  let best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const c = cues[mid];
    if (c.start_ms <= atMs) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

export function TranscriptPanel(props: {
  cues: TranscriptCue[];
  atMs: number;
  followMode: boolean;
  selectedCueId: string | null;
  speakerById?: Record<string, { key: string; label: string | null }>;
  onSeekToMs: (ms: number) => void;
  onSelectCueId: (cueId: string) => void;
}) {
  const parentRef = useRef<HTMLDivElement | null>(null);

  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: props.cues.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    overscan: 10,
  });

  const activeIdx = props.cues.length ? findActiveIndex(props.cues, props.atMs) : 0;

  // Keep the active cue in view when follow mode is on.
  useEffect(() => {
    if (!props.followMode) return;
    if (!props.cues.length) return;
    rowVirtualizer.scrollToIndex(activeIdx, { align: "center" });
  }, [activeIdx, props.followMode, props.cues.length, rowVirtualizer]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="text-sm font-semibold">Transcript</div>
        <div className="text-xs text-zinc-500">{props.cues.length.toLocaleString()} cues</div>
      </div>
      <div
        ref={(el) => {
          parentRef.current = el;
        }}
        className="h-full overflow-auto px-2 pb-4"
      >
        <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}>
          {rowVirtualizer.getVirtualItems().map((v) => {
            const cue = props.cues[v.index];
            const isActive = v.index === activeIdx;
            const isSelected = cue.id === props.selectedCueId;
            const speaker =
              cue.speaker_id && props.speakerById ? props.speakerById[cue.speaker_id] ?? null : null;
            const speakerLabel = speaker ? (speaker.label || speaker.key) : null;

            return (
              <div
                key={cue.id}
                className={clsx(
                  "absolute left-0 right-0 flex cursor-pointer gap-3 rounded-lg px-2 py-2 text-sm leading-5 hover:bg-zinc-100",
                  isActive && "bg-amber-100 hover:bg-amber-100",
                  isSelected && "ring-2 ring-amber-400"
                )}
                style={{ transform: `translateY(${v.start}px)` }}
                onClick={() => {
                  props.onSelectCueId(cue.id);
                  props.onSeekToMs(cue.start_ms);
                }}
              >
                <div className="w-24 shrink-0">
                  <div className="text-xs font-medium tabular-nums text-zinc-600">{formatHms(cue.start_ms)}</div>
                  {speakerLabel && <div className="mt-0.5 truncate text-[10px] font-medium text-zinc-500">{speakerLabel}</div>}
                </div>
                <div className="flex-1 text-zinc-900">{cue.text}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
