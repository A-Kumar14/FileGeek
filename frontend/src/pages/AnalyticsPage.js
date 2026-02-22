import React, { useEffect, useState, useCallback } from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BarChart2, BookOpen, Layers, Calendar } from 'lucide-react';
import axios from 'axios';

const API = process.env.REACT_APP_API_URL || 'http://localhost:5001';

function StatCard({ label, value, sub, color = '#00FF00' }) {
  return (
    <Box
      sx={{
        border: `1px solid #333`,
        p: 2,
        flex: '1 1 160px',
        minWidth: 140,
        bgcolor: '#0D0D0D',
      }}
    >
      <Typography sx={{ fontFamily: 'monospace', fontSize: '0.65rem', color: '#888', mb: 0.5, textTransform: 'uppercase' }}>
        {label}
      </Typography>
      <Typography sx={{ fontFamily: 'monospace', fontSize: '1.6rem', fontWeight: 700, color, lineHeight: 1 }}>
        {value}
      </Typography>
      {sub && (
        <Typography sx={{ fontFamily: 'monospace', fontSize: '0.65rem', color: '#555', mt: 0.5 }}>
          {sub}
        </Typography>
      )}
    </Box>
  );
}

function MasteryBar({ known, reviewing, total }) {
  const knownPct = total > 0 ? (known / total) * 100 : 0;
  const reviewingPct = total > 0 ? (reviewing / total) * 100 : 0;
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography sx={{ fontFamily: 'monospace', fontSize: '0.65rem', color: '#888' }}>
          FLASHCARD MASTERY
        </Typography>
        <Typography sx={{ fontFamily: 'monospace', fontSize: '0.65rem', color: '#888' }}>
          {total} total
        </Typography>
      </Box>
      <Box sx={{ height: 8, bgcolor: '#1A1A1A', border: '1px solid #333', display: 'flex', overflow: 'hidden' }}>
        <Box sx={{ width: `${knownPct}%`, bgcolor: '#00FF00', transition: 'width 0.5s' }} />
        <Box sx={{ width: `${reviewingPct}%`, bgcolor: '#FFAA00', transition: 'width 0.5s' }} />
      </Box>
      <Box sx={{ display: 'flex', gap: 2, mt: 0.75 }}>
        <Typography sx={{ fontFamily: 'monospace', fontSize: '0.6rem', color: '#00FF00' }}>
          Known: {known}
        </Typography>
        <Typography sx={{ fontFamily: 'monospace', fontSize: '0.6rem', color: '#FFAA00' }}>
          ↻ Reviewing: {reviewing}
        </Typography>
        <Typography sx={{ fontFamily: 'monospace', fontSize: '0.6rem', color: '#555' }}>
          Remaining: {total - known - reviewing}
        </Typography>
      </Box>
    </Box>
  );
}

function ScoreBar({ percentage }) {
  const color = percentage >= 70 ? '#00FF00' : percentage >= 50 ? '#FFAA00' : '#FF4444';
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
      <Box sx={{ flex: 1, height: 4, bgcolor: '#1A1A1A' }}>
        <Box sx={{ width: `${percentage}%`, height: '100%', bgcolor: color, transition: 'width 0.3s' }} />
      </Box>
      <Typography sx={{ fontFamily: 'monospace', fontSize: '0.7rem', color, minWidth: 40, textAlign: 'right' }}>
        {percentage}%
      </Typography>
    </Box>
  );
}

export default function AnalyticsPage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchSummary = useCallback(async () => {
    const token = localStorage.getItem('filegeek-token');
    if (!token) {
      navigate('/login');
      return;
    }
    try {
      const res = await axios.get(`${API}/analytics/summary`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setData(res.data);
    } catch (err) {
      setError('Failed to load analytics. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: '#000000',
        color: '#E5E5E5',
        fontFamily: 'monospace',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          px: 3,
          py: 2,
          borderBottom: '1px solid #333',
        }}
      >
        <Box
          onClick={() => navigate('/')}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            cursor: 'pointer',
            color: '#888',
            fontFamily: 'monospace',
            fontSize: '0.75rem',
            '&:hover': { color: '#E5E5E5' },
          }}
        >
          <ArrowLeft size={14} />
          <span>[BACK]</span>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <BarChart2 size={16} color="#00FF00" />
          <Typography sx={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.9rem', color: '#E5E5E5' }}>
            STUDY ANALYTICS
          </Typography>
        </Box>
      </Box>

      {/* Body */}
      <Box sx={{ flex: 1, p: 3, maxWidth: 900, width: '100%', mx: 'auto' }}>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', pt: 8 }}>
            <CircularProgress size={24} sx={{ color: '#00FF00' }} />
          </Box>
        )}

        {error && (
          <Typography sx={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#FF4444', textAlign: 'center', pt: 8 }}>
            {error}
          </Typography>
        )}

        {data && (
          <>
            {/* Summary Stats */}
            <Typography sx={{ fontFamily: 'monospace', fontSize: '0.65rem', color: '#888', mb: 1.5, textTransform: 'uppercase' }}>
              {'// Overview'}
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 3 }}>
              <StatCard
                label="Sessions"
                value={data.total_sessions}
                sub="total study sessions"
                color="#E5E5E5"
              />
              <StatCard
                label="Quizzes Taken"
                value={data.total_quizzes}
                sub="completed quizzes"
                color="#00FF00"
              />
              <StatCard
                label="Avg Quiz Score"
                value={`${data.avg_quiz_score}%`}
                sub={data.avg_quiz_score >= 70 ? 'Excellent' : data.avg_quiz_score >= 50 ? 'Good' : 'Needs work'}
                color={data.avg_quiz_score >= 70 ? '#00FF00' : data.avg_quiz_score >= 50 ? '#FFAA00' : '#FF4444'}
              />
              <StatCard
                label="Cards Due Today"
                value={data.cards_due_today}
                sub={data.cards_due_today > 0 ? '→ click to review' : 'all caught up!'}
                color={data.cards_due_today > 0 ? '#FFAA00' : '#00FF00'}
              />
            </Box>

            {/* Review Queue CTA */}
            {data.cards_due_today > 0 && (
              <Box
                onClick={() => navigate('/review')}
                sx={{
                  border: '1px solid #FFAA00', p: 1.5, mb: 3, cursor: 'pointer',
                  bgcolor: '#0D0D0D', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  '&:hover': { bgcolor: '#1A1400' },
                }}
              >
                <Typography sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#FFAA00' }}>
                  {data.cards_due_today} flashcard{data.cards_due_today !== 1 ? 's' : ''} due for review — start your session now
                </Typography>
                <Typography sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#FFAA00' }}>→</Typography>
              </Box>
            )}

            {/* Flashcard Mastery */}
            <Box sx={{ border: '1px solid #333', p: 2, mb: 3, bgcolor: '#0D0D0D' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <Layers size={14} color="#888" />
                <Typography sx={{ fontFamily: 'monospace', fontSize: '0.65rem', color: '#888', textTransform: 'uppercase' }}>
                  {'// Flashcard Progress'}
                </Typography>
              </Box>
              {data.total_flashcards === 0 ? (
                <Typography sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#555' }}>
                  No flashcards reviewed yet. Generate some from a document to get started.
                </Typography>
              ) : (
                <MasteryBar
                  known={data.known_flashcards}
                  reviewing={data.reviewing_flashcards}
                  total={data.total_flashcards}
                />
              )}
            </Box>

            {/* Quiz History */}
            <Box sx={{ border: '1px solid #333', p: 2, bgcolor: '#0D0D0D' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <BookOpen size={14} color="#888" />
                <Typography sx={{ fontFamily: 'monospace', fontSize: '0.65rem', color: '#888', textTransform: 'uppercase' }}>
                  {'// Recent Quizzes'}
                </Typography>
              </Box>

              {data.recent_quizzes.length === 0 ? (
                <Typography sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#555' }}>
                  No quizzes taken yet. Ask the AI to generate a quiz from a document.
                </Typography>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {data.recent_quizzes.map((q) => (
                    <Box
                      key={q.id}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                        py: 1,
                        borderBottom: '1px solid #1A1A1A',
                        '&:last-child': { borderBottom: 'none' },
                      }}
                    >
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#E5E5E5', truncate: true, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {q.topic}
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.25 }}>
                          <Calendar size={10} color="#555" />
                          <Typography sx={{ fontFamily: 'monospace', fontSize: '0.6rem', color: '#555' }}>
                            {new Date(q.created_at).toLocaleDateString()} · {q.score}/{q.total_questions} correct
                            {q.time_taken ? ` · ${q.time_taken}s` : ''}
                          </Typography>
                        </Box>
                      </Box>
                      <ScoreBar percentage={q.percentage} />
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
}
