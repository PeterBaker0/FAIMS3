# Spec: email downtime listing endpoint

Issue: [#37](https://github.com/PeterBaker0/FAIMS3/issues/37)
Branch size: **s**

## 1. Problem

Operators need a paste-ready list of user email addresses so they can notify
people of planned Conductor or CouchDB downtime (see the AWS Couch backup and
upgrade runbooks). Today that list is produced only by the laptop/CLI script
`pnpm run dump-user-emails` (`api/src/scripts/dumpUserEmails.ts`), which
requires `api/.env` pointing at the target CouchDB and is unavailable to a
Control Centre administrator who has user-list permission but no Couch
credentials.

`GET /api/users` already returns people-db documents (including `emails`) to
callers with `Action.VIEW_USER_LIST`, and the Control Centre Users table shows
each account's first email. That is not a downtime mailing list:

- It includes roles, profiles, and other fields that a BCC paste does not need.
- It does not de-duplicate addresses across users, skip empty addresses, or
  apply the CLI's default skip of `test` / `demo` / `example.com`.
- It does not offer copy-as-BCC or CSV download.

This issue adds a **listing** endpoint (and a thin Control Centre control) that
reuses the CLI's filtering rules. It does **not** send mail.

## 2. Constraints

- Read-only. The endpoint must not create, update, or delete people-db
  documents, and must not call `emailService.sendEmail`.
- Authenticated Conductor API, same permission as the existing user list:
  `requireAuthenticationAPI` plus `isAllowedToMiddleware({action: Action.VIEW_USER_LIST})`.
  `Role.OPERATIONS_ADMIN` and `Role.GENERAL_ADMIN` already grant that action. Do
  not add a new `Action` in v1.
- Reuse the dump-script semantics so CLI and API cannot drift:
  - Source: people DB via `getUsers()` then `filterPeopleUsersForList`.
  - Disabled accounts omitted unless the caller opts in (same meaning as
    `GET /api/users?includeArchived=true` / CLI `--include-disabled`).
  - Default skip (case-insensitive): addresses matching `test` or `demo`
    anywhere, or `example\.com`. Empty / whitespace-only addresses omitted.
  - De-duplicate by trimmed lowercase email; sort remaining addresses with
    `localeCompare`.
  - Include unverified addresses (the CLI does).
  - Extract the row-building / skip / de-dupe logic from
    `dumpUserEmails.ts` into a shared helper the CLI and the route both call.
- Do not accept caller-supplied skip regexes on the HTTP API (ReDoS). The CLI
  may keep `--skip=…` / `--no-skip`. The API exposes only a boolean to disable
  the default skip list.
- JSON is the Control Centre contract. Optional `format=csv|bcc|lines` may
  mirror CLI stdout for curl/runbook use; if implemented, they must use the
  same rows as JSON. Do not require those formats for v1 if JSON plus the UI
  copy/download covers the Control Centre path.
- Register the route as a static path under `/api/users` (for example
  `GET /api/users/emails`) **before** any `/:id` handlers so it cannot be
  captured as a user id.
- Zod request/response types live in `@faims3/data-model` (`library/data-model/src/api.ts`)
  and are exported like `GetListAllUsersResponseSchema`. Strip extra people-db
  fields; do not return salts, profiles, or role maps.
- Update `api/public/swagger.json` for the new path. Update `api/README.md`
  Dump user emails (ops) and the Couch backup / upgrade developer guides to
  mention the API/UI as the path when Conductor is still up; keep the CLI for
  operators who already have Couch env access.
- Keep `pnpm run dump-user-emails`. Do not delete or break it.
- Control Centre UI belongs on the existing Users admin page
  (`web/src/routes/_protected/_admin/users.tsx` / `UsersTab`), gated by the
  same `VIEW_USER_LIST` check already used there. No field-app changes.
- Follow existing API patterns: `validate()` for query params (string enums
  `'true'|'false'` like `includeArchived` on `GET /api/users`), DCO sign-off,
  SPDX on new TypeScript files.

## 3. Acceptance criteria

1. An unauthenticated `GET` to the new emails path returns **401**.
2. An authenticated caller **without** `Action.VIEW_USER_LIST` (for example a
   `GENERAL_USER` / `GENERAL_CREATOR` with no operations role) receives **403**.
3. An authenticated caller **with** `VIEW_USER_LIST` receives **200** and a
   JSON body that parses with the new data-model schema. Each row includes at
   least `email`, `name`, `userId`, `disabled`, and `verified` (same columns as
   the CLI CSV). The body does not include `profiles`, `globalRoles`,
   `projectRoles`, `teamRoles`, `templateRoles`, or password/salt fields.
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
9. An unverified `emails[].verified === false` address is included; the row's
   `verified` field is `false`.
10. The endpoint does not invoke `emailService.sendEmail` (or any other send
    path) for a successful or failed listing request.
11. `pnpm run dump-user-emails` with default flags produces the same set of
    email addresses as the default JSON listing against the same people DB
    (order may match after the shared sort).
12. The Control Centre Users admin page, for a `VIEW_USER_LIST` session, offers
    a control that loads the listing and can copy addresses (newline- or
    BCC-separated) and/or download CSV with columns
    `name,email,user_id,disabled,verified`. A user without `VIEW_USER_LIST`
    still cannot see the Users tab (existing behaviour) and therefore cannot
    use the control.
13. `api/public/swagger.json` documents the path, auth, query params, and JSON
    response. `api/README.md` describes the endpoint next to the existing dump
    script.

## 4. Out of scope

- Sending downtime, maintenance, or bulk notification emails from Conductor.
- User-facing opt-in/opt-out, notification preferences, or a status page.
- A new permission `Action`, cluster-admin-only gating, or audit log beyond
  whatever the existing request logger already records.
- Caller-supplied skip regexes on the HTTP API (`--skip` stays CLI-only).
- Removing, renaming, or changing the default skip patterns of
  `dump-user-emails` except to call the shared helper.
- Pagination, streaming, or ETag/caching of the listing.
- Field app (`app/`) UI or APIs.
- Changing `GET /api/users` response shape.
- CouchDB design-doc or people-db schema migrations.

## 5. Test plan

Automated (required):

- **Shared helper** (new unit tests next to the extract, or in `api/test/`):
  default skip, `includeSkipped`, disabled filter, blank/missing emails,
  case/whitespace de-dupe, sort, unverified included, user with no emails.
- **API** (`pnpm --filter=@faims3/api test`, follow `api/test/api.test.ts`
  user-list cases): 401, 403, 200 schema parse, default skip vs
  `includeSkipped`, `includeArchived`, de-dupe, no `sendEmail` spy calls.
- **Data-model**: schema export compiles; if a new `Action` is *not* added,
  existing `permissionintegrity` tests stay green with no permission-file
  edits.
- **CLI smoke** (optional in the same API test file or a small script test):
  helper output equals dump-script row set for a fixture people list.
- **Control Centre** (if UI logic is non-trivial): `pnpm --filter=@faims3/web exec vitest --run`
  for the hook/button that maps JSON → clipboard string / CSV.

Manual / e2e (when the stack is up):

- Sign in to Control Centre as `admin`, open Users, use the new control,
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

The change is a read-only projection of people-db emails already returned by
`GET /api/users` to the same role. It does not send mail, mutate data, change
offline sync, or alter the permission model. Residual risks are bulk PII
export (already possible via the user list) and accidental inclusion of
test addresses if the skip flag is inverted; default-on skip and no
caller-supplied regexes keep that contained.

## 7. Open questions

1. Should default skip patterns become env-configurable later, or stay
   hardcoded to match today's CLI (`test`, `demo`, `example\.com`)?
   **Recommendation for v1:** keep them hardcoded and shared.
2. Should unverified addresses be excluded by default? The CLI includes them.
   **Recommendation for v1:** include them, expose `verified` so operators can
   filter in a spreadsheet.
3. Is JSON-only enough, with BCC/CSV built in the Control Centre, or should
   the API also speak `format=bcc|csv|lines` for runbooks that currently curl
   nothing and only run the CLI? **Recommendation:** JSON required; extra
   formats optional in the same change if cheap.
4. If Conductor is already down, this endpoint cannot replace the CLI. That is
   accepted; runbooks should keep `dump-user-emails` for the Couch-env path.
