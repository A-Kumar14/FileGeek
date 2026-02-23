import React, { useState, useCallback, useRef, useMemo, Suspense } from 'react';
import { Box, Tooltip, Typography, Collapse } from '@mui/material';
import DOMPurify from 'dompurify';
import SmartCitation from './SmartCitation';

// Lazy-load MarkdownRenderer to reduce main bundle size by ~150KB
const MarkdownRenderer = React.lazy(() => import('./MarkdownRenderer'));
import AudioPlayer from './AudioPlayer';
import ExportMenu from './ExportMenu';
import FeedbackButtons from './FeedbackButtons';
import SuggestionChips from './SuggestionChips';
import { useFile } from '../contexts/FileContext';
import { useChatContext } from '../contexts/ChatContext';

function CopyCodeButton({ code }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };
  return (
    <Tooltip title={copied ? 'Copied' : 'Copy code'}>
      <Box
        onClick={handleCopy}
        sx={{
          position: 'absolute',
          top: 6,
          right: 8,
          cursor: 'pointer',
          color: copied ? 'var(--success)' : 'var(--fg-dim)',
          fontFamily: 'var(--font-family)',
          fontSize: '0.65rem',
          fontWeight: 600,
          zIndex: 1,
          '&:hover': { color: 'var(--accent)' },
          transition: 'color 0.15s',
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </Box>
    </Tooltip>
  );
}

function CodeBlockWrapper({ children, ...props }) {
  const codeText = extractTextFromChildren(children);
  return (
    <Box sx={{ position: 'relative' }}>
      <CopyCodeButton code={codeText} />
      <pre {...props}>{children}</pre>
    </Box>
  );
}

function extractTextFromChildren(children) {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children.map(extractTextFromChildren).join('');
  if (children?.props?.children) return extractTextFromChildren(children.props.children);
  return '';
}

function CustomLink({ href, children }) {
  const childText = extractTextFromChildren(children);
  const isCitation = /^\[?\d+\]?$/.test(childText);
  if (isCitation) {
    const num = childText.replace(/[\[\]]/g, '');
    return (
      <Tooltip title={href} placement="top">
        <a href={href} target="_blank" rel="noopener noreferrer" style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          minWidth: '16px', height: '16px',
          margin: '0 2px', background: 'var(--accent-dim)', color: 'var(--accent)',
          borderRadius: '4px', textDecoration: 'none', border: '1px solid var(--border)',
          fontSize: '0.6rem', fontWeight: 800, fontFamily: 'var(--font-family)', verticalAlign: 'super'
        }}>
          {num}
        </a>
      </Tooltip>
    );
  }
  return <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>{children}</a>;
}

const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'p', 'br', 'strong', 'em', 'b', 'i', 'u', 'a', 'ul', 'ol', 'li',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code',
    'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'span', 'div',
    'sup', 'sub', 'del', 'hr',
  ],
  ALLOWED_ATTR: ['href', 'src', 'alt', 'class', 'title', 'target', 'rel'],
  ALLOW_DATA_ATTR: false,
};

function sanitize(content) {
  if (!content) return '';
  return DOMPurify.sanitize(content, PURIFY_CONFIG);
}

const COLLAPSE_HEIGHT = 300;

function relativeTime(ts) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

const ChatMessage = React.memo(
  function ChatMessage({ message, previousUserMessage }) {
    const isUser = message.role === 'user';
    const { file } = useFile();
    const { sendMessage } = useChatContext();
    const [expanded, setExpanded] = useState(true);
    const [needsCollapse, setNeedsCollapse] = useState(false);
    const contentRef = useRef(null);

    // Memoize sanitized content and intercept citations
    const sanitizedContent = useMemo(() => {
      let text = message.content || '';

      // Map Perplexity-style citations [1] to markdown links using message.sources
      if (message.sources && message.sources.length > 0) {
        text = text.replace(/\[(\d+)\]/g, (match, d1) => {
          const idx = parseInt(d1, 10) - 1;
          if (idx >= 0 && idx < message.sources.length) {
            const src = message.sources[idx];
            const url = typeof src === 'string' ? src : src.url || src.metadata?.source;
            if (url) return `[${match}](${url})`;
          }
          return match;
        });
      }

      return sanitize(text);
    }, [message.content, message.sources]);

    const measuredRef = useCallback((node) => {
      if (node && !isUser) {
        contentRef.current = node;
        requestAnimationFrame(() => {
          if (node.scrollHeight > COLLAPSE_HEIGHT) {
            setNeedsCollapse(true);
            setExpanded(false);
          }
        });
      }
    }, [isUser]);

    return (
      <Box
        sx={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', mb: 1 }}
        role="listitem"
        aria-label={isUser ? 'Your message' : 'Assistant response'}
      >
        <Box
          sx={{
            maxWidth: '80%',
            px: 1.75,
            py: 1.25,
            borderRadius: isUser ? '14px 14px 4px 14px' : '4px 14px 14px 14px',
            bgcolor: isUser ? 'var(--accent)' : 'var(--bg-secondary)',
            border: isUser ? 'none' : '1px solid var(--border)',
            fontFamily: 'var(--font-family)',
            fontSize: '0.9rem',
            color: isUser ? '#FFFFFF' : 'var(--fg-primary)',
            '& p': { m: 0, mb: 0.5 },
            '& pre': {
              p: 1.25,
              overflow: 'auto',
              bgcolor: 'var(--bg-tertiary)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              fontSize: '0.82rem',
              position: 'relative',
            },
            '& code': {
              fontFamily: 'var(--font-mono)',
              color: 'var(--accent)',
              fontSize: '0.82rem',
              bgcolor: 'var(--accent-dim)',
              px: 0.5,
              py: 0.1,
              borderRadius: '4px',
            },
            '& table': {
              borderCollapse: 'collapse',
              width: '100%',
              '& th, & td': { border: '1px solid var(--border)', px: 1, py: 0.5, fontSize: '0.85rem' },
              '& th': { bgcolor: 'var(--bg-tertiary)', fontWeight: 600 },
            },
            '& a': { color: 'var(--accent)' },
            '& h1, & h2, & h3': { mt: 1.5, mb: 0.5, fontWeight: 600, color: 'var(--fg-primary)' },
            '& ul, & ol': { pl: 2.5, mt: 0.5, mb: 0.5 },
            '& li': { mb: 0.25 },
            '& blockquote': {
              borderLeft: '3px solid var(--accent)',
              ml: 0, pl: 1.5,
              color: 'var(--fg-secondary)',
              fontStyle: 'italic',
            },
            '& hr': { border: 'none', borderTop: '1px solid var(--border)', my: 1.5 },
          }}
        >
          {isUser ? (
            <Typography sx={{ fontFamily: 'var(--font-family)', whiteSpace: 'pre-wrap', lineHeight: 1.6, color: '#FFFFFF', fontSize: '0.9rem' }}>
              {message.content}
            </Typography>
          ) : message.isError ? (
            <Box>
              <Typography sx={{ fontFamily: 'var(--font-family)', fontSize: '0.9rem', color: 'var(--error)' }}>
                {message.content}
              </Typography>
              {message.failedQuestion && (
                <Tooltip title="Retry">
                  <Box
                    onClick={() => sendMessage(message.failedQuestion)}
                    sx={{
                      cursor: 'pointer',
                      color: 'var(--fg-dim)',
                      fontFamily: 'var(--font-family)',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      mt: 0.75,
                      '&:hover': { color: 'var(--accent)' },
                    }}
                  >
                    Retry
                  </Box>
                </Tooltip>
              )}
            </Box>
          ) : (
            <>
              <Collapse in={expanded} collapsedSize={needsCollapse ? COLLAPSE_HEIGHT : undefined}>
                <Box ref={measuredRef}>
                  <Suspense
                    fallback={
                      <Typography sx={{ fontFamily: 'var(--font-family)', fontSize: '0.9rem', color: 'var(--fg-dim)' }}>
                        Loading...
                      </Typography>
                    }
                  >
                    <MarkdownRenderer
                      content={sanitizedContent}
                      components={{ pre: CodeBlockWrapper, a: CustomLink }}
                    />
                  </Suspense>
                </Box>
              </Collapse>
              {needsCollapse && (
                <Box
                  onClick={() => setExpanded((prev) => !prev)}
                  sx={{
                    cursor: 'pointer',
                    textAlign: 'center',
                    py: 0.5,
                    color: 'var(--accent)',
                    fontFamily: 'var(--font-family)',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    '&:hover': { opacity: 0.75 },
                    transition: 'opacity 0.15s',
                  }}
                >
                  {expanded ? 'Show less' : 'Show more'}
                </Box>
              )}
              {message.sources?.length > 0 && (
                <Box sx={{ mt: 1, pt: 0.75, borderTop: '1px solid var(--border)' }}>
                  {message.sources.map((src, i) => (
                    <SmartCitation key={i} source={src} />
                  ))}
                </Box>
              )}
              {message.suggestions?.length > 0 && (
                <SuggestionChips suggestions={message.suggestions} />
              )}
              {/* Actions */}
              <Box
                sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.75, pt: 0.5, borderTop: '1px solid var(--border)' }}
                role="toolbar"
                aria-label="Message actions"
              >
                <FeedbackButtons messageId={message.message_id} />
                <AudioPlayer text={message.content} />
                <ExportMenu content={message.content} title="FileGeek Response" />
                {message.timestamp && (
                  <Typography sx={{ ml: 'auto', fontFamily: 'var(--font-family)', fontSize: '0.65rem', color: 'var(--fg-dim)' }}>
                    {relativeTime(message.timestamp)}
                  </Typography>
                )}
              </Box>
            </>
          )}
          {isUser && message.timestamp && (
            <Typography sx={{ fontFamily: 'var(--font-family)', fontSize: '0.65rem', color: 'rgba(255,255,255,0.65)', mt: 0.25, textAlign: 'right' }}>
              {relativeTime(message.timestamp)}
            </Typography>
          )}
        </Box>
      </Box>
    );
  },
  (prevProps, nextProps) => {
    // Only re-render if message content, role, sources, timestamp, or error state changes
    const prevMsg = prevProps.message;
    const nextMsg = nextProps.message;
    return (
      prevMsg.content === nextMsg.content &&
      prevMsg.role === nextMsg.role &&
      prevMsg.message_id === nextMsg.message_id &&
      prevMsg.timestamp === nextMsg.timestamp &&
      prevMsg.isError === nextMsg.isError &&
      JSON.stringify(prevMsg.sources) === JSON.stringify(nextMsg.sources) &&
      JSON.stringify(prevMsg.suggestions) === JSON.stringify(nextMsg.suggestions) &&
      prevProps.previousUserMessage?.content === nextProps.previousUserMessage?.content
    );
  }
);

export default ChatMessage;
