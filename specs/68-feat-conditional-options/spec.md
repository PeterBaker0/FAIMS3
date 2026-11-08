# Conditional options for Select single and Select multiple

Issue: [#68](https://github.com/PeterBaker0/FAIMS3/issues/68)

Proposed size: **m**. Pull-request breakdown is left to the planner.

## 1. Problem

Notebook authors can already hide an entire **Select single** or **Select
multiple** field (or a section) with a visibility `condition`. They cannot
hide or show **individual options** in those lists based on other values.

That gap is the usual cascading-vocabulary pattern: “Asbestos” should
appear only when Site type is Industrial; “Wet sclerophyll” only when
Vegetation is Forest; a MultiSelect hazard list should always offer
“None observed” and only offer site-specific hazards after a region is
chosen. The workaround today is a second field with a field-level
condition, which splits one question across two storage ids and two
export columns.

Current shape:

- Select single is `faims-custom::RadioGroup` (chooser label “Select
  single”). Legacy `faims-custom::Select` still resolves to the same
  `RadioGroup` component. Select multiple is `faims-custom::MultiSelect`.
- Both store choices as `component-parameters.ElementProps.options`
  (`ChoiceOption`: `value`, `label`, optional `key` / `RadioProps`) in
  `library/forms/lib/fieldRegistry/fields/choiceFieldParams.ts`.
  `ChoiceOptionSchema` has no `condition`.
- The designer edits that list in
  `web/src/designer/components/Fields/OptionsEditor.tsx`. `updateField`
  rebuilds options as `{label, value}` (plus `RadioProps` for radio
  ids), so any extra option key would be dropped on the next edit.
- Visibility conditions already exist for fields and sections
  (`ConditionalExpression` on `field.condition` / `view.condition`,
  compiled by `compileExpression` /
  `compileUiSpecConditionals`). Options have no `condition`.
- The collection app and designer preview always render the full
  options array in both expanded-checklist and dropdown modes.

## 2. Constraints

- Cover **Select single** (`RadioGroup` and the legacy `Select` alias)
  and **Select multiple** (`MultiSelect`) only. Both already share
  `ChoiceElementProps` and `OptionsEditor`.
- Persist an optional `condition` on each `ChoiceOption`, using the
  same `ConditionalExpression` / designer `ConditionType` AST as field
  and section conditions (single comparison or AND/OR group). Absence,
  `undefined`, or `null` means the option is always visible.
- Evaluate with the existing compiler (`compileExpression` in
  `library/data-model/src/uiSpecification/conditionals.ts`) against the
  same value bag `buildConditionValues` already builds for field and
  section visibility (current record, parent, linked-record, notebook
  metadata). Do not add operators, reference kinds, or a second
  evaluator.
- Filter at render time in the choice field components (or a helper
  they both call) so expanded checklist **and** dropdown, and both the
  collection app and designer preview, stay in lockstep. RadioGroup and
  MultiSelect do not currently receive sibling values; they must get
  the same `buildConditionValues` bag (or equivalent live form values)
  so the list re-filters when a referenced value changes.
- Do **not** bump `CURRENT_NOTEBOOK_UI_SCHEMA_VERSION` (`1.0.1`).
  `component-parameters` is already `.loose()` on `FieldDefinition`;
  older apps ignore unknown option keys and keep showing every option.
- Extend `ChoiceOptionSchema` so a stored `condition` is valid field
  props. Compiled `conditionFn` values must not be written into
  notebook JSON; if attached at runtime, keep them off the serialisable
  option object or allow them in the forms props schema without failing
  parse.
- Reuse `ConditionModal` / `ConditionControl` / `ConditionSummary` for
  the editor dialog. The option-row trigger must **fit the Actions
  column** (`IconButton` size, next to edit / delete), not the
  field-level labeled **Add condition** / **Update condition** button.
  The column may widen slightly for one extra icon; it must not wrap
  labeled text. Tooltip copy is **Add condition** when unset and
  **Update condition** when set. A set condition is shown by the icon’s
  state (e.g. colour), not a **Conditional** chip or extra column.
  `ConditionModal` may grow an icon-only trigger; do not restyle the
  dialog itself for this. Saving an option condition updates that
  option in `ElementProps.options`; clearing **deletes** `condition` on
  that option (do not leave `null`).
- `OptionsEditor` currently rebuilds options as `{label, value}` (plus
  `RadioProps` for radio ids). Reorder, rename, exclusive toggle, and
  “Other” position changes **must keep** each option’s `condition`.
- Option-condition field pickers use the same form scope as field
  conditions (same form, plus parent / linked-record / metadata refs).
  Unlike field conditions, they **may** reference the parent choice
  field itself so a MultiSelect can cascade inside one list
  (`ConditionControl` currently excludes `props.field`). They must not
  offer the option’s own value as a field id (options are not fields).
- Do not auto-clear stored values when an option becomes hidden.
  Hidden options stay out of the picker **unless they are currently
  selected**; a selected-but-now-failing option remains visible and
  selected so the collector can see and change it. View / export keep
  the stored value. Validation still accepts values that appear in the
  **full** options list, not only the currently visible subset.
- The synthetic **Other** row (`enableOtherOption`) is not a
  `ChoiceOption` and does not get a condition. When Other is enabled it
  stays shown in its configured position among the filtered list.
- Exclusive MultiSelect options keep today’s clear-others behaviour
  among the options the collector can currently interact with. A hidden
  exclusive option is not offered; a selected exclusive option that is
  being kept visible because it is selected still clears others when
  chosen.
- `findOptionReferences` / `updateConditionReferences` (and the rename
  / delete warning dialogs in `OptionsEditor`) must also walk
  **option-level** conditions: renaming or deleting an option value
  still updates or warns about field, section, **and** other options’
  conditions that compare against that value. The same walk applies to
  `findInvalidConditionReferences`.
- No designer live preview of option show/hide beyond what the existing
  form preview already does once runtime filtering is in place. No API,
  Couch, or export-column changes.

## 3. Acceptance criteria

1. Expanding a Select single (`RadioGroup`) or Select multiple field in
   the designer shows a compact condition control on each ordinary
   option row’s Actions column, sized like the existing edit / delete
   icon buttons, with tooltip **Add condition**. The synthetic Other
   row has no such control. The labeled field-level **Add condition**
   button is not used on the option row.
2. Saving an option condition writes
   `fields[<id>].component-parameters.ElementProps.options[<i>].condition`
   using the existing condition AST. Reloading the notebook in the
   designer still shows that condition. The same compact control now
   has tooltip **Update condition** and a set-state (e.g. colour)
   distinct from the unset icon. No **Conditional** chip or extra
   table column is added.
3. Clearing the condition removes `condition` from that option object
   (property deleted, not `null`). Other options’ conditions are
   unchanged.
4. Reordering options, renaming an option’s label/value, toggling
   Exclusive, or moving Other does not drop a stored option
   `condition`.
5. The option condition builder can reference other fields in the same
   form, the parent choice field itself, and the existing parent /
   linked-record / notebook-metadata references. It cannot treat the
   option as a field.
6. After the notebook is saved and opened in the data-collection app
   (and in designer preview), an option whose condition evaluates false
   is not offered for new selection, in both expanded-checklist and
   dropdown modes, for both Select single and Select multiple. An
   option with no condition, or a condition that evaluates true, is
   offered. The list updates when referenced values change.
7. If the stored value (Select single) or a stored member (Select
   multiple) is an option whose condition is currently false, that
   option remains visible and selected until the collector changes it.
   The stored value is not cleared automatically. View mode and CSV/GIS
   export still show that stored value.
8. Required and “must be one of the configured options” validation
   still pass for a stored value that is in the full options list even
   when that option is currently filtered from new selection. Other
   still validates as it does today.
9. Legacy `faims-custom::Select` fields pick up the same runtime
   filtering as `RadioGroup` without a separate designer surface.
10. Field-level and section-level conditions continue to save, load,
    and evaluate as they do today. Options without `condition` behave
    as they do today (always listed).
11. User docs for Select single (`docs/user/field-types/choice-fields/radio-group.md`),
    Select multiple (`docs/user/field-types/choice-fields/multi-select.md`),
    and the shared conditions page (`docs/user/authoring/conditions.md`)
    describe per-option visibility (not only field hide/show), including
    that a selected option stays visible if its condition becomes false,
    that Other cannot take a condition, and that the designer control
    is a compact Actions-column icon (not the field-level button).

## 4. Out of scope

- Hierarchical select (`AdvancedSelect` / `optiontree`), Checkbox, and
  any other field type.
- Conditions on the synthetic Other option.
- Auto-clearing or confirming when a selected option’s condition
  becomes false.
- New condition operators, reference kinds, or a designer-only
  simulation of option show/hide that does not go through the real
  field renderers.
- Notebook schema version bump, API/Couch changes, or changing how
  selected values are exported.
- Rewriting `ConditionModal` except as needed to allow an option
  condition to reference its parent choice field, and to expose an
  icon-only trigger that fits the option-row Actions column.
- Cycle detection beyond what field conditions already do.

## 5. Test plan

Check: code

Automated tests are required: this change filters choice values at
runtime and persists a new optional key on option objects.

Automated (designer, `@faims3/web`):

1. Render `OptionsEditor` for a RadioGroup and a MultiSelect in a form
   that also has another choice/text field. Assert an Actions-column
   condition icon (tooltip **Add condition**) on ordinary option rows
   and not on Other. Assert the row does not contain the labeled
   **Add condition** / **Update condition** button text.
2. Save a simple equality condition on one option. Assert the store
   option has the expected `condition` object and the same icon now
   has tooltip **Update condition** (and a set-state distinct from
   unset). Reload from that notebook JSON; the condition is still
   there.
3. Clear the condition. Assert `condition` is absent on that option.
4. With a condition set, reorder the option, rename it, and
   (MultiSelect) toggle Exclusive. Assert `condition` is still present
   on the same logical option.
5. Rename an option value that is the RHS of **another option’s**
   condition (and of a field/section condition). Assert the warning
   dialog still appears and, when the author accepts updates, all three
   condition sites get the new value.
6. Run existing `web/src/designer/components/condition.test.tsx` and
   `conditionReferences` tests so the shared builder still works for
   field/section conditions.

Automated (runtime, `@faims3/forms` and/or `@faims3/data-model`):

7. `ChoiceOptionSchema` accepts an option with `condition` and one
   without. Notebook JSON with option conditions still normalises at
   schema `1.0.1`.
8. Render RadioGroup and MultiSelect (checklist and dropdown) with two
   options, one conditioned on a sibling value. With the sibling
   mismatch, only the unconditioned option is offered; with a match,
   both are. Changing the sibling value updates the list without a
   remount of the form. RadioGroup already has
   `library/forms/lib/fieldRegistry/fields/RadioGroup/RadioGroup.test.tsx`;
   MultiSelect currently has no field test file — add coverage there
   or in a shared helper test.
9. With a stored Select-single value (or MultiSelect member) whose
   condition is false, that option remains visible and selected; no
   `setFieldData` clear fires solely because the driving value changed.
10. Value schema still accepts that stored value. Existing RadioGroup
    tests (Other, exclusive, display mode) stay green.

Manual (optional, not the gate):

11. In Control Centre, add a Select single (or Select multiple) and a
    driving Select/text field. Attach “show option B if driving field
    equals X”. Save. Open in the collection app: B appears only when X
    is selected; selecting B then changing the driving field away from
    X leaves B visible and selected until the collector changes it.
12. Repeat for dropdown mode and for a legacy `Select` notebook field if
    a fixture is handy.

Commands:

```bash
pnpm --filter=@faims3/web exec vitest --run
pnpm --filter=@faims3/forms exec vitest --run
pnpm --filter=@faims3/data-model test
```

## 6. Risk class and why

**Med.** Size: **m**.

The AST and compiler already exist, and the JSON change is an optional
key on options, so there is no schema migration or sync/auth change.
Residual risk is real: option filtering touches two field types × two
display modes, exclusive / Other / required validation, and stored
values that no longer match the visible list. Silently dropping
`condition` inside `OptionsEditor` rebuilds, or auto-clearing a
selected option, would lose authoring or field data. Medium rather
than high because evaluation reuses `compileExpression` and hidden
options default to “keep stored value, still show if selected”.

## 7. Open questions

None. Revision feedback is incorporated: keep stored values (no
auto-clear); do not bump the notebook schema (`condition` is optional);
tighten the designer control to an Actions-column icon that fits the
option row.
