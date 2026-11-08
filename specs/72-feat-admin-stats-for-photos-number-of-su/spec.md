# Spec: Admin stats (attachments, surveys, records, entities) — overall, per team, per person

GitHub #72 / BSS-1193. Control Centre and API. System admins need instance usage counts they can reload as timestamped snapshots.

In this codebase a **survey**, **notebook**, and **project** are the same resource (`projects` DB + per-survey `data-{projectId}` Couch database). Control Centre copy uses `config.notebookName*`. This spec uses **notebook** in API field names.

## 1. Problem

System administrators cannot see how much field data and how many first-class entities exist on an instance.

Control Centre already shows a record count and storage size on **one** notebook (`GET /api/notebooks/:id` → `recordCount`, `byteCount`) and a notebook count plus summed `byteCount` on a **team details** page. There is no instance-wide view of:

- number of attachments (including photos)
- number of surveys/notebooks
- number of records
- other easily counted entities (teams, users, templates, map layers, …)
- those numbers **overall**, **per team**, and **per person** (issue title)

There is no `/stats` API. Record totals today require querying each survey data DB (`index/recordCount` via `countRecordsInNotebook`). Photos are ordinary Couch attachments, not a separate type. Per-person contribution is `created_by` on record documents.

Without this, ops cannot size storage, see which teams or people are collecting, or compare a dated snapshot later. Opening the page must not secretly re-scan every data DB.

## 2. Constraints

- **Who can see it.** Add a dedicated global action (suggested name `VIEW_SYSTEM_STATS`) on `Resource.SYSTEM`, `resourceSpecific: false`. Grant it to `Role.OPERATIONS_ADMIN` so `Role.GENERAL_ADMIN` inherits it. Do not grant it to `GENERAL_USER`, `GENERAL_CREATOR`, team roles, or project roles. Counts are aggregates (numbers, ids, emails), not record bodies; this action must not imply `READ_ALL_PROJECT_RECORDS`.
- **One API family, not N+1 from the browser.** Control Centre must not compute instance totals by looping `GET /api/notebooks/:id`. Suggested shape:
  - `GET /api/admin/stats` — overall counts + cache metadata (small; not a list)
  - `GET /api/admin/stats/teams` — paginated per-team rows from the **same** snapshot
  - `GET /api/admin/stats/people` — paginated per-person rows from the **same** snapshot
  All three use `requireAuthenticationAPI` + `isAllowedToMiddleware` for the new action.
- **Do not touch directory listing.** `GET /api/directory/` stays a lean notebook list with no stats (`api/src/api/utilities.ts`).
- **Couch fan-out.** Totals that need per-survey data DBs must batch, following `BYTE_COUNT_BATCH_SIZE` in `api/src/couchdb/notebooks.ts`. A failed per-survey query must not 500 the whole snapshot: skip or mark incomplete and still return the rest. Document the sentinel in the Zod schema.
- **Attachments, not a photo split.** There is no separate `photoCount`. Count attachments as one bucket labelled in the UI as **attachments (including photos)** — `faims_attachments` entries or `attach_format_version === 1` docs, whichever is convenient and consistent. Map-layer / RustFS objects are **map layers**, not this bucket.
- **Records.** Use the existing `countRecordsInNotebook` / `index/recordCount` meaning. Do not add a deleted-record filter in this issue.
- **All easily counted entities.** The overall payload MUST include a count for every first-class Conductor resource that is cheap to count from existing listing helpers / `allDocs`: at least `teamCount`, `userCount`, `notebookCount`, `templateCount`, `mapAssetCount`, plus `recordCount`, `attachmentCount`, and notebook-data `byteCount`. Include cheap extras when a helper already exists (disabled users, archived notebooks/templates, invites, long-lived tokens, tombstones). The point is a snapshot that can be compared later; v1 does not persist history.
- **Archived notebooks** are included in `notebookCount`. Also return `archivedNotebookCount` when status is already on the project doc.
- **Unteamed notebooks** (`ownedByTeamId` missing) appear as an explicit unteamed row in the teams list (a sentinel id is fine), not dropped and not a second unpaginated dump.
- **Per-person rows.** Keyed by record `created_by` (stable `userId`). Attribute attachments to the parent record’s `created_by`. Prefer **email** as the display field when the people DB has it; fall back to `userId`. Display name is optional extra, not the primary label. Omit people with zero records and zero attachments. Disabled or removed accounts still appear if they have counts.
- **Pagination.** Every list endpoint (teams, people, and any other stats lookup that returns rows) is paginated. Follow the records-list pattern (`limit` + `startKey`) or `limit` + `offset`, with a documented default and max page size. Return `total` (or equivalent) so the UI can page. Client-side-only pagination of a full dump is not enough. Overall counts are a single object and are not a list.
- **Cache on API and browser; no passive load.** The API caches a snapshot for a reasonable TTL (on the order of **1–5 minutes**, configurable). Every stats response includes cache times so the UI can show them: at least `generatedAt` (when the snapshot was computed) and `expiresAt` (when the API will recompute). The Control Centre **must not** fetch stats on page mount or sidebar render. Show an explicit **Load** control first; after a snapshot is loaded, an explicit **Refresh** control bypasses the browser cache and asks the API to recompute (`?refresh=true` or `POST /api/admin/stats/refresh`). The browser may reuse the last payload until the user refreshes or `expiresAt` has passed.
- **Same snapshot.** Paged team/people rows must come from the same `generatedAt` as the overall counts shown on the page (echo `generatedAt` on list responses).
- **Contracts.** Zod types in `library/data-model/src/api.ts`, OpenAPI in `api/public/swagger.json`, `actionDetails` for the new action. UI labels use `config.notebookName*`.
- **Where it lives in the UI.** New page under `web/src/routes/_protected/_admin/`, sidebar entry in `web/src/components/side-bar/app-sidebar.tsx` next to Users, gated with `useIsAuthorisedTo`. Do not add this to the field app (`app`). Use existing Control Centre table pagination for paged API results.

## 3. Acceptance criteria

1. `library/data-model/src/permission/model.ts` defines a new dedicated action (not a reuse of `VIEW_USER_LIST`) granted to `Role.OPERATIONS_ADMIN`, inherited by `Role.GENERAL_ADMIN`, and not granted to `GENERAL_USER`, `GENERAL_CREATOR`, `TEAM_ADMIN`, `TEAM_MEMBER`, or `PROJECT_ADMIN`. `pnpm --filter=@faims3/data-model test` covers this with `roleGrantsAction` / `drillRoleActions` (extend `library/data-model/tests/permissionfunctions.test.ts`).

2. Unauthenticated `GET` of each new stats route returns **401**. Asserted in `pnpm --filter=@faims3/api test`.

3. Authenticated `GET` of those routes as a user without the new action returns **403**. Asserted in the same API test run with a `GENERAL_USER` fixture.

4. Authenticated `GET` of overall stats as `OPERATIONS_ADMIN` or `GENERAL_ADMIN` returns **200**. The JSON parses with a new Zod schema that includes `generatedAt`, `expiresAt`, and overall `teamCount`, `userCount`, `notebookCount`, `templateCount`, `mapAssetCount`, `recordCount`, `attachmentCount`, and `byteCount`. Asserted in `pnpm --filter=@faims3/api test`.

5. Overall `notebookCount` equals the number of project documents (including archived). `templateCount`, `teamCount`, `userCount`, and `mapAssetCount` equal the corresponding listing/`allDocs` sizes in a fixture with known documents. `archivedNotebookCount` equals the archived subset when that field is present.

6. Overall `recordCount` equals the sum of `countRecordsInNotebook` for those notebooks. An API fixture with at least two notebooks and known records asserts the total. Deleted vs live is whatever that existing counter does.

7. Overall `attachmentCount` equals the chosen attachment primitive across those notebooks (all attachments, including photos; no separate photo field). An API fixture with one `image/jpeg` and one non-image file asserts `attachmentCount === 2`. The schema has no `photoCount`.

8. `GET` of the teams stats route returns a **page** of team rows (`limit` respected, `total` present). Each row has `teamId`, `name`, `notebookCount`, `recordCount`, `attachmentCount`, and `byteCount`. A notebook with `ownedByTeamId` contributes only to that team. An API fixture with more teams than `limit` asserts a second page is required; a two-team fixture asserts the split.

9. Notebooks with no `ownedByTeamId` appear as an explicit unteamed row in that paged list. Summing `notebookCount` / `recordCount` / `attachmentCount` / `byteCount` across **all pages** plus that unteamed row equals the overall totals. An API fixture with one unteamed notebook asserts this.

10. `GET` of the people stats route returns a **page** of people rows (`limit` respected, `total` present). Each row has `userId`, `email` when known (else omitted/null), `recordCount`, and `attachmentCount`. Attachments are attributed to the parent record’s `created_by`. Users with no records and no attachments are omitted. An API fixture with two users who created records asserts the split and that **email** is populated when the people DB has it; a third user with no records is absent. A fixture larger than `limit` requires a second page.

11. A second overall `GET` within the TTL, without refresh, returns the **same** `generatedAt` and counts (API cache hit). `GET` or `POST` with an explicit refresh returns a new `generatedAt` at or after the previous one. Both responses include `expiresAt` in the future relative to `generatedAt`. Asserted in `pnpm --filter=@faims3/api test`.

12. Control Centre has a Stats page under the `_admin` route group and a sidebar item next to Users, shown only when `useIsAuthorisedTo` is true for the new action. A user without the action does not see the nav item and sees a denied state if they open the URL. `pnpm --filter=@faims3/web exec vitest --run` covers nav gating and the denied state (mock the API).

13. Opening the Stats page **does not** call the stats API. A **Load** control triggers the first fetch; a **Refresh** control fetches again with cache bypass. The page displays `generatedAt` and `expiresAt` (or equivalent copy such as “as of …, cached until …”) from the payload. Team and people tables page via the list endpoints and do not request every row at once. Asserted by web tests: query disabled until Load; Load/Refresh handlers; cache timestamps rendered from mocked payload; pagination params passed through.

14. `GET /api/directory/` still omits stats fields. Existing directory / `api/test/notebookStorageStats.test.ts` cases still pass under `pnpm --filter=@faims3/api test`.

15. `api/public/swagger.json` documents the new routes (including pagination query params, refresh, permission, and cache timestamp fields).

## 4. Out of scope

- Persisted historical snapshots, date-range filters, or time-series charts (v1 is a timestamped snapshot you can reload; storing history is a later issue)
- Splitting photos from other attachments
- Changing `index/recordCount` to exclude deleted records
- CSV / PDF export, email digests, Prometheus `/metrics`
- Team-admin or project-admin scoped stats (only the new system action)
- Field-app (`app`) UI or changes to `GET /api/directory/`
- A required per-notebook table in the UI (the API may scan notebooks internally)
- Required background jobs or materialized counters (allowed as an internal implementation detail)
- Granting `READ_ALL_PROJECT_RECORDS` to operations admins
- Fetching stats on Control Centre page mount

## 5. Test plan

Check: code

This change is new API aggregation, caching, pagination, and a permission gate. Automated tests are required.

**Permission model** — `pnpm --filter=@faims3/data-model test`

- New action granted to `OPERATIONS_ADMIN` / `GENERAL_ADMIN` only (criterion 1).

**API** — `pnpm --filter=@faims3/api test`

- 401 / 403 / 200 (criteria 2–4).
- Fixture-backed overall entity counts, records, attachments (including a photo and a non-image), per-team pages, unteamed row, per-person pages with email (criteria 5–10).
- Cache hit keeps `generatedAt`; explicit refresh updates it; `expiresAt` present (criterion 11).
- Directory listing still has no stats (criterion 14).
- Prefer a focused file (e.g. `api/test/adminStats.test.ts`) rather than expanding `api.test.ts` further.

**Control Centre** — `pnpm --filter=@faims3/web exec vitest --run`

- Sidebar item and stats path denied without the action; visible with it (criterion 12).
- No stats fetch until Load; Refresh bypasses cache; timestamps from payload; paged list queries (criterion 13).

A browser session is not required to prove this issue. Optional sanity check after merge: sign in to Control Centre as `admin`, open Stats, confirm it is empty until Load, then confirm overall numbers and cache times against a seed.

## 6. Risk class and why

**med**

The feature is read-only and does not change collection or sync, but it is a new global permission surface: a missed 403 would leak instance-wide volume per team and per person. Computing it still fans out across survey data DBs if the cache is cold; skipping batching or auto-fetching on every page load can load Couch (same class of risk as `includeByteCount`). Cache + explicit Load/Refresh exist to contain that. Attachment counting must stay one bucket and stay consistent with paged team/person rows from the same `generatedAt`.

## 7. Open questions

- Exact default TTL (within 1–5 minutes) and whether it is an env var on the API.
- Sort order for paged team and people lists (email/name vs count descending) if product does not pick one during implementation.
- Whether a later issue should persist each refresh as a historical snapshot for true through-time charts.
