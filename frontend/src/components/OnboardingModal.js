import React, { useState } from 'react';
import { Box, Button, Dialog, DialogContent, Typography } from '@mui/material';

const STEPS = [
  {
    icon: '📄',
    title: 'Upload a file',
    desc: 'Drop any PDF, DOCX, TXT, or image into FileGeek. The AI will read, index, and remember every page.',
    chips: ['PDF', 'DOCX', 'TXT', 'JPG / PNG'],
  },
  {
    icon: '💬',
    title: 'Ask anything',
    desc: 'Ask questions about your document and get grounded, cited answers — no hallucinations.',
    chips: [
      'Summarize this document',
      'What are the key conclusions?',
      'Explain section 3.2',
    ],
  },
  {
    icon: '⚡',
    title: 'Power features',
    desc: 'Press ⌘K to open the command palette — switch models, activate Socratic mode, change themes.',
    chips: ['⌘K — Command palette', 'Deep Think mode', 'Quizzes & diagrams'],
  },
];

export default function OnboardingModal({ open, onClose }) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const handleNext = () => {
    if (isLast) {
      localStorage.setItem('filegeek-onboarded', 'true');
      onClose();
    } else {
      setStep((s) => s + 1);
    }
  };

  const handleSkip = () => {
    localStorage.setItem('filegeek-onboarded', 'true');
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleSkip}
      maxWidth="xs"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: '20px',
          overflow: 'hidden',
        },
      }}
    >
      <DialogContent sx={{ p: 0 }}>
        {/* Progress bar */}
        <Box sx={{ display: 'flex', gap: 0.5, p: 2.5, pb: 0 }}>
          {STEPS.map((_, i) => (
            <Box
              key={i}
              sx={{
                flex: 1,
                height: 3,
                borderRadius: '2px',
                bgcolor: i <= step ? 'var(--accent)' : 'var(--border)',
                transition: 'background-color 0.3s',
              }}
            />
          ))}
        </Box>

        {/* Content */}
        <Box sx={{ px: 3, pt: 3, pb: 2 }}>
          <Typography sx={{ fontSize: '2.5rem', mb: 1.5, lineHeight: 1 }}>
            {current.icon}
          </Typography>

          <Typography sx={{
            fontSize: '1.25rem',
            fontWeight: 700,
            color: 'var(--fg-primary)',
            fontFamily: 'var(--font-family)',
            mb: 1,
            letterSpacing: '-0.02em',
          }}>
            {current.title}
          </Typography>

          <Typography sx={{
            fontSize: '0.88rem',
            color: 'var(--fg-secondary)',
            fontFamily: 'var(--font-family)',
            lineHeight: 1.6,
            mb: 2.5,
          }}>
            {current.desc}
          </Typography>

          {/* Feature chips */}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 3 }}>
            {current.chips.map((chip) => (
              <Box
                key={chip}
                sx={{
                  px: 1.25,
                  py: 0.4,
                  bgcolor: 'var(--accent-dim)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: 'var(--accent)',
                  fontFamily: 'var(--font-family)',
                }}
              >
                {chip}
              </Box>
            ))}
          </Box>
        </Box>

        {/* Actions */}
        <Box sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          px: 3,
          pb: 3,
        }}>
          <Typography
            onClick={handleSkip}
            sx={{
              fontSize: '0.8rem',
              color: 'var(--fg-dim)',
              cursor: 'pointer',
              fontFamily: 'var(--font-family)',
              '&:hover': { color: 'var(--fg-primary)' },
              transition: 'color 0.15s',
            }}
          >
            Skip
          </Typography>

          <Button
            variant="contained"
            disableElevation
            onClick={handleNext}
            sx={{
              px: 2.5,
              py: 0.9,
              borderRadius: '10px',
              bgcolor: 'var(--accent)',
              fontFamily: 'var(--font-family)',
              fontWeight: 600,
              fontSize: '0.88rem',
              textTransform: 'none',
              '&:hover': { bgcolor: 'var(--accent)', opacity: 0.88 },
            }}
          >
            {isLast ? "Let's go" : 'Next'}
          </Button>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
