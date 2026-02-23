import React, { useState } from 'react';
import { Box, Drawer, Typography, IconButton, Tooltip } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import QuizIcon from '@mui/icons-material/Quiz';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import StyleIcon from '@mui/icons-material/Style';
import { useChatContext } from '../contexts/ChatContext';
import FlashcardOverlay from './FlashcardOverlay';

const ARTIFACT_ICONS = {
  flashcards: StyleIcon,
  quiz: QuizIcon,
  study_guide: MenuBookIcon,
  'study-guide': MenuBookIcon,
  visualization: AccountTreeIcon,
};

const ARTIFACT_LABELS = {
  flashcards: 'Flashcard Deck',
  quiz: 'Quiz',
  study_guide: 'Study Guide',
  'study-guide': 'Study Guide',
  visualization: 'Diagram',
};

export default function ArtifactsPopout({ open, onClose }) {
  const { artifacts } = useChatContext();
  const [flashcardOverlay, setFlashcardOverlay] = useState(null); // { cards, topic }

  const handleArtifactClick = (artifact) => {
    if (artifact.artifact_type === 'flashcards' && Array.isArray(artifact.content) && artifact.content.length > 0) {
      setFlashcardOverlay({ cards: artifact.content, topic: artifact.topic });
    }
  };

  return (
    <>
      <Drawer
        anchor="left"
        open={open}
        onClose={onClose}
        PaperProps={{
          sx: {
            width: 300,
            bgcolor: 'var(--bg-secondary)',
            borderRight: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
          },
        }}
        sx={{ zIndex: 1300 }}
      >
        {/* Header */}
        <Box sx={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          px: 2, py: 1.5, borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <AutoAwesomeIcon sx={{ fontSize: 16, color: 'var(--accent)' }} />
            <Typography sx={{ fontFamily: 'var(--font-family)', fontWeight: 700, fontSize: '0.88rem', color: 'var(--fg-primary)' }}>
              Artifacts
            </Typography>
          </Box>
          <IconButton size="small" onClick={onClose} sx={{ color: 'var(--fg-dim)', '&:hover': { color: 'var(--fg-primary)' } }}>
            <CloseIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Box>

        {/* Content */}
        <Box sx={{ flex: 1, overflowY: 'auto', p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {(!artifacts || artifacts.length === 0) ? (
            <Box sx={{ p: 2, textAlign: 'center' }}>
              <AutoAwesomeIcon sx={{ fontSize: 32, color: 'var(--fg-dim)', mb: 1 }} />
              <Typography sx={{ fontFamily: 'var(--font-family)', fontSize: '0.82rem', color: 'var(--fg-dim)' }}>
                No artifacts yet
              </Typography>
              <Typography sx={{ fontFamily: 'var(--font-family)', fontSize: '0.72rem', color: 'var(--fg-dim)', mt: 0.5 }}>
                Ask for flashcards, a quiz, or a diagram to create artifacts
              </Typography>
            </Box>
          ) : (
            artifacts.map((artifact, i) => {
              const type = artifact.artifact_type || 'artifact';
              const Icon = ARTIFACT_ICONS[type] || AutoAwesomeIcon;
              const label = ARTIFACT_LABELS[type] || type;
              const isClickable = type === 'flashcards' && Array.isArray(artifact.content) && artifact.content.length > 0;
              const cardCount = type === 'flashcards' && Array.isArray(artifact.content) ? artifact.content.length : null;

              return (
                <Tooltip key={i} title={isClickable ? 'Click to review flashcards' : ''} placement="right">
                  <Box
                    onClick={() => handleArtifactClick(artifact)}
                    sx={{
                      border: '1px solid var(--border)',
                      borderRadius: '12px',
                      p: 1.5,
                      cursor: isClickable ? 'pointer' : 'default',
                      bgcolor: 'var(--bg-primary)',
                      transition: 'border-color 0.15s, background-color 0.15s',
                      '&:hover': isClickable ? { borderColor: 'var(--accent)', bgcolor: 'var(--accent-dim)' } : {},
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <Icon sx={{ fontSize: 16, color: 'var(--accent)', flexShrink: 0 }} />
                      <Typography sx={{ fontFamily: 'var(--font-family)', fontSize: '0.78rem', fontWeight: 600, color: 'var(--fg-primary)' }}>
                        {label}
                      </Typography>
                      {cardCount && (
                        <Typography sx={{ fontFamily: 'var(--font-family)', fontSize: '0.65rem', color: 'var(--fg-dim)', ml: 'auto' }}>
                          {cardCount} cards
                        </Typography>
                      )}
                    </Box>
                    {artifact.topic && (
                      <Typography sx={{ fontFamily: 'var(--font-family)', fontSize: '0.72rem', color: 'var(--fg-secondary)', pl: 3.25 }}>
                        {artifact.topic}
                      </Typography>
                    )}
                    {isClickable && (
                      <Typography sx={{ fontFamily: 'var(--font-family)', fontSize: '0.65rem', color: 'var(--accent)', pl: 3.25, mt: 0.5 }}>
                        Tap to review →
                      </Typography>
                    )}
                  </Box>
                </Tooltip>
              );
            })
          )}
        </Box>
      </Drawer>

      <FlashcardOverlay
        open={Boolean(flashcardOverlay)}
        onClose={() => setFlashcardOverlay(null)}
        cards={flashcardOverlay?.cards || []}
        topic={flashcardOverlay?.topic}
      />
    </>
  );
}
