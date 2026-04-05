from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_database
from app.repositories.planned_workout_repository import PlannedWorkoutRepository
from app.schemas.planned_workout import (
    PlannedWorkoutCreate,
    PlannedWorkoutMapFeatureCollection,
    PlannedWorkoutSummary,
)
from app.services.planned_workout_service import PlannedWorkoutService


router = APIRouter()


@router.get("/", response_model=list[PlannedWorkoutSummary])
def list_planned_workouts(db: Session = Depends(get_database)) -> list[PlannedWorkoutSummary]:
    service = PlannedWorkoutService(PlannedWorkoutRepository(db))
    return service.list_planned_workouts()


@router.get("/map", response_model=PlannedWorkoutMapFeatureCollection)
def list_planned_workout_map_features(db: Session = Depends(get_database)) -> PlannedWorkoutMapFeatureCollection:
    service = PlannedWorkoutService(PlannedWorkoutRepository(db))
    return service.list_map_features()


@router.post("/", response_model=PlannedWorkoutSummary)
def create_planned_workout(
    payload: PlannedWorkoutCreate,
    db: Session = Depends(get_database),
) -> PlannedWorkoutSummary:
    service = PlannedWorkoutService(PlannedWorkoutRepository(db))
    return service.create_planned_workout(payload)


@router.delete("/{planned_workout_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_planned_workout(
    planned_workout_id: str,
    db: Session = Depends(get_database),
) -> None:
    service = PlannedWorkoutService(PlannedWorkoutRepository(db))
    try:
        service.delete_planned_workout(planned_workout_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Planned workout not found.")
