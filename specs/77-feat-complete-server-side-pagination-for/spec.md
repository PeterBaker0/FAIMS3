# Server-side pagination for template listing

Issue: [#77](https://github.com/PeterBaker0/FAIMS3/issues/77)

Proposed size: **m**. Pull-request breakdown is left to the planner.

## 1. Problem

`GET /api/templates` is the only HTTP template catalogue. Callers use it
three ways: the default active list, `includeArchived=true` (Archive), and
`teamId` (a team's Templates tab). All three still load every matching
Couch row, then filter archive status and `userCanReadTemplateDocument` in
memory (`api/src/api/templates.ts`, `getTemplates` in
`api/src/couchdb/templates.ts`). The JSON is `{ templates: [...] }` with
no cursor or page size.

List rows are already **thin**: the listing views
(`TEMPLATES_LISTING_BY_TEMPLATE_ID` / `TEMPLATES_LISTING_BY_TEAM_ID`) emit
the stored document minus `uiSpecification` and query with
`include_docs: false`. That keeps form payloads off the wire, but the
client still receives every summary. Templates remain large catalogue
assets once a deployment has hundreds of them.

Control Centre then paginates in the browser. `useGetTemplates` and
`useGetTemplatesForTeam` fetch the whole array;
`web/src/components/data-table/data-table.tsx` slices it with
`getPaginationRowModel`. The same unbounded GET feeds the sidebar template
nav and the create-survey template picker. Record listing already uses
server `limit` / `startKey` / `nextStartKey`; templates do not.

## 2. Constraints

- **One HTTP list route, every query variant.** Paginate `GET /api/templates`
  for the default (active) list, `includeArchived=true` (archived only),
  and `teamId` (team-owned). Do not add a second list URL. Keep today's
  archive rule: omit or `includeArchived=false` → active only;
  `includeArchived=true` → archived only. Invalid `includeArchived` stays
  400 (`z.enum(['true', 'false'])`).
- **Cursor contract, same names as record listing.** Query strings
  `limit` and `startKey`; response `{ templates, nextStartKey? }`.
  - `limit` is a decimal integer 1…500. Default when omitted or empty:
    **50**. Out of range or non-integer → 400 with a message equivalent to
    `limit must be between 1 and 500` (see
    `GetListRecordsQuerySchema` / `api/test/requestValidation.test.ts`).
  - `startKey` is exclusive (the page starts **after** that template
    `_id`). Omit it for the first page. An unknown `startKey` returns
    `{ templates: [] }` and no `nextStartKey` (same as an invalid record
    cursor), not 5xx.
  - `nextStartKey` is present iff the server stopped before the end of
    the listing view: either `limit` visible rows were collected and more
    view rows remain, or the per-request scan cap was hit with more view
    rows remaining. Omit it only when the view is exhausted. Walking
    `startKey=nextStartKey` until it is absent must yield each visible
    template exactly once. Intermediate pages may be shorter than
    `limit`, including empty, when most scanned rows are not readable.
- **No unbounded dump.** Omitting `limit` must not return the full
  catalogue. There is no “give me everything” query on this route.
- **Thin listings stay thin.** Rows remain `TemplateApiListItem` (no
  `uiSpecification`). Couch reads must keep using listing views with
  `include_docs: false` (or an equivalent that still omits the form
  payload). Do not `get()` full template docs to build a list page.
- **Stable order.** Visible rows are ordered by template `_id` ascending
  (the current global listing view key). `teamId` listings use the same
  `_id` order **within** that team. The team listing view today emits
  only `ownedByTeamId`, which cannot cursor uniquely; the implementer
  must give that view a unique ordered key (for example
  `[ownedByTeamId, _id]` or `[ownedByTeamId, archived, _id]`) so
  `startKey` works. A design-doc update for that is in scope.
- **Page of visible rows, with a hard scan cap.** `limit` counts
  templates the caller may read after archive +
  `userCanReadTemplateDocument`. Naive `limit` on the view then
  post-filter is not enough: it yields short pages and can hide later
  visible rows. Fill by scanning the view in `_id` order, skipping
  unreadables, until `limit` visible items are collected, **the view is
  exhausted**, or **the scan cap is hit** — whichever comes first. Then
  set `nextStartKey` from the last examined view row so the next page
  does not repeat or skip.
  - Per HTTP request, examine at most **500** listing-view rows
    (`TEMPLATE_LIST_VIEW_SCAN_MAX`, same number as max `limit`). If the
    implementer fills with repeated Couch queries, those batches must
    sum to ≤ 500 rows and must not exceed **5** view queries. A
    low-privilege caller must not be able to force a full-catalogue
    server scan in one request; they iterate with `nextStartKey`
    instead (more round trips, shorter or empty pages).
  - Hitting the cap with `templates.length < limit` is success, not an
    error. If more view rows remain, still return `nextStartKey`.
  - Encoding `archived` in the view key so `includeArchived` is a range
    query (not a full-DB post-filter) is allowed and preferred; the
    500-row cap still applies to the ranged scan.
- **Auth unchanged.** `LIST_TEMPLATES` still gates the route. Per-row
  `userCanReadTemplateDocument` still applies. Pages must not include
  templates the caller cannot read. `ownedByTeamDisplayName` injection
  stays on returned rows.
- **Control Centre list tables use the API page.** `/templates`,
  `/archive` (templates tab), and the team Templates tab must pass the
  table page size as `limit` and use `nextStartKey` for Next. Previous
  may use a client cursor stack (re-request from the start of that
  page). First page = omit `startKey`. Jump-to-last is not required
  without a total. Do not fetch the full catalogue and slice it in
  `getPaginationRowModel` for those three tables. Next must remain
  available when `nextStartKey` is present even if the current page is
  shorter than `limit` or empty (scan cap), so a low-privilege user can
  keep iterating.
- **Compact consumers stay bounded.** Sidebar template nav and the
  create-survey template picker must call the same paginated GET (they
  may use a `limit` up to 500). They must not depend on an unbounded
  response. Showing only the first page (or first `limit` names) is
  acceptable; do not add a second unpaginated list endpoint for them.
- **Internal walkers are not this API.** `getTemplates({})` used by
  startup UI-spec migration (`validateDatabases.ts`) may stay a
  server-side full walk. Do not reuse an unbounded HTTP path for that.
  `getTemplateIdsByTeamId` is an id index, not a list endpoint; leave it.
- Zod in `library/data-model/src/api.ts`
  (`GetListTemplatesResponseSchema` plus the GET query schema). Update
  `api/public/swagger.json` (`/templates/` parameters and
  `GetListTemplatesResponse`).
- Existing `LIST_TEMPLATES` callers in `@faims3/api` tests that assume a
  tiny catalogue still work with default `limit` 50. Tests that need
  every row must pass `limit` or follow `nextStartKey`.

## 3. Acceptance criteria

1. `GET /api/templates` with no `limit` returns at most 50 templates
   (`pnpm --filter=@faims3/api test`, listing tests in
   `api/test/template.test.ts`). Each row matches
   `TemplateApiListItemSchema` and has no `uiSpecification` property.
2. `GET /api/templates?limit=2` against at least three visible active
   templates returns exactly two rows, a `nextStartKey`, and no
   duplicate `_id`s. `GET /api/templates?limit=2&startKey=<that cursor>`
   returns the next distinct row(s). A further page with that page's
   `nextStartKey` (or a `limit` large enough to finish) omits
   `nextStartKey` once the catalogue is exhausted. Concatenating pages
   — including any short pages — equals the full visible active set in
   `_id` ascending order, with each `_id` once.
3. `GET /api/templates?limit=0`, `limit=501`, and `limit=abc` return 400
   and the validation message `limit must be between 1 and 500`
   (`api/test/requestValidation.test.ts`). `limit=1` and `limit=500` are
   200.
4. `GET /api/templates?includeArchived=true&limit=2` paginates **archived**
   templates only: active templates never appear; walking `nextStartKey`
   yields every archived template the caller can read and no active one.
   Default / `includeArchived=false` pages never include `archived: true`.
   `includeArchived=1` remains 400.
5. `GET /api/templates?teamId=<id>&limit=2` paginates only templates with
   that `ownedByTeamId`. Templates owned by another team, or with no
   team, do not appear. Walking `nextStartKey` with the same `teamId`
   (and the same `includeArchived`) yields each matching visible template
   once. Combining `teamId` with `includeArchived=true` paginates that
   team's archived templates only.
6. A caller who can read only a subset of templates (no
   `READ_TEMPLATE_DETAILS` on some private rows, no
   `READ_PUBLIC_TEMPLATE_DETAILS` if those rows are public-only) never
   sees the hidden rows on any page. Hidden rows inside the 500-row
   scan window are skipped so a later visible template can still appear
   on that page (page-fill after permission filter, not raw view
   `limit`). If more than 500 consecutive unreadables precede the next
   visible template, that request returns fewer than `limit` rows
   (possibly none) **and** a `nextStartKey`. Walking pages still
   reaches the visible template; a single request does not scan past
   500 view rows to find it.
7. `GetListTemplatesResponseSchema` accepts `{ templates }` and optional
   `nextStartKey: string`, and rejects a row that includes
   `uiSpecification`. Swagger documents `limit`, `startKey`, and
   `nextStartKey` on `GET /templates/`.
8. Control Centre `/templates`, `/archive` templates tab, and a team's
   Templates tab request `limit` equal to the table page size and move
   to the next page only via `nextStartKey` (inspect
   `web/src/hooks/queries.ts` and the three table call sites; no hook
   still types the list as an unbounded dump used for
   `getPaginationRowModel` on those pages).
9. Existing thin-list behaviour still holds on a page: list rows include
   `uiSpecProperties` and `ownedByTeamDisplayName` when applicable;
   `GET /api/templates/:id` remains the full document. `pnpm --filter=@faims3/api test`
   keeps the current archive/restore list split and team-scoped list
   assertions, updated to pass `limit` or follow cursors where a test
   previously assumed one payload was the entire set.
10. Create 501 templates whose `_id` order is 500 unreadable then one
    readable (the readable document has the greatest `_id`).
    `GET /api/templates?limit=1` as that caller returns `templates: []`
    and a `nextStartKey`. The follow-up
    `GET /api/templates?limit=1&startKey=<that cursor>` returns the
    readable template. The first page does not include it.

## 4. Out of scope

- Paginated `GET /api/notebooks`, `GET /api/teams`, `GET /api/users`, or
  map-asset lists.
- Server-side search, visibility filter, or sort keys on
  `GET /api/templates` (Control Centre column sort / “Search…” may apply
  only to the current page).
- Returning `total` / page count, or jump-to-last-page in the table.
- A second unpaginated or names-only template list endpoint.
- Changing `GET /api/templates/:id`, create/update/archive/delete, or
  `GET /api/templates/:id/references`.
- Loading `uiSpecification` on list rows, or reverting listing views to
  `include_docs: true`.
- Collection app (`@faims3/app`) UI. App does not render this catalogue.
- Reworking startup `getTemplates({})` migration into HTTP pagination.
- Changing `includeArchived` semantics (active vs archived-only).

## 5. Test plan

Check: code

Automated (`@faims3/data-model`):

1. `GetListTemplatesResponseSchema` parses `{ templates: [] }` and
   `{ templates: [listItem], nextStartKey: "abc" }`, and rejects a
   template element that still has `uiSpecification`.

Automated (`@faims3/api`, vitest, in-memory PouchDB):

2. Extend `api/test/template.test.ts`: create ≥3 active templates; assert
   default cap 50; `limit=2` returns two rows + `nextStartKey`; second
   page is disjoint and ordered; final page has no `nextStartKey`;
   concatenated ids match a high-`limit` fetch of the same filter.
3. Repeat (2) with `includeArchived=true` on archived templates, and with
   `teamId` (two teams, mixed ownership) including the combined
   `teamId` + `includeArchived=true` case.
4. Permission fill inside the cap: a user who cannot read the first N
   private templates (N well under 500) still receives the next visible
   template on `limit=1`. Hidden ids never appear.
5. Scan cap: 500 unreadable templates then one readable (greatest
   `_id`). `limit=1` first page is `templates: []` with `nextStartKey`;
   the following page returns that readable id and not sooner.
6. `api/test/requestValidation.test.ts`: reject `limit=0`, `limit=501`,
   non-numeric `limit`; accept `limit=1`. Keep the existing invalid
   `includeArchived` case.
7. Existing archive/restore and “list is summaries only” tests stay
   green (they already create fewer than 50 templates).

Automated (`@faims3/web`, one-shot vitest) if hooks/tables grow tests:

8. Template list hooks include `limit` / `startKey` in the query key and
   request URL. No new browser e2e is required; pagination is proven by
   the API tests. Existing
   `e2e/test/specs/web/templates-create.e2e.ts` and
   `template-visibility-archive.e2e.ts` should still pass on a small
   seeded catalogue (first page includes the seeded rows).

Commands:

```bash
pnpm --filter=@faims3/data-model test
pnpm --filter=@faims3/api test
pnpm --filter=@faims3/web exec vitest --run
```

## 6. Risk class and why

**Med.** Size: **m**.

This is a breaking change on a shared catalogue GET: today's clients
treat `{ templates }` as the full visible set. Cursor + permission
fill is easy to get wrong (short pages, skipped public rows, repeated
ids, team view keys that cannot seek). Unbounded fill-until-`limit`
would let a low-privilege caller force a full server-side view scan
in one request; the 500-row / 5-query cap is what stops that, at the
cost of empty or short pages the client must continue. Residual risk
is contained because the route is already thin-listed, record listing
shows the cursor pattern, and the collection app does not use this
GET. Medium rather than low because Control Centre tables, sidebar,
and the create-survey picker all consume the same payload. Medium
rather than high because there is no new permission model and no
Fieldmark local data path.

## 7. Open questions

1. If product wants the create-survey picker or sidebar to show every
   template name when the catalogue is larger than 500, that needs a
   follow-up (typeahead against a `q` param, or a dedicated names
   endpoint). This spec caps those UIs at `limit` ≤ 500.
2. If product wants Control Centre “Search…” and column sort to apply to
   the whole catalogue, that is server-side filter/sort and is out of
   scope here.
3. The scan cap is 500 view rows / 5 Couch queries per request so a
   fully authorised `limit=500` still fills in one call. Lowering it
   (for example 200) would throttle low-privilege callers more and make
   the cap test cheaper; raise that only if operations wants a tighter
   bound.
