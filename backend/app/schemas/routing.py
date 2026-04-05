from pydantic import BaseModel, Field


class RoutePlanPoint(BaseModel):
    latitude: float
    longitude: float
    elevation_meters: float | None = None


class RoutePlanRequest(BaseModel):
    activity_type: str = Field(min_length=1, max_length=50)
    waypoints: list[RoutePlanPoint] = Field(min_length=2)


class RoutePlanResponse(BaseModel):
    route_points: list[RoutePlanPoint]
    distance_meters: float
    source: str
    source_detail: str | None = None


class ElevationRequest(BaseModel):
    coordinates: list[RoutePlanPoint] = Field(min_length=1, max_length=5000)


class ElevationResponse(BaseModel):
    elevations: list[float | None]
    elevation_gain_meters: float
    elevation_loss_meters: float
