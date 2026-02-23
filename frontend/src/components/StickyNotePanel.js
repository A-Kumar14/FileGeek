import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Box, Typography, TextField, Tooltip } from '@mui/material';
import { useAnnotations } from '../contexts/AnnotationContext';
import { useFile } from '../contexts/FileContext';

export default function StickyNotePanel() {
  const { notes, addNote, updateNote, removeNote, notePanelOpen, setNotePanelOpen } = useAnnotations();
  const { file } = useFile();
  const [pos, setPos] = useState({ x: window.innerWidth - 360, y: 100 });
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const handleMouseDown = useCallback((e) => {
    dragging.current = true;
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    e.preventDefault();
  }, [pos]);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!dragging.current) return;
      setPos({
        x: Math.max(0, Math.min(e.clientX - dragOffset.current.x, window.innerWidth - 320)),
        y: Math.max(0, Math.min(e.clientY - dragOffset.current.y, window.innerHeight - 100)),
      });
    };
    const handleMouseUp = () => { dragging.current = false; };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  if (!notePanelOpen) return null;

  return createPortal(
    <Box
      sx={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        width: 320,
        maxHeight: 420,
        zIndex: 1300,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        borderRadius: '16px',
        border: '1px solid var(--border)',
        bgcolor: 'var(--bg-secondary)',
        boxShadow: 'var(--shadow)',
      }}
    >
      {/* Header */}
      <Box
        onMouseDown={handleMouseDown}
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 1.75,
          py: 1,
          borderBottom: '1px solid var(--border)',
          bgcolor: 'var(--bg-primary)',
          cursor: 'grab',
          userSelect: 'none',
          borderRadius: '16px 16px 0 0',
          '&:active': { cursor: 'grabbing' },
        }}
      >
        <Typography sx={{ fontFamily: 'var(--font-family)', fontWeight: 600, fontSize: '0.82rem', color: 'var(--fg-primary)' }} noWrap>
          Notes — {file?.name || 'Untitled'}
        </Typography>
        <Tooltip title="Close">
          <Box
            onClick={() => setNotePanelOpen(false)}
            sx={{
              cursor: 'pointer',
              color: 'var(--fg-dim)',
              fontFamily: 'var(--font-family)',
              fontSize: '1rem',
              lineHeight: 1,
              fontWeight: 400,
              width: 22, height: 22,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: '50%',
              transition: 'all 0.15s',
              '&:hover': { color: 'var(--error)', bgcolor: 'rgba(220,38,38,0.08)' },
            }}
          >
            ×
          </Box>
        </Tooltip>
      </Box>

      {/* Notes list */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 1.25, display: 'flex', flexDirection: 'column', gap: 1 }}>
        {notes.length === 0 && (
          <Typography sx={{ fontFamily: 'var(--font-family)', fontSize: '0.8rem', color: 'var(--fg-dim)', textAlign: 'center', py: 3 }}>
            No notes yet
          </Typography>
        )}
        {notes.map((note) => (
          <Box
            key={note.id}
            sx={{
              border: '1px solid var(--border)',
              borderRadius: '10px',
              p: 1.25,
              bgcolor: 'var(--bg-primary)',
            }}
          >
            <TextField
              multiline
              minRows={2}
              maxRows={5}
              fullWidth
              size="small"
              defaultValue={note.content}
              placeholder="Write a note..."
              onBlur={(e) => updateNote(note.id, e.target.value)}
              variant="standard"
              sx={{
                '& .MuiInputBase-root': {
                  fontSize: '0.82rem',
                  fontFamily: 'var(--font-family)',
                  color: 'var(--fg-primary)',
                  bgcolor: 'transparent',
                },
                '& .MuiInput-underline:before': { borderBottom: 'none' },
                '& .MuiInput-underline:hover:before': { borderBottom: 'none' },
                '& .MuiInput-underline:after': { borderBottom: '1px solid var(--accent)' },
                '& textarea::placeholder': { color: 'var(--fg-dim)', opacity: 1 },
              }}
            />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 0.75 }}>
              <Typography sx={{ fontSize: '0.62rem', fontFamily: 'var(--font-family)', color: 'var(--fg-dim)' }}>
                {new Date(note.createdAt).toLocaleString()}
              </Typography>
              <Tooltip title="Delete note">
                <Box
                  onClick={() => removeNote(note.id)}
                  sx={{
                    cursor: 'pointer',
                    color: 'var(--fg-dim)',
                    fontFamily: 'var(--font-family)',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    transition: 'color 0.15s',
                    '&:hover': { color: 'var(--error)' },
                  }}
                >
                  Delete
                </Box>
              </Tooltip>
            </Box>
          </Box>
        ))}
      </Box>

      {/* Add Note */}
      <Box sx={{ p: 1.25, borderTop: '1px solid var(--border)' }}>
        <Box
          onClick={() => addNote('')}
          sx={{
            cursor: 'pointer',
            textAlign: 'center',
            fontFamily: 'var(--font-family)',
            fontSize: '0.82rem',
            fontWeight: 600,
            color: 'var(--accent)',
            py: 0.75,
            borderRadius: '10px',
            border: '1px solid var(--border)',
            transition: 'all 0.15s',
            '&:hover': { bgcolor: 'var(--accent-dim)', borderColor: 'var(--accent)' },
          }}
        >
          + Add note
        </Box>
      </Box>
    </Box>,
    document.body
  );
}
