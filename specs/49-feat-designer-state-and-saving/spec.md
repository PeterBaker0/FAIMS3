# Designer state and saving

Issue: [#49](https://github.com/PeterBaker0/FAIMS3/issues/49)

Proposed size: **m**. Pull-request breakdown is left to the planner.

## 1. Problem

The Control Centre designer (`DesignerDialog` → `DesignerWidget`, opened from
Project Actions and Template Actions) treats every persist as an immediate live
write. Toolbar **Save** (`data-testid="web-designer-save-button"`, Design tab
only) serialises the Redux notebook, closes the overlay, and the host tab PUTs
the JSON to `/api/notebooks/:id/uiSpecification` or
`/api/templates/:id/uiSpecification` via `useDesignerSaveMutation`. That PUT
replaces the inlined `uiSpecification`. For a project, the field app picks up
the new `uiSpecProperties.hash` on the next listing/sync. There is no separate
published revision.

That model fights how people actually edit:

- There is no named **draft**. In-progress work lives only in the in-memory
  Redux store. The `modified` slice (`modifiedStatus-reducer`) is set on
  edits but `resetFlag` is never dispatched and `selectModifiedFlag` is unused,
  so the UI cannot tell dirty from clean.
- There is **no browser persistence**. Refresh, crash, or a closed tab drops
  unpublished work. `DesignerDialog` always registers `beforeunload` while
  mounted, even when nothing has changed.
- Close/Cancel always shows “Are you sure you want to cancel? … Any changes
  you've made will be lost.” even with no edits, and **Yes, cancel** discards
  the session with no recovery.
- **Save always closes.** There is no way to push the live design and keep
  editing, and no confirmation that a project save will reach field users.
- Save/Cancel are hidden on **Info** and **Setup Form**. Those tabs still
  mutate the same store; the user must switch back to Design to persist.

This issue overhauls that into: always-autosaved **browser drafts**, a visible
Saving… / Saved status, restore across refresh, a close warning only when the
draft is unpublished, and explicit **Publish changes** /
**Publish changes and close** with a confirmation that the write is live.

## 2. Constraints

- **Client-side draft only.** Do not add a server draft document, revision
  table, or new Conductor endpoints. Publishing reuses
  `useDesignerSaveMutation` (same PUT paths, auth, retry, success cache
  update, and failure toast with Download JSON). Templates still PUT under
  `Action.UPDATE_TEMPLATE_DETAILS`; projects under `Action.UPDATE_PROJECT_UISPEC`.
- **Browser storage** is origin-private (`localStorage` or IndexedDB;
  implementer chooses). Quota or write failure must surface in the status UI,
  not fail silently. Do not sync drafts across devices, browsers, or users.
- Storage key **must** include signed-in user id, resource kind
  (`projects` | `templates`), and resource id, so two accounts on one browser
  cannot clobber each other and a project draft cannot load as a template.
- Persist the designer **present notebook** (the working copy that
  `toNotebook` / `stripDesignerIdentifiers` would export), not undo history,
  preview-on, or the memory-router tab. On restore, hydrate through the
  existing load adapters (`toDesignerNotebookWithHistory` /
  `migrateNotebook`) so schema migration still runs.
- **Autosave** after a debounce of **400–1000 ms** from the last store change
  that can appear in the published JSON (same action set as
  `modifiedStatus-reducer`, plus any new equivalent). Flush pending
  `DebouncedTextField` / `ExpressionEditor` (200 ms) timers **before**
  serialising for autosave or publish, so the last keystrokes are not dropped.
- Status copy in the designer chrome (toolbar or app bar, visible on Design,
  Info, and Setup): **Saving…** while a draft write is in flight or debounce
  is pending after an edit; **Saved** once the draft is written. Use an
  `aria-live` region. Do not reuse the host Actions **Saving...** spinner on
  **Open in Editor** for draft writes; that spinner stays for an in-flight
  **publish** after the overlay has closed.
- **Unpublished** means the current draft export is not deep-equal (stable
  JSON compare after `stripDesignerIdentifiers`) to the last successfully
  published snapshot. Seed that snapshot from the server payload when the
  session opens with no draft, or from the draft’s stored published snapshot
  when restoring. Do not use the unused `modified` boolean alone: undo back
  to the published snapshot must disable Publish.
- **Publish changes** stays in the editor on success. **Publish changes and
  close** closes only after a successful PUT (or immediately when there is
  nothing to publish). A failed PUT leaves the editor open and the draft
  intact.
- Confirmation copy must distinguish hosts:
  - **Project:** publishing replaces the live survey design; field users
    receive it on their next sync; collected records can become inconsistent
    if the response shape changed (same risk as Replace JSON on Actions).
  - **Template:** publishing updates this template only; existing projects
    created from it are not rewritten.
- Close, Cancel, and the app-bar close control share one unpublished-draft
  warning. If there are no unpublished changes and no in-flight draft write,
  close immediately with no dialog. `beforeunload` fires only when unpublished
  or a draft write is in flight.
- Closing **keeps** the local draft (so refresh / reopen restores it). The
  warning must also offer **Discard draft** (clears that storage key and
  closes without PUT). Keep editing dismisses the dialog.
- Restore on **Open in Editor**: if a draft exists for this user and
  resource, load it instead of the server snapshot. `DesignerDialog` must not
  let a React Query refetch overwrite a restored or in-session draft (keep
  the existing session snapshot behaviour).
- Replace toolbar **Save** with the two publish actions. Keep a stable
  `data-testid` migration: e2e currently asserts
  `web-designer-save-button`. Either keep that id on **Publish changes** or
  update `e2e/test/pageobjects/web/web-designer.ts` and
  `e2e/test/specs/web/designer-basic.e2e.ts` in the same change.
- Publish controls are available on **Design, Info, and Setup**, not Design
  only. Host tabs stay `web/src/components/tabs/project/actions.tsx` and
  `templates/actions.tsx`. Closing without a file must **not** PUT.
- Stay inside `@faims3/web` designer + host wiring. No field-app
  (`app/`) record-draft changes, no API/Couch schema, no change to Actions
  Replace JSON / Download JSON.

## 3. Acceptance criteria

1. Editing a field, section, form, Info field, or (templates) Setup Form
   value does **not** call `PUT …/uiSpecification` until the user confirms a
   publish action. Network traces / mutation spies stay idle during typing
   and autosave.
2. After an edit, the designer shows **Saving…** then, once the debounce has
   fired and the browser write succeeds, **Saved**. The status is visible on
   Design, Info, and Setup.
3. Reloading the Control Centre page, then opening the same resource in the
   editor as the same user, restores the last autosaved draft (including
   edits that were never published). The server design is not shown in place
   of that draft.
4. Opening the editor for a **different** project or template, or as a
   **different** signed-in user, does not load the first resource’s draft.
5. With no unpublished changes, **Publish changes** is disabled
   (`aria-disabled` or `disabled`). Making an edit enables it; undoing or
   otherwise returning the export to the last published snapshot disables it
   again.
6. Activating **Publish changes** with unpublished changes opens a
   confirmation dialog whose body states that the write is live: for a
   **project**, that field users will receive the design on next sync; for a
   **template**, that this template is updated and existing projects created
   from it are not. Cancel leaves the editor open and does not PUT.
   Confirm runs the existing save mutation. On success the editor stays
   open, **Publish changes** returns to disabled, and status is **Saved**.
7. Activating **Publish changes and close** with unpublished changes shows
   the same confirmation. Confirm PUTs, then closes the overlay only if the
   PUT succeeds. With **no** unpublished changes, it closes immediately and
   does not show the publish dialog or PUT.
8. Close (app-bar `aria-label="close designer"`), Cancel, or equivalent,
   when unpublished changes exist, warns that the work is an unpublished
   local draft (not that it will necessarily be destroyed). **Keep editing**
   stays open. Closing without discard leaves the draft in browser storage.
   **Discard draft** removes the storage key, closes without PUT, and the
   next open loads the server design.
9. Close/Cancel with no unpublished changes and no in-flight draft write
   closes with no warning dialog. `beforeunload` does not register in that
   state; it does register while unpublished or while a draft write is in
   flight.
10. Publish serialisation includes the latest debounced field text: typing in
    a `DebouncedTextField` and confirming publish (or waiting for autosave)
    without an extra blur still persists those characters in the draft and in
    the PUT body.
11. A failed publish (mutation error) leaves the overlay open, keeps the
    draft, shows the existing failure toast with Download JSON, and does not
    mark the draft as published.
12. After a successful publish, the host React Query cache for that
    project/template matches today’s save mutation behaviour (set +
    invalidate). **Open in Editor** on the Actions tab shows **Saving...**
    only while a publish started from **Publish changes and close** is still
    pending after unmount, not while a local draft is merely autosaving.
13. Product source changes are limited to `@faims3/web` designer persistence
    / publish UX, host close-to-PUT wiring, tests, and e2e selectors for the
    renamed controls. No Conductor route or Couch document shape change.

## 4. Out of scope

- Server-side drafts, design revision history, or a second `uiSpecification`
  on the project/template document.
- Multi-user or multi-tab conflict UI (last local write wins in this
  browser; no prompt if the server hash moved while a draft existed).
- Syncing drafts across browsers, devices, or a signed-out session.
- Auto-publish, scheduled publish, or publishing a subset of forms.
- Field-app record drafts, PouchDB, or `publishButtonBehaviour` on data-entry
  forms.
- Changing Replace JSON / Download JSON on Actions, project
  name/description (`PUT /api/notebooks/:id` metadata), or project status.
- Persisting undo/redo stacks, preview toggle, or the last Design/Info/Setup
  tab across refresh.
- A standalone designer route; the overlay hosts remain Project and Template
  Actions.
- Granting new permission Actions.

## 5. Test plan

Automated (required), `pnpm --filter=@faims3/web exec vitest --run`:

1. **Draft store helper** (new unit tests next to the storage module):
   round-trip serialise/deserialise; keys differ by user id and by
   `projects` vs `templates` vs resource id; discard deletes the key;
   compare-to-published is true after an edit and false after aligning the
   snapshot; a mocked quota/`setItem` failure is observable (status/error
   flag), not swallowed.
2. **Status and debounce:** render the designer with a stub store, dispatch
   an edit, assert **Saving…** then **Saved** after the fake timer debounce;
   assert no `useDesignerSaveMutation` / `fetch` to `uiSpecification`.
3. **Restore:** seed storage, open `DesignerDialog`/`DesignerWidget` with a
   different server notebook, assert the restored draft is what the UI
   shows; a second resource id does not see it.
4. **Publish changes:** unpublished → button enabled → confirm dialog →
   confirm → mutation called once with JSON matching the draft → editor
   still mounted → button disabled. Cancel dialog → zero PUTs.
5. **Publish changes and close:** unpublished → confirm → mutation
   resolves → `onClose` called with the file (or host PUT equivalent);
   mutation rejects → `onClose` not called. Clean draft → `onClose`
   without dialog or mutation.
6. **Close warning:** unpublished → close/cancel → dialog; discard →
   storage empty and `onClose(undefined)`; keep editing → still open.
   Clean session → close with no dialog.
7. **Flush:** change a `DebouncedTextField` and trigger autosave/publish
   before blur; stored/PUT JSON contains the new string
   (`BaseFieldEditor.test.tsx` style fake timers).
8. **Host wiring:** closing without a file does not call
   `mutateAsyncWithToast` (`project/actions` and `templates/actions`, or the
   extracted close handler if one is introduced).

Update e2e `designer-basic.e2e.ts` / `web-designer.ts` so the open-shell
smoke still finds the primary persist control after the Save label change.
Full publish/restore e2e is optional if the vitest coverage above is in the
same change.

Manual (stack up, Control Centre `http://localhost:3001`):

1. Open a project in the editor, edit a label, confirm Saving… → Saved,
   refresh the browser, Open in Editor, confirm the edit is present and
   unpublished (Publish enabled). Publish with the project wording, confirm
   the field-app/project GET hash moved (or Actions Download JSON shows the
   edit) and the editor stayed open.
2. Repeat on a template: confirmation mentions the template, not field-user
   sync; an existing project created from that template is unchanged.
3. Publish changes and close on a dirty draft; Close with no edits; Discard
   draft then reopen to the server design.

Commands:

```bash
pnpm --filter=@faims3/web exec vitest --run
```

## 6. Risk class and why

**Med.** Size: **m**.

No new API or Couch shape, and publish is the PUT the designer already
performs, so auth and field-app sync stay as they are. Residual risk is
real: local drafts can vanish (quota, private mode, another browser);
restoring a stale draft can hide a newer server design with no conflict UI;
a missed debounce flush can drop the last keystroke from a publish; a
project publish still immediately changes the live survey for field users
(the confirmation dialog is the mitigation). Those are data-loss and
live-design hazards, not a security or sync-protocol change, so the class is
medium rather than high.

## 7. Open questions

1. Should opening the editor warn when a local draft exists **and** the
   server `uiSpecProperties.hash` (or equivalent) has changed since the
   draft was created? This spec restores the local draft with no prompt.
   Add a “server is newer” banner only if product wants it in this change.
2. Exact autosave debounce inside 400–1000 ms: pick one value and use it
   everywhere (including tests’ fake timers).
