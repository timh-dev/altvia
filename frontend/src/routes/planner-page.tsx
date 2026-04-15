import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  LogOut,
  Map,
  Plus,
  RotateCcw,
  Save,
  Settings,
  Trash2,
  User,
} from "lucide-react";
import maplibregl, { type GeoJSONSource, type Map as MaplibreMap } from "maplibre-gl";

import { Button } from "@/components/ui/button";
import { ElevationChart, buildElevationChartSeries } from "@/components/elevation-chart";
import { PlaceSearch } from "@/components/place-search";
import { SettingsPanel } from "@/components/settings-panel";
import {
  analyzePlannerRoute,
  createPlannedWorkout,
  deletePlannedWorkout,
  fetchElevation,
  fetchPlannedWorkoutMapFeatures,
  fetchPlannedWorkouts,
  planRoute,
  type ClusterPredictionResponse,
  type ElevationResponse,
  type IntensityPredictionResponse,
  type PlannerWeatherSummary,
  type PlannedWorkoutMapFeatureCollection,
  type PlannedWorkoutRoutePoint,
  type PlannedWorkoutSummary,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  formatDistance,
  formatElevation,
  formatPace,
  formatRain,
  formatSnow,
  formatTemperature,
  formatWind,
  type UnitSystem,
} from "@/lib/units";
import { useAppStore } from "@/store/app-store";

const DEFAULT_CENTER: [number, number] = [-105.25, 39.65];
const EMPTY_FEATURE_COLLECTION: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
const EMPTY_PLANNED_COLLECTION: PlannedWorkoutMapFeatureCollection = { type: "FeatureCollection", features: [] };
const PLANNER_BASE_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const PLANNER_TERRAIN_SOURCE_ID = "planner-terrain-dem";
const PLANNER_HILLSHADE_LAYER_ID = "planner-terrain-hillshade";
const PLANNER_TERRAIN_TILES = ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"];

type PlannedWorkoutType = "running" | "cycling" | "swimming" | "hiking";
type DraftRouteSource = "manual" | "osrm" | "valhalla";

export function PlannerPage() {
  const logout = useAppStore((state) => state.logout);
  const openMap = useAppStore((state) => state.navigateTo);
  const unitSystem = useAppStore((state) => state.unitSystem);
  const uiScale = useAppStore((state) => state.uiScale);
  const isCompact = uiScale === "compact";
  const [chartMinimized, setChartMinimized] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [waypoints, setWaypoints] = useState<PlannedWorkoutRoutePoint[]>([]);
  const [draftRoutePoints, setDraftRoutePoints] = useState<PlannedWorkoutRoutePoint[]>([]);
  const [draftRouteSource, setDraftRouteSource] = useState<DraftRouteSource>("manual");
  const [loadedRoutePoints, setLoadedRoutePoints] = useState<PlannedWorkoutRoutePoint[] | null>(null);
  const [loadedPlanId, setLoadedPlanId] = useState<string | null>(null);
  const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null);
  const [plannedWorkouts, setPlannedWorkouts] = useState<PlannedWorkoutSummary[]>([]);
  const [plannedMapData, setPlannedMapData] = useState<PlannedWorkoutMapFeatureCollection>(EMPTY_PLANNED_COLLECTION);
  const [activityType, setActivityType] = useState<PlannedWorkoutType>("running");
  const [workoutName, setWorkoutName] = useState("Planned Run");
  const [plannedFor, setPlannedFor] = useState("");
  const [targetPaceInput, setTargetPaceInput] = useState("");
  const [outAndBack, setOutAndBack] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [routing, setRouting] = useState(false);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [plannerWeather, setPlannerWeather] = useState<PlannerWeatherSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elevationData, setElevationData] = useState<ElevationResponse | null>(null);
  const [elevationLoading, setElevationLoading] = useState(false);
  const [hoveredElevationPointIndex, setHoveredElevationPointIndex] = useState<number | null>(null);
  const [sidebarTab, setSidebarTab] = useState<"create" | "plans">("create");
  const [planFilterType, setPlanFilterType] = useState<"all" | PlannedWorkoutType>("all");
  const [locationNames, setLocationNames] = useState<Record<string, string>>({});
  const [terrainEnabled, setTerrainEnabled] = useState(false);
  const [predictedIntensity, setPredictedIntensity] = useState<IntensityPredictionResponse | null>(null);
  const [intensityLoading, setIntensityLoading] = useState(false);
  const [predictedCluster, setPredictedCluster] = useState<ClusterPredictionResponse | null>(null);
  const [clusterLoading, setClusterLoading] = useState(false);
  const geocodeCacheRef = useRef<Record<string, string>>({});

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const effectiveRoutePoints = useMemo(() => {
    if (loadedRoutePoints) {
      return loadedRoutePoints;
    }
    return buildOutAndBackRoute(draftRoutePoints, outAndBack);
  }, [draftRoutePoints, loadedRoutePoints, outAndBack]);
  const draftDistanceMeters = useMemo(() => calculateRouteDistanceMeters(effectiveRoutePoints), [effectiveRoutePoints]);
  const canSave = effectiveRoutePoints.length >= 2 && workoutName.trim().length > 0 && !saving;
  const routeBearing = useMemo(() => calculateRouteBearing(effectiveRoutePoints), [effectiveRoutePoints]);
  const estimatedDurationSeconds = useMemo(() => {
    // Parse "MM:SS" pace input → derive duration from distance
    if (targetPaceInput.trim() && draftDistanceMeters > 0) {
      const parts = targetPaceInput.trim().split(":");
      if (parts.length === 2) {
        const mins = Number(parts[0]);
        const secs = Number(parts[1]);
        if (!isNaN(mins) && !isNaN(secs)) {
          const paceSecsPerUnit = mins * 60 + secs;
          // input is per km if metric, per mile if imperial
          const distanceUnits = unitSystem === "imperial" ? draftDistanceMeters / 1609.344 : draftDistanceMeters / 1000;
          return paceSecsPerUnit * distanceUnits;
        }
      }
    }
    return estimatePlannerDurationSeconds(activityType, draftDistanceMeters);
  }, [activityType, draftDistanceMeters, targetPaceInput, unitSystem]);
  const windRelationLabel = plannerWeather?.wind_direction_deg != null ? describeWindRelation(plannerWeather.wind_direction_deg, routeBearing) : null;
  const waveDirectionLabel = plannerWeather?.wave_direction_deg != null ? formatCompassHeading(plannerWeather.wave_direction_deg) : null;
  const elevationChartSeries = useMemo(
    () => elevationData ? buildElevationChartSeries(effectiveRoutePoints, elevationData.elevations, unitSystem) : null,
    [effectiveRoutePoints, elevationData, unitSystem],
  );
  const showPlannerChartPanel = activityType !== "swimming"
    && Boolean(elevationLoading || elevationChartSeries || elevationData || effectiveRoutePoints.length >= 2);

  const locationGroups = useMemo(() => {
    const filtered = planFilterType === "all"
      ? plannedWorkouts
      : plannedWorkouts.filter((w) => w.activity_type === planFilterType);

    const groups: Record<string, { center: { latitude: number; longitude: number }; plans: PlannedWorkoutSummary[] }> = {};

    for (const plan of filtered) {
      const mid = calculateRouteMidpoint(plan.route_points);
      if (!mid) continue;
      const gridLat = Math.round(mid.latitude / 0.15) * 0.15;
      const gridLng = Math.round(mid.longitude / 0.15) * 0.15;
      const key = `${gridLat.toFixed(2)},${gridLng.toFixed(2)}`;
      const existing = groups[key];
      if (existing) {
        existing.plans.push(plan);
      } else {
        groups[key] = { center: { latitude: gridLat, longitude: gridLng }, plans: [plan] };
      }
    }

    return Object.entries(groups).map(([locationKey, group]) => ({
      locationKey,
      center: group.center,
      plans: group.plans,
    }));
  }, [plannedWorkouts, planFilterType]);

  useEffect(() => {
    const unresolvedGroups = locationGroups.filter(
      (group) => !(group.locationKey in geocodeCacheRef.current),
    );
    if (unresolvedGroups.length === 0) return;

    let cancelled = false;
    const controller = new AbortController();

    async function resolveLocations() {
      for (let i = 0; i < unresolvedGroups.length; i++) {
        if (cancelled) return;
        const group = unresolvedGroups[i];
        if (i > 0) await new Promise((resolve) => setTimeout(resolve, 1000));
        if (cancelled) return;

        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${group.center.latitude}&lon=${group.center.longitude}&format=jsonv2&zoom=10`,
            { signal: controller.signal },
          );
          if (cancelled) return;
          const data = await response.json();
          const address = data.address ?? {};
          const city = address.city ?? address.town ?? address.village ?? address.county ?? "";
          const state = address.state ?? address.country ?? "";
          const displayName = city && state ? `${city}, ${state}` : city || state || `${group.center.latitude.toFixed(1)}, ${group.center.longitude.toFixed(1)}`;
          geocodeCacheRef.current[group.locationKey] = displayName;
          if (!cancelled) {
            setLocationNames((prev) => ({ ...prev, [group.locationKey]: displayName }));
          }
        } catch {
          if (!cancelled) {
            const fallback = `${group.center.latitude.toFixed(1)}, ${group.center.longitude.toFixed(1)}`;
            geocodeCacheRef.current[group.locationKey] = fallback;
            setLocationNames((prev) => ({ ...prev, [group.locationKey]: fallback }));
          }
        }
      }
    }

    void resolveLocations();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [locationGroups]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => setUserLocation([position.coords.longitude, position.coords.latitude]),
      () => setUserLocation(null),
      { enableHighAccuracy: true, maximumAge: 300_000, timeout: 10_000 },
    );
  }, []);

  useEffect(() => {
    if (!profileMenuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!profileMenuRef.current?.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [profileMenuOpen]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: PLANNER_BASE_STYLE_URL,
      center: userLocation ?? DEFAULT_CENTER,
      zoom: 10,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");

    map.on("load", () => {
      ensurePlannerTerrainLayers(map);

      map.addSource("planned-workouts", { type: "geojson", data: EMPTY_PLANNED_COLLECTION });
      map.addSource("draft-route", { type: "geojson", data: EMPTY_FEATURE_COLLECTION });

      map.addLayer({
        id: "planned-workouts",
        type: "line",
        source: "planned-workouts",
        paint: {
          "line-color": "rgba(29, 26, 23, 0.28)",
          "line-width": 3,
          "line-opacity": 0.72,
        },
      });

      map.addLayer({
        id: "draft-route",
        type: "line",
        source: "draft-route",
        paint: {
          "line-color": "#1B5E20",
          "line-width": 5,
          "line-opacity": 0.96,
        },
      });

      map.addLayer({
        id: "draft-route-points",
        type: "circle",
        source: "draft-route",
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-radius": 5,
          "circle-color": "#ffffff",
          "circle-stroke-width": 2.5,
          "circle-stroke-color": "#1B5E20",
        },
      });

      map.addSource("elevation-hover-point", { type: "geojson", data: EMPTY_FEATURE_COLLECTION });
      map.addLayer({
        id: "elevation-hover-point",
        type: "circle",
        source: "elevation-hover-point",
        paint: {
          "circle-radius": 6,
          "circle-color": "#ffffff",
          "circle-stroke-width": 2.5,
          "circle-stroke-color": "#8f5a1c",
        },
      });

      map.on("click", (event) => {
        clearPlannerAnalysisState();
        setLoadedRoutePoints(null);
        setLoadedPlanId(null);
        setWaypoints((current) => [
          ...current,
          { latitude: event.lngLat.lat, longitude: event.lngLat.lng },
        ]);
      });

      applyPlannerPathStyling(map);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [userLocation]);

  useEffect(() => {
    void loadPlannerWorkspace();
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource("draft-route") || !map.getSource("planned-workouts")) {
      return;
    }

    const draftSource = map.getSource("draft-route") as GeoJSONSource;
    draftSource.setData(buildDraftRouteCollection(effectiveRoutePoints, waypoints));

    const plannedSource = map.getSource("planned-workouts") as GeoJSONSource;
    plannedSource.setData(plannedMapData);
  }, [effectiveRoutePoints, plannedMapData, waypoints]);

  useEffect(() => {
    if (waypoints.length < 2) {
      setDraftRoutePoints(waypoints);
      setDraftRouteSource("manual");
      return;
    }

    if (activityType === "swimming") {
      setDraftRoutePoints(waypoints);
      setDraftRouteSource("manual");
      return;
    }

    let cancelled = false;
    setRouting(true);

    void planRoute({
      activity_type: activityType,
      waypoints,
    })
      .then((plannedRoute) => {
        if (!cancelled) {
          setDraftRoutePoints(plannedRoute.route_points);
          setDraftRouteSource(plannedRoute.source === "valhalla" ? "valhalla" : plannedRoute.source === "osrm" ? "osrm" : "manual");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDraftRoutePoints(waypoints);
          setDraftRouteSource("manual");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setRouting(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activityType, waypoints]);

  useEffect(() => {
    if (effectiveRoutePoints.length < 2) {
      setElevationData(null);
      setElevationLoading(false);
      return;
    }

    let cancelled = false;
    setElevationLoading(activityType !== "swimming");

    void fetchElevation(effectiveRoutePoints)
      .then((result) => {
        if (cancelled) {
          return;
        }

        setElevationData(result);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setElevationData(null);
      })
      .finally(() => {
        if (cancelled) {
          return;
        }

        setElevationLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activityType, effectiveRoutePoints]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource("elevation-hover-point")) {
      return;
    }

    const source = map.getSource("elevation-hover-point") as GeoJSONSource;
    if (hoveredElevationPointIndex == null || hoveredElevationPointIndex >= effectiveRoutePoints.length) {
      source.setData(EMPTY_FEATURE_COLLECTION);
      return;
    }

    const point = effectiveRoutePoints[hoveredElevationPointIndex];
    source.setData({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [point.longitude, point.latitude] },
          properties: {},
        },
      ],
    });
  }, [hoveredElevationPointIndex, effectiveRoutePoints]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const syncTerrainState = () => {
      ensurePlannerTerrainLayers(map);

      map.setLayoutProperty(
        PLANNER_HILLSHADE_LAYER_ID,
        "visibility",
        terrainEnabled ? "visible" : "none",
      );

      if (terrainEnabled) {
        map.setTerrain({ source: PLANNER_TERRAIN_SOURCE_ID, exaggeration: 1.15 });
        return;
      }

      map.setTerrain(null);
    };

    if (!map.isStyleLoaded()) {
      map.once("load", syncTerrainState);
      return;
    }

    syncTerrainState();
  }, [terrainEnabled]);

  async function loadPlannerWorkspace() {
    setLoading(true);
    setError(null);

    try {
      const [nextPlannedWorkouts, nextPlannedMapData] = await Promise.all([
        fetchPlannedWorkouts(),
        fetchPlannedWorkoutMapFeatures(),
      ]);
      setPlannedWorkouts(nextPlannedWorkouts);
      setPlannedMapData(nextPlannedMapData);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load planner workspace.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSavePlan() {
    if (!canSave) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      setWeatherLoading(Boolean(plannedFor));
      setIntensityLoading(Boolean(plannedFor));
      setClusterLoading(true);

      const analysis = await analyzePlannerRoute({
        activity_type: activityType,
        route_points: effectiveRoutePoints,
        planned_for: plannedFor ? new Date(plannedFor).toISOString() : null,
        duration_seconds: estimatedDurationSeconds,
      });

      setElevationData(analysis.elevation);
      setPlannerWeather(analysis.weather);
      setPredictedIntensity(analysis.predicted_intensity);
      setPredictedCluster(analysis.predicted_cluster);

      const createdPlan = await createPlannedWorkout({
        name: workoutName.trim(),
        activity_type: activityType,
        planned_for: plannedFor ? new Date(plannedFor).toISOString() : null,
        route_points: effectiveRoutePoints,
        analysis_context_json: {
          estimated_duration_seconds: analysis.estimated_duration_seconds,
          avg_pace_seconds_per_mile: analysis.avg_pace_seconds_per_mile,
          predicted_completion_time: analysis.predicted_completion_time,
          elevation: analysis.elevation,
          weather: analysis.weather,
          predicted_intensity: analysis.predicted_intensity,
          predicted_cluster: analysis.predicted_cluster,
        },
      });
      setLoadedPlanId(createdPlan.id);
      setLoadedRoutePoints(createdPlan.route_points);
      await loadPlannerWorkspace();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save planned workout.");
    } finally {
      setWeatherLoading(false);
      setIntensityLoading(false);
      setClusterLoading(false);
      setSaving(false);
    }
  }

  async function handleDeletePlan(plannedWorkoutId: string) {
    setDeletingPlanId(plannedWorkoutId);
    setError(null);
    try {
      await deletePlannedWorkout(plannedWorkoutId);
      if (loadedPlanId === plannedWorkoutId) {
        setLoadedPlanId(null);
        setLoadedRoutePoints(null);
      }
      await loadPlannerWorkspace();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete planned workout.");
    } finally {
      setDeletingPlanId(null);
    }
  }

  function clearPlannerAnalysisState() {
    setPlannerWeather(null);
    setPredictedIntensity(null);
    setPredictedCluster(null);
    setWeatherLoading(false);
    setIntensityLoading(false);
    setClusterLoading(false);
  }

  function resetToNewRoute() {
    setLoadedRoutePoints(null);
    setLoadedPlanId(null);
    setWaypoints([]);
    setDraftRoutePoints([]);
    setDraftRouteSource("manual");
    setOutAndBack(false);
    setElevationData(null);
    setHoveredElevationPointIndex(null);
    setWorkoutName(defaultPlannerName(activityType));
    setPlannedFor("");
    setTargetPaceInput("");
    clearPlannerAnalysisState();
    setError(null);
  }

  function handleActivityTypeChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextType = event.target.value as PlannedWorkoutType;
    setActivityType(nextType);
    setWorkoutName(defaultPlannerName(nextType));
    setLoadedRoutePoints(null);
    setLoadedPlanId(null);
    setTargetPaceInput("");
    clearPlannerAnalysisState();
  }

  function handlePlaceSelected(place: { displayName: string; latitude: number; longitude: number; boundingBox: [number, number, number, number] | null }) {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    if (place.boundingBox) {
      const [south, north, west, east] = place.boundingBox;
      if (Math.abs(north - south) > 0.001 || Math.abs(east - west) > 0.001) {
        map.fitBounds([[west, south], [east, north]], { padding: 80, duration: 800 });
        return;
      }
    }

    map.flyTo({ center: [place.longitude, place.latitude], zoom: 14, duration: 900 });
  }

  return (
    <div
      className="relative overflow-hidden bg-[var(--surface-primary)] text-[var(--text-primary)]"
      style={isCompact
        ? { transform: "scale(0.8)", transformOrigin: "top left", width: "125vw", height: "125vh" }
        : { height: "100vh" }
      }
    >
      <div
        ref={mapContainerRef}
        className="absolute inset-0"
        style={isCompact ? { transform: "scale(1.25)", transformOrigin: "top left", width: "80%", height: "80%" } : undefined}
      />
      <div className="pointer-events-none absolute inset-0 bg-[var(--planner-gradient-overlay)]" />

      <div className="absolute left-4 right-4 top-4 z-30 flex flex-wrap items-start gap-3 sm:left-6 sm:right-6">
        <header className="shrink-0">
          <div className="flex items-center justify-between gap-4 rounded-[1.35rem] border border-[var(--border-translucent-mid)] bg-[var(--glass-panel)] px-4 py-2.5 shadow-[0_18px_36px_var(--shadow-color)] backdrop-blur-[24px]">
            <Button
              variant="outline"
              className="h-9 rounded-full border-[var(--border-secondary)] bg-[var(--glass-button)] px-3 text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text-primary)]"
              onClick={() => openMap("map")}
            >
              <Map className="h-4 w-4" />
            </Button>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--text-label)]">Altvia</p>
              <p className="mt-0.5 text-xs text-[var(--text-section)]">Planner</p>
            </div>
            <div ref={profileMenuRef} className="relative pointer-events-auto">
              <button
                type="button"
                onClick={() => setProfileMenuOpen((value) => !value)}
                className="inline-flex h-9 items-center gap-2 rounded-full border border-[var(--border-secondary)] bg-[var(--glass-button)] px-3 text-[var(--text-secondary)] transition hover:bg-[var(--surface-elevated)]"
              >
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#1d1a17] text-white">
                  <User className="h-3.5 w-3.5" />
                </span>
                <ChevronDown className={cn("h-4 w-4 text-[var(--text-subtle)] transition", profileMenuOpen ? "rotate-180" : "")} />
              </button>
              {profileMenuOpen ? (
                <div className="absolute right-0 top-full mt-2 w-44 rounded-[1rem] border border-[var(--border-translucent)] bg-[var(--glass-dropdown)] p-2 shadow-[0_18px_36px_var(--shadow-medium)] backdrop-blur-[20px]">
                  <button
                    type="button"
                    onClick={() => openMap("map")}
                    className="flex w-full items-center gap-2 rounded-[0.8rem] px-3 py-2 text-left text-sm text-[var(--text-secondary)] transition hover:bg-[var(--surface-elevated)]"
                  >
                    <Map className="h-4 w-4" />
                    Workouts
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSettingsOpen((value) => !value);
                      setProfileMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-[0.8rem] px-3 py-2 text-left text-sm text-[var(--text-secondary)] transition hover:bg-[var(--surface-elevated)]"
                  >
                    <Settings className="h-4 w-4" />
                    Settings
                  </button>
                  <button
                    type="button"
                    onClick={logout}
                    className="flex w-full items-center gap-2 rounded-[0.8rem] px-3 py-2 text-left text-sm text-[var(--text-secondary)] transition hover:bg-[var(--surface-elevated)]"
                  >
                    <LogOut className="h-4 w-4" />
                    Logout
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />

        <PlaceSearch onPlaceSelected={handlePlaceSelected} />

        <div className="flex flex-1 flex-wrap items-center gap-2 pt-1">
          <Chip label="Draft Distance" value={formatDistance(draftDistanceMeters, unitSystem)} />
          <Chip label="Saved Plans" value={plannedWorkouts.length.toString()} />
          <Chip
            label="Routing"
            value={routing ? "Snapping" : draftRouteSource === "valhalla" ? "Valhalla" : draftRouteSource === "osrm" ? "OSRM" : "Manual"}
          />
          <button
            type="button"
            onClick={() => setTerrainEnabled((current) => !current)}
            className={cn(
              "pointer-events-auto inline-flex h-9 items-center rounded-full border px-3 text-xs uppercase tracking-[0.18em] transition",
              terrainEnabled
                ? "border-[var(--accent-green)]/35 bg-[var(--accent-green)] text-white hover:bg-[var(--accent-green-hover)]"
                : "border-[var(--border-secondary)] bg-[var(--glass-button)] text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)]",
            )}
          >
            3D Terrain
          </button>
        </div>
      </div>

      <aside className="absolute bottom-4 left-4 top-24 z-20 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-[1.75rem] border border-[var(--border-translucent-half)] bg-[var(--glass-panel)] shadow-[0_24px_60px_var(--shadow-color)] backdrop-blur-[24px] sm:left-6 xl:w-[380px]">
        <div className="flex h-full flex-col">
          <div className="border-b border-[var(--border-solid)] px-5 py-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.26em] text-[var(--text-label)]">
                  {loadedPlanId ? "Editing" : "Planning"}
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
                  {loadedPlanId ? workoutName : "Build your next route"}
                </h2>
              </div>
              {loadedPlanId ? (
                <button
                  type="button"
                  onClick={resetToNewRoute}
                  className="mt-1 inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--border-secondary)] bg-[var(--glass-button)] px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-[var(--text-secondary)] transition hover:bg-[var(--surface-elevated)]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New
                </button>
              ) : null}
            </div>
            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
              {loadedPlanId
                ? "Viewing a saved plan. Click New to start a fresh route, or drop points on the map to replace this route."
                : "Click the map to drop route points. The first slice keeps it manual and fast: route geometry, distance, workout type, and save."}
            </p>
          </div>

          <div className="flex gap-1 border-b border-[var(--border-solid)] px-5 py-2">
            <PanelTab label="Create" active={sidebarTab === "create"} onClick={() => setSidebarTab("create")} />
            <PanelTab label="Plans" active={sidebarTab === "plans"} onClick={() => setSidebarTab("plans")} />
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-5">
            {sidebarTab === "create" ? (
            <div className="grid gap-5">
              <section className="rounded-[1.5rem] border border-[var(--border-translucent-strong)] bg-[var(--glass-card)] p-4 backdrop-blur-[18px]">
                <div className="grid gap-3">
                  <label className="grid gap-2 text-sm text-[var(--text-tertiary)]">
                    <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">Workout Type</span>
                      <select
                        value={activityType}
                        onChange={handleActivityTypeChange}
                        className="h-11 rounded-[1rem] border border-[var(--border-secondary)] bg-[var(--surface-secondary)] px-4 text-sm text-[var(--text-primary)] outline-none transition focus:border-[#00BFFF]/50"
                      >
                        <option value="running">Running</option>
                        <option value="cycling">Cycling</option>
                        <option value="hiking">Hiking</option>
                        <option value="swimming">Swimming</option>
                      </select>
                  </label>

                  <label className="grid gap-2 text-sm text-[var(--text-tertiary)]">
                    <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">Plan Name</span>
                    <input
                      value={workoutName}
                      onChange={(event) => setWorkoutName(event.target.value)}
                      className="h-11 rounded-[1rem] border border-[var(--border-secondary)] bg-[var(--surface-secondary)] px-4 text-sm text-[var(--text-primary)] outline-none transition focus:border-[#00BFFF]/50"
                    />
                  </label>

                  <label className="grid gap-2 text-sm text-[var(--text-tertiary)]">
                    <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">Planned For</span>
                    <div className="relative">
                      <input
                        type="datetime-local"
                        value={plannedFor}
                        onChange={(event) => {
                          clearPlannerAnalysisState();
                          setPlannedFor(event.target.value);
                        }}
                        className="h-11 w-full rounded-[1rem] border border-[var(--border-secondary)] bg-[var(--surface-secondary)] px-4 pr-10 text-sm text-[var(--text-primary)] outline-none transition focus:border-[#00BFFF]/50"
                      />
                      <Calendar className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-faint)]" />
                    </div>
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="grid gap-2 text-sm text-[var(--text-tertiary)]">
                      <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">Target Pace</span>
                      <input
                        type="text"
                        value={targetPaceInput}
                        onChange={(event) => {
                          clearPlannerAnalysisState();
                          setTargetPaceInput(event.target.value);
                        }}
                        placeholder={unitSystem === "imperial" ? "MM:SS /mi" : "MM:SS /km"}
                        className="h-11 rounded-[1rem] border border-[var(--border-secondary)] bg-[var(--surface-secondary)] px-4 text-sm text-[var(--text-primary)] outline-none transition focus:border-[#00BFFF]/50"
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                      <PlannerMetricCard label="Draft Distance" value={formatDistance(draftDistanceMeters, unitSystem)} />
                      <PlannerMetricCard
                        label="Target Pace"
                        value={draftDistanceMeters > 0 && estimatedDurationSeconds > 0 ? formatPace(estimatedDurationSeconds / (draftDistanceMeters / 1609.344), unitSystem) : "Pending"}
                      />
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      clearPlannerAnalysisState();
                      setOutAndBack((current) => !current);
                    }}
                    className={cn(
                      "flex items-center justify-between rounded-[1rem] border px-4 py-3 text-left transition",
                      outAndBack
                        ? "border-[var(--accent-green)]/30 bg-[var(--accent-green)]/10 text-[var(--text-primary)]"
                        : "border-[var(--border-secondary)] bg-[var(--surface-secondary)] text-[var(--text-tertiary)] hover:bg-[var(--surface-elevated)]",
                    )}
                  >
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">Route Shape</p>
                      <p className="mt-1 text-sm">{outAndBack ? "Out and back" : "One way"}</p>
                    </div>
                    <span
                      className={cn(
                        "inline-flex h-6 min-w-11 items-center rounded-full border p-1 transition",
                        outAndBack ? "justify-end border-[var(--accent-green)]/30 bg-[var(--accent-green)]" : "justify-start border-[var(--border-secondary)] bg-white",
                      )}
                    >
                      <span className="h-4 w-4 rounded-full bg-white shadow-[0_2px_8px_var(--shadow-color)]" />
                    </span>
                  </button>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      className="h-10 rounded-full border-[var(--border-secondary)] bg-[var(--glass-button)] px-4 text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text-primary)]"
                      onClick={() => {
                        clearPlannerAnalysisState();
                        if (loadedRoutePoints) {
                          setLoadedRoutePoints(null);
                          return;
                        }
                        setWaypoints((current) => current.slice(0, -1));
                      }}
                      disabled={waypoints.length === 0 && !loadedRoutePoints}
                    >
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Undo
                    </Button>
                    <Button
                      variant="outline"
                      className="h-10 rounded-full border-[var(--border-secondary)] bg-[var(--glass-button)] px-4 text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text-primary)]"
                      onClick={() => {
                        clearPlannerAnalysisState();
                        setLoadedRoutePoints(null);
                        setWaypoints([]);
                        setDraftRoutePoints([]);
                        setDraftRouteSource("manual");
                        setOutAndBack(false);
                        setElevationData(null);
                        setHoveredElevationPointIndex(null);
                      }}
                      disabled={waypoints.length === 0 && !loadedRoutePoints}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Clear
                    </Button>
                    <Button
                      variant="outline"
                      className="h-10 rounded-full border-[var(--accent-green)]/30 bg-[var(--accent-green)] px-4 text-white hover:bg-[var(--accent-green-hover)] hover:text-white"
                      onClick={() => void handleSavePlan()}
                      disabled={!canSave}
                    >
                      <Save className="mr-2 h-4 w-4" />
                      {saving ? "Saving..." : "Save Plan"}
                    </Button>
                  </div>

                  {error ? <InlinePlannerMessage>{error}</InlinePlannerMessage> : null}
                </div>
              </section>
            </div>
            ) : (
            <div className="grid gap-4">
              <div className="flex flex-wrap gap-1.5 rounded-[1.15rem] border border-[var(--border-solid)] bg-[var(--surface-secondary)] p-1.5">
                {(["all", "running", "cycling", "hiking", "swimming"] as const).map((filterValue) => (
                  <ActivityFilterPill
                    key={filterValue}
                    label={filterValue === "all" ? "All" : humanizeActivityType(filterValue)}
                    active={planFilterType === filterValue}
                    onClick={() => setPlanFilterType(filterValue)}
                  />
                ))}
              </div>

              {loading ? <p className="text-sm text-[var(--text-muted)]">Loading plans...</p> : null}
              {!loading && locationGroups.length === 0 ? (
                <p className="text-sm leading-6 text-[var(--text-muted)]">
                  {plannedWorkouts.length === 0
                    ? "No saved plans yet. Drop a few points on the map and save your first route."
                    : "No plans match this filter."}
                </p>
              ) : null}
              {!loading && locationGroups.map((group) => (
                <section key={group.locationKey} className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-label)]">
                      {locationNames[group.locationKey] ?? "Loading location..."}
                    </p>
                    <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-faint)]">
                      {group.plans.length} {group.plans.length === 1 ? "plan" : "plans"}
                    </span>
                  </div>
                  {group.plans.map((plannedWorkout) => (
                    <div key={plannedWorkout.id} className="relative">
                      <button
                        type="button"
                        onClick={() => {
                          if (loadedPlanId === plannedWorkout.id) {
                            resetToNewRoute();
                            return;
                          }
                          setLoadedPlanId(plannedWorkout.id);
                          setLoadedRoutePoints(plannedWorkout.route_points);
                          setWaypoints([]);
                          setDraftRoutePoints([]);
                          setDraftRouteSource("manual");
                          setWorkoutName(plannedWorkout.name);
                          setActivityType(plannedWorkout.activity_type as PlannedWorkoutType);
                          setPlannedFor(plannedWorkout.planned_for ? toDateTimeLocalValue(plannedWorkout.planned_for) : "");
                          setTargetPaceInput("");
                          setElevationData(plannedWorkout.analysis_context_json?.elevation ?? null);
                          setPlannerWeather(plannedWorkout.analysis_context_json?.weather ?? null);
                          setPredictedIntensity(plannedWorkout.analysis_context_json?.predicted_intensity ?? null);
                          setPredictedCluster(plannedWorkout.analysis_context_json?.predicted_cluster ?? null);
                          setOutAndBack(false);
                          fitPlannerToRoute(mapRef.current, plannedWorkout.route_points);
                          setSidebarTab("create");
                        }}
                        className={cn(
                          "w-full rounded-[1.1rem] border p-3 text-left transition",
                          loadedPlanId === plannedWorkout.id
                            ? "border-[var(--accent-green)]/30 bg-[var(--accent-green)]/8 hover:bg-[var(--accent-green)]/12"
                            : "border-[var(--border-solid)] bg-[var(--glass-card-light)] hover:bg-[var(--glass-pill)]",
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-[var(--text-primary)]">{plannedWorkout.name}</p>
                            <p className="mt-1 text-xs text-[var(--text-page-secondary)]">
                            {humanizeActivityType(plannedWorkout.activity_type)} • {formatDistance(plannedWorkout.distance_meters, unitSystem)}
                            </p>
                          </div>
                          <div className="rounded-full border border-[var(--border-solid)] bg-[var(--glass-pill)] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-[var(--text-page-secondary)]">
                            {plannedWorkout.planned_for ? formatDateTime(plannedWorkout.planned_for) : "No date"}
                          </div>
                        </div>
                      </button>
                      <button
                        type="button"
                        disabled={deletingPlanId === plannedWorkout.id}
                        onClick={() => void handleDeletePlan(plannedWorkout.id)}
                        className="absolute right-3 top-3 inline-flex h-7 items-center justify-center rounded-full border border-rose-200 bg-white text-rose-500 shadow-[0_4px_12px_var(--shadow-color)] transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {deletingPlanId === plannedWorkout.id ? "..." : <Trash2 className="h-4 w-4" />}
                      </button>
                    </div>
                  ))}
                </section>
              ))}
            </div>
            )}
          </div>
        </div>
      </aside>

      {(effectiveRoutePoints.length >= 2 || plannerWeather || predictedIntensity || predictedCluster || weatherLoading || intensityLoading || clusterLoading) ? (
        <div className="pointer-events-auto absolute right-4 top-24 z-20 w-[min(340px,calc(100vw-2rem))] rounded-[1.5rem] border border-[var(--border-translucent-half)] bg-[var(--glass-panel)] p-4 shadow-[0_24px_60px_var(--shadow-color)] backdrop-blur-[24px] sm:right-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--text-label)]">Insights</p>
              <p className="mt-1 text-sm text-[var(--text-subtle)]">{loadedPlanId ? workoutName : "Current draft route"}</p>
            </div>
            <div className="rounded-full border border-[var(--border-solid)] bg-[var(--glass-pill)] px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
              {plannedFor ? "Date set" : "Set date/time"}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <PlannerMetricCard label="Distance" value={formatDistance(draftDistanceMeters, unitSystem)} />
            <PlannerMetricCard label="Elevation Gain" value={formatElevation(elevationData?.elevation_gain_meters, unitSystem)} />
            <PlannerMetricCard
              label="Target Pace"
              value={draftDistanceMeters > 0 && estimatedDurationSeconds > 0 ? formatPace(estimatedDurationSeconds / (draftDistanceMeters / 1609.344), unitSystem) : "Pending"}
            />
            <PlannerMetricCard
              label="Finish Time"
              value={plannedFor ? formatDateTime(new Date(new Date(plannedFor).getTime() + estimatedDurationSeconds * 1000).toISOString()) : "Select date/time"}
            />
            <PlannerMetricCard label="Target Pace" value={draftDistanceMeters > 0 && estimatedDurationSeconds > 0 ? formatPace(estimatedDurationSeconds / (draftDistanceMeters / 1609.344), unitSystem) : "Pending"} />
            <PlannerMetricCard
              label="Effort Score"
              value={predictedIntensity ? `${Math.round(predictedIntensity.predicted_effort_score)} / 100` : intensityLoading ? "Loading..." : "Pending"}
            />
          </div>

          {predictedIntensity ? (
            <div className="mt-3">
              <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--progress-track)]">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${predictedIntensity.predicted_effort_score}%`,
                    backgroundColor: predictedIntensity.predicted_effort_score < 25 ? "#22c55e" : predictedIntensity.predicted_effort_score < 50 ? "#84cc16" : predictedIntensity.predicted_effort_score < 75 ? "#eab308" : predictedIntensity.predicted_effort_score < 90 ? "#f97316" : "#ef4444",
                  }}
                />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
                <div>Range: {Math.round(predictedIntensity.confidence_interval_low)}–{Math.round(predictedIntensity.confidence_interval_high)}</div>
                <div>{predictedIntensity.weather_adjusted ? "Weather-adjusted" : "No weather data"}</div>
              </div>
            </div>
          ) : null}

          <div className="mt-3 border-t border-[var(--border-divider)] pt-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-label)]">Forecast</p>
            {weatherLoading ? <p className="mt-2 text-sm text-[var(--text-muted)]">Loading forecast...</p> : null}
            {!weatherLoading && !plannerWeather ? (
              <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                {plannedFor
                  ? "Save the route to fetch forecast data and refresh predictions."
                  : "Select a planned date and time, then save the route to fetch forecast data."}
              </p>
            ) : null}
            {!weatherLoading && plannerWeather ? (
              <>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
                  <div>Temp: {formatTemperature(plannerWeather.temperature_c, unitSystem)}</div>
                  <div>Wind: {formatWind(plannerWeather.wind_speed_kmh, unitSystem)}</div>
                  <div>Rain: {formatRain(plannerWeather.rain_mm, unitSystem)}</div>
                  <div>Snow: {formatSnow(plannerWeather.snowfall_cm, unitSystem)}</div>
                  <div>Forecast: {plannerWeather.forecast_time ? formatDateTime(plannerWeather.forecast_time) : "Nearest slot"}</div>
                  <div>{plannerWeather.cached ? "Cached" : "Live"}</div>
                </div>
                {plannerWeather.wind_direction_deg != null ? (
                  <div className="mt-3 flex items-center gap-3 rounded-[1rem] border border-[var(--border-secondary)] bg-[var(--glass-pill)] px-3 py-2 shadow-[0_10px_24px_var(--shadow-color)]">
                    <WindCompass direction={plannerWeather.wind_direction_deg} />
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-label)]">Wind direction</p>
                      <p className="text-sm font-semibold text-[var(--text-secondary)]">
                        {formatCompassHeading(plannerWeather.wind_direction_deg)}
                        {windRelationLabel ? ` • ${windRelationLabel}` : ""}
                      </p>
                      <p className="text-[11px] text-[var(--text-muted)]">
                        {formatWind(plannerWeather.wind_speed_kmh, unitSystem)} ({Math.round(plannerWeather.wind_direction_deg)}°)
                      </p>
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>

          <div className="mt-3 border-t border-[var(--border-divider)] pt-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-label)]">Workout Category</p>
            {clusterLoading ? <p className="mt-2 text-sm text-[var(--text-muted)]">Refreshing category...</p> : null}
            {!clusterLoading && predictedCluster ? (() => {
              const LEVELS = ["Recovery", "Easy", "Moderate", "Hard", "Intense", "Extreme"] as const;
              const COLORS: Record<string, { bar: string; text: string }> = {
                Recovery:  { bar: "#22c55e", text: "#16a34a" },
                Easy:      { bar: "#84cc16", text: "#65a30d" },
                Moderate:  { bar: "#eab308", text: "#ca8a04" },
                Hard:      { bar: "#f97316", text: "#ea580c" },
                Intense:   { bar: "#ef4444", text: "#dc2626" },
                Extreme:   { bar: "#dc2626", text: "#b91c1c" },
              };
              const activeIdx = LEVELS.indexOf(predictedCluster.cluster_label as typeof LEVELS[number]);
              const { bar, text } = COLORS[predictedCluster.cluster_label] ?? { bar: "#94a3b8", text: "#64748b" };
              return (
                <>
                  <p className="mt-2 text-sm font-semibold" style={{ color: text }}>{predictedCluster.cluster_label}</p>
                  <div className="mt-2 flex gap-[3px]">
                    {LEVELS.map((level, i) => (
                      <div
                        key={level}
                        title={level}
                        className="h-1.5 flex-1 rounded-full transition-opacity"
                        style={{
                          backgroundColor: COLORS[level].bar,
                          opacity: i === activeIdx ? 1 : i < activeIdx ? 0.45 : 0.15,
                          outline: i === activeIdx ? `2px solid ${bar}` : "none",
                          outlineOffset: "1px",
                        }}
                      />
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs text-[var(--text-muted)]">
                    Compared against {predictedCluster.n_activities_in_group} past {predictedCluster.activity_type_group} activities.
                  </p>
                </>
              );
            })() : null}
            {!clusterLoading && !predictedCluster ? (
              <p className="mt-2 text-sm text-[var(--text-muted)]">Save the route to refresh category guidance for this plan.</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {showPlannerChartPanel ? (
        <div className="pointer-events-auto absolute bottom-4 left-1/2 z-20 w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 rounded-[1.35rem] border border-[var(--border-divider)] bg-[var(--glass-panel)] px-4 py-3 shadow-[0_18px_40px_var(--shadow-color)] backdrop-blur-[24px]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-label)]">Elevation Profile</p>
              <p className="truncate text-xs text-[var(--text-subtle)]">{loadedPlanId ? workoutName : "Current draft route"}</p>
            </div>
            <button
              type="button"
              onClick={() => setChartMinimized((v) => !v)}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--border-solid)] bg-[var(--glass-pill)] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]"
            >
              {chartMinimized ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {chartMinimized ? "Expand" : "Minimize"}
            </button>
          </div>
          {chartMinimized ? (
            <div className="text-xs text-[var(--text-subtle)]">
              {formatDistance(draftDistanceMeters, unitSystem)}
              <span className="mx-2 text-[var(--text-very-faint)]">/</span>
              {formatElevation(elevationData?.elevation_gain_meters, unitSystem)} gain
            </div>
          ) : null}
          {!chartMinimized ? (
            <>
              {elevationLoading ? <p className="text-sm text-[var(--text-muted)]">Loading elevation data...</p> : null}
              {!elevationLoading && elevationChartSeries ? (
                <div className="grid gap-3">
                  <ElevationChart
                    series={elevationChartSeries}
                    hoveredPointIndex={hoveredElevationPointIndex}
                    onHoverChange={setHoveredElevationPointIndex}
                    onHoverClear={() => setHoveredElevationPointIndex(null)}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <PlannerMetricCard label="Elevation Gain" value={formatElevation(elevationData?.elevation_gain_meters, unitSystem)} />
                    <PlannerMetricCard label="Elevation Loss" value={formatElevation(elevationData?.elevation_loss_meters, unitSystem)} />
                  </div>
                </div>
              ) : null}
              {!elevationLoading && !elevationChartSeries && elevationData ? (
                <p className="text-sm text-[var(--text-muted)]">Elevation data unavailable for this area.</p>
              ) : null}
              {!elevationLoading && !elevationData ? (
                <p className="text-sm text-[var(--text-muted)]">Draw a route to load an elevation profile.</p>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function buildDraftRouteCollection(
  routePoints: PlannedWorkoutRoutePoint[],
  waypoints: PlannedWorkoutRoutePoint[],
): GeoJSON.FeatureCollection {
  const pointFeatures = waypoints.map((point, index) => ({
    type: "Feature" as const,
    geometry: {
      type: "Point" as const,
      coordinates: [point.longitude, point.latitude],
    },
    properties: {
      order: index,
    },
  }));

  const lineFeature = routePoints.length >= 2 ? [{
    type: "Feature" as const,
    geometry: {
      type: "LineString" as const,
      coordinates: routePoints.map((point) => [point.longitude, point.latitude]),
    },
    properties: {},
  }] : [];

  return {
    type: "FeatureCollection",
    features: [...lineFeature, ...pointFeatures],
  };
}

function fitPlannerToRoute(map: MaplibreMap | null, routePoints: PlannedWorkoutRoutePoint[]) {
  if (!map || routePoints.length === 0) {
    return;
  }

  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  for (const point of routePoints) {
    minLng = Math.min(minLng, point.longitude);
    minLat = Math.min(minLat, point.latitude);
    maxLng = Math.max(maxLng, point.longitude);
    maxLat = Math.max(maxLat, point.latitude);
  }

  map.fitBounds(
    [
      [minLng, minLat],
      [maxLng, maxLat],
    ],
    { padding: 80, duration: 800 },
  );
}

function ensurePlannerTerrainLayers(map: MaplibreMap) {
  if (!map.getSource(PLANNER_TERRAIN_SOURCE_ID)) {
    map.addSource(PLANNER_TERRAIN_SOURCE_ID, {
      type: "raster-dem",
      tiles: PLANNER_TERRAIN_TILES,
      tileSize: 256,
      encoding: "terrarium",
      maxzoom: 15,
    });
  }

  if (!map.getLayer(PLANNER_HILLSHADE_LAYER_ID)) {
    const hillshadeLayer: maplibregl.HillshadeLayerSpecification = {
      id: PLANNER_HILLSHADE_LAYER_ID,
      type: "hillshade",
      source: PLANNER_TERRAIN_SOURCE_ID,
      layout: {
        visibility: "none",
      },
      paint: {
        "hillshade-shadow-color": "#40352b",
        "hillshade-highlight-color": "#fff4dc",
        "hillshade-accent-color": "#6b4a26",
        "hillshade-illumination-anchor": "viewport",
        "hillshade-exaggeration": 0.72,
      },
    };

    if (map.getLayer("planned-workouts")) {
      map.addLayer(hillshadeLayer, "planned-workouts");
    } else {
      map.addLayer(hillshadeLayer);
    }
  }
}

function applyPlannerPathStyling(map: MaplibreMap) {
  const style = map.getStyle();
  const layers = style.layers ?? [];

      for (const layer of layers) {
        const identifier = `${layer.id} ${"source-layer" in layer ? layer["source-layer"] ?? "" : ""}`.toLowerCase();

    if (layer.type === "line" && map.getLayer(layer.id)) {
      const lineLayer = layer as maplibregl.LineLayerSpecification;
      const isPathLike = ["path", "trail", "footway", "cycleway", "track"].some((keyword) => identifier.includes(keyword));
      const isRoadLike = ["road", "street", "highway", "motorway", "trunk", "primary", "secondary", "tertiary"].some((keyword) => identifier.includes(keyword));
      const isWaterLike = ["river", "stream", "water", "canal"].some((keyword) => identifier.includes(keyword));

      if (isRoadLike && !isPathLike) {
        map.setPaintProperty(lineLayer.id, "line-color", "rgba(121, 113, 102, 0.34)");
        map.setPaintProperty(lineLayer.id, "line-opacity", 0.45);
      }

      if (isWaterLike) {
        map.setPaintProperty(lineLayer.id, "line-color", "#1d7fbf");
        map.setPaintProperty(lineLayer.id, "line-opacity", 0.72);
      }

      if (isPathLike) {
        map.setPaintProperty(lineLayer.id, "line-color", "#b42318");
        map.setPaintProperty(lineLayer.id, "line-width", [
          "interpolate",
          ["linear"],
          ["zoom"],
          0,
          0.6,
          6,
          1.1,
          12,
          2.4,
        ]);
        map.setPaintProperty(lineLayer.id, "line-opacity", [
          "interpolate",
          ["linear"],
          ["zoom"],
          0,
          0.6,
          8,
          0.8,
          12,
          1,
        ]);
        map.setPaintProperty(lineLayer.id, "line-blur", [
          "interpolate",
          ["linear"],
          ["zoom"],
          0,
          1.5,
          12,
          0.4,
        ]);
      }
    }

    if (layer.type === "fill" && map.getLayer(layer.id)) {
      const fillLayer = layer as maplibregl.FillLayerSpecification;
      const isParkLike = ["park", "grass", "wood", "forest", "green", "recreation", "pitch", "garden"].some((keyword) => identifier.includes(keyword));
      const isWaterFill = ["water", "lake", "reservoir", "riverbank"].some((keyword) => identifier.includes(keyword));

      if (isParkLike) {
        map.setPaintProperty(fillLayer.id, "fill-color", "#8bbf6a");
        map.setPaintProperty(fillLayer.id, "fill-opacity", 0.5);
      }

      if (isWaterFill) {
        map.setPaintProperty(fillLayer.id, "fill-color", "#8fc7ea");
        map.setPaintProperty(fillLayer.id, "fill-opacity", 0.6);
      }
    }

    if (layer.type === "symbol" && map.getLayer(layer.id)) {
      const symbolLayer = layer as maplibregl.SymbolLayerSpecification;
      const isAidLike = ["hospital", "medical", "clinic", "pharmacy", "drinking", "fountain", "water", "first_aid", "emergency"].some((keyword) => identifier.includes(keyword));
      const isMutedRoadLabel = ["road", "street", "highway", "motorway"].some((keyword) => identifier.includes(keyword));

      if (isMutedRoadLabel) {
        map.setPaintProperty(symbolLayer.id, "text-color", "rgba(92, 86, 77, 0.55)");
      }

      if (isAidLike) {
        map.setPaintProperty(symbolLayer.id, "text-color", "#9f1d20");
        map.setPaintProperty(symbolLayer.id, "text-halo-color", "rgba(255,255,255,0.92)");
        map.setPaintProperty(symbolLayer.id, "text-halo-width", 1.2);
        map.setPaintProperty(symbolLayer.id, "icon-color", "#b42318");
      }
    }
  }
}

function calculateRouteDistanceMeters(routePoints: PlannedWorkoutRoutePoint[]) {
  return routePoints.reduce((total, point, index) => {
    const previousPoint = routePoints[index - 1];
    if (!previousPoint) {
      return total;
    }
    return total + haversineMeters(previousPoint.latitude, previousPoint.longitude, point.latitude, point.longitude);
  }, 0);
}

function buildOutAndBackRoute(routePoints: PlannedWorkoutRoutePoint[], outAndBack: boolean) {
  if (!outAndBack || routePoints.length < 2) {
    return routePoints;
  }

  const returnLeg = routePoints.slice(0, -1).reverse();
  return [...routePoints, ...returnLeg];
}

function calculateRouteMidpoint(routePoints: PlannedWorkoutRoutePoint[]) {
  if (routePoints.length === 0) {
    return null;
  }

  const latitude = routePoints.reduce((sum, point) => sum + point.latitude, 0) / routePoints.length;
  const longitude = routePoints.reduce((sum, point) => sum + point.longitude, 0) / routePoints.length;
  return { latitude, longitude };
}

function haversineMeters(latitudeA: number, longitudeA: number, latitudeB: number, longitudeB: number) {
  const earthRadiusMeters = 6_371_000;
  const latitudeDelta = toRadians(latitudeB - latitudeA);
  const longitudeDelta = toRadians(longitudeB - longitudeA);
  const latitudeARadians = toRadians(latitudeA);
  const latitudeBRadians = toRadians(latitudeB);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitudeARadians) * Math.cos(latitudeBRadians) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(haversine));
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function toDegrees(value: number) {
  return (value * 180) / Math.PI;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "No date";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatDuration(seconds: number | null) {
  if (seconds == null || !Number.isFinite(seconds)) {
    return "N/A";
  }

  const totalMinutes = Math.max(1, Math.round(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

function estimatePlannerDurationSeconds(activityType: PlannedWorkoutType, distanceMeters: number) {
  const paceSecondsPerKm: Record<string, number> = {
    running: 360,
    cycling: 150,
    hiking: 600,
    swimming: 150,
    walking: 720,
  };

  return (distanceMeters / 1000) * (paceSecondsPerKm[activityType] ?? 360);
}

function toDateTimeLocalValue(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function calculateRouteBearing(routePoints: PlannedWorkoutRoutePoint[]) {
  if (routePoints.length < 2) {
    return null;
  }

  const first = routePoints[0];
  const last = routePoints[routePoints.length - 1];
  const lat1 = toRadians(first.latitude);
  const lat2 = toRadians(last.latitude);
  const deltaLng = toRadians(last.longitude - first.longitude);
  const y = Math.sin(deltaLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);
  const bearing = (toDegrees(Math.atan2(y, x)) + 360) % 360;
  return bearing;
}

function formatCompassHeading(degrees: number) {
  const normalized = Math.round((degrees % 360 + 360) % 360);
  const directions = [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
  ];
  const index = Math.floor((normalized + 11.25) / 22.5) % 16;
  return `${directions[index]} (${normalized}°)`;
}

function describeWindRelation(windDirection: number, routeBearing: number | null) {
  if (routeBearing == null) {
    return null;
  }
  const diff = (windDirection - routeBearing + 360) % 360;
  if (diff <= 45 || diff >= 315) {
    return "Headwind";
  }
  if (diff >= 135 && diff <= 225) {
    return "Tailwind";
  }
  return "Crosswind";
}

function humanizeActivityType(activityType: string) {
  return activityType.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function defaultPlannerName(activityType: PlannedWorkoutType) {
  switch (activityType) {
    case "cycling":
      return "Planned Ride";
    case "swimming":
      return "Planned Swim";
    case "hiking":
      return "Planned Hike";
    case "running":
    default:
      return "Planned Run";
  }
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-[var(--border-translucent-light)] bg-[var(--glass-panel)] px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)] shadow-[0_18px_36px_var(--shadow-color)] backdrop-blur-[24px]">
      <span className="text-[var(--text-label)]">{label}</span>
      <span className="text-[var(--text-secondary)]">{value}</span>
    </div>
  );
}

function PlannerMetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.15rem] border border-[var(--border-solid)] bg-[var(--surface-secondary)] p-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">{label}</p>
      <p className="mt-2 text-lg text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

function WindCompass({ direction }: { direction: number }) {
  const normalized = (direction % 360 + 360) % 360;
  return (
    <div className="relative flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border-secondary)] bg-[var(--glass-panel-strong)]">
      <span
        className="absolute h-10 w-0.5 rounded-sm bg-[var(--accent-green)]"
        style={{ transform: `rotate(${normalized}deg)` }}
      />
      <span
        className="absolute top-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--accent-green)]"
        style={{ transform: `rotate(${normalized}deg)` }}
      >
        ↥
      </span>
    </div>
  );
}

function InlinePlannerMessage({ children }: { children: string }) {
  return (
    <div className="rounded-[1.1rem] border border-rose-300/30 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-500/30 dark:bg-rose-900/20 dark:text-rose-200">
      {children}
    </div>
  );
}

function PanelTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-4 py-1.5 text-xs font-medium tracking-wide transition",
        active
          ? "bg-[var(--accent-green)] text-white"
          : "text-[var(--text-muted)] hover:bg-[var(--glass-button)]",
      )}
    >
      {label}
    </button>
  );
}

function ActivityFilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1 text-[11px] font-medium tracking-wide transition",
        active
          ? "bg-[var(--accent-green)] text-white"
          : "text-[var(--text-muted)] hover:bg-[var(--glass-button)]",
      )}
    >
      {label}
    </button>
  );
}
