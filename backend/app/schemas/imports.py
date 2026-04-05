from uuid import UUID

from pydantic import BaseModel


class ImportJobCreateResponse(BaseModel):
    id: UUID
    source_type: str
    status: str
    filename: str
    total_records: int
    imported_records: int
    notes: str | None
