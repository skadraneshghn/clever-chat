"""Background process worker using arq to run heavy CPU-bound document text/table extractions."""

import asyncio
import os
import uuid
import structlog
from urllib.parse import urlparse
from arq.connections import RedisSettings
from sqlalchemy import select
from fastapi.concurrency import run_in_threadpool

from app.core.config import get_settings
from app.core.database import get_db_context
from app.models.media_asset import MediaAsset
from app.services.extractor import process_document_content, count_tokens
from app.services.s3_storage import download_bytes_from_s3

# Configure logging
structlog.configure(
    processors=[
        structlog.processors.JSONRenderer()
    ]
)
logger = structlog.get_logger()


async def process_document_task(ctx: dict, asset_id: str, file_key: str, mime_type: str):
    """Worker task that runs text/table extraction off-thread to prevent event loop lag."""
    logger.info("worker_task_started", asset_id=asset_id, file_key=file_key, mime_type=mime_type)
    
    # 1. Download document from S3 in threadpool (blocking I/O)
    content = await run_in_threadpool(download_bytes_from_s3, file_key)
    if not content:
        logger.error("worker_task_download_failed", asset_id=asset_id, file_key=file_key)
        async with get_db_context() as db:
            result = await db.execute(select(MediaAsset).where(MediaAsset.id == uuid.UUID(asset_id)))
            asset = result.scalar_one_or_none()
            if asset:
                asset.status = "failed"
                asset.extraction_status = "failed"
                await db.commit()
        return

    # 2. Extract content & count tokens off-thread (heavy CPU)
    try:
        extracted_text = await run_in_threadpool(process_document_content, content, mime_type)
        token_count = await run_in_threadpool(count_tokens, extracted_text)
        
        # 3. Update asset record
        async with get_db_context() as db:
            result = await db.execute(select(MediaAsset).where(MediaAsset.id == uuid.UUID(asset_id)))
            asset = result.scalar_one_or_none()
            if asset:
                asset.extracted_text = extracted_text
                asset.token_count = token_count
                asset.extraction_status = "success" if extracted_text else "none"
                asset.status = "completed"
                await db.commit()
                logger.info("worker_task_success", asset_id=asset_id, token_count=token_count)
            else:
                logger.error("worker_task_asset_not_found", asset_id=asset_id)
    except Exception as e:
        logger.error("worker_task_failed", asset_id=asset_id, error=str(e))
        async with get_db_context() as db:
            result = await db.execute(select(MediaAsset).where(MediaAsset.id == uuid.UUID(asset_id)))
            asset = result.scalar_one_or_none()
            if asset:
                asset.status = "failed"
                asset.extraction_status = "failed"
                await db.commit()


# Redis Connection settings configuration
settings = get_settings()
parsed_redis = urlparse(settings.redis_url)

redis_settings = RedisSettings(
    host=parsed_redis.hostname or "localhost",
    port=parsed_redis.port or 6379,
    password=parsed_redis.password,
    database=int(parsed_redis.path.lstrip("/")) if parsed_redis.path else 0
)


async def startup(ctx):
    logger.info("arq_worker_startup_successful")


async def shutdown(ctx):
    logger.info("arq_worker_shutdown_successful")


class WorkerSettings:
    functions = [process_document_task]
    redis_settings = redis_settings
    on_startup = startup
    on_shutdown = shutdown
