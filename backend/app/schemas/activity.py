from typing import Any, Literal
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class ActivityWeather(BaseModel):
    temperature_c: float | None = None
    wind_speed_kmh: float | None = None
    wind_gusts_kmh: float | None = None
    wind_direction_deg: float | None = None
    precipitation_probability: float | None = None
    rain_mm: float | None = None
    snowfall_cm: float | None = None
    ice_risk: bool | None = None


class EffortScore(BaseModel):
    effort_score: float
    trimp: float
    hr_intensity_ratio: float
    max_hr_used: float
    elevation_factor: float
    formula_version: str


class WorkoutCluster(BaseModel):
    cluster_label: str
    cluster_id: int
    activity_type_group: str
    features_used: list[str]
    n_clusters: int
    n_activities_in_group: int
    version: str


class PredictedIntensity(BaseModel):
    predicted_effort_score: float
    confidence_interval_low: float
    confidence_interval_high: float
    features_used: list[str]
    model_version: str
    weather_adjusted: bool


class ActivitySummary(BaseModel):
    id: UUID
    source: str
    activity_type: str
    name: str
    started_at: datetime | None
    duration_seconds: float | None
    distance_meters: float | None
    elevation_gain_meters: float | None
    active_energy_kcal: float | None
    basal_energy_kcal: float | None
    average_heart_rate_bpm: float | None
    max_heart_rate_bpm: float | None
    recovery_heart_rate_bpm: float | None
    min_elevation_meters: float | None
    max_elevation_meters: float | None
    min_pace_seconds_per_mile: float | None
    max_pace_seconds_per_mile: float | None
    start_latitude: float | None
    start_longitude: float | None
    end_latitude: float | None
    end_longitude: float | None
    weather_json: ActivityWeather | None = None
    effort_score_json: EffortScore | None = None
    workout_cluster_json: WorkoutCluster | None = None
    predicted_intensity_json: PredictedIntensity | None = None


class ActivityMapFeatureProperties(BaseModel):
    id: UUID
    source: str
    activity_type: str
    name: str
    started_at: datetime | None
    duration_seconds: float | None
    distance_meters: float | None
    elevation_gain_meters: float | None
    active_energy_kcal: float | None
    basal_energy_kcal: float | None
    average_heart_rate_bpm: float | None
    max_heart_rate_bpm: float | None
    recovery_heart_rate_bpm: float | None
    min_elevation_meters: float | None
    max_elevation_meters: float | None
    min_pace_seconds_per_mile: float | None
    max_pace_seconds_per_mile: float | None
    start_latitude: float | None
    start_longitude: float | None
    end_latitude: float | None
    end_longitude: float | None
    weather_json: ActivityWeather | None = None
    effort_score_json: EffortScore | None = None
    workout_cluster_json: WorkoutCluster | None = None
    predicted_intensity_json: PredictedIntensity | None = None


class ActivityMapFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    geometry: dict[str, Any]
    properties: ActivityMapFeatureProperties


class ActivityMapFeatureCollection(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[ActivityMapFeature]


class ActivityTypeBreakdown(BaseModel):
    activity_type: str
    count: int


class ActivityAnalytics(BaseModel):
    total_sessions: int
    mapped_sessions: int
    total_distance_meters: float
    total_duration_seconds: float
    total_elevation_gain_meters: float
    activity_types: list[ActivityTypeBreakdown]


class ActivityTimelineBucket(BaseModel):
    date: str
    session_count: int
    total_distance_meters: float
    total_duration_seconds: float


class ActivityTimeline(BaseModel):
    min_date: str | None
    max_date: str | None
    buckets: list[ActivityTimelineBucket]


class ActivityRoutePoint(BaseModel):
    latitude: float
    longitude: float
    elevation_meters: float | None
    recorded_at: str | None
    speed_meters_per_second: float | None
    pace_seconds_per_mile: float | None
    heart_rate_bpm: float | None


class ActivityDetail(ActivitySummary):
    workout_metadata_json: dict[str, str] | None
    route_points_json: list[ActivityRoutePoint] | None
