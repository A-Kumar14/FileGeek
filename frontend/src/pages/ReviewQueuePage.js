import React, { useEffect, useState, useCallback } from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, CheckCircle, RotateCcw } from 'lucide-react';
import axios from 'axios';

const API = process.env.REACT_APP_API_URL || 'http://localhost:5001';

function FlipCard({ card, onKnow, onReview }) {
    const [flipped, setFlipped] = useState(false);

    return (
        <Box sx={{ perspective: '1000px', mb: 3 }}>
            <Box
                onClick={() => setFlipped(f => !f)}
                sx={{
                    position: 'relative',
                    height: 200,
                    cursor: 'pointer',
                    transformStyle: 'preserve-3d',
                    transition: 'transform 0.5s cubic-bezier(0.4,0,0.2,1)',
                    transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                }}
            >
                {/* Front */}
                <Box sx={{
                    position: 'absolute', inset: 0, backfaceVisibility: 'hidden',
                    border: '1px solid #333', bgcolor: '#0D0D0D', p: 3,
                    display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
                }}>
                    <Typography sx={{ fontFamily: 'monospace', fontSize: '0.6rem', color: '#555', mb: 1, textTransform: 'uppercase' }}>
                        FRONT — click to flip
                    </Typography>
                    <Typography sx={{ fontFamily: 'monospace', fontSize: '0.95rem', color: '#E5E5E5', textAlign: 'center' }}>
                        {card.card_front}
                    </Typography>
                </Box>

                {/* Back */}
                <Box sx={{
                    position: 'absolute', inset: 0, backfaceVisibility: 'hidden',
                    transform: 'rotateY(180deg)',
                    border: '1px solid #00FF00', bgcolor: '#0D0D0D', p: 3,
                    display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
                }}>
                    <Typography sx={{ fontFamily: 'monospace', fontSize: '0.6rem', color: '#555', mb: 1, textTransform: 'uppercase' }}>
                        BACK
                    </Typography>
                    <Typography sx={{ fontFamily: 'monospace', fontSize: '0.9rem', color: '#E5E5E5', textAlign: 'center' }}>
                        {card.card_back || '(no back text found)'}
                    </Typography>
                </Box>
            </Box>

            {/* Action buttons — only show when flipped */}
            {flipped && (
                <Box sx={{ display: 'flex', gap: 1, mt: 1.5 }}>
                    <Box
                        onClick={onReview}
                        sx={{
                            flex: 1, border: '1px solid #FFAA00', color: '#FFAA00', p: 1,
                            fontFamily: 'monospace', fontSize: '0.7rem', textAlign: 'center',
                            cursor: 'pointer', textTransform: 'uppercase',
                            '&:hover': { bgcolor: '#FFAA0015' },
                        }}
                    >
                        <RotateCcw size={12} style={{ marginRight: 4 }} />
                        Still Learning
                    </Box>
                    <Box
                        onClick={onKnow}
                        sx={{
                            flex: 1, border: '1px solid #00FF00', color: '#00FF00', p: 1,
                            fontFamily: 'monospace', fontSize: '0.7rem', textAlign: 'center',
                            cursor: 'pointer', textTransform: 'uppercase',
                            '&:hover': { bgcolor: '#00FF0015' },
                        }}
                    >
                        <CheckCircle size={12} style={{ marginRight: 4 }} />
                        Know It
                    </Box>
                </Box>
            )}
        </Box>
    );
}

export default function ReviewQueuePage() {
    const navigate = useNavigate();
    const [cards, setCards] = useState([]);
    const [current, setCurrent] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [done, setDone] = useState(false);
    const [stats, setStats] = useState({ known: 0, review: 0 });

    const fetchDue = useCallback(async () => {
        const token = localStorage.getItem('filegeek-token');
        if (!token) { navigate('/login'); return; }
        try {
            const res = await axios.get(`${API}/flashcards/due`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setCards(res.data.due || []);
        } catch {
            setError('Failed to load review queue.');
        } finally {
            setLoading(false);
        }
    }, [navigate]);

    useEffect(() => { fetchDue(); }, [fetchDue]);

    const saveProgress = async (card, status) => {
        const token = localStorage.getItem('filegeek-token');
        try {
            await axios.post(`${API}/flashcards/progress`, {
                session_id: card.session_id,
                message_id: card.message_id,
                card_index: card.card_index,
                card_front: card.card_front,
                status,
            }, { headers: { Authorization: `Bearer ${token}` } });
        } catch { /* silent */ }
    };

    const handleKnow = async () => {
        await saveProgress(cards[current], 'known');
        setStats(s => ({ ...s, known: s.known + 1 }));
        advance();
    };

    const handleReview = async () => {
        await saveProgress(cards[current], 'reviewing');
        setStats(s => ({ ...s, review: s.review + 1 }));
        advance();
    };

    const advance = () => {
        if (current + 1 >= cards.length) setDone(true);
        else setCurrent(c => c + 1);
    };

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: '#000000', color: '#E5E5E5', fontFamily: 'monospace', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 3, py: 2, borderBottom: '1px solid #333' }}>
                <Box onClick={() => navigate('/')} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer', color: '#888', fontSize: '0.75rem', '&:hover': { color: '#E5E5E5' } }}>
                    <ArrowLeft size={14} /><span>[BACK]</span>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Clock size={16} color="#FFAA00" />
                    <Typography sx={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.9rem' }}>REVIEW QUEUE</Typography>
                </Box>
                {!loading && !error && (
                    <Typography sx={{ fontFamily: 'monospace', fontSize: '0.7rem', color: '#555', ml: 'auto' }}>
                        {cards.length} card{cards.length !== 1 ? 's' : ''} due
                    </Typography>
                )}
            </Box>

            <Box sx={{ flex: 1, p: 3, maxWidth: 640, width: '100%', mx: 'auto' }}>
                {loading && <Box sx={{ display: 'flex', justifyContent: 'center', pt: 8 }}><CircularProgress size={24} sx={{ color: '#FFAA00' }} /></Box>}
                {error && <Typography sx={{ fontFamily: 'monospace', color: '#FF4444', textAlign: 'center', pt: 8 }}>{error}</Typography>}

                {!loading && !error && cards.length === 0 && (
                    <Box sx={{ textAlign: 'center', pt: 8 }}>
                        <Typography sx={{ fontFamily: 'monospace', color: '#00FF00', fontSize: '1.2rem', mb: 1 }}>All caught up!</Typography>
                        <Typography sx={{ fontFamily: 'monospace', color: '#555', fontSize: '0.8rem' }}>No cards due for review today. Come back tomorrow.</Typography>
                    </Box>
                )}

                {!loading && !error && cards.length > 0 && !done && (
                    <>
                        {/* Progress bar */}
                        <Box sx={{ mb: 3 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                <Typography sx={{ fontFamily: 'monospace', fontSize: '0.6rem', color: '#555', textTransform: 'uppercase' }}>Progress</Typography>
                                <Typography sx={{ fontFamily: 'monospace', fontSize: '0.6rem', color: '#555' }}>{current}/{cards.length}</Typography>
                            </Box>
                            <Box sx={{ height: 2, bgcolor: '#1A1A1A' }}>
                                <Box sx={{ height: '100%', width: `${(current / cards.length) * 100}%`, bgcolor: '#FFAA00', transition: 'width 0.3s' }} />
                            </Box>
                        </Box>
                        <FlipCard card={cards[current]} onKnow={handleKnow} onReview={handleReview} />
                    </>
                )}

                {done && (
                    <Box sx={{ textAlign: 'center', pt: 8 }}>
                        <Typography sx={{ fontFamily: 'monospace', color: '#00FF00', fontSize: '1.2rem', mb: 2 }}>Session Complete!</Typography>
                        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 3, mb: 3 }}>
                            <Box>
                                <Typography sx={{ fontFamily: 'monospace', fontSize: '1.5rem', color: '#00FF00', fontWeight: 700 }}>{stats.known}</Typography>
                                <Typography sx={{ fontFamily: 'monospace', fontSize: '0.6rem', color: '#555' }}>KNOWN</Typography>
                            </Box>
                            <Box>
                                <Typography sx={{ fontFamily: 'monospace', fontSize: '1.5rem', color: '#FFAA00', fontWeight: 700 }}>{stats.review}</Typography>
                                <Typography sx={{ fontFamily: 'monospace', fontSize: '0.6rem', color: '#555' }}>REVIEWING</Typography>
                            </Box>
                        </Box>
                        <Box onClick={() => navigate('/')} sx={{ border: '1px solid #333', px: 3, py: 1, cursor: 'pointer', display: 'inline-block', fontFamily: 'monospace', fontSize: '0.75rem', color: '#888', '&:hover': { borderColor: '#E5E5E5', color: '#E5E5E5' } }}>
                            [BACK TO WORKSPACE]
                        </Box>
                    </Box>
                )}
            </Box>
        </Box>
    );
}
