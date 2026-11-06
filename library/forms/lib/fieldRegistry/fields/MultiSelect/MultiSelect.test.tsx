// SPDX-License-Identifier: Apache-2.0
import '@testing-library/jest-dom/vitest';
import {render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {useState} from 'react';
import {describe, expect, it, vi} from 'vitest';
import {multiSelectFieldSpec} from '.';
import type {ChoiceOption} from '../choiceFieldParams';

const conditionedOptions: ChoiceOption[] = [
  {value: 'none', label: 'None observed'},
  {
    value: 'asbestos',
    label: 'Asbestos',
    condition: {operator: 'equal', field: 'site-type', value: 'Industrial'},
  },
];

type RenderParams = {
  expandedChecklist?: boolean;
  initialValue?: string[];
  options?: ChoiceOption[];
  exclusiveOptions?: string[];
  conditionValues?: Record<string, unknown>;
};

function renderMultiSelectField({
  expandedChecklist = true,
  initialValue = [],
  options = conditionedOptions,
  exclusiveOptions = [],
  conditionValues,
}: RenderParams = {}) {
  const setFieldDataCalls: unknown[] = [];
  const user = userEvent.setup();

  const Wrapper = () => {
    const [value, setValue] = useState<string[]>(initialValue);
    const [values, setValues] = useState(conditionValues);

    return (
      <>
        {conditionValues !== undefined && (
          <button
            type="button"
            onClick={() =>
              setValues({
                'site-type':
                  values?.['site-type'] === 'Industrial'
                    ? 'Residential'
                    : 'Industrial',
              })
            }
          >
            Toggle site type
          </button>
        )}
        <multiSelectFieldSpec.component
          name="hazards"
          fieldId="hazards"
          label="Hazards"
          required={false}
          helperText=""
          advancedHelperText=""
          disabled={false}
          ElementProps={{
            options,
            expandedChecklist,
            exclusiveOptions,
          }}
          state={{value: {data: value}, meta: {errors: []}} as any}
          setFieldData={(nextOrUpdater: unknown) => {
            setValue(prev => {
              const next =
                typeof nextOrUpdater === 'function'
                  ? (nextOrUpdater as (value: string[]) => string[])(prev)
                  : (nextOrUpdater as string[]);
              setFieldDataCalls.push(next);
              return next;
            });
          }}
          setFieldAnnotation={vi.fn()}
          addAttachment={vi.fn(async () => 'attachment-id')}
          removeAttachment={vi.fn(async () => undefined)}
          handleBlur={vi.fn()}
          trigger={{commit: vi.fn(async () => undefined)}}
          config={{} as any}
          conditionValues={values}
        />
      </>
    );
  };

  render(<Wrapper />);
  return {user, setFieldDataCalls};
}

describe('MultiSelect option conditions', () => {
  it('hides a failing option in expanded checklist until the driving value matches', async () => {
    const {user} = renderMultiSelectField({
      expandedChecklist: true,
      conditionValues: {'site-type': 'Residential'},
    });

    expect(
      screen.getByRole('checkbox', {name: 'None observed'})
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', {name: 'Asbestos'})
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', {name: 'Toggle site type'}));
    expect(
      screen.getByRole('checkbox', {name: 'Asbestos'})
    ).toBeInTheDocument();
  });

  it('hides a failing option in dropdown until the driving value matches', async () => {
    const {user} = renderMultiSelectField({
      expandedChecklist: false,
      conditionValues: {'site-type': 'Residential'},
    });

    await user.click(screen.getByRole('combobox'));
    let listbox = await screen.findByRole('listbox');
    expect(
      within(listbox).getByRole('option', {name: /None observed/})
    ).toBeTruthy();
    expect(
      within(listbox).queryByRole('option', {name: /Asbestos/})
    ).toBeNull();

    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', {name: 'Toggle site type'}));
    await user.click(screen.getByRole('combobox'));
    listbox = await screen.findByRole('listbox');
    expect(
      within(listbox).getByRole('option', {name: /Asbestos/})
    ).toBeTruthy();
  });

  it('keeps a selected failing member visible and does not auto-clear it', async () => {
    const {user, setFieldDataCalls} = renderMultiSelectField({
      expandedChecklist: true,
      initialValue: ['asbestos'],
      conditionValues: {'site-type': 'Residential'},
    });

    const asbestos = screen.getByRole('checkbox', {name: 'Asbestos'});
    expect(asbestos).toBeInTheDocument();
    expect(asbestos).toBeChecked();
    expect(setFieldDataCalls).toEqual([]);

    await user.click(screen.getByRole('button', {name: 'Toggle site type'}));
    expect(setFieldDataCalls).toEqual([]);
    expect(screen.getByRole('checkbox', {name: 'Asbestos'})).toBeChecked();
  });

  it('still accepts a stored member that is in the full options list', () => {
    const schema = multiSelectFieldSpec.fieldDataSchemaFunction!({
      required: true,
      ElementProps: {
        options: conditionedOptions,
      },
    } as any);

    expect(schema.safeParse(['asbestos']).success).toBe(true);
  });
});
