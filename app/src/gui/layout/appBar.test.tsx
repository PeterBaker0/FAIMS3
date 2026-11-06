// SPDX-License-Identifier: Apache-2.0
import {createTheme, ThemeProvider} from '@mui/material/styles';
import {fireEvent, render, screen} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const harness = vi.hoisted(() => ({
  authenticated: true,
}));

vi.mock('../../context/store', () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
}));

vi.mock('../../context/slices/authSlice', () => ({
  selectIsAuthenticated: () => harness.authenticated,
}));

vi.mock('../../context/slices/projectSlice', () => ({
  selectActiveServerProjects: () => [],
}));

vi.mock('../components/alert', () => ({default: () => null}));
vi.mock('../components/app-bar/app-bar-heading', () => ({
  AppBarHeading: () => null,
}));
vi.mock('../components/authentication/appbarAuth', () => ({
  default: () => null,
}));
vi.mock('../../sync/sync-state', () => ({default: () => null}));
vi.mock('../components/feedback/FeedbackDialog', () => ({
  FeedbackDialog: ({open}: {open: boolean}) =>
    open ? <div data-testid="app-feedback-dialog-open" /> : null,
}));

import MainAppBar from './appBar';

function renderBar() {
  return render(
    <MemoryRouter>
      <ThemeProvider theme={createTheme()}>
        <MainAppBar />
      </ThemeProvider>
    </MemoryRouter>
  );
}

describe('MainAppBar feedback item', () => {
  beforeEach(() => {
    harness.authenticated = true;
  });

  it('shows Feedback next to About Build when signed in', () => {
    renderBar();
    fireEvent.click(screen.getByLabelText('open drawer'));
    expect(screen.getByTestId('app-feedback-button')).toBeTruthy();
    expect(screen.getByText('About Build')).toBeTruthy();
  });

  it('hides Feedback when signed out', () => {
    harness.authenticated = false;
    renderBar();
    fireEvent.click(screen.getByLabelText('open drawer'));
    expect(screen.queryByTestId('app-feedback-button')).toBeNull();
    expect(screen.getByText('About Build')).toBeTruthy();
  });
});
