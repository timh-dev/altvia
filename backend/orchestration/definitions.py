from dagster import Definitions, define_asset_job, in_process_executor

from orchestration.assets.apple_health import (
    activity_analytics_snapshot,
    activity_effort_score_enrichment,
    activity_intensity_prediction_enrichment,
    activity_weather_enrichment,
    activity_workout_cluster_enrichment,
    apple_health_project_import,
    intensity_prediction_model_training,
)

# Full pipeline: import → enrich everything
full_pipeline_job = define_asset_job(
    name="full_pipeline_job",
    selection=[
        apple_health_project_import,
        activity_analytics_snapshot,
        activity_weather_enrichment,
        activity_effort_score_enrichment,
        activity_workout_cluster_enrichment,
        intensity_prediction_model_training,
        activity_intensity_prediction_enrichment,
    ],
)

# Individual jobs for targeted runs
apple_health_import_job = define_asset_job(
    name="apple_health_import_job",
    selection=[apple_health_project_import, activity_analytics_snapshot],
)

weather_enrichment_job = define_asset_job(
    name="weather_enrichment_job",
    selection=[activity_weather_enrichment],
)

effort_score_enrichment_job = define_asset_job(
    name="effort_score_enrichment_job",
    selection=[activity_effort_score_enrichment],
)

clustering_enrichment_job = define_asset_job(
    name="clustering_enrichment_job",
    selection=[activity_workout_cluster_enrichment],
)

intensity_prediction_training_job = define_asset_job(
    name="intensity_prediction_training_job",
    selection=[intensity_prediction_model_training],
)

intensity_prediction_enrichment_job = define_asset_job(
    name="intensity_prediction_enrichment_job",
    selection=[activity_intensity_prediction_enrichment],
)

defs = Definitions(
    assets=[
        apple_health_project_import,
        activity_analytics_snapshot,
        activity_weather_enrichment,
        activity_effort_score_enrichment,
        activity_workout_cluster_enrichment,
        intensity_prediction_model_training,
        activity_intensity_prediction_enrichment,
    ],
    jobs=[
        full_pipeline_job,
        apple_health_import_job,
        weather_enrichment_job,
        effort_score_enrichment_job,
        clustering_enrichment_job,
        intensity_prediction_training_job,
        intensity_prediction_enrichment_job,
    ],
    executor=in_process_executor,
)
