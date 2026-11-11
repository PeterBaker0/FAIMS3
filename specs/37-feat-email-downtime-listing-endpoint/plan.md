# Plan: email downtime listing endpoint

Issue: [#37](https://github.com/PeterBaker0/FAIMS3/issues/37)
Spec: [spec.md](./spec.md)

```yaml
tasks:
  - key: dump-permission-schema
    title: Add DUMP_USER_EMAILS action and JSON listing schema
    description: >
      Add Action.DUMP_USER_EMAILS to the USER actions in
      library/data-model/src/permission/model.ts with actionDetails
      (resource USER, not resource-specific) and grant it only on
      Role.OPERATIONS_ADMIN so GENERAL_ADMIN inherits it. Do not grant it
      on GENERAL_USER, GENERAL_CREATOR, or resource-specific roles. Add
      GetDumpUserEmailsResponseSchema (and request query types if they
      belong in data-model) next to GetListAllUsersResponseSchema in
      library/data-model/src/api.ts: JSON rows with email, name, userId,
      disabled, verified; strip profiles, roles, and secrets. Add
      permissionfunctions-style tests mirroring IMPERSONATE_USER. Run
      pnpm --filter=@faims3/data-model test including permissionintegrity.
    depends_on: []
    files_hint:
      - library/data-model/src/permission/model.ts
      - library/data-model/src/api.ts
      - library/data-model/tests/permissionfunctions.test.ts
      - library/data-model/tests/permissionintegrity.test.ts
    acceptance:
      - 12
    risk: low
    size: s
    tier: cheap
  - key: email-listing-helper
    title: Extract shared dump-user-emails listing helper
    description: >
      Move row-building, default skip (test, demo, example.com), blank
      omit, lowercase de-dupe, localeCompare sort, includeArchived, and
      includeSkipped from api/src/scripts/dumpUserEmails.ts into a shared
      helper that takes already-fetched people docs and returns the row
      list. Keep skip regexes hardcoded; do not take caller regexes.
      Include unverified addresses and set verified from the email entry.
      Point the CLI at the helper so default dump-user-emails output
      matches the helper set. Add unit tests with fixture users (no
      Couch) for skip, includeSkipped, disabled, blanks, de-dupe, sort,
      unverified, and empty emails. Do not send mail.
    depends_on: []
    files_hint:
      - api/src/scripts/dumpUserEmails.ts
      - api/src/utils/userEmailListing.ts
      - api/test/userEmailListing.test.ts
    acceptance:
      - 4
      - 5
      - 6
      - 7
      - 8
      - 9
      - 11
    risk: low
    size: s
    tier: cheap
  - key: email-listing-api
    title: Add GET /api/users/emails JSON endpoint
    description: >
      Register GET /api/users/emails as a static route on the users
      router before any /:id handlers. Auth with requireAuthenticationAPI
      and isAllowedToMiddleware DUMP_USER_EMAILS. Query includeArchived
      and includeSkipped as true/false string enums like GET /api/users;
      reject or ignore format= (JSON only). Fetch via getUsers, filter
      with filterPeopleUsersForList, then the shared helper; parse with
      GetDumpUserEmailsResponseSchema. Do not call emailService.sendEmail.
      API tests following api/test/api.test.ts: 401, 403 for GENERAL_USER,
      200 for operations/cluster admin, schema parse, skip flags, no
      sendEmail spy, JSON Content-Type. Run pnpm --filter=@faims3/api test.
    depends_on:
      - dump-permission-schema
      - email-listing-helper
    files_hint:
      - api/src/api/users.ts
      - api/test/userEmails.api.test.ts
      - api/test/api.test.ts
    acceptance:
      - 1
      - 2
      - 3
      - 10
    risk: low
    size: s
    tier: mid
  - key: email-listing-ui
    title: Add Control Centre downtime email dump control
    description: >
      On the Users admin tab, show a dump control only when
      useIsAuthorisedTo DUMP_USER_EMAILS is true. Keep the page gated by
      VIEW_USER_LIST. Fetch GET /api/users/emails (includeArchived /
      includeSkipped toggles). From JSON only, copy newline- or
      BCC-separated addresses and/or download CSV with columns
      name,email,user_id,disabled,verified. Add vitest for mapping JSON
      to clipboard/CSV and for hiding the control without the action.
      Optional data-testid for users-admin e2e. No field-app changes.
      Run pnpm --filter=@faims3/web exec vitest --run.
    depends_on:
      - email-listing-api
    files_hint:
      - web/src/components/tabs/admin/users.tsx
      - web/src/hooks/queries.ts
      - web/src/routes/_protected/_admin/users.tsx
      - e2e/test/specs/web/users-admin.e2e.ts
    acceptance:
      - 13
    risk: low
    size: s
    tier: mid
  - key: email-listing-docs
    title: Document the JSON dump endpoint in swagger and README
    description: >
      Document GET /users/emails in api/public/swagger.json (Auth,
      DUMP_USER_EMAILS, includeArchived, includeSkipped, JSON-only
      response). Describe the endpoint next to Dump user emails (ops) in
      api/README.md as the path when Conductor is still up. Do not remove
      or rewrite dump-user-emails CLI steps in the Couch backup / upgrade
      runbooks.
    depends_on:
      - email-listing-api
    files_hint:
      - api/public/swagger.json
      - api/README.md
    acceptance:
      - 14
    risk: low
    size: s
    tier: cheap
```
