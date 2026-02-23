import React, { useState, useEffect } from 'react';
import { Box, Drawer, Typography, IconButton, CircularProgress, Tooltip } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DescriptionIcon from '@mui/icons-material/Description';
import TextSnippetIcon from '@mui/icons-material/TextSnippet';
import { getLibrary, deleteDocument } from '../api/library';

export default function FilesPopout({ open, onClose }) {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState({ documents: [] });

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

    const handleDelete = async (docId) => {
        try {
            await deleteDocument(docId);
            setData((prev) => ({
                ...prev,
                documents: prev.documents.filter((d) => d.id !== docId),
            }));
        } catch (e) {
            console.error("Failed to delete", e);
        }
    };

    const renderFileIcon = (fileType) => {
        if (fileType === 'pdf') return <DescriptionIcon sx={{ fontSize: 24, color: 'var(--accent)' }} />;
        return <TextSnippetIcon sx={{ fontSize: 24, color: 'var(--fg-dim)' }} />;
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
                <Typography sx={{ fontSize: '1.2rem', fontWeight: 600 }}>Your Documents</Typography>
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
                    {data.documents?.length === 0 ? (
                        <Typography sx={{ fontSize: '0.8rem', color: 'var(--fg-dim)' }}>No documents found.</Typography>
                    ) : (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, pb: 2 }}>
                            {data.documents?.map((doc) => (
                                <Box
                                    key={doc.id}
                                    sx={{
                                        minWidth: 140, maxWidth: 140,
                                        bgcolor: 'var(--bg-secondary)',
                                        border: '1px solid var(--border)',
                                        borderRadius: 2, p: 2,
                                        position: 'relative',
                                        display: 'flex', flexDirection: 'column', gap: 1,
                                    }}
                                >
                                    <IconButton
                                        size="small"
                                        onClick={() => handleDelete(doc.id)}
                                        sx={{
                                            position: 'absolute', top: 4, right: 4,
                                            color: 'var(--error)', bgcolor: 'var(--bg-primary)',
                                            '&:hover': { bgcolor: 'var(--error)', color: '#fff' }
                                        }}
                                    >
                                        <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                                    </IconButton>

                                    {renderFileIcon(doc.file_type)}

                                    <Tooltip title={doc.file_name}>
                                        <Typography noWrap sx={{ fontSize: '0.75rem', fontWeight: 500, mt: 1 }}>{doc.file_name}</Typography>
                                    </Tooltip>
                                    <Typography noWrap sx={{ fontSize: '0.65rem', color: 'var(--fg-dim)' }}>
                                        {doc.session_title || 'Untitled Session'}
                                    </Typography>
                                </Box>
                            ))}
                        </Box>
                    )}
                </Box>
            )}
        </Drawer>
    );
}
