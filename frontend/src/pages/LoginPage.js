import React, { useState } from 'react';
import { Container, TextField, Button, Typography, Box } from '@mui/material';
import { useNavigate, Navigate, Link as RouterLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

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

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) return <Navigate to="/" replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password.trim()) {
      setError('Enter email and password.');
      return;
    }
    setLoading(true);
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || 'Login failed.');
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
              <Box sx={{ width: 28, height: 28, borderRadius: '8px', bgcolor: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Typography sx={{ fontSize: '14px', color: '#FFF', fontWeight: 700, lineHeight: 1 }}>F</Typography>
              </Box>
              <Typography sx={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--fg-primary)', fontFamily: 'var(--font-family)' }}>
                FileGeek
              </Typography>
            </Box>
            <Typography sx={{ fontWeight: 600, fontSize: '1.4rem', color: 'var(--fg-primary)', fontFamily: 'var(--font-family)' }}>
              Sign in
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
            <TextField fullWidth placeholder="Email" type="email" value={email}
              onChange={(e) => setEmail(e.target.value)} sx={fieldSx} autoFocus autoComplete="email" />
            <TextField fullWidth placeholder="Password" type="password" value={password}
              onChange={(e) => setPassword(e.target.value)} sx={{ ...fieldSx, mb: 2 }} autoComplete="current-password" />
            <Button fullWidth variant="contained" type="submit" disabled={loading} disableElevation
              sx={{
                py: 1.15, borderRadius: '10px', bgcolor: 'var(--accent)',
                fontFamily: 'var(--font-family)', fontWeight: 600, fontSize: '0.88rem',
                textTransform: 'none',
                '&:hover': { bgcolor: 'var(--accent)', opacity: 0.88 },
                '&.Mui-disabled': { bgcolor: 'var(--accent-dim)', color: 'var(--accent)' },
              }}
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </Button>
          </Box>

          <Box sx={{ textAlign: 'center', mt: 2.5 }}>
            <Typography sx={{ fontSize: '0.8rem', color: 'var(--fg-dim)', fontFamily: 'var(--font-family)' }}>
              No account?{' '}
              <Typography component={RouterLink} to="/signup"
                sx={{ fontSize: '0.8rem', color: 'var(--accent)', textDecoration: 'none', fontWeight: 600, '&:hover': { textDecoration: 'underline' } }}
              >
                Sign up
              </Typography>
            </Typography>
          </Box>

        </Box>
      </Container>
    </Box>
  );
}
