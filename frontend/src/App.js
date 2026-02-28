import React, { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import queryClient from './api/queryClient';
import './App.css';
import { AuthProvider } from './contexts/AuthContext';
import { FileProvider } from './contexts/FileContext';
import { ChatProvider } from './contexts/ChatContext';
import { ModelProvider } from './contexts/ModelContext';
import { AnnotationProvider } from './contexts/AnnotationContext';
import PrivateRoute from './components/PrivateRoute';
import GlobalErrorToast from './components/GlobalErrorToast';
import AddToHomeScreenPrompt from './components/AddToHomeScreenPrompt';

const LoginPage            = lazy(() => import('./pages/LoginPage'));
const SignUpPage           = lazy(() => import('./pages/SignUpPage'));
const ForgotPasswordPage   = lazy(() => import('./pages/ForgotPasswordPage'));
const ResetPasswordPage    = lazy(() => import('./pages/ResetPasswordPage'));
const SettingsPage         = lazy(() => import('./pages/SettingsPage'));
const MainLayout           = lazy(() => import('./pages/MainLayout'));
const AnalyticsPage        = lazy(() => import('./pages/AnalyticsPage'));
const ReviewQueuePage      = lazy(() => import('./pages/ReviewQueuePage'));
const ExplorePage          = lazy(() => import('./pages/ExplorePage'));
const NotFoundPage         = lazy(() => import('./pages/NotFoundPage'));

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignUpPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/settings" element={<PrivateRoute><SettingsPage /></PrivateRoute>} />
      <Route path="/" element={<PrivateRoute><MainLayout /></PrivateRoute>} />
      <Route path="/analytics" element={<PrivateRoute><AnalyticsPage /></PrivateRoute>} />
      <Route path="/review" element={<PrivateRoute><ReviewQueuePage /></PrivateRoute>} />
      <Route path="/explore" element={<PrivateRoute><ExplorePage /></PrivateRoute>} />
      <Route path="*" element={<NotFoundPage />} />
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
                <GlobalErrorToast />
                <AddToHomeScreenPrompt />
              </AnnotationProvider>
            </ChatProvider>
          </FileProvider>
        </ModelProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
