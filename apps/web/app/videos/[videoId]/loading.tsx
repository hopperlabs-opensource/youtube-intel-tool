import { Skeleton, SkeletonLines } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="h-screen bg-zinc-50">
      {/* Header skeleton */}
      <div className="flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-20 rounded-lg" />
          <Skeleton className="h-8 w-16 rounded-lg" />
        </div>
      </div>

      {/* 3-column grid skeleton (visible on lg+), stacked on smaller screens */}
      <div className="flex flex-col gap-3 p-3 lg:grid lg:h-[calc(100vh-56px)] lg:grid-cols-[420px_minmax(0,1fr)_420px]">
        {/* Transcript skeleton */}
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <SkeletonLines lines={12} />
        </div>

        {/* Player + notes skeleton */}
        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-zinc-200 bg-white p-3">
            <Skeleton className="aspect-video w-full rounded-lg" />
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-3">
            <SkeletonLines lines={3} />
          </div>
        </div>

        {/* Tabs skeleton */}
        <div className="rounded-xl border border-zinc-200 bg-white">
          <div className="flex border-b border-zinc-200 p-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="mx-1 h-6 flex-1 rounded" />
            ))}
          </div>
          <div className="p-4">
            <SkeletonLines lines={6} />
          </div>
        </div>
      </div>
    </div>
  );
}
