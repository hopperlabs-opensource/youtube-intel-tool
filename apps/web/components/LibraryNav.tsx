"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const TABS = [
  { href: "/library/videos", label: "Videos" },
  { href: "/library/channels", label: "Channels" },
  { href: "/library/people", label: "People" },
  { href: "/library/topics", label: "Topics" },
  { href: "/library/repair", label: "Repair" },
] as const;

export function LibraryNav() {
  const pathname = usePathname();

  return (
    <div className="flex flex-wrap items-center gap-2">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={clsx(
              "rounded-xl border px-3 py-2 text-xs font-medium transition",
              active
                ? "border-amber-200 bg-amber-50 text-amber-900"
                : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
