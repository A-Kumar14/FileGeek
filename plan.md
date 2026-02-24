# FileGeek Explore: Implementation Roadmap
**Status:** In Progress
**Objective:** Expand FileGeek into a web-scale research and discovery engine with live search, inline citations, and knowledge graph visualization.

---

## Status Overview

| Feature | Status | Notes |
|---------|--------|-------|
| Web search (DuckDuckGo) | ✅ Done | `search_service.py` — DDGS + trafilatura |
| Poe native web search | ✅ Done | `use_poe_search` toggle via `Web-Search` bot |
| `/explore/search` SSE endpoint | ✅ Done | `ai_service.explore_the_web()` |
| `ExplorePage.js` UI | ✅ Done | Source chips, streaming answer, citations |
| `/explore` route | ✅ Done | Protected route in `App.js` |
| LeftDrawer Explore nav | ✅ Done | `navigate('/explore')` in `handleNavClick` |
| ExplorePage Cortex styling | 🔧 In Progress | Remove terminal brackets/monospace |
| Knowledge Graph | 🔧 In Progress | `react-force-graph`, entity extraction |

---

## 1. Core Feature Set

1. **Explore Hub** (`/explore`): Dedicated React view with live web search, streaming AI answer, and source chips. ✅ Built.
2. **Live Web Discovery**: DuckDuckGo → trafilatura scraping → AI synthesis with inline `[N]` citations. ✅ Built.
3. **Knowledge Graph**: `react-force-graph` (2D force-directed) — entities and topics extracted client-side from the AI answer. No Neo4j, no separate DB.
4. **Hybrid RAG**: Web sources + local ChromaDB in the same AI context window. (Phase 2 — register `WebSearchTool` in `chat_with_tools()`)
5. **Research Artifacts**: Source chips → save answer as Markdown to Library. ✅ Built.

---

## 2. Knowledge Graph Design

### Why not Neo4j
- Adds a 5th database to the stack (operational cost + complexity)
- AI-based entity extraction is unreliable → sparse, noisy graphs
- JSON in SQLite is sufficient for session-scoped graphs

### Approach
- **Storage**: Graph state stored as JSON in `StudySession.graph_state` column (SQLite)
- **Extraction**: Client-side from the markdown answer — bold terms (`**X**`) become concept nodes, H2/H3 headers become topic nodes, source URLs become source nodes
- **Visualization**: `react-force-graph-2d` — color-coded nodes, hover tooltips, click-to-deep-dive
- **Coloring**:
  - Topic nodes (H2/H3): `var(--accent)` orange
  - Concept nodes (bold): `#7C3AED` purple
  - Source nodes (URLs): `#059669` green

### Node / Link Schema
```json
{
  "nodes": [
    { "id": "string", "name": "string", "type": "topic|concept|source", "url": "string?" }
  ],
  "links": [
    { "source": "string", "target": "string" }
  ]
}
```

---

## 3. Frontend Changes

### 3.1 `ExplorePage.js` — Cortex styling
- Replace `[SEARCH]` → proper filled button with CSS vars
- `[NEW SEARCH]` → "New search" text link
- `[SAVE TO LIBRARY]` → "Save" pill button
- `POE_NATIVE_SEARCH: ON` / `DDGO_SEARCH: ON` → clean toggle label: "Poe Search" / "Web Search"
- `SOURCES — N RESULTS` → "Sources · N" in `var(--fg-dim)`
- `ERROR: ...` → clean error box with rounded corners
- `font-mono` → `var(--font-family)` throughout (except code blocks)
- All `border-radius: 0` → 8–12px

### 3.2 `KnowledgeGraph.js` (new)
- Props: `{ nodes, links, onNodeClick }`
- Uses `react-force-graph-2d` with `ForceGraph2D`
- Node click → dispatches `fg:set-input` event with `"Tell me more about {node.name}"` to GlobalCommandBar
- Canvas background: `var(--bg-primary)`
- Renders inside a `Box` with fixed height (400px) and border

### 3.3 `ExplorePage.js` — Graph tab
- In results view: add a **Answer | Graph** tab strip above the content area
- `activeTab: 'answer' | 'graph'`
- Graph tab renders `<KnowledgeGraph>` with extracted nodes/links
- Entity extraction runs whenever `answer` changes (useMemo)

---

## 4. Backend Changes (minimal)

### 4.1 `WebSearchTool` in `chat_with_tools()` (Phase 2)
- Register a new `web_search` tool in `TOOL_DEFINITIONS` (tools.py)
- When AI calls it, `ToolExecutor._web_search()` calls `search_service.web_search()` + `scrape_urls()`
- Result injected into AI context for Hybrid RAG
- This enables "search the web and my document together" queries in chat

---

## 5. Revised Execution Order

| Step | Task | Status |
|------|------|--------|
| 1 | ~~WebSearchTool + DDGS pipeline~~ | ✅ Done |
| 2 | ~~ExplorePage SSE + source chips~~ | ✅ Done |
| 3 | Cortex styling cleanup in ExplorePage | 🔧 Now |
| 4 | `react-force-graph` + `KnowledgeGraph.js` | 🔧 Now |
| 5 | Graph tab wired into ExplorePage results | 🔧 Now |
| 6 | `WebSearchTool` in `chat_with_tools()` (Hybrid RAG) | Phase 2 |

---

## 6. Tech Stack Summary

| Concern | Technology |
|---------|-----------|
| Graph visualization | `react-force-graph-2d` |
| Entity extraction | Client-side (regex on markdown) |
| Graph storage | JSON column in SQLite `StudySession` |
| Web search | DuckDuckGo (free, no key) + Poe Web-Search |
| AI synthesis | Poe API (Grok 3 / Claude-3.5-Sonnet) |
| Scraping | trafilatura (already installed) |
