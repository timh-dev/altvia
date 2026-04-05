from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.import_job import ImportJob


class ImportRepository:
    def __init__(self, db: Session):
        self.db = db

    def create_import_job(
        self,
        source_type: str,
        filename: str,
        status: str = "queued",
        source_file_path: str | None = None,
    ) -> ImportJob:
        job = ImportJob(
            source_type=source_type,
            filename=filename,
            status=status,
            source_file_path=source_file_path,
        )
        self.db.add(job)
        self.db.commit()
        self.db.refresh(job)
        return job

    def mark_processing(self, job: ImportJob, source_file_path: str) -> ImportJob:
        job.status = "processing"
        job.source_file_path = source_file_path
        self.db.add(job)
        self.db.commit()
        self.db.refresh(job)
        return job

    def mark_completed(
        self,
        job: ImportJob,
        *,
        total_records: int,
        imported_records: int,
        notes: str | None = None,
    ) -> ImportJob:
        job.status = "completed"
        job.total_records = total_records
        job.imported_records = imported_records
        job.notes = notes
        job.completed_at = datetime.now(timezone.utc)
        self.db.add(job)
        self.db.commit()
        self.db.refresh(job)
        return job

    def mark_failed(self, job: ImportJob, notes: str) -> ImportJob:
        self.db.rollback()
        job.status = "failed"
        job.notes = notes
        job.completed_at = datetime.now(timezone.utc)
        self.db.add(job)
        self.db.commit()
        self.db.refresh(job)
        return job
