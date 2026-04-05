from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.weather_cache import WeatherCache


class WeatherCacheRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_valid(self, *, provider: str, cache_key: str) -> WeatherCache | None:
        return (
            self.db.query(WeatherCache)
            .filter(
                WeatherCache.provider == provider,
                WeatherCache.cache_key == cache_key,
                WeatherCache.expires_at > datetime.now(timezone.utc),
            )
            .one_or_none()
        )

    def save(
        self,
        *,
        provider: str,
        cache_key: str,
        payload_json: dict,
        expires_at: datetime,
    ) -> WeatherCache:
        existing = (
            self.db.query(WeatherCache)
            .filter(WeatherCache.provider == provider, WeatherCache.cache_key == cache_key)
            .one_or_none()
        )
        if existing is None:
            existing = WeatherCache(
                provider=provider,
                cache_key=cache_key,
                payload_json=payload_json,
                expires_at=expires_at,
            )
        else:
            existing.payload_json = payload_json
            existing.expires_at = expires_at

        self.db.add(existing)
        self.db.commit()
        self.db.refresh(existing)
        return existing

    def delete_by_key_prefix(self, *, provider: str, prefix: str) -> int:
        count = (
            self.db.query(WeatherCache)
            .filter(
                WeatherCache.provider == provider,
                WeatherCache.cache_key.like(f"{prefix}%"),
            )
            .delete(synchronize_session="fetch")
        )
        self.db.commit()
        return count
