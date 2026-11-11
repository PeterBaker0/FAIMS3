# Plan

One pull request. Size **s**, risk **low**. Expose the existing designer
condition builder on RichText without enabling the rest of extra config.

```yaml
tasks:
  - key: split-condition-controls
    title: Show conditions without the extra-config card
    description: >-
      Add a narrow prop on BaseFieldEditor (for example showCondition,
      default false) that renders the existing ConditionModal and
      ConditionSummary without Required, Annotation, Uncertainty, Copy
      value to new records, voice-to-text, or template protection.
      Keep the current extra-config card unchanged when
      showExtraConfig is true so other field types still show
      conditions next to Required. Do not default the new prop on,
      and do not enable it for ParentFieldDisplay, TemplatedStringField,
      or BasicAutoIncrementer. Continue to persist via
      fieldConditionChanged and pass field={fieldName} into
      ConditionModal so the builder excludes the current field.
    depends_on: []
    files_hint:
      - web/src/designer/components/Fields/BaseFieldEditor.tsx
    acceptance:
      - 1
      - 7
      - 8
    risk: low
    size: s
    tier: cheap
  - key: wire-rich-text
    title: Enable condition controls on RichText
    description: >-
      In RichTextEditor, keep showExtraConfig={false} and turn on the
      new condition-only prop. Leave the MDX content editor, label,
      helper-text hiding, and export-name behaviour unchanged. Do not
      flip showExtraConfig to true.
    depends_on:
      - split-condition-controls
    files_hint:
      - web/src/designer/components/Fields/RichTextEditor.tsx
    acceptance:
      - 1
      - 7
    risk: low
    size: s
    tier: cheap
  - key: designer-tests
    title: Cover RichText condition save, clear, and chip
    description: >-
      Add designer unit tests with a form that has a RichText field and
      at least one other field. Assert Add condition is visible and
      Required, Annotation, Uncertainty, and Copy value to new records
      are not. Save an equality condition against the other field and
      assert fields[id].condition matches the existing AST. Re-render
      from a store that already has that condition and assert Update
      condition plus ConditionSummary. Clear the condition and assert
      the property is deleted, not null. Render FieldEditor with a
      conditioned RichText field and assert the Conditional chip.
      Open the builder and assert the RichText field is not a selectable
      source while the other form field is.
    depends_on:
      - wire-rich-text
    files_hint:
      - web/src/designer/components/Fields/RichTextEditor.tsx
      - web/src/designer/components/Fields/BaseFieldEditor.test.tsx
      - web/src/designer/components/field-editor.test.tsx
    acceptance:
      - 1
      - 2
      - 3
      - 4
      - 5
      - 7
    risk: low
    size: s
    tier: cheap
  - key: condition-regression
    title: Keep existing field and section conditions working
    description: >-
      Run the existing designer condition suite
      (web/src/designer/components/condition.test.tsx) and BaseFieldEditor
      tests. Do not rewrite ConditionControl. If the extra-config layout
      for ordinary fields changed, restore it so conditions still sit
      with Required.
    depends_on:
      - designer-tests
    files_hint:
      - web/src/designer/components/condition.test.tsx
      - web/src/designer/components/Fields/BaseFieldEditor.test.tsx
    acceptance:
      - 8
    risk: low
    size: s
    tier: cheap
  - key: runtime-visibility
    title: Prove RichText hide and show from field.condition
    description: >-
      Add a focused data-model unit test that compiles a uiSpec whose
      RichText field has a condition and asserts getFieldsMatchingCondition
      includes the field when values match and excludes it when they
      do not. Do not change compileUiSpecConditionals or the collection
      app unless that test fails. No schema bump.
    depends_on:
      - condition-regression
    files_hint:
      - library/data-model/src/uiSpecification/utils.ts
      - library/data-model/tests/conditionals.test.ts
    acceptance:
      - 6
    risk: low
    size: s
    tier: cheap
```
