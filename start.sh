#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# CleverChat — Startup Script
# Runs Caddy (reverse proxy), Backend (Gunicorn), Frontend (Next.js)
# Caddy listens on PORT (Clever Cloud), proxies to internal services
# ═══════════════════════════════════════════════════════════════════════════

set -e

CC_PORT="${PORT:-8080}"

echo "🚀 Starting CleverChat..."
echo "   Caddy    → 0.0.0.0:${CC_PORT} (reverse proxy)"
echo "   Backend  → localhost:8081 (FastAPI + Gunicorn)"
echo "   Frontend → localhost:3000 (Next.js standalone)"

# ── Start Frontend (Next.js standalone) ─────────────────────────────────
cd /app/frontend
HOSTNAME="0.0.0.0" PORT=3000 node server.js &
FRONTEND_PID=$!
echo "   ✓ Frontend started (PID: $FRONTEND_PID)"

# ── Start Backend (Gunicorn + Uvicorn) ──────────────────────────────────
cd /app/backend
PORT=8081 gunicorn -c gunicorn_config.py main:app &
BACKEND_PID=$!
echo "   ✓ Backend started (PID: $BACKEND_PID)"

# Wait for internal services to be ready
sleep 2

# ── Start Caddy (reverse proxy — main entry point) ─────────────────────
cd /app
PORT="${CC_PORT}" caddy run --config /app/Caddyfile --adapter caddyfile &
CADDY_PID=$!
echo "   ✓ Caddy started (PID: $CADDY_PID)"

echo ""
echo "✅ All services running!"
echo "   App URL: http://0.0.0.0:${CC_PORT}"

# ── Process Management ──────────────────────────────────────────────────
# Trap signals and forward to children
trap 'echo "Shutting down..."; kill $CADDY_PID $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0' SIGTERM SIGINT

# Wait for any process to exit — if one dies, stop all
wait -n $CADDY_PID $BACKEND_PID $FRONTEND_PID
EXIT_CODE=$?

echo "⚠️  A service exited (code: $EXIT_CODE), shutting down..."
kill $CADDY_PID $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
exit $EXIT_CODE
