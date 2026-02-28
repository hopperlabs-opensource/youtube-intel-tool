import type { ReactNode } from "react";
import { AppHeader } from "@/components/AppHeader";
import { LibraryNav } from "@/components/LibraryNav";

export default function LibraryLayout(props: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[radial-gradient(1200px_800px_at_20%_-10%,rgba(251,191,36,0.25),transparent_60%),radial-gradient(1200px_800px_at_110%_20%,rgba(24,24,27,0.06),transparent_45%)]">
      <AppHeader />

      <div className="mx-auto max-w-6xl px-5 py-10">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">Library</h1>
          <p className="max-w-3xl text-sm leading-6 text-zinc-600">
            Videos you&apos;ve resolved and ingested live here. Use channels, people, and topics to narrow search scope.
          </p>
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <LibraryNav />
        </div>

        <div className="mt-6">{props.children}</div>
      </div>
    </div>
  );
}

