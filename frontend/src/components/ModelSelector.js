import React from 'react';
import { Box, Select, MenuItem, FormControl, Typography } from '@mui/material';
import { useModelContext } from '../contexts/ModelContext';

export const MODELS = [
  // ── Auto ──────────────────────────────────────────────────────────────────
  { id: null,                                        name: 'Auto',               provider: 'auto',        description: 'Backend picks best available model',       badge: 'AUTO'     },

  // ── OpenAI ────────────────────────────────────────────────────────────────
  { id: 'openai/gpt-4o',                             name: 'GPT-4o',             provider: 'openrouter',  description: 'OpenAI flagship multimodal model',          badge: 'OPENAI'   },
  { id: 'openai/gpt-4o-mini',                        name: 'GPT-4o Mini',        provider: 'openrouter',  description: 'Fast & cost-efficient',                     badge: 'OPENAI'   },
  { id: 'openai/o3-mini',                            name: 'o3 Mini',            provider: 'openrouter',  description: 'OpenAI reasoning model',                    badge: 'OPENAI'   },

  // ── Anthropic ─────────────────────────────────────────────────────────────
  { id: 'anthropic/claude-sonnet-4.5',               name: 'Claude Sonnet 4.5',  provider: 'openrouter',  description: 'Anthropic\'s latest model',                 badge: 'CLAUDE'   },
  { id: 'anthropic/claude-3.5-sonnet',               name: 'Claude 3.5 Sonnet',  provider: 'openrouter',  description: 'Strong reasoning & coding',                 badge: 'CLAUDE'   },
  { id: 'anthropic/claude-3-haiku',                  name: 'Claude 3 Haiku',     provider: 'openrouter',  description: 'Fast & affordable Claude',                  badge: 'CLAUDE'   },

  // ── Google ────────────────────────────────────────────────────────────────
  { id: 'google/gemini-3-flash-preview',             name: 'Gemini 3 Flash',     provider: 'openrouter',  description: 'Latest fast Google model',                  badge: 'GOOGLE'   },
  { id: 'google/gemini-3.1-pro-preview',             name: 'Gemini 3.1 Pro',     provider: 'openrouter',  description: 'Google advanced reasoning, 1M context',     badge: 'GOOGLE'   },
  { id: 'google/gemini-2.0-flash-exp:free',          name: 'Gemini 2.0 Flash',   provider: 'openrouter',  description: 'Google model — free tier',                  badge: 'FREE'     },

  // ── xAI ───────────────────────────────────────────────────────────────────
  { id: 'x-ai/grok-3',                               name: 'Grok 3',             provider: 'openrouter',  description: 'xAI Grok 3 — strong reasoning',             badge: 'XAI'      },
  { id: 'x-ai/grok-3-mini',                          name: 'Grok 3 Mini',        provider: 'openrouter',  description: 'Faster, lighter Grok',                      badge: 'XAI'      },

  // ── DeepSeek ──────────────────────────────────────────────────────────────
  { id: 'deepseek/deepseek-r1',                      name: 'DeepSeek R1',        provider: 'openrouter',  description: 'Chain-of-thought reasoning (no tools)',     badge: 'DEEPSEEK' },
  { id: 'deepseek/deepseek-chat',                    name: 'DeepSeek V3',        provider: 'openrouter',  description: 'Strong open-weight chat model',             badge: 'DEEPSEEK' },

  // ── Meta ──────────────────────────────────────────────────────────────────
  { id: 'meta-llama/llama-3.3-70b-instruct:free',    name: 'Llama 3.3 70B',      provider: 'openrouter',  description: 'Meta open-source — free tier',              badge: 'FREE'     },

  // ── Mistral ───────────────────────────────────────────────────────────────
  { id: 'mistralai/mistral-small-3.1-24b-instruct:free', name: 'Mistral Small 3.1', provider: 'openrouter', description: 'Fast open-weight — free tier',            badge: 'FREE'     },
];

const badgeColor = {
  AUTO:      { bg: 'rgba(139,92,246,0.08)', border: 'rgba(139,92,246,0.35)', color: 'var(--accent)'  },
  OPENAI:    { bg: 'rgba(16,163,127,0.08)', border: 'rgba(16,163,127,0.35)', color: '#10a37f'        },
  CLAUDE:    { bg: 'rgba(215,147,72,0.08)', border: 'rgba(215,147,72,0.40)', color: '#D79348'        },
  GOOGLE:    { bg: 'rgba(66,133,244,0.08)', border: 'rgba(66,133,244,0.35)', color: '#4285f4'        },
  XAI:       { bg: 'rgba(120,120,120,0.08)',border: 'rgba(140,140,140,0.40)', color: '#999'          },
  DEEPSEEK:  { bg: 'rgba(0,120,255,0.08)',  border: 'rgba(0,120,255,0.35)',  color: '#0078ff'        },
  FREE:      { bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.35)',  color: '#22c55e'        },
  OR:        { bg: 'rgba(255,110,64,0.08)', border: 'rgba(255,110,64,0.35)', color: '#ff6e40'        },
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
