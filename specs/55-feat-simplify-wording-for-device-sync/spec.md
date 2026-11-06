# Simplify wording for device sync

Issue: [#55](https://github.com/PeterBaker0/FAIMS3/issues/55)

Proposed size: **s**. Pull-request breakdown is left to the planner.

## 1. Problem

On the data-collection App notebook **SETTINGS** tab, the attachment-download panel (`app/src/gui/components/notebook/settings/index.tsx`) uses this heading and, when pull sync is enabled, this helper:

> **Get attachments from other devices**
>
> This control is app and device specific. If this option is enabled, Fieldmark™ will automatically download and show images and attachments created by other devices. Be aware that this may be resource intensive and use your mobile data plan. Disable this setting to minimise network usage. This setting will not affect uploading of your data from this device to the central server. Attachments are always uploaded to the server regardless of this setting.

The helper is five overlapping sentences (~86 words) on a mobile settings card. It repeats the data-cost warning and the upload guarantee, and it hardcodes `Fieldmark™`. Issue #55 asked for shorter copy. Review chose a new title and subtext; those strings replace both the heading and the enabled helper.

## 2. Constraints

- Change **copy only**. Do not change `isSyncingAttachments`, `startSyncingAttachments`, `stopSyncingAttachments`, when the switch is disabled, or what downloads when it is on.
- Replace the existing `Typography` heading (`h6`) with this exact title, including the question mark:

  `Download attachments from other devices?`

- When pull sync is enabled (`syncMode` includes pull / **Upload and download**), replace the `body2` helper with this exact subtext:

  `Do you want to download attachments from other users' devices? Doing so will increase data usage and load on your device. We recommend leaving this off.`

- Do not add back the old upload-guarantee sentences, `Fieldmark™`, or the previous 26-word draft from the first spec revision. Review supplied the strings above.
- Keep the **On** / **Off** switch labels, the success alert **Downloading attachments to device...**, and the pull-disabled helper **Attachment download requires two-way sync. Change sync mode above to enable this option.** When pull is off, show that disabled helper instead of the new subtext (the switch still cannot be turned on).
- Keep the existing layout: heading, then switch, then helper. Do not add a dialog, extra buttons, or i18n.
- Do not hardcode `Fieldmark`, `Fieldmark™`, or `FAIMS` in this panel.
- User docs that name the old heading as the control (`docs/user/core/synchronisation.md`, `docs/user/authoring/first-notebook-tutorial.md`, including that tutorial screenshot’s `:alt:`) must use the new title so they still point at the Settings panel. Do not rewrite the rest of those pages or reshoot screenshot PNGs.

## 3. Acceptance criteria

1. On an activated notebook, the Settings attachment panel heading is exactly `Download attachments from other devices?` (question mark included). The old heading `Get attachments from other devices` is not shown.
2. When sync mode includes pull (`Upload and download` / `syncMode === 'both'`), the helper under the switch is exactly `Do you want to download attachments from other users' devices? Doing so will increase data usage and load on your device. We recommend leaving this off.`
3. That same panel does not contain `This control is app and device specific`, `Fieldmark™`, `resource intensive`, `minimise network usage`, `This setting will not affect uploading`, or `Applies to this device only`.
4. When sync mode is **Upload only** or **Sync off** (no pull), the switch is disabled and the helper is still `Attachment download requires two-way sync. Change sync mode above to enable this option.` The heading remains the new title from criterion 1.
5. The switch label is still **On** when `isSyncingAttachments` is true and **Off** when it is false.
6. Turning the switch on still dispatches `startSyncingAttachments` and still shows the success alert `Downloading attachments to device...`. Turning it off still dispatches `stopSyncingAttachments`. Default remains off.
7. `docs/user/core/synchronisation.md` and `docs/user/authoring/first-notebook-tutorial.md` (body and the settings-tab screenshot `:alt:`) name the control with the new title, not `Get attachments from other devices`.
8. Product source changes for this issue are limited to that Settings title/helper, the user-doc heading phrases in criterion 7, and tests. No sync-engine, API, or Designer churn.

## 4. Out of scope

- Default for `isSyncingAttachments` (stays off; the new subtext only recommends leaving it off).
- Attachment download / upload implementation, Couch sync, or storage quotas.
- Sync Mode labels, help dialog, or the extra “Attachment download requires two-way sync.” suffix on the Sync Mode helper.
- Control Centre / Designer.
- Reshooting screenshot PNG files. Browser e2e copy assertions (existing `e2e/test/specs/app/sync-settings.e2e.ts` does not read this helper).
- Changing the On/Off labels, the snackbar, or the pull-disabled helper.
- Restoring an explicit “uploads still happen” sentence (review omitted it).
- A translation system.

## 5. Test plan

Automated (`pnpm --filter=@faims3/app test`):

1. Render the notebook Settings panel (`NotebookSettings` in `app/src/gui/components/notebook/settings/index.tsx`) with an activated project and `syncMode: 'both'`. Assert the new title and the new enabled subtext. Assert the old heading and `Fieldmark™` / `This control is app and device specific` are absent.
2. Re-render with `syncMode: 'push'` (and optionally `'none'`). Assert the new title is still present, the switch is disabled, and the helper is the existing two-way-sync sentence.
3. With pull enabled, toggle the switch on then off. Assert `startSyncingAttachments` then `stopSyncingAttachments` were dispatched, and that enabling it dispatched `addAlert` with `Downloading attachments to device...`.

Follow the existing Settings test harness style in `app/src/gui/components/notebook/settings/contextualLayerSettings.test.tsx` (mock store / router; do not boot CouchDB).

Docs:

4. `rg 'Get attachments from other devices' docs/` returns no matches. `rg 'Download attachments from other devices\\?' docs/user` finds the control name in `synchronisation.md` and `first-notebook-tutorial.md`.

Manual:

5. In the App (`http://localhost:3000`), open an activated notebook → **SETTINGS**. Confirm the question title and three-sentence subtext read clearly on a narrow viewport. Switch Sync Mode away from **Upload and download** and confirm the existing disabled helper still appears under the new title.

## 6. Risk class and why

**Low.** Title and helper copy on an existing Settings card, plus matching the control name in two user-doc files. No persistence, sync, auth, or download-path change. Residual risks: screenshot PNGs will still show the old heading until a docs reshoot; the new subtext no longer says uploads are unaffected (review chose that). Size **s**.

## 7. Open questions

None. Review supplied the title and subtext; this spec uses those strings as-is.
