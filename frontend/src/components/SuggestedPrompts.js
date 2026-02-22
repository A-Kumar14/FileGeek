import React, { useState, useEffect } from 'react';
import { Box, Typography } from '@mui/material';
import { BarChart2, Lightbulb, CheckCircle2, BookOpen, Search, HelpCircle, Sparkles } from 'lucide-react';

const DEFAULT_CARDS = [
  {
    icon: <BarChart2 size={24} color="var(--accent)" />,
    title: 'Synthesize Data',
    subtitle: 'Turn key points into concise summaries',
    text: 'Synthesize the key data and insights from this document',
  },
  {
    icon: <Lightbulb size={24} color="var(--accent)" />,
    title: 'Creative Brainstorm',
    subtitle: 'Generate ideas and new perspectives',
    text: 'Brainstorm creative ideas and insights from this document',
  },
  {
    icon: <CheckCircle2 size={24} color="var(--accent)" />,
    title: 'Check Facts',
    subtitle: 'Verify and compare the key claims',
    text: 'Check and summarize the key facts in this document',
  },
];

const EXTRA_CARDS = [
  { icon: <BookOpen size={24} color="var(--accent)" />, title: 'Study Guide', subtitle: 'Create structured notes to learn faster', text: 'Create a study guide for this document' },
  { icon: <Search size={24} color="var(--accent)" />, title: 'Key Definitions', subtitle: 'Find and explain important terms', text: 'Find and explain the key definitions' },
  { icon: <HelpCircle size={24} color="var(--accent)" />, title: 'Raise Questions', subtitle: 'What questions does this content raise?', text: 'What questions does this document raise?' },
];

export default function SuggestedPrompts({ onSelect, onPromptSelected, dynamicPrompts }) {
  const [cards, setCards] = useState(DEFAULT_CARDS);

  useEffect(() => {
    if (dynamicPrompts && dynamicPrompts.length > 0) {
      const mapped = dynamicPrompts.map((p, i) => {
        const text = typeof p === 'string' ? p : p.text || p;
        return {
          icon: DEFAULT_CARDS[i]?.icon || <Sparkles size={24} color="var(--accent)" />,
          title: text.slice(0, 28),
          subtitle: text,
          text,
        };
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
      const replacement = EXTRA_CARDS.find((c) => !showing.has(c.text));
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
          <Box sx={{ mb: 0.5 }}>{card.icon}</Box>
          <Typography sx={{
            fontSize: '0.85rem', fontWeight: 600,
            color: 'var(--fg-primary)',
            fontFamily: 'var(--font-family)',
            lineHeight: 1.3,
          }}>
            {card.title}
          </Typography>
          <Typography sx={{
            fontSize: '0.75rem',
            color: 'var(--fg-dim)',
            fontFamily: 'var(--font-family)',
            lineHeight: 1.4,
          }}>
            {card.subtitle}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}
