import React, { useRef, useEffect, useState, useMemo, lazy, Suspense } from 'react';
import { Box, TextField, Typography, Dialog, DialogContent } from '@mui/material';
import { useChatContext } from '../contexts/ChatContext';
import { useFile } from '../contexts/FileContext';
import { useModelContext } from '../contexts/ModelContext';
import QuizFlashcardDialog from './QuizFlashcardDialog';
import ThinkingBlock from './ThinkingBlock';
import DiscoveryDashboard from './DiscoveryDashboard';
import FilePreviewModal from './FilePreviewModal';

const MarkdownRenderer = lazy(() => import('./MarkdownRenderer'));

export default function ChatPanel() {
  const scrollRef = useRef(null);
  const { activeSessionId, messages, isLoading, streamingContent, streamingStatus, startNewSession, chatSessions } = useChatContext();
  const { file, goToSourcePage } = useFile();
  const { selectedModel } = useModelContext();

  const [showPrompts] = useState(true);
  const [copiedId, setCopiedId] = useState(null);
  const [previewFile, setPreviewFile] = useState(null);

  // ── Quiz quick-generate state ────────────────────────────────────────────
  const [quizDialogData, setQuizDialogData] = useState(null); // [questions]
  const [topicPrompt, setTopicPrompt] = useState(null);      // 'flashcards' | 'quiz' | null
  const [topicInput, setTopicInput] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');

  const API = process.env.REACT_APP_API_URL || 'http://localhost:5001';

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

      const res = await fetch(`${API}/quiz/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ session_id: sessionId, topic: topic || 'the document', num_questions: 8, model: selectedModel }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');
      setQuizDialogData(data.questions || data.cards || []);
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
          <DiscoveryDashboard />
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
                      borderRadius: '14px 14px 4px 14px',
                      boxShadow: 'none',
                    }
                    : {
                      bgcolor: 'var(--bg-secondary)',
                      border: '1px solid var(--border)',
                      px: 2, py: 1.5,
                      borderRadius: '4px 14px 14px 14px',
                      boxShadow: 'none',
                      position: 'relative',
                    }
                }
              >
                {/* Copy button for assistant messages */}
                {msg.role === 'assistant' && !msg.isStreaming && msg.content && (
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
                    '& pre': { background: 'var(--bg-tertiary)', p: 1.25, borderRadius: 0, overflow: 'auto', border: '1px solid var(--border)', fontSize: '0.82rem' },
                    '& code': { fontFamily: 'var(--font-mono)', fontSize: '0.82rem', background: 'var(--bg-tertiary)', px: 0.5, py: 0.15, borderRadius: 0 },
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

              {/* File attachment chip under user messages */}
              {msg.role === 'user' && msg.attachedFile && (
                <Box
                  onClick={() => setPreviewFile(msg.attachedFile)}
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.6,
                    mt: 0.5,
                    px: 1.25,
                    py: 0.4,
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    bgcolor: 'var(--bg-secondary)',
                    cursor: 'pointer',
                    alignSelf: 'flex-end',
                    maxWidth: 220,
                    transition: 'border-color 0.15s',
                    '&:hover': { borderColor: 'var(--accent)' },
                  }}
                >
                  <Box sx={{ fontSize: '0.72rem', lineHeight: 1, flexShrink: 0 }}>
                    {msg.attachedFile.type?.includes('pdf') || msg.attachedFile.name?.endsWith('.pdf')
                      ? '📄'
                      : msg.attachedFile.type?.startsWith('image/')
                        ? '🖼️'
                        : msg.attachedFile.type?.startsWith('audio/')
                          ? '🎵'
                          : '📄'}
                  </Box>
                  <Typography noWrap sx={{
                    fontFamily: 'var(--font-family)',
                    fontSize: '0.68rem',
                    color: 'var(--fg-secondary)',
                    maxWidth: 160,
                  }}>
                    {msg.attachedFile.name}
                  </Typography>
                </Box>
              )}

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
            borderRadius: '4px 14px 14px 14px',
            px: 2, py: 1.5,
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
            {streamingStatus && (
              <Typography sx={{
                fontFamily: 'var(--font-family)',
                fontSize: '0.72rem',
                color: 'var(--fg-dim)',
                mt: 0.75,
                fontStyle: 'italic',
              }}>
                {streamingStatus}
              </Typography>
            )}
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
          <Box sx={{ display: 'flex', gap: 1, mt: 2, justifyContent: 'flex-end', alignItems: 'center' }}>
            <Box
              onClick={() => setTopicPrompt(null)}
              sx={{ fontFamily: 'var(--font-family)', fontSize: '0.82rem', color: 'var(--fg-dim)', cursor: 'pointer', '&:hover': { color: 'var(--fg-primary)' }, transition: 'color 0.15s' }}
            >
              Cancel
            </Box>
            <Box
              onClick={() => !generating && handleQuickGenerate(topicPrompt, topicInput)}
              sx={{
                fontFamily: 'var(--font-family)', fontSize: '0.82rem', fontWeight: 600,
                color: '#FFFFFF',
                bgcolor: generating ? 'var(--accent-dim)' : 'var(--accent)',
                borderRadius: '8px',
                px: 2, py: 0.5,
                cursor: generating ? 'default' : 'pointer',
                opacity: generating ? 0.65 : 1,
                transition: 'all 0.15s',
                '&:hover': generating ? {} : { opacity: 0.88 },
              }}
            >
              {generating ? 'Generating...' : 'Generate'}
            </Box>
          </Box>
        </DialogContent>
      </Dialog>

      {/* File preview popup */}
      {previewFile && (
        <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
      )}

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
