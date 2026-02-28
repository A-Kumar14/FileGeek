import React, { useState } from 'react';
import { Container, TextField, Button, Typography, Box } from '@mui/material';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
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
    '& input:-webkit-autofill, & input:-webkit-autofill:hover, & input:-webkit-autofill:focus': {
      WebkitBoxShadow: '0 0 0 100px var(--bg-secondary) inset',
      WebkitTextFillColor: 'var(--fg-primary)',
    },
  },
  '& .MuiInputBase-input::placeholder': { color: 'var(--fg-dim)', opacity: 1 },
  mb: 1.5,
};

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tokenFromUrl = searchParams.get('token') || '';

  const [token, setToken] = useState(tokenFromUrl);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!token.trim()) {
      setError('Enter your reset token.');
      return;
    }
    if (!newPassword.trim()) {
      setError('Enter a new password.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await apiClient.post('/auth/reset-password', { token, new_password: newPassword });
      navigate('/login', { state: { message: 'Password reset successfully. Please sign in.' } });
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(
        Array.isArray(detail)
          ? detail.map((d) => d.msg).join(' ')
          : detail || err.message || 'Reset failed.'
      );
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
              Set new password
            </Typography>
          </Box>

          {error && (
            <Box sx={{ border: '1px solid var(--error)', bgcolor: 'rgba(220,38,38,0.05)', px: 1.5, py: 1, mb: 2, borderRadius: '8px' }}>
              <Typography sx={{ fontSize: '0.78rem', color: 'var(--error)', fontFamily: 'var(--font-family)' }}>
                {error}
              </Typography>
            </Box>
          )}

          <Box component="form" onSubmit={handleSubmit}>
            {!tokenFromUrl && (
              <TextField
                fullWidth
                placeholder="Reset token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                sx={fieldSx}
                autoFocus
              />
            )}
            <TextField
              fullWidth
              placeholder="New password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              sx={fieldSx}
              autoFocus={Boolean(tokenFromUrl)}
              autoComplete="new-password"
            />
            <TextField
              fullWidth
              placeholder="Confirm new password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              sx={{ ...fieldSx, mb: 2 }}
              autoComplete="new-password"
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
              {loading ? 'Resetting...' : 'Reset password'}
            </Button>
          </Box>

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
