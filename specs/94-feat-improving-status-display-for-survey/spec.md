# Improving status display for surveys in Control Centre

Issue: [#94](https://github.com/PeterBaker0/FAIMS3/issues/94)

Proposed size: **s**. Pull-request breakdown is left to the planner.

## 1. Problem

The Control Centre survey listing (`web/src/components/tables/projects.tsx`)
does not show whether a survey is **Open** or **Closed**. Operators have to
open the row and read Actions (or Details) to learn the lifecycle state.

That listing already receives `status` on each
`GetNotebookListWithStatsResponse` row (`ProjectStatus.OPEN` /
`ProjectStatus.CLOSED`). The column set is reused on:

- `/projects` (default list; archived rows are excluded)
- a team’s surveys tab (`web/src/components/tabs/teams/team-projects.tsx`)
- a template’s derived surveys tab
  (`web/src/components/tabs/templates/projects.tsx`)
- map-layer linked / available surveys
  (`web/src/components/tabs/map-layers/linked-surveys.tsx`)

Open/close meaning and colour already exist on the survey Actions card
(`web/src/components/dialogs/change-project-status-dialog.tsx`): Open is
the success/active treatment; Closed is destructive/read-only. Details
uses a different treatment (`statusDisplay` in
`web/src/lib/status-display.tsx`: green dot + “Open”, muted dot +
“Closed”) and is not this table.

## 2. Constraints

- Add one **narrow** Status column to the shared survey table in
  `web/src/components/tables/projects.tsx` so every surface that imports
  `columns` gets the chip. Prefer placing it immediately after **Name**.
  Size it to the chip (header + cell `meta` width, same idea as the
  archived-projects action columns or the map-layer Status chip), not as
  a wide text column.
- Chip labels: **Open** and **Closed**, matching the Actions “Current
  status” labels. Use `config.notebookName` /
  `config.notebookNameCapitalized` in tooltip copy; do not hardcode
  “survey” or “project”.
- Theme colours (CSS variables, not one-off emerald/gray):
  - Open: success (`border-success/40 bg-success/10 text-success`), same
    family as the map-layer Ready chip in
    `web/src/components/tables/map-layer-status.tsx`.
  - Closed: destructive (`border-destructive/40 bg-destructive/10
    text-destructive`), same family as the Close control on Actions.
  Render with the existing `Badge` outline chip pattern (or equivalent
  `RoleCard` only if it can take those theme classes). Do not use the
  muted Closed colour from `statusDisplay`.
- Hover (and keyboard focus) tooltip explaining the state. Reuse the
  Actions info-dialog sentences, which are already display wording:

  - Open: `{notebookNameCapitalized} is active and available for data
    collection on user devices.`
  - Closed: `{notebookNameCapitalized} is read-only. Users will not be
    able to activate this {notebookName} for data collection.`

  Do not use the Close confirmation bullets (“Yes, Close…”) or the
  Reopen button title as the tooltip; those are action copy.
- Extract label / colour / tooltip mapping into a small helper (same
  shape as `mapLayerStatusLabel`) so the table cell stays thin and the
  strings are unit-testable. `accessorFn` must return the visible label
  (`Open` / `Closed`) so table search finds those words, not raw
  `OPEN` / `CLOSED`.
- Chips are informational only. Do not toggle status from the listing.
  Row click still navigates to the survey. Tooltip / chip click must not
  swallow that navigation except where a table already stops propagation
  for a dedicated action column.
- Default `/projects` and team lists omit archived notebooks. The
  map-layer linked table can include `ARCHIVED` rows. Those rows must not
  render as Open or Closed: show a distinct **Archived** chip (warning or
  muted/amber, consistent with `statusDisplay` Archived) with a short
  info tooltip that the survey is archived and hidden from default lists.
  Do not invent open/close action wording for archive.
- Do not change the status API, permissions, open/close/archive dialogs,
  or `statusDisplay` on Details / team details.

## 3. Acceptance criteria

1. The shared survey table (`columns` in
   `web/src/components/tables/projects.tsx`) includes a Status column
   whose header title is `Status`, placed immediately after Name, with
   column `meta` width classes that keep it narrower than Name, Team, or
   Description.
2. A row with `status === ProjectStatus.OPEN` shows a chip whose
   accessible/visible text is `Open` and whose classes include the
   success chip tokens (`border-success/40`, `bg-success/10`,
   `text-success`).
3. A row with `status === ProjectStatus.CLOSED` shows a chip whose
   accessible/visible text is `Closed` and whose classes include the
   destructive chip tokens (`border-destructive/40`,
   `bg-destructive/10`, `text-destructive`).
4. Hovering or focusing the Open chip shows a tooltip whose text is
   exactly `{config.notebookNameCapitalized} is active and available for
   data collection on user devices.`
5. Hovering or focusing the Closed chip shows a tooltip whose text is
   exactly `{config.notebookNameCapitalized} is read-only. Users will not
   be able to activate this {config.notebookName} for data collection.`
6. A row with `status === ProjectStatus.ARCHIVED` shows an **Archived**
   chip (not Open, not Closed) and a tooltip that states the survey is
   archived and hidden from default lists.
7. The Status column `accessorFn` (or equivalent) returns the visible
   label (`Open` / `Closed` / `Archived`) so the existing DataTable
   global filter matches those words.
8. Product source for this issue is limited to the shared survey Status
   column (plus its helper/tests). Open/close dialogs, Details
   `statusDisplay`, the archived-projects Status text column, and the
   notebooks status API stay unchanged.

## 4. Out of scope

- Making the chip an open/close control or adding status filters.
- Restyling Details / team-details `statusDisplay` to chips.
- Changing `web/src/components/tables/archived-projects.tsx` (it already
  has a Status column with plain text).
- New colours, a new Badge variant, or a design-system chip primitive
  beyond composing existing `Badge` + `Tooltip`.
- API, Couch, permissions, or lifecycle transition changes.
- New browser e2e. Existing project-list and close/reopen e2e do not
  assert listing status.

## 5. Test plan

Check: code

Automated (required) — `pnpm --filter=@faims3/web exec vitest --run`:

1. Unit-test the Status helper (new file next to the chip, same style as
   `web/src/components/tables/map-layer-status.test.ts`): `OPEN` → label
   `Open` and the Open tooltip string; `CLOSED` → `Closed` and the Closed
   tooltip string; `ARCHIVED` → `Archived` and not the Open/Closed
   strings. Assert the success vs destructive class names from criteria
   2–3 (and that Archived is neither).
2. If the column is assembled from that helper, no extra table render
   test is required. If mapping is inlined in the cell, render the cell
   (or a thin extract) instead of the helper.

Named manual check (optional; not a browser session for sign-off):

3. On `/projects`, confirm the Status column sits after Name and does
   not crowd Description; Open is green/success, Closed is
   red/destructive.

No new e2e. Existing `e2e/test/specs/smoke/web-projects-list.e2e.ts` and
`e2e/test/specs/web/project-status-archive.e2e.ts` should still pass.

## 6. Risk class and why

**Low.** Display-only column on an existing listing that already has
`status` in the payload. No persistence, sync, auth, or lifecycle
mutation. Residual risk is showing the wrong colour/copy on Closed vs
Archived, or a wide column crowding the table; both are covered by the
helper tests and the width constraint. Size **s**.

## 7. Open questions

None. Chip colours follow the Actions open/close treatment (success vs
destructive), tooltip copy is the Actions info-dialog wording, and
Archived is specified only so reused tables cannot mislabel those rows.
