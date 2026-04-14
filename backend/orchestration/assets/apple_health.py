import time

from dagster import MaterializeResult, MetadataValue, asset, get_dagster_logger

from app.core.config import settings
from app.db.init_db import initialize_database
from app.db.session import SessionLocal
from app.repositories.activity_repository import ActivityRepository
from app.repositories.import_repository import ImportRepository
from app.repositories.weather_cache_repository import WeatherCacheRepository
from app.services.activity_service import ActivityService
from app.services.clustering_service import cluster_activities
from app.services.effort_score_service import compute_effort_score
from app.services.import_service import ImportService
from app.services.weather_service import OPEN_METEO_PROVIDER, WeatherService


def _try_import_mlflow(module: str):
    try:
        import importlib
        return importlib.import_module(module)
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Import
# ---------------------------------------------------------------------------

@asset(
    group_name="apple_health",
    description="Imports the project Apple Health export into Postgres and PostGIS-backed activity tables.",
)
def apple_health_project_import() -> MaterializeResult:
    initialize_database()
    db = SessionLocal()
    try:
        service = ImportService(
            import_repository=ImportRepository(db),
            activity_repository=ActivityRepository(db),
        )
        result = service.import_project_apple_health_export()
        return MaterializeResult(
            metadata={
                "status": result.status,
                "filename": result.filename,
                "source_type": result.source_type,
                "total_records": result.total_records,
                "imported_records": result.imported_records,
                "notes": result.notes or "",
                "source_path": MetadataValue.path(str(settings.apple_health_export_dir)),
            }
        )
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Analytics snapshot
# ---------------------------------------------------------------------------

@asset(
    deps=[apple_health_project_import],
    group_name="analytics",
    description="Emits a lightweight analytics snapshot of imported activity data.",
)
def activity_analytics_snapshot() -> MaterializeResult:
    initialize_database()
    db = SessionLocal()
    try:
        repository = ActivityRepository(db)
        analytics = ActivityService(repository).get_activity_analytics()
        activities = repository.list_all_activities()
        activity_type_summary = ", ".join(
            f"{item.activity_type}:{item.count}" for item in analytics.activity_types[:5]
        )
        return MaterializeResult(
            metadata={
                "total_sessions": analytics.total_sessions,
                "mapped_sessions": analytics.mapped_sessions,
                "total_distance_meters": round(analytics.total_distance_meters, 2),
                "total_duration_seconds": round(analytics.total_duration_seconds, 2),
                "total_elevation_gain_meters": round(analytics.total_elevation_gain_meters, 2),
                "activity_types": activity_type_summary,
                "with_average_heart_rate": sum(1 for a in activities if a.average_heart_rate_bpm is not None),
                "with_recovery_heart_rate": sum(1 for a in activities if a.recovery_heart_rate_bpm is not None),
                "with_active_energy": sum(1 for a in activities if a.active_energy_kcal is not None),
                "with_route_elevation_range": sum(1 for a in activities if a.min_elevation_meters is not None),
                "with_route_pace_range": sum(1 for a in activities if a.min_pace_seconds_per_mile is not None),
                "with_workout_metadata": sum(1 for a in activities if a.workout_metadata_json),
                "with_route_points": sum(1 for a in activities if a.route_points_json),
            }
        )
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Weather enrichment
# ---------------------------------------------------------------------------

@asset(
    deps=[apple_health_project_import],
    group_name="weather",
    description="Backfills historical weather for activities missing weather data.",
)
def activity_weather_enrichment() -> MaterializeResult:
    logger = get_dagster_logger()
    initialize_database()
    db = SessionLocal()
    try:
        activity_repo = ActivityRepository(db)
        weather_service = WeatherService(cache_repository=WeatherCacheRepository(db))

        activities = activity_repo.list_activities_missing_weather()
        logger.info(f"Found {len(activities)} activities missing weather data")

        enriched_count = 0
        skipped_count = 0
        batch: list = []

        for activity in activities:
            weather = weather_service.get_historical_weather(
                latitude=activity.start_latitude,
                longitude=activity.start_longitude,
                started_at=activity.started_at,
            )
            if weather is not None:
                activity.weather_json = weather
                batch.append(activity)
                enriched_count += 1
            else:
                skipped_count += 1

            if len(batch) >= 50:
                activity_repo.save_many(batch)
                batch = []

            time.sleep(0.15)

        if batch:
            activity_repo.save_many(batch)

        return MaterializeResult(
            metadata={
                "total_eligible": len(activities),
                "enriched_count": enriched_count,
                "skipped_count": skipped_count,
            }
        )
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Effort score enrichment
# ---------------------------------------------------------------------------

@asset(
    deps=[apple_health_project_import],
    group_name="effort_score",
    description="Computes TRIMP-based effort scores for activities missing them.",
)
def activity_effort_score_enrichment() -> MaterializeResult:
    logger = get_dagster_logger()
    initialize_database()
    db = SessionLocal()

    registry = _try_import_mlflow("app.ml.effort_score_registry")

    try:
        model_uri = None
        if registry:
            try:
                model_uri = registry.register_v1_model()
            except Exception as e:
                logger.warning(f"MLflow model registration failed: {e}")

        activity_repo = ActivityRepository(db)
        activities = activity_repo.list_activities_missing_effort_score()
        logger.info(f"Found {len(activities)} activities missing effort scores")

        enriched_count = 0
        skipped_count = 0
        total_score = 0.0
        batch: list = []

        for activity in activities:
            result = compute_effort_score(activity)
            if result is not None:
                activity.effort_score_json = result.to_dict()
                batch.append(activity)
                enriched_count += 1
                total_score += result.effort_score
            else:
                skipped_count += 1

            if len(batch) >= 50:
                activity_repo.save_many(batch)
                batch = []

        if batch:
            activity_repo.save_many(batch)

        avg_score = total_score / enriched_count if enriched_count > 0 else 0.0

        if registry:
            try:
                registry.log_enrichment_run(
                    total=len(activities),
                    enriched=enriched_count,
                    skipped=skipped_count,
                    avg_score=avg_score,
                    config_max_hr_count=enriched_count if settings.user_max_heart_rate > 0 else 0,
                    activity_max_hr_count=0 if settings.user_max_heart_rate > 0 else enriched_count,
                )
            except Exception as e:
                logger.warning(f"MLflow logging failed: {e}")

        return MaterializeResult(
            metadata={
                "total_eligible": len(activities),
                "enriched_count": enriched_count,
                "skipped_count": skipped_count,
                "avg_effort_score": round(avg_score, 2),
                "model_uri": model_uri or "n/a",
            }
        )
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Clustering
# ---------------------------------------------------------------------------

@asset(
    deps=[activity_effort_score_enrichment],
    group_name="clustering",
    description="Runs KMeans clustering per activity type, assigns intensity labels, and persists the model bundle.",
)
def activity_workout_cluster_enrichment() -> MaterializeResult:
    logger = get_dagster_logger()
    initialize_database()
    db = SessionLocal()

    registry = _try_import_mlflow("app.ml.clustering_registry")

    try:
        from app.ml.clustering_predictor import save_model_bundle

        activity_repo = ActivityRepository(db)
        activities = activity_repo.list_all_activities_for_clustering()
        logger.info(f"Loaded {len(activities)} activities for clustering")

        results, bundle = cluster_activities(activities)

        model_path = save_model_bundle(bundle)
        logger.info(f"Persisted clustering model to {model_path}")

        batch: list = []
        for activity in activities:
            result = results.get(activity.id)
            if result is not None:
                activity.workout_cluster_json = result.to_dict()
                batch.append(activity)
            if len(batch) >= 50:
                activity_repo.save_many(batch)
                batch = []
        if batch:
            activity_repo.save_many(batch)

        label_distribution: dict[str, int] = {}
        types_clustered: set[str] = set()
        for r in results.values():
            label_distribution[r.cluster_label] = label_distribution.get(r.cluster_label, 0) + 1
            types_clustered.add(r.activity_type_group)

        types_skipped = len({a.activity_type for a in activities} - types_clustered)

        if registry:
            try:
                registry.log_clustering_run(
                    types_clustered=len(types_clustered),
                    types_skipped=types_skipped,
                    total_activities=len(activities),
                    clustered_activities=len(results),
                    label_distribution=label_distribution,
                )
            except Exception as e:
                logger.warning(f"MLflow logging failed: {e}")

        return MaterializeResult(
            metadata={
                "total_activities": len(activities),
                "clustered_activities": len(results),
                "types_clustered": len(types_clustered),
                "types_skipped": types_skipped,
                "label_distribution": str(label_distribution),
                "model_path": str(model_path),
            }
        )
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Intensity prediction model training
# ---------------------------------------------------------------------------

@asset(
    deps=[activity_effort_score_enrichment],
    group_name="intensity_prediction",
    description="Trains a HistGradientBoostingRegressor on Strava + personal data to predict effort score.",
)
def intensity_prediction_model_training() -> MaterializeResult:
    logger = get_dagster_logger()
    initialize_database()
    db = SessionLocal()
    try:
        from app.ml.intensity_predictor_registry import train_and_register_model

        model_uri, metrics = train_and_register_model(db)
        logger.info(f"Registered intensity prediction model: {model_uri}")

        return MaterializeResult(
            metadata={
                "model_uri": model_uri,
                "rmse": round(metrics["rmse"], 2),
                "mae": round(metrics["mae"], 2),
                "r2": round(metrics["r2"], 4),
                "n_train": metrics["n_train"],
                "n_test": metrics["n_test"],
                "n_total": metrics["n_total"],
                "n_strava": metrics["n_strava"],
                "n_personal": metrics["n_personal"],
                "weather_coverage": round(metrics["weather_coverage"], 4),
            }
        )
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Intensity prediction enrichment
# ---------------------------------------------------------------------------

@asset(
    deps=[intensity_prediction_model_training],
    group_name="intensity_prediction",
    description="Predicts effort scores for all activities and stores as predicted_intensity_json.",
)
def activity_intensity_prediction_enrichment() -> MaterializeResult:
    logger = get_dagster_logger()
    initialize_database()
    db = SessionLocal()

    registry = _try_import_mlflow("app.ml.intensity_predictor_registry")

    try:
        from app.services.intensity_prediction_service import predict_for_activity

        activity_repo = ActivityRepository(db)
        activities = activity_repo.list_all_activities()
        logger.info(f"Loaded {len(activities)} activities for intensity prediction")

        enriched_count = 0
        skipped_count = 0
        total_score = 0.0
        batch_count = 0

        for activity in activities:
            result = predict_for_activity(activity)
            if result is not None:
                activity_repo.update_predicted_intensity(activity.id, result.to_dict())
                enriched_count += 1
                batch_count += 1
                total_score += result.predicted_effort_score
            else:
                skipped_count += 1

            if batch_count >= 50:
                activity_repo.flush_predicted_intensity_batch()
                batch_count = 0

        if batch_count > 0:
            activity_repo.flush_predicted_intensity_batch()

        avg_score = total_score / enriched_count if enriched_count > 0 else 0.0

        if registry:
            try:
                registry.log_enrichment_run(
                    total=len(activities),
                    enriched=enriched_count,
                    skipped=skipped_count,
                    avg_predicted_score=avg_score,
                )
            except Exception as e:
                logger.warning(f"MLflow logging failed: {e}")

        return MaterializeResult(
            metadata={
                "total_activities": len(activities),
                "enriched_count": enriched_count,
                "skipped_count": skipped_count,
                "avg_predicted_effort_score": round(avg_score, 2),
            }
        )
    finally:
        db.close()
