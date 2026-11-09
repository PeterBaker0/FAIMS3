# Spec: update some designer defaults (#90)

## Problem

New fields created in the Designer seed defaults that most notebooks do not want.

Related-record fields (`RelatedRecordSelector`) currently start with both optional linking affordances on:

- `allowLinkToExisting: true` — the field editor checkbox **Allow linking to existing records** is checked, so the data-collection app shows the **Link Existing** button.
- `hideCreateAnotherButton: false` — the field editor checkbox **Hide the 'Create Another' Button** is unchecked, so after saving a related record the app shows the **Finish and create another …** quick link.

Map location fields (`MapFormField`) currently start at `zoom: 12`. That is city-scale and too far out for typical site work. The map runtime already falls back to zoom `14` when a field has no zoom value (`library/forms/lib/fieldRegistry/fields/MapField/index.tsx`).

These values live in the Designer field templates in `web/src/designer/fields.tsx`, which `getFieldSpec` clones and `fieldAdded` inserts into a notebook. Designers can already toggle the related-record checkboxes and edit zoom; only the starting values are wrong.

## Constraints

- Change Designer **new-field templates** only. The source of truth is `web/src/designer/fields.tsx` (`RelatedRecordSelector` and `MapFormField` `component-parameters`).
- Do not migrate, rewrite, or otherwise alter fields already saved in templates or projects. Duplicating an existing field must keep that field's stored values.
- Do not change compiled UI-spec schema defaults used when a key is **missing** from an old notebook (`allowLinkToExisting` and `hideCreateAnotherButton` in `library/data-model`). Missing keys on old notebooks keep today's runtime behaviour.
- Designers must still be able to turn **Allow linking to existing records** on, unhide the Create Another quick link, and set any valid zoom.
- Do not change TakePoint (it has no zoom). Do not rename app buttons or Designer checkbox labels unless required to land the defaults.
- Polarity for the Create Another control: the issue wants the **quick link off** by default, which means the template must set `hideCreateAnotherButton: true` (the Hide checkbox starts checked). The related-record template already defaults `relation_type` to Child; apply the flag on that shared template, not only after the designer picks Child.
- Use zoom **14** for new map fields: one clear step in from 12, and the same number the map field uses when zoom is omitted.

## Acceptance criteria

1. `getFieldSpec('RelatedRecordSelector')` returns `component-parameters.allowLinkToExisting === false`.
2. `getFieldSpec('RelatedRecordSelector')` returns `component-parameters.hideCreateAnotherButton === true`.
3. Dispatching `fieldAdded` with `fieldType: 'RelatedRecordSelector'` writes a field whose `component-parameters` include `allowLinkToExisting: false` and `hideCreateAnotherButton: true` (related-type wiring in `fieldAdded` is unchanged).
4. In the Designer related-record editor, a newly added field shows **Allow linking to existing records** unchecked and **Hide the 'Create Another' Button** checked.
5. `getFieldSpec('MapFormField')` returns `component-parameters.zoom === 14`.
6. Dispatching `fieldAdded` with `fieldType: 'MapFormField'` writes a field whose `component-parameters.zoom` is `14`.
7. The Designer map field editor **Zoom Level** input shows `14` for a newly added map field.
8. Opening an existing notebook whose related-record or map field already stores different values (`allowLinkToExisting`, `hideCreateAnotherButton`, or `zoom`) leaves those stored values unchanged.

## Out of scope

- Bulk migration of published templates, projects, or sample notebooks to the new defaults.
- Changing runtime schema `.default()` values for missing related-record keys, or changing the map field's omitted-zoom fallback independently of the Designer template.
- TakePoint / GPS capture fields, map feature type, GeoTIFF, or "set to current location".
- Relabelling **Link Existing**, **Allow linking to existing records**, **Hide the 'Create Another' Button**, or the finish-and-create-another navigation copy.
- Hiding the primary **Add new {type}** related-record button. That control is not one of the three requested defaults.

## Test plan

Check: code

This change is three persisted default values on new fields. Unit tests can assert the templates and the `fieldAdded` output; a browser session is not required.

Add or extend tests in `@faims3/web` (vitest `--run`) that:

1. Assert `getFieldSpec('RelatedRecordSelector')` has `allowLinkToExisting === false` and `hideCreateAnotherButton === true`.
2. Assert `getFieldSpec('MapFormField')` has `zoom === 14`.
3. Assert `fieldAdded` for those field types copies the same values into the notebook UI spec. Natural home: `web/src/designer/store/slices/uiSpec/uiSpec-reducer.test.ts` (already covers `fieldAdded`) or a small `web/src/designer/fields` test.

Run:

```
pnpm --filter=@faims3/web exec vitest --run src/designer/store/slices/uiSpec/uiSpec-reducer.test.ts
```

and the new/updated file that asserts `getFieldSpec` defaults, if it is not that same file.

No new e2e. Do not add a notebook-migration test; existing fields are out of scope.

Named manual check (optional, not required to merge): in Designer, add a related-record field and a map field and confirm the two checkboxes and the zoom input match criteria 4 and 7.

## Risk class and why

**Low.** The edit is a handful of template literals consumed only when a designer adds a new field. Saved notebooks keep their stored parameters. Designers can still override all three settings. The main residual risk is polarity on `hideCreateAnotherButton` (true means the quick link is hidden) and picking zoom 14 rather than 13 or 15; both are specified above.

## Open questions

None. Zoom 14 is the chosen "slightly more" default. Existing notebooks are not migrated.
