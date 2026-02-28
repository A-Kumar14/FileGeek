import React from 'react';
import { render, screen } from '@testing-library/react';
import SkeletonLoader from './SkeletonLoader';

describe('SkeletonLoader', () => {
  it('renders without crashing', () => {
    render(<SkeletonLoader />);
  });

  it('shows PROCESSING... label when no phase is given', () => {
    render(<SkeletonLoader />);
    expect(screen.getByText(/PROCESSING\.\.\./)).toBeInTheDocument();
  });

  it('shows READING_DOCUMENT... for the "reading" phase', () => {
    render(<SkeletonLoader phase="reading" />);
    expect(screen.getByText(/READING_DOCUMENT\.\.\./)).toBeInTheDocument();
  });

  it('shows ANALYZING_CONTEXT... for the "analyzing" phase', () => {
    render(<SkeletonLoader phase="analyzing" />);
    expect(screen.getByText(/ANALYZING_CONTEXT\.\.\./)).toBeInTheDocument();
  });

  it('shows FORMULATING_ANSWER... for the "formulating" phase', () => {
    render(<SkeletonLoader phase="formulating" />);
    expect(screen.getByText(/FORMULATING_ANSWER\.\.\./)).toBeInTheDocument();
  });

  it('falls back to PROCESSING... for an unknown phase string', () => {
    render(<SkeletonLoader phase="unknown_phase" />);
    expect(screen.getByText(/PROCESSING\.\.\./)).toBeInTheDocument();
  });
});
