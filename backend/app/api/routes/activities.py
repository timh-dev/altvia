from uuid import UUID

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_database
from app.repositories.activity_repository import ActivityRepository
from app.schemas.activity import ActivityAnalytics, ActivityDetail, ActivityMapFeatureCollection, ActivitySummary, ActivityTimeline
from app.services.activity_service import ActivityService


router = APIRouter()


@router.get("/", response_model=list[ActivitySummary])
def list_activities(
    activity_type: str | None = Query(default=None),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    db: Session = Depends(get_database),
) -> list[ActivitySummary]:
    service = ActivityService(ActivityRepository(db))
    return service.list_activities(activity_type=activity_type, start_date=start_date, end_date=end_date)


@router.get("/map", response_model=ActivityMapFeatureCollection)
def list_activity_map_features(
    activity_type: str | None = Query(default=None),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    db: Session = Depends(get_database),
) -> ActivityMapFeatureCollection:
    service = ActivityService(ActivityRepository(db))
    return service.list_activity_map_features(activity_type=activity_type, start_date=start_date, end_date=end_date)


@router.get("/analytics", response_model=ActivityAnalytics)
def get_activity_analytics(
    activity_type: str | None = Query(default=None),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    db: Session = Depends(get_database),
) -> ActivityAnalytics:
    service = ActivityService(ActivityRepository(db))
    return service.get_activity_analytics(activity_type=activity_type, start_date=start_date, end_date=end_date)


@router.get("/timeline", response_model=ActivityTimeline)
def get_activity_timeline(
    activity_type: str | None = Query(default=None),
    db: Session = Depends(get_database),
) -> ActivityTimeline:
    service = ActivityService(ActivityRepository(db))
    return service.get_activity_timeline(activity_type=activity_type)


@router.get("/{activity_id}", response_model=ActivityDetail)
def get_activity_detail(activity_id: UUID, db: Session = Depends(get_database)) -> ActivityDetail:
    service = ActivityService(ActivityRepository(db))
    activity = service.get_activity_detail(activity_id)
    if activity is None:
        raise HTTPException(status_code=404, detail="Activity not found.")
    return activity
