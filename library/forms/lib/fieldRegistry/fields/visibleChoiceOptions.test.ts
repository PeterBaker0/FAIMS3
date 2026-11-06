// SPDX-License-Identifier: Apache-2.0

import {describe, expect, it} from 'vitest';
import {ChoiceOptionSchema, type ChoiceOption} from './choiceFieldParams';
import {
  isChoiceOptionSelected,
  visibleChoiceOptions,
} from './visibleChoiceOptions';

const industrial = {
  operator: 'equal',
  field: 'site-type',
  value: 'Industrial',
} as const;

const asbestos: ChoiceOption = {
  value: 'asbestos',
  label: 'Asbestos',
  condition: industrial,
};

const always: ChoiceOption = {value: 'brick', label: 'Brick'};

describe('ChoiceOptionSchema', () => {
  it('accepts an option with no condition', () => {
    expect(ChoiceOptionSchema.safeParse(always).success).toBe(true);
  });

  it('accepts an option with a condition AST', () => {
    expect(ChoiceOptionSchema.safeParse(asbestos).success).toBe(true);
  });

  it('accepts a null condition as always-visible', () => {
    expect(
      ChoiceOptionSchema.safeParse({
        value: 'other',
        label: 'Other',
        condition: null,
      }).success
    ).toBe(true);
  });

  it('strips compiled conditionFn so it is not persisted on the option', () => {
    const parsed = ChoiceOptionSchema.parse({
      ...asbestos,
      conditionFn: () => true,
    } as ChoiceOption & {conditionFn: () => boolean});
    expect(parsed).not.toHaveProperty('conditionFn');
    expect(JSON.stringify(parsed)).not.toContain('conditionFn');
  });
});

describe('isChoiceOptionSelected', () => {
  it('matches a Select-single stored value', () => {
    expect(isChoiceOptionSelected('asbestos', 'asbestos')).toBe(true);
    expect(isChoiceOptionSelected('asbestos', 'brick')).toBe(false);
  });

  it('matches a Select-multiple stored member', () => {
    expect(isChoiceOptionSelected('asbestos', ['brick', 'asbestos'])).toBe(
      true
    );
    expect(isChoiceOptionSelected('asbestos', ['brick'])).toBe(false);
  });
});

describe('visibleChoiceOptions', () => {
  const options = [always, asbestos];

  it('offers an unconditioned option and a condition that evaluates true', () => {
    expect(
      visibleChoiceOptions({
        options,
        values: {'site-type': 'Industrial'},
      }).map(o => o.value)
    ).toEqual(['brick', 'asbestos']);
  });

  it('hides an option whose condition evaluates false', () => {
    expect(
      visibleChoiceOptions({
        options,
        values: {'site-type': 'Residential'},
      }).map(o => o.value)
    ).toEqual(['brick']);
  });

  it('treats a missing or null condition as always visible', () => {
    const withNull: ChoiceOption = {
      value: 'steel',
      label: 'Steel',
      condition: null,
    };
    expect(
      visibleChoiceOptions({
        options: [always, withNull],
        values: {},
      }).map(o => o.value)
    ).toEqual(['brick', 'steel']);
  });

  it('keeps a selected option whose condition is currently false', () => {
    expect(
      visibleChoiceOptions({
        options,
        values: {'site-type': 'Residential'},
        selected: 'asbestos',
      }).map(o => o.value)
    ).toEqual(['brick', 'asbestos']);
  });

  it('keeps a selected MultiSelect member whose condition is currently false', () => {
    expect(
      visibleChoiceOptions({
        options,
        values: {'site-type': 'Residential'},
        selected: ['asbestos'],
      }).map(o => o.value)
    ).toEqual(['brick', 'asbestos']);
  });

  it('does not write conditionFn onto returned option objects', () => {
    const visible = visibleChoiceOptions({
      options,
      values: {'site-type': 'Industrial'},
    });
    for (const option of visible) {
      expect(option).not.toHaveProperty('conditionFn');
    }
    expect(JSON.stringify(visible)).not.toContain('conditionFn');
  });
});
