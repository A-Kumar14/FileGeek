# FileGeek — Developer Documentation
**Updated:** Feb 2026

---

## 1. Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, MUI 7, CSS custom properties (Cortex theme engine) |
| **PDF Rendering** | `react-pdf` + `pdfjs-dist` worker, `react-window` for virtualization |
| **Backend** | FastAPI (Uvicorn / Gunicorn), Python 3.11+ |
| **Database** | SQLAlchemy 2.x async (aiosqlite for FastAPI, sync for Celery) |
| **Vector Store** | ChromaDB — session-scoped document indexing for RAG |
| **AI Routing** | Poe API — Grok 3, Grok 3 Mini, DeepSeek R1 |
| **Async Tasks** | Celery + Redis broker (document indexing, progress events) |
| **Real-time** | Socket.IO (AsyncRedisManager) for indexing progress events |
| **File Processing** | pdfplumber, PyMuPDF, pytesseract (OCR), OpenAI Whisper (audio) |
| **Auth** | JWT via `python-jose`, stored in localStorage as `filegeek-token` |

---

## 2. Repository Layout

```
FileGeek-Main/
├── backend/
│   ├── main.py                  # FastAPI app, all routes
│   ├── database.py              # Async SQLAlchemy engine + get_db()
│   ├── models_async.py          # SQLAlchemy 2.x Mapped models
│   ├── schemas.py               # Pydantic v2 request/response schemas
│   ├── dependencies.py          # get_current_user, CurrentUser, DB aliases
│   ├── celery_db.py             # Sync SyncSession for Celery workers
│   ├── socket_manager.py        # Socket.IO with AsyncRedisManager
│   ├── routers/
│   │   └── auth.py              # /auth/* routes
│   ├── services/
│   │   ├── ai_service.py        # Poe API routing + agentic tool loop
│   │   ├── rag_service.py       # ChromaDB indexing/retrieval (async wrappers)
│   │   ├── file_service.py      # PDF/DOCX/image/audio extraction
│   │   └── tools.py             # Tool definitions (search_documents, generate_quiz, …)
│   └── tasks/
│       └── document_tasks.py    # Celery async indexing + progress via Socket.IO
├── frontend/
│   └── src/
│       ├── contexts/            # ChatContext, FileContext, AuthContext, ModelContext, …
│       ├── components/          # ChatPanel, PdfViewer, ArtifactPanel, LeftDrawer, …
│       ├── pages/               # MainLayout, LoginPage, SettingsContent, …
│       ├── hooks/               # useChat, useSessions, useDocumentIndexing, …
│       ├── api/                 # client.js (axios), sessions.js (SSE), library.js
│       └── theme/               # ThemeContext.js, themes.js (Cortex, Paper, etc.)
└── docs/
    └── TODO.md
```

---

## 3. Core Systems

### 3.1 AI Routing via Poe API

All model calls route through the **Poe API** (`ai_service.py`). The active model is set by the `X-Poe-Chat-Model` header (or falls back to the `POE_CHAT_MODEL` env var).

**Available models:**

| Model ID | Display name | Notes |
|----------|-------------|-------|
| `grok-3` | Grok 3 | Default, highest capability |
| `grok-3-mini` | Grok 3 Mini | Fast, lower latency |
| `DeepSeek-R1` | DeepSeek R1 | Open-weight reasoning |

The client-side model selection lives in `ModelContext.js`. The selected model is sent on every request via `X-Poe-Chat-Model`. The Poe API key is stored in `filegeek-poe-key` (localStorage) and forwarded by `api/client.js` as `X-Poe-Api-Key`.

### 3.2 Agentic Tool-Calling Loop

`ai_service.py → AIService.chat_with_tools()` runs a multi-round loop (max 5):

1. User message arrives at `POST /sessions/{id}/messages`
2. AI receives the message + RAG context
3. AI may call tools: `search_documents`, `generate_quiz`, `create_study_guide`, `generate_diagram`
4. `ToolExecutor.execute()` runs tools against RAG/file services
5. Results are returned to the AI for a final synthesized response
6. Response + artifacts saved to DB; streamed to client via SSE

### 3.3 Multimodal RAG

Documents are indexed into ChromaDB with `session_id` and `user_id` metadata. Retrieval filters by session scope, enabling multi-document conversations within a session while maintaining user isolation.

- **Embeddings**: Poe-compatible embedding model (configurable)
- **Chunking**: Recursive character splitter — 500 char chunks, 50 char overlap
- **Indexing**: Triggered via Celery task on document upload; progress emitted via Socket.IO

### 3.4 SSE Streaming

Chat responses stream token-by-token via Server-Sent Events:

- **Backend**: `main.py` yields `data: {chunk}` events from the Poe streaming response
- **Frontend**: `api/sessions.js → sendSessionMessage()` uses `fetch` + `ReadableStream` with `onChunk` callback
- **State**: `ChatContext.js` holds `streamingContent` state; `stopGeneration` ref lets the user cancel mid-stream

### 3.5 Real-Time Indexing Progress (Socket.IO)

- Backend mounts Socket.IO at `/socket.io` in `main.py`
- Celery tasks publish progress via `socketio.RedisManager(write_only=True)` in `_publish_progress()`
- Client joins room `task:{task_id}` after connect (`hooks/useIndexingStatus.js`)
- `hooks/useDocumentIndexing.js` prefers socket events, falls back to polling after 3 s

---

## 4. Frontend Architecture

### State Management (Context API)

| Context | Owns |
|---------|------|
| `ChatContext` | Messages, artifacts, sessions list, streaming state, active session |
| `FileContext` | Uploaded file, indexing state, PDF source highlights |
| `AuthContext` | JWT token, user object, login/logout |
| `ModelContext` | Selected model ID, persisted to localStorage |
| `ThemeContext` | Active theme + font, CSS variable injection |
| `AnnotationContext` | PDF highlights and sticky notes |

### Layout

`MainLayout.js` renders a 3-column CSS Grid:

```
┌───────────┬──────────────────────┬──────────┐
│ LeftDrawer │   File Viewer / Dash │  Chat    │
│  260px     │      flex: 1         │  400px   │
│ (or 60px   │                      │          │
│ collapsed) │                      │          │
└───────────┴──────────────────────┴──────────┘
```

- No `TopBar` in the desktop layout — navigation lives in `LeftDrawer`
- `GlobalCommandBar` (⌘K) floats fixed at bottom-center (zIndex 1100)
- `CommandPalette` opens on ⌘K; groups: WORKFLOWS, MODELS, THEMES

### Cortex Theme Engine

`ThemeContext.js` injects CSS custom properties onto `:root` from `theme/themes.js`. Switching themes is instant (no re-render cascade).

Key CSS vars: `--accent`, `--accent-secondary`, `--accent-dim`, `--bg-primary`, `--bg-secondary`, `--bg-tertiary`, `--fg-primary`, `--fg-secondary`, `--fg-dim`, `--border`, `--shadow`, `--font-family`, `--font-mono`.

---

## 5. Database Schema

**Models** (`models_async.py`):

| Model | Key Fields |
|-------|-----------|
| `User` | email, password_hash, created_at |
| `StudySession` | user_id, title, created_at, updated_at |
| `SessionDocument` | session_id, filename, file_url, indexed (bool) |
| `ChatMessage` | session_id, role, content, sources (JSON), artifacts (JSON) |
| `QuizResult` | session_id, message_id, topic, score, total_questions, answers (JSON), time_taken |

**DB URLs:**
- FastAPI: `sqlite+aiosqlite:///./instance/users.db` (`DATABASE_URL` env)
- Celery sync: `sqlite:///./instance/users.db` (`SYNC_DATABASE_URL` env)

---

## 6. API Endpoints (key routes)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/auth/signup` | Create account |
| `POST` | `/auth/login` | JWT login |
| `POST` | `/auth/logout` | Clear session |
| `GET` | `/sessions` | List user sessions |
| `POST` | `/sessions` | Create session |
| `GET` | `/sessions/{id}` | Get session + messages |
| `POST` | `/sessions/{id}/messages` | Send message (SSE stream) |
| `POST` | `/sessions/{id}/documents` | Upload + index document |
| `POST` | `/quiz/results` | Save quiz score |
| `GET` | `/library` | User preferences + docs |
| `GET` | `/explore` | Public/recent documents |

---

## 7. Development Setup

### Backend

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r ../requirements.txt

# .env (minimum)
POE_API_KEY=your_poe_key
JWT_SECRET=your_secret
DATABASE_URL=sqlite+aiosqlite:///./instance/users.db

python main.py          # FastAPI dev server on :8000
# OR
uvicorn main:app --reload

# Celery worker (separate terminal)
celery -A celery_app.celery_app worker --loglevel=info
```

### Frontend

```bash
cd frontend
npm install
# .env.local
REACT_APP_API_URL=http://localhost:8000

npm start   # :3000
```

---

## 8. Deployment

- **Frontend**: Vercel — build command `CI=false npm run build`
- **Backend**: Render — `gunicorn -w 2 -k uvicorn.workers.UvicornWorker main:app`
- **Redis**: Managed Redis (Redis Cloud or Railway) — set `REDIS_URL`
- **ChromaDB**: Persisted volume at `backend/chroma_data/`

CI/CD: `.github/workflows/ci.yml` (lint + build on push/PR) and `.github/workflows/deploy.yml` (Vercel + Render deploy hook on merge to `main`).

---

## 9. Performance Notes

- `LazyThumbnail`, `HighlightLayer`, `ChatMessage` all use `React.memo` — ~50–70% render speedup on large sessions
- `MarkdownRenderer` is lazy-loaded (`React.lazy`) — ~150KB bundle reduction
- `ChatContext` localStorage writes are debounced 500 ms to prevent thrashing
- `PdfViewer` uses `react-window` virtual scrolling for 60 fps on 100+ page documents

---

## 10. Common Gotchas

1. **Model switching**: Changing providers requires clearing `chroma_data/` — embeddings from different providers are incompatible.
2. **CORS**: `main.py` CORS config must include the frontend origin. FastAPI uses `fastapi.middleware.cors.CORSMiddleware`.
3. **JWT + `withCredentials`**: Axios sends `withCredentials: true`; backend must respond with `Access-Control-Allow-Credentials: true`.
4. **Celery + async DB**: Celery tasks use `celery_db.SyncSession` — never use the async `get_db()` inside a Celery task.
5. **Socket.IO room**: Client must join room `task:{task_id}` immediately after connecting to receive indexing progress events.
6. **Poe key**: The `X-Poe-Api-Key` header is read from `filegeek-poe-key` in localStorage by `api/client.js`. Without a valid key the backend will return 401.
