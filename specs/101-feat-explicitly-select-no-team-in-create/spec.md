# feat: explicitly select no team in create survey/template workflows

Issue: [#101](https://github.com/PeterBaker0/FAIMS3/issues/101)

## Problem

Control Centre create flows treat team ownership as optional for anyone with global create permission (`Action.CREATE_PROJECT` or `Action.CREATE_TEMPLATE`, granted by `Role.GENERAL_CREATOR` and inherited by `Role.GENERAL_ADMIN`). Leaving the team select blank, or clearing it, omits `teamId` on `POST /api/notebooks` / `POST /api/templates` and creates an unowned resource.

That is too easy to do by accident. A user who belongs to one or more home teams can submit the form without touching the team field and land the survey or template outside those teams. Copy currently advertises this: labels say `(optional)`, and helper text tells global creators to “leave blank” or “clear the selection” to create outside any team.

The four create UIs are:

| Workflow | Form | How team is chosen today |
| -------- | ---- | ------------------------ |
| Create survey (Projects list) | `web/src/components/forms/create-project-form.tsx` | Optional select of every visible team when `specifiedTeam` is unset. Does **not** use the shared helper. |
| Create survey from template (template detail) | `web/src/components/forms/create-project-from-template.tsx` | Shared helper; optional + `clearable` for global create; may default to the template’s `ownedByTeamId`. |
| Create template (Templates list) | `web/src/components/forms/create-template-form.tsx` | Shared helper; optional + `clearable` for global create. |
| Create template from survey | `web/src/components/forms/create-template-from-project.tsx` | Same helper as create-template. |

Shared logic lives in `web/src/components/forms/template-team-field.ts` (`getTeamFieldState`, `buildTeamField` / `buildTemplateTeamField`, `resolveTeamId`). When `canCreateGlobally` is true the field schema is `z.string().optional()` and `clearable: true`. `CreateProjectForm` duplicates a weaker version of that (optional schema, no “No team” option, no permission-filtered team list).

Team-tab create (`specifiedTeam` on `CreateProjectDialog` / `CreateTemplateDialog`) already fixes the team and hides the picker. In-team-only users with exactly one eligible team get a callout (`TemplateOwnerCallout`) and `resolveTeamId` auto-assigns that team. Those paths cannot create unowned resources today.

## Constraints

- Control Centre (`@faims3/web`) only. Do not change Conductor API contracts: omitting `teamId` on `POST /api/notebooks` and `POST /api/templates` remains the way to create an unowned resource, and still requires `CREATE_PROJECT` / `CREATE_TEMPLATE`. Do not add a new API sentinel value.
- “No team” is permission-gated. Include it only when the user is authorised for the matching global create action (`useIsAuthorisedTo({action: Action.CREATE_PROJECT})` or `Action.CREATE_TEMPLATE`). In-team-only users (`CREATE_*_IN_TEAM` without global create) must never see or submit “No team”.
- The team field is required whenever the user can choose a team or can create unowned. Do not default the field to “No team”. An empty placeholder (must pick) is the default on the global Projects / Templates lists.
- Context defaults that name a **real team** stay allowed: `specifiedTeam` (team tab), `defaultValues.teamId` if a caller passes one, and `defaultTeamFromOwner` on create-from-template (template’s `ownedByTeamId` when the user may create in that team). Switching to unowned from those defaults means selecting “No team”, not clearing the field.
- Keep the existing fixed-team paths: `specifiedTeam` hides the picker and posts that team; in-team-only users with exactly one eligible team keep the callout and auto-assign. They cannot create unowned, so they do not need a “No team” option.
- If a global creator has zero eligible teams, still show a required team field whose only option is “No team”. Today `getTeamFieldState` hides the dropdown when `possibleTeams.length === 0`, which silently creates unowned.
- Radix `Select` rejects `value=""`. Represent “No team” with a non-empty form sentinel (constant in the shared helper). `resolveTeamId` maps that sentinel to `undefined` / omitted `teamId`. Do not send the sentinel string to the API.
- Put the behaviour in `template-team-field.ts` so the template and create-from-template forms stay consistent. Move `CreateProjectForm` onto the same helper (`getPossibleTeamsForAction`, `getTeamFieldState`, `buildTeamField`, `resolveTeamId`) instead of its current unfiltered optional select.
- `buildTeamField` is also used by map-layer upload (`create-map-layer-form.tsx`). If the helper becomes required-plus-sentinel, either parameterize the old optional-blank behaviour for map layers or keep map-layer create on a separate builder so this issue does not change map-layer UX.
- Server permission checks stay the source of truth. The UI must not present “No team” to users who would get 403; the API must still 403 if a client omits `teamId` without global create.
- Stable `data-testid` on the team select so tests can target it without depending on copy. Prefer a shared test id on the field built by `buildTeamField`.

## Acceptance criteria

1. On the global Projects list create dialog (`CreateProjectForm` without `specifiedTeam`), a user with `CREATE_PROJECT` cannot submit a valid name while the team select is untouched. Zod / form validation fails on the team field. A reviewer can confirm this from `buildTeamField` (or the project form’s field) using `z.string()` (not `.optional()`) and from a vitest that `schema.safeParse(undefined)` is false.

2. That same dialog’s team select lists a “No team” option **and** the user’s eligible teams. A user who has only `CREATE_PROJECT_IN_TEAM` (no `CREATE_PROJECT`) does not get a “No team” option. A reviewer can confirm this from `buildTeamField` / `getPossibleTeamsForAction` unit tests with `canCreateGlobally: true` vs `false`.

3. Submitting with “No team” selected omits `teamId` (or sends `undefined`) on `POST /api/notebooks`. Submitting a real team sends that team’s `_id`. A reviewer can confirm this from a `resolveTeamId` unit test: sentinel → `undefined`; team id → that id.

4. On the global Templates list create dialog (`CreateTemplateForm` without `specifiedTeam`), the same rules apply with `CREATE_TEMPLATE` / `CREATE_TEMPLATE_IN_TEAM` and `POST /api/templates`. A reviewer can confirm this because that form uses `buildTemplateTeamField` + `resolveTemplateTeamId` (aliases of the shared helpers) and the tests in criterion 1–3 cover those helpers.

5. Create survey from template (`CreateProjectFromTemplateForm`) and create template from survey (`CreateTemplateFromProjectForm`) use the same required select and the same permission-gated “No team” option. Clearing the field to empty is not available (`clearable` is false). A reviewer can confirm `buildTeamField({canCreateGlobally: true})` has `clearable: false` (or no clear button) and `schema.safeParse(undefined)` is false.

6. When create-from-template defaults to the template’s `ownedByTeamId` via `defaultTeamFromOwner`, submitting without changing the team still posts that team id. To create unowned, the user must change the select to “No team”. A reviewer can confirm the default value is the owner team id (not the sentinel) and `resolveTeamId` still maps the sentinel to `undefined`.

7. Team-tab create (`specifiedTeam` set on `CreateProjectDialog` / `CreateTemplateDialog`, used from `team-projects.tsx` / `team-templates.tsx`) still does not show a team picker and does not offer “No team”. Submit still sends that `specifiedTeam`. A reviewer can confirm `getTeamFieldState({specifiedTeam: '…'})` has `showTeamDropdown: false` and `resolveTeamId` returns `specifiedTeam`.

8. An in-team-only user with exactly one eligible team still sees `TemplateOwnerCallout` (no dropdown, no “No team”) and submit still uses that team. A reviewer can confirm existing `getTeamFieldState` callout behaviour plus `resolveTeamId` returning `possibleTeams[0]._id`.

9. A global creator with zero eligible teams still sees a required team select whose options are only “No team”; they cannot submit without selecting it. A reviewer can confirm `getTeamFieldState` shows the dropdown when `canCreateGlobally` is true even if `possibleTeams` is empty, and `buildTeamField` includes the sentinel option.

10. Visible copy no longer tells the user the team field is optional or to leave it blank / clear it to create outside a team. Labels do not append `(optional)`. A reviewer can confirm `buildTeamField` / `buildTemplateTeamField` / `CreateProjectFromTemplateForm` team `label` and `description` strings in the diff.

11. `CreateProjectForm` filters teams with `getPossibleTeamsForAction` (`CREATE_PROJECT_IN_TEAM`) the same way the other create forms do, instead of listing every team from `useGetTeams`. A reviewer can confirm the form imports that helper and no longer maps `teams?.teams` unfiltered into the select.

## Out of scope

- API schema or permission-model changes (`PostCreateNotebookInput`, `PostCreateTemplateInput`, `Action.CREATE_*`, role grants). Unowned create remains legal for global creators who send no `teamId`.
- Map-layer upload (`create-map-layer-form.tsx`), team create, invites, changing a resource’s team after create (`PUT …/team`), or public-template visibility.
- Data-collection app (`@faims3/app`) and Designer field editors.
- Changing which users receive `GENERAL_CREATOR` / `CREATE_PROJECT` / `CREATE_TEMPLATE`.
- Auto-picking the user’s “home” team on the global lists (no first-team default unless a caller already passes `defaultValues.teamId`).
- New browser e2e. Existing team-tab e2e (`e2e/test/specs/web/templates-create.e2e.ts`) should keep passing because that path uses `specifiedTeam`.
- Forcing a one-option dropdown on in-team-only users who already get the single-team callout.

## Test plan

Check: code

This change is create-path permission UX (required field, gated option, `teamId` resolution). Automated tests are required. No browser session.

- Extend `web/src/components/forms/template-team-field.test.ts` (today it still asserts a Super User can leave team blank). Cover:
  - required schema for both `canCreateGlobally` true and false (`safeParse(undefined)` fails; a real team id passes);
  - “No team” option present iff `canCreateGlobally`;
  - `clearable` is false;
  - `resolveTeamId` maps the sentinel to `undefined`, a team id through, `specifiedTeam` first, and the single in-team option when there is no global create;
  - `getTeamFieldState` shows a dropdown for a global creator with zero teams, hides it when `specifiedTeam` is set, and still uses the callout for one in-team-only team.
- If `CreateProjectForm` stays on a local field for any reason, add a focused test for that field’s schema and options; prefer not needing that by using the shared builder.
- Commands:
  - `pnpm --filter=@faims3/web exec vitest --run src/components/forms/template-team-field.test.ts`
  - Existing API coverage is already enough for unowned vs teamed create (`api/test/teamIntegration.test.ts` “creates templates/projects with and without teamId”); do not require new API tests unless the POST body shape changes.
- Manual note (does not replace vitest): as a `GENERAL_CREATOR` on `/projects` and `/templates`, confirm submit is blocked until a team or “No team” is chosen; as a team manager on a team tab, confirm the picker is absent and create still lands in that team.

## Risk class and why

**Med.** The API still enforces `CREATE_PROJECT` / `CREATE_TEMPLATE` when `teamId` is omitted, so a leaked “No team” option should 403 rather than silently grant unowned create. The user-visible change is still on every survey/template create path, including `CreateProjectForm`, which does not use the shared helper today. A bad sentinel (empty string, or sending the sentinel as `teamId`) can block create or 400 the API. A helper change that is not parameterized can also alter map-layer upload. That is more than **low** copy/layout; it is not **high** because server authorisation and resource records are unchanged.

## Open questions

- Exact option label: default to `No team` as in the issue. `Outside any team` is acceptable if it matches surrounding copy; keep the test id stable either way.
- Should map-layer upload get the same required “No team” select in a follow-up? Default for this issue: no; keep current optional-blank behaviour there.
- Create-from-template currently preselects the template’s team. Default: keep that preselect (it is a real team, not unowned). Confirm if product would rather start empty there too.
- In-team-only users with several teams already have a required select and no blank option. No copy change required beyond dropping any leftover “optional” wording if present.
