import uuid
from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import JSON, DateTime, Float, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Activity(Base):
    __tablename__ = "activities"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source: Mapped[str] = mapped_column(String(50), default="apple_health")
    activity_type: Mapped[str] = mapped_column(String(50))
    name: Mapped[str] = mapped_column(String(255), default="")
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    distance_meters: Mapped[float | None] = mapped_column(Float, nullable=True)
    elevation_gain_meters: Mapped[float | None] = mapped_column(Float, nullable=True)
    active_energy_kcal: Mapped[float | None] = mapped_column(Float, nullable=True)
    basal_energy_kcal: Mapped[float | None] = mapped_column(Float, nullable=True)
    average_heart_rate_bpm: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_heart_rate_bpm: Mapped[float | None] = mapped_column(Float, nullable=True)
    recovery_heart_rate_bpm: Mapped[float | None] = mapped_column(Float, nullable=True)
    min_elevation_meters: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_elevation_meters: Mapped[float | None] = mapped_column(Float, nullable=True)
    min_pace_seconds_per_mile: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_pace_seconds_per_mile: Mapped[float | None] = mapped_column(Float, nullable=True)
    start_latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    start_longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    end_latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    end_longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    workout_metadata_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    route_points_json: Mapped[list | None] = mapped_column(JSON, nullable=True)
    weather_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    effort_score_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    workout_cluster_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    predicted_intensity_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    route_geometry = mapped_column(Geometry(geometry_type="LINESTRING", srid=4326), nullable=True)
