import React from 'react';
import { Box, Typography, Button } from '@mui/material';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            gap: 2,
            bgcolor: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            p: 3,
          }}
        >
          <Typography sx={{ color: 'var(--fg-primary)', fontWeight: 600, fontSize: '0.95rem' }}>
            Something went wrong
          </Typography>
          <Typography sx={{ color: 'var(--fg-dim)', fontSize: '0.8rem', textAlign: 'center' }}>
            This panel encountered an error. Your other work is unaffected.
          </Typography>
          <Button
            size="small"
            onClick={() => window.location.reload()}
            sx={{
              color: 'var(--accent)',
              border: '1px solid var(--accent)',
              borderRadius: '8px',
              textTransform: 'none',
              fontSize: '0.8rem',
              px: 2,
              '&:hover': { bgcolor: 'var(--accent-dim)' },
            }}
          >
            Reload
          </Button>
        </Box>
      );
    }
    return this.props.children;
  }
}
