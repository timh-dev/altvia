import json

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.planned_workout import PlannedWorkout


class PlannedWorkoutRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(self, planned_workout: PlannedWorkout) -> PlannedWorkout:
        self.db.add(planned_workout)
        self.db.commit()
        self.db.refresh(planned_workout)
        return planned_workout

    def list_planned_workouts(self) -> list[PlannedWorkout]:
        return (
            self.db.query(PlannedWorkout)
            .order_by(
                PlannedWorkout.planned_for.desc().nullslast(),
                PlannedWorkout.created_at.desc(),
            )
            .all()
        )

    def list_map_features(self) -> list[tuple[PlannedWorkout, dict]]:
        statement = select(
            PlannedWorkout,
            func.ST_AsGeoJSON(PlannedWorkout.route_geometry).label("route_geojson"),
        ).order_by(
            PlannedWorkout.planned_for.desc().nullslast(),
            PlannedWorkout.created_at.desc(),
        )
        rows = self.db.execute(statement).all()
        return [
            (planned_workout, json.loads(route_geojson))
            for planned_workout, route_geojson in rows
            if route_geojson
        ]

    def get(self, planned_workout_id: str) -> PlannedWorkout | None:
        return self.db.get(PlannedWorkout, planned_workout_id)

    def delete(self, planned_workout: PlannedWorkout) -> None:
        self.db.delete(planned_workout)
        self.db.commit()
