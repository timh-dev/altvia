import uuid
from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import JSON, DateTime, Float, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PlannedWorkout(Base):
    __tablename__ = "planned_workouts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255))
    activity_type: Mapped[str] = mapped_column(String(50))
    planned_for: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    distance_meters: Mapped[float] = mapped_column(Float, default=0.0)
    route_points_json: Mapped[list] = mapped_column(JSON, default=list)
    weather_context_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
    route_geometry = mapped_column(Geometry(geometry_type="LINESTRING", srid=4326), nullable=False)
