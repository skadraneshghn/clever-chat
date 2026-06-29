#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# CleverChat — Startup Script
# Runs Caddy (reverse proxy), Backend (Gunicorn), Frontend (Next.js)
# Caddy listens on PORT (Clever Cloud), proxies to internal services
# ═══════════════════════════════════════════════════════════════════════════

# No set -e — we manage errors manually to avoid killing the script on
# background process failures

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

# Give backend time to initialize (DB connection + table creation)
sleep 4

# ── Start Caddy (reverse proxy — main entry point) ─────────────────────
cd /app
PORT="${CC_PORT}" caddy run --config /app/Caddyfile --adapter caddyfile &
CADDY_PID=$!
echo "   ✓ Caddy started (PID: $CADDY_PID)"

echo ""
echo "✅ All services running!"
echo "   App URL: http://0.0.0.0:${CC_PORT}"

# ── Signal Handling ──────────────────────────────────────────────────────
cleanup() {
    echo "🛑 Shutting down all services..."
    kill "$CADDY_PID" "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null
    wait "$CADDY_PID" "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null
    echo "✅ All services stopped"
    exit 0
}
trap cleanup SIGTERM SIGINT

# ── Keep alive — monitor all three processes ─────────────────────────────
while true; do
    # Check if backend is still running
    if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
        echo "💥 Backend died! Shutting down..."
        kill "$CADDY_PID" "$FRONTEND_PID" 2>/dev/null
        exit 1
    fi
    # Check if frontend is still running
    if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
        echo "💥 Frontend died! Shutting down..."
        kill "$CADDY_PID" "$BACKEND_PID" 2>/dev/null
        exit 1
    fi
    # Check if caddy is still running
    if ! kill -0 "$CADDY_PID" 2>/dev/null; then
        echo "💥 Caddy died! Shutting down..."
        kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null
        exit 1
    fi
    sleep 5
done
