# Knip current issues assessment

This is a snapshot of the Knip findings on top of
`feat/knip-setup-docs-8205`, captured from:

```bash
NO_COLOR=1 pnpm knip
pnpm exec knip --reporter json
```

No cleanup has been applied here. The goal is to group the current findings so
we can choose the safest remediation path.

## Headline counts

| Category | Count |
| --- | ---: |
| Unused files | 18 |
| Unused dependencies | 51 |
| Unused devDependencies | 28 |
| Unlisted dependencies | 10 |
| Unlisted binaries | 3 |
| Unresolved imports | 2 |
| Unused exports | 236 |
| Unused exported types | 10 |
| Unused exported enum members | 1 |
| Duplicate exports | 42 |
| Configuration hints | 1 |

## Workspace heat map

| Workspace | Files | Deps | Dev deps | Unlisted | Binaries | Unresolved | Exports | Types | Enum members | Duplicates |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `app` | 5 | 26 | 9 | 1 | 1 | 0 | 64 | 2 | 0 | 1 |
| `web` | 5 | 12 | 3 | 0 | 0 | 0 | 90 | 0 | 0 | 3 |
| `api` | 0 | 8 | 12 | 0 | 0 | 0 | 52 | 4 | 0 | 2 |
| `library/forms` | 4 | 3 | 1 | 2 | 0 | 0 | 22 | 0 | 0 | 4 |
| `library/data-model` | 3 | 0 | 1 | 0 | 0 | 0 | 7 | 0 | 1 | 32 |
| `e2e` | 1 | 0 | 2 | 7 | 0 | 2 | 0 | 0 | 0 | 0 |
| `infrastructure/aws-cdk` | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 4 | 0 | 0 |
| root package | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `.github` workflows | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 |

## Cluster 1: package manifest cleanup and Knip false-positive decisions

This is the largest operational cluster: 94 package-related findings across
unused deps, unused devDeps, unlisted deps, unlisted binaries, and unresolved
imports.

### Native/mobile and toolchain packages

These are risky to remove by static analysis alone because Capacitor and native
build tooling can load them from generated native manifests, package scripts, or
workflow commands:

- `app/package.json`: `@capacitor-community/exif`,
  `@capacitor-mlkit/barcode-scanning`, `@capacitor/app-launcher`,
  `@capacitor/device`, `@capacitor/status-bar`,
  `@capgo/capacitor-audio-recorder`,
  `@capgo/capacitor-speech-recognition`, `@capacitor/assets`.
- root `package.json`: `@capacitor-community/exif`.
- `.github/workflows/appstore-deploy.yml` and
  `.github/workflows/appstore-testflight.yml`: unlisted `cap` binary.
- `app/package.json`: unlisted `react-scripts` binary and unlisted
  `react-scripts` type reference from `app/src/react-app-env.d.ts`.
- `app/package.json`: `@bugsnag/source-maps`, used by the
  `bugsnag-upload` package script rather than direct TypeScript imports.
- `app/package.json`: `rollup-plugin-node-polyfills`, with string aliases in
  Vite/Vitest config; `buffer` and `stream` also look like browser-polyfill
  leftovers and need bundler review before removal.

Suggested direction: decide whether these should be retained and ignored in
`knip.json`, moved to the workspace that actually needs them, or removed after a
native/mobile build check.

### API package scripts and test tooling

`api/package.json` reports unused devDependencies that appear in scripts:

- Script-visible: `cross-env`, `mocha`, `nodemon`.
- Needs review: `dotenv`, `jest-fast-check`, `node-fetch`,
  `@types/body-parser`, `@types/express-session`, `@types/mocha`,
  `@types/passport-oauth2`, `@types/qrcode`, `@types/superagent`.

The API runtime dependency list also includes plausible stale packages:
`body-parser`, `cache-manager`, `fast-check`, `istanbul`, `oauth`,
`passport-oauth2`, `pouchdb-mapreduce`, `qrcode`.

Suggested direction: split script/test-runner false positives from genuine
unused packages. Do not bulk-remove script dependencies until package scripts
have been checked.

### Web package dependency drift

`web/package.json` reports 12 unused runtime deps and 3 unused devDeps:

- Runtime: `@lexical/react`, `@radix-ui/react-navigation-menu`,
  `@radix-ui/react-scroll-area`, `@tanstack/router-devtools`,
  `@tanstack/zod-adapter`, `ajv`, `esbuild`, `lexical`, `mdi-material-ui`,
  `react-json-view-lite`, `react-router`, `react-router-hash-link`.
- Dev: `@tanstack/eslint-plugin-query`, `@testing-library/user-event`,
  `webdriverio`.

Suggested direction: likely mostly removable, but confirm whether any are kept
for planned editor/router work before pruning.

### Forms package test config mismatch

`library/forms/vitest.config.ts` references unlisted `jsdom` and
`@vitest/coverage-v8`. The package has `vitest`, but not those two packages.
It also reports unused `@testing-library/user-event`, plus unused runtime
`buffer`, `clsx`, and `react-router-dom`.

Suggested direction: either declare the Vitest environment/coverage packages or
remove the config settings if coverage/jsdom are not intended here.

### E2E manifest mismatch

The e2e workspace has the clearest "missing declaration" issues:

- Unlisted imports from `@wdio/globals` in page objects.
- Unlisted `@wdio/types` in `e2e/wdio.conf.ts`.
- Unresolved type entries `@wdio/globals/types` and `expect-webdriverio` in
  `e2e/tsconfig.json`.
- Unused devDeps `@testing-library/webdriverio` and `wdio-wait-for`.

Suggested direction: add the missing WebdriverIO packages/types if these tests
are active, and remove stale helper deps if they are not used.

## Cluster 2: unused files

The 18 unused files break down into smaller, more actionable groups:

### Theme/style fragments

- `app/src/gui/themes/bssTheme/appBar.tsx`
- `app/src/gui/themes/bssTheme/noteBook.tsx`
- `app/src/gui/themes/bssTheme/typography.tsx`
- `app/src/gui/themes/default/shadows.tsx`
- `app/src/gui/themes/fieldmark/shadows.tsx`

Likely old theme fragments. These look removable if the theme system no longer
imports them.

### Placeholder or utility files

- `library/data-model/src/data_storage/dataDB/types.ts`
- `library/data-model/src/data_storage/directoryDB/types.ts`
- `library/data-model/src/databaseEngine/check.ts`

The first two are TODO-only placeholder files. `databaseEngine/check.ts` is a
large validation/helper script for FAIMS deployments, including hydration and
conflict statistics, so it may be a developer utility rather than dead code.
If kept, add it as a Knip entry point or document the invocation.

### Disabled or orphaned tests/samples

- `library/forms/lib/fieldRegistry/fields/RichText/RichText._test.tsx`
- `library/forms/lib/fieldRegistry/fields/TextFields/TextField._test.tsx`
- `library/forms/lib/fieldRegistry/fields/SampleField/Sample.tsx`
- `library/forms/lib/formModule/sections/index.ts`

The `*._test.tsx` files are not picked up by the configured Vitest pattern.
Decision needed: re-enable as tests, delete, or keep with an explicit ignore if
they are reference material.

### E2E page object

- `e2e/test/pageobjects/api-register.ts`

This also imports `@wdio/globals`, so deleting it would reduce one unlisted
dependency report. Keep it only if registration coverage is planned.

### Web archive/designer leftovers

- `web/src/project-archive/project-lifecycle-copy.ts`
- `web/src/components/dialogs/remove-user.tsx`
- `web/src/designer/components/Fields/ControlledNumberFieldEditor.tsx`
- `web/src/designer/store/selectors.ts`
- `web/src/designer/types/notebook.ts`

These should be triaged with the web archive/designer work. Some may be old UI
copy/components that were superseded by newer archive and designer flows.

## Cluster 3: unused exports

There are 236 unused exported values. Many can probably be fixed by removing
`export` while keeping the implementation, but public API and dynamic lookup
surfaces need care.

### API exports

52 unused exports and 4 unused exported types are in `api`, including:

- Default router exports in `api/src/api/emailReset.ts` and
  `api/src/api/longLivedTokens.ts`, which duplicate named `api` exports.
- SSO/auth helper exports in `api/src/auth/**`.
- Build config constants in `api/src/buildconfig.ts`.
- CouchDB/export/email/invite/token helper exports under `api/src/couchdb/**`.
- Export stats and token payload types in `api/src/couchdb/export/types.ts`.

Suggested direction: remove `export` from helpers that are purely internal.
Default/named duplicate router exports can likely be standardized, but check
route registration first.

### App exports

64 unused exports and 2 unused exported types are in `app`, including:

- Build config constants and `AutosuggestSource` in `app/src/buildconfig.ts`.
- Route constants in `app/src/constants/routes.tsx`.
- Redux selectors/actions/helpers in `app/src/context/slices/**`.
- Record table/datagrid helpers in `app/src/gui/components/notebook/**`.
- Hooks/utilities in `app/src/utils/**`.
- `FAIMSErrorBoundary`, private-route wrappers, popup context exports, and
  theme exports.

Suggested direction: focus on "over-exported internal helper" cleanup first.
Use extra caution for route constants and config values that might be referenced
outside static imports.

### Web exports

90 unused exports are in `web`, including:

- Shadcn-style UI component surfaces under `web/src/components/ui/**`.
- Designer state, reducer, adapter, registry, and field editor exports.
- Archive/template/user hooks and utility wrappers.
- Time and generic utility functions in `web/src/lib/**`.

Suggested direction: decide whether shadcn-style components should keep their
full generated export surface. For designer code, several exports may be
intentional scaffolding for in-progress work; remove only after confirming the
current designer flow does not need them.

### Forms exports

22 unused exports are in `library/forms`, mostly field component exports and
form hooks:

- Field components such as `AdvancedSelect`, `AudioRecorder`, `Checkbox`,
  `FileUploader`, `MapFormField`, `MultiSelect`, `RadioGroup`, `RichTextField`,
  `Select`, `TakePhoto`, and `TakePoint`.
- Speech-to-text helpers/components.
- `FieldSpecificationSchema`, attachment hooks, `createOtherValue`, and related
  record schemas.

Suggested direction: treat this as public/registry API until proven otherwise.
If downstream packages consume these exports indirectly or externally, annotate
or configure ignores instead of deleting.

### Data model and infrastructure exports

- `library/data-model`: 7 unused exports, plus one unused enum member
  (`ProjectStatus.ARCHIVED`) and several permission/attachment/notebook
  migration helpers.
- `infrastructure/aws-cdk`: 1 unused export (`SecurityConfigSchema`) and 4
  unused exported config types.

Suggested direction: verify whether these are intended public package exports
or just internal helpers. `ProjectStatus.ARCHIVED` is a likely false positive:
it is referenced from `api`, `app`, and `web` through the data-model package.
The data-model package is the most likely to have external consumers, so avoid
removing public symbols without a compatibility decision.

## Cluster 4: duplicate exports

There are 42 duplicate export groups. Most are probably intentional aliases:

- 32 are in `library/data-model`, dominated by versioned schema aliases and
  stable names, for example `AuthRecordV5FieldsSchema` and
  `AuthRecordFieldsSchema`.
- API has duplicate default/named router exports.
- Forms/web have named component exports paired with `default` exports.

Suggested direction: do not treat duplicate exports as cleanup by default. If a
clean Knip report is desired, annotate intentional aliases with `@lintignore` or
exclude duplicates from Knip, rather than replacing stable API aliases.

## Cluster 5: merge/conflict-resolution code to preserve

The current Knip run does **not** report
`library/data-model/src/data_storage/merging.ts` as unused, and the merge-related
types in `library/data-model/src/types.ts` are currently referenced by that
module:

- `FieldMergeInformation`
- `RecordMergeInformation`
- `UserMergeResult`
- `InitialMergeRevisionDetailsMap`
- `InitialMergeDetails`

Given the plan to potentially bring merge conflict resolution back later, this
area should be treated as "preserve unless explicitly decided otherwise." If a
future Knip config change starts reporting these exports or files, prefer an
intentional ignore/entry-point annotation over deletion.

Adjacent caution: `library/data-model/src/databaseEngine/check.ts` is reported
as an unused file and includes conflict/hydration validation reporting. It is
not the merge engine itself, but it is close enough to conflict-resolution
support that it deserves a keep/delete decision rather than automatic removal.

## Cluster 6: configuration hint

Knip reports one root package hint:

- `package.json`: `main: index.js` points at a missing file.

Suggested direction: remove the root `main` field if the root package is only a
monorepo coordinator, or point it at a real file if the root package is supposed
to be importable.

## Suggested remediation order

1. Decide ignore-vs-remove policy for native/toolchain/script dependencies.
2. Fix manifest correctness issues that are clearly real (`e2e` missing
   WebdriverIO declarations, forms Vitest config packages, root `main` hint).
3. Triage unused files by cluster, keeping merge/conflict-adjacent utilities
   separate from simple placeholders or disabled tests.
4. Remove over-exporting one workspace at a time, starting with internal API/app
   helpers and leaving public data-model/forms exports until compatibility is
   decided.
5. Handle duplicate exports last, because many are compatibility aliases rather
   than dead code.
