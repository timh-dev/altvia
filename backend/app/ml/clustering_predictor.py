from dataclasses import dataclass, field
from pathlib import Path

import joblib
import numpy as np
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler

BACKEND_DIR = Path(__file__).resolve().parents[2]
MODEL_PATH = BACKEND_DIR / "data" / "clustering_model.joblib"
_CACHED_BUNDLE = None
_CACHED_MTIME_NS: int | None = None


@dataclass
class ActivityTypeClusterModel:
    kmeans: KMeans
    scaler: StandardScaler
    label_map: list[str]
    feature_names: list[str]
    n_activities_in_group: int
    hr_median: float


@dataclass
class ClusteringModelBundle:
    models: dict[str, ActivityTypeClusterModel] = field(default_factory=dict)
    version: str = "v2"


def save_model_bundle(bundle: ClusteringModelBundle, path: Path | None = None) -> Path:
    path = path or MODEL_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(bundle, path)
    return path


def load_model_bundle(path: Path | None = None) -> ClusteringModelBundle | None:
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
