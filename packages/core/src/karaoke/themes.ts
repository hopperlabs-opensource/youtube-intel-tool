import { KaraokeThemeSchema, type KaraokeTheme } from "@yt/contracts";

export const KARAOKE_THEMES: KaraokeTheme[] = [
  {
    id: "gold-stage",
    name: "Gold Stage",
    description: "Warm premium glow with subtle movement and high contrast lyrics.",
    class_name: "theme-gold-stage",
    skin_hint: "stage",
    palette: {
      primary: "#f6b73c",
      accent: "#e46f05",
      background: "#0f1114",
      surface: "#1a1f26",
      text: "#f7f8fb",
    },
  },
  {
    id: "neon-wave",
    name: "Neon Wave",
    description: "Electric cyan and magenta accents with pulse transitions.",
    class_name: "theme-neon-wave",
    skin_hint: "neon",
    palette: {
      primary: "#2afadf",
      accent: "#6a5cff",
      background: "#0e1220",
      surface: "#141b2a",
      text: "#f2f8ff",
    },
  },
  {
    id: "retro-strobe",
    name: "Retro Strobe",
    description: "Vintage saturated palette with stepped rhythm flashes.",
    class_name: "theme-retro-strobe",
    skin_hint: "retro",
    palette: {
      primary: "#ff4d6d",
      accent: "#ffbe0b",
      background: "#1b1020",
      surface: "#291732",
      text: "#fff7ed",
    },
  },
  {
    id: "minimal-clean",
    name: "Minimal Clean",
    description: "Low-noise neutral presentation for readability-first sessions.",
    class_name: "theme-minimal-clean",
    skin_hint: "minimal",
    palette: {
      primary: "#dde5f3",
      accent: "#90a0b5",
      background: "#101316",
      surface: "#171d25",
      text: "#f7f8fb",
    },
  },
].map((theme) => KaraokeThemeSchema.parse(theme));

export function getKaraokeThemeById(themeId: string): KaraokeTheme | null {
  const id = themeId.trim();
  if (!id) return null;
  return KARAOKE_THEMES.find((theme) => theme.id === id) ?? null;
}
