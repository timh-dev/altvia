import math

import mlflow
import mlflow.pyfunc
import numpy as np
import pandas as pd
from mlflow.models.signature import infer_signature

from app.ml.tracking import configure_mlflow

MODEL_NAME = "effort-score"
EXPERIMENT_NAME = "effort-score-enrichment"


class EffortScoreV1Model(mlflow.pyfunc.PythonModel):
    """Wraps the V1 TRIMP formula as an MLflow pyfunc model."""

    ELEVATION_WEIGHT = 0.3
    GENDER_EXPONENT = 1.92
    GENDER_COEFFICIENT = 0.64
    TRIMP_UPPER_BOUND = 300.0

    def predict(self, context, model_input: pd.DataFrame) -> pd.DataFrame:
        avg_hr = model_input["avg_hr"].values
        max_hr = model_input["max_hr"].values
        duration_seconds = model_input["duration_seconds"].values
        elevation_gain = model_input["elevation_gain_meters"].fillna(0.0).values

        duration_min = duration_seconds / 60.0
        hr_ratio = np.clip(avg_hr / np.where(max_hr > 0, max_hr, 1.0), 0.0, 1.0)

        trimp = duration_min * hr_ratio * self.GENDER_COEFFICIENT * np.exp(self.GENDER_EXPONENT * hr_ratio)
        elev_factor = 1.0 + (elevation_gain / 1000.0) * self.ELEVATION_WEIGHT
        adjusted_trimp = trimp * elev_factor
        effort_score = np.clip(adjusted_trimp / self.TRIMP_UPPER_BOUND, 0.0, 1.0) * 100.0

        return pd.DataFrame({"effort_score": np.round(effort_score, 1)})


def register_v1_model() -> str:
    configure_mlflow()
    mlflow.set_experiment(EXPERIMENT_NAME)

    sample_input = pd.DataFrame({
        "avg_hr": [150.0],
        "max_hr": [190.0],
        "duration_seconds": [3600.0],
        "elevation_gain_meters": [500.0],
    })

    model = EffortScoreV1Model()
    sample_output = model.predict(None, sample_input)
    signature = infer_signature(sample_input, sample_output)

    with mlflow.start_run(run_name="register-v1-model") as run:
        mlflow.log_params({
            "formula_version": "v1",
            "gender_exponent": 1.92,
            "gender_coefficient": 0.64,
            "elevation_weight": 0.3,
            "trimp_upper_bound": 300.0,
        })

        model_info = mlflow.pyfunc.log_model(
            artifact_path="effort-score-model",
            python_model=model,
            signature=signature,
        )

        mlflow.register_model(model_info.model_uri, MODEL_NAME)

    return model_info.model_uri


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
