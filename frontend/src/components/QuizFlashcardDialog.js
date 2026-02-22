import React, { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  Box,
  Typography,
  Button,
  LinearProgress,
  CircularProgress,
} from '@mui/material';
import { useChatContext } from '../contexts/ChatContext';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

function fireConfetti() {
  import('canvas-confetti').then((mod) => {
    const confetti = mod.default;
    confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
  });
}

export default function QuizFlashcardDialog({ open, onClose, questions }) {
  const { activeSessionId } = useChatContext();
  const qs = Array.isArray(questions) ? questions : [];

  const [currentQ, setCurrentQ] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null); // null | number
  const [isFlipped, setIsFlipped] = useState(false);
  const [explanations, setExplanations] = useState({}); // { [qIdx]: string }
  const [loadingExplain, setLoadingExplain] = useState(false);
  const [scores, setScores] = useState([]); // array of booleans
  const [done, setDone] = useState(false);

  const handleReset = useCallback(() => {
    setCurrentQ(0);
    setSelectedOption(null);
    setIsFlipped(false);
    setExplanations({});
    setLoadingExplain(false);
    setScores([]);
    setDone(false);
  }, []);

  const handleClose = () => {
    handleReset();
    onClose();
  };

  if (!open || qs.length === 0) return null;

  const q = qs[currentQ];
  const isCorrect = selectedOption !== null && selectedOption === q.correct_index;

  const handleOptionClick = (optIdx) => {
    if (isFlipped) return; // already answered
    setSelectedOption(optIdx);
    setIsFlipped(true);
    const correct = optIdx === q.correct_index;
    if (correct) fireConfetti();
  };

  const handleNext = () => {
    const newScores = [...scores, selectedOption === q.correct_index];
    setScores(newScores);
    if (currentQ === qs.length - 1) {
      setDone(true);
    } else {
      setCurrentQ(currentQ + 1);
      setSelectedOption(null);
      setIsFlipped(false);
    }
  };

  const handleExplainWithAI = async () => {
    if (!activeSessionId) return;
    setLoadingExplain(true);
    const token = localStorage.getItem('filegeek-token');
    const userSelected = q.options?.[selectedOption] || 'unknown';
    const correctAnswer = q.options?.[q.correct_index] || 'unknown';
    const verdict = isCorrect ? 'correct' : 'incorrect';
    const prompt = `For quiz question: "${q.question}". The correct answer is "${correctAnswer}". The user selected "${userSelected}". Explain why this answer is ${verdict} in 2-3 sentences.`;

    try {
      const res = await fetch(`${API_BASE}/sessions/${activeSessionId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ content: prompt }),
      });
      const data = await res.json();
      const explanation = data?.message?.content || data?.content || 'No explanation available.';
      setExplanations((prev) => ({ ...prev, [currentQ]: explanation }));
    } catch {
      setExplanations((prev) => ({ ...prev, [currentQ]: 'Failed to get explanation.' }));
    } finally {
      setLoadingExplain(false);
    }
  };

  const finalCorrect = scores.filter(Boolean).length;
  const pct = Math.round((finalCorrect / qs.length) * 100);
  const rating = pct >= 80 ? 'EXCELLENT' : pct >= 60 ? 'GOOD' : 'NEEDS REVIEW';
  const ratingColor = pct >= 80 ? '#00FF00' : pct >= 60 ? '#FFAA00' : '#FF0000';

  // Progress while answering
  const answeredSoFar = scores.length;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      fullWidth
      maxWidth="sm"
      PaperProps={{
        sx: {
          bgcolor: '#000000',
          border: '1px solid #333333',
          borderRadius: 0,
          color: '#E5E5E5',
          fontFamily: 'monospace',
          overflow: 'visible',
        },
      }}
    >
      <DialogContent sx={{ p: 0 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.5, borderBottom: '1px solid #333' }}>
          <Typography sx={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.85rem', color: '#E5E5E5' }}>
            {done ? 'QUIZ COMPLETE' : `QUIZ [ Q${currentQ + 1}/${qs.length} ]`}
          </Typography>
          <Box
            onClick={handleClose}
            sx={{ cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.75rem', color: '#888', fontWeight: 700, '&:hover': { color: '#E5E5E5' } }}
          >
            [X CLOSE]
          </Box>
        </Box>

        {done ? (
          /* ── Summary Screen ── */
          <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <Box sx={{ border: `2px solid ${ratingColor}`, p: 3, width: '100%', textAlign: 'center', bgcolor: '#0A0A0A' }}>
              <Typography sx={{ fontFamily: 'monospace', fontSize: '2rem', fontWeight: 700, color: ratingColor }}>
                {finalCorrect}/{qs.length}
              </Typography>
              <Typography sx={{ fontFamily: 'monospace', fontSize: '0.85rem', color: '#E5E5E5', mt: 0.5 }}>
                {pct}% CORRECT
              </Typography>
              <Typography sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: ratingColor, mt: 1, fontWeight: 700 }}>
                ◆ {rating}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                onClick={handleReset}
                sx={{
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: '#00FF00',
                  border: '1px solid #00FF00',
                  px: 2,
                  borderRadius: 0,
                  '&:hover': { bgcolor: '#001A00' },
                }}
              >
                [RETRY]
              </Button>
              <Button
                onClick={handleClose}
                sx={{
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: '#888',
                  border: '1px solid #333',
                  px: 2,
                  borderRadius: 0,
                  '&:hover': { color: '#E5E5E5', borderColor: '#666' },
                }}
              >
                [CLOSE]
              </Button>
            </Box>
          </Box>
        ) : (
          /* ── Quiz Card ── */
          <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* 3D Card */}
            <Box sx={{ perspective: '1000px', height: isFlipped ? 'auto' : 'auto', minHeight: 160 }}>
              <Box
                sx={{
                  position: 'relative',
                  width: '100%',
                  transformStyle: 'preserve-3d',
                  transition: 'transform 0.5s ease',
                  transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                  minHeight: 160,
                }}
              >
                {/* Card Front */}
                <Box
                  sx={{
                    backfaceVisibility: 'hidden',
                    WebkitBackfaceVisibility: 'hidden',
                    border: '1px solid #333',
                    bgcolor: '#0D0D0D',
                    p: 2,
                    minHeight: 160,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                  }}
                >
                  <Typography sx={{ fontFamily: 'monospace', fontSize: '0.9rem', fontWeight: 700, color: '#E5E5E5', mb: 2 }}>
                    {q.question}
                  </Typography>

                  {/* Option buttons */}
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                    {q.options?.map((opt, optIdx) => (
                      <Box
                        key={optIdx}
                        onClick={() => handleOptionClick(optIdx)}
                        sx={{
                          p: 1,
                          border: '1px solid #333',
                          bgcolor: '#0A0A0A',
                          cursor: 'pointer',
                          fontFamily: 'monospace',
                          fontSize: '0.8rem',
                          color: '#AAA',
                          transition: 'all 0.15s',
                          '&:hover': { borderColor: '#666', bgcolor: '#1A1A1A', color: '#E5E5E5' },
                        }}
                      >
                        {String.fromCharCode(65 + optIdx)}) {opt}
                      </Box>
                    ))}
                  </Box>
                </Box>

                {/* Card Back */}
                <Box
                  sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    backfaceVisibility: 'hidden',
                    WebkitBackfaceVisibility: 'hidden',
                    transform: 'rotateY(180deg)',
                    border: `2px solid ${isCorrect ? '#00FF00' : '#FF0000'}`,
                    bgcolor: isCorrect ? '#001A00' : '#1A0000',
                    p: 2,
                    minHeight: 160,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1.5,
                  }}
                >
                  {/* Verdict */}
                  <Typography sx={{ fontFamily: 'monospace', fontSize: '0.85rem', fontWeight: 700, color: isCorrect ? '#00FF00' : '#FF0000' }}>
                    {isCorrect ? '[ Correct  ]' : '[ Incorrect  ]'}
                  </Typography>

                  {/* Correct answer */}
                  <Box sx={{ border: '1px solid #333', p: 1, bgcolor: '#001A00' }}>
                    <Typography sx={{ fontFamily: 'monospace', fontSize: '0.7rem', color: '#888', mb: 0.25 }}>CORRECT ANSWER:</Typography>
                    <Typography sx={{ fontFamily: 'monospace', fontSize: '0.85rem', color: '#00FF00', fontWeight: 700 }}>
                      {String.fromCharCode(65 + q.correct_index)}) {q.options?.[q.correct_index]}
                    </Typography>
                  </Box>

                  {/* AI Explanation */}
                  {explanations[currentQ] ? (
                    <Box sx={{ border: '1px solid #333', p: 1, bgcolor: '#0A0A0A' }}>
                      <Typography sx={{ fontFamily: 'monospace', fontSize: '0.7rem', color: '#888', mb: 0.5 }}>AI EXPLANATION:</Typography>
                      <Typography sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#E5E5E5', lineHeight: 1.5 }}>
                        {explanations[currentQ]}
                      </Typography>
                    </Box>
                  ) : (
                    <Button
                      onClick={handleExplainWithAI}
                      disabled={loadingExplain || !activeSessionId}
                      sx={{
                        fontFamily: 'monospace',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        color: '#888',
                        border: '1px solid #333',
                        px: 1.5,
                        py: 0.5,
                        borderRadius: 0,
                        alignSelf: 'flex-start',
                        '&:hover': { color: '#E5E5E5', borderColor: '#666', bgcolor: '#1A1A1A' },
                        '&.Mui-disabled': { color: '#444', borderColor: '#222' },
                      }}
                    >
                      {loadingExplain ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                          <CircularProgress size={10} sx={{ color: '#888' }} />
                          <span>LOADING...</span>
                        </Box>
                      ) : (
                        '[EXPLAIN WITH AI]'
                      )}
                    </Button>
                  )}

                  {/* Next button */}
                  <Button
                    onClick={handleNext}
                    sx={{
                      fontFamily: 'monospace',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: '#00FF00',
                      border: '1px solid #00FF00',
                      px: 2,
                      py: 0.5,
                      borderRadius: 0,
                      alignSelf: 'flex-end',
                      '&:hover': { bgcolor: '#001A00' },
                    }}
                  >
                    {currentQ === qs.length - 1 ? '[FINISH →]' : '[NEXT →]'}
                  </Button>
                </Box>
              </Box>
            </Box>

            {/* Score progress bar */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <LinearProgress
                variant="determinate"
                value={(answeredSoFar / qs.length) * 100}
                sx={{
                  flex: 1,
                  height: 4,
                  bgcolor: '#1A1A1A',
                  border: '1px solid #333',
                  borderRadius: 0,
                  '& .MuiLinearProgress-bar': { bgcolor: '#00FF00', borderRadius: 0 },
                }}
              />
              <Typography sx={{ fontFamily: 'monospace', fontSize: '0.65rem', color: '#888', whiteSpace: 'nowrap' }}>
                {answeredSoFar}/{qs.length}
              </Typography>
            </Box>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
