from collections import defaultdict
from dataclasses import dataclass, field
from uuid import UUID

import numpy as np
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler

from app.models.activity import Activity

MIN_ACTIVITIES_PER_TYPE = 8
DEFAULT_N_CLUSTERS = 4
CLUSTER_LABELS = ["Easy", "Moderate", "Hard", "Extreme"]

FEATURE_WEIGHTS = {
    "duration_seconds": 0.2,
    "distance_meters": 0.2,
    "avg_pace": -0.3,
    "average_heart_rate_bpm": 0.3,
    "elevation_gain_meters": 0.1,
}


@dataclass
class WorkoutClusterResult:
    cluster_label: str
    cluster_id: int
    activity_type_group: str
    features_used: list[str]
    n_clusters: int
    n_activities_in_group: int
    version: str = "v1"

    def to_dict(self) -> dict:
        return {
            "cluster_label": self.cluster_label,
            "cluster_id": self.cluster_id,
            "activity_type_group": self.activity_type_group,
            "features_used": self.features_used,
            "n_clusters": self.n_clusters,
            "n_activities_in_group": self.n_activities_in_group,
            "version": self.version,
        }


def _extract_features(activities: list[Activity]) -> tuple[np.ndarray, list[str]]:
    feature_names = ["duration_seconds", "distance_meters", "elevation_gain_meters", "avg_pace"]

    hr_values = [a.average_heart_rate_bpm for a in activities if a.average_heart_rate_bpm is not None]
    use_hr = len(hr_values) >= len(activities) * 0.5
    hr_median = float(np.median(hr_values)) if hr_values else 0.0

    if use_hr:
        feature_names.append("average_heart_rate_bpm")

    rows: list[list[float]] = []
    for a in activities:
        duration = a.duration_seconds or 0.0
        distance = a.distance_meters or 0.0
        elevation = a.elevation_gain_meters or 0.0
        avg_pace = duration / distance if distance > 0 else 0.0

        row = [duration, distance, elevation, avg_pace]

        if use_hr:
            row.append(a.average_heart_rate_bpm if a.average_heart_rate_bpm is not None else hr_median)

        rows.append(row)

    return np.array(rows, dtype=np.float64), feature_names


def _assign_labels(kmeans: KMeans, feature_names: list[str]) -> list[str]:
    centroids = kmeans.cluster_centers_
    k = centroids.shape[0]

    scores: list[float] = []
    for centroid in centroids:
        score = 0.0
        for i, name in enumerate(feature_names):
            weight = FEATURE_WEIGHTS.get(name, 0.0)
            score += weight * centroid[i]
        scores.append(score)

    sorted_indices = sorted(range(k), key=lambda i: scores[i])

    if k == 2:
        label_set = ["Easy", "Hard"]
    elif k == 3:
        label_set = ["Easy", "Moderate", "Hard"]
    else:
        label_set = CLUSTER_LABELS[:k]

    label_map = [""] * k
    for rank, cluster_idx in enumerate(sorted_indices):
        label_map[cluster_idx] = label_set[rank]

    return label_map


def cluster_activities(activities: list[Activity]) -> dict[UUID, WorkoutClusterResult]:
    groups: dict[str, list[Activity]] = defaultdict(list)
    for a in activities:
        if (a.duration_seconds is not None and a.duration_seconds > 0
                and a.distance_meters is not None and a.distance_meters > 0):
            groups[a.activity_type].append(a)

    results: dict[UUID, WorkoutClusterResult] = {}

    for activity_type, group in groups.items():
        if len(group) < MIN_ACTIVITIES_PER_TYPE:
            continue

        features, feature_names = _extract_features(group)

        scaler = StandardScaler()
        scaled = scaler.fit_transform(features)

        k = min(DEFAULT_N_CLUSTERS, len(group))
        kmeans = KMeans(n_clusters=k, random_state=42, n_init=10)
        labels = kmeans.fit_predict(scaled)

        label_map = _assign_labels(kmeans, feature_names)

        for i, a in enumerate(group):
            cluster_id = int(labels[i])
            results[a.id] = WorkoutClusterResult(
                cluster_label=label_map[cluster_id],
                cluster_id=cluster_id,
                activity_type_group=activity_type,
                features_used=feature_names,
                n_clusters=k,
                n_activities_in_group=len(group),
            )

    return results
