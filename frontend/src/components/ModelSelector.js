import React from 'react';
import { Box, Select, MenuItem, FormControl, Typography } from '@mui/material';
import { useModelContext } from '../contexts/ModelContext';

export const MODELS = [
  {
    id: null,
    name: 'Auto',
    provider: 'auto',
    description: 'Backend picks best available model',
    badge: 'AUTO',
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    description: 'Most capable OpenAI model',
    badge: 'OPENAI',
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    description: 'Fast & cost-efficient',
    badge: 'OPENAI',
  },
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    provider: 'google',
    description: 'Google\'s fastest multimodal model',
    badge: 'GOOGLE',
  },
  {
    id: 'grok-3',
    name: 'Grok 3',
    provider: 'poe',
    description: 'xAI via Poe (requires Poe credits)',
    badge: 'POE',
  },
  {
    id: 'grok-3-mini',
    name: 'Grok 3 Mini',
    provider: 'poe',
    description: 'Fast xAI model via Poe',
    badge: 'POE',
  },
];

const badgeColor = {
  AUTO:   { bg: 'rgba(139,92,246,0.08)', border: 'rgba(139,92,246,0.35)', color: 'var(--accent)' },
  OPENAI: { bg: 'rgba(16,163,127,0.08)', border: 'rgba(16,163,127,0.35)', color: '#10a37f' },
  GOOGLE: { bg: 'rgba(66,133,244,0.08)', border: 'rgba(66,133,244,0.35)', color: '#4285f4' },
  POE:    { bg: 'rgba(0,0,0,0.06)',       border: 'var(--border)',          color: 'var(--fg-secondary)' },
};

// Sentinel value for MUI Select — <Select value={null}> breaks controlled mode
const NULL_SENTINEL = '__auto__';

export default function ModelSelector() {
  const { selectedModel, setSelectedModel } = useModelContext();

  // Map null → sentinel for MUI, sentinel → null on change
  const selectValue = selectedModel === null ? NULL_SENTINEL : (selectedModel ?? NULL_SENTINEL);
  const current = MODELS.find(m => m.id === selectedModel) || MODELS[0];

  return (
    <FormControl size="small" sx={{ minWidth: 130 }}>
      <Select
        value={selectValue}
        onChange={(e) => {
          const v = e.target.value;
          setSelectedModel(v === NULL_SENTINEL ? null : v);
        }}
        sx={{
          fontFamily: 'var(--font-family)',
          color: 'var(--fg-primary)',
          fontSize: '0.8rem',
          bgcolor: 'transparent',
          borderRadius: '20px',
          '& .MuiOutlinedInput-notchedOutline': { border: '1px solid var(--border)' },
          '&:hover .MuiOutlinedInput-notchedOutline': { border: '1px solid var(--fg-dim)' },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { border: '1px solid var(--accent)' },
          '& .MuiSelect-select': { py: 0.6, px: 1.5 },
        }}
        renderValue={() => (
          <Typography sx={{ fontFamily: 'var(--font-family)', fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent)' }}>
            {current.name}
          </Typography>
        )}
        MenuProps={{
          PaperProps: {
            sx: {
              bgcolor: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              boxShadow: 'var(--shadow)',
              mt: 0.5,
            },
          },
        }}
      >
        {MODELS.map((model) => {
          const bc = badgeColor[model.badge] || badgeColor.AUTO;
          const itemValue = model.id === null ? NULL_SENTINEL : model.id;
          return (
            <MenuItem
              key={itemValue}
              value={itemValue}
              sx={{
                fontFamily: 'var(--font-family)',
                color: 'var(--fg-primary)',
                fontSize: '0.82rem',
                borderRadius: '8px',
                mx: 0.5,
                my: 0.25,
                '&:hover': { bgcolor: 'var(--accent-dim)' },
                '&.Mui-selected': { bgcolor: 'var(--accent-dim)', color: 'var(--accent)' },
                '&.Mui-selected:hover': { bgcolor: 'var(--accent-dim)' },
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                <Typography sx={{ fontFamily: 'var(--font-family)', fontSize: '0.82rem', fontWeight: 600 }}>
                  {model.name}
                </Typography>
                <Typography sx={{ fontFamily: 'var(--font-family)', fontSize: '0.7rem', color: 'var(--fg-dim)' }}>
                  {model.description}
                </Typography>
              </Box>
              <Box
                sx={{
                  px: 0.75,
                  py: 0.2,
                  bgcolor: bc.bg,
                  border: `1px solid ${bc.border}`,
                  borderRadius: '6px',
                  fontFamily: 'var(--font-family)',
                  fontSize: '0.6rem',
                  fontWeight: 700,
                  color: bc.color,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {model.badge}
              </Box>
            </MenuItem>
          );
        })}
      </Select>
    </FormControl>
  );
}
