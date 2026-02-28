import { VideoPageClient } from "./video_page_client";
import { use } from "react";
import { notFound } from "next/navigation";

function toSingle(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

export default function VideoPage(props: {
  params: Promise<{ videoId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Next.js dynamic APIs are async (params/searchParams are Promises in React 19).
  const { videoId } = use(props.params);
  if (!videoId || videoId === "undefined") notFound();

  const sp = (use(props.searchParams ?? Promise.resolve({})) || {}) as Record<
    string,
    string | string[] | undefined
  >;
  const atMsRaw = toSingle(sp.at_ms);
  const tRaw = toSingle(sp.t);
  const cueId = toSingle(sp.cue_id) || null;

  const atMs =
    atMsRaw && Number.isFinite(Number(atMsRaw))
      ? Math.max(0, Math.floor(Number(atMsRaw)))
      : tRaw && Number.isFinite(Number(tRaw))
        ? Math.max(0, Math.floor(Number(tRaw) * 1000))
        : null;

  return <VideoPageClient videoId={videoId} initialAtMs={atMs} initialCueId={cueId} />;
}
