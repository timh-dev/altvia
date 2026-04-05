from fastapi import APIRouter

from app.schemas.routing import ElevationRequest, ElevationResponse, RoutePlanRequest, RoutePlanResponse
from app.services.routing_service import RoutingService


router = APIRouter()


@router.post("/plan", response_model=RoutePlanResponse)
def plan_route(payload: RoutePlanRequest) -> RoutePlanResponse:
    service = RoutingService()
    return service.plan_route(payload)


@router.post("/elevation", response_model=ElevationResponse)
def lookup_elevation(payload: ElevationRequest) -> ElevationResponse:
    service = RoutingService()
    return service.lookup_elevation(payload)
