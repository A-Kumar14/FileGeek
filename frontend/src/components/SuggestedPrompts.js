import React, { useState, useEffect } from 'react';
import { Box, Typography } from '@mui/material';

const DEFAULT_CARDS = [
  { title: 'Synthesize', text: 'Synthesize the key data and insights from this document' },
  { title: 'Brainstorm', text: 'Brainstorm creative ideas and insights from this document' },
  { title: 'Check facts', text: 'Check and summarize the key facts in this document' },
];

const EXTRA_CARDS = [
  { title: 'Study guide', text: 'Create a study guide for this document' },
  { title: 'Definitions', text: 'Find and explain the key definitions' },
  { title: 'Raise questions', text: 'What questions does this document raise?' },
];

const NO_FILE_CARDS = [
  { title: 'Explain concept', text: 'Explain quantum computing in simple terms' },
  { title: 'Brainstorm ideas', text: 'Brainstorm 5 creative ideas for a tech startup' },
  { title: 'Plan strategy', text: 'Create a step-by-step strategy to learn a new language' },
];

const NO_FILE_EXTRA_CARDS = [
  { title: 'Write draft', text: 'Draft a polite email declining an invitation' },
  { title: 'Research topic', text: 'Give me a brief history of the Roman Empire' },
  { title: 'Solve problem', text: 'Help me solve a logical reasoning puzzle' },
];

export default function SuggestedPrompts({ onSelect, onPromptSelected, dynamicPrompts, hasFile = true }) {
  const [cards, setCards] = useState(hasFile ? DEFAULT_CARDS : NO_FILE_CARDS);

  useEffect(() => {
    setCards(hasFile ? DEFAULT_CARDS : NO_FILE_CARDS);
  }, [hasFile]);

  useEffect(() => {
    if (dynamicPrompts && dynamicPrompts.length > 0) {
      const mapped = dynamicPrompts.map((p) => {
        const text = typeof p === 'string' ? p : p.text || p;
        return { title: text.slice(0, 32), text };
      });
      setCards(mapped.slice(0, 3));
    }
  }, [dynamicPrompts]);

  const handleClick = (card) => {
    if (onSelect) onSelect(card.text);
    if (onPromptSelected) onPromptSelected(card.text);

    setCards((prev) => {
      const remaining = prev.filter((c) => c.text !== card.text);
      const showing = new Set(remaining.map((c) => c.text));
      const pool = hasFile ? EXTRA_CARDS : NO_FILE_EXTRA_CARDS;
      const replacement = pool.find((c) => !showing.has(c.text));
      return replacement ? [...remaining, replacement] : remaining;
    });
  };

  if (cards.length === 0) return null;

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 2,
        width: '100%',
        maxWidth: 620,
        mx: 'auto',
        px: 1,
      }}
    >
      {cards.map((card) => (
        <Box
          key={card.text}
          onClick={() => handleClick(card)}
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 0.75,
            p: 1.5,
            cursor: 'pointer',
            borderRadius: '14px',
            border: '1px solid transparent',
            transition: 'all 0.17s ease',
            '&:hover': {
              border: '1px solid var(--border)',
              bgcolor: 'var(--bg-secondary)',
              boxShadow: 'var(--shadow)',
            },
          }}
        >
          <Typography sx={{
            fontSize: '0.84rem', fontWeight: 500,
            color: 'var(--fg-primary)',
            fontFamily: 'var(--font-family)',
            lineHeight: 1.3,
          }}>
            {card.title}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}
