import React, { useEffect, useState } from 'react';
import { Box, Typography, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

const STORAGE_KEY = 'filegeek-a2hs-dismissed';
const SESSION_COUNT_KEY = 'filegeek-session-count';

/**
 * Shows a subtle "Add to home screen" banner after the user's second session.
 * Dismissing it permanently hides it (stored in localStorage).
 * Uses the beforeinstallprompt event; does nothing on browsers that don't support it.
 */
export default function AddToHomeScreenPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Increment session counter
    const count = parseInt(localStorage.getItem(SESSION_COUNT_KEY) || '0', 10) + 1;
    localStorage.setItem(SESSION_COUNT_KEY, String(count));

    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (dismissed) return;

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Only show after the second session
      if (count >= 2) setShow(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      localStorage.setItem(STORAGE_KEY, 'true');
    }
    setShow(false);
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setShow(false);
  };

  if (!show) return null;

  return (
    <Box sx={{
      position: 'fixed',
      bottom: 90, // above the GlobalCommandBar
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 1200,
      bgcolor: 'var(--bg-secondary)',
      border: '1px solid var(--border)',
      borderRadius: '12px',
      px: 2,
      py: 1.25,
      display: 'flex',
      alignItems: 'center',
      gap: 1.5,
      boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
      maxWidth: 320,
      width: 'calc(100% - 32px)',
    }}>
      <Typography sx={{ fontSize: '0.8rem', color: 'var(--fg-primary)', fontFamily: 'var(--font-family)', flex: 1, lineHeight: 1.4 }}>
        Install FileGeek for quick access from your home screen.
      </Typography>
      <Box
        onClick={handleInstall}
        sx={{
          px: 1.25,
          py: 0.5,
          bgcolor: 'var(--accent)',
          borderRadius: '8px',
          fontSize: '0.75rem',
          fontWeight: 600,
          color: '#FFF',
          fontFamily: 'var(--font-family)',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          flexShrink: 0,
          '&:hover': { opacity: 0.88 },
          transition: 'opacity 0.15s',
        }}
      >
        Install
      </Box>
      <IconButton
        size="small"
        onClick={handleDismiss}
        sx={{ color: 'var(--fg-dim)', p: 0.25, flexShrink: 0 }}
      >
        <CloseIcon sx={{ fontSize: 14 }} />
      </IconButton>
    </Box>
  );
}
