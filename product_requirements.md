# Product Requirements Document: FileGeek
**Status:** Draft | **Version:** 2.1 | **Date:** Feb 22, 2026

## 1. Executive Summary
FileGeek is an "external brain" for students and researchers. [cite_start]It transforms static media into interactive knowledge using RAG, agentic tools, and spaced repetition[cite: 38, 39].

## 2. High-Priority Functional Requirements (P0-P1)
* [cite_start]**Multi-Document RAG:** Simultaneous querying across all session documents[cite: 52].
* [cite_start]**Smart Citation Engine:** Automatic APA/MLA/BibTeX generation from PDF text selections[cite: 53].
* [cite_start]**Socratic Mode:** An AI persona that guides users through inquiry rather than direct answers[cite: 57].
* [cite_start]**Active Review Queue:** A dashboard for flashcards due according to the SM-2 algorithm[cite: 56].
* [cite_start]**Cornell Note-Taking:** Structured notes that auto-populate based on user highlights[cite: 58].

## 3. Technical & Performance Goals
* [cite_start]**Bundle Size:** Maintain a frontend bundle size under 500KB[cite: 64].
* [cite_start]**PDF Virtualization:** Ensure smooth scrolling for 200+ page docs via `react-window`.
* [cite_start]**Offline Support:** Utilization of Service Workers for offline reading and chat viewing[cite: 70].
* [cite_start]**Security:** Transition to user-tier-based rate limiting using JWT[cite: 68].

## 4. Roadmap
### Phase 1: Stability & Scale (Immediate)
* [cite_start]Fix Redis connection issues and implement PDF pre-fetching[cite: 77, 78].
* [cite_start]Formalize schema management (Alembic).

### Phase 2: The "Deep Study" Update (1-2 Months)
* [cite_start]Launch the Flashcard Review Queue and Student Analytics Dashboard[cite: 80, 81].

### Phase 3: The "Social Research" Update (3-4 Months)
* [cite_start]WebSocket-based collaborative study rooms and Google Drive/Notion sync[cite: 83, 84].

## 5. Success Metrics
* [cite_start]**Engagement:** Average number of agentic tools (quizzes, diagrams) used per session[cite: 88].
* [cite_start]**Retention:** Number of users returning for scheduled flashcard reviews[cite: 86].
* [cite_start]**Performance:** Maintain a Lighthouse score > 85[cite: 87].