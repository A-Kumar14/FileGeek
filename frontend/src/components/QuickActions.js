import React from 'react';
import { Box, Typography } from '@mui/material';
import { useChatContext } from '../contexts/ChatContext';
import { useFile } from '../contexts/FileContext';

export default function QuickActions() {
  const { addMessage, isLoading } = useChatContext();
  const { file } = useFile();
  const fileType = file?.type || '';

  const actions = [
    'Make Quiz',
    'Summarize',
    ...(fileType.startsWith('image/') ? ['Analyze Image'] : []),
  ];

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, justifyContent: 'center', mt: 1 }}>
      {actions.map((label) => (
        <Box
          key={label}
          onClick={() => !isLoading && addMessage(label)}
          sx={{
            border: '1px solid var(--border)',
            borderRadius: '20px',
            px: 1.5,
            py: 0.4,
            cursor: isLoading ? 'default' : 'pointer',
            opacity: isLoading ? 0.5 : 1,
            transition: 'all 0.15s',
            '&:hover': isLoading ? {} : { borderColor: 'var(--accent)', bgcolor: 'var(--accent-dim)' },
          }}
        >
          <Typography sx={{ fontSize: '0.75rem', fontFamily: 'var(--font-family)', fontWeight: 500, color: 'var(--fg-secondary)' }}>
            {label}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}
