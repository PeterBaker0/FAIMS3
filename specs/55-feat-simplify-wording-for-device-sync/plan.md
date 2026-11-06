# Plan

One pull request. Size **s**, risk **low**. Replace the Settings attachment
heading and helper, cover it with vitest, then rename the control in user docs.

```yaml
approach: >-
  One pull request replaces the Settings attachment-download heading and
  enabled helper with the review strings, then covers that panel with
  vitest, then updates the two user-doc headings that still name the old
  control. Keep On/Off labels, the pull-disabled two-way-sync helper, the
  snackbar, and the start/stop attachment-sync dispatchers unchanged. Do
  not touch sync engines, API, Designer, or screenshot PNGs.
tasks:
  - key: replace-settings-copy
    title: Replace the Settings title and helper
    description: >-
      In NotebookSettings, set the h6 heading to "Download attachments from
      other devices?" and the pull-enabled body2 helper to the three-sentence
      review subtext. Leave On/Off labels, the pull-disabled helper, the
      snackbar, layout, and start/stop dispatchers unchanged.
    depends_on: []
    files_hint:
      - app/src/gui/components/notebook/settings/index.tsx
    acceptance:
      - 1
      - 2
      - 3
      - 4
      - 5
      - 6
      - 8
    risk: low
    size: s
    tier: cheap
  - key: cover-settings-copy
    title: Cover the attachment panel in vitest
    description: >-
      Add a NotebookSettings vitest that asserts the new title and enabled
      subtext when syncMode is both, the existing two-way-sync helper and a
      disabled switch when push or none, On/Off labels, and start/stop plus
      the download alert on toggle. Follow the contextualLayerSettings
      harness; do not boot CouchDB.
    depends_on:
      - replace-settings-copy
    files_hint:
      - app/src/gui/components/notebook/settings/index.tsx
      - app/src/gui/components/notebook/settings/index.test.tsx
      - app/src/gui/components/notebook/settings/contextualLayerSettings.test.tsx
    acceptance:
      - 1
      - 2
      - 3
      - 4
      - 5
      - 6
    risk: low
    size: s
    tier: cheap
  - key: rename-docs-heading
    title: Rename the control in user docs
    description: >-
      Replace "Get attachments from other devices" with the new title in
      synchronisation.md, first-notebook-tutorial.md, and that tutorial
      screenshot alt text. Do not rewrite surrounding docs or reshoot PNG
      files.
    depends_on:
      - cover-settings-copy
    files_hint:
      - docs/user/core/synchronisation.md
      - docs/user/authoring/first-notebook-tutorial.md
    acceptance:
      - 7
      - 8
    risk: low
    size: s
    tier: cheap
```
