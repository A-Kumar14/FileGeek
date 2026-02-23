import { useCallback } from 'react';
import apiClient from '../api/client';

export default function useChat() {
  /**
   * Send a question with file entries.
   * - If files have uploadedUrl (UploadThing CDN) → JSON POST to /ask
   * - Otherwise fall back to FormData POST to /upload (old flow)
   */
  const sendMessage = useCallback(async (question, fileEntries, chatHistory, deepThink, model) => {
    const entries = Array.isArray(fileEntries) ? fileEntries : [fileEntries];
    const uploaded = entries.filter((e) => e.uploadedUrl);

    if (uploaded.length > 0) {
      // ── New flow: URLs via /ask ──
      const fileUrls = uploaded.map((e) => ({
        url: e.uploadedUrl,
        name: e.fileName,
        type: e.fileType,
      }));

      const payload = {
        fileUrls,
        question: question.trim(),
        chatHistory,
        deepThink: !!deepThink,
      };
      if (model) payload.model = model;

      const res = await apiClient.post('/ask', payload);

      return {
        answer: res.data.answer || 'No response received.',
        sources: res.data.sources || [],
      };
    }

    // ── Fallback: send raw files via /upload ──
    const formData = new FormData();
    const localFiles = entries.filter((e) => e.localFile).map((e) => e.localFile);
    localFiles.forEach((f, i) => {
      formData.append(`file_${i}`, f);
    });
    formData.append('fileCount', localFiles.length.toString());
    formData.append('question', question.trim());
    formData.append('chatHistory', JSON.stringify(chatHistory));
    if (deepThink) formData.append('deepThink', 'true');
    if (model) formData.append('model', model);

    const res = await apiClient.post('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });

    return {
      answer: res.data.answer || 'No response received.',
      sources: res.data.sources || [],
    };
  }, []);

  return { sendMessage };
}
