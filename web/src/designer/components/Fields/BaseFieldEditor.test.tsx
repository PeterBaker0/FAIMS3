// SPDX-License-Identifier: Apache-2.0
/**
 * Export-name edits write `exportName` only; the storage key stays put.
 */

import {ThemeProvider} from '@mui/material/styles';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import {ReactNode} from 'react';
import {Provider} from 'react-redux';
import {ActionCreators} from 'redux-undo';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  createDesignerStore,
  type DesignerStore,
} from '../../createDesignerStore';
import {getFieldSpec} from '../../fields';
import {DesignerEditingProvider} from '../../state/editing-context';
import {CURRENT_NOTEBOOK_UI_SCHEMA_VERSION} from '../../state/initial';
import {fieldRenamed, loaded} from '../../store/slices/uiSpec';
import globalTheme from '../../theme/index';
import {ConditionType} from '../../types/condition';
import {flushPendingDesignerEdits} from '../../state/pendingEditFlush';
import {BaseFieldEditor} from './BaseFieldEditor';
import {RichTextEditor} from './RichTextEditor';

vi.mock('../mdx-editor', () => ({
  MdxEditor: () => null,
}));

const STORAGE_ID = 'f_abc123';
const DESIGNER_ID = 'designer-id-1';
/** DebouncedTextField (200ms) + first-edit export-name sync (700ms). */
const LABEL_AUTO_SYNC_MS = 900;

const WithProviders = ({
  children,
  store,
  originalFieldIdentifiers,
}: {
  children: ReactNode;
  store: DesignerStore;
  originalFieldIdentifiers?: ReadonlySet<string>;
}) => (
  <ThemeProvider theme={globalTheme}>
    <Provider store={store}>
      <DesignerEditingProvider value={{originalFieldIdentifiers}}>
        {children}
      </DesignerEditingProvider>
    </Provider>
  </ThemeProvider>
);

function storeWithTextField() {
  const store = createDesignerStore();
  const field = getFieldSpec('TextField');
  field['component-parameters'].name = STORAGE_ID;
  field['component-parameters'].label = 'Site Name';
  field.exportName = 'Site-Name';
  field.designerIdentifier = DESIGNER_ID;

  store.dispatch(
    loaded({
      fields: {[STORAGE_ID]: field},
      views: {
        sectionA: {label: 'Section A', fields: [STORAGE_ID]},
      },
      viewsets: {
        formA: {label: 'Form A', views: ['sectionA'], summary_fields: []},
      },
      visible_types: ['formA'],
      settings: {showQrCodeButton: false},
      schemaVersion: CURRENT_NOTEBOOK_UI_SCHEMA_VERSION,
    })
  );
  return store;
}

describe('BaseFieldEditor export name', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('dispatches fieldRenamed with newExportName and leaves the storage key in place', () => {
    const store = storeWithTextField();

    render(
      <WithProviders store={store}>
        <BaseFieldEditor fieldName={STORAGE_ID} showHelperText={false} />
      </WithProviders>
    );

    const exportInput = screen.getByPlaceholderText('Enter export name');
    fireEvent.change(exportInput, {target: {value: 'Observation-Notes'}});
    fireEvent.blur(exportInput);

    const fields = store.getState().notebook.uiSpec.present.fields;
    expect(fields[STORAGE_ID]).toBeDefined();
    expect(fields['Observation-Notes']).toBeUndefined();
    expect(fields[STORAGE_ID].exportName).toBe('Observation-Notes');
    expect(fields[STORAGE_ID]['component-parameters'].name).toBe(STORAGE_ID);
    expect(
      store.getState().notebook.uiSpec.present.views.sectionA.fields
    ).toEqual([STORAGE_ID]);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(
      screen.queryByText(/cannot be changed|existing records|Field ID/i)
    ).toBeNull();
  });

  it('reverts punctuation-only export names instead of persisting an empty slug', () => {
    const store = storeWithTextField();

    render(
      <WithProviders store={store}>
        <BaseFieldEditor fieldName={STORAGE_ID} showHelperText={false} />
      </WithProviders>
    );

    const exportInput = screen.getByPlaceholderText('Enter export name');
    fireEvent.change(exportInput, {target: {value: '!!!'}});
    fireEvent.blur(exportInput);

    const fields = store.getState().notebook.uiSpec.present.fields;
    expect(fields[STORAGE_ID].exportName).toBe('Site-Name');
    expect((exportInput as HTMLInputElement).value).toBe('Site-Name');
  });

  it('keeps later keystrokes after a debounce pause updates exportName', () => {
    vi.useFakeTimers();
    const store = storeWithTextField();

    render(
      <WithProviders store={store}>
        <BaseFieldEditor fieldName={STORAGE_ID} showHelperText={false} />
      </WithProviders>
    );

    const exportInput = screen.getByPlaceholderText('Enter export name');

    fireEvent.change(exportInput, {target: {value: 'Observation'}});

    // Pause long enough to commit, then continue typing before React's
    // exportName effect flushes. The old debounce cancelled that second
    // value when it was recreated from field.exportName.
    act(() => {
      vi.advanceTimersByTime(500);
      fireEvent.change(exportInput, {target: {value: 'Observation-Notes'}});
    });

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect((exportInput as HTMLInputElement).value).toBe('Observation-Notes');
    expect(
      store.getState().notebook.uiSpec.present.fields[STORAGE_ID].exportName
    ).toBe('Observation-Notes');
  });

  it('does not reset the input when a colliding export name is uniquified mid-typing', () => {
    vi.useFakeTimers();
    const store = createDesignerStore();
    const taken = getFieldSpec('TextField');
    taken['component-parameters'].name = 'f_taken';
    taken['component-parameters'].label = 'Width';
    taken.exportName = 'width';
    taken.designerIdentifier = 'designer-taken';

    const field = getFieldSpec('TextField');
    field['component-parameters'].name = STORAGE_ID;
    field['component-parameters'].label = 'Site Name';
    field.exportName = 'Site-Name';
    field.designerIdentifier = DESIGNER_ID;

    store.dispatch(
      loaded({
        fields: {f_taken: taken, [STORAGE_ID]: field},
        views: {
          sectionA: {label: 'Section A', fields: ['f_taken', STORAGE_ID]},
        },
        viewsets: {
          formA: {label: 'Form A', views: ['sectionA'], summary_fields: []},
        },
        visible_types: ['formA'],
        settings: {showQrCodeButton: false},
        schemaVersion: CURRENT_NOTEBOOK_UI_SCHEMA_VERSION,
      })
    );

    render(
      <WithProviders store={store}>
        <BaseFieldEditor fieldName={STORAGE_ID} showHelperText={false} />
      </WithProviders>
    );

    const exportInput = screen.getByPlaceholderText('Enter export name');
    exportInput.focus();
    fireEvent.change(exportInput, {target: {value: 'width'}});

    act(() => {
      vi.advanceTimersByTime(500);
      fireEvent.change(exportInput, {target: {value: 'width-cm'}});
    });

    expect(
      store.getState().notebook.uiSpec.present.fields[STORAGE_ID].exportName
    ).toBe('width-1');
    expect((exportInput as HTMLInputElement).value).toBe('width-cm');

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect((exportInput as HTMLInputElement).value).toBe('width-cm');
    expect(
      store.getState().notebook.uiSpec.present.fields[STORAGE_ID].exportName
    ).toBe('width-cm');
  });

  it('shows the stored uniquified slug after blur, not the typed text', () => {
    const store = createDesignerStore();
    const taken = getFieldSpec('TextField');
    taken['component-parameters'].name = 'f_taken';
    taken.exportName = 'width';
    taken.designerIdentifier = 'designer-taken';

    const field = getFieldSpec('TextField');
    field['component-parameters'].name = STORAGE_ID;
    field.exportName = 'Site-Name';
    field.designerIdentifier = DESIGNER_ID;

    store.dispatch(
      loaded({
        fields: {f_taken: taken, [STORAGE_ID]: field},
        views: {
          sectionA: {label: 'Section A', fields: ['f_taken', STORAGE_ID]},
        },
        viewsets: {
          formA: {label: 'Form A', views: ['sectionA'], summary_fields: []},
        },
        visible_types: ['formA'],
        settings: {showQrCodeButton: false},
        schemaVersion: CURRENT_NOTEBOOK_UI_SCHEMA_VERSION,
      })
    );

    render(
      <WithProviders store={store}>
        <BaseFieldEditor fieldName={STORAGE_ID} showHelperText={false} />
      </WithProviders>
    );

    const exportInput = screen.getByPlaceholderText('Enter export name');
    fireEvent.change(exportInput, {target: {value: 'width'}});
    fireEvent.blur(exportInput);

    expect(
      store.getState().notebook.uiSpec.present.fields[STORAGE_ID].exportName
    ).toBe('width-1');
    expect((exportInput as HTMLInputElement).value).toBe('width-1');

    fireEvent.change(exportInput, {target: {value: 'Plot Name'}});
    fireEvent.blur(exportInput);
    expect((exportInput as HTMLInputElement).value).toBe('Plot-Name');
  });

  it('Sync with Label inside the debounce window wins over the typed text', () => {
    vi.useFakeTimers();
    const store = storeWithTextField();

    render(
      <WithProviders store={store}>
        <BaseFieldEditor fieldName={STORAGE_ID} showHelperText={false} />
      </WithProviders>
    );

    const exportInput = screen.getByPlaceholderText('Enter export name');
    exportInput.focus();
    fireEvent.change(exportInput, {target: {value: 'typed'}});
    fireEvent.click(screen.getByRole('button', {name: 'Sync with Label'}));

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(
      store.getState().notebook.uiSpec.present.fields[STORAGE_ID].exportName
    ).toBe('Site-Name');
    expect((exportInput as HTMLInputElement).value).toBe('Site-Name');
  });

  it('shows an undone export name even when it looks like an own echo', () => {
    const store = createDesignerStore();
    const taken = getFieldSpec('TextField');
    taken['component-parameters'].name = 'f_taken';
    taken.exportName = 'width';
    taken.designerIdentifier = 'designer-taken';

    const field = getFieldSpec('TextField');
    field['component-parameters'].name = STORAGE_ID;
    field.exportName = 'width-1';
    field.designerIdentifier = DESIGNER_ID;

    store.dispatch(
      loaded({
        fields: {f_taken: taken, [STORAGE_ID]: field},
        views: {
          sectionA: {label: 'Section A', fields: ['f_taken', STORAGE_ID]},
        },
        viewsets: {
          formA: {label: 'Form A', views: ['sectionA'], summary_fields: []},
        },
        visible_types: ['formA'],
        settings: {showQrCodeButton: false},
        schemaVersion: CURRENT_NOTEBOOK_UI_SCHEMA_VERSION,
      })
    );

    render(
      <WithProviders store={store}>
        <BaseFieldEditor fieldName={STORAGE_ID} showHelperText={false} />
      </WithProviders>
    );

    // Free `width`, then take it with this field.
    act(() => {
      store.dispatch(
        fieldRenamed({
          viewId: 'sectionA',
          fieldName: 'f_taken',
          newExportName: 'breadth',
        })
      );
    });
    const exportInput = screen.getByPlaceholderText('Enter export name');
    fireEvent.change(exportInput, {target: {value: 'width'}});
    fireEvent.blur(exportInput);
    expect((exportInput as HTMLInputElement).value).toBe('width');

    // Undo back to `width-1`: same shape as an own uniquified echo.
    act(() => {
      store.dispatch(ActionCreators.undo());
    });
    expect(
      store.getState().notebook.uiSpec.present.fields[STORAGE_ID].exportName
    ).toBe('width-1');
    expect((exportInput as HTMLInputElement).value).toBe('width-1');
  });
});

describe('BaseFieldEditor first-edit export-name auto-sync', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function renderNewFieldEditor() {
    const store = storeWithTextField();
    render(
      <WithProviders store={store} originalFieldIdentifiers={new Set<string>()}>
        <BaseFieldEditor fieldName={STORAGE_ID} showHelperText={false} />
      </WithProviders>
    );
    return store;
  }

  it('syncs export name from the label after the first typing pause', () => {
    vi.useFakeTimers();
    const store = renderNewFieldEditor();

    fireEvent.change(screen.getByPlaceholderText('Enter field label'), {
      target: {value: 'Observation Notes'},
    });
    act(() => {
      vi.advanceTimersByTime(LABEL_AUTO_SYNC_MS);
    });

    expect(
      store.getState().notebook.uiSpec.present.fields[STORAGE_ID].exportName
    ).toBe('Observation-Notes');
  });

  it('keeps syncing on later debounce pauses until the label loses focus', () => {
    vi.useFakeTimers();
    const store = renderNewFieldEditor();
    const labelInput = screen.getByPlaceholderText('Enter field label');

    fireEvent.change(labelInput, {target: {value: 'Site'}});
    act(() => {
      vi.advanceTimersByTime(LABEL_AUTO_SYNC_MS);
    });
    expect(
      store.getState().notebook.uiSpec.present.fields[STORAGE_ID].exportName
    ).toBe('Site');

    fireEvent.change(labelInput, {target: {value: 'Site Name'}});
    act(() => {
      vi.advanceTimersByTime(LABEL_AUTO_SYNC_MS);
    });
    expect(
      store.getState().notebook.uiSpec.present.fields[STORAGE_ID].exportName
    ).toBe('Site-Name');
  });

  it('syncs the latest typed label when tabbing or clicking away', () => {
    vi.useFakeTimers();
    const store = renderNewFieldEditor();
    const labelInput = screen.getByPlaceholderText('Enter field label');

    fireEvent.change(labelInput, {target: {value: 'Observation'}});
    act(() => {
      vi.advanceTimersByTime(LABEL_AUTO_SYNC_MS);
    });

    fireEvent.change(labelInput, {target: {value: 'Observation Notes'}});
    fireEvent.blur(labelInput);

    expect(
      store.getState().notebook.uiSpec.present.fields[STORAGE_ID].exportName
    ).toBe('Observation-Notes');
  });

  it('does not keep auto-syncing after the label loses focus', () => {
    vi.useFakeTimers();
    const store = renderNewFieldEditor();
    const labelInput = screen.getByPlaceholderText('Enter field label');

    fireEvent.change(labelInput, {target: {value: 'Site'}});
    fireEvent.blur(labelInput);
    expect(
      store.getState().notebook.uiSpec.present.fields[STORAGE_ID].exportName
    ).toBe('Site');

    fireEvent.change(labelInput, {target: {value: 'Site Name Changed'}});
    act(() => {
      vi.advanceTimersByTime(LABEL_AUTO_SYNC_MS);
    });
    fireEvent.blur(labelInput);

    expect(
      store.getState().notebook.uiSpec.present.fields[STORAGE_ID].exportName
    ).toBe('Site');
  });

  it('does not overwrite a custom export name when the label later changes', () => {
    vi.useFakeTimers();
    const store = renderNewFieldEditor();

    fireEvent.change(screen.getByPlaceholderText('Enter export name'), {
      target: {value: 'Custom-Export'},
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(
      store.getState().notebook.uiSpec.present.fields[STORAGE_ID].exportName
    ).toBe('Custom-Export');

    fireEvent.change(screen.getByPlaceholderText('Enter field label'), {
      target: {value: 'Observation Notes'},
    });
    act(() => {
      vi.advanceTimersByTime(LABEL_AUTO_SYNC_MS);
    });

    expect(
      store.getState().notebook.uiSpec.present.fields[STORAGE_ID].exportName
    ).toBe('Custom-Export');
  });

  it('does not auto-sync a field that already existed at session start', () => {
    vi.useFakeTimers();
    const store = storeWithTextField();
    render(
      <WithProviders
        store={store}
        originalFieldIdentifiers={new Set([DESIGNER_ID])}
      >
        <BaseFieldEditor fieldName={STORAGE_ID} showHelperText={false} />
      </WithProviders>
    );

    fireEvent.change(screen.getByPlaceholderText('Enter field label'), {
      target: {value: 'Observation Notes'},
    });
    act(() => {
      vi.advanceTimersByTime(LABEL_AUTO_SYNC_MS);
    });
    fireEvent.blur(screen.getByPlaceholderText('Enter field label'));

    expect(
      store.getState().notebook.uiSpec.present.fields[STORAGE_ID].exportName
    ).toBe('Site-Name');
  });
});

const RICH_TEXT_ID = 'f_richtext';
const CHOICE_ID = 'f_choice';
const RICH_TEXT_DESIGNER_ID = 'designer-richtext';
const CHOICE_DESIGNER_ID = 'designer-choice';
const EQUALITY_CONDITION: ConditionType = {
  operator: 'equal',
  field: CHOICE_ID,
  value: 'Hazardous',
};

function storeWithRichTextAndChoice(condition?: ConditionType) {
  const store = createDesignerStore();
  const richText = getFieldSpec('RichText');
  richText['component-parameters'].name = RICH_TEXT_ID;
  richText['component-parameters'].label = 'Safety warning';
  richText.exportName = 'Safety-warning';
  richText.designerIdentifier = RICH_TEXT_DESIGNER_ID;
  if (condition) {
    richText.condition = condition;
  }

  const choice = getFieldSpec('RadioGroup');
  choice['component-parameters'].name = CHOICE_ID;
  choice['component-parameters'].label = 'Site status';
  choice['component-parameters'].ElementProps = {
    enableOtherOption: false,
    options: [
      {value: 'Safe', label: 'Safe'},
      {value: 'Hazardous', label: 'Hazardous'},
    ],
  };
  choice.exportName = 'Site-status';
  choice.designerIdentifier = CHOICE_DESIGNER_ID;

  store.dispatch(
    loaded({
      fields: {[RICH_TEXT_ID]: richText, [CHOICE_ID]: choice},
      views: {
        sectionA: {label: 'Section A', fields: [CHOICE_ID, RICH_TEXT_ID]},
      },
      viewsets: {
        formA: {label: 'Form A', views: ['sectionA'], summary_fields: []},
      },
      visible_types: ['formA'],
      settings: {showQrCodeButton: false},
      schemaVersion: CURRENT_NOTEBOOK_UI_SCHEMA_VERSION,
    })
  );
  return store;
}

function renderRichTextEditor(store: DesignerStore) {
  return render(
    <WithProviders store={store}>
      <RichTextEditor fieldName={RICH_TEXT_ID} />
    </WithProviders>
  );
}

/** Opens the condition field picker and returns visible option labels. */
const openConditionFieldOptions = (): string[] => {
  const input = within(screen.getByTestId('field-input')).getByRole(
    'combobox'
  ) as HTMLInputElement;
  act(() => {
    input.focus();
    fireEvent.keyDown(input, {key: 'ArrowDown'});
  });
  return screen
    .getAllByRole('option')
    .map(o => o.textContent ?? '')
    .filter(Boolean);
};

describe('RichText field conditions', () => {
  it('shows Add condition without Required, Annotation, Uncertainty, or copy-value', () => {
    renderRichTextEditor(storeWithRichTextAndChoice());

    expect(screen.getByRole('button', {name: 'Add condition'})).toBeTruthy();
    expect(screen.queryByText('Required')).toBeNull();
    expect(screen.queryByText('Annotation')).toBeNull();
    expect(screen.queryByText('Uncertainty')).toBeNull();
    expect(screen.queryByText('Copy value to new records')).toBeNull();
  });

  it('saves an equality condition against the other field', async () => {
    const store = storeWithRichTextAndChoice();
    renderRichTextEditor(store);

    fireEvent.click(screen.getByRole('button', {name: 'Add condition'}));

    const fieldInput = within(screen.getByTestId('field-input')).getByRole(
      'combobox'
    );
    fireEvent.change(fieldInput, {target: {value: 'Site status'}});
    fireEvent.click(await screen.findByRole('option', {name: /site status/i}));

    await waitFor(() => {
      expect(screen.getByTestId('value-input')).toBeDefined();
    });

    fireEvent.mouseDown(
      within(screen.getByTestId('value-input')).getByRole('combobox')
    );
    fireEvent.click(screen.getByRole('option', {name: 'Hazardous'}));

    fireEvent.click(screen.getByRole('button', {name: 'Save Changes'}));

    expect(
      store.getState().notebook.uiSpec.present.fields[RICH_TEXT_ID].condition
    ).toEqual(EQUALITY_CONDITION);
  });

  it('shows Update condition and a summary when a condition is already stored', () => {
    renderRichTextEditor(storeWithRichTextAndChoice(EQUALITY_CONDITION));

    expect(screen.getByRole('button', {name: 'Update condition'})).toBeTruthy();
    expect(screen.getByText(/Show this field if/)).toBeTruthy();
    expect(screen.getByText('Site status')).toBeTruthy();
    expect(screen.getByText('Hazardous')).toBeTruthy();
  });

  it('deletes the condition property when the condition is cleared', async () => {
    const store = storeWithRichTextAndChoice(EQUALITY_CONDITION);
    renderRichTextEditor(store);

    fireEvent.click(screen.getByRole('button', {name: 'Update condition'}));
    fireEvent.click(screen.getByTestId('delete-button'));
    fireEvent.click(screen.getByRole('button', {name: 'Save Changes'}));

    const field = store.getState().notebook.uiSpec.present.fields[RICH_TEXT_ID];
    expect(field).not.toHaveProperty('condition');
    expect(field.condition).toBeUndefined();
  });

  it('excludes the RichText field from the condition source picker', () => {
    renderRichTextEditor(storeWithRichTextAndChoice());

    fireEvent.click(screen.getByRole('button', {name: 'Add condition'}));

    const optionLabels = openConditionFieldOptions();
    expect(optionLabels.some(label => label.includes('Site status'))).toBe(
      true
    );
    expect(optionLabels.some(label => label.includes('Safety warning'))).toBe(
      false
    );
  });
});

describe('BaseFieldEditor pending edit flush', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('commits DebouncedTextField keystrokes without blur', () => {
    vi.useFakeTimers();
    const store = storeWithTextField();

    render(
      <WithProviders store={store}>
        <BaseFieldEditor fieldName={STORAGE_ID} showHelperText={false} />
      </WithProviders>
    );

    const labelInput = screen.getByPlaceholderText('Enter field label');
    fireEvent.change(labelInput, {target: {value: 'Typed without blur'}});

    expect(
      store.getState().notebook.uiSpec.present.fields[STORAGE_ID][
        'component-parameters'
      ].label
    ).toBe('Site Name');

    act(() => {
      flushPendingDesignerEdits();
    });

    expect(
      store.getState().notebook.uiSpec.present.fields[STORAGE_ID][
        'component-parameters'
      ].label
    ).toBe('Typed without blur');
  });
});

describe('BaseFieldEditor extra-config conditions', () => {
  it('keeps Required next to Add condition on ordinary fields', () => {
    render(
      <WithProviders store={storeWithTextField()}>
        <BaseFieldEditor fieldName={STORAGE_ID} showHelperText={false} />
      </WithProviders>
    );

    expect(screen.getByText('Required')).toBeTruthy();
    expect(screen.getByRole('button', {name: 'Add condition'})).toBeTruthy();
  });
});
