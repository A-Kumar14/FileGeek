import React, { useState } from 'react';
import { Container, TextField, Button, Typography, Box } from '@mui/material';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import apiClient from '../api/client';
import logo from '../assets/logo.svg';

const fieldSx = {
  '& .MuiOutlinedInput-root': {
    bgcolor: 'var(--bg-secondary)',
    color: 'var(--fg-primary)',
    fontSize: '0.88rem',
    borderRadius: '10px',
    fontFamily: 'var(--font-family)',
    '& fieldset': { borderColor: 'var(--border)' },
    '&:hover fieldset': { borderColor: 'var(--accent)' },
    '&.Mui-focused fieldset': { borderColor: 'var(--accent)', borderWidth: '1px' },
  },
  '& .MuiInputBase-input::placeholder': { color: 'var(--fg-dim)', opacity: 1 },
  mb: 1.5,
};

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resetToken, setResetToken] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email.trim()) {
      setError('Enter your email address.');
      return;
    }
    setLoading(true);
    try {
      const res = await apiClient.post('/auth/forgot-password', { email });
      const token = res.data.reset_token;
      if (token) {
        // Dev mode: token returned directly — redirect to reset page.
        navigate(`/reset-password?token=${encodeURIComponent(token)}`);
      } else {
        setResetToken('sent');
      }
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Request failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'var(--bg-primary)' }}>
      <Container maxWidth="xs">
        <Box sx={{ p: 4, bgcolor: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '16px' }}>

          <Box sx={{ mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <img src={logo} alt="FileGeek" width={28} height={28} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              <Typography sx={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--fg-primary)', fontFamily: 'var(--font-family)' }}>
                FileGeek
              </Typography>
            </Box>
            <Typography sx={{ fontWeight: 600, fontSize: '1.4rem', color: 'var(--fg-primary)', fontFamily: 'var(--font-family)' }}>
              Reset password
            </Typography>
            <Typography sx={{ mt: 0.5, fontSize: '0.82rem', color: 'var(--fg-dim)', fontFamily: 'var(--font-family)' }}>
              Enter your email and we'll generate a reset link.
            </Typography>
          </Box>

          {resetToken === 'sent' && (
            <Box sx={{ border: '1px solid var(--success)', bgcolor: 'rgba(34,197,94,0.05)', px: 1.5, py: 1, mb: 2, borderRadius: '8px' }}>
              <Typography sx={{ fontSize: '0.78rem', color: 'var(--success)', fontFamily: 'var(--font-family)' }}>
                Check your email for a reset link.
              </Typography>
            </Box>
          )}

          {error && (
            <Box sx={{ border: '1px solid var(--error)', bgcolor: 'rgba(220,38,38,0.05)', px: 1.5, py: 1, mb: 2, borderRadius: '8px' }}>
              <Typography sx={{ fontSize: '0.78rem', color: 'var(--error)', fontFamily: 'var(--font-family)' }}>
                {error}
              </Typography>
            </Box>
          )}

          {resetToken !== 'sent' && (
            <Box component="form" onSubmit={handleSubmit}>
              <TextField
                fullWidth
                placeholder="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                sx={fieldSx}
                autoFocus
                autoComplete="email"
              />
              <Button
                fullWidth
                variant="contained"
                type="submit"
                disabled={loading}
                disableElevation
                sx={{
                  py: 1.15, borderRadius: '10px', bgcolor: 'var(--accent)',
                  fontFamily: 'var(--font-family)', fontWeight: 600, fontSize: '0.88rem',
                  textTransform: 'none',
                  '&:hover': { bgcolor: 'var(--accent)', opacity: 0.88 },
                  '&.Mui-disabled': { bgcolor: 'var(--accent-dim)', color: 'var(--accent)' },
                }}
              >
                {loading ? 'Sending...' : 'Send reset link'}
              </Button>
            </Box>
          )}

          <Box sx={{ textAlign: 'center', mt: 2.5 }}>
            <Typography component={RouterLink} to="/login"
              sx={{ fontSize: '0.8rem', color: 'var(--fg-dim)', textDecoration: 'none', fontFamily: 'var(--font-family)', '&:hover': { color: 'var(--accent)' } }}
            >
              Back to sign in
            </Typography>
          </Box>

        </Box>
      </Container>
    </Box>
  );
}
