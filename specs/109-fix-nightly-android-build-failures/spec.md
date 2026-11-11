# Spec: fix nightly Android build failures (#109)

## Problem

Nightly Android CI fails in the first second of the reusable Android job, before Fastlane, Gradle, or Play upload run.

`nightly-android-testbuild.yml` calls `.github/workflows/common-android-build.yml`. That reusable workflow:

- runs on `ubuntu-latest`
- installs Ruby with `ruby/setup-ruby@v1` and `ruby-version: 3.3.1`
- uses that Ruby only to run Fastlane from `app/android`

GitHub-hosted `ubuntu-latest` now resolves to `ubuntu-26.04`. `ruby/setup-ruby` ships **only the latest patch of each Ruby series** on newer runner images. On `ubuntu-26.04` that is `3.3.13`, not `3.3.1`. The step 404s:

```
Unavailable version 3.3.1 for ruby on ubuntu-26.04
Only the latest patch release of each series is built for newer runner images.
ruby-3.3.13 is available on ubuntu-26.04: use ruby-version: '3.3.13', or '3.3'
```

`app/android/.ruby-version` is also `3.3.1`. The Android `Gemfile` does not pin a Ruby engine; Fastlane is the only gem.

The same reusable workflow is used by production Play deploys (`android-production-build.yml`), so those jobs fail the same way.

iOS is not failing this job (it runs on `macOS-latest`), but it uses the same stale pin: `.github/workflows/common-ios-build.yml` and `app/ios/App/.ruby-version` are both `3.3.1`.

## Constraints

- Fix the CI Ruby pin. Do not change Fastlane lanes, Play/App Store tracks, signing, Capacitor, Node, or JDK.
- Use MRI Ruby series **`3.3`** (`ruby-version: '3.3'`), which installs the latest 3.3.x patch `setup-ruby` publishes for the runner. Do not pin an exact patch (`3.3.1`, `3.3.13`) and do not jump to 3.4 or 4.x.
- Keep the existing workflow shape: leave the `ruby-version` input on `ruby/setup-ruby@v1` in both reusable mobile workflows. Do not switch those steps to "read `.ruby-version` only".
- Align versions across all four pins so they all say `3.3`:
  - `.github/workflows/common-android-build.yml`
  - `.github/workflows/common-ios-build.yml`
  - `app/android/.ruby-version`
  - `app/ios/App/.ruby-version`
- Do not pin `runs-on` to `ubuntu-24.04` (or older) solely to keep Ruby 3.3.1. That only delays the same failure.
- The Android change belongs in `common-android-build.yml` so nightly and production Android jobs both recover. Apply the same `3.3` pin in `common-ios-build.yml` in this change.
- Do not edit product source under `app/src`, `web/`, `api/`, or the shared libraries.

## Acceptance criteria

1. `.github/workflows/common-android-build.yml` sets `ruby-version` to `3.3` (quoted as needed for YAML) and no longer requests `3.3.1` or any other exact 3.3 patch. Verified by reading that file in the PR diff.
2. `.github/workflows/common-ios-build.yml` sets the same `ruby-version: '3.3'` (still as an explicit `setup-ruby` input, not omitted). Verified by reading that file in the PR diff.
3. `app/android/.ruby-version` and `app/ios/App/.ruby-version` both contain `3.3`, matching the two workflow inputs. Verified by diff of those four locations; a repo search for `3.3.1` under `.github/workflows/` and `**/.ruby-version` returns no mobile-build hits.
4. Both reusable workflows still pass `ruby-version` into `ruby/setup-ruby@v1` (they do not drop that input in favour of auto-detecting `.ruby-version`). Verified by reading the `Set up ruby env` steps.
5. A GitHub Actions run of **Nightly Android builds** (`nightly-android-testbuild.yml`, manual `workflow_dispatch` is enough) gets past the **Set up ruby env** step with no `Unavailable version … for ruby on ubuntu-26.04` and no 404 from `ruby/setup-ruby`. Verified from that job log.
6. After Ruby setup, the Android job still runs Bundler/Fastlane from `app/android` (the Fastlane step is reached). A later failure from missing Play secrets, config, or Gradle is out of scope for this criterion. Verified from the same job log: `bundle install` / `bundle exec fastlane` starts under Ruby 3.3.x.

## Out of scope

- Fastlane lane code, Google Play / App Store track/status, keystore, service-account JSON, Capacitor sync, Node 24, JDK 21, pnpm, CocoaPods version bumps, or Android Gradle.
- Changing the nightly cron, `SCHEDULED_ANDROID_ENVIRONMENT`, or environment-resolution logic.
- Pinning the Android job to an older Ubuntu image to preserve Ruby 3.3.1.
- Reworking `setup-ruby` to omit `ruby-version` and rely only on `.ruby-version`.
- App, web, API, or data-model behaviour.
- A required iOS TestFlight/App Store dispatch to prove the macOS pin (iOS is a consistency change; Android is the failing job).

## Test plan

Check: code

This is a CI toolchain pin. No product unit, integration, or browser tests.

1. **Diff review.** Confirm all four pins listed in Constraints are `3.3`, that both workflows still set `ruby-version` on `setup-ruby`, and that no mobile workflow or `.ruby-version` still hard-codes `3.3.1`.
2. **CI re-run.** Dispatch **Nightly Android builds** (`workflow_dispatch`) on the PR branch or on the default branch after merge. Open the `android-build` job log and confirm **Set up ruby env** succeeds, then that the Fastlane/`bundle` step at least starts.
3. **No new automated tests.** There is no application logic, parser, or API to cover. Do not add a Vitest/Jest case for YAML pins. Do not require an iOS workflow run for this spec.

## Risk class and why

**Low**, size **s**.

The failure is a missing prebuilt Ruby on the current GitHub runner image. The fix is switching four version strings from `3.3.1` to series `3.3`. Fastlane already runs on Ruby 3.3; the Android `Gemfile` does not pin an engine. iOS is the same pin on macOS, not a behaviour change. Worst case is an immediate CI failure in the Android job if Bundler/Fastlane misbehave on the new patch — visible before any Play upload completes. No user-facing app behaviour, data, or permissions change.

## Open questions

None remaining. Revision feedback closed the previous questions: use series `3.3`; include iOS for consistency; keep the workflow `ruby-version` inputs and align the `.ruby-version` files to the same value.
