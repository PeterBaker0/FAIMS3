# Consistent close icons

Issue: [#52](https://github.com/PeterBaker0/FAIMS3/issues/52)

Proposed size: **s**. Pull-request breakdown is left to the planner.

## 1. Problem

In the data-collection App, two overlays that users open in the same flow
place their close control in opposite corners.

- Advanced helper text (`FieldWrapper` in `@faims3/forms`) opens a paper
  dialog. Its close `IconButton` (`aria-label="Close"`) is a trailing flex
  item in `DialogTitle`, so it sits in the **top-end** corner (top-right in
  LTR) of the paper.
- Clicking an image in that helper opens the shared `PhotoLightbox`. Its
  close `IconButton` (`aria-label="Close preview"`) is absolutely positioned
  with `left: 16` and
  `top: max(56px, env(safe-area-inset-top, 0px) + 48px)`, so it sits in the
  **top-start** corner (top-left in LTR), and lower than the helper close.

The same lightbox is used for Take Photo previews and the Quick Share QR
zoom. Those surfaces inherit the top-start close.

App dialogs otherwise place close on the top-end: `.faims-dialogCloseButton`
(`right: theme.spacing(1)`), `syncModeHelpDialog` (`right: 16, top: 16`),
and `Faims_Attachment_Manager_Dialog` (`right: 8, top: 8`). The lightbox is
the outlier.

## 2. Constraints

- Change close **position** only. Do not restyle size, colour, shadow, or
  icon glyph to match across the paper helper dialog and the full-screen
  dark overlay.
- Canonical corner is **top-end** (trailing in the current writing
  direction): the same corner the advanced-helper close already uses.
  Prefer a logical inset (`insetInlineEnd`) over a physical `right` so the
  control stays trailing in RTL.
- Keep the lightbox close tappable: not under the App app bar, Capacitor
  status bar, notch, or other system chrome. Safe-area inset on the
  trailing and top edges is required. Extra top offset is allowed only if
  needed to stay clear of chrome; it must not be a reason to keep the
  control on the start/left side.
- Prefer a `PhotoLightbox` change so Take Photo and Quick Share pick up the
  same corner. Edit `FieldWrapper` only if the helper close is no longer
  top-end after that.
- Stay inside `@faims3/forms` close controls used by the App for these two
  overlays. Do not introduce a new shared close-button component unless it
  is the smallest way to keep the two corners aligned.
- Preserve existing close behaviour: the labelled button still dismisses
  the overlay; Escape, backdrop/outside tap, and the lightbox rule that
  pan-then-release must not close stay as they are. Do not add tests for
  those existing paths.
- Do not change Control Centre / Designer close buttons.

## 3. Acceptance criteria

1. With `PhotoLightbox` open, the control named `Close preview` is in the
   top-end corner of the full-screen overlay (trailing edge in LTR), not
   the top-start / left edge.
2. With the advanced-helper dialog open, the control named `Close` remains
   in the top-end corner of the dialog paper (trailing edge of the title
   row in LTR).
3. Activating `Close preview` still dismisses the lightbox. Activating
   `Close` still dismisses the advanced-helper dialog.

## 4. Out of scope

- Matching close **size**, colour, or elevation between the paper helper
  and the dark lightbox.
- Renaming accessible labels (`Close` vs `Close preview`).
- Map fullscreen, attachment-manager, Quick Share parent dialog, sync-mode
  help, or other App dialogs except insofar as they already use
  `PhotoLightbox`.
- A design-system close-button extraction and RTL-only restyles beyond
  using the top-end/trailing corner.
- New browser e2e, a helper-image click-to-zoom integration test, Take
  Photo / Quick Share surface tests, safe-area env stubs, and regression
  tests for Escape, backdrop tap, or pan-then-release. Those paths are
  unchanged.

## 5. Test plan

Keep this small: one position assertion, plus the existing forms suite.

1. `@faims3/forms` vitest (`pnpm --filter=@faims3/forms exec vitest --run`):
   render `PhotoLightbox` and assert
   `getByRole('button', {name: 'Close preview'})` is on the trailing /
   top-end edge (`insetInlineEnd` or `right`, not `left: 16`).
2. Confirm the existing `FieldWrapper` tests still pass (helper `Close`
   remains on the trailing title edge; no new helper test required).
3. No new e2e. A manual glance in the App is optional, not required.

## 6. Risk class and why

**Low.** Layout of an existing close `IconButton` on a shared overlay. No
persistence, sync, auth, or form-data change. Residual risk is hiding the
control under native chrome; that stays a constraint, not an extra test
matrix. Size **s**.

## 7. Open questions

None. Top-end is the App dialog convention and matches the advanced-helper
control already on screen when the lightbox opens.
