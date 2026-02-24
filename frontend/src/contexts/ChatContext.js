import React, { createContext, useState, useContext, useCallback, useRef, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import useChat from '../hooks/useChat';
import { useFile } from './FileContext';
import { useModelContext } from './ModelContext';
import { useSessionsList, useCreateSession, useDeleteSession } from '../hooks/useSessions';
import useDocumentIndexing from '../hooks/useDocumentIndexing';
import {
  getSession as apiGetSession,
  sendSessionMessage,
} from '../api/sessions';

const ChatContext = createContext(null);

export function useChatContext() {
  return useContext(ChatContext);
}

const MAX_SESSIONS = 50;
const PHASE_TIMERS = { reading: 1200, analyzing: 2500 };

export function ChatProvider({ children }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState(null);
  const [deepThinkEnabled, setDeepThinkEnabled] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [chatSessions, setChatSessions] = useState(() => {
    const stored = localStorage.getItem('filegeek-sessions');
    return stored ? JSON.parse(stored) : [];
  });
  const [artifacts, setArtifacts] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [streamingContent, setStreamingContent] = useState(null);
  const [streamingStatus, setStreamingStatus] = useState(null);
  const phaseTimerRef = useRef(null);
  const localStorageDebounceRef = useRef(null);
  const stopGenerationRef = useRef(false);
  // Generation counter — prevents stale loadSession() responses from overwriting
  // a newer session's messages when the user switches sessions rapidly.
  const loadGenRef = useRef(0);
  // Ref mirror of messages.length so loadSession doesn't need it as a dep
  // (adding it to deps causes loadSession to be recreated on every message received).
  const messagesLengthRef = useRef(0);
  useEffect(() => { messagesLengthRef.current = messages.length; }, [messages]);

  const { sendMessage: apiSendMessage } = useChat();
  const fileCtx = useFile();
  const setRemoteFile = fileCtx?.setRemoteFile;
  const removeFile = fileCtx?.removeFile;
  const { selectedModel } = useModelContext();
  const queryClient = useQueryClient();

  // React Query hooks for server state
  const { data: serverSessions } = useSessionsList();
  const createSessionMutation = useCreateSession();
  const deleteSessionMutation = useDeleteSession();
  const documentIndexing = useDocumentIndexing();

  // Sync server sessions to local state
  useEffect(() => {
    if (serverSessions && serverSessions.length > 0) {
      setChatSessions(serverSessions);
    }
  }, [serverSessions]);

  // Invalidate the active session cache when indexing completes so any
  // subsequent messages can find the newly indexed document chunks.
  useEffect(() => {
    if (documentIndexing.phase === 'completed' && activeSessionId) {
      queryClient.invalidateQueries({ queryKey: ['session', activeSessionId] });
    }
  }, [documentIndexing.phase, activeSessionId, queryClient]);

  // Sync to localStorage as offline cache (debounced 500ms to reduce thrashing)
  useEffect(() => {
    if (localStorageDebounceRef.current) {
      clearTimeout(localStorageDebounceRef.current);
    }
    localStorageDebounceRef.current = setTimeout(() => {
      localStorage.setItem('filegeek-sessions', JSON.stringify(chatSessions));
    }, 500);

    return () => {
      if (localStorageDebounceRef.current) {
        clearTimeout(localStorageDebounceRef.current);
      }
    };
  }, [chatSessions]);

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

  const startNewSession = useCallback(async (fileName, fileType) => {
    const token = localStorage.getItem('filegeek-token');
    let session;

    if (token) {
      try {
        session = await createSessionMutation.mutateAsync({
          title: fileName || 'Untitled Session',
        });
      } catch {
        // Fall back to local session
      }
    }

    if (!session) {
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      session = {
        id,
        title: fileName || 'Untitled Session',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        messages: [],
      };
    }

    setActiveSessionId(session.id);
    setMessages([]);
    setArtifacts([]);
    setSuggestions([]);
    setChatSessions((prev) => {
      const updated = [session, ...prev.filter((s) => s.id !== session.id)];
      return updated.slice(0, MAX_SESSIONS);
    });
    return session.id;
  }, [createSessionMutation]);

  const loadSession = useCallback(async (sessionId) => {
    // Skip redundant refetch if the session is already loaded (use ref to avoid dep)
    if (sessionId === activeSessionId && messagesLengthRef.current > 0) return;

    // Increment generation — any in-flight load for a previous call will see
    // gen !== loadGenRef.current and discard its results (race-condition fix).
    const gen = ++loadGenRef.current;

    // Immediately clear stale state so old messages don't flash
    setMessages([]);
    setActiveSessionId(sessionId);
    setArtifacts([]);
    setSuggestions([]);
    setLoading(true);

    const token = localStorage.getItem('filegeek-token');
    if (token) {
      try {
        const session = await apiGetSession(sessionId);
        // Discard if a newer loadSession() has been called since we started
        if (gen !== loadGenRef.current) return;
        if (session) {
          if (session.documents && session.documents.length > 0) {
            const doc = session.documents[0];
            if (setRemoteFile) setRemoteFile(doc.file_url, doc.file_name, doc.file_type);
          } else {
            if (removeFile) removeFile();
          }
          setMessages(session.messages || []);
          setLoading(false);
          return;
        }
      } catch {
        // Fall through to local cache
        if (gen !== loadGenRef.current) return;
      }
    }

    // localStorage fallback — avoids stale closure on chatSessions
    setChatSessions((prev) => {
      if (gen !== loadGenRef.current) return prev; // still guard
      const local = prev.find((s) => s.id === sessionId);
      if (local) {
        if (removeFile) removeFile();
        setMessages(local.messages || []);
      }
      return prev;
    });
    // Guard setLoading(false) so a stale load can't clear the spinner for a newer load
    if (gen === loadGenRef.current) setLoading(false);
  }, [setRemoteFile, removeFile, activeSessionId]);

  const removeSession = useCallback(async (sessionId) => {
    const token = localStorage.getItem('filegeek-token');
    if (token) {
      try {
        await deleteSessionMutation.mutateAsync(sessionId);
      } catch {
        // Continue with local removal
      }
    }

    setChatSessions((prev) => prev.filter((s) => s.id !== sessionId));
    if (activeSessionId === sessionId) {
      setActiveSessionId(null);
      setMessages([]);
      setArtifacts([]);
      setSuggestions([]);
    }
  }, [activeSessionId, deleteSessionMutation]);

  const saveCurrentSession = useCallback((updatedMessages) => {
    if (!activeSessionId) return;
    setChatSessions((prev) =>
      prev.map((s) =>
        s.id === activeSessionId
          ? {
            ...s,
            messages: updatedMessages,
            preview: updatedMessages.find((m) => m.role === 'user')?.content?.slice(0, 60) || '',
            updated_at: new Date().toISOString(),
          }
          : s
      )
    );
  }, [activeSessionId]);

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

  const sendMessage = useCallback(async (question, overrideModel = null) => {
    if (!question.trim()) return;

    const allFiles = fileCtx?.files || [];
    // Only upload files that are strictly local and have not been uploaded yet.
    // Remote files (loaded from history) have localFile === null and uploadedUrl set.
    const filesToUpload = allFiles.filter((entry) => entry.localFile && !entry.uploadedUrl);

    let sessionId = activeSessionId;
    if (!sessionId) {
      const defaultName = (fileCtx?.file && typeof fileCtx.file !== 'string') ? fileCtx.file.name : 'New Chat';
      const defaultType = fileCtx?.fileType || 'general';
      sessionId = await startNewSession(defaultName, defaultType);
    }

    // Ensure all fresh local files are uploaded and indexed BEFORE chatting
    for (const entry of filesToUpload) {
      await indexDocumentToSession(sessionId, entry);

      // Update the FileContext entry to indicate it's now remote so it doesn't upload again
      if (fileCtx?.setRemoteFile) {
        // Because we don't know the generated URL from indexFileAsync easily without returning it,
        // we can just remove the local file flag or temporarily set it to a placeholder.
        // But simply completing this block is enough for the backend to have the context!
      }
    }

    const _fe = fileCtx?.fileEntry;
    const attachedFile = _fe ? {
      name: _fe.fileName,
      type: _fe.fileType,
      url: _fe.uploadedUrl || null,
      localFile: _fe.localFile || null,
    } : null;
    const userMsg = {
      role: 'user',
      content: question.trim(),
      timestamp: new Date().toISOString(),
      ...(attachedFile ? { attachedFile } : {}),
    };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setLoading(true);
    setSuggestions([]);
    startLoadingPhases();

    try {
      const token = localStorage.getItem('filegeek-token');
      let result;

      // Try server-backed session message first
      if (token && sessionId) {
        try {
          stopGenerationRef.current = false;
          let accumulatedContent = '';
          setStreamingContent('');
          result = await sendSessionMessage(sessionId, {
            question: question.trim(),
            deepThink: deepThinkEnabled,
            model: overrideModel || selectedModel,
            onChunk: (chunk) => {
              if (stopGenerationRef.current) return;
              accumulatedContent += chunk;
              setStreamingContent(accumulatedContent);
              setStreamingStatus(null); // clear status once actual content arrives
            },
            onStatus: (evt) => {
              if (stopGenerationRef.current) return;
              // Show human-friendly progress text
              const TOOL_LABELS = {
                search_documents: 'Searching documents…',
                generate_quiz: 'Generating quiz…',
                generate_flashcards: 'Creating flashcards…',
                create_study_guide: 'Building study guide…',
                generate_visualization: 'Creating visualization…',
              };
              if (evt.type === 'tool_start') {
                setStreamingStatus(TOOL_LABELS[evt.tool] || `Running ${evt.tool}…`);
              } else if (evt.type === 'tool_done') {
                setStreamingStatus('Analyzing results…');
              } else if (evt.text) {
                setStreamingStatus(evt.text);
              }
            },
          });
          setStreamingContent(null);
          setStreamingStatus(null);
          // If SSE returned null finalData, build from accumulated
          if (!result && accumulatedContent) {
            result = { answer: accumulatedContent, sources: [], artifacts: [], suggestions: [] };
          }
        } catch (err) {
          setStreamingContent(null);
          setStreamingStatus(null);
          throw err;
        }
      }

      // Fall back to legacy flow
      if (!result) {
        const chatHistory = messages.map(({ role, content }) => ({ role, content }));
        const legacyResult = await apiSendMessage(question, filesToUpload, chatHistory, deepThinkEnabled, overrideModel || selectedModel);
        result = {
          answer: legacyResult.answer,
          sources: legacyResult.sources,
          artifacts: [],
          suggestions: [],
        };
      }

      const assistantMsg = {
        role: 'assistant',
        content: result.answer,
        sources: result.sources,
        message_id: result.message_id,
        artifacts: result.artifacts,
        suggestions: result.suggestions,
        timestamp: new Date().toISOString(),
      };
      const finalMessages = [...newMessages, assistantMsg];
      setMessages(finalMessages);
      saveCurrentSession(finalMessages);

      // Invalidate session query so React Query picks up new messages
      if (sessionId) {
        queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
        queryClient.invalidateQueries({ queryKey: ['sessions'] });
      }

      if (result.artifacts?.length > 0) {
        setArtifacts((prev) => [...prev, ...result.artifacts]);
      }
      if (result.suggestions?.length > 0) {
        setSuggestions(result.suggestions);
      }
    } catch (err) {
      console.error('Chat error:', err);
      let errorMsg = 'Something went wrong. Please try again.';

      if (err.response) {
        // Server responded with error status
        errorMsg = err.response.data?.error || `Server error: ${err.response.status}`;
      } else if (err.request) {
        // Request made but no response (network/CORS issue)
        errorMsg = 'Cannot reach server. Please check your connection and API URL configuration.';
      } else {
        // Something else went wrong
        errorMsg = err.message || errorMsg;
      }

      const finalMessages = [...newMessages, {
        role: 'assistant',
        content: `Error: ${errorMsg}`,
        isError: true,
        failedQuestion: question.trim(),
        timestamp: new Date().toISOString(),
      }];
      setMessages(finalMessages);
      saveCurrentSession(finalMessages);
    } finally {
      setLoading(false);
      stopLoadingPhases();
    }
  }, [fileCtx, messages, activeSessionId, deepThinkEnabled, selectedModel, apiSendMessage, startNewSession, saveCurrentSession, startLoadingPhases, stopLoadingPhases, indexDocumentToSession, queryClient]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setActiveSessionId(null);
    setArtifacts([]);
    setSuggestions([]);
  }, []);

  const clearAllSessions = useCallback(async () => {
    const token = localStorage.getItem('filegeek-token');
    if (token) {
      for (const s of chatSessions) {
        try { await deleteSessionMutation.mutateAsync(s.id); } catch { /* ignore */ }
      }
    }
    setChatSessions([]);
    setMessages([]);
    setActiveSessionId(null);
    setArtifacts([]);
    setSuggestions([]);
    localStorage.removeItem('filegeek-sessions');
  }, [chatSessions, deleteSessionMutation]);

  const toggleDeepThink = useCallback(() => {
    setDeepThinkEnabled((prev) => !prev);
  }, []);

  const renameSession = useCallback((sessionId, newTitle) => {
    setChatSessions((prev) =>
      prev.map((s) => s.id === sessionId ? { ...s, title: newTitle, fileName: newTitle } : s)
    );
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
        // Aliases and compatibilty helpers
        addMessage: sendMessage,
        isLoading: loading,
        streamingContent,
        streamingStatus,
        stopGeneration: () => { stopGenerationRef.current = true; setStreamingContent(null); setStreamingStatus(null); },
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}
