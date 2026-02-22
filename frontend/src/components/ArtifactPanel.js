import React, { useEffect, useRef, useState } from 'react';
import { Box, Typography, Tooltip, Button } from '@mui/material';
import { useChatContext } from '../contexts/ChatContext';
import { useFile } from '../contexts/FileContext';
import QuizFlashcardDialog from './QuizFlashcardDialog';
import FlashcardPopupDialog from './FlashcardPopupDialog';
import axios from 'axios';

function MermaidDiagram({ code }) {
  const containerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({ startOnLoad: false, theme: 'dark' });
        if (cancelled || !containerRef.current) return;
        const id = `mermaid-${Date.now()}`;
        const { svg } = await mermaid.render(id, code);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch {
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = `<pre style="white-space:pre-wrap;font-size:0.8rem;color:#E5E5E5">${code}</pre>`;
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

  const handleSelectOption = (questionIndex, optionIndex) => {
    if (submitted) return;
    const newAnswers = [...userAnswers];
    newAnswers[questionIndex] = optionIndex;
    setUserAnswers(newAnswers);
  };

  const saveQuizResult = async (score) => {
    const token = localStorage.getItem('filegeek-token');
    if (!token || !messageId || !sessionId) return;
    const timeTaken = Math.round((Date.now() - startTimeRef.current) / 1000);
    try {
      await axios.post(
        `${process.env.REACT_APP_API_URL || 'http://localhost:5001'}/quiz/results`,
        {
          session_id: sessionId,
          message_id: messageId,
          topic: topic || 'Quiz',
          score,
          total_questions: questions.length,
          answers: userAnswers,
          time_taken: timeTaken,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (err) {
      console.warn('Failed to save quiz result:', err);
    }
  };

  const handleSubmit = () => {
    const correct = questions.reduce(
      (acc, q, i) => acc + (userAnswers[i] === q.correct_index ? 1 : 0),
      0
    );
    setSubmitted(true);
    saveQuizResult(correct);
  };

  const handleRetry = () => {
    setUserAnswers(Array(questions.length).fill(null));
    setSubmitted(false);
    startTimeRef.current = Date.now();
  };

  const calculateScore = () => {
    let correct = 0;
    questions.forEach((q, i) => {
      if (userAnswers[i] === q.correct_index) correct++;
    });
    return correct;
  };

  const allAnswered = userAnswers.every(a => a !== null);
  const score = submitted ? calculateScore() : 0;
  const percentage = submitted ? Math.round((score / questions.length) * 100) : 0;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {/* Open as interactive flashcard dialog */}
      {onOpenDialog && (
        <Button
          onClick={onOpenDialog}
          sx={{
            fontFamily: 'monospace',
            fontSize: '0.7rem',
            fontWeight: 700,
            color: '#00FF00',
            border: '1px solid #00FF00',
            px: 1.5,
            py: 0.5,
            borderRadius: 0,
            alignSelf: 'flex-start',
            '&:hover': { bgcolor: '#001A00' },
          }}
        >
          [OPEN AS FLASHCARDS ▶]
        </Button>
      )}

      {/* Results banner */}
      {submitted && (
        <Box
          sx={{
            border: `2px solid ${percentage >= 70 ? '#00FF00' : percentage >= 50 ? '#FFAA00' : '#FF0000'}`,
            p: 1.5,
            textAlign: 'center',
            bgcolor: '#0A0A0A',
          }}
        >
          <Typography sx={{ fontFamily: 'monospace', fontSize: '0.9rem', fontWeight: 700, color: '#E5E5E5', mb: 0.5 }}>
            SCORE: {score}/{questions.length} ({percentage}%)
          </Typography>
          <Typography sx={{ fontFamily: 'monospace', fontSize: '0.7rem', color: '#888' }}>
            {percentage >= 70 ? 'EXCELLENT' : percentage >= 50 ? 'GOOD' : 'NEEDS REVIEW'}
          </Typography>
        </Box>
      )}

      {/* Questions */}
      {questions.map((q, qIdx) => {
        const userAnswer = userAnswers[qIdx];
        const isCorrect = userAnswer === q.correct_index;

        return (
          <Box key={qIdx} sx={{ border: '1px solid #333', p: 1.5 }}>
            <Typography sx={{ fontFamily: 'monospace', fontSize: '0.8rem', fontWeight: 700, color: '#E5E5E5', mb: 1 }}>
              Q{qIdx + 1}: {q.question}
            </Typography>

            {/* Options */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {q.options?.map((opt, optIdx) => {
                const isSelected = userAnswer === optIdx;
                const isCorrectOption = optIdx === q.correct_index;

                // Determine color and style based on state
                let bgcolor = 'var(--bg-secondary)';
                let borderColor = '#333';
                let textColor = '#AAA';
                let fontWeight = 400;

                if (submitted) {
                  if (isCorrectOption) {
                    // Correct answer: always highlight green
                    bgcolor = '#001A00';
                    borderColor = '#00FF00';
                    textColor = '#00FF00';
                    fontWeight = 700;
                  } else if (isSelected) {
                    // User's wrong answer: highlight red
                    bgcolor = '#1A0000';
                    borderColor = '#FF0000';
                    textColor = '#FF0000';
                    fontWeight = 700;
                  }
                } else if (isSelected) {
                  // Selected but not submitted: highlight yellow
                  bgcolor = '#1A1A00';
                  borderColor = '#FFAA00';
                  textColor = '#FFAA00';
                  fontWeight = 700;
                }

                return (
                  <Box
                    key={optIdx}
                    onClick={() => handleSelectOption(qIdx, optIdx)}
                    sx={{
                      p: 1,
                      border: `1px solid ${borderColor}`,
                      bgcolor,
                      cursor: submitted ? 'default' : 'pointer',
                      fontFamily: 'monospace',
                      fontSize: '0.75rem',
                      color: textColor,
                      fontWeight,
                      transition: 'all 0.2s',
                      '&:hover': submitted ? {} : {
                        borderColor: '#666',
                        bgcolor: '#1A1A1A',
                      },
                    }}
                  >
                    {String.fromCharCode(65 + optIdx)}) {opt}
                  </Box>
                );
              })}
            </Box>

            {/* Explanation (show after submission) */}
            {submitted && q.explanation && (
              <Typography sx={{ fontFamily: 'monospace', fontSize: '0.7rem', color: isCorrect ? '#00FF00' : '#888', mt: 1, fontStyle: 'italic' }}>
                {`// ${q.explanation}`}
              </Typography>
            )}
          </Box>
        );
      })}

      {/* Action buttons */}
      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
        {!submitted ? (
          <Tooltip title={allAnswered ? '' : 'Answer all questions first'}>
            <span>
              <Button
                onClick={handleSubmit}
                disabled={!allAnswered}
                sx={{
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: allAnswered ? '#00FF00' : '#555',
                  border: `1px solid ${allAnswered ? '#00FF00' : '#333'}`,
                  px: 2,
                  py: 0.5,
                  '&:hover': allAnswered ? {
                    bgcolor: '#001A00',
                    borderColor: '#00FF00',
                  } : {},
                  '&:disabled': {
                    color: '#555',
                    borderColor: '#333',
                  },
                }}
              >
                [SUBMIT]
              </Button>
            </span>
          </Tooltip>
        ) : (
          <Button
            onClick={handleRetry}
            sx={{
              fontFamily: 'monospace',
              fontSize: '0.75rem',
              fontWeight: 700,
              color: '#888',
              border: '1px solid #333',
              px: 2,
              py: 0.5,
              '&:hover': {
                color: '#E5E5E5',
                borderColor: '#666',
                bgcolor: '#1A1A1A',
              },
            }}
          >
            [RETRY]
          </Button>
        )}
      </Box>
    </Box>
  );
}

function FlashcardComponent({ data, messageId, sessionId }) {
  const cards = Array.isArray(data) ? data : [];

  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [cardStatus, setCardStatus] = useState(Array(cards.length).fill('remaining'));
  const [progressMap, setProgressMap] = useState({}); // card_index → {next_review_date, confidence_score}

  // Load progress from API on mount
  useEffect(() => {
    const loadProgress = async () => {
      const token = localStorage.getItem('filegeek-token');
      if (!token || !messageId || !sessionId) return;

      try {
        const response = await axios.get(
          `${process.env.REACT_APP_API_URL || 'http://localhost:5001'}/flashcards/progress/${sessionId}/${messageId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        const progress = response.data.progress || [];
        if (progress.length > 0) {
          const statusArray = Array(cards.length).fill('remaining');
          const pMap = {};
          progress.forEach(p => {
            if (p.card_index >= 0 && p.card_index < cards.length) {
              statusArray[p.card_index] = p.status;
              pMap[p.card_index] = {
                next_review_date: p.next_review_date,
                confidence_score: p.confidence_score ?? null,
              };
            }
          });
          setCardStatus(statusArray);
          setProgressMap(pMap);
        }
      } catch (err) {
        console.warn('Failed to load flashcard progress:', err);
      }
    };

    loadProgress();
  }, [messageId, sessionId, cards.length]);

  const saveProgress = async (cardIndex, status) => {
    const token = localStorage.getItem('filegeek-token');
    if (!token || !messageId || !sessionId) return;

    try {
      const res = await axios.post(
        `${process.env.REACT_APP_API_URL || 'http://localhost:5001'}/flashcards/progress`,
        {
          session_id: sessionId,
          message_id: messageId,
          card_index: cardIndex,
          card_front: cards[cardIndex]?.front || '',
          status,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const updated = res.data.progress;
      if (updated) {
        setProgressMap(prev => ({
          ...prev,
          [cardIndex]: {
            next_review_date: updated.next_review_date,
            confidence_score: updated.confidence_score ?? null,
          },
        }));
      }
    } catch (err) {
      console.warn('Failed to save flashcard progress:', err);
    }
  };

  // Early return after all hooks
  if (!data || cards.length === 0) {
    return (
      <Typography sx={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#888', textAlign: 'center', p: 2 }}>
        No flashcards available
      </Typography>
    );
  }

  const currentCard = cards[currentIndex];
  const remainingCount = cardStatus.filter(s => s === 'remaining').length;
  const reviewingCount = cardStatus.filter(s => s === 'reviewing').length;
  const knownCount = cardStatus.filter(s => s === 'known').length;

  const handleFlip = () => {
    setFlipped(!flipped);
  };

  const handleNext = () => {
    if (currentIndex < cards.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setFlipped(false);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setFlipped(false);
    }
  };

  const handleMarkStatus = (status) => {
    const newStatus = [...cardStatus];
    newStatus[currentIndex] = status;
    setCardStatus(newStatus);

    // Save progress to API (async, don't wait)
    saveProgress(currentIndex, status);

    // Auto-advance to next card
    if (currentIndex < cards.length - 1) {
      setTimeout(() => {
        setCurrentIndex(currentIndex + 1);
        setFlipped(false);
      }, 300);
    }
  };

  const handleReset = () => {
    setCurrentIndex(0);
    setFlipped(false);
    setCardStatus(Array(cards.length).fill('remaining'));
  };

  const handleExportAnki = () => {
    // Anki-compatible CSV: front,back (no header row for Anki import)
    const rows = cards.map(c => `"${(c.front || '').replace(/"/g, '""')}","${(c.back || '').replace(/"/g, '""')}"`);
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'flashcards_anki.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportMarkdown = () => {
    // Obsidian-friendly Markdown with WikiLink-style headings
    const lines = ['# Flashcards\n'];
    cards.forEach((c, i) => {
      lines.push(`## Card ${i + 1}`);
      lines.push(`**Front:** ${c.front || ''}`);
      lines.push(`**Back:** ${c.back || ''}`);
      if (c.tags && c.tags.length > 0) {
        lines.push(`**Tags:** ${c.tags.map(t => `[[${t}]]`).join(', ')}`);
      }
      lines.push('');
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'flashcards_obsidian.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  const currentStatus = cardStatus[currentIndex];
  const statusColor = {
    remaining: '#888',
    reviewing: '#FFAA00',
    known: '#00FF00',
  }[currentStatus];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Progress bar */}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        <Box sx={{ flex: 1, height: 6, bgcolor: '#1A1A1A', border: '1px solid #333', overflow: 'hidden', display: 'flex' }}>
          <Box sx={{ width: `${(knownCount / cards.length) * 100}%`, bgcolor: '#00FF00', transition: 'width 0.3s' }} />
          <Box sx={{ width: `${(reviewingCount / cards.length) * 100}%`, bgcolor: '#FFAA00', transition: 'width 0.3s' }} />
        </Box>
        <Typography sx={{ fontFamily: 'monospace', fontSize: '0.7rem', color: '#888', whiteSpace: 'nowrap' }}>
          {currentIndex + 1}/{cards.length}
        </Typography>
      </Box>

      {/* Status legend */}
      <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', fontSize: '0.7rem', fontFamily: 'monospace' }}>
        <Box sx={{ color: '#888' }}>Remaining: {remainingCount}</Box>
        <Box sx={{ color: '#FFAA00' }}>Reviewing: {reviewingCount}</Box>
        <Box sx={{ color: '#00FF00' }}>Known: {knownCount}</Box>
      </Box>

      {/* Flashcard */}
      <Box
        onClick={handleFlip}
        sx={{
          position: 'relative',
          height: 280,
          cursor: 'pointer',
          perspective: '1000px',
          '&:hover .flip-hint': { opacity: 0.7 },
        }}
      >
        <Box
          sx={{
            position: 'relative',
            width: '100%',
            height: '100%',
            transformStyle: 'preserve-3d',
            transition: 'transform 0.6s',
            transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
          }}
        >
          {/* Front of card */}
          <Box
            sx={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              backfaceVisibility: 'hidden',
              border: `2px solid ${statusColor}`,
              bgcolor: 'var(--bg-secondary)',
              p: 3,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Typography
              sx={{
                fontFamily: 'monospace',
                fontSize: '1rem',
                fontWeight: 700,
                color: '#E5E5E5',
                textAlign: 'center',
                wordBreak: 'break-word',
              }}
            >
              {currentCard.front}
            </Typography>
            {/* Confidence + Next Review */}
            {progressMap[currentIndex] != null && (
              <Box sx={{ mt: 2, width: '100%', maxWidth: 200 }}>
                {progressMap[currentIndex].confidence_score != null && (
                  <Box sx={{ mb: 0.75 }}>
                    <Typography sx={{ fontFamily: 'monospace', fontSize: '0.6rem', color: '#666', mb: 0.25 }}>
                      CONFIDENCE: {progressMap[currentIndex].confidence_score}%
                    </Typography>
                    <Box sx={{ height: 3, bgcolor: '#1A1A1A', width: '100%' }}>
                      <Box
                        sx={{
                          height: '100%',
                          width: `${progressMap[currentIndex].confidence_score}%`,
                          bgcolor: progressMap[currentIndex].confidence_score >= 70 ? '#00FF00' : progressMap[currentIndex].confidence_score >= 40 ? '#FFAA00' : '#FF4444',
                          transition: 'width 0.4s',
                        }}
                      />
                    </Box>
                  </Box>
                )}
                {progressMap[currentIndex].next_review_date && (
                  <Typography sx={{ fontFamily: 'monospace', fontSize: '0.6rem', color: '#555' }}>
                    NEXT REVIEW: {new Date(progressMap[currentIndex].next_review_date).toLocaleDateString()}
                  </Typography>
                )}
              </Box>
            )}
            <Typography
              className="flip-hint"
              sx={{
                fontFamily: 'monospace',
                fontSize: '0.65rem',
                color: '#555',
                mt: 2,
                opacity: 0.5,
                transition: 'opacity 0.3s',
              }}
            >
              [CLICK TO FLIP]
            </Typography>
            {currentCard.difficulty && (
              <Box
                sx={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  fontFamily: 'monospace',
                  fontSize: '0.65rem',
                  color: '#666',
                  textTransform: 'uppercase',
                }}
              >
                {currentCard.difficulty}
              </Box>
            )}
          </Box>

          {/* Back of card */}
          <Box
            sx={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              backfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
              border: `2px solid ${statusColor}`,
              bgcolor: 'var(--bg-secondary)',
              p: 3,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Typography
              sx={{
                fontFamily: 'monospace',
                fontSize: '0.85rem',
                color: '#E5E5E5',
                textAlign: 'center',
                wordBreak: 'break-word',
                whiteSpace: 'pre-wrap',
              }}
            >
              {currentCard.back}
            </Typography>
            {currentCard.tags && currentCard.tags.length > 0 && (
              <Box sx={{ display: 'flex', gap: 0.5, mt: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
                {currentCard.tags.map((tag, i) => (
                  <Box
                    key={i}
                    sx={{
                      fontFamily: 'monospace',
                      fontSize: '0.6rem',
                      color: '#666',
                      border: '1px solid #333',
                      px: 0.75,
                      py: 0.25,
                    }}
                  >
                    #{tag}
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        </Box>
      </Box>

      {/* Knowledge buttons (show when flipped) */}
      {flipped && (
        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
          <Button
            onClick={(e) => { e.stopPropagation(); handleMarkStatus('reviewing'); }}
            sx={{
              fontFamily: 'monospace',
              fontSize: '0.75rem',
              fontWeight: 700,
              color: '#FFAA00',
              border: '1px solid #FFAA00',
              px: 2,
              py: 0.5,
              '&:hover': {
                bgcolor: '#1A1A00',
                borderColor: '#FFAA00',
              },
            }}
          >
            [REVIEW]
          </Button>
          <Button
            onClick={(e) => { e.stopPropagation(); handleMarkStatus('known'); }}
            sx={{
              fontFamily: 'monospace',
              fontSize: '0.75rem',
              fontWeight: 700,
              color: '#00FF00',
              border: '1px solid #00FF00',
              px: 2,
              py: 0.5,
              '&:hover': {
                bgcolor: '#001A00',
                borderColor: '#00FF00',
              },
            }}
          >
            [KNOW IT]
          </Button>
        </Box>
      )}

      {/* Navigation controls */}
      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Button
          onClick={handlePrev}
          disabled={currentIndex === 0}
          sx={{
            fontFamily: 'monospace',
            fontSize: '0.7rem',
            fontWeight: 700,
            color: currentIndex === 0 ? '#333' : '#888',
            border: `1px solid ${currentIndex === 0 ? '#222' : '#333'}`,
            minWidth: 60,
            py: 0.5,
            '&:hover': currentIndex === 0 ? {} : {
              color: '#E5E5E5',
              borderColor: '#666',
            },
          }}
        >
          [&lt;]
        </Button>
        <Button
          onClick={handleReset}
          sx={{
            fontFamily: 'monospace',
            fontSize: '0.7rem',
            fontWeight: 700,
            color: '#888',
            border: '1px solid #333',
            px: 1.5,
            py: 0.5,
            '&:hover': {
              color: '#E5E5E5',
              borderColor: '#666',
            },
          }}
        >
          [RESET]
        </Button>
        <Button
          onClick={handleNext}
          disabled={currentIndex === cards.length - 1}
          sx={{
            fontFamily: 'monospace',
            fontSize: '0.7rem',
            fontWeight: 700,
            color: currentIndex === cards.length - 1 ? '#333' : '#888',
            border: `1px solid ${currentIndex === cards.length - 1 ? '#222' : '#333'}`,
            minWidth: 60,
            py: 0.5,
            '&:hover': currentIndex === cards.length - 1 ? {} : {
              color: '#E5E5E5',
              borderColor: '#666',
            },
          }}
        >
          [&gt;]
        </Button>
      </Box>

      {/* Export buttons */}
      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
        <Button
          onClick={handleExportAnki}
          size="small"
          sx={{
            fontFamily: 'monospace', fontSize: '0.6rem', color: '#555',
            border: '1px solid #2A2A2A', px: 1.5, py: 0.25,
            '&:hover': { color: '#E5E5E5', borderColor: '#555' },
          }}
        >
          [ANKI CSV]
        </Button>
        <Button
          onClick={handleExportMarkdown}
          size="small"
          sx={{
            fontFamily: 'monospace', fontSize: '0.6rem', color: '#555',
            border: '1px solid #2A2A2A', px: 1.5, py: 0.25,
            '&:hover': { color: '#E5E5E5', borderColor: '#555' },
          }}
        >
          [OBSIDIAN MD]
        </Button>
      </Box>

      {/* Completion message */}
      {knownCount === cards.length && (
        <Box
          sx={{
            border: '2px solid #00FF00',
            p: 2,
            textAlign: 'center',
            bgcolor: '#001A00',
          }}
        >
          <Typography sx={{ fontFamily: 'monospace', fontSize: '0.9rem', fontWeight: 700, color: '#00FF00' }}>
            ALL CARDS MASTERED!
          </Typography>
          <Typography sx={{ fontFamily: 'monospace', fontSize: '0.7rem', color: '#888', mt: 0.5 }}>
            Great job! You've completed all {cards.length} flashcards.
          </Typography>
        </Box>
      )}
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
      return <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem', fontFamily: 'monospace', color: '#E5E5E5' }}>{artifact.content}</pre>;
    }
  }

  if (type === 'flashcards' && artifact.content) {
    try {
      const data = typeof artifact.content === 'string' ? JSON.parse(artifact.content) : artifact.content;
      // artifact.session_id is now set by the backend; fall back to the panel's sessionId prop
      // for older messages that were saved before this fix.
      return <FlashcardComponent data={data} messageId={artifact.message_id} sessionId={artifact.session_id || sessionId} />;
    } catch {
      return <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem', fontFamily: 'monospace', color: '#E5E5E5' }}>{artifact.content}</pre>;
    }
  }

  const text = artifact.instruction || artifact.context || JSON.stringify(artifact, null, 2);
  const sources = artifact.sources || [];

  return (
    <Box sx={{ border: '1px solid var(--border)', p: 1.5, overflow: 'auto', maxHeight: 400 }}>
      {/* Source chips — clickable, navigate + highlight PDF */}
      {sources.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
          {sources.map((src, i) => (
            <Box
              key={i}
              onClick={() => goToSourcePage(src)}
              sx={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.65rem',
                color: 'var(--accent)',
                border: '1px solid var(--accent)',
                px: 0.75,
                py: 0.25,
                cursor: 'pointer',
                userSelect: 'none',
                opacity: 0.8,
                '&:hover': { bgcolor: 'var(--accent-dim)', opacity: 1 },
              }}
            >
              [SRC:{src.pages?.[0] || '?'}]
            </Box>
          ))}
        </Box>
      )}
      <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem', margin: 0, fontFamily: 'var(--font-mono)', color: 'var(--fg-primary)' }}>{text}</pre>
    </Box>
  );
}

export default function ArtifactPanel() {
  const { artifacts, clearArtifacts, activeSessionId } = useChatContext();
  const { goToSourcePage } = useFile();
  const [quizDialogData, setQuizDialogData] = useState(null);
  const [flashcardDialogData, setFlashcardDialogData] = useState(null);
  const prevArtifactCountRef = useRef(0);

  // Auto-open flashcard popup whenever a new flashcard artifact arrives
  useEffect(() => {
    if (!artifacts || artifacts.length === 0) return;
    const newCount = artifacts.length;
    if (newCount > prevArtifactCountRef.current) {
      const latest = artifacts[artifacts.length - 1];
      if (latest?.artifact_type === 'flashcards' && latest?.content) {
        try {
          const cards = typeof latest.content === 'string' ? JSON.parse(latest.content) : latest.content;
          if (Array.isArray(cards) && cards.length > 0) {
            setFlashcardDialogData({
              cards,
              topic: latest.topic,
              messageId: latest.message_id,
              sessionId: latest.session_id || activeSessionId,
            });
          }
        } catch { /* bad JSON — skip */ }
      }
    }
    prevArtifactCountRef.current = newCount;
  }, [artifacts, activeSessionId]);

  if (!artifacts || artifacts.length === 0) return null;


  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', bgcolor: 'var(--bg-primary)' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 1,
          borderBottom: '1px solid #333333',
        }}
      >
        <Typography sx={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.8rem', color: '#E5E5E5' }}>
          ARTIFACTS ({artifacts.length})
        </Typography>
        <Tooltip title="Close">
          <Box onClick={clearArtifacts} sx={{ cursor: 'pointer', color: '#888', fontFamily: 'monospace', fontSize: '0.7rem', fontWeight: 700, '&:hover': { color: '#E5E5E5' } }}>
            [x]
          </Box>
        </Tooltip>
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {artifacts.map((artifact, i) => (
          <Box key={i} sx={{ border: '1px solid #333333', p: 1.5 }}>
            <Typography sx={{ fontFamily: 'monospace', fontSize: '0.65rem', color: '#888', mb: 1, textTransform: 'uppercase' }}>
              {`// ${artifact.artifact_type || 'artifact'}${artifact.topic ? ` - ${artifact.topic}` : ''}`}
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

      <FlashcardPopupDialog
        open={Boolean(flashcardDialogData)}
        onClose={() => setFlashcardDialogData(null)}
        cards={flashcardDialogData?.cards || []}
        topic={flashcardDialogData?.topic}
        messageId={flashcardDialogData?.messageId}
        sessionId={flashcardDialogData?.sessionId}
      />
    </Box>
  );
}
