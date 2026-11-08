```yaml
approach: >
  One implementation PR adds a VIEW_SYSTEM_STATS action, Zod/OpenAPI contracts,
  a batched Couch snapshot with a short TTL cache, and GET /api/admin/stats
  plus paginated /teams and /people (and an explicit refresh) before a Control
  Centre Stats page that fetches only on Load/Refresh. Work order is permission
  and schemas, then snapshot/cache, then HTTP routes and API tests, then the
  admin UI and its tests. GET /api/directory/ stays unchanged; attachments
  including photos stay one count; record totals reuse countRecordsInNotebook.
check: code
tasks:
  - key: permission
    title: Add VIEW_SYSTEM_STATS
    description: >
      Add a dedicated Resource.SYSTEM action granted to OPERATIONS_ADMIN
      (inherited by GENERAL_ADMIN) and not to user, creator, team, or project
      roles. Cover grants with data-model permission tests.
    depends_on: []
    files_hint:
      - library/data-model/src/permission/model.ts
      - library/data-model/tests/permissionfunctions.test.ts
    acceptance:
      - 1
    risk: low
    size: s
    tier: impl
  - key: schemas
    title: Define stats contracts
    description: >
      Add Zod types for overall counts, paginated team and people rows, cache
      timestamps, and pagination query params. Overall fields include the
      required entity counts plus generatedAt and expiresAt, with no photoCount.
    depends_on:
      - permission
    files_hint:
      - library/data-model/src/api.ts
      - library/data-model/src/index.ts
    acceptance:
      - 4
    risk: low
    size: s
    tier: impl
  - key: snapshot
    title: Build cached snapshot
    description: >
      Compute one timestamped snapshot of cheap entity counts, record and
      attachment totals, byteCount, per-team rows (including unteamed), and
      per-person rows keyed by created_by with email. Batch data-DB fan-out,
      cache for a 1–5 minute TTL, and recompute only on explicit refresh.
    depends_on:
      - schemas
    files_hint:
      - api/src/couchdb/adminStats.ts
      - api/src/couchdb/notebooks.ts
      - library/build-config/src/client-env/api-env.ts
      - api/src/buildconfig.ts
      - api/.env.dist
    acceptance:
      - 5
      - 6
      - 7
      - 11
    risk: med
    size: m
    tier: impl
  - key: routes
    title: Expose stats HTTP API
    description: >
      Mount authenticated overall, paginated teams, paginated people, and
      refresh routes behind the new action. Unauthenticated 401, unauthorized
      403, limit/total paging, same generatedAt on list pages, and no stats on
      GET /api/directory/.
    depends_on:
      - snapshot
    files_hint:
      - api/src/api/adminStats.ts
      - api/src/expressSetup.ts
      - api/src/api/utilities.ts
      - api/src/middleware.ts
    acceptance:
      - 2
      - 3
      - 4
      - 8
      - 9
      - 10
      - 14
    risk: med
    size: m
    tier: impl
  - key: api-tests
    title: Cover stats API
    description: >
      Add a focused API vitest file for 401/403/200, fixture-backed overall
      counts, attachment (including photo) totals, paged team and people
      splits, unteamed row, email on people rows, cache hit vs refresh, and
      directory listing still without stats.
    depends_on:
      - routes
    files_hint:
      - api/test/adminStats.test.ts
      - api/test/notebookStorageStats.test.ts
    acceptance:
      - 2
      - 3
      - 4
      - 5
      - 6
      - 7
      - 8
      - 9
      - 10
      - 11
      - 14
    risk: med
    size: m
    tier: test
  - key: swagger
    title: Document stats routes
    description: >
      Document the new stats routes in OpenAPI, including permission, cache
      timestamp fields, pagination query params, and refresh.
    depends_on:
      - routes
    files_hint:
      - api/public/swagger.json
    acceptance:
      - 15
    risk: low
    size: s
    tier: impl
  - key: web-ui
    title: Add Control Centre Stats page
    description: >
      Add an _admin Stats page and a sidebar item next to Users, gated on the
      new action, with denied state for others. Do not fetch on mount; Load
      then Refresh with cache bypass; show generatedAt and expiresAt; page
      team and people tables through the list APIs.
    depends_on:
      - routes
    files_hint:
      - web/src/routes/_protected/_admin/stats.tsx
      - web/src/components/side-bar/app-sidebar.tsx
      - web/src/hooks/queries.ts
      - web/src/hooks/auth-hooks.ts
    acceptance:
      - 12
      - 13
    risk: med
    size: m
    tier: impl
  - key: web-tests
    title: Test Stats UI gating
    description: >
      Add web vitest coverage that the nav item and page are denied without
      the action, stats queries stay disabled until Load, Refresh bypasses
      cache, timestamps render from the payload, and list queries pass
      pagination params.
    depends_on:
      - web-ui
    files_hint:
      - web/src/components/side-bar/app-sidebar.test.tsx
      - web/src/routes/_protected/_admin/stats.test.tsx
      - web/src/hooks/queries.ts
    acceptance:
      - 12
      - 13
    risk: low
    size: s
    tier: test
```
