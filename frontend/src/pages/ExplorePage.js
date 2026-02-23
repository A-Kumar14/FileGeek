import React, { useState, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import { Box, Typography, Skeleton, Tooltip, CircularProgress } from '@mui/material';
import { Search, Globe, BookmarkPlus, RotateCcw, ExternalLink } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useChatContext } from '../contexts/ChatContext';

const KnowledgeGraph = lazy(() => import('../components/KnowledgeGraph'));

const API = process.env.REACT_APP_API_URL || 'http://localhost:5001';

// ── Inline citation badge ────────────────────────────────────────────────────
function CitationLink({ href, children, sources }) {
    const text = React.Children.toArray(children)
        .map((c) => (typeof c === 'string' ? c : ''))
        .join('');
    const isCitation = /^\[?\d+\]?$/.test(text.trim());
    if (isCitation) {
        const num = parseInt(text.replace(/\D/g, ''), 10);
        const src = sources[num - 1];
        return (
            <Tooltip title={src?.url || href || ''} placement="top">
                <a
                    href={src?.url || href || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 18,
                        height: 18,
                        fontSize: '0.6rem',
                        fontWeight: 700,
                        fontFamily: 'var(--font-family)',
                        color: '#FFF',
                        background: 'var(--accent)',
                        borderRadius: '50%',
                        textDecoration: 'none',
                        verticalAlign: 'super',
                        lineHeight: 1,
                        marginLeft: 2,
                    }}
                >
                    {num}
                </a>
            </Tooltip>
        );
    }
    return (
        <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
            {children}
        </a>
    );
}

// ── Source chip ──────────────────────────────────────────────────────────────
function SourceChip({ src, index }) {
    return (
        <a href={src.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
            <Box sx={{
                display: 'flex', alignItems: 'center', gap: 0.75,
                px: 1.25, py: 0.6,
                border: '1px solid var(--border)',
                borderRadius: '8px',
                bgcolor: 'var(--bg-secondary)',
                cursor: 'pointer',
                transition: 'border-color 0.15s',
                '&:hover': { borderColor: 'var(--accent)' },
            }}>
                {src.favicon && (
                    <img src={src.favicon} alt="" width={13} height={13}
                        style={{ flexShrink: 0 }}
                        onError={(e) => { e.target.style.display = 'none'; }}
                    />
                )}
                <Typography noWrap sx={{ fontFamily: 'var(--font-family)', fontSize: '0.72rem', fontWeight: 500, color: 'var(--fg-secondary)', maxWidth: 160 }}>
                    [{index + 1}] {src.title || src.url}
                </Typography>
                <ExternalLink size={10} color="var(--fg-dim)" />
            </Box>
        </a>
    );
}

// ── Suggestion chips ─────────────────────────────────────────────────────────
const SUGGESTIONS = [
    'Latest breakthroughs in quantum computing',
    'How does RAG work in AI systems?',
    'Best open source LLMs in 2026',
    'Explain transformer attention mechanisms',
    'FastAPI vs Flask for production APIs',
    'Top AI coding assistants compared',
];

// ── Extract graph data from markdown answer ──────────────────────────────────
function extractGraphData(answer, sources) {
    const nodes = [];
    const links = [];
    const seen = new Set();

    const addNode = (id, name, type, url) => {
        if (!seen.has(id)) {
            seen.add(id);
            nodes.push({ id, name, type, url });
        }
    };

    // Query node (center)
    addNode('__query__', 'Query', 'query');

    // Source nodes
    sources.forEach((src, i) => {
        const id = `src_${i}`;
        const label = src.title
            ? src.title.slice(0, 32) + (src.title.length > 32 ? '…' : '')
            : `Source ${i + 1}`;
        addNode(id, label, 'source', src.url);
        links.push({ source: '__query__', target: id });
    });

    // H2/H3 headers → topic nodes
    const headers = [...answer.matchAll(/^#{2,3}\s+(.+)$/gm)].map(m => m[1].trim());
    headers.forEach((h, i) => {
        const id = `topic_${i}`;
        addNode(id, h.slice(0, 40), 'topic');
        links.push({ source: '__query__', target: id });
    });

    // Bold terms → concept nodes (max 12 to avoid clutter)
    const bold = [...new Set([...answer.matchAll(/\*\*([^*]{3,40})\*\*/g)].map(m => m[1].trim()))];
    bold.slice(0, 12).forEach((b, i) => {
        const id = `concept_${i}`;
        addNode(id, b, 'concept');
        // Link concept to nearest topic (or query if no topics)
        const target = headers.length > 0 ? `topic_${Math.min(i, headers.length - 1)}` : '__query__';
        links.push({ source: target, target: id });
    });

    return { nodes, links };
}

// ── Search bar ───────────────────────────────────────────────────────────────
function SearchBar({ query, setQuery, onSubmit }) {
    const inputRef = useRef(null);
    const handleKey = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit(); }
    };
    return (
        <Box
            component="form"
            onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
            sx={{
                width: '100%', maxWidth: 680,
                display: 'flex', alignItems: 'center', gap: 1.5,
                border: '1px solid var(--border)',
                borderRadius: '14px',
                bgcolor: 'var(--bg-secondary)',
                px: 2, py: 1.25,
                transition: 'border-color 0.15s, box-shadow 0.15s',
                '&:focus-within': { borderColor: 'var(--accent)', boxShadow: '0 0 0 3px var(--accent-dim)' },
            }}
        >
            <Search size={17} color="var(--fg-dim)" strokeWidth={2} style={{ flexShrink: 0 }} />
            <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Search the web..."
                autoComplete="off"
                style={{
                    flex: 1, border: 'none', outline: 'none',
                    background: 'transparent',
                    fontSize: '0.92rem',
                    fontFamily: 'var(--font-family)',
                    color: 'var(--fg-primary)',
                    padding: '4px 0',
                }}
            />
            {query && (
                <Box
                    component="button"
                    type="submit"
                    sx={{
                        border: 'none',
                        bgcolor: 'var(--accent)',
                        color: '#FFF',
                        fontFamily: 'var(--font-family)',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        px: 1.5, py: 0.5,
                        borderRadius: '8px',
                        cursor: 'pointer',
                        flexShrink: 0,
                        transition: 'opacity 0.12s',
                        '&:hover': { opacity: 0.88 },
                    }}
                >
                    Search
                </Box>
            )}
        </Box>
    );
}

// ── Tab strip ────────────────────────────────────────────────────────────────
function TabStrip({ active, onChange }) {
    const tab = (key, label) => (
        <Box
            onClick={() => onChange(key)}
            sx={{
                px: 1.5, py: 0.6,
                fontSize: '0.78rem',
                fontWeight: active === key ? 600 : 500,
                fontFamily: 'var(--font-family)',
                color: active === key ? 'var(--accent)' : 'var(--fg-secondary)',
                borderBottom: active === key ? '2px solid var(--accent)' : '2px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.15s',
                '&:hover': { color: 'var(--fg-primary)' },
            }}
        >
            {label}
        </Box>
    );
    return (
        <Box sx={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', mb: 1.5 }}>
            {tab('answer', 'Answer')}
            {tab('graph', 'Knowledge Graph')}
        </Box>
    );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function ExplorePage() {
    const token = localStorage.getItem('filegeek-token') || '';
    const { startNewSession } = useChatContext();
    const exploreSessionRef = useRef(null);

    const [query, setQuery] = useState('');
    const [phase, setPhase] = useState('idle');
    const [sources, setSources] = useState([]);
    const [answer, setAnswer] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [saved, setSaved] = useState(false);
    const [streaming, setStreaming] = useState(false);
    const [activeTab, setActiveTab] = useState('answer');
    const abortRef = useRef(null);

    const graphData = useMemo(
        () => (answer ? extractGraphData(answer, sources) : { nodes: [], links: [] }),
        [answer, sources]
    );

    const runSearch = useCallback(async (q) => {
        if (!q?.trim()) return;
        if (abortRef.current) abortRef.current.abort();
        abortRef.current = new AbortController();

        setPhase('searching');
        setSources([]);
        setAnswer('');
        setSaved(false);
        setErrorMsg('');
        setStreaming(true);
        setActiveTab('answer');

        // Create (or reuse) an explore session so the backend can tag it as session_type="explore"
        if (!exploreSessionRef.current) {
            try {
                exploreSessionRef.current = await startNewSession(q.trim().slice(0, 60), 'explore');
            } catch { /* non-critical */ }
        }

        try {
            const res = await fetch(`${API}/explore/search`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    query: q.trim(),
                    session_id: exploreSessionRef.current || undefined,
                }),
                signal: abortRef.current.signal,
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || `HTTP ${res.status}`);
            }

            setPhase('results');

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buf = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buf += decoder.decode(value, { stream: true });
                const parts = buf.split('\n\n');
                buf = parts.pop();
                for (const part of parts) {
                    const line = part.trim();
                    if (!line.startsWith('data: ')) continue;
                    const raw = line.slice(6).trim();
                    if (raw === '[DONE]') { setStreaming(false); break; }
                    try {
                        const evt = JSON.parse(raw);
                        if (evt.type === 'sources') setSources(evt.sources || []);
                        else if (evt.type === 'chunk') setAnswer((prev) => prev + evt.text);
                        else if (evt.type === 'error') setErrorMsg(evt.text);
                    } catch { /* ignore malformed sse */ }
                }
            }
        } catch (err) {
            if (err.name !== 'AbortError') {
                setErrorMsg(err.message);
                setPhase('error');
            }
        } finally {
            setStreaming(false);
        }
    }, [token, startNewSession]);

    const handleSubmit = () => { if (query.trim()) runSearch(query); };

    const handleSave = useCallback(async () => {
        if (!answer) return;
        const filename = `explore-${query.slice(0, 40).replace(/\s+/g, '-')}-${Date.now()}.md`;
        const content = `# ${query}\n\n${answer}\n\n---\n*Saved from FileGeek Explore*`;
        const blob = new Blob([content], { type: 'text/markdown' });
        const file = new File([blob], filename, { type: 'text/markdown' });
        const formData = new FormData();
        formData.append('file', file);
        try {
            const res = await fetch(`${API}/upload`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: formData,
            });
            if (res.ok) setSaved(true);
        } catch { /* silently fail */ }
    }, [answer, query, token]);

    // ── Controls strip ───────────────────────────────────────────────────────
    const Controls = (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            {(phase === 'results' || phase === 'error') && (
                <>
                    <Box
                        onClick={() => { setPhase('idle'); setAnswer(''); setSources([]); setQuery(''); setErrorMsg(''); exploreSessionRef.current = null; }}
                        sx={{
                            display: 'flex', alignItems: 'center', gap: 0.5,
                            cursor: 'pointer', color: 'var(--fg-dim)',
                            fontFamily: 'var(--font-family)', fontSize: '0.75rem',
                            '&:hover': { color: 'var(--fg-primary)' },
                        }}
                    >
                        <RotateCcw size={11} /> New search
                    </Box>
                    {answer && (
                        <Box
                            onClick={handleSave}
                            sx={{
                                display: 'flex', alignItems: 'center', gap: 0.5,
                                cursor: 'pointer',
                                color: saved ? 'var(--accent)' : 'var(--fg-secondary)',
                                fontFamily: 'var(--font-family)', fontSize: '0.75rem',
                                border: '1px solid var(--border)', px: 1, py: 0.35,
                                borderRadius: '8px',
                                transition: 'all 0.15s',
                                '&:hover': { borderColor: 'var(--accent)', color: 'var(--accent)' },
                            }}
                        >
                            <BookmarkPlus size={11} /> {saved ? 'Saved' : 'Save'}
                        </Box>
                    )}
                </>
            )}
        </Box>
    );

    // ── Idle ─────────────────────────────────────────────────────────────────
    if (phase === 'idle') {
        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 2.5, px: 3, pb: 8, bgcolor: 'var(--bg-primary)' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                    <Box sx={{ width: 36, height: 36, borderRadius: '10px', bgcolor: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Globe size={18} color="#FFF" strokeWidth={2} />
                    </Box>
                    <Box>
                        <Typography sx={{ fontFamily: 'var(--font-family)', fontSize: '1.2rem', fontWeight: 700, color: 'var(--fg-primary)', lineHeight: 1.1 }}>
                            Explore
                        </Typography>
                        <Typography sx={{ fontFamily: 'var(--font-family)', fontSize: '0.72rem', color: 'var(--fg-dim)' }}>
                            Web search · AI reasoning · Inline citations
                        </Typography>
                    </Box>
                </Box>

                <SearchBar query={query} setQuery={setQuery} onSubmit={handleSubmit} />
                {Controls}

                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, maxWidth: 680, justifyContent: 'center', mt: 0.5 }}>
                    {SUGGESTIONS.map((s) => (
                        <Box
                            key={s}
                            onClick={() => { setQuery(s); runSearch(s); }}
                            sx={{
                                fontFamily: 'var(--font-family)', fontSize: '0.75rem',
                                color: 'var(--fg-secondary)',
                                border: '1px solid var(--border)',
                                borderRadius: '20px',
                                bgcolor: 'var(--bg-secondary)',
                                px: 1.5, py: 0.5,
                                cursor: 'pointer',
                                transition: 'all 0.12s',
                                '&:hover': { borderColor: 'var(--accent)', color: 'var(--fg-primary)' },
                            }}
                        >
                            {s}
                        </Box>
                    ))}
                </Box>
            </Box>
        );
    }

    // ── Searching ─────────────────────────────────────────────────────────────
    if (phase === 'searching') {
        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, px: 3, pt: 4, pb: 8, maxWidth: 760, mx: 'auto', width: '100%', bgcolor: 'var(--bg-primary)', height: '100%' }}>
                <SearchBar query={query} setQuery={setQuery} onSubmit={handleSubmit} />
                {Controls}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1 }}>
                    <CircularProgress size={14} sx={{ color: 'var(--accent)' }} />
                    <Typography sx={{ fontFamily: 'var(--font-family)', fontSize: '0.8rem', color: 'var(--fg-secondary)' }}>
                        Searching the web and reasoning…
                    </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', width: '100%', maxWidth: 760 }}>
                    {[...Array(6)].map((_, i) => <Skeleton key={i} variant="rectangular" width={130} height={30} sx={{ borderRadius: '8px', bgcolor: 'var(--bg-secondary)' }} />)}
                </Box>
                <Box sx={{ width: '100%', maxWidth: 760 }}>
                    {[...Array(8)].map((_, i) => <Skeleton key={i} variant="text" width={`${70 + (i % 3) * 10}%`} sx={{ bgcolor: 'var(--bg-secondary)', height: 22, mb: 0.5 }} />)}
                </Box>
            </Box>
        );
    }

    // ── Results ───────────────────────────────────────────────────────────────
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, px: 3, pt: 4, pb: 12, maxWidth: 760, mx: 'auto', width: '100%', bgcolor: 'var(--bg-primary)', minHeight: '100%', overflowY: 'auto' }}>
            <SearchBar query={query} setQuery={setQuery} onSubmit={handleSubmit} />
            {Controls}

            {/* Sources strip */}
            {sources.length > 0 && (
                <Box sx={{ width: '100%' }}>
                    <Typography sx={{ fontFamily: 'var(--font-family)', fontSize: '0.65rem', fontWeight: 600, color: 'var(--fg-dim)', mb: 0.75, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                        Sources · {sources.length}
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                        {sources.map((src, i) => <SourceChip key={i} src={src} index={i} />)}
                    </Box>
                </Box>
            )}

            <Box sx={{ width: '100%', height: '1px', bgcolor: 'var(--border)' }} />

            {/* Error */}
            {errorMsg && (
                <Box sx={{ width: '100%', border: '1px solid var(--error)', bgcolor: 'rgba(220,38,38,0.06)', borderRadius: '10px', p: 1.5 }}>
                    <Typography sx={{ fontFamily: 'var(--font-family)', fontSize: '0.8rem', color: 'var(--error)' }}>
                        {errorMsg}
                    </Typography>
                </Box>
            )}

            {/* Answer / Graph tabs */}
            {answer && (
                <Box sx={{ width: '100%' }}>
                    <TabStrip active={activeTab} onChange={setActiveTab} />

                    {activeTab === 'answer' && (
                        <Box sx={{
                            '& p': { fontFamily: 'var(--font-family)', fontSize: '0.9rem', lineHeight: 1.72, color: 'var(--fg-primary)', my: 0.75 },
                            '& h1, & h2, & h3': { fontFamily: 'var(--font-family)', fontWeight: 700, color: 'var(--fg-primary)', mt: 2, mb: 0.5 },
                            '& h1': { fontSize: '1.1rem' },
                            '& h2': { fontSize: '0.95rem' },
                            '& h3': { fontSize: '0.85rem' },
                            '& code': { fontFamily: 'var(--font-mono)', fontSize: '0.82rem', bgcolor: 'var(--bg-tertiary)', px: '5px', py: '1px', borderRadius: '4px', border: '1px solid var(--border)' },
                            '& pre': { bgcolor: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', p: 1.5, overflowX: 'auto', '& code': { border: 'none', bgcolor: 'transparent' } },
                            '& ul, & ol': { pl: 2.5, my: 0.5 },
                            '& li': { color: 'var(--fg-primary)', fontSize: '0.9rem', lineHeight: 1.65, mb: 0.25 },
                            '& strong': { color: 'var(--fg-primary)', fontWeight: 700 },
                            '& em': { color: 'var(--fg-secondary)' },
                            '& blockquote': { borderLeft: '3px solid var(--accent)', pl: 1.5, ml: 0, color: 'var(--fg-secondary)', fontStyle: 'italic' },
                            '& a': { color: 'var(--accent)', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } },
                            '& table': { borderCollapse: 'collapse', width: '100%', my: 1 },
                            '& th, & td': { border: '1px solid var(--border)', p: '6px 12px', fontSize: '0.83rem', color: 'var(--fg-primary)' },
                            '& th': { bgcolor: 'var(--bg-secondary)', fontWeight: 700 },
                            '& hr': { border: 'none', borderTop: '1px solid var(--border)', my: 1.5 },
                        }}>
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{ a: ({ href, children }) => <CitationLink href={href} sources={sources}>{children}</CitationLink> }}
                            >
                                {answer}
                            </ReactMarkdown>
                            {streaming && (
                                <Box component="span" sx={{ display: 'inline-block', width: 7, height: 15, bgcolor: 'var(--accent)', borderRadius: '2px', animation: 'blinkPulse 1s step-end infinite', verticalAlign: 'text-bottom', ml: 0.5 }} />
                            )}
                        </Box>
                    )}

                    {activeTab === 'graph' && (
                        <Suspense fallback={<Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={20} sx={{ color: 'var(--accent)' }} /></Box>}>
                            <KnowledgeGraph
                                nodes={graphData.nodes}
                                links={graphData.links}
                            />
                        </Suspense>
                    )}
                </Box>
            )}

            <style>{`@keyframes blinkPulse { 50% { opacity: 0; } }`}</style>
        </Box>
    );
}
