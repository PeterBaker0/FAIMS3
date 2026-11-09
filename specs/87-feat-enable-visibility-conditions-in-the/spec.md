# Spec: Enable visibility conditions for RichText in the designer

Issue: [#87](https://github.com/PeterBaker0/FAIMS3/issues/87) — feat: enable visibility conditions in the designer for RichText fields

## Problem

Notebook authors cannot attach visibility conditions to **RichText** fields in the Control Centre designer. The inspector never offers **Add condition**.

That is a designer-only gap. Persistence (`field.condition` on the ui-spec), `fieldConditionChanged`, and runtime visibility (`compileUiSpecConditionals` → `currentlyVisibleMap` → `FormSection`) already treat RichText like any other field. User docs already tell authors to use conditions for context-sensitive RichText (for example a safety warning that appears only when a “Hazardous site” option is selected).

The gate is `web/src/designer/components/Fields/RichTextEditor.tsx`, which renders `BaseFieldEditor` with `showExtraConfig={false}`. That flag hides the whole **General field settings** card in `BaseFieldEditor`, including `ConditionModal`. There is no registry flag such as `supportsConditions`; other display-adjacent editors (Parent Field Value, Templated String, Basic Auto Incrementer) use the same switch and should stay unchanged.

Authors who inject `field.condition` by other means already get a **Conditional** chip on the accordion and correct show/hide in the collection app. The missing piece is the inspector builder.

## Constraints

- Reuse the existing `ConditionModal` / `ConditionControl` / `fieldConditionChanged` path. Do not invent a RichText-specific condition AST or reducer.
- RichText is display-only (`returns: null` in the forms registry). Enable **conditions as a visibility target**. Do not make RichText a condition **source** in the field picker.
- Do not turn on the rest of the extra-config card for RichText. Required, Annotation, Uncertainty, Copy value to new records, and template-protection controls must stay hidden. `showExtraConfig` currently bundles those with conditions; split that if needed (for example a `showCondition` prop that can be true while `showExtraConfig` stays false).
- Leave `showHelperText={false}` on RichText. Body copy lives in the MDX editor, not helper text.
- Do not change Parent Field Value, Templated String, or Basic Auto Incrementer, which still opt out of extra config.
- Do not change data-model compilation or collection-app visibility evaluation unless a genuine RichText-specific bug is found while wiring the inspector.
- Designer live preview still does not simulate dynamic show/hide. That is existing product behaviour (`docs/user/field-types/shared-settings/conditions.md`); this issue does not require preview simulation.
- Keep condition semantics identical to other fields: same-form (and existing parent / linked / metadata) references, AND/OR groups, save/clear, and the accordion **Conditional** chip when `field.condition` is set.

## Acceptance criteria

1. Expanding a RichText field in the designer inspector shows an **Add condition** control that opens the same `ConditionModal` used by data-entry fields (`BaseFieldEditor` labels `Add condition` / `Update condition`).
2. Saving a valid condition from that modal writes `fields[richTextId].condition` on the ui-spec as a `ConditionType` (verified in the Redux store or serialised notebook JSON after save).
3. When `field.condition` is already set, the inspector shows **Update condition** and a **Show this field if** summary (`ConditionSummary`) for that RichText field.
4. Clearing the condition from the modal removes `field.condition` from that RichText field (the property is deleted, not left as `null`).
5. With only one other usable field in the form, the modal still follows existing `ConditionModal` behaviour (builder when `selectableFieldCount > 0`; the existing “only one field” empty state when it is not).
6. The RichText inspector does not show Required, Annotation, Uncertainty, or Copy value to new records after this change.
7. Parent Field Value, Templated String, and Basic Auto Incrementer inspectors still do not show **Add condition**.
8. A TextField (or other type that already uses default `showExtraConfig`) still shows **Add condition**; existing condition tests in `web/src/designer/components/condition.test.tsx` continue to pass.
9. After a condition is saved on RichText, the field accordion shows the existing **Conditional** chip (`field-editor.tsx` already keys off `field.condition`).

## Out of scope

- Runtime visibility engine, validation-of-hidden-fields, or collection-app rendering of RichText content.
- Designer preview simulating show/hide as the controlling field changes.
- Enabling conditions (or Required / annotation) on Parent Field Value, Templated String, or Basic Auto Incrementer.
- New condition operators, cross-form references, or using RichText as a condition source.
- Migrating existing notebooks to add conditions; authors opt in per field.
- Regenerating user-doc screenshots unless the implementer changes documented UI copy.
- Collection-app e2e for hide/show of RichText (runtime is already generic).

## Test plan

Check: code

This change can break designer inspector behaviour (which controls appear, and whether `field.condition` is written). Cover it with designer unit/component tests, not a browser session.

Automated (required):

- Extend `web/src/designer/components/Fields/BaseFieldEditor.test.tsx` and/or add `RichTextEditor.test.tsx` using the existing `createDesignerStore` + `loaded` harness (mock `MdxEditor` the same way `BaseFieldEditor.test.tsx` does).
- Cases:
  1. Render `RichTextEditor` for a RichText field in a form that also has a TextField (or similar). Assert **Add condition** is in the document.
  2. Save a simple `equal` condition through the modal (or by calling the same `onChange` path `ConditionModal` uses) and assert `store.getState().notebook.uiSpec.present.fields[richTextId].condition` matches.
  3. Clear the condition and assert `condition` is absent on that field.
  4. Assert Required / Annotation / Uncertainty / Copy value to new records controls are not in the RichText inspector.
  5. If `BaseFieldEditor` gains a split prop, assert `showExtraConfig={false}` plus the new condition flag shows **Add condition** and still hides Required; default `showExtraConfig={true}` still shows both.
- Command: `pnpm --filter=@faims3/web exec vitest --run src/designer/components/Fields/`
- Also run the existing condition suite so the builder is unchanged: `pnpm --filter=@faims3/web exec vitest --run src/designer/components/condition.test.tsx`
- No new `@faims3/data-model` or `@faims3/forms` tests unless the implementer actually changes those packages.

Named manual check (optional, not required to close the issue): in Control Centre designer, add RichText plus a Checkbox, add a condition on the RichText, confirm the **Conditional** chip, save the template, and confirm `condition` is present on that field in the notebook JSON.

## Risk class and why

**Low.** The collection app and ui-spec already honour `field.condition` on any field, including RichText. The work is confined to the designer inspector: exposing `ConditionModal` without enabling the rest of the display-only extra-config card. The main implementation risk is flipping `showExtraConfig` wholesale and accidentally offering Required on a non-data field; that is constrained above and covered by tests. No API, permissions, or data-migration surface.

Size: **s**. One editor, optional small `BaseFieldEditor` prop split, and designer tests. No runtime or schema change.

## Open questions

- Should `docs/user/screenshots/fieldmark/field-types-design/rich-text-02-configured.png` be regenerated so the configured-field screenshot includes **Add condition**? The RichText user page already describes conditions; screenshot refresh is nice-to-have, not required to ship the inspector.
- Product has already documented conditions on RichText and omitted them on Parent Field Value. No further product question is blocking if Required and the other extra-config toggles stay hidden.
