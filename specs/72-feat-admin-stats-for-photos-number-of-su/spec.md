# Spec: Admin stats (photos, surveys, records) — overall, per team, per person

GitHub #72 / BSS-1193. Control Centre and API. System admins need instance usage counts.

In this codebase a **survey**, **notebook**, and **project** are the same resource (`projects` DB + per-survey `data-{projectId}` Couch database). Control Centre copy uses `config.notebookName*`. This spec uses **notebook** in API field names and **survey** in user-facing text only where the UI already does.

## 1. Problem

System administrators cannot see how much field data exists on an instance.

Control Centre already shows a record count and storage size on **one** notebook (`GET /api/notebooks/:id` → `recordCount`, `byteCount`) and a notebook count plus summed `byteCount` on a **team details** page. There is no instance-wide view of:

- number of photos
- number of surveys/notebooks
- number of records
- those same numbers **overall**, **per team**, and **per person** (issue title)

There is no `/stats`, `/dashboard`, or `/metrics` API. Record totals today require querying each survey data DB (`index/recordCount` via `countRecordsInNotebook`). Photos are ordinary Couch attachments (`faims_attachments[].file_type`), not a separate type. Per-person contribution is `created_by` on record documents; there is no cluster-wide reduce view.

Without this, ops cannot size storage, see which teams are collecting, or answer who is creating records without exporting notebooks or querying Couch by hand.

## 2. Constraints

- **Who can see it.** Add a dedicated global action (suggested name `VIEW_SYSTEM_STATS`) on `Resource.SYSTEM`, `resourceSpecific: false`. Grant it to `Role.OPERATIONS_ADMIN` so `Role.GENERAL_ADMIN` inherits it. Do not grant it to `GENERAL_USER`, `GENERAL_CREATOR`, team roles, or project roles. Team admins do not get instance-wide stats in this issue. Counts are aggregates (numbers, ids, display names), not record bodies; this action must not imply `READ_ALL_PROJECT_RECORDS`.
- **One API, not N+1 from the browser.** Control Centre must not compute instance totals by looping `GET /api/notebooks/:id`. Add a dedicated authenticated route (suggested `GET /api/admin/stats`) behind `requireAuthenticationAPI` + `isAllowedToMiddleware` for the new action.
- **Do not touch directory listing.** `GET /api/directory/` stays a lean notebook list with no stats (`api/src/api/utilities.ts`). Field-app refresh depends on that staying cheap.
- **Couch fan-out.** Totals that need per-survey data DBs must batch, following `BYTE_COUNT_BATCH_SIZE` in `api/src/couchdb/notebooks.ts`. A failed per-survey query must not 500 the whole response: skip or mark that survey incomplete and still return the rest. Document the chosen sentinel in the Zod schema.
- **Photo definition.** `photoCount` is the number of `faims_attachments` entries whose `file_type` starts with `image/` (case-insensitive). Map-layer / RustFS objects, audio, and non-image file uploads are not photos. Optionally also return `attachmentCount` (all attachment refs or `attach_format_version === 1` docs) as extra context; it is not a substitute for `photoCount`.
- **Record definition.** Overall `recordCount` must equal the sum of existing `countRecordsInNotebook` (`index/recordCount`) across counted notebooks, so admin totals match the notebook details page. Do not change that view’s meaning in this issue.
- **Archived notebooks** are included in totals. Also return `archivedNotebookCount` so live vs archived is visible.
- **Unteamed notebooks** (`ownedByTeamId` missing) must appear in an explicit unteamed bucket, not be dropped.
- **Per-person rows** are keyed by record `created_by` (user id). Attribute photos to the parent record’s `created_by`. Omit people with zero records and zero photos. Disabled or removed accounts still appear if they have counts. Resolve a display name/email when the people DB still has the user; fall back to the raw id.
- **Snapshot.** Include `generatedAt` (ISO timestamp). Caching is allowed if every section of one response is from the same snapshot. No live websocket, no date-range query in this issue.
- **Contracts.** Add Zod types in `library/data-model/src/api.ts`, export them, and document the route in `api/public/swagger.json`. Add `actionDetails` metadata for the new action. UI labels use `config.notebookName*` like the rest of Control Centre.
- **Where it lives in the UI.** New page under `web/src/routes/_protected/_admin/`, sidebar entry in `web/src/components/side-bar/app-sidebar.tsx` next to Users, gated with `useIsAuthorisedTo`. Do not add this to the field app (`app`).

## 3. Acceptance criteria

1. `library/data-model/src/permission/model.ts` defines a new dedicated action (not a reuse of `VIEW_USER_LIST`) granted to `Role.OPERATIONS_ADMIN`, inherited by `Role.GENERAL_ADMIN`, and not granted to `GENERAL_USER`, `GENERAL_CREATOR`, `TEAM_ADMIN`, `TEAM_MEMBER`, or `PROJECT_ADMIN`. `pnpm --filter=@faims3/data-model test` covers this with `roleGrantsAction` / `drillRoleActions` (extend `library/data-model/tests/permissionfunctions.test.ts`).

2. Unauthenticated `GET` of the new stats route returns **401**. Asserted in `pnpm --filter=@faims3/api test`.

3. Authenticated `GET` of that route as a user without the new action returns **403**. Asserted in the same API test run with a `GENERAL_USER` fixture.

4. Authenticated `GET` as `OPERATIONS_ADMIN` or `GENERAL_ADMIN` returns **200**. The JSON body parses with a new Zod schema in `@faims3/data-model` that includes `generatedAt`, overall `notebookCount`, `recordCount`, `photoCount`, and `byteCount`. Asserted in `pnpm --filter=@faims3/api test`.

5. Overall `notebookCount` equals the number of project documents in the projects DB, including archived. An API fixture with a known mix of live and archived notebooks asserts the total, and `archivedNotebookCount` equals the archived subset.

6. Overall `recordCount` equals the sum of `countRecordsInNotebook` for those notebooks. An API fixture with at least two notebooks and known records asserts the total.

7. Overall `photoCount` equals the number of `faims_attachments` entries whose `file_type` starts with `image/` (case-insensitive) across those notebooks. An API fixture with one `image/jpeg` attachment and one non-image attachment (`text/plain` or `audio/*`) asserts `photoCount === 1`.

8. The body includes a per-team list. Every team in the teams DB appears once with `teamId`, `name`, `notebookCount`, `recordCount`, `photoCount`, and `byteCount`. A notebook with `ownedByTeamId` contributes only to that team. An API fixture with two teams and uneven notebooks asserts the split.

9. Notebooks with no `ownedByTeamId` are counted in an explicit unteamed bucket. Overall `notebookCount`, `recordCount`, `photoCount`, and `byteCount` each equal the sum of the per-team values plus that unteamed bucket. An API fixture with one unteamed notebook asserts this.

10. The body includes a per-person list. Each row has `userId`, `recordCount`, and `photoCount`. Photos are attributed to the parent record’s `created_by`. Users with no records and no photos are omitted. An API fixture with two users who created records asserts the split; a third user with no records is absent.

11. Control Centre has a Stats page under the `_admin` route group and a sidebar item next to Users, shown only when `useIsAuthorisedTo` is true for the new action. A user without the action does not see the nav item and sees a denied state if they open the URL. `pnpm --filter=@faims3/web exec vitest --run` covers nav gating and the denied state (mock the API).

12. That page renders overall counts plus per-team and per-person tables (or equivalent lists) **from the new endpoint**. The web client must not call `GET /api/notebooks/:id` in a loop to build instance totals. Asserted by a web hook/client test (or grep-backed unit test of the query) plus the API tests above for the numbers.

13. `GET /api/directory/` still omits `byteCount`, `recordCount`, `photoCount`, and the new stats payload. Existing directory / `api/test/notebookStorageStats.test.ts` cases still pass under `pnpm --filter=@faims3/api test`.

14. `api/public/swagger.json` documents the new route, required permission, and response schema.

## 4. Out of scope

- Date-range filters, time-series charts, or historical snapshots
- CSV / PDF export, email digests, Prometheus `/metrics`
- Team-admin or project-admin scoped stats (only the new system action)
- Field-app (`app`) UI or changes to `GET /api/directory/`
- Counting map layers, RustFS objects, templates, invites, or tokens as required stats (optional extra fields are fine if they do not block the required metrics)
- A required per-notebook table in the UI (the API may scan notebooks internally)
- Changing `index/recordCount` so it excludes deleted records
- Required background jobs or materialized counters (allowed as an internal implementation detail, not a deliverable)
- Granting `READ_ALL_PROJECT_RECORDS` to operations admins

## 5. Test plan

Check: code

This change is new API aggregation plus a permission gate. Automated tests are required.

**Permission model** — `pnpm --filter=@faims3/data-model test`

- New action granted to `OPERATIONS_ADMIN` / `GENERAL_ADMIN` only (criterion 1).

**API** — `pnpm --filter=@faims3/api test`

- 401 / 403 / 200 (criteria 2–4).
- Fixture-backed overall, per-team, unteamed, per-person, and photo vs non-image counts (criteria 5–10).
- Directory listing still has no stats (criterion 13).
- Prefer a focused file (e.g. `api/test/adminStats.test.ts`) rather than expanding `api.test.ts` further.

**Control Centre** — `pnpm --filter=@faims3/web exec vitest --run`

- Sidebar item and `/stats` (or chosen path) denied without the action; visible with it (criteria 11–12).
- Query module calls the new endpoint, not a notebook-detail fan-out.

A browser session is not required to prove this issue. If someone wants a sanity check after merge: sign in to Control Centre as `admin`, open Stats, and confirm the overall numbers against a seed with a known notebook, record, and photo.

## 6. Risk class and why

**med**

The feature is read-only and does not change collection or sync, but it is a new global permission surface: a missed 403 would leak instance-wide collection volume per team and per person. Computing it requires fan-out across every survey data DB, which can load Couch if batching is skipped (the same class of risk as `includeByteCount` on notebook listing). Photo vs attachment vs record counting is easy to get wrong relative to existing `recordCount` on notebook details.

## 7. Open questions

- Should a later change exclude deleted records from `recordCount`, even if that diverges from today’s `index/recordCount` / notebook details page?
- For large instances, should the per-person list be paginated or capped (e.g. top N by record count) instead of returning every contributor?
- Is a short cache (tens of seconds) acceptable so repeated Control Centre loads do not re-scan every data DB?
- Should per-person rows prefer email vs display name vs user id in the table when all three exist?
- Does “etc.” in the ticket need template count or active-user count in v1, or are notebooks / records / photos / bytes enough?
