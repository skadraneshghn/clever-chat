"""Advanced Media Upload and File Management API Router.

Integrates S3/Cellar Object Storage, deduplication via SHA-256 hashes,
asynchronous parsing/extraction (PDF, Word, spreadsheets, CSV),
link scraping, AI auto-organization, and many-to-many chat resource attachments.
"""

from __future__ import annotations

import io
import json
import uuid
import hashlib
from pathlib import Path
from datetime import datetime
from urllib.parse import urlparse

import httpx
import structlog
from fastapi import APIRouter, Depends, HTTPException, UploadFile, status, Response
from fastapi.responses import FileResponse
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from sqlalchemy import select, and_, delete
from sqlalchemy.ext.asyncio import AsyncSession
from PIL import Image
from arq import create_pool
from arq.connections import RedisSettings

from app.core.config import get_settings
from app.core.database import get_db, get_db_context
from app.core.security import get_current_user
from app.models.media_asset import MediaAsset
from app.models.chat_resource import ChatResource
from app.services.s3_storage import (
    upload_bytes_to_s3,
    upload_file_to_s3,
    download_bytes_from_s3,
    delete_file_from_s3,
)
from app.services.extractor import (
    compute_sha256,
    count_tokens,
    process_document_content,
)

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


# ── Pydantic Request Schemas ─────────────────────────────────────────────────

class ScrapUrlRequest(BaseModel):
    url: str


class OrganizeRequest(BaseModel):
    strategy: str  # ai | type | size | month


class AttachResourcesRequest(BaseModel):
    media_asset_ids: list[uuid.UUID]


class CheckHashRequest(BaseModel):
    file_hash: str
    filename: str
    mime_type: str


# ── Background Extraction Worker Helper ──────────────────────────────────────

async def get_arq_redis():
    """Retrieve a connection pool for the arq Redis backend job worker."""
    settings = get_settings()
    parsed_redis = urlparse(settings.redis_url)
    redis_settings = RedisSettings(
        host=parsed_redis.hostname or "localhost",
        port=parsed_redis.port or 6379,
        password=parsed_redis.password,
        database=int(parsed_redis.path.lstrip("/")) if parsed_redis.path else 0
    )
    return await create_pool(redis_settings)


# ── Router Endpoints ─────────────────────────────────────────────────────────

@router.get("", status_code=status.HTTP_200_OK)
async def list_media(
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all media assets uploaded by the current user."""
    result = await db.execute(
        select(MediaAsset)
        .where(MediaAsset.user_id == user.id)
        .order_by(MediaAsset.created_at.desc())
    )
    assets = result.scalars().all()
    
    return [
        {
            "id": str(asset.id),
            "filename": asset.original_filename,
            "mime_type": asset.mime_type,
            "size_bytes": asset.size_bytes,
            "width": asset.width,
            "height": asset.height,
            "folder_name": asset.folder_name,
            "status": asset.status,
            "extraction_status": asset.extraction_status,
            "token_count": asset.token_count,
            "created_at": asset.created_at.isoformat(),
            "url": f"/api/v1/media/{asset.id}",
            "thumbnail_url": f"/api/v1/media/{asset.id}/thumbnail" if asset.mime_type.startswith("image/") else None,
        }
        for asset in assets
    ]


@router.post("/check-hash", status_code=status.HTTP_200_OK)
async def check_file_hash(
    body: CheckHashRequest,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Check if a file with the given SHA-256 hash already exists for this user."""
    result = await db.execute(
        select(MediaAsset).where(
            MediaAsset.user_id == user.id,
            MediaAsset.file_hash == body.file_hash
        )
    )
    duplicate = result.scalar_one_or_none()
    if duplicate:
        logger.info("hash_check_duplicate_found", hash=body.file_hash, filename=body.filename)
        return {
            "exists": True,
            "asset": {
                "id": str(duplicate.id),
                "filename": duplicate.original_filename,
                "mime_type": duplicate.mime_type,
                "size_bytes": duplicate.size_bytes,
                "width": duplicate.width,
                "height": duplicate.height,
                "folder_name": duplicate.folder_name,
                "status": duplicate.status,
                "extraction_status": duplicate.extraction_status,
                "token_count": duplicate.token_count,
                "url": f"/api/v1/media/{duplicate.id}",
                "thumbnail_url": f"/api/v1/media/{duplicate.id}/thumbnail" if duplicate.mime_type.startswith("image/") else None,
            }
        }
    return {"exists": False}


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_media(
    file: UploadFile,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload a media file using chunked streaming disk buffers, incremental SHA-256, and S3 thread pool execution."""
    settings = get_settings()

    # Validate MIME type
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {file.content_type}. Allowed: {', '.join(sorted(ALLOWED_MIME_TYPES))}",
        )

    # 1. Create temp file directory
    temp_dir = Path("app/temp")
    temp_dir.mkdir(parents=True, exist_ok=True)
    temp_file_path = temp_dir / f"{uuid.uuid4()}.tmp"

    sha256 = hashlib.sha256()
    size = 0

    try:
        # Stream file upload in 1MB chunks to disk
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > settings.max_upload_bytes:
                raise HTTPException(
                    status_code=413,
                    detail=f"File too large. Max size: {settings.MAX_UPLOAD_SIZE_MB}MB",
                )
            sha256.update(chunk)
            # Write chunk to temp file
            with open(temp_file_path, "ab") as f:
                f.write(chunk)
        
        file_hash = sha256.hexdigest()

    except Exception as e:
        if temp_file_path.exists():
            temp_file_path.unlink()
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"File streaming failed: {str(e)}")

    # 2. Check for duplicate hash
    dup_result = await db.execute(
        select(MediaAsset).where(
            MediaAsset.user_id == user.id,
            MediaAsset.file_hash == file_hash
        )
    )
    duplicate = dup_result.scalar_one_or_none()
    if duplicate:
        logger.info("upload_deduplicated", asset_id=str(duplicate.id), filename=file.filename)
        # Clean up temp file
        if temp_file_path.exists():
            temp_file_path.unlink()
        return {
            "id": str(duplicate.id),
            "filename": duplicate.original_filename,
            "mime_type": duplicate.mime_type,
            "size_bytes": duplicate.size_bytes,
            "width": duplicate.width,
            "height": duplicate.height,
            "folder_name": duplicate.folder_name,
            "status": duplicate.status,
            "extraction_status": duplicate.extraction_status,
            "token_count": duplicate.token_count,
            "url": f"/api/v1/media/{duplicate.id}",
            "thumbnail_url": f"/api/v1/media/{duplicate.id}/thumbnail" if duplicate.mime_type.startswith("image/") else None,
            "deduplicated": True,
        }

    # 3. Upload to S3 via threadpool
    file_id = uuid.uuid4()
    ext = Path(file.filename).suffix if file.filename else ""
    file_key = f"uploads/{user.id}/{file_id}{ext}"

    # Perform blocking S3 upload inside a threadpool
    upload_success = await run_in_threadpool(
        upload_file_to_s3, temp_file_path, file_key, file.content_type
    )

    if not upload_success:
        if temp_file_path.exists():
            temp_file_path.unlink()
        raise HTTPException(status_code=500, detail="Failed to save file to S3 store.")

    # Image metadata and thumbnail upload in threadpool
    width, height = None, None
    if file.content_type and file.content_type.startswith("image/"):
        try:
            def generate_and_upload_thumbnail():
                with Image.open(temp_file_path) as img:
                    w, h = img.size
                    thumb_io = io.BytesIO()
                    img.thumbnail((200, 200))
                    img_format = img.format or "PNG"
                    img.save(thumb_io, format=img_format)
                    thumb_bytes = thumb_io.getvalue()
                    thumb_key = f"uploads/{user.id}/{file_id}_thumb{ext}"
                    upload_bytes_to_s3(thumb_bytes, thumb_key, file.content_type)
                    return w, h

            width, height = await run_in_threadpool(generate_and_upload_thumbnail)
        except Exception as e:
            logger.error("thumbnail_generation_failed", error=str(e))

    # Clean up temp file
    if temp_file_path.exists():
        temp_file_path.unlink()

    # Determine parsability
    is_parsable = file.content_type in (
        "application/pdf", "text/plain", "text/csv", "text/markdown",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )

    asset = MediaAsset(
        id=file_id,
        user_id=user.id,
        file_key=file_key,
        mime_type=file.content_type or "application/octet-stream",
        original_filename=file.filename or "unknown",
        size_bytes=size,
        width=width,
        height=height,
        file_hash=file_hash,
        status="processing" if is_parsable else "completed",
        extraction_status="processing" if is_parsable else "none",
    )
    db.add(asset)
    
    try:
        await db.commit()
    except Exception as e:
        logger.error("db_commit_failed_media", error=str(e))
        await db.rollback()
        await run_in_threadpool(delete_file_from_s3, file_key)
        if file.content_type and file.content_type.startswith("image/"):
            await run_in_threadpool(delete_file_from_s3, f"uploads/{user.id}/{file_id}_thumb{ext}")
        raise HTTPException(status_code=500, detail="Database write failed. Cleaned up S3 upload.")

    # Enqueue text extraction via ARQ Redis worker
    if is_parsable:
        try:
            arq_redis = await get_arq_redis()
            await arq_redis.enqueue_job("process_document_task", str(file_id), file_key, file.content_type)
            await arq_redis.close()
            logger.info("enqueued_arq_job", asset_id=str(file_id))
        except Exception as e:
            logger.error("arq_enqueue_failed", asset_id=str(file_id), error=str(e))
            asset.status = "failed"
            asset.extraction_status = "failed"
            await db.commit()

    logger.info("media_uploaded", asset_id=str(file_id), mime=file.content_type, size=size)

    return {
        "id": str(asset.id),
        "filename": asset.original_filename,
        "mime_type": asset.mime_type,
        "size_bytes": asset.size_bytes,
        "width": width,
        "height": height,
        "folder_name": asset.folder_name,
        "status": asset.status,
        "extraction_status": asset.extraction_status,
        "token_count": asset.token_count,
        "url": f"/api/v1/media/{file_id}",
        "thumbnail_url": f"/api/v1/media/{file_id}/thumbnail" if asset.mime_type.startswith("image/") else None,
    }


@router.post("/url", status_code=status.HTTP_201_CREATED)
async def scrap_media_url(
    body: ScrapUrlRequest,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Scrape a media asset from a URL link in chunks, stream to Cellar S3 off-thread, and update database."""
    settings = get_settings()
    url = body.url

    temp_dir = Path("app/temp")
    temp_dir.mkdir(parents=True, exist_ok=True)
    temp_file_path = temp_dir / f"{uuid.uuid4()}.tmp"

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # 1. HEAD request pre-flight size/mime check
            pre_flight = await client.head(url, follow_redirects=True)
            content_type = pre_flight.headers.get("content-type", "").split(";")[0].strip()
            content_length_str = pre_flight.headers.get("content-length", "0")
            
            try:
                content_length = int(content_length_str)
            except ValueError:
                content_length = 0

            # Pre-flight checks
            if content_type and content_type not in ALLOWED_MIME_TYPES:
                raise HTTPException(
                    status_code=400,
                    detail=f"Unsupported file type scraped: {content_type}."
                )
            if content_length > settings.max_upload_bytes:
                raise HTTPException(
                    status_code=413,
                    detail=f"Scraped file too large ({content_length_str} bytes). Max limit: {settings.MAX_UPLOAD_SIZE_MB}MB"
                )

            # 2. Stream chunked download directly to temp disk file while hashing
            sha256 = hashlib.sha256()
            size = 0

            async with client.stream("GET", url, follow_redirects=True) as response:
                if response.status_code != 200:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Failed to download file from link. Server returned status {response.status_code}"
                    )
                
                if not content_type:
                    content_type = response.headers.get("content-type", "application/octet-stream").split(";")[0].strip()
                if content_type not in ALLOWED_MIME_TYPES:
                    raise HTTPException(status_code=400, detail=f"Unsupported file type scraped: {content_type}.")

                async for chunk in response.aiter_bytes(chunk_size=1024 * 1024):
                    size += len(chunk)
                    if size > settings.max_upload_bytes:
                        raise HTTPException(
                            status_code=413,
                            detail=f"Scraped file too large. Max limit: {settings.MAX_UPLOAD_SIZE_MB}MB"
                        )
                    sha256.update(chunk)
                    with open(temp_file_path, "ab") as f:
                        f.write(chunk)

            file_hash = sha256.hexdigest()

    except Exception as e:
        if temp_file_path.exists():
            temp_file_path.unlink()
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(
            status_code=400,
            detail=f"HTTP network request failed to download the link: {str(e)}"
        )

    # 3. Deduplication Check
    dup_result = await db.execute(
        select(MediaAsset).where(
            MediaAsset.user_id == user.id,
            MediaAsset.file_hash == file_hash
        )
    )
    duplicate = dup_result.scalar_one_or_none()
    if duplicate:
        logger.info("url_scrap_deduplicated", asset_id=str(duplicate.id), url=url)
        if temp_file_path.exists():
            temp_file_path.unlink()
        return {
            "id": str(duplicate.id),
            "filename": duplicate.original_filename,
            "mime_type": duplicate.mime_type,
            "size_bytes": duplicate.size_bytes,
            "width": duplicate.width,
            "height": duplicate.height,
            "folder_name": duplicate.folder_name,
            "status": duplicate.status,
            "extraction_status": duplicate.extraction_status,
            "token_count": duplicate.token_count,
            "url": f"/api/v1/media/{duplicate.id}",
            "thumbnail_url": f"/api/v1/media/{duplicate.id}/thumbnail" if duplicate.mime_type.startswith("image/") else None,
            "deduplicated": True,
        }

    # Extract filename from URL
    filename = Path(url.split("?")[0]).name or "scraped_file"
    ext = Path(filename).suffix
    if not ext:
        if content_type == "application/pdf":
            ext = ".pdf"
        elif content_type == "text/csv":
            ext = ".csv"
        elif content_type == "text/markdown":
            ext = ".md"
        elif content_type == "text/plain":
            ext = ".txt"

    file_id = uuid.uuid4()
    file_key = f"uploads/{user.id}/{file_id}{ext}"

    # 4. Upload to S3 Cellar via threadpool
    upload_success = await run_in_threadpool(
        upload_file_to_s3, temp_file_path, file_key, content_type
    )

    if not upload_success:
        if temp_file_path.exists():
            temp_file_path.unlink()
        raise HTTPException(status_code=500, detail="Failed to save scraped file to S3 store.")

    # Image metadata and thumbnail upload in threadpool
    width, height = None, None
    if content_type.startswith("image/"):
        try:
            def generate_and_upload_thumbnail():
                with Image.open(temp_file_path) as img:
                    w, h = img.size
                    thumb_io = io.BytesIO()
                    img.thumbnail((200, 200))
                    img_format = img.format or "PNG"
                    img.save(thumb_io, format=img_format)
                    thumb_bytes = thumb_io.getvalue()
                    thumb_key = f"uploads/{user.id}/{file_id}_thumb{ext}"
                    upload_bytes_to_s3(thumb_bytes, thumb_key, content_type)
                    return w, h

            width, height = await run_in_threadpool(generate_and_upload_thumbnail)
        except Exception as e:
            logger.error("thumbnail_generation_failed", error=str(e))

    # Clean up temp file
    if temp_file_path.exists():
        temp_file_path.unlink()

    # Determine parsability
    is_parsable = content_type in (
        "application/pdf", "text/plain", "text/csv", "text/markdown",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )

    asset = MediaAsset(
        id=file_id,
        user_id=user.id,
        file_key=file_key,
        mime_type=content_type,
        original_filename=filename,
        size_bytes=size,
        width=width,
        height=height,
        file_hash=file_hash,
        status="processing" if is_parsable else "completed",
        extraction_status="processing" if is_parsable else "none",
        source_url=url,
    )
    db.add(asset)

    try:
        await db.commit()
    except Exception as e:
        logger.error("db_commit_failed_scraped_media", error=str(e))
        await db.rollback()
        await run_in_threadpool(delete_file_from_s3, file_key)
        if content_type.startswith("image/"):
            await run_in_threadpool(delete_file_from_s3, f"uploads/{user.id}/{file_id}_thumb{ext}")
        raise HTTPException(status_code=500, detail="Database write failed. Cleaned up S3 upload.")

    # Enqueue text extraction via ARQ Redis worker
    if is_parsable:
        try:
            arq_redis = await get_arq_redis()
            await arq_redis.enqueue_job("process_document_task", str(file_id), file_key, content_type)
            await arq_redis.close()
            logger.info("enqueued_arq_job", asset_id=str(file_id))
        except Exception as e:
            logger.error("arq_enqueue_failed", asset_id=str(file_id), error=str(e))
            asset.status = "failed"
            asset.extraction_status = "failed"
            await db.commit()

    logger.info("url_scraped", asset_id=str(file_id), mime=content_type, size=size)

    return {
        "id": str(asset.id),
        "filename": asset.original_filename,
        "mime_type": asset.mime_type,
        "size_bytes": asset.size_bytes,
        "width": width,
        "height": height,
        "folder_name": asset.folder_name,
        "status": asset.status,
        "extraction_status": asset.extraction_status,
        "token_count": asset.token_count,
        "url": f"/api/v1/media/{file_id}",
        "thumbnail_url": f"/api/v1/media/{file_id}/thumbnail" if asset.mime_type.startswith("image/") else None,
    }


@router.get("/{asset_id}")
async def get_media(
    asset_id: uuid.UUID,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Serve a media asset by downloading it from S3/Cellar in a non-blocking threadpool."""
    result = await db.execute(
        select(MediaAsset).where(MediaAsset.id == asset_id, MediaAsset.user_id == user.id)
    )
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Media not found")

    content = await run_in_threadpool(download_bytes_from_s3, asset.file_key)
    if not content:
        raise HTTPException(status_code=404, detail="File not found in object storage.")

    return Response(
        content=content,
        media_type=asset.mime_type,
        headers={
            "Content-Disposition": f'inline; filename="{asset.original_filename}"'
        }
    )


@router.get("/{asset_id}/thumbnail")
async def get_thumbnail(
    asset_id: uuid.UUID,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Serve a media thumbnail by downloading it from S3/Cellar in a non-blocking threadpool."""
    result = await db.execute(
        select(MediaAsset).where(MediaAsset.id == asset_id, MediaAsset.user_id == user.id)
    )
    asset = result.scalar_one_or_none()
    if not asset or not asset.mime_type.startswith("image/"):
        raise HTTPException(status_code=404, detail="Thumbnail not found")

    ext = Path(asset.original_filename).suffix
    thumb_key = f"uploads/{user.id}/{asset.id}_thumb{ext}"
    
    content = await run_in_threadpool(download_bytes_from_s3, thumb_key)
    if not content:
        # Fallback to original image if thumbnail not found
        content = await run_in_threadpool(download_bytes_from_s3, asset.file_key)
        if not content:
            raise HTTPException(status_code=404, detail="Thumbnail not found")

    return Response(content=content, media_type=asset.mime_type)


@router.delete("/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_media(
    asset_id: uuid.UUID,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a media asset from DB and S3 Object Storage in a non-blocking threadpool."""
    result = await db.execute(
        select(MediaAsset).where(MediaAsset.id == asset_id, MediaAsset.user_id == user.id)
    )
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Media not found")

    # Delete original from S3
    await run_in_threadpool(delete_file_from_s3, asset.file_key)

    # Delete thumbnail if it's an image
    if asset.mime_type.startswith("image/"):
        ext = Path(asset.original_filename).suffix
        thumb_key = f"uploads/{user.id}/{asset.id}_thumb{ext}"
        await run_in_threadpool(delete_file_from_s3, thumb_key)

    # Cascading database deletes (including ChatResources)
    await db.execute(delete(ChatResource).where(ChatResource.media_asset_id == asset.id))
    await db.delete(asset)
    await db.commit()


# ── AI & Heuristic Smart Folder Organization ──────────────────────────────────

@router.post("/organize", status_code=status.HTTP_200_OK)
async def organize_media(
    body: OrganizeRequest,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Organize user's files into smart folders based on a strategy (ai, type, size, month)."""
    strategy = body.strategy.lower()
    allowed_strategies = {"ai", "type", "size", "month"}
    if strategy not in allowed_strategies:
        raise HTTPException(status_code=400, detail=f"Invalid strategy. Allowed: {allowed_strategies}")

    # Fetch all user assets
    result = await db.execute(
        select(MediaAsset)
        .where(MediaAsset.user_id == user.id)
        .order_by(MediaAsset.created_at.desc())
    )
    assets = result.scalars().all()
    if not assets:
        return []

    if strategy == "type":
        # Group by MIME categories
        for asset in assets:
            mime = asset.mime_type.lower()
            if mime.startswith("image/"):
                asset.folder_name = "Images"
            elif mime.startswith("audio/") or mime.startswith("video/"):
                asset.folder_name = "Media & Audio"
            elif mime in ("application/pdf", "text/plain", "text/markdown",
                          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"):
                asset.folder_name = "Documents"
            elif mime == "text/csv" or mime == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
                asset.folder_name = "Spreadsheets"
            else:
                asset.folder_name = "Archives & Code"

    elif strategy == "size":
        # Group by size thresholds
        for asset in assets:
            sz = asset.size_bytes
            if sz > 10 * 1024 * 1024:
                asset.folder_name = "Large Files (> 10MB)"
            elif sz > 1 * 1024 * 1024:
                asset.folder_name = "Medium Files (1MB - 10MB)"
            else:
                asset.folder_name = "Small Files (< 1MB)"

    elif strategy == "month":
        # Group by Month and Year of creation
        for asset in assets:
            date_str = asset.created_at.strftime("%B %Y")
            asset.folder_name = date_str

    elif strategy == "ai":
        # Construct LLM prompt to automatically categorize files
        from langchain_core.messages import HumanMessage, SystemMessage
        from app.graph.nodes.llm_caller import _resolve_connection, _build_llm, _build_legacy_llm
        settings = get_settings()

        file_list_info = []
        for asset in assets:
            file_list_info.append({
                "id": str(asset.id),
                "filename": asset.original_filename,
                "mime_type": asset.mime_type,
                "size_bytes": asset.size_bytes,
                "token_count": asset.token_count or 0,
            })

        system_prompt = (
            "You are an expert AI file organizing assistant. "
            "Given a JSON array of files, categorize each file into a smart virtual folder (e.g., 'Financials', 'Research', 'Designs', 'Personal Recordings', 'Code Scripts'). "
            "Requirements:\n"
            "- Define 4 to 6 descriptive, beautiful category names.\n"
            "- You MUST output ONLY a JSON object map. The keys MUST be the file IDs, and values MUST be their categorized folder names.\n"
            "- Example output: {\"file-id-1\": \"Research\", \"file-id-2\": \"Financials\"}\n"
            "- Do not include markdown code block syntax (```json). Output raw text only."
        )

        user_prompt = f"Categorize the following files:\n{json.dumps(file_list_info, indent=2)}"

        try:
            # Resolve default model ID and construct the LLM client
            conn_info = await _resolve_connection(settings.DEFAULT_MODEL_ID, str(user.id))
            if conn_info:
                llm = _build_llm(
                    model_id=conn_info["model_id"],
                    provider_type=conn_info["provider_type"],
                    base_url=conn_info["base_url"],
                    api_key=conn_info["api_key"],
                    capabilities=conn_info["capabilities"],
                    temperature=0.2,
                    max_tokens=1000,
                )
                if conn_info["provider_type"] == "openai":
                    llm = llm.bind(response_format={"type": "json_object"})
            else:
                llm = _build_legacy_llm(settings.DEFAULT_MODEL_ID, temperature=0.2, max_tokens=1000)
                if settings.DEFAULT_MODEL_ID.startswith(("gpt-", "o1-", "o3-")):
                    llm = llm.bind(response_format={"type": "json_object"})

            messages = [
                SystemMessage(content=system_prompt),
                HumanMessage(content=user_prompt),
            ]
            response = await llm.ainvoke(messages)
            raw_text = response.content.strip() if isinstance(response.content, str) else ""
            
            # Sanity strip block formatting if generated anyway
            if raw_text.startswith("```json"):
                raw_text = raw_text.replace("```json", "", 1).rsplit("```", 1)[0].strip()
            elif raw_text.startswith("```"):
                raw_text = raw_text.replace("```", "", 1).rsplit("```", 1)[0].strip()

            mapping = json.loads(raw_text)
            
            for asset in assets:
                asset_id_str = str(asset.id)
                if asset_id_str in mapping:
                    asset.folder_name = mapping[asset_id_str].strip()
                else:
                    asset.folder_name = "General"

        except Exception as e:
            logger.warning("ai_organization_failed", error=str(e))
            # Heuristic fallback to Type if LLM fails
            for asset in assets:
                asset.folder_name = "AI Fallback"

    await db.commit()

    # Return refreshed list
    return [
        {
            "id": str(asset.id),
            "filename": asset.original_filename,
            "mime_type": asset.mime_type,
            "size_bytes": asset.size_bytes,
            "width": asset.width,
            "height": asset.height,
            "folder_name": asset.folder_name,
            "status": asset.status,
            "extraction_status": asset.extraction_status,
            "token_count": asset.token_count,
            "created_at": asset.created_at.isoformat(),
            "url": f"/api/v1/media/{asset.id}",
            "thumbnail_url": f"/api/v1/media/{asset.id}/thumbnail" if asset.mime_type.startswith("image/") else None,
        }
        for asset in assets
    ]


# ── Conversation Bindings (Chat Resources) ───────────────────────────────────

@router.post("/conversations/{conversation_id}/attach", status_code=status.HTTP_200_OK)
async def attach_conversation_resources(
    conversation_id: uuid.UUID,
    body: AttachResourcesRequest,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Link media assets to a specific conversation as active chat resources."""
    # Verify active assets belong to user
    res = await db.execute(
        select(MediaAsset).where(
            MediaAsset.id.in_(body.media_asset_ids),
            MediaAsset.user_id == user.id
        )
    )
    assets = res.scalars().all()
    valid_ids = {asset.id for asset in assets}

    attached_count = 0
    for asset_id in body.media_asset_ids:
        if asset_id not in valid_ids:
            continue
        
        # Check if already attached
        dup = await db.execute(
            select(ChatResource).where(
                ChatResource.conversation_id == conversation_id,
                ChatResource.media_asset_id == asset_id
            )
        )
        if dup.scalar_one_or_none():
            continue

        resource = ChatResource(
            conversation_id=conversation_id,
            media_asset_id=asset_id,
            is_active=True
        )
        db.add(resource)
        attached_count += 1
        
    await db.commit()
    logger.info("resources_attached", conversation_id=str(conversation_id), count=attached_count)
    return {"status": "ok", "attached_count": attached_count}


@router.delete("/conversations/{conversation_id}/detach/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def detach_conversation_resource(
    conversation_id: uuid.UUID,
    asset_id: uuid.UUID,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Detach a media asset from a specific conversation."""
    res = await db.execute(
        select(ChatResource)
        .join(MediaAsset, ChatResource.media_asset_id == MediaAsset.id)
        .where(
            ChatResource.conversation_id == conversation_id,
            ChatResource.media_asset_id == asset_id,
            MediaAsset.user_id == user.id
        )
    )
    resource = res.scalar_one_or_none()
    if not resource:
        raise HTTPException(status_code=404, detail="Attached chat resource not found.")

    await db.delete(resource)
    await db.commit()


@router.get("/conversations/{conversation_id}/resources", status_code=status.HTTP_200_OK)
async def list_conversation_resources(
    conversation_id: uuid.UUID,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve all active media resources linked to a specific conversation."""
    res = await db.execute(
        select(MediaAsset)
        .join(ChatResource, ChatResource.media_asset_id == MediaAsset.id)
        .where(
            ChatResource.conversation_id == conversation_id,
            ChatResource.is_active == True,
            MediaAsset.user_id == user.id
        )
        .order_by(ChatResource.attached_at.desc())
    )
    assets = res.scalars().all()

    return [
        {
            "id": str(asset.id),
            "filename": asset.original_filename,
            "mime_type": asset.mime_type,
            "size_bytes": asset.size_bytes,
            "folder_name": asset.folder_name,
            "status": asset.status,
            "extraction_status": asset.extraction_status,
            "token_count": asset.token_count,
            "url": f"/api/v1/media/{asset.id}",
            "thumbnail_url": f"/api/v1/media/{asset.id}/thumbnail" if asset.mime_type.startswith("image/") else None,
        }
        for asset in assets
    ]
