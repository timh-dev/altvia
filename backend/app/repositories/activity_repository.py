from datetime import date, datetime, timedelta
import json

from sqlalchemy import cast, Date, func, select
from sqlalchemy.orm import Session, load_only

from app.models.activity import Activity


SUMMARY_COLUMNS = (
    Activity.id,
    Activity.source,
    Activity.activity_type,
    Activity.name,
    Activity.started_at,
    Activity.duration_seconds,
    Activity.distance_meters,
    Activity.elevation_gain_meters,
    Activity.active_energy_kcal,
    Activity.basal_energy_kcal,
    Activity.average_heart_rate_bpm,
    Activity.max_heart_rate_bpm,
    Activity.recovery_heart_rate_bpm,
    Activity.min_elevation_meters,
    Activity.max_elevation_meters,
    Activity.min_pace_seconds_per_mile,
    Activity.max_pace_seconds_per_mile,
    Activity.start_latitude,
    Activity.start_longitude,
    Activity.end_latitude,
    Activity.end_longitude,
    Activity.weather_json,
    Activity.effort_score_json,
    Activity.workout_cluster_json,
    Activity.predicted_intensity_json,
)


class ActivityRepository:
    def __init__(self, db: Session):
        self.db = db

    def _summary_query(self):
        return self.db.query(Activity).options(load_only(*SUMMARY_COLUMNS))

    def _apply_filters(self, query, *, activity_type: str | None, start_date: date | None, end_date: date | None):
        if activity_type:
            query = query.filter(Activity.activity_type == activity_type)
        if start_date:
            query = query.filter(Activity.started_at >= start_date)
        if end_date:
            query = query.filter(Activity.started_at < datetime.combine(end_date + timedelta(days=1), datetime.min.time()))
        return query

    def list_activities(
        self,
        *,
        activity_type: str | None = None,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> list[Activity]:
        query = self._summary_query()
        query = self._apply_filters(query, activity_type=activity_type, start_date=start_date, end_date=end_date)
        return query.order_by(Activity.started_at.desc()).all()

    def find_by_source_type_and_start(
        self,
        *,
        source: str,
        activity_type: str,
        started_at: datetime | None,
    ) -> Activity | None:
        query = self.db.query(Activity).filter(
            Activity.source == source,
            Activity.activity_type == activity_type,
        )

        if started_at is None:
            query = query.filter(Activity.started_at.is_(None))
        else:
            query = query.filter(Activity.started_at == started_at)

        return query.one_or_none()

    def create_many(self, activities: list[Activity]) -> list[Activity]:
        if not activities:
            return []

        self.db.add_all(activities)
        self.db.commit()
        for activity in activities:
            self.db.refresh(activity)
        return activities

    def get_activity(self, activity_id) -> Activity | None:
        return self.db.query(Activity).filter(Activity.id == activity_id).one_or_none()

    def save(self, activity: Activity) -> Activity:
        self.db.add(activity)
        self.db.commit()
        self.db.refresh(activity)
        return activity

    def save_many(self, activities: list[Activity]) -> list[Activity]:
        if not activities:
            return []

        for activity in activities:
            self.db.add(activity)
        self.db.commit()
        for activity in activities:
            self.db.refresh(activity)
        return activities

    def list_mapped_activities(
        self,
        *,
        activity_type: str | None = None,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> list[tuple[Activity, dict]]:
        # Fetch activities via summary query (fully loads all SUMMARY_COLUMNS)
        query = self._summary_query().filter(Activity.route_geometry.is_not(None))
        query = self._apply_filters(query, activity_type=activity_type, start_date=start_date, end_date=end_date)
        activities = query.order_by(Activity.started_at.desc()).all()

        # Fetch geometries separately to avoid ORM identity map partial-load issues
        ids = [a.id for a in activities]
        if not ids:
            return []
        geom_rows = self.db.execute(
            select(Activity.id, func.ST_AsGeoJSON(Activity.route_geometry).label("geojson"))
            .where(Activity.id.in_(ids))
        ).all()
        geom_map = {row.id: json.loads(row.geojson) for row in geom_rows if row.geojson}

        return [(a, geom_map[a.id]) for a in activities if a.id in geom_map]

    def list_all_activities(
        self,
        *,
        activity_type: str | None = None,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> list[Activity]:
        query = self._summary_query()
        query = self._apply_filters(query, activity_type=activity_type, start_date=start_date, end_date=end_date)
        return query.order_by(Activity.started_at.desc()).all()

    def get_activity_analytics_totals(
        self,
        *,
        activity_type: str | None = None,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> tuple[int, int, float, float, float]:
        query = self.db.query(
            func.count(Activity.id).label("total_sessions"),
            func.count(Activity.route_geometry).label("mapped_sessions"),
            func.coalesce(func.sum(Activity.distance_meters), 0.0).label("total_distance_meters"),
            func.coalesce(func.sum(Activity.duration_seconds), 0.0).label("total_duration_seconds"),
            func.coalesce(func.sum(Activity.elevation_gain_meters), 0.0).label("total_elevation_gain_meters"),
        )
        query = self._apply_filters(query, activity_type=activity_type, start_date=start_date, end_date=end_date)
        row = query.one()
        return (
            row.total_sessions,
            row.mapped_sessions,
            row.total_distance_meters,
            row.total_duration_seconds,
            row.total_elevation_gain_meters,
        )

    def list_activity_type_breakdown(
        self,
        *,
        activity_type: str | None = None,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> list[tuple[str, int]]:
        query = self.db.query(
            Activity.activity_type,
            func.count(Activity.id).label("count"),
        )
        query = self._apply_filters(query, activity_type=activity_type, start_date=start_date, end_date=end_date)
        rows = (
            query.group_by(Activity.activity_type)
            .order_by(func.count(Activity.id).desc(), Activity.activity_type.asc())
            .all()
        )
        return [(activity_type, count) for activity_type, count in rows]

    def get_activity_date_bounds(self, *, activity_type: str | None = None) -> tuple[date | None, date | None]:
        started_on = cast(Activity.started_at, Date)
        query = self.db.query(
            func.min(started_on).label("min_date"),
            func.max(started_on).label("max_date"),
        ).filter(Activity.started_at.is_not(None))
        query = self._apply_filters(query, activity_type=activity_type, start_date=None, end_date=None)
        row = query.one()
        return row.min_date, row.max_date

    def clear_all_weather_json(self) -> int:
        count = (
            self.db.query(Activity)
            .filter(Activity.weather_json.is_not(None))
            .update({Activity.weather_json: None}, synchronize_session="fetch")
        )
        self.db.commit()
        return count

    def list_activities_missing_weather(self) -> list[Activity]:
        return (
            self.db.query(Activity)
            .filter(
                Activity.weather_json.is_(None),
                Activity.start_latitude.is_not(None),
                Activity.start_longitude.is_not(None),
                Activity.started_at.is_not(None),
            )
            .order_by(Activity.started_at.desc())
            .all()
        )

    def list_activities_missing_effort_score(self) -> list[Activity]:
        return (
            self.db.query(Activity)
            .filter(
                Activity.effort_score_json.is_(None),
                Activity.average_heart_rate_bpm.is_not(None),
                Activity.duration_seconds.is_not(None),
            )
            .order_by(Activity.started_at.desc())
            .all()
        )

    def clear_all_effort_scores(self) -> int:
        count = (
            self.db.query(Activity)
            .filter(Activity.effort_score_json.is_not(None))
            .update({Activity.effort_score_json: None}, synchronize_session="fetch")
        )
        self.db.commit()
        return count

    def get_typical_avg_hr_for_activity_type(self, activity_type: str) -> float | None:
        """Return median avg HR across past activities of this type, or None if insufficient data."""
        result = (
            self.db.query(func.percentile_cont(0.5).within_group(Activity.average_heart_rate_bpm))
            .filter(
                Activity.activity_type == activity_type,
                Activity.average_heart_rate_bpm.is_not(None),
            )
            .scalar()
        )
        return float(result) if result is not None else None

    def list_all_activities_for_clustering(self) -> list[Activity]:
        return (
            self.db.query(Activity)
            .options(
                load_only(
                    Activity.id,
                    Activity.activity_type,
                    Activity.duration_seconds,
                    Activity.distance_meters,
                    Activity.elevation_gain_meters,
                    Activity.average_heart_rate_bpm,
                    Activity.max_heart_rate_bpm,
                )
            )
            .all()
        )

    def clear_all_workout_clusters(self) -> int:
        count = (
            self.db.query(Activity)
            .filter(Activity.workout_cluster_json.is_not(None))
            .update({Activity.workout_cluster_json: None}, synchronize_session="fetch")
        )
        self.db.commit()
        return count

    def list_activities_for_intensity_prediction(self) -> list[Activity]:
        return (
            self.db.query(Activity)
            .filter(Activity.effort_score_json.is_not(None))
            .order_by(Activity.started_at.desc())
            .all()
        )

    def update_predicted_intensity(self, activity_id, predicted_intensity_json: dict | None) -> None:
        self.db.query(Activity).filter(Activity.id == activity_id).update(
            {Activity.predicted_intensity_json: predicted_intensity_json},
            synchronize_session="fetch",
        )

    def flush_predicted_intensity_batch(self) -> None:
        self.db.commit()

    def clear_all_predicted_intensities(self) -> int:
        count = (
            self.db.query(Activity)
            .filter(Activity.predicted_intensity_json.is_not(None))
            .update({Activity.predicted_intensity_json: None}, synchronize_session="fetch")
        )
        self.db.commit()
        return count

    def list_daily_timeline(self, *, activity_type: str | None = None) -> list[tuple[date, int, float, float]]:
        started_on = cast(Activity.started_at, Date)
        query = self.db.query(
            started_on.label("day"),
            func.count(Activity.id).label("session_count"),
            func.coalesce(func.sum(Activity.distance_meters), 0.0).label("total_distance_meters"),
            func.coalesce(func.sum(Activity.duration_seconds), 0.0).label("total_duration_seconds"),
        ).filter(Activity.started_at.is_not(None))
        query = self._apply_filters(query, activity_type=activity_type, start_date=None, end_date=None)
        rows = (
            query.group_by(started_on)
            .order_by(started_on.asc())
            .all()
        )
        return [
            (row.day, row.session_count, row.total_distance_meters, row.total_duration_seconds)
            for row in rows
            if row.day is not None
        ]
