# Consistent layout of action tabs, ordered by importance

Issue: [#100](https://github.com/PeterBaker0/FAIMS3/issues/100)

Proposed size: **s**. Pull-request breakdown is left to the planner.

## 1. Problem

Control Centre resource pages each have an **Actions** tab of carded
controls. Those tabs do not share a layout, and the survey tab puts the
primary design action in the middle of a long column with unclear copy.

There are three Actions tabs:

- Survey: `web/src/components/tabs/project/actions.tsx`
- Template: `web/src/components/tabs/templates/actions.tsx`
- Map layer: `web/src/components/tabs/map-layers/actions.tsx`

Template and map-layer Actions use a responsive CSS grid of cards.
Survey Actions uses a single full-width column
(`flex flex-col gap-2 justify-between`). The two grids are also not the
same: templates go to four columns at `xl`, map layers stop at three.

On the survey tab, “Edit {notebook} in Designer” is a common, crucial
action, but it is currently:

- below details, quick share, and (when developer mode is on) generate
  test records
- labelled `Edit {config.notebookNameCapitalized}` with a button
  `Open in Editor`, which is easy to confuse with **Edit details** and
  does not say that it opens the Designer

Destructive and advanced controls (close/reopen, archive, replace JSON,
generate test records) sit in the same visual stream as everyday edits.

## 2. Constraints

- Change only the three Control Centre Actions tabs listed above: wrapper
  layout, card DOM order, and the Designer card copy. Do not add, remove,
  or re-permission actions. Hidden cards (failed auth checks, developer
  mode off, in-progress map layer) must still not render; remaining cards
  pack into the grid with no empty reserved slots.
- Canonical layout is the template grid:
  `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4`.
  Put that class string (or a shared wrapper that applies it) on all
  three Actions roots. Do not keep the survey full-width column. Do not
  invent a new card size, featured/hero span, or colour to make Designer
  prominent — first grid cell plus clearer copy is enough.
- Use `config.notebookName` / `config.notebookNameCapitalized` in survey
  copy. Do not hardcode “survey” or “project”. Keep “Template” as the
  template noun (existing Actions copy already does).
- Designer card copy (visible when the user can update the UI spec):

  - Survey heading: `Edit {config.notebookNameCapitalized} in Designer`
  - Survey description: `Open the Designer to change forms and fields for this {config.notebookName}.`
  - Template heading: `Edit Template in Designer`
  - Template description: `Open the Designer to change this template.`
  - Button on both (including the saving spinner label’s idle state):
    `Open in Designer`

  Do not leave `Open in Editor` on these cards. Do not rename the
  Designer product elsewhere (dialog chrome, routes, docs).
- Relative order of **visible** cards, first to last in DOM (and so
  first to last in grid auto-flow):

  Survey:

  1. Edit in Designer
  2. Edit details
  3. Quick share
  4. Assign to a team
  5. Create template from this notebook
  6. Download JSON
  7. Replace JSON
  8. Generate test records (developer mode only)
  9. Close / reopen status
  10. Archive

  Template:

  1. Edit in Designer
  2. Create {notebook} from this template
  3. Edit template details
  4. Assign template to a team
  5. Download JSON
  6. Replace JSON
  7. Visibility
  8. Archive / un-archive

  Map layer (already this order; keep it):

  1. Edit details
  2. Replace file
  3. Delete

- Permission checks, dialogs, mutations, and testids already on these
  controls stay as they are (`web-project-quick-share`,
  `web-project-status-close`, `web-project-archive-button`, and so on).
  Drop leftover column-only classes such as `flex-1` on cards if they do
  nothing useful in the grid; do not restyle Card / List internals
  beyond what the grid needs.
- If the Designer button label changes, update
  `e2e/test/specs/web/designer-basic.e2e.ts` (it currently matches
  `button*=Editor`). Do not add new browser e2e for layout.

## 3. Acceptance criteria

1. The root of survey Actions, template Actions, and map-layer Actions
   each uses the responsive grid
   `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4` with
   `gap-4`. None of them uses a full-width `flex-col` stack of cards.
2. On survey Actions, when `Action.UPDATE_PROJECT_UISPEC` is allowed,
   the first `Card` heading is
   `Edit {config.notebookNameCapitalized} in Designer` and its idle
   button accessible name is `Open in Designer`.
3. That survey Designer card includes the description
   `Open the Designer to change forms and fields for this {config.notebookName}.`
4. On template Actions, when `Action.UPDATE_TEMPLATE_UISPEC` is allowed,
   the first `Card` heading is `Edit Template in Designer` and its idle
   button accessible name is `Open in Designer`.
5. For a user who can see every survey Actions card (including developer
   mode), DOM order of the cards is Designer, details, quick share,
   assign team, create template, download JSON, replace JSON, generate
   test records, close/reopen, archive.
6. For a user who can see every template Actions card, DOM order of the
   cards is Designer, create notebook, edit details, assign team,
   download JSON, replace JSON, visibility, archive.
7. Map-layer Actions cards stay in the order edit details, replace file,
   delete, with delete last.
8. A user without Designer permission does not see an empty first cell;
   the next allowed card occupies the first grid cell. Close, archive,
   replace JSON, generate test records, visibility, and delete never
   appear before the common edit/create/assign cards listed above when
   those common cards are visible.
9. Product source for this issue is limited to the three Actions tab
   files (plus a tiny shared grid wrapper if extracted) and the
   designer-basic e2e selector/copy if the button label changes. Dialogs,
   APIs, and permission hooks stay unchanged.

## 4. Out of scope

- New actions, removed actions, or permission changes.
- Restyling Card / Button variants, icons, or a featured Designer tile
  that spans columns.
- Renaming Designer in `DesignerDialog`, routes, or documentation.
- Teams, users, invites, export, or other Control Centre tabs that are
  not named Actions.
- New unit tests or new browser e2e. Layout and copy are checked from
  the diff and a named manual pass; existing Actions e2e keep covering
  close/archive/visibility/details.

## 5. Test plan

Check: code

Named manual check (required; no new automated tests — this is layout
and copy):

1. In Control Centre (`http://localhost:3001`), open a survey →
   **Actions**. Confirm a multi-column grid (two or more cards per row
   at a desktop width), not a single full-width column. Confirm the
   Designer card is first, reads `Edit … in Designer` /
   `Open in Designer`, and archive / close sit at the end of the grid.
2. Open a template → **Actions**. Same grid class behaviour. Designer
   card first with `Open in Designer`; archive last.
3. Open a map layer → **Actions**. Same grid; Delete remains last.

If the Designer button label changes, update
`e2e/test/specs/web/designer-basic.e2e.ts` so it finds
`Open in Designer` (or `button*=Designer`) instead of
`button*=Editor`. Existing
`e2e/test/specs/web/project-status-archive.e2e.ts`,
`e2e/test/specs/web/template-visibility-archive.e2e.ts`, and
`e2e/test/specs/web/project-edit-details-name-limit.e2e.ts` should still
pass (they use testids / other copy).

No new `vitest` file. Reviewer confirms criteria 1–8 from the Actions
tab JSX order and class names.

## 6. Risk class and why

**Low.** Presentation-only reorder and copy on three existing tabs. No
persistence, sync, auth, or API change. Residual risk is breaking the
designer e2e that matches `Editor`, or burying a destructive control if
order is wrong; both are covered by the copy constraint and the ordered
card lists. Size **s**.

## 7. Open questions

None. Grid comes from the template Actions tab. Designer is first on
survey and template because the issue calls that action out as the one
to promote. Wording uses “Designer” so it is distinct from Edit details
and from JSON replace.
