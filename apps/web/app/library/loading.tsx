import { Skeleton, SkeletonCard } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div>
      <Skeleton className="h-10 w-full max-w-md" />
      <div className="mt-6 flex flex-col gap-3">
        <SkeletonCard lines={2} />
        <SkeletonCard lines={2} />
        <SkeletonCard lines={2} />
        <SkeletonCard lines={2} />
      </div>
    </div>
  );
}
