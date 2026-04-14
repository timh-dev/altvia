import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";
import type { UnitSystem } from "@/lib/units";
import { useAppStore, type UiScale, type ThemePreference } from "@/store/app-store";

type SettingsPanelProps = {
  open: boolean;
  onClose: () => void;
};

const UNIT_OPTIONS: { label: string; description: string; value: UnitSystem }[] = [
  {
    label: "Imperial",
    description: "Miles, °F, mph, inches",
    value: "imperial",
  },
  {
    label: "Metric",
    description: "Kilometers, °C, km/h, mm/cm",
    value: "metric",
  },
];

const UI_SCALE_OPTIONS: { label: string; description: string; value: UiScale }[] = [
  {
    label: "Normal",
    description: "Default sizing for all elements",
    value: "normal",
  },
  {
    label: "Compact",
    description: "Smaller UI (80% scale) for more map visibility",
    value: "compact",
  },
];

const THEME_OPTIONS: { label: string; description: string; value: ThemePreference }[] = [
  {
    label: "Light",
    description: "Light background with warm tones",
    value: "light",
  },
  {
    label: "Dark",
    description: "Deep terrain base with cool tones",
    value: "dark",
  },
  {
    label: "System",
    description: "Follow your operating system preference",
    value: "system",
  },
];

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const unitSystem = useAppStore((state) => state.unitSystem);
  const setUnitSystem = useAppStore((state) => state.setUnitSystem);
  const uiScale = useAppStore((state) => state.uiScale);
  const setUiScale = useAppStore((state) => state.setUiScale);
  const theme = useAppStore((state) => state.theme);
  const setTheme = useAppStore((state) => state.setTheme);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose();
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      ref={panelRef}
      className="pointer-events-auto absolute right-6 top-20 z-40 w-[320px] rounded-[1.35rem] border border-[var(--border-translucent)] bg-[var(--glass-panel-strong)] p-4 shadow-[0_24px_60px_var(--shadow-heavy)] backdrop-blur-[24px]"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.26em] text-[var(--text-label)]">Settings</p>
          <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">Unit Preferences</p>
        </div>
        <button onClick={onClose} className="text-sm text-[var(--text-subtle)]">
          Close
        </button>
      </div>
      <p className="mt-2 text-xs text-[var(--text-muted)]">
        Distances/pace, historic data, and weather follow this profile. Switch to adjust temperature, wind, and precipitation units instantly.
      </p>
      <div className="mt-4 grid gap-3">
        {UNIT_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setUnitSystem(option.value)}
            className={cn(
              "rounded-[1rem] border px-3 py-2 text-left transition",
              option.value === unitSystem
                ? "border-[var(--accent-green)] bg-[var(--accent-green)]/10 text-[var(--text-primary)]"
                : "border-[var(--border-secondary)] bg-[var(--surface-secondary)] text-[var(--text-muted)] hover:bg-[var(--surface-elevated)]",
            )}
          >
            <p className="text-sm font-semibold">{option.label}</p>
            <p className="text-xs">{option.description}</p>
          </button>
        ))}
      </div>
      <div className="mt-4 border-t border-[var(--border-translucent)] pt-4">
        <p className="text-sm font-semibold text-[var(--text-primary)]">Display Scale</p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Adjust overall UI density. Compact mode shrinks overlays for more map area.
        </p>
        <div className="mt-3 grid gap-3">
          {UI_SCALE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setUiScale(option.value)}
              className={cn(
                "rounded-[1rem] border px-3 py-2 text-left transition",
                option.value === uiScale
                  ? "border-[var(--accent-green)] bg-[var(--accent-green)]/10 text-[var(--text-primary)]"
                  : "border-[var(--border-secondary)] bg-[var(--surface-secondary)] text-[var(--text-muted)] hover:bg-[var(--surface-elevated)]",
              )}
            >
              <p className="text-sm font-semibold">{option.label}</p>
              <p className="text-xs">{option.description}</p>
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 border-t border-[var(--border-translucent)] pt-4">
        <p className="text-sm font-semibold text-[var(--text-primary)]">Theme</p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Choose a color scheme for the interface.
        </p>
        <div className="mt-3 grid gap-3">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setTheme(option.value)}
              className={cn(
                "rounded-[1rem] border px-3 py-2 text-left transition",
                option.value === theme
                  ? "border-[var(--accent-green)] bg-[var(--accent-green)]/10 text-[var(--text-primary)]"
                  : "border-[var(--border-secondary)] bg-[var(--surface-secondary)] text-[var(--text-muted)] hover:bg-[var(--surface-elevated)]",
              )}
            >
              <p className="text-sm font-semibold">{option.label}</p>
              <p className="text-xs">{option.description}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
