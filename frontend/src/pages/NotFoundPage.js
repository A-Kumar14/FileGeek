import React from 'react';
import { Box, Typography, Button } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import logo from '../assets/logo.svg';

export default function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <Box sx={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      bgcolor: 'var(--bg-primary)',
      flexDirection: 'column',
      gap: 2,
      textAlign: 'center',
      px: 3,
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <img src={logo} alt="FileGeek" width={32} height={32} style={{ color: 'var(--accent)', opacity: 0.5 }} />
      </Box>

      <Typography sx={{
        fontSize: '5rem',
        fontWeight: 700,
        color: 'var(--fg-primary)',
        lineHeight: 1,
        fontFamily: 'var(--font-family)',
        letterSpacing: '-0.04em',
      }}>
        404
      </Typography>

      <Typography sx={{
        fontSize: '1rem',
        color: 'var(--fg-dim)',
        fontFamily: 'var(--font-family)',
        maxWidth: 320,
      }}>
        This page doesn't exist or was moved.
      </Typography>

      <Button
        variant="contained"
        disableElevation
        onClick={() => navigate('/')}
        sx={{
          mt: 1,
          px: 3,
          py: 1,
          borderRadius: '10px',
          bgcolor: 'var(--accent)',
          fontFamily: 'var(--font-family)',
          fontWeight: 600,
          fontSize: '0.88rem',
          textTransform: 'none',
          '&:hover': { bgcolor: 'var(--accent)', opacity: 0.88 },
        }}
      >
        Go home
      </Button>
    </Box>
  );
}
