import React, { useState } from 'react';
import { Box, Typography, Button, Dialog, DialogContent, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

export default function FlashcardOverlay({ open, onClose, cards = [], topic = '' }) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);

  if (!cards || cards.length === 0) return null;

  const card = cards[currentIdx];

  const goTo = (idx) => {
    setCurrentIdx(idx);
    setFlipped(false);
  };

  const handleClose = () => {
    setCurrentIdx(0);
    setFlipped(false);
    onClose();
  };

  const difficultyColor = { easy: '#059669', medium: '#F59E0B', hard: '#DC2626' };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: 'var(--bg-primary)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
          overflow: 'hidden',
        },
      }}
      sx={{ zIndex: 1400 }}
    >
      <DialogContent sx={{ p: 0 }}>
        {/* Header */}
        <Box sx={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          px: 2.5, py: 1.5, borderBottom: '1px solid var(--border)',
        }}>
          <Box>
            <Typography sx={{ fontFamily: 'var(--font-family)', fontWeight: 700, fontSize: '0.9rem', color: 'var(--fg-primary)' }}>
              {topic || 'Flashcards'}
            </Typography>
            <Typography sx={{ fontFamily: 'var(--font-family)', fontSize: '0.68rem', color: 'var(--fg-dim)' }}>
              {currentIdx + 1} of {cards.length}
            </Typography>
          </Box>
          <IconButton size="small" onClick={handleClose} sx={{ color: 'var(--fg-dim)', '&:hover': { color: 'var(--fg-primary)' } }}>
            <CloseIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>

        {/* Progress bar */}
        <Box sx={{ height: 3, bgcolor: 'var(--bg-secondary)' }}>
          <Box sx={{
            height: '100%',
            width: `${((currentIdx + 1) / cards.length) * 100}%`,
            bgcolor: 'var(--accent)',
            transition: 'width 0.3s ease',
          }} />
        </Box>

        {/* Card */}
        <Box sx={{ p: 3 }}>
          <Box
            onClick={() => setFlipped(f => !f)}
            sx={{
              minHeight: 180,
              border: '1px solid var(--border)',
              borderRadius: '14px',
              p: 3,
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              bgcolor: flipped ? 'var(--bg-secondary)' : 'var(--bg-primary)',
              transition: 'background-color 0.25s',
              position: 'relative',
              userSelect: 'none',
            }}
          >
            <Typography sx={{
              fontFamily: 'var(--font-family)',
              fontSize: '0.68rem',
              fontWeight: 600,
              color: 'var(--fg-dim)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              mb: 1.5,
            }}>
              {flipped ? 'Answer' : 'Question'}
            </Typography>
            <Typography sx={{
              fontFamily: 'var(--font-family)',
              fontSize: '1rem',
              color: 'var(--fg-primary)',
              lineHeight: 1.6,
              fontWeight: flipped ? 400 : 500,
            }}>
              {flipped ? card.back : card.front}
            </Typography>
            {card.difficulty && (
              <Box sx={{
                position: 'absolute', bottom: 12, right: 12,
                fontSize: '0.6rem', fontWeight: 700, fontFamily: 'var(--font-family)',
                color: difficultyColor[card.difficulty] || 'var(--fg-dim)',
                border: `1px solid ${difficultyColor[card.difficulty] || 'var(--border)'}`,
                borderRadius: '6px', px: 0.75, py: 0.2, textTransform: 'uppercase',
              }}>
                {card.difficulty}
              </Box>
            )}
          </Box>

          <Typography sx={{ fontFamily: 'var(--font-family)', fontSize: '0.7rem', color: 'var(--fg-dim)', textAlign: 'center', mt: 1.5 }}>
            Tap card to flip
          </Typography>

          {/* Controls */}
          <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center', mt: 2 }}>
            <Button
              onClick={() => goTo(Math.max(0, currentIdx - 1))}
              disabled={currentIdx === 0}
              variant="outlined"
              size="small"
              sx={{
                fontFamily: 'var(--font-family)', fontSize: '0.82rem', textTransform: 'none',
                borderColor: 'var(--border)', color: 'var(--fg-secondary)', borderRadius: '10px', px: 2.5,
                '&:hover': { borderColor: 'var(--fg-dim)', bgcolor: 'var(--bg-secondary)' },
                '&:disabled': { opacity: 0.3 },
              }}
            >
              ← Prev
            </Button>
            <Button
              onClick={() => setFlipped(f => !f)}
              variant="outlined"
              size="small"
              sx={{
                fontFamily: 'var(--font-family)', fontSize: '0.82rem', textTransform: 'none',
                borderColor: 'var(--accent)', color: 'var(--accent)', borderRadius: '10px', px: 2.5,
                '&:hover': { bgcolor: 'var(--accent-dim)' },
              }}
            >
              Flip
            </Button>
            <Button
              onClick={() => goTo(Math.min(cards.length - 1, currentIdx + 1))}
              disabled={currentIdx === cards.length - 1}
              variant="outlined"
              size="small"
              sx={{
                fontFamily: 'var(--font-family)', fontSize: '0.82rem', textTransform: 'none',
                borderColor: 'var(--border)', color: 'var(--fg-secondary)', borderRadius: '10px', px: 2.5,
                '&:hover': { borderColor: 'var(--fg-dim)', bgcolor: 'var(--bg-secondary)' },
                '&:disabled': { opacity: 0.3 },
              }}
            >
              Next →
            </Button>
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
