export type WikipediaSummary = {
  title: string;
  extract: string;
  content_urls?: { desktop?: { page?: string } };
  type?: string;
};

export async function fetchWikipediaSummary(title: string): Promise<WikipediaSummary | null> {
  const encoded = encodeURIComponent(title.replace(/\s+/g, "_"));
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`;

  const res = await fetch(url, {
    headers: {
      "accept": "application/json",
      "user-agent": "youtube-intel-tool/0.0.1 (local)",
    },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as WikipediaSummary;
  if (!data?.title || !data?.extract) return null;
  return data;
}

