# Plan: fingerprint startup-migration lock attempts

Issue: [#130](https://github.com/PeterBaker0/FAIMS3/issues/130)

Spec: `specs/130-startup-migration-lock-fingerprint-attem/spec.md`

One implementation pull request. `acceptance` numbers are criteria from that spec.

```yaml
approach: >
  Add a process-constant fingerprint of intended boot end-state (each
  DB_TARGET_VERSIONS targetVersion, the notebook uiSpec target, desired
  couchInitialiser payloads, and JWT kid plus public PEM) and store it on the
  startup-migration lock. Waiters accept complete or failed only when that
  fingerprint matches; otherwise they re-claim and run initialiseAndMigrateDBs.
  Compute targets and init content in data-model, fold in the public key in the
  API, then thread fingerprint and apiVersion through claim, settle, logs, and
  the debug CLI. Cover matching, mismatched, legacy, and old-after-new settles
  in existing lock tests without hashing live remaining work.
check: code
tasks:
  - key: hash-targets-and-init
    title: Hash targets and init payloads
    description: >
      Export a data-model helper that SHA-256-truncates (12 hex) DB
      targetVersion values, CURRENT_NOTEBOOK_UI_SCHEMA_VERSION, and each
      init*DB couchInitialiser payload (placeholder projectId for data DBs).
      Do not include live versions, pending diffs, registry from/to,
      defaultVersion, or directory env default.
    depends_on: []
    files_hint:
      - library/data-model/src/data_storage/migrations/startupMigrationFingerprint.ts
      - library/data-model/src/data_storage/migrations/index.ts
      - library/data-model/tests/startupMigrationFingerprint.test.ts
      - library/data-model/src/data_storage/authDB/init.ts
      - library/data-model/src/data_storage/dataDB/init.ts
    acceptance:
      - 6
    risk: med
    size: m
    tier: mid
  - key: fold-jwt-fingerprint
    title: Fold JWT public key into hash
    description: >
      In the API, combine the data-model hash with rsa:kid and the public PEM
      from keyService.getSigningKey, never the private key, producing the
      process fingerprint passed into the lock.
    depends_on:
      - hash-targets-and-init
    files_hint:
      - api/src/couchdb/startupMigrationFingerprint.ts
      - api/src/auth/keySigning/initJWTKeys.ts
      - api/src/buildconfig.ts
      - api/test/startupMigrationFingerprint.test.ts
    acceptance:
      - 6
    risk: med
    size: s
    tier: cheap
  - key: lock-fields-and-wait
    title: Store fingerprint and match waiters
    description: >
      Add optional fingerprint and apiVersion on the lock doc and history
      rows, write them on claim, settle, and steal, and in waitForDoer proceed
      only on an exact match. Mismatch or a missing fingerprint logs
      doer_settled_foreign_fingerprint and retries into tryClaim. Do not steal
      a live running lock for a foreign fingerprint.
    depends_on:
      - hash-targets-and-init
    files_hint:
      - api/src/couchdb/startupMigrationLock.ts
      - api/test/startupMigrationLock.test.ts
    acceptance:
      - 1
      - 2
      - 3
      - 4
    risk: med
    size: m
    tier: mid
  - key: lock-log-fingerprint
    title: Log fingerprint on lock events
    description: >
      Include fingerprint on begin, claimed, wait_for_doer, still_waiting,
      doer_settled, doer_settled_foreign_fingerprint, settled, and finish.
      Do not log private keys or full PEM.
    depends_on:
      - lock-fields-and-wait
    files_hint:
      - api/src/couchdb/startupMigrationLock.ts
      - api/src/utils/logKeyValue.ts
      - api/test/startupMigrationLock.test.ts
    acceptance:
      - 7
    risk: low
    size: s
    tier: cheap
  - key: boot-pass-fingerprint
    title: Pass fingerprint at boot
    description: >
      runStartupMigrations supplies this process fingerprint and
      config.apiVersion to withStartupMigrationLock when the lock is enabled.
      Later startup waves still re-claim a settled matching lock and run again.
    depends_on:
      - fold-jwt-fingerprint
      - lock-fields-and-wait
    files_hint:
      - api/src/couchdb/startupMigrations.ts
      - api/test/startupMigrations.test.ts
    acceptance:
      - 1
      - 6
      - 8
    risk: med
    size: s
    tier: cheap
  - key: debug-cli-fields
    title: Show fingerprint in debug CLI
    description: >
      formatLockHuman and JSON lock output include fingerprint and apiVersion
      on the doc and history rows. Admin claim stamps this process values;
      unlock preserves them.
    depends_on:
      - lock-fields-and-wait
    files_hint:
      - api/scripts/debugMigrationLock.ts
      - api/test/debugMigrationLock.test.ts
    acceptance:
      - 7
    risk: low
    size: s
    tier: cheap
  - key: cover-lock-tests
    title: Cover settle and downgrade paths
    description: >
      Extend startupMigrationLock tests for matching settle, mismatched
      settle, legacy missing fingerprint, old-after-new downgrade settling
      failed, stored fingerprint fields, log lines, and keep existing steal,
      I/O, and later-wave cases green.
    depends_on:
      - lock-log-fingerprint
      - boot-pass-fingerprint
      - debug-cli-fields
    files_hint:
      - api/test/startupMigrationLock.test.ts
      - api/test/startupMigrations.test.ts
      - api/test/debugMigrationLock.test.ts
      - library/data-model/tests/migrationService.test.ts
    acceptance:
      - 1
      - 2
      - 3
      - 4
      - 5
      - 7
      - 8
    risk: med
    size: m
    tier: mid
```
