from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_database
from app.schemas.planner_analysis import PlannerAnalysisRequest, PlannerAnalysisResponse
from app.services.planner_analysis_service import PlannerAnalysisService


router = APIRouter()


@router.post("/analyze", response_model=PlannerAnalysisResponse)
def analyze_planner_route(
    payload: PlannerAnalysisRequest,
    db: Session = Depends(get_database),
) -> PlannerAnalysisResponse:
    service = PlannerAnalysisService(db)
    return service.analyze(payload)
