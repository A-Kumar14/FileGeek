import React, { useState, useRef, useCallback } from 'react';
import { Box, Typography, LinearProgress, Stack } from '@mui/material';
import { useFile } from '../contexts/FileContext';



export default function DropZone() {
  const { handleFileSelect, files } = useFile();
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragOver(false);
      handleFileSelect(e.dataTransfer.files[0]);
    },
    [handleFileSelect]
  );

  const activeEntry = files.length > 0 ? files[0] : null;

  return (
    <Box
      role="button"
      tabIndex={0}
      aria-label="Upload Terminal"
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onClick={() => fileInputRef.current?.click()}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        cursor: 'pointer',
        border: dragOver ? '1px solid var(--accent)' : '1px solid var(--border)',
        bgcolor: dragOver ? 'var(--bg-hover)' : 'var(--bg-primary)',
        transition: 'all 0.1s ease',
        position: 'relative',
        m: 0,
      }}
    >
      {/* Decorative Grid Lines */}
      <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1px', bgcolor: 'var(--border)' }} />
      <Box sx={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '1px', bgcolor: 'var(--border)' }} />

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,.mp3,.wav,.m4a,.webm,.ogg"
        style={{ display: 'none' }}
        onChange={(e) => handleFileSelect(e.target.files[0])}
      />

      <Box
        sx={{
          width: 64,
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: `1px solid ${dragOver ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: '16px',
          mb: 2.5,
          color: dragOver ? 'var(--accent)' : 'var(--fg-secondary)',
          background: dragOver ? 'var(--accent-dim)' : 'var(--bg-tertiary)',
          transition: 'all 0.15s',
        }}
      >
        <Typography variant="h4" sx={{ fontFamily: 'var(--font-family)', fontWeight: 300, lineHeight: 1 }}>
          {dragOver ? '+' : '↑'}
        </Typography>
      </Box>

      <Typography variant="h6" fontWeight={600} sx={{ fontSize: '1rem', color: 'var(--fg-primary)', fontFamily: 'var(--font-family)' }}>
        Upload a file
      </Typography>
      <Typography variant="body2" sx={{ mt: 0.75, color: 'var(--fg-dim)', fontFamily: 'var(--font-family)', fontSize: '0.85rem' }}>
        Drop files here or click to browse
      </Typography>

      <Box sx={{ mt: 3, display: 'flex', gap: 2, color: 'var(--fg-dim)', fontSize: '0.75rem', fontFamily: 'var(--font-family)' }}>
        <span>PDF</span>
        <span>DOCX</span>
        <span>TXT</span>
        <span>IMG</span>
      </Box>

      {activeEntry && (
        <Box sx={{ width: '100%', maxWidth: 400, mt: 4, px: 2 }}>
          <Stack
            direction="row"
            alignItems="center"
            spacing={1}
            sx={{
              mt: 1,
              px: 1.5,
              py: 0.5,
              border: '1px solid var(--success)',
              bgcolor: 'rgba(5,150,105,0.06)',
              borderRadius: '8px',
            }}
          >
            <Typography variant="caption" sx={{ color: 'var(--success)', fontFamily: 'var(--font-family)' }} noWrap>
              {activeEntry.fileName} ready
            </Typography>
          </Stack>
        </Box>
      )}
    </Box>
  );
}
