"""Media upload API router."""

from __future__ import annotations

import uuid
from pathlib import Path

import structlog
from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.media_asset import MediaAsset

logger = structlog.get_logger()
router = APIRouter(prefix="/media", tags=["Media"])

ALLOWED_MIME_TYPES = {
    "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
    "audio/mpeg", "audio/wav", "audio/ogg", "audio/webm",
    "video/mp4", "video/webm",
    "application/pdf",
    "text/plain", "text/csv", "text/markdown",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_media(
    file: UploadFile,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload a media file (image, audio, document, video)."""
    settings = get_settings()

    # Validate MIME type
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {file.content_type}. Allowed: {', '.join(sorted(ALLOWED_MIME_TYPES))}",
        )

    # Read file
    content = await file.read()
    if len(content) > settings.max_upload_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Max size: {settings.MAX_UPLOAD_SIZE_MB}MB",
        )

    # Generate storage path
    file_id = uuid.uuid4()
    ext = Path(file.filename).suffix if file.filename else ""
    file_key = f"uploads/{user.id}/{file_id}{ext}"
    file_path = settings.upload_path / str(user.id)
    file_path.mkdir(parents=True, exist_ok=True)
    full_path = file_path / f"{file_id}{ext}"

    # Save to local filesystem
    with open(full_path, "wb") as f:
        f.write(content)

    # Get image dimensions if applicable
    width, height = None, None
    if file.content_type and file.content_type.startswith("image/"):
        try:
            from PIL import Image
            img = Image.open(full_path)
            width, height = img.size
        except Exception:
            pass

    # Create asset record
    asset = MediaAsset(
        id=file_id,
        user_id=user.id,
        file_key=file_key,
        mime_type=file.content_type or "application/octet-stream",
        original_filename=file.filename or "unknown",
        size_bytes=len(content),
        width=width,
        height=height,
    )
    db.add(asset)
    await db.flush()

    logger.info("media_uploaded", asset_id=str(file_id), mime=file.content_type, size=len(content))

    return {
        "id": str(asset.id),
        "filename": asset.original_filename,
        "mime_type": asset.mime_type,
        "size_bytes": asset.size_bytes,
        "width": width,
        "height": height,
    }


@router.get("/{asset_id}")
async def get_media(
    asset_id: uuid.UUID,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get/serve a media file."""
    result = await db.execute(
        select(MediaAsset).where(MediaAsset.id == asset_id, MediaAsset.user_id == user.id)
    )
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Media not found")

    settings = get_settings()
    # Reconstruct file path from file_key
    file_path = settings.upload_path / str(user.id) / f"{asset.id}{Path(asset.original_filename).suffix}"

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")

    return FileResponse(
        str(file_path),
        media_type=asset.mime_type,
        filename=asset.original_filename,
    )


@router.delete("/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_media(
    asset_id: uuid.UUID,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a media asset."""
    result = await db.execute(
        select(MediaAsset).where(MediaAsset.id == asset_id, MediaAsset.user_id == user.id)
    )
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Media not found")

    # Delete file from disk
    settings = get_settings()
    file_path = settings.upload_path / str(user.id) / f"{asset.id}{Path(asset.original_filename).suffix}"
    if file_path.exists():
        file_path.unlink()

    await db.delete(asset)
