import React, { useState } from 'react';
import {
  TextField, Typography, Box, Divider,
  Select, MenuItem, FormControl, InputLabel,
  Button, Switch, FormControlLabel,
} from '@mui/material';
import { useChatContext } from '../contexts/ChatContext';
import { useThemeMode } from '../theme/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { THEME_NAMES, FONT_NAMES } from '../theme/themes';
import { MODELS } from '../components/ModelSelector';
import { useModelContext } from '../contexts/ModelContext';

function Section({ label, children }) {
  return (
    <Box sx={{ mb: 2.5 }}>
      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--fg-dim)', mb: 1.25, fontFamily: 'var(--font-family)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </Typography>
      {children}
    </Box>
  );
}

function SaveBtn({ onClick, label = 'Save' }) {
  return (
    <Button variant="contained" size="small" onClick={onClick} disableElevation
      sx={{
        bgcolor: 'var(--accent)',
        color: '#FFF', fontFamily: 'var(--font-family)', fontSize: '0.75rem',
        fontWeight: 600, borderRadius: '8px', px: 2, py: 0.65,
        whiteSpace: 'nowrap', textTransform: 'none', flexShrink: 0, minWidth: 64,
        '&:hover': { bgcolor: 'var(--accent)', opacity: 0.88 },
      }}
    >{label}</Button>
  );
}

const selectSx = { fontFamily: 'var(--font-family)', fontSize: '0.82rem', borderRadius: '10px' };
const labelSx = { fontFamily: 'var(--font-family)', fontSize: '0.82rem' };
const inputSx = { '& .MuiOutlinedInput-root': { borderRadius: '10px', fontFamily: 'var(--font-family)', fontSize: '0.82rem' } };

export default function SettingsContent() {
  const { clearAllSessions, chatSessions, messages } = useChatContext();
  const { themeName, setTheme, font, setFont } = useThemeMode();
  const { logout, user } = useAuth();
  const { selectedModel, setSelectedModel } = useModelContext();

  const [poeKey, setPoeKey] = useState(() => localStorage.getItem('filegeek-poe-key') || '');
  const [responseStyle, setResponseStyle] = useState(() => localStorage.getItem('filegeek-response-style') || 'balanced');
  const [autoTitle, setAutoTitle] = useState(() => localStorage.getItem('filegeek-auto-title') !== 'false');
  const [saved, setSaved] = useState(false);

  const flash = () => { setSaved(true); setTimeout(() => setSaved(false), 2000); };

  const handleSavePoeKey = () => {
    if (poeKey.trim()) localStorage.setItem('filegeek-poe-key', poeKey.trim());
    else localStorage.removeItem('filegeek-poe-key');
    flash();
  };

  const handleSaveResponseStyle = (value) => {
    setResponseStyle(value);
    localStorage.setItem('filegeek-response-style', value);
    flash();
  };

  const handleAutoTitleToggle = (e) => {
    const val = e.target.checked;
    setAutoTitle(val);
    localStorage.setItem('filegeek-auto-title', String(val));
  };

  const handleExportData = () => {
    const exportData = {
      exportedAt: new Date().toISOString(),
      sessions: chatSessions,
      messages,
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `filegeek-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClearHistory = () => { clearAllSessions(); flash(); };

  const handleSignOut = async () => { await logout(); };

  return (
    <Box sx={{ fontFamily: 'var(--font-family)' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5 }}>
        <Typography sx={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--fg-primary)', fontFamily: 'var(--font-family)' }}>
          Settings
        </Typography>
        {saved && (
          <Box sx={{ bgcolor: 'rgba(5,150,105,0.1)', border: '1px solid rgba(5,150,105,0.3)', px: 1.5, py: 0.4, borderRadius: '8px' }}>
            <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--success)', fontFamily: 'var(--font-family)' }}>Saved</Typography>
          </Box>
        )}
      </Box>

      <Divider sx={{ borderColor: 'var(--border)', mb: 2.5 }} />

      {/* Appearance */}
      <Section label="Appearance">
        <Box sx={{ display: 'flex', gap: 2 }}>
          <FormControl fullWidth size="small">
            <InputLabel sx={labelSx}>Theme</InputLabel>
            <Select value={themeName} onChange={(e) => setTheme(e.target.value)} label="Theme" sx={selectSx}>
              {THEME_NAMES.map((t) => (
                <MenuItem key={t} value={t} sx={{ fontFamily: 'var(--font-family)', fontSize: '0.82rem' }}>
                  {t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth size="small">
            <InputLabel sx={labelSx}>Font</InputLabel>
            <Select value={font} onChange={(e) => setFont(e.target.value)} label="Font" sx={selectSx}>
              {FONT_NAMES.map((f) => (
                <MenuItem key={f} value={f} sx={{ fontFamily: 'var(--font-family)', fontSize: '0.82rem' }}>
                  {f.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
      </Section>

      <Divider sx={{ borderColor: 'var(--border)', mb: 2.5 }} />

      {/* AI Provider */}
      <Section label="AI Provider">
        <Typography sx={{ fontSize: '0.78rem', color: 'var(--fg-secondary)', fontFamily: 'var(--font-family)', mb: 1.5 }}>
          FileGeek uses Poe to access Grok 3, DeepSeek R1 and other models. Enter your Poe API key below.
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
          <TextField fullWidth size="small" type="password" placeholder="p-•••••••••••••••" value={poeKey}
            onChange={(e) => setPoeKey(e.target.value)} sx={inputSx} />
          <SaveBtn onClick={handleSavePoeKey} />
        </Box>

        <FormControl fullWidth size="small">
          <InputLabel sx={labelSx}>Default model</InputLabel>
          <Select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} label="Default model" sx={selectSx}
            MenuProps={{ PaperProps: { sx: { borderRadius: '12px', border: '1px solid var(--border)' } } }}>
            {MODELS.map((m) => (
              <MenuItem key={m.id} value={m.id} sx={{ fontFamily: 'var(--font-family)', fontSize: '0.82rem' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <span>{m.name}</span>
                  <Box sx={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--fg-dim)', bgcolor: 'var(--bg-tertiary)', px: 0.75, py: 0.15, borderRadius: '4px' }}>
                    {m.badge}
                  </Box>
                </Box>
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Section>

      <Divider sx={{ borderColor: 'var(--border)', mb: 2.5 }} />

      {/* Response Style */}
      <Section label="Response Style">
        <Box sx={{ display: 'flex', gap: 1 }}>
          {['concise', 'balanced', 'detailed'].map((style) => (
            <Box
              key={style}
              onClick={() => handleSaveResponseStyle(style)}
              sx={{
                flex: 1,
                textAlign: 'center',
                py: 0.75,
                borderRadius: '10px',
                border: `1px solid ${responseStyle === style ? 'var(--accent)' : 'var(--border)'}`,
                bgcolor: responseStyle === style ? 'var(--accent-dim)' : 'transparent',
                cursor: 'pointer',
                transition: 'all 0.15s',
                '&:hover': { borderColor: 'var(--accent)', bgcolor: 'var(--accent-dim)' },
              }}
            >
              <Typography sx={{ fontSize: '0.78rem', fontWeight: responseStyle === style ? 700 : 500, color: responseStyle === style ? 'var(--accent)' : 'var(--fg-secondary)', fontFamily: 'var(--font-family)', textTransform: 'capitalize' }}>
                {style}
              </Typography>
            </Box>
          ))}
        </Box>
      </Section>

      <Divider sx={{ borderColor: 'var(--border)', mb: 2.5 }} />

      {/* Preferences */}
      <Section label="Preferences">
        <FormControlLabel
          control={
            <Switch
              checked={autoTitle}
              onChange={handleAutoTitleToggle}
              size="small"
              sx={{
                '& .MuiSwitch-switchBase.Mui-checked': { color: 'var(--accent)' },
                '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: 'var(--accent)' },
              }}
            />
          }
          label={
            <Typography sx={{ fontSize: '0.82rem', fontFamily: 'var(--font-family)', color: 'var(--fg-primary)' }}>
              Auto-title sessions
            </Typography>
          }
        />
      </Section>

      <Divider sx={{ borderColor: 'var(--border)', mb: 2.5 }} />

      {/* Data */}
      <Section label="Data">
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Button variant="outlined" size="small" onClick={handleExportData}
            sx={{
              borderColor: 'var(--border)', color: 'var(--fg-secondary)',
              fontFamily: 'var(--font-family)', fontSize: '0.78rem', fontWeight: 600,
              borderRadius: '10px', textTransform: 'none', alignSelf: 'flex-start',
              '&:hover': { bgcolor: 'var(--bg-secondary)', borderColor: 'var(--fg-dim)' },
            }}
          >Export all data</Button>

          <Button variant="outlined" size="small" onClick={handleClearHistory}
            sx={{
              borderColor: 'var(--error)', color: 'var(--error)',
              fontFamily: 'var(--font-family)', fontSize: '0.78rem', fontWeight: 600,
              borderRadius: '10px', textTransform: 'none', alignSelf: 'flex-start',
              '&:hover': { bgcolor: 'rgba(220,38,38,0.06)', borderColor: 'var(--error)' },
            }}
          >Clear all history</Button>
        </Box>
      </Section>

      <Divider sx={{ borderColor: 'var(--border)', mb: 2.5 }} />

      {/* Account */}
      <Section label="Account">
        {user && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5, p: 1.5, borderRadius: '10px', bgcolor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            <Box>
              <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, fontFamily: 'var(--font-family)', color: 'var(--fg-primary)' }}>
                {user.email || user.name || 'User'}
              </Typography>
              <Typography sx={{ fontSize: '0.72rem', color: 'var(--fg-dim)', fontFamily: 'var(--font-family)' }}>
                Signed in
              </Typography>
            </Box>
            <Button size="small" onClick={handleSignOut}
              sx={{
                color: 'var(--fg-secondary)', fontFamily: 'var(--font-family)', fontSize: '0.75rem', fontWeight: 600,
                borderRadius: '8px', textTransform: 'none', border: '1px solid var(--border)',
                '&:hover': { borderColor: 'var(--fg-dim)', bgcolor: 'var(--bg-tertiary)' },
              }}
            >Sign out</Button>
          </Box>
        )}
      </Section>
    </Box>
  );
}
