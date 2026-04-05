import type { MouseEvent as ReactMouseEvent } from "react";

import type { PlannedWorkoutRoutePoint } from "@/lib/api";
import { formatDistance, formatElevation, type UnitSystem } from "@/lib/units";

export type ElevationChartPoint = {
  index: number;
  latitude: number;
  longitude: number;
  position: number;
  normalizedValue: number;
  rawValue: number;
};

export type ElevationChartSeries = {
  points: ElevationChartPoint[];
  minLabel: string;
  maxLabel: string;
  startLabel: string;
  endLabel: string;
};

export function buildElevationChartSeries(
  routePoints: PlannedWorkoutRoutePoint[],
  elevations: (number | null)[],
  unitSystem: UnitSystem,
): ElevationChartSeries | null {
  if (routePoints.length < 2 || elevations.length === 0) {
    return null;
  }

  const cumulativeDistances: number[] = [0];
  for (let i = 1; i < routePoints.length; i++) {
    const prev = routePoints[i - 1];
    const curr = routePoints[i];
    cumulativeDistances.push(
      cumulativeDistances[i - 1] + haversineMeters(prev.latitude, prev.longitude, curr.latitude, curr.longitude),
    );
  }

  const totalDistance = cumulativeDistances[cumulativeDistances.length - 1];
  if (totalDistance <= 0) {
    return null;
  }

  const validElevations: number[] = [];
  for (let i = 0; i < routePoints.length && i < elevations.length; i++) {
    const elev = elevations[i];
    if (elev != null && Number.isFinite(elev)) {
      validElevations.push(elev);
    }
  }

  if (validElevations.length === 0) {
    return null;
  }

  const minElev = Math.min(...validElevations);
  const maxElev = Math.max(...validElevations);
  const elevRange = maxElev - minElev || 1;

  const points: ElevationChartPoint[] = [];
  const count = Math.min(routePoints.length, elevations.length);
  for (let i = 0; i < count; i++) {
    const elev = elevations[i];
    if (elev == null || !Number.isFinite(elev)) {
      continue;
    }
    points.push({
      index: i,
      latitude: routePoints[i].latitude,
      longitude: routePoints[i].longitude,
      position: cumulativeDistances[i] / totalDistance,
      normalizedValue: (elev - minElev) / elevRange,
      rawValue: elev,
    });
  }

  if (points.length < 2) {
    return null;
  }

  return {
    points,
    minLabel: formatElevation(minElev, unitSystem),
    maxLabel: formatElevation(maxElev, unitSystem),
    startLabel: formatDistance(0, unitSystem),
    endLabel: formatDistance(totalDistance, unitSystem),
  };
}

export function ElevationChart({
  series,
  hoveredPointIndex,
  onHoverChange,
  onHoverClear,
}: {
  series: ElevationChartSeries;
  hoveredPointIndex: number | null;
  onHoverChange: (index: number) => void;
  onHoverClear: () => void;
}) {
  const width = 700;
  const height = 160;
  const paddingX = 12;
  const paddingY = 12;
  const innerWidth = width - paddingX * 2;
  const innerHeight = height - paddingY * 2;
  const points = series.points;
  const chartColor = "#8f5a1c";

  const path = points
    .map((point, i) => {
      const x = paddingX + point.position * innerWidth;
      const y = paddingY + (1 - point.normalizedValue) * innerHeight;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");

  const areaPath = `${path} L ${(paddingX + innerWidth).toFixed(2)} ${(paddingY + innerHeight).toFixed(2)} L ${paddingX.toFixed(2)} ${(paddingY + innerHeight).toFixed(2)} Z`;

  const hoveredPoint = points.find((p) => p.index === hoveredPointIndex) ?? null;
  const hoveredX = hoveredPoint ? paddingX + hoveredPoint.position * innerWidth : null;
  const hoveredY = hoveredPoint ? paddingY + (1 - hoveredPoint.normalizedValue) * innerHeight : null;

  function handlePointerMove(event: ReactMouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) {
      return;
    }

    const relativeX = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
    const closestPoint = points.reduce((closest, point) => {
      if (!closest) {
        return point;
      }
      return Math.abs(point.position - relativeX) < Math.abs(closest.position - relativeX) ? point : closest;
    }, null as ElevationChartPoint | null);

    if (closestPoint) {
      onHoverChange(closestPoint.index);
    }
  }

  return (
    <div className="relative overflow-hidden rounded-[1.2rem] border border-[rgba(221,213,200,0.55)] bg-[rgba(255,255,255,0.3)] px-3 py-3">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-40 w-full"
        onMouseMove={handlePointerMove}
        onMouseLeave={onHoverClear}
      >
        <defs>
          <linearGradient id="elevation-area-gradient" x1="0%" x2="0%" y1="0%" y2="100%">
            <stop offset="0%" stopColor={chartColor} stopOpacity="0.18" />
            <stop offset="100%" stopColor={chartColor} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <line
          x1={paddingX}
          y1={paddingY + innerHeight}
          x2={paddingX + innerWidth}
          y2={paddingY + innerHeight}
          stroke="rgba(92,86,77,0.22)"
          strokeWidth="1"
        />
        <path d={areaPath} fill="url(#elevation-area-gradient)" />
        <path d={path} fill="none" stroke={chartColor} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {hoveredX != null && hoveredY != null ? (
          <>
            <line
              x1={hoveredX}
              y1={paddingY}
              x2={hoveredX}
              y2={paddingY + innerHeight}
              stroke="rgba(29,26,23,0.14)"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
            <circle cx={hoveredX} cy={hoveredY} r="5.5" fill="#ffffff" stroke={chartColor} strokeWidth="2.5" />
          </>
        ) : null}
      </svg>
      <div className="mt-2 flex items-center justify-between text-[11px] text-[#6a6358]">
        <span>{series.startLabel}</span>
        <span>
          {series.minLabel} to {series.maxLabel}
        </span>
        <span>{series.endLabel}</span>
      </div>
    </div>
  );
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
