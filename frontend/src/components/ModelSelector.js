import React from 'react';
import { Box, Select, MenuItem, FormControl, Typography } from '@mui/material';
import { useModelContext } from '../contexts/ModelContext';

const MODELS = [
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    provider: 'gemini',
    description: 'Fast, free-tier model',
    badge: 'FREE',
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    description: 'Efficient OpenAI model',
    badge: 'FREE',
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    provider: 'gemini',
    description: 'Advanced reasoning',
    badge: 'PRO',
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    description: 'Most capable OpenAI model',
    badge: 'PRO',
  },
];

export default function ModelSelector() {
  const { selectedModel, setSelectedModel } = useModelContext();

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        bgcolor: 'var(--bg-secondary)',
        border: '1px solid #333333',
        p: 1,
      }}
    >
      <Typography
        variant="caption"
        sx={{
          fontFamily: 'monospace',
          color: '#888888',
          fontSize: '0.7rem',
          whiteSpace: 'nowrap',
        }}
      >
        [ MODEL ]
      </Typography>
      <FormControl size="small" fullWidth>
        <Select
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
          sx={{
            fontFamily: 'monospace',
            color: '#E5E5E5',
            fontSize: '0.8rem',
            '& .MuiOutlinedInput-notchedOutline': {
              border: 'none',
            },
            '&:hover .MuiOutlinedInput-notchedOutline': {
              border: 'none',
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              border: 'none',
            },
            bgcolor: 'var(--bg-primary)',
          }}
          MenuProps={{
            PaperProps: {
              sx: {
                bgcolor: 'var(--bg-secondary)',
                border: '1px solid #333333',
                fontFamily: 'monospace',
              },
            },
          }}
        >
          {MODELS.map((model) => (
            <MenuItem
              key={model.id}
              value={model.id}
              sx={{
                fontFamily: 'monospace',
                color: '#E5E5E5',
                fontSize: '0.8rem',
                '&:hover': {
                  bgcolor: '#1A1A1A',
                },
                '&.Mui-selected': {
                  bgcolor: '#1A1A1A',
                },
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                  {model.name}
                </Typography>
              </Box>
              <Box
                sx={{
                  ml: 2,
                  px: 0.75,
                  py: 0.25,
                  bgcolor: model.badge === 'FREE' ? '#00FF0020' : '#FF00FF20',
                  border: `1px solid ${model.badge === 'FREE' ? '#00FF00' : '#FF00FF'}`,
                  borderRadius: 0,
                  fontFamily: 'monospace',
                  fontSize: '0.6rem',
                  color: model.badge === 'FREE' ? '#00FF00' : '#FF00FF',
                }}
              >
                {model.badge}
              </Box>
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    </Box>
  );
}
