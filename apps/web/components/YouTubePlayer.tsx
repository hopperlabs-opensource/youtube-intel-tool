"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

type YTPlayer = {
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  getCurrentTime: () => number;
  destroy: () => void;
};

type YTNamespace = {
  Player: new (
    element: string | HTMLElement,
    opts: {
      videoId: string;
      playerVars?: Record<string, unknown>;
      events?: {
        onReady?: () => void;
      };
    }
  ) => YTPlayer;
};

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export type YouTubePlayerHandle = {
  seekToMs: (ms: number) => void;
  getCurrentTimeMs: () => number;
};

let ytApiPromise: Promise<void> | null = null;

function loadYouTubeIframeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise<void>((resolve, reject) => {
    const startMs = Date.now();

    const waitForReady = () => {
      if (window.YT?.Player) {
        resolve();
        return;
      }
      if (Date.now() - startMs > 8_000) {
        reject(new Error("Timed out loading YouTube IFrame API"));
        return;
      }
      setTimeout(waitForReady, 50);
    };

    const existing = document.querySelector<HTMLScriptElement>("script[data-yt-iframe-api]");
    if (existing) {
      // Script exists (possibly already loaded). Poll for readiness.
      waitForReady();
      return;
    }

    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    tag.async = true;
    tag.dataset.ytIframeApi = "true";
    tag.onerror = () => reject(new Error("Failed to load YouTube IFrame API script"));
    document.head.appendChild(tag);

    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      try {
        prev?.();
      } finally {
        resolve();
      }
    };

    // Safety net: the global callback can be missed in some edge cases.
    waitForReady();
  }).catch((err) => {
    // Allow retry on subsequent calls.
    ytApiPromise = null;
    throw err;
  });

  return ytApiPromise;
}

export const YouTubePlayer = forwardRef<
  YouTubePlayerHandle,
  { providerVideoId: string; onReady?: () => void; onTimeMs?: (ms: number) => void }
>(function YouTubePlayer({ providerVideoId, onReady, onTimeMs }, ref) {
  const playerRef = useRef<YTPlayer | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const containerKey = useMemo(() => `yt:${providerVideoId}`, [providerVideoId]);
  const onReadyRef = useRef<typeof onReady>(onReady);
  const onTimeMsRef = useRef<typeof onTimeMs>(onTimeMs);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Keep the latest callbacks without forcing player re-init.
  onReadyRef.current = onReady;
  onTimeMsRef.current = onTimeMs;

  useImperativeHandle(
    ref,
    () => ({
      seekToMs: (ms: number) => {
        const seconds = ms / 1000;
        try {
          playerRef.current?.seekTo(seconds, true);
        } catch {}
      },
      getCurrentTimeMs: () => {
        try {
          const s = Number(playerRef.current?.getCurrentTime?.() ?? 0);
          return Math.max(0, Math.floor(s * 1000));
        } catch {
          return 0;
        }
      },
    }),
    []
  );

  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    (async () => {
      try {
        setLoadError(null);
        await loadYouTubeIframeApi();
        if (cancelled) return;

        // Destroy existing player if switching videos.
        try {
          playerRef.current?.destroy?.();
        } catch {}

        if (!window.YT?.Player) throw new Error("YouTube IFrame API failed to load");
        if (!containerRef.current) throw new Error("Player container not mounted");

        playerRef.current = new window.YT.Player(containerRef.current, {
          videoId: providerVideoId,
          playerVars: {
            autoplay: 0,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: () => {
              onReadyRef.current?.();
              interval = setInterval(() => {
                const s = Number(playerRef.current?.getCurrentTime?.() ?? 0);
                onTimeMsRef.current?.(Math.max(0, Math.floor(s * 1000)));
              }, 250);
            },
          },
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setLoadError(msg);
      }
    })();

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      try {
        playerRef.current?.destroy?.();
      } catch {}
    };
  }, [providerVideoId, containerKey]);

  return (
    <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
      {loadError ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center text-xs text-zinc-200">
          <div className="font-medium text-zinc-100">YouTube player failed to load.</div>
          <div className="max-w-[52ch] text-zinc-300">{loadError}</div>
          <a
            className="rounded-lg bg-white/10 px-3 py-2 text-xs font-medium text-white hover:bg-white/15"
            href={`https://www.youtube.com/watch?v=${providerVideoId}`}
            target="_blank"
            rel="noreferrer"
          >
            Open on YouTube
          </a>
        </div>
      ) : (
        <div ref={containerRef} className="h-full w-full" />
      )}
    </div>
  );
});
