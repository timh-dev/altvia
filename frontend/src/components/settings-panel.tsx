import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";
import type { UnitSystem } from "@/lib/units";
import { useAppStore } from "@/store/app-store";

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

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const unitSystem = useAppStore((state) => state.unitSystem);
  const setUnitSystem = useAppStore((state) => state.setUnitSystem);

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
      className="pointer-events-auto absolute right-6 top-20 z-40 w-[320px] rounded-[1.35rem] border border-[rgba(217,209,197,0.68)] bg-[rgba(250,247,241,0.95)] p-4 shadow-[0_24px_60px_rgba(17,17,17,0.15)] backdrop-blur-[24px]"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.26em] text-[#5d7f8f]">Settings</p>
          <p className="mt-1 text-sm font-semibold text-[#111111]">Unit Preferences</p>
        </div>
        <button onClick={onClose} className="text-sm text-[#6a6358]">
          Close
        </button>
      </div>
      <p className="mt-2 text-xs text-[#5c564d]">
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
                ? "border-[#1B5E20] bg-[#1B5E20]/10 text-[#0f2a10]"
                : "border-[#d7cec1] bg-[#fbf8f2] text-[#5c564d] hover:bg-white",
            )}
          >
            <p className="text-sm font-semibold">{option.label}</p>
            <p className="text-xs">{option.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
