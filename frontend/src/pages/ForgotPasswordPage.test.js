import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ForgotPasswordPage from './ForgotPasswordPage';

// Mock apiClient so tests don't hit the network
jest.mock('../api/client', () => ({
  post: jest.fn(),
}));

// Mock the SVG logo to avoid Jest parse errors
jest.mock('../assets/logo.svg', () => 'logo.svg');

import apiClient from '../api/client';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/forgot-password']}>
      <ForgotPasswordPage />
    </MemoryRouter>
  );
}

describe('ForgotPasswordPage', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders the email field and submit button', () => {
    renderPage();
    expect(screen.getByPlaceholderText('Email')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument();
  });

  it('shows a validation error when submitted with no email', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));
    await waitFor(() => {
      expect(screen.getByText('Enter your email address.')).toBeInTheDocument();
    });
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('calls the API with the entered email on submit', async () => {
    apiClient.post.mockResolvedValueOnce({ data: { message: 'ok' } });
    renderPage();

    fireEvent.change(screen.getByPlaceholderText('Email'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/auth/forgot-password', {
        email: 'user@example.com',
      });
    });
  });

  it('shows the success message when API returns no reset_token', async () => {
    apiClient.post.mockResolvedValueOnce({ data: { message: 'ok' } });
    renderPage();

    fireEvent.change(screen.getByPlaceholderText('Email'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/check your email for a reset link/i)
      ).toBeInTheDocument();
    });
  });

  it('shows an error message when the API call fails', async () => {
    apiClient.post.mockRejectedValueOnce({
      response: { data: { detail: 'Server error' } },
    });
    renderPage();

    fireEvent.change(screen.getByPlaceholderText('Email'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument();
    });
  });
});
