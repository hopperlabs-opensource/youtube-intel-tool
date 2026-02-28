"use client";

export function ErrorWithRetry(props: { message: string; onRetry: () => void; isRetrying?: boolean }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-3">
      <div className="text-sm text-red-700">{props.message}</div>
      <button
        className="mt-2 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
        onClick={props.onRetry}
        disabled={props.isRetrying}
      >
        {props.isRetrying ? "Retrying..." : "Retry"}
      </button>
    </div>
  );
}
