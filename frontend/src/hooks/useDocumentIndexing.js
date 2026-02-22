import { useState, useCallback, useEffect, useRef } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { indexDocument, getTaskStatus } from '../api/sessions';
import { useIndexingStatus } from './useIndexingStatus';

const PHASE_PROGRESS = {
  queued: 5,
  pending: 5,
  downloading: 20,
  extracting: 50,
  indexing: 80,
  completed: 100,
  success: 100,
  failure: 0,
};

const PHASE_LABELS = {
  queued: 'Queued...',
  pending: 'Queued...',
  downloading: 'Downloading...',
  extracting: 'Extracting text...',
  indexing: 'Building index...',
  completed: 'Complete',
  success: 'Complete',
  failure: 'Failed',
};

// Timeout before falling back to polling if no socket events received
const SOCKET_FALLBACK_MS = 3000;

export default function useDocumentIndexing() {
  const [taskId, setTaskId] = useState(null);
  const [phase, setPhase] = useState(null);
  const [progress, setProgress] = useState(0);
  const [document, setDocument] = useState(null);
  const [error, setError] = useState(null);
  const completedRef = useRef(false);
  const socketReceivedRef = useRef(false);
  const fallbackTimerRef = useRef(null);

  // Socket.IO hook — provides real-time progress when taskId is set
  const socketStatus = useIndexingStatus(taskId);

  // React to socket progress events
  useEffect(() => {
    if (!taskId || !socketStatus.connected) return;
    socketReceivedRef.current = true;
    clearTimeout(fallbackTimerRef.current);

    setPhase(socketStatus.phase);
    setProgress(socketStatus.progress);

    if (socketStatus.phase === 'completed' && socketStatus.document) {
      completedRef.current = true;
      setDocument(socketStatus.document);
      setTaskId(null);
    } else if (socketStatus.phase === 'failure') {
      completedRef.current = true;
      setError(socketStatus.error || 'Indexing failed');
      setTaskId(null);
    }
  }, [taskId, socketStatus.phase, socketStatus.progress, socketStatus.document, socketStatus.error, socketStatus.connected]);

  // Polling fallback: active when no socket events received within SOCKET_FALLBACK_MS
  const [pollingActive, setPollingActive] = useState(false);

  useEffect(() => {
    if (!taskId || completedRef.current) return;
    socketReceivedRef.current = false;

    // Start fallback timer
    fallbackTimerRef.current = setTimeout(() => {
      if (!socketReceivedRef.current) {
        setPollingActive(true);
      }
    }, SOCKET_FALLBACK_MS);

    return () => clearTimeout(fallbackTimerRef.current);
  }, [taskId]);

  const isPolling = pollingActive && !!taskId && !completedRef.current;

  const { data: taskData } = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => getTaskStatus(taskId),
    enabled: isPolling,
    refetchInterval: isPolling ? 1500 : false,
  });

  // Update local state from poll results
  useEffect(() => {
    if (!taskData) return;

    const taskPhase = taskData.phase || taskData.status?.toLowerCase();
    setPhase(taskPhase);
    setProgress(taskData.progress ?? PHASE_PROGRESS[taskPhase] ?? 50);

    if (taskData.status === 'SUCCESS' || taskPhase === 'completed') {
      completedRef.current = true;
      setPollingActive(false);
      setTaskId(null);
      setDocument(taskData.result?.document || taskData.result);
      setPhase('completed');
      setProgress(100);
    } else if (taskData.status === 'FAILURE') {
      completedRef.current = true;
      setPollingActive(false);
      setTaskId(null);
      setError(taskData.error || 'Task failed');
      setPhase('failure');
      setProgress(0);
    }
  }, [taskData]);

  // Mutation to trigger indexing
  const indexMutation = useMutation({
    mutationFn: ({ sessionId, url, name, file }) => indexDocument(sessionId, { url, name, file }),
    onSuccess: (data) => {
      if (data?.task_id) {
        // Async path — got a Celery task_id
        setTaskId(data.task_id);
        setPhase('queued');
        setProgress(5);
        setPollingActive(false);
        completedRef.current = false;
      } else if (data?.document || data) {
        // Synchronous path — document already indexed
        setDocument(data?.document || data);
        setPhase('completed');
        setProgress(100);
        completedRef.current = true;
      }
    },
    onError: (err) => {
      setError(err?.response?.data?.error || err.message || 'Indexing failed');
      setPhase('failure');
      setProgress(0);
    },
  });

  const indexFile = useCallback(
    (sessionId, fileEntry) => {
      setError(null);
      setDocument(null);
      setPhase('queued');
      setProgress(5);
      setPollingActive(false);
      completedRef.current = false;
      socketReceivedRef.current = false;
      indexMutation.mutate({
        sessionId,
        url: fileEntry.uploadedUrl,
        name: fileEntry.fileName,
        file: fileEntry.uploadedUrl ? null : fileEntry.localFile,
      });
    },
    [indexMutation]
  );

  const indexFileAsync = useCallback(
    async (sessionId, fileEntry) => {
      setError(null);
      setDocument(null);
      setPhase('queued');
      setProgress(5);
      setPollingActive(false);
      completedRef.current = false;
      socketReceivedRef.current = false;
      return await indexMutation.mutateAsync({
        sessionId,
        url: fileEntry.uploadedUrl,
        name: fileEntry.fileName,
        file: fileEntry.uploadedUrl ? null : fileEntry.localFile,
      });
    },
    [indexMutation]
  );

  const reset = useCallback(() => {
    setTaskId(null);
    setPhase(null);
    setProgress(0);
    setDocument(null);
    setError(null);
    setPollingActive(false);
    completedRef.current = false;
    socketReceivedRef.current = false;
  }, []);

  return {
    indexFile,
    indexFileAsync,
    phase,
    phaseLabel: PHASE_LABELS[phase] || null,
    progress,
    isIndexing: isPolling || indexMutation.isPending || (!!taskId && !completedRef.current),
    error,
    document,
    reset,
  };
}
