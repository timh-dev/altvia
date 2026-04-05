import { API_BASE_URL } from "@/lib/config";
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

export type ActivityMapFeature = Feature<LineString | MultiLineString, ActivitySummary>;
export type ActivityMapFeatureCollection = FeatureCollection<LineString | MultiLineString, ActivitySummary>;

export async function fetchHealth() {
  const response = await fetch(`${API_BASE_URL}/health`);
  if (!response.ok) {
    throw new Error("Failed to reach Altvia API.");
  }

  return response.json() as Promise<HealthStatus>;
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
  const response = await fetch(`${API_BASE_URL}/api/activities/${buildActivityQuery(filters)}`);
  if (!response.ok) {
    throw new Error("Failed to load activities.");
  }

  return response.json() as Promise<ActivitySummary[]>;
}

export async function fetchActivityMapFeatures(filters: ActivityFilters = {}) {
  const response = await fetch(`${API_BASE_URL}/api/activities/map${buildActivityQuery(filters)}`);
  if (!response.ok) {
    throw new Error("Failed to load map workouts.");
  }

  return response.json() as Promise<ActivityMapFeatureCollection>;
}

export async function fetchActivityAnalytics(filters: ActivityFilters = {}) {
  const response = await fetch(`${API_BASE_URL}/api/activities/analytics${buildActivityQuery(filters)}`);
  if (!response.ok) {
    throw new Error("Failed to load activity analytics.");
  }

  return response.json() as Promise<ActivityAnalytics>;
}

export async function fetchActivityTimeline(activityType?: string | null) {
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
}

export async function fetchActivityDetail(activityId: string) {
  const response = await fetch(`${API_BASE_URL}/api/activities/${activityId}`);
  if (!response.ok) {
    throw new Error("Failed to load workout detail.");
  }

  return response.json() as Promise<ActivityDetail>;
}

export async function fetchPlannedWorkouts() {
  const response = await fetch(`${API_BASE_URL}/api/planned-workouts/`);
  if (!response.ok) {
    throw new Error("Failed to load planned workouts.");
  }

  return response.json() as Promise<PlannedWorkoutSummary[]>;
}

export async function fetchPlannedWorkoutMapFeatures() {
  const response = await fetch(`${API_BASE_URL}/api/planned-workouts/map`);
  if (!response.ok) {
    throw new Error("Failed to load planned routes.");
  }

  return response.json() as Promise<PlannedWorkoutMapFeatureCollection>;
}

export async function createPlannedWorkout(payload: {
  name: string;
  activity_type: string;
  planned_for: string | null;
  route_points: PlannedWorkoutRoutePoint[];
}) {
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
}

export async function deletePlannedWorkout(id: string) {
  const response = await fetch(`${API_BASE_URL}/api/planned-workouts/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error("Failed to delete planned workout.");
  }
}

export async function fetchPlannerWeather(payload: {
  activity_type: string;
  latitude: number;
  longitude: number;
  planned_for: string | null;
}) {
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
}

export async function planRoute(payload: {
  activity_type: string;
  waypoints: PlannedWorkoutRoutePoint[];
}) {
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
}

export async function fetchElevation(coordinates: PlannedWorkoutRoutePoint[]) {
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
}

export async function uploadAppleHealthExport(file: File) {
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
}

export async function importProjectAppleHealthExport() {
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

export async function predictWorkoutIntensity(payload: IntensityPredictionRequest) {
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
}
