export function Skeleton(props: { className?: string }) {
  return <div className={`animate-pulse rounded bg-zinc-200 ${props.className ?? "h-4 w-full"}`} />;
}

export function SkeletonLines(props: { lines?: number }) {
  const n = props.lines ?? 3;
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: n }, (_, i) => (
        <Skeleton key={i} className={`h-3 ${i === n - 1 ? "w-2/3" : "w-full"}`} />
      ))}
    </div>
  );
}

export function SkeletonCard(props: { lines?: number }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <SkeletonLines lines={props.lines} />
    </div>
  );
}
