import type { KaraokeUiSettings } from "@yt/experience-core";
import type { CSSProperties, PropsWithChildren } from "react";

type CardProps = PropsWithChildren<{
  className?: string;
  style?: CSSProperties;
}>;

export function KaraokeCard({ className, style, children }: CardProps) {
  return (
    <section className={className ? `panel ${className}` : "panel"} style={style}>
      {children}
    </section>
  );
}

type ThemeSelectProps = {
  themes: Array<{ id: string; name: string }>;
  value: string;
  onChange: (next: string) => void;
};

export function KaraokeThemeSelect({ themes, value, onChange }: ThemeSelectProps) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {themes.map((theme) => (
        <option key={theme.id} value={theme.id}>
          {theme.name}
        </option>
      ))}
    </select>
  );
}

type SkinControlsProps = {
  settings: KaraokeUiSettings;
  onChange: (next: KaraokeUiSettings) => void;
  showHideUpcoming?: boolean;
};

export function KaraokeSkinControls({ settings, onChange, showHideUpcoming = false }: SkinControlsProps) {
  return (
    <div className="row" style={{ marginTop: 6 }}>
      <select
        value={settings.themeMode}
        onChange={(e) => onChange({ ...settings, themeMode: e.target.value as KaraokeUiSettings["themeMode"] })}
        style={{ maxWidth: 140 }}
      >
        <option value="theme">Theme</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
      <input
        type="range"
        min={0.8}
        max={1.6}
        step={0.05}
        value={settings.lyricScale}
        onChange={(e) => onChange({ ...settings, lyricScale: Number(e.target.value) })}
        style={{ maxWidth: 140 }}
      />
      {showHideUpcoming ? (
        <label className="muted" style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="checkbox"
            checked={settings.hideUpcomingTitles}
            onChange={(e) => onChange({ ...settings, hideUpcomingTitles: e.target.checked })}
          />
          Hide up-next titles
        </label>
      ) : null}
    </div>
  );
}
