from dagster import Definitions, define_asset_job

from orchestration.assets.apple_health import (
    activity_analytics_snapshot,
    activity_effort_score_enrichment,
    activity_effort_score_reset,
    activity_intensity_prediction_enrichment,
    activity_intensity_prediction_reset,
    activity_weather_enrichment,
    activity_weather_reset,
    activity_workout_cluster_enrichment,
    activity_workout_cluster_reset,
    apple_health_project_import,
    intensity_prediction_model_training,
)

apple_health_import_job = define_asset_job(
    name="apple_health_import_job",
    selection=[apple_health_project_import, activity_analytics_snapshot],
)

weather_enrichment_job = define_asset_job(
    name="weather_enrichment_job",
    selection=[activity_weather_enrichment],
)

weather_reset_job = define_asset_job(
    name="weather_reset_job",
    selection=[activity_weather_reset],
)

effort_score_enrichment_job = define_asset_job(
    name="effort_score_enrichment_job",
    selection=[activity_effort_score_enrichment],
)

effort_score_reset_job = define_asset_job(
    name="effort_score_reset_job",
    selection=[activity_effort_score_reset],
)

clustering_enrichment_job = define_asset_job(
    name="clustering_enrichment_job",
    selection=[activity_workout_cluster_enrichment],
)

clustering_reset_job = define_asset_job(
    name="clustering_reset_job",
    selection=[activity_workout_cluster_reset],
)

intensity_prediction_training_job = define_asset_job(
    name="intensity_prediction_training_job",
    selection=[intensity_prediction_model_training],
)

intensity_prediction_enrichment_job = define_asset_job(
    name="intensity_prediction_enrichment_job",
    selection=[activity_intensity_prediction_enrichment],
)

intensity_prediction_reset_job = define_asset_job(
    name="intensity_prediction_reset_job",
    selection=[activity_intensity_prediction_reset],
)

defs = Definitions(
    assets=[
        apple_health_project_import,
        activity_analytics_snapshot,
        activity_weather_enrichment,
        activity_weather_reset,
        activity_effort_score_enrichment,
        activity_effort_score_reset,
        activity_workout_cluster_enrichment,
        activity_workout_cluster_reset,
        intensity_prediction_model_training,
        activity_intensity_prediction_enrichment,
        activity_intensity_prediction_reset,
    ],
    jobs=[
        apple_health_import_job,
        weather_enrichment_job,
        weather_reset_job,
        effort_score_enrichment_job,
        effort_score_reset_job,
        clustering_enrichment_job,
        clustering_reset_job,
        intensity_prediction_training_job,
        intensity_prediction_enrichment_job,
        intensity_prediction_reset_job,
    ],
)
