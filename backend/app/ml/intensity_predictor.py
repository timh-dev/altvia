import math
from dataclasses import dataclass
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score

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

# TRIMP constants (same as effort_score_service.py)
ELEVATION_WEIGHT = 0.3
GENDER_EXPONENT = 1.92
GENDER_COEFFICIENT = 0.64
TRIMP_UPPER_BOUND = 300.0

BACKEND_DIR = Path(__file__).resolve().parents[2]
MODEL_PATH = BACKEND_DIR / "data" / "intensity_model.joblib"
_CACHED_BUNDLE = None
_CACHED_MTIME_NS: int | None = None


def _compute_effort_score(
    avg_hr: float,
    max_hr: float,
    duration_seconds: float,
    elevation_gain: float,
) -> float:
    """Compute effort score using the same TRIMP formula as effort_score_service."""
    avg_hr = min(avg_hr, max_hr)
    hr_ratio = avg_hr / max_hr
    duration_min = duration_seconds / 60.0
    trimp = duration_min * hr_ratio * GENDER_COEFFICIENT * math.exp(GENDER_EXPONENT * hr_ratio)
    elevation_factor = 1.0 + (elevation_gain / 1000.0) * ELEVATION_WEIGHT
    adjusted_trimp = trimp * elevation_factor
    return max(0.0, min(adjusted_trimp / TRIMP_UPPER_BOUND, 1.0)) * 100.0


def load_strava_csv(path: Path) -> pd.DataFrame:
    """Load and normalize a Strava CSV dataset into our feature schema."""
    if not path.exists():
        return pd.DataFrame()

    # Auto-detect delimiter (common Strava exports use ; or ,)
    with open(path) as f:
        first_line = f.readline()
    sep = ";" if ";" in first_line else ","
    df = pd.read_csv(path, sep=sep)

    df.columns = df.columns.str.strip().str.lower().str.replace(" ", "_")

    # Map common Strava column names (including unit suffixes like _(m), _(s), _(bpm))
    col_map = {}
    for col in df.columns:
        if "elapsed" in col and "time" in col:
            col_map[col] = "elapsed_time"
        elif col == "moving_time":
            col_map[col] = "moving_time"
        elif "distance" in col:
            col_map[col] = "distance"
        elif "elevation" in col and "gain" in col or col == "elev_gain" or col == "total_elevation_gain":
            col_map[col] = "elevation_gain"
        elif "average" in col and "heart" in col or col in ("avg_hr", "average_heartrate"):
            col_map[col] = "avg_hr"
        elif "max" in col and "heart" in col or col in ("max_hr", "max_heartrate"):
            col_map[col] = "max_hr"
        elif col in ("type", "activity_type"):
            col_map[col] = "activity_type"
    df = df.rename(columns=col_map)

    # Use moving_time if elapsed_time not available
    if "elapsed_time" not in df.columns and "moving_time" in df.columns:
        df["elapsed_time"] = df["moving_time"]

    required = ["elapsed_time", "distance", "avg_hr"]
    for col in required:
        if col not in df.columns:
            return pd.DataFrame()

    # Convert to numeric, coercing errors
    for col in ["elapsed_time", "distance", "elevation_gain", "avg_hr", "max_hr"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    # Estimate max_hr from avg_hr when column is missing (avg_hr / 0.85, capped at 220)
    if "max_hr" not in df.columns:
        df["max_hr"] = (df["avg_hr"] / 0.85).clip(upper=220)

    # Filter valid rows
    df = df[
        (df["elapsed_time"] > 0)
        & (df["distance"] > 0)
        & (df["avg_hr"] > 0)
        & (df["max_hr"] > 0)
    ].copy()

    if df.empty:
        return df

    elev = df["elevation_gain"].fillna(0.0) if "elevation_gain" in df.columns else pd.Series(0.0, index=df.index)

    # Compute effort_score using TRIMP formula
    df["effort_score"] = df.apply(
        lambda row: _compute_effort_score(row["avg_hr"], row["max_hr"], row["elapsed_time"], elev[row.name]),
        axis=1,
    )

    # Extract time features from timestamp column if present
    hour_of_day = pd.Series(np.nan, index=df.index)
    month_col = pd.Series(np.nan, index=df.index)
    if "timestamp" in df.columns:
        ts = pd.to_datetime(df["timestamp"], errors="coerce", dayfirst=True)
        hour_of_day = ts.dt.hour.astype(float)
        month_col = ts.dt.month.astype(float)

    # Build standardized output
    activity_type_col = df.get("activity_type", pd.Series("running", index=df.index))
    result = pd.DataFrame({
        "duration_seconds": df["elapsed_time"],
        "distance_meters": df["distance"],
        "elevation_gain_meters": elev,
        "avg_pace": df["elapsed_time"] / df["distance"],
        "avg_hr": df["avg_hr"],
        "hour_of_day": hour_of_day,
        "month": month_col,
        "temperature_c": np.nan,
        "wind_speed_kmh": np.nan,
        "rain_mm": np.nan,
        "snowfall_cm": np.nan,
        "activity_type_encoded": activity_type_col.str.lower().map(ACTIVITY_TYPE_MAP).fillna(0).astype(int),
        "effort_score": df["effort_score"],
    })

    return result.reset_index(drop=True)
def prepare_personal_data(activities: list[Activity]) -> pd.DataFrame:
    """Extract features from personal activities that have effort_score_json."""
    rows = []
    for a in activities:
        es = a.effort_score_json
        if es is None:
            continue

        duration = a.duration_seconds or 0.0
        distance = a.distance_meters or 0.0
        if duration <= 0 or distance <= 0:
            continue

        weather = a.weather_json or {}
        hour = a.started_at.hour if a.started_at else np.nan
        month = a.started_at.month if a.started_at else np.nan

        rows.append({
            "duration_seconds": duration,
            "distance_meters": distance,
            "elevation_gain_meters": a.elevation_gain_meters or 0.0,
            "avg_pace": duration / distance,
            "avg_hr": a.average_heart_rate_bpm if a.average_heart_rate_bpm else np.nan,
            "hour_of_day": hour,
            "month": month,
            "temperature_c": weather.get("temperature_c", np.nan),
            "wind_speed_kmh": weather.get("wind_speed_kmh", np.nan),
            "rain_mm": weather.get("rain_mm", np.nan),
            "snowfall_cm": weather.get("snowfall_cm", np.nan),
            "activity_type_encoded": ACTIVITY_TYPE_MAP.get(a.activity_type, 0),
            "effort_score": es.get("effort_score", 0.0) if isinstance(es, dict) else es.effort_score,
        })

    return pd.DataFrame(rows) if rows else pd.DataFrame()


def build_feature_matrix(df: pd.DataFrame) -> tuple[np.ndarray, np.ndarray, list[str]]:
    """Extract X (features) and y (target) from a combined DataFrame."""
    X = df[FEATURE_NAMES].values.astype(np.float64)
    y = df["effort_score"].values.astype(np.float64)
    return X, y, FEATURE_NAMES


def train_models(
    X: np.ndarray,
    y: np.ndarray,
) -> tuple[HistGradientBoostingRegressor, HistGradientBoostingRegressor, HistGradientBoostingRegressor, dict]:
    """Train point-estimate and quantile models. Returns (model_mean, model_q10, model_q90, metrics)."""
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    common_params = dict(max_iter=200, learning_rate=0.05, max_depth=8, min_samples_leaf=20, random_state=42)

    model_mean = HistGradientBoostingRegressor(**common_params)
    model_q10 = HistGradientBoostingRegressor(loss="quantile", quantile=0.1, **common_params)
    model_q90 = HistGradientBoostingRegressor(loss="quantile", quantile=0.9, **common_params)

    model_mean.fit(X_train, y_train)
    model_q10.fit(X_train, y_train)
    model_q90.fit(X_train, y_train)

    y_pred = model_mean.predict(X_test)
    metrics = {
        "rmse": float(np.sqrt(mean_squared_error(y_test, y_pred))),
        "mae": float(mean_absolute_error(y_test, y_pred)),
        "r2": float(r2_score(y_test, y_pred)),
        "n_train": len(X_train),
        "n_test": len(X_test),
    }

    return model_mean, model_q10, model_q90, metrics


@dataclass
class IntensityModelBundle:
    """Holds 3 HistGBR models (mean, q10, q90) for prediction."""

    model_mean: HistGradientBoostingRegressor
    model_q10: HistGradientBoostingRegressor
    model_q90: HistGradientBoostingRegressor

    def predict(self, input_df: pd.DataFrame) -> pd.DataFrame:
        X = input_df[FEATURE_NAMES].values.astype(np.float64)
        pred_mean = np.clip(self.model_mean.predict(X), 0, 100)
        pred_low = np.clip(self.model_q10.predict(X), 0, 100)
        pred_high = np.clip(self.model_q90.predict(X), 0, 100)

        return pd.DataFrame({
            "predicted_effort_score": np.round(pred_mean, 1),
            "confidence_low": np.round(pred_low, 1),
            "confidence_high": np.round(pred_high, 1),
        })


def save_model_bundle(bundle: IntensityModelBundle, path: Path | None = None) -> Path:
    """Persist model bundle to disk via joblib."""
    path = path or MODEL_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(bundle, path)
    return path


def load_model_bundle(path: Path | None = None) -> IntensityModelBundle | None:
    """Load persisted model bundle. Returns None if not found."""
    global _CACHED_BUNDLE, _CACHED_MTIME_NS

    path = path or MODEL_PATH
    if not path.exists():
        _CACHED_BUNDLE = None
        _CACHED_MTIME_NS = None
        return None

    mtime_ns = path.stat().st_mtime_ns
    if _CACHED_BUNDLE is not None and _CACHED_MTIME_NS == mtime_ns:
        return _CACHED_BUNDLE

    _CACHED_BUNDLE = joblib.load(path)
    _CACHED_MTIME_NS = mtime_ns
    return _CACHED_BUNDLE
