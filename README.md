# 🤖 CleverChat

**Production-grade AI Chat Platform** built with FastAPI, LangGraph, Next.js 16, and PostgreSQL (pgvector).

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  Frontend (Next.js 16 + Tailwind v4)                                │
│  ├─ Auth Pages (Login/Register)                                     │
│  ├─ Chat Interface (SSE Streaming)                                  │
│  ├─ Settings Dashboard                                              │
│  └─ Zustand State Management                                       │
├──────────────────────────────────────────────────────────────────────┤
│  Backend (FastAPI + LangGraph)                                      │
│  ├─ JWT Auth with Refresh Tokens                                    │
│  ├─ LangGraph Agent (4-node pipeline)                               │
│  ├─ SSE Token Streaming                                             │
│  ├─ Multi-core Gunicorn + Uvicorn Workers                           │
│  └─ pgvector Embeddings (RAG)                                       │
├──────────────────────────────────────────────────────────────────────┤
│  Data (PostgreSQL 17 + pgvector + Redis)                            │
│  ├─ Users, Sessions, Conversations, Messages                        │
│  ├─ JSONB Content Blocks (multimodal)                               │
│  └─ Vector Embeddings for Retrieval                                 │
└──────────────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | Next.js 16, React 19, Tailwind CSS v4, Zustand, Motion, React Query |
| **Backend** | FastAPI, LangGraph, SQLAlchemy 2.0 (async), Pydantic v2, structlog |
| **Database** | PostgreSQL 17 + pgvector, Redis |
| **LLM** | OpenAI (GPT-4o), Anthropic (Claude) via LangChain |
| **Deployment** | Clever Cloud |

## Deployment (Clever Cloud)

This project is deployed as **two separate apps** on Clever Cloud:

### Backend (Python App)

- **Type:** Python
- **App Directory:** `backend/`
- **Addons:** PostgreSQL (pgvector), Redis
- **Run Command:** `gunicorn -c gunicorn_config.py main:app`

**Required Environment Variables:**
```bash
# Auto-injected by Clever Cloud addons:
# POSTGRESQL_ADDON_URI, POSTGRESQL_ADDON_HOST, etc.
# REDIS_HOST, REDIS_PORT, REDIS_PASSWORD

# Must set manually:
SECRET_KEY=<generate-64-char-random-string>
CORS_ORIGINS=https://your-frontend-url.cleverapps.io
OPENAI_API_KEY=sk-...
# or
ANTHROPIC_API_KEY=sk-ant-...
```

Set via Clever Cloud dashboard or CLI:
```bash
clever env set SECRET_KEY "$(openssl rand -hex 32)"
clever env set CORS_ORIGINS "https://your-frontend.cleverapps.io"
clever env set OPENAI_API_KEY "sk-..."
clever env set CC_PYTHON_VERSION "3.12"
```

### Frontend (Node.js App)

- **Type:** Node.js
- **App Directory:** `frontend/`
- **Build:** `npm ci && npm run build`
- **Start:** `node .next/standalone/server.js`

**Required Environment Variables:**
```bash
NEXT_PUBLIC_API_URL=https://your-backend-url.cleverapps.io
PORT=8080
```

Set via Clever Cloud:
```bash
clever env set NEXT_PUBLIC_API_URL "https://your-backend.cleverapps.io"
clever env set CC_NODE_VERSION "22"
clever env set CC_POST_BUILD_HOOK "cp -r .next/static .next/standalone/.next/ && cp -r public .next/standalone/"
```

### pgvector Extension

The PostgreSQL addon on Clever Cloud supports pgvector. Enable it by running:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```
This is done automatically by the backend on first startup.

## Local Development

```bash
# Backend
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # Edit with your values
uvicorn main:app --reload --port 8080

# Frontend
cd frontend
npm install
cp .env.local.example .env.local  # Edit with your values
npm run dev
```

## Project Structure

```
clever-chat/
├── backend/
│   ├── main.py                  # FastAPI entry point
│   ├── gunicorn_config.py       # Production server config
│   ├── requirements.txt         # Python dependencies
│   └── app/
│       ├── api/                 # REST endpoints
│       ├── core/                # Config, DB, Auth, Process Pool
│       ├── graph/               # LangGraph agent pipeline
│       ├── middleware/          # Request logging
│       ├── models/              # SQLAlchemy ORM models
│       └── services/            # Business logic
├── frontend/
│   ├── app/                     # Next.js pages
│   ├── components/              # React components
│   ├── stores/                  # Zustand state management
│   ├── hooks/                   # Custom hooks (SSE streaming)
│   ├── lib/                     # Utilities
│   └── types/                   # TypeScript types
└── docker-compose.yml           # Local PostgreSQL + pgvector
```

## License

MIT
