from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_database
from app.repositories.weather_cache_repository import WeatherCacheRepository
from app.schemas.weather import PlannerWeatherRequest, PlannerWeatherSummary
from app.services.weather_service import WeatherService


router = APIRouter()


@router.post("/planner", response_model=PlannerWeatherSummary)
def get_planner_weather(
    payload: PlannerWeatherRequest,
    db: Session = Depends(get_database),
) -> PlannerWeatherSummary:
    service = WeatherService(WeatherCacheRepository(db))
    return service.get_planner_weather(payload)
