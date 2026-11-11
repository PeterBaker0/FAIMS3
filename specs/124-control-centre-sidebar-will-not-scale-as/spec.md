# Spec: Control Centre sidebar will not scale as catalogues grow

Issue: [#124](https://github.com/PeterBaker0/FAIMS3/issues/124)

## 1. Problem

The Control Centre left nav (`web/src/components/side-bar/app-sidebar.tsx`) turns every notebook, template, and team the user can list into a nested `SidebarMenuSubItem` under Projects, Templates, and Teams.

On today’s `main`, those groups call `useGetProjects`, `useGetTemplates`, and `useGetTeams` with no page size and map the full arrays into `NavMain`. Template listing pagination (cursor, newest-`createdAt` first, `nextStartKey`) is in progress on `export/77` / [#77](https://github.com/PeterBaker0/FAIMS3/issues/77). After that lands, the sidebar still asks for `limit: TEMPLATE_CATALOGUE_PICKER_LIMIT` (500) and still renders every returned name. There is no search, no virtualization, and no “more exist” row. Names past the first page are omitted. Because listing is newest-first, those missing rows are the oldest 501st+, not a random slice — still silent truncation.

That does not stay usable once a deployment has hundreds or thousands of each:

- **DOM / layout.** Hundreds of sub-rows stay in the tree after the first expand (`CollapsibleContent` does not unmount children). Nested nav, tooltips, and active-route matching in `nav-main.tsx` re-run on every pathname change.
- **Network.** Notebooks and teams remain full-collection GETs on every authenticated shell load. The notebooks hook also requests `includeByteCount=true`, which the sidebar does not need. Templates at `limit=500` look complete in the nav while `/templates` has further pages.
- **Discoverability.** Deep links to `/projects/:id`, `/templates/:id`, and `/teams/:id` still work. The nested list lies about catalogue size: items not in the first dump are invisible, and there is no jump to the paged table.
- **Empty vs truncated.** A restricted user can see “No templates...” when the first page (or scan) returns no readable names but `nextStartKey` says more remain. The Templates index, Archive templates tab, and team Templates tab already follow `nextStartKey`; the sidebar does not.

Projects, Templates, and Teams parent rows already link to `/projects`, `/templates`, and `/teams`. The remaining work is to stop treating the left nav as a full or silently capped dump of those catalogues.

## 2. Constraints

- Change the Control Centre **left nav** only: `app-sidebar.tsx`, `nav-main.tsx` if a View-all sub-item needs a distinct shape, and the query call sites those files use. Do not change the Templates index, Archive templates tab, team Templates tab, or the create-survey template picker.
- Cap nested catalogue children at **10** recent names (named constant, e.g. `SIDEBAR_CATALOGUE_RECENT_LIMIT`). Do not use `TEMPLATE_CATALOGUE_PICKER_LIMIT` (500) for the sidebar.
- When GET `/api/templates` accepts `limit` / `nextStartKey` (issue #77), the sidebar must request `limit` equal to that cap (not the picker max) and must read `nextStartKey` from the page. Do not block this issue on #77: if the hook still returns an unbounded array, cap what is rendered. Pass `limit` as soon as the hook accepts it.
- Do not add listing cursors to GET `/api/notebooks` or GET `/api/teams` in this issue. Those collections stay unbounded on the wire until a follow-up. Still cap **rendered** notebook and team children the same way as templates.
- Do not change `useGetProjects` / `useGetTemplates` / `useGetTeams` defaults in a way that shrinks the Projects, Templates, or Teams **index** tables. Parameterize the sidebar call (or add a nav-specific wrapper) so those pages keep their current listing behaviour.
- The sidebar notebook request must not send `includeByteCount=true`. Nav names do not need Couch `info()` per notebook.
- Newest-first order stays as the listing already defines it (notebooks: `sortNotebookListNewestFirst`; templates after #77: createdAt desc). Do not invent a second sort.
- Parent Projects / Templates / Teams links, test ids (`web-nav-projects`, `web-nav-templates`, `web-nav-teams`), permission gates (`LIST_PROJECTS`, `LIST_TEMPLATES`, teams always listed then filtered), Users / Stats / Map layers, and Archive tab sub-items stay as they are.
- A deep link to a notebook, template, or team that is **not** in the recent 10 must still open. The parent group stays `isActive` via `pathname.startsWith(...)`. Do not require the current item to be injected into the nested list.
- Empty placeholder copy (`No templates...`, `No {notebooks}...`, `No teams...`) is only for a truly empty catalogue: zero visible names **and** no `nextStartKey` (or, for unbounded lists, length 0).
- “View all” is a nested row that navigates to the existing paged (or full) index (`/projects`, `/templates`, `/teams`). Do not add sidebar search, virtualization, or an “and N more” count (total N is not available without a new API).
- Existing `web/src/components/side-bar/app-sidebar.test.tsx` Stats cases must keep passing. Existing smoke e2e (`e2e/test/specs/smoke/web-login-shell.e2e.ts`) still finds the parent nav test ids.

## 3. Acceptance criteria

1. With 11 or more notebooks in the `useGetProjects` result, the Projects group renders at most 10 notebook name rows plus one “View all” sub-item whose link is `/projects`, and does not render notebook 11+. Test: extend `web/src/components/side-bar/app-sidebar.test.tsx`; mock 11 projects; assert 10 name links matching the first 10 ids, `getByText('View all')` (or the chosen stable test id) with `href="/projects"`, and no link to `/projects/<id-11>`.

2. With 10 or fewer notebooks, the Projects group renders every name and does **not** render “View all”. Test: same file; mock 2 projects; assert both name links and `queryByText('View all')` is null under that group.

3. With zero notebooks, the Projects group still shows the existing empty placeholder (`No {config.notebookNamePlural}...`) and no “View all”. Test: keep the current empty mock (`data: []`) and assert the placeholder; no `/projects` View-all sub-item besides the parent.

4. Criteria 1–3 also hold for Templates (`/templates`, `No templates...`) and Teams (`/teams`, `No teams...`). Test: the same sidebar suite with mocked `useGetTemplates` / `useGetTeams` payloads of 0, 2, and 11 items. If `useGetTemplates` returns a page object, mock `{templates, nextStartKey}`.

5. When the templates hook accepts `limit`, the sidebar call uses `limit === 10` (the recent cap), not 500. Test: spy / assert the mocked `useGetTemplates` arguments in `app-sidebar.test.tsx` (hoist a capture, or export the constant and import it in the test). Reviewer also confirms `TEMPLATE_CATALOGUE_PICKER_LIMIT` is not referenced from `app-sidebar.tsx`.

6. When the templates page is empty but `nextStartKey` is set, the Templates group does **not** show `No templates...` and does show “View all” linking to `/templates`. Test: mock `{templates: [], nextStartKey: 'cursor'}` (or equivalent); assert placeholder absent and View all present.

7. When the templates page has 1–10 names and `nextStartKey` is set, those names render and “View all” still appears. Test: mock 3 templates plus `nextStartKey`; assert 3 name links and View all.

8. The sidebar notebooks query does not request `includeByteCount=true`. Test: if the sidebar uses a dedicated call, assert the path/query string in the hook test or the captured `useGetProjects` options; if it shares `useGetProjects`, split a nav-specific fetch (or optional flag defaulting false for the sidebar) and cover it in `web/src/hooks` tests or the sidebar mock-argument assertion. The Projects index may continue to request byte counts.

9. Users, Stats, Map layers, and Archive sub-items are unchanged: Stats still hides without `VIEW_SYSTEM_STATS`; Archive still lists only the visible archive tabs. Test: existing Stats cases in `app-sidebar.test.tsx` plus an assertion that Archive tab rows are not capped by the catalogue limit.

10. Clicking a nested recent name still goes to `/projects/:id`, `/templates/:id`, or `/teams/:id`. Test: in the 2-item mocks, each name link `href` matches that id.

## 4. Out of scope

- Server-side pagination for notebooks or teams (`limit` / `startKey` / `nextStartKey` on GET `/api/notebooks` or GET `/api/teams`).
- Completing template listing pagination, Get-more pickers, or index-table paging (issue #77 / `export/77`).
- Sidebar search, typeahead, virtualization, or pinning the currently open resource into the recent 10 when it is not among the newest.
- Changing create-survey / create-template team pickers, map-layer team dropdowns, or any other full-list consumer of `useGetTeams` / `useGetTemplates`.
- “And N more” counts, total-catalogue badges, or new list APIs that return totals.
- Unmount-on-collapse behaviour of `CollapsibleContent`; the cap makes that unnecessary.
- Data-collection app (`app`) navigation.
- New Playwright / browser e2e. Seed catalogues are small; component tests can feed 11 rows.

## 5. Test plan

Check: code

This is listing / empty-vs-truncated logic in the authenticated shell, not a styling-only tweak. Cover it in unit tests; do not add a browser e2e.

- Extend `web/src/components/side-bar/app-sidebar.test.tsx` for acceptance criteria 1–10. Replace the always-empty query mocks with per-test payloads (0 / 2 / 11 items, templates `nextStartKey` present/absent). Keep the existing Stats permission cases.
- If the sidebar gains a nav-specific notebooks fetch (no `includeByteCount`), add or extend a hook test next to `web/src/hooks/queries.ts` so the Projects index still requests stats when it already does.
- Run: `pnpm --filter=@faims3/web exec vitest --run src/components/side-bar/app-sidebar.test.tsx`
- If a queries test is added: `pnpm --filter=@faims3/web exec vitest --run src/hooks`
- No new screenshot or in-browser session. A reviewer confirms the cap, View all `href`s, `limit === 10`, and empty-vs-`nextStartKey` behaviour from those tests and the `app-sidebar.tsx` diff.
- Optional regression (not required to land): existing `e2e/test/specs/smoke/web-login-shell.e2e.ts` still sees `web-nav-projects`, `web-nav-templates`, and `web-nav-teams`.

## 6. Risk class and why

**Med.** The change is display and fetch-size only — no writes, no permission model change, no new API. The regressions that matter are: shrinking the Projects/Templates/Teams **index** by reusing a `limit=10` hook default; showing “No templates...” when `nextStartKey` says the catalogue is not empty; dropping parent test ids that smoke e2e uses; and leaving notebooks on `includeByteCount=true` so the nav still pays per-notebook `info()` on every shell load. Those are covered by the tests above. Honest unbounded notebook/team GETs remain until those list endpoints grow cursors.

## 7. Open questions

- None. “View all” copy is enough; do not wait on a total count. Pinning the active deep-linked item into the recent list is deferred (out of scope). Implement against the listing shape on the implementation branch (`templates[]` today, `{templates, nextStartKey}` after #77) without blocking on #77.

```json
{ "risk": "med", "size": "m", "check": "code" }
```
