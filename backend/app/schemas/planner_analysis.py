from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.routing import ElevationResponse, RoutePlanPoint
from app.schemas.weather import PlannerWeatherSummary


class PlannerAnalysisRequest(BaseModel):
    activity_type: str = Field(min_length=1, max_length=50)
    route_points: list[RoutePlanPoint] = Field(min_length=2)
    planned_for: datetime | None = None
    duration_seconds: float | None = None


class PlannerIntensityPredictionSummary(BaseModel):
    predicted_effort_score: float
    confidence_interval_low: float
    confidence_interval_high: float
    features_used: list[str]
    model_version: str
    weather_adjusted: bool


class PlannerClusterPredictionSummary(BaseModel):
    cluster_label: str
    cluster_id: int
    activity_type_group: str
    n_activities_in_group: int
    n_clusters: int
    features_used: list[str]
    model_version: str


class PlannerAnalysisResponse(BaseModel):
    distance_meters: float
    estimated_duration_seconds: float
    avg_pace_seconds_per_mile: float | None = None
    predicted_completion_time: datetime | None = None
    elevation: ElevationResponse | None = None
    weather: PlannerWeatherSummary | None = None
    predicted_intensity: PlannerIntensityPredictionSummary | None = None
    predicted_cluster: PlannerClusterPredictionSummary | None = None
