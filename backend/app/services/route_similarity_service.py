from uuid import UUID

from app.repositories.activity_repository import ActivityRepository
from app.schemas.activity import (
    ActivityRoutePoint,
    SimilarRouteMatch,
    SimilarRoutesResponse,
)


class RouteSimilarityService:
    def __init__(self, repository: ActivityRepository):
        self.repository = repository

    def find_similar_routes(self, activity_id: UUID) -> SimilarRoutesResponse:
        results = self.repository.find_similar_routes(activity_id)

        # Fetch route_points_json for all matched activities
        matched_ids = [a.id for a, _ in results]
        route_points_map = self.repository.get_route_points_for_ids(matched_ids)

        matches = []
        for activity, hausdorff_m in results:
            # Compute avg pace (seconds per km) from duration and distance
            avg_pace_s_per_km = None
            if activity.duration_seconds and activity.distance_meters and activity.distance_meters > 0:
                avg_pace_s_per_km = activity.duration_seconds / (activity.distance_meters / 1000.0)

            # Extract effort score from JSON
            effort_score = None
            if activity.effort_score_json and isinstance(activity.effort_score_json, dict):
                effort_score = activity.effort_score_json.get("effort_score")

            # Parse route points
            raw_points = route_points_map.get(activity.id)
            route_points = None
            if raw_points:
                route_points = [ActivityRoutePoint(**pt) for pt in raw_points]

            matches.append(
                SimilarRouteMatch(
                    activity_id=activity.id,
                    name=activity.name,
                    started_at=activity.started_at,
                    activity_type=activity.activity_type,
                    distance_meters=activity.distance_meters,
                    duration_seconds=activity.duration_seconds,
                    elevation_gain_meters=activity.elevation_gain_meters,
                    average_heart_rate_bpm=activity.average_heart_rate_bpm,
                    max_heart_rate_bpm=activity.max_heart_rate_bpm,
                    effort_score=effort_score,
                    avg_pace_seconds_per_km=avg_pace_s_per_km,
                    hausdorff_distance_m=hausdorff_m,
                    route_points_json=route_points,
                )
            )

        return SimilarRoutesResponse(
            reference_activity_id=activity_id,
            matches=matches,
            match_count=len(matches),
        )
