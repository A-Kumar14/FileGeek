import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Box, TextField, Tooltip } from '@mui/material';
import { getSelectionBoundingRect } from '../utils/selectionUtils';
import { useChatContext } from '../contexts/ChatContext';

export default function SelectionToolbar({ containerRef, onHighlight, onComment, onOpenNotes, onAskAboutSelection }) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [commentMode, setCommentMode] = useState(false);
  const [commentText, setCommentText] = useState('');
  const toolbarRef = useRef(null);
  const { sendMessage } = useChatContext();

  const updatePosition = useCallback(() => {
    const rect = getSelectionBoundingRect();
    if (!rect) {
      setVisible(false);
      return;
    }

    const toolbarHeight = 36;
    const margin = 8;

    let top = rect.top - toolbarHeight - margin;
    let left = rect.left + rect.width / 2;

    if (top < margin) {
      top = rect.bottom + margin;
    }

    left = Math.max(100, Math.min(left, window.innerWidth - 100));

    setPosition({ top, left });
    setVisible(true);
  }, []);

  const handleMouseUp = useCallback(() => {
    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.toString().trim().length === 0) {
        if (!commentMode) setVisible(false);
        return;
      }
      if (containerRef?.current) {
        const range = sel.getRangeAt(0);
        if (!containerRef.current.contains(range.commonAncestorContainer)) return;
      }
      updatePosition();
    }, 10);
  }, [updatePosition, commentMode, containerRef]);

  const dismiss = useCallback(() => {
    setVisible(false);
    setCommentMode(false);
    setCommentText('');
  }, []);

  useEffect(() => {
    document.addEventListener('mouseup', handleMouseUp);

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') dismiss();
    };
    document.addEventListener('keydown', handleKeyDown);

    const handleClickOutside = (e) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target) && !commentMode) {
        const sel = window.getSelection();
        if (!sel || sel.toString().trim().length === 0) {
          dismiss();
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [handleMouseUp, dismiss, commentMode]);

  const handleHighlight = () => {
    if (onHighlight) onHighlight();
    dismiss();
    window.getSelection()?.removeAllRanges();
  };

  const handleNote = () => {
    if (onOpenNotes) onOpenNotes();
    dismiss();
    window.getSelection()?.removeAllRanges();
  };

  const handleCommentSubmit = () => {
    if (commentText.trim() && onComment) {
      onComment(commentText.trim());
    }
    dismiss();
    window.getSelection()?.removeAllRanges();
  };

  if (!visible) return null;

  /* Shared pill button style */
  const pillBtn = (label, onClick, accent = false) => (
    <Tooltip title={label}>
      <Box
        onClick={onClick}
        sx={{
          cursor: 'pointer',
          fontFamily: 'var(--font-family)',
          fontSize: '0.72rem',
          fontWeight: 600,
          color: accent ? 'var(--accent)' : 'var(--fg-secondary)',
          px: 1,
          py: 0.3,
          borderRadius: '6px',
          whiteSpace: 'nowrap',
          transition: 'all 0.15s',
          '&:hover': {
            color: 'var(--accent)',
            bgcolor: 'var(--accent-dim)',
          },
        }}
      >
        {label}
      </Box>
    </Tooltip>
  );

  /* Thin separator */
  const sep = <Box sx={{ width: '1px', height: 14, bgcolor: 'var(--border)', mx: 0.25, flexShrink: 0 }} />;

  return createPortal(
    <Box
      ref={toolbarRef}
      onMouseDown={(e) => e.preventDefault()}
      sx={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        transform: 'translateX(-50%)',
        zIndex: 1400,
        display: 'flex',
        alignItems: 'center',
        gap: 0.25,
        px: 0.75,
        py: 0.4,
        borderRadius: '20px',
        bgcolor: 'rgba(255,255,255,0.96)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow)',
      }}
    >
      {!commentMode ? (
        <>
          {pillBtn('Highlight', handleHighlight, true)}
          {sep}
          {pillBtn('Note', handleNote)}
          {sep}
          {pillBtn('Comment', () => setCommentMode(true))}
          {sep}
          {pillBtn('Ask AI', () => {
            const sel = window.getSelection();
            const text = sel ? sel.toString().trim() : '';
            if (text) {
              if (onAskAboutSelection) {
                onAskAboutSelection(text);
              } else if (sendMessage) {
                sendMessage(`Explain this passage: "${text}"`);
              }
            }
            dismiss();
            sel?.removeAllRanges();
          }, true)}
        </>
      ) : (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 0.25 }}>
          <TextField
            size="small"
            placeholder="Add a comment..."
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleCommentSubmit();
              }
            }}
            autoFocus
            variant="standard"
            sx={{
              width: 180,
              '& .MuiInputBase-input': {
                fontSize: '0.8rem',
                py: 0.3,
                fontFamily: 'var(--font-family)',
                color: 'var(--fg-primary)',
              },
              '& .MuiInput-underline:before': { borderBottomColor: 'var(--border)' },
              '& .MuiInput-underline:after': { borderBottomColor: 'var(--accent)' },
              '& input::placeholder': { color: 'var(--fg-dim)', opacity: 1 },
            }}
          />
          <Box
            onClick={commentText.trim() ? handleCommentSubmit : undefined}
            sx={{
              cursor: commentText.trim() ? 'pointer' : 'default',
              fontFamily: 'var(--font-family)',
              fontSize: '0.72rem',
              fontWeight: 600,
              color: commentText.trim() ? 'var(--accent)' : 'var(--fg-dim)',
              transition: 'color 0.15s',
              '&:hover': commentText.trim() ? { opacity: 0.8 } : {},
            }}
          >
            Save
          </Box>
        </Box>
      )}
    </Box>,
    document.body
  );
}
