import json
from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from app.repositories.weather_cache_repository import WeatherCacheRepository
from app.schemas.weather import PlannerWeatherRequest, PlannerWeatherSummary


OPEN_METEO_PROVIDER = "open_meteo"
OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
OPEN_METEO_MARINE_URL = "https://marine-api.open-meteo.com/v1/marine"
OPEN_METEO_ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
CACHE_TTL_HOURS = 6
ARCHIVE_CACHE_TTL_DAYS = 30


class WeatherService:
    def __init__(self, cache_repository: WeatherCacheRepository):
        self.cache_repository = cache_repository

    def get_planner_weather(self, payload: PlannerWeatherRequest) -> PlannerWeatherSummary:
        rounded_latitude = round(payload.latitude, 2)
        rounded_longitude = round(payload.longitude, 2)
        forecast_hour = _hour_bucket(payload.planned_for)

        base_summary = self._fetch_land_summary(
            latitude=rounded_latitude,
            longitude=rounded_longitude,
            forecast_hour=forecast_hour,
        )

        if payload.activity_type == "swimming":
            marine_summary = self._fetch_marine_summary(
                latitude=rounded_latitude,
                longitude=rounded_longitude,
                forecast_hour=forecast_hour,
            )
            return PlannerWeatherSummary(
                provider=OPEN_METEO_PROVIDER,
                cached=base_summary["cached"] and marine_summary["cached"],
                forecast_time=base_summary["forecast_time"],
                temperature_c=base_summary["temperature_c"],
                wind_speed_kmh=base_summary["wind_speed_kmh"],
                wind_gusts_kmh=base_summary["wind_gusts_kmh"],
                precipitation_probability=base_summary["precipitation_probability"],
                rain_mm=base_summary["rain_mm"],
                snowfall_cm=base_summary["snowfall_cm"],
                ice_risk=base_summary["ice_risk"],
                sea_surface_temperature_c=marine_summary["sea_surface_temperature_c"],
                wave_height_m=marine_summary["wave_height_m"],
                wave_period_s=marine_summary["wave_period_s"],
            )

        return PlannerWeatherSummary(
            provider=OPEN_METEO_PROVIDER,
            cached=base_summary["cached"],
            forecast_time=base_summary["forecast_time"],
            temperature_c=base_summary["temperature_c"],
            wind_speed_kmh=base_summary["wind_speed_kmh"],
            wind_gusts_kmh=base_summary["wind_gusts_kmh"],
            precipitation_probability=base_summary["precipitation_probability"],
            rain_mm=base_summary["rain_mm"],
            snowfall_cm=base_summary["snowfall_cm"],
            ice_risk=base_summary["ice_risk"],
        )

    def get_historical_weather(self, latitude: float, longitude: float, started_at: datetime) -> dict | None:
        rounded_latitude = round(latitude, 2)
        rounded_longitude = round(longitude, 2)
        activity_hour = _hour_bucket(started_at)
        date_str = started_at.strftime("%Y-%m-%d")

        cache_key = f"archive:{rounded_latitude:.2f}:{rounded_longitude:.2f}:{activity_hour.isoformat()}"
        cached = self.cache_repository.get_valid(provider=OPEN_METEO_PROVIDER, cache_key=cache_key)
        if cached is not None:
            return cached.payload_json

        params = urlencode(
            {
                "latitude": rounded_latitude,
                "longitude": rounded_longitude,
                "hourly": ",".join(
                    [
                        "temperature_2m",
                        "rain",
                        "snowfall",
                        "wind_speed_10m",
                        "wind_gusts_10m",
                        "wind_direction_10m",
                    ]
                ),
                "wind_speed_unit": "kmh",
                "timezone": "auto",
                "start_date": date_str,
                "end_date": date_str,
            }
        )

        try:
            payload = _load_json(f"{OPEN_METEO_ARCHIVE_URL}?{params}")
        except Exception:
            return None

        summary = _extract_hourly_summary(payload, activity_hour)
        stored_payload = {
            "temperature_c": summary["temperature_c"],
            "wind_speed_kmh": summary["wind_speed_kmh"],
            "wind_gusts_kmh": summary["wind_gusts_kmh"],
            "wind_direction_deg": summary["wind_direction_deg"],
            "precipitation_probability": None,
            "rain_mm": summary["rain_mm"],
            "snowfall_cm": summary["snowfall_cm"],
            "ice_risk": summary["ice_risk"],
        }
        self.cache_repository.save(
            provider=OPEN_METEO_PROVIDER,
            cache_key=cache_key,
            payload_json=stored_payload,
            expires_at=datetime.now(UTC) + timedelta(days=ARCHIVE_CACHE_TTL_DAYS),
        )
        return stored_payload

    def _fetch_land_summary(self, *, latitude: float, longitude: float, forecast_hour: datetime) -> dict:
        cache_key = f"forecast:{latitude:.2f}:{longitude:.2f}:{forecast_hour.isoformat()}"
        cached = self.cache_repository.get_valid(provider=OPEN_METEO_PROVIDER, cache_key=cache_key)
        if cached is not None:
            return {**cached.payload_json, "cached": True}

        params = urlencode(
            {
                "latitude": latitude,
                "longitude": longitude,
                "hourly": ",".join(
                    [
                        "temperature_2m",
                        "precipitation_probability",
                        "rain",
                        "snowfall",
                        "wind_speed_10m",
                        "wind_gusts_10m",
                    ]
                ),
                "wind_speed_unit": "kmh",
                "winddirection_unit": "deg",
                "timezone": "auto",
                "forecast_days": 3,
            }
        )
        payload = _load_json(f"{OPEN_METEO_FORECAST_URL}?{params}")
        summary = _extract_hourly_summary(payload, forecast_hour)
        stored_payload = {
            "forecast_time": summary["forecast_time"],
            "temperature_c": summary["temperature_c"],
            "wind_speed_kmh": summary["wind_speed_kmh"],
            "wind_gusts_kmh": summary["wind_gusts_kmh"],
            "wind_direction_deg": summary["wind_direction_deg"],
            "precipitation_probability": summary["precipitation_probability"],
            "rain_mm": summary["rain_mm"],
            "snowfall_cm": summary["snowfall_cm"],
            "ice_risk": summary["ice_risk"],
        }
        self.cache_repository.save(
            provider=OPEN_METEO_PROVIDER,
            cache_key=cache_key,
            payload_json=stored_payload,
            expires_at=datetime.now(UTC) + timedelta(hours=CACHE_TTL_HOURS),
        )
        return {**stored_payload, "cached": False}

    def _fetch_marine_summary(self, *, latitude: float, longitude: float, forecast_hour: datetime) -> dict:
        cache_key = f"marine:{latitude:.2f}:{longitude:.2f}:{forecast_hour.isoformat()}"
        cached = self.cache_repository.get_valid(provider=OPEN_METEO_PROVIDER, cache_key=cache_key)
        if cached is not None:
            return {**cached.payload_json, "cached": True}

        params = urlencode(
            {
                "latitude": latitude,
                "longitude": longitude,
                "hourly": ",".join(["wave_height", "wave_period", "sea_surface_temperature"]),
                "timezone": "auto",
                "forecast_days": 3,
            }
        )
        payload = _load_json(f"{OPEN_METEO_MARINE_URL}?{params}")
        summary = _extract_marine_summary(payload, forecast_hour)
        stored_payload = {
            "sea_surface_temperature_c": summary["sea_surface_temperature_c"],
            "wave_height_m": summary["wave_height_m"],
            "wave_period_s": summary["wave_period_s"],
            "wave_direction_deg": summary["wave_direction_deg"],
        }
        self.cache_repository.save(
            provider=OPEN_METEO_PROVIDER,
            cache_key=cache_key,
            payload_json=stored_payload,
            expires_at=datetime.now(UTC) + timedelta(hours=CACHE_TTL_HOURS),
        )
        return {**stored_payload, "cached": False}


def _load_json(url: str) -> dict:
    request = Request(
        url,
        headers={
            "User-Agent": "AltviaPlanner/0.1 (planner weather integration)",
            "Accept": "application/json",
        },
    )
    with urlopen(request, timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))


def _hour_bucket(value: datetime | None) -> datetime:
    source = value.astimezone(UTC) if value is not None else datetime.now(UTC)
    return source.replace(minute=0, second=0, microsecond=0)


def _extract_hourly_summary(payload: dict, forecast_hour: datetime) -> dict:
    hourly = payload.get("hourly", {})
    times = hourly.get("time", [])
    target_index = _closest_time_index(times, forecast_hour)
    temperature_c = _hourly_value(hourly, "temperature_2m", target_index)
    rain_mm = _hourly_value(hourly, "rain", target_index)
    snowfall_cm = _hourly_value(hourly, "snowfall", target_index)
    precipitation_probability = _hourly_value(hourly, "precipitation_probability", target_index)

    return {
        "forecast_time": times[target_index] if target_index is not None and target_index < len(times) else None,
        "temperature_c": temperature_c,
        "wind_speed_kmh": _hourly_value(hourly, "wind_speed_10m", target_index),
        "wind_gusts_kmh": _hourly_value(hourly, "wind_gusts_10m", target_index),
        "wind_direction_deg": _hourly_value(hourly, "winddirection_10m", target_index) or _hourly_value(hourly, "wind_direction_10m", target_index),
        "precipitation_probability": precipitation_probability,
        "rain_mm": rain_mm,
        "snowfall_cm": snowfall_cm,
        "ice_risk": bool((temperature_c is not None and temperature_c <= 0) and ((rain_mm or 0) > 0 or (snowfall_cm or 0) > 0)),
    }


def _extract_marine_summary(payload: dict, forecast_hour: datetime) -> dict:
    hourly = payload.get("hourly", {})
    times = hourly.get("time", [])
    target_index = _closest_time_index(times, forecast_hour)
    return {
        "sea_surface_temperature_c": _hourly_value(hourly, "sea_surface_temperature", target_index),
        "wave_height_m": _hourly_value(hourly, "wave_height", target_index),
        "wave_period_s": _hourly_value(hourly, "wave_period", target_index),
        "wave_direction_deg": _hourly_value(hourly, "wave_direction", target_index),
    }


def _closest_time_index(times: list[str], forecast_hour: datetime) -> int | None:
    if not times:
        return None

    def parse_time(value: str) -> datetime:
        return datetime.fromisoformat(value).astimezone(UTC) if "T" in value else datetime.fromisoformat(f"{value}T00:00:00+00:00")

    target = forecast_hour.astimezone(UTC)
    indexed_times = [(index, abs((parse_time(value) - target).total_seconds())) for index, value in enumerate(times)]
    return min(indexed_times, key=lambda item: item[1])[0]


def _hourly_value(hourly: dict, field: str, index: int | None) -> float | None:
    if index is None:
        return None
    values = hourly.get(field, [])
    if index >= len(values):
        return None
    value = values[index]
    return float(value) if value is not None else None
