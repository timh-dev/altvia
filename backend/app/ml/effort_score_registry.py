import math

import mlflow

from app.ml.tracking import configure_mlflow

EXPERIMENT_NAME = "effort-score-enrichment"


def log_enrichment_run(
    *,
    total: int,
    enriched: int,
    skipped: int,
    avg_score: float,
    config_max_hr_count: int,
    activity_max_hr_count: int,
) -> None:
    configure_mlflow()
    mlflow.set_experiment(EXPERIMENT_NAME)

    with mlflow.start_run(run_name="enrichment-batch"):
        mlflow.log_metrics({
            "total_eligible": total,
            "enriched": enriched,
            "skipped": skipped,
            "avg_effort_score": round(avg_score, 2),
            "max_hr_source_config": config_max_hr_count,
            "max_hr_source_activity": activity_max_hr_count,
        })
