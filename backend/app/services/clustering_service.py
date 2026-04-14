import math

from collections import defaultdict
from dataclasses import dataclass, field
from uuid import UUID

import numpy as np
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler

from app.ml.clustering_predictor import ActivityTypeClusterModel, ClusteringModelBundle
from app.models.activity import Activity

MIN_ACTIVITIES_PER_TYPE = 8
DEFAULT_N_CLUSTERS = 6
CLUSTER_LABELS = ["Recovery", "Easy", "Moderate", "Hard", "Intense", "Extreme"]

FEATURE_WEIGHTS = {
    "duration_seconds": 0.1,
    "distance_meters": 0.1,
    "avg_pace": -0.2,
    "average_heart_rate_bpm": 0.5,
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
    version: str = "v2"

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


def _extract_features(activities: list[Activity]) -> tuple[np.ndarray, list[str], float]:
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

    return np.array(rows, dtype=np.float64), feature_names, hr_median


def _compute_trimp(activity: Activity) -> float | None:
    """Compute TRIMP directly from activity fields, independent of stored effort_score_json."""
    avg_hr = activity.average_heart_rate_bpm
    max_hr = activity.max_heart_rate_bpm
    duration_s = activity.duration_seconds
    if not avg_hr or not max_hr or not duration_s or max_hr <= 0:
        return None
    avg_hr = min(avg_hr, max_hr)
    hr_ratio = avg_hr / max_hr
    trimp = (duration_s / 60.0) * hr_ratio * 0.64 * math.exp(1.92 * hr_ratio)
    elevation = activity.elevation_gain_meters or 0.0
    return trimp * (1.0 + (elevation / 1000.0) * 0.3)


def _cluster_effort_medians(activities: list[Activity], labels: np.ndarray, k: int) -> list[float | None]:
    """Return median TRIMP per cluster, or None if a cluster lacks coverage."""
    buckets: dict[int, list[float]] = {i: [] for i in range(k)}
    for activity, cluster_id in zip(activities, labels):
        trimp = _compute_trimp(activity)
        if trimp is not None:
            buckets[int(cluster_id)].append(trimp)
    return [float(np.median(v)) if v else None for v in buckets.values()]


def _assign_labels(kmeans: KMeans, feature_names: list[str], cluster_effort_medians: list[float | None]) -> list[str]:
    k = kmeans.cluster_centers_.shape[0]

    # Prefer effort-score-based ranking if we have coverage for most clusters
    valid = [(i, m) for i, m in enumerate(cluster_effort_medians) if m is not None]
    if len(valid) >= k * 0.75:
        sorted_indices = [i for i, _ in sorted(valid, key=lambda x: x[1])]
        # Any clusters missing effort scores get appended at the end (treated as highest intensity)
        missing = [i for i in range(k) if i not in [x[0] for x in valid]]
        sorted_indices += missing
    else:
        # Fallback: rank by weighted centroid score
        centroids = kmeans.cluster_centers_
        scores = [
            sum(FEATURE_WEIGHTS.get(name, 0.0) * centroids[i][j] for j, name in enumerate(feature_names))
            for i in range(k)
        ]
        sorted_indices = sorted(range(k), key=lambda i: scores[i])

    if k == 2:
        label_set = ["Easy", "Hard"]
    elif k == 3:
        label_set = ["Easy", "Moderate", "Hard"]
    elif k == 4:
        label_set = ["Easy", "Moderate", "Hard", "Extreme"]
    elif k == 5:
        label_set = ["Recovery", "Easy", "Moderate", "Hard", "Extreme"]
    else:
        label_set = CLUSTER_LABELS[:k]

    label_map = [""] * k
    for rank, cluster_idx in enumerate(sorted_indices):
        label_map[cluster_idx] = label_set[rank]

    return label_map


def cluster_activities(activities: list[Activity]) -> tuple[dict[UUID, WorkoutClusterResult], ClusteringModelBundle]:
    groups: dict[str, list[Activity]] = defaultdict(list)
    for a in activities:
        if (a.duration_seconds is not None and a.duration_seconds > 0
                and a.distance_meters is not None and a.distance_meters > 0):
            groups[a.activity_type].append(a)

    results: dict[UUID, WorkoutClusterResult] = {}
    bundle = ClusteringModelBundle()

    for activity_type, group in groups.items():
        if len(group) < MIN_ACTIVITIES_PER_TYPE:
            continue

        features, feature_names, hr_median = _extract_features(group)

        scaler = StandardScaler()
        scaled = scaler.fit_transform(features)

        k = min(DEFAULT_N_CLUSTERS, len(group))
        kmeans = KMeans(n_clusters=k, random_state=42, n_init=10)
        labels = kmeans.fit_predict(scaled)

        label_map = _assign_labels(kmeans, feature_names, _cluster_effort_medians(group, labels, k))

        bundle.models[activity_type] = ActivityTypeClusterModel(
            kmeans=kmeans,
            scaler=scaler,
            label_map=label_map,
            feature_names=feature_names,
            n_activities_in_group=len(group),
            hr_median=hr_median,
        )

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

    return results, bundle
