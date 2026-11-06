# Plan: designer state and saving

Issue: [#49](https://github.com/PeterBaker0/FAIMS3/issues/49)
Spec: [spec.md](./spec.md)

One pull request. Size **m**, risk **med**. Client-side drafts only; publish reuses
`PUT …/uiSpecification`. Autosave debounce is **500 ms**. No “server is newer”
banner (open question 1 stays restore-local-draft).

```yaml
tasks:
  - key: draft-storage
    title: Add keyed browser draft storage and unpublished compare
    description: >
      Add an origin-private draft helper (localStorage is enough unless quota
      tests force IndexedDB) keyed by signed-in user id (`user.user.id`),
      resource kind (`projects` | `templates`), and resource id. Persist the
      present notebook export (`toNotebook` / `stripDesignerIdentifiers`) plus
      a last-published snapshot. Expose get, set, discard, and a stable JSON
      unpublished compare. Quota or setItem failure must be observable, not
      swallowed. Do not persist undo history, preview, or the memory-router
      tab. Unit tests next to the module: round-trip, key isolation across
      user/kind/id, discard, compare true after edit and false after aligning
      the snapshot, mocked quota failure. Export from
      designer/integration. No PUT, no UI yet.
    depends_on: []
    files_hint:
      - web/src/designer/integration/draftStorage.ts
      - web/src/designer/integration/draftStorage.test.ts
      - web/src/designer/integration/index.ts
      - web/src/designer/integration/notebookAdapters.ts
      - web/src/designer/domain/notebook/adapters.ts
    acceptance:
      - 4
    risk: low
    size: s
    tier: cheap
  - key: flush-pending-edits
    title: Flush debounced field text before draft or publish serialise
    description: >
      Expose a single flush for pending DebouncedTextField and
      ExpressionEditor lodash timers so autosave and publish can serialise
      the latest keystrokes without an extra blur. Keep the 200 ms input
      debounce. Add a fake-timer test (BaseFieldEditor.test.tsx style) that
      types, flushes without blur, and asserts the store/export contains the
      new string. Do not PUT.
    depends_on: []
    files_hint:
      - web/src/designer/components/debounced-text-field.tsx
      - web/src/designer/features/expression-editor/ExpressionEditor.tsx
      - web/src/designer/components/Fields/BaseFieldEditor.tsx
      - web/src/designer/components/Fields/BaseFieldEditor.test.tsx
      - web/src/designer/features/expression-editor/ExpressionEditor.test.tsx
    acceptance:
      - 10
    risk: med
    size: s
    tier: cheap
  - key: host-session-props
    title: Pass identity and publish mutation into the designer session
    description: >
      From Project Actions and Template Actions, pass user id, resource
      kind/id, designerMode, and the existing useDesignerSaveMutation into
      DesignerDialog / DesignerWidget. Keep PUT paths and toasts as they are.
      Close without a File must not call mutateAsyncWithToast (stop treating
      every overlay close as a save once publish-controls lands; until then
      do not break in-progress Save). Open in Editor Saving... binds only to
      the mutation isPending, never to local draft writes. Touch only
      @faims3/web host wiring plus dialog props.
    depends_on:
      - draft-storage
    files_hint:
      - web/src/components/tabs/project/actions.tsx
      - web/src/components/tabs/templates/actions.tsx
      - web/src/components/dialogs/designer-dialog.tsx
      - web/src/designer/DesignerWidget.tsx
      - web/src/designer/integration/useDesignerSaveMutation.ts
    acceptance:
      - 12
      - 13
    risk: med
    size: s
    tier: mid
  - key: autosave-and-status
    title: Debounced browser autosave with Saving and Saved status
    description: >
      After store changes that can appear in the published JSON (same set as
      modifiedStatus-reducer), wait 500 ms, flush pending inputs, write the
      draft. Show Saving… while debounce is pending or the write is in
      flight, then Saved, in an aria-live region visible on Design, Info,
      and Setup. Edits and autosave must not call PUT …/uiSpecification.
      Surface draft write failures in that status. Vitest with fake timers:
      edit → Saving… → Saved, mutation/fetch idle. Do not restore yet.
    depends_on:
      - host-session-props
      - flush-pending-edits
    files_hint:
      - web/src/designer/DesignerWidget.tsx
      - web/src/designer/components/notebook-editor.tsx
      - web/src/designer/state/modifiedStatus-reducer.ts
      - web/src/designer/DesignerWidget.test.tsx
    acceptance:
      - 1
      - 2
    risk: med
    size: m
    tier: mid
  - key: restore-on-open
    title: Restore the local draft when reopening the editor
    description: >
      On Open in Editor, if a draft exists for this user and resource, hydrate
      it through toDesignerNotebookWithHistory / migrateNotebook instead of
      the server snapshot. Seed last-published from the stored snapshot.
      DesignerDialog must not let a React Query refetch overwrite a restored
      or in-session draft (keep the session snapshot). A different resource
      id, kind, or signed-in user must not load this draft. Next open after
      discard (wired in close-unpublished) loads the server design. Vitest:
      seed storage, open with a different server notebook, assert the draft
      wins; second id does not.
    depends_on:
      - autosave-and-status
    files_hint:
      - web/src/components/dialogs/designer-dialog.tsx
      - web/src/designer/DesignerWidget.tsx
      - web/src/designer/DesignerWidget.test.tsx
      - web/src/designer/integration/notebookAdapters.ts
    acceptance:
      - 3
      - 4
    risk: med
    size: s
    tier: mid
  - key: publish-controls
    title: Replace Save with publish and publish-and-close
    description: >
      Replace toolbar Save with Publish changes and Publish changes and
      close, available on Design, Info, and Setup. Unpublished is
      export-vs-last-published, not the unused modified boolean; undo back
      to the snapshot disables Publish changes. Publish changes with
      unpublished work opens a confirmation (project: live for field users
      on next sync, records may go inconsistent; template: this template
      only, existing projects unchanged). Cancel does not PUT. Confirm
      flushes inputs, runs useDesignerSaveMutation, stays open on success,
      disables Publish changes, status Saved. Publish changes and close
      uses the same dialog when unpublished and closes only after a
      successful PUT; with no unpublished changes it closes immediately
      with no dialog and no PUT. Failed PUT leaves the overlay open, keeps
      the draft unpublished, and keeps the existing failure toast plus
      Download JSON. Keep data-testid web-designer-save-button on Publish
      changes or update e2e in e2e-selectors. Host close without a file
      must not PUT.
    depends_on:
      - autosave-and-status
      - flush-pending-edits
      - host-session-props
    files_hint:
      - web/src/designer/components/notebook-editor.tsx
      - web/src/designer/DesignerWidget.tsx
      - web/src/designer/integration/useDesignerSaveMutation.ts
      - web/src/components/tabs/project/actions.tsx
      - web/src/components/tabs/templates/actions.tsx
    acceptance:
      - 5
      - 6
      - 7
      - 11
    risk: med
    size: m
    tier: mid
  - key: close-unpublished
    title: Warn on close only when the draft is unpublished
    description: >
      Close, Cancel, and the app-bar close control share one dialog when
      unpublished changes exist: the work is a local unpublished draft, not
      that it is destroyed. Keep editing stays open. Close without discard
      leaves the storage key so restore still works. Discard draft clears
      the key, closes without PUT, and the next open loads the server
      design. With no unpublished changes and no in-flight draft write,
      close immediately with no dialog. beforeunload registers only when
      unpublished or a draft write is in flight. Vitest the dirty/clean
      close paths and discard.
    depends_on:
      - restore-on-open
      - publish-controls
    files_hint:
      - web/src/designer/DesignerWidget.tsx
      - web/src/components/dialogs/designer-dialog.tsx
      - web/src/designer/components/notebook-editor.tsx
    acceptance:
      - 8
      - 9
    risk: low
    size: s
    tier: mid
  - key: e2e-selectors
    title: Update designer e2e selectors for the publish control
    description: >
      Update e2e/test/pageobjects/web/web-designer.ts and
      e2e/test/specs/web/designer-basic.e2e.ts so the open-shell smoke still
      finds the primary persist control after Save becomes Publish changes.
      Full publish/restore e2e is optional. Do not change Conductor routes,
      Couch documents, or the field app. Run
      pnpm --filter=@faims3/web exec vitest --run.
    depends_on:
      - publish-controls
    files_hint:
      - e2e/test/pageobjects/web/web-designer.ts
      - e2e/test/specs/web/designer-basic.e2e.ts
    acceptance:
      - 13
    risk: low
    size: s
    tier: cheap
```
