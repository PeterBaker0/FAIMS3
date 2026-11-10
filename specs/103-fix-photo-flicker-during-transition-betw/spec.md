# Spec: fix photo flicker during pending-to-loaded thumbnail transition

Issue: [#103](https://github.com/PeterBaker0/FAIMS3/issues/103)

## 1. Problem

In the Take Photo field editor (`library/forms/lib/fieldRegistry/fields/TakePhoto/index.tsx`), a newly captured or gallery-picked photo is shown first as an optimistic pending preview (`PendingPhotoItem`, `alt="Saving photo..."`). After `addAttachment` returns an id, `useAttachments` starts loading that same resource and `PhotoGallery` also renders a loaded-side tile (`LoadingImagePlaceholder` while `photo.data` is missing, then `PhotoItem`).

`PhotoGallery` already tries to skip a loaded tile when `photo.data.id` is in the pending map. That skip does not apply while the query is still loading (`photo.data` is undefined), so for a brief interval both the pending preview and a second tile for the same attachment are in the grid. The extra tile causes a rapid layout shift (grid reflow plus the "Uploaded photos (N)" count jumping up, then back down when the pending entry is dropped).

The required outcome is that there is only ever one thumbnail tile per photo resource, including during the pending → stored → loaded hand-off.

## 2. Constraints

- Change the Take Photo **editor** gallery only. Do not change capture, PouchDB save, geotag/EXIF, capacity counting (`getOccupiedPhotoCount`), form lock, or delete/confirm behaviour.
- Keep an optimistic preview so the user still sees a thumbnail immediately after capture or gallery pick. Do not leave a gap (empty cell or missing tile) between "saving" and "loaded".
- The single-tile rule is per resource: a pending preview that later receives `attachmentId` is the same resource as the `useAttachments` result for that id. Distinct photos in a batch must each keep their own tile.
- Already-saved photos that are still downloading when a record is reopened may continue to use `LoadingImagePlaceholder` / `UnavailableImagePlaceholder` as the **only** tile for that attachment. Those placeholders must not be added beside an existing pending preview of the same id.
- Prefer a stable React identity across the hand-off so the remaining tile does not remount into a flash of empty content. Do not require a visual cross-fade or animation.
- Existing Take Photo tests in `library/forms/lib/fieldRegistry/fields/TakePhoto/TakePhoto.test.tsx` must keep passing.

## 3. Acceptance criteria

1. After a camera or gallery save returns an attachment id and while `useAttachments` for that id is still in flight, the gallery DOM contains exactly one image-list tile for that photo (the pending preview), and does not also render a `LoadingImagePlaceholder` or a second `<img>` for it. Test: extend `TakePhoto.test.tsx` with a deferred `loadAttachmentAsBlob`; after `addAttachment` resolves and before the load resolves, `screen.getAllByRole('img')` (plus any loading placeholder if one is used as the sole tile) counts one tile for the new photo.

2. Once `loadAttachmentAsBlob` resolves, the gallery still shows exactly one tile for that photo, now the loaded thumbnail (`alt` matching `Photo ${filename}`, delete control present) and not the pending preview (`alt="Saving photo..."` gone for that photo). Test: same case, resolve the load, then `waitFor` the loaded alt text and assert a single matching `<img>`.

3. With at least one already-loaded photo in the field, capturing or picking another photo does not duplicate the existing photo's tile during the new photo's pending → loaded transition. Test: render with `withExistingPhoto: true` (or equivalent), add one new photo with a deferred load, and assert the existing `att-existing` thumbnail remains exactly once throughout.

4. For a batch of N gallery picks, the grid never shows more than N photo tiles plus the Camera/Gallery actions tile while any of those N are mid-transition. Test: pick two images with deferred loads; after both `addAttachment` calls resolve and before either load resolves, count pending/loaded `<img>` nodes and expect 2.

5. The "Uploaded photos (N)" / "Uploaded photos (N/max)" label equals the number of photo tiles actually rendered (pending, loading placeholder, or loaded) at every step of the transition, so the count does not jump N → N+1 → N for a single new photo. Test: assert the subtitle text against the counted tiles before save, while load is in flight, and after load completes.

6. Failed saves still drop the optimistic preview and do not leave a stuck tile or a loaded placeholder for an id that was never stored. Test: existing save-failure coverage, or a focused case where `addAttachment` rejects and the pending `alt="Saving photo..."` img is removed.

## 4. Out of scope

- Read-only / data-view `TakePhotoRender` (`library/forms/lib/rendering/fields/view/specialised/TakePhoto.tsx`) and Designer `TakePhotoField`.
- FileUploader, AudioRecorder, or other attachment galleries.
- Lightbox, delete-confirm copy, Camera/Gallery chrome, min/max validation copy, and web resize/JPEG fallback.
- Native-only camera, permission, or EXIF behaviour.
- New Playwright/browser e2e. The invariant is the number of tiles per resource, which component tests can assert.
- Visual polish beyond removing the duplicate tile (no required fade, skeleton, or spinner redesign).

## 5. Test plan

Check: code

This is a gallery merge / lifecycle logic change, not a styling-only tweak. Cover it in unit tests; do not add a browser e2e for the flicker.

- Add or extend cases in `library/forms/lib/fieldRegistry/fields/TakePhoto/TakePhoto.test.tsx` for acceptance criteria 1–6. Reuse the existing `renderTakePhoto` / `DeleteRaceHarness` helpers and deferred `addAttachment` pattern; stub `loadAttachmentAsBlob` so the pending → loading → loaded sequence can be paused.
- Run: `pnpm --filter=@faims3/forms exec vitest --run lib/fieldRegistry/fields/TakePhoto/TakePhoto.test.tsx`
- Also run the nearby form-manager photo suite so parallel gallery saves still behave: `pnpm --filter=@faims3/forms exec vitest --run lib/formModule/formManagers/parallelPhotoSave.test.tsx`
- No new screenshot or in-browser session. A reviewer confirms the criteria from the test names and the `PhotoGallery` merge in the diff.

## 6. Risk class and why

**Low.** The defect and the fix are local to how `PhotoGallery` unifies `pendingPhotos` with `useAttachments` results. Storage, sync, capacity, and delete paths stay as they are. The main regression to watch is rendering zero tiles for a photo during the hand-off, or hiding an unrelated loaded photo; the tests above catch both.

## 7. Open questions

- None. Reopened records with attachments still downloading should keep a single loading placeholder (existing behaviour). The issue is only the overlapping pending + loaded tiles for the same resource.

```json
{ "risk": "low", "size": "s", "check": "code" }
```
