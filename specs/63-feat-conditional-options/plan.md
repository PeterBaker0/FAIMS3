# Plan: conditional options

Issue: [#63](https://github.com/PeterBaker0/FAIMS3/issues/63)
Spec: [spec.md](./spec.md)

One pull request. Size **m**, risk **med**. No schema bump, no auto-clear.

```yaml
approach: >
  One pull request adds an optional condition AST on each Select single and
  Select multiple ChoiceOption, then filters those lists at render with the
  existing compileExpression compiler and the same buildConditionValues bag
  the form manager already uses for field visibility. RadioGroup (including
  legacy Select) and MultiSelect both call one helper in checklist and
  dropdown modes, keeping a currently selected option visible instead of
  clearing it. OptionsEditor reuses ConditionModal on ordinary option rows,
  preserves condition across rebuilds, allows the parent choice field as a
  source, and walks option-level conditions on rename or delete. User docs
  cover per-option visibility; hierarchical select, Checkbox, and Other are
  untouched.
tasks:
  - key: choice-option-schema
    title: Allow optional condition on choice options
    description: >
      Extend ChoiceOptionSchema with optional condition using
      ConditionalExpressionSchema. Leave CURRENT_NOTEBOOK_UI_SCHEMA_VERSION
      at 1.0.1 and keep options without condition valid; do not persist
      compiled conditionFn in notebook JSON.
    depends_on: []
    files_hint:
      - library/forms/lib/fieldRegistry/fields/choiceFieldParams.ts
      - library/data-model/src/uiSpecification/types.ts
      - library/data-model/src/data_storage/migrations/notebookMigrations/registry.ts
    acceptance:
      - 10
    risk: low
    size: s
    tier: cheap
  - key: visible-options-helper
    title: Filter options with compileExpression
    description: >
      Add a shared helper that compiles each option.condition with
      compileExpression and returns options that have no condition, evaluate
      true, or are currently selected. Unit-test true, false, absent
      condition, and selected-but-false; never write conditionFn into JSON.
    depends_on:
      - choice-option-schema
    files_hint:
      - library/forms/lib/fieldRegistry/fields/choiceFieldParams.ts
      - library/forms/lib/fieldRegistry/fields/visibleChoiceOptions.ts
      - library/forms/lib/fieldRegistry/fields/visibleChoiceOptions.test.ts
      - library/data-model/src/uiSpecification/conditionals.ts
    acceptance:
      - 6
      - 7
    risk: med
    size: s
    tier: cheap
  - key: runtime-choice-filter
    title: Filter Select single and Select multiple at render
    description: >
      Pass the form manager's buildConditionValues bag into RadioGroup and
      MultiSelect (Field or section props as needed so sibling edits re-filter)
      and apply the helper in both checklist and dropdown modes. Do not
      auto-clear stored values, keep validation on the full options list, and
      let legacy Select inherit RadioGroup; run the existing field tests.
    depends_on:
      - visible-options-helper
    files_hint:
      - library/forms/lib/formModule/types.ts
      - library/forms/lib/formModule/Field.tsx
      - library/forms/lib/formModule/sections/FormSection.tsx
      - library/forms/lib/formModule/formManagers/EditableFormManager.tsx
      - library/forms/lib/formModule/formManagers/PreviewFormManager.tsx
      - library/forms/lib/fieldRegistry/fields/RadioGroup/index.tsx
      - library/forms/lib/fieldRegistry/fields/RadioGroup/RadioGroup.test.tsx
      - library/forms/lib/fieldRegistry/fields/MultiSelect/index.tsx
    acceptance:
      - 6
      - 7
      - 8
      - 9
      - 10
    risk: med
    size: m
    tier: mid
  - key: designer-preserve-conditions
    title: Keep option conditions across OptionsEditor rebuilds
    description: >
      Stop OptionsEditor from rebuilding options as only {label, value} plus
      RadioProps. Reorder, rename, Exclusive, and Other position changes must
      keep each option's condition.
    depends_on:
      - choice-option-schema
    files_hint:
      - web/src/designer/components/Fields/OptionsEditor.tsx
    acceptance:
      - 4
    risk: med
    size: s
    tier: cheap
  - key: option-condition-rewrites
    title: Walk option conditions on rename and delete
    description: >
      Extend findOptionReferences and the OptionsEditor rename/delete update
      path so option-level conditions are warned about and rewritten the same
      way as field and section conditions. Add cases next to
      conditionReferences.test.ts and keep existing field/section tests green.
    depends_on:
      - choice-option-schema
    files_hint:
      - web/src/designer/domain/conditions/conditionReferences.ts
      - web/src/designer/domain/conditions/conditionReferences.test.ts
      - web/src/designer/components/Fields/OptionsEditor.tsx
    acceptance:
      - 4
      - 10
    risk: med
    size: s
    tier: cheap
  - key: designer-option-conditions
    title: Add condition controls on ordinary option rows
    description: >
      Reuse ConditionModal on each ordinary OptionsEditor row (not Other) so
      Add/Update/clear persist option.condition, delete the property on clear,
      and show a Conditional indicator. Scope the picker to the same form plus
      parent/linked/metadata refs and include the parent choice field itself.
    depends_on:
      - designer-preserve-conditions
      - option-condition-rewrites
    files_hint:
      - web/src/designer/components/Fields/OptionsEditor.tsx
      - web/src/designer/components/condition/ConditionModal.tsx
      - web/src/designer/components/condition/ConditionControl.tsx
      - web/src/hooks/use-condition-field-context.ts
      - web/src/designer/features/field-search/fieldSearchUtils.ts
      - web/src/designer/components/Fields/OptionsEditor.test.tsx
      - web/src/designer/components/condition.test.tsx
    acceptance:
      - 1
      - 2
      - 3
      - 5
      - 10
    risk: med
    size: m
    tier: mid
  - key: user-docs
    title: Document per-option visibility
    description: >
      Update Select single, Select multiple, and the shared conditions pages
      so they describe per-option visibility, not only field hide/show.
      State that a selected option stays visible if its condition becomes
      false and that Other cannot take a condition.
    depends_on:
      - designer-option-conditions
      - runtime-choice-filter
    files_hint:
      - docs/user/field-types/choice-fields/radio-group.md
      - docs/user/field-types/choice-fields/multi-select.md
      - docs/user/field-types/shared-settings/conditions.md
      - docs/user/authoring/conditions.md
    acceptance:
      - 11
    risk: low
    size: s
    tier: cheap
```
