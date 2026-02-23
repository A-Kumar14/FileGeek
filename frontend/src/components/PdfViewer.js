import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { FixedSizeList } from 'react-window';
import { Box, Tooltip, Typography, TextField } from '@mui/material';
import './PdfViewer.css';
import HighlightLayer from './HighlightLayer';
import SelectionToolbar from './SelectionToolbar';
import StickyNotePanel from './StickyNotePanel';
import { useAnnotations } from '../contexts/AnnotationContext';
import { useFile } from '../contexts/FileContext';
import { getSelectionRectsRelativeTo } from '../utils/selectionUtils';

pdfjs.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL}/pdf.worker-5.4.296.min.mjs`;

// Estimated A4 page height at scale=1.0, plus inter-page gap
const BASE_PAGE_HEIGHT = 1060;
const PAGE_GAP = 16;
const THUMB_ITEM_HEIGHT = 200; // thumbnail card height incl. padding
const THUMB_WIDTH = 166;       // thumbnail sidebar width

/* ── Thumbnail item (rendered by FixedSizeList) ── */
const ThumbnailItem = React.memo(function ThumbnailItem({ index, style, data }) {
  const { pageNum, onClick } = data;
  const n = index + 1;
  const isActive = pageNum === n;
  const ref = useRef(null);
  const [hasRendered, setHasRendered] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || hasRendered) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setHasRendered(true); obs.disconnect(); } },
      { rootMargin: '200px 0px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasRendered]);

  return (
    <button
      ref={ref}
      type="button"
      className={`pdf-thumb ${isActive ? 'active' : ''}`}
      style={style}
      onClick={() => onClick(n)}
      aria-label={`Go to page ${n}`}
    >
      {hasRendered ? (
        <Page pageNumber={n} width={150} renderTextLayer={false} renderAnnotationLayer={false} />
      ) : (
        <span className="pdf-thumb-placeholder">{n}</span>
      )}
      <span className="pdf-thumb-num">{n}</span>
    </button>
  );
});

/* ── Main page item (rendered by FixedSizeList) ── */
const PageItem = React.memo(function PageItem({ index, style, data }) {
  const { scale, rotation, darkFilter, pageRefs, computedSourceRects } = data;
  const n = index + 1;
  return (
    <div
      style={{ ...style, paddingBottom: PAGE_GAP, boxSizing: 'border-box' }}
      data-page={n}
      ref={(el) => { pageRefs.current[n - 1] = el; }}
    >
      <div
        style={{
          width: 'fit-content',
          margin: '0 auto',
          ...(darkFilter ? { filter: 'invert(0.88) hue-rotate(180deg)' } : {}),
        }}
      >
        <Page
          pageNumber={n}
          scale={scale}
          rotate={rotation}
          renderTextLayer={true}
          renderAnnotationLayer={true}
          devicePixelRatio={window.devicePixelRatio || 1}
        />
        <HighlightLayer pageNum={n} scale={scale} sourceHighlights={computedSourceRects} />
      </div>
    </div>
  );
});

/* ── Text toolbar button ── */
function ToolBtn({ label, onClick, disabled, active, tooltip }) {
  const btn = (
    <Box
      onClick={disabled ? undefined : onClick}
      sx={{
        cursor: disabled ? 'default' : 'pointer',
        color: disabled ? 'var(--fg-dim)' : active ? 'var(--accent)' : 'var(--fg-secondary)',
        fontFamily: 'var(--font-family)', fontSize: '0.78rem', fontWeight: 600,
        px: 0.75, py: 0.25, borderRadius: '6px',
        userSelect: 'none', transition: 'all 0.15s',
        '&:hover': disabled ? {} : { color: 'var(--accent)', bgcolor: 'var(--accent-dim)' },
      }}
    >
      {label}
    </Box>
  );
  return tooltip ? <Tooltip title={tooltip}>{btn}</Tooltip> : btn;
}

function Sep() {
  return <Box sx={{ width: '1px', height: 16, bgcolor: 'var(--border)', mx: 0.5, flexShrink: 0 }} />;
}

function PdfViewer({ file, targetPage, onPageChange }) {
  const [numPages, setNumPages] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [rotation, setRotation] = useState(0);
  const [darkFilter, setDarkFilter] = useState(false);
  const [pageInput, setPageInput] = useState('');

  // Heights measured by ResizeObserver — required by FixedSizeList
  const [thumbHeight, setThumbHeight] = useState(600);
  const [mainHeight, setMainHeight] = useState(600);

  const thumbContainerRef = useRef(null);
  const mainContainerRef = useRef(null);
  const thumbListRef = useRef(null);
  const pageListRef = useRef(null);
  const pageRefs = useRef([]);
  const isScrollingTo = useRef(false);

  // Backward-compat ref for SelectionToolbar
  const pageWrapperRef = { current: pageRefs.current[pageNum - 1] || null };

  const { addHighlight, addComment, setNotePanelOpen, highlights, notes, comments, undo, redo } = useAnnotations();
  const { activeSourceHighlight } = useFile();
  const [computedSourceRects, setComputedSourceRects] = useState([]);

  // Measure thumbnail sidebar height
  useEffect(() => {
    const el = thumbContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setThumbHeight(entry.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Measure main scroll area height
  useEffect(() => {
    const el = mainContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setMainHeight(entry.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Cmd+Z / Cmd+Shift+Z — undo/redo annotations
  useEffect(() => {
    const handler = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const ctrl = isMac ? e.metaKey : e.ctrlKey;
      if (!ctrl || e.key !== 'z') return;
      e.preventDefault();
      e.shiftKey ? redo() : undo();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  const handleExportAnnotations = useCallback(() => {
    const data = { highlights, notes, comments, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `annotations-${file?.name || 'document'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [highlights, notes, comments, file]);

  const fileData = useMemo(() => file || null, [file]);

  const onDocumentLoadSuccess = useCallback(({ numPages: total }) => {
    setNumPages(total);
    setPageNum(1);
    setRotation(0);
    pageRefs.current = [];
  }, []);

  // Item height = estimated page height at current scale + inter-page gap
  const pageItemSize = useMemo(() => Math.ceil(BASE_PAGE_HEIGHT * scale) + PAGE_GAP, [scale]);

  // Programmatic scroll via react-window
  const scrollToPage = useCallback((n) => {
    const clamped = Math.max(1, Math.min(n, numPages));
    isScrollingTo.current = true;
    pageListRef.current?.scrollToItem(clamped - 1, 'start');
    thumbListRef.current?.scrollToItem(clamped - 1, 'smart');
    setTimeout(() => { isScrollingTo.current = false; }, 600);
  }, [numPages]);

  // Track visible page as user scrolls
  const handleItemsRendered = useCallback(({ visibleStartIndex }) => {
    if (isScrollingTo.current) return;
    const n = visibleStartIndex + 1;
    setPageNum(n);
    if (onPageChange) onPageChange(n, numPages);
  }, [numPages, onPageChange]);

  const goToPage = useCallback((n) => {
    const clamped = Math.max(1, Math.min(n, numPages));
    setPageNum(clamped);
    scrollToPage(clamped);
  }, [numPages, scrollToPage]);

  // External page navigation (e.g. source highlight click)
  useEffect(() => {
    if (targetPage && targetPage >= 1 && targetPage <= numPages) goToPage(targetPage);
  }, [targetPage, numPages, goToPage]);

  useEffect(() => {
    if (onPageChange) onPageChange(pageNum, numPages);
  }, [pageNum, numPages, onPageChange]);

  const findTextRectsForExcerpt = useCallback((excerptText, targetPageNum) => {
    const wrapper = pageRefs.current[(targetPageNum || pageNum) - 1];
    const textLayer = wrapper?.querySelector('.react-pdf__Page__textContent');
    if (!textLayer || !excerptText) return [];
    const words = excerptText.trim().split(/\s+/).slice(0, 8);
    const containerRect = wrapper.getBoundingClientRect();
    return Array.from(textLayer.querySelectorAll('span'))
      .filter((span) => words.some((w) => span.textContent?.includes(w)))
      .map((span) => {
        const r = span.getBoundingClientRect();
        return {
          x: (r.left - containerRect.left) / scale,
          y: (r.top - containerRect.top) / scale,
          width: r.width / scale,
          height: r.height / scale,
        };
      });
  }, [scale, pageNum]);

  // Compute source highlight rects when activeSourceHighlight changes
  useEffect(() => {
    if (!activeSourceHighlight) { setComputedSourceRects([]); return; }
    const targetP = activeSourceHighlight.page || pageNum;
    goToPage(targetP);
    const timer = setTimeout(() => {
      const rects = findTextRectsForExcerpt(activeSourceHighlight.excerpt, targetP);
      setComputedSourceRects(rects.length > 0 ? [{ page: targetP, rects }] : []);
    }, 450);
    return () => clearTimeout(timer);
  }, [activeSourceHighlight, goToPage, findTextRectsForExcerpt, pageNum]);

  const handleHighlight = useCallback(() => {
    const wrapper = pageRefs.current[pageNum - 1];
    if (!wrapper) return;
    const result = getSelectionRectsRelativeTo(wrapper, scale);
    if (!result) return;
    addHighlight({ text: result.text, color: 'rgba(255, 235, 59, 0.4)', rects: result.rects, pageNum });
  }, [scale, pageNum, addHighlight]);

  const handleComment = useCallback((commentText) => {
    const wrapper = pageRefs.current[pageNum - 1];
    if (!wrapper) return;
    const result = getSelectionRectsRelativeTo(wrapper, scale);
    if (!result) return;
    addComment({ text: result.text, comment: commentText, rects: result.rects, pageNum });
  }, [scale, pageNum, addComment]);

  const hasAnnotations = highlights.length > 0 || notes.length > 0 || comments.length > 0;

  // Stable item data objects passed to react-window renderers (avoid re-render churn)
  const thumbItemData = useMemo(() => ({ pageNum, onClick: goToPage }), [pageNum, goToPage]);
  const pageItemData = useMemo(
    () => ({ scale, rotation, darkFilter, pageRefs, computedSourceRects }),
    [scale, rotation, darkFilter, computedSourceRects]
  );

  if (!fileData) return <div className="placeholder">[ NO_DOCUMENT ]</div>;

  return (
    <div className="pdf-viewer-wrap">
      <Document
        className="pdf-document"
        file={fileData}
        onLoadSuccess={onDocumentLoadSuccess}
        loading={
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', p: 4 }}>
            <Typography sx={{ fontFamily: 'var(--font-family)', fontSize: '0.85rem', color: 'var(--fg-dim)' }}>Loading document...</Typography>
          </Box>
        }
        error={
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', p: 4 }}>
            <Typography sx={{ fontFamily: 'var(--font-family)', fontSize: '0.85rem', color: 'var(--error)' }}>Failed to load document</Typography>
          </Box>
        }
      >
        {numPages > 0 && (
          <>
            {/* ── Toolbar ── */}
            <header className="pdf-viewer-sticky-header">
              <Box className="pdf-toolbar">
                {/* Page navigation */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <ToolBtn label="‹" onClick={() => goToPage(pageNum - 1)} disabled={pageNum <= 1} tooltip="Previous page" />
                  <TextField
                    size="small"
                    value={pageInput || pageNum}
                    onChange={(e) => setPageInput(e.target.value)}
                    onBlur={() => { const v = parseInt(pageInput, 10); if (v >= 1 && v <= numPages) goToPage(v); setPageInput(''); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const v = parseInt(pageInput, 10);
                        if (v >= 1 && v <= numPages) goToPage(v);
                        setPageInput('');
                        e.target.blur();
                      }
                    }}
                    onFocus={() => setPageInput(String(pageNum))}
                    slotProps={{ input: { sx: { textAlign: 'center', fontSize: '0.8rem', fontFamily: 'var(--font-family)', py: 0.25, px: 0.5 } } }}
                    sx={{ width: 44, '& .MuiOutlinedInput-root': { borderRadius: '6px' } }}
                    aria-label="Go to page"
                  />
                  <Typography sx={{ fontFamily: 'var(--font-family)', fontSize: '0.75rem', color: 'var(--fg-dim)', whiteSpace: 'nowrap' }}>
                    / {numPages}
                  </Typography>
                  <ToolBtn label="›" onClick={() => goToPage(pageNum + 1)} disabled={pageNum >= numPages} tooltip="Next page" />
                </Box>

                <Sep />

                {/* Zoom */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <ToolBtn label="−" onClick={() => setScale((s) => Math.max(s - 0.2, 0.5))} disabled={scale <= 0.5} tooltip="Zoom out" />
                  <Typography sx={{ fontFamily: 'var(--font-family)', fontSize: '0.75rem', color: 'var(--fg-secondary)', minWidth: 36, textAlign: 'center' }}>
                    {Math.round(scale * 100)}%
                  </Typography>
                  <ToolBtn label="+" onClick={() => setScale((s) => Math.min(s + 0.2, 3))} disabled={scale >= 3} tooltip="Zoom in" />
                </Box>

                <Sep />

                {/* Rotate */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                  <ToolBtn label="↺" onClick={() => setRotation((r) => (r - 90 + 360) % 360)} tooltip="Rotate left" />
                  <ToolBtn label="↻" onClick={() => setRotation((r) => (r + 90) % 360)} tooltip="Rotate right" />
                </Box>

                <Sep />

                {/* Tools */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                  <ToolBtn label="Notes" onClick={() => setNotePanelOpen(true)} tooltip="Open notes" />
                  <ToolBtn label="Invert" onClick={() => setDarkFilter((d) => !d)} active={darkFilter} tooltip={darkFilter ? 'Normal view' : 'Dark reading mode'} />
                  {hasAnnotations && <ToolBtn label="Export" onClick={handleExportAnnotations} tooltip="Export annotations" />}
                </Box>
              </Box>
            </header>

            <div className="pdf-viewer-body">
              {/* ── Virtualized thumbnail sidebar ── */}
              <aside
                className="pdf-thumbnails"
                ref={thumbContainerRef}
                style={{ width: THUMB_WIDTH, overflow: 'hidden', flexShrink: 0 }}
              >
                <FixedSizeList
                  ref={thumbListRef}
                  height={thumbHeight}
                  width={THUMB_WIDTH}
                  itemCount={numPages}
                  itemSize={THUMB_ITEM_HEIGHT}
                  itemData={thumbItemData}
                  overscanCount={3}
                >
                  {ThumbnailItem}
                </FixedSizeList>
              </aside>

              {/* ── Virtualized main page view ── */}
              <div
                className="pdf-container"
                ref={mainContainerRef}
                style={{ flex: 1, overflow: 'hidden' }}
              >
                <FixedSizeList
                  ref={pageListRef}
                  height={mainHeight}
                  width="100%"
                  itemCount={numPages}
                  itemSize={pageItemSize}
                  itemData={pageItemData}
                  overscanCount={2}
                  onItemsRendered={handleItemsRendered}
                >
                  {PageItem}
                </FixedSizeList>
              </div>
            </div>

            <SelectionToolbar
              containerRef={pageWrapperRef}
              onHighlight={handleHighlight}
              onComment={handleComment}
              onOpenNotes={() => setNotePanelOpen(true)}
            />
            <StickyNotePanel />
          </>
        )}
      </Document>
    </div>
  );
}

export default PdfViewer;
