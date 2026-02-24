import React, { createContext, useState, useContext, useCallback, useEffect } from 'react';
import apiClient from '../api/client';

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

// Module-level access token ref — lives in memory, not localStorage
// Survives React re-renders but is cleared on hard refresh (good — forces re-login or refresh)
let _accessToken = null;

/** Expose the current access token for use by the SSE fetch() call in sessions.js */
export function getAccessToken() {
  return _accessToken || localStorage.getItem('filegeek-token') || null;
}

function decodeJwtPayload(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

function isTokenExpired(token) {
  const payload = decodeJwtPayload(token);
  if (!payload || !payload.exp) return true;
  // Consider expired 30s before actual expiry (clock skew buffer)
  return Date.now() >= (payload.exp - 30) * 1000;
}

// ── Axios interceptor for silent token refresh ─────────────────────────────────
let _isRefreshing = false;
let _refreshQueue = [];

function processQueue(error, token = null) {
  _refreshQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve(token);
  });
  _refreshQueue = [];
}

// Attach once at module load time so the interceptor persists across renders
apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config;
    // Only intercept 401s that haven't already been retried and aren't the refresh call itself
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/refresh') &&
      !originalRequest.url?.includes('/auth/login') &&
      !originalRequest.url?.includes('/auth/signup')
    ) {
      if (_isRefreshing) {
        // Queue subsequent requests until refresh completes
        return new Promise((resolve, reject) => {
          _refreshQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers['Authorization'] = `Bearer ${token}`;
          return apiClient(originalRequest);
        });
      }

      originalRequest._retry = true;
      _isRefreshing = true;

      try {
        const res = await apiClient.post('/auth/refresh', {}, { withCredentials: true });
        const newToken = res.data.access_token;
        _accessToken = newToken;
        localStorage.setItem('filegeek-token', newToken); // keep legacy compat
        apiClient.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
        originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
        processQueue(null, newToken);
        return apiClient(originalRequest);
      } catch (refreshErr) {
        processQueue(refreshErr, null);
        _accessToken = null;
        // Signal auth failure — AuthContext useEffect will pick this up
        window.dispatchEvent(new CustomEvent('fg:auth:expired'));
        return Promise.reject(refreshErr);
      } finally {
        _isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);

/**
 * Extract a human-readable error message from an Axios error.
 * FastAPI returns { detail: "string" } for HTTPException (401, 409, etc.)
 * and { detail: [{msg: "...", loc: [...]}] } for validation errors (422).
 */
function _extractAuthError(err, defaultMsg) {
  const data = err.response?.data;
  if (!data) return err.message || defaultMsg;
  const { detail, error } = data;
  if (Array.isArray(detail) && detail.length > 0) {
    // Pydantic validation error — strip the "Value error, " prefix added by Pydantic v2
    return (detail[0]?.msg || defaultMsg).replace(/^Value error,\s*/i, '');
  }
  if (typeof detail === 'string') return detail;
  if (typeof error === 'string') return error;
  return err.message || defaultMsg;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('filegeek-user');
    return stored ? JSON.parse(stored) : null;
  });

  // On mount: restore legacy token into memory and validate
  useEffect(() => {
    const token = localStorage.getItem('filegeek-token');
    if (token) {
      if (isTokenExpired(token)) {
        // Try silent refresh via cookie
        apiClient.post('/auth/refresh', {}, { withCredentials: true })
          .then((res) => {
            _accessToken = res.data.access_token;
            localStorage.setItem('filegeek-token', res.data.access_token);
            apiClient.defaults.headers.common['Authorization'] = `Bearer ${res.data.access_token}`;
          })
          .catch(() => {
            // Refresh failed — clear stale state
            localStorage.removeItem('filegeek-token');
            localStorage.removeItem('filegeek-user');
            setUser(null);
          });
      } else {
        _accessToken = token;
        apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      }
    }
  }, []);

  // Listen for global auth-expiry signal from the interceptor
  useEffect(() => {
    const handler = () => {
      localStorage.removeItem('filegeek-token');
      localStorage.removeItem('filegeek-user');
      setUser(null);
    };
    window.addEventListener('fg:auth:expired', handler);
    return () => window.removeEventListener('fg:auth:expired', handler);
  }, []);

  const login = useCallback(async (email, password) => {
    try {
      const res = await apiClient.post('/auth/login', { email, password }, { withCredentials: true });
      const { token, access_token, user: userData } = res.data;
      // Prefer short-lived access_token from new backend; fall back to legacy token
      const activeToken = access_token || token;
      _accessToken = activeToken;
      localStorage.setItem('filegeek-token', activeToken);
      localStorage.setItem('filegeek-user', JSON.stringify(userData));
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${activeToken}`;
      setUser(userData);
    } catch (err) {
      throw new Error(_extractAuthError(err, 'Login failed'));
    }
  }, []);

  const signup = useCallback(async (name, email, password) => {
    try {
      const res = await apiClient.post('/auth/signup', { name, email, password }, { withCredentials: true });
      const { token, access_token, user: userData } = res.data;
      const activeToken = access_token || token;
      _accessToken = activeToken;
      localStorage.setItem('filegeek-token', activeToken);
      localStorage.setItem('filegeek-user', JSON.stringify(userData));
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${activeToken}`;
      setUser(userData);
    } catch (err) {
      throw new Error(_extractAuthError(err, 'Sign up failed'));
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiClient.post('/auth/logout', {}, { withCredentials: true });
    } catch { }
    _accessToken = null;
    delete apiClient.defaults.headers.common['Authorization'];
    localStorage.removeItem('filegeek-token');
    localStorage.removeItem('filegeek-user');
    setUser(null);
  }, []);

  const isAuthenticated = !!user;
  const oidcEnabled = !!process.env.REACT_APP_OIDC_PROVIDER;

  return (
    <AuthContext.Provider value={{ user, login, signup, logout, isAuthenticated, oidcEnabled }}>
      {children}
    </AuthContext.Provider>
  );
}

