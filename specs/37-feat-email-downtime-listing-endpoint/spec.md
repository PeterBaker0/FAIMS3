# Spec: email downtime listing endpoint

Issue: [#37](https://github.com/PeterBaker0/FAIMS3/issues/37)
Branch size: **s**

## 1. Problem

Operators need a paste-ready list of user email addresses so they can notify
people of planned Conductor or CouchDB downtime (see the AWS Couch backup and
upgrade runbooks). Today that list is produced only by the laptop/CLI script
`pnpm run dump-user-emails` (`api/src/scripts/dumpUserEmails.ts`), which
requires `api/.env` pointing at the target CouchDB and is unavailable to a
Control Centre administrator who can manage users but has no Couch credentials.

`GET /api/users` already returns people-db documents (including `emails`) to
callers with `Action.VIEW_USER_LIST`, and the Control Centre Users table shows
each account's first email. That is not a downtime mailing list:

- It includes roles, profiles, and other fields that a BCC paste does not need.
- It does not de-duplicate addresses across users, skip empty addresses, or
  apply the CLI's default skip of `test` / `demo` / `example.com`.
- It does not offer copy-as-BCC or CSV download.
- It is authorised as ordinary user-list access, not as a bulk email dump.

This issue adds a **listing** endpoint (and a thin Control Centre control)
behind a **new permission Action**, reusing the CLI's filtering rules. It does
**not** send mail.

## 2. Constraints

- Read-only. The endpoint must not create, update, or delete people-db
  documents, and must not call `emailService.sendEmail`.
- Add a new permission-model Action for this dump, not reuse
  `VIEW_USER_LIST`:
  - Enum value: `Action.DUMP_USER_EMAILS` (`'DUMP_USER_EMAILS'`).
  - Place it with the other USER actions in
    `library/data-model/src/permission/model.ts`.
  - `actionDetails`: name/description that it dumps user emails for
    maintenance notices; `resourceSpecific: false`; `resource: Resource.USER`.
  - Grant it on `Role.OPERATIONS_ADMIN` only (same block as
    `VIEW_USER_LIST` / `SEND_TEST_EMAIL`). `Role.GENERAL_ADMIN` inherits it.
  - Do not grant it on `GENERAL_USER`, `GENERAL_CREATOR`, or any
    resource-specific role.
  - Wire `actionDetails` and `roleActions` so
    `library/data-model/tests/permissionintegrity.test.ts` stays green
    (`Record<Action, …>` and “every action has a granting role”).
- Authenticated Conductor API: `requireAuthenticationAPI` plus
  `isAllowedToMiddleware({action: Action.DUMP_USER_EMAILS})`. A caller who
  can `VIEW_USER_LIST` but not `DUMP_USER_EMAILS` must get **403**.
- Reuse the dump-script semantics so CLI and API cannot drift:
  - Source: people DB via `getUsers()` then `filterPeopleUsersForList`.
  - Disabled accounts omitted unless the caller opts in (same meaning as
    `GET /api/users?includeArchived=true` / CLI `--include-disabled`).
  - Default skip stays the CLI standard and stays hardcoded (not env):
    case-insensitive match of `test` or `demo` anywhere, or `example\.com`.
    Empty / whitespace-only addresses omitted.
  - De-duplicate by trimmed lowercase email; sort remaining addresses with
    `localeCompare`.
  - Include unverified addresses. Expose `verified` on each row so operators
    can filter in a spreadsheet.
  - Extract the row-building / skip / de-dupe logic from
    `dumpUserEmails.ts` into a shared helper the CLI and the route both call.
- Do not accept caller-supplied skip regexes on the HTTP API (ReDoS). The CLI
  may keep `--skip=…` / `--no-skip`. The API exposes only a boolean to disable
  the default skip list.
- **JSON only.** No `format=csv|bcc|lines` (or other content types) on the
  API. Control Centre builds clipboard / CSV client-side from the JSON rows.
- Register the route as a static path under `/api/users` (for example
  `GET /api/users/emails`) **before** any `/:id` handlers so it cannot be
  captured as a user id.
- Zod request/response types live in `@faims3/data-model`
  (`library/data-model/src/api.ts`) and are exported like
  `GetListAllUsersResponseSchema`. Strip extra people-db fields; do not
  return salts, profiles, or role maps.
- Update `api/public/swagger.json` for the new path. Update `api/README.md`
  Dump user emails (ops) to mention the API/UI when Conductor is still up.
  Keep existing Couch backup / upgrade runbook CLI steps
  (`pnpm run dump-user-emails`); they remain the path when Couch env is
  available or Conductor is already down.
- Keep `pnpm run dump-user-emails`. Do not delete or break it.
- Control Centre UI belongs on the existing Users admin page
  (`web/src/routes/_protected/_admin/users.tsx` / `UsersTab`). The page
  remains gated by `VIEW_USER_LIST`. The dump control is shown only when
  `useIsAuthorisedTo({action: Action.DUMP_USER_EMAILS})` is true. No
  field-app changes.
- Follow existing API patterns: `validate()` for query params (string enums
  `'true'|'false'` like `includeArchived` on `GET /api/users`), DCO sign-off,
  SPDX on new TypeScript files.

## 3. Acceptance criteria

1. An unauthenticated `GET` to the new emails path returns **401**.
2. An authenticated caller **without** `Action.DUMP_USER_EMAILS` (for example
   a `GENERAL_USER` or `GENERAL_CREATOR`) receives **403**.
3. An authenticated `OPERATIONS_ADMIN` or `GENERAL_ADMIN` receives **200**
   and a JSON body that parses with the new data-model schema. Each row
   includes at least `email`, `name`, `userId`, `disabled`, and `verified`
   (same columns as the CLI CSV). The body does not include `profiles`,
   `globalRoles`, `projectRoles`, `teamRoles`, `templateRoles`, or
   password/salt fields. The response `Content-Type` is JSON (not CSV or
   `text/plain`).
4. Default listing (no query flags) omits disabled accounts, omits addresses
   matching the default skip patterns (`test`, `demo`, `example.com`), omits
   blank addresses, de-duplicates by lowercase email, and sorts remaining
   emails lexicographically.
5. `includeArchived=true` includes emails from disabled accounts; those rows
   have `disabled: true`. `includeArchived=false` or omitting the param matches
   criterion 4 for disabled accounts.
6. A query flag that disables the default skip list (name to be chosen by the
   implementer, e.g. `includeSkipped=true`) returns addresses that the default
   skip would have dropped (for example `demo.user@csiro.au` or
   `person@example.com`), still omitting blanks and still de-duplicating.
7. Two people-db users that share the same email (differing only by case or
   surrounding whitespace) produce **one** row for that address.
8. A user with an empty `emails` array (the local `admin` account is this
   shape) contributes **no** row.
9. An unverified `emails[].verified === false` address is **included**; the
   row's `verified` field is `false`.
10. The endpoint does not invoke `emailService.sendEmail` (or any other send
    path) for a successful or failed listing request.
11. `pnpm run dump-user-emails` with default flags produces the same set of
    email addresses as the default JSON listing against the same people DB
    (order may match after the shared sort).
12. `Action.DUMP_USER_EMAILS` exists in the permission model with complete
    `actionDetails`, is granted to `OPERATIONS_ADMIN` (and therefore
    `GENERAL_ADMIN` by inheritance), and is **not** granted to `GENERAL_USER`
    or `GENERAL_CREATOR`. `pnpm --filter=@faims3/data-model test` passes,
    including `permissionintegrity`.
13. The Control Centre Users admin page shows the dump control only when the
    session has `DUMP_USER_EMAILS`. That control loads the JSON listing and
    can copy addresses (newline- or BCC-separated) and/or download CSV with
    columns `name,email,user_id,disabled,verified`. A user without
    `VIEW_USER_LIST` still cannot see the Users tab (existing behaviour).
14. `api/public/swagger.json` documents the path, `DUMP_USER_EMAILS` auth,
    query params, and JSON-only response. `api/README.md` describes the
    endpoint next to the existing dump script. Couch backup / upgrade
    runbooks still document `dump-user-emails`.

## 4. Out of scope

- Sending downtime, maintenance, or bulk notification emails from Conductor.
- User-facing opt-in/opt-out, notification preferences, or a status page.
- API response formats other than JSON (`format=csv|bcc|lines`, CSV
  `Content-Type`, or a raw BCC string body).
- Making skip patterns env-configurable; they stay the hardcoded CLI
  standard (`test`, `demo`, `example\.com`).
- Caller-supplied skip regexes on the HTTP API (`--skip` stays CLI-only).
- Removing the CLI or rewriting Couch backup / upgrade runbooks to drop
  `dump-user-emails`.
- Granting `DUMP_USER_EMAILS` to roles other than `OPERATIONS_ADMIN`
  (plus `GENERAL_ADMIN` inheritance).
- Pagination, streaming, or ETag/caching of the listing.
- Field app (`app/`) UI or APIs.
- Changing `GET /api/users` response shape or its `VIEW_USER_LIST` gate.
- CouchDB design-doc or people-db schema migrations.

## 5. Test plan

Automated (required):

- **Permission model** (`pnpm --filter=@faims3/data-model test`):
  `DUMP_USER_EMAILS` has `actionDetails`; `permissionintegrity` passes;
  `OPERATIONS_ADMIN` / `GENERAL_ADMIN` can; `GENERAL_USER` /
  `GENERAL_CREATOR` cannot (`permissionfunctions` style checks).
- **Shared helper** (new unit tests next to the extract, or in `api/test/`):
  default skip, `includeSkipped`, disabled filter, blank/missing emails,
  case/whitespace de-dupe, sort, unverified included, user with no emails.
- **API** (`pnpm --filter=@faims3/api test`, follow `api/test/api.test.ts`
  user-list cases): 401, 403 without `DUMP_USER_EMAILS`, 200 for an
  operations/cluster admin, JSON schema parse, default skip vs
  `includeSkipped`, `includeArchived`, de-dupe, no `sendEmail` spy calls,
  no non-JSON format query accepted (validation **400** if `format` is
  sent, or the param is simply ignored because it is not in the schema —
  pick one and test it).
- **CLI smoke** (optional in the same API test file or a small script test):
  helper output equals dump-script row set for a fixture people list.
- **Control Centre** (if UI logic is non-trivial):
  `pnpm --filter=@faims3/web exec vitest --run` for the hook/button that
  maps JSON → clipboard string / CSV, and that the control is hidden
  without `DUMP_USER_EMAILS`.

Manual / e2e (when the stack is up):

- Sign in to Control Centre as `admin`, open Users, use the dump control,
  confirm skipped `test`/`demo`/`example.com` addresses are absent by default
  and appear when skip is disabled.
- Confirm a non-admin persona still has no Users nav
  (`e2e/test/specs/web/permissions-matrix.e2e.ts` already covers that).
- Optional: extend `e2e/test/specs/web/users-admin.e2e.ts` with a
  `data-testid` click → clipboard/download assertion if the UI is in the same
  change.

Commands:

```bash
pnpm --filter=@faims3/data-model test
pnpm --filter=@faims3/api test
pnpm --filter=@faims3/web exec vitest --run
```

## 6. Risk class and why

**Risk: low.** Size: **s**.

The change is a read-only JSON projection of people-db emails plus an
**additive** permission Action granted to the same operations roles that
already list users. It does not send mail, mutate data, change offline sync,
or weaken existing grants. Residual risks are bulk PII export (now an
explicit dump Action, which is stricter than sharing `VIEW_USER_LIST`) and
accidental inclusion of test addresses if the skip flag is inverted;
default-on skip and no caller-supplied regexes keep that contained.

## 7. Open questions

None remaining. Revision answers:

1. Keep skip patterns the hardcoded CLI standard for now (`test`, `demo`,
   `example\.com`). Not env-configurable in this change.
2. Include unverified addresses; expose `verified` on each row.
3. JSON is enough. No API `format=` variants.
4. Keep `dump-user-emails` and the existing Couch backup / upgrade runbook
   CLI steps.
