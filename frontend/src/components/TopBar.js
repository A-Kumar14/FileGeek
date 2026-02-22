import React from 'react';
import { AppBar, Toolbar, Typography, IconButton, Box, Tooltip } from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import { useFile } from '../contexts/FileContext';
import { useChatContext } from '../contexts/ChatContext';

export default function TopBar({ onOpenSettings }) {
  const { file, removeFile } = useFile();
  const { clearMessages } = useChatContext();

  const handleNew = () => {
    removeFile();
    clearMessages();
  };

  const openPalette = () =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }));

  return (
    <AppBar position="sticky" elevation={0}>
      <Toolbar
        variant="dense"
        sx={{
          gap: 1,
          minHeight: 48,
          px: { xs: 1.5, md: 2 },
          bgcolor: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {/* Brand */}
        <Box
          onClick={handleNew}
          sx={{ display: 'flex', alignItems: 'center', gap: 0.75, cursor: 'pointer', mr: 1 }}
        >
          {/* Purple logo orb */}
          <Box
            sx={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              bgcolor: 'var(--accent)',
              boxShadow: '0 0 12px rgba(249,115,22,0.3)',
              flexShrink: 0,
            }}
          />
          <Typography
            sx={{
              fontWeight: 700,
              fontSize: '1rem',
              color: 'var(--fg-primary)',
              letterSpacing: '-0.01em',
            }}
          >
            FileGeek
          </Typography>
        </Box>

        {/* Active filename */}
        {file && (
          <Typography
            noWrap
            sx={{
              maxWidth: { xs: 100, sm: 220, md: 320 },
              fontSize: '0.8rem',
              color: 'var(--fg-dim)',
              display: { xs: 'none', sm: 'block' },
            }}
          >
            {file.name}
          </Typography>
        )}

        <Box sx={{ flex: 1 }} />

        {/* ⌘K command palette hint */}
        <Tooltip title="Command palette (Ctrl+K / ⌘K)">
          <Box
            onClick={openPalette}
            sx={{
              display: { xs: 'none', sm: 'flex' },
              alignItems: 'center',
              gap: 0.75,
              border: '1px solid var(--border)',
              borderRadius: '10px',
              px: 1.25,
              py: 0.4,
              cursor: 'pointer',
              transition: 'all 0.15s',
              '&:hover': { borderColor: 'var(--accent)', background: 'var(--accent-dim)' },
            }}
          >
            <SearchIcon sx={{ fontSize: 14, color: 'var(--fg-dim)' }} />
            <Typography sx={{ fontSize: '0.72rem', color: 'var(--fg-dim)', fontWeight: 500 }}>
              {typeof navigator !== 'undefined' && navigator.platform?.includes('Mac') ? '⌘K' : 'Ctrl+K'}
            </Typography>
          </Box>
        </Tooltip>

        {/* New session button */}
        {file && (
          <Tooltip title="Start new session">
            <IconButton
              size="small"
              onClick={handleNew}
              sx={{
                color: 'var(--fg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: '10px',
                p: 0.5,
                '&:hover': { borderColor: 'var(--accent)', color: 'var(--accent)', background: 'var(--accent-dim)' },
              }}
            >
              <AddIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        )}

        {/* Settings */}
        <Tooltip title="Settings">
          <IconButton
            onClick={onOpenSettings}
            size="small"
            aria-label="Settings"
            sx={{
              color: 'var(--fg-secondary)',
              '&:hover': { color: 'var(--accent)', background: 'var(--accent-dim)' },
            }}
          >
            <SettingsIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      </Toolbar>
    </AppBar>
  );
}
