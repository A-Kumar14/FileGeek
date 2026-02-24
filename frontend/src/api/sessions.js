import apiClient from './client';

export async function listSessions() {
  const res = await apiClient.get('/sessions');
  return res.data.sessions;
}

export async function createSession({ title }) {
  const res = await apiClient.post('/sessions', { title });
  return res.data.session;
}

export async function getSession(sessionId) {
  const res = await apiClient.get(`/sessions/${sessionId}`);
  return res.data.session;
}

export async function deleteSession(sessionId) {
  await apiClient.delete(`/sessions/${sessionId}`);
}

export async function indexDocument(sessionId, config) {
  const token = localStorage.getItem('filegeek-token');
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  let data;
  if (config.file) {
    const formData = new FormData();
    formData.append('file', config.file);
    data = formData;
  } else {
    headers['Content-Type'] = 'application/json';
    data = JSON.stringify({ url: config.url, name: config.name });
  }

  // Use fetch instead of apiClient to easily manage browser-native FormData boundaries
  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';
  const res = await fetch(`${API_URL}/sessions/${sessionId}/documents`, {
    method: 'POST',
    headers,
    body: data,
  });

  const resData = await res.json();
  if (!res.ok) throw new Error(resData.error || 'Failed to index document');
  return resData;
}

export async function sendSessionMessage(sessionId, { question, deepThink, model, onChunk, onStatus }) {
  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';
  const token = localStorage.getItem('filegeek-token');

  const response = await fetch(`${API_URL}/sessions/${sessionId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ question, deepThink: !!deepThink, model }),
  });

  if (!response.ok) {
    let errorMsg = `Server error: ${response.status}`;
    try {
      const errData = await response.json();
      errorMsg = errData.error || errorMsg;
    } catch { }
    throw Object.assign(new Error(errorMsg), { response: { status: response.status, data: { error: errorMsg } } });
  }

  const contentType = response.headers.get('content-type') || '';

  // SSE streaming path
  if (contentType.includes('text/event-stream') && onChunk && response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalData = null;

    // Capture artifacts from the early dedicated event so they are not
    // lost if the connection drops before the final 'done' frame.
    let earlyArtifacts = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            // Heartbeat — ignore silently (keeps proxy alive)
            if (data.type === 'heartbeat') continue;
            // Progress events — surface to caller
            if (data.type === 'status' || data.type === 'tool_start' || data.type === 'tool_done') {
              if (onStatus) onStatus(data);
              continue;
            }
            if (data.chunk !== undefined && onChunk) onChunk(data.chunk);
            // Capture early artifacts event (emitted before text chunks)
            if (data.artifacts && !data.done) {
              earlyArtifacts = data.artifacts;
            }
            if (data.done) finalData = data;
          } catch { }
        }
      }
    }
    if (finalData) {
      // Prefer artifacts from done event (most complete); fall back to early capture
      const artifacts = (finalData.artifacts && finalData.artifacts.length > 0)
        ? finalData.artifacts
        : earlyArtifacts;
      return {
        answer: finalData.answer || '',
        message_id: finalData.message_id,
        sources: finalData.sources || [],
        artifacts,
        suggestions: finalData.suggestions || [],
      };
    }
    // Connection dropped before done — return what we have from early events
    if (earlyArtifacts.length > 0) {
      return { answer: '', message_id: null, sources: [], artifacts: earlyArtifacts, suggestions: [] };
    }
    return null;
  }

  // Regular JSON path (Flask fallback / non-streaming)
  return response.json();
}

export async function sendFeedback(messageId, feedback) {
  await apiClient.post(`/messages/${messageId}/feedback`, { feedback });
}

export async function transcribeAudio(file) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await apiClient.post('/transcribe', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data.transcript;
}

export async function getTaskStatus(taskId) {
  const res = await apiClient.get(`/tasks/${taskId}`);
  return res.data;
}

export async function getS3PresignedUrl(fileName, contentType) {
  const res = await apiClient.post('/s3/presign', { fileName, contentType });
  return res.data;
}
