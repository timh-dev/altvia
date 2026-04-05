from pathlib import Path

from fastapi import UploadFile
from geoalchemy2.elements import WKTElement

from app.core.config import settings
from app.ingestion.apple_health import AppleHealthParser
from app.models.activity import Activity
from app.repositories.activity_repository import ActivityRepository
from app.repositories.import_repository import ImportRepository
from app.schemas.imports import ImportJobCreateResponse


class ImportService:
    def __init__(self, import_repository: ImportRepository, activity_repository: ActivityRepository):
        self.import_repository = import_repository
        self.activity_repository = activity_repository
        self.apple_health_parser = AppleHealthParser()

    async def queue_apple_health_import(self, file: UploadFile) -> ImportJobCreateResponse:
        filename = file.filename or "export.xml"
        await self.apple_health_parser.inspect(file)
        job = self.import_repository.create_import_job(source_type="apple_health", filename=filename)

        try:
            stored_file = await self.apple_health_parser.persist_upload(file=file, import_job_id=job.id)
            job = self._import_from_file(job=job, file_path=stored_file)
        except Exception as exc:
            job = self.import_repository.mark_failed(job, str(exc))
            raise

        return self._to_response(job)

    def import_project_apple_health_export(self) -> ImportJobCreateResponse:
        export_path = self._resolve_project_export_path()
        return self.import_apple_health_file(export_path)

    def import_apple_health_file(self, file_path: Path, *, filename: str | None = None) -> ImportJobCreateResponse:
        job = self.import_repository.create_import_job(
            source_type="apple_health",
            filename=filename or file_path.name,
            source_file_path=str(file_path),
        )

        try:
            job = self._import_from_file(job=job, file_path=file_path)
        except Exception as exc:
            job = self.import_repository.mark_failed(job, str(exc))
            raise

        return self._to_response(job)

    def _import_from_file(self, *, job: object, file_path: Path):
        self.import_repository.mark_processing(job, source_file_path=str(file_path))
        parsed_import = self.apple_health_parser.parse_export(file_path)

        pending_activities: list[Activity] = []
        duplicate_count = 0
        updated_count = 0
        seen_keys: set[tuple[str, str, object]] = set()

        for parsed_activity in parsed_import.activities:
            activity_key = (
                parsed_activity.source,
                parsed_activity.activity_type,
                parsed_activity.started_at,
            )
            if activity_key in seen_keys:
                duplicate_count += 1
                continue

            existing_activity = self.activity_repository.find_by_source_type_and_start(
                source=parsed_activity.source,
                activity_type=parsed_activity.activity_type,
                started_at=parsed_activity.started_at,
            )
            if existing_activity is not None:
                self._apply_parsed_activity(existing_activity, parsed_activity)
                self.activity_repository.save(existing_activity)
                updated_count += 1
                continue

            seen_keys.add(activity_key)
            pending_activities.append(
                self._build_activity(parsed_activity)
            )

        self.activity_repository.create_many(pending_activities)
        return self.import_repository.mark_completed(
            job,
            total_records=parsed_import.total_records,
            imported_records=len(pending_activities),
            notes=self._build_completion_notes(
                parsed_count=parsed_import.total_records,
                imported_count=len(pending_activities),
                skipped_count=parsed_import.skipped_records,
                duplicate_count=duplicate_count,
                updated_count=updated_count,
            ),
        )

    @staticmethod
    def _build_activity(parsed_activity: object) -> Activity:
        activity = Activity()
        ImportService._apply_parsed_activity(activity, parsed_activity)
        return activity

    @staticmethod
    def _apply_parsed_activity(activity: Activity, parsed_activity: object) -> None:
        activity.source = parsed_activity.source
        activity.activity_type = parsed_activity.activity_type
        activity.name = parsed_activity.name
        activity.started_at = parsed_activity.started_at
        activity.duration_seconds = parsed_activity.duration_seconds
        activity.distance_meters = parsed_activity.distance_meters
        activity.elevation_gain_meters = parsed_activity.elevation_gain_meters
        activity.active_energy_kcal = parsed_activity.active_energy_kcal
        activity.basal_energy_kcal = parsed_activity.basal_energy_kcal
        activity.average_heart_rate_bpm = parsed_activity.average_heart_rate_bpm
        activity.max_heart_rate_bpm = parsed_activity.max_heart_rate_bpm
        activity.recovery_heart_rate_bpm = parsed_activity.recovery_heart_rate_bpm
        activity.min_elevation_meters = parsed_activity.min_elevation_meters
        activity.max_elevation_meters = parsed_activity.max_elevation_meters
        activity.min_pace_seconds_per_mile = parsed_activity.min_pace_seconds_per_mile
        activity.max_pace_seconds_per_mile = parsed_activity.max_pace_seconds_per_mile
        activity.start_latitude = parsed_activity.start_latitude
        activity.start_longitude = parsed_activity.start_longitude
        activity.end_latitude = parsed_activity.end_latitude
        activity.end_longitude = parsed_activity.end_longitude
        activity.workout_metadata_json = parsed_activity.workout_metadata_json
        activity.route_points_json = parsed_activity.route_points_json
        activity.route_geometry = (
            WKTElement(parsed_activity.route_wkt, srid=4326)
            if parsed_activity.route_wkt is not None
            else None
        )

    @staticmethod
    def _to_response(job: object) -> ImportJobCreateResponse:
        return ImportJobCreateResponse(
            id=job.id,
            source_type=job.source_type,
            status=job.status,
            filename=job.filename,
            total_records=job.total_records,
            imported_records=job.imported_records,
            notes=job.notes,
        )

    @staticmethod
    def _resolve_project_export_path() -> Path:
        export_dir = settings.apple_health_export_dir
        xml_path = export_dir / "export.xml"
        if xml_path.exists():
            return xml_path

        zip_candidates = sorted(export_dir.glob("*.zip"))
        if zip_candidates:
            return zip_candidates[0]

        raise ValueError(f"Apple Health export not found in {export_dir}.")

    @staticmethod
    def _build_completion_notes(
        *,
        parsed_count: int,
        imported_count: int,
        skipped_count: int,
        duplicate_count: int,
        updated_count: int,
    ) -> str:
        summary_parts = [
            f"Parsed {parsed_count} workouts.",
            f"Imported {imported_count} new activities.",
        ]

        if updated_count:
            summary_parts.append(f"Updated {updated_count} existing activities.")

        if duplicate_count:
            summary_parts.append(f"Skipped {duplicate_count} duplicates.")

        if skipped_count:
            summary_parts.append(f"Skipped {skipped_count} invalid workouts.")

        return " ".join(summary_parts)
