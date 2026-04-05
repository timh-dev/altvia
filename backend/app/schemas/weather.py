from datetime import datetime

from pydantic import BaseModel


class PlannerWeatherRequest(BaseModel):
    activity_type: str
    latitude: float
    longitude: float
    planned_for: datetime | None = None


class PlannerWeatherSummary(BaseModel):
    provider: str
    cached: bool
    forecast_time: str | None
    temperature_c: float | None = None
    wind_speed_kmh: float | None = None
    wind_gusts_kmh: float | None = None
    wind_direction_deg: float | None = None
    precipitation_probability: float | None = None
    rain_mm: float | None = None
    snowfall_cm: float | None = None
    ice_risk: bool | None = None
    sea_surface_temperature_c: float | None = None
    wave_height_m: float | None = None
    wave_period_s: float | None = None
    wave_direction_deg: float | None = None
