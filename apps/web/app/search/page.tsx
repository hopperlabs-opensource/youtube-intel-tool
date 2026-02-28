import { SearchPageClient } from "./search_page_client";
import { use } from "react";

function toSingle(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

export default function SearchPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Next.js dynamic APIs are async (searchParams is a Promise in React 19).
  const sp = (use(props.searchParams ?? Promise.resolve({})) || {}) as Record<
    string,
    string | string[] | undefined
  >;
  const q = (toSingle(sp.q) || "").trim();
  const channel = (toSingle(sp.channel) || "").trim() || null;
  const topic = (toSingle(sp.topic) || "").trim() || null;
  const person = (toSingle(sp.person) || "").trim() || null;
  return <SearchPageClient initialQuery={q} initialChannel={channel} initialTopic={topic} initialPerson={person} />;
}
