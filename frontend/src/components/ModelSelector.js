import React from 'react';
import { Box, Select, MenuItem, FormControl, Typography } from '@mui/material';
import { useModelContext } from '../contexts/ModelContext';

export const MODELS = [
  {
    id: 'grok-3',
    name: 'Grok 3',
    provider: 'xai',
    description: 'xAI\'s bleeding edge model',
    badge: 'XAI',
  },
  {
    id: 'grok-3-mini',
    name: 'Grok 3 Mini',
    provider: 'xai',
    description: 'Fast, efficient reasoning',
    badge: 'XAI',
  },
  {
    id: 'DeepSeek-R1',
    name: 'DeepSeek R1',
    provider: 'deepseek',
    description: 'Open weight reasoning model',
    badge: 'DEEPSEEK',
  },
];

const badgeColor = {
  XAI: { bg: 'rgba(0,0,0,0.06)', border: 'var(--border)', color: 'var(--fg-secondary)' },
  DEEPSEEK: { bg: 'rgba(77,107,254,0.08)', border: 'rgba(77,107,254,0.4)', color: '#4d6bfe' },
};

export default function ModelSelector() {
  const { selectedModel, setSelectedModel } = useModelContext();
  const current = MODELS.find(m => m.id === selectedModel) || MODELS[0];

  return (
    <FormControl size="small" sx={{ minWidth: 130 }}>
      <Select
        value={selectedModel}
        onChange={(e) => setSelectedModel(e.target.value)}
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
          const bc = badgeColor[model.badge] || badgeColor.XAI;
          return (
            <MenuItem
              key={model.id}
              value={model.id}
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
