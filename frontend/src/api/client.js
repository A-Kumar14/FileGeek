import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';

const apiClient = axios.create({
  baseURL: API_URL,
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

export default apiClient;
