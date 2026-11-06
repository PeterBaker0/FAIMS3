# Conditional options on Select single and Select multiple

Issue: [#58](https://github.com/PeterBaker0/FAIMS3/issues/58)

Proposed size: **m**. Pull-request breakdown is left to the planner.

## 1. Problem

Notebook authors can already hide a whole field or section with a
visibility condition (`field.condition` / `view.condition`, compiled by
`compileUiSpecConditionals` to `conditionFn`). They cannot hide
**individual choices** inside a choice field.

The usual survey pattern is a cascading list: show "Species" options
that match the selected habitat, or hide "Not applicable" unless a
prior question says so. Today every option in Select single and Select
multiple is always listed, in both expanded-checklist and dropdown
modes.

The gap is option-level, not a missing condition language:

- Choice options are `{value, label, key?, RadioProps?}`
  (`ChoiceOptionSchema` in
  `library/forms/lib/fieldRegistry/fields/choiceFieldParams.ts`). There
  is no `condition` on an option.
- RadioGroup (chooser name **Select single**; legacy registry name
  `Select`) and MultiSelect (**Select multiple**) render
  `ElementProps.options` in full. They do not filter.
- The designer `OptionsEditor`
  (`web/src/designer/components/Fields/OptionsEditor.tsx`) already
  rewrites **field- and section-level** conditions when an option
  value is renamed, but it has no per-option condition control.
- The existing `ConditionalExpression` AST, designer `ConditionType`,
  `ConditionModal` / `ConditionControl`, and `compileExpression`
  evaluator are the model to reuse. Field-level visibility stays as it
  is.

## 2. Constraints

- **Field types in scope:** `RadioGroup` (Select single), the legacy
  `Select` registry alias (same RadioGroup component), and
  `MultiSelect`. Both display modes (expanded checklist and dropdown).
  Designer UI lives in the shared `OptionsEditor`.
- **Reuse the existing condition AST.** Persist optional
  `condition` on each choice option as the same
  `ConditionalExpression` / designer `ConditionType` used on fields
  and sections (single comparison or AND/OR group, same operators,
  same parent / linked-record / notebook-metadata references). Evaluate
  with `compileExpression` against the same `buildConditionValues`
  record that field and section visibility already use. Do not add
  operators, reference kinds, or a second condition language.
- **Do not bump** `CURRENT_NOTEBOOK_UI_SCHEMA_VERSION`. `condition` is
  an additive optional key under
  `component-parameters.ElementProps.options[]`. Notebook
  `component-parameters` are already loose in `@faims3/data-model`.
  Extend `ChoiceOptionSchema` in `@faims3/forms` so the forms layer
  keeps `condition` instead of stripping it.
- **Designer:** each predefined option row gets the same Add condition /
  Update condition / clear behaviour as a field, via `ConditionModal`
  and `ConditionControl`. Pass the owning choice field as `field` so
  the builder cannot reference that field (same self-exclusion as
  field-level conditions). Show a **Conditional** marker on the option
  row while a condition is set. Do not put that marker on the field
  header; the header **Conditional** chip remains field-level only.
- **Preserve `condition` through option edits.** Reorder, exclusive
  toggle, label/value rename, and `fieldUpdated` patches must not drop
  `condition` (today `CombinedRow` only types `{label, value}`).
  Clearing a condition deletes the property (not `null`). Deleting an
  option deletes its condition with it.
- **Option-value rewrite:** `findOptionReferences` and
  `updateConditionReferences` must also walk `options[].condition` on
  choice fields, so renaming or deleting an option still updates
  conditions that compare against that value — including conditions
  stored on **other fields' options**.
- **"Other"** (`enableOtherOption`) is not a `ChoiceOption` and has no
  per-option condition. When enabled it stays in the list regardless
  of other options' conditions.
- **Runtime picker:** an option with no `condition`, or with a
  condition that evaluates true, is shown. An option whose condition
  evaluates false is omitted from the editable picker (expanded and
  dropdown). Exclusive-option behaviour applies only among currently
  visible options.
- **Selected value that becomes hidden (editable form):** drop that
  choice from the field value as conditions re-evaluate (Select single
  → empty string; Select multiple → remove that item, keep other
  selected items). Do this while the field is editable, including when
  a referenced field changes in the current session. Do not strip
  stored values in read-only / record **view**. View continues to
  render the stored string or array (`DefaultRenderer` or equivalent).
- **Validation** still accepts any value in the field's defined option
  list (plus `Other:` when enabled). Do not fail save solely because a
  stored value's option is currently hidden. After the edit-path clear
  above, the live value is a visible option or empty / Other.
- **Required** still applies to the remaining value. If every
  predefined option is hidden and Other is off, an empty required
  field is invalid in the usual way.
- No designer live preview of option show/hide. Conditions stay
  configured in the editor and evaluated in a deployed notebook, as
  with field conditions.
- Do not change field- or section-level visibility, the condition
  builder's operators, or Conductor / Couch document shape.

## 3. Acceptance criteria

1. Expanding a Select single (`RadioGroup`) or Select multiple
   (`MultiSelect`) field in the designer shows an **Add condition**
   control on each predefined option row. The **Other** row does not.
2. Saving a condition on an option writes
   `fields[<id>].component-parameters.ElementProps.options[<i>].condition`
   using the existing condition AST (single comparison or AND/OR
   group). Reloading the notebook in the designer still shows that
   condition and **Update condition** on that row, plus a
   **Conditional** marker on the row.
3. Clearing the option condition removes `condition` from that option
   object (property deleted, not `null`). Other option keys
   (`value`, `label`, exclusive membership, `RadioProps`) are
   unchanged.
4. Reordering options, toggling Exclusive (MultiSelect), and renaming
   an option's label/value keep an existing option `condition` attached
   to that option. Renaming an option value still rewrites field-,
   section-, and **option-level** conditions that compared against the
   old value.
5. The option condition builder can reference other fields in the same
   form, plus the existing parent / linked-record / notebook-metadata
   references. It cannot reference the choice field that owns the
   option.
6. After the notebook is saved and opened in the data-collection app,
   a Select single or Select multiple picker (expanded checklist **and**
   dropdown) omits options whose condition evaluates false and shows
   options whose condition is absent or true. The list updates as
   referenced field values change. **Other**, when enabled, remains
   listed.
7. In an editable form, if the current Select single value is an option
   that has just become hidden, the field value becomes `''`. If a
   Select multiple array contains such an option, that item is removed
   and any other selected items remain. Read-only record view still
   shows the stored value and does not rewrite it.
8. A required choice field with no remaining visible predefined
   options (and Other off) fails required validation in the same way
   as an empty required choice field today. A stored value that is
   still in the defined option list does not fail validation merely
   because that option is currently hidden.
9. Field-level and section-level conditions, including those that
   compare against Select / MultiSelect values, continue to save,
   load, rename-rewrite, and evaluate as they do today.
10. Legacy `component-name: 'Select'` notebooks pick up the same option
    filtering as `RadioGroup` (shared component). Hierarchical
    `AdvancedSelect` option trees are unchanged.

## 4. Out of scope

- Per-option conditions on Hierarchical Select (`AdvancedSelect`
  `optiontree`), Checkbox, or any non-choice field.
- Conditioning the **Other** choice, dynamic option lists from an
  external vocabulary, or option groups.
- New condition operators, new reference kinds, or a designer
  simulation of option show/hide.
- Notebook schema version bump or a Couch/API migration.
- Changing field- or section-level visibility semantics (hidden
  **fields** still retain their data, per existing user docs).
- Export-column shape, CSV/GIS mapping, or Conductor routes.
- Rewriting the shared condition editor except as needed to open it
  from an option row.

## 5. Test plan

Automated (`@faims3/forms`, `pnpm --filter=@faims3/forms exec vitest --run`):

1. `ChoiceOptionSchema` accepts an option with a simple `equal`
   `condition` and an option with no `condition`. A parsed option
   still has `condition` when it was present (not stripped).
2. Render RadioGroup (expanded and dropdown) with two options, one
   conditioned on another field value supplied through the same
   values object the form uses for visibility. Assert the conditioned
   option is absent when the condition is false and present when true.
3. Same for MultiSelect (expanded and dropdown).
4. Editable RadioGroup: start with the conditioned option selected,
   flip the controlling value so the option hides, assert `setFieldData`
   is called with `''`.
5. Editable MultiSelect: start with `[hiddenOption, stillVisible]`,
   hide the first, assert the value becomes `[stillVisible]`.
6. Existing RadioGroup tests (Other, display mode) still pass.
   Add a case that Other remains listed when every predefined option
   is hidden.

Automated (`@faims3/web`, `pnpm --filter=@faims3/web exec vitest --run`):

7. In `OptionsEditor` for RadioGroup and MultiSelect, assert **Add
   condition** on a predefined option row and not on Other.
8. Save a simple equality condition on one option. Assert the store
   option has the expected `condition` object and the row shows
   **Conditional**. Clear it; assert `condition` is absent.
9. Reorder two options, one with a condition: the condition stays on
   the same option value after reorder.
10. Extend `conditionReferences` tests so renaming an option value
    rewrites a `condition` stored on **another** field's option, not
    only field- and section-level conditions.
11. Existing `condition.test.tsx` / field-level condition tests still
    pass.

Automated (`@faims3/data-model`, only if compile-time attachment is
used):

12. `compileExpression` on an option `condition` matches field-level
    evaluation for the same AST. Unknown operator still throws.

Manual (stack up; Control Centre `:3001`, app `:3000`):

13. Create a Team, Template, form with Select single "Habitat"
    (Forest / Reef) and Select multiple "Species" whose options each
    have a condition on Habitat. Publish, open in the collection app.
    Confirm Species options appear only for the matching habitat,
    including after changing Habitat, in both display modes.
14. Repeat with Select single as the dependent field. Confirm a
    previously selected species clears when Habitat changes. Open the
    same record read-only and confirm the stored value still displays
    if it was saved before the clear.
15. Confirm field-level "show Species if Habitat is set" still works
    together with option conditions.

No new browser e2e required if the vitest coverage above ships in the
same change.

## 6. Risk class and why

**Med.** Size: **m**.

This is new persistence on option objects plus live filtering in two
choice widgets, not a new sync or auth path. Residual risk is real:
clearing a now-hidden selection can drop answers when a collector
changes a controlling field; older collection-app builds ignore
`condition` and still show every option; validation must not reject
historical values that the picker no longer offers. Those are
data-quality hazards on an existing condition engine, so the class is
medium rather than high. No schema bump and no API change keep the
blast radius inside designer + `@faims3/forms`.

## 7. Open questions

1. Exact control copy on the option row (**Add condition** vs a
   compact icon) can match the field-level button or be tightened to
   fit the options table. Behaviour in §3 is what matters.
2. Should opening an existing record for **edit** immediately clear a
   stored choice whose option is already hidden from the current
   values, or only after the collector changes a referenced field?
   This spec clears whenever the editable picker would hide the
   selected option (including first paint). Prefer "clear only after
   a controlling field changes" only if product wants to protect
   untouched historical answers during a later edit-and-save.
