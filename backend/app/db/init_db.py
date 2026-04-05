from sqlalchemy import text

from app.db.base import Base
from app.db.session import engine
from app.models.activity import Activity
from app.models.import_job import ImportJob
from app.models.planned_workout import PlannedWorkout
from app.models.weather_cache import WeatherCache


def initialize_database() -> None:
    # Importing the models ensures SQLAlchemy metadata is populated before table creation.
    _ = (Activity, ImportJob, PlannedWorkout, WeatherCache)

    with engine.begin() as connection:
        connection.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))

    Base.metadata.create_all(bind=engine)

    migration_statements = [
        "ALTER TABLE IF EXISTS import_jobs ADD COLUMN IF NOT EXISTS source_file_path TEXT",
        "ALTER TABLE IF EXISTS import_jobs ADD COLUMN IF NOT EXISTS total_records INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE IF EXISTS import_jobs ADD COLUMN IF NOT EXISTS imported_records INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE IF EXISTS import_jobs ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE",
        "ALTER TABLE IF EXISTS activities ADD COLUMN IF NOT EXISTS average_heart_rate_bpm DOUBLE PRECISION",
        "ALTER TABLE IF EXISTS activities ADD COLUMN IF NOT EXISTS max_heart_rate_bpm DOUBLE PRECISION",
        "ALTER TABLE IF EXISTS activities ADD COLUMN IF NOT EXISTS recovery_heart_rate_bpm DOUBLE PRECISION",
        "ALTER TABLE IF EXISTS activities ADD COLUMN IF NOT EXISTS active_energy_kcal DOUBLE PRECISION",
        "ALTER TABLE IF EXISTS activities ADD COLUMN IF NOT EXISTS basal_energy_kcal DOUBLE PRECISION",
        "ALTER TABLE IF EXISTS activities ADD COLUMN IF NOT EXISTS min_elevation_meters DOUBLE PRECISION",
        "ALTER TABLE IF EXISTS activities ADD COLUMN IF NOT EXISTS max_elevation_meters DOUBLE PRECISION",
        "ALTER TABLE IF EXISTS activities ADD COLUMN IF NOT EXISTS min_pace_seconds_per_mile DOUBLE PRECISION",
        "ALTER TABLE IF EXISTS activities ADD COLUMN IF NOT EXISTS max_pace_seconds_per_mile DOUBLE PRECISION",
        "ALTER TABLE IF EXISTS activities ADD COLUMN IF NOT EXISTS start_latitude DOUBLE PRECISION",
        "ALTER TABLE IF EXISTS activities ADD COLUMN IF NOT EXISTS start_longitude DOUBLE PRECISION",
        "ALTER TABLE IF EXISTS activities ADD COLUMN IF NOT EXISTS end_latitude DOUBLE PRECISION",
        "ALTER TABLE IF EXISTS activities ADD COLUMN IF NOT EXISTS end_longitude DOUBLE PRECISION",
        "ALTER TABLE IF EXISTS activities ADD COLUMN IF NOT EXISTS workout_metadata_json JSONB",
        "ALTER TABLE IF EXISTS activities ADD COLUMN IF NOT EXISTS route_points_json JSONB",
        "ALTER TABLE IF EXISTS planned_workouts ADD COLUMN IF NOT EXISTS weather_context_json JSONB",
        "ALTER TABLE IF EXISTS weather_cache ADD COLUMN IF NOT EXISTS provider VARCHAR(50)",
        "ALTER TABLE IF EXISTS weather_cache ADD COLUMN IF NOT EXISTS cache_key VARCHAR(255)",
        "ALTER TABLE IF EXISTS weather_cache ADD COLUMN IF NOT EXISTS payload_json JSONB",
        "ALTER TABLE IF EXISTS weather_cache ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE",
        "ALTER TABLE IF EXISTS activities ADD COLUMN IF NOT EXISTS weather_json JSONB",
        "ALTER TABLE IF EXISTS activities ADD COLUMN IF NOT EXISTS effort_score_json JSONB",
        "ALTER TABLE IF EXISTS activities ADD COLUMN IF NOT EXISTS workout_cluster_json JSONB",
        "ALTER TABLE IF EXISTS activities ADD COLUMN IF NOT EXISTS predicted_intensity_json JSONB",
    ]

    with engine.begin() as connection:
        for statement in migration_statements:
            connection.execute(text(statement))
