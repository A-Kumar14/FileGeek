import React, { useState } from 'react';
import { Box, Typography, Collapse, IconButton } from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CircularProgress from '@mui/material/CircularProgress';

export default function ThinkingBlock({ steps, isGenerating }) {
    const [expanded, setExpanded] = useState(false);

    if (!steps || steps.length === 0) return null;

    return (
        <Box
            sx={{
                alignSelf: 'flex-start',
                maxWidth: '85%',
                mb: 1,
                borderLeft: '2px solid var(--accent)',
                bgcolor: 'var(--accent-dim)',
                borderRadius: '0 8px 8px 0',
                overflow: 'hidden',
            }}
        >
            <Box
                onClick={() => setExpanded(!expanded)}
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    px: 1.5,
                    py: 0.75,
                    cursor: 'pointer',
                    '&:hover': { bgcolor: 'rgba(249,115,22,0.08)' },
                }}
            >
                {isGenerating ? (
                    <CircularProgress size={12} sx={{ color: 'var(--accent)' }} />
                ) : (
                    <CheckCircleOutlineIcon sx={{ fontSize: 14, color: 'var(--accent)' }} />
                )}
                <Typography
                    sx={{
                        fontFamily: 'var(--font-family)',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        color: 'var(--accent)',
                        flex: 1,
                    }}
                >
                    {isGenerating ? `Reasoning... (${steps.length} steps)` : `Reasoning complete (${steps.length} steps)`}
                </Typography>
                <IconButton size="small" disableRipple sx={{ p: 0, color: 'var(--accent)' }}>
                    {expanded ? <KeyboardArrowDownIcon fontSize="small" /> : <KeyboardArrowRightIcon fontSize="small" />}
                </IconButton>
            </Box>

            <Collapse in={expanded}>
                <Box sx={{ px: 1.5, pb: 1 }}>
                    {steps.map((step, idx) => (
                        <Box key={idx} sx={{ display: 'flex', gap: 1, mb: 0.5, alignItems: 'flex-start' }}>
                            <Typography sx={{ fontFamily: 'var(--font-family)', fontSize: '0.62rem', color: 'var(--fg-dim)', mt: 0.25, minWidth: 20 }}>
                                {String(idx + 1).padStart(2, '0')}
                            </Typography>
                            <Typography sx={{ fontFamily: 'var(--font-family)', fontSize: '0.72rem', color: 'var(--fg-secondary)' }}>
                                {step.type === 'tool_call' ? `Running: ${step.name}` : step.content}
                            </Typography>
                        </Box>
                    ))}
                </Box>
            </Collapse>
        </Box>
    );
}
