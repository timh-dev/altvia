from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class PlannedWorkoutRoutePoint(BaseModel):
    latitude: float
    longitude: float


class PlannedWorkoutCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    activity_type: str = Field(min_length=1, max_length=50)
    planned_for: datetime | None = None
    route_points: list[PlannedWorkoutRoutePoint] = Field(min_length=2)
    analysis_context_json: dict | None = None


class PlannedWorkoutSummary(BaseModel):
    id: UUID
    name: str
    activity_type: str
    planned_for: datetime | None
    distance_meters: float
    route_points: list[PlannedWorkoutRoutePoint]
    analysis_context_json: dict | None = None
    created_at: datetime


class PlannedWorkoutMapFeatureProperties(BaseModel):
    id: UUID
    name: str
    activity_type: str
    planned_for: datetime | None
    distance_meters: float
    created_at: datetime


class PlannedWorkoutMapFeature(BaseModel):
    type: str = "Feature"
    geometry: dict
    properties: PlannedWorkoutMapFeatureProperties


class PlannedWorkoutMapFeatureCollection(BaseModel):
    type: str = "FeatureCollection"
    features: list[PlannedWorkoutMapFeature]
