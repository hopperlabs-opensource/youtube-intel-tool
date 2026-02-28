const MUSIC_TAG_RE = /\[(music|Music)\]/g;

export function normalizeCueText(text: string): string {
  return (
    text
      .replace(/\s+/g, " ")
      .replace(MUSIC_TAG_RE, "")
      .replace(/\u00A0/g, " ")
      .trim()
      // Keep casing for display, but we can also lower-case if desired for search.
  );
}

