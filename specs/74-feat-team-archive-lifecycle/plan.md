# Plan: team archive lifecycle

Issue: [#74](https://github.com/PeterBaker0/FAIMS3/issues/74)
Spec: [spec.md](./spec.md)

One pull request. Size **m**, risk **med**. Template-shaped boolean archive;
no cascade onto child assets.

```yaml
approach: >
  One pull request adds an optional archived flag and CHANGE_TEAM_STATUS to
  the data model, then implements PUT /api/teams/:id/archive and
  includeArchived listing the same way templates work. It next rejects
  team-as-container mutations (details, members, invites, in-team creates,
  assign-to-this-team) while archived, gates permanent delete behind archive
  plus an empty-children check, and wires Control Centre Archive plus a
  team-page banner on those APIs. Swagger and admin Archive copy are updated
  last; owned surveys keep their own lifecycle and the collection app is
  untouched.
check: code
tasks:
  - key: data-model-archive
    title: Add archived field and CHANGE_TEAM_STATUS
    description: >
      Add optional archived on team documents and API Zod types, plus
      Action.CHANGE_TEAM_STATUS granted on TEAM_ADMIN and OPERATIONS_ADMIN
      only. Missing archived reads as false; permissionintegrity stays green.
    depends_on: []
    files_hint:
      - library/data-model/src/data_storage/teamsDB/types.ts
      - library/data-model/src/api.ts
      - library/data-model/src/permission/model.ts
      - library/data-model/tests/permissionintegrity.test.ts
      - library/data-model/tests/permissionfunctions.test.ts
    acceptance:
      - 1
      - 4
      - 10
    risk: low
    size: s
    tier: cheap
  - key: archive-restore-api
    title: Archive, restore, and list teams
    description: >
      Add PUT /api/teams/:id/archive and GET /api/teams?includeArchived=
      (active by default, archived-only when true). GET by id still returns
      an archived team. Cover the archive-list-restore cycle and 403 for
      TEAM_MANAGER in api/test/teams.test.ts.
    depends_on:
      - data-model-archive
    files_hint:
      - api/src/couchdb/teams.ts
      - api/src/api/teams.ts
      - api/test/teams.test.ts
      - api/test/requestValidation.test.ts
    acceptance:
      - 1
      - 2
      - 3
      - 4
    risk: med
    size: m
    tier: mid
  - key: gate-team-mutations
    title: Freeze membership and invites when archived
    description: >
      Reject update-details, member add/remove, team-invite create, and
      team-invite redeem while archived. Restore must make those operations
      work again without re-inviting. Keep GET team, members, and invites
      succeeding.
    depends_on:
      - archive-restore-api
    files_hint:
      - api/src/couchdb/teams.ts
      - api/src/api/teams.ts
      - api/src/api/invites.ts
      - api/src/couchdb/invites.ts
      - api/src/auth/helpers.ts
      - api/test/teams.test.ts
      - api/test/invites.test.ts
    acceptance:
      - 5
      - 6
      - 7
    risk: med
    size: m
    tier: mid
  - key: gate-in-team-creates
    title: Block creates and assign-to archived team
    description: >
      Reject creating a survey, template, or map layer in an archived team
      and assigning an existing survey or template onto it. Allow moving a
      child off the archived team; children keep their own status and
      virtual roles. After restore, in-team create and assign work again.
    depends_on:
      - archive-restore-api
    files_hint:
      - api/src/couchdb/teams.ts
      - api/src/api/notebooks.ts
      - api/src/couchdb/notebooks.ts
      - api/src/api/templates.ts
      - api/src/couchdb/templates.ts
      - api/src/api/mapAssets.ts
      - api/test/teamIntegration.test.ts
      - api/test/template.test.ts
      - api/test/mapAssets.api.test.ts
    acceptance:
      - 5
      - 6
      - 7
    risk: med
    size: m
    tier: mid
  - key: archive-gated-delete
    title: Require archive and empty children to delete
    description: >
      POST /api/teams/:id/delete refuses unless the team is archived and
      owns no surveys, templates, or map layers. On success, strip remaining
      teamRoles for that id. Do not cascade-delete or orphan children.
    depends_on:
      - archive-restore-api
    files_hint:
      - api/src/couchdb/teams.ts
      - api/src/api/teams.ts
      - api/src/couchdb/users.ts
      - api/src/couchdb/notebooks.ts
      - api/src/couchdb/templates.ts
      - api/src/couchdb/mapAssets/store.ts
      - api/test/teams.test.ts
      - api/test/teamIntegration.test.ts
    acceptance:
      - 8
    risk: med
    size: m
    tier: mid
  - key: web-archive-tab
    title: Add Teams tab to Control Centre Archive
    description: >
      Add teams to archive-tabs, list archived teams via includeArchived,
      implement useRestoreTeamFromArchive, and add restore/delete row
      actions like archived templates. Default GET /api/teams keeps /teams
      and team pickers free of archived teams.
    depends_on:
      - archive-restore-api
      - archive-gated-delete
    files_hint:
      - web/src/archive/archive-tabs.ts
      - web/src/hooks/archive-hooks.ts
      - web/src/hooks/queries.ts
      - web/src/routes/_protected/archive/index.tsx
      - web/src/components/tables/archived-teams.tsx
      - web/src/components/dialogs/restore-team-dialog.tsx
      - web/src/components/dialogs/delete-archived-team-dialog.tsx
      - web/src/components/side-bar/app-sidebar.tsx
    acceptance:
      - 9
    risk: med
    size: m
    tier: mid
  - key: web-team-archive-ui
    title: Archive control and banner on team page
    description: >
      Add an archive action on the team page for CHANGE_TEAM_STATUS, and an
      archived banner with an Archive link when viewing /teams/:id after
      archive, matching the template alert.
    depends_on:
      - archive-restore-api
      - web-archive-tab
    files_hint:
      - web/src/routes/_protected/teams/$teamId.tsx
      - web/src/components/dialogs/archive-team-dialog.tsx
      - web/src/components/tabs/teams/team-details.tsx
      - web/src/hooks/archive-hooks.ts
    acceptance:
      - 9
    risk: low
    size: s
    tier: mid
  - key: swagger-user-docs
    title: Document archive API and Archive tab
    description: >
      Document PUT /api/teams/{id}/archive and includeArchived on GET
      /api/teams in swagger. Update admin Archive copy so it includes
      archived teams alongside surveys, templates, and disabled users.
    depends_on:
      - archive-restore-api
      - web-archive-tab
    files_hint:
      - api/public/swagger.json
      - docs/user/admin/web.md
      - docs/user/admin/user-roles-and-permissions-guide.md
    acceptance:
      - 9
      - 10
    risk: low
    size: s
    tier: cheap
```
