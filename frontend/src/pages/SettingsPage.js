import React from 'react';
import { Box, Typography, ToggleButton, ToggleButtonGroup, Divider } from '@mui/material';
import { useThemeMode } from '../theme/ThemeContext';
import { THEME_NAMES, FONT_NAMES } from '../theme/themes';

const THEME_LABELS = { dark: 'Dark', light: 'Light', hacker: 'Hacker', sepia: 'Sepia' };
const FONT_LABELS = { inter: 'Inter', jetbrains: 'JetBrains Mono', dyslexic: 'OpenDyslexic' };

const THEME_PREVIEWS = {
  dark: { bg: '#0D0D0D', fg: '#E5E5E5', accent: '#00FF00' },
  light: { bg: '#F8F9FA', fg: '#1A1A2E', accent: '#0070F3' },
  hacker: { bg: '#000000', fg: '#00FF00', accent: '#39FF14' },
  sepia: { bg: '#F4ECD8', fg: '#2C1810', accent: '#8B4513' },
};

function SectionLabel({ children }) {
  return (
    <Typography
      sx={{
        fontFamily: 'var(--font-mono, monospace)',
        fontWeight: 700,
        fontSize: '0.65rem',
        letterSpacing: '0.15em',
        color: 'var(--fg-dim, #666)',
        textTransform: 'uppercase',
        mb: 1.5,
        mt: 3,
      }}
    >
      {'// '}{children}
    </Typography>
  );
}

function ThemeCard({ name, active, onClick }) {
  const p = THEME_PREVIEWS[name];
  return (
    <Box
      onClick={onClick}
      sx={{
        cursor: 'pointer',
        width: 100,
        borderRadius: '4px',
        overflow: 'hidden',
        border: active
          ? `2px solid var(--accent, #00FF00)`
          : '2px solid var(--border, #333)',
        transition: 'border-color 0.15s, transform 0.1s',
        '&:hover': { transform: 'translateY(-2px)' },
        boxShadow: active ? 'var(--accent-glow)' : 'none',
      }}
    >
      {/* Mini preview */}
      <Box sx={{ height: 48, bgcolor: p.bg, p: 0.75 }}>
        <Box sx={{ height: 6, width: '60%', bgcolor: p.fg, borderRadius: 1, mb: 0.5, opacity: 0.8 }} />
        <Box sx={{ height: 4, width: '80%', bgcolor: p.fg, borderRadius: 1, mb: 0.5, opacity: 0.4 }} />
        <Box sx={{ height: 4, width: '45%', bgcolor: p.accent, borderRadius: 1, opacity: 0.9 }} />
      </Box>
      <Box sx={{ bgcolor: p.bg, borderTop: `1px solid ${p.accent}30`, px: 1, py: 0.5 }}>
        <Typography
          sx={{
            fontFamily: 'monospace',
            fontSize: '0.6rem',
            fontWeight: 700,
            color: active ? p.accent : p.fg,
            letterSpacing: '0.05em',
          }}
        >
          {THEME_LABELS[name]}
          {active && ''}
        </Typography>
      </Box>
    </Box>
  );
}

export default function SettingsPage() {
  const { themeName, font, density, layoutMode, setTheme, setFont, toggleDensity, setLayoutMode } =
    useThemeMode();

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: 'var(--bg-primary, #0D0D0D)',
        p: { xs: 2, md: 4 },
        maxWidth: 720,
        mx: 'auto',
      }}
    >
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography
          variant="h5"
          sx={{
            fontFamily: 'var(--font-mono, monospace)',
            fontWeight: 700,
            color: 'var(--fg-primary)',
            letterSpacing: '-0.02em',
          }}
        >
          SETTINGS
        </Typography>
        <Typography
          sx={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.75rem', color: 'var(--fg-dim)' }}
        >
          {'// appearance & layout configuration'}
        </Typography>
      </Box>

      <Divider sx={{ borderColor: 'var(--border)' }} />

      {/* Theme Selection */}
      <SectionLabel>Theme</SectionLabel>
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
        {THEME_NAMES.map((name) => (
          <ThemeCard
            key={name}
            name={name}
            active={themeName === name}
            onClick={() => setTheme(name)}
          />
        ))}
      </Box>

      {/* Font Selection */}
      <SectionLabel>Font</SectionLabel>
      <ToggleButtonGroup
        value={font}
        exclusive
        onChange={(_, v) => v && setFont(v)}
        sx={{ flexWrap: 'wrap', gap: 1, '& .MuiToggleButtonGroup-grouped': { border: '1px solid var(--border) !important', borderRadius: '2px !important', mr: 0 } }}
      >
        {FONT_NAMES.map((name) => (
          <ToggleButton
            key={name}
            value={name}
            sx={{
              fontFamily: name === 'jetbrains' ? "'JetBrains Mono', monospace"
                : name === 'dyslexic' ? "'OpenDyslexic', sans-serif"
                  : "'Inter', sans-serif",
              fontSize: '0.75rem',
              color: font === name ? 'var(--accent)' : 'var(--fg-secondary)',
              bgcolor: font === name ? 'var(--accent-dim)' : 'transparent',
              px: 2,
              py: 0.75,
              '&.Mui-selected': { bgcolor: 'var(--accent-dim)', color: 'var(--accent)' },
              '&.Mui-selected:hover': { bgcolor: 'var(--accent-dim)' },
            }}
          >
            {FONT_LABELS[name]}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      {/* Density */}
      <SectionLabel>Information Density</SectionLabel>
      <ToggleButtonGroup
        value={density}
        exclusive
        onChange={(_, v) => v && toggleDensity()}
        sx={{ '& .MuiToggleButtonGroup-grouped': { border: '1px solid var(--border) !important', borderRadius: '2px !important', mr: 0 } }}
      >
        {['compact', 'spacious'].map((d) => (
          <ToggleButton
            key={d}
            value={d}
            sx={{
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: '0.75rem',
              textTransform: 'uppercase',
              color: density === d ? 'var(--accent)' : 'var(--fg-secondary)',
              '&.Mui-selected': { bgcolor: 'var(--accent-dim)', color: 'var(--accent)' },
              '&.Mui-selected:hover': { bgcolor: 'var(--accent-dim)' },
              px: 2,
              py: 0.75,
            }}
          >
            {d}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      {/* Layout Mode */}
      <SectionLabel>Layout Mode</SectionLabel>
      <Box sx={{ display: 'flex', gap: 2 }}>
        {[
          { value: 'analyst', label: 'Analyst Mode', desc: 'Multi-pane: document + chat side by side' },
          { value: 'focus', label: 'Focus Mode', desc: 'Minimalist single-pane view' },
        ].map(({ value, label, desc }) => (
          <Box
            key={value}
            onClick={() => setLayoutMode(value)}
            sx={{
              cursor: 'pointer',
              flex: 1,
              border: layoutMode === value
                ? '2px solid var(--accent)'
                : '2px solid var(--border)',
              borderRadius: '4px',
              p: 1.5,
              transition: 'border-color 0.15s',
              boxShadow: layoutMode === value ? 'var(--accent-glow)' : 'none',
              '&:hover': { borderColor: 'var(--border-focus)' },
            }}
          >
            <Typography
              sx={{
                fontFamily: 'var(--font-mono, monospace)',
                fontWeight: 700,
                fontSize: '0.8rem',
                color: layoutMode === value ? 'var(--accent)' : 'var(--fg-primary)',
                mb: 0.25,
              }}
            >
              {label}
              {layoutMode === value && ''}
            </Typography>
            <Typography sx={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.65rem', color: 'var(--fg-dim)' }}>
              {desc}
            </Typography>
          </Box>
        ))}
      </Box>

      <Divider sx={{ borderColor: 'var(--border)', mt: 4, mb: 2 }} />
      <Typography sx={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.65rem', color: 'var(--fg-dim)', textAlign: 'center' }}>
        All settings are saved automatically and persist across sessions.
      </Typography>
    </Box>
  );
}
