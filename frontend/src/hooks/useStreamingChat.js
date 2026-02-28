import { useState, useCallback, useRef } from 'react';
import { sendSessionMessage } from '../api/sessions';
import useChat from './useChat';

const TOOL_LABELS = {
  search_documents: 'Searching documents…',
  generate_quiz: 'Generating quiz…',
  generate_flashcards: 'Creating flashcards…',
  create_study_guide: 'Building study guide…',
  generate_visualization: 'Creating visualization…',
};

/**
 * Manages SSE streaming state and the full sendMessage flow.
 *
 * Accepts session/message state as parameters so it can be composed into
 * ChatContext without circular dependencies.
 */
export default function useStreamingChat({
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
}) {
  const [streamingContent, setStreamingContent] = useState(null);
  const [streamingStatus, setStreamingStatus] = useState(null);
  const stopGenerationRef = useRef(false);
  const { sendMessage: apiSendMessage } = useChat();

  const sendMessage = useCallback(async (question, overrideModel = null) => {
    if (!question.trim()) return;

    const allFiles = fileCtx?.files || [];
    const filesToUpload = allFiles.filter((entry) => entry.localFile && !entry.uploadedUrl);

    let sessionId = activeSessionId;
    if (!sessionId) {
      const defaultName = (fileCtx?.file && typeof fileCtx.file !== 'string') ? fileCtx.file.name : 'New Chat';
      const defaultType = fileCtx?.fileType || 'general';
      sessionId = await startNewSession(defaultName, defaultType);
    }

    for (const entry of filesToUpload) {
      await indexDocumentToSession(sessionId, entry);
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
              setStreamingStatus(null);
            },
            onStatus: (evt) => {
              if (stopGenerationRef.current) return;
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

      if (!result || !result.answer) {
        result = {
          answer: 'No response was received. The request may have timed out — please try again.',
          sources: [],
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
      saveCurrentSession(sessionId, finalMessages);

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
        errorMsg = err.response.data?.error || `Server error: ${err.response.status}`;
      } else if (err.request) {
        errorMsg = 'Cannot reach server. Please check your connection and API URL configuration.';
      } else {
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
      saveCurrentSession(sessionId, finalMessages);
    } finally {
      setLoading(false);
      stopLoadingPhases();
    }
  }, [
    activeSessionId, messages, fileCtx, deepThinkEnabled, selectedModel,
    apiSendMessage, startNewSession, saveCurrentSession,
    startLoadingPhases, stopLoadingPhases, indexDocumentToSession,
    setMessages, setLoading, setArtifacts, setSuggestions, queryClient,
  ]);

  const stopGeneration = useCallback(() => {
    stopGenerationRef.current = true;
    setStreamingContent(null);
    setStreamingStatus(null);
  }, []);

  return { streamingContent, streamingStatus, sendMessage, stopGeneration };
}
