import React, { useRef, useState, useEffect } from 'react';
import { Box, TextField, IconButton, Typography, Menu, MenuItem, Tooltip } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import StopIcon from '@mui/icons-material/Stop';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import { useChatContext } from '../contexts/ChatContext';
import { useModelContext } from '../contexts/ModelContext';
import { useFile } from '../contexts/FileContext';

import { MODELS } from './ModelSelector';

export default function GlobalCommandBar({ sidebarOffset = 0 }) {
    const inputRef = useRef(null);
    const fileInputRef = useRef(null);
    const { addMessage, isLoading, stopGeneration } = useChatContext();
    const { selectedModel, setSelectedModel } = useModelContext();
    const { handleFileSelect, fileEntries, removeFile } = useFile();

    const [input, setInput] = useState('');
    const [modelMenuAnchor, setModelMenuAnchor] = useState(null);

    const activeModel = MODELS.find(m => m.id === selectedModel) || MODELS[0];

    // Listen for suggestion card fills
    useEffect(() => {
        const handler = (e) => {
            setInput(typeof e.detail === 'string' ? e.detail : (e.detail?.text || ''));
            setTimeout(() => inputRef.current?.focus(), 50);
        };
        window.addEventListener('fg:set-input', handler);
        return () => window.removeEventListener('fg:set-input', handler);
    }, []);

    const handleSubmit = async (e) => {
        e?.preventDefault();
        if (!input.trim() || isLoading) return;
        let userMsg = input.trim();
        if (userMsg.startsWith('//')) {
            userMsg = userMsg.replace('//', '').trim();
        }
        setInput('');
        await addMessage(userMsg);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    };

    return (
        <>
            {/* Hidden multi-file input */}
            <input
                ref={fileInputRef}
                type="file"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => e.target.files.length > 0 && handleFileSelect(Array.from(e.target.files))}
            />

            <Box
                component="form"
                onSubmit={handleSubmit}
                sx={{
                    position: 'fixed',
                    bottom: 20,
                    left: `calc(50% + ${sidebarOffset / 2}px)`,
                    transform: 'translateX(-50%)',
                    width: { xs: '96%', sm: `calc(90% - ${sidebarOffset}px)`, md: `calc(80% - ${sidebarOffset}px)` },
                    maxWidth: 740,
                    zIndex: 1100,
                    borderRadius: '20px',
                    background: 'rgba(255,255,255,0.92)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    border: '1px solid var(--border)',
                    boxShadow: 'var(--shadow)',
                    transition: 'all 0.22s ease',
                    perspective: '800px',
                    '&:focus-within': {
                        border: '1px solid var(--border-focus)',
                        boxShadow: 'var(--accent-glow)',
                        transform: 'translateX(-50%) translateY(-2px)',
                    },
                }}
            >
                {/* ── File attachment chips (shown when files are loaded) ── */}
                {fileEntries && fileEntries.length > 0 && (
                    <Box sx={{ px: 2, pt: 1.25, pb: 0, display: 'flex', flexWrap: 'wrap', gap: 0.75, alignItems: 'center' }}>
                        {fileEntries.slice(0, 2).map((fe, i) => (
                            <Box
                                key={i}
                                sx={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 0.75,
                                    px: 1.25,
                                    py: 0.5,
                                    bgcolor: 'var(--bg-secondary)',
                                    border: '1px solid var(--border)',
                                    borderRadius: '10px',
                                    maxWidth: 220,
                                }}
                            >
                                <Box sx={{ fontSize: '0.75rem', lineHeight: 1, flexShrink: 0 }}>
                                    {fe.fileType?.includes('pdf') || fe.fileName?.endsWith('.pdf')
                                        ? '📄'
                                        : fe.fileType?.startsWith('image/')
                                            ? '🖼️'
                                            : fe.fileType?.startsWith('audio/')
                                                ? '🎵'
                                                : '📄'}
                                </Box>
                                <Typography noWrap sx={{
                                    fontSize: '0.72rem',
                                    fontFamily: 'var(--font-family)',
                                    color: 'var(--fg-secondary)',
                                    flex: 1,
                                    minWidth: 0,
                                }}>
                                    {fe.fileName}
                                </Typography>
                            </Box>
                        ))}
                        {fileEntries.length > 2 && (
                            <Typography sx={{ fontSize: '0.72rem', color: 'var(--fg-dim)', fontFamily: 'var(--font-family)' }}>
                                +{fileEntries.length - 2} more
                            </Typography>
                        )}
                        <Box
                            onClick={removeFile}
                            sx={{
                                fontSize: '0.85rem',
                                lineHeight: 1,
                                color: 'var(--fg-dim)',
                                cursor: 'pointer',
                                flexShrink: 0,
                                '&:hover': { color: 'var(--fg-primary)' },
                            }}
                        >
                            ×
                        </Box>
                    </Box>
                )}

                {/* ── Top row: input + send button ── */}
                <Box sx={{ display: 'flex', alignItems: 'flex-end', px: 2, pt: 1.5, pb: 1, gap: 1 }}>
                    <TextField
                        inputRef={inputRef}
                        fullWidth
                        multiline
                        maxRows={5}
                        placeholder="Ask me anything..."
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        variant="standard"
                        InputProps={{
                            disableUnderline: true,
                            sx: {
                                fontFamily: 'var(--font-family)',
                                color: 'var(--fg-primary)',
                                fontSize: '1rem',
                                lineHeight: 1.5,
                                '& textarea::placeholder': { color: 'var(--fg-dim)', opacity: 1 },
                                '& input::placeholder': { color: 'var(--fg-dim)', opacity: 1 },
                            },
                        }}
                    />

                    {/* Send / Stop button */}
                    {isLoading ? (
                        <IconButton
                            onClick={stopGeneration}
                            sx={{
                                width: 38,
                                height: 38,
                                borderRadius: '50%',
                                flexShrink: 0,
                                bgcolor: '#DC2626',
                                color: '#FFFFFF',
                                '&:hover': {
                                    bgcolor: '#B91C1C',
                                    transform: 'scale(1.06)',
                                },
                            }}
                        >
                            <StopIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                    ) : (
                        <IconButton
                            type="submit"
                            disabled={!input.trim()}
                            sx={{
                                width: 38,
                                height: 38,
                                borderRadius: '50%',
                                flexShrink: 0,
                                bgcolor: input.trim()
                                    ? 'var(--accent)'
                                    : 'var(--accent-dim)',
                                color: input.trim() ? '#FFFFFF' : 'var(--accent)',
                                transition: 'all 0.18s ease',
                                '&:hover': {
                                    bgcolor: 'var(--accent)',
                                    opacity: 0.88,
                                    transform: 'scale(1.06)',
                                },
                                '&.Mui-disabled': {
                                    bgcolor: 'var(--accent-dim)',
                                    color: 'var(--accent)',
                                    opacity: 0.4,
                                },
                            }}
                        >
                            <SendIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                    )}
                </Box>

                {/* ── Divider ── */}
                <Box sx={{ height: '1px', mx: 2, background: 'var(--accent-dim)' }} />

                {/* ── Bottom row: model, deep think, mic, attach ── */}
                <Box sx={{ display: 'flex', alignItems: 'center', px: 1.5, py: 0.75, gap: 0.75, flexWrap: 'wrap' }}>

                    {/* Model selector pill */}
                    <Box
                        onClick={(e) => setModelMenuAnchor(e.currentTarget)}
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.5,
                            border: '1px solid var(--border)',
                            borderRadius: '20px',
                            px: 1.5,
                            py: 0.4,
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                            '&:hover': { background: 'var(--accent-dim)', borderColor: 'var(--border-focus)' },
                        }}
                    >
                        <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--accent)' }}>
                            {activeModel.name}
                        </Typography>
                        <Typography sx={{ fontSize: '0.6rem', color: 'var(--fg-dim)' }}>▾</Typography>
                    </Box>



                    <Box sx={{ flex: 1 }} />

                    {/* Attach file */}
                    <Tooltip title="Attach a file">
                        <Box
                            onClick={() => fileInputRef.current?.click()}
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 0.5,
                                cursor: 'pointer',
                                px: 1,
                                py: 0.4,
                                borderRadius: '20px',
                                transition: 'all 0.15s',
                                '&:hover': { background: 'var(--accent-dim)' },
                            }}
                        >
                            <AttachFileIcon sx={{ fontSize: 14, color: 'var(--fg-dim)' }} />
                            <Typography sx={{ fontSize: '0.72rem', color: 'var(--fg-dim)' }}>Attach file</Typography>
                        </Box>
                    </Tooltip>
                </Box>
            </Box>

            {/* Model menu */}
            <Menu
                anchorEl={modelMenuAnchor}
                open={Boolean(modelMenuAnchor)}
                onClose={() => setModelMenuAnchor(null)}
                anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
                transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                PaperProps={{
                    sx: {
                        background: 'rgba(255,255,255,0.96)',
                        backdropFilter: 'blur(16px)',
                        border: '1px solid var(--border)',
                        borderRadius: '16px',
                        boxShadow: 'var(--shadow)',
                        mt: -1,
                    },
                }}
            >
                <Box sx={{ px: 2, pt: 1.5, pb: 0.5 }}>
                    <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        Select Model
                    </Typography>
                </Box>
                {MODELS.map((m) => (
                    <MenuItem
                        key={m.id}
                        selected={m.id === selectedModel}
                        onClick={() => { setSelectedModel(m.id); setModelMenuAnchor(null); }}
                        sx={{
                            py: 0.75,
                            px: 2,
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: 2,
                            borderRadius: '10px',
                            mx: 0.5,
                            mb: 0.25,
                            '&.Mui-selected': { background: 'var(--accent-dim)' },
                            '&:hover': { background: 'var(--accent-dim)' },
                        }}
                    >
                        <Typography sx={{ fontSize: '0.82rem', fontWeight: m.id === selectedModel ? 600 : 400, color: '#0F172A' }}>
                            {m.name}
                        </Typography>
                        <Box sx={{
                            fontSize: '0.62rem',
                            fontWeight: 700,
                            border: `1px solid ${m.badge === 'XAI' ? '#FFFFFF' :
                                m.badge === 'DEEPSEEK' ? '#4d6bfe' :
                                    '#0668E1'
                                }`,
                            color: m.badge === 'XAI' ? '#000000' :
                                m.badge === 'DEEPSEEK' ? '#4d6bfe' :
                                    '#0668E1',
                            bgcolor: m.badge === 'XAI' ? '#FFFFFF' :
                                m.badge === 'DEEPSEEK' ? '#4d6bfe20' :
                                    '#0668E120',
                            px: 0.75,
                            py: 0.15,
                            borderRadius: 0,
                            fontFamily: 'monospace',
                        }}>
                            {m.badge}
                        </Box>
                    </MenuItem>
                ))}
            </Menu>
        </>
    );
}
