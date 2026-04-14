from __future__ import annotations

from datetime import timedelta

from sqlalchemy.orm import Session

from app.repositories.activity_repository import ActivityRepository
from app.repositories.weather_cache_repository import WeatherCacheRepository
from app.schemas.planner_analysis import (
    PlannerAnalysisRequest,
    PlannerAnalysisResponse,
    PlannerClusterPredictionSummary,
    PlannerIntensityPredictionSummary,
)
from app.schemas.routing import ElevationRequest, RoutePlanPoint
from app.schemas.weather import PlannerWeatherRequest
from app.services.clustering_prediction_service import predict_cluster
from app.services.intensity_prediction_service import predict_intensity
from app.services.routing_service import RoutingService
from app.services.weather_service import WeatherService


PACE_SECONDS_PER_KM_BY_ACTIVITY_TYPE = {
    "running": 360,
    "cycling": 150,
    "hiking": 600,
    "swimming": 150,
    "walking": 720,
}


class PlannerAnalysisService:
    def __init__(self, db: Session):
        self.db = db
        self.routing_service = RoutingService()
        self.weather_service = WeatherService(WeatherCacheRepository(db))
        self.activity_repo = ActivityRepository(db)

    def analyze(self, payload: PlannerAnalysisRequest) -> PlannerAnalysisResponse:
        distance_meters = _calculate_route_distance_meters(payload.route_points)
        estimated_duration_seconds = payload.duration_seconds or _estimate_duration_seconds(payload.activity_type, distance_meters)
        elevation = self.routing_service.lookup_elevation(
            ElevationRequest(coordinates=payload.route_points),
        )

        predicted_cluster = predict_cluster(
            activity_type=payload.activity_type,
            duration_seconds=estimated_duration_seconds,
            distance_meters=distance_meters,
            elevation_gain_meters=elevation.elevation_gain_meters,
        )

        weather = None
        predicted_intensity = None

        if payload.planned_for is not None:
            midpoint = _calculate_route_midpoint(payload.route_points)
            weather = self.weather_service.get_planner_weather(
                PlannerWeatherRequest(
                    activity_type=payload.activity_type,
                    latitude=midpoint.latitude,
                    longitude=midpoint.longitude,
                    planned_for=payload.planned_for,
                ),
            )
            predicted_intensity = predict_intensity(
                activity_type=payload.activity_type,
                duration_seconds=estimated_duration_seconds,
                distance_meters=distance_meters,
                elevation_gain_meters=elevation.elevation_gain_meters,
                started_at=payload.planned_for,
                avg_hr=self.activity_repo.get_typical_avg_hr_for_activity_type(payload.activity_type),
                weather={
                    "temperature_c": weather.temperature_c,
                    "wind_speed_kmh": weather.wind_speed_kmh,
                    "rain_mm": weather.rain_mm,
                    "snowfall_cm": weather.snowfall_cm,
                },
            )

        return PlannerAnalysisResponse(
            distance_meters=distance_meters,
            estimated_duration_seconds=estimated_duration_seconds,
            avg_pace_seconds_per_mile=_calculate_avg_pace_seconds_per_mile(distance_meters, estimated_duration_seconds),
            predicted_completion_time=(payload.planned_for + timedelta(seconds=estimated_duration_seconds)) if payload.planned_for else None,
            elevation=elevation,
            weather=weather,
            predicted_intensity=PlannerIntensityPredictionSummary(**predicted_intensity.to_dict()) if predicted_intensity else None,
            predicted_cluster=PlannerClusterPredictionSummary(**predicted_cluster.to_dict()) if predicted_cluster else None,
        )


def _calculate_route_distance_meters(route_points: list[RoutePlanPoint]) -> float:
    from math import asin, cos, radians, sin, sqrt

    total_distance_meters = 0.0
    for left_point, right_point in zip(route_points, route_points[1:]):
        latitude_delta = radians(right_point.latitude - left_point.latitude)
        longitude_delta = radians(right_point.longitude - left_point.longitude)
        latitude_a = radians(left_point.latitude)
        latitude_b = radians(right_point.latitude)
        haversine = (
            sin(latitude_delta / 2) ** 2
            + cos(latitude_a) * cos(latitude_b) * sin(longitude_delta / 2) ** 2
        )
        total_distance_meters += 2 * 6_371_000.0 * asin(sqrt(haversine))
    return total_distance_meters


def _estimate_duration_seconds(activity_type: str, distance_meters: float) -> float:
    pace_seconds_per_km = PACE_SECONDS_PER_KM_BY_ACTIVITY_TYPE.get(activity_type, 360)
    return (distance_meters / 1000.0) * pace_seconds_per_km


def _calculate_avg_pace_seconds_per_mile(distance_meters: float, duration_seconds: float) -> float | None:
    if distance_meters <= 0 or duration_seconds <= 0:
        return None

    miles = distance_meters / 1609.344
    if miles <= 0:
        return None

    return duration_seconds / miles


def _calculate_route_midpoint(route_points: list[RoutePlanPoint]) -> RoutePlanPoint:
    latitude = sum(point.latitude for point in route_points) / len(route_points)
    longitude = sum(point.longitude for point in route_points) / len(route_points)
    return RoutePlanPoint(latitude=latitude, longitude=longitude)
