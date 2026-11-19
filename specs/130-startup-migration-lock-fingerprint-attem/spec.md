# Spec: fingerprint startup-migration lock attempts

Issue: [#130](https://github.com/PeterBaker0/FAIMS3/issues/130)

## 1. Problem

The clustered startup-migration lock (`api/src/couchdb/startupMigrationLock.ts`) records that a boot-migrate attempt finished (`complete` / `failed`), but not which code ran it. `waitForDoer` treats any settlement as authoritative: waiters return `{role: 'waiter'}` and never invoke `run`.

During a rolling ECS deploy, an old-revision task can win the lock, apply the previous API’s `DB_TARGET_VERSIONS`, and settle `complete`. New-revision tasks that were waiting then attach without running their own migrations. The lock, steal timeout, and fail-open path all behave as designed; the schema target of the running code is still skipped.

This happened moving conductor 1.10.0 → 1.11.0 when `DB_TARGET_VERSIONS[AUTH].targetVersion` went 5 → 6. Old task A claimed, logged `Database already at target version; skipping { dbType: 'AUTH', version: 5 }`, and settled `complete`. New tasks B and C logged `doer_settled … status=complete` and attached. `auth` stayed at v5. A future non-trivial step would be skipped the same way.

Any rolling deploy can boot mixed versions at once. The lock must only let a waiter accept a settlement whose migration set matches its own.

## 2. Constraints

- Fingerprint **what boot-migrate will do**, not the package version. Canonical input, in stable order:
  - every `DB_TARGET_VERSIONS` entry (`dbType` → `defaultVersion` and `targetVersion`)
  - every `DB_MIGRATIONS` row as `{dbType, from, to}` (not function bodies or descriptions)
  - `CURRENT_NOTEBOOK_UI_SCHEMA_VERSION`
  - every `NOTEBOOK_UI_SCHEMA_MIGRATIONS` row as `{from, to}`

  Hash with SHA-256 and store the first 12 lowercase hex characters. Do not put `apiVersion` in the hash.

- Expose the fingerprint from `@faims3/data-model` so a data-model test can assert it changes when a target or registry row changes. Hashing may use Node `crypto` (this package already does in tests). `runStartupMigrations` passes the string into the lock; do not recompute per poll.

- `apiVersion` is `config.apiVersion` (`api/package.json`). Store and log it. Never use it for waiter matching.

- Add optional `fingerprint` and `apiVersion` to `StartupMigrationLockDoc` and `StartupMigrationLockAttempt` so pre-fingerprint Couch docs still parse. New writers always set both:
  - on claim (`tryClaim` puts `running`)
  - on settle (`complete` / `failed` history row; keep them on the doc)
  - on steal (`timed_out` history row copies the stolen attempt’s values when present)

- `StartupMigrationLockOptions` gains optional `fingerprint` and `apiVersion` so tests can simulate mixed binaries. Production (`runStartupMigrations`) always supplies this process’s values. When omitted in a unit test, fill from the data-model helper and `config.apiVersion` so existing same-process waiter tests keep matching.

- In `waitForDoer`, when `doc.status` is `complete` or `failed`:
  - `doc.fingerprint === mine` → `{action: 'proceed'}` (today’s behaviour, including fail-open on matching `failed`)
  - missing fingerprint, or any other value → log `doer_settled_foreign_fingerprint` (include `instance`, `holder`, `status`, this process’s fingerprint, the doc fingerprint if any, and `apiVersion`s when present) and return `{action: 'retry'}`

  `tryClaim` already treats settled docs as claimable; the waiter becomes the doer and runs its own `run()`.

- Do **not** steal a live `running` lock just because its fingerprint differs. Wait, then re-claim after settle. Timeout / steal / 409 / I/O retry / `settleLock` no-op-if-stolen stay as they are.

- Do **not** skip `tryClaim` when a later startup wave finds a matching `complete` lock. Sequential boots still re-claim and run again (migrations are idempotent; see the existing “later startup wave” test).

- Include `fingerprint` on at least these `[startup-migration]` lines: `begin`, `claimed`, `wait_for_doer`, `still_waiting`, `doer_settled`, `doer_settled_foreign_fingerprint`, `settled`, `finish`. Prefer adding it to every `logStartupMigration` call in the lock module.

- `api/scripts/debugMigrationLock.ts`: human lock output (`formatLockHuman`) shows `fingerprint` and `apiVersion` on the current doc and each history row. JSON already dumps the doc; keep the new fields on the type so they appear. Admin `claim` stamps this process’s fingerprint/`apiVersion` so the CLI does not write a legacy blank lock. `unlock` preserves the doc’s existing fields and copies them onto the new history row.

- Old-after-new: if an older binary re-claims after a newer one has migrated, `identifyMigrations` already throws `Cannot downgrade databases…`. `runAsDoer` must still catch that, settle `failed`, return without throwing, and leave a readable lock (`status: 'failed'`, history capped, `_id` / `_rev` intact). `runStartupMigrations` still resolves so the old task can attach. Do not add a downgrade path.

- Changing a migration **function body** without changing `from`/`to`/`targetVersion` does not change the fingerprint. Version bumps remain the contract for “this is a new migration set.”

- No Couch schema migration of the lock document itself: new fields are additive.

## 3. Acceptance criteria

1. After a successful claim, `StartupMigrationLockDoc` has non-empty `fingerprint` (12 lowercase hex chars) and `apiVersion`. After settle or steal, the archived `StartupMigrationLockAttempt` has the same two fields (legacy stolen docs may omit them). Visible in `api/src/couchdb/startupMigrationLock.ts` types and in `api/test/startupMigrationLock.test.ts` assertions on the stored doc.

2. A waiter whose fingerprint is X, observing `complete` (or `failed`) with fingerprint Y ≠ X, logs `doer_settled_foreign_fingerprint`, does not return as a waiter on that settlement, re-claims, and invokes `run`. Covered by a unit test in `api/test/startupMigrationLock.test.ts` that injects two `fingerprint` values.

3. A waiter whose fingerprint is X, observing `complete` with fingerprint X, returns `{role: 'waiter', status: 'complete'}` and does not invoke `run`. Same file; existing same-process waiter test may satisfy this once both sides default to the same fingerprint.

4. A waiter whose fingerprint is X, observing `complete` with **no** `fingerprint` field (pre-fingerprint lock), behaves as criterion 2 (retry, re-claim, run). Covered by seeding a settled doc without those fields in `api/test/startupMigrationLock.test.ts`.

5. Old-after-new: a lock settled `complete` under fingerprint `new`, then a caller with fingerprint `old` whose `run` throws `Cannot downgrade databases`, returns `{role: 'doer', status: 'failed'}`, does not reject, and leaves `status: 'failed'` with a consistent history row. Covered in `api/test/startupMigrationLock.test.ts`. `library/data-model/tests/migrationService.test.ts` already throws when current version exceeds target; keep that test green.

6. The fingerprint string changes when any `DB_TARGET_VERSIONS[dbType].targetVersion` (or `defaultVersion`) changes, and when any `DB_MIGRATIONS` `{dbType, from, to}` or notebook registry `{from, to}` / `CURRENT_NOTEBOOK_UI_SCHEMA_VERSION` changes. It does not change when only `apiVersion` / `package.json` version changes. Test in `@faims3/data-model` against a cloned canonical input (do not mutate the live registries without restoring them).

7. Spying `console.log` (or the existing `logKeyValue` path) during a lock run, the events listed in Constraints include `fingerprint=`. `formatLockHuman` output contains both `fingerprint` and `apiVersion` for a doc that has them. Covered in `api/test/startupMigrationLock.test.ts` and `api/test/debugMigrationLock.test.ts`.

8. Existing lock tests in `api/test/startupMigrationLock.test.ts` still pass: first claimer runs, matching waiter does not, matching `failed` waiters proceed, steal-on-timeout, 409 race, I/O retry/fail, stolen doer cannot settle. Command: `pnpm --filter=@faims3/api exec vitest --run test/startupMigrationLock.test.ts test/startupMigrations.test.ts test/debugMigrationLock.test.ts`.

## 4. Out of scope

- Changing `infrastructure/aws-cdk/lib/components/conductor.ts` `desiredCount` / autoscaling (the separate infra cause of extra old-revision tasks mid-deploy).
- Heartbeats, cancelling a live doer, or new concurrency rules beyond fingerprint matching on **settled** docs.
- Matching or hashing `apiVersion`, migration function source, or notebook migration function bodies.
- Rewriting existing lock documents in Couch; running `migrate-with-keys` / forcing a deploy as immediate remediation.
- `DISABLE_MIGRATE_ON_STARTUP` / lock-disabled local boot, notebook downgrade behaviour beyond the existing throw, and Control Centre / app UI.
- Browser e2e.

## 5. Test plan

Check: code

This is boot-lock and migration-identity logic. Automated tests are required. No browser session and no screenshots.

Add or extend:

1. `@faims3/data-model` — fingerprint helper: stable 12-hex output; clone-and-tweak `targetVersion` / registry `{from,to}` changes the hash; `apiVersion` is not an input.
2. `api/test/startupMigrationLock.test.ts` — matching settle (criterion 3); mismatched settle re-claims and runs (criterion 2); legacy missing fingerprint re-claims (criterion 4); old-after-new downgrade throw settles `failed` with a consistent doc (criterion 5); claimed/settled docs carry `fingerprint` and `apiVersion` (criterion 1); named log events include `fingerprint` (criterion 7). Inject `fingerprint` / `apiVersion` on `withStartupMigrationLock` options. Keep the existing waiter / steal / I/O cases.
3. `api/test/debugMigrationLock.test.ts` — `formatLockHuman` (and JSON lock payload if asserted) includes both fields on the doc and a history row.
4. `api/test/startupMigrations.test.ts` — `runStartupMigrations` passes fingerprint and `apiVersion` into `withStartupMigrationLock` when the lock is enabled (extend the existing options assertion).

Run:

```
pnpm --filter=@faims3/data-model test
pnpm --filter=@faims3/api exec vitest --run test/startupMigrationLock.test.ts test/startupMigrations.test.ts test/debugMigrationLock.test.ts
```

Include the new data-model test file path in the first command if it is not picked up by the default Jest suite. No new e2e.

## 6. Risk class and why

**Med.** This is the production clustered boot path. A wrong match still skips a newer schema target (the incident). A too-aggressive mismatch (for example treating a live foreign `running` lock as stealable, or refusing matching `complete`) can start two migrators or turn every replica into a doer during a deploy. Residual cases: old binaries after a new migrate must fail-open without corrupting the lock; the first deploy of this change will re-claim every legacy (no-fingerprint) `complete` lock once, which is intended. Not high: no data-doc rewrite, migrations stay idempotent, steal/timeout/fail-open are unchanged. Not low: mixed-version ECS attach depends on this comparison.

## 7. Open questions

1. Should a waiter that sees a _running_ lock with a foreign fingerprint steal before timeout? Spec says no (wait, then re-claim on settle) to avoid two concurrent `run()`s. Confirm only if operations want a faster cutover than `STARTUP_MIGRATION_LOCK_TIMEOUT_MS`.
2. Is 12 hex characters enough of SHA-256 for operators grepping logs, or should the lock store the full digest? Spec uses 12 as in the issue; collision risk across our registry size is negligible.

```json
{"risk": "med", "size": "m", "check": "code"}
```
