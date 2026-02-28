import { Skeleton, SkeletonCard } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="h-14 border-b border-zinc-200 bg-white" />
      <div className="mx-auto max-w-6xl px-5 py-12">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-4 h-4 w-96" />
        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <SkeletonCard lines={4} />
          <SkeletonCard lines={4} />
        </div>
      </div>
    </div>
  );
}
