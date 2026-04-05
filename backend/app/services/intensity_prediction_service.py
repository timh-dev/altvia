from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.activity import Activity


ACTIVITY_TYPE_MAP = {
    "running": 0,
    "cycling": 1,
    "hiking": 2,
    "swimming": 3,
    "walking": 4,
}

FEATURE_NAMES = [
    "duration_seconds",
    "distance_meters",
    "elevation_gain_meters",
    "avg_pace",
    "avg_hr",
    "hour_of_day",
    "month",
    "temperature_c",
    "wind_speed_kmh",
    "rain_mm",
    "snowfall_cm",
    "activity_type_encoded",
]


@dataclass
class IntensityPredictionResult:
    predicted_effort_score: float
    confidence_interval_low: float
    confidence_interval_high: float
    features_used: list[str]
    model_version: str
    weather_adjusted: bool

    def to_dict(self) -> dict:
        return {
            "predicted_effort_score": round(self.predicted_effort_score, 1),
            "confidence_interval_low": round(self.confidence_interval_low, 1),
            "confidence_interval_high": round(self.confidence_interval_high, 1),
            "features_used": self.features_used,
            "model_version": self.model_version,
            "weather_adjusted": self.weather_adjusted,
        }


def predict_intensity(
    *,
    activity_type: str,
    duration_seconds: float,
    distance_meters: float,
    elevation_gain_meters: float = 0.0,
    started_at: datetime | None = None,
    avg_hr: float | None = None,
    weather: dict | None = None,
) -> IntensityPredictionResult | None:
    """Predict effort score for a planned or historical activity."""
    import math

    import numpy as np
    import pandas as pd

    from app.ml.intensity_predictor import load_model_bundle

    bundle = load_model_bundle()
    if bundle is None:
        return None

    if distance_meters <= 0 or duration_seconds <= 0:
        return None

    weather = weather or {}
    temp = weather.get("temperature_c")
    wind = weather.get("wind_speed_kmh")
    rain = weather.get("rain_mm")
    snow = weather.get("snowfall_cm")

    nan = float("nan")
    features = {
        "duration_seconds": duration_seconds,
        "distance_meters": distance_meters,
        "elevation_gain_meters": elevation_gain_meters,
        "avg_pace": duration_seconds / distance_meters,
        "avg_hr": avg_hr if avg_hr is not None else nan,
        "hour_of_day": float(started_at.hour) if started_at else nan,
        "month": float(started_at.month) if started_at else nan,
        "temperature_c": temp if temp is not None else nan,
        "wind_speed_kmh": wind if wind is not None else nan,
        "rain_mm": rain if rain is not None else nan,
        "snowfall_cm": snow if snow is not None else nan,
        "activity_type_encoded": float(ACTIVITY_TYPE_MAP.get(activity_type, 0)),
    }

    input_df = pd.DataFrame([features])[FEATURE_NAMES]
    result = bundle.predict(input_df)

    weather_adjusted = any(
        not math.isnan(features[k])
        for k in ("temperature_c", "wind_speed_kmh", "rain_mm", "snowfall_cm")
    )

    return IntensityPredictionResult(
        predicted_effort_score=float(result["predicted_effort_score"].iloc[0]),
        confidence_interval_low=float(result["confidence_low"].iloc[0]),
        confidence_interval_high=float(result["confidence_high"].iloc[0]),
        features_used=[k for k, v in features.items() if not (isinstance(v, float) and math.isnan(v))],
        model_version="v1",
        weather_adjusted=weather_adjusted,
    )


def predict_for_activity(activity: Activity) -> IntensityPredictionResult | None:
    """Convenience wrapper to predict intensity for an existing Activity."""
    weather = activity.weather_json or {}
    return predict_intensity(
        activity_type=activity.activity_type,
        duration_seconds=activity.duration_seconds or 0.0,
        distance_meters=activity.distance_meters or 0.0,
        elevation_gain_meters=activity.elevation_gain_meters or 0.0,
        started_at=activity.started_at,
        avg_hr=activity.average_heart_rate_bpm,
        weather=weather,
    )
