// SPDX-License-Identifier: Apache-2.0
import '@testing-library/jest-dom';
import {
  CURRENT_NOTEBOOK_UI_SCHEMA_VERSION,
  type UiSpecModel,
} from '@faims3/data-model';
import {createTheme, ThemeProvider} from '@mui/material/styles';
import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {addAlert} from '../../../../context/slices/alertSlice';
import type {Project, SyncMode} from '../../../../context/slices/projectSlice';
import {
  startSyncingAttachments,
  stopSyncingAttachments,
} from '../../../../context/slices/projectSlice';

const PROJECT_ID = 'survey-1';
const SERVER_ID = 'server-1';

const TITLE = 'Download attachments from other devices?';
const ENABLED_HELPER =
  "Do you want to download attachments from other users' devices? Doing so will increase data usage and load on your device. We recommend leaving this off.";
const DISABLED_HELPER =
  'Attachment download requires two-way sync. Change sync mode above to enable this option.';
const DOWNLOAD_ALERT = 'Downloading attachments to device...';

const harness = vi.hoisted(() => ({
  dispatch: vi.fn(),
  navigate: vi.fn(),
  project: undefined as unknown as Project,
}));

vi.mock('../../../../context/store', () => ({
  useAppDispatch: () => harness.dispatch,
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({
      projects: {
        servers: {
          [SERVER_ID]: {
            serverId: SERVER_ID,
            listed: {},
            activated: {
              [PROJECT_ID]: harness.project,
            },
          },
        },
      },
    }),
}));

vi.mock('react-router-dom', async () => {
  const actual =
    await vi.importActual<typeof import('react-router-dom')>(
      'react-router-dom'
    );
  return {
    ...actual,
    useNavigate: () => harness.navigate,
    useParams: () => ({projectId: PROJECT_ID}),
  };
});

vi.mock('./quickShare', () => ({default: () => null}));
vi.mock('./auto_incrementers', () => ({default: () => null}));
vi.mock('./contextualLayerSettings', () => ({default: () => null}));
vi.mock('./offlineMapSettings', () => ({default: () => null}));
vi.mock('./sync_switch', () => ({default: () => null}));
vi.mock('./syncModeHelpDialog', () => ({default: () => null}));

import NotebookSettings from './index';

const uiSpec = {
  fields: {},
  views: {},
  viewsets: {},
  visible_types: [],
  settings: {showQrCodeButton: false},
  schemaVersion: CURRENT_NOTEBOOK_UI_SCHEMA_VERSION,
} as UiSpecModel;

function activatedProject(
  syncMode: SyncMode,
  isSyncingAttachments = false
): Project {
  return {
    projectId: PROJECT_ID,
    serverId: SERVER_ID,
    isActivated: true,
    name: 'Creek survey',
    database: {
      syncMode,
      isSyncingAttachments,
      localDbId: 'local-1',
      remote: {
        remoteDbId: 'remote-1',
        syncId: 'sync-1',
        connectionConfiguration: {},
      },
    },
  } as Project;
}

function settingsTree() {
  return (
    <ThemeProvider theme={createTheme()}>
      <NotebookSettings uiSpec={uiSpec} />
    </ThemeProvider>
  );
}

function renderSettings(project: Project) {
  harness.project = project;
  return render(settingsTree());
}

describe('NotebookSettings attachment panel', () => {
  beforeEach(() => {
    harness.dispatch.mockReset();
    harness.navigate.mockReset();
    harness.project = activatedProject('both');
  });

  it('shows the new title and enabled subtext when sync mode includes pull', () => {
    renderSettings(activatedProject('both'));

    expect(screen.getByRole('heading', {name: TITLE})).toBeInTheDocument();
    expect(screen.getByText(ENABLED_HELPER)).toBeInTheDocument();
    expect(
      screen.queryByText('Get attachments from other devices')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/This control is app and device specific/)
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Fieldmark™/)).not.toBeInTheDocument();
    expect(screen.queryByText(/resource intensive/)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/minimise network usage/)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/This setting will not affect uploading/)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Applies to this device only/)
    ).not.toBeInTheDocument();
    expect(screen.getByText('Off')).toBeInTheDocument();
    expect(screen.getByRole('switch')).not.toBeDisabled();
    expect(screen.getByRole('switch')).not.toBeChecked();
  });

  it.each(['push', 'none'] as const)(
    'keeps the new title, disables the switch, and shows the two-way-sync helper when syncMode is %s',
    syncMode => {
      renderSettings(activatedProject(syncMode));

      expect(screen.getByRole('heading', {name: TITLE})).toBeInTheDocument();
      expect(screen.getByText(DISABLED_HELPER)).toBeInTheDocument();
      expect(screen.queryByText(ENABLED_HELPER)).not.toBeInTheDocument();
      expect(screen.getByRole('switch')).toBeDisabled();
      expect(screen.getByText('Off')).toBeInTheDocument();
    }
  );

  it('labels the switch On when attachments are already syncing', () => {
    renderSettings(activatedProject('both', true));

    expect(screen.getByText('On')).toBeInTheDocument();
    expect(screen.queryByText('Off')).not.toBeInTheDocument();
    expect(screen.getByRole('switch')).toBeChecked();
    expect(screen.getByRole('switch')).not.toBeDisabled();
  });

  it('dispatches start then stop attachment sync and the download alert', async () => {
    const user = userEvent.setup();
    const view = renderSettings(activatedProject('both'));

    await user.click(screen.getByRole('switch'));

    expect(harness.dispatch).toHaveBeenCalledWith(
      startSyncingAttachments({
        projectId: PROJECT_ID,
        serverId: SERVER_ID,
      })
    );
    expect(harness.dispatch).toHaveBeenCalledWith(
      addAlert({
        message: DOWNLOAD_ALERT,
        severity: 'success',
      })
    );

    harness.dispatch.mockClear();
    harness.project = activatedProject('both', true);
    view.rerender(settingsTree());

    expect(screen.getByText('On')).toBeInTheDocument();
    await user.click(screen.getByRole('switch'));

    expect(harness.dispatch).toHaveBeenCalledWith(
      stopSyncingAttachments({
        projectId: PROJECT_ID,
        serverId: SERVER_ID,
      })
    );
    expect(harness.dispatch).not.toHaveBeenCalledWith(
      addAlert({
        message: DOWNLOAD_ALERT,
        severity: 'success',
      })
    );
  });
});
