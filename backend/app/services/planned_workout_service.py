from shapely.geometry import LineString

from app.models.planned_workout import PlannedWorkout
from app.repositories.planned_workout_repository import PlannedWorkoutRepository
from app.schemas.planned_workout import (
    PlannedWorkoutCreate,
    PlannedWorkoutMapFeature,
    PlannedWorkoutMapFeatureCollection,
    PlannedWorkoutMapFeatureProperties,
    PlannedWorkoutSummary,
)


class PlannedWorkoutService:
    def __init__(self, repository: PlannedWorkoutRepository):
        self.repository = repository

    def create_planned_workout(self, payload: PlannedWorkoutCreate) -> PlannedWorkoutSummary:
        route_points_json = [
            {
                "latitude": point.latitude,
                "longitude": point.longitude,
            }
            for point in payload.route_points
        ]
        line = LineString([(point.longitude, point.latitude) for point in payload.route_points])
        planned_workout = PlannedWorkout(
            name=payload.name,
            activity_type=payload.activity_type,
            planned_for=payload.planned_for,
            distance_meters=_calculate_route_distance_meters(payload.route_points),
            route_points_json=route_points_json,
            route_geometry=line.wkt,
            weather_context_json=payload.analysis_context_json,
        )
        created = self.repository.create(planned_workout)
        return PlannedWorkoutSummary(
            id=created.id,
            name=created.name,
            activity_type=created.activity_type,
            planned_for=created.planned_for,
            distance_meters=created.distance_meters,
            route_points=payload.route_points,
            analysis_context_json=created.weather_context_json,
            created_at=created.created_at,
        )

    def list_planned_workouts(self) -> list[PlannedWorkoutSummary]:
        planned_workouts = self.repository.list_planned_workouts()
        return [
            PlannedWorkoutSummary(
                id=planned_workout.id,
                name=planned_workout.name,
                activity_type=planned_workout.activity_type,
                planned_for=planned_workout.planned_for,
                distance_meters=planned_workout.distance_meters,
                route_points=[
                    {
                        "latitude": point["latitude"],
                        "longitude": point["longitude"],
                    }
                    for point in planned_workout.route_points_json
                ],
                analysis_context_json=planned_workout.weather_context_json,
                created_at=planned_workout.created_at,
            )
            for planned_workout in planned_workouts
        ]

    def list_map_features(self) -> PlannedWorkoutMapFeatureCollection:
        mapped_plans = self.repository.list_map_features()
        return PlannedWorkoutMapFeatureCollection(
            features=[
                PlannedWorkoutMapFeature(
                    geometry=geometry,
                    properties=PlannedWorkoutMapFeatureProperties(
                        id=planned_workout.id,
                        name=planned_workout.name,
                        activity_type=planned_workout.activity_type,
                        planned_for=planned_workout.planned_for,
                        distance_meters=planned_workout.distance_meters,
                        created_at=planned_workout.created_at,
                    ),
                )
                for planned_workout, geometry in mapped_plans
            ]
        )

    def delete_planned_workout(self, planned_workout_id: str) -> None:
        planned_workout = self.repository.get(planned_workout_id)
        if not planned_workout:
            raise ValueError(f"Planned workout {planned_workout_id} not found")
        self.repository.delete(planned_workout)


def _calculate_route_distance_meters(route_points) -> float:
    total_distance_meters = 0.0
    for left_point, right_point in zip(route_points, route_points[1:]):
        total_distance_meters += _haversine_meters(
            left_point.latitude,
            left_point.longitude,
            right_point.latitude,
            right_point.longitude,
        )
    return total_distance_meters


def _haversine_meters(latitude_a: float, longitude_a: float, latitude_b: float, longitude_b: float) -> float:
    from math import asin, cos, radians, sin, sqrt

    earth_radius_meters = 6_371_000.0
    latitude_delta = radians(latitude_b - latitude_a)
    longitude_delta = radians(longitude_b - longitude_a)
    latitude_a_radians = radians(latitude_a)
    latitude_b_radians = radians(latitude_b)

    haversine = (
        sin(latitude_delta / 2) ** 2
        + cos(latitude_a_radians) * cos(latitude_b_radians) * sin(longitude_delta / 2) ** 2
    )
    return 2 * earth_radius_meters * asin(sqrt(haversine))
