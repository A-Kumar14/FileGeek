# FileGeek — Architecture Reference

> Last updated: Feb 2026. Keep this file in sync when making structural changes.

---

## Project Layout

```
FileGeek-Main/
├── backend/                    # FastAPI server (Python 3.11)
│   ├── main.py                 # App entry point, all HTTP routes
│   ├── database.py             # Async SQLAlchemy engine + WAL recovery
│   ├── models_async.py         # SQLAlchemy 2.x ORM models
│   ├── schemas.py              # Pydantic v2 request schemas
│   ├── dependencies.py         # FastAPI DI: get_current_user, DB type aliases
│   ├── config.py               # All env var configuration
│   ├── logging_config.py       # Structured JSON logging
│   ├── celery_app.py           # Celery worker config
│   ├── celery_db.py            # Sync SQLAlchemy session for Celery
│   ├── socket_manager.py       # Socket.IO + AsyncRedisManager
│   ├── startup_check.py        # Pre-gunicorn env var validator
│   ├── .env.example            # Authoritative env var reference
│   ├── routers/
│   │   └── auth.py             # JWT auth routes (signup/login/refresh/logout)
│   ├── services/
│   │   ├── ai_service.py       # Multi-provider AI + agentic tool-calling loop
│   │   ├── rag_service.py      # ChromaDB indexing, retrieval, memory service
│   │   ├── file_service.py     # File extraction (PDF/DOCX/TXT/image/audio)
│   │   └── tools.py            # Tool definitions + ToolExecutor
│   ├── tasks/
│   │   └── document_tasks.py   # Celery: download → extract → index → flashcards
│   └── utils/
│       └── validators.py       # Input validation + prompt injection detection
├── frontend/                   # React 18 + MUI 5 SPA
│   └── src/
│       ├── api/                # HTTP clients (Axios + fetch SSE)
│       ├── components/         # ~45 UI components
│       ├── contexts/           # React global state (Chat, File, Auth, Model, Theme)
│       ├── hooks/              # Custom hooks (sessions, indexing, auth)
│       ├── pages/              # Route-level components
│       ├── theme/              # MUI theme definitions
│       └── utils/              # localStorage helpers
├── scripts/
│   └── predeploy.sh            # Local pre-push env var validation
├── docker-entrypoint.sh        # Runs startup_check.py before gunicorn
├── Dockerfile                  # Python 3.11-slim; ENTRYPOINT + CMD pattern
└── .github/workflows/
    ├── ci.yml                  # Lint + build on every push/PR
    └── deploy.yml              # Vercel + Render deploy on main merge
```

---

## Database Models

```
User
├── id: int [PK]
├── name: str(120)
├── email: str(255) [UNIQUE]
├── password_hash: str(255)
└── created_at: datetime

StudySession
├── id: str(36) [PK, UUID]
├── user_id: int [FK → User, CASCADE DELETE]
├── title: str(255)
├── session_type: str(20)  — "chat" | "podcast" | "socratic"
├── created_at: datetime
└── updated_at: datetime

ChatMessage
├── id: int [PK]
├── session_id: str(36) [FK → StudySession, CASCADE DELETE]
├── role: str(20)  — "user" | "assistant"
├── content: text
├── sources_json: text  — JSON [{page, text, file_name}]
├── artifacts_json: text  — JSON [{artifact_type, content, ...}]
├── suggestions_json: text  — JSON [string...]
├── feedback: str(10)  — "up" | "down" | null
├── tool_calls_json: text  — JSON [{name, arguments}]
└── created_at: datetime

SessionDocument
├── id: int [PK]
├── session_id: str(36) [FK → StudySession, CASCADE DELETE]
├── file_name: str(255)
├── file_type: str(20)  — "pdf" | "docx" | "txt" | "image" | "audio"
├── file_url: text
├── chroma_document_id: str(255)  — used for ChromaDB deletion
├── chunk_count: int
├── page_count: int
└── indexed_at: datetime

QuizResult
├── id: int [PK]
├── session_id: str(36) [FK]
├── message_id: int [FK → ChatMessage]
├── topic: str(255)
├── score: int
├── total_questions: int
├── answers_json: text
├── time_taken: int  — seconds
└── created_at: datetime

FlashcardProgress
├── id: int [PK]
├── session_id: str(36) [FK]
├── message_id: int [FK → ChatMessage]
├── card_index: int
├── card_front: str(255)
├── status: str(20)  — "remaining" | "reviewing" | "known"
├── ease_factor: float  — SM-2 (default 2.5, range 1.3–2.5)
├── interval_days: int
├── next_review_date: datetime
├── review_count: int
├── created_at / updated_at: datetime
└── UNIQUE(session_id, message_id, card_index)
```

---

## API Routes

### Auth (`/auth`) — routers/auth.py
| Method | Path | Rate Limit | Description |
|--------|------|------------|-------------|
| POST | `/auth/signup` | 5/min | Register; returns access token + sets refresh cookie |
| POST | `/auth/login` | 10/min | Login; returns access token + sets refresh cookie |
| POST | `/auth/refresh` | 30/min | Rotate access token via httpOnly cookie |
| POST | `/auth/logout` | — | Clear refresh cookie |

### Sessions
| Method | Path | Rate Limit | Description |
|--------|------|------------|-------------|
| GET | `/sessions` | — | List user sessions (ETag cached) |
| POST | `/sessions` | — | Create session |
| GET | `/sessions/{id}` | — | Session + messages + documents |
| DELETE | `/sessions/{id}` | — | Delete session + ChromaDB vectors |
| GET | `/sessions/{id}/related` | 30/min | Semantically related docs from other sessions |

### Documents
| Method | Path | Rate Limit | Description |
|--------|------|------------|-------------|
| POST | `/sessions/{id}/documents` | 20/min | Index document (URL or multipart) |
| DELETE | `/documents/{doc_id}` | — | Delete document + vectors |

### Chat
| Method | Path | Rate Limit | Description |
|--------|------|------------|-------------|
| POST | `/sessions/{id}/messages` | 20/min | Send message → SSE streaming response |
| POST | `/messages/{id}/feedback` | — | Thumbs up/down |

### Flashcards
| Method | Path | Description |
|--------|------|-------------|
| POST | `/flashcards/progress` | Save SM-2 card progress |
| GET | `/flashcards/progress/{session_id}/{message_id}` | Load progress |
| GET | `/flashcards/due` | Cards due for review today |
| POST | `/flashcards/generate` | 10/min — Direct generation |
| GET | `/flashcards/progress/summary/{session_id}` | Mastery heatmap data |

### Quizzes & Analytics
| Method | Path | Description |
|--------|------|-------------|
| POST | `/quiz/generate` | 10/min — Direct quiz generation |
| POST | `/quiz/results` | Save quiz attempt |
| GET | `/analytics/summary` | User-wide quiz + flashcard stats |
| GET | `/sessions/{id}/activity` | Per-session activity timeline |

### Utilities
| Method | Path | Rate Limit | Description |
|--------|------|------------|-------------|
| GET | `/health` | — | ChromaDB + Redis + embedding health |
| GET | `/workers/status` | — | Celery worker availability |
| GET | `/tasks/{task_id}` | — | Celery task status polling |
| GET | `/library` | — | All indexed documents across sessions |
| POST | `/transcribe` | 10/min | Whisper audio transcription |
| POST | `/tts` | 10/min | OpenAI TTS |
| POST | `/explore` | — | Web exploration mode |
| POST | `/explore/search` | 15/min | SAG (search-augmented generation, SSE) |
| POST | `/s3/presign` | 10/min | S3 presigned URL |
| POST | `/export/notion` | — | Export to Notion |
| POST | `/export/markdown` | — | Export as .md |
| POST | `/export/enex` | — | Export as Evernote .enex |
| POST | `/upload` | 20/min | Legacy: file upload + immediate answer |
| POST | `/ask` | 20/min | Legacy: CDN URL + question |

---

## Key Data Flows

### 1. Chat Message → SSE Response

```
User types → ChatContext.sendMessage()
  → POST /sessions/{id}/messages
  → Validate question (InputValidator, prompt injection check)
  → Save user ChatMessage to DB
  → Generate session title on first message
  → Retrieve chat history (last 20 messages)
  → Fetch memory context (MemoryService)
  → Count SessionDocuments → has_documents flag
  → ai_service.answer_with_tools()
      → Build system prompt:
          base + file_type + response_style + [document context if has_documents]
      → Round 0: if artifact keyword → force tool; elif has_documents → force search_documents
      → Rounds 1–5: model call → parse tool_calls → ToolExecutor.execute() → inject result
      → Final round: model generates answer text
  → Extract JSON artifacts from answer text if needed
  → Save assistant ChatMessage (content + sources + artifacts + suggestions)
  → Yield SSE events:
      data: {"artifacts": [...]}          ← early, before text
      data: {"chunk": "50 chars..."}      ← repeated
      data: {"done": true, "answer": ...} ← final
  → StreamingResponse(media_type="text/event-stream")
```

### 2. Document Upload & Indexing

```
User drops file → FileContext.handleFileSelect()
  → POST /sessions/{id}/documents (multipart)
  → Backend validates session ownership
  → secure_filename() + timestamp → unique saved_filename
  → Save file to uploads/
  → If Celery available:
      index_document_task.delay(session_id, user_id, file_url, file_name)
      return {task_id, status: "queued"}
  → Else: synchronous rag_service.index_from_url_async()

  [Celery Worker] index_document_task:
    DOWNLOADING (20%) → download file
    EXTRACTING  (50%) → FileService.extract_text_universal()
                         PDF: pdfplumber page-by-page
                         DOCX: python-docx paragraphs
                         TXT: raw text
                         Image: pytesseract OCR
                         Audio: Whisper transcription
    INDEXING    (80%) → chunking_function_with_pages()
                         RecursiveCharacterTextSplitter(size=1000, overlap=200)
                       → embed chunks → ai_service embeddings
                       → ChromaDB add_documents() with metadata:
                          {document_id, session_id, user_id, pages: [1,2,3]}
    SUCCESS    (100%) → save SessionDocument to DB
                       → emit progress via Socket.IO Redis manager
                       → background: auto_generate_flashcards (5 starter cards)

  [Frontend] useIndexingStatus() Socket.IO listener
    → room: task:{task_id}
    → update progress bar
    → fallback to GET /tasks/{task_id} polling after 3s
```

### 3. Authentication

```
Login/Signup → POST /auth/login (or /signup)
  → bcrypt.checkpw (async via executor)
  → Create JWT tokens:
      access_token:  15-min, type="access", stores user_id + email
      refresh_token: 30-day, type="refresh", stores user_id
  → Set httpOnly cookie: filegeek_refresh={refresh_token}
      secure=HTTPS_ONLY, samesite=strict, path=/auth/refresh
  → Return {access_token, user}

Every request:
  → api/client.js injects: Authorization: Bearer {access_token}
  → dependencies.get_current_user() decodes + validates JWT
  → Returns User ORM object (or 401)

Token expiry:
  → Frontend catches 401
  → POST /auth/refresh (cookie sent automatically)
  → New access_token issued; refresh_token rotated
```

---

## AI Service — Provider & Model Details

### Provider Priority (auto-detected from env)
```
OPENROUTER_API_KEY present → "openrouter" (default: openai/gpt-4o)
OPENAI_API_KEY present      → "openai"     (default: gpt-4o)
GOOGLE_API_KEY present      → "gemini"     (default: gemini-2.0-flash)
```

### OpenRouter Shorthand Aliases (`AIService._OR_ALIASES`)
```
gpt-4o            → openai/gpt-4o
gemini-2.0-flash  → google/gemini-2.0-flash-exp:free
grok-3            → x-ai/grok-3
grok-3-mini       → x-ai/grok-3-mini
```

### Embedding Providers
```
openai/openrouter → text-embedding-3-small  (OpenAI API)
gemini            → gemini-embedding-001    (Gemini v1beta REST)
```
Note: OpenRouter has no embeddings endpoint — falls back to OpenAI then Gemini.

### Tool Definitions
| Tool | Args | Returns |
|------|------|---------|
| `search_documents` | query, n_results=5 | RAG chunks + page numbers |
| `generate_quiz` | topic, num_questions=5 | quiz artifact (MCQ) |
| `create_study_guide` | topic, depth="standard" | study_guide artifact |
| `generate_visualization` | description, type="mermaid" | mermaid/table/code artifact |
| `generate_flashcards` | topic, num_cards=10, card_type="mixed" | flashcards artifact |

### Agentic Loop
```
Round 0: force tool call (based on keyword or has_documents flag)
Rounds 1–4: model decides whether to call tools or answer
Round 5: always return final answer regardless
Max tools per round: 1
Tool result → injected into conversation as "tool" role message
```

---

## Frontend State

### ChatContext
```
messages[]         — all messages in current session
activeSessionId    — current session UUID
chatSessions[]     — list of all sessions (synced from server)
loading            — generation in progress
loadingPhase       — "reading" | "analyzing" | "formulating"
deepThinkEnabled   — toggle for extended RAG + smarter model
artifacts[]        — quiz/flashcard/visualization outputs
suggestions[]      — AI-generated follow-up prompts
streamingContent   — accumulated text during SSE stream
stopGenerationRef  — abort controller for mid-stream cancellation
```

### FileContext
```
fileEntries[]           — [{fileId, localFile, uploadStatus, uploadProgress, uploadedUrl, fileName, fileType}]
currentPage             — active PDF page number
totalPages
targetPage              — scroll-to target
activeSourceHighlight   — {page, text, rects} for green source highlight
```

### ModelContext
```
selectedModel    — localStorage: filegeek-selected-model (null = backend default)
```

### AuthContext
```
user             — {id, name, email}
token            — JWT access token (in-memory, not localStorage)
isAuthenticated
```

### ThemeContext
```
theme            — "cortex" | "academic" | "dark"
```

---

## Deployment

### Render (Backend)
```
Trigger: GitHub Actions deploy.yml → curl RENDER_DEPLOY_HOOK_URL on main push

Container startup sequence:
  docker run
    → /docker-entrypoint.sh
        → python startup_check.py   ← exits code 1 if JWT_SECRET or AI key missing
        → exec gunicorn -w 1 -k uvicorn.workers.UvicornWorker main:app --bind 0.0.0.0:10000

Required env vars in Render dashboard:
  JWT_SECRET         (generate: python -c "import secrets; print(secrets.token_hex(32))")
  OPENROUTER_API_KEY (or OPENAI_API_KEY or GOOGLE_API_KEY)

Recommended:
  REDIS_URL, HTTPS_ONLY=true, DATABASE_URL, SYNC_DATABASE_URL
```

### Vercel (Frontend)
```
Trigger: GitHub Actions deploy.yml → vercel deploy --prod on main push
Build: CI=false npm run build  (CI=false prevents ESLint warnings → errors)

Required secrets in Vercel project:
  REACT_APP_API_URL  — backend URL (e.g. https://filegeek.onrender.com)
```

### GitHub Actions
```
ci.yml (every push/PR):
  Backend: pip install → ruff lint → python import check
  Frontend: npm ci → eslint → npm run build (CI=true)

deploy.yml (main only):
  Frontend: npm ci → npm run build (CI=false) → vercel deploy --prod
  Backend: curl Render deploy hook
```

### Local Pre-Deploy Check
```bash
./scripts/predeploy.sh
# Checks: JWT_SECRET, AI key, REDIS_URL, HTTPS_ONLY, .gitignore safety
```

---

## Security

| Control | Implementation |
|---------|----------------|
| JWT signing | HS256, `JWT_SECRET` env var — server refuses to start without it |
| Access tokens | 15-min lifetime, stored in-memory (not localStorage) |
| Refresh tokens | 30-day lifetime, httpOnly + samesite=strict cookie, path=/auth/refresh |
| Auth brute force | slowapi: 5/min signup, 10/min login, 30/min refresh |
| Message rate limit | 20/min per IP on chat + document endpoints |
| CORS | Explicit allowlist only — no wildcard regex |
| File URLs | SSRF prevention: ALLOWED_URL_PREFIXES whitelist for remote files |
| Input validation | InputValidator.validate_question() + check_prompt_injection() on every message |
| Error responses | Global exception handlers — no stack traces or internal details in responses |
| File uploads | secure_filename() + extension allowlist + timestamp prefix |

---

## Known Patterns & Conventions

- **Artifact storage**: artifacts saved as JSON in `ChatMessage.artifacts_json`; re-hydrated on session load
- **Source citations**: `[SRC:N]` markers in AI text → frontend renders clickable chips → PDF navigates to page
- **SM-2 algorithm**: ease_factor ∈ [1.3, 2.5]; known → interval × ease; reviewing → interval = 1
- **ETag caching**: MD5 of response JSON; Redis stores etag:sessions:{user_id} with 30s TTL
- **WAL recovery**: database.py catches `disk image is malformed` → runs `PRAGMA wal_checkpoint(TRUNCATE)`
- **has_documents flag**: counted fresh on every chat request from SessionDocument table — drives zero-hallucination mode
- **Celery fallback**: if Redis/Celery unavailable, indexing runs synchronously in the HTTP request
