import React, { useState } from 'react';
import { Box, Tooltip, Typography } from '@mui/material';
import { sendFeedback } from '../api/sessions';

export default function FeedbackButtons({ messageId }) {
  const [feedback, setFeedback] = useState(null);
  const [showThanks, setShowThanks] = useState(false);

  if (!messageId) return null;

  const handleFeedback = async (type) => {
    if (feedback === type) return;
    setFeedback(type);
    setShowThanks(true);
    setTimeout(() => setShowThanks(false), 2000);
    try {
      await sendFeedback(messageId, type);
    } catch {
      setFeedback(null);
      setShowThanks(false);
    }
  };

  const btnSx = (type, activeColor) => ({
    cursor: 'pointer',
    fontSize: '0.72rem',
    fontWeight: 600,
    fontFamily: 'var(--font-family)',
    color: feedback === type ? activeColor : 'var(--fg-dim)',
    transition: 'color 0.15s',
    '&:hover': { color: activeColor },
  });

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
      <Tooltip title={feedback === 'up' ? 'Recorded' : 'Helpful'}>
        <Box onClick={() => handleFeedback('up')} sx={btnSx('up', 'var(--success)')}>↑</Box>
      </Tooltip>
      <Tooltip title={feedback === 'down' ? 'Recorded' : 'Not helpful'}>
        <Box onClick={() => handleFeedback('down')} sx={btnSx('down', 'var(--error)')}>↓</Box>
      </Tooltip>
      {showThanks && (
        <Typography sx={{ fontSize: '0.65rem', color: 'var(--success)', fontFamily: 'var(--font-family)' }}>
          Thanks
        </Typography>
      )}
    </Box>
  );
}
