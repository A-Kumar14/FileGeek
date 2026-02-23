import React, { useState, useEffect } from 'react';
import { Box, Dialog, DialogTitle, DialogContent, IconButton, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { Document, Page, pdfjs } from 'react-pdf';

pdfjs.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL}/pdf.worker-5.4.296.min.mjs`;

function FileTypeIcon({ type, name }) {
  const isPdf = type?.includes('pdf') || name?.endsWith('.pdf');
  const isImage = type?.startsWith('image/');
  const isAudio = type?.startsWith('audio/');
  return (
    <Box component="span" sx={{ fontSize: '0.85rem', lineHeight: 1 }}>
      {isPdf ? '📄' : isImage ? '🖼️' : isAudio ? '🎵' : '📄'}
    </Box>
  );
}

export default function FilePreviewModal({ file, onClose }) {
  const [numPages, setNumPages] = useState(null);
  const [pageNum, setPageNum] = useState(1);
  const [fileUrl, setFileUrl] = useState(null);

  // Build the URL: remote URL or object URL from local File
  useEffect(() => {
    if (!file) return;
    if (file.url) {
      setFileUrl(file.url);
      return;
    }
    if (file.localFile) {
      const url = URL.createObjectURL(file.localFile);
      setFileUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [file]);

  // Reset page when file changes
  useEffect(() => {
    setPageNum(1);
    setNumPages(null);
  }, [file]);

  if (!file) return null;

  const isPdf = file.type?.includes('pdf') || file.name?.endsWith('.pdf');
  const isImage = file.type?.startsWith('image/');

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          maxHeight: '92vh',
        },
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          py: 1.25,
          px: 2,
          borderBottom: '1px solid var(--border)',
        }}
      >
        <FileTypeIcon type={file.type} name={file.name} />
        <Typography
          noWrap
          sx={{
            fontFamily: 'var(--font-family)',
            fontSize: '0.85rem',
            fontWeight: 600,
            color: 'var(--fg-primary)',
            flex: 1,
          }}
        >
          {file.name}
        </Typography>
        <IconButton onClick={onClose} size="small" sx={{ color: 'var(--fg-dim)', '&:hover': { color: 'var(--fg-primary)' } }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 0, overflow: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {isPdf && fileUrl && (
          <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', py: 2 }}>
            <Document
              file={fileUrl}
              onLoadSuccess={({ numPages: n }) => setNumPages(n)}
              loading={
                <Box sx={{ py: 6, color: 'var(--fg-dim)', fontFamily: 'var(--font-family)', fontSize: '0.8rem' }}>
                  Loading PDF…
                </Box>
              }
            >
              <Page
                pageNumber={pageNum}
                width={Math.min(window.innerWidth * 0.72, 800)}
                renderTextLayer={false}
                renderAnnotationLayer={false}
              />
            </Document>

            {numPages > 1 && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1.5, mb: 1 }}>
                <Box
                  onClick={() => setPageNum((p) => Math.max(1, p - 1))}
                  sx={{
                    px: 1.5, py: 0.4,
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    cursor: pageNum <= 1 ? 'default' : 'pointer',
                    opacity: pageNum <= 1 ? 0.35 : 1,
                    fontFamily: 'var(--font-family)',
                    fontSize: '0.8rem',
                    color: 'var(--fg-secondary)',
                    userSelect: 'none',
                    '&:hover': pageNum > 1 ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : {},
                  }}
                >
                  ‹ Prev
                </Box>
                <Typography sx={{ fontFamily: 'var(--font-family)', fontSize: '0.75rem', color: 'var(--fg-dim)' }}>
                  {pageNum} / {numPages}
                </Typography>
                <Box
                  onClick={() => setPageNum((p) => Math.min(numPages, p + 1))}
                  sx={{
                    px: 1.5, py: 0.4,
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    cursor: pageNum >= numPages ? 'default' : 'pointer',
                    opacity: pageNum >= numPages ? 0.35 : 1,
                    fontFamily: 'var(--font-family)',
                    fontSize: '0.8rem',
                    color: 'var(--fg-secondary)',
                    userSelect: 'none',
                    '&:hover': pageNum < numPages ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : {},
                  }}
                >
                  Next ›
                </Box>
              </Box>
            )}
          </Box>
        )}

        {isImage && fileUrl && (
          <Box sx={{ p: 2, display: 'flex', justifyContent: 'center' }}>
            <img
              src={fileUrl}
              alt={file.name}
              style={{ maxWidth: '100%', maxHeight: '75vh', borderRadius: 8, objectFit: 'contain' }}
            />
          </Box>
        )}

        {!isPdf && !isImage && (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography sx={{ fontFamily: 'var(--font-family)', fontSize: '0.85rem', color: 'var(--fg-secondary)' }}>
              Preview not available for this file type.{' '}
              {fileUrl && (
                <a href={fileUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
                  Open file ↗
                </a>
              )}
            </Typography>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
