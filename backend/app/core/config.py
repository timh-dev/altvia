import json
from pathlib import Path
from typing import Any

from pydantic import Field
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_ROOT = BACKEND_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    environment: str = Field(default="development", alias="ALTVIA_ENV")
    database_url: str = Field(
        default="postgresql+psycopg://altvia:altvia@postgres:5432/altvia",
        alias="DATABASE_URL",
    )
    mlflow_tracking_uri: str = Field(default="http://mlflow:5000", alias="MLFLOW_TRACKING_URI")
    valhalla_base_url: str = Field(
        default="https://valhalla1.openstreetmap.de",
        alias="VALHALLA_BASE_URL",
    )
    osrm_base_url: str = Field(default="https://router.project-osrm.org", alias="OSRM_BASE_URL")
    user_max_heart_rate: float = Field(default=0.0, alias="USER_MAX_HEART_RATE")
    import_storage_dir: Path = Field(default=BACKEND_DIR / "data" / "imports", alias="IMPORT_STORAGE_DIR")
    apple_health_export_dir: Path = Field(
        default=REPO_ROOT / "apple_health_export",
        alias="APPLE_HEALTH_EXPORT_DIR",
    )
    strava_data_path: Path = Field(
        default=BACKEND_DIR / "data" / "strava.csv",
        alias="STRAVA_DATA_PATH",
    )
    cors_origins: list[str] = Field(
        default=[
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ],
        alias="CORS_ORIGINS",
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: Any) -> Any:
        if isinstance(value, str):
            trimmed = value.strip()
            if not trimmed:
                return []
            if trimmed.startswith("["):
                return json.loads(trimmed)
            return [origin.strip() for origin in trimmed.split(",") if origin.strip()]
        return value


settings = Settings()
