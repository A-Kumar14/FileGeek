import React, { createContext, useState, useContext, useCallback, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useFile } from './FileContext';
import { useModelContext } from './ModelContext';
import useDocumentIndexing from '../hooks/useDocumentIndexing';
import useSessionManager from '../hooks/useSessionManager';
import useStreamingChat from '../hooks/useStreamingChat';

const ChatContext = createContext(null);

export function useChatContext() {
  return useContext(ChatContext);
}

const PHASE_TIMERS = { reading: 1200, analyzing: 2500 };

export function ChatProvider({ children }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState(null);
  const [deepThinkEnabled, setDeepThinkEnabled] = useState(false);
  const [artifacts, setArtifacts] = useState([]);
  const [suggestions, setSuggestions] = useState([]);

  const phaseTimerRef = useRef(null);
  const queryClient = useQueryClient();

  const fileCtx = useFile();
  const setRemoteFile = fileCtx?.setRemoteFile;
  const removeFile = fileCtx?.removeFile;
  const { selectedModel } = useModelContext();

  const documentIndexing = useDocumentIndexing();

  // ── Session management ────────────────────────────────────────────────────
  const sessionManager = useSessionManager({ setRemoteFile, removeFile });
  const {
    chatSessions,
    activeSessionId,
    setActiveSessionId,
    messagesLengthRef,
    startNewSession,
    loadSession: _loadSession,
    removeSession: _removeSession,
    renameSession,
    clearAllSessions: _clearAllSessions,
    saveCurrentSession,
  } = sessionManager;

  // Keep messagesLengthRef in sync so loadSession can guard against re-fetch
  useEffect(() => { messagesLengthRef.current = messages.length; }, [messages, messagesLengthRef]);

  // Invalidate active session cache when indexing completes
  useEffect(() => {
    if (documentIndexing.phase === 'completed' && activeSessionId) {
      queryClient.invalidateQueries({ queryKey: ['session', activeSessionId] });
    }
  }, [documentIndexing.phase, activeSessionId, queryClient]);

  // ── Loading phases ────────────────────────────────────────────────────────
  const startLoadingPhases = useCallback(() => {
    setLoadingPhase('reading');
    phaseTimerRef.current = setTimeout(() => {
      setLoadingPhase('analyzing');
      phaseTimerRef.current = setTimeout(() => {
        setLoadingPhase('formulating');
      }, PHASE_TIMERS.analyzing);
    }, PHASE_TIMERS.reading);
  }, []);

  const stopLoadingPhases = useCallback(() => {
    if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current);
    setLoadingPhase(null);
  }, []);

  // ── Document indexing helper ──────────────────────────────────────────────
  const indexDocumentToSession = useCallback(async (sessionId, fileEntry) => {
    if (!fileEntry.localFile) return;
    try {
      if (documentIndexing?.indexFileAsync) {
        await documentIndexing.indexFileAsync(sessionId, fileEntry);
      } else {
        documentIndexing.indexFile(sessionId, fileEntry);
      }
    } catch (e) {
      console.error('Failed to index file to session:', e);
    }
  }, [documentIndexing]);

  // ── SSE streaming + sendMessage ───────────────────────────────────────────
  const { streamingContent, streamingStatus, sendMessage, stopGeneration } = useStreamingChat({
    activeSessionId,
    messages,
    setMessages,
    setLoading,
    setArtifacts,
    setSuggestions,
    startLoadingPhases,
    stopLoadingPhases,
    deepThinkEnabled,
    selectedModel,
    fileCtx,
    startNewSession,
    saveCurrentSession,
    indexDocumentToSession,
    queryClient,
  });

  // ── Adapted session callbacks ─────────────────────────────────────────────
  const loadSession = useCallback(async (sessionId) => {
    if (sessionId === activeSessionId && messagesLengthRef.current > 0) return;

    setMessages([]);
    setActiveSessionId(sessionId);
    setArtifacts([]);
    setSuggestions([]);
    setLoading(true);

    const result = await _loadSession(sessionId, messagesLengthRef.current);
    if (!result) { setLoading(false); return; }

    if (result.messages) {
      setMessages(result.messages);
    } else if (result.fallbackSessionId) {
      sessionManager.setChatSessions((prev) => {
        const local = prev.find((s) => s.id === result.fallbackSessionId);
        if (local) {
          removeFile?.();
          setMessages(local.messages || []);
        }
        return prev;
      });
    }
    setLoading(false);
  }, [activeSessionId, messagesLengthRef, _loadSession, setActiveSessionId, removeFile, sessionManager]);

  const removeSession = useCallback(async (sessionId) => {
    await _removeSession(sessionId);
    if (activeSessionId === sessionId) {
      setActiveSessionId(null);
      setMessages([]);
      setArtifacts([]);
      setSuggestions([]);
    }
  }, [activeSessionId, _removeSession, setActiveSessionId]);

  const clearAllSessions = useCallback(async () => {
    await _clearAllSessions();
    setMessages([]);
    setArtifacts([]);
    setSuggestions([]);
  }, [_clearAllSessions]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setActiveSessionId(null);
    setArtifacts([]);
    setSuggestions([]);
  }, [setActiveSessionId]);

  const toggleDeepThink = useCallback(() => {
    setDeepThinkEnabled((prev) => !prev);
  }, []);

  const clearArtifacts = useCallback(() => {
    setArtifacts([]);
  }, []);

  return (
    <ChatContext.Provider
      value={{
        messages,
        loading,
        loadingPhase,
        deepThinkEnabled,
        toggleDeepThink,
        sendMessage,
        clearMessages,
        clearAllSessions,
        chatSessions,
        activeSessionId,
        startNewSession,
        loadSession,
        removeSession,
        renameSession,
        artifacts,
        clearArtifacts,
        suggestions,
        setSuggestions,
        documentIndexing,
        // Aliases for backward compat
        addMessage: sendMessage,
        isLoading: loading,
        streamingContent,
        streamingStatus,
        stopGeneration,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}
