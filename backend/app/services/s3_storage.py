"""S3-compatible Object Storage service for Clever Cloud Cellar."""

from __future__ import annotations

import logging
from pathlib import Path
import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

from app.core.config import get_settings

logger = logging.getLogger(__name__)


def get_s3_client():
    """Build and return a boto3 S3 client configured for Clever Cloud Cellar."""
    settings = get_settings()
    # Cellar endpoint host needs to start with https://
    endpoint_url = settings.CELLAR_ADDON_HOST
    if not endpoint_url.startswith("http://") and not endpoint_url.startswith("https://"):
        endpoint_url = f"https://{endpoint_url}"

    return boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=settings.CELLAR_ADDON_KEY_ID,
        aws_secret_access_key=settings.CELLAR_ADDON_KEY_SECRET,
        config=Config(signature_version="s3v4"),
        region_name="us-east-1",  # Cellar ignore region, but boto3 requires region_name
    )


def ensure_bucket_exists() -> bool:
    """Ensure that the CELLAR_BUCKET exists on the Cellar addon. Creates it if not present."""
    settings = get_settings()
    bucket = settings.CELLAR_BUCKET
    s3 = get_s3_client()
    try:
        s3.head_bucket(Bucket=bucket)
        logger.info(f"S3 Bucket {bucket} exists")
        return True
    except ClientError as e:
        error_code = e.response.get("Error", {}).get("Code")
        if error_code in ("404", "NoSuchBucket"):
            try:
                # Cellar does not support CreateBucketConfiguration, just standard create
                s3.create_bucket(Bucket=bucket)
                logger.info(f"Created S3 Bucket {bucket}")
                return True
            except Exception as create_err:
                logger.error(f"Failed to create S3 Bucket {bucket}: {create_err}")
                return False
        else:
            logger.error(f"Error checking S3 Bucket {bucket}: {e}")
            return False


def upload_bytes_to_s3(content: bytes, object_name: str, content_type: str = "application/octet-stream") -> bool:
    """Upload raw bytes to S3 Object Storage."""
    settings = get_settings()
    bucket = settings.CELLAR_BUCKET
    s3 = get_s3_client()
    try:
        s3.put_object(
            Bucket=bucket,
            Key=object_name,
            Body=content,
            ContentType=content_type,
        )
        logger.info(f"Successfully uploaded {object_name} to S3 bucket {bucket}")
        return True
    except Exception as e:
        logger.error(f"Failed to upload bytes to S3: {e}")
        return False


def upload_file_to_s3(file_path: Path | str, object_name: str, content_type: str = "application/octet-stream") -> bool:
    """Upload a local file to S3 Object Storage."""
    path = Path(file_path)
    if not path.exists():
        logger.error(f"Local file {file_path} does not exist for upload.")
        return False

    settings = get_settings()
    bucket = settings.CELLAR_BUCKET
    s3 = get_s3_client()
    try:
        s3.upload_file(
            Filename=str(path),
            Bucket=bucket,
            Key=object_name,
            ExtraArgs={"ContentType": content_type},
        )
        logger.info(f"Successfully uploaded file {file_path} to S3 as {object_name}")
        return True
    except Exception as e:
        logger.error(f"Failed to upload file to S3: {e}")
        return False


def download_bytes_from_s3(object_name: str) -> bytes | None:
    """Download raw bytes from S3 Object Storage."""
    settings = get_settings()
    bucket = settings.CELLAR_BUCKET
    s3 = get_s3_client()
    try:
        response = s3.get_object(Bucket=bucket, Key=object_name)
        return response["Body"].read()
    except Exception as e:
        logger.error(f"Failed to download {object_name} from S3: {e}")
        return None


def download_file_from_s3(object_name: str, dest_path: Path | str) -> bool:
    """Download a file from S3 Object Storage to a local path."""
    dest = Path(dest_path)
    dest.parent.mkdir(parents=True, exist_ok=True)
    settings = get_settings()
    bucket = settings.CELLAR_BUCKET
    s3 = get_s3_client()
    try:
        s3.download_file(Bucket=bucket, Key=object_name, Filename=str(dest))
        logger.info(f"Successfully downloaded {object_name} to local path {dest_path}")
        return True
    except Exception as e:
        logger.error(f"Failed to download file from S3: {e}")
        return False


def delete_file_from_s3(object_name: str) -> bool:
    """Delete a file from S3 Object Storage."""
    settings = get_settings()
    bucket = settings.CELLAR_BUCKET
    s3 = get_s3_client()
    try:
        s3.delete_object(Bucket=bucket, Key=object_name)
        logger.info(f"Successfully deleted {object_name} from S3 bucket {bucket}")
        return True
    except Exception as e:
        logger.error(f"Failed to delete {object_name} from S3: {e}")
        return False


def get_s3_presigned_url(object_name: str, expires_in: int = 3600) -> str | None:
    """Generate a presigned URL to share/view an object directly."""
    settings = get_settings()
    bucket = settings.CELLAR_BUCKET
    s3 = get_s3_client()
    try:
        url = s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket, "Key": object_name},
            ExpiresIn=expires_in,
        )
        return url
    except Exception as e:
        logger.error(f"Failed to generate presigned URL for {object_name}: {e}")
        return None
