# FileGeek — AI Document Intelligence Platform

FileGeek is a full-stack document intelligence platform combining RAG (Retrieval-Augmented Generation), agentic tool-calling, and long-term memory into an intelligent study companion. Upload PDFs, Word docs, images, or audio and have grounded AI conversations with your documents.

## Features

### Core AI
- **Zero-Hallucination RAG** — When documents are uploaded, the AI is forced to retrieve from ChromaDB before answering. If information isn't in your document, it says so — no guessing.
- **Agentic Tool-Calling** — Multi-round tool loop: the AI can search documents, generate quizzes, create study guides, produce flashcard decks, and render Mermaid diagrams
- **SSE Streaming** — Responses stream token-by-token via Server-Sent Events
- **Long-Term Memory** — Learns user preferences from thumbs-up/down feedback; context surfaces across sessions

### Study Tools
- **Interactive Flashcards** — Flip cards, difficulty badges (easy/medium/hard), progress bar, SM-2 spaced repetition scheduling
- **Artifacts Sidebar** — All generated artifacts (quizzes, flashcards, diagrams) collected in a left-drawer gallery
- **Quizzes** — Multiple-choice with real-time scoring and retry
- **Study Guides & Diagrams** — Mermaid.js diagrams and structured study outlines

### Document Support
- PDF, DOCX, TXT, images (OCR via pytesseract), audio (Whisper transcription)
- Multi-file upload per session
- Async indexing via Celery + Socket.IO real-time progress

### UI
- **Cortex Theme** — Light purple/white design with Inter font; glassmorphism command bar (⌘K)
- **Command Palette** — Switch models, themes, and workflows (Socratic / Podcast mode) via ⌘K
- **Interactive PDF Viewer** — Highlights, annotations, source navigation from AI citations `[SRC:N]`
- **Voice Input** — Browser speech-to-text; optional voice-to-research synthesis with document context
- **Export** — Markdown, Evernote (.enex), Notion integration
- **TTS** — Listen to AI responses via OpenAI TTS

### AI Providers
Provider is auto-detected from available environment keys (priority order):

| Priority | Provider | Chat | Embeddings |
|----------|----------|------|------------|
| 1 | OpenRouter | ✅ (`openai/gpt-4o` default) | ❌ (falls back) |
| 2 | OpenAI | ✅ (`gpt-4o`) | ✅ (`text-embedding-3-small`) |
| 3 | Google Gemini | ✅ (`gemini-2.0-flash`) | ✅ (`gemini-embedding-001`) |
| 4 | Poe | ✅ | ❌ |

## Architecture

```
FileGeek/
├── backend/                     # FastAPI server
│   ├── main.py                  # FastAPI app, all route handlers
│   ├── database.py              # Async SQLAlchemy + get_db()
│   ├── models_async.py          # SQLAlchemy 2.x Mapped models
│   ├── schemas.py               # Pydantic v2 request schemas
│   ├── config.py                # Centralized configuration
│   ├── dependencies.py          # get_current_user, CurrentUser, DB
│   ├── celery_db.py             # Sync SQLAlchemy for Celery workers
│   ├── socket_manager.py        # Socket.IO with AsyncRedisManager
│   ├── routers/
│   │   └── auth.py              # JWT signup/login/refresh (rate-limited)
│   ├── services/
│   │   ├── ai_service.py        # Multi-provider AI + agentic tool loop
│   │   ├── file_service.py      # File extraction (PDF, DOCX, images, audio)
│   │   ├── rag_service.py       # ChromaDB indexing, retrieval, memory
│   │   └── tools.py             # Tool definitions and executor
│   ├── tasks/
│   │   └── document_tasks.py    # Celery async document indexing
│   └── utils/
│       └── validators.py        # Input validation + prompt injection detection
├── frontend/                    # React 18 + MUI 5 SPA
│   └── src/
│       ├── api/                 # Fetch-based API clients (sessions, SSE streaming)
│       ├── components/          # ChatPanel, PdfViewer, ArtifactPanel, CommandPalette, etc.
│       ├── contexts/            # ChatContext, FileContext, ModelContext, ThemeContext
│       ├── hooks/               # useDocumentIndexing, useIndexingStatus (Socket.IO)
│       └── pages/               # MainLayout, DiscoveryDashboard, ExplorePage
├── uploadthing-server/          # Express sidecar for UploadThing file uploads
├── requirements.txt
└── Dockerfile
```

## Quick Start

### Prerequisites

- Python 3.10+
- Node.js 18+
- At least one AI provider key (see Environment Variables below)

### 1. Clone

```bash
git clone https://github.com/A-Kumar14/FileGeek.git
cd FileGeek-Main
```

### 2. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r ../requirements.txt
```

Create a `.env` file inside `backend/`:

```env
# Required — JWT signing key (MUST be set; server refuses to start without it)
# Generate: python -c "import secrets; print(secrets.token_hex(32))"
JWT_SECRET=your-secret-key-here

# AI provider — set at least one
OPENROUTER_API_KEY=your_openrouter_key   # preferred
OPENAI_API_KEY=your_openai_key           # also used for Whisper + TTS
GOOGLE_API_KEY=your_gemini_key

# Optional
OPENROUTER_CHAT_MODEL=openai/gpt-4o     # override default model
REDIS_URL=redis://localhost:6379/0       # required for Celery + Socket.IO
DATABASE_URL=sqlite+aiosqlite:///./instance/users.db
UPLOAD_FOLDER=uploads
NUM_RETRIEVAL_CHUNKS=5
```

Start the backend:

```bash
python main.py
# or production:
gunicorn -w 2 -k uvicorn.workers.UvicornWorker main:app
```

### 3. Frontend

```bash
cd frontend
npm install
npm start
```

### 4. (Optional) Celery worker for async document indexing

```bash
cd backend
celery -A celery_app worker --loglevel=info
```

### Open the App

- Frontend: http://localhost:3000
- Backend API: http://localhost:5001
- Health check: http://localhost:5001/health

## API Endpoints

| Endpoint | Method | Auth | Rate Limit | Description |
|---|---|---|---|---|
| `/health` | GET | No | — | Service health (ChromaDB, Redis, embeddings) |
| `/auth/signup` | POST | No | 5/min | Create account |
| `/auth/login` | POST | No | 10/min | Login, returns JWT + sets refresh cookie |
| `/auth/refresh` | POST | Cookie | 30/min | Rotate access token via httpOnly refresh cookie |
| `/auth/logout` | POST | No | — | Clear refresh cookie |
| `/sessions` | GET | JWT | — | List sessions (ETag cached) |
| `/sessions` | POST | JWT | — | Create session |
| `/sessions/{id}` | GET | JWT | — | Session + messages + documents |
| `/sessions/{id}` | DELETE | JWT | — | Delete session and vector data |
| `/sessions/{id}/documents` | POST | JWT | 20/min | Index document(s) into session |
| `/sessions/{id}/messages` | POST | JWT | 20/min | Send message (SSE streaming response) |
| `/sessions/{id}/related` | GET | JWT | 30/min | Semantically related documents |
| `/messages/{id}/feedback` | POST | JWT | — | Thumbs up/down |
| `/flashcards/generate` | POST | JWT | 10/min | Direct flashcard generation |
| `/flashcards/progress` | POST | JWT | — | Save SM-2 card progress |
| `/flashcards/due` | GET | JWT | — | Cards due for review today |
| `/quiz/generate` | POST | JWT | 10/min | Direct quiz generation |
| `/quiz/results` | POST | JWT | — | Save quiz score |
| `/analytics/summary` | GET | JWT | — | Quiz/flashcard analytics |
| `/transcribe` | POST | JWT | 10/min | Whisper audio transcription |
| `/tts` | POST | JWT | 10/min | Text-to-speech (OpenAI TTS) |
| `/explore/search` | POST | JWT | 15/min | Search-augmented generation (SSE) |
| `/export/markdown` | POST | JWT | — | Export as Markdown |
| `/export/notion` | POST | JWT | — | Export to Notion |
| `/export/enex` | POST | JWT | — | Export as Evernote .enex |
| `/tasks/{task_id}` | GET | JWT | — | Celery task status polling |

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `JWT_SECRET` | **Yes** | JWT signing secret — server exits on startup if unset |
| `OPENROUTER_API_KEY` | One of these | OpenRouter key (access to GPT-4o, Gemini, etc.) |
| `OPENAI_API_KEY` | One of these | Also required for Whisper transcription and TTS |
| `GOOGLE_API_KEY` | One of these | Gemini API key |
| `OPENROUTER_CHAT_MODEL` | No | Override chat model (default: `openai/gpt-4o`) |
| `REDIS_URL` | For Celery/Sockets | Redis connection URL (default: `redis://localhost:6379/0`) |
| `DATABASE_URL` | No | Async DB URL (default: `sqlite+aiosqlite:///./instance/users.db`) |
| `UPLOAD_FOLDER` | No | File upload directory (default: `uploads`) |
| `CORS_ORIGINS` | No | Comma-separated extra allowed origins |
| `HTTPS_ONLY` | No | Set `true` in production to enforce secure cookies |
| `NUM_RETRIEVAL_CHUNKS` | No | RAG chunks per query (default: `5`) |
| `DEEP_THINK_CHUNKS` | No | Chunks in deep-think mode (default: `12`) |

## Deployment

- **Frontend**: Vercel (auto-builds from `frontend/`; set `CI=false` to suppress ESLint warnings as errors)
- **Backend**: Render via Docker (`gunicorn -w 2 -k uvicorn.workers.UvicornWorker main:app`)
- **CI/CD**: GitHub Actions — lint + build on every push/PR; deploy to Vercel + Render on merge to `main`

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, MUI 5, react-pdf, Mermaid.js, KaTeX, react-markdown |
| Backend | FastAPI, SQLAlchemy 2.x (async), SQLite + aiosqlite, gunicorn + uvicorn |
| AI | OpenRouter, OpenAI GPT-4o, Google Gemini 2.0 Flash, Whisper, TTS |
| Vector Store | ChromaDB (session + user scoped) |
| Task Queue | Celery + Redis |
| Real-time | Socket.IO (python-socketio + AsyncRedisManager) |
| File Processing | pdfplumber, PyMuPDF, python-docx, pytesseract, Pillow |
| Uploads | UploadThing (Express sidecar) |
| Auth | JWT (PyJWT + bcrypt), httpOnly refresh cookie, slowapi rate limiting |

