from __future__ import annotations

from dataclasses import dataclass


@dataclass
class ClusterPredictionResult:
    cluster_label: str
    cluster_id: int
    activity_type_group: str
    n_activities_in_group: int
    n_clusters: int
    features_used: list[str]
    model_version: str

    def to_dict(self) -> dict:
        return {
            "cluster_label": self.cluster_label,
            "cluster_id": self.cluster_id,
            "activity_type_group": self.activity_type_group,
            "n_activities_in_group": self.n_activities_in_group,
            "n_clusters": self.n_clusters,
            "features_used": self.features_used,
            "model_version": self.model_version,
        }


def predict_cluster(
    *,
    activity_type: str,
    duration_seconds: float,
    distance_meters: float,
    elevation_gain_meters: float = 0.0,
) -> ClusterPredictionResult | None:
    import numpy as np

    from app.ml.clustering_predictor import load_model_bundle

    bundle = load_model_bundle()
    if bundle is None:
        return None

    type_model = bundle.models.get(activity_type)
    if type_model is None:
        return None

    if distance_meters <= 0 or duration_seconds <= 0:
        return None

    avg_pace = duration_seconds / distance_meters

    row = [duration_seconds, distance_meters, elevation_gain_meters, avg_pace]
    feature_names_used = list(type_model.feature_names)

    if "average_heart_rate_bpm" in type_model.feature_names:
        row.append(type_model.hr_median)

    features = np.array([row], dtype=np.float64)
    scaled = type_model.scaler.transform(features)
    cluster_id = int(type_model.kmeans.predict(scaled)[0])
    cluster_label = type_model.label_map[cluster_id]

    return ClusterPredictionResult(
        cluster_label=cluster_label,
        cluster_id=cluster_id,
        activity_type_group=activity_type,
        n_activities_in_group=type_model.n_activities_in_group,
        n_clusters=type_model.kmeans.n_clusters,
        features_used=feature_names_used,
        model_version=bundle.version,
    )
