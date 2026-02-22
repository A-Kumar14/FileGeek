# FileGeek - Developer Documentation
**Updated:** Feb 22, 2026

## 1. The Tech Stack
* [cite_start]**Frontend:** React 19, MUI 7 (Bento-grid layout). Uses `react-pdf` for rendering and `react-window` for virtualization of large documents[cite: 4, 5, 65].
* [cite_start]**Backend:** Flask API, SQLAlchemy (SQLite), and Redis for ETag caching[cite: 6, 66].
* [cite_start]**Vector Store:** ChromaDB with session-scoped indexing for RAG[cite: 6, 18].
* [cite_start]**AI Orchestration:** Dual-provider (Gemini/GPT-4o) with an agentic tool-calling pipeline[cite: 7, 21].
* [cite_start]**File Processing:** pdfplumber, PyMuPDF, pytesseract (OCR), and Whisper (Audio)[cite: 8, 14].

## 2. Core Systems
### 2.1 Multimodal RAG & Tool-Calling
The `ai_service.py` manages a tool-calling loop that analyzes user intent to trigger:
* [cite_start]**Vector Search:** Querying ChromaDB[cite: 24].
* [cite_start]**JSON Generation:** For interactive quizzes[cite: 24].
* [cite_start]**Mermaid.js:** For visual relationship diagrams and concept maps[cite: 5, 54].

### 2.2 Learning Logic (SM-2)
The system implements the SM-2 algorithm to track knowledge retention. [cite_start]Flashcards move from "Review" to "Known" based on performance, with a dedicated `Review Queue` driven by `next_review_date`[cite: 31, 56].

### 2.3 Optimization & State
* [cite_start]**Rendering:** Uses `React.memo` to achieve a 50-70% increase in UI speed[cite: 33, 34].
* [cite_start]**Persistence:** SQLite saves chat history, PDF highlights, and workspace artifacts[cite: 27, 28].
* [cite_start]**Migrations:** Schema changes are managed via Alembic/Flask-Migrate.