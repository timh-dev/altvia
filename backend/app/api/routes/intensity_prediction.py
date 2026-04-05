from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.intensity_prediction_service import predict_intensity

router = APIRouter()


class IntensityPredictionRequest(BaseModel):
    activity_type: str
    duration_seconds: float
    distance_meters: float
    elevation_gain_meters: float = 0.0
    planned_for: datetime | None = None
    temperature_c: float | None = None
    wind_speed_kmh: float | None = None
    rain_mm: float | None = None
    snowfall_cm: float | None = None


class IntensityPredictionResponse(BaseModel):
    predicted_effort_score: float
    confidence_interval_low: float
    confidence_interval_high: float
    features_used: list[str]
    model_version: str
    weather_adjusted: bool


@router.post("/predict", response_model=IntensityPredictionResponse)
def predict_workout_intensity(request: IntensityPredictionRequest):
    weather = {}
    if request.temperature_c is not None:
        weather["temperature_c"] = request.temperature_c
    if request.wind_speed_kmh is not None:
        weather["wind_speed_kmh"] = request.wind_speed_kmh
    if request.rain_mm is not None:
        weather["rain_mm"] = request.rain_mm
    if request.snowfall_cm is not None:
        weather["snowfall_cm"] = request.snowfall_cm

    result = predict_intensity(
        activity_type=request.activity_type,
        duration_seconds=request.duration_seconds,
        distance_meters=request.distance_meters,
        elevation_gain_meters=request.elevation_gain_meters,
        started_at=request.planned_for,
        weather=weather if weather else None,
    )

    if result is None:
        raise HTTPException(status_code=503, detail="Intensity prediction model not available. Train the model first.")

    return IntensityPredictionResponse(
        predicted_effort_score=result.predicted_effort_score,
        confidence_interval_low=result.confidence_interval_low,
        confidence_interval_high=result.confidence_interval_high,
        features_used=result.features_used,
        model_version=result.model_version,
        weather_adjusted=result.weather_adjusted,
    )
