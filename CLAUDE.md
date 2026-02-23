# FileGeek — AI Integration Reference (Claude / Poe)

**Updated:** Feb 2026

This document covers how FileGeek routes AI requests, what models are available via the Poe API, and the architectural patterns used in the agentic pipeline. It replaces the earlier Gemini-focused planning doc (`gemini.md`).

---

## 1. AI Provider: Poe API

FileGeek uses the **Poe API** as its unified AI gateway. Poe provides access to frontier models (Grok 3, DeepSeek R1, and optionally Claude) through a single authenticated endpoint, eliminating the need to manage multiple provider SDKs.

### Authentication
- User's Poe API key is entered in **Settings → AI Provider**
- Stored as `filegeek-poe-key` in localStorage
- Forwarded to the backend on every request as `X-Poe-Api-Key` (set in `api/client.js`)
- Backend reads via `request.headers.get("X-Poe-Api-Key")` in `main.py`

### Active Models

| Model ID | Display Name | Provider | Best For |
|----------|-------------|----------|----------|
| `grok-3` | Grok 3 | xAI | Long-form reasoning, complex document Q&A |
| `grok-3-mini` | Grok 3 Mini | xAI | Fast responses, quick lookups |
| `DeepSeek-R1` | DeepSeek R1 | DeepSeek | Open-weight; chain-of-thought reasoning |

> **To add Claude models** (e.g. `claude-3-7-sonnet`): add an entry to `MODELS` in `ModelSelector.js` and ensure the Poe API key has access to that bot.

### Model Selection Flow

```
User picks model in ModelSelector / Settings
  → stored in ModelContext (localStorage: filegeek-model)
  → sent as X-Poe-Chat-Model header via api/client.js
  → backend reads header and passes model_id to AIService
  → AIService calls Poe API with the requested model
```

---

## 2. Agentic Pipeline (`ai_service.py`)

The AI system runs a **multi-round tool-calling loop** (max 5 rounds):

```
User message
  ↓
AIService.chat_with_tools()
  ↓
[Round 1] Send message + system prompt + RAG context to Poe model
  ↓
Model may return tool_call(s):
  • search_documents   → RAG vector search (ChromaDB)
  • generate_quiz      → JSON quiz artifact
  • create_study_guide → Structured outline artifact
  • generate_diagram   → Mermaid.js diagram artifact
  ↓
ToolExecutor.execute() runs each tool
  ↓
Results injected back into conversation
  ↓
[Round N] Model produces final text response
  ↓
SSE stream → frontend ChatContext → chat bubble
```

### System Prompt Strategy

The system prompt instructs the model to:
1. Prefer grounded answers from retrieved document chunks
2. Cite sources using `[SRC:N]` marker syntax
3. Use tool calls rather than hallucinating document content
4. Wrap structured outputs (quiz, diagram) in `<artifact type="...">` tags

### Artifacts

When the AI generates structured content it is stored as a JSON artifact alongside the `ChatMessage`:

| `artifact_type` | Rendered by | Notes |
|-----------------|-------------|-------|
| `quiz` | `ArtifactPanel → QuizCard` | Interactive MCQ with scoring |
| `visualization` / `mermaid` | `ArtifactPanel → MermaidDiagram` | Mermaid.js diagram |
| `study-guide` | `ArtifactPanel → fallback pre` | Hierarchical outline |

> Flashcard artifact type has been removed from the frontend renderer.

---

## 3. Streaming (SSE)

Responses stream token-by-token:

**Backend** (`main.py`):
```python
async def stream_response():
    async for chunk in poe_client.stream(model, messages):
        yield f"data: {json.dumps({'content': chunk})}\n\n"
return StreamingResponse(stream_response(), media_type="text/event-stream")
```

**Frontend** (`api/sessions.js → sendSessionMessage()`):
```js
const reader = response.body.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  onChunk(parseChunk(value)); // updates ChatContext.streamingContent
}
```

The user can cancel mid-stream via the stop button; `stopGeneration` ref in `ChatContext` signals the reader to abort.

---

## 4. RAG Integration

Every chat request is augmented with relevant document chunks before being sent to the Poe model.

**Retrieval flow:**
1. `rag_service.query_async(query, session_id)` fetches top-N chunks from ChromaDB
2. Chunks are prepended to the message as a `<context>` block in the system prompt
3. The model cites chunks using `[SRC:N]` markers; the frontend renders these as clickable source chips that navigate the PDF to the referenced page

**Indexing:**
- Triggered by `POST /sessions/{id}/documents`
- Runs in a Celery task (`tasks/document_tasks.py`)
- Progress emitted via Socket.IO (`task:{task_id}` room)
- Client (`hooks/useDocumentIndexing.js`) subscribes and shows an indexing progress indicator

---

## 5. Response Style

Users can set a **Response Style** preference in Settings (Concise / Balanced / Detailed).

- Stored as `filegeek-response-style` in localStorage
- Should be sent as a hint in the request body and injected into the system prompt
- Suggested prompt suffixes:
  - **Concise**: "Be brief. Answer in 2–3 sentences unless the question requires more."
  - **Balanced**: (default, no suffix)
  - **Detailed**: "Provide a thorough, well-structured answer with examples where relevant."

---

## 6. Workflows (via CommandPalette)

Two structured workflows alter the AI's behavior beyond the default Q&A mode:

| Workflow | Trigger | Behavior |
|----------|---------|----------|
| **Socratic** | ⌘K → WORKFLOWS | AI asks guiding questions rather than giving direct answers; forces active recall |
| **Podcast** | ⌘K → WORKFLOWS | AI adopts a conversational host style; summarizes document as an engaging monologue |

These inject a workflow-specific system prompt prefix into `chat_with_tools()`.

---

## 7. Adding a New Model (e.g. Claude 3.7)

1. Add an entry to `MODELS` in `frontend/src/components/ModelSelector.js`:
   ```js
   {
     id: 'claude-3-7-sonnet',
     name: 'Claude 3.7 Sonnet',
     provider: 'anthropic',
     description: 'Fast, precise reasoning',
     badge: 'CLAUDE',
   }
   ```
2. Add a badge color entry to the `badgeColor` map in `ModelSelector.js`:
   ```js
   CLAUDE: { bg: 'rgba(215,147,72,0.08)', border: 'rgba(215,147,72,0.4)', color: '#D79348' },
   ```
3. Verify the Poe bot name matches the `id` field exactly (Poe uses bot names, not API model IDs)
4. No backend changes needed — the model ID is forwarded transparently via `X-Poe-Chat-Model`

---

## 8. Environment Variables (AI-Related)

| Variable | Required | Description |
|----------|----------|-------------|
| `POE_API_KEY` | Yes | Server-side fallback key if no user key supplied via header |
| `POE_CHAT_MODEL` | No | Default model ID (default: `grok-3`) |
| `POE_RESPONSE_MODEL` | No | Override for non-streaming responses |
| `NUM_RETRIEVAL_CHUNKS` | No | RAG chunks per query (default: 5) |
| `DEEP_THINK_CHUNKS` | No | RAG chunks in deep-think mode (default: 12) |
