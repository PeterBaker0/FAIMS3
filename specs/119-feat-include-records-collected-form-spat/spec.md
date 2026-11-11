# Spec: collected record spatial layers in the collection popup map

Issue: [#119](https://github.com/PeterBaker0/FAIMS3/issues/119)

Package: `@faims3/app` (notebook collection) and `@faims3/forms` (Map field popup / `MapComponent`)

## Problem

During data collection, the Map field opens a fullscreen dialog (`MapWrapper` in `library/forms/lib/fieldRegistry/fields/MapField/MapWrapper.tsx`) so the user can place a point, line, or polygon. That popup already shares downloaded / contextual map overlays with the notebook **MAP** tab via `NotebookContextualLayers`. It does **not** plot already-collected record geometry.

The notebook overview map (`app/src/gui/components/notebook/OverviewMap.tsx`) already hydrates GIS fields from collected records (`useRecordFeatures`), filters them with the Designer form setting `displayInOverviewMap` (`getOverviewMapTypes` / `isFormDisplayedInOverviewMap`), and lists one styleable `record-form:<formId>` layer per form in the Layers panel. Paint and hide/show persist per project in `localStorage` (`map-record-form-prefs:<projectId>`).

Because the MAP tab unmounts while the user is on a record form, that record-layer pipeline is not available in the collection popup today. Field workers cannot see nearby collected features while choosing a new location, and hide/show settings for those layers have nothing to apply to.

## Constraints

- Reuse the overview map’s record-geometry source and filter. Do not add a second Designer flag or a second list of “forms visible on maps.” `displayInOverviewMap` (Designer form settings: **Show spatial features** / **Don't show spatial features**) remains the only show/hide setting. Default remains show (`displayInOverviewMap !== false`).
- The collection popup’s record-form layers must be the same set as the overview map: same form ids, same `record-form:<formId>` layer ids, same labels, same visibility and paint prefs. Share the existing `map-record-form-prefs:<projectId>` store so a hide/show or style change on one map is visible on the other after prefs persist.
- Downloaded contextual layers and basemap rows already appear in both maps. This work **adds** record-form layers to the popup; it must not replace or drop those existing layer groups.
- Record-form layers stay in the existing z-band (`RECORD_FORM_LAYER_Z_INDEX_BASE`, currently 980, clamped under the user-geometry band). The in-progress Map-field sketch / pin (`USER_FEATURE_LAYER_Z_INDEX`, currently 998) and GPS cursor stay above collected records so the user can still draw.
- The notebook MAP tab is not mounted while a record form is open. Do not depend on `OverviewMap` remaining in the tree. Hydration must still run for the collection popup (lift the source to notebook-route scope, or an equivalent that both maps can read).
- Designer / preview Map fields (`config.mode === 'preview'`) have no notebook record list. They must not fetch records, must not throw for missing notebook context, and must render with empty `recordLayers`.
- Full collection mode has `config.projectId` and `config.dataEngine()`. Use that notebook context; do not invent a new Map-field prop for the record list unless existing form config cannot supply it.
- Keep Map-field save / clear / cancel, sketch interactions, and “set to current location” unchanged. Do not add the overview map’s tap-to-open **View record** popover on the collection popup.
- Prefer excluding the record currently being edited from the plotted collection so its saved geometry is not double-drawn under the live sketch. If that exclusion is impractical in the first change, document it as a follow-up rather than drawing two copies of the same feature.
- Offline: collected geometry is local (same Pouch / data-engine path as the overview map). The popup must still show those layers when the device is offline, as long as the interactive map is shown at all.
- Do not migrate UI specs or rename `displayInOverviewMap`.

## Acceptance criteria

1. With at least one saved record that has Map/TakePoint geometry, opening the Map field dialog in full collection mode passes a non-empty `recordLayers` array into `MapComponent`, and those layers have `kind: 'record-form'`. Reviewer confirms this from a unit test that spies on `MapComponent` / `MapWrapper` props (same pattern as `app/src/gui/components/notebook/OverviewMap.test.tsx`).
2. For a notebook whose UI spec sets `viewsets.<formId>.displayInOverviewMap === false`, that form id is absent from the collection popup’s `recordLayers` even when records of that type have geometry. The filter is `getOverviewMapTypes` / `isFormDisplayedInOverviewMap` (existing helpers in `library/data-model/src/uiSpecification/utils.ts`). Covered by unit test.
3. Form types that the overview map includes (unset or `displayInOverviewMap: true`) appear in the collection popup’s `recordLayers` when they have plotted spatial features. Layer `id` is `record-form:<formId>` and `name` is the form label (fallback: form id), matching `buildRecordFormLayers`. Covered by unit test.
4. Visibility and paint for a given `record-form:<formId>` layer in the collection popup match the overview map for the same `projectId`: both read/write `map-record-form-prefs:<projectId>`. A unit test that writes `{visible: false}` (or a paint patch) through the popup’s `onUpdateRecordLayer` (or the shared prefs helpers) then renders the overview map (or the reverse) shows the same layer hidden / restyled.
5. When no collected records have geometry, the collection popup still opens and is drawable; `recordLayers` is `[]` (or omitted) and there is no “failed to load map data” dead-end. Covered by unit test and by the existing Map-field empty-value path remaining intact in the diff.
6. In Designer preview (`config.mode === 'preview'`), `MapFormField` / `MapWrapper` does not call record hydration and does not pass record-form layers to `MapComponent`. Covered by unit test with preview config (no `dataEngine` / no notebook record list).
7. `OverviewMap.test.tsx` still passes: one styleable layer per form with spatial records, hide/show through the panel patch path, reset restores defaults, empty and loading states still show the map. Command: `pnpm --filter=@faims3/app exec vitest --run src/gui/components/notebook/OverviewMap.test.tsx`.
8. Record-form default z-index remains below the Map-field sketch. Reviewer confirms in the diff that popup record layers use `RECORD_FORM_LAYER_Z_INDEX_BASE` / `applyRecordFormLayerPaint` and that `USER_FEATURE_LAYER_Z_INDEX` is unchanged. Existing `library/forms/lib/components/maps/recordFormLayers.test.ts` still passes.
9. The collection popup Layers panel lists the same record-form rows the overview map lists (when both have the shared `recordLayers` prop). No new panel UI is required if `ContextualLayersControl` already renders `recordLayers`; the popup must actually pass that prop. Visible in the `MapWrapper` / `MapComponent` diff and the tests for criteria 1–3.

## Out of scope

- Adding a **View record** popover, navigation, or hit-testing on collected features inside the Map field dialog.
- TakePoint (GPS capture with no map dialog) and the read-only Map field view (`MapRenderer` / `MapPreview`).
- A second Designer control besides **Overview Map** → show/hide spatial features.
- Changing downloaded contextual-layer download, storage, or the `NotebookContextualLayers` provider except as needed to sit beside a record-layer source.
- Migrating existing notebooks, renaming `displayInOverviewMap`, or changing its default (show).
- New browser e2e. Existing `e2e/test/specs/app/notebook-map.e2e.ts` covers overview-map hydration only; do not block this issue on a new collection-popup e2e.
- Control Centre / Designer chrome other than ensuring preview stays record-free.
- Requiring pixel-identical OpenLayers camera / fit-to-extent behaviour between overview and popup. The popup still centres on the field’s `center` / current sketch; collected records are overlays, not a reason to jump the view to every plotted feature.

## Test plan

Check: code

This is a behaviour change to which layers the collection map plots and which form types are eligible. Automated tests are required.

Add or extend unit tests that assert popup `recordLayers` parity with the overview map:

1. Popup receives `record-form` layers for collected GIS features in full collection mode (criterion 1).
2. `displayInOverviewMap: false` forms are omitted; included forms use `record-form:<formId>` (criteria 2–3).
3. Shared `map-record-form-prefs:<projectId>` hide/show (or paint) is visible on the other map (criterion 4).
4. Empty geometry: popup still mounts with no record-form layers (criterion 5).
5. Preview mode: no hydration, empty `recordLayers` (criterion 6).

Natural homes:

- `library/forms/lib/fieldRegistry/fields/MapField/MapWrapper.test.tsx` (new) and/or `MapField.test.tsx` for preview vs full.
- Keep `app/src/gui/components/notebook/OverviewMap.test.tsx` green after any extraction.
- Keep `library/data-model/tests/overviewMapTypes.test.ts` and `library/forms/lib/components/maps/recordFormLayers.test.ts` green; extend them only if helpers change.

Run:

```
pnpm --filter=@faims3/data-model test
pnpm --filter=@faims3/forms exec vitest --run lib/fieldRegistry/fields/MapField lib/components/maps/recordFormLayers.test.ts
pnpm --filter=@faims3/app exec vitest --run src/gui/components/notebook/OverviewMap.test.tsx
```

Include any new test file path in the forms or app command if it lives elsewhere.

No new e2e. No browser session and no screenshots required to prove the issue: the issue is layer membership and the existing form filter, which unit tests can assert from props / prefs.

Named manual check (optional, not required to merge): **Popup matches MAP tab** — in a notebook with two forms, hide one form’s spatial features in Designer, collect a point on the other, open the Map field, and confirm the Layers panel lists the same record-form row as the MAP tab and plots that geometry.

## Risk class and why

**Med.** The change reuses a working hydration and paint pipeline, but it must plot those layers on the map the user is actively drawing on, and the MAP tab is unmounted during collection so the source has to move. Mistakes can hide the sketch under records, double-draw the open record, fetch records in Designer preview, or regress the overview map if plotting is extracted carelessly. Residual cost is extra GIS hydration while a form is open (same work the MAP tab already does, now at notebook-route lifetime). Not high: no API, permissions, or UI-spec migration. Not low: collection map drawing and overview-map tests are in the blast radius.

## Open questions

1. Should the record currently being edited appear as a collected-record overlay while its Map field is open? Recommended: omit that `record_id` so the live sketch is the only copy. Confirm if product wants the saved geometry visible underneath as well.
2. If record hydration is lifted to notebook-route scope, should the MAP tab keep its own `useRecordFeatures` call (duplicate queries, simpler isolation) or always read the shared source? Spec does not require one; pick the option that keeps `OverviewMap.test.tsx` stable.
