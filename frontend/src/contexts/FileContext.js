import React, { createContext, useState, useContext, useCallback } from 'react';

const FileContext = createContext(null);

export function useFile() {
  return useContext(FileContext);
}

const ACCEPTED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'image/png',
  'image/jpeg',
  'audio/mpeg',
  'audio/wav',
  'audio/mp4',
  'audio/x-m4a',
  'audio/webm',
  'audio/ogg',
];

function getFileType(entry) {
  const name = entry?.fileName || entry?.localFile?.name;
  if (!name) return null;
  const ext = name.split('.').pop().toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx') return 'docx';
  if (ext === 'txt') return 'txt';
  if (['png', 'jpg', 'jpeg'].includes(ext)) return 'image';
  if (['mp3', 'wav', 'm4a', 'webm', 'ogg'].includes(ext)) return 'audio';
  return 'unknown';
}

function createFileEntry(localFile) {
  return {
    localFile,
    uploadStatus: 'pending',
    uploadProgress: 0,
    uploadedUrl: null,
    uploadedKey: null,
    fileName: localFile.name,
    fileSize: localFile.size,
    fileType: localFile.type,
  };
}

export function FileProvider({ children }) {
  const [fileEntry, setFileEntry] = useState(null);
  const [targetPage, setTargetPage] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [activeSourceHighlight, setActiveSourceHighlight] = useState(null);

  const file = fileEntry?.localFile || fileEntry?.uploadedUrl || null;
  const fileType = getFileType(fileEntry);

  const handleFileSelect = useCallback((selectedFile) => {
    if (!selectedFile) return;
    const ext = selectedFile.name.split('.').pop().toLowerCase();
    const validExts = ['pdf', 'docx', 'txt', 'png', 'jpg', 'jpeg', 'mp3', 'wav', 'm4a', 'webm', 'ogg'];
    if (!validExts.includes(ext) && !ACCEPTED_TYPES.includes(selectedFile.type)) return;

    const entry = createFileEntry(selectedFile);

    // Auto-mark complete for simple local viewing
    entry.uploadStatus = 'complete';
    entry.uploadProgress = 100;

    setFileEntry(entry);
    setTargetPage(null);
    setCurrentPage(1);
    setTotalPages(0);
  }, []);

  const setRemoteFile = useCallback((url, name, type) => {
    setFileEntry({
      localFile: null,
      uploadStatus: 'complete',
      uploadProgress: 100,
      uploadedUrl: url,
      uploadedKey: null,
      fileName: name || 'Document',
      fileSize: 0,
      fileType: type || 'pdf',
    });
    setTargetPage(null);
    setCurrentPage(1);
    setTotalPages(0);
  }, []);

  const removeFile = useCallback(() => {
    setFileEntry(null);
    setTargetPage(null);
    setCurrentPage(1);
    setTotalPages(0);
    setActiveSourceHighlight(null);
  }, []);

  const goToPage = useCallback((pageNum) => {
    setTargetPage(pageNum);
  }, []);

  const goToSourcePage = useCallback((source) => {
    const page = source.pages?.[0] || 1;
    setTargetPage(page);
    setActiveSourceHighlight({ excerpt: source.excerpt, page });
  }, []);

  const reportPageChange = useCallback((page, total) => {
    setCurrentPage(page);
    setTotalPages(total);
  }, []);

  return (
    <FileContext.Provider
      value={{
        file,
        fileEntry,
        files: fileEntry ? [fileEntry] : [], // Backwards compatibility for UI components expecting array
        fileType,
        activeFileIndex: 0,
        setActiveFileIndex: () => { },
        handleFileSelect,
        setRemoteFile,
        removeFile,
        retryUpload: () => { }, // No-op
        targetPage,
        goToPage,
        goToSourcePage,
        activeSourceHighlight,
        currentPage,
        totalPages,
        reportPageChange,
      }}
    >
      {children}
    </FileContext.Provider>
  );
}
