"""Per-conversation asyncio lock manager — prevents double-stream race conditions.

In a single-worker deployment (Gunicorn with 1 async worker, or uvicorn),
asyncio.Lock is sufficient to prevent two simultaneous streams on the same
conversation. For multi-worker deployments, replace with Redis-based
distributed locks (e.g., aioredlock).

Usage:
    acquired = await acquire_conversation_lock(conv_id)
    if not acquired:
        raise HTTPException(423, "Already streaming")
    try:
        # ... do streaming work ...
    finally:
        release_conversation_lock(conv_id)
"""

from __future__ import annotations

import asyncio

# Weak-referenced dict: conv_id (str) → asyncio.Lock
# Locks are created on first use and kept alive as long as they're in use.
_conversation_locks: dict[str, asyncio.Lock] = {}


async def acquire_conversation_lock(conv_id: str) -> bool:
    """Try to acquire an exclusive lock for a conversation.

    Returns True if the lock was acquired successfully.
    Returns False if the lock is already held (another stream is active).
    """
    lock = _conversation_locks.setdefault(conv_id, asyncio.Lock())
    if lock.locked():
        return False
    await lock.acquire()
    return True


def release_conversation_lock(conv_id: str) -> None:
    """Release the lock for a conversation. Safe to call even if not locked."""
    lock = _conversation_locks.get(conv_id)
    if lock and lock.locked():
        try:
            lock.release()
        except RuntimeError:
            # Already released — no-op
            pass
    # Clean up the lock entry if nothing holds it to prevent unbounded growth
    if lock and not lock.locked():
        _conversation_locks.pop(conv_id, None)


def is_conversation_locked(conv_id: str) -> bool:
    """Check if a conversation currently has an active stream lock."""
    lock = _conversation_locks.get(conv_id)
    return lock is not None and lock.locked()
