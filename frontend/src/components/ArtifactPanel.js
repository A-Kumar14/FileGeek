import React, { useRef, useState } from 'react';
import { Box, Typography, Tooltip, Button } from '@mui/material';
import { useChatContext } from '../contexts/ChatContext';
import { useFile } from '../contexts/FileContext';
import QuizFlashcardDialog from './QuizFlashcardDialog';
import axios from 'axios';

function MermaidDiagram({ code }) {
  const containerRef = useRef(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({ startOnLoad: false, theme: 'neutral' });
        if (cancelled || !containerRef.current) return;
        const id = `mermaid-${Date.now()}`;
        const { svg } = await mermaid.render(id, code);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch {
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = `<pre style="white-space:pre-wrap;font-size:0.8rem;color:var(--fg-secondary)">${code}</pre>`;
        }
      }
    })();
    return () => { cancelled = true; };
  }, [code]);

  return <Box ref={containerRef} sx={{ overflow: 'auto', maxHeight: 400, p: 1 }} />;
}

function QuizCard({ data, onOpenDialog, messageId, sessionId, topic }) {
  const questions = Array.isArray(data) ? data : [];
  const [userAnswers, setUserAnswers] = useState(Array(questions.length).fill(null));
  const [submitted, setSubmitted] = useState(false);
  const startTimeRef = React.useRef(Date.now());

  if (!data || questions.length === 0) return null;

  const handleSelectOption = (qIdx, optIdx) => {
    if (submitted) return;
    const updated = [...userAnswers];
    updated[qIdx] = optIdx;
    setUserAnswers(updated);
  };

  const saveQuizResult = async (score) => {
    const token = localStorage.getItem('filegeek-token');
    if (!token || !messageId || !sessionId) return;
    const timeTaken = Math.round((Date.now() - startTimeRef.current) / 1000);
    try {
      await axios.post(
        `${process.env.REACT_APP_API_URL || 'http://localhost:5001'}/quiz/results`,
        { session_id: sessionId, message_id: messageId, topic: topic || 'Quiz', score, total_questions: questions.length, answers: userAnswers, time_taken: timeTaken },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (err) {
      console.warn('Failed to save quiz result:', err);
    }
  };

  const handleSubmit = () => {
    const correct = questions.reduce((acc, q, i) => acc + (userAnswers[i] === q.correct_index ? 1 : 0), 0);
    setSubmitted(true);
    saveQuizResult(correct);
  };

  const handleRetry = () => {
    setUserAnswers(Array(questions.length).fill(null));
    setSubmitted(false);
    startTimeRef.current = Date.now();
  };

  const allAnswered = userAnswers.every(a => a !== null);
  const score = submitted ? questions.reduce((acc, q, i) => acc + (userAnswers[i] === q.correct_index ? 1 : 0), 0) : 0;
  const percentage = submitted ? Math.round((score / questions.length) * 100) : 0;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {onOpenDialog && (
        <Button
          onClick={onOpenDialog}
          size="small"
          sx={{
            fontFamily: 'var(--font-family)', fontSize: '0.72rem', fontWeight: 600,
            color: 'var(--accent)', border: '1px solid var(--accent)',
            borderRadius: '8px', px: 1.5, py: 0.4, alignSelf: 'flex-start', textTransform: 'none',
            '&:hover': { bgcolor: 'var(--accent-dim)' },
          }}
        >
          Open as flashcards
        </Button>
      )}

      {submitted && (
        <Box sx={{
          border: `1px solid ${percentage >= 70 ? 'var(--success)' : percentage >= 50 ? '#F59E0B' : 'var(--error)'}`,
          p: 1.5, textAlign: 'center', borderRadius: '10px',
          bgcolor: percentage >= 70 ? 'rgba(5,150,105,0.06)' : percentage >= 50 ? 'rgba(245,158,11,0.06)' : 'rgba(220,38,38,0.06)',
        }}>
          <Typography sx={{ fontFamily: 'var(--font-family)', fontSize: '0.9rem', fontWeight: 700, color: 'var(--fg-primary)', mb: 0.25 }}>
            {score}/{questions.length} · {percentage}%
          </Typography>
          <Typography sx={{ fontFamily: 'var(--font-family)', fontSize: '0.72rem', color: 'var(--fg-secondary)' }}>
            {percentage >= 70 ? 'Excellent!' : percentage >= 50 ? 'Good effort' : 'Needs review'}
          </Typography>
        </Box>
      )}

      {questions.map((q, qIdx) => {
        const userAnswer = userAnswers[qIdx];
        const isCorrect = userAnswer === q.correct_index;
        return (
          <Box key={qIdx} sx={{ border: '1px solid var(--border)', borderRadius: '10px', p: 1.5 }}>
            <Typography sx={{ fontFamily: 'var(--font-family)', fontSize: '0.82rem', fontWeight: 600, color: 'var(--fg-primary)', mb: 1 }}>
              {qIdx + 1}. {q.question}
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {q.options?.map((opt, optIdx) => {
                const isSelected = userAnswer === optIdx;
                const isCorrectOption = optIdx === q.correct_index;
                let borderColor = 'var(--border)';
                let bgcolor = 'transparent';
                let textColor = 'var(--fg-secondary)';
                let fontWeight = 400;

                if (submitted) {
                  if (isCorrectOption) { borderColor = 'var(--success)'; bgcolor = 'rgba(5,150,105,0.08)'; textColor = 'var(--success)'; fontWeight = 600; }
                  else if (isSelected) { borderColor = 'var(--error)'; bgcolor = 'rgba(220,38,38,0.08)'; textColor = 'var(--error)'; fontWeight = 600; }
                } else if (isSelected) {
                  borderColor = '#F59E0B'; bgcolor = 'rgba(245,158,11,0.08)'; textColor = '#F59E0B'; fontWeight = 600;
                }

                return (
                  <Box key={optIdx} onClick={() => handleSelectOption(qIdx, optIdx)}
                    sx={{
                      p: 0.9, border: `1px solid ${borderColor}`, borderRadius: '8px',
                      bgcolor, cursor: submitted ? 'default' : 'pointer',
                      fontFamily: 'var(--font-family)', fontSize: '0.78rem', color: textColor, fontWeight,
                      transition: 'all 0.15s',
                      '&:hover': submitted ? {} : { borderColor: 'var(--fg-dim)', bgcolor: 'var(--bg-secondary)' },
                    }}
                  >
                    {String.fromCharCode(65 + optIdx)}) {opt}
                  </Box>
                );
              })}
            </Box>
            {submitted && q.explanation && (
              <Typography sx={{ fontFamily: 'var(--font-family)', fontSize: '0.72rem', color: isCorrect ? 'var(--success)' : 'var(--fg-dim)', mt: 0.75, fontStyle: 'italic' }}>
                {q.explanation}
              </Typography>
            )}
          </Box>
        );
      })}

      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
        {!submitted ? (
          <Tooltip title={allAnswered ? '' : 'Answer all questions first'}>
            <span>
              <Button onClick={handleSubmit} disabled={!allAnswered} size="small"
                sx={{
                  fontFamily: 'var(--font-family)', fontSize: '0.78rem', fontWeight: 600, textTransform: 'none',
                  color: allAnswered ? '#FFF' : 'var(--fg-dim)',
                  bgcolor: allAnswered ? 'var(--accent)' : 'var(--bg-secondary)',
                  border: `1px solid ${allAnswered ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: '8px', px: 2,
                  '&:hover': allAnswered ? { bgcolor: 'var(--accent)', opacity: 0.88 } : {},
                  '&:disabled': { color: 'var(--fg-dim)', borderColor: 'var(--border)' },
                }}
              >Submit</Button>
            </span>
          </Tooltip>
        ) : (
          <Button onClick={handleRetry} size="small"
            sx={{
              fontFamily: 'var(--font-family)', fontSize: '0.78rem', fontWeight: 600, textTransform: 'none',
              color: 'var(--fg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', px: 2,
              '&:hover': { bgcolor: 'var(--bg-secondary)', borderColor: 'var(--fg-dim)' },
            }}
          >Retry</Button>
        )}
      </Box>
    </Box>
  );
}

function ArtifactRenderer({ artifact, sessionId, onOpenQuizDialog, goToSourcePage }) {
  const type = artifact.artifact_type || artifact.viz_type || 'unknown';

  if (type === 'visualization' && artifact.viz_type === 'mermaid' && artifact.content) {
    return <MermaidDiagram code={artifact.content} />;
  }

  if (type === 'quiz' && artifact.content) {
    try {
      const data = typeof artifact.content === 'string' ? JSON.parse(artifact.content) : artifact.content;
      return (
        <QuizCard
          data={data}
          messageId={artifact.message_id}
          sessionId={artifact.session_id || sessionId}
          topic={artifact.topic}
          onOpenDialog={onOpenQuizDialog ? () => onOpenQuizDialog(data) : undefined}
        />
      );
    } catch {
      return <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem', fontFamily: 'var(--font-family)', color: 'var(--fg-secondary)' }}>{artifact.content}</pre>;
    }
  }

  const text = artifact.instruction || artifact.context || JSON.stringify(artifact, null, 2);
  const sources = artifact.sources || [];

  return (
    <Box sx={{ border: '1px solid var(--border)', borderRadius: '8px', p: 1.5, overflow: 'auto', maxHeight: 400 }}>
      {sources.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
          {sources.map((src, i) => (
            <Box key={i} onClick={() => goToSourcePage(src)}
              sx={{
                fontFamily: 'var(--font-family)', fontSize: '0.65rem', color: 'var(--accent)',
                border: '1px solid var(--accent)', borderRadius: '6px',
                px: 0.75, py: 0.2, cursor: 'pointer', userSelect: 'none',
                '&:hover': { bgcolor: 'var(--accent-dim)' },
              }}
            >
              p.{src.pages?.[0] || '?'}
            </Box>
          ))}
        </Box>
      )}
      <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem', margin: 0, fontFamily: 'var(--font-family)', color: 'var(--fg-primary)' }}>{text}</pre>
    </Box>
  );
}

export default function ArtifactPanel() {
  const { artifacts, clearArtifacts, activeSessionId } = useChatContext();
  const { goToSourcePage } = useFile();
  const [quizDialogData, setQuizDialogData] = useState(null);

  if (!artifacts || artifacts.length === 0) return null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', bgcolor: 'var(--bg-primary)' }}>
      <Box sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        px: 2, py: 1, borderBottom: '1px solid var(--border)',
      }}>
        <Typography sx={{ fontFamily: 'var(--font-family)', fontWeight: 600, fontSize: '0.82rem', color: 'var(--fg-primary)' }}>
          Artifacts ({artifacts.length})
        </Typography>
        <Tooltip title="Close">
          <Box onClick={clearArtifacts}
            sx={{
              cursor: 'pointer', color: 'var(--fg-dim)', fontFamily: 'var(--font-family)',
              fontSize: '1rem', lineHeight: 1, fontWeight: 400,
              width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: '50%', transition: 'all 0.15s',
              '&:hover': { color: 'var(--error)', bgcolor: 'rgba(220,38,38,0.08)' },
            }}
          >×</Box>
        </Tooltip>
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {artifacts.map((artifact, i) => (
          <Box key={i} sx={{ border: '1px solid var(--border)', borderRadius: '12px', p: 1.5, overflow: 'hidden' }}>
            <Typography sx={{ fontFamily: 'var(--font-family)', fontSize: '0.65rem', fontWeight: 600, color: 'var(--fg-dim)', mb: 1, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {artifact.artifact_type || 'artifact'}{artifact.topic ? ` — ${artifact.topic}` : ''}
            </Typography>
            <ArtifactRenderer
              artifact={artifact}
              sessionId={activeSessionId}
              onOpenQuizDialog={setQuizDialogData}
              goToSourcePage={goToSourcePage}
            />
          </Box>
        ))}
      </Box>

      <QuizFlashcardDialog
        open={Boolean(quizDialogData)}
        onClose={() => setQuizDialogData(null)}
        questions={quizDialogData || []}
      />
    </Box>
  );
}
