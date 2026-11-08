# Fix insufficient account lockout mechanisms

Issue: [#82](https://github.com/PeterBaker0/FAIMS3/issues/82)

Proposed size: **m**. Pull-request breakdown is left to the planner.

## 1. Problem

Local-password account lockout is progressive and per-account, but the
counters live in a process-local object. Production Conductor runs on
ECS Fargate with auto-scaling (`autoScaling.minCapacity` /
`maxCapacity` in `infrastructure/aws-cdk/lib/config.ts`). Each task
therefore has its own independent counter, and a task restart drops
whatever that task had stored.

An attacker who spreads guesses across live tasks multiplies allowed
attempts by the number of tasks. Scale-in, deploy, or crash also
resets lockout. The pentest finding is that in-memory lockout is
sound as a policy and unsound under horizontal scale.

Current shape (`api/src/auth/authRoutes.ts`):

- `failedLoginAttempts` is a module-level
  `Record<string, {count, lastAttempt}>`.
- Progressive delay after **5 / 7 / 10 / 15** failed attempts:
  **10s → 1m → 5m → 15m**. Below 5 failures there is no delay.
- `logFailedLoginAttempt` records only when
  `getCouchUserFromEmailOrUserId` finds a people document (unknown
  identifiers are not stored).
- `POST /auth/local` with `action: 'login'` checks lockout before
  Passport, logs another failure when already locked (so `lastAttempt`
  keeps moving), and `resetFailedLoginAttempts` on success.
- Opportunistic purge removes entries whose last attempt is older than
  `LOCKOUT_PERIOD_MAX` (15 minutes) once the in-memory map exceeds 100
  keys.

Email-code and verification-challenge limits already use the shared
Auth CouchDB and `ATTEMPT_LIMITER_ENABLED`. Login lockout does not
read that flag today. This change adds a **dedicated**
`LOGIN_LOCKOUT_ENABLED` so tests can opt out without touching the
email-code limiter. The HTTP IP limiter (`express-rate-limit`) is a
separate per-process control and is not this finding.

## 2. Constraints

- **Shared store, existing database.** Persist lockout in the Auth
  CouchDB that Conductor already uses for refresh tokens, email codes,
  and verification challenges. Do not add Redis, DynamoDB, ElastiCache,
  or another datastore. Do not pin Fargate `desiredCapacity` /
  `maxCapacity` to 1.
- **Couch is the only source of truth.** Remove the in-memory
  `failedLoginAttempts` map. Do not keep a per-process cache that can
  admit a login another task has already delayed.
- **Keep the progressive policy.** Thresholds and delays stay
  5→10s, 7→1m, 10→5m, 15→15m. Below 5 failures, no delay. After the
  current delay has elapsed, the next attempt is allowed; a further
  failure increments the count and may start a longer delay. This is
  a delay, not a permanent disable of the people document.
- **Remaining wait is remaining wait.** `getAccountLockoutDelay` (or
  its replacement) must return `max(0, period - timeSinceLastAttempt)`,
  not the full period whenever any remainder is positive. The flash
  copy (`Too many failed login attempts. Please try again in …`) must
  still reflect that remaining time.
- **Key by people `_id`.** After the existing
  `getCouchUserFromEmailOrUserId` lookup, store and read one document
  per user. Logging in as `admin` and as that user’s email must share
  a counter. Do not key the document on the raw request string.
- **Deterministic document id.** Use a stable Auth `_id` such as
  `loginlockout_<userId>` (prefix in `AUTH_RECORD_ID_PREFIXES`) so
  every task hits the same row without a view on the login hot path.
- **Known users only.** Do not create a lockout document when the
  identifier does not match a people record. That preserves today’s
  non-enumeration behaviour and bounds store growth.
- **New Auth document type.** Extend the AuthRecord Zod union,
  `AUTH_RECORD_ID_PREFIXES`, and auth design documents. Suggested
  fields: `documentType` (e.g. `'loginlockout'`), `userId`, `count`,
  `lastAttemptMs`. Follow the verification / long-lived-token pattern:
  a no-op AUTH version bump when introducing a new document type
  (`authV2toV3Migration`, `authV4toV5Migration`). AUTH
  `targetVersion` is currently 5 while types already include V6
  download grants; do not leave the new type off the live union, and
  do bump AUTH if a no-op migration is required for views/schema.
- **Concurrent increments.** Two tasks failing the same user at once
  must not lose counts. Read–increment–write with retry on Couch
  `409` until the write succeeds or a retry budget is exhausted.
  First-create races on the deterministic id are the same path.
- **Lockout evaluation before credential work.** Keep the pre-Passport
  check on `POST /auth/local` login. A request still inside the delay
  must not verify the password, must flash the existing style of
  message, must refresh `lastAttemptMs` (today’s “log while locked”
  behaviour), and must redirect to `/login` without issuing tokens.
- **Every failed local password auth for a known user increments.**
  Wrong password, disabled account, and “social-only” local login all
  count. Successful local login deletes or zeros that user’s lockout
  document so the next failure starts at 1.
- **Fail closed on unexpected reads (flag on only).** When
  `loginLockoutEnabled` is true, a `404` / missing doc means no
  delay. Any other read error (network, 5xx, parse) must not
  authenticate; treat it as lockout-unavailable and reject the login
  (redirect + generic failure, no token). Login already depends on
  Couch for the people lookup. When the flag is false, skip this
  path entirely.
- **Dedicated `LOGIN_LOCKOUT_ENABLED`, not `ATTEMPT_LIMITER_ENABLED`.**
  Add `LOGIN_LOCKOUT_ENABLED` (parsed boolean, default **true**) on
  the same path as the other limit flags: `parseApiEnv` /
  `api/.env.dist` / `@faims3/build-config` env-contract /
  `core.limits.loginLockoutEnabled` (CDK + `LimitsBuildConfigSchema`).
  Map it to `config.loginLockoutEnabled`. Force **false** when
  `runningUnderTest` is true (same pattern as
  `exportRateLimiterEnabled` in
  `library/build-config/src/client-env/api-env.ts`), so the existing
  API login suite does not write lockout docs. Tests that assert
  lockout **opt in** by setting `config.loginLockoutEnabled = true`
  (see `api/test/exportRateLimit.test.ts`). Production and local
  `pnpm run dev` stay on unless the env is set false. Do not read
  `ATTEMPT_LIMITER_ENABLED` for login lockout. When the flag is
  false: skip delay checks, skip lockout reads/writes (including
  fail-closed), and do not increment or reset lockout documents.
- **TTL.** Include lockout docs in `api/src/couchdb/ttlCleanup.ts`.
  Delete when `lastAttemptMs` is older than 15 minutes plus the
  existing rate-limit grace (default 1 hour is fine). On read, a
  stale doc (last attempt older than 15 minutes) is treated as no
  delay and may be deleted. Add a design view (or prefix scan) so the
  sweeper can find them. Update
  `docs/developer/docs/source/markdown/TtlCleanup.md`.
- **Extract from `authRoutes.ts`.** Put store helpers next to other
  Auth Couch modules (`api/src/couchdb/…`) so delay math and
  increment/reset can be unit-tested without the Express app.
- **Local login only.** Do not change SAML/OIDC, register, password
  reset, or verification-challenge limiters. Do not change the HTTP
  IP limiter or export limiter.
- **No user-visible account-status API** and no admin “unlock”
  endpoint in this change. Delay expiry is the unlock.

## 3. Acceptance criteria

1. `api/src/auth/authRoutes.ts` no longer holds a process-local
   `failedLoginAttempts` map (or equivalent in-memory counter) that
   is consulted for lockout decisions. Reviewers can confirm this
   from the diff.
2. With lockout opted in (`config.loginLockoutEnabled = true`),
   failed local login for an existing people user writes or updates
   one Auth CouchDB document whose `_id` is deterministic from that
   user’s `_id`, with `count` and `lastAttemptMs`. Two sequential
   failures against the same in-memory PouchDB (stand-in for two
   tasks) leave `count === 2` on that single document. Command:
   `pnpm --filter=@faims3/api test`.
3. Logging in as the same person with two identifiers that
   `getCouchUserFromEmailOrUserId` resolves (for example `admin` and
   that user’s email) shares one lockout document. Command: the same
   API test file as (2).
4. A failed local login for an identifier that is not a people user
   creates no lockout document. Command: `pnpm --filter=@faims3/api test`.
5. With lockout opted in, after 5 recorded failures, a further
   `POST /auth/local` (`action: 'login'`) for that user, issued
   before the 10s delay elapses, redirects to `/login` without an
   `exchangeToken` and without verifying the password. After the
   delay elapses, a login with the correct password succeeds. Fake
   timers are allowed. Command: `pnpm --filter=@faims3/api test`.
6. Thresholds match today’s policy, asserted on the delay helper with
   fake timers: no delay for count 4; 10s remaining at count 5 with
   last attempt just now; 1m at 7; 5m at 10; 15m at 15. When half the
   period has elapsed, the helper returns approximately the remaining
   half, not the full period. Command:
   `pnpm --filter=@faims3/api test`.
7. With lockout opted in, a successful `POST /auth/local` login
   deletes or zeros that user’s lockout document. Five failures,
   wait out the 10s delay, succeed once, then one wrong password
   leaves `count === 1` (or equivalent “fresh” state), not 6.
   Command: `pnpm --filter=@faims3/api test`.
8. Two overlapping increments on the same user id (parallel
   `Promise`s against one PouchDB) both apply: final `count` is the
   sum of those increments, not a lost write. Command:
   `pnpm --filter=@faims3/api test`.
9. Auth record Zod schemas and `AUTH_RECORD_ID_PREFIXES` accept the
   new document type. Existing refresh / emailcode / verification /
   longlived / downloadgrant fixtures still parse. If AUTH
   `targetVersion` is bumped, `library/data-model` migration tests
   cover the no-op. Command: `pnpm --filter=@faims3/data-model test`.
10. TTL cleanup treats a lockout doc with `lastAttemptMs` older than
    15 minutes + grace as deletable, and a fresher doc as retained.
    Command: `pnpm --filter=@faims3/api test` (extend
    `api/test/ttlCleanup.test.ts`).
11. Existing local-login tests still pass **with the test default
    (lockout off)**, including successful admin login and “failed
    login puts email back on `/login`” in
    `api/test/conductor.test.ts`. Command:
    `pnpm --filter=@faims3/api test`.
12. `parseApiEnv` with `runningUnderTest: false` and the env unset
    yields `loginLockoutEnabled === true`. With
    `runningUnderTest: true` it is `false` even if the env is
    `true`. Command: `pnpm --filter=@faims3/build-config test`.
13. With `config.loginLockoutEnabled = false`, five failed
    `POST /auth/local` logins for a known user do not create a
    lockout document and the sixth (immediate) attempt with the
    correct password still authenticates. With the flag set true,
    criterion 5 holds. Command: `pnpm --filter=@faims3/api test`.
14. CDK auto-scaling `desiredCapacity` / `minCapacity` /
    `maxCapacity` are unchanged. Adding `loginLockoutEnabled` under
    `core.limits` (default true, documented next to
    `attemptLimiterEnabled`) is expected. Confirm auto-scaling
    numbers from the diff.

## 4. Out of scope

- Changing Fargate min/max/desired capacity or disabling auto-scaling.
- Adding Redis or any store other than Auth CouchDB.
- HTTP IP rate limiter (`RATE_LIMITER_ENABLED` / `express-rate-limit`)
  and export rate limiter — those may also be per-process; they are
  not this finding.
- Captcha, WAF rules, or IP blocklists.
- Lockout for SAML/OIDC, register, forgot-password, or email
  verification (those already have Couch-backed attempt limits).
- Permanently disabling the people document, admin unlock UI, or a
  public “is this account locked?” endpoint.
- Changing progressive thresholds (5/7/10/15) or delay lengths
  (10s/1m/5m/15m).
- Tying login lockout to `ATTEMPT_LIMITER_ENABLED`.
- User enumeration hardening beyond keeping “no doc for unknown
  identifiers”.
- Multi-task AWS brute-force tests against a live cluster.

## 5. Test plan

Check: code

Automated (`@faims3/api`, in-memory PouchDB, fake timers):

1. Extracted delay helper: counts 0–4 → 0; 5/7/10/15 → 10s / 1m / 5m
   / 15m remaining when `lastAttemptMs` is now; remaining decreases
   as time advances; after the period, delay is 0.
2. Store module: increment for a known user creates the deterministic
   id; second increment updates the same doc; unknown identifier
   writes nothing; reset/delete on success; alias identifiers share
   one doc.
3. Concurrent increments (two overlapping writes) land as count 2.
4. HTTP lockout cases **set `config.loginLockoutEnabled = true`**
   (and restore false in `afterEach`). Five failed `POST /auth/local`
   logins for `admin` (or a fixture user), then a sixth before 10s
   expires → 302 to `/login`, no `exchangeToken`. Advance timers
   past 10s; correct password succeeds and clears the doc.
5. While delayed (flag on), a request with the **correct** password
   still does not authenticate.
6. With the flag left false (test default), five failed logins do
   not persist a lockout doc; a following correct password succeeds
   immediately. Existing `api/test/conductor.test.ts` auth cases
   stay green without opting in.
7. Extend `api/test/ttlCleanup.test.ts` for the new doc type’s
   retention predicate (stale vs fresh `lastAttemptMs`).

Automated (`@faims3/build-config`):

8. `parseApiEnv`: default true outside test; forced false under
   `runningUnderTest`. Independent of `ATTEMPT_LIMITER_ENABLED`.

Automated (`@faims3/data-model`):

9. New document type parses; existing AuthRecord fixtures and
   migrations (including a new no-op AUTH bump if added) stay green:
   `pnpm --filter=@faims3/data-model test`.

No browser session and no new e2e. A multi-task Fargate brute-force
is not runnable in CI; the PouchDB concurrency test is the stand-in
for “two tasks, one counter”.

Commands:

```bash
pnpm --filter=@faims3/data-model test
pnpm --filter=@faims3/build-config test
pnpm --filter=@faims3/api test
```

## 6. Risk class and why

**High.** Size: **m**.

This is a production authentication control called out by a pentest.
Wrong shared state can either restore the original bypass (lost
counts, fail-open reads) or lock a real user out across every
Conductor task (lost reset on success, fail-closed gone wrong,
conflict retries that double-count). Login already talks to Couch for
people lookup, so availability is not a new dependency, but every
failed login now writes Auth Couch and must retry 409s on the hot
path.

`LOGIN_LOCKOUT_ENABLED` is forced off under `runningUnderTest`, so
the existing login suite cannot prove the control. Lockout tests must
opt in; a reviewer should reject a PR whose lockout cases never set
`config.loginLockoutEnabled = true`.

Medium would fit a docs-only or single-process tweak. High is
appropriate because the behaviour change is cluster-wide lockout and
the failure modes are security-sensitive. Size is **m**: one new
Auth document type, env flag, route wiring, TTL, and API tests — not
a new service.

## 7. Open questions

1. If increment 409 retries are exhausted, should the failed login
   still return the generic “username or password incorrect” response
   (count maybe dropped) or fail closed? This spec prefers fail
   closed on **reads** and, on **write** exhaustion after an already
   failed password, still reject the login (password was wrong) while
   logging the write error — the next request may under-count by one.
   Switch to failing the HTTP request harder only if ops want that.
2. Exact Auth `documentType` string and prefix (`loginlockout` vs
   `failedlogin`) are implementer choice as long as they are stable,
   prefixed, and unique in `AUTH_RECORD_ID_PREFIXES`.
