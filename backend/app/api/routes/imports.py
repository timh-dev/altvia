from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import get_database
from app.repositories.activity_repository import ActivityRepository
from app.repositories.import_repository import ImportRepository
from app.schemas.imports import ImportJobCreateResponse
from app.services.import_service import ImportService


router = APIRouter()


@router.post("/apple-health", response_model=ImportJobCreateResponse)
async def upload_apple_health_export(
    file: UploadFile = File(...),
    db: Session = Depends(get_database),
) -> ImportJobCreateResponse:
    service = ImportService(
        import_repository=ImportRepository(db),
        activity_repository=ActivityRepository(db),
    )
    try:
        return await service.queue_apple_health_import(file)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Apple Health import failed.") from exc


@router.post("/apple-health/project", response_model=ImportJobCreateResponse)
def import_project_apple_health_export(
    db: Session = Depends(get_database),
) -> ImportJobCreateResponse:
    service = ImportService(
        import_repository=ImportRepository(db),
        activity_repository=ActivityRepository(db),
    )
    try:
        return service.import_project_apple_health_export()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Project Apple Health import failed.") from exc
