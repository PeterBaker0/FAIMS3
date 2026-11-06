// SPDX-License-Identifier: Apache-2.0
import {INPUT_LIMITS} from '@faims3/data-model';
import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {feedbackPageUrl} from '@/lib/feedback-page-url';
import {FeedbackDialog} from './feedback-dialog';

const postFeedback = vi.hoisted(() =>
  vi.fn().mockResolvedValue({message: 'Feedback sent'})
);

vi.mock('@/hooks/queries', () => ({
  postFeedback: (...args: unknown[]) => postFeedback(...args),
}));

const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: vi.fn(),
  },
}));

const mockUser = {
  token: 'test-token',
  refreshToken: 'refresh',
  decodedToken: null,
  user: {id: 'u1', name: 'Ada', email: 'ada@example.com', isVerified: true},
};

vi.mock('@/context/auth-provider', () => ({
  useAuth: () => ({user: mockUser}),
}));

describe('FeedbackDialog', () => {
  beforeEach(() => {
    postFeedback.mockClear();
    postFeedback.mockResolvedValue({message: 'Feedback sent'});
    toastSuccess.mockClear();
  });

  it('renders the header Feedback control', () => {
    render(<FeedbackDialog />);
    expect(screen.getByTestId('web-feedback-button').textContent).toMatch(
      /Feedback/
    );
  });

  it('opens a dialog, POSTs source control-centre, shows a success toast, and closes', async () => {
    render(<FeedbackDialog />);
    fireEvent.click(screen.getByTestId('web-feedback-button'));
    expect(screen.getByText('Send feedback')).toBeTruthy();

    fireEvent.change(screen.getByTestId('web-feedback-message'), {
      target: {value: 'The header docs link is confusing.'},
    });
    fireEvent.click(screen.getByTestId('web-feedback-send'));

    await waitFor(() => expect(postFeedback).toHaveBeenCalledTimes(1));
    const payload = postFeedback.mock.calls[0][0] as {
      user: typeof mockUser;
      data: {message: string; source: string; pageUrl: string};
    };
    expect(payload.user).toBe(mockUser);
    expect(payload.data.message).toBe('The header docs link is confusing.');
    expect(payload.data.source).toBe('control-centre');
    expect(typeof payload.data.pageUrl).toBe('string');
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith('Thanks for your feedback.')
    );
    await waitFor(() => expect(screen.queryByText('Send feedback')).toBeNull());
  });

  it('keeps the dialog open on error', async () => {
    postFeedback.mockRejectedValueOnce(new Error('Internal Server Error'));
    render(<FeedbackDialog />);
    fireEvent.click(screen.getByTestId('web-feedback-button'));
    fireEvent.change(screen.getByTestId('web-feedback-message'), {
      target: {value: 'Still broken'},
    });
    fireEvent.click(screen.getByTestId('web-feedback-send'));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(
        /Internal Server Error/
      )
    );
    expect(screen.getByText('Send feedback')).toBeTruthy();
  });

  it('does not POST an empty message', () => {
    render(<FeedbackDialog />);
    fireEvent.click(screen.getByTestId('web-feedback-button'));
    fireEvent.click(screen.getByTestId('web-feedback-send'));
    expect(postFeedback).not.toHaveBeenCalled();
  });
});

describe('feedbackPageUrl', () => {
  it('strips exchangeToken and truncates', () => {
    const href =
      'https://web.example.org/projects/1?exchangeToken=secret&keep=1';
    expect(feedbackPageUrl(href)).toBe(
      'https://web.example.org/projects/1?keep=1'
    );
    expect(
      feedbackPageUrl('https://example.org/' + 'a'.repeat(3000)).length
    ).toBe(INPUT_LIMITS.REDIRECT_URL_MAX_LENGTH);
  });
});
