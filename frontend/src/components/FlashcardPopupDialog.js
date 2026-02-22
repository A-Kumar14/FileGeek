import React, { useState, useCallback } from 'react';
import {
    Dialog, DialogContent, Box, Typography, Button, Tooltip,
} from '@mui/material';
import { Download, FileText } from 'lucide-react';

/**
 * FlashcardPopupDialog — modal 3D flip-card study session.
 * Props:
 *   open: boolean
 *   onClose: () => void
 *   cards: Array<{ front, back, difficulty, tags }>
 *   topic: string
 *   messageId: number
 *   sessionId: string
 */
export default function FlashcardPopupDialog({ open, onClose, cards = [], topic, messageId, sessionId }) {
    const [index, setIndex] = useState(0);
    const [flipped, setFlipped] = useState(false);
    const [statuses, setStatuses] = useState([]); // 'known' | 'reviewing' per card

    const reset = useCallback(() => {
        setIndex(0);
        setFlipped(false);
        setStatuses([]);
    }, []);

    const handleClose = () => { reset(); onClose(); };

    if (!open || cards.length === 0) return null;

    const card = cards[index];
    const known = statuses.filter(s => s === 'known').length;
    const reviewing = statuses.filter(s => s === 'reviewing').length;
    const isDone = statuses.length === cards.length;

    const saveAndAdvance = async (status) => {
        const newStatuses = [...statuses, status];
        setStatuses(newStatuses);

        // Persist to SM-2 backend (best-effort)
        const token = localStorage.getItem('filegeek-token');
        if (token && messageId && sessionId) {
            try {
                await fetch(
                    `${process.env.REACT_APP_API_URL || 'http://localhost:5001'}/flashcards/progress`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({
                            session_id: sessionId,
                            message_id: messageId,
                            card_index: index,
                            card_front: card.front,
                            status,
                        }),
                    }
                );
            } catch { /* silent */ }
        }

        if (index + 1 < cards.length) {
            setIndex(i => i + 1);
            setFlipped(false);
        }
    };

    const handleExportAnki = () => {
        const rows = cards.map(c => `"${(c.front || '').replace(/"/g, '""')}","${(c.back || '').replace(/"/g, '""')}"`);
        const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = 'flashcards_anki.csv'; a.click();
        URL.revokeObjectURL(url);
    };

    const handleExportMd = () => {
        const lines = ['# Flashcards\n'];
        cards.forEach((c, i) => {
            lines.push(`## Card ${i + 1}`, `**Front:** ${c.front || ''}`, `**Back:** ${c.back || ''}`);
            if (c.tags?.length) lines.push(`**Tags:** ${c.tags.map(t => `[[${t}]]`).join(', ')}`);
            lines.push('');
        });
        const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = 'flashcards_obsidian.md'; a.click();
        URL.revokeObjectURL(url);
    };

    const diffColor = { easy: '#00FF00', medium: '#FFAA00', hard: '#FF4444' }[card?.difficulty] || '#888';

    return (
        <Dialog
            open={open}
            onClose={handleClose}
            fullWidth
            maxWidth="sm"
            PaperProps={{
                sx: {
                    bgcolor: '#000000', border: '1px solid #333', borderRadius: 0,
                    color: '#E5E5E5', fontFamily: 'monospace', overflow: 'visible',
                },
            }}
        >
            <DialogContent sx={{ p: 0 }}>
                {/* Header */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.5, borderBottom: '1px solid #333' }}>
                    <Box>
                        <Typography sx={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.85rem' }}>
                            {isDone ? 'SESSION COMPLETE' : `FLASHCARDS [ ${index + 1}/${cards.length} ]`}
                        </Typography>
                        {topic && (
                            <Typography sx={{ fontFamily: 'monospace', fontSize: '0.6rem', color: '#555' }}>
                                topic: {topic}
                            </Typography>
                        )}
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Tooltip title="Export Anki CSV">
                            <Box onClick={handleExportAnki} sx={{ cursor: 'pointer', color: '#555', '&:hover': { color: '#E5E5E5' } }}>
                                <Download size={14} />
                            </Box>
                        </Tooltip>
                        <Tooltip title="Export Obsidian MD">
                            <Box onClick={handleExportMd} sx={{ cursor: 'pointer', color: '#555', '&:hover': { color: '#E5E5E5' } }}>
                                <FileText size={14} />
                            </Box>
                        </Tooltip>
                        <Box onClick={handleClose} sx={{ cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.7rem', color: '#888', fontWeight: 700, '&:hover': { color: '#E5E5E5' } }}>
                            [X]
                        </Box>
                    </Box>
                </Box>

                {isDone ? (
                    /* ── Summary ── */
                    <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                        <Box sx={{ border: `2px solid ${known === cards.length ? '#00FF00' : '#FFAA00'}`, p: 3, width: '100%', textAlign: 'center', bgcolor: '#0A0A0A' }}>
                            <Typography sx={{ fontFamily: 'monospace', fontSize: '2rem', fontWeight: 700, color: '#00FF00' }}>{known}/{cards.length}</Typography>
                            <Typography sx={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#E5E5E5', mt: 0.5 }}>cards mastered</Typography>
                            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 3, mt: 1.5 }}>
                                <Typography sx={{ fontFamily: 'monospace', fontSize: '0.7rem', color: '#00FF00' }}>Known: {known}</Typography>
                                <Typography sx={{ fontFamily: 'monospace', fontSize: '0.7rem', color: '#FFAA00' }}>Reviewing: {reviewing}</Typography>
                            </Box>
                        </Box>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                            <Button onClick={reset} sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: '#00FF00', border: '1px solid #00FF00', px: 2, borderRadius: 0, '&:hover': { bgcolor: '#001A00' } }}>
                                [RETRY]
                            </Button>
                            <Button onClick={handleClose} sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: '#888', border: '1px solid #333', px: 2, borderRadius: 0, '&:hover': { color: '#E5E5E5', borderColor: '#666' } }}>
                                [CLOSE]
                            </Button>
                        </Box>
                    </Box>
                ) : (
                    /* ── Card ── */
                    <Box sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {/* Progress strip */}
                        <Box sx={{ height: 3, bgcolor: '#1A1A1A', display: 'flex', overflow: 'hidden' }}>
                            <Box sx={{ width: `${(statuses.filter(s => s === 'known').length / cards.length) * 100}%`, bgcolor: '#00FF00', transition: 'width 0.3s' }} />
                            <Box sx={{ width: `${(statuses.filter(s => s === 'reviewing').length / cards.length) * 100}%`, bgcolor: '#FFAA00', transition: 'width 0.3s' }} />
                        </Box>

                        {/* 3D Flip Card */}
                        <Box sx={{ perspective: '1000px', minHeight: 200 }} onClick={() => setFlipped(f => !f)}>
                            <Box sx={{
                                position: 'relative', width: '100%', minHeight: 200,
                                transformStyle: 'preserve-3d', transition: 'transform 0.55s cubic-bezier(0.4,0,0.2,1)',
                                transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                                cursor: 'pointer',
                            }}>
                                {/* Front */}
                                <Box sx={{
                                    position: 'absolute', inset: 0, minHeight: 200,
                                    backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden',
                                    border: '1px solid #333', bgcolor: '#0D0D0D', p: 3,
                                    display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
                                }}>
                                    <Typography sx={{ fontFamily: 'monospace', fontSize: '0.55rem', color: '#444', mb: 1.5, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                        click to reveal answer
                                    </Typography>
                                    <Typography sx={{ fontFamily: 'monospace', fontSize: '1rem', fontWeight: 700, color: '#E5E5E5', textAlign: 'center', wordBreak: 'break-word' }}>
                                        {card.front}
                                    </Typography>
                                    {card.difficulty && (
                                        <Box sx={{ mt: 1.5, border: `1px solid ${diffColor}`, px: 1, py: 0.2, fontFamily: 'monospace', fontSize: '0.55rem', color: diffColor, textTransform: 'uppercase' }}>
                                            {card.difficulty}
                                        </Box>
                                    )}
                                </Box>

                                {/* Back */}
                                <Box sx={{
                                    position: 'absolute', inset: 0, minHeight: 200,
                                    backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden',
                                    transform: 'rotateY(180deg)',
                                    border: '1px solid #00FF00', bgcolor: '#001A00', p: 3,
                                    display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
                                }}>
                                    <Typography sx={{ fontFamily: 'monospace', fontSize: '0.55rem', color: '#555', mb: 1.5, textTransform: 'uppercase' }}>answer</Typography>
                                    <Typography sx={{ fontFamily: 'monospace', fontSize: '0.9rem', color: '#E5E5E5', textAlign: 'center', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                                        {card.back}
                                    </Typography>
                                    {card.tags?.length > 0 && (
                                        <Box sx={{ display: 'flex', gap: 0.5, mt: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
                                            {card.tags.map((t, i) => (
                                                <Box key={i} sx={{ fontFamily: 'monospace', fontSize: '0.55rem', color: '#666', border: '1px solid #2A2A2A', px: 0.75, py: 0.15 }}>#{t}</Box>
                                            ))}
                                        </Box>
                                    )}
                                </Box>
                            </Box>
                        </Box>

                        {/* Action buttons — show when flipped */}
                        {flipped ? (
                            <Box sx={{ display: 'flex', gap: 1 }}>
                                <Button
                                    onClick={(e) => { e.stopPropagation(); saveAndAdvance('reviewing'); }}
                                    fullWidth
                                    sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: '#FFAA00', border: '1px solid #FFAA00', borderRadius: 0, py: 1, '&:hover': { bgcolor: '#1A1400' } }}
                                >
                                    [STILL LEARNING]
                                </Button>
                                <Button
                                    onClick={(e) => { e.stopPropagation(); saveAndAdvance('known'); }}
                                    fullWidth
                                    sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: '#00FF00', border: '1px solid #00FF00', borderRadius: 0, py: 1, '&:hover': { bgcolor: '#001A00' } }}
                                >
                                    [GOT IT]
                                </Button>
                            </Box>
                        ) : (
                            <Typography sx={{ fontFamily: 'monospace', fontSize: '0.65rem', color: '#444', textAlign: 'center' }}>
                                click card to flip
                            </Typography>
                        )}
                    </Box>
                )}
            </DialogContent>
        </Dialog>
    );
}
