"""Gunicorn configuration for Clever Cloud deployment.

Clever Cloud injects the PORT environment variable.
Workers are auto-calculated based on available CPU cores.
"""

import multiprocessing
import os

# ── Server Socket ────────────────────────────────────────────────────────────
# Clever Cloud sets PORT env var — bind to 0.0.0.0:$PORT
bind = f"0.0.0.0:{os.getenv('PORT', '8080')}"

# ── Worker Processes ─────────────────────────────────────────────────────────
# Formula: (2 × CPU cores) + 1 — optimal for mixed I/O and CPU workloads
# On Clever Cloud, cores vary by plan size
workers = int(os.getenv("GUNICORN_WORKERS", (2 * multiprocessing.cpu_count()) + 1))
worker_class = "uvicorn.workers.UvicornWorker"
worker_connections = 1000

# ── Timeouts ─────────────────────────────────────────────────────────────────
timeout = 120          # Kill worker if it doesn't respond within 120s (long LLM calls)
graceful_timeout = 30  # Time to finish requests during restart
keepalive = 5          # HTTP keep-alive timeout

# ── Worker Lifecycle ─────────────────────────────────────────────────────────
max_requests = 2000          # Recycle workers after N requests to prevent memory leaks
max_requests_jitter = 400    # Spread restarts randomly to avoid thundering herd
preload_app = False          # Don't preload — asyncpg pool must init AFTER fork

# ── Logging ──────────────────────────────────────────────────────────────────
accesslog = "-"
errorlog = "-"
loglevel = os.getenv("GUNICORN_LOG_LEVEL", "info")

# ── Process Naming ───────────────────────────────────────────────────────────
proc_name = "cleverchat"

# ── Forwarded headers (Clever Cloud uses reverse proxy) ──────────────────────
forwarded_allow_ips = "*"
proxy_protocol = False
