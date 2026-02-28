import { useState, useCallback, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSessionsList, useCreateSession, useDeleteSession } from './useSessions';
import { getSession as apiGetSession } from '../api/sessions';

const MAX_SESSIONS = 50;

/**
 * Manages the session list and active session lifecycle.
 * Session list is owned by React Query (serverSessions); this hook only keeps
 * activeSessionId and a local fallback list for unauthenticated / offline use.
 */
export default function useSessionManager({ setRemoteFile, removeFile }) {
  const queryClient = useQueryClient();

  const [activeSessionId, setActiveSessionId] = useState(null);
  // Local session list — used as optimistic cache and offline fallback.
  // Initialized empty; populated from serverSessions via the sync effect below.
  const [chatSessions, setChatSessions] = useState([]);

  const { data: serverSessions } = useSessionsList();
  const createSessionMutation = useCreateSession();
  const deleteSessionMutation = useDeleteSession();

  // Generation counter prevents stale loadSession results from racing
  const loadGenRef = useRef(0);
  const messagesLengthRef = useRef(0);

  // Keep chatSessions in sync with server — React Query is the source of truth
  useEffect(() => {
    if (serverSessions && serverSessions.length > 0) {
      setChatSessions(serverSessions);
    }
  }, [serverSessions]);

  // Persist only activeSessionId to localStorage (not the full session list)
  useEffect(() => {
    if (activeSessionId) {
      localStorage.setItem('filegeek-active-session', activeSessionId);
    }
  }, [activeSessionId]);

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
    setChatSessions((prev) => {
      const updated = [session, ...prev.filter((s) => s.id !== session.id)];
      return updated.slice(0, MAX_SESSIONS);
    });
    return session.id;
  }, [createSessionMutation]);

  const loadSession = useCallback(async (sessionId, currentMessagesLength) => {
    if (sessionId === activeSessionId && currentMessagesLength > 0) return null;

    const gen = ++loadGenRef.current;
    setActiveSessionId(sessionId);

    const token = localStorage.getItem('filegeek-token');
    if (token) {
      try {
        const session = await apiGetSession(sessionId);
        if (gen !== loadGenRef.current) return null;
        if (session) {
          if (session.documents && session.documents.length > 0) {
            const doc = session.documents[0];
            if (setRemoteFile) setRemoteFile(doc.file_url, doc.file_name, doc.file_type);
          } else {
            if (removeFile) removeFile();
          }
          return { messages: session.messages || [], gen };
        }
      } catch {
        if (gen !== loadGenRef.current) return null;
      }
    }

    // localStorage fallback: look in current chatSessions
    return { messages: null, fallbackSessionId: sessionId, gen };
  }, [activeSessionId, setRemoteFile, removeFile]);

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
    return sessionId;
  }, [deleteSessionMutation]);

  const renameSession = useCallback((sessionId, newTitle) => {
    setChatSessions((prev) =>
      prev.map((s) => s.id === sessionId ? { ...s, title: newTitle, fileName: newTitle } : s)
    );
  }, []);

  const clearAllSessions = useCallback(async () => {
    const token = localStorage.getItem('filegeek-token');
    if (token) {
      for (const s of chatSessions) {
        try { await deleteSessionMutation.mutateAsync(s.id); } catch { /* ignore */ }
      }
    }
    setChatSessions([]);
    setActiveSessionId(null);
    localStorage.removeItem('filegeek-active-session');
  }, [chatSessions, deleteSessionMutation]);

  const saveCurrentSession = useCallback((sessionId, updatedMessages) => {
    if (!sessionId) return;
    setChatSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId
          ? {
            ...s,
            messages: updatedMessages,
            preview: updatedMessages.find((m) => m.role === 'user')?.content?.slice(0, 60) || '',
            updated_at: new Date().toISOString(),
          }
          : s
      )
    );
  }, []);

  return {
    chatSessions,
    setChatSessions,
    activeSessionId,
    setActiveSessionId,
    loadGenRef,
    messagesLengthRef,
    startNewSession,
    loadSession,
    removeSession,
    renameSession,
    clearAllSessions,
    saveCurrentSession,
    createSessionMutation,
    deleteSessionMutation,
  };
}
