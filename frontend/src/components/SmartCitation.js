import React from 'react';
import { Box, Tooltip, Typography } from '@mui/material';
import { useFile } from '../contexts/FileContext';

export default function SmartCitation({ source }) {
  const { goToPage } = useFile();

  const pages = source.pages || [];
  const pageLabel = pages.length
    ? `p.${pages[0]}${pages.length > 1 ? '–' + pages[pages.length - 1] : ''}`
    : `#${source.index}`;

  const excerpt = source.excerpt
    ? source.excerpt.slice(0, 120) + (source.excerpt.length > 120 ? '...' : '')
    : '';

  return (
    <Tooltip title={excerpt || `Source ${source.index}`}>
      <Box
        onClick={() => pages[0] && goToPage(pages[0])}
        component="span"
        sx={{
          display: 'inline-block',
          border: '1px solid var(--border)',
          borderRadius: '20px',
          px: 1,
          py: 0.2,
          mr: 0.5,
          mb: 0.5,
          cursor: pages[0] ? 'pointer' : 'default',
          transition: 'all 0.15s',
          '&:hover': pages[0] ? { borderColor: 'var(--accent)', bgcolor: 'var(--accent-dim)' } : {},
        }}
      >
        <Typography component="span" sx={{ fontSize: '0.65rem', fontFamily: 'var(--font-family)', fontWeight: 600, color: 'var(--accent)' }}>
          {pageLabel}
        </Typography>
      </Box>
    </Tooltip>
  );
}
