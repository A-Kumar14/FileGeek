import React, { useState, useEffect } from 'react';
import { Box, Typography } from '@mui/material';
import { BarChart2, Brain, Layers, Mic } from 'lucide-react';
import DropZone from './DropZone';
import { useAuth } from '../contexts/AuthContext';

const SUGGESTION_CARDS = [
    {
        icon: <BarChart2 size={24} color="var(--accent)" />,
        title: 'Analyze Document',
        desc: 'Deep-dive analysis and key insights from your file.',
        prompt: 'Analyze this document and give me the key insights.',
    },
    {
        icon: <Brain size={24} color="var(--accent)" />,
        title: 'Quiz Me',
        desc: 'Generate an interactive quiz to test your knowledge.',
        prompt: 'Generate a quiz from this document.',
    },
    {
        icon: <Layers size={24} color="var(--accent)" />,
        title: 'Flashcards',
        desc: 'Create a spaced-repetition flashcard deck.',
        prompt: 'Generate flashcards from this document.',
    },
    {
        icon: <Mic size={24} color="var(--accent)" />,
        title: 'Podcast Script',
        desc: 'Turn the document into an engaging podcast script.',
        prompt: 'Generate a podcast script summarizing this document.',
    },
];

function fillInput(text) {
    window.dispatchEvent(new CustomEvent('fg:set-input', { detail: text }));
}

export default function DiscoveryDashboard() {
    const { user } = useAuth();
    const firstName = user?.name?.split(' ')[0] || user?.email?.split('@')[0] || 'there';

    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

    useEffect(() => {
        const handleMouseMove = (e) => {
            const x = (e.clientX / window.innerWidth - 0.5) * 40; // max shift 20px
            const y = (e.clientY / window.innerHeight - 0.5) * 40;
            setMousePos({ x, y });
        };
        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, []);

    return (
        <Box
            sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                height: '100%',
                overflowY: 'auto',
                bgcolor: 'var(--bg-primary)',
                px: 3,
                pt: 6,
                pb: '120px',
                gap: 3,
            }}
        >
            {/* ── Animated orb ── */}
            <Box
                sx={{
                    width: 80,
                    height: 80,
                    borderRadius: '50%',
                    bgcolor: 'var(--accent)',
                    background: 'radial-gradient(circle at 38% 38%, rgba(251,191,36,0.55) 0%, rgba(249,115,22,0.28) 55%, rgba(249,115,22,0.04) 100%)',
                    boxShadow: '0 0 48px rgba(249,115,22,0.22), inset 0 0 24px rgba(255,255,255,0.25)',
                    animation: 'orbPulse 3s ease-in-out infinite',
                    flexShrink: 0,
                    transform: `translate(${mousePos.x}px, ${mousePos.y}px)`,
                    transition: 'transform 0.1s ease-out',
                }}
            />

            {/* ── Greeting ── */}
            <Box sx={{ textAlign: 'center' }}>
                <Typography
                    variant="h4"
                    sx={{
                        fontWeight: 700,
                        fontSize: { xs: '1.6rem', sm: '2rem' },
                        color: 'var(--accent)',
                        mb: 0.5,
                    }}
                >
                    Hello, {firstName.charAt(0).toUpperCase() + firstName.slice(1)}
                </Typography>
                <Typography
                    sx={{
                        fontWeight: 500,
                        fontSize: '1.1rem',
                        color: 'var(--fg-secondary)',
                    }}
                >
                    How can I assist you today?
                </Typography>
            </Box>

            {/* ── Drop zone ── */}
            <Box
                sx={{
                    width: '100%',
                    maxWidth: 560,
                    background: 'rgba(255,255,255,0.85)',
                    backdropFilter: 'blur(12px)',
                    border: '1px solid rgba(124,58,237,0.14)',
                    borderRadius: '20px',
                    boxShadow: '0 2px 12px rgba(124,58,237,0.06)',
                    overflow: 'hidden',
                    p: 0.5,
                }}
            >
                <DropZone />
            </Box>

            {/* ── Suggestion cards ── */}
            <Box
                sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4,1fr)' },
                    gap: 1.5,
                    width: '100%',
                    maxWidth: 640,
                }}
            >
                {SUGGESTION_CARDS.map((card) => (
                    <Box
                        key={card.title}
                        onClick={() => fillInput(card.prompt)}
                        sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 0.75,
                            p: 1.75,
                            background: 'rgba(255,255,255,0.82)',
                            backdropFilter: 'blur(8px)',
                            border: '1px solid rgba(124,58,237,0.10)',
                            borderRadius: '16px',
                            cursor: 'pointer',
                            transition: 'all 0.18s ease',
                            '&:hover': {
                                background: 'rgba(255,255,255,0.96)',
                                borderColor: 'rgba(124,58,237,0.30)',
                                boxShadow: '0 4px 16px rgba(124,58,237,0.10)',
                                transform: 'translateY(-2px)',
                            },
                        }}
                    >
                        <Box sx={{ mb: 0.5 }}>{card.icon}</Box>
                        <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--fg-primary)' }}>
                            {card.title}
                        </Typography>
                        <Typography sx={{ fontSize: '0.72rem', color: 'var(--fg-dim)', lineHeight: 1.4 }}>
                            {card.desc}
                        </Typography>
                    </Box>
                ))}
            </Box>

            {/* ── Keyframes ── */}
            <style>{`
                @keyframes orbPulse {
                    0%, 100% { transform: scale(1); opacity: 0.85; }
                    50%       { transform: scale(1.07); opacity: 1; }
                }
            `}</style>
        </Box>
    );
}
