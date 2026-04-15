import type { MouseEvent as ReactMouseEvent } from "react";
import { useMemo, useState } from "react";

import type { ActivityRoutePoint } from "@/lib/api";

export type SimilarRouteMetricMode = "pace" | "hr" | "elevation";

type NormalizedSeries = {
  activityId: string;
  label: string;
  isReference: boolean;
  points: Array<{
    position: number;
    normalizedValue: number;
    rawValue: number;
  }>;
};

export function SimilarRoutesChart({
  referenceSeries,
  similarSeries,
  mode,
}: {
  referenceSeries: { activityId: string; label: string; routePoints: ActivityRoutePoint[] } | null;
  similarSeries: Array<{ activityId: string; label: string; routePoints: ActivityRoutePoint[] }>;
  mode: SimilarRouteMetricMode;
}) {
  const [hoveredX, setHoveredX] = useState<number | null>(null);

  const width = 700;
  const height = 200;
  const paddingX = 12;
  const paddingY = 12;
  const innerWidth = width - paddingX * 2;
  const innerHeight = height - paddingY * 2;

  const allSeries = useMemo(() => {
    const entries: Array<{ activityId: string; label: string; routePoints: ActivityRoutePoint[]; isReference: boolean }> = [];
    if (referenceSeries) {
      entries.push({ ...referenceSeries, isReference: true });
    }
    for (const s of similarSeries) {
      entries.push({ ...s, isReference: false });
    }

    // Find global min/max for normalization
    let globalMin = Infinity;
    let globalMax = -Infinity;
    const rawSeries: Array<{ activityId: string; label: string; isReference: boolean; points: Array<{ position: number; rawValue: number }> }> = [];

    for (const entry of entries) {
      const points = buildDistanceNormalizedPoints(entry.routePoints, mode);
      if (!points.length) continue;
      for (const p of points) {
        if (p.rawValue < globalMin) globalMin = p.rawValue;
        if (p.rawValue > globalMax) globalMax = p.rawValue;
      }
      rawSeries.push({ activityId: entry.activityId, label: entry.label, isReference: entry.isReference, points });
    }

    const range = globalMax - globalMin || 1;
    const normalized: NormalizedSeries[] = rawSeries.map((s) => ({
      ...s,
      points: s.points.map((p) => ({
        ...p,
        normalizedValue: (p.rawValue - globalMin) / range,
      })),
    }));

    return { series: normalized, globalMin, globalMax };
  }, [referenceSeries, similarSeries, mode]);

  const { series, globalMin, globalMax } = allSeries;

  if (series.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-[1.2rem] border border-[var(--border-translucent-strong)] bg-[var(--glass-card-light)] text-xs text-[var(--text-muted)]">
        No route data available for comparison.
      </div>
    );
  }

  function handlePointerMove(event: ReactMouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const relX = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
    setHoveredX(relX);
  }

  // Build hover values for each series at the hovered X position
  const hoverValues = hoveredX != null
    ? series.map((s) => {
        const closest = s.points.reduce((best, p) =>
          !best || Math.abs(p.position - hoveredX) < Math.abs(best.position - hoveredX) ? p : best,
          null as NormalizedSeries["points"][number] | null,
        );
        return { label: s.label, isReference: s.isReference, rawValue: closest?.rawValue ?? null };
      })
    : [];

  const hoverScreenX = hoveredX != null ? paddingX + hoveredX * innerWidth : null;

  return (
    <div className="relative overflow-hidden rounded-[1.2rem] border border-[var(--border-translucent-strong)] bg-[var(--glass-card-light)] px-3 py-3">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-[200px] w-full"
        onMouseMove={handlePointerMove}
        onMouseLeave={() => setHoveredX(null)}
      >
        <line
          x1={paddingX} y1={paddingY + innerHeight}
          x2={paddingX + innerWidth} y2={paddingY + innerHeight}
          style={{ stroke: "var(--chart-axis)" }} strokeWidth="1"
        />
        {/* Similar routes first (behind) */}
        {series.filter((s) => !s.isReference).map((s, i) => {
          const path = buildSvgPath(s.points, paddingX, paddingY, innerWidth, innerHeight);
          return (
            <path
              key={s.activityId}
              d={path}
              fill="none"
              stroke={`rgba(148, 163, 184, ${0.25 + (i * 0.05)})`}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}
        {/* Reference route on top */}
        {series.filter((s) => s.isReference).map((s) => {
          const path = buildSvgPath(s.points, paddingX, paddingY, innerWidth, innerHeight);
          return (
            <path
              key={s.activityId}
              d={path}
              fill="none"
              stroke="#22d3ee"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}
        {/* Hover crosshair */}
        {hoverScreenX != null ? (
          <line
            x1={hoverScreenX} y1={paddingY}
            x2={hoverScreenX} y2={paddingY + innerHeight}
            style={{ stroke: "var(--chart-hover-line)" }}
            strokeWidth="1" strokeDasharray="4 4"
          />
        ) : null}
      </svg>

      {/* Hover tooltip */}
      {hoveredX != null && hoverValues.length > 0 ? (
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-[var(--text-muted)]">
          {hoverValues.map((hv) => (
            <span key={hv.label} className={hv.isReference ? "font-semibold text-[#22d3ee]" : ""}>
              {hv.label}: {hv.rawValue != null ? formatMetricValue(hv.rawValue, mode) : "—"}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--text-subtle)]">
        <span>Start</span>
        <span>
          {formatMetricValue(globalMin, mode)} to {formatMetricValue(globalMax, mode)}
        </span>
        <span>Finish</span>
      </div>
    </div>
  );
}

function buildDistanceNormalizedPoints(
  routePoints: ActivityRoutePoint[],
  mode: SimilarRouteMetricMode,
): Array<{ position: number; rawValue: number }> {
  if (routePoints.length < 2) return [];

  // Compute cumulative distances
  const cumDist: number[] = [0];
  for (let i = 1; i < routePoints.length; i++) {
    const prev = routePoints[i - 1];
    const curr = routePoints[i];
    cumDist.push(cumDist[i - 1] + haversineMeters(prev.latitude, prev.longitude, curr.latitude, curr.longitude));
  }
  const totalDist = cumDist[cumDist.length - 1];
  if (totalDist <= 0) return [];

  const points: Array<{ position: number; rawValue: number }> = [];
  for (let i = 0; i < routePoints.length; i++) {
    const raw = extractMetric(routePoints[i], mode);
    if (raw == null || !Number.isFinite(raw)) continue;
    points.push({ position: cumDist[i] / totalDist, rawValue: raw });
  }
  return points;
}

function extractMetric(point: ActivityRoutePoint, mode: SimilarRouteMetricMode): number | null {
  switch (mode) {
    case "pace":
      return point.pace_seconds_per_mile ?? null;
    case "hr":
      return point.heart_rate_bpm ?? null;
    case "elevation":
      return point.elevation_meters ?? null;
  }
}

function buildSvgPath(
  points: Array<{ position: number; normalizedValue: number }>,
  px: number, py: number, iw: number, ih: number,
): string {
  return points
    .map((p, i) => {
      const x = px + p.position * iw;
      const y = py + (1 - p.normalizedValue) * ih;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function formatMetricValue(value: number, mode: SimilarRouteMetricMode): string {
  switch (mode) {
    case "pace": {
      const totalSec = Math.round(value);
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      return `${min}:${sec.toString().padStart(2, "0")}/mi`;
    }
    case "hr":
      return `${Math.round(value)} bpm`;
    case "elevation":
      return `${Math.round(value)}m`;
  }
}

function haversineMeters(latA: number, lngA: number, latB: number, lngB: number) {
  const R = 6_371_000;
  const dLat = toRad(latB - latA);
  const dLng = toRad(lngB - lngA);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(latA)) * Math.cos(toRad(latB)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}
