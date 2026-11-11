# Spec: consistent close-icon position in chained dialogs

Issue: #112
Package: `@faims3/forms` (consumed by App)

## Problem

Opening advanced help on a field, then tapping an image in that help, stacks two dialogs whose close controls sit on opposite sides.

- The advanced helper dialog in `library/forms/lib/fieldRegistry/fields/wrappers/FieldWrapper.tsx` puts its close `IconButton` on the **trailing/right** edge of `DialogTitle`.
- `PhotoLightbox` (`library/forms/lib/components/PhotoLightbox.tsx`) puts its close `IconButton` at `left: 16`, below the app-bar offset (`top: max(56px, env(safe-area-inset-top, 0px) + 48px)`).

The close control therefore jumps from right to left when the lightbox opens on top of help. Other App dialogs already use top-right (`FaimsDialog` `.faims-dialogCloseButton`, attachment manager, sync-mode help). The lightbox is the outlier.

## Constraints

- Change the chained pair only as needed: FieldWrapper advanced helper dialog and `PhotoLightbox`. Prefer moving the lightbox close to **top-right** so it matches the helper dialog and existing App dialog convention. Do not flip the helper dialog to top-left.
- `PhotoLightbox` is shared (TakePhoto edit/view, Quick Share QR, advanced-help images). Update its close position in that one component. Do not add a per-caller position prop unless a later exception is documented here.
- Keep close **behavior**: lightbox `onClose` / background tap (including pan-suppressed close) and helper-dialog `onClose` stay as they are. Closing the lightbox must not close the helper dialog underneath.
- Keep the lightbox close tappable above the zoom/pan surface (existing `zIndex`) and keep a safe-area / notched-device top offset so it is not under the status bar.
- Matching **corner** (top-right) is the goal. Do not require matching pixel Y offset, icon size, or fill between the paper helper dialog and the fullscreen lightbox.
- Do not extract a new shared dialog primitive for this.

## Acceptance criteria

1. In `FieldWrapper`’s advanced helper `Dialog`, the close control remains on the trailing/right edge of the title row (visible in the diff: title-row flex with the `IconButton` after the heading, or equivalent `right` positioning).
2. In `PhotoLightbox`, the close `IconButton` is positioned on the trailing/right edge (`right` instead of `left` in its `sx`). Reviewer confirms this in the `PhotoLightbox.tsx` diff.
3. Named manual check **Chained close corner**: on a record field whose advanced helper text includes an image, open Advanced Help and confirm the close control is top-right; tap the image; confirm the lightbox close control is also top-right.
4. Named manual check **Lightbox does not dismiss help**: from that stacked state, activate the lightbox close; the lightbox closes and the advanced helper dialog is still open with its close control still top-right.
5. TakePhoto and Quick Share keep a working lightbox close in that same top-right position, because they render the same `PhotoLightbox` with no position override (visible as a single `sx` change in `PhotoLightbox.tsx`, no new caller props).
6. The lightbox close still sits above the transform/zoom surface (`zIndex` at least as high as today) and still `stopPropagation`s its click so it does not also fire background-dismiss twice.

## Out of scope

- Map fullscreen close (`FullscreenControl` / `useMapFullscreen`).
- Restyling `FaimsDialog`, sync-mode help, or the attachment-manager dialog.
- Matching close-button size, color, padding, or shadow between helper and lightbox.
- Changing lightbox zoom, pan, pinch, double-tap reset, or tap-outside-to-close.
- New unit or e2e tests.
- Control Centre / Designer chrome that is not this FieldWrapper → PhotoLightbox chain.
- RTL/logical-property work (`insetInlineEnd`); physical `right` matching the rest of App dialogs is enough.

## Test plan

Check: code

This is a small icon-position change. Do not add automated tests.

Reviewer checks the diff:

- `PhotoLightbox.tsx` close `sx` uses `right` (not `left`).
- `FieldWrapper.tsx` helper close stays on the title-row trailing edge.
- No new `PhotoLightbox` position prop on TakePhoto or Quick Share.

Named manual checks (only if the reviewer wants a runtime glance): **Chained close corner** and **Lightbox does not dismiss help** from acceptance criteria 3 and 4.

Existing `FieldWrapper` unit tests (`pnpm --filter=@faims3/forms exec vitest --run lib/fieldRegistry/fields/wrappers/FieldWrapper.test.tsx`) should still pass; they do not cover close-button coordinates and do not need new cases.

## Risk class and why

**Low.** Layout-only change to close-button `sx` on a shared overlay. No data, API, permissions, or close-handler logic. Residual risk is a slightly worse overlap with a right-aligned image or a missed safe-area on a notched device; both are visual and easy to revert.

## Open questions

1. If a notched device needs a different right inset than `16px` (mirroring today’s `left: 16`), should implementers add `env(safe-area-inset-right)` on the lightbox close, or keep the current 16px horizontal inset used on the left?
2. Should the lightbox comment “visible below the app bar” / “floating close button (top-left)” be updated in the same change? (Recommended: yes, keep comments accurate; not a product behavior question.)
