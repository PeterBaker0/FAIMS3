# Fix close icon consistency

Issue: [#39](https://github.com/PeterBaker0/FAIMS3/issues/39)

Proposed size: **s**. Pull-request breakdown is left to the planner.

## 1. Problem

In the data-collection App, the close control sits in different corners on two overlays that users open in one flow.

- Advanced helper text (`FieldWrapper` in `@faims3/forms`) opens a paper dialog. Its close `IconButton` (`aria-label="Close"`) is a trailing flex item in `DialogTitle`, so it sits in the **top-end** (top-right in LTR) of the paper.
- Clicking an image in that helper opens the shared `PhotoLightbox`. Its close `IconButton` (`aria-label="Close preview"`) is absolutely positioned with `left: 16` and `top: max(56px, env(safe-area-inset-top, 0px) + 48px)`, so it sits in the **top-start** (top-left in LTR), lower than the helper close.

The same lightbox is used for Take Photo previews and the Quick Share QR zoom. Those surfaces inherit the top-start close.

App dialogs otherwise place close on the top-end (for example `.faims-dialogCloseButton`, `syncModeHelpDialog`, `Faims_Attachment_Manager_Dialog`). The lightbox is the outlier.

## 2. Constraints

- Change close **position** only. Do not restyle size, colour, shadow, or icon to match across the paper dialog and the full-screen dark overlay.
- Canonical corner is **top-end** (trailing in the current writing direction): the same corner the advanced-helper close already uses.
- Keep both controls tappable: not under the App app bar, Capacitor status bar, notch, or other system chrome. Safe-area inset on the trailing and top edges is required. Extra top offset is allowed only if needed to stay clear of chrome; it must not be a reason to keep the control on the start/left side.
- Prefer a `PhotoLightbox` change so Take Photo and Quick Share pick up the same corner. Edit `FieldWrapper` only if the helper close is no longer top-end after that.
- Stay inside `@faims3/forms` close controls used by the App for these two overlays. Do not introduce a new shared close-button component unless it is the smallest way to keep the two corners aligned.
- Preserve existing close behaviour: the labelled button still dismisses the overlay; Escape, backdrop/outside tap, and pan-then-release-must-not-close on the lightbox stay as they are.
- Do not change Control Centre / Designer close buttons.

## 3. Acceptance criteria

1. With the advanced-helper dialog open, the control named `Close` is in the top-end corner of the dialog paper (trailing edge of the title row in LTR).
2. With `PhotoLightbox` open, the control named `Close preview` is in the top-end corner of the full-screen overlay (trailing edge in LTR), not the top-start / left edge.
3. Opening an image from advanced helper, then comparing the two overlays, both close controls occupy the top-end corner of their respective surfaces.
4. The lightbox close remains fully visible and tappable on a narrow viewport and with a non-zero `env(safe-area-inset-top)` / `env(safe-area-inset-right)` (or equivalent test stub). It is not clipped by the overlay and not covered by the App app bar.
5. Activating `Close` dismisses the advanced-helper dialog. Activating `Close preview` dismisses the lightbox. Helper image zoom still returns to the helper dialog when the lightbox closes.
6. Take Photo and Quick Share lightbox instances use the same top-end close position, via the shared `PhotoLightbox` control.
7. Keyboard and pointer close paths that already exist (Escape, labelled button, lightbox backdrop tap when the user did not just pan) still dismiss the overlay. Pan-then-release on a zoomed lightbox still does not close it.
8. Product source changes for this issue are limited to the forms/App close-position fix and tests for it. No Designer, API, or unrelated dialog churn.

## 4. Out of scope

- Matching close **size**, colour, or elevation between the paper helper and the dark lightbox.
- Renaming accessible labels (`Close` vs `Close preview`).
- Map fullscreen, attachment-manager, Quick Share parent dialog, sync-mode help, or other App dialogs except insofar as they already use `PhotoLightbox`.
- A design-system close-button extraction, RTL-only restyles beyond using the top-end/trailing corner, and new browser e2e coverage (unit/component tests in `@faims3/forms` are enough).

## 5. Test plan

1. `@faims3/forms` vitest (`pnpm --filter=@faims3/forms exec vitest --run`): render `FieldWrapper` with advanced helper text, open the helper, assert `getByRole('button', {name: 'Close'})` is present and on the trailing side of the title (DOM order / computed `insetInlineEnd` or equivalent, not `left`).
2. Render `PhotoLightbox` and assert `getByRole('button', {name: 'Close preview'})` is positioned on the trailing / top-end edge (`insetInlineEnd` or `right`, not `left: 16`).
3. Click-to-zoom path: helper with an `<img>`, open helper, click the image, assert the lightbox close is top-end; activate it and assert the helper dialog is still open.
4. Activate each labelled close control and assert the overlay unmounts.
5. Manual in the App (`http://localhost:3000`): open a record field with advanced helper text, confirm the helper close is top-end; zoom an embedded image and confirm the lightbox close is the same corner and tappable below any app-bar / safe-area chrome. Spot-check Take Photo and Quick Share lightbox.

## 6. Risk class and why

**Low.** Layout of an existing close `IconButton` on a shared overlay. No persistence, sync, auth, or form-data change. Residual risk is hiding the control under native chrome or covering a corner of a full-bleed image; both are checkable in the tests above. Size **s**.

## 7. Open questions

None. Top-end is the App dialog convention and matches the advanced-helper control already on screen when the lightbox opens.
