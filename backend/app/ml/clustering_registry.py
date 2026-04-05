import mlflow

from app.ml.tracking import configure_mlflow

EXPERIMENT_NAME = "workout-clustering"


def log_clustering_run(
    *,
    types_clustered: int,
    types_skipped: int,
    total_activities: int,
    clustered_activities: int,
    label_distribution: dict[str, int],
) -> None:
    configure_mlflow()
    mlflow.set_experiment(EXPERIMENT_NAME)

    with mlflow.start_run(run_name="clustering-batch"):
        mlflow.log_metrics({
            "types_clustered": types_clustered,
            "types_skipped": types_skipped,
            "total_activities": total_activities,
            "clustered_activities": clustered_activities,
        })
        for label, count in label_distribution.items():
            mlflow.log_metric(f"label_{label.lower()}", count)
