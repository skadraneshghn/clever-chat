# ═══════════════════════════════════════════════════════════════════════════
# CleverChat — Multi-stage Dockerfile
# Stage 1: Build Next.js frontend
# Stage 2: Production runtime with Caddy reverse proxy
# ═══════════════════════════════════════════════════════════════════════════

# ── Stage 1: Build Frontend ──────────────────────────────────────────────
FROM node:22-slim AS frontend-builder

WORKDIR /app/frontend

# Install deps (cache layer)
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund

# Copy source and build
COPY frontend/ ./

# The API URL is relative — same origin (Caddy proxies /api/* to backend)
ENV NEXT_PUBLIC_API_URL=""
RUN npm run build

# ── Stage 2: Production Runtime ──────────────────────────────────────────
FROM python:3.12-slim AS production

# Install Node.js + Caddy
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    debian-keyring \
    debian-archive-keyring \
    apt-transport-https \
    gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg \
    && curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends nodejs caddy \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Backend Setup ────────────────────────────────────────────────────────
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/ ./backend/

# ── Frontend Setup (standalone output) ───────────────────────────────────
COPY --from=frontend-builder /app/frontend/.next/standalone ./frontend/
COPY --from=frontend-builder /app/frontend/.next/static ./frontend/.next/static
COPY --from=frontend-builder /app/frontend/public ./frontend/public

# ── Caddy Config + Startup ───────────────────────────────────────────────
COPY Caddyfile ./
COPY start.sh ./
RUN chmod +x start.sh

# ── Environment ──────────────────────────────────────────────────────────
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    NODE_ENV=production

# Clever Cloud injects PORT (default 8080)
EXPOSE 8080

CMD ["./start.sh"]
