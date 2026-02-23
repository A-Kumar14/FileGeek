import React, { useState, useEffect } from 'react';
import { Box, Drawer, Typography, IconButton, CircularProgress, Tooltip } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import MemoryIcon from '@mui/icons-material/Memory';
import { getLibrary } from '../api/library';

export default function LibraryPopout({ open, onClose }) {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState({ documents: [], preferences: '' });

    useEffect(() => {
        if (open) {
            fetchLibrary();
        }
    }, [open]);

    const fetchLibrary = async () => {
        setLoading(true);
        try {
            const result = await getLibrary();
            setData(result);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Drawer
            anchor="left"
            open={open}
            onClose={onClose}
            variant="temporary"
            transitionDuration={300}
            PaperProps={{
                sx: {
                    width: { xs: '100%', sm: 400 },
                    bgcolor: 'var(--bg-primary)',
                    color: 'var(--fg-primary)',
                    borderRight: '1px solid var(--border)',
                    p: 3,
                }
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
                <Typography sx={{ fontSize: '1.2rem', fontWeight: 600 }}>Library</Typography>
                <IconButton onClick={onClose} sx={{ color: 'var(--fg-dim)' }}>
                    <CloseIcon />
                </IconButton>
            </Box>

            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}>
                    <CircularProgress size={24} sx={{ color: 'var(--accent)' }} />
                </Box>
            ) : (
                <Box sx={{ flex: 1, overflowY: 'auto' }}>
                    {/* Key Highlights Section */}
                    <Box sx={{ mb: 4, bgcolor: 'var(--bg-secondary)', p: 2, borderRadius: 2, border: '1px solid var(--border)' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                            <MemoryIcon sx={{ color: 'var(--accent)', fontSize: 18 }} />
                            <Typography sx={{ fontSize: '0.85rem', fontWeight: 600 }}>Key Highlights & Memory</Typography>
                        </Box>
                        <Typography sx={{ fontSize: '0.8rem', color: 'var(--fg-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                            {data.preferences || 'No highlights recorded yet.'}
                        </Typography>
                    </Box>
                </Box>
            )}
        </Drawer>
    );
}
