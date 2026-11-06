# Simplify wording for device sync

Issue: [#55](https://github.com/PeterBaker0/FAIMS3/issues/55)

Proposed size: **s**. Pull-request breakdown is left to the planner.

## 1. Problem

On the data-collection App notebook **SETTINGS** tab, the **Get attachments from other devices** panel explains the toggle with this helper (`app/src/gui/components/notebook/settings/index.tsx`, shown when pull sync is enabled):

> This control is app and device specific. If this option is enabled, Fieldmark™ will automatically download and show images and attachments created by other devices. Be aware that this may be resource intensive and use your mobile data plan. Disable this setting to minimise network usage. This setting will not affect uploading of your data from this device to the central server. Attachments are always uploaded to the server regardless of this setting.

That is five overlapping sentences (~86 words) on a mobile settings card. Field users have to parse the same trade-off twice (resource cost, then “disable to minimise network usage”) and the same upload guarantee twice. The product name is also hardcoded as `Fieldmark™`, which is wrong for white-label builds.

The heading, On/Off labels, disabled-state helper, snackbar, and toggle behaviour are not the complaint. The verbose enabled helper is.

## 2. Constraints

- Change **copy only** on that Settings helper. Do not change `isSyncingAttachments`, `startSyncingAttachments`, `stopSyncingAttachments`, when the switch is disabled, or what downloads when it is on.
- Keep the heading **Get attachments from other devices**, the **On** / **Off** labels, the snackbar **Downloading attachments to device...**, and the pull-disabled helper **Attachment download requires two-way sync. Change sync mode above to enable this option.**
- Replace the enabled helper with this exact string (26 words):

  `Applies to this device only. When on, photos and attachments from other devices download here. Uses extra storage and mobile data. Your own attachments still upload.`

  That keeps the four facts the old paragraph tried to say: the setting is local to this device; on means others’ photos/attachments download here; that costs storage and mobile data; uploads from this device still happen.
- Do not hardcode `Fieldmark`, `Fieldmark™`, or `FAIMS`. This helper does not need a product name (nearby Settings copy uses `config.notebookName` only where the notebook noun is required).
- Do not add i18n, a help dialog, or a new Settings layout. Stay on the existing `Typography variant="body2"` under the switch.
- User docs already paraphrase this control (`docs/user/core/synchronisation.md`, `docs/user/authoring/first-notebook-tutorial.md`) and do not quote the verbose string. Do not rewrite them in this change.

Rejected alternatives (do not use):

- Ultra-short “Download photos from other devices. Uses extra data.” — drops device-local and the upload guarantee.
- Keeping `Fieldmark™ will automatically download and show…` and only deleting the last two sentences — still verbose, still branded.

## 3. Acceptance criteria

1. With an activated notebook whose sync mode includes pull (`Upload and download` / `syncMode === 'both'`), the **Get attachments from other devices** panel shows the helper exactly: `Applies to this device only. When on, photos and attachments from other devices download here. Uses extra storage and mobile data. Your own attachments still upload.`
2. That same panel does not contain the old sentences, including `This control is app and device specific`, `Fieldmark™`, `resource intensive`, `minimise network usage`, or `This setting will not affect uploading`.
3. With sync mode **Upload only** or **Sync off** (no pull), the switch stays disabled and the helper is still `Attachment download requires two-way sync. Change sync mode above to enable this option.`
4. The panel heading is still **Get attachments from other devices**. The switch label is still **On** when `isSyncingAttachments` is true and **Off** when it is false.
5. Turning the switch on still dispatches `startSyncingAttachments` and still shows the success alert `Downloading attachments to device...`. Turning it off still dispatches `stopSyncingAttachments`.
6. Product source changes for this issue are limited to that Settings helper string and tests for it. No sync-engine, API, Designer, or user-docs churn.

## 4. Out of scope

- Default for `isSyncingAttachments` (stays off).
- Attachment download / upload implementation, Couch sync, or storage quotas.
- Sync Mode labels, help dialog, or the extra “Attachment download requires two-way sync.” suffix on the Sync Mode helper.
- Control Centre / Designer.
- User documentation, screenshots, and e2e copy assertions (existing `e2e/test/specs/app/sync-settings.e2e.ts` does not read this helper).
- Renaming the heading or the On/Off labels.
- A translation system.

## 5. Test plan

Automated (`pnpm --filter=@faims3/app test`):

1. Render the notebook Settings panel (`NotebookSettings` in `app/src/gui/components/notebook/settings/index.tsx`, or a thin extract of its helper) with an activated project and `syncMode: 'both'`. Assert `getByText` (or equivalent) finds the new enabled helper and does not find `Fieldmark™` or `This control is app and device specific`.
2. Re-render with `syncMode: 'push'` (and optionally `'none'`). Assert the disabled helper, and that the attachment switch is disabled.
3. With pull enabled, toggle the switch on then off. Assert `startSyncingAttachments` then `stopSyncingAttachments` were dispatched, and that enabling it dispatched `addAlert` with `Downloading attachments to device...`.

Follow the existing Settings test harness style in `app/src/gui/components/notebook/settings/contextualLayerSettings.test.tsx` (mock store / router; do not boot CouchDB).

Manual:

4. In the App (`http://localhost:3000`), open an activated notebook → **SETTINGS**. Confirm the attachment panel reads in one glance on a narrow viewport. Switch Sync Mode away from **Upload and download** and confirm the existing disabled helper still appears.

## 6. Risk class and why

**Low.** One helper string on an existing Settings card. No persistence, sync, auth, or download-path change. Residual risk is field users missing the “uploads still happen” note if copy is cut further; the chosen string keeps that sentence. Size **s**.

## 7. Open questions

None. The issue asked for shorter alternatives; this spec picks the 26-word helper above so implementation is not blocked on copy review.
