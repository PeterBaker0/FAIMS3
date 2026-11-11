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

## Constraints

- Fix the CI Ruby pin. Do not change Fastlane lanes, Play tracks, signing, Capacitor, Node, or JDK.
- Stay on MRI Ruby **3.3.x**. Do not jump to 3.4 or 4.x as part of this fix.
- Prefer a selector that `setup-ruby` can install on `ubuntu-26.04` and on later images that keep pruning old patches. `ruby/setup-ruby` documents this as a short series (`'3.3'`, latest 3.3.x) rather than an old exact patch. An exact current patch (`3.3.13` at the time of the failure) is acceptable if the implementer wants a fully specified version.
- Keep `app/android/.ruby-version` consistent with whatever the workflow requests (or drop the workflow input and let `setup-ruby` read `.ruby-version` via `working-directory: app/android`).
- Do not pin `runs-on` to `ubuntu-24.04` (or older) solely to keep Ruby 3.3.1. That only delays the same failure.
- The change belongs in `common-android-build.yml` so nightly and production Android jobs both recover.
- Do not edit product source under `app/src`, `web/`, `api/`, or the shared libraries.

## Acceptance criteria

1. `.github/workflows/common-android-build.yml` no longer sets `ruby-version` to `3.3.1` (or any other 3.3 patch that `setup-ruby` does not publish for `ubuntu-26.04`). Verified by reading that file in the PR diff.
2. The Ruby version that job installs is MRI 3.3 and is one `ruby/setup-ruby@v1` can download on `ubuntu-26.04`: either the series selector `3.3`, or a patch the action lists as available (the failure log named `3.3.13`). Verified by reading the same workflow (and `app/android/.ruby-version` if that file is the source of truth).
3. `app/android/.ruby-version` matches the version the Android workflow uses, so local Fastlane and CI do not diverge. Verified by diff of that file against the workflow input (or by the workflow omitting `ruby-version` and relying on `.ruby-version`).
4. A GitHub Actions run of **Nightly Android builds** (`nightly-android-testbuild.yml`, manual `workflow_dispatch` is enough) gets past the **Set up ruby env** step with no `Unavailable version … for ruby on ubuntu-26.04` and no 404 from `ruby/setup-ruby`. Verified from that job log.
5. After Ruby setup, the job still runs Bundler/Fastlane from `app/android` (the Fastlane step is reached). A later failure from missing Play secrets, config, or Gradle is out of scope for this criterion. Verified from the same job log: `bundle install` / `bundle exec fastlane` starts under the new Ruby.

## Out of scope

- iOS: `.github/workflows/common-ios-build.yml` and `app/ios/App/.ruby-version` still pin `3.3.1`, but that job runs on `macOS-latest` and is not this nightly Android 404. Same-class cleanup is optional, not required.
- Fastlane lane code, Google Play track/status, keystore, service-account JSON, Capacitor sync, Node 24, JDK 21, pnpm, or Android Gradle.
- Changing the nightly cron, `SCHEDULED_ANDROID_ENVIRONMENT`, or environment-resolution logic.
- Pinning the Android job to an older Ubuntu image to preserve Ruby 3.3.1.
- App, web, API, or data-model behaviour.

## Test plan

Check: code

This is a CI toolchain pin. No product unit, integration, or browser tests.

1. **Diff review.** Confirm `common-android-build.yml` (and `app/android/.ruby-version` if touched) request a 3.3 selector that exists on `ubuntu-26.04`, and that no other Android workflow still hard-codes `3.3.1`.
2. **CI re-run.** Dispatch **Nightly Android builds** (`workflow_dispatch`) on the PR branch or on the default branch after merge. Open the `android-build` job log and confirm **Set up ruby env** succeeds, then that the Fastlane/`bundle` step at least starts.
3. **No new automated tests.** There is no application logic, parser, or API to cover. Do not add a Vitest/Jest case for YAML pins.

## Risk class and why

**Low**, size **s**.

The failure is a missing prebuilt Ruby on the current GitHub runner image. The fix is a 3.3.x patch/series bump in workflow YAML (and the matching `.ruby-version`). Fastlane already runs on Ruby 3.3; the Android `Gemfile` does not pin an engine. Worst case is an immediate CI failure in the same job if Bundler/Fastlane misbehave on the new patch — visible before any Play upload completes. No user-facing app behaviour, data, or permissions change.

## Open questions

1. Prefer `ruby-version: '3.3'` (latest 3.3.x, matches `setup-ruby` guidance and survives the next runner-image prune) or a frozen patch such as `3.3.13` (more reproducible, will 404 again when GitHub drops that patch)?
2. Should the same PR also move the iOS pin off `3.3.1` for consistency, even though macOS runners are not failing this way today?
3. Should the workflow omit `ruby-version` and read `app/android/.ruby-version` only, so there is a single source of truth?
