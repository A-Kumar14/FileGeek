import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Typography, IconButton, Tooltip } from '@mui/material';
import DescriptionIcon from '@mui/icons-material/Description';
import StickyNote2Icon from '@mui/icons-material/StickyNote2';
import TextHighlightRenderer from './TextHighlightRenderer';
import SelectionToolbar from './SelectionToolbar';
import StickyNotePanel from './StickyNotePanel';
import { useAnnotations } from '../contexts/AnnotationContext';
import { getSelectionOffsets } from '../utils/selectionUtils';

export default function TextViewer({ file, fileType }) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const preRef = useRef(null);

  const { addHighlight, addComment, setNotePanelOpen } = useAnnotations();

  useEffect(() => {
    if (!file) return;

    if (fileType === 'txt') {
      if (typeof file === 'string') {
        // Handle remote URL (from chat history)
        fetch(file)
          .then((res) => {
            if (!res.ok) throw new Error('Network response was not ok');
            return res.text();
          })
          .then((text) => {
            setContent(text);
            setLoading(false);
          })
          .catch((err) => {
            console.error('Failed to fetch text file:', err);
            setContent('Error loading document content.');
            setLoading(false);
          });
      } else {
        // Handle local File object
        const reader = new FileReader();
        reader.onload = (e) => {
          setContent(e.target.result);
          setLoading(false);
        };
        reader.readAsText(file);
      }
    } else {
      // For DOCX, we show a placeholder since browser can't natively render DOCX
      setContent('');
      setLoading(false);
    }
  }, [file, fileType]);

  const handleHighlight = useCallback(() => {
    if (!preRef.current) return;
    const result = getSelectionOffsets(preRef.current);
    if (!result) return;
    addHighlight({
      text: result.text,
      color: 'rgba(255, 235, 59, 0.5)',
      startOffset: result.startOffset,
      endOffset: result.endOffset,
    });
  }, [addHighlight]);

  const handleComment = useCallback((commentText) => {
    if (!preRef.current) return;
    const result = getSelectionOffsets(preRef.current);
    if (!result) return;
    addComment({
      text: result.text,
      comment: commentText,
      startOffset: result.startOffset,
      endOffset: result.endOffset,
    });
  }, [addComment]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Typography color="text.secondary">Loading document...</Typography>
      </Box>
    );
  }

  if (fileType === 'docx') {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: 2,
          p: 4,
        }}
      >
        <DescriptionIcon sx={{ fontSize: 64, color: 'primary.main', opacity: 0.6 }} />
        <Typography variant="h6" fontWeight={600} color="text.primary">
          {file.name}
        </Typography>
        <Typography variant="body2" color="text.secondary" textAlign="center">
          Document uploaded — ask questions in the chat panel
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box
        sx={{
          px: 2,
          py: 0.5,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Typography variant="body2" fontWeight={600} noWrap>
          {file.name}
        </Typography>
        <Tooltip title="Notes" arrow>
          <IconButton size="small" onClick={() => setNotePanelOpen(true)} sx={{ color: '#f59e0b' }}>
            <StickyNote2Icon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        <pre
          ref={preRef}
          style={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: '0.85rem',
            lineHeight: 1.6,
            margin: 0,
            userSelect: 'text',
            WebkitUserSelect: 'text',
            cursor: 'text',
          }}
        >
          <TextHighlightRenderer content={content} />
        </pre>
      </Box>
      <SelectionToolbar
        containerRef={preRef}
        onHighlight={handleHighlight}
        onComment={handleComment}
        onOpenNotes={() => setNotePanelOpen(true)}
      />
      <StickyNotePanel />
    </Box>
  );
}
