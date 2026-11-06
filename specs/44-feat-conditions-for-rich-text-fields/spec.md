# Conditions for RichText fields

Issue: [#44](https://github.com/PeterBaker0/FAIMS3/issues/44) (BSS-1303)

Proposed size: **s**. Pull-request breakdown is left to the planner.

## 1. Problem

Notebook authors cannot attach visibility conditions to RichText fields in the
Designer, even though user docs already describe that use (context-sensitive
instructions, for example a safety warning shown only when a hazard option is
selected).

RichText is a display-only field (`faims-custom::RichText`) whose markdown body
lives in `component-parameters.content`. Its designer inspector
(`RichTextEditor`) wraps `BaseFieldEditor` with `showExtraConfig={false}`. That
flag hides the whole extra-config card, including **Add condition** /
**Update condition**, the condition summary, Required, Annotation, Uncertainty,
and Copy value to new records.

The data model and collection runtime already treat `field.condition` as
generic:

- `FieldDefinition.condition` is optional on every field.
- `fieldConditionChanged` writes that property for any field id.
- `compileUiSpecConditionals` and `getFieldsMatchingCondition` hide any field
  whose compiled `conditionFn` is false, including RichText.

The gap is designer authoring, not a new condition language or a new runtime
evaluator. A notebook that already stored `condition` on a RichText field would
show and hide that content during collection today.

## 2. Constraints

- Reuse the existing field condition builder (`ConditionModal` /
  `ConditionControl`), the existing `field.condition` AST, operators, field
  references (`_PARENT.`, linked records, `_METADATA.`), save/clear behaviour,
  and `fieldConditionChanged` reducer. Do not invent a RichText-specific
  condition format.
- Do not enable Required, Annotation, Uncertainty, Copy value to new records,
  or voice-to-text on RichText. Those options are for data-entry fields.
  Flipping `showExtraConfig` to `true` on `RichTextEditor` is therefore not an
  acceptable implementation: it would surface those controls as well as
  conditions.
- Do not add condition authoring to other types that currently hide extra
  config: Parent Field Value, Templated String, Auto-incrementer.
- Do not change which field types can be used as condition *sources* (the
  field picker when editing some other field or section). RichText remains
  display-only; this issue is about RichText as a condition *target*.
- Do not change condition evaluation, validation-of-hidden-fields, or the
  designer canvas rule that the field accordion does not live-simulate
  show/hide. Preview and the collection app already compile `condition` the
  same way for every field.
- Persist conditions on the existing `fields[<id>].condition` key so save,
  reload, template/project publish, and undo (`uiSpec/fieldConditionChanged`
  is already undoable) work without a schema migration.
- Keep the markdown content editor and other RichText settings unchanged.

## 3. Acceptance criteria

1. Expanding a RichText field in the Designer inspector shows an **Add
   condition** control when the field has no `condition`, using the same
   condition modal as other fields.
2. An author can create a simple condition on a RichText field (field,
   operator, value) that references another field in the same form, then save
   it. After save, the UI spec stores that expression on
   `fields[<richTextId>].condition`.
3. After a condition is saved, the inspector shows **Update condition** and a
   "Show this field if …" summary of the saved rule, matching other field
   types.
4. An author can clear the condition from the same modal. Clearing removes
   `fields[<richTextId>].condition` (the key is deleted, not left as `null`).
5. Compound AND/OR conditions, parent-field references, single-link related
   record references, and notebook metadata references work on RichText with
   the same builder and the same stored AST as on a Text field. No new
   operators are required.
6. Required, Annotation, Uncertainty, and Copy value to new records remain
   absent from the RichText inspector. A Text field in the same section still
   shows those controls.
7. Parent Field Value, Templated String, and Auto-incrementer inspectors still
   do not show **Add condition**.
8. A RichText field with no `condition` stays visible whenever its section is
   visible (same as today).
9. During data collection, and in Designer preview that already evaluates
   field conditions, a RichText field with a condition is shown when the
   condition is true and omitted when it is false. Hidden RichText does not
   contribute a collectable value.
10. Saving the notebook, reloading the Designer, and opening the published
    notebook in the collection app preserve the RichText condition.
11. Undo/redo of adding, updating, or clearing a RichText condition behaves
    like condition edits on other fields.
12. User-facing RichText documentation that tells authors to use Conditions
    for context-sensitive guidance remains accurate after this change. Do not
    add docs claiming Required / Annotation / Uncertainty now apply to
    RichText.

## 4. Out of scope

- Required, Annotation, Uncertainty, persistence, protection, or speech
  settings on RichText.
- Conditions on Parent Field Value, Templated String, Auto-incrementer, or
  any other type that currently hides extra config.
- Using RichText as a condition source (branching on instructional content).
- New operators, a new condition schema, or changes to
  `compileUiSpecConditionals` / `currentlyVisibleFields` beyond tests that
  prove a RichText field is filtered like any other field.
- Live show/hide inside the Designer field accordion (existing product
  behaviour: configuration is shown there; dynamic visibility is preview /
  collection).
- Browser e2e for the Designer condition builder. The existing web e2e
  designer spec only opens the shell and does not cover conditions.
- Changelog, unrelated docs, and user-guide screenshots unless a screenshot
  currently asserts that RichText has no condition control.

## 5. Test plan

1. Designer unit test (`@faims3/web`, vitest `--run`): render `RichTextEditor`
   for a RichText field in a form that also has a Text or RadioGroup field.
   Assert **Add condition** is present. Save a simple `equal` condition;
   assert `fieldConditionChanged` / store state writes `condition` on that
   field. Clear it; assert the key is gone. Assert Required / Annotation /
   Uncertainty / Copy value to new records are not in the RichText inspector.
2. Designer unit test: render Parent Field Value, Templated String, and
   Auto-incrementer editors and assert **Add condition** is still absent.
3. Designer unit test: render a Text field and assert extra-config controls
   including **Add condition** are unchanged.
4. Visibility test (`@faims3/data-model` or `@faims3/forms`): a compiled spec
   with a RichText field conditioned on a sibling choice field is included in
   `currentlyVisibleFields` / `getFieldsMatchingCondition` when the choice
   matches and excluded when it does not. A RichText field with no condition
   is always included.
5. Manual check in Designer: add RadioGroup + RichText, condition the RichText
   on one option, save, reload, confirm the summary and stored JSON. In
   preview or a published notebook, changing the radio value shows and hides
   the RichText content.
6. `pnpm --filter=@faims3/web exec vitest --run` and the visibility package
   test from (4) pass.

## 6. Risk class and why

**Low.** Authoring-only gap on one display field type. Condition storage,
compilation, preview, collection visibility, and undo already exist and are
field-agnostic. The main implementation risk is accidentally enabling the rest
of the extra-config card; the constraints forbid that. Size **s**.

## 7. Open questions

None. RichText as a condition source, and exposing Required / Annotation on
RichText, stay out of scope unless a later issue asks for them.
