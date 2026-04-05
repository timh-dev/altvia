from datetime import date

from app.repositories.activity_repository import ActivityRepository
from app.schemas.activity import (
    ActivityAnalytics,
    ActivityDetail,
    ActivityMapFeature,
    ActivityMapFeatureCollection,
    ActivityMapFeatureProperties,
    ActivityTimeline,
    ActivityTimelineBucket,
    ActivityTypeBreakdown,
    ActivitySummary,
    ActivityWeather,
    EffortScore,
    PredictedIntensity,
    WorkoutCluster,
)


def _parse_weather(raw: dict | None) -> ActivityWeather | None:
    if raw is None:
        return None
    return ActivityWeather(**raw)


def _parse_effort_score(raw: dict | None) -> EffortScore | None:
    if raw is None:
        return None
    return EffortScore(**raw)


def _parse_workout_cluster(raw: dict | None) -> WorkoutCluster | None:
    if raw is None:
        return None
    return WorkoutCluster(**raw)


def _parse_predicted_intensity(raw: dict | None) -> PredictedIntensity | None:
    if raw is None:
        return None
    return PredictedIntensity(**raw)


class ActivityService:
    def __init__(self, repository: ActivityRepository):
        self.repository = repository

    def list_activities(
        self,
        *,
        activity_type: str | None = None,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> list[ActivitySummary]:
        activities = self.repository.list_activities(
            activity_type=activity_type,
            start_date=start_date,
            end_date=end_date,
        )
        return [
            ActivitySummary(
                id=activity.id,
                source=activity.source,
                activity_type=activity.activity_type,
                name=activity.name,
                started_at=activity.started_at,
                duration_seconds=activity.duration_seconds,
                distance_meters=activity.distance_meters,
                elevation_gain_meters=activity.elevation_gain_meters,
                active_energy_kcal=activity.active_energy_kcal,
                basal_energy_kcal=activity.basal_energy_kcal,
                average_heart_rate_bpm=activity.average_heart_rate_bpm,
                max_heart_rate_bpm=activity.max_heart_rate_bpm,
                recovery_heart_rate_bpm=activity.recovery_heart_rate_bpm,
                min_elevation_meters=activity.min_elevation_meters,
                max_elevation_meters=activity.max_elevation_meters,
                min_pace_seconds_per_mile=activity.min_pace_seconds_per_mile,
                max_pace_seconds_per_mile=activity.max_pace_seconds_per_mile,
                start_latitude=activity.start_latitude,
                start_longitude=activity.start_longitude,
                end_latitude=activity.end_latitude,
                end_longitude=activity.end_longitude,
                weather_json=_parse_weather(activity.weather_json),
                effort_score_json=_parse_effort_score(activity.effort_score_json),
                workout_cluster_json=_parse_workout_cluster(activity.workout_cluster_json),
                predicted_intensity_json=_parse_predicted_intensity(activity.predicted_intensity_json),
            )
            for activity in activities
        ]

    def list_activity_map_features(
        self,
        *,
        activity_type: str | None = None,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> ActivityMapFeatureCollection:
        mapped_activities = self.repository.list_mapped_activities(
            activity_type=activity_type,
            start_date=start_date,
            end_date=end_date,
        )
        return ActivityMapFeatureCollection(
            features=[
                ActivityMapFeature(
                    geometry=geometry,
                    properties=ActivityMapFeatureProperties(
                        id=activity.id,
                        source=activity.source,
                        activity_type=activity.activity_type,
                        name=activity.name,
                        started_at=activity.started_at,
                        duration_seconds=activity.duration_seconds,
                        distance_meters=activity.distance_meters,
                        elevation_gain_meters=activity.elevation_gain_meters,
                        active_energy_kcal=activity.active_energy_kcal,
                        basal_energy_kcal=activity.basal_energy_kcal,
                        average_heart_rate_bpm=activity.average_heart_rate_bpm,
                        max_heart_rate_bpm=activity.max_heart_rate_bpm,
                        recovery_heart_rate_bpm=activity.recovery_heart_rate_bpm,
                        min_elevation_meters=activity.min_elevation_meters,
                        max_elevation_meters=activity.max_elevation_meters,
                        min_pace_seconds_per_mile=activity.min_pace_seconds_per_mile,
                        max_pace_seconds_per_mile=activity.max_pace_seconds_per_mile,
                        start_latitude=activity.start_latitude,
                        start_longitude=activity.start_longitude,
                        end_latitude=activity.end_latitude,
                        end_longitude=activity.end_longitude,
                        weather_json=_parse_weather(activity.weather_json),
                        effort_score_json=_parse_effort_score(activity.effort_score_json),
                        workout_cluster_json=_parse_workout_cluster(activity.workout_cluster_json),
                        predicted_intensity_json=_parse_predicted_intensity(activity.predicted_intensity_json),
                    ),
                )
                for activity, geometry in mapped_activities
            ]
        )

    def get_activity_detail(self, activity_id) -> ActivityDetail | None:
        activity = self.repository.get_activity(activity_id)
        if activity is None:
            return None

        return ActivityDetail(
            id=activity.id,
            source=activity.source,
            activity_type=activity.activity_type,
            name=activity.name,
            started_at=activity.started_at,
            duration_seconds=activity.duration_seconds,
            distance_meters=activity.distance_meters,
            elevation_gain_meters=activity.elevation_gain_meters,
            active_energy_kcal=activity.active_energy_kcal,
            basal_energy_kcal=activity.basal_energy_kcal,
            average_heart_rate_bpm=activity.average_heart_rate_bpm,
            max_heart_rate_bpm=activity.max_heart_rate_bpm,
            recovery_heart_rate_bpm=activity.recovery_heart_rate_bpm,
            min_elevation_meters=activity.min_elevation_meters,
            max_elevation_meters=activity.max_elevation_meters,
            min_pace_seconds_per_mile=activity.min_pace_seconds_per_mile,
            max_pace_seconds_per_mile=activity.max_pace_seconds_per_mile,
            start_latitude=activity.start_latitude,
            start_longitude=activity.start_longitude,
            end_latitude=activity.end_latitude,
            end_longitude=activity.end_longitude,
            weather_json=_parse_weather(activity.weather_json),
            effort_score_json=_parse_effort_score(activity.effort_score_json),
            workout_cluster_json=_parse_workout_cluster(activity.workout_cluster_json),
            predicted_intensity_json=_parse_predicted_intensity(activity.predicted_intensity_json),
            workout_metadata_json=activity.workout_metadata_json,
            route_points_json=activity.route_points_json,
        )

    def get_activity_analytics(
        self,
        *,
        activity_type: str | None = None,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> ActivityAnalytics:
        (
            total_sessions,
            mapped_sessions,
            total_distance_meters,
            total_duration_seconds,
            total_elevation_gain_meters,
        ) = self.repository.get_activity_analytics_totals(
            activity_type=activity_type,
            start_date=start_date,
            end_date=end_date,
        )
        breakdown = sorted(
            (
                ActivityTypeBreakdown(activity_type=activity_type, count=count)
                for activity_type, count in self.repository.list_activity_type_breakdown(
                    activity_type=activity_type,
                    start_date=start_date,
                    end_date=end_date,
                )
            ),
            key=lambda item: (-item.count, item.activity_type),
        )

        return ActivityAnalytics(
            total_sessions=total_sessions,
            mapped_sessions=mapped_sessions,
            total_distance_meters=total_distance_meters,
            total_duration_seconds=total_duration_seconds,
            total_elevation_gain_meters=total_elevation_gain_meters,
            activity_types=breakdown,
        )

    def get_activity_timeline(self, *, activity_type: str | None = None) -> ActivityTimeline:
        min_date, max_date = self.repository.get_activity_date_bounds(activity_type=activity_type)
        buckets = self.repository.list_daily_timeline(activity_type=activity_type)

        return ActivityTimeline(
            min_date=min_date.isoformat() if min_date else None,
            max_date=max_date.isoformat() if max_date else None,
            buckets=[
                ActivityTimelineBucket(
                    date=day.isoformat(),
                    session_count=session_count,
                    total_distance_meters=total_distance_meters,
                    total_duration_seconds=total_duration_seconds,
                )
                for day, session_count, total_distance_meters, total_duration_seconds in buckets
            ],
        )
