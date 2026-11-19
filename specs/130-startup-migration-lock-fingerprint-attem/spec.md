# Spec: fingerprint startup-migration lock attempts

Issue: [#130](https://github.com/PeterBaker0/FAIMS3/issues/130)

## 1. Problem

The clustered startup-migration lock (`api/src/couchdb/startupMigrationLock.ts`) records that a boot-migrate attempt finished (`complete` / `failed`), but not which code ran it. `waitForDoer` treats any settlement as authoritative: waiters return `{role: 'waiter'}` and never invoke `run`.

During a rolling ECS deploy, an old-revision task can win the lock, apply the previous API’s `DB_TARGET_VERSIONS`, write the previous design docs / JWT public key, and settle `complete`. New-revision tasks that were waiting then attach without running `runMigrationWork`, so a newer schema target, newer `_design/*` content, or a rotated Couch JWT key is never applied.

This happened moving conductor 1.10.0 → 1.11.0 when `DB_TARGET_VERSIONS[AUTH].targetVersion` went 5 → 6. Old task A claimed, logged `Database already at target version; skipping { dbType: 'AUTH', version: 5 }`, and settled `complete`. New tasks B and C logged `doer_settled … status=complete` and attached. `auth` stayed at v5. AUTH 5→6 is a no-op document migration; the real payload is new auth design views (`downloadGrants`, login lockout). A design-doc-only change (for example data-DB `validate_doc_update`) is documented as needing **no** `targetVersion` bump — if waiters skip `run()`, those views never land.

`runMigrationWork` (the locked callback) is: `initialiseDbAndKeys` (design/security docs + `initialiseJWTKey`) → `migrateDbs` → `validateDatabases`. Init is not a one-shot outside the lock: every doer boot still runs `couchInitialiser({forceWrite: true})` and skips the write when stored content already matches.

The fingerprint is the **intended end state of this binary**, not how much work is left. A doer that migrated some DBs and then died must keep the same fingerprint so a later matching process can re-claim and finish remaining steps (`migrateDbs` already skips DBs at target; init is content-match). Hashing live current versions or pending diffs would change the attempt identity after a partial success and is wrong.

## 2. Constraints

- Fingerprint these three inputs only, in stable order. Do **not** include live Couch versions, pending step lists, migration logs, `DB_MIGRATIONS` `{from,to}` rows, notebook step registries, `defaultVersion`, `apiVersion`, private keys, or directory env `default` identity.
  1. **Target versions** — every `DB_TARGET_VERSIONS[dbType].targetVersion`, plus `CURRENT_NOTEBOOK_UI_SCHEMA_VERSION` (the uiSpec target used by `validateDatabases`).
  2. **DB initialisation targets** — the documents this build would pass to `couchInitialiser`, not stored `_rev`s. Call each `init*DB` used by `initialiseDbAndKeys` (`initAuthDB`, `initDirectoryDB` without env `defaultConfig`, `initProjectsDB`, `initTemplatesDB`, `initPeopleDB`, `initInvitesDB`, `initTeamsDB`, `initMapAssetsDB`, `initTombstoneDB`, `initMigrationsDB`) and `initDataDB({projectId})` with a **stable placeholder** `projectId` (do not enumerate projects). Per factory, hash `{id, designDocuments, securityDocument, defaultDocument?}` with `_rev` omitted, JSON-stable (same round-trip as `hasSameStoredContent`).
  3. **Keys** — the JWT material `initialiseJWTKey` would PUT to Couch `_config/jwt_keys/` (`rsa:${kid}` + public PEM). Never the private key. Compute from `keyService.getSigningKey()` in the API; do not read Couch `_config` to fingerprint.

  Hash the canonical payload with SHA-256 and store the first 12 lowercase hex characters.

- The fingerprint is a process constant for this task’s code + signing public key. Compute once (data-model helper for (1)+(2), API folds in (3)) and pass into `withStartupMigrationLock`. Do not recompute per poll and do not read DB version documents to compute it.

- `apiVersion` is `config.apiVersion` (`api/package.json`). Store and log it. Never use it for waiter matching.

- Add optional `fingerprint` and `apiVersion` to `StartupMigrationLockDoc` and `StartupMigrationLockAttempt` so pre-fingerprint Couch docs still parse. New writers always set both: on claim (`running`), on settle (`complete` / `failed` history row; keep them on the doc), and on steal (`timed_out` row copies the stolen attempt’s values when present).

- `StartupMigrationLockOptions` gains optional `fingerprint` and `apiVersion` so tests can simulate mixed binaries. Production (`runStartupMigrations`) always supplies this process’s values. When omitted in a unit test, fill from the helper + `config.apiVersion` so existing same-process waiter tests keep matching. Key hashing may be stubbed in lock unit tests.

- In `waitForDoer`, when `doc.status` is `complete` or `failed`:
  - `doc.fingerprint === mine` → `{action: 'proceed'}` (today’s behaviour, including fail-open on matching `failed`)
  - missing fingerprint, or any other value → log `doer_settled_foreign_fingerprint` (include `instance`, `holder`, `status`, this process’s fingerprint, the doc fingerprint if any, and `apiVersion`s when present) and return `{action: 'retry'}`

  `tryClaim` already treats settled docs as claimable; the waiter becomes the doer and runs its own `run()`. Matching `failed` waiters still fail-open; a **later startup wave** still re-claims a settled lock and runs again so remaining migrate/init/key work can finish.

- Do **not** steal a live `running` lock just because its fingerprint differs. Wait, then re-claim after settle. Timeout / steal / 409 / I/O retry / `settleLock` no-op-if-stolen stay as they are.

- Include `fingerprint` on at least these `[startup-migration]` lines: `begin`, `claimed`, `wait_for_doer`, `still_waiting`, `doer_settled`, `doer_settled_foreign_fingerprint`, `settled`, `finish`. Prefer adding it to every `logStartupMigration` call in the lock module.

- `api/scripts/debugMigrationLock.ts`: human lock output (`formatLockHuman`) shows `fingerprint` and `apiVersion` on the current doc and each history row. JSON already dumps the doc. Admin `claim` stamps this process’s fingerprint/`apiVersion`. `unlock` preserves them on the doc and copies them onto the new history row.

- Old-after-new: if an older binary re-claims after a newer one has migrated, `identifyMigrations` already throws `Cannot downgrade databases…`. `runAsDoer` must still catch that, settle `failed`, return without throwing, and leave a readable lock. `runStartupMigrations` still resolves so the old task can attach. Do not add a downgrade path.

- Changing a **migration function body** without changing `targetVersion` does not change the fingerprint. Changing a **design-doc map / `validate_doc_update` / security document** or the **JWT public key / kid** does, even with no target bump.

- No Couch schema migration of the lock document itself: new fields are additive. Do not store the private key, full PEM in logs, or raw key material on the lock beyond the 12-hex fingerprint.

## 3. Acceptance criteria

1. After a successful claim, `StartupMigrationLockDoc` has non-empty `fingerprint` (12 lowercase hex chars) and `apiVersion`. After settle or steal, the archived `StartupMigrationLockAttempt` has the same two fields (legacy stolen docs may omit them). Visible in `api/src/couchdb/startupMigrationLock.ts` types and in `api/test/startupMigrationLock.test.ts` assertions on the stored doc.

2. A waiter whose fingerprint is X, observing `complete` (or `failed`) with fingerprint Y ≠ X, logs `doer_settled_foreign_fingerprint`, does not return as a waiter on that settlement, re-claims, and invokes `run`. Covered by a unit test in `api/test/startupMigrationLock.test.ts` that injects two `fingerprint` values.

3. A waiter whose fingerprint is X, observing `complete` with fingerprint X, returns `{role: 'waiter', status: 'complete'}` and does not invoke `run`. Same file; existing same-process waiter test may satisfy this once both sides default to the same fingerprint.

4. A waiter whose fingerprint is X, observing `complete` with **no** `fingerprint` field (pre-fingerprint lock), behaves as criterion 2 (retry, re-claim, run). Covered by seeding a settled doc without those fields in `api/test/startupMigrationLock.test.ts`.

5. Old-after-new: a lock settled `complete` under fingerprint `new`, then a caller with fingerprint `old` whose `run` throws `Cannot downgrade databases`, returns `{role: 'doer', status: 'failed'}`, does not reject, and leaves `status: 'failed'` with a consistent history row. Covered in `api/test/startupMigrationLock.test.ts`. `library/data-model/tests/migrationService.test.ts` already throws when current version exceeds target; keep that test green.

6. The fingerprint string, from a cloned canonical input, changes when any of these change, and does **not** change when only remaining/pending work or current DB versions change:
   - any `DB_TARGET_VERSIONS[dbType].targetVersion`
   - `CURRENT_NOTEBOOK_UI_SCHEMA_VERSION`
   - a hashed init `designDocuments[]` entry (for example an auth view `map` string) or `securityDocument`
   - JWT `kid` or public PEM
     It does not change when only `apiVersion` / `package.json` version, `defaultVersion`, a `DB_MIGRATIONS` `{from,to}` row with unchanged targets, directory env `defaultConfig`, the live project list, or private key bytes change. Tests: `@faims3/data-model` for (targets + init); `@faims3/api` for the key fold-in (stub `keyService`).

7. Spying `console.log` (or the existing `logKeyValue` path) during a lock run, the events listed in Constraints include `fingerprint=`. `formatLockHuman` output contains both `fingerprint` and `apiVersion` for a doc that has them. Covered in `api/test/startupMigrationLock.test.ts` and `api/test/debugMigrationLock.test.ts`. Logs must not print the private key or full PEM.

8. Existing lock tests in `api/test/startupMigrationLock.test.ts` still pass: first claimer runs, matching waiter does not, matching `failed` waiters proceed, steal-on-timeout, 409 race, I/O retry/fail, stolen doer cannot settle, later startup wave re-claims a settled matching lock and runs again. Command: `pnpm --filter=@faims3/api exec vitest --run test/startupMigrationLock.test.ts test/startupMigrations.test.ts test/debugMigrationLock.test.ts`.

## 4. Out of scope

- Changing `infrastructure/aws-cdk/lib/components/conductor.ts` `desiredCount` / autoscaling.
- Heartbeats, cancelling a live doer, or new concurrency rules beyond fingerprint matching on **settled** docs.
- Hashing live Couch versions, pending diffs, `DB_MIGRATIONS` registry rows, notebook step registries, `defaultVersion`, `apiVersion`, private keys, or directory `default` instance identity.
- Hashing every project’s concrete `initDataDB({projectId})` payload (placeholder only).
- Rewriting existing lock documents in Couch; running `migrate-with-keys` / forcing a deploy as immediate remediation.
- `DISABLE_MIGRATE_ON_STARTUP` / lock-disabled local boot, and Control Centre / app UI.
- Browser e2e.

## 5. Test plan

Check: code

This is boot-lock and migration-identity logic. Automated tests are required. No browser session and no screenshots.

Add or extend:

1. `@faims3/data-model` — helper over targets + init payloads: stable 12-hex; clone-and-tweak `targetVersion`, notebook target, or an init design/security field changes the hash; `defaultVersion`, registry `{from,to}` only, directory env `defaultConfig`, and a fake “current version / pending steps” object do not.
2. `@faims3/api` — folding in JWT `kid` + public PEM changes the process fingerprint; private key is not an input; `runStartupMigrations` passes fingerprint and `apiVersion` into `withStartupMigrationLock`.
3. `api/test/startupMigrationLock.test.ts` — matching settle (criterion 3); mismatched settle re-claims and runs (criterion 2); legacy missing fingerprint re-claims (criterion 4); old-after-new downgrade throw settles `failed` (criterion 5); claimed/settled docs carry `fingerprint` and `apiVersion` (criterion 1); named log events include `fingerprint` and do not include PEM (criterion 7); later-wave re-claim still runs (criterion 8). Inject `fingerprint` / `apiVersion` on options.
4. `api/test/debugMigrationLock.test.ts` — `formatLockHuman` includes both fields on the doc and a history row.

Run:

```
pnpm --filter=@faims3/data-model test
pnpm --filter=@faims3/api exec vitest --run test/startupMigrationLock.test.ts test/startupMigrations.test.ts test/debugMigrationLock.test.ts
```

Include the new data-model test file path in the first command if it is not picked up by the default Jest suite. No new e2e.

## 6. Risk class and why

**Med.** This is the production clustered boot path. A wrong match still skips a newer schema target, design-doc set, or JWT public key. A too-aggressive mismatch can start two migrators during a deploy. Residual cases: old binaries after a new migrate must fail-open without corrupting the lock; the first deploy of this change re-claims every legacy (no-fingerprint) `complete` lock once; key rotation changes the fingerprint (intended); design-map `toString()` drift would re-claim and let `forceWrite` no-op or rewrite. Partial migrate does **not** change the hash, so matching waiters still skip until a later wave re-claims — recovery relies on existing later-boot re-run plus idempotent migrate/init, not on a new pending-work identity. Not high: no data-doc rewrite, steal/timeout/fail-open unchanged. Not low: mixed-version ECS attach depends on this comparison.

## 7. Open questions

1. Should a waiter that sees a _running_ lock with a foreign fingerprint steal before timeout? Spec says no (wait, then re-claim on settle) to avoid two concurrent `run()`s.
2. Is 12 hex characters enough of SHA-256 for operators grepping logs, or should the lock store the full digest? Spec uses 12 as in the issue.

```json
{"risk": "med", "size": "m", "check": "code"}
```
