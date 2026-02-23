import React from 'react';
import { Box, Typography } from '@mui/material';
import { useChatContext } from '../contexts/ChatContext';

export default function SuggestionChips({ onSelect }) {
  const { suggestions, sendMessage } = useChatContext();

  if (!suggestions || suggestions.length === 0) return null;

  return (
    <Box sx={{ mb: 1, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      <Typography variant="caption" sx={{ color: 'var(--fg-dim)', fontFamily: 'var(--font-family)', fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Suggestions
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
        {suggestions.map((s, i) => {
          const text = s.text || s;
          return (
            <Box
              key={i}
              onClick={() => {
                if (onSelect) onSelect(text);
                else sendMessage(text);
              }}
              sx={{
                border: '1px solid var(--border)',
                borderRadius: '20px',
                px: 1.5,
                py: 0.3,
                cursor: 'pointer',
                transition: 'all 0.15s',
                '&:hover': { borderColor: 'var(--accent)', bgcolor: 'var(--accent-dim)' },
              }}
            >
              <Typography sx={{ fontSize: '0.75rem', fontFamily: 'var(--font-family)', color: 'var(--fg-secondary)' }}>
                {text}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
