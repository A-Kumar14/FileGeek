import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import queryClient from './api/queryClient';
import './App.css';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { FileProvider } from './contexts/FileContext';
import { ChatProvider } from './contexts/ChatContext';
import { ModelProvider } from './contexts/ModelContext';
import { AnnotationProvider } from './contexts/AnnotationContext';

const LoginPage       = lazy(() => import('./pages/LoginPage'));
const SignUpPage      = lazy(() => import('./pages/SignUpPage'));
const SettingsPage    = lazy(() => import('./pages/SettingsPage'));
const MainLayout      = lazy(() => import('./pages/MainLayout'));
const AnalyticsPage   = lazy(() => import('./pages/AnalyticsPage'));
const ReviewQueuePage = lazy(() => import('./pages/ReviewQueuePage'));
const ExplorePage     = lazy(() => import('./pages/ExplorePage'));

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignUpPage />} />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <SettingsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      />
      <Route
        path="/analytics"
        element={
          <ProtectedRoute>
            <AnalyticsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/review"
        element={
          <ProtectedRoute>
            <ReviewQueuePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/explore"
        element={
          <ProtectedRoute>
            <ExplorePage />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ModelProvider>
          <FileProvider>
            <ChatProvider>
              <AnnotationProvider>
                <a href="#main-content" className="skip-to-content">Skip to content</a>
                <Suspense fallback={null}>
                  <AppRoutes />
                </Suspense>
              </AnnotationProvider>
            </ChatProvider>
          </FileProvider>
        </ModelProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
