"""
search_service.py — Web search + scraping pipeline for FileGeek Explore Hub.

Uses DuckDuckGo (free, no API key) for search and trafilatura for clean
Markdown extraction from web pages.
"""

from __future__ import annotations

import logging
import concurrent.futures
from typing import Any

logger = logging.getLogger(__name__)

# ── DuckDuckGo search ──────────────────────────────────────────────────────────

def web_search(query: str, max_results: int = 8) -> list[dict[str, str]]:
    """Return a list of {title, url, snippet} dicts from DuckDuckGo."""
    try:
        try:
            from ddgs import DDGS
        except ImportError:
            from duckduckgo_search import DDGS
        results: list[dict[str, str]] = []
        with DDGS() as ddgs:
            for r in ddgs.text(query, max_results=max_results):
                results.append({
                    "title": r.get("title", ""),
                    "url": r.get("href", r.get("link", "")),
                    "snippet": r.get("body", r.get("description", "")),
                })
        logger.info("web_search.ok", extra={"query": query, "count": len(results)})
        return results
    except Exception as exc:
        logger.error("web_search.failed", extra={"error": str(exc)})
        return []


# ── Trafilatura scraping ───────────────────────────────────────────────────────

def _scrape_one(url: str) -> dict[str, str] | None:
    """Fetch a URL and return clean Markdown, or None on failure."""
    try:
        import trafilatura
        downloaded = trafilatura.fetch_url(url)
        if not downloaded:
            return None
        text = trafilatura.extract(
            downloaded,
            output_format="markdown",
            include_links=False,
            include_images=False,
        )
        if not text:
            return None
        # Truncate to ~3 000 chars to keep context manageable
        return {"url": url, "markdown": text[:3000]}
    except Exception as exc:
        logger.warning("scrape.failed", extra={"url": url, "error": str(exc)})
        return None


def scrape_urls(urls: list[str], max_pages: int = 5) -> list[dict[str, str]]:
    """Scrape up to *max_pages* URLs in parallel. Returns [{url, markdown}]."""
    targets = urls[:max_pages]
    scraped: list[dict[str, str]] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        futures = {pool.submit(_scrape_one, url): url for url in targets}
        for future in concurrent.futures.as_completed(futures, timeout=15):
            result = future.result()
            if result:
                scraped.append(result)
    logger.info("scrape.done", extra={"scraped": len(scraped), "attempted": len(targets)})
    return scraped


# ── Context builder ───────────────────────────────────────────────────────────

def build_context(
    results: list[dict[str, str]],
    scraped: list[dict[str, str]],
) -> tuple[str, list[dict[str, str]]]:
    """
    Combine search snippets and scraped Markdown into a numbered context block
    suitable for injection into an LLM system prompt.

    Returns (context_block, source_list) where source_list = [{title, url, snippet}].
    """
    # Build a URL → scraped-markdown lookup
    scraped_map: dict[str, str] = {s["url"]: s["markdown"] for s in scraped}

    lines: list[str] = []
    sources: list[dict[str, str]] = []

    for idx, r in enumerate(results, start=1):
        url = r.get("url", "")
        title = r.get("title", url)
        snippet = r.get("snippet", "")
        md = scraped_map.get(url, "")

        sources.append({"title": title, "url": url, "snippet": snippet})
        lines.append(f"[{idx}] **{title}**\nURL: {url}")
        if md:
            lines.append(f"Content:\n{md}")
        elif snippet:
            lines.append(f"Snippet: {snippet}")
        lines.append("")  # blank separator

    context_block = "\n".join(lines)
    return context_block, sources
