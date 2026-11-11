# Spec: collected record spatial layers in the collection popup

Issue: [#121](https://github.com/PeterBaker0/FAIMS3/issues/121)

## 1. Problem

During data collection, a Map field opens a fullscreen dialog (`MapWrapper`) so the user can place a point, line, or polygon. That popup already shares downloaded contextual overlays with the notebook MAP tab through `NotebookContextualLayers` on `NotebookRouteProvider`. It does **not** plot already-collected record geometry.

The notebook overview map (`OverviewMap`) already does that work: it hydrates GIS field values from collected records (`useRecordFeatures` in `app/src/gui/components/notebook/recordFeatures.ts`), keeps only form types allowed on the overview map (`getOverviewMapTypes` / `displayInOverviewMap`), and paints one styleable `record-form:<formId>` vector layer per form. Hide/show and paint persist per project in `localStorage` under `map-record-form-prefs:<projectId>`.

The MAP tab unmounts while the user is on a record form, so that pipeline is not available in the collection popup. Field workers cannot see nearby collected features while choosing a location, and the existing form-level show/hide setting has nothing to apply to in the dialog.

## 2. Constraints

- Reuse the overview map’s record-geometry pipeline. Do not add a second extractor, a second Designer flag, or a second list of “forms visible on maps.” `displayInOverviewMap` (Designer form settings: **Show spatial features** / **Don't show spatial features**) remains the only form-level gate. Default remains show (`displayInOverviewMap !== false`).
- Filter plotted records with the existing helpers `getOverviewMapTypes` / `isFormDisplayedInOverviewMap` in `library/data-model/src/uiSpecification/utils.ts`.
- Hydration must run while the MAP tab is unmounted. Lift record-feature hydration to notebook-route scope, following the same pattern as `NotebookContextualLayers` on `NotebookRouteProvider` (`app/src/context/notebookRoute.tsx`). Record create/edit screens already sit under that provider (`app/src/App.tsx`).
- Cross the `@faims3/app` / `@faims3/forms` boundary with a context the Map field can read, the same way `ContextualMapLayersContext` supplies downloaded overlays. `FullFormConfig` has `projectId` and `dataEngine()` but not the notebook record list; do not invent a new Map-field prop for that list unless the shared context cannot supply it.
- Extract OverviewMap’s per-form OpenLayers attach / paint / prefs wiring into a reusable plot hook (or equivalent shared helper) so overview and popup do not diverge. OverviewMap must keep using that shared path after the extraction.
- Collection-popup `recordLayers` must match the overview map for the same project: same form ids, same `record-form:<formId>` layer ids, same labels, same visibility and paint. Share `map-record-form-prefs:<projectId>` (`recordFormLayerPrefsKey` in `library/forms/lib/components/maps/recordFormLayers.ts`) so a hide/show or style change on one map is visible on the other after prefs persist.
- Downloaded contextual layers and basemap rows already appear in both maps. This work **adds** record-form layers to the popup; it must not replace or drop those groups.
- Record-form layers stay in the existing z-band (`RECORD_FORM_LAYER_Z_INDEX_BASE`, currently 980, clamped by `applyRecordFormLayerPaint` / `contextualLayerZIndex` under the user-geometry band). The in-progress sketch and pin (`USER_FEATURE_LAYER_Z_INDEX`, currently 998) and the GPS cursor stay above collected records. MapWrapper currently removes leftover pin layers by `USER_FEATURE_LAYER_Z_INDEX`; record layers must not use that z-index.
- Designer / preview Map fields (`config.mode === 'preview'`) have no notebook record list. They must not fetch records, must not throw for missing notebook context, and must render with empty `recordLayers`.
- Keep Map-field save / clear / cancel, sketch interactions, and “set to current location” unchanged. Do not add the overview map’s tap-to-open **View record** popover on the collection popup.
- Prefer excluding the record currently being edited from the plotted collection so its saved geometry is not double-drawn under the live sketch. If that exclusion is impractical in the first change, document it rather than drawing two copies of the same feature.
- Offline: collected geometry is local (same Pouch / data-engine path as the overview map). The popup must still show those layers when the device is offline, as long as the interactive map is shown at all.
- Do not migrate UI specs or rename `displayInOverviewMap`.

## 3. Acceptance criteria

1. With at least one saved record that has Map/TakePoint geometry, opening the Map field dialog in full collection mode passes a non-empty `recordLayers` array into `MapComponent`, and those layers have `kind: 'record-form'`. A unit test spies on `MapComponent` / `MapWrapper` props (same pattern as `app/src/gui/components/notebook/OverviewMap.test.tsx`).

2. For a notebook whose UI spec sets `viewsets.<formId>.displayInOverviewMap === false`, that form id is absent from the collection popup’s `recordLayers` even when records of that type have geometry. The filter is `getOverviewMapTypes` / `isFormDisplayedInOverviewMap`. Covered by unit test.

3. Form types the overview map includes (unset or `displayInOverviewMap: true`) appear in the collection popup’s `recordLayers` when they have plotted spatial features. Layer `id` is `record-form:<formId>` and `name` is the form label (fallback: form id), matching `buildRecordFormLayers`. Covered by unit test.

4. Visibility and paint for a given `record-form:<formId>` layer in the collection popup match the overview map for the same `projectId`: both read/write `map-record-form-prefs:<projectId>`. A unit test that writes `{visible: false}` (or a paint patch) through the popup’s `onUpdateRecordLayer` (or the shared prefs helpers) then renders the overview map (or the reverse) shows the same layer hidden or restyled.

5. When no collected records have geometry, the collection popup still opens and is drawable; `recordLayers` is `[]` (or omitted) and there is no “failed to load map data” dead-end. Covered by unit test; the existing Map-field empty-value path remains intact in the diff.

6. In Designer preview (`config.mode === 'preview'`), `MapFormField` / `MapWrapper` does not call record hydration and does not pass record-form layers to `MapComponent`. Covered by unit test with preview config (no `dataEngine` / no notebook record list).

7. Record-form default z-index remains below the Map-field sketch. The diff shows popup record layers using `RECORD_FORM_LAYER_Z_INDEX_BASE` / `applyRecordFormLayerPaint`, and `USER_FEATURE_LAYER_Z_INDEX` is unchanged. Existing `library/forms/lib/components/maps/layerStack.test.ts` and `recordFormLayers.test.ts` still pass.

8. Tapping a collected-record feature in the collection popup does not open a View-record popover and does not navigate away from the dialog. Reviewer confirms from the diff that OverviewMap’s popover / pointer hit-testing is not wired into `MapWrapper`.

9. `OverviewMap.test.tsx` still passes after any extraction: one styleable layer per form with spatial records, hide/show through the panel patch path, reset restores defaults, empty and loading states still show the map. Command: `pnpm --filter=@faims3/app exec vitest --run src/gui/components/notebook/OverviewMap.test.tsx`.

10. The collection popup Layers panel lists the same record-form rows the overview map lists when both have the shared `recordLayers` prop. No new panel UI is required if `ContextualLayersControl` already renders `recordLayers`; the popup must actually pass that prop. Visible in the `MapWrapper` / `MapComponent` diff and the tests for criteria 1–3.

## 4. Out of scope

- Adding a **View record** popover, navigation, or hit-testing on collected features inside the Map field dialog.
- TakePoint (GPS capture with no map dialog) and the read-only Map field view (`MapRenderer` / `MapPreview`).
- A second Designer control besides **Overview Map** → show/hide spatial features.
- Changing downloaded contextual-layer download, storage, or `NotebookContextualLayers` except as needed to sit beside a record-layer source.
- Migrating existing notebooks, renaming `displayInOverviewMap`, or changing its default (show).
- New browser e2e. Existing `e2e/test/specs/app/notebook-map.e2e.ts` covers overview-map hydration only; do not block this issue on a new collection-popup e2e.
- Control Centre / Designer chrome other than ensuring preview stays record-free.
- Requiring pixel-identical OpenLayers camera / fit-to-extent behaviour between overview and popup. The popup still centres on the field’s `center` / current sketch; collected records are overlays, not a reason to jump the view to every plotted feature.

## 5. Test plan

Check: code

This is a behaviour change to which layers the collection map plots and which form types are eligible. Automated tests are required.

Add or extend unit tests that assert popup `recordLayers` parity with the overview map:

1. Popup receives `record-form` layers for collected GIS features in full collection mode (criterion 1).
2. `displayInOverviewMap: false` forms are omitted; included forms use `record-form:<formId>` (criteria 2–3).
3. Shared `map-record-form-prefs:<projectId>` hide/show (or paint) is visible on the other map (criterion 4).
4. Empty geometry: popup still mounts with no record-form layers (criterion 5).
5. Preview mode: no hydration, empty `recordLayers` (criterion 6).
6. OverviewMap regression after extraction (criterion 9).

Natural homes:

- `library/forms/lib/fieldRegistry/fields/MapField/MapWrapper.test.tsx` (new) and/or `MapField.test.tsx` for preview vs full.
- Keep `app/src/gui/components/notebook/OverviewMap.test.tsx` green after any extraction; add a provider / plot-hook test next to it if hydration moves to notebook-route scope.
- Keep `library/data-model/tests/overviewMapTypes.test.ts` and `library/forms/lib/components/maps/recordFormLayers.test.ts` green; extend them only if helpers change.

Run:

```
pnpm --filter=@faims3/data-model test
pnpm --filter=@faims3/forms exec vitest --run lib/fieldRegistry/fields/MapField lib/components/maps/recordFormLayers.test.ts lib/components/maps/layerStack.test.ts
pnpm --filter=@faims3/app exec vitest --run src/gui/components/notebook/OverviewMap.test.tsx src/gui/components/notebook/recordFeatures.test.tsx
```

Include any new test file path in the forms or app command if it lives elsewhere.

No new e2e. No browser session and no screenshots required to prove the issue: the issue is layer membership, the existing form filter, and z-order relative to the sketch, which unit tests and the diff can assert.

Named manual check (optional, not required to merge): **Popup matches MAP tab** — in a notebook with two forms, hide one form’s spatial features in Designer, collect a point on the other, open the Map field, and confirm the Layers panel lists the same record-form row as the MAP tab and plots that geometry under the in-progress sketch.

## 6. Risk class and why

**Med.** The change reuses a working hydration and paint pipeline, but it must plot those layers on the map the user is actively drawing on, and the MAP tab is unmounted during collection so the source has to move. Extracting OverviewMap’s OpenLayers attach/paint path into a shared hook can regress the live overview map. Mistakes can hide the sketch under records, double-draw the open record, fetch records in Designer preview, or leave the popup on a second, drifting data source. Residual cost is extra GIS hydration while a form is open (same work the MAP tab already does, now at notebook-route lifetime). Not high: no API, permissions, or UI-spec migration. Not low: collection map drawing and overview-map tests are in the blast radius.

## 7. Open questions

1. Should the record currently being edited appear as a collected-record overlay while its Map field is open? Recommended: omit that `record_id` so the live sketch is the only copy. Confirm if product wants the saved geometry visible underneath as well.
2. If record hydration is lifted to notebook-route scope, should the MAP tab keep its own `useRecordFeatures` call (duplicate queries, simpler isolation) or always read the shared source? Spec does not require one; pick the option that keeps `OverviewMap.test.tsx` stable.

```json
{"risk": "med", "size": "m", "check": "code"}
```
