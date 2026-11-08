# Plan: server-side pagination for template listing

Issue: [#77](https://github.com/PeterBaker0/FAIMS3/issues/77)
Spec: [spec.md](./spec.md)

One pull request. Size **m**, risk **med**. Cursor pagination on the existing
`GET /api/templates` route; no second list endpoint.

```yaml
approach: >
  One pull request adds limit, startKey, and nextStartKey to the GET
  /api/templates contract and unique ordered listing-view keys so team and
  archive filters can seek. It then implements a scan-capped Couch helper
  that fills pages of visible thin rows (archive plus
  userCanReadTemplateDocument, no uiSpecification), wires the Express list
  route with default limit 50, and covers paging, validation, permission
  fill, and the 500-row scan cap in API tests. Control Centre template
  tables, Archive, and team lists request those pages with a cursor stack;
  the sidebar and create-survey picker stay on the same GET with a bounded
  limit. Swagger is updated last; startup getTemplates and other catalogue
  APIs stay unbounded.
check: code
tasks:
  - key: zod-list-contract
    title: Add list query and nextStartKey types
    description: >
      Add GetListTemplatesQuerySchema (limit 1–500, optional startKey) and
      optional nextStartKey on GetListTemplatesResponseSchema, plus
      TEMPLATE_LIST_VIEW_SCAN_MAX = 500. Schema tests accept empty lists and
      a cursor, and reject a row that still has uiSpecification.
    depends_on: []
    files_hint:
      - library/data-model/src/api.ts
      - library/data-model/tests/datamodel.test.ts
    acceptance:
      - 3
      - 7
    risk: low
    size: s
    tier: cheap
  - key: listing-view-cursors
    title: Make listing views uniquely seekable
    description: >
      Give TEMPLATES_LISTING_BY_TEAM_ID a unique ordered emit key that
      includes template _id (and archived if ranging on includeArchived).
      Keep include_docs false and omit uiSpecification from the view value.
      Global listingByTemplateId stays keyed by _id ascending.
    depends_on: []
    files_hint:
      - library/data-model/src/data_storage/templatesDB/design.ts
      - library/data-model/src/data_storage/templatesDB/init.ts
      - library/data-model/tests/data_storage.test.ts
    acceptance:
      - 4
      - 5
    risk: med
    size: m
    tier: mid
  - key: paginated-couch-list
    title: Scan-capped visible-row list helper
    description: >
      Add a paginated listing helper that queries the thin views, fills up
      to limit visible rows after archive and userCanReadTemplateDocument,
      stops at 500 view rows or 5 Couch queries, and sets nextStartKey from
      the last examined row. Leave unbounded getTemplates for startup
      migration.
    depends_on:
      - zod-list-contract
      - listing-view-cursors
    files_hint:
      - api/src/couchdb/templates.ts
      - api/src/couchdb/validateDatabases.ts
    acceptance:
      - 2
      - 4
      - 5
      - 6
      - 10
    risk: med
    size: m
    tier: mid
  - key: api-list-route
    title: Paginate GET /api/templates
    description: >
      Validate teamId, includeArchived, limit, and startKey on GET
      /api/templates; default omitted limit to 50; return thin rows plus
      optional nextStartKey. Unknown startKey yields an empty page without
      5xx. Auth and ownedByTeamDisplayName injection stay as today.
    depends_on:
      - paginated-couch-list
    files_hint:
      - api/src/api/templates.ts
      - api/src/middleware/validate.ts
    acceptance:
      - 1
      - 3
      - 9
    risk: med
    size: m
    tier: mid
  - key: api-pagination-tests
    title: Cover default, archive, and team pages
    description: >
      Extend template and requestValidation tests for default cap 50,
      limit=2 disjoint pages, includeArchived and teamId (including both),
      and 400 on limit 0/501/abc. Keep existing archive/restore and
      summary-only assertions green on small catalogues.
    depends_on:
      - api-list-route
    files_hint:
      - api/test/template.test.ts
      - api/test/requestValidation.test.ts
      - api/test/teamIntegration.test.ts
    acceptance:
      - 1
      - 2
      - 3
      - 4
      - 5
      - 9
    risk: low
    size: m
    tier: mid
  - key: permission-scan-tests
    title: Test permission fill and scan cap
    description: >
      Assert a caller never sees unreadable rows, that unreadables inside
      the 500-row window are skipped, and that 500 unreadable then one
      readable (greatest _id) yields an empty first page with nextStartKey
      and the readable template on the next page.
    depends_on:
      - api-list-route
    files_hint:
      - api/test/template.test.ts
    acceptance:
      - 6
      - 10
    risk: med
    size: m
    tier: mid
  - key: swagger-templates-list
    title: Document list pagination in swagger
    description: >
      Document limit, startKey, and nextStartKey on GET /templates/ and
      GetListTemplatesResponse. Keep the existing includeArchived and
      teamId descriptions.
    depends_on:
      - zod-list-contract
      - api-list-route
    files_hint:
      - api/public/swagger.json
    acceptance:
      - 7
    risk: low
    size: s
    tier: cheap
  - key: web-list-hooks
    title: Pass limit and startKey from web hooks
    description: >
      Teach useGetTemplates and useGetTemplatesForTeam to request limit and
      startKey, keep those in the query key, and return templates plus
      nextStartKey instead of an unbounded array.
    depends_on:
      - api-list-route
    files_hint:
      - web/src/hooks/queries.ts
    acceptance:
      - 8
    risk: low
    size: s
    tier: cheap
  - key: web-list-tables
    title: Server-page template tables
    description: >
      Drive /templates, Archive templates, and the team Templates tab from
      API pages (table page size as limit, Next via nextStartKey, Previous
      via a cursor stack). Next stays enabled when nextStartKey is set even
      on a short or empty page. Do not switch unrelated DataTable callers
      to server paging.
    depends_on:
      - web-list-hooks
    files_hint:
      - web/src/components/data-table/data-table.tsx
      - web/src/components/data-table/pagination.tsx
      - web/src/routes/_protected/templates/index.tsx
      - web/src/routes/_protected/archive/index.tsx
      - web/src/components/tabs/teams/team-templates.tsx
    acceptance:
      - 8
    risk: med
    size: m
    tier: mid
  - key: web-bounded-catalog
    title: Bound sidebar and survey picker
    description: >
      Point the sidebar template nav and create-survey template picker at
      the same paginated GET with limit at most 500. Do not add a second
      unpaginated list endpoint; first-page names are enough.
    depends_on:
      - web-list-hooks
    files_hint:
      - web/src/components/side-bar/app-sidebar.tsx
      - web/src/components/forms/create-project-form.tsx
    acceptance:
      - 8
    risk: low
    size: s
    tier: cheap
```
