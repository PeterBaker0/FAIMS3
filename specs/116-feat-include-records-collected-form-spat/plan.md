# Plan: collected record spatial layers in the collection popup map

Issue: [#116](https://github.com/PeterBaker0/FAIMS3/issues/116)

No spec is present (`factory:no-spec`). Criteria below are derived from the
issue body and are the `acceptance` numbers used in the plan YAML.

1. During data collection, the Map field popup shows already-collected record
   spatial features (points, lines, polygons) as map layers.
2. Those layers respect existing form settings that show or hide spatial
   features (`displayInOverviewMap` / `getOverviewMapTypes`).
3. The collection popup exposes the same record-form layers as the notebook
   overview map: same form set, layer ids, visibility, and paint prefs.
4. Designer / preview Map fields stay record-free: missing notebook context
   must not fetch records or render record-form layers.

```yaml
approach: >
  Reuse the overview map's record-geometry pipeline in the Map field collection
  popup instead of building a second layer source. Extract per-form OpenLayers
  plotting and layer-panel wiring from OverviewMap into a shared hook, and
  provide the same hydrated features at notebook-route scope so the record
  screen does not depend on the MAP tab being mounted. Wire MapWrapper to
  attach those layers under the in-progress sketch, honor displayInOverviewMap
  plus the existing localStorage paint prefs, skip record layers in designer
  preview, and cover the parity with unit tests.
check: code
tasks:
  - key: extract-plot-hook
    title: Share record-layer plotting
    description: >
      Extract OverviewMap's per-form OpenLayers attach, paint, and prefs wiring
      into a reusable hook next to recordFormLayers so both maps can plot the
      same GeoJSON without duplicating layer code.
    depends_on: []
    files_hint:
      - library/forms/lib/components/maps/recordFormLayers.ts
      - library/forms/lib/components/maps/useRecordFormMapLayers.ts
      - library/forms/lib/components/maps/index.ts
      - app/src/gui/components/notebook/OverviewMap.tsx
    acceptance:
      - 3
    risk: medium
    size: m
    tier: 1
  - key: notebook-feature-source
    title: Hydrate layers on the notebook route
    description: >
      Provide overview-map-filtered record features at notebook-route scope
      (same useRecordFeatures plus getOverviewMapTypes source as the MAP tab)
      so the collection form can read them while OverviewMap is unmounted.
    depends_on: []
    files_hint:
      - app/src/gui/components/notebook/recordFeatures.ts
      - app/src/context/notebookRoute.tsx
      - app/src/gui/components/maps/NotebookRecordLayers.tsx
      - library/forms/lib/components/maps/recordFormLayersContext.ts
    acceptance:
      - 1
      - 2
    risk: medium
    size: m
    tier: 1
  - key: wire-collection-popup
    title: Plot records in the Map popup
    description: >
      In full collection mode, MapWrapper consumes the shared source and plot
      hook, passes recordLayers into MapComponent, and skips all of that in
      designer preview when notebook context is absent.
    depends_on:
      - extract-plot-hook
      - notebook-feature-source
    files_hint:
      - library/forms/lib/fieldRegistry/fields/MapField/MapWrapper.tsx
      - library/forms/lib/fieldRegistry/fields/MapField/index.tsx
      - library/forms/lib/components/maps/MapComponent.tsx
    acceptance:
      - 1
      - 3
      - 4
    risk: medium
    size: m
    tier: 2
  - key: match-visibility-prefs
    title: Match overview show/hide and paint
    description: >
      Filter popup record layers with getOverviewMapTypes and the existing
      map-record-form-prefs localStorage key so hide/show and paint stay in
      lockstep with the overview map, including forms with no current features.
    depends_on:
      - wire-collection-popup
    files_hint:
      - library/data-model/src/uiSpecification/utils.ts
      - library/forms/lib/components/maps/recordFormLayers.ts
      - app/src/gui/components/notebook/OverviewMap.tsx
      - web/src/designer/components/form-settings.tsx
    acceptance:
      - 2
      - 3
    risk: low
    size: s
    tier: 3
  - key: keep-sketch-on-top
    title: Keep the edit sketch above records
    description: >
      Leave record-form layers in the existing z-band under the Map field
      sketch, exclude the open record so its saved geometry is not double-drawn,
      and do not add the overview map's View-record popover on the popup.
    depends_on:
      - wire-collection-popup
    files_hint:
      - library/forms/lib/components/maps/layerStack.ts
      - library/forms/lib/fieldRegistry/fields/MapField/MapWrapper.tsx
    acceptance:
      - 1
    risk: low
    size: s
    tier: 3
  - key: cover-with-tests
    title: Prove popup and overview parity
    description: >
      Keep OverviewMap tests green after the extraction, and add MapField or
      MapWrapper unit tests that the popup receives the same filtered
      record-form layers, omits hidden forms, and stays empty in preview.
    depends_on:
      - match-visibility-prefs
      - keep-sketch-on-top
    files_hint:
      - app/src/gui/components/notebook/OverviewMap.test.tsx
      - library/forms/lib/fieldRegistry/fields/MapField/MapField.test.tsx
      - library/forms/lib/fieldRegistry/fields/MapField/MapWrapper.test.tsx
      - library/data-model/tests/overviewMapTypes.test.ts
    acceptance:
      - 1
      - 2
      - 3
      - 4
    risk: low
    size: m
    tier: 4
```
