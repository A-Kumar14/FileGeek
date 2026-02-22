import React, { useState } from 'react';
import {
  TextField, Typography, Box, Divider,
  Select, MenuItem, FormControl, InputLabel, Button,
} from '@mui/material';
import { useChatContext } from '../contexts/ChatContext';
import { usePersona } from '../contexts/PersonaContext';
import { useThemeMode } from '../theme/ThemeContext';
import { THEME_NAMES, FONT_NAMES } from '../theme/themes';

function Section({ label, children }) {
  return (
    <Box sx={{ mb: 2.5 }}>
      <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--fg-primary)', mb: 1.25, fontFamily: 'var(--font-family)' }}>
        {label}
      </Typography>
      {children}
    </Box>
  );
}

function SaveBtn({ onClick }) {
  return (
    <Button variant="contained" size="small" onClick={onClick} disableElevation
      sx={{
        bgcolor: 'var(--accent)',
        color: '#FFF', fontFamily: 'var(--font-family)', fontSize: '0.75rem',
        fontWeight: 600, borderRadius: '8px', px: 2, py: 0.65,
        whiteSpace: 'nowrap', textTransform: 'none', flexShrink: 0, minWidth: 64,
        '&:hover': { bgcolor: 'var(--accent)', opacity: 0.88 },
      }}
    >Save</Button>
  );
}

export default function SettingsContent() {
  const { clearAllSessions } = useChatContext();
  const { personaId, selectPersona, personas } = usePersona();
  const { themeName, setTheme, font, setFont } = useThemeMode();
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem('filegeek-gemini-key') || '');
  const [openaiKey, setOpenaiKey] = useState(() => localStorage.getItem('filegeek-api-key') || '');
  const [notionToken, setNotionToken] = useState(() => localStorage.getItem('filegeek-notion-token') || '');
  const [saved, setSaved] = useState(false);

  const flash = () => { setSaved(true); setTimeout(() => setSaved(false), 2000); };

  const handleSaveGemini = () => {
    if (geminiKey.trim()) localStorage.setItem('filegeek-gemini-key', geminiKey.trim());
    else localStorage.removeItem('filegeek-gemini-key');
    flash();
  };
  const handleSaveOpenai = () => {
    if (openaiKey.trim()) localStorage.setItem('filegeek-api-key', openaiKey.trim());
    else localStorage.removeItem('filegeek-api-key');
    flash();
  };
  const handleSaveNotionToken = () => {
    if (notionToken.trim()) localStorage.setItem('filegeek-notion-token', notionToken.trim());
    else localStorage.removeItem('filegeek-notion-token');
    flash();
  };
  const handleClearHistory = () => { clearAllSessions(); flash(); };

  const selectSx = { fontFamily: 'var(--font-family)', fontSize: '0.82rem', borderRadius: '10px' };
  const labelSx = { fontFamily: 'var(--font-family)', fontSize: '0.82rem' };
  const inputSx = { '& .MuiOutlinedInput-root': { borderRadius: '10px', fontFamily: 'var(--font-family)', fontSize: '0.82rem' } };

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

      <Section label="AI Persona">
        <FormControl fullWidth size="small">
          <InputLabel sx={labelSx}>Persona</InputLabel>
          <Select value={personaId} onChange={(e) => selectPersona(e.target.value)} label="Persona" sx={selectSx}>
            {personas.map((p) => (
              <MenuItem key={p.id} value={p.id} sx={{ fontFamily: 'var(--font-family)', fontSize: '0.82rem' }}>{p.label}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Section>

      <Divider sx={{ borderColor: 'var(--border)', mb: 2.5 }} />

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

      <Section label="Gemini API Key" description="Required for Gemini 2.0 Flash and 2.5 Pro models.">
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField fullWidth size="small" type="password" placeholder="AIza..." value={geminiKey}
            onChange={(e) => setGeminiKey(e.target.value)} sx={inputSx} />
          <SaveBtn onClick={handleSaveGemini} />
        </Box>
      </Section>

      <Divider sx={{ borderColor: 'var(--border)', mb: 2.5 }} />

      <Section label="OpenAI API Key" description="Required for GPT-4o Mini and GPT-4o models.">
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField fullWidth size="small" type="password" placeholder="sk-..." value={openaiKey}
            onChange={(e) => setOpenaiKey(e.target.value)} sx={inputSx} />
          <SaveBtn onClick={handleSaveOpenai} />
        </Box>
      </Section>

      <Divider sx={{ borderColor: 'var(--border)', mb: 2.5 }} />

      <Section label="Notion Integration" description="Token to export flashcards and notes to Notion.">
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField fullWidth size="small" type="password" placeholder="ntn_..." value={notionToken}
            onChange={(e) => setNotionToken(e.target.value)} sx={inputSx} />
          <SaveBtn onClick={handleSaveNotionToken} />
        </Box>
      </Section>

      <Divider sx={{ borderColor: 'var(--border)', mb: 2.5 }} />

      <Section label="Data">
        <Button variant="outlined" size="small" onClick={handleClearHistory}
          sx={{
            borderColor: 'var(--error)', color: 'var(--error)',
            fontFamily: 'var(--font-family)', fontSize: '0.78rem', fontWeight: 600,
            borderRadius: '10px', textTransform: 'none',
            '&:hover': { bgcolor: 'rgba(220,38,38,0.06)', borderColor: 'var(--error)' },
          }}
        >Clear all history</Button>
      </Section>
    </Box>
  );
}
