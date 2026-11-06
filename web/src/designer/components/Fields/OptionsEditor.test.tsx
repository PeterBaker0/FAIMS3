// SPDX-License-Identifier: Apache-2.0

/**
 * OptionsEditor: per-option visibility conditions, preservation across rebuilds,
 * and rename/delete warnings that walk option-level conditions.
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
import {describe, expect, it, vi} from 'vitest';
import {
  createDesignerStore,
  type DesignerStore,
} from '../../createDesignerStore';
import {getFieldSpec} from '../../fields';
import {DesignerEditingProvider} from '../../state/editing-context';
import {CURRENT_NOTEBOOK_UI_SCHEMA_VERSION} from '../../state/initial';
import {loaded} from '../../store/slices/uiSpec';
import globalTheme from '../../theme/index';
import {ConditionType} from '../../types/condition';
import {OptionsEditor} from './OptionsEditor';

vi.mock('../mdx-editor', () => ({
  MdxEditor: () => null,
}));

const SITE_TYPE_ID = 'f_sitetype';
const MATERIALS_ID = 'f_materials';
const HAZARDS_ID = 'f_hazards';
const EQUALITY_CONDITION: ConditionType = {
  operator: 'equal',
  field: SITE_TYPE_ID,
  value: 'Hazardous',
};

const WithProviders = ({
  children,
  store,
}: {
  children: ReactNode;
  store: DesignerStore;
}) => (
  <ThemeProvider theme={globalTheme}>
    <Provider store={store}>
      <DesignerEditingProvider value={{}}>{children}</DesignerEditingProvider>
    </Provider>
  </ThemeProvider>
);

type StoredChoiceParams = {
  ElementProps: {
    options: Array<{
      value: string;
      label?: string;
      condition?: ConditionType;
    }>;
    exclusiveOptions?: string[];
    enableOtherOption?: boolean;
  };
};

function storedChoiceParams(field: {
  'component-parameters': unknown;
}): StoredChoiceParams {
  return field['component-parameters'] as unknown as StoredChoiceParams;
}

function choiceParams(
  options: Array<{value: string; label: string; condition?: ConditionType}>,
  extra?: Record<string, unknown>
) {
  return {
    enableOtherOption: false,
    options,
    ...extra,
  };
}

function storeWithChoiceFields(args?: {
  materialsCondition?: ConditionType;
  asbestosCondition?: ConditionType;
  sectionCondition?: ConditionType;
  enableOther?: boolean;
}) {
  const store = createDesignerStore();

  const siteType = getFieldSpec('RadioGroup');
  siteType['component-parameters'].name = SITE_TYPE_ID;
  siteType['component-parameters'].label = 'Site type';
  siteType['component-parameters'].ElementProps = choiceParams([
    {value: 'Safe', label: 'Safe'},
    {value: 'Hazardous', label: 'Hazardous'},
  ]);
  siteType.exportName = 'Site-type';
  siteType.designerIdentifier = 'designer-sitetype';

  const materials = getFieldSpec('RadioGroup');
  materials['component-parameters'].name = MATERIALS_ID;
  materials['component-parameters'].label = 'Materials';
  materials['component-parameters'].ElementProps = choiceParams(
    [
      {value: 'Brick', label: 'Brick'},
      {
        value: 'Asbestos',
        label: 'Asbestos',
        ...(args?.asbestosCondition ? {condition: args.asbestosCondition} : {}),
      },
    ],
    {enableOtherOption: args?.enableOther ?? false}
  );
  materials.exportName = 'Materials';
  materials.designerIdentifier = 'designer-materials';
  if (args?.materialsCondition) {
    materials.condition = args.materialsCondition;
  }

  const hazards = getFieldSpec('MultiSelect');
  hazards['component-parameters'].name = HAZARDS_ID;
  hazards['component-parameters'].label = 'Hazards';
  hazards['component-parameters'].ElementProps = choiceParams([
    {value: 'None observed', label: 'None observed'},
    {value: 'Spill', label: 'Spill'},
  ]);
  hazards.exportName = 'Hazards';
  hazards.designerIdentifier = 'designer-hazards';

  store.dispatch(
    loaded({
      fields: {
        [SITE_TYPE_ID]: siteType,
        [MATERIALS_ID]: materials,
        [HAZARDS_ID]: hazards,
      },
      views: {
        sectionA: {
          label: 'Section A',
          fields: [SITE_TYPE_ID, MATERIALS_ID, HAZARDS_ID],
          ...(args?.sectionCondition ? {condition: args.sectionCondition} : {}),
        },
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

const optionConditionControl = (index: number) =>
  screen.getByTestId(`option-condition-${index}`);

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

describe('OptionsEditor option condition controls', () => {
  it('shows Add condition on ordinary RadioGroup rows and not on Other', () => {
    const store = storeWithChoiceFields({enableOther: true});
    render(
      <WithProviders store={store}>
        <OptionsEditor fieldName={MATERIALS_ID} showExpandedChecklist />
      </WithProviders>
    );

    expect(optionConditionControl(0)).toBeTruthy();
    expect(optionConditionControl(1)).toBeTruthy();
    expect(
      within(optionConditionControl(0)).getByRole('button', {
        name: 'Add condition',
      })
    ).toBeTruthy();
    expect(
      within(optionConditionControl(1)).getByRole('button', {
        name: 'Add condition',
      })
    ).toBeTruthy();
    expect(screen.queryByTestId('option-condition-2')).toBeNull();
    expect(screen.getByText('Other')).toBeTruthy();
  });

  it('shows Add condition on ordinary MultiSelect rows and not on Other', () => {
    const store = storeWithChoiceFields();
    const present = store.getState().notebook.uiSpec.present;
    const hazards = present.fields[HAZARDS_ID];
    const params = storedChoiceParams(hazards);
    store.dispatch(
      loaded({
        ...present,
        fields: {
          ...present.fields,
          [HAZARDS_ID]: {
            ...hazards,
            'component-parameters': {
              ...hazards['component-parameters'],
              ElementProps: {
                ...params.ElementProps,
                enableOtherOption: true,
              },
            },
          },
        },
      })
    );

    render(
      <WithProviders store={store}>
        <OptionsEditor
          fieldName={HAZARDS_ID}
          showExpandedChecklist
          showExclusiveOptions
        />
      </WithProviders>
    );

    expect(
      within(optionConditionControl(0)).getByRole('button', {
        name: 'Add condition',
      })
    ).toBeTruthy();
    expect(
      within(optionConditionControl(1)).getByRole('button', {
        name: 'Add condition',
      })
    ).toBeTruthy();
    expect(screen.queryByTestId('option-condition-2')).toBeNull();
  });

  it('saves an option condition, shows Conditional, and reloads it', async () => {
    const store = storeWithChoiceFields();
    const view = render(
      <WithProviders store={store}>
        <OptionsEditor fieldName={MATERIALS_ID} showExpandedChecklist />
      </WithProviders>
    );

    fireEvent.click(
      within(optionConditionControl(1)).getByRole('button', {
        name: 'Add condition',
      })
    );

    const fieldInput = within(screen.getByTestId('field-input')).getByRole(
      'combobox'
    );
    fireEvent.change(fieldInput, {target: {value: 'Site type'}});
    fireEvent.click(await screen.findByRole('option', {name: /site type/i}));

    await waitFor(() => {
      expect(screen.getByTestId('value-input')).toBeDefined();
    });
    fireEvent.mouseDown(
      within(screen.getByTestId('value-input')).getByRole('combobox')
    );
    fireEvent.click(screen.getByRole('option', {name: 'Hazardous'}));
    fireEvent.click(screen.getByRole('button', {name: 'Save Changes'}));

    const options = storedChoiceParams(
      store.getState().notebook.uiSpec.present.fields[MATERIALS_ID]
    ).ElementProps.options;
    expect(options[1].condition).toEqual(EQUALITY_CONDITION);
    expect(options[0].condition).toBeUndefined();
    expect(screen.getByTestId('option-conditional-indicator-1')).toBeTruthy();
    expect(
      within(optionConditionControl(1)).getByText('Update condition')
    ).toBeTruthy();

    const snapshot = JSON.parse(
      JSON.stringify(store.getState().notebook.uiSpec.present)
    );
    view.unmount();
    const reloaded = createDesignerStore();
    reloaded.dispatch(loaded(snapshot));
    render(
      <WithProviders store={reloaded}>
        <OptionsEditor fieldName={MATERIALS_ID} showExpandedChecklist />
      </WithProviders>
    );
    expect(screen.getByTestId('option-conditional-indicator-1')).toBeTruthy();
    const reloadedOptions = storedChoiceParams(
      reloaded.getState().notebook.uiSpec.present.fields[MATERIALS_ID]
    ).ElementProps.options;
    expect(reloadedOptions[1].condition).toEqual(EQUALITY_CONDITION);
  });

  it('deletes condition from that option on clear', async () => {
    const store = storeWithChoiceFields({
      asbestosCondition: EQUALITY_CONDITION,
    });
    render(
      <WithProviders store={store}>
        <OptionsEditor fieldName={MATERIALS_ID} showExpandedChecklist />
      </WithProviders>
    );

    fireEvent.click(
      within(optionConditionControl(1)).getByRole('button', {
        name: 'Update condition',
      })
    );
    fireEvent.click(screen.getByTestId('delete-button'));
    fireEvent.click(screen.getByRole('button', {name: 'Save Changes'}));

    const options = storedChoiceParams(
      store.getState().notebook.uiSpec.present.fields[MATERIALS_ID]
    ).ElementProps.options;
    expect(options[1]).not.toHaveProperty('condition');
    expect(screen.queryByTestId('option-conditional-indicator-1')).toBeNull();
  });

  it('keeps condition across reorder, rename, and exclusive toggle', () => {
    const store = storeWithChoiceFields({
      asbestosCondition: EQUALITY_CONDITION,
    });
    render(
      <WithProviders store={store}>
        <OptionsEditor
          fieldName={MATERIALS_ID}
          showExpandedChecklist
          showExclusiveOptions
        />
      </WithProviders>
    );

    const asbestosRow = optionConditionControl(1).closest('tr') as HTMLElement;
    fireEvent.click(within(asbestosRow).getByRole('button', {name: 'Move up'}));

    let options = storedChoiceParams(
      store.getState().notebook.uiSpec.present.fields[MATERIALS_ID]
    ).ElementProps.options;
    expect(options[0].value).toBe('Asbestos');
    expect(options[0].condition).toEqual(EQUALITY_CONDITION);

    const movedRow = optionConditionControl(0).closest('tr') as HTMLElement;
    fireEvent.click(
      within(movedRow).getByRole('button', {name: 'Edit option'})
    );
    const editInput = screen.getByLabelText('Option Text');
    fireEvent.change(editInput, {target: {value: 'Asbestos cladding'}});
    fireEvent.click(screen.getByRole('button', {name: 'Save'}));

    options = storedChoiceParams(
      store.getState().notebook.uiSpec.present.fields[MATERIALS_ID]
    ).ElementProps.options;
    const renamed = options.find(o => o.value === 'Asbestos cladding');
    expect(renamed?.condition).toEqual(EQUALITY_CONDITION);

    const renamedRow = screen
      .getByText('Asbestos cladding')
      .closest('tr') as HTMLElement;
    const exclusiveInput = renamedRow.querySelector(
      'input[type="checkbox"]'
    ) as HTMLInputElement;
    expect(exclusiveInput).toBeTruthy();
    fireEvent.click(exclusiveInput);

    options = storedChoiceParams(
      store.getState().notebook.uiSpec.present.fields[MATERIALS_ID]
    ).ElementProps.options;
    expect(
      options.find(o => o.value === 'Asbestos cladding')?.condition
    ).toEqual(EQUALITY_CONDITION);
  });

  it('warns and rewrites field, section, and option conditions when an option value is renamed', async () => {
    const store = storeWithChoiceFields({
      materialsCondition: EQUALITY_CONDITION,
      asbestosCondition: EQUALITY_CONDITION,
      sectionCondition: EQUALITY_CONDITION,
    });
    render(
      <WithProviders store={store}>
        <OptionsEditor fieldName={SITE_TYPE_ID} showExpandedChecklist />
      </WithProviders>
    );

    const hazardousRow = optionConditionControl(1).closest('tr') as HTMLElement;
    fireEvent.click(
      within(hazardousRow).getByRole('button', {name: 'Edit option'})
    );

    expect(screen.getByText(/used in/i)).toBeTruthy();
    expect(screen.getByText(/Field: Materials/)).toBeTruthy();
    expect(screen.getByText(/Section: Section A/)).toBeTruthy();
    expect(screen.getByText(/Option: Asbestos in Materials/)).toBeTruthy();

    const editInput = screen.getByLabelText('Option Text');
    fireEvent.change(editInput, {target: {value: 'Industrial'}});
    fireEvent.click(screen.getByRole('button', {name: 'Save'}));

    const state = store.getState().notebook.uiSpec.present;
    expect(state.fields[MATERIALS_ID].condition).toEqual({
      operator: 'equal',
      field: SITE_TYPE_ID,
      value: 'Industrial',
    });
    expect(state.views.sectionA.condition).toEqual({
      operator: 'equal',
      field: SITE_TYPE_ID,
      value: 'Industrial',
    });
    const materialsOptions = storedChoiceParams(state.fields[MATERIALS_ID])
      .ElementProps.options;
    expect(
      materialsOptions.find(o => o.value === 'Asbestos')?.condition
    ).toEqual({
      operator: 'equal',
      field: SITE_TYPE_ID,
      value: 'Industrial',
    });
  });

  it('lets an option condition reference its parent choice field', () => {
    const store = storeWithChoiceFields();
    render(
      <WithProviders store={store}>
        <OptionsEditor
          fieldName={HAZARDS_ID}
          showExpandedChecklist
          showExclusiveOptions
        />
      </WithProviders>
    );

    fireEvent.click(
      within(optionConditionControl(1)).getByRole('button', {
        name: 'Add condition',
      })
    );

    const optionLabels = openConditionFieldOptions();
    expect(optionLabels.some(label => label.includes('Hazards'))).toBe(true);
    expect(optionLabels.some(label => label.includes('Site type'))).toBe(true);
  });
});
