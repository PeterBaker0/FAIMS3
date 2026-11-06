// SPDX-License-Identifier: Apache-2.0
import {createTheme, ThemeProvider} from '@mui/material/styles';
import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {FeedbackDialog} from './FeedbackDialog';

const harness = vi.hoisted(() => ({
  isOnline: true,
  postFeedback: vi.fn().mockResolvedValue({message: 'Feedback sent'}),
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

vi.mock('../../../utils/customHooks', () => ({
  useIsOnline: () => ({
    isOnline: harness.isOnline,
    checkIsOnline: () => harness.isOnline,
    fallback: null,
  }),
}));

vi.mock('../../../utils/apiOperations/client', () => ({
  postFeedback: (...args: unknown[]) => harness.postFeedback(...args),
}));

vi.mock('../../../context/popup', () => ({
  useNotification: () => ({
    showSuccess: harness.showSuccess,
    showError: harness.showError,
    showInfo: vi.fn(),
    showWarning: vi.fn(),
  }),
}));

vi.mock('../../../context/store', () => ({
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({
      auth: {
        activeUser: {
          serverId: 'server-1',
          username: 'ada',
          token: 'token',
        },
      },
    }),
}));

vi.mock('../../../context/slices/authSlice', () => ({
  selectActiveUser: (state: {
    auth: {activeUser: {serverId: string; username: string}};
  }) => state.auth.activeUser,
}));

function renderDialog(open = true) {
  return render(
    <ThemeProvider theme={createTheme()}>
      <FeedbackDialog open={open} onClose={vi.fn()} />
    </ThemeProvider>
  );
}

describe('FeedbackDialog', () => {
  beforeEach(() => {
    harness.isOnline = true;
    harness.postFeedback.mockClear();
    harness.postFeedback.mockResolvedValue({message: 'Feedback sent'});
    harness.showSuccess.mockClear();
    harness.showError.mockClear();
  });

  it('POSTs source app on submit', async () => {
    const onClose = vi.fn();
    render(
      <ThemeProvider theme={createTheme()}>
        <FeedbackDialog open onClose={onClose} />
      </ThemeProvider>
    );
    fireEvent.change(screen.getByTestId('app-feedback-message'), {
      target: {value: 'The record list is slow.'},
    });
    fireEvent.click(screen.getByTestId('app-feedback-send'));

    await waitFor(() => expect(harness.postFeedback).toHaveBeenCalledTimes(1));
    const arg = harness.postFeedback.mock.calls[0][0] as {
      listingId: string;
      username: string;
      body: {message: string; source: string};
    };
    expect(arg.listingId).toBe('server-1');
    expect(arg.username).toBe('ada');
    expect(arg.body.source).toBe('app');
    expect(arg.body.message).toBe('The record list is slow.');
    await waitFor(() =>
      expect(harness.showSuccess).toHaveBeenCalledWith(
        'Thanks for your feedback.'
      )
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('disables Send when offline and does not POST', () => {
    harness.isOnline = false;
    renderDialog();
    expect(screen.getByText(/network connection is required/i)).toBeTruthy();
    fireEvent.change(screen.getByTestId('app-feedback-message'), {
      target: {value: 'Offline note'},
    });
    expect(
      (screen.getByTestId('app-feedback-send') as HTMLButtonElement).disabled
    ).toBe(true);
    fireEvent.click(screen.getByTestId('app-feedback-send'));
    expect(harness.postFeedback).not.toHaveBeenCalled();
  });

  it('does not POST an empty message', () => {
    renderDialog();
    fireEvent.click(screen.getByTestId('app-feedback-send'));
    expect(harness.postFeedback).not.toHaveBeenCalled();
  });
});
