// SPDX-License-Identifier: Apache-2.0

import {compileExpression, type RecordValues} from '@faims3/data-model';
import type {ChoiceOption} from './choiceFieldParams';

/**
 * True when `selected` is this option's stored value (Select single) or a
 * stored member (Select multiple).
 */
export function isChoiceOptionSelected(
  optionValue: string,
  selected: string | string[] | null | undefined
): boolean {
  if (selected == null) return false;
  if (Array.isArray(selected)) return selected.includes(optionValue);
  return selected === optionValue;
}

/**
 * Options offered for new selection: no condition, a condition that evaluates
 * true against `values`, or currently selected even when the condition is
 * false. Does not attach compiled `conditionFn` onto the option objects.
 *
 * @param options - Full configured option list (validation still uses this).
 * @param values - Same bag `buildConditionValues` builds for field visibility.
 * @param selected - Current stored value(s); selected-but-failing options stay.
 */
export function visibleChoiceOptions({
  options,
  values,
  selected,
}: {
  options: ChoiceOption[];
  values: RecordValues;
  selected?: string | string[] | null;
}): ChoiceOption[] {
  return options.filter(option => {
    if (isChoiceOptionSelected(option.value, selected)) return true;
    if (option.condition == null) return true;
    try {
      return compileExpression(option.condition)(values);
    } catch {
      // Unknown operator: show the option. Extra options are conservative,
      // matching older apps that ignore `condition` and list every choice.
      return true;
    }
  });
}
