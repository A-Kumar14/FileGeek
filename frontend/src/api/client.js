import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';

const apiClient = axios.create({
  baseURL: API_URL,
  withCredentials: true,  // send httpOnly refresh cookie on every request (needed for cross-origin Render+Vercel)
});

apiClient.interceptors.request.use((config) => {
  const poeKey = localStorage.getItem('filegeek-poe-key');
  if (poeKey) {
    config.headers['X-Poe-Api-Key'] = poeKey;
  }
  const token = localStorage.getItem('filegeek-token');
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    if (status === 429) {
      error.message = "You're sending messages too quickly. Please wait a moment before trying again.";
    }
    if (status >= 500) {
      const detail =
        error.response?.data?.detail ||
        error.response?.data?.message ||
        'Server error. Please try again.';
      window.dispatchEvent(new CustomEvent('api-error', { detail: { message: detail } }));
    }
    return Promise.reject(error);
  }
);

export default apiClient;
