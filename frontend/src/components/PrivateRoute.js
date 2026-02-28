import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/**
 * Wraps a route element and redirects unauthenticated users to /login.
 * Usage: <Route path="/foo" element={<PrivateRoute><FooPage /></PrivateRoute>} />
 */
export default function PrivateRoute({ children }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}
