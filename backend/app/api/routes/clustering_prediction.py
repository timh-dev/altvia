from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.clustering_prediction_service import predict_cluster

router = APIRouter()


class ClusterPredictionRequest(BaseModel):
    activity_type: str
    duration_seconds: float
    distance_meters: float
    elevation_gain_meters: float = 0.0


class ClusterPredictionResponse(BaseModel):
    cluster_label: str
    cluster_id: int
    activity_type_group: str
    n_activities_in_group: int
    n_clusters: int
    features_used: list[str]
    model_version: str


@router.post("/predict", response_model=ClusterPredictionResponse)
def predict_workout_cluster(request: ClusterPredictionRequest):
    result = predict_cluster(
        activity_type=request.activity_type,
        duration_seconds=request.duration_seconds,
        distance_meters=request.distance_meters,
        elevation_gain_meters=request.elevation_gain_meters,
    )

    if result is None:
        raise HTTPException(
            status_code=503,
            detail="Clustering model not available. Run the clustering enrichment first.",
        )

    return ClusterPredictionResponse(
        cluster_label=result.cluster_label,
        cluster_id=result.cluster_id,
        activity_type_group=result.activity_type_group,
        n_activities_in_group=result.n_activities_in_group,
        n_clusters=result.n_clusters,
        features_used=result.features_used,
        model_version=result.model_version,
    )
