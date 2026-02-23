import React, { useState, useRef } from 'react';
import { Box, Tooltip } from '@mui/material';
import apiClient from '../api/client';

export default function AudioPlayer({ text }) {
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef(null);

  const handlePlay = async () => {
    if (playing && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setPlaying(false);
      return;
    }

    setLoading(true);
    try {
      const trimmed = text.slice(0, 4096);
      const res = await apiClient.post('/tts', { text: trimmed }, { responseType: 'blob' });
      const blobUrl = URL.createObjectURL(res.data);
      const audio = new Audio(blobUrl);
      audioRef.current = audio;

      audio.onended = () => {
        setPlaying(false);
        URL.revokeObjectURL(blobUrl);
      };

      await audio.play();
      setPlaying(true);
    } catch (err) {
      console.error('TTS error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!text) return null;

  return (
    <Tooltip title={playing ? 'Stop' : 'Read aloud'}>
      <Box
        onClick={loading ? undefined : handlePlay}
        sx={{
          cursor: loading ? 'default' : 'pointer',
          color: playing ? 'var(--accent)' : 'var(--fg-dim)',
          fontFamily: 'var(--font-family)',
          fontSize: '0.72rem',
          fontWeight: 600,
          opacity: loading ? 0.5 : 1,
          transition: 'color 0.15s',
          '&:hover': loading ? {} : { color: 'var(--accent)' },
        }}
      >
        {loading ? '...' : playing ? 'Stop' : 'Listen'}
      </Box>
    </Tooltip>
  );
}
