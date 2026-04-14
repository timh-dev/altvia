from fastapi import APIRouter

from app.api.routes.activities import router as activities_router
from app.api.routes.clustering_prediction import router as clustering_prediction_router
from app.api.routes.imports import router as imports_router
from app.api.routes.intensity_prediction import router as intensity_prediction_router
from app.api.routes.planner_analysis import router as planner_analysis_router
from app.api.routes.planned_workouts import router as planned_workouts_router
from app.api.routes.routing import router as routing_router
from app.api.routes.weather import router as weather_router


api_router = APIRouter()
api_router.include_router(activities_router, prefix="/activities", tags=["activities"])
api_router.include_router(clustering_prediction_router, prefix="/clustering", tags=["clustering"])
api_router.include_router(imports_router, prefix="/imports", tags=["imports"])
api_router.include_router(intensity_prediction_router, prefix="/intensity", tags=["intensity"])
api_router.include_router(planner_analysis_router, prefix="/planner", tags=["planner"])
api_router.include_router(planned_workouts_router, prefix="/planned-workouts", tags=["planned-workouts"])
api_router.include_router(routing_router, prefix="/routing", tags=["routing"])
api_router.include_router(weather_router, prefix="/weather", tags=["weather"])
