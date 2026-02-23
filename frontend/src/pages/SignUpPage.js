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

export default function SignUpPage() {
  const navigate = useNavigate();
  const { signup, isAuthenticated } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) return <Navigate to="/" replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!name.trim() || !email.trim() || !password.trim()) {
      setError('Fill in all fields.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      await signup(name, email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || 'Sign up failed.');
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
              Create account
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
            <TextField fullWidth placeholder="Name" value={name}
              onChange={(e) => setName(e.target.value)} sx={fieldSx} autoFocus autoComplete="name" />
            <TextField fullWidth placeholder="Email" type="email" value={email}
              onChange={(e) => setEmail(e.target.value)} sx={fieldSx} autoComplete="email" />
            <TextField fullWidth placeholder="Password" type="password" value={password}
              onChange={(e) => setPassword(e.target.value)} sx={fieldSx} autoComplete="new-password" />
            <TextField fullWidth placeholder="Confirm password" type="password" value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)} sx={{ ...fieldSx, mb: 2 }} autoComplete="new-password" />

            <Button fullWidth variant="contained" type="submit" disabled={loading} disableElevation
              sx={{
                py: 1.15, borderRadius: '10px', bgcolor: 'var(--accent)',
                fontFamily: 'var(--font-family)', fontWeight: 600, fontSize: '0.88rem',
                textTransform: 'none',
                '&:hover': { bgcolor: 'var(--accent)', opacity: 0.88 },
                '&.Mui-disabled': { bgcolor: 'var(--accent-dim)', color: 'var(--accent)' },
              }}
            >
              {loading ? 'Creating account...' : 'Create account'}
            </Button>
          </Box>

          <Box sx={{ textAlign: 'center', mt: 2.5 }}>
            <Typography sx={{ fontSize: '0.8rem', color: 'var(--fg-dim)', fontFamily: 'var(--font-family)' }}>
              Have an account?{' '}
              <Typography component={RouterLink} to="/login"
                sx={{ fontSize: '0.8rem', color: 'var(--accent)', textDecoration: 'none', fontWeight: 600, '&:hover': { textDecoration: 'underline' } }}
              >
                Sign in
              </Typography>
            </Typography>
          </Box>

        </Box>
      </Container>
    </Box>
  );
}
