# Team archive lifecycle

Issue: [#74](https://github.com/PeterBaker0/FAIMS3/issues/74)

Proposed size: **m**. Pull-request breakdown is left to the planner.

## 1. Problem

Surveys and templates already have a reversible archive lifecycle: hide the
asset from default lists, stop it being used for new work, keep the document
so it can be restored, and only then allow permanent delete. Teams do not.

Today a team is either fully live or hard-deleted. `POST /api/teams/:id/delete`
removes the Couch document immediately. There is no `archived` field on
`TeamsV1Fields`, `GET /api/teams` has no `includeArchived` filter, and
Control Centre `/archive` omits Teams on purpose
(`web/src/archive/archive-tabs.ts`: “Teams are omitted until team archive is
implemented”). `useRestoreTeamFromArchive` is a placeholder that always
throws.

That gap matters because a team is the organisational container for surveys,
templates, map layers, members, and invites. Operators who need to retire a
team (end of a project, mistaken create, temporary freeze) currently have to
destroy it. Restoring membership, display names, and ownership then requires
manual reconstruction. The issue asks for the same semantics as other
assets: **fully disable the team, but allow it to be recovered**.

## 2. Constraints

- Follow the **template** archive shape, not the survey status enum. Teams
  have no open/closed state. Add a top-level boolean `archived` on the team
  document (missing/`undefined` reads as `false`). Do not invent a Teams DB
  schema-version / migration framework for this field.
- API:
  - `PUT /api/teams/:id/archive` with body `{ archive: boolean }`, same
    contract as `PUT /api/templates/:id/archive`.
  - `GET /api/teams?includeArchived=` uses the template listing rule: omit
    or `false` → active teams only; `true` → archived teams only. Query
    values are the enum `'true' | 'false'` (see notebook/template list
    validation).
  - `GET /api/teams/:id` still returns an archived team (deep link, restore
    UI), subject to `VIEW_TEAM_DETAILS`.
  - `POST /api/teams/:id/delete` must refuse unless `archived === true`
    (same message pattern as templates: archive first, then delete from
    Archive). This is a breaking change from today’s immediate delete.
- Permission: add `Action.CHANGE_TEAM_STATUS` (`'CHANGE_TEAM_STATUS'`) next
  to the other TEAM actions in `library/data-model/src/permission/model.ts`.
  Resource-specific, `Resource.TEAM`, description “Archive or restore a
  team”. Grant it on `Role.TEAM_ADMIN` and `Role.OPERATIONS_ADMIN`
  (`GENERAL_ADMIN` inherits `TEAM_ADMIN`). Do not grant it on
  `TEAM_MANAGER`. Keep `DELETE_TEAM` as the permanent-delete action. Wire
  `actionDetails` / `roleActions` so
  `library/data-model/tests/permissionintegrity.test.ts` stays green.
- **Disable the team, do not cascade.** Archiving a team must not archive,
  close, or delete owned surveys, templates, or map layers. Those assets
  keep their own lifecycles. Team membership and virtual roles
  (`TEAM_MEMBER` → project contributor, and so on) stay in place so
  existing field work is not cut off. Restore must not require re-inviting
  members.
- While `archived === true`, reject mutating *team-as-container* operations
  with `InvalidRequestException` (4xx, not 5xx). At least:
  - `PUT /api/teams/:id` (name/description)
  - `POST /api/teams/:id/members` (add/remove roles)
  - create / edit team invites (`POST /api/invites/team/:teamId` and the
    matching edit route)
  - redeeming a team invite (`addTeamRole` path in
    `api/src/couchdb/invites.ts`)
  - creating a survey, template, or map layer **in** that team
    (`CREATE_PROJECT_IN_TEAM` / `CREATE_TEMPLATE_IN_TEAM` /
    `CREATE_MAP_ASSET_IN_TEAM` payloads that pass this `teamId`)
  - assigning an existing survey or template **to** that team
    (`PUT /api/notebooks/:id/team`, `PUT /api/templates/:id/team`, and the
    map-asset equivalent if one exists)
- Allowed on an archived team: read endpoints (GET team, members, invites,
  map-assets), listing children (`GET /api/notebooks?teamId=`, templates,
  map assets), mutating those children under *their* permissions, moving a
  child **off** the archived team onto an active team, restore, and
  (when eligible) permanent delete.
- Permanent delete of an archived team must **refuse** while the team still
  owns any survey, template, or map layer. Do not orphan `ownedByTeamId`
  silently and do not cascade-destroy children. After a successful delete,
  strip remaining `teamRoles` for that team id from people documents
  (same idea as `stripTemplateRolesForTemplateId`).
- Control Centre must reuse the existing Archive shell:
  - Add `'teams'` to `ARCHIVE_TAB_VALUES` / labels / `getVisibleArchiveTabs`
    (visible when the user can `VIEW_TEAM_DETAILS` on at least one team, or
    equivalently can list teams the same way `/teams` already does).
  - Implement `useRestoreTeamFromArchive` against
    `PUT /api/teams/:id/archive` `{ archive: false }`.
  - Archive-table row actions: restore (`CHANGE_TEAM_STATUS`) and
    permanent delete (`DELETE_TEAM`), same layout as archived templates.
  - Team pickers that call default `GET /api/teams` (create survey /
    template / map layer, assign-to-team dialogs) automatically hide
    archived teams once the list filter is in place; do not add a second
    client-side allow-list unless a call site already fetches a different
    payload.
- Zod types in `library/data-model/src/api.ts`
  (`TeamDocumentSchema`, list/get/create/update responses, plus
  `PutArchiveTeamRequestSchema`). Update `api/public/swagger.json`.
- Update user-facing Archive copy that currently says only surveys,
  templates, and disabled users (`docs/user/admin/web.md`,
  `docs/user/admin/user-roles-and-permissions-guide.md`).
- Collection app (`@faims3/app`) does not list teams; do not add team
  archive handling there.

## 3. Acceptance criteria

1. A new team document is stored with `archived` absent or `false`.
   `GET /api/teams` (no query / `includeArchived=false`) returns it.
   `GET /api/teams?includeArchived=true` does not.
2. `PUT /api/teams/:id/archive` `{ "archive": true }` as a caller with
   `CHANGE_TEAM_STATUS` on that team sets `archived: true` and `updatedAt`.
   A subsequent default `GET /api/teams` omits it; `includeArchived=true`
   returns only archived teams and includes it. `GET /api/teams/:id` still
   returns the document with `archived: true`.
3. The same `PUT` with `{ "archive": false }` restores the team
   (`archived: false`). It reappears on the default list and disappears
   from `includeArchived=true`. Restore of a team that is not archived
   returns 4xx with a message equivalent to “Only archived teams can be
   restored.”
4. Callers without `CHANGE_TEAM_STATUS` on that team get 401/403 on
   archive and restore. `TEAM_MANAGER` cannot archive. `TEAM_ADMIN` and
   operations/system admin can.
5. While the team is archived, each of the following returns 4xx and does
   not persist: update team details; add or remove a member role; create or
   edit a team invite; redeem a team invite; create a survey, template, or
   map layer with that `teamId`; assign an existing survey or template to
   that team.
6. While the team is archived, GET team / members / invites / map-assets
   still succeed for authorised callers. Owned surveys, templates, and map
   layers keep their previous status. Members still receive the same
   virtual roles on those assets. Existing surveys remain usable in Control
   Centre and the collection app. Moving a child **off** the archived team
   onto an active team still succeeds.
7. After restore, membership, virtual roles, and owned assets are unchanged
   from immediately before archive (aside from any children the operator
   moved while archived). Create-in-team, invites, and assign-to-team work
   again.
8. `POST /api/teams/:id/delete` on a **non-archived** team returns 4xx
   (“Only archived teams can be permanently deleted…”). On an archived
   team that still owns a survey, template, or map layer, delete returns
   4xx and the team document remains. On an archived team with no owned
   children, delete returns 200, the team is gone from both listings, and
   `GET /api/teams/:id` is 404.
9. Control Centre `/teams` does not show archived teams. `/archive?tab=teams`
   lists them with restore and (when permitted) delete actions. After
   archive, navigating to `/teams/:id` shows an archived banner and a link
   to Archive, analogous to the template archived alert. Team selects in
   create/assign dialogs do not offer archived teams.
10. `library/data-model/tests/permissionintegrity.test.ts` passes with the
    new action granted on at least one role. Swagger documents
    `PUT /api/teams/{id}/archive` and the `includeArchived` query on
    `GET /api/teams`.

## 4. Out of scope

- Cascading archive or delete of surveys, templates, or map layers when a
  team is archived or deleted.
- Open/closed (or any status enum) on teams.
- Archiving users, or changing disabled-user semantics.
- Collection-app UI or local Pouch cleanup for teams (teams are not an app
  listing).
- Tombstones for deleted teams (survey tombstones stay survey-only).
- Auto-expiring or auto-rejecting existing team invites beyond refusing
  redeem while the team is archived.
- A Teams Couch migration version bump, or rewriting how virtual roles are
  computed.
- Letting `TEAM_MANAGER` archive or restore a team.

## 5. Test plan

Check: code

Automated (`@faims3/data-model`):

1. `TeamDocumentSchema` accepts `archived: true|false` and documents
   without the field (treat as active). `PutArchiveTeamRequestSchema`
   requires a boolean `archive`.
2. `permissionintegrity.test.ts`: `CHANGE_TEAM_STATUS` is on
   `actionDetails` / `resourceToActions[TEAM]` and is granted by
   `TEAM_ADMIN` (and therefore `GENERAL_ADMIN`). It is not granted by
   `TEAM_MANAGER`.

Automated (`@faims3/api`, vitest; in-memory PouchDB):

3. Extend `api/test/teams.test.ts` (and team-integration where a child
   resource is required) with an archive → list split → restore cycle
   matching `api/test/template.test.ts` (`excludes archived … by default;
   includeArchived lists archived only`, restore of a live team rejected).
4. After archive, assert 4xx and no mutation for: `PUT /api/teams/:id`,
   `POST /api/teams/:id/members`, create team invite, redeem team invite,
   `POST /api/notebooks` with that `teamId`, create template with that
   team, create map asset with that team, `PUT` survey/template team to
   that id.
5. After archive, GET team/members still 200; a notebook owned by the team
   remains listed and readable; assigning that notebook to a **different
   active** team still 200.
6. `POST .../delete` without archive → 4xx; with archive but an owned
   notebook → 4xx; with archive and no children → 200 and subsequent GET
   is 404. Unauthorised local user still cannot archive or delete.
7. Existing team CRUD, membership, and `teamIntegration` tests stay green
   (active teams behave as today).

Automated (`@faims3/web`, one-shot vitest):

8. `getVisibleArchiveTabs` / `parseArchiveTab` include `'teams'` when the
   caller can see teams, and ignore an unknown `tab` the same way as
   today. Restore hook posts `{ archive: false }` (replace the throwing
   placeholder).

Commands:

```bash
pnpm --filter=@faims3/data-model test
pnpm --filter=@faims3/api test
pnpm --filter=@faims3/web exec vitest --run
```

No new browser e2e is required for this change; lifecycle is proven by the
API tests. Existing `e2e/test/specs/web/teams.e2e.ts` and archive-nav
specs should still pass. A later e2e that archives a disposable team (same
style as `template-visibility-archive.e2e.ts`) is optional.

## 6. Risk class and why

**Med.** Size: **m**.

Archive is a new permission plus a listing/filter change on a shared
container type, and `POST /api/teams/:id/delete` becomes archive-gated.
Getting the disable set wrong could either leak new creates into a
“retired” team or, if someone cascaded archive, yank live surveys from the
collection app. Residual risk is real but contained: the boolean +
`PUT .../archive` path already exists for templates, child assets keep
their own lifecycle, and the collection app does not list teams. Medium
rather than high because there is no cascade and no Fieldmark local-data
path. Medium rather than low because listings, invites, and in-team
creates all have to honour the flag.

## 7. Open questions

1. If product later wants archive to also archive every owned survey and
   template, that is a separate change. This spec does not cascade.
2. Permanent delete currently removes the team document even when children
   still point at it. This spec refuses delete until children are
   reassigned or deleted. Switch to orphaning (`ownedByTeamId` cleared) only
   if product prefers that over the refuse-until-empty rule.
