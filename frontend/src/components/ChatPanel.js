import React, { useRef, useEffect, useState, useMemo, lazy, Suspense } from 'react';
import { Box, TextField, IconButton, Typography, Dialog, DialogContent } from '@mui/material';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { useChatContext } from '../contexts/ChatContext';
import { useFile } from '../contexts/FileContext';
import { useModelContext } from '../contexts/ModelContext';
import { useAuth } from '../contexts/AuthContext';
import SuggestedPrompts from './SuggestedPrompts';
import FlashcardPopupDialog from './FlashcardPopupDialog';
import QuizFlashcardDialog from './QuizFlashcardDialog';
import ThinkingBlock from './ThinkingBlock';


const MarkdownRenderer = lazy(() => import('./MarkdownRenderer'));

export default function ChatPanel() {
  const scrollRef = useRef(null);
  const { activeSessionId, messages, addMessage, isLoading, streamingContent, startNewSession, chatSessions } = useChatContext();
  const { file, goToSourcePage } = useFile();
  const { selectedModel } = useModelContext();
  const { user } = useAuth();
  const firstName = user?.name?.split(' ')[0] || user?.email?.split('@')[0] || 'there';

  const [showPrompts] = useState(true);
  const [copiedId, setCopiedId] = useState(null);

  // ── Flashcard / Quiz quick-generate state ────────────────────────────────
  const [fcDialogData, setFcDialogData] = useState(null);   // {cards, topic}
  const [quizDialogData, setQuizDialogData] = useState(null); // [questions]
  const [topicPrompt, setTopicPrompt] = useState(null);      // 'flashcards' | 'quiz' | null
  const [topicInput, setTopicInput] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');

  const API = process.env.REACT_APP_API_URL || 'http://localhost:8000';

  const handleQuickGenerate = async (type, topic) => {
    setGenerating(true);
    setGenError('');
    const token = localStorage.getItem('filegeek-token');
    try {
      // Resolve session — use active session, fall back to most recent, or create one.
      let sessionId = activeSessionId;
      if (!sessionId) {
        // Try the most recently updated session in list
        if (chatSessions && chatSessions.length > 0) {
          sessionId = chatSessions[0].id;
        } else {
          // Create a fresh session
          const docName = file?.name || 'Document';
          sessionId = await startNewSession(docName, 'pdf');
        }
      }
      if (!sessionId) {
        throw new Error('No active session. Open a document and start a chat first.');
      }

      const endpoint = type === 'flashcards' ? '/flashcards/generate' : '/quiz/generate';
      const res = await fetch(`${API}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ session_id: sessionId, topic: topic || 'the document', num_cards: 8, model: selectedModel }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');
      if (type === 'flashcards') {
        setFcDialogData({ cards: data.cards, topic: data.topic });
      } else {
        setQuizDialogData(data.questions || data.cards || []);
      }
      setTopicPrompt(null);
      setTopicInput('');
    } catch (err) {
      setGenError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = (id, content) => {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }).catch(() => { });
  };

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent, isLoading]);

  // Combine messages with streaming content for display
  const displayMessages = useMemo(() => {
    if (!streamingContent) return messages;
    return [
      ...messages,
      {
        id: 'streaming-temp',
        role: 'assistant',
        content: streamingContent,
        isStreaming: true,
      },
    ];
  }, [messages, streamingContent]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, bgcolor: 'var(--bg-primary)', color: 'var(--fg-primary)', fontFamily: 'var(--font-family)' }}>

      {/* ── Top bar (Cortex-style) ── */}
      <Box sx={{
        display: 'flex', alignItems: 'center', flexShrink: 0,
        px: 2, py: 0.9,
        borderBottom: '1px solid var(--border)',
        bgcolor: 'var(--bg-secondary)',
        gap: 1,
      }}>
        {/* Model/brand pill */}
        <Box sx={{
          display: 'flex', alignItems: 'center', gap: 0.5,
          border: '1px solid var(--border)', borderRadius: '20px',
          px: 1.25, py: 0.35, cursor: 'pointer',
          transition: 'all 0.15s',
          '&:hover': { borderColor: 'var(--border-focus)', bgcolor: 'var(--accent-dim)' },
        }}>
          <Box sx={{
            width: 14, height: 14, borderRadius: '50%',
            bgcolor: 'var(--accent)',
          }} />
          <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--fg-primary)' }}>
            FileGeek
          </Typography>
          <KeyboardArrowDownIcon sx={{ fontSize: 14, color: 'var(--fg-dim)' }} />
        </Box>

        <Box sx={{ flex: 1 }} />

        {/* More options */}
        <IconButton size="small" sx={{ color: 'var(--fg-dim)', '&:hover': { color: 'var(--fg-primary)', bgcolor: 'var(--accent-dim)' } }}>
          <MoreHorizIcon sx={{ fontSize: 18 }} />
        </IconButton>

        {/* Export chat */}
        <Box
          onClick={() => {
            const text = messages.map(m => `${m.role === 'user' ? 'You' : 'FileGeek'}: ${m.content}`).join('\n\n');
            const blob = new Blob([text], { type: 'text/plain' });
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'chat.txt'; a.click();
          }}
          sx={{
            fontSize: '0.75rem', fontWeight: 500, color: 'var(--fg-secondary)',
            border: '1px solid var(--border)', borderRadius: '8px',
            px: 1.25, py: 0.4, cursor: 'pointer',
            transition: 'all 0.15s',
            '&:hover': { color: 'var(--fg-primary)', borderColor: 'var(--fg-secondary)' },
          }}
        >
          Export chat
        </Box>
      </Box>

      {/* Messages Area */}
      <Box
        ref={scrollRef}
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          pt: 2,
          px: 2,
          pb: '110px',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        {displayMessages.length === 0 && showPrompts ? (
          <Box sx={{
            height: '100%', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: 2, pb: 8,
          }}>
            {/* 3-D orb — matches Cortex */}
            <Box sx={{
              width: 88, height: 88, borderRadius: '50%', flexShrink: 0,
              bgcolor: 'var(--accent)',
              boxShadow: '0 0 56px rgba(249,115,22,0.22), inset 0 0 28px rgba(255,255,255,0.28)',
              animation: 'orbPulse 3.5s ease-in-out infinite',
            }} />

            {/* "Hello, [name]" — gradient purple like Cortex */}
            <Typography sx={{
              fontFamily: 'var(--font-family)',
              fontWeight: 600,
              fontSize: '1.75rem',
              letterSpacing: '-0.02em',
              color: 'var(--accent)',
              lineHeight: 1.2,
              mb: -0.5,
            }}>
              Hello, {firstName}
            </Typography>

            {/* "How can I assist you today?" — bold black */}
            <Typography sx={{
              fontFamily: 'var(--font-family)',
              fontWeight: 700,
              fontSize: '1.5rem',
              color: 'var(--fg-primary)',
              letterSpacing: '-0.02em',
              textAlign: 'center',
            }}>
              How can I assist you today?
            </Typography>

            {/* Suggestion cards — 3-column, no backgrounds */}
            <SuggestedPrompts onSelect={(prompt) => addMessage(prompt)} />
          </Box>
        ) : (
          displayMessages.map((msg, index) => (
            <Box
              key={msg.id || index}
              sx={{
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
              }}
            >
              {/* Insert ThinkingBlock *outside* the actual message bubble */}
              {msg.role === 'assistant' && msg.tool_calls?.length > 0 && (
                <ThinkingBlock steps={msg.tool_calls} isGenerating={msg.isStreaming} />
              )}

              {/* Message Bubble */}
              <Box
                sx={
                  msg.role === 'user'
                    ? {
                      bgcolor: 'var(--accent)',
                      color: '#FFFFFF',
                      px: 2, py: 1.25,
                      borderRadius: '18px 18px 4px 18px',
                      boxShadow: 'var(--shadow)',
                    }
                    : {
                      bgcolor: 'var(--bg-secondary)',
                      border: '1px solid var(--border)',
                      px: 2, py: 1.5,
                      borderRadius: '4px 18px 18px 18px',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                      position: 'relative',
                    }
                }
              >
                {/* Copy button for assistant messages */}
                {msg.role === 'assistant' && !msg.isStreaming && (
                  <Box
                    onClick={() => handleCopy(msg.id || index, msg.content)}
                    sx={{
                      position: 'absolute',
                      top: 8, right: 10,
                      cursor: 'pointer',
                      fontSize: '0.68rem',
                      fontWeight: 600,
                      color: copiedId === (msg.id || index) ? 'var(--success)' : 'var(--fg-dim)',
                      fontFamily: 'var(--font-family)',
                      '&:hover': { color: 'var(--accent)' },
                      transition: 'color 0.15s',
                    }}
                  >
                    {copiedId === (msg.id || index) ? 'Copied!' : 'Copy'}
                  </Box>
                )}

                {/* Content */}
                {msg.role === 'assistant' ? (
                  <Box sx={{
                    fontFamily: 'var(--font-family)', fontSize: '0.9rem', lineHeight: 1.65,
                    color: 'var(--fg-primary)',
                    '& p': { m: 0, mb: 0.75 },
                    '& pre': { background: 'var(--bg-tertiary)', p: 1.25, borderRadius: '10px', overflow: 'auto', border: '1px solid var(--border)', fontSize: '0.82rem' },
                    '& code': { fontFamily: 'var(--font-mono)', fontSize: '0.82rem', background: 'var(--bg-tertiary)', px: 0.5, py: 0.15, borderRadius: '4px' },
                    '& h1,& h2,& h3': { mt: 1.5, mb: 0.5, fontWeight: 600 },
                    '& ul,& ol': { pl: 2.5, mt: 0.5, mb: 0.5 },
                    '& li': { mb: 0.25 },
                    '& table': { borderCollapse: 'collapse', width: '100%', mt: 0.5 },
                    '& th,& td': { border: '1px solid var(--border)', p: '6px 10px', fontSize: '0.85rem' },
                    '& th': { background: 'var(--bg-tertiary)', fontWeight: 600 },
                    '& blockquote': { borderLeft: '3px solid var(--accent)', ml: 0, pl: 1.5, color: 'var(--fg-secondary)', fontStyle: 'italic' },
                  }}>
                    <Suspense fallback={<Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.65, color: 'var(--fg-primary)' }}>{msg.content}</Typography>}>
                      <MarkdownRenderer content={msg.content} />
                    </Suspense>
                  </Box>
                ) : (
                  <Typography variant="body2" sx={{ fontFamily: 'var(--font-family)', whiteSpace: 'pre-wrap', lineHeight: 1.6, color: '#FFFFFF' }}>
                    {msg.content}
                  </Typography>
                )}

                {msg.isStreaming && (
                  <Box sx={{ display: 'inline-block', ml: 0.5, width: 7, height: 15, bgcolor: 'var(--accent)', borderRadius: '2px', animation: 'blink 1s step-end infinite', verticalAlign: 'text-bottom' }} />
                )}
              </Box>

              {/* Source chips — clickable, navigate + highlight PDF */}
              {msg.role === 'assistant' && !msg.isStreaming && msg.sources?.length > 0 && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                  {msg.sources.map((src, i) => (
                    <Box
                      key={i}
                      onClick={() => goToSourcePage(src)}
                      sx={{
                        fontFamily: 'var(--font-family)',
                        fontSize: '0.68rem',
                        fontWeight: 600,
                        color: 'var(--accent)',
                        border: '1px solid var(--accent)',
                        borderRadius: '20px',
                        px: 1,
                        py: 0.3,
                        cursor: 'pointer',
                        userSelect: 'none',
                        opacity: 0.8,
                        transition: 'all 0.15s',
                        '&:hover': { opacity: 1, bgcolor: 'var(--accent-dim)' },
                      }}
                    >
                      p.{src.pages?.[0] || '?'}
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          ))
        )}

        {isLoading && !streamingContent && (
          <Box sx={{
            alignSelf: 'flex-start', maxWidth: '85%',
            bgcolor: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: '4px 18px 18px 18px',
            px: 2, py: 1.5,
            boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
          }}>
            <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center' }}>
              {[0, 0.2, 0.4].map((delay) => (
                <Box key={delay} sx={{
                  width: 8, height: 8, borderRadius: '50%',
                  bgcolor: 'var(--accent)',
                  opacity: 0.5,
                  animation: `blink 1.2s ease-in-out ${delay}s infinite`,
                }} />
              ))}
            </Box>
          </Box>
        )}
      </Box>

      {/* Input handled by GlobalCommandBar */}

      {/* Topic prompt mini-dialog */}
      <Dialog
        open={Boolean(topicPrompt)}
        onClose={() => setTopicPrompt(null)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { bgcolor: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '16px' } }}
      >
        <DialogContent sx={{ p: 2.5 }}>
          <Typography sx={{ fontFamily: 'var(--font-family)', fontSize: '0.85rem', fontWeight: 600, color: 'var(--fg-primary)', mb: 1.5 }}>
            Generate {topicPrompt} — enter a topic or leave blank for full document
          </Typography>
          <TextField
            autoFocus
            fullWidth
            placeholder={`e.g. "memory management", "chapter 3"`}
            value={topicInput}
            onChange={e => setTopicInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleQuickGenerate(topicPrompt, topicInput); }}
            variant="outlined"
            size="small"
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', fontFamily: 'var(--font-family)', fontSize: '0.9rem' } }}
          />
          {genError && (
            <Typography sx={{ fontFamily: 'monospace', fontSize: '0.65rem', color: '#FF4444', mt: 1 }}>{genError}</Typography>
          )}
          <Box sx={{ display: 'flex', gap: 1, mt: 2, justifyContent: 'flex-end' }}>
            <Box onClick={() => setTopicPrompt(null)} sx={{ fontFamily: 'monospace', fontSize: '0.7rem', color: '#555', cursor: 'pointer', '&:hover': { color: '#E5E5E5' } }}>[CANCEL]</Box>
            <Box
              onClick={() => !generating && handleQuickGenerate(topicPrompt, topicInput)}
              sx={{
                fontFamily: 'monospace', fontSize: '0.7rem', fontWeight: 700,
                color: generating ? '#444' : '#00FF00',
                border: `1px solid ${generating ? '#333' : '#00FF00'}`,
                px: 1.5, py: 0.25, cursor: generating ? 'default' : 'pointer',
                '&:hover': generating ? {} : { bgcolor: '#001A00' },
              }}
            >
              {generating ? '[ GENERATING... ]' : '[ GENERATE ]'}
            </Box>
          </Box>
        </DialogContent>
      </Dialog>

      {/* Flashcard popup */}
      <FlashcardPopupDialog
        open={Boolean(fcDialogData)}
        onClose={() => setFcDialogData(null)}
        cards={fcDialogData?.cards || []}
        topic={fcDialogData?.topic}
        messageId={null}
        sessionId={activeSessionId}
      />

      {/* Quiz popup */}
      <QuizFlashcardDialog
        open={Boolean(quizDialogData)}
        onClose={() => setQuizDialogData(null)}
        questions={quizDialogData || []}
      />

      <style>{`
        @keyframes blink {
          50% { opacity: 0; }
        }
        @keyframes statusPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>
    </Box>
  );
}
