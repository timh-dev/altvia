import { API_BASE_URL, DEMO_MODE } from "@/lib/config";
import type { Feature, FeatureCollection, LineString, MultiLineString } from "geojson";

export type HealthStatus = {
  status: string;
  environment: string;
};

export type ActivityWeather = {
  temperature_c: number | null;
  wind_speed_kmh: number | null;
  wind_gusts_kmh: number | null;
  wind_direction_deg: number | null;
  precipitation_probability: number | null;
  rain_mm: number | null;
  snowfall_cm: number | null;
  ice_risk: boolean | null;
};

export type EffortScore = {
  effort_score: number;
  trimp: number;
  hr_intensity_ratio: number;
  max_hr_used: number;
  elevation_factor: number;
  formula_version: string;
};

export type WorkoutCluster = {
  cluster_label: string;
  cluster_id: number;
  activity_type_group: string;
  features_used: string[];
  n_clusters: number;
  n_activities_in_group: number;
  version: string;
};

export type PredictedIntensity = {
  predicted_effort_score: number;
  confidence_interval_low: number;
  confidence_interval_high: number;
  features_used: string[];
  model_version: string;
  weather_adjusted: boolean;
};

export type ActivitySummary = {
  id: string;
  source: string;
  activity_type: string;
  name: string;
  started_at: string | null;
  duration_seconds: number | null;
  distance_meters: number | null;
  elevation_gain_meters: number | null;
  active_energy_kcal: number | null;
  basal_energy_kcal: number | null;
  average_heart_rate_bpm: number | null;
  max_heart_rate_bpm: number | null;
  recovery_heart_rate_bpm: number | null;
  min_elevation_meters: number | null;
  max_elevation_meters: number | null;
  min_pace_seconds_per_mile: number | null;
  max_pace_seconds_per_mile: number | null;
  start_latitude: number | null;
  start_longitude: number | null;
  end_latitude: number | null;
  end_longitude: number | null;
  weather_json: ActivityWeather | null;
  effort_score_json: EffortScore | null;
  workout_cluster_json: WorkoutCluster | null;
  predicted_intensity_json: PredictedIntensity | null;
};

export type ActivityRoutePoint = {
  latitude: number;
  longitude: number;
  elevation_meters: number | null;
  recorded_at: string | null;
  speed_meters_per_second: number | null;
  pace_seconds_per_mile: number | null;
  heart_rate_bpm: number | null;
};

export type ActivityDetail = ActivitySummary & {
  workout_metadata_json: Record<string, string> | null;
  route_points_json: ActivityRoutePoint[] | null;
};

export type ActivityAnalytics = {
  total_sessions: number;
  mapped_sessions: number;
  total_distance_meters: number;
  total_duration_seconds: number;
  total_elevation_gain_meters: number;
  activity_types: Array<{
    activity_type: string;
    count: number;
  }>;
};

export type ActivityTimelineBucket = {
  date: string;
  session_count: number;
  total_distance_meters: number;
  total_duration_seconds: number;
};

export type ActivityTimeline = {
  min_date: string | null;
  max_date: string | null;
  buckets: ActivityTimelineBucket[];
};

export type ActivityFilters = {
  activityType?: string | null;
  startDate?: string | null;
  endDate?: string | null;
};

export type ImportJobResponse = {
  id: string;
  source_type: string;
  status: string;
  filename: string;
  total_records: number;
  imported_records: number;
  notes: string | null;
};

export type PlannedWorkoutRoutePoint = {
  latitude: number;
  longitude: number;
};

export type PlannedWorkoutSummary = {
  id: string;
  name: string;
  activity_type: string;
  planned_for: string | null;
  distance_meters: number;
  route_points: PlannedWorkoutRoutePoint[];
  analysis_context_json: PlannerSavedAnalysisContext | null;
  created_at: string;
};

export type PlannedWorkoutMapFeatureProperties = {
  id: string;
  name: string;
  activity_type: string;
  planned_for: string | null;
  distance_meters: number;
  created_at: string;
};

export type PlannedWorkoutMapFeature = Feature<LineString, PlannedWorkoutMapFeatureProperties>;
export type PlannedWorkoutMapFeatureCollection = FeatureCollection<LineString, PlannedWorkoutMapFeatureProperties>;

export type PlannerWeatherSummary = {
  provider: string;
  cached: boolean;
  forecast_time: string | null;
  temperature_c: number | null;
  wind_speed_kmh: number | null;
  wind_gusts_kmh: number | null;
  wind_direction_deg: number | null;
  precipitation_probability: number | null;
  rain_mm: number | null;
  snowfall_cm: number | null;
  ice_risk: boolean | null;
  sea_surface_temperature_c: number | null;
  wave_height_m: number | null;
  wave_period_s: number | null;
  wave_direction_deg: number | null;
};

export type PlannedRouteResponse = {
  route_points: PlannedWorkoutRoutePoint[];
  distance_meters: number;
  source: string;
};

export type ElevationResponse = {
  elevations: (number | null)[];
  elevation_gain_meters: number;
  elevation_loss_meters: number;
};

export type PlannerAnalysisResponse = {
  distance_meters: number;
  estimated_duration_seconds: number;
  avg_pace_seconds_per_mile: number | null;
  predicted_completion_time: string | null;
  elevation: ElevationResponse | null;
  weather: PlannerWeatherSummary | null;
  predicted_intensity: IntensityPredictionResponse | null;
  predicted_cluster: ClusterPredictionResponse | null;
};

export type PlannerSavedAnalysisContext = {
  estimated_duration_seconds: number | null;
  avg_pace_seconds_per_mile: number | null;
  predicted_completion_time: string | null;
  elevation: ElevationResponse | null;
  weather: PlannerWeatherSummary | null;
  predicted_intensity: IntensityPredictionResponse | null;
  predicted_cluster: ClusterPredictionResponse | null;
};

export type ActivityMapFeature = Feature<LineString | MultiLineString, ActivitySummary>;
export type ActivityMapFeatureCollection = FeatureCollection<LineString | MultiLineString, ActivitySummary>;

type DemoActivitySeed = {
  id: string;
  name: string;
  activity_type: "running" | "cycling" | "swimming";
  started_at: string;
  route: Array<[number, number]>;
  duration_seconds: number;
  elevation_gain_meters: number;
  active_energy_kcal: number;
  avg_heart_rate_bpm: number;
  max_heart_rate_bpm: number;
  recovery_heart_rate_bpm: number;
  effort_score: number;
  trimp: number;
  hr_intensity_ratio: number;
  cluster_id: number;
  cluster_label: string;
  weather: ActivityWeather;
  metadata: Record<string, string>;
};

const DEMO_PLANNED_WORKOUTS_STORAGE_KEY = "altvia.demo.plannedWorkouts";
const DEMO_INTENSITY_FEATURES = ["activity_type", "distance_meters", "duration_seconds", "elevation_gain_meters"];
const DEMO_CLUSTER_FEATURES = ["distance_meters", "duration_seconds", "elevation_gain_meters"];

const DEMO_ACTIVITY_SEEDS: DemoActivitySeed[] = [
  {
    id: "run-boulder-tempo",
    name: "Boulder Reservoir Tempo",
    activity_type: "running",
    started_at: "2026-03-29T13:15:00.000Z",
    route: [
      [-105.2208, 40.0717],
      [-105.2189, 40.0736],
      [-105.2165, 40.0761],
      [-105.2129, 40.0782],
      [-105.2087, 40.0794],
      [-105.2043, 40.0792],
      [-105.2011, 40.0768],
      [-105.1996, 40.0734],
      [-105.2008, 40.0704],
      [-105.2049, 40.0688],
      [-105.2104, 40.0686],
      [-105.2162, 40.0695],
      [-105.2208, 40.0717],
    ],
    duration_seconds: 3170,
    elevation_gain_meters: 74,
    active_energy_kcal: 672,
    avg_heart_rate_bpm: 158,
    max_heart_rate_bpm: 176,
    recovery_heart_rate_bpm: 126,
    effort_score: 78,
    trimp: 92,
    hr_intensity_ratio: 0.82,
    cluster_id: 1,
    cluster_label: "Tempo / Threshold",
    weather: { temperature_c: 11, wind_speed_kmh: 14, wind_gusts_kmh: 22, wind_direction_deg: 320, precipitation_probability: 12, rain_mm: 0, snowfall_cm: 0, ice_risk: false },
    metadata: { shoes: "Tempo trainer", surface: "packed gravel + paved path", notes: "Controlled effort with a negative split." },
  },
  {
    id: "run-greenway-long",
    name: "South Platte Long Run",
    activity_type: "running",
    started_at: "2026-02-22T15:40:00.000Z",
    route: [
      [-105.0098, 39.7565],
      [-105.0067, 39.7583],
      [-105.0024, 39.7601],
      [-104.9986, 39.7606],
      [-104.9941, 39.7602],
      [-104.9897, 39.7588],
      [-104.9861, 39.7566],
      [-104.9844, 39.7535],
      [-104.9852, 39.7503],
      [-104.9882, 39.7478],
      [-104.9925, 39.7464],
      [-104.9974, 39.7462],
      [-105.0021, 39.7474],
      [-105.0063, 39.7498],
      [-105.0092, 39.7531],
      [-105.0098, 39.7565],
    ],
    duration_seconds: 5440,
    elevation_gain_meters: 58,
    active_energy_kcal: 1042,
    avg_heart_rate_bpm: 149,
    max_heart_rate_bpm: 166,
    recovery_heart_rate_bpm: 121,
    effort_score: 84,
    trimp: 109,
    hr_intensity_ratio: 0.76,
    cluster_id: 0,
    cluster_label: "Aerobic Endurance",
    weather: { temperature_c: 7, wind_speed_kmh: 9, wind_gusts_kmh: 15, wind_direction_deg: 18, precipitation_probability: 5, rain_mm: 0, snowfall_cm: 0, ice_risk: false },
    metadata: { shoes: "Daily trainer", surface: "river path", notes: "Steady long aerobic build." },
  },
  {
    id: "run-track-intervals",
    name: "Track 6 x 800",
    activity_type: "running",
    started_at: "2026-01-17T01:10:00.000Z",
    route: [
      [-104.9598, 39.6796],
      [-104.9592, 39.6805],
      [-104.9581, 39.6809],
      [-104.9568, 39.6806],
      [-104.9561, 39.6797],
      [-104.9567, 39.6788],
      [-104.958, 39.6785],
      [-104.9592, 39.6788],
      [-104.9598, 39.6796],
      [-104.9592, 39.6805],
      [-104.9581, 39.6809],
      [-104.9568, 39.6806],
      [-104.9561, 39.6797],
      [-104.9567, 39.6788],
      [-104.958, 39.6785],
      [-104.9592, 39.6788],
      [-104.9598, 39.6796],
    ],
    duration_seconds: 2890,
    elevation_gain_meters: 19,
    active_energy_kcal: 598,
    avg_heart_rate_bpm: 164,
    max_heart_rate_bpm: 182,
    recovery_heart_rate_bpm: 132,
    effort_score: 81,
    trimp: 88,
    hr_intensity_ratio: 0.86,
    cluster_id: 2,
    cluster_label: "VO2 Intervals",
    weather: { temperature_c: 4, wind_speed_kmh: 6, wind_gusts_kmh: 11, wind_direction_deg: 205, precipitation_probability: 20, rain_mm: 0, snowfall_cm: 0, ice_risk: false },
    metadata: { shoes: "Racing flat", surface: "track", notes: "High-quality interval set with full recoveries." },
  },
  {
    id: "ride-foothills-climb",
    name: "Foothills Climb Simulation",
    activity_type: "cycling",
    started_at: "2026-03-16T14:20:00.000Z",
    route: [
      [-105.2846, 39.9967],
      [-105.2798, 39.9996],
      [-105.2743, 40.0032],
      [-105.2682, 40.0074],
      [-105.2621, 40.0118],
      [-105.2567, 40.0162],
      [-105.2512, 40.0205],
      [-105.2464, 40.0248],
      [-105.2422, 40.0294],
      [-105.2387, 40.0341],
      [-105.2363, 40.0386],
      [-105.2349, 40.0427],
    ],
    duration_seconds: 6210,
    elevation_gain_meters: 488,
    active_energy_kcal: 1338,
    avg_heart_rate_bpm: 151,
    max_heart_rate_bpm: 171,
    recovery_heart_rate_bpm: 117,
    effort_score: 90,
    trimp: 118,
    hr_intensity_ratio: 0.79,
    cluster_id: 1,
    cluster_label: "Sustained Climbing",
    weather: { temperature_c: 9, wind_speed_kmh: 18, wind_gusts_kmh: 28, wind_direction_deg: 280, precipitation_probability: 18, rain_mm: 0, snowfall_cm: 0, ice_risk: false },
    metadata: { bike: "Road bike", notes: "Long sustained climbs into the foothills." },
  },
  {
    id: "ride-urban-threshold",
    name: "Cherry Creek Threshold Blocks",
    activity_type: "cycling",
    started_at: "2026-02-09T16:10:00.000Z",
    route: [
      [-104.9562, 39.7197],
      [-104.9493, 39.7204],
      [-104.9425, 39.7212],
      [-104.9354, 39.7224],
      [-104.9281, 39.7239],
      [-104.9207, 39.7254],
      [-104.9132, 39.7268],
      [-104.9059, 39.7282],
      [-104.8991, 39.7296],
      [-104.8928, 39.7314],
      [-104.8869, 39.7338],
      [-104.8812, 39.7368],
    ],
    duration_seconds: 5030,
    elevation_gain_meters: 141,
    active_energy_kcal: 1124,
    avg_heart_rate_bpm: 147,
    max_heart_rate_bpm: 168,
    recovery_heart_rate_bpm: 115,
    effort_score: 73,
    trimp: 94,
    hr_intensity_ratio: 0.74,
    cluster_id: 2,
    cluster_label: "Threshold Blocks",
    weather: { temperature_c: 6, wind_speed_kmh: 11, wind_gusts_kmh: 18, wind_direction_deg: 102, precipitation_probability: 9, rain_mm: 0, snowfall_cm: 0, ice_risk: false },
    metadata: { bike: "Road bike", notes: "Three threshold efforts on a flat fast corridor." },
  },
  {
    id: "ride-recovery-spin",
    name: "Recovery Spin Along the Creek",
    activity_type: "cycling",
    started_at: "2025-12-28T18:05:00.000Z",
    route: [
      [-105.1048, 39.7908],
      [-105.0984, 39.7914],
      [-105.0921, 39.7922],
      [-105.086, 39.7932],
      [-105.0802, 39.7947],
      [-105.0749, 39.7968],
      [-105.0704, 39.7991],
      [-105.0669, 39.8015],
      [-105.0643, 39.8038],
      [-105.0625, 39.8062],
      [-105.0612, 39.8085],
    ],
    duration_seconds: 3920,
    elevation_gain_meters: 66,
    active_energy_kcal: 744,
    avg_heart_rate_bpm: 128,
    max_heart_rate_bpm: 146,
    recovery_heart_rate_bpm: 108,
    effort_score: 48,
    trimp: 56,
    hr_intensity_ratio: 0.62,
    cluster_id: 0,
    cluster_label: "Recovery Endurance",
    weather: { temperature_c: 2, wind_speed_kmh: 8, wind_gusts_kmh: 12, wind_direction_deg: 355, precipitation_probability: 3, rain_mm: 0, snowfall_cm: 0, ice_risk: false },
    metadata: { bike: "Gravel bike", notes: "Easy aerobic spin for leg turnover." },
  },
  {
    id: "swim-open-water-loop",
    name: "Open Water Buoy Loop",
    activity_type: "swimming",
    started_at: "2026-03-08T15:05:00.000Z",
    route: [
      [-105.2209, 40.0747],
      [-105.2182, 40.0754],
      [-105.2151, 40.0761],
      [-105.2118, 40.0765],
      [-105.2084, 40.0762],
      [-105.2054, 40.0752],
      [-105.2034, 40.0737],
      [-105.2026, 40.0719],
      [-105.2036, 40.0703],
      [-105.2059, 40.0694],
      [-105.209, 40.0691],
      [-105.2122, 40.0695],
      [-105.2152, 40.0704],
      [-105.2178, 40.0717],
      [-105.2198, 40.0731],
      [-105.2209, 40.0747],
    ],
    duration_seconds: 2860,
    elevation_gain_meters: 0,
    active_energy_kcal: 512,
    avg_heart_rate_bpm: 142,
    max_heart_rate_bpm: 156,
    recovery_heart_rate_bpm: 118,
    effort_score: 61,
    trimp: 72,
    hr_intensity_ratio: 0.71,
    cluster_id: 1,
    cluster_label: "Continuous Open Water",
    weather: { temperature_c: 13, wind_speed_kmh: 10, wind_gusts_kmh: 16, wind_direction_deg: 160, precipitation_probability: 6, rain_mm: 0, snowfall_cm: 0, ice_risk: false },
    metadata: { equipment: "Wetsuit + buoy", notes: "Calm open-water loop with race starts." },
  },
  {
    id: "swim-pool-threshold",
    name: "Pool Threshold Ladder",
    activity_type: "swimming",
    started_at: "2026-02-01T13:30:00.000Z",
    route: [
      [-105.0058, 39.7397],
      [-105.0052, 39.7397],
      [-105.0046, 39.7397],
      [-105.004, 39.7397],
      [-105.0034, 39.7397],
      [-105.0028, 39.7397],
      [-105.0034, 39.7397],
      [-105.004, 39.7397],
      [-105.0046, 39.7397],
      [-105.0052, 39.7397],
      [-105.0058, 39.7397],
    ],
    duration_seconds: 3340,
    elevation_gain_meters: 0,
    active_energy_kcal: 588,
    avg_heart_rate_bpm: 146,
    max_heart_rate_bpm: 162,
    recovery_heart_rate_bpm: 120,
    effort_score: 69,
    trimp: 81,
    hr_intensity_ratio: 0.75,
    cluster_id: 2,
    cluster_label: "Threshold Repeats",
    weather: { temperature_c: 21, wind_speed_kmh: 0, wind_gusts_kmh: 0, wind_direction_deg: 0, precipitation_probability: 0, rain_mm: 0, snowfall_cm: 0, ice_risk: false },
    metadata: { equipment: "Pull buoy + paddles", notes: "Ladder set with descending send-off." },
  },
  {
    id: "swim-technique-drills",
    name: "Technique + Pull Session",
    activity_type: "swimming",
    started_at: "2025-12-14T14:00:00.000Z",
    route: [
      [-104.9804, 39.7008],
      [-104.9799, 39.7008],
      [-104.9794, 39.7008],
      [-104.9789, 39.7008],
      [-104.9784, 39.7008],
      [-104.9779, 39.7008],
      [-104.9784, 39.7008],
      [-104.9789, 39.7008],
      [-104.9794, 39.7008],
      [-104.9799, 39.7008],
      [-104.9804, 39.7008],
    ],
    duration_seconds: 2480,
    elevation_gain_meters: 0,
    active_energy_kcal: 402,
    avg_heart_rate_bpm: 131,
    max_heart_rate_bpm: 145,
    recovery_heart_rate_bpm: 109,
    effort_score: 42,
    trimp: 48,
    hr_intensity_ratio: 0.61,
    cluster_id: 0,
    cluster_label: "Technique Endurance",
    weather: { temperature_c: 21, wind_speed_kmh: 0, wind_gusts_kmh: 0, wind_direction_deg: 0, precipitation_probability: 0, rain_mm: 0, snowfall_cm: 0, ice_risk: false },
    metadata: { equipment: "Pull buoy", notes: "Drill-focused aerobic maintenance set." },
  },
];

const DEFAULT_DEMO_PLANNED_WORKOUTS: PlannedWorkoutSummary[] = [
  buildDemoPlannedWorkout("plan-run-interval-hills", "Hill Repeat Session", "running", "2026-04-16T12:30:00.000Z", [
    [-105.2852, 40.0161],
    [-105.2808, 40.0185],
    [-105.2764, 40.0217],
    [-105.2728, 40.0249],
    [-105.2695, 40.0276],
    [-105.2671, 40.0299],
  ], "Race-specific climbing work."),
  buildDemoPlannedWorkout("plan-run-long-progression", "Sunday Progression Long Run", "running", "2026-04-19T13:00:00.000Z", [
    [-105.0078, 39.7561],
    [-105.0025, 39.7584],
    [-104.9973, 39.7599],
    [-104.9916, 39.7601],
    [-104.9862, 39.7588],
    [-104.9824, 39.7561],
    [-104.9808, 39.7524],
    [-104.9818, 39.7489],
    [-104.9853, 39.7464],
  ], "Long aerobic session finishing near marathon pace."),
  buildDemoPlannedWorkout("plan-ride-endurance", "Canyon Endurance Ride", "cycling", "2026-04-20T14:15:00.000Z", [
    [-105.2894, 40.0058],
    [-105.2846, 40.0091],
    [-105.2792, 40.0129],
    [-105.2738, 40.0172],
    [-105.2687, 40.0221],
    [-105.2645, 40.0272],
    [-105.2619, 40.0326],
  ], "Long aerobic climbing route with controlled tempo sections."),
  buildDemoPlannedWorkout("plan-swim-open-water", "Open Water Brick Swim", "swimming", "2026-04-18T15:45:00.000Z", [
    [-105.2204, 40.0741],
    [-105.2174, 40.0752],
    [-105.2142, 40.0756],
    [-105.2109, 40.0751],
    [-105.2082, 40.0738],
    [-105.2068, 40.0719],
    [-105.2076, 40.0701],
    [-105.2101, 40.069],
    [-105.2132, 40.0688],
    [-105.2165, 40.0696],
    [-105.2191, 40.0713],
  ], "Practice sighting and sustained tempo for triathlon demo."),
];

function isDemoModeOn() {
  return DEMO_MODE === "on";
}

function shouldFallbackToDemo() {
  return DEMO_MODE !== "off";
}

async function resolveWithDemo<T>(realLoader: () => Promise<T>, demoLoader: () => T | Promise<T>) {
  if (isDemoModeOn()) {
    return Promise.resolve(demoLoader());
  }

  try {
    return await realLoader();
  } catch (error) {
    if (shouldFallbackToDemo()) {
      return Promise.resolve(demoLoader());
    }
    throw error;
  }
}

function buildDemoPlannedWorkout(
  id: string,
  name: string,
  activity_type: "running" | "cycling" | "swimming",
  planned_for: string,
  route: Array<[number, number]>,
  note: string,
): PlannedWorkoutSummary {
  const route_points = route.map(([longitude, latitude]) => ({ latitude, longitude }));
  const distance_meters = calculateDistanceForPlannedRoute(route_points);
  const estimated_duration_seconds = estimateDurationSeconds(activity_type, distance_meters);
  return {
    id,
    name,
    activity_type,
    planned_for,
    route_points,
    distance_meters,
    created_at: new Date(new Date(planned_for).getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    analysis_context_json: buildPlannerAnalysisFromRoute({
      activity_type,
      route_points,
      planned_for,
      duration_seconds: estimated_duration_seconds,
      note,
    }),
  };
}

function pointDistanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const earthRadiusMeters = 6_371_000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const deltaLat = toRadians(b.latitude - a.latitude);
  const deltaLng = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const sinLat = Math.sin(deltaLat / 2);
  const sinLng = Math.sin(deltaLng / 2);
  const haversine = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(haversine));
}

function calculateDistanceForPlannedRoute(route_points: PlannedWorkoutRoutePoint[]) {
  let total = 0;
  for (let index = 1; index < route_points.length; index += 1) {
    total += pointDistanceMeters(route_points[index - 1], route_points[index]);
  }
  return Math.round(total);
}

function estimateDurationSeconds(activityType: string, distanceMeters: number) {
  if (activityType === "cycling") {
    return Math.round(distanceMeters / 7.2);
  }
  if (activityType === "swimming") {
    return Math.round(distanceMeters / 0.9);
  }
  return Math.round(distanceMeters / 3.1);
}

function buildElevationResponse(route_points: PlannedWorkoutRoutePoint[], activityType?: string) {
  if (route_points.length === 0) {
    return { elevations: [], elevation_gain_meters: 0, elevation_loss_meters: 0 };
  }

  const elevations = route_points.map((point, index) => {
    if (activityType === "swimming") {
      return 0;
    }
    return Math.round(1580 + Math.sin(index / 2.4) * 22 + (point.latitude - route_points[0].latitude) * 800);
  });

  let elevation_gain_meters = 0;
  let elevation_loss_meters = 0;
  for (let index = 1; index < elevations.length; index += 1) {
    const delta = (elevations[index] ?? 0) - (elevations[index - 1] ?? 0);
    if (delta > 0) {
      elevation_gain_meters += delta;
    } else {
      elevation_loss_meters += Math.abs(delta);
    }
  }

  return {
    elevations,
    elevation_gain_meters: Math.round(elevation_gain_meters),
    elevation_loss_meters: Math.round(elevation_loss_meters),
  };
}

function buildPlannerWeather(activityType: string, plannedFor: string | null): PlannerWeatherSummary {
  const baseDate = plannedFor ?? "2026-04-18T14:00:00.000Z";
  if (activityType === "swimming") {
    return {
      provider: "frontend-demo",
      cached: true,
      forecast_time: baseDate,
      temperature_c: 18,
      wind_speed_kmh: 9,
      wind_gusts_kmh: 14,
      wind_direction_deg: 145,
      precipitation_probability: 10,
      rain_mm: 0,
      snowfall_cm: 0,
      ice_risk: false,
      sea_surface_temperature_c: 17,
      wave_height_m: 0.3,
      wave_period_s: 3.8,
      wave_direction_deg: 132,
    };
  }

  return {
    provider: "frontend-demo",
    cached: true,
    forecast_time: baseDate,
    temperature_c: activityType === "cycling" ? 14 : 12,
    wind_speed_kmh: activityType === "cycling" ? 19 : 11,
    wind_gusts_kmh: activityType === "cycling" ? 27 : 17,
    wind_direction_deg: activityType === "cycling" ? 278 : 305,
    precipitation_probability: 16,
    rain_mm: 0,
    snowfall_cm: 0,
    ice_risk: false,
    sea_surface_temperature_c: null,
    wave_height_m: null,
    wave_period_s: null,
    wave_direction_deg: null,
  };
}

function buildIntensityPrediction(payload: IntensityPredictionRequest): IntensityPredictionResponse {
  const elevationFactor = (payload.elevation_gain_meters ?? 0) / 100;
  const distanceFactor = payload.distance_meters / 1000;
  const durationFactor = payload.duration_seconds / 900;
  const weatherPenalty = (payload.wind_speed_kmh ?? 0) / 12 + (payload.rain_mm ?? 0) * 4 + (payload.snowfall_cm ?? 0) * 8;
  const predicted_effort_score = Math.max(28, Math.min(98, Math.round(18 + distanceFactor * 1.4 + durationFactor * 4.1 + elevationFactor * 1.9 + weatherPenalty)));

  return {
    predicted_effort_score,
    confidence_interval_low: Math.max(20, predicted_effort_score - 8),
    confidence_interval_high: Math.min(100, predicted_effort_score + 8),
    features_used: DEMO_INTENSITY_FEATURES,
    model_version: "demo-intensity-v1",
    weather_adjusted: Boolean((payload.wind_speed_kmh ?? 0) > 0 || (payload.rain_mm ?? 0) > 0 || (payload.snowfall_cm ?? 0) > 0),
  };
}

function buildClusterPrediction(payload: ClusterPredictionRequest): ClusterPredictionResponse {
  if (payload.activity_type === "cycling") {
    return {
      cluster_label: (payload.elevation_gain_meters ?? 0) > 250 ? "Sustained Climbing" : "Threshold Blocks",
      cluster_id: (payload.elevation_gain_meters ?? 0) > 250 ? 1 : 2,
      activity_type_group: "cycling",
      n_activities_in_group: 18,
      n_clusters: 3,
      features_used: DEMO_CLUSTER_FEATURES,
      model_version: "demo-clustering-v1",
    };
  }
  if (payload.activity_type === "swimming") {
    return {
      cluster_label: payload.distance_meters > 1800 ? "Continuous Open Water" : "Technique Endurance",
      cluster_id: payload.distance_meters > 1800 ? 1 : 0,
      activity_type_group: "swimming",
      n_activities_in_group: 12,
      n_clusters: 3,
      features_used: DEMO_CLUSTER_FEATURES,
      model_version: "demo-clustering-v1",
    };
  }
  return {
    cluster_label: payload.distance_meters > 14_000 ? "Aerobic Endurance" : (payload.elevation_gain_meters ?? 0) > 120 ? "Tempo / Threshold" : "VO2 Intervals",
    cluster_id: payload.distance_meters > 14_000 ? 0 : (payload.elevation_gain_meters ?? 0) > 120 ? 1 : 2,
    activity_type_group: "running",
    n_activities_in_group: 24,
    n_clusters: 3,
    features_used: DEMO_CLUSTER_FEATURES,
    model_version: "demo-clustering-v1",
  };
}

function buildPlannerAnalysisFromRoute(payload: {
  activity_type: string;
  route_points: PlannedWorkoutRoutePoint[];
  planned_for: string | null;
  duration_seconds?: number | null;
  note?: string;
}): PlannerAnalysisResponse {
  const distance_meters = calculateDistanceForPlannedRoute(payload.route_points);
  const estimated_duration_seconds = payload.duration_seconds ?? estimateDurationSeconds(payload.activity_type, distance_meters);
  const elevation = buildElevationResponse(payload.route_points, payload.activity_type);
  const weather = buildPlannerWeather(payload.activity_type, payload.planned_for);
  const predicted_intensity = buildIntensityPrediction({
    activity_type: payload.activity_type,
    distance_meters,
    duration_seconds: estimated_duration_seconds,
    elevation_gain_meters: elevation.elevation_gain_meters,
    planned_for: payload.planned_for,
    temperature_c: weather.temperature_c,
    wind_speed_kmh: weather.wind_speed_kmh,
    rain_mm: weather.rain_mm,
    snowfall_cm: weather.snowfall_cm,
  });
  const predicted_cluster = buildClusterPrediction({
    activity_type: payload.activity_type,
    distance_meters,
    duration_seconds: estimated_duration_seconds,
    elevation_gain_meters: elevation.elevation_gain_meters,
  });
  const avg_pace_seconds_per_mile = payload.activity_type === "swimming" || distance_meters === 0
    ? null
    : Math.round(estimated_duration_seconds / (distance_meters / 1609.344));

  return {
    distance_meters,
    estimated_duration_seconds,
    avg_pace_seconds_per_mile,
    predicted_completion_time: payload.planned_for
      ? new Date(new Date(payload.planned_for).getTime() + estimated_duration_seconds * 1000).toISOString()
      : null,
    elevation: payload.activity_type === "swimming" ? null : elevation,
    weather,
    predicted_intensity,
    predicted_cluster,
  };
}

function buildActivityRoutePoints(seed: DemoActivitySeed) {
  const segmentCount = Math.max(seed.route.length - 1, 1);
  const points = seed.route.map(([longitude, latitude], index) => {
    const progress = segmentCount === 0 ? 0 : index / segmentCount;
    const timestamp = new Date(new Date(seed.started_at).getTime() + progress * seed.duration_seconds * 1000).toISOString();
    const speed_meters_per_second = calculateDistanceForPlannedRoute(seed.route.map(([lng, lat]) => ({ latitude: lat, longitude: lng }))) / seed.duration_seconds;
    const pace_seconds_per_mile = seed.activity_type === "cycling" || seed.activity_type === "swimming"
      ? null
      : Math.round(1609.344 / Math.max(speed_meters_per_second + Math.sin(index / 3) * 0.25, 1.7));

    return {
      latitude,
      longitude,
      elevation_meters: seed.activity_type === "swimming" ? 0 : Math.round(1575 + Math.sin(index / 2) * 18 + progress * seed.elevation_gain_meters * 0.45),
      recorded_at: timestamp,
      speed_meters_per_second: Number((speed_meters_per_second + Math.cos(index / 2.4) * 0.35).toFixed(2)),
      pace_seconds_per_mile,
      heart_rate_bpm: Math.round(seed.avg_heart_rate_bpm + Math.sin(index / 2.1) * 6 + progress * (seed.max_heart_rate_bpm - seed.avg_heart_rate_bpm) * 0.2),
    } satisfies ActivityRoutePoint;
  });

  return points;
}

function buildDemoActivities() {
  return DEMO_ACTIVITY_SEEDS.map((seed) => {
    const route_points_json = buildActivityRoutePoints(seed);
    const distance_meters = calculateDistanceForPlannedRoute(route_points_json.map((point) => ({ latitude: point.latitude, longitude: point.longitude })));
    const minElevation = route_points_json.reduce<number | null>((min, point) => point.elevation_meters == null ? min : min == null ? point.elevation_meters : Math.min(min, point.elevation_meters), null);
    const maxElevation = route_points_json.reduce<number | null>((max, point) => point.elevation_meters == null ? max : max == null ? point.elevation_meters : Math.max(max, point.elevation_meters), null);
    const paceValues = route_points_json.map((point) => point.pace_seconds_per_mile).filter((value): value is number => value != null);
    const effort_score_json: EffortScore = {
      effort_score: seed.effort_score,
      trimp: seed.trimp,
      hr_intensity_ratio: seed.hr_intensity_ratio,
      max_hr_used: 190,
      elevation_factor: seed.activity_type === "swimming" ? 1 : Number((1 + seed.elevation_gain_meters / Math.max(distance_meters, 1)).toFixed(2)),
      formula_version: "demo-effort-v1",
    };
    const workout_cluster_json: WorkoutCluster = {
      cluster_label: seed.cluster_label,
      cluster_id: seed.cluster_id,
      activity_type_group: seed.activity_type,
      features_used: DEMO_CLUSTER_FEATURES,
      n_clusters: 3,
      n_activities_in_group: 18,
      version: "demo-clustering-v1",
    };
    const predicted_intensity_json: PredictedIntensity = {
      ...buildIntensityPrediction({
        activity_type: seed.activity_type,
        distance_meters,
        duration_seconds: seed.duration_seconds,
        elevation_gain_meters: seed.elevation_gain_meters,
        temperature_c: seed.weather.temperature_c,
        wind_speed_kmh: seed.weather.wind_speed_kmh,
        rain_mm: seed.weather.rain_mm,
        snowfall_cm: seed.weather.snowfall_cm,
      }),
    };

    const summary: ActivitySummary = {
      id: seed.id,
      source: "frontend-demo",
      activity_type: seed.activity_type,
      name: seed.name,
      started_at: seed.started_at,
      duration_seconds: seed.duration_seconds,
      distance_meters,
      elevation_gain_meters: seed.elevation_gain_meters,
      active_energy_kcal: seed.active_energy_kcal,
      basal_energy_kcal: Math.round(seed.active_energy_kcal * 0.11),
      average_heart_rate_bpm: seed.avg_heart_rate_bpm,
      max_heart_rate_bpm: seed.max_heart_rate_bpm,
      recovery_heart_rate_bpm: seed.recovery_heart_rate_bpm,
      min_elevation_meters: minElevation,
      max_elevation_meters: maxElevation,
      min_pace_seconds_per_mile: paceValues.length ? Math.min(...paceValues) : null,
      max_pace_seconds_per_mile: paceValues.length ? Math.max(...paceValues) : null,
      start_latitude: route_points_json[0]?.latitude ?? null,
      start_longitude: route_points_json[0]?.longitude ?? null,
      end_latitude: route_points_json[route_points_json.length - 1]?.latitude ?? null,
      end_longitude: route_points_json[route_points_json.length - 1]?.longitude ?? null,
      weather_json: seed.weather,
      effort_score_json,
      workout_cluster_json,
      predicted_intensity_json,
    };

    return {
      ...summary,
      workout_metadata_json: seed.metadata,
      route_points_json,
    } satisfies ActivityDetail;
  }).sort((a, b) => {
    if (!a.started_at || !b.started_at) return 0;
    return new Date(b.started_at).getTime() - new Date(a.started_at).getTime();
  });
}

function filterDemoActivities(filters: ActivityFilters = {}) {
  return buildDemoActivities().filter((activity) => {
    if (filters.activityType && activity.activity_type !== filters.activityType) {
      return false;
    }
    if (filters.startDate && activity.started_at && activity.started_at.slice(0, 10) < filters.startDate) {
      return false;
    }
    if (filters.endDate && activity.started_at && activity.started_at.slice(0, 10) > filters.endDate) {
      return false;
    }
    return true;
  });
}

function buildDemoActivityMapFeatures(filters: ActivityFilters = {}): ActivityMapFeatureCollection {
  const features = filterDemoActivities(filters)
    .filter((activity) => (activity.route_points_json?.length ?? 0) >= 2)
    .map((activity) => ({
      type: "Feature" as const,
      geometry: {
        type: "LineString" as const,
        coordinates: activity.route_points_json!.map((point) => [point.longitude, point.latitude]),
      },
      properties: toActivitySummary(activity),
    }));

  return { type: "FeatureCollection", features };
}

function buildDemoAnalytics(filters: ActivityFilters = {}): ActivityAnalytics {
  const activities = filterDemoActivities(filters);
  const activityTypeCounts = new Map<string, number>();
  for (const activity of activities) {
    activityTypeCounts.set(activity.activity_type, (activityTypeCounts.get(activity.activity_type) ?? 0) + 1);
  }

  return {
    total_sessions: activities.length,
    mapped_sessions: activities.filter((activity) => (activity.route_points_json?.length ?? 0) >= 2).length,
    total_distance_meters: activities.reduce((sum, activity) => sum + (activity.distance_meters ?? 0), 0),
    total_duration_seconds: activities.reduce((sum, activity) => sum + (activity.duration_seconds ?? 0), 0),
    total_elevation_gain_meters: activities.reduce((sum, activity) => sum + (activity.elevation_gain_meters ?? 0), 0),
    activity_types: Array.from(activityTypeCounts.entries())
      .map(([activity_type, count]) => ({ activity_type, count }))
      .sort((left, right) => right.count - left.count),
  };
}

function buildDemoTimeline(activityType?: string | null): ActivityTimeline {
  const buckets = new Map<string, ActivityTimelineBucket>();
  const activities = filterDemoActivities({ activityType });
  for (const activity of activities) {
    const date = activity.started_at?.slice(0, 10);
    if (!date) continue;
    const bucket = buckets.get(date) ?? { date, session_count: 0, total_distance_meters: 0, total_duration_seconds: 0 };
    bucket.session_count += 1;
    bucket.total_distance_meters += activity.distance_meters ?? 0;
    bucket.total_duration_seconds += activity.duration_seconds ?? 0;
    buckets.set(date, bucket);
  }

  const orderedBuckets = Array.from(buckets.values()).sort((left, right) => left.date.localeCompare(right.date));
  return {
    min_date: orderedBuckets[0]?.date ?? null,
    max_date: orderedBuckets[orderedBuckets.length - 1]?.date ?? null,
    buckets: orderedBuckets,
  };
}

function toActivitySummary(activity: ActivityDetail): ActivitySummary {
  const { workout_metadata_json: _metadata, route_points_json: _route, ...summary } = activity;
  return summary;
}

function getStoredDemoPlannedWorkouts() {
  if (typeof window === "undefined") {
    return DEFAULT_DEMO_PLANNED_WORKOUTS;
  }

  const raw = window.localStorage.getItem(DEMO_PLANNED_WORKOUTS_STORAGE_KEY);
  if (!raw) {
    window.localStorage.setItem(DEMO_PLANNED_WORKOUTS_STORAGE_KEY, JSON.stringify(DEFAULT_DEMO_PLANNED_WORKOUTS));
    return DEFAULT_DEMO_PLANNED_WORKOUTS;
  }

  try {
    const parsed = JSON.parse(raw) as PlannedWorkoutSummary[];
    return Array.isArray(parsed) ? parsed : DEFAULT_DEMO_PLANNED_WORKOUTS;
  } catch {
    return DEFAULT_DEMO_PLANNED_WORKOUTS;
  }
}

function saveDemoPlannedWorkouts(plans: PlannedWorkoutSummary[]) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(DEMO_PLANNED_WORKOUTS_STORAGE_KEY, JSON.stringify(plans));
  }
}

function buildDemoPlannedMapFeatures(plans: PlannedWorkoutSummary[]): PlannedWorkoutMapFeatureCollection {
  return {
    type: "FeatureCollection",
    features: plans
      .filter((plan) => plan.route_points.length >= 2)
      .map((plan) => ({
        type: "Feature" as const,
        geometry: {
          type: "LineString" as const,
          coordinates: plan.route_points.map((point) => [point.longitude, point.latitude]),
        },
        properties: {
          id: plan.id,
          name: plan.name,
          activity_type: plan.activity_type,
          planned_for: plan.planned_for,
          distance_meters: plan.distance_meters,
          created_at: plan.created_at,
        },
      })),
  };
}

function interpolatePlannedRoute(waypoints: PlannedWorkoutRoutePoint[]) {
  if (waypoints.length < 2) {
    return waypoints;
  }

  const densified: PlannedWorkoutRoutePoint[] = [];
  for (let index = 1; index < waypoints.length; index += 1) {
    const start = waypoints[index - 1];
    const end = waypoints[index];
    const steps = 5;
    for (let step = 0; step < steps; step += 1) {
      const progress = step / steps;
      densified.push({
        latitude: start.latitude + (end.latitude - start.latitude) * progress,
        longitude: start.longitude + (end.longitude - start.longitude) * progress,
      });
    }
  }
  densified.push(waypoints[waypoints.length - 1]!);
  return densified;
}

export async function fetchHealth() {
  return resolveWithDemo(
    async () => {
      const response = await fetch(`${API_BASE_URL}/health`);
      if (!response.ok) {
        throw new Error("Failed to reach Altvia API.");
      }
      return response.json() as Promise<HealthStatus>;
    },
    () => ({ status: "demo", environment: "frontend-mock" }),
  );
}

function buildActivityQuery(filters: ActivityFilters = {}) {
  const params = new URLSearchParams();
  if (filters.activityType) {
    params.set("activity_type", filters.activityType);
  }
  if (filters.startDate) {
    params.set("start_date", filters.startDate);
  }
  if (filters.endDate) {
    params.set("end_date", filters.endDate);
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function fetchActivities(filters: ActivityFilters = {}) {
  return resolveWithDemo(
    async () => {
      const response = await fetch(`${API_BASE_URL}/api/activities/${buildActivityQuery(filters)}`);
      if (!response.ok) {
        throw new Error("Failed to load activities.");
      }
      return response.json() as Promise<ActivitySummary[]>;
    },
    () => filterDemoActivities(filters).map(toActivitySummary),
  );
}

export async function fetchActivityMapFeatures(filters: ActivityFilters = {}) {
  return resolveWithDemo(
    async () => {
      const response = await fetch(`${API_BASE_URL}/api/activities/map${buildActivityQuery(filters)}`);
      if (!response.ok) {
        throw new Error("Failed to load map workouts.");
      }
      return response.json() as Promise<ActivityMapFeatureCollection>;
    },
    () => buildDemoActivityMapFeatures(filters),
  );
}

export async function fetchActivityAnalytics(filters: ActivityFilters = {}) {
  return resolveWithDemo(
    async () => {
      const response = await fetch(`${API_BASE_URL}/api/activities/analytics${buildActivityQuery(filters)}`);
      if (!response.ok) {
        throw new Error("Failed to load activity analytics.");
      }
      return response.json() as Promise<ActivityAnalytics>;
    },
    () => buildDemoAnalytics(filters),
  );
}

export async function fetchActivityTimeline(activityType?: string | null) {
  return resolveWithDemo(
    async () => {
      const params = new URLSearchParams();
      if (activityType) {
        params.set("activity_type", activityType);
      }
      const query = params.toString();
      const response = await fetch(`${API_BASE_URL}/api/activities/timeline${query ? `?${query}` : ""}`);
      if (!response.ok) {
        throw new Error("Failed to load activity timeline.");
      }
      return response.json() as Promise<ActivityTimeline>;
    },
    () => buildDemoTimeline(activityType),
  );
}

export async function fetchActivityDetail(activityId: string) {
  return resolveWithDemo(
    async () => {
      const response = await fetch(`${API_BASE_URL}/api/activities/${activityId}`);
      if (!response.ok) {
        throw new Error("Failed to load workout detail.");
      }
      return response.json() as Promise<ActivityDetail>;
    },
    () => {
      const detail = buildDemoActivities().find((activity) => activity.id === activityId);
      if (!detail) {
        throw new Error("Failed to load workout detail.");
      }
      return detail;
    },
  );
}

export async function fetchPlannedWorkouts() {
  return resolveWithDemo(
    async () => {
      const response = await fetch(`${API_BASE_URL}/api/planned-workouts/`);
      if (!response.ok) {
        throw new Error("Failed to load planned workouts.");
      }
      return response.json() as Promise<PlannedWorkoutSummary[]>;
    },
    () => getStoredDemoPlannedWorkouts().sort((left, right) => {
      const leftTime = left.planned_for ? new Date(left.planned_for).getTime() : 0;
      const rightTime = right.planned_for ? new Date(right.planned_for).getTime() : 0;
      return leftTime - rightTime;
    }),
  );
}

export async function fetchPlannedWorkoutMapFeatures() {
  return resolveWithDemo(
    async () => {
      const response = await fetch(`${API_BASE_URL}/api/planned-workouts/map`);
      if (!response.ok) {
        throw new Error("Failed to load planned routes.");
      }
      return response.json() as Promise<PlannedWorkoutMapFeatureCollection>;
    },
    () => buildDemoPlannedMapFeatures(getStoredDemoPlannedWorkouts()),
  );
}

export async function createPlannedWorkout(payload: {
  name: string;
  activity_type: string;
  planned_for: string | null;
  route_points: PlannedWorkoutRoutePoint[];
  analysis_context_json?: PlannerSavedAnalysisContext | null;
}) {
  return resolveWithDemo(
    async () => {
      const response = await fetch(`${API_BASE_URL}/api/planned-workouts/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Failed to save planned workout.");
      }

      return response.json() as Promise<PlannedWorkoutSummary>;
    },
    () => {
      const createdPlan: PlannedWorkoutSummary = {
        id: `demo-plan-${crypto.randomUUID()}`,
        name: payload.name,
        activity_type: payload.activity_type,
        planned_for: payload.planned_for,
        route_points: payload.route_points,
        distance_meters: calculateDistanceForPlannedRoute(payload.route_points),
        analysis_context_json: payload.analysis_context_json ?? null,
        created_at: new Date().toISOString(),
      };
      const nextPlans = [...getStoredDemoPlannedWorkouts(), createdPlan];
      saveDemoPlannedWorkouts(nextPlans);
      return createdPlan;
    },
  );
}

export async function deletePlannedWorkout(id: string) {
  return resolveWithDemo(
    async () => {
      const response = await fetch(`${API_BASE_URL}/api/planned-workouts/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("Failed to delete planned workout.");
      }
    },
    () => {
      const nextPlans = getStoredDemoPlannedWorkouts().filter((plan) => plan.id !== id);
      saveDemoPlannedWorkouts(nextPlans);
    },
  );
}

export async function fetchPlannerWeather(payload: {
  activity_type: string;
  latitude: number;
  longitude: number;
  planned_for: string | null;
}) {
  return resolveWithDemo(
    async () => {
      const response = await fetch(`${API_BASE_URL}/api/weather/planner`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Failed to load planner weather.");
      }

      return response.json() as Promise<PlannerWeatherSummary>;
    },
    () => buildPlannerWeather(payload.activity_type, payload.planned_for),
  );
}

export async function planRoute(payload: {
  activity_type: string;
  waypoints: PlannedWorkoutRoutePoint[];
}) {
  return resolveWithDemo(
    async () => {
      const response = await fetch(`${API_BASE_URL}/api/routing/plan`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Failed to plan route.");
      }

      return response.json() as Promise<PlannedRouteResponse>;
    },
    () => {
      const route_points = interpolatePlannedRoute(payload.waypoints);
      return {
        route_points,
        distance_meters: calculateDistanceForPlannedRoute(route_points),
        source: "frontend-demo",
      };
    },
  );
}

export async function fetchElevation(coordinates: PlannedWorkoutRoutePoint[]) {
  return resolveWithDemo(
    async () => {
      const response = await fetch(`${API_BASE_URL}/api/routing/elevation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ coordinates }),
      });

      if (!response.ok) {
        throw new Error("Failed to fetch elevation data.");
      }

      return response.json() as Promise<ElevationResponse>;
    },
    () => buildElevationResponse(coordinates),
  );
}

export async function analyzePlannerRoute(payload: {
  activity_type: string;
  route_points: PlannedWorkoutRoutePoint[];
  planned_for: string | null;
  duration_seconds?: number | null;
}) {
  return resolveWithDemo(
    async () => {
      const response = await fetch(`${API_BASE_URL}/api/planner/analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Failed to analyze planner route.");
      }

      return response.json() as Promise<PlannerAnalysisResponse>;
    },
    () => buildPlannerAnalysisFromRoute(payload),
  );
}

export async function uploadAppleHealthExport(file: File) {
  return resolveWithDemo(
    async () => {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`${API_BASE_URL}/api/imports/apple-health`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        let message = "Apple Health import failed.";
        try {
          const body = (await response.json()) as { detail?: string };
          if (body.detail) {
            message = body.detail;
          }
        } catch {
          // Fall back to the generic message when the error body is not JSON.
        }
        throw new Error(message);
      }

      return response.json() as Promise<ImportJobResponse>;
    },
    () => ({
      id: `demo-import-${crypto.randomUUID()}`,
      source_type: "apple-health",
      status: "completed",
      filename: file.name,
      total_records: 9,
      imported_records: 9,
      notes: "Frontend demo import completed without backend persistence.",
    }),
  );
}

export async function importProjectAppleHealthExport() {
  return resolveWithDemo(
    async () => {
      const response = await fetch(`${API_BASE_URL}/api/imports/apple-health/project`, {
        method: "POST",
      });

      if (!response.ok) {
        let message = "Project Apple Health import failed.";
        try {
          const body = (await response.json()) as { detail?: string };
          if (body.detail) {
            message = body.detail;
          }
        } catch {
          // Fall back to the generic message when the error body is not JSON.
        }
        throw new Error(message);
      }

      return response.json() as Promise<ImportJobResponse>;
    },
    () => ({
      id: `demo-import-${crypto.randomUUID()}`,
      source_type: "apple-health-project",
      status: "completed",
      filename: "project-export.zip",
      total_records: 9,
      imported_records: 9,
      notes: "Loaded the bundled frontend demo activities.",
    }),
  );
}

function buildDemoSimilarRoutes(activityId: string): SimilarRoutesResponse {
  const activities = buildDemoActivities();
  const reference = activities.find((activity) => activity.id === activityId);
  if (!reference) {
    return { reference_activity_id: activityId, matches: [], match_count: 0 };
  }

  const matches = activities
    .filter((activity) => activity.id !== activityId && activity.activity_type === reference.activity_type)
    .sort((left, right) => {
      const leftDistance = Math.abs((left.distance_meters ?? 0) - (reference.distance_meters ?? 0));
      const rightDistance = Math.abs((right.distance_meters ?? 0) - (reference.distance_meters ?? 0));
      return leftDistance - rightDistance;
    })
    .slice(0, 2)
    .map((activity, index) => ({
      activity_id: activity.id,
      name: activity.name,
      started_at: activity.started_at,
      activity_type: activity.activity_type,
      distance_meters: activity.distance_meters,
      duration_seconds: activity.duration_seconds,
      elevation_gain_meters: activity.elevation_gain_meters,
      average_heart_rate_bpm: activity.average_heart_rate_bpm,
      max_heart_rate_bpm: activity.max_heart_rate_bpm,
      effort_score: activity.effort_score_json?.effort_score ?? null,
      avg_pace_seconds_per_km: activity.activity_type === "running" && activity.distance_meters
        ? Math.round((activity.duration_seconds ?? 0) / (activity.distance_meters / 1000))
        : null,
      hausdorff_distance_m: 140 + index * 85,
      route_points_json: activity.route_points_json,
    }));

  return {
    reference_activity_id: activityId,
    matches,
    match_count: matches.length,
  };
}

export type SimilarRouteMatch = {
  activity_id: string;
  name: string;
  started_at: string | null;
  activity_type: string;
  distance_meters: number | null;
  duration_seconds: number | null;
  elevation_gain_meters: number | null;
  average_heart_rate_bpm: number | null;
  max_heart_rate_bpm: number | null;
  effort_score: number | null;
  avg_pace_seconds_per_km: number | null;
  hausdorff_distance_m: number;
  route_points_json: ActivityRoutePoint[] | null;
};

export type SimilarRoutesResponse = {
  reference_activity_id: string;
  matches: SimilarRouteMatch[];
  match_count: number;
};

export async function fetchSimilarRoutes(activityId: string) {
  return resolveWithDemo(
    async () => {
      const response = await fetch(`${API_BASE_URL}/api/activities/${activityId}/similar`);
      if (!response.ok) {
        throw new Error("Failed to load similar routes.");
      }

      return response.json() as Promise<SimilarRoutesResponse>;
    },
    () => buildDemoSimilarRoutes(activityId),
  );
}

export type IntensityPredictionRequest = {
  activity_type: string;
  duration_seconds: number;
  distance_meters: number;
  elevation_gain_meters?: number;
  planned_for?: string | null;
  temperature_c?: number | null;
  wind_speed_kmh?: number | null;
  rain_mm?: number | null;
  snowfall_cm?: number | null;
};

export type IntensityPredictionResponse = {
  predicted_effort_score: number;
  confidence_interval_low: number;
  confidence_interval_high: number;
  features_used: string[];
  model_version: string;
  weather_adjusted: boolean;
};

export type ClusterPredictionRequest = {
  activity_type: string;
  duration_seconds: number;
  distance_meters: number;
  elevation_gain_meters?: number;
};

export type ClusterPredictionResponse = {
  cluster_label: string;
  cluster_id: number;
  activity_type_group: string;
  n_activities_in_group: number;
  n_clusters: number;
  features_used: string[];
  model_version: string;
};

export async function predictWorkoutCluster(payload: ClusterPredictionRequest) {
  return resolveWithDemo(
    async () => {
      const response = await fetch(`${API_BASE_URL}/api/clustering/predict`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Failed to predict workout cluster.");
      }

      return response.json() as Promise<ClusterPredictionResponse>;
    },
    () => buildClusterPrediction(payload),
  );
}

export async function predictWorkoutIntensity(payload: IntensityPredictionRequest) {
  return resolveWithDemo(
    async () => {
      const response = await fetch(`${API_BASE_URL}/api/intensity/predict`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Failed to predict workout intensity.");
      }

      return response.json() as Promise<IntensityPredictionResponse>;
    },
    () => buildIntensityPrediction(payload),
  );
}
