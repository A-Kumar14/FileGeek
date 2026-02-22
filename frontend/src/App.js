import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import queryClient from './api/queryClient';
import './App.css';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { FileProvider } from './contexts/FileContext';
import { ChatProvider } from './contexts/ChatContext';
import { PersonaProvider } from './contexts/PersonaContext';
import { ModelProvider } from './contexts/ModelContext';
import { AnnotationProvider } from './contexts/AnnotationContext';
import LoginPage from './pages/LoginPage';
import SignUpPage from './pages/SignUpPage';
import SettingsPage from './pages/SettingsPage';
import MainLayout from './pages/MainLayout';
import AnalyticsPage from './pages/AnalyticsPage';
import ReviewQueuePage from './pages/ReviewQueuePage';

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
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <PersonaProvider>
          <ModelProvider>
            <FileProvider>
              <ChatProvider>
                <AnnotationProvider>
                  <a href="#main-content" className="skip-to-content">Skip to content</a>
                  <AppRoutes />
                </AnnotationProvider>
              </ChatProvider>
            </FileProvider>
          </ModelProvider>
        </PersonaProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
