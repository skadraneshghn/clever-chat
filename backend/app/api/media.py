"""Advanced Media Upload and File Management API Router.

Integrates S3/Cellar Object Storage, deduplication via SHA-256 hashes,
asynchronous parsing/extraction (PDF, Word, spreadsheets, CSV),
link scraping, AI auto-organization, and many-to-many chat resource attachments.
"""

from __future__ import annotations

import io
import json
import uuid
from pathlib import Path
from datetime import datetime

import httpx
import structlog
from fastapi import APIRouter, Depends, HTTPException, UploadFile, status, BackgroundTasks, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select, and_, delete
from sqlalchemy.ext.asyncio import AsyncSession
from PIL import Image

from app.core.config import get_settings
from app.core.database import get_db, get_db_context
from app.core.security import get_current_user
from app.models.media_asset import MediaAsset
from app.models.chat_resource import ChatResource
from app.services.s3_storage import (
    upload_bytes_to_s3,
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


# ── Background Extraction Worker Helper ──────────────────────────────────────

async def background_extract_task(asset_id: uuid.UUID, content: bytes, mime_type: str):
    """Background task to extract document text, calculate token counts, and save to DB."""
    async with get_db_context() as db:
        try:
            logger.info("background_extraction_start", asset_id=str(asset_id), mime=mime_type)
            
            # Execute parsing/extraction
            extracted_text = process_document_content(content, mime_type)
            token_count = count_tokens(extracted_text)
            
            # Update asset record
            result = await db.execute(select(MediaAsset).where(MediaAsset.id == asset_id))
            asset = result.scalar_one_or_none()
            if asset:
                asset.extracted_text = extracted_text
                asset.token_count = token_count
                asset.extraction_status = "success" if extracted_text else "none"
                asset.status = "completed"
                await db.commit()
                logger.info("background_extraction_completed", asset_id=str(asset_id), tokens=token_count)
        except Exception as e:
            logger.error("background_extraction_failed", asset_id=str(asset_id), error=str(e))
            result = await db.execute(select(MediaAsset).where(MediaAsset.id == asset_id))
            asset = result.scalar_one_or_none()
            if asset:
                asset.extraction_status = "failed"
                asset.status = "failed"
                await db.commit()


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


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_media(
    file: UploadFile,
    background_tasks: BackgroundTasks,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload a media file with SHA-256 stream deduplication and S3/Cellar storage."""
    settings = get_settings()

    # Validate MIME type
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {file.content_type}. Allowed: {', '.join(sorted(ALLOWED_MIME_TYPES))}",
        )

    # Read content
    content = await file.read()
    if len(content) > settings.max_upload_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Max size: {settings.MAX_UPLOAD_SIZE_MB}MB",
        )

    # Calculate SHA-256 hash for deduplication
    file_hash = compute_sha256(content)

    # Deduplication check: check if user has uploaded the same file hash
    dup_result = await db.execute(
        select(MediaAsset).where(
            MediaAsset.user_id == user.id,
            MediaAsset.file_hash == file_hash
        )
    )
    duplicate = dup_result.scalar_one_or_none()
    if duplicate:
        logger.info("upload_deduplicated", asset_id=str(duplicate.id), filename=file.filename)
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

    # Generate keys & upload to S3 Cellar
    file_id = uuid.uuid4()
    ext = Path(file.filename).suffix if file.filename else ""
    file_key = f"uploads/{user.id}/{file_id}{ext}"
    
    # Upload original to S3
    upload_success = upload_bytes_to_s3(content, file_key, file.content_type)
    if not upload_success:
        raise HTTPException(status_code=500, detail="Failed to save file to object store.")

    # Image metadata and S3 thumbnail generation
    width, height = None, None
    if file.content_type and file.content_type.startswith("image/"):
        try:
            with Image.open(io.BytesIO(content)) as img:
                width, height = img.size
                # Generate thumbnail
                thumb_io = io.BytesIO()
                img.thumbnail((200, 200))
                # Preserving format
                img_format = img.format or "PNG"
                img.save(thumb_io, format=img_format)
                thumb_bytes = thumb_io.getvalue()
                # Upload thumbnail to S3
                thumb_key = f"uploads/{user.id}/{file_id}_thumb{ext}"
                upload_bytes_to_s3(thumb_bytes, thumb_key, file.content_type)
        except Exception as e:
            logger.error("thumbnail_generation_failed", error=str(e))

    # Parse and schedule text extraction if it's a document/parsable file
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
        size_bytes=len(content),
        width=width,
        height=height,
        file_hash=file_hash,
        status="processing" if is_parsable else "completed",
        extraction_status="processing" if is_parsable else "none",
    )
    db.add(asset)
    await db.flush()

    if is_parsable:
        background_tasks.add_task(background_extract_task, file_id, content, file.content_type)

    logger.info("media_uploaded", asset_id=str(file_id), mime=file.content_type, size=len(content))

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
    background_tasks: BackgroundTasks,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Scrape a media asset from a URL link, validate size/type, stream to Cellar, and save."""
    settings = get_settings()
    url = body.url

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

            # 2. Fetch full file content
            response = await client.get(url, follow_redirects=True)
            if response.status_code != 200:
                raise HTTPException(
                    status_code=400,
                    detail=f"Failed to download file from link. Server returned status {response.status_code}"
                )
            
            content = response.content
            # Deduce Content-Type if head was empty
            if not content_type:
                content_type = response.headers.get("content-type", "application/octet-stream").split(";")[0].strip()
            
            if content_type not in ALLOWED_MIME_TYPES:
                raise HTTPException(
                    status_code=400,
                    detail=f"Unsupported file type: {content_type}."
                )

    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"HTTP network request failed to download the link: {exc}"
        )

    # 3. Deduplication Check
    file_hash = compute_sha256(content)
    dup_result = await db.execute(
        select(MediaAsset).where(
            MediaAsset.user_id == user.id,
            MediaAsset.file_hash == file_hash
        )
    )
    duplicate = dup_result.scalar_one_or_none()
    if duplicate:
        logger.info("url_scrap_deduplicated", asset_id=str(duplicate.id), url=url)
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
    # Ensure standard filename extension matches MIME
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

    # Upload to S3 Cellar
    upload_success = upload_bytes_to_s3(content, file_key, content_type)
    if not upload_success:
        raise HTTPException(status_code=500, detail="Failed to save scraped file to object store.")

    # Image metadata and S3 thumbnail generation
    width, height = None, None
    if content_type.startswith("image/"):
        try:
            with Image.open(io.BytesIO(content)) as img:
                width, height = img.size
                thumb_io = io.BytesIO()
                img.thumbnail((200, 200))
                img_format = img.format or "PNG"
                img.save(thumb_io, format=img_format)
                thumb_bytes = thumb_io.getvalue()
                thumb_key = f"uploads/{user.id}/{file_id}_thumb{ext}"
                upload_bytes_to_s3(thumb_bytes, thumb_key, content_type)
        except Exception as e:
            logger.error("thumbnail_generation_failed", error=str(e))

    # Parse and schedule text extraction if document
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
        size_bytes=len(content),
        width=width,
        height=height,
        file_hash=file_hash,
        source_url=url,
        status="processing" if is_parsable else "completed",
        extraction_status="processing" if is_parsable else "none",
    )
    db.add(asset)
    await db.flush()

    if is_parsable:
        background_tasks.add_task(background_extract_task, file_id, content, content_type)

    logger.info("media_scraped_url", asset_id=str(file_id), mime=content_type, size=len(content))

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
    """Serve a media asset by downloading it from S3/Cellar."""
    result = await db.execute(
        select(MediaAsset).where(MediaAsset.id == asset_id, MediaAsset.user_id == user.id)
    )
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Media not found")

    content = download_bytes_from_s3(asset.file_key)
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
    """Serve a media thumbnail by downloading it from S3/Cellar."""
    result = await db.execute(
        select(MediaAsset).where(MediaAsset.id == asset_id, MediaAsset.user_id == user.id)
    )
    asset = result.scalar_one_or_none()
    if not asset or not asset.mime_type.startswith("image/"):
        raise HTTPException(status_code=404, detail="Thumbnail not found")

    ext = Path(asset.original_filename).suffix
    thumb_key = f"uploads/{user.id}/{asset.id}_thumb{ext}"
    
    content = download_bytes_from_s3(thumb_key)
    if not content:
        # Fallback to original image if thumbnail not found
        content = download_bytes_from_s3(asset.file_key)
        if not content:
            raise HTTPException(status_code=404, detail="Thumbnail not found")

    return Response(content=content, media_type=asset.mime_type)


@router.delete("/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_media(
    asset_id: uuid.UUID,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a media asset from DB and S3 Object Storage."""
    result = await db.execute(
        select(MediaAsset).where(MediaAsset.id == asset_id, MediaAsset.user_id == user.id)
    )
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Media not found")

    # Delete original from S3
    delete_file_from_s3(asset.file_key)

    # Delete thumbnail if it's an image
    if asset.mime_type.startswith("image/"):
        ext = Path(asset.original_filename).suffix
        thumb_key = f"uploads/{user.id}/{asset.id}_thumb{ext}"
        delete_file_from_s3(thumb_key)

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
            else:
                llm = _build_legacy_llm(settings.DEFAULT_MODEL_ID, temperature=0.2, max_tokens=1000)

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
