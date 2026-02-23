import React, { useState, useEffect } from 'react';
import { Box, Typography } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import SuggestedPrompts from './SuggestedPrompts';
import { useFile } from '../contexts/FileContext';

export default function DiscoveryDashboard() {
    const { user } = useAuth();
    const firstName = user?.name?.split(' ')[0] || user?.email?.split('@')[0] || 'there';
    const { file } = useFile();

    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        const handleMouseMove = (e) => {
            const x = (e.clientX / window.innerWidth - 0.5) * 40;
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
                justifyContent: 'center',
                height: '100%',
                bgcolor: 'var(--bg-primary)',
                px: 3,
                pb: 8,
                gap: 2,
            }}
        >
            {/* ── Animated orb ── */}
            <Box
                sx={{
                    width: 88,
                    height: 88,
                    borderRadius: '50%',
                    bgcolor: 'var(--accent)',
                    boxShadow: '0 0 56px rgba(249,115,22,0.22), inset 0 0 28px rgba(255,255,255,0.28)',
                    animation: 'orbPulse 3.5s ease-in-out infinite',
                    flexShrink: 0,
                    opacity: mounted ? 1 : 0,
                    transform: `translate(${mousePos.x * 0.3}px, ${mousePos.y * 0.3}px) scale(${mounted ? 1 : 0.5})`,
                    transition: 'transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.6s ease-out',
                }}
            />

            {/* ── Greeting ── */}
            <Typography
                sx={{
                    fontFamily: 'var(--font-family)',
                    fontWeight: 600,
                    fontSize: '1.75rem',
                    letterSpacing: '-0.02em',
                    color: 'var(--accent)',
                    lineHeight: 1.2,
                    mb: -0.5,
                }}
            >
                Hello, {firstName.charAt(0).toUpperCase() + firstName.slice(1)}
            </Typography>

            <Typography
                sx={{
                    fontFamily: 'var(--font-family)',
                    fontWeight: 700,
                    fontSize: '1.5rem',
                    color: 'var(--fg-primary)',
                    letterSpacing: '-0.02em',
                    textAlign: 'center',
                }}
            >
                How can I assist you today?
            </Typography>

            {/* ── Suggestion cards ── */}
            <SuggestedPrompts
                onSelect={(prompt) => {
                    window.dispatchEvent(new CustomEvent('fg:set-input', { detail: { text: prompt } }));
                }}
                hasFile={!!file}
            />

            {/* ── Keyframes ── */}
            <style>{`
                @keyframes orbPulse {
                    0%, 100% { opacity: 0.85; box-shadow: 0 0 56px rgba(249,115,22,0.22), inset 0 0 28px rgba(255,255,255,0.28); }
                    50%       { opacity: 1;    box-shadow: 0 0 72px rgba(249,115,22,0.38), inset 0 0 36px rgba(255,255,255,0.36); }
                }
            `}</style>
        </Box>
    );
}
