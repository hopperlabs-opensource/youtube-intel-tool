"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { SettingsButton } from "@/components/SettingsButton";

const NAV = [
  { href: "/", label: "Ingest" },
  { href: "/library", label: "Library" },
  { href: "/search", label: "Search" },
  { href: "/youtube", label: "YouTube" },
];

export function AppHeader(props?: { right?: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-sm font-semibold text-zinc-900">
            YouTube Intel
          </Link>

          <div className="flex items-center rounded-xl border border-zinc-200 bg-white p-1 text-xs">
            {NAV.map((n) => {
              const active = n.href === "/" ? pathname === "/" : pathname?.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={clsx(
                    "rounded-lg px-3 py-2 font-medium transition",
                    active ? "bg-amber-100 text-zinc-900" : "text-zinc-600 hover:bg-zinc-50"
                  )}
                >
                  {n.label}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {props?.right}
          <SettingsButton />
        </div>
      </div>
    </div>
  );
}
