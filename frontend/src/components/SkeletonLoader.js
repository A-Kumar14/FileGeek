import React from 'react';
import { Box, Skeleton, Typography } from '@mui/material';

const PHASE_LABELS = {
  reading: 'READING_DOCUMENT...',
  analyzing: 'ANALYZING_CONTEXT...',
  formulating: 'FORMULATING_ANSWER...',
};

export default function SkeletonLoader({ phase }) {
  return (
    <Box sx={{ px: 1, py: 1, maxWidth: '85%', alignSelf: 'flex-start' }}>
      {/* Phase label */}
      <Typography sx={{ color: 'var(--fg-dim)', fontFamily: 'monospace', fontSize: '0.7rem', mb: 1.25 }}>
        [ {PHASE_LABELS[phase] || 'PROCESSING...'} ]
      </Typography>

      {/* Faked assistant chat bubble — first */}
      <Box sx={{ bgcolor: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '4px 14px 14px 14px', px: 2, py: 1.5, mb: 1.5 }}>
        <Skeleton variant="text" width="100%" sx={{ bgcolor: 'var(--border)', borderRadius: '4px', fontSize: '0.9rem' }} />
        <Skeleton variant="text" width="85%" sx={{ bgcolor: 'var(--border)', borderRadius: '4px', fontSize: '0.9rem' }} />
        <Skeleton variant="text" width="60%" sx={{ bgcolor: 'var(--border)', borderRadius: '4px', fontSize: '0.9rem' }} />
      </Box>

      {/* Faked assistant chat bubble — second */}
      <Box sx={{ bgcolor: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '4px 14px 14px 14px', px: 2, py: 1.5 }}>
        <Skeleton variant="text" width="100%" sx={{ bgcolor: 'var(--border)', borderRadius: '4px', fontSize: '0.9rem' }} />
        <Skeleton variant="text" width="70%" sx={{ bgcolor: 'var(--border)', borderRadius: '4px', fontSize: '0.9rem' }} />
        <Skeleton variant="text" width="45%" sx={{ bgcolor: 'var(--border)', borderRadius: '4px', fontSize: '0.9rem' }} />
      </Box>
    </Box>
  );
}
