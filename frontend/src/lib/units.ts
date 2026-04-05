export type UnitSystem = "imperial" | "metric";

export const DEFAULT_UNIT_SYSTEM: UnitSystem = "imperial";

const METERS_PER_MILE = 1609.344;
const METERS_PER_KILOMETER = 1000;
const FEET_PER_METER = 3.28084;
const MILLIMETERS_PER_INCH = 25.4;
const CENTIMETERS_PER_INCH = 2.54;
const KMH_TO_MPH = 1.60934;

export const MIN_VALID_PACE_SECONDS_PER_MILE = 2 * 60;
export const MAX_VALID_PACE_SECONDS_PER_MILE = 60 * 60;

export function sanitizePaceSecondsPerMile(secondsPerMile: number | null | undefined) {
  if (
    secondsPerMile == null ||
    !Number.isFinite(secondsPerMile) ||
    secondsPerMile < MIN_VALID_PACE_SECONDS_PER_MILE ||
    secondsPerMile > MAX_VALID_PACE_SECONDS_PER_MILE
  ) {
    return null;
  }

  return secondsPerMile;
}

function formatValue(value: number, decimals = 0) {
  if (decimals <= 0) {
    return `${Math.round(value)}`;
  }
  return value.toFixed(decimals);
}

export function formatDistance(distanceMeters: number | null | undefined, unitSystem: UnitSystem) {
  if (distanceMeters == null || !Number.isFinite(distanceMeters)) {
    return "Unknown";
  }

  if (unitSystem === "imperial") {
    const miles = distanceMeters / METERS_PER_MILE;
    return `${miles.toFixed(2)} mi`;
  }

  const kilometers = distanceMeters / METERS_PER_KILOMETER;
  return `${kilometers.toFixed(2)} km`;
}

export function formatElevation(meters: number | null | undefined, unitSystem: UnitSystem) {
  if (meters == null || !Number.isFinite(meters)) {
    return "Unknown";
  }

  if (unitSystem === "imperial") {
    const feet = meters * FEET_PER_METER;
    return `${Math.round(feet)} ft`;
  }

  return `${Math.round(meters)} m`;
}

export function formatPace(secondsPerMile: number | null | undefined, unitSystem: UnitSystem) {
  const sanitizedSeconds = sanitizePaceSecondsPerMile(secondsPerMile);
  if (sanitizedSeconds == null) {
    return "Unknown";
  }

  const paceSeconds = unitSystem === "imperial" ? sanitizedSeconds : sanitizedSeconds * (METERS_PER_KILOMETER / METERS_PER_MILE);
  const rounded = Math.round(paceSeconds);
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;
  const suffix = unitSystem === "imperial" ? "/mi" : "/km";
  return `${minutes}:${seconds.toString().padStart(2, "0")} ${suffix}`;
}

export function formatTemperature(valueC: number | null | undefined, unitSystem: UnitSystem) {
  if (valueC == null || !Number.isFinite(valueC)) {
    return "N/A";
  }

  if (unitSystem === "imperial") {
    const fahrenheit = valueC * 1.8 + 32;
    return `${Math.round(fahrenheit)}°F`;
  }

  return `${Math.round(valueC)}°C`;
}

export function formatWind(speedKmh: number | null | undefined, unitSystem: UnitSystem) {
  if (speedKmh == null || !Number.isFinite(speedKmh)) {
    return "N/A";
  }

  if (unitSystem === "imperial") {
    const mph = speedKmh / KMH_TO_MPH;
    return `${Math.round(mph)} mph`;
  }

  return `${Math.round(speedKmh)} km/h`;
}

export function formatRain(mm: number | null | undefined, unitSystem: UnitSystem) {
  if (mm == null || !Number.isFinite(mm)) {
    return "N/A";
  }

  if (unitSystem === "imperial") {
    const inches = mm / MILLIMETERS_PER_INCH;
    return `${inches.toFixed(2)} in`;
  }

  return `${mm.toFixed(1)} mm`;
}

export function formatSnow(cm: number | null | undefined, unitSystem: UnitSystem) {
  if (cm == null || !Number.isFinite(cm)) {
    return "N/A";
  }

  if (unitSystem === "imperial") {
    const inches = cm / CENTIMETERS_PER_INCH;
    return `${inches.toFixed(1)} in`;
  }

  return `${cm.toFixed(1)} cm`;
}

export function formatMeters(valueMeters: number | null | undefined, unitSystem: UnitSystem) {
  if (valueMeters == null || !Number.isFinite(valueMeters)) {
    return "N/A";
  }

  if (unitSystem === "imperial") {
    const feet = valueMeters * FEET_PER_METER;
    return `${formatValue(feet, 1)} ft`;
  }

  return `${formatValue(valueMeters, 1)} m`;
}
