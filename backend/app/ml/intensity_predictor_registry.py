import pandas as pd
from sqlalchemy.orm import Session

from app.core.config import settings
from app.ml.intensity_predictor import (
    FEATURE_NAMES,
    IntensityModelBundle,
    build_feature_matrix,
    load_strava_csv,
    prepare_personal_data,
    save_model_bundle,
    train_models,
)
from app.repositories.activity_repository import ActivityRepository

MODEL_NAME = "intensity-predictor"
EXPERIMENT_NAME = "intensity-prediction"


def train_and_register_model(db: Session) -> tuple[str, dict]:
    """Train on combined Strava + personal data, save to disk, optionally register in MLflow."""
    # Load external data
    strava_df = load_strava_csv(settings.strava_data_path)

    # Load personal data
    repo = ActivityRepository(db)
    activities = repo.list_activities_for_intensity_prediction()
    personal_df = prepare_personal_data(activities)

    # Combine
    frames = [df for df in [strava_df, personal_df] if not df.empty]
    if not frames:
        raise ValueError("No training data available — need Strava CSV or personal activities with effort scores")

    combined = pd.concat(frames, ignore_index=True)
    X, y, feature_names = build_feature_matrix(combined)

    # Count weather coverage
    weather_cols = ["temperature_c", "wind_speed_kmh", "rain_mm", "snowfall_cm"]
    weather_idx = [feature_names.index(c) for c in weather_cols]
    weather_present = sum(1 for i in range(len(X)) if not all(pd.isna(X[i, j]) for j in weather_idx))

    model_mean, model_q10, model_q90, metrics = train_models(X, y)
    metrics["n_total"] = len(X)
    metrics["n_strava"] = len(strava_df)
    metrics["n_personal"] = len(personal_df)
    metrics["weather_coverage"] = weather_present / len(X) if len(X) > 0 else 0.0

    bundle = IntensityModelBundle(model_mean, model_q10, model_q90)
    model_path = save_model_bundle(bundle)
    model_uri = str(model_path)

    # Optionally register in MLflow
    try:
        import mlflow
        import mlflow.pyfunc
        from mlflow.models.signature import infer_signature

        from app.ml.tracking import configure_mlflow

        class _MLflowBundle(mlflow.pyfunc.PythonModel):
            def __init__(self, b: IntensityModelBundle):
                self._bundle = b

            def predict(self, context, model_input: pd.DataFrame) -> pd.DataFrame:
                return self._bundle.predict(model_input)

        configure_mlflow()
        mlflow.set_experiment(EXPERIMENT_NAME)

        sample_input = pd.DataFrame([{name: 0.0 for name in FEATURE_NAMES}])
        sample_output = bundle.predict(sample_input)
        signature = infer_signature(sample_input, sample_output)

        with mlflow.start_run(run_name="train-intensity-model"):
            mlflow.log_params({
                "model_type": "HistGradientBoostingRegressor",
                "max_iter": 200,
                "learning_rate": 0.05,
                "max_depth": 8,
                "min_samples_leaf": 20,
                "n_features": len(FEATURE_NAMES),
            })
            mlflow.log_metrics(metrics)

            model_info = mlflow.pyfunc.log_model(
                artifact_path="intensity-model",
                python_model=_MLflowBundle(bundle),
                signature=signature,
            )
            mlflow.register_model(model_info.model_uri, MODEL_NAME)
            model_uri = model_info.model_uri
    except Exception:
        pass  # MLflow optional — model already saved to disk

    return model_uri, metrics


def log_enrichment_run(
    *,
    total: int,
    enriched: int,
    skipped: int,
    avg_predicted_score: float,
) -> None:
    try:
        import mlflow

        from app.ml.tracking import configure_mlflow

        configure_mlflow()
        mlflow.set_experiment(EXPERIMENT_NAME)

        with mlflow.start_run(run_name="enrichment-batch"):
            mlflow.log_metrics({
                "total_eligible": total,
                "enriched": enriched,
                "skipped": skipped,
                "avg_predicted_effort_score": round(avg_predicted_score, 2),
            })
    except Exception:
        pass
