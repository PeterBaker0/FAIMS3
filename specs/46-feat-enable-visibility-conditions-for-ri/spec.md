# Enable visibility conditions for RichText

Issue: [#46](https://github.com/PeterBaker0/FAIMS3/issues/46) (BSS-1303)

Proposed size: **s**. Pull-request breakdown is left to the planner.

## 1. Problem

Notebook authors cannot attach visibility conditions to RichText fields in
the Control Centre designer. RichText is a display-only field used for
formatted instructions, warnings, and headings. Authors already expect to
show that content only when another field has a given value (for example, a
safety warning when "Hazardous site" is selected). User docs already
describe that pattern in
`docs/user/field-types/display-fields/rich-text.md`.

The gap is designer UI, not the notebook schema or the collection-app
evaluator:

- `web/src/designer/components/Fields/RichTextEditor.tsx` wraps
  `BaseFieldEditor` with `showExtraConfig={false}`.
- `BaseFieldEditor` gates the whole "general field settings" card on that
  flag, including the shared `ConditionModal` ("Add condition" /
  "Update condition").
- Field definitions already accept `condition`
  (`library/data-model/src/uiSpecification/types.ts`).
- At runtime, `compileUiSpecConditionals` and `getFieldsMatchingCondition`
  already apply `field.condition` to every field type, including RichText.

So a condition stored on a RichText field would already hide or show it in
the collection app. Authors currently have no designer control that writes
that property.

## 2. Constraints

- Change designer behaviour for RichText only. Reuse the existing condition
  builder (`ConditionModal`, `ConditionControl`, `ConditionSummary`) and
  the existing `fieldConditionChanged` reducer. Persist the same
  `ConditionType` AST used by other fields, on `fields[id].condition`.
- Do not flip `showExtraConfig` to `true` on RichText as a shortcut.
  That card also exposes Required, Annotation, Uncertainty, "Copy value to
  new records", and (when enabled) template protection. Those controls are
  not part of this issue and are not meaningful for a display-only field.
- Do not add new condition operators, new reference kinds, or a designer
  live preview of show/hide. The editor already documents that conditions
  are configured there and evaluated in a deployed notebook.
- Do not change the collection-app evaluator unless a RichText-specific
  hole is found. The default assumption is that persisting `condition` is
  enough for hide/show.
- Do not bump notebook schema version. `condition` is already optional on
  every field.
- Keep RichText's content editor, label, and export-name behaviour
  unchanged.

## 3. Acceptance criteria

1. Expanding a RichText field in the designer shows an **Add condition**
   control that opens the same condition builder used by other fields.
2. Saving a condition writes `fields[<richTextId>].condition` in the
   notebook UI spec using the existing condition AST (single comparison or
   AND/OR group). Reloading the notebook in the designer still shows that
   condition and an **Update condition** control.
3. Clearing the condition removes `fields[<richTextId>].condition` (the
   property is deleted, not left as `null`).
4. While a condition is set, the collapsed RichText header shows the
   existing **Conditional** chip used by other conditional fields.
5. The RichText condition builder can reference other fields in the same
   form, plus the existing parent / linked-record / notebook-metadata
   references. It cannot reference the RichText field itself.
6. After the notebook is saved and opened in the data-collection app, the
   RichText content is hidden when the condition evaluates false and shown
   when it evaluates true, updating as the referenced field values change.
7. Required, Annotation, Uncertainty, and "Copy value to new records"
   remain unavailable on RichText.
8. Conditions already configured on other field types and on sections
   continue to save, load, and evaluate as they do today.

## 4. Out of scope

- Conditions on other field types that also set `showExtraConfig={false}`
  (`ParentFieldDisplay`, `TemplatedStringField`, `BasicAutoIncrementer`).
- Enabling Required, Annotation, Uncertainty, persistence, voice-to-text,
  or template protection on RichText.
- Treating RichText as a *source* field that other conditions compare
  against (it stores no collector-entered value).
- Designer simulation of dynamic show/hide.
- New condition operators, schema migrations, API changes, or export-column
  behaviour for RichText.
- Rewriting the shared condition editor.

## 5. Test plan

Automated (designer, `@faims3/web`):

1. Render `RichTextEditor` for a RichText field in a form that also has a
   choice/text field. Assert **Add condition** is present and that Required,
   Annotation, Uncertainty, and "Copy value to new records" are not.
2. Save a simple equality condition against the other field. Assert the
   store field has the expected `condition` object and the header shows
   **Conditional**.
3. Clear the condition. Assert `condition` is absent from the field object.
4. Run existing `web/src/designer/components/condition.test.tsx` to confirm
   the shared builder is unchanged.

Automated (runtime, only if a RichText-specific hole is found):

5. Compile a uiSpec whose RichText field has `condition` and assert
   `getFieldsMatchingCondition` includes or excludes that field according
   to the current values.

Manual:

6. In Control Centre, add a Select (or similar) and a RichText field to the
   same form. Attach "show RichText if Select equals X". Save.
7. Open the notebook in the collection app. Confirm the RichText content
   appears only when the Select value matches, including after changing the
   Select value.

## 6. Risk class and why

**Low.** This is a designer wiring change onto an existing condition model
and evaluator. No schema bump, no new persistence format, and no new
runtime API. The main implementation risk is exposing the whole extra-config
card (Required / Annotation / etc.) instead of only the condition controls.
Size **s**.

## 7. Open questions

None that block implementation. If the shared `BaseFieldEditor` cannot show
conditions without the rest of extra config, add a narrow prop (or equivalent)
rather than broadening RichText's settings.
