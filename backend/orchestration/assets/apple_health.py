import time

from dagster import MaterializeResult, MetadataValue, asset, get_dagster_logger
from app.services.weather_service import OPEN_METEO_PROVIDER

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
from app.services.weather_service import WeatherService


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


@asset(
    deps=[apple_health_project_import],
    group_name="analytics",
    description="Reads imported activity data from Postgres and emits a lightweight analytics snapshot.",
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
                "with_average_heart_rate": sum(1 for activity in activities if activity.average_heart_rate_bpm is not None),
                "with_recovery_heart_rate": sum(1 for activity in activities if activity.recovery_heart_rate_bpm is not None),
                "with_active_energy": sum(1 for activity in activities if activity.active_energy_kcal is not None),
                "with_route_elevation_range": sum(1 for activity in activities if activity.min_elevation_meters is not None and activity.max_elevation_meters is not None),
                "with_route_pace_range": sum(1 for activity in activities if activity.min_pace_seconds_per_mile is not None and activity.max_pace_seconds_per_mile is not None),
                "with_workout_metadata": sum(1 for activity in activities if activity.workout_metadata_json),
                "with_route_points": sum(1 for activity in activities if activity.route_points_json),
            }
        )
    finally:
        db.close()


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
        weather_service = WeatherService(
            cache_repository=WeatherCacheRepository(db),
        )

        activities = activity_repo.list_activities_missing_weather()
        logger.info(f"Found {len(activities)} activities missing weather data")

        enriched_count = 0
        skipped_count = 0
        batch: list = []
        batch_size = 50

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

            if len(batch) >= batch_size:
                activity_repo.save_many(batch)
                batch = []

            time.sleep(0.15)

        if batch:
            activity_repo.save_many(batch)

        logger.info(f"Weather enrichment complete: {enriched_count} enriched, {skipped_count} skipped")

        return MaterializeResult(
            metadata={
                "total_eligible": len(activities),
                "enriched_count": enriched_count,
                "skipped_count": skipped_count,
            }
        )
    finally:
        db.close()


@asset(
    group_name="weather",
    description="Clears all activity weather data and archive cache so enrichment can re-fetch fresh data.",
)
def activity_weather_reset() -> MaterializeResult:
    logger = get_dagster_logger()
    initialize_database()
    db = SessionLocal()

    try:
        activity_repo = ActivityRepository(db)
        cache_repo = WeatherCacheRepository(db)

        cleared_activities = activity_repo.clear_all_weather_json()
        logger.info(f"Cleared weather_json from {cleared_activities} activities")

        deleted_cache = cache_repo.delete_by_key_prefix(
            provider=OPEN_METEO_PROVIDER, prefix="archive:",
        )
        logger.info(f"Deleted {deleted_cache} archive cache entries")

        return MaterializeResult(
            metadata={
                "cleared_activities": cleared_activities,
                "deleted_cache_entries": deleted_cache,
            }
        )
    finally:
        db.close()


@asset(
    deps=[apple_health_project_import],
    group_name="effort_score",
    description="Computes V1 TRIMP-based effort scores for activities with HR data and registers model in MLflow.",
)
def activity_effort_score_enrichment() -> MaterializeResult:
    logger = get_dagster_logger()
    initialize_database()
    db = SessionLocal()

    # MLflow integration is optional — gracefully skip if unavailable
    mlflow_available = False
    try:
        from app.ml.effort_score_registry import log_enrichment_run, register_v1_model
        mlflow_available = True
    except ImportError:
        logger.warning("MLflow not available (missing pkg_resources/setuptools) — skipping model registry and run logging")

    try:
        model_uri = None
        if mlflow_available:
            try:
                model_uri = register_v1_model()
                logger.info(f"Registered V1 effort-score model: {model_uri}")
            except Exception as e:
                logger.warning(f"MLflow model registration failed, continuing without it: {e}")

        activity_repo = ActivityRepository(db)
        activities = activity_repo.list_activities_missing_effort_score()
        logger.info(f"Found {len(activities)} activities missing effort scores")

        enriched_count = 0
        skipped_count = 0
        total_score = 0.0
        config_max_hr_count = 0
        activity_max_hr_count = 0
        batch: list = []
        batch_size = 50

        for activity in activities:
            result = compute_effort_score(activity)

            if result is not None:
                activity.effort_score_json = result.to_dict()
                batch.append(activity)
                enriched_count += 1
                total_score += result.effort_score

                if settings.user_max_heart_rate > 0:
                    config_max_hr_count += 1
                else:
                    activity_max_hr_count += 1
            else:
                skipped_count += 1

            if len(batch) >= batch_size:
                activity_repo.save_many(batch)
                batch = []

        if batch:
            activity_repo.save_many(batch)

        avg_score = total_score / enriched_count if enriched_count > 0 else 0.0

        if mlflow_available:
            try:
                log_enrichment_run(
                    total=len(activities),
                    enriched=enriched_count,
                    skipped=skipped_count,
                    avg_score=avg_score,
                    config_max_hr_count=config_max_hr_count,
                    activity_max_hr_count=activity_max_hr_count,
                )
            except Exception as e:
                logger.warning(f"MLflow enrichment logging failed: {e}")

        logger.info(f"Effort score enrichment complete: {enriched_count} enriched, {skipped_count} skipped, avg={avg_score:.1f}")

        return MaterializeResult(
            metadata={
                "total_eligible": len(activities),
                "enriched_count": enriched_count,
                "skipped_count": skipped_count,
                "avg_effort_score": round(avg_score, 2),
                "mlflow_enabled": mlflow_available,
                "model_uri": model_uri or "n/a",
            }
        )
    finally:
        db.close()


@asset(
    group_name="effort_score",
    description="Clears all effort scores so enrichment can recompute from scratch.",
)
def activity_effort_score_reset() -> MaterializeResult:
    logger = get_dagster_logger()
    initialize_database()
    db = SessionLocal()

    try:
        activity_repo = ActivityRepository(db)
        cleared = activity_repo.clear_all_effort_scores()
        logger.info(f"Cleared effort_score_json from {cleared} activities")

        return MaterializeResult(
            metadata={
                "cleared_activities": cleared,
            }
        )
    finally:
        db.close()


@asset(
    deps=[apple_health_project_import],
    group_name="clustering",
    description="Runs KMeans clustering per activity type and assigns workout intensity labels (Easy/Moderate/Hard/Extreme).",
)
def activity_workout_cluster_enrichment() -> MaterializeResult:
    logger = get_dagster_logger()
    initialize_database()
    db = SessionLocal()

    mlflow_available = False
    try:
        from app.ml.clustering_registry import log_clustering_run
        mlflow_available = True
    except ImportError:
        logger.warning("MLflow not available — skipping clustering run logging")

    try:
        activity_repo = ActivityRepository(db)

        cleared = activity_repo.clear_all_workout_clusters()
        logger.info(f"Cleared existing workout clusters from {cleared} activities")

        activities = activity_repo.list_all_activities_for_clustering()
        logger.info(f"Loaded {len(activities)} activities for clustering")

        results = cluster_activities(activities)
        logger.info(f"Clustered {len(results)} activities")

        batch: list = []
        batch_size = 50

        for activity in activities:
            result = results.get(activity.id)
            if result is not None:
                activity.workout_cluster_json = result.to_dict()
                batch.append(activity)

            if len(batch) >= batch_size:
                activity_repo.save_many(batch)
                batch = []

        if batch:
            activity_repo.save_many(batch)

        label_distribution: dict[str, int] = {}
        types_clustered: set[str] = set()
        for r in results.values():
            label_distribution[r.cluster_label] = label_distribution.get(r.cluster_label, 0) + 1
            types_clustered.add(r.activity_type_group)

        all_types = {a.activity_type for a in activities}
        types_skipped = len(all_types - types_clustered)

        if mlflow_available:
            try:
                log_clustering_run(
                    types_clustered=len(types_clustered),
                    types_skipped=types_skipped,
                    total_activities=len(activities),
                    clustered_activities=len(results),
                    label_distribution=label_distribution,
                )
            except Exception as e:
                logger.warning(f"MLflow clustering logging failed: {e}")

        logger.info(f"Clustering complete: {len(types_clustered)} types, {len(results)} activities clustered")

        return MaterializeResult(
            metadata={
                "total_activities": len(activities),
                "clustered_activities": len(results),
                "types_clustered": len(types_clustered),
                "types_skipped": types_skipped,
                "label_distribution": str(label_distribution),
                "mlflow_enabled": mlflow_available,
            }
        )
    finally:
        db.close()


@asset(
    deps=[apple_health_project_import],
    group_name="intensity_prediction",
    description="Trains a HistGradientBoostingRegressor on Strava + personal data to predict effort score and registers the model in MLflow.",
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


@asset(
    deps=[intensity_prediction_model_training],
    group_name="intensity_prediction",
    description="Predicts effort scores for all activities with existing effort_score_json and stores as predicted_intensity_json.",
)
def activity_intensity_prediction_enrichment() -> MaterializeResult:
    logger = get_dagster_logger()
    initialize_database()
    db = SessionLocal()

    try:
        from app.services.intensity_prediction_service import predict_for_activity

        activity_repo = ActivityRepository(db)

        cleared = activity_repo.clear_all_predicted_intensities()
        logger.info(f"Cleared predicted_intensity_json from {cleared} activities")

        activities = activity_repo.list_all_activities()
        logger.info(f"Loaded {len(activities)} activities for intensity prediction")

        enriched_count = 0
        skipped_count = 0
        total_score = 0.0
        batch_count = 0
        batch_size = 50

        for activity in activities:
            result = predict_for_activity(activity)

            if result is not None:
                activity_repo.update_predicted_intensity(activity.id, result.to_dict())
                enriched_count += 1
                batch_count += 1
                total_score += result.predicted_effort_score
            else:
                skipped_count += 1

            if batch_count >= batch_size:
                activity_repo.flush_predicted_intensity_batch()
                batch_count = 0

        if batch_count > 0:
            activity_repo.flush_predicted_intensity_batch()

        avg_score = total_score / enriched_count if enriched_count > 0 else 0.0

        mlflow_available = False
        try:
            from app.ml.intensity_predictor_registry import log_enrichment_run
            mlflow_available = True
        except ImportError:
            pass

        if mlflow_available:
            try:
                log_enrichment_run(
                    total=len(activities),
                    enriched=enriched_count,
                    skipped=skipped_count,
                    avg_predicted_score=avg_score,
                )
            except Exception as e:
                logger.warning(f"MLflow enrichment logging failed: {e}")

        logger.info(f"Intensity prediction enrichment: {enriched_count} enriched, {skipped_count} skipped, avg={avg_score:.1f}")

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


@asset(
    group_name="intensity_prediction",
    description="Clears all predicted intensity scores so enrichment can recompute from scratch.",
)
def activity_intensity_prediction_reset() -> MaterializeResult:
    logger = get_dagster_logger()
    initialize_database()
    db = SessionLocal()

    try:
        activity_repo = ActivityRepository(db)
        cleared = activity_repo.clear_all_predicted_intensities()
        logger.info(f"Cleared predicted_intensity_json from {cleared} activities")

        return MaterializeResult(
            metadata={
                "cleared_activities": cleared,
            }
        )
    finally:
        db.close()


@asset(
    group_name="clustering",
    description="Clears all workout cluster assignments so enrichment can recompute from scratch.",
)
def activity_workout_cluster_reset() -> MaterializeResult:
    logger = get_dagster_logger()
    initialize_database()
    db = SessionLocal()

    try:
        activity_repo = ActivityRepository(db)
        cleared = activity_repo.clear_all_workout_clusters()
        logger.info(f"Cleared workout_cluster_json from {cleared} activities")

        return MaterializeResult(
            metadata={
                "cleared_activities": cleared,
            }
        )
    finally:
        db.close()
