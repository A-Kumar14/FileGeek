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
          top: 4,
          right: 4,
          cursor: 'pointer',
          color: copied ? '#00FF00' : '#888',
          fontFamily: 'monospace',
          fontSize: '0.65rem',
          fontWeight: 700,
          zIndex: 1,
          '&:hover': { color: '#E5E5E5' },
        }}
      >
        {copied ? '[OK]' : '[CPY]'}
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

    // Memoize sanitized content to avoid expensive DOMPurify calls on every render
    const sanitizedContent = useMemo(() => sanitize(message.content), [message.content]);

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
          px: 1.5,
          py: 1,
          border: '1px solid #333333',
          bgcolor: isUser ? '#1A1A1A' : '#0D0D0D',
          fontFamily: 'monospace',
          fontSize: '0.85rem',
          color: '#E5E5E5',
          '& p': { m: 0, mb: 0.5 },
          '& pre': {
            p: 1,
            overflow: 'auto',
            bgcolor: '#000000',
            border: '1px solid #333',
            fontSize: '0.8rem',
          },
          '& code': { fontFamily: 'monospace', color: '#00FF00' },
          '& table': {
            borderCollapse: 'collapse',
            width: '100%',
            '& th, & td': { border: '1px solid #333', px: 1, py: 0.5, fontSize: '0.8rem' },
          },
          '& a': { color: '#00FF00' },
          '& .math-display': { overflowX: 'auto' },
        }}
      >
        {/* Role label */}
        <Typography sx={{ fontFamily: 'monospace', fontSize: '0.6rem', color: '#888', mb: 0.5, fontWeight: 700 }}>
          {isUser ? '[ USER ]' : '[ SYS ]'}
        </Typography>

        {isUser ? (
          <p style={{ margin: 0 }}>{message.content}</p>
        ) : message.isError ? (
          <Box>
            <Typography sx={{ fontFamily: 'monospace', fontSize: '0.85rem', color: '#FF0000' }}>
              ERROR: {message.content}
            </Typography>
            {message.failedQuestion && (
              <Tooltip title="Retry">
                <Box
                  onClick={() => sendMessage(message.failedQuestion)}
                  sx={{ cursor: 'pointer', color: '#888', fontFamily: 'monospace', fontSize: '0.7rem', fontWeight: 700, mt: 0.5, '&:hover': { color: '#00FF00' } }}
                >
                  [RETRY]
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
                    <Box sx={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#888' }}>
                      [ LOADING... ]
                    </Box>
                  }
                >
                  <MarkdownRenderer
                    content={sanitizedContent}
                    components={{ pre: CodeBlockWrapper }}
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
                  color: '#00FF00',
                  fontFamily: 'monospace',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  '&:hover': { color: '#E5E5E5' },
                }}
              >
                {expanded ? '[ LESS ]' : '[ MORE ]'}
              </Box>
            )}
            {message.sources?.length > 0 && (
              <Box sx={{ mt: 1, pt: 0.5, borderTop: '1px solid #222' }}>
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
              sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, pt: 0.5, borderTop: '1px solid #222' }}
              role="toolbar"
              aria-label="Message actions"
            >
              <FeedbackButtons messageId={message.message_id} />
              <AudioPlayer text={message.content} />
              <ExportMenu content={message.content} title="FileGeek Response" />
              {message.timestamp && (
                <Typography sx={{ ml: 'auto', fontFamily: 'monospace', fontSize: '0.6rem', color: '#555' }}>
                  {relativeTime(message.timestamp)}
                </Typography>
              )}
            </Box>
          </>
        )}
        {isUser && message.timestamp && (
          <Typography sx={{ fontFamily: 'monospace', fontSize: '0.6rem', color: '#555', mt: 0.25, textAlign: 'right' }}>
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
