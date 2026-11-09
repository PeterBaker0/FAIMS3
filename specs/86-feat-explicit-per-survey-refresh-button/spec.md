# feat: explicit per-survey refresh button

Issue: [#86](https://github.com/PeterBaker0/FAIMS3/issues/86)

## Problem

The data-collection app (`@faims3/app`) already refreshes the survey list from `GET /api/directory` via `initialiseProjects`. For an **activated** survey that thunk only then calls `GET /api/notebooks/:id` when `activatedProjectNeedsSpecFetch` is true — typically a change in the listing `uiSpecProperties.hash` (or an incompatible survey whose listed `schemaVersion` this build can now read).

There is no control on the **survey detail page** (`app/src/gui/pages/notebook.tsx`) that reloads that one survey’s details on demand. A user who knows the server copy has changed (name, description, design, layers, and other listing fields returned by `GET /api/notebooks/:id`) cannot pull it without waiting for a directory hash change, or without refreshing the whole list. Hash-gated skip is the right default for background sync; it is the wrong gate for an explicit “refresh this survey” action.

The existing list-page Refresh (`app-notebooks-refresh-button`) refreshes every survey on the server. `RefreshNotebook` (`app/src/gui/components/notebook/refresh.tsx`) refreshes **records**, not survey details. Neither is this feature.

## Constraints

- App only. The Control Centre / Designer (`@faims3/web`) and Conductor API contracts stay as they are. Use the existing `GET /api/notebooks/:id` helper `fetchNotebookDetails`.
- Put the control on the survey detail page the user already has open (`Notebook` in `app/src/gui/pages/notebook.tsx`). Prefer the header row next to Share (`NotebookQuickShare`), which is the page chrome for that survey. Do not add a second control on the survey list.
- Online-only fetch. Gate with `useIsOnline()` from `app/src/utils/customHooks.tsx`. On click, also `checkIsOnline()` the way activation and Quick Share do, so a stale online flag does not fire a request.
- When offline, do not fetch. Follow the existing wifi-off pattern in `app/src/gui/components/workspace/notebooks.tsx` (Add survey): keep a control in the same slot, swap the action icon for `SignalWifiConnectedNoInternet4Icon`, disable it, and wrap it in a tooltip that says the user must be online. Do not leave a working Refresh button that no-ops.
- The fetch is **this survey only**. Do not dispatch `initialiseProjects` for the whole server. Do not `GET /api/notebooks/:id` for sibling surveys.
- Bypass the usual hash skip. A matching stored `uiSpecProperties.hash` must not prevent the GET. Do **not** change `activatedProjectNeedsSpecFetch` / `initialiseProjects` so that ordinary directory sync starts fetching every activated survey.
- Reuse the activated-survey ingest already used when a directory hash **does** change (`updateProjectDetails` with `uiDefinition`, last-good graph kept when the incoming spec is incompatible, compiled-spec register, contextual-layer / offline-map prompts for **this** survey). A failed GET must not stamp a new hash or drop the last-good definition — same rule as `initialiseProjects` when GET fails after a hash change.
- Surface success and failure the way the list Refresh does (`useNotification` success / error). Wording should name this survey (or `config.notebookName`), not the plural list.
- Stable `data-testid`s so tests can target the online refresh control and the offline wifi icon without relying on copy.

## Acceptance criteria

1. On the survey detail page, while `useIsOnline().isOnline` is true, a Refresh control is visible and enabled (named `data-testid`, e.g. `app-notebook-refresh-button`). A reviewer can confirm this from the component test or the header JSX next to Share.

2. Clicking that control while online calls `GET /api/notebooks/:id` for the open survey’s `projectId` even when the stored `uiSpecProperties.hash` already matches the server hash. A reviewer can confirm this from a unit test that stubs `fetch`, seeds an activated survey whose hash matches the GET body, dispatches the new refresh path, and asserts the notebooks URL was requested.

3. That click does not request `GET /api/notebooks/:otherId` for any other survey on the same server. A reviewer can confirm this from the same unit test with a second activated survey present: only the open survey’s notebooks URL is in `fetch` calls.

4. A successful GET applies that survey’s details through the existing ingest path: listing fields (name, description, and the other `updateProjectDetails` fields) update, and an activated survey’s design is ingested (including last-good keep when the incoming spec is incompatible). A reviewer can confirm this from the unit test asserting store state after the stubbed GET, and from the thunk reusing `fetchNotebookDetails` + `updateProjectDetails` rather than a one-off patch.

5. While offline, the working Refresh control is not available; the same slot shows `SignalWifiConnectedNoInternet4Icon` (named `data-testid`, e.g. `app-notebook-refresh-offline-icon`), the control is disabled, and a tooltip explains that a connection is required. Clicking it must not call `GET /api/notebooks/:id`. A reviewer can confirm this from a component test that mocks `useIsOnline` to `{isOnline: false}` the same way `notebooks.test.tsx` does for Add survey.

6. Ordinary directory sync is unchanged: `initialiseProjects` still does **not** `GET /api/notebooks/:id` for an activated survey whose listing hash matches. A reviewer can confirm this by running the existing test `does not fetch GET /:id for an activated notebook whose hash matches` in `app/src/context/slices/projectSlice.initialiseProjects.test.ts`.

7. If the forced GET fails, the stored hash and last-good `uiDefinition` stay as they were, and the user sees an error notification. A reviewer can confirm this from a unit test that rejects the stubbed GET and asserts unchanged `uiSpecProperties.hash` / `uiDefinition` plus the error path.

## Out of scope

- Changing the survey-list Refresh button, its `initialiseProjects` call, or hash-gated fetches for surveys the user did not open.
- Record-list refresh (`RefreshNotebook`, CouchDB sync, attachment sync).
- Fetching survey details while offline, queueing a later refresh, or showing `OfflineFallbackComponent` over the whole page.
- Control Centre / Designer UI, API shape changes, or a new notebooks endpoint.
- Refreshing surveys the user is not allowed to read; auth stays whatever `fetchNotebookDetails` already uses.
- New e2e coverage. App vitest is enough for this change.
- Visual restyle of the detail header beyond adding this control and matching existing Share / wifi-off patterns.

## Test plan

Check: code

This change can break hash-gated spec fetch and ingest, so automated tests are required. No browser session.

- Add (or extend) a `projectSlice` unit test file next to `projectSlice.initialiseProjects.test.ts` for the new per-survey refresh thunk/helper: hash-match still fetches; only that survey is requested; successful ingest updates details; failed GET leaves hash and last-good definition; `initialiseProjects` hash-skip tests still pass.
- Add a component test for the detail-page control (extend `app/src/gui/pages/notebook.test.tsx` or a focused test next to the new control): online → refresh testid present and click dispatches the refresh path; offline → wifi-off testid present, refresh fetch not called. Mock `useIsOnline` like `app/src/gui/components/workspace/notebooks.test.tsx`.
- Commands:
  - `pnpm --filter=@faims3/app test src/context/slices/projectSlice.initialiseProjects.test.ts`
  - `pnpm --filter=@faims3/app test` for the new refresh thunk test and the detail-page control test (paths as implemented).
- Manual note only if a reviewer wants a smoke look: open an activated survey while online, confirm Refresh in the header; toggle offline in DevTools, confirm the wifi-off icon and no network call. That note does not replace the vitest above.

## Risk class and why

**Med.** The user-visible control is small, but the fetch bypasses the hash gate that exists to avoid rewriting an activated survey’s compiled UI spec. A bug that force-fetches on every directory sync, or that stamps a hash / drops last-good definition on failure, can strand offline data or hammer `GET /api/notebooks/:id`. Scope stays one survey and one explicit click, which keeps this out of **high**. It is not **low** because ingest and `projectSlice` are involved.

## Open questions

- Compact header on narrow viewports: labelled Refresh button (list page) vs icon-only `IconButton` matching Share on small screens. Either is fine if the online/offline testids stay stable; default to matching Share’s header layout.
- Should a successful refresh always re-offer the contextual-layer download prompt when the listing hash is unchanged but the user asked to refresh? Default: follow existing ingest (prompt only when this survey’s layer listing is new relative to the seen hash). Confirm if product wants a prompt every refresh.
- Activation-blocked (never-readable) surveys can still open the detail page. Default: show the same control; a successful GET may recover a now-readable design. Confirm if that page should hide Refresh.
