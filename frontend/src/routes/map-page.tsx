import type { ChangeEvent, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  LogOut,
  Map as MapIcon,
  Menu,
  Minus,
  Pause,
  Play,
  Plus,
  Settings,
  User,
  X,
} from "lucide-react";
import maplibregl, { LngLatBoundsLike, type GeoJSONSource, type Map as MaplibreMap } from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";

import { Button } from "@/components/ui/button";
import { SettingsPanel } from "@/components/settings-panel";
import {
  type ActivityDetail,
  type ActivityAnalytics,
  type ActivityMapFeature,
  type ActivityMapFeatureCollection,
  type ActivityRoutePoint,
  type ActivitySummary,
  type ActivityTimeline,
  type SimilarRoutesResponse,
  fetchActivities,
  fetchActivityDetail,
  fetchActivityAnalytics,
  fetchActivityMapFeatures,
  fetchActivityTimeline,
  fetchSimilarRoutes,
} from "@/lib/api";
import { SimilarRoutesChart, type SimilarRouteMetricMode } from "@/components/similar-routes-chart";
import { cn } from "@/lib/utils";
import {
  formatDistance,
  formatElevation,
  formatPace,
  formatTemperature,
  formatWind,
  formatRain,
  formatSnow,
  sanitizePaceSecondsPerMile,
  type UnitSystem,
} from "@/lib/units";
import { useAppStore } from "@/store/app-store";

const DEFAULT_CENTER: [number, number] = [-105.25, 39.65];
const EMPTY_COLLECTION: ActivityMapFeatureCollection = { type: "FeatureCollection", features: [] };
const UNSELECTED_ACTIVITY_TYPE = "__unselected__";
const ALL_ACTIVITY_TYPES = "__all__";
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const FAST_PACE_SECONDS_PER_MILE = 6 * 60;
const SLOW_PACE_SECONDS_PER_MILE = 14 * 60;
const LOW_ELEVATION_METERS = 0;
const HIGH_ELEVATION_METERS = 1200;
const PLAYBACK_INTERVAL_MS = 50;
const PLAYBACK_TARGET_DURATION_MS = 8000;
const EMPTY_DETAIL_SEGMENTS = {
  type: "FeatureCollection",
  features: [],
} satisfies GeoJSON.FeatureCollection<GeoJSON.LineString, { segment_score: number }>;
const EMPTY_HOVER_POINT = {
  type: "FeatureCollection",
  features: [],
} satisfies GeoJSON.FeatureCollection<GeoJSON.Point, { route_index: number }>;
const EMPTY_SIMILAR_ROUTES = {
  type: "FeatureCollection",
  features: [],
} satisfies GeoJSON.FeatureCollection<GeoJSON.LineString>;
const MAP_TERRAIN_SOURCE_ID = "map-terrain-dem";
const MAP_HILLSHADE_LAYER_ID = "map-terrain-hillshade";
const MAP_TERRAIN_TILES = ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"];

type TimelineMetric = "session_count" | "total_distance_meters" | "total_duration_seconds";
type RouteStyleMode = "recency" | "pace" | "elevation" | "heart_rate";
type WorkoutSortMode = "date" | "distance" | "duration" | "average_heart_rate";

type TimelineDay = {
  date: string;
  session_count: number;
  total_distance_meters: number;
  total_duration_seconds: number;
};

type DateRangeIndexes = [number, number];

const mapStyle: StyleSpecification = {
  version: 8,
  sources: {
    basemap: {
      type: "raster",
      tiles: ["https://a.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "&copy; OpenStreetMap &copy; CARTO",
    },
    labels: {
      type: "raster",
      tiles: ["https://a.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "&copy; OpenStreetMap &copy; CARTO",
    },
  },
  layers: [
    {
      id: "basemap",
      type: "raster",
      source: "basemap",
    },
    {
      id: "labels",
      type: "raster",
      source: "labels",
    },
  ],
};

export function MapPage() {
  const logout = useAppStore((state) => state.logout);
  const openPlanner = useAppStore((state) => state.openPlanner);
  const unitSystem = useAppStore((state) => state.unitSystem);
  const uiScale = useAppStore((state) => state.uiScale);
  const isCompact = uiScale === "compact";
  const [activities, setActivities] = useState<ActivitySummary[]>([]);
  const [mapData, setMapData] = useState<ActivityMapFeatureCollection>(EMPTY_COLLECTION);
  const [overviewAnalytics, setOverviewAnalytics] = useState<ActivityAnalytics | null>(null);
  const [analytics, setAnalytics] = useState<ActivityAnalytics | null>(null);
  const [timeline, setTimeline] = useState<ActivityTimeline | null>(null);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [selectedActivityDetail, setSelectedActivityDetail] = useState<ActivityDetail | null>(null);
  const [selectedActivityType, setSelectedActivityType] = useState<string | null>(null);
  const [timelineMetric, setTimelineMetric] = useState<TimelineMetric>("total_distance_meters");
  const [routeStyleMode, setRouteStyleMode] = useState<RouteStyleMode>("recency");
  const [workoutSortMode, setWorkoutSortMode] = useState<WorkoutSortMode>("date");
  const [draftDateRange, setDraftDateRange] = useState<DateRangeIndexes | null>(null);
  const [appliedDateRange, setAppliedDateRange] = useState<DateRangeIndexes | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [chartMinimized, setChartMinimized] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mapZoom, setMapZoom] = useState(9);
  const [activeTab, setActiveTab] = useState<"mine" | "friends">("mine");
  const [loading, setLoading] = useState(false);
  const [filtersLoading, setFiltersLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [hoveredRoutePointIndex, setHoveredRoutePointIndex] = useState<number | null>(null);
  const [selectedRoutePointIndex, setSelectedRoutePointIndex] = useState<number | null>(null);
  const [playbackActive, setPlaybackActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [terrainEnabled, setTerrainEnabled] = useState(false);
  const [similarRoutes, setSimilarRoutes] = useState<SimilarRoutesResponse | null>(null);
  const [similarRoutesLoading, setSimilarRoutesLoading] = useState(false);
  const [showSimilarRoutes, setShowSimilarRoutes] = useState(false);
  const [similarRouteMetricMode, setSimilarRouteMetricMode] = useState<SimilarRouteMetricMode>("pace");

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

  const selectedActivity = useMemo(
    () => activities.find((activity) => activity.id === selectedActivityId) ?? activities[0] ?? null,
    [activities, selectedActivityId],
  );

  const selectedFeature = useMemo(
    () => mapData.features.find((feature) => feature.properties.id === selectedActivity?.id) ?? null,
    [mapData.features, selectedActivity],
  );

  const activityTypeOptions = useMemo(
    () => (overviewAnalytics?.activity_types ?? []).map((item) => item.activity_type),
    [overviewAnalytics],
  );
  const sortedActivities = useMemo(() => sortActivities(activities, workoutSortMode), [activities, workoutSortMode]);

  const timelineDays = useMemo(() => buildTimelineDays(timeline), [timeline]);
  const visibleMapData = useMemo(() => {
    if (routeStyleMode === "recency" || !selectedFeature) {
      return mapData;
    }

    return {
      type: "FeatureCollection" as const,
      features: [selectedFeature],
    };
  }, [mapData, routeStyleMode, selectedFeature]);
  const styledMapData = useMemo(() => buildStyledCollection(visibleMapData, routeStyleMode), [visibleMapData, routeStyleMode]);
  const selectedDetailSegments = useMemo(
    () => buildSelectedDetailSegments(selectedActivityDetail, routeStyleMode),
    [selectedActivityDetail, routeStyleMode],
  );
  const selectedMetricSeries = useMemo(
    () => buildRouteMetricSeries(selectedActivityDetail, routeStyleMode, unitSystem),
    [selectedActivityDetail, routeStyleMode, unitSystem],
  );
  const selectedPaceRange = useMemo(
    () => buildDetailMetricRange(selectedActivityDetail, "pace"),
    [selectedActivityDetail],
  );
  const hoveredMetricPoint = useMemo(
    () => selectedMetricSeries?.points.find((point) => point.sourceIndex === hoveredRoutePointIndex) ?? null,
    [hoveredRoutePointIndex, selectedMetricSeries],
  );
  const activeRoutePointIndex = selectedRoutePointIndex ?? hoveredRoutePointIndex;
  const activeMetricPoint = useMemo(
    () => selectedMetricSeries?.points.find((point) => point.sourceIndex === activeRoutePointIndex) ?? null,
    [activeRoutePointIndex, selectedMetricSeries],
  );
  const activeRoutePoint = useMemo(
    () => (activeRoutePointIndex != null ? selectedActivityDetail?.route_points_json?.[activeRoutePointIndex] ?? null : null),
    [activeRoutePointIndex, selectedActivityDetail],
  );
  const selectedRange = draftDateRange ?? appliedDateRange;
  const hasActiveTypeSelection = selectedActivityType !== null;
  const activeAnalytics = analytics ?? overviewAnalytics;
  const mapStateSummary = useMemo(() => {
    if (!hasActiveTypeSelection) {
      return null;
    }

    const layerLabel = selectedActivityType === ALL_ACTIVITY_TYPES
      ? "all workouts"
      : selectedActivityType
        ? humanizeActivityType(selectedActivityType)
        : "selected workouts";
    const modeLabel = routeStyleModeLabel(routeStyleMode).toLowerCase();

    if (selectedFeature && routeStyleMode !== "recency") {
      return `${modeLabel} view for ${selectedActivity?.name ?? "the selected workout"} in ${layerLabel}.`;
    }

    if (selectedFeature) {
      return `${modeLabel} view across ${layerLabel}, centered on ${selectedActivity?.name ?? "the selected workout"}.`;
    }

    return `${modeLabel} view across ${layerLabel}.`;
  }, [hasActiveTypeSelection, routeStyleMode, selectedActivity?.name, selectedActivityType, selectedFeature]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation([position.coords.longitude, position.coords.latitude]);
      },
      () => {
        setUserLocation(null);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5 * 60 * 1000,
        timeout: 10_000,
      },
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
      style: mapStyle,
      center: userLocation ?? DEFAULT_CENTER,
      zoom: 9,
      attributionControl: false,
    });

    map.on("load", () => {
      ensureWorkoutTerrainLayers(map);

      map.addSource("workouts", {
        type: "geojson",
        data: EMPTY_COLLECTION,
      });
      map.addSource("selected-workout-detail", {
        type: "geojson",
        data: EMPTY_DETAIL_SEGMENTS,
        tolerance: 0,
      });
      map.addSource("selected-workout-hover-point", {
        type: "geojson",
        data: EMPTY_HOVER_POINT,
      });
      map.addSource("similar-routes", {
        type: "geojson",
        data: EMPTY_SIMILAR_ROUTES,
      });

      map.addLayer({
        id: "similar-routes-lines",
        type: "line",
        source: "similar-routes",
        paint: {
          "line-color": "rgba(148, 163, 184, 0.55)",
          "line-width": 3,
          "line-opacity": 0,
        },
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
      });

      map.addLayer({
        id: "workout-routes-glow",
        type: "line",
        source: "workouts",
        paint: {
          "line-color": [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "style_score"], 0],
            0,
            "rgba(144, 165, 178, 0.38)",
            0.35,
            "rgba(122, 182, 205, 0.54)",
            0.7,
            "rgba(76, 200, 237, 0.72)",
            1,
            "rgba(0, 191, 255, 0.95)",
          ],
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            0,
            6,
            6,
            9,
            12,
            16,
          ],
          "line-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            0,
            0.2,
            6,
            0.25,
            12,
            0.35,
          ],
          "line-blur": 5,
        },
      });

      map.addLayer({
        id: "workout-routes",
        type: "line",
        source: "workouts",
        paint: {
          "line-color": [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "style_score"], 0],
            0,
            "#8fa4b1",
            0.35,
            "#71b7cd",
            0.55,
            "#49c0df",
            0.8,
            "#18c7ef",
            1,
            "#00BFFF",
          ],
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            0,
            1.2,
            6,
            2.6,
            12,
            4.2,
          ],
          "line-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            0,
            0.25,
            6,
            0.35,
            12,
            0.7,
          ],
        },
      });

      map.addLayer({
        id: "selected-workout-route",
        type: "line",
        source: "workouts",
        filter: ["==", ["get", "id"], ""],
        paint: {
          "line-color": "#ffffff",
          "line-width": 6,
          "line-opacity": 0.92,
        },
      });

      map.addLayer({
        id: "selected-workout-core",
        type: "line",
        source: "workouts",
        filter: ["==", ["get", "id"], ""],
        paint: {
          "line-color": "#D4A017",
          "line-width": 2.75,
          "line-opacity": 1,
        },
      });

      map.addLayer({
        id: "selected-workout-detail-glow",
        type: "line",
        source: "selected-workout-detail",
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "segment_score"], 0.5],
            0,
            "rgba(255, 205, 210, 0.42)",
            0.5,
            "rgba(239, 154, 154, 0.58)",
            1,
            "rgba(183, 28, 28, 0.96)",
          ],
          "line-width": 14,
          "line-opacity": 0,
          "line-blur": 5,
        },
      });

      map.addLayer({
        id: "selected-workout-detail-core",
        type: "line",
        source: "selected-workout-detail",
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "segment_score"], 0.5],
            0,
            "#ffcdd2",
            0.5,
            "#ef9a9a",
            1,
            "#8b0000",
          ],
          "line-width": 7,
          "line-opacity": 0,
        },
      });

      map.addLayer({
        id: "selected-workout-hover-point-glow",
        type: "circle",
        source: "selected-workout-hover-point",
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            7,
            7,
            10,
            10,
            14,
            15,
          ],
          "circle-color": "#ffffff",
          "circle-opacity": 0,
          "circle-blur": 0.6,
        },
      });

      map.addLayer({
        id: "selected-workout-hover-point",
        type: "circle",
        source: "selected-workout-hover-point",
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            7,
            4,
            10,
            5.5,
            14,
            8,
          ],
          "circle-color": "#1d1a17",
          "circle-stroke-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            7,
            2,
            14,
            3,
          ],
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 0,
        },
      });

      map.on("mousemove", "selected-workout-detail-core", (event) => {
        const feature = event.features?.[0];
        const routeIndex = feature?.properties?.route_index;
        if (typeof routeIndex === "number") {
          setHoveredRoutePointIndex(routeIndex);
        } else if (typeof routeIndex === "string") {
          const parsed = Number(routeIndex);
          setHoveredRoutePointIndex(Number.isFinite(parsed) ? parsed : null);
        }
        map.getCanvas().style.cursor = "crosshair";
      });

      map.on("mouseleave", "selected-workout-detail-core", () => {
        setHoveredRoutePointIndex(null);
        map.getCanvas().style.cursor = "";
      });

      map.on("click", "selected-workout-detail-core", (event) => {
        const feature = event.features?.[0];
        const routeIndex = feature?.properties?.route_index;
        const parsed = typeof routeIndex === "number" ? routeIndex : Number(routeIndex);
        if (Number.isFinite(parsed)) {
          setSelectedRoutePointIndex(parsed);
          setPlaybackActive(false);
        }
      });
    });

    map.on("move", () => {
      setMapZoom(map.getZoom());
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [userLocation]);

  useEffect(() => {
    void loadOverview();
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const syncMap = () => {
      const workoutSource = map.getSource("workouts") as GeoJSONSource | undefined;
      if (workoutSource) {
        workoutSource.setData(styledMapData);
      }
      const detailSource = map.getSource("selected-workout-detail") as GeoJSONSource | undefined;
      if (detailSource) {
        detailSource.setData(selectedDetailSegments);
      }

      if (map.getLayer("selected-workout-route")) {
        map.setFilter("selected-workout-route", ["==", ["get", "id"], selectedActivity?.id ?? ""]);
      }
      if (map.getLayer("selected-workout-core")) {
        map.setFilter("selected-workout-core", ["==", ["get", "id"], selectedActivity?.id ?? ""]);
      }

      if (selectedFeature) {
        fitToFeature(map, selectedFeature);
        return;
      }

      if (mapData.features.length > 0) {
        fitToCollection(map, mapData);
        return;
      }

      if (userLocation) {
        map.flyTo({
          center: userLocation,
          zoom: 11,
          duration: 900,
        });
      }
    };

    if (!map.isStyleLoaded() || !map.getSource("workouts")) {
      map.once("load", syncMap);
      return;
    }

    syncMap();
  }, [styledMapData, selectedDetailSegments, mapData, selectedActivity?.id, selectedFeature, userLocation]);

  useEffect(() => {
    const map = mapRef.current;
    if (
      !map ||
      !map.getLayer("workout-routes") ||
      !map.getLayer("workout-routes-glow") ||
      !map.getLayer("selected-workout-detail-core") ||
      !map.getLayer("selected-workout-detail-glow")
    ) {
      return;
    }

    const palette = routeStylePalette(routeStyleMode);

    map.setPaintProperty("workout-routes-glow", "line-color", [
      "interpolate",
      ["linear"],
      ["coalesce", ["get", "style_score"], 0],
      0,
      palette.glowStart,
      0.35,
      palette.glowMid,
      0.7,
      palette.glowUpper,
      1,
      palette.glowEnd,
    ]);

    map.setPaintProperty("workout-routes", "line-color", [
      "interpolate",
      ["linear"],
      ["coalesce", ["get", "style_score"], 0],
      0,
      palette.lineStart,
      0.35,
      palette.lineMid,
      0.55,
      palette.lineUpper,
      0.8,
      palette.lineHigh,
      1,
      palette.lineEnd,
    ]);

    map.setPaintProperty("selected-workout-detail-glow", "line-color", [
      "interpolate",
      ["linear"],
      ["coalesce", ["get", "segment_score"], 0.5],
      0,
      palette.glowStart,
      0.5,
      palette.glowMid,
      0.8,
      palette.glowUpper,
      1,
      palette.glowEnd,
    ]);

    map.setPaintProperty("selected-workout-detail-core", "line-color", [
      "interpolate",
      ["linear"],
      ["coalesce", ["get", "segment_score"], 0.5],
      0,
      palette.lineStart,
      0.5,
      palette.lineMid,
      0.8,
      palette.lineHigh,
      1,
      palette.lineEnd,
    ]);

    map.setPaintProperty("workout-routes-glow", "line-width", routeStyleMode === "recency" ? 10 : 14);
    map.setPaintProperty("workout-routes-glow", "line-opacity", routeStyleMode === "recency" ? [
      "interpolate",
      ["linear"],
      ["coalesce", ["get", "style_score"], 0],
      0,
      0.05,
      1,
      0.2,
    ] : [
      "literal",
      0,
    ]);

    map.setPaintProperty("workout-routes", "line-width", routeStyleMode === "recency" ? 3 : 5.5);
    map.setPaintProperty("workout-routes", "line-opacity", routeStyleMode === "recency" ? [
      "interpolate",
      ["linear"],
      ["coalesce", ["get", "style_score"], 0],
      0,
      0.16,
      0.35,
      0.32,
      0.7,
      0.62,
      1,
      0.94,
    ] : [
      "literal",
      0,
    ]);

    const selectedOverlayOpacity = routeStyleMode === "recency" ? 0.92 : 0;
    const selectedCoreOpacity = routeStyleMode === "recency" ? 1 : 0;
    const detailOpacity = routeStyleMode === "recency" ? 0 : 1;

    if (map.getLayer("selected-workout-route")) {
      map.setPaintProperty("selected-workout-route", "line-opacity", selectedOverlayOpacity);
    }

    if (map.getLayer("selected-workout-core")) {
      map.setPaintProperty("selected-workout-core", "line-opacity", selectedCoreOpacity);
    }

    if (map.getLayer("selected-workout-detail-glow")) {
      map.setPaintProperty("selected-workout-detail-glow", "line-opacity", detailOpacity === 0 ? 0 : 0.42);
    }

    if (map.getLayer("selected-workout-detail-core")) {
      map.setPaintProperty("selected-workout-detail-core", "line-opacity", detailOpacity === 0 ? 0 : 0.98);
    }
  }, [routeStyleMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const syncTerrainState = () => {
      ensureWorkoutTerrainLayers(map);
      map.setLayoutProperty(MAP_HILLSHADE_LAYER_ID, "visibility", terrainEnabled ? "visible" : "none");

      if (terrainEnabled) {
        map.setTerrain({ source: MAP_TERRAIN_SOURCE_ID, exaggeration: 1.15 });
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

  useEffect(() => {
    if (routeStyleMode === "recency" || !selectedMetricSeries) {
      setHoveredRoutePointIndex(null);
      setSelectedRoutePointIndex(null);
      setPlaybackActive(false);
    }
  }, [routeStyleMode, selectedMetricSeries, selectedActivityId]);

  useEffect(() => {
    setHoveredRoutePointIndex(null);
    setSelectedRoutePointIndex(null);
    setPlaybackActive(false);
  }, [selectedActivityId]);

  useEffect(() => {
    if (!playbackActive || !selectedMetricSeries || selectedMetricSeries.points.length === 0) {
      return;
    }

    const points = selectedMetricSeries.points;
    const playbackStep = Math.max(1, Math.ceil(points.length / (PLAYBACK_TARGET_DURATION_MS / PLAYBACK_INTERVAL_MS)));

    const intervalId = window.setInterval(() => {
      setSelectedRoutePointIndex((currentIndex) => {
        const currentPosition = currentIndex == null
          ? -1
          : points.findIndex((point) => point.sourceIndex === currentIndex);
        const nextPosition = currentPosition + playbackStep;
        if (nextPosition >= points.length) {
          window.clearInterval(intervalId);
          setPlaybackActive(false);
          return points[points.length - 1]?.sourceIndex ?? null;
        }

        return points[nextPosition].sourceIndex;
      });
    }, PLAYBACK_INTERVAL_MS);

    if (selectedRoutePointIndex == null) {
      setSelectedRoutePointIndex(points[0].sourceIndex);
    }

    return () => {
      window.clearInterval(intervalId);
    };
  }, [playbackActive, selectedMetricSeries, selectedRoutePointIndex]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource("selected-workout-hover-point") || !map.getLayer("selected-workout-hover-point")) {
      return;
    }

    const hoverSource = map.getSource("selected-workout-hover-point") as GeoJSONSource;
    if (!activeMetricPoint || routeStyleMode === "recency") {
      hoverSource.setData(EMPTY_HOVER_POINT);
      if (map.getLayer("selected-workout-hover-point-glow")) {
        map.setPaintProperty("selected-workout-hover-point-glow", "circle-opacity", 0);
      }
      map.setPaintProperty("selected-workout-hover-point", "circle-opacity", 0);
      return;
    }

    hoverSource.setData({
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [activeMetricPoint.longitude, activeMetricPoint.latitude],
        },
        properties: {
          route_index: activeMetricPoint.sourceIndex,
        },
      }],
    });
    if (map.getLayer("selected-workout-hover-point-glow")) {
      map.setPaintProperty("selected-workout-hover-point-glow", "circle-opacity", 0.8);
    }
    map.setPaintProperty("selected-workout-hover-point", "circle-opacity", 1);
  }, [activeMetricPoint, routeStyleMode]);

  useEffect(() => {
    if (!selectedActivityId) {
      setSelectedActivityDetail(null);
      setDetailLoading(false);
      setSimilarRoutes(null);
      setShowSimilarRoutes(false);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);

    void fetchActivityDetail(selectedActivityId)
      .then((detail) => {
        if (!cancelled) {
          setSelectedActivityDetail(detail);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSelectedActivityDetail(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setDetailLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedActivityId]);

  async function loadOverview() {
    setFiltersLoading(true);
    setError(null);

    try {
      const nextAnalytics = await fetchActivityAnalytics();
      setOverviewAnalytics(nextAnalytics);
      setAnalytics(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load workout overview.");
    } finally {
      setFiltersLoading(false);
    }
  }

  async function loadSimilarRoutes() {
    if (!selectedActivityId) return;
    setSimilarRoutesLoading(true);
    try {
      const result = await fetchSimilarRoutes(selectedActivityId);
      setSimilarRoutes(result);
      setShowSimilarRoutes(true);
    } catch {
      setSimilarRoutes(null);
    } finally {
      setSimilarRoutesLoading(false);
    }
  }

  // Sync similar routes to map layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const source = map.getSource("similar-routes") as GeoJSONSource | undefined;
    if (!source) return;

    if (!showSimilarRoutes || !similarRoutes?.matches.length) {
      source.setData(EMPTY_SIMILAR_ROUTES);
      if (map.getLayer("similar-routes-lines")) {
        map.setPaintProperty("similar-routes-lines", "line-opacity", 0);
      }
      return;
    }

    const features: GeoJSON.Feature<GeoJSON.LineString>[] = similarRoutes.matches
      .filter((m) => m.route_points_json && m.route_points_json.length >= 2)
      .map((m) => ({
        type: "Feature" as const,
        geometry: {
          type: "LineString" as const,
          coordinates: m.route_points_json!.map((p) => [p.longitude, p.latitude]),
        },
        properties: { activity_id: m.activity_id, name: m.name },
      }));

    source.setData({ type: "FeatureCollection", features });
    if (map.getLayer("similar-routes-lines")) {
      map.setPaintProperty("similar-routes-lines", "line-opacity", 0.55);
    }
  }, [showSimilarRoutes, similarRoutes]);

  async function loadTimelineAndWorkspace(activityType: string | null) {
    if (activityType === null) {
      setSelectedActivityType(null);
      setTimeline(null);
      setDraftDateRange(null);
      setAppliedDateRange(null);
      setActivities([]);
      setMapData(EMPTY_COLLECTION);
      setAnalytics(null);
      setSelectedActivityId(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    setActivities([]);
    setMapData(EMPTY_COLLECTION);
    setSelectedActivityId(null);

    try {
      const normalizedActivityType = activityType === ALL_ACTIVITY_TYPES ? null : activityType;
      const nextTimeline = await fetchActivityTimeline(normalizedActivityType);
      const nextTimelineDays = buildTimelineDays(nextTimeline);
      const fullRange = createFullRange(nextTimelineDays.length);

      setSelectedActivityType(activityType);
      setTimeline(nextTimeline);
      setDraftDateRange(fullRange);
      setAppliedDateRange(fullRange);

      if (!fullRange) {
        setActivities([]);
        setMapData(EMPTY_COLLECTION);
        setAnalytics(await fetchActivityAnalytics({ activityType: normalizedActivityType }));
        return;
      }

      const [startDate, endDate] = [
        nextTimelineDays[fullRange[0]]?.date ?? null,
        nextTimelineDays[fullRange[1]]?.date ?? null,
      ];

      await loadWorkspace({
        activityType: normalizedActivityType,
        startDate,
        endDate,
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load filtered workouts.");
    } finally {
      setLoading(false);
    }
  }

  async function loadWorkspace(filters: { activityType?: string | null; startDate?: string | null; endDate?: string | null }) {
    const [nextActivities, nextMapData, nextAnalytics] = await Promise.all([
      fetchActivities(filters),
      fetchActivityMapFeatures(filters),
      fetchActivityAnalytics(filters),
    ]);

    setActivities(nextActivities);
    setMapData(nextMapData);
    setAnalytics(nextAnalytics);
    setSelectedActivityId((currentId) => {
      if (currentId && nextActivities.some((activity) => activity.id === currentId)) {
        return currentId;
      }
      return nextActivities[0]?.id ?? null;
    });
  }

  async function applyDateRange(nextRange: DateRangeIndexes) {
    setDraftDateRange(nextRange);
    setAppliedDateRange(nextRange);

    if (!hasActiveTypeSelection) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await loadWorkspace({
        activityType: selectedActivityType === ALL_ACTIVITY_TYPES ? null : selectedActivityType,
        startDate: timelineDays[nextRange[0]]?.date ?? null,
        endDate: timelineDays[nextRange[1]]?.date ?? null,
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to apply date filter.");
    } finally {
      setLoading(false);
    }
  }

  async function handleActivityTypeChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextValue = event.target.value;
    if (nextValue === UNSELECTED_ACTIVITY_TYPE) {
      await loadTimelineAndWorkspace(null);
      return;
    }

    await loadTimelineAndWorkspace(nextValue);
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
      <div className="pointer-events-none absolute inset-0 bg-[var(--map-gradient-overlay)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-52 bg-[var(--map-top-fade)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-64 bg-[var(--map-bottom-fade)]" />

      <div className="absolute left-4 right-4 top-4 z-30 flex flex-wrap items-start gap-3 sm:left-6 sm:right-6">
        <header className="shrink-0">
          <div className="flex items-center justify-between gap-4 rounded-[1.35rem] border border-[var(--border-translucent-mid)] bg-[var(--glass-panel)] px-4 py-2.5 shadow-[0_18px_36px_var(--shadow-color)] backdrop-blur-[24px]">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="outline"
              className="h-9 rounded-full border-[var(--border-secondary)] bg-[var(--glass-button)] px-3 text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text-primary)]"
              onClick={() => setPanelOpen((value) => !value)}
            >
              {panelOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </Button>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--text-label)]">Altvia</p>
              <p className="mt-0.5 text-xs text-[var(--text-section)]">Personal Map</p>
            </div>
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
              <div className="absolute right-0 top-full mt-2 w-44 rounded-[1rem] border border-[var(--border-translucent)] bg-[var(--glass-dropdown)] p-2 shadow-[0_18px_36px_var(--shadow-color)] backdrop-blur-[20px]">
                <button
                  type="button"
                  onClick={openPlanner}
                  className="flex w-full items-center gap-2 rounded-[0.8rem] px-3 py-2 text-left text-sm text-[var(--text-secondary)] transition hover:bg-[var(--surface-elevated)]"
                >
                  <MapIcon className="h-4 w-4" />
                  Planner
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

        <div className="flex flex-1 flex-wrap items-center gap-2 pt-1">
          <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-[var(--border-translucent-light)] bg-[var(--glass-panel)] px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)] shadow-[0_18px_36px_var(--shadow-color)] backdrop-blur-[24px]">
            <span className="h-2 w-2 rounded-full bg-[#00BFFF]" />
            Workouts
            <span className="text-[var(--text-very-faint)]">/</span>
            <span>{mapData.features.length} route traces</span>
          </div>
          <div className="pointer-events-auto inline-flex items-center gap-1 rounded-full border border-[var(--border-translucent-light)] bg-[var(--glass-panel)] px-1 py-1 text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)] shadow-[0_18px_36px_var(--shadow-color)] backdrop-blur-[24px]">
            <button
              type="button"
              onClick={() => mapRef.current?.zoomOut()}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--text-secondary)] transition hover:bg-[var(--surface-elevated)]"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="min-w-[3rem] text-center text-[var(--text-secondary)]">{mapZoom.toFixed(1)}x</span>
            <button
              type="button"
              onClick={() => mapRef.current?.zoomIn()}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--text-secondary)] transition hover:bg-[var(--surface-elevated)]"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => setTerrainEnabled((current) => !current)}
            className={cn(
              "pointer-events-auto inline-flex h-9 items-center rounded-full border px-3 text-xs uppercase tracking-[0.18em] transition shadow-[0_18px_36px_var(--shadow-color)] backdrop-blur-[24px]",
              terrainEnabled
                ? "border-[var(--accent-green)]/35 bg-[var(--accent-green)] text-white hover:bg-[var(--accent-green-hover)]"
                : "border-[var(--border-translucent-light)] bg-[var(--glass-panel)] text-[var(--text-secondary)] hover:bg-[var(--glass-pill)]",
            )}
          >
            3D Terrain
          </button>
          <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-[var(--border-translucent-light)] bg-[var(--glass-panel)] px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)] shadow-[0_18px_36px_var(--shadow-color)] backdrop-blur-[24px]">
            <span className="text-[var(--text-label)]">Active Layer</span>
            <span className="text-[var(--text-secondary)]">
              {selectedActivityType === ALL_ACTIVITY_TYPES
                ? "All Workouts"
                : selectedActivityType
                  ? humanizeActivityType(selectedActivityType)
                  : "Awaiting Filter"}
            </span>
          </div>
          <div className="pointer-events-auto inline-flex items-center gap-1 rounded-full border border-[var(--border-translucent-light)] bg-[var(--glass-panel)] p-1 text-[11px] uppercase tracking-[0.16em] text-[var(--text-muted)] shadow-[0_18px_36px_var(--shadow-color)] backdrop-blur-[24px]">
            <StyleModePill label="Recency" active={routeStyleMode === "recency"} onClick={() => setRouteStyleMode("recency")} />
            <StyleModePill label="Pace" active={routeStyleMode === "pace"} onClick={() => setRouteStyleMode("pace")} />
            <StyleModePill label="Elevation" active={routeStyleMode === "elevation"} onClick={() => setRouteStyleMode("elevation")} />
            <StyleModePill label="Heart Rate" active={routeStyleMode === "heart_rate"} onClick={() => setRouteStyleMode("heart_rate")} />
          </div>
        </div>
      </div>

      <aside
        className={cn(
          "absolute bottom-4 left-4 top-24 z-20 w-[min(344px,calc(100vw-2rem))] overflow-hidden rounded-[1.75rem] border border-[var(--border-translucent-half)] bg-[var(--glass-panel)] shadow-[0_24px_60px_var(--shadow-color)] backdrop-blur-[24px] transition-transform duration-300 xl:w-[360px]",
          panelOpen ? "translate-x-0" : "-translate-x-[calc(100%+1rem)]",
        )}
      >
        <div className="flex h-full flex-col">
          <div className="border-b border-[var(--border-solid)] px-5 py-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.26em] text-[var(--text-label)]">Library</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--text-primary)]">Your terrain workspace</h2>
              </div>
              <div className="rounded-full border border-[var(--border-solid)] bg-[var(--glass-pill)] px-3 py-1 text-xs text-[var(--text-subtle)]">
                {activities.length} loaded
              </div>
            </div>

            <div className="mt-5 flex rounded-full border border-[var(--border-solid)] bg-[var(--surface-tertiary)] p-1">
              <PanelTab
                label="My Workouts"
                active={activeTab === "mine"}
                onClick={() => setActiveTab("mine")}
              />
              <PanelTab
                label="My Friends' Workouts"
                active={activeTab === "friends"}
                onClick={() => setActiveTab("friends")}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-5">
            {activeTab === "friends" ? (
              <EmptyState
                title="Friends feed is staged"
                body="Club and friends layers can plug into the same panel later. For now, the personal map starts with your own workouts."
              />
            ) : (
              <div className="grid gap-5">
                <section className="grid gap-3">
                  <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-[var(--text-faint)]">Filters</p>
                  <label className="grid gap-2 text-sm text-[var(--text-tertiary)]">
                    <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">Workout Type</span>
                    <select
                      value={selectedActivityType ?? UNSELECTED_ACTIVITY_TYPE}
                      onChange={(event) => void handleActivityTypeChange(event)}
                      className="h-11 rounded-[1rem] border border-[var(--border-secondary)] bg-[var(--surface-secondary)] px-4 text-sm text-[var(--text-primary)] outline-none transition focus:border-[#00BFFF]/50"
                      disabled={filtersLoading || loading}
                    >
                      <option value={UNSELECTED_ACTIVITY_TYPE}>Select a workout type</option>
                      <option value={ALL_ACTIVITY_TYPES}>All workouts</option>
                      {activityTypeOptions.map((activityType) => (
                        <option key={activityType} value={activityType}>
                          {humanizeActivityType(activityType)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">Timeline Metric</span>
                    <select
                      value={timelineMetric}
                      onChange={(event) => setTimelineMetric(event.target.value as TimelineMetric)}
                      className="h-9 rounded-full border border-[var(--border-secondary)] bg-[var(--surface-secondary)] px-3 text-xs uppercase tracking-[0.18em] text-[var(--text-tertiary)] outline-none transition focus:border-[#00BFFF]/50"
                      disabled={!hasActiveTypeSelection || timelineDays.length === 0}
                    >
                      <option value="total_distance_meters">Distance</option>
                      <option value="total_duration_seconds">Duration</option>
                      <option value="session_count">Sessions</option>
                    </select>
                  </div>

                  {hasActiveTypeSelection && timelineDays.length > 0 && selectedRange ? (
                    <DateHistogramSlider
                      days={timelineDays}
                      metric={timelineMetric}
                      range={appliedDateRange!}
                      draftRange={draftDateRange ?? appliedDateRange!}
                      onRangeChange={setDraftDateRange}
                      onRangeCommit={(nextRange) => void applyDateRange(nextRange)}
                      disabled={loading}
                      unitSystem={unitSystem}
                    />
                  ) : (
                    <div className="rounded-[1.2rem] border border-dashed border-[var(--border-secondary)] bg-[var(--surface-secondary)] p-4 text-sm leading-6 text-[var(--text-subtle)]">
                      {filtersLoading
                        ? "Loading workout metadata."
                        : "Pick a workout type to load your training history."}
                    </div>
                  )}
                </section>

                <section className="rounded-[1.5rem] border border-[var(--border-translucent-strong)] bg-[var(--glass-card)] p-4 backdrop-blur-[18px]">
                  <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-[var(--text-faint)]">
                    {hasActiveTypeSelection ? "Selection Analytics" : "All Workout Analytics"}
                  </p>
                  {activeAnalytics ? (
                    <div className="mt-4 grid gap-3">
                      <div className="grid grid-cols-2 gap-3">
                        <AnalyticsCard label="Sessions" value={activeAnalytics.total_sessions.toLocaleString()} />
                        <AnalyticsCard label="Mapped" value={activeAnalytics.mapped_sessions.toLocaleString()} />
                        <AnalyticsCard label="Distance" value={formatDistance(activeAnalytics.total_distance_meters, unitSystem)} />
                        <AnalyticsCard label="Elevation" value={formatElevation(activeAnalytics.total_elevation_gain_meters, unitSystem)} />
                      </div>
                      <div className="rounded-[1.2rem] border border-[var(--border-translucent-strong)] bg-[var(--glass-card)] p-4 backdrop-blur-[16px]">
                        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">Session Types</p>
                        <div className="mt-3 grid gap-2">
                          {activeAnalytics.activity_types.length > 0 ? (
                            activeAnalytics.activity_types.slice(0, 5).map((item) => (
                              <div key={item.activity_type} className="flex items-center justify-between text-sm text-[var(--text-tertiary)]">
                                <span>{humanizeActivityType(item.activity_type)}</span>
                                <span>{item.count}</span>
                              </div>
                            ))
                          ) : (
                            <p className="text-sm text-[var(--text-muted)]">No sessions parsed yet.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">
                      Import your project Apple Health export to start building map and session analytics.
                    </p>
                  )}
                </section>

                <section className="grid gap-3">
                  {hasActiveTypeSelection && activities.length > 0 ? (
                    <div className="flex items-center justify-between gap-3 rounded-[1.2rem] border border-[var(--border-translucent-strong)] bg-[var(--glass-card)] px-4 py-3 backdrop-blur-[16px]">
                      <div>
                        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">Sort Workouts</p>
                        <p className="mt-1 text-xs text-[var(--text-subtle)]">Order the loaded workout list without changing the map.</p>
                      </div>
                      <select
                        value={workoutSortMode}
                        onChange={(event) => setWorkoutSortMode(event.target.value as WorkoutSortMode)}
                        className="h-9 rounded-full border border-[var(--border-secondary)] bg-[var(--surface-secondary)] px-3 text-xs uppercase tracking-[0.18em] text-[var(--text-tertiary)] outline-none transition focus:border-[#00BFFF]/50"
                      >
                        <option value="date">Date</option>
                        <option value="distance">Distance</option>
                        <option value="duration">Duration</option>
                        <option value="average_heart_rate">Avg Heart Rate</option>
                      </select>
                    </div>
                  ) : null}
                  {loading ? <SessionListSkeleton /> : null}
                  {!loading && error ? <InlineMessage tone="error">{error}</InlineMessage> : null}
                  {!loading && !error && !hasActiveTypeSelection ? (
                    <EmptyState
                      title="Pick a workout type"
                      body="The map stays lightweight until you choose a workout type. Start with Runs, Walks, or another session type, then tighten the date range with the histogram slider."
                    />
                  ) : null}
                  {!loading && !error && hasActiveTypeSelection && activities.length === 0 ? (
                    <EmptyState
                      title="No workouts in this filter"
                      body="Try widening the date range or switching to another workout type."
                    />
                  ) : null}
                  {!loading && !error && sortedActivities.length > 0
                    ? sortedActivities.map((activity) => {
                        const hasRoute = mapData.features.some((feature) => feature.properties.id === activity.id);
                        const active = activity.id === selectedActivity?.id;

                        return (
                          <button
                            key={activity.id}
                            type="button"
                            onClick={() => setSelectedActivityId(activity.id)}
                            className={cn(
                              "rounded-[1.4rem] border p-4 text-left transition",
                              active
                                ? "border-[#00BFFF]/40 bg-[var(--status-selected-bg)]"
                                : "border-[var(--border-solid)] bg-[var(--glass-card-light)] hover:border-[var(--border-secondary)] hover:bg-[var(--glass-pill)]",
                            )}
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <p className="text-base font-medium text-[var(--text-primary)]">{activity.name}</p>
                                <p className="mt-1 text-sm text-[var(--text-page-secondary)]">{formatDateTime(activity.started_at)}</p>
                              </div>
                              <div className="rounded-full border border-[var(--border-solid)] bg-[var(--glass-pill)] px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-[var(--text-page-secondary)]">
                                {hasRoute ? "Mapped" : "No route"}
                              </div>
                            </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-[var(--text-muted)]">
                              <MetricPill label="Type" value={humanizeActivityType(activity.activity_type)} />
                              <MetricPill label="Distance" value={formatDistance(activity.distance_meters, unitSystem)} />
                              <MetricPill label="Duration" value={formatDuration(activity.duration_seconds)} />
                              {activity.average_heart_rate_bpm != null ? (
                                <MetricPill label="Avg HR" value={formatHeartRate(activity.average_heart_rate_bpm)} />
                              ) : null}
                            </div>
                          </button>
                        );
                      })
                    : null}
                </section>
              </div>
            )}
          </div>
        </div>
      </aside>

      {selectedMetricSeries ? (
        <div className="pointer-events-auto absolute bottom-4 left-1/2 z-20 w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 rounded-[1.35rem] border border-[var(--border-divider)] bg-[var(--glass-panel)] px-4 py-3 shadow-[0_18px_40px_var(--shadow-color)] backdrop-blur-[24px]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-label)]">
                {routeStyleModeLabel(routeStyleMode)} Trace
              </p>
              <p className="truncate text-xs text-[var(--text-subtle)]">
                {selectedActivity?.name ?? "Selected workout"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setChartMinimized((value) => !value)}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--border-solid)] bg-[var(--glass-pill)] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]"
            >
              {chartMinimized ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {chartMinimized ? "Expand" : "Minimize"}
            </button>
          </div>
          {chartMinimized ? (
            <div className="text-xs text-[var(--text-subtle)]">
              {selectedMetricSeries.startLabel} to {selectedMetricSeries.endLabel}
              <span className="mx-2 text-[var(--text-very-faint)]">/</span>
              {selectedMetricSeries.minLabel} to {selectedMetricSeries.maxLabel}
            </div>
          ) : null}
          {!chartMinimized ? (
            <>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-xs text-[var(--text-subtle)]">
                  {activeRoutePoint
                    ? `${formatTimeWithSeconds(activeRoutePoint.recorded_at)} • ${routeStyleModeLabel(routeStyleMode)} ${formatRouteMetricValue(
                        activeMetricPoint?.rawValue ?? 0,
                        routeStyleMode,
                        unitSystem,
                      )}`
                    : "Hover or click the trace to inspect a point in time."}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!selectedMetricSeries.points.length) {
                        return;
                      }
                      setSelectedRoutePointIndex((current) => current ?? selectedMetricSeries.points[0].sourceIndex);
                      setPlaybackActive((current) => !current);
                    }}
                    className="inline-flex items-center gap-2 rounded-full border border-[var(--border-solid)] bg-[var(--glass-pill)] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]"
                  >
                    {playbackActive ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                    {playbackActive ? "Pause" : "Play"}
                  </button>
                  {selectedRoutePointIndex != null ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedRoutePointIndex(null);
                        setPlaybackActive(false);
                      }}
                      className="inline-flex items-center rounded-full border border-[var(--border-solid)] bg-[var(--glass-pill)] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]"
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
              </div>
              {activeRoutePoint ? (
                <div className="mb-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
                  <div>Pace: {formatPace(activeRoutePoint.pace_seconds_per_mile, unitSystem)}</div>
                  <div>Elevation: {formatElevation(activeRoutePoint.elevation_meters, unitSystem)}</div>
                  <div>Heart Rate: {formatHeartRate(activeRoutePoint.heart_rate_bpm)}</div>
                  <div>
                    Location: {formatCoordinate(activeRoutePoint.latitude)}, {formatCoordinate(activeRoutePoint.longitude)}
                  </div>
                </div>
              ) : null}
              <RouteMetricChart
                series={selectedMetricSeries}
                mode={routeStyleMode}
                activeRoutePointIndex={activeRoutePointIndex}
                onHoverChange={setHoveredRoutePointIndex}
                onHoverClear={() => setHoveredRoutePointIndex(null)}
                onPointSelect={(routePointIndex) => {
                  setSelectedRoutePointIndex(routePointIndex);
                  setPlaybackActive(false);
                }}
              />
            </>
          ) : null}
        </div>
      ) : null}

      {showSimilarRoutes && similarRoutes && similarRoutes.match_count > 0 ? (
        <div className="pointer-events-auto absolute bottom-4 left-1/2 z-20 w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 rounded-[1.35rem] border border-[var(--border-divider)] bg-[var(--glass-panel)] px-4 py-3 shadow-[0_18px_40px_var(--shadow-color)] backdrop-blur-[24px]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-label)]">Route Comparison</p>
              <p className="truncate text-xs text-[var(--text-subtle)]">
                {selectedActivity?.name ?? "Selected workout"} vs {similarRoutes.match_count} similar
              </p>
            </div>
            <div className="flex items-center gap-2">
              {(["pace", "hr", "elevation"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setSimilarRouteMetricMode(m)}
                  className={cn(
                    "inline-flex items-center rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.18em] transition-colors",
                    similarRouteMetricMode === m
                      ? "border-[#22d3ee] bg-[#22d3ee]/10 text-[#22d3ee]"
                      : "border-[var(--border-solid)] bg-[var(--glass-pill)] text-[var(--text-muted)]",
                  )}
                >
                  {m === "hr" ? "Heart Rate" : m === "pace" ? "Pace" : "Elevation"}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowSimilarRoutes(false)}
                className="inline-flex items-center rounded-full border border-[var(--border-solid)] bg-[var(--glass-pill)] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <SimilarRoutesChart
            referenceSeries={
              selectedActivityDetail?.route_points_json
                ? {
                    activityId: selectedActivityDetail.id,
                    label: formatDateTime(selectedActivityDetail.started_at) ?? "Reference",
                    routePoints: selectedActivityDetail.route_points_json,
                  }
                : null
            }
            similarSeries={similarRoutes.matches
              .filter((m) => m.route_points_json && m.route_points_json.length >= 2)
              .map((m) => ({
                activityId: m.activity_id,
                label: formatDateTime(m.started_at) ?? m.name,
                routePoints: m.route_points_json!,
              }))}
            mode={similarRouteMetricMode}
          />
        </div>
      ) : null}

      {hasActiveTypeSelection ? (
        <div className="pointer-events-none absolute bottom-4 right-4 z-20 flex w-[min(360px,calc(100vw-2rem))] items-center justify-between gap-3 rounded-[1.35rem] border border-[var(--border-divider)] bg-[var(--glass-panel-medium)] px-4 py-3 shadow-[0_18px_40px_var(--shadow-color)] backdrop-blur-[24px] sm:right-6">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--text-label)]">Map State</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">{mapStateSummary}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2 text-[11px] text-[var(--text-subtle)]">
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border-solid)] bg-[var(--glass-pill)] px-2.5 py-1">
              <span>{routeStyleLegendStart(routeStyleMode)}</span>
              <span className="h-2 w-14 rounded-full" style={{ background: routeStyleLegendGradient(routeStyleMode) }} />
              <span>{routeStyleLegendEnd(routeStyleMode)}</span>
            </div>
            {routeStyleMode === "recency" ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border-solid)] bg-[var(--glass-pill)] px-2.5 py-1">
                <span className="h-2 w-2 rounded-full bg-[#D4A017]" />
                Selected
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="pointer-events-none absolute right-4 top-[5.75rem] z-20 w-[min(280px,calc(100vw-2rem))] rounded-[1.35rem] border border-[var(--border-divider)] bg-[var(--glass-panel-medium)] p-4 shadow-[0_18px_40px_var(--shadow-color)] backdrop-blur-[24px] sm:right-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--text-label)]">Inspector</p>
        <p className="mt-2 text-lg font-semibold tracking-tight text-[var(--text-primary)]">
          {selectedActivity ? selectedActivity.name : "Your map is ready"}
        </p>
        <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
          {selectedActivity
            ? `${humanizeActivityType(selectedActivity.activity_type)} • ${formatDateTime(selectedActivity.started_at)}`
            : "Pick a workout type and date range to load the sessions you want to inspect."}
        </p>
        {selectedActivity ? (
          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
            <div>Distance: {formatDistance(selectedActivity.distance_meters, unitSystem)}</div>
            <div>Duration: {formatDuration(selectedActivity.duration_seconds)}</div>
            <div>Elevation Gain: {formatElevation(selectedActivity.elevation_gain_meters, unitSystem)}</div>
            <div>Avg Pace: {formatPace(paceSecondsPerMile(selectedActivity.duration_seconds, selectedActivity.distance_meters), unitSystem)}</div>
            {selectedActivity.average_heart_rate_bpm != null ? (
              <div>Average HR: {formatHeartRate(selectedActivity.average_heart_rate_bpm)}</div>
            ) : null}
            {selectedActivity.max_heart_rate_bpm != null ? (
              <div>Max HR: {formatHeartRate(selectedActivity.max_heart_rate_bpm)}</div>
            ) : null}
            {selectedActivity.recovery_heart_rate_bpm != null ? (
              <div>Recovery HR: {formatHeartRate(selectedActivity.recovery_heart_rate_bpm)}</div>
            ) : null}
            {selectedActivity.active_energy_kcal != null ? (
              <div>Active Energy: {formatEnergy(selectedActivity.active_energy_kcal)}</div>
            ) : null}
            {selectedActivityDetail?.route_points_json?.length ? (
              <>
                <div>
                Workout Pace Range: {formatPace(selectedPaceRange?.min ?? selectedActivity.min_pace_seconds_per_mile, unitSystem)} to{" "}
                {formatPace(selectedPaceRange?.max ?? selectedActivity.max_pace_seconds_per_mile, unitSystem)}
                </div>
                <div>
                Workout Elevation Range: {formatElevation(selectedActivity.min_elevation_meters, unitSystem)} to{" "}
                {formatElevation(selectedActivity.max_elevation_meters, unitSystem)}
                </div>
              </>
            ) : null}
            {detailLoading ? <div>Loading route detail...</div> : null}
          </div>
        ) : null}
        {selectedActivity?.weather_json ? (
          <div className="mt-3 border-t border-[var(--border-divider)] pt-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--text-label)]">Weather</p>
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
              <div>{formatTemperature(selectedActivity.weather_json.temperature_c, unitSystem)}</div>
              <div>Wind: {formatWind(selectedActivity.weather_json.wind_speed_kmh, unitSystem)}{selectedActivity.weather_json.wind_direction_deg != null ? ` ${formatWindDirection(selectedActivity.weather_json.wind_direction_deg)}` : ""}</div>
              {selectedActivity.weather_json.rain_mm != null && selectedActivity.weather_json.rain_mm > 0 ? (
                <div>Rain: {formatRain(selectedActivity.weather_json.rain_mm, unitSystem)}</div>
              ) : null}
              {selectedActivity.weather_json.snowfall_cm != null && selectedActivity.weather_json.snowfall_cm > 0 ? (
                <div>Snow: {formatSnow(selectedActivity.weather_json.snowfall_cm, unitSystem)}</div>
              ) : null}
              {selectedActivity.weather_json.precipitation_probability != null ? (
                <div>Precip: {Math.round(selectedActivity.weather_json.precipitation_probability)}%</div>
              ) : null}
              {selectedActivity.weather_json.wind_gusts_kmh != null ? (
                <div>Gusts: {formatWind(selectedActivity.weather_json.wind_gusts_kmh, unitSystem)}</div>
              ) : null}
              {selectedActivity.weather_json.ice_risk ? (
                <div className="col-span-2 text-amber-700">Ice Risk</div>
              ) : null}
            </div>
          </div>
        ) : null}
        {selectedActivity?.effort_score_json ? (() => {
          const es = selectedActivity.effort_score_json;
          const score = es.effort_score;
          const color = score < 25 ? "#22c55e" : score < 50 ? "#84cc16" : score < 75 ? "#eab308" : score < 90 ? "#f97316" : "#ef4444";
          return (
            <div className="mt-3 border-t border-[var(--border-divider)] pt-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--text-label)]">Effort</p>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-2xl font-semibold" style={{ color }}>{Math.round(score)}</span>
                <span className="text-xs text-[var(--text-muted)]">/ 100</span>
              </div>
              <div className="mt-1.5 h-2 w-full rounded-full bg-[var(--progress-track)] overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, backgroundColor: color }} />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
                <div>TRIMP: {es.trimp.toFixed(1)}</div>
                <div>HR Intensity: {Math.round(es.hr_intensity_ratio * 100)}%</div>
                <div>Elev Factor: {es.elevation_factor.toFixed(2)}x</div>
                <div>Max HR: {es.max_hr_used} bpm</div>
              </div>
            </div>
          );
        })() : null}
        {selectedActivity?.workout_cluster_json ? (() => {
          const wc = selectedActivity.workout_cluster_json;
          const LEVELS = ["Recovery", "Easy", "Moderate", "Hard", "Intense", "Extreme"] as const;
          const COLORS: Record<string, { bar: string; text: string }> = {
            Recovery: { bar: "#22c55e", text: "#16a34a" },
            Easy:     { bar: "#84cc16", text: "#65a30d" },
            Moderate: { bar: "#eab308", text: "#ca8a04" },
            Hard:     { bar: "#f97316", text: "#ea580c" },
            Intense:  { bar: "#ef4444", text: "#dc2626" },
            Extreme:  { bar: "#dc2626", text: "#b91c1c" },
          };
          const activeIdx = LEVELS.indexOf(wc.cluster_label as typeof LEVELS[number]);
          const { bar, text } = COLORS[wc.cluster_label] ?? { bar: "#94a3b8", text: "#64748b" };
          return (
            <div className="mt-3 border-t border-[var(--border-divider)] pt-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--text-label)]">Workout Cluster</p>
              <p className="mt-2 text-sm font-semibold" style={{ color: text }}>{wc.cluster_label}</p>
              <div className="mt-2 flex gap-[3px]">
                {LEVELS.map((level, i) => (
                  <div
                    key={level}
                    title={level}
                    className="h-1.5 flex-1 rounded-full"
                    style={{
                      backgroundColor: COLORS[level].bar,
                      opacity: i === activeIdx ? 1 : i < activeIdx ? 0.45 : 0.15,
                      outline: i === activeIdx ? `2px solid ${bar}` : "none",
                      outlineOffset: "1px",
                    }}
                  />
                ))}
              </div>
              <p className="mt-1.5 text-xs text-[var(--text-muted)]">of {wc.n_activities_in_group} {wc.activity_type_group} workouts</p>
            </div>
          );
        })() : null}
        {selectedActivity?.predicted_intensity_json && !selectedActivity?.effort_score_json ? (() => {
          const pi = selectedActivity.predicted_intensity_json;
          const predicted = pi.predicted_effort_score;
          const actual = selectedActivity.effort_score_json?.effort_score ?? null;
          const diff = actual !== null ? Math.abs(predicted - actual) : null;
          const diffColor = diff !== null ? (diff < 10 ? "#22c55e" : diff < 20 ? "#eab308" : "#ef4444") : null;
          const predColor = predicted < 25 ? "#22c55e" : predicted < 50 ? "#84cc16" : predicted < 75 ? "#eab308" : predicted < 90 ? "#f97316" : "#ef4444";
          return (
            <div className="mt-3 border-t border-[var(--border-divider)] pt-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--text-label)]">Predicted Effort</p>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-2xl font-semibold" style={{ color: predColor }}>{Math.round(predicted)}</span>
                <span className="text-xs text-[var(--text-muted)]">/ 100</span>
                {actual !== null ? (
                  <span className="ml-2 text-xs" style={{ color: diffColor! }}>
                    ({diff! < 1 ? "exact" : `${diff! > 0 && predicted > actual ? "+" : ""}${Math.round(predicted - actual)} vs actual`})
                  </span>
                ) : null}
              </div>
              <div className="mt-1.5 h-2 w-full rounded-full bg-[var(--progress-track)] overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${predicted}%`, backgroundColor: predColor }} />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
                <div>Range: {Math.round(pi.confidence_interval_low)}–{Math.round(pi.confidence_interval_high)}</div>
                <div>{pi.weather_adjusted ? "Weather-adjusted" : "No weather data"}</div>
              </div>
            </div>
          );
        })() : null}
        {selectedActivity ? (
          <div className="mt-3 border-t border-[var(--border-divider)] pt-3">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--text-label)]">Similar Routes</p>
              {similarRoutes ? (
                <span className="inline-flex items-center rounded-full bg-[var(--glass-pill)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]">
                  {similarRoutes.match_count} match{similarRoutes.match_count !== 1 ? "es" : ""}
                </span>
              ) : null}
            </div>
            {!similarRoutes && !similarRoutesLoading ? (
              <button
                type="button"
                onClick={() => void loadSimilarRoutes()}
                className="pointer-events-auto mt-2 w-full rounded-full border border-[var(--border-solid)] bg-[var(--glass-pill)] px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-card-light)]"
              >
                Find Similar Routes
              </button>
            ) : null}
            {similarRoutesLoading ? (
              <p className="mt-2 text-xs text-[var(--text-muted)]">Searching...</p>
            ) : null}
            {similarRoutes && similarRoutes.match_count === 0 ? (
              <p className="mt-2 text-xs text-[var(--text-muted)]">No similar routes found.</p>
            ) : null}
            {similarRoutes && similarRoutes.match_count > 0 ? (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => setShowSimilarRoutes((v) => !v)}
                  className="pointer-events-auto w-full rounded-full border border-[var(--border-solid)] bg-[var(--glass-pill)] px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-card-light)]"
                >
                  {showSimilarRoutes ? "Hide Comparison" : "Compare Routes"}
                </button>
                {showSimilarRoutes ? (
                  <div className="pointer-events-auto mt-2 max-h-48 overflow-y-auto">
                    {similarRoutes.matches
                      .sort((a, b) => (b.started_at ?? "").localeCompare(a.started_at ?? ""))
                      .map((match) => (
                        <div
                          key={match.activity_id}
                          className="mb-1.5 rounded-lg border border-[var(--border-translucent-strong)] bg-[var(--glass-card-light)] px-2.5 py-1.5 text-xs"
                        >
                          <div className="font-medium text-[var(--text-primary)]">{formatDateTime(match.started_at)}</div>
                          <div className="mt-0.5 grid grid-cols-2 gap-x-2 text-[var(--text-muted)]">
                            <div>{formatDistance(match.distance_meters, unitSystem)}</div>
                            <div>{formatDuration(match.duration_seconds)}</div>
                            {match.average_heart_rate_bpm != null ? (
                              <div>{formatHeartRate(match.average_heart_rate_bpm)}</div>
                            ) : null}
                            {match.effort_score != null ? (
                              <div>Effort: {Math.round(match.effort_score)}</div>
                            ) : null}
                          </div>
                        </div>
                      ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DateHistogramSlider({
  days,
  metric,
  range,
  draftRange,
  onRangeChange,
  onRangeCommit,
  disabled = false,
  unitSystem,
}: {
  days: TimelineDay[];
  metric: TimelineMetric;
  range: DateRangeIndexes;
  draftRange: DateRangeIndexes;
  onRangeChange: (range: DateRangeIndexes) => void;
  onRangeCommit: (range: DateRangeIndexes) => void;
  disabled?: boolean;
  unitSystem: UnitSystem;
}) {
  const [pendingRange, setPendingRange] = useState<DateRangeIndexes>(draftRange);

  useEffect(() => {
    setPendingRange(draftRange);
  }, [draftRange]);

  const maxValue = Math.max(...days.map((day) => day[metric]), 0);
  const min = 0;
  const max = Math.max(days.length - 1, 0);

  function handleStartChange(event: ChangeEvent<HTMLInputElement>) {
    const nextRange: DateRangeIndexes = [Math.min(Number(event.target.value), pendingRange[1]), pendingRange[1]];
    setPendingRange(nextRange);
    onRangeChange(nextRange);
  }

  function handleEndChange(event: ChangeEvent<HTMLInputElement>) {
    const nextRange: DateRangeIndexes = [pendingRange[0], Math.max(Number(event.target.value), pendingRange[0])];
    setPendingRange(nextRange);
    onRangeChange(nextRange);
  }

  function commit(nextRange: DateRangeIndexes = pendingRange) {
    if (nextRange[0] === range[0] && nextRange[1] === range[1]) {
      return;
    }
    onRangeCommit(nextRange);
  }

  const svgWidth = 700;
  const svgHeight = 120;
  const barCount = days.length;
  const barGapRatio = barCount > 150 ? 0 : barCount > 80 ? 0.1 : 0.2;
  const barSlotWidth = barCount > 0 ? svgWidth / barCount : 0;
  const barGap = barSlotWidth * barGapRatio;
  const barWidth = Math.max(barSlotWidth - barGap, 0.5);
  const selStartX = barCount > 0 ? (pendingRange[0] / barCount) * svgWidth : 0;
  const selEndX = barCount > 0 ? ((pendingRange[1] + 1) / barCount) * svgWidth : svgWidth;

  return (
    <div className="pointer-events-auto relative overflow-hidden rounded-[1.2rem] border border-[var(--border-translucent-strong)] bg-[var(--glass-card-light)] px-3 py-3">
      <div className="relative">
        <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="h-28 w-full">
          <line x1="0" y1={svgHeight} x2={svgWidth} y2={svgHeight} style={{ stroke: "var(--chart-axis)" }} strokeWidth="1" />
          <rect x={selStartX} width={Math.max(selEndX - selStartX, 0)} y="0" height={svgHeight} fill="rgba(196,122,42,0.06)" />
          {days.map((day, index) => {
            const rawValue = day[metric];
            const barHeight = maxValue > 0 ? Math.max((rawValue / maxValue) * svgHeight, rawValue > 0 ? svgHeight * 0.04 : 0) : 0;
            const x = index * barSlotWidth + barGap / 2;
            const y = svgHeight - barHeight;
            const active = index >= pendingRange[0] && index <= pendingRange[1];
            return (
              <rect
                key={day.date}
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx={barWidth > 4 ? 1 : 0}
                fill={active ? "#c47a2a" : "rgba(92,86,77,0.18)"}
              >
                <title>{`${formatDateLabel(day.date)} • ${formatMetricValue(rawValue, metric, unitSystem)}`}</title>
              </rect>
            );
          })}
          <line x1={selStartX} y1="0" x2={selStartX} y2={svgHeight} stroke="rgba(196,122,42,0.45)" strokeWidth="1.5" />
          <line x1={selEndX} y1="0" x2={selEndX} y2={svgHeight} stroke="rgba(196,122,42,0.45)" strokeWidth="1.5" />
        </svg>
        <input
          type="range"
          min={min}
          max={max}
          value={pendingRange[0]}
          disabled={disabled}
          onChange={handleStartChange}
          onMouseUp={() => commit()}
          onTouchEnd={() => commit()}
          onKeyUp={() => commit()}
          className="timeline-slider pointer-events-auto absolute inset-0 h-full w-full cursor-pointer bg-transparent"
        />
        <input
          type="range"
          min={min}
          max={max}
          value={pendingRange[1]}
          disabled={disabled}
          onChange={handleEndChange}
          onMouseUp={() => commit()}
          onTouchEnd={() => commit()}
          onKeyUp={() => commit()}
          className="timeline-slider pointer-events-auto absolute inset-0 h-full w-full cursor-pointer bg-transparent"
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--text-subtle)]">
        <span>{formatDateShort(days[0]?.date ?? null)}</span>
        <span className="text-[10px] text-[var(--text-very-faint)]">
          {formatDateShort(days[pendingRange[0]]?.date ?? null)} – {formatDateShort(days[pendingRange[1]]?.date ?? null)}
        </span>
        <span>{formatDateShort(days[days.length - 1]?.date ?? null)}</span>
      </div>
    </div>
  );
}

function PanelTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 rounded-full px-4 py-2 text-xs uppercase tracking-[0.2em] transition",
        active ? "bg-[var(--accent-green)] text-white" : "text-[var(--text-subtle)] hover:bg-[var(--glass-pill)] hover:text-[var(--text-primary)]",
      )}
    >
      {label}
    </button>
  );
}

function StyleModePill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] transition",
        active ? "bg-[#1d1a17] text-white" : "text-[var(--text-muted)] hover:bg-[var(--glass-pill)] hover:text-[var(--text-primary)]",
      )}
    >
      {label}
    </button>
  );
}

function SessionListSkeleton() {
  return (
    <div className="grid gap-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="rounded-[1.4rem] border border-[var(--border-solid)] bg-[var(--glass-button)] p-4">
          <div className="h-5 w-40 animate-pulse rounded-full bg-[var(--skeleton-base)]" />
          <div className="mt-3 h-4 w-52 animate-pulse rounded-full bg-[var(--skeleton-light)]" />
        </div>
      ))}
    </div>
  );
}

function InlineMessage({ children, tone }: { children: ReactNode; tone: "error" | "success" }) {
  return (
    <div
      className={cn(
        "mt-4 rounded-[1.1rem] border px-4 py-3 text-sm",
        tone === "error"
          ? "border-rose-300/30 bg-rose-50 text-rose-900 dark:border-rose-500/30 dark:bg-rose-900/20 dark:text-rose-200"
          : "border-emerald-300/30 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-900/20 dark:text-emerald-200",
      )}
    >
      {children}
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[1.4rem] border border-[var(--border-solid)] bg-[var(--glass-button)] p-5">
      <p className="text-lg font-medium text-[var(--text-primary)]">{title}</p>
      <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{body}</p>
    </div>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-full border border-[var(--border-solid)] bg-[var(--glass-pill)] px-3 py-1 text-[var(--text-muted)]">
      {label}: {value}
    </span>
  );
}

function AnalyticsCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.15rem] border border-[var(--border-solid)] bg-[var(--surface-secondary)] p-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-faint)]">{label}</p>
      <p className="mt-2 text-lg text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

function RouteMetricChart({
  series,
  mode,
  activeRoutePointIndex,
  onHoverChange,
  onHoverClear,
  onPointSelect,
}: {
  series: RouteMetricSeries;
  mode: RouteStyleMode;
  activeRoutePointIndex: number | null;
  onHoverChange: (routePointIndex: number) => void;
  onHoverClear: () => void;
  onPointSelect: (routePointIndex: number) => void;
}) {
  const width = 700;
  const height = 160;
  const paddingX = 12;
  const paddingY = 12;
  const innerWidth = width - paddingX * 2;
  const innerHeight = height - paddingY * 2;
  const points = series.points;

  const path = points
    .map((point, index) => {
      const x = paddingX + point.position * innerWidth;
      const y = paddingY + (1 - point.normalizedValue) * innerHeight;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");

  const areaPath = `${path} L ${(paddingX + innerWidth).toFixed(2)} ${(paddingY + innerHeight).toFixed(2)} L ${paddingX.toFixed(2)} ${(paddingY + innerHeight).toFixed(2)} Z`;
  const chartStroke = mode === "heart_rate" ? "var(--chart-heart-rate)" : mode === "pace" ? "var(--chart-pace)" : "var(--chart-elevation)";
  const chartArea = mode === "heart_rate" ? "var(--chart-heart-rate)" : mode === "pace" ? "var(--chart-pace)" : "var(--chart-elevation)";
  const hoveredPoint = points.find((point) => point.sourceIndex === activeRoutePointIndex) ?? null;
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
    }, null as RouteMetricSeriesPoint | null);

    if (closestPoint) {
      onHoverChange(closestPoint.sourceIndex);
    }
  }

  function handlePointerDown(event: ReactMouseEvent<SVGSVGElement>) {
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
    }, null as RouteMetricSeriesPoint | null);

    if (closestPoint) {
      onPointSelect(closestPoint.sourceIndex);
    }
  }

  return (
    <div className="pointer-events-auto relative overflow-hidden rounded-[1.2rem] border border-[var(--border-translucent-strong)] bg-[var(--glass-card-light)] px-3 py-3">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-40 w-full"
          onMouseMove={handlePointerMove}
          onMouseLeave={onHoverClear}
          onClick={handlePointerDown}
        >
          <defs>
            <linearGradient id="route-metric-area" x1="0%" x2="0%" y1="0%" y2="100%">
              <stop offset="0%" style={{ stopColor: chartArea }} stopOpacity="0.18" />
              <stop offset="100%" style={{ stopColor: chartArea }} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <line x1={paddingX} y1={paddingY + innerHeight} x2={paddingX + innerWidth} y2={paddingY + innerHeight} style={{ stroke: "var(--chart-axis)" }} strokeWidth="1" />
          <path d={areaPath} fill="url(#route-metric-area)" />
          <path d={path} fill="none" style={{ stroke: chartStroke }} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          {hoveredX != null && hoveredY != null ? (
            <>
              <line x1={hoveredX} y1={paddingY} x2={hoveredX} y2={paddingY + innerHeight} style={{ stroke: "var(--chart-hover-line)" }} strokeWidth="1" strokeDasharray="4 4" />
              <circle cx={hoveredX} cy={hoveredY} r="5.5" style={{ fill: "var(--chart-point-fill)", stroke: chartStroke }} strokeWidth="2.5" />
            </>
          ) : null}
        </svg>
        <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--text-subtle)]">
          <span>{series.startLabel}</span>
          <span>
            {series.minLabel} to {series.maxLabel}
          </span>
          <span>{series.endLabel}</span>
        </div>
    </div>
  );
}

function fitToCollection(map: MaplibreMap, collection: ActivityMapFeatureCollection) {
  const bounds = createBoundsFromCollection(collection);
  if (!bounds) {
    return;
  }

  map.fitBounds(bounds, {
    padding: 60,
    duration: 900,
  });
}

function fitToFeature(map: MaplibreMap, feature: ActivityMapFeature) {
  const bounds = createBoundsFromGeometry(feature.geometry);
  if (!bounds) {
    return;
  }

  map.fitBounds(bounds, {
    padding: 80,
    duration: 900,
  });
}

function createBoundsFromCollection(collection: ActivityMapFeatureCollection): LngLatBoundsLike | null {
  const allCoordinates = collection.features.flatMap((feature) => flattenCoordinates(feature.geometry.coordinates));
  return createBounds(allCoordinates);
}

function createBoundsFromGeometry(geometry: ActivityMapFeature["geometry"]): LngLatBoundsLike | null {
  return createBounds(flattenCoordinates(geometry.coordinates));
}

function createBounds(coordinates: number[][]): LngLatBoundsLike | null {
  if (coordinates.length === 0) {
    return null;
  }

  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  for (const [lng, lat] of coordinates) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ] as [[number, number], [number, number]];
}

function flattenCoordinates(coordinates: number[][] | number[][][]) {
  if (coordinates.length === 0) {
    return [];
  }

  if (typeof coordinates[0][0] === "number") {
    return coordinates as number[][];
  }

  return (coordinates as number[][][]).flat();
}

function buildTimelineDays(timeline: ActivityTimeline | null): TimelineDay[] {
  if (!timeline?.min_date || !timeline.max_date) {
    return [];
  }

  const bucketsByDate = new Map(timeline.buckets.map((bucket) => [bucket.date, bucket]));
  const days: TimelineDay[] = [];

  const start = new Date(`${timeline.min_date}T00:00:00Z`);
  const end = new Date(`${timeline.max_date}T00:00:00Z`);

  for (let current = start.getTime(); current <= end.getTime(); current += DAY_IN_MS) {
    const date = new Date(current).toISOString().slice(0, 10);
    const bucket = bucketsByDate.get(date);
    days.push({
      date,
      session_count: bucket?.session_count ?? 0,
      total_distance_meters: bucket?.total_distance_meters ?? 0,
      total_duration_seconds: bucket?.total_duration_seconds ?? 0,
    });
  }

  return days;
}

function sortActivities(activities: ActivitySummary[], mode: WorkoutSortMode) {
  return [...activities].sort((left, right) => {
    switch (mode) {
      case "average_heart_rate":
        return compareDescending(left.average_heart_rate_bpm, right.average_heart_rate_bpm, left, right);
      case "distance":
        return compareDescending(left.distance_meters, right.distance_meters, left, right);
      case "duration":
        return compareDescending(left.duration_seconds, right.duration_seconds, left, right);
      case "date":
      default:
        return compareDescending(parseDateValue(left.started_at), parseDateValue(right.started_at), left, right);
    }
  });
}

function ensureWorkoutTerrainLayers(map: MaplibreMap) {
  if (!map.getSource(MAP_TERRAIN_SOURCE_ID)) {
    map.addSource(MAP_TERRAIN_SOURCE_ID, {
      type: "raster-dem",
      tiles: MAP_TERRAIN_TILES,
      tileSize: 256,
      encoding: "terrarium",
      maxzoom: 15,
    });
  }

  if (!map.getLayer(MAP_HILLSHADE_LAYER_ID)) {
    const hillshadeLayer: maplibregl.HillshadeLayerSpecification = {
      id: MAP_HILLSHADE_LAYER_ID,
      type: "hillshade",
      source: MAP_TERRAIN_SOURCE_ID,
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

    if (map.getLayer("labels")) {
      map.addLayer(hillshadeLayer, "labels");
    } else {
      map.addLayer(hillshadeLayer);
    }
  }
}

function compareDescending(
  leftValue: number | null,
  rightValue: number | null,
  leftActivity: ActivitySummary,
  rightActivity: ActivitySummary,
) {
  const normalizedLeft = leftValue ?? -Infinity;
  const normalizedRight = rightValue ?? -Infinity;
  if (normalizedLeft !== normalizedRight) {
    return normalizedRight - normalizedLeft;
  }

  return parseDateValue(rightActivity.started_at) - parseDateValue(leftActivity.started_at);
}

function buildStyledCollection(collection: ActivityMapFeatureCollection, mode: RouteStyleMode): ActivityMapFeatureCollection {
  const scoreById = scoreFeatures(collection.features, mode);

  return {
    ...collection,
    features: collection.features.map((feature) => ({
      ...feature,
      properties: {
        ...feature.properties,
        style_score: scoreById.get(feature.properties.id) ?? 0,
      },
    })),
  };
}

function buildSelectedDetailSegments(
  activity: ActivityDetail | null,
  mode: RouteStyleMode,
): GeoJSON.FeatureCollection<GeoJSON.LineString, { segment_score: number }> {
  if (!activity || mode === "recency") {
    return EMPTY_DETAIL_SEGMENTS;
  }

  const routePoints = activity.route_points_json ?? [];
  if (routePoints.length < 2) {
    return EMPTY_DETAIL_SEGMENTS;
  }

  const values = routePoints
    .map((point) => pointMetricValue(point, mode))
    .filter((value): value is number => value != null && Number.isFinite(value));

  if (values.length === 0) {
    return EMPTY_DETAIL_SEGMENTS;
  }

  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);

  return {
    type: "FeatureCollection",
    features: routePoints.flatMap((point, index) => {
      const nextPoint = routePoints[index + 1];
      if (!nextPoint) {
        return [];
      }

      if (!isFiniteCoordinate(point.longitude) || !isFiniteCoordinate(point.latitude)) {
        return [];
      }

      if (!isFiniteCoordinate(nextPoint.longitude) || !isFiniteCoordinate(nextPoint.latitude)) {
        return [];
      }

      const value = pointMetricValue(nextPoint, mode) ?? pointMetricValue(point, mode);
      if (value == null || !Number.isFinite(value)) {
        return [];
      }

      return [{
        type: "Feature" as const,
        geometry: {
          type: "LineString" as const,
          coordinates: [
            [point.longitude, point.latitude],
            [nextPoint.longitude, nextPoint.latitude],
          ],
        },
        properties: {
          segment_score: normalizeValue(value, minValue, maxValue),
          route_index: index + 1,
        },
      }];
    }),
  };
}

type RouteMetricSeriesPoint = {
  sourceIndex: number;
  latitude: number;
  longitude: number;
  position: number;
  normalizedValue: number;
  rawValue: number;
};

type RouteMetricSeries = {
  points: RouteMetricSeriesPoint[];
  minLabel: string;
  maxLabel: string;
  startLabel: string;
  endLabel: string;
};

type DetailMetricRange = {
  min: number;
  max: number;
};

function buildRouteMetricSeries(
  activity: ActivityDetail | null,
  mode: RouteStyleMode,
  unitSystem: UnitSystem,
): RouteMetricSeries | null {
  if (!activity || mode === "recency") {
    return null;
  }

  const routePoints = activity.route_points_json ?? [];
  if (routePoints.length < 2) {
    return null;
  }

  const metricPoints = routePoints
    .map((point, index) => ({
      index,
      value: pointMetricValue(point, mode),
      recordedAt: point.recorded_at,
    }))
    .filter((point): point is { index: number; value: number; recordedAt: string | null } => point.value != null && Number.isFinite(point.value));

  if (metricPoints.length < 2) {
    return null;
  }

  const hasTimeDomain = metricPoints.every((point) => point.recordedAt && !Number.isNaN(new Date(point.recordedAt).getTime()));
  const minValue = Math.min(...metricPoints.map((point) => point.value));
  const maxValue = Math.max(...metricPoints.map((point) => point.value));
  const domainStart = hasTimeDomain
    ? new Date(metricPoints[0].recordedAt as string).getTime()
    : metricPoints[0].index;
  const domainEnd = hasTimeDomain
    ? new Date(metricPoints[metricPoints.length - 1].recordedAt as string).getTime()
    : metricPoints[metricPoints.length - 1].index;
  const domainRange = Math.max(domainEnd - domainStart, 1);

  return {
    points: metricPoints.map((point) => {
      const domainValue = hasTimeDomain ? new Date(point.recordedAt as string).getTime() : point.index;
      const routePoint = routePoints[point.index];
      return {
        sourceIndex: point.index,
        latitude: routePoint.latitude,
        longitude: routePoint.longitude,
        position: (domainValue - domainStart) / domainRange,
        normalizedValue: normalizeValue(point.value, minValue, maxValue),
        rawValue: point.value,
      };
    }),
    minLabel: formatRouteMetricValue(minValue, mode, unitSystem),
    maxLabel: formatRouteMetricValue(maxValue, mode, unitSystem),
    startLabel: hasTimeDomain ? formatTimeLabel(metricPoints[0].recordedAt) : "Start",
    endLabel: hasTimeDomain ? formatTimeLabel(metricPoints[metricPoints.length - 1].recordedAt) : "Finish",
  };
}

function buildDetailMetricRange(
  activity: ActivityDetail | null,
  mode: Exclude<RouteStyleMode, "recency">,
): DetailMetricRange | null {
  if (!activity?.route_points_json?.length) {
    return null;
  }

  const values = activity.route_points_json
    .map((point) => pointMetricValue(point, mode))
    .filter((value): value is number => value != null && Number.isFinite(value));

  if (values.length === 0) {
    return null;
  }

  return {
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

function scoreFeatures(features: ActivityMapFeatureCollection["features"], mode: RouteStyleMode) {
  if (mode !== "recency") {
    return new Map(
      features.map((feature) => [
        feature.properties.id,
        absoluteStyleScore(feature.properties, mode),
      ]),
    );
  }

  if (features.length <= 1) {
    return new Map(features.map((feature) => [feature.properties.id, 1]));
  }

  const scored = features
    .map((feature) => ({
      id: feature.properties.id,
      value: metricValueForStyle(feature.properties, mode),
    }))
    .sort((left, right) => left.value - right.value);

  return new Map(
    scored.map((item, index) => [item.id, index / (scored.length - 1)]),
  );
}

function metricValueForStyle(properties: ActivityMapFeature["properties"], mode: RouteStyleMode) {
  switch (mode) {
    case "elevation":
      return properties.elevation_gain_meters ?? 0;
    case "heart_rate":
      return properties.average_heart_rate_bpm ?? 0;
    case "pace":
      return paceSecondsPerMile(properties.duration_seconds, properties.distance_meters);
    case "recency":
      return parseDateValue(properties.started_at);
  }
}

function paceSecondsPerMile(durationSeconds: number | null, distanceMeters: number | null) {
  if (!durationSeconds || !distanceMeters || distanceMeters <= 0) {
    return 0;
  }

  const miles = distanceMeters / 1609.344;
  if (miles <= 0) {
    return 0;
  }

  return durationSeconds / miles;
}

function pointMetricValue(point: ActivityRoutePoint, mode: Exclude<RouteStyleMode, "recency">) {
  switch (mode) {
    case "heart_rate":
      return point.heart_rate_bpm;
    case "pace":
      return sanitizePaceSecondsPerMile(point.pace_seconds_per_mile);
    case "elevation":
      return point.elevation_meters;
  }
}

function absoluteStyleScore(properties: ActivityMapFeature["properties"], mode: RouteStyleMode) {
  switch (mode) {
    case "heart_rate": {
      const heartRate = properties.average_heart_rate_bpm ?? 0;
      return clamp01((heartRate - 90) / (190 - 90));
    }
    case "pace": {
      const pace = paceSecondsPerMile(properties.duration_seconds, properties.distance_meters);
      return clamp01((pace - FAST_PACE_SECONDS_PER_MILE) / (SLOW_PACE_SECONDS_PER_MILE - FAST_PACE_SECONDS_PER_MILE));
    }
    case "elevation": {
      const elevation = properties.elevation_gain_meters ?? 0;
      return clamp01((elevation - LOW_ELEVATION_METERS) / (HIGH_ELEVATION_METERS - LOW_ELEVATION_METERS));
    }
    case "recency":
      return 1;
  }
}

function normalizeValue(value: number, minValue: number, maxValue: number) {
  if (maxValue <= minValue) {
    return 0.5;
  }

  return clamp01((value - minValue) / (maxValue - minValue));
}

function parseDateValue(value: string | null) {
  if (!value) {
    return 0;
  }

  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function isFiniteCoordinate(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function routeStyleLegendStart(mode: RouteStyleMode) {
  switch (mode) {
    case "heart_rate":
      return "Lower";
    case "pace":
      return "Faster";
    case "elevation":
      return "Lower";
    case "recency":
      return "Older";
  }
}

function routeStyleLegendEnd(mode: RouteStyleMode) {
  switch (mode) {
    case "heart_rate":
      return "Higher";
    case "pace":
      return "Slower";
    case "elevation":
      return "Higher";
    case "recency":
      return "Recent";
  }
}

function routeStyleLegendGradient(mode: RouteStyleMode) {
  const palette = routeStylePalette(mode);
  return `linear-gradient(90deg, ${palette.lineStart} 0%, ${palette.lineMid} 35%, ${palette.lineUpper} 60%, ${palette.lineHigh} 82%, ${palette.lineEnd} 100%)`;
}

function routeStyleModeLabel(mode: RouteStyleMode) {
  switch (mode) {
    case "heart_rate":
      return "Heart rate";
    case "pace":
      return "Pace";
    case "elevation":
      return "Elevation";
    case "recency":
      return "Recency";
  }
}

function routeStylePalette(mode: RouteStyleMode) {
  if (mode === "recency") {
    return {
      glowStart: "rgba(144, 165, 178, 0.38)",
      glowMid: "rgba(122, 182, 205, 0.54)",
      glowUpper: "rgba(76, 200, 237, 0.72)",
      glowEnd: "rgba(0, 191, 255, 0.95)",
      lineStart: "#8fa4b1",
      lineMid: "#71b7cd",
      lineUpper: "#49c0df",
      lineHigh: "#18c7ef",
      lineEnd: "#00BFFF",
    };
  }

  if (mode === "heart_rate") {
    return {
      glowStart: "rgba(255, 205, 210, 0.42)",
      glowMid: "rgba(239, 154, 154, 0.58)",
      glowUpper: "rgba(229, 115, 115, 0.74)",
      glowEnd: "rgba(183, 28, 28, 0.96)",
      lineStart: "#ffcdd2",
      lineMid: "#ef9a9a",
      lineUpper: "#e57373",
      lineHigh: "#d32f2f",
      lineEnd: "#8b0000",
    };
  }

  return {
    glowStart: "rgba(64, 166, 92, 0.38)",
    glowMid: "rgba(128, 191, 69, 0.54)",
    glowUpper: "rgba(224, 181, 45, 0.7)",
    glowEnd: "rgba(220, 68, 46, 0.95)",
    lineStart: "#2ca25f",
    lineMid: "#7ec850",
    lineUpper: "#d9cf3f",
    lineHigh: "#f29e38",
    lineEnd: "#d73027",
  };
}

function createFullRange(length: number): DateRangeIndexes | null {
  if (length === 0) {
    return null;
  }

  return [0, length - 1];
}

function humanizeActivityType(activityType: string) {
  return activityType.replace(/_/g, " ").replace(/\b\w/g, (character: string) => character.toUpperCase());
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Unknown start time";
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

function formatDateLabel(value: string | null) {
  if (!value) {
    return "Unknown date";
  }

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatDateShort(value: string | null) {
  if (!value) {
    return "N/A";
  }

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    year: "2-digit",
  }).format(date);
}

function formatDuration(seconds: number | null) {
  if (seconds == null) {
    return "Unknown";
  }

  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

function formatWindDirection(degrees: number) {
  const normalized = Math.round((degrees % 360 + 360) % 360);
  const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const index = Math.floor((normalized + 11.25) / 22.5) % 16;
  return directions[index];
}

function formatHeartRate(value: number | null) {
  if (value == null || !Number.isFinite(value)) {
    return "Unknown";
  }

  return `${Math.round(value)} bpm`;
}

function formatEnergy(value: number | null) {
  if (value == null || !Number.isFinite(value)) {
    return "Unknown";
  }

  return `${Math.round(value)} kcal`;
}

function formatRouteMetricValue(value: number, mode: RouteStyleMode, unitSystem: UnitSystem) {
  switch (mode) {
    case "heart_rate":
      return formatHeartRate(value);
    case "pace":
      return formatPace(value, unitSystem);
    case "elevation":
      return formatElevation(value, unitSystem);
    case "recency":
      return "";
  }
}

function formatTimeLabel(value: string | null) {
  if (!value) {
    return "N/A";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatTimeWithSeconds(value: string | null) {
  if (!value) {
    return "Unknown time";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function formatCoordinate(value: number | null) {
  if (value == null || !Number.isFinite(value)) {
    return "N/A";
  }

  return value.toFixed(5);
}

function timelineMetricLabel(metric: TimelineMetric) {
  switch (metric) {
    case "session_count":
      return "Sessions";
    case "total_duration_seconds":
      return "Duration";
    case "total_distance_meters":
      return "Distance";
  }
}

function formatMetricValue(value: number, metric: TimelineMetric, unitSystem: UnitSystem) {
  switch (metric) {
    case "session_count":
      return `${value.toLocaleString()} sessions`;
    case "total_duration_seconds":
      return formatDuration(value);
    case "total_distance_meters":
      return formatDistance(value, unitSystem);
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
