import { KaraokeThemeSchema, type KaraokeTheme } from "@yt/contracts";

export const KARAOKE_THEMES: KaraokeTheme[] = [
  {
    id: "gold-stage",
    name: "Gold Stage",
    description: "Warm premium glow with subtle movement and high contrast lyrics.",
    class_name: "theme-gold-stage",
  },
  {
    id: "neon-wave",
    name: "Neon Wave",
    description: "Electric cyan and magenta accents with pulse transitions.",
    class_name: "theme-neon-wave",
  },
  {
    id: "retro-strobe",
    name: "Retro Strobe",
    description: "Vintage saturated palette with stepped rhythm flashes.",
    class_name: "theme-retro-strobe",
  },
  {
    id: "minimal-clean",
    name: "Minimal Clean",
    description: "Low-noise neutral presentation for readability-first sessions.",
    class_name: "theme-minimal-clean",
  },
].map((theme) => KaraokeThemeSchema.parse(theme));

export function getKaraokeThemeById(themeId: string): KaraokeTheme | null {
  const id = themeId.trim();
  if (!id) return null;
  return KARAOKE_THEMES.find((theme) => theme.id === id) ?? null;
}
