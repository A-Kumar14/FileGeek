import React, { useState, useEffect } from 'react';
import { Snackbar, Alert } from '@mui/material';

/**
 * Listens for 'api-error' custom events dispatched by api/client.js and shows
 * an MUI Snackbar at the bottom-center of the screen.
 *
 * Mount once in App.js, outside the router tree so it's always present.
 */
export default function GlobalErrorToast() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const handler = (e) => {
      setMessage(e.detail?.message || 'An unexpected server error occurred.');
      setOpen(true);
    };
    window.addEventListener('api-error', handler);
    return () => window.removeEventListener('api-error', handler);
  }, []);

  return (
    <Snackbar
      open={open}
      autoHideDuration={6000}
      onClose={() => setOpen(false)}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      <Alert
        onClose={() => setOpen(false)}
        severity="error"
        variant="filled"
        sx={{
          fontFamily: 'var(--font-family)',
          fontSize: '0.82rem',
          borderRadius: '10px',
          maxWidth: 420,
        }}
      >
        {message}
      </Alert>
    </Snackbar>
  );
}
