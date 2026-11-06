# Plan

One pull request. Size **s**, risk **low**. Expose the existing field condition builder on RichText without turning on the rest of the extra-config card.

```yaml
tasks:
  - key: split-condition-flag
    title: "Show conditions without the extra-config card"
    description: >-
      Add a showCondition prop on BaseFieldEditor, defaulting to the same
      value as showExtraConfig so existing callers keep the current layout.
      When showExtraConfig is false and showCondition is true, render Add
      condition / Update condition, ConditionModal, and the Show this field
      if summary, wired to fieldConditionChanged. Do not render Required,
      Annotation, Uncertainty, Copy value to new records, or voice-to-text
      in that mode. When both flags are true, keep the current extra-config
      card and do not duplicate the condition controls. Do not set
      showExtraConfig true on RichText. Leave Parent Field Value, Templated
      String, and Auto-incrementer on showExtraConfig false with the default
      showCondition (off).
    depends_on: []
    files_hint:
      - web/src/designer/components/Fields/BaseFieldEditor.tsx
      - web/src/designer/components/Fields/BaseFieldEditor.test.tsx
    acceptance:
      - 1
      - 3
      - 6
    risk: low
    size: s
    tier: cheap
  - key: enable-richtext-conditions
    title: "Turn on conditions in the RichText inspector"
    description: >-
      Pass showCondition true and keep showExtraConfig false on
      RichTextEditor. Reuse ConditionModal, ConditionControl, the existing
      condition AST, and fieldConditionChanged. Do not change the markdown
      content editor or other RichText settings. Do not add a RichText-specific
      condition format. Clearing a condition must dispatch null so the reducer
      deletes fields[id].condition rather than storing null. Compound AND/OR,
      parent, related, and metadata references come from the shared builder;
      do not add operators. Persistence, publish, and undo stay on the
      existing field.condition path (uiSpec/fieldConditionChanged is already
      undoable).
    depends_on:
      - split-condition-flag
    files_hint:
      - web/src/designer/components/Fields/RichTextEditor.tsx
    acceptance:
      - 1
      - 2
      - 3
      - 4
      - 5
      - 10
      - 11
    risk: low
    size: s
    tier: cheap
  - key: test-richtext-inspector
    title: "Cover RichText add, save, clear, and undo"
    description: >-
      Add Designer vitest coverage for RichTextEditor in a form that also has
      a Text or RadioGroup field so the condition picker has a source. Assert
      Add condition when no condition is set; saving a simple equal condition
      writes fields[id].condition; the button becomes Update condition and the
      summary is shown; clearing removes the key (not null). Assert Required,
      Annotation, Uncertainty, and Copy value to new records are absent.
      Undo/redo of add, update, and clear matches other field condition edits.
      Mock the MDX editor like BaseFieldEditor.test.tsx. Run with pnpm
      --filter=@faims3/web exec vitest --run.
    depends_on:
      - enable-richtext-conditions
    files_hint:
      - web/src/designer/components/Fields/RichTextEditor.test.tsx
      - web/src/designer/components/Fields/BaseFieldEditor.test.tsx
    acceptance:
      - 1
      - 2
      - 3
      - 4
      - 6
      - 10
      - 11
    risk: low
    size: s
    tier: cheap
  - key: test-other-inspectors
    title: "Keep extra config unchanged on other field types"
    description: >-
      Assert Parent Field Value, Templated String, and Auto-incrementer
      inspectors still have no Add condition control. Assert a Text field
      still shows Add condition plus Required, Annotation, Uncertainty, and
      Copy value to new records. Do not enable showCondition on those
      extra-config-hidden types.
    depends_on:
      - split-condition-flag
    files_hint:
      - web/src/designer/components/Fields/ParentFieldDisplayEditor.tsx
      - web/src/designer/components/Fields/TemplatedStringFieldEditor.tsx
      - web/src/designer/components/Fields/BasicAutoIncrementer.tsx
      - web/src/designer/components/Fields/BaseFieldEditor.test.tsx
    acceptance:
      - 6
      - 7
    risk: low
    size: s
    tier: cheap
  - key: test-richtext-visibility
    title: "Prove RichText is filtered like any other field"
    description: >-
      Add a @faims3/data-model (or @faims3/forms) test with a compiled spec
      containing a RichText field conditioned on a sibling choice field.
      After compileUiSpecConditionals, getFieldsMatchingCondition /
      currentlyVisibleFields includes the RichText id when the choice matches
      and excludes it when it does not. A RichText field with no condition
      is always included when its section is visible. Do not change the
      evaluator. This covers collection and Designer preview, which already
      use the same visibility map. Hidden RichText has no collectable value.
    depends_on: []
    files_hint:
      - library/data-model/src/uiSpecification/utils.ts
      - library/data-model/tests/conditionals.test.ts
    acceptance:
      - 8
      - 9
    risk: low
    size: s
    tier: cheap
  - key: docs-keep-conditions-tip
    title: "Leave RichText condition docs accurate"
    description: >-
      Keep the user-guide tip that authors can use Conditions for
      context-sensitive RichText. Do not add documentation claiming Required,
      Annotation, Uncertainty, or Copy value to new records now apply to
      RichText. Do not change changelog, unrelated docs, or screenshots unless
      a screenshot currently asserts that RichText has no condition control.
    depends_on:
      - enable-richtext-conditions
    files_hint:
      - docs/user/field-types/display-fields/rich-text.md
    acceptance:
      - 12
    risk: low
    size: s
    tier: cheap
```
