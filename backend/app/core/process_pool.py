"""ProcessPoolExecutor singleton for CPU-bound work (embeddings, media, etc.)."""

from __future__ import annotations

import os
from concurrent.futures import ProcessPoolExecutor

from app.core.config import get_settings

_executor: ProcessPoolExecutor | None = None


def _warm_up_worker() -> None:
    """Pre-import heavy libraries in each subprocess to avoid first-call latency."""
    try:
        import PIL  # noqa: F401
        import pypdf  # noqa: F401
    except ImportError:
        pass  # Optional dependencies may not be installed


def init_process_pool() -> ProcessPoolExecutor:
    """Create and return the global ProcessPoolExecutor."""
    global _executor
    settings = get_settings()
    max_workers = settings.PROCESS_POOL_WORKERS or os.cpu_count() or 4
    _executor = ProcessPoolExecutor(
        max_workers=max_workers,
        initializer=_warm_up_worker,
    )
    return _executor


def get_process_pool() -> ProcessPoolExecutor:
    """Return the global ProcessPoolExecutor (must call init_process_pool first)."""
    if _executor is None:
        raise RuntimeError("Process pool not initialised — call init_process_pool() first.")
    return _executor


def shutdown_process_pool() -> None:
    """Gracefully shut down the process pool."""
    global _executor
    if _executor is not None:
        _executor.shutdown(wait=True, cancel_futures=True)
        _executor = None
