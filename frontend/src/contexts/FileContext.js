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

const VALID_EXTS = ['pdf', 'docx', 'txt', 'png', 'jpg', 'jpeg', 'mp3', 'wav', 'm4a', 'webm', 'ogg'];

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
    uploadStatus: 'complete',
    uploadProgress: 100,
    uploadedUrl: null,
    uploadedKey: null,
    fileName: localFile.name,
    fileSize: localFile.size,
    fileType: localFile.type,
  };
}

function isValidFile(f) {
  const ext = f.name.split('.').pop().toLowerCase();
  return VALID_EXTS.includes(ext) || ACCEPTED_TYPES.includes(f.type);
}

export function FileProvider({ children }) {
  // Multi-file: store an array of entries
  const [fileEntries, setFileEntries] = useState([]);
  const [targetPage, setTargetPage] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [activeSourceHighlight, setActiveSourceHighlight] = useState(null);

  // Backward-compat: primary file is always the first entry
  const fileEntry = fileEntries[0] || null;
  const file = fileEntry?.localFile || fileEntry?.uploadedUrl || null;
  const fileType = getFileType(fileEntry);

  // Accepts a single File, an array of Files, or a FileList
  const handleFileSelect = useCallback((selectedFiles) => {
    if (!selectedFiles) return;
    const list = selectedFiles instanceof FileList
      ? Array.from(selectedFiles)
      : Array.isArray(selectedFiles)
        ? selectedFiles
        : [selectedFiles];

    const valid = list.filter(isValidFile).map(createFileEntry);
    if (valid.length === 0) return;

    setFileEntries(valid);
    setTargetPage(null);
    setCurrentPage(1);
    setTotalPages(0);
  }, []);

  const setRemoteFile = useCallback((url, name, type) => {
    setFileEntries([{
      localFile: null,
      uploadStatus: 'complete',
      uploadProgress: 100,
      uploadedUrl: url,
      uploadedKey: null,
      fileName: name || 'Document',
      fileSize: 0,
      fileType: type || 'pdf',
    }]);
    setTargetPage(null);
    setCurrentPage(1);
    setTotalPages(0);
  }, []);

  const removeFile = useCallback(() => {
    setFileEntries([]);
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
        files: fileEntries,       // now returns ALL entries (was always [fileEntry])
        fileEntries,              // explicit multi-file access
        fileType,
        activeFileIndex: 0,
        setActiveFileIndex: () => { },
        handleFileSelect,
        setRemoteFile,
        removeFile,
        retryUpload: () => { },
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
