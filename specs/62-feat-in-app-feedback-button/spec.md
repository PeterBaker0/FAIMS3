# In-app feedback button

Issue: [#62](https://github.com/PeterBaker0/FAIMS3/issues/62)

Proposed size: **m**. Pull-request breakdown is left to the planner.

## 1. Problem

Control Centre, the notebook Designer overlay, and the data-collection App
have no in-product way to send a short message to the operators of that
FAIMS / Fieldmark install. Users who hit a confusing screen, a designer
quirk, or a field-app bug currently have to leave the product.

Today:

- The App footer (`SupportEmail` in
  `app/src/gui/components/footer/supportEmail.tsx`) and About Build page
  (`app/src/gui/pages/about-build.tsx`) expose a **mailto** to
  `config.supportEmail`. That depends on a local mail client, is easy to
  miss during record entry, and is unavailable when the device has no mail
  app. The unused `HELP` route constant is not a help surface.
- Control Centre's protected header
  (`web/src/routes/_protected.tsx`) has **Documentation** (`VITE_DOCS_URL`)
  and an App link, and no feedback control. `parseWebEnv` does not expose
  `supportEmail`.
- The Designer overlay (`DesignerDialog` → `DesignerWidget`) is a
  full-viewport MUI shell. It hides the Control Centre header, so a
  header-only control would be unreachable while designing.

The MVP is a visible **Feedback** control on each of those three
surfaces. It opens a short form whose submit **emails** the install's
support address through Conductor's existing `emailService`. Not mailto
from the new button, not a ticket tracker, not attachments, not an
offline outbox.

## 2. Constraints

- **Email, not a new store.** Successful submit calls
  `emailService.sendEmail`. Do not write a Couch document, queue, or
  Bugsnag event for the message. Add a helper next to
  `api/src/utils/emailHelpers.ts` (for example
  `sendSupportFeedbackEmail`) and reuse that file's `escapeHtml` (export
  it if needed) before interpolating user text into HTML. Send both
  `html` and `text`.
- **Recipient is server-configured.** `to` is `config.supportEmail`. Add
  `SUPPORT_EMAIL` to `parseApiEnv` / `api/.env.dist` / the
  `@faims3/build-config` env-contract, sourced from
  `core.support.supportEmail` (same default as the App:
  `support@fieldmark.au`). CDK / `generate-build-config` must emit it for
  Conductor. Do not let the client choose `to`. Do not use
  `EMAIL_REPLY_TO` or `TEST_EMAIL_ADDRESS` as the inbox — those are the
  notification reply-to and the admin SMTP smoke-test target.
- **From stays the notification identity.** `from` remains
  `config.email.fromEmail` / `fromName`. Do not change global
  `EmailConfig.replyTo`. If `EmailOptions` can take a per-send `replyTo`
  without breaking SMTP/MOCK, set it to the sender's first people-db
  email when present; otherwise put that address only in the body.
- **Authenticated only.** `POST /api/feedback` (that path, or another
  static `/api/…` path that is not captured by `/:id`) uses
  `requireAuthenticationAPI` then
  `isAllowedToMiddleware({action: Action.SUBMIT_FEEDBACK})`.
  Unauthenticated → **401**. No public / captcha form.
- **New permission, not `SEND_TEST_EMAIL`.**
  - Enum: `Action.SUBMIT_FEEDBACK` (`'SUBMIT_FEEDBACK'`).
  - `actionDetails`: name/description that it submits in-app feedback
    email to support; `resourceSpecific: false`;
    `resource: Resource.SYSTEM`.
  - Grant on `Role.GENERAL_USER` **and** `Role.OPERATIONS_ADMIN`
    (`OPERATIONS_ADMIN` does not inherit `GENERAL_USER`; same split as
    `VERIFY_EMAIL`). `Role.GENERAL_ADMIN` inherits it via
    `GENERAL_USER`.
  - This is a user-facing send, not the ops SMTP smoke test. Keep
    `permissionintegrity` green.
- **Dedicated per-user rate limit**, independent of
  `RATE_LIMITER_ENABLED` (same idea as `EXPORT_RATE_LIMITER` in
  `api/src/exportRateLimiter.ts`):
  - Key: `user:${req.user.user_id}` after auth.
  - Default **5** requests per **3600000 ms** (1 hour).
  - Env: `FEEDBACK_RATE_LIMITER_ENABLED` (default true; **false** under
    `runningUnderTest` unless a test opts in),
    `FEEDBACK_RATE_LIMITER_WINDOW_MS`,
    `FEEDBACK_RATE_LIMITER_PER_WINDOW`.
  - Apply the limiter on the route after auth. Exceeded → **429**. Do
    not send mail on 429. The global IP limiter still applies when
    enabled; it is not enough alone (NAT, 1000 req / 10 min).
- **Request body** (Zod in `@faims3/data-model`
  `library/data-model/src/api.ts`):
  - `message`: trimmed string, min 1, max
    `INPUT_LIMITS.LONG_TEXT_MAX_LENGTH` (10000).
  - `source`: enum `'app' | 'control-centre' | 'designer'`.
  - `pageUrl`: optional string, max
    `INPUT_LIMITS.REDIRECT_URL_MAX_LENGTH` (2048). Clients send
    `window.location.href` truncated to that max, with query keys
    `exchangeToken` (and any other one-time auth token the app already
    strips from the URL) removed. The API stores/forwards the string as
    given after length validation; it does not fetch the URL.
  - No attachments, no HTML from the client, no `to` / `subject`
    override, no record or notebook JSON.
  - `validate({body})`. Empty / over-length `message`, missing /
    invalid `source`, or over-length `pageUrl` → **400**.
- **Server-composed metadata** in the email (do not trust the client
  for identity):
  - `user_id`, display `name`, people-db email addresses.
  - `impersonatingUserId` when the JWT session is impersonating
    (`req.user.impersonatingUserId`).
  - `User-Agent` request header, capped at
    `INPUT_LIMITS.SHORT_TEXT_MAX_LENGTH`.
  - `config.conductorInstanceName`, Conductor public URL, ISO
    timestamp.
  - Subject like
    `[${conductorInstanceName}] Feedback (${source}) from ${name or user_id}`.
  - A people-db user with an empty `emails` array (local `admin`) must
    still be able to send; omit Reply-To and list no addresses in the
    body.
- **SMTP failure is an error.** Unlike `POST /api/admin/test-email`, a
  send failure is **5xx** (or the existing exception mapper's status),
  not 200 with `success: false`. No mail → no success toast.
  Missing/blank `config.supportEmail` → **503** without calling
  `sendEmail`. Local `EMAIL_SERVICE_TYPE=MOCK` still counts as a
  successful send (the mock resolves); that is 2xx.
- **Placement (discoverable on each chrome, not a new settings page):**
  1. **Control Centre** — protected header action cluster in
     `web/src/routes/_protected.tsx`, with Documentation / App. Radix
     dialog (`web/src/components/ui/dialog.tsx`). Stable
     `data-testid="web-feedback-button"`. `source: 'control-centre'`.
  2. **Designer** — `DesignerWidget` MUI AppBar (title row, trailing
     side, left of close), not the dense Save/Cancel/Undo toolbar. The
     overlay hides the Control Centre header, so that header control is
     not enough. MUI Dialog matching the cancel dialog, stacked above
     the overlay. `data-testid="web-designer-feedback-button"`.
     `source: 'designer'`. Opening Feedback must not PUT, discard the
     draft, or close the editor.
  3. **App** — drawer bottom list next to **About Build**
     (`app/src/gui/layout/appBar.tsx` `bottomMenuItems`), signed-in
     only. Opens a MUI dialog; do not add a `/help` route. Stable
     `data-testid="app-feedback-button"`. `source: 'app'`.
- **Form UX:** labelled **Feedback** (or **Send feedback**); dialog with
  a required labelled multiline message, Send and Cancel; disable Send
  while the POST is in flight; success uses the host toast (sonner on
  web, App snackbar) then closes and clears the field; failure keeps
  the dialog open with an error. Empty message does not POST.
- **Offline (App):** if `useIsOnline()` is false, Send is disabled with
  copy that a network connection is required. Do not queue. Keep the
  existing mailto `SupportEmail` / About Build support row as the
  offline fallback. Control Centre / Designer treat fetch failure as
  the existing API-error toast.
- **Clients** call Conductor with the signed-in bearer token (web
  `post()` / `fetch` to `config.apiUrl`; App listing/`apiOperations`
  fetch to the active `serverUrl`). The new button must not open
  `mailto:`.
- **Docs:** `api/public/swagger.json` for the path; `api/README.md`
  email section; `api/.env.dist` for the new env vars. DCO sign-off;
  SPDX on new TypeScript files.
- Follow existing API patterns: async errors through the JSON error
  handler, Zod in data-model, no Couch schema migration.

## 3. Acceptance criteria

1. An unauthenticated `POST` to the feedback path returns **401** and
   does not call `emailService.sendEmail`.
2. An authenticated caller **without** `Action.SUBMIT_FEEDBACK` (a token
   whose global roles omit `GENERAL_USER` and `OPERATIONS_ADMIN`)
   receives **403** and no email is sent.
3. An authenticated `GENERAL_USER` (and `OPERATIONS_ADMIN` /
   `GENERAL_ADMIN`) `POST` with a non-empty `message` and a valid
   `source` receives **200** or **204**. `emailService.sendEmail` is
   called once with `to` equal to `config.supportEmail`. The body
   includes the trimmed message, `source`, `user_id`, and instance
   name. User HTML in `message` is escaped in the HTML part (`<script>`
   appears as text, not a tag).
4. `message` empty or whitespace-only, missing `source`, `source` not
   in the enum, or `message` longer than 10000 characters → **400** and
   no send. `pageUrl` longer than 2048 → **400**. Extra unknown fields
   are stripped or rejected consistently with other `validate()` routes.
5. With the dedicated limiter enabled, the **6th** authenticated POST
   from the same `user_id` inside one window returns **429** and does
   not send. A different `user_id` in the same window is still accepted
   (per-user key, not a global cap of 5).
6. If `config.supportEmail` is blank, the handler returns **503** and
   does not call `sendEmail`. If `sendEmail` rejects, the client
   receives a non-2xx status (not the test-email 200-with-error shape).
7. A people-db user with no emails can still receive **200/204** on a
   valid POST; the email is still sent to `config.supportEmail`. When
   `req.user.impersonatingUserId` is set, that id appears in the
   email body.
8. `Action.SUBMIT_FEEDBACK` exists with complete `actionDetails`, is
   granted to `GENERAL_USER` and `OPERATIONS_ADMIN` (hence
   `GENERAL_ADMIN` by inheritance), and is **not** the same grant as
   `SEND_TEST_EMAIL`. `pnpm --filter=@faims3/data-model test` passes,
   including `permissionintegrity`.
9. Control Centre: a signed-in user on a protected page sees a
   **Feedback** control in the header
   (`data-testid="web-feedback-button"`). Activating it opens a dialog;
   submitting a message `POST`s with `source: "control-centre"` and the
   current `pageUrl`; a success toast appears and the dialog closes.
10. Designer: with `DesignerDialog` open, a **Feedback** control is
    visible in the designer AppBar
    (`data-testid="web-designer-feedback-button"`) without using the
    Control Centre header, on Design, Info, and Setup Form. Submit
    sends `source: "designer"`. Close / Save / Cancel behaviour is
    unchanged; submitting feedback does not PUT `uiSpecification`.
11. App: a signed-in user sees **Feedback** in the navigation drawer
    next to About Build (`data-testid="app-feedback-button"`). Submit
    sends `source: "app"`. Signed-out users do not see that item. When
    `useIsOnline()` is false, Send is disabled and no POST is made.
    Existing footer / About Build mailto support links still render.
    The control does not require opening About Build or the footer.
12. `api/public/swagger.json` documents the path, auth, body, and 401 /
    403 / 400 / 429 / 503. `api/.env.dist` documents `SUPPORT_EMAIL`
    and the `FEEDBACK_RATE_LIMITER_*` variables.

## 4. Out of scope

- Attachments, screenshots, screen recordings, or attaching the current
  notebook JSON / record payload / photos.
- Opening GitHub/Jira issues, Slack, or a third-party widget
  (UserVoice, Intercom, and similar).
- Offline outbox / retry queue when the App is offline.
- Replacing or removing the App mailto `SupportEmail` and About Build
  support row.
- Captcha, public (logged-out) feedback, or changing CORS/CSRF.
- New Couch design docs, people-db fields, or storing feedback history
  in Conductor.
- Category / severity dropdowns, in-app ticket status, or a support
  inbox UI.
- Wiring Bugsnag or changing crash reporting.
- Showing the Control Centre header Feedback button through the
  designer overlay (the designer has its own control).
- Granting `SUBMIT_FEEDBACK` to resource-specific roles only, or
  reusing `SEND_TEST_EMAIL`.
- Restricting long-lived API tokens from this route beyond the
  ordinary bearer + per-user rate limit.
- Per-message From address changes that would break SMTP provider
  alignment.

## 5. Test plan

Automated (required):

- **Permission model** (`pnpm --filter=@faims3/data-model test`):
  `SUBMIT_FEEDBACK` has `actionDetails`; `permissionintegrity` passes;
  `GENERAL_USER` / `OPERATIONS_ADMIN` / `GENERAL_ADMIN` can; a role
  that does not inherit those cannot (`permissionfunctions` style).
- **API** (`pnpm --filter=@faims3/api test`): spy
  `emailService.sendEmail`. Cover 401, 403, 200/204 happy path (`to`,
  subject contains source, escaped HTML, metadata fields, empty
  emails, impersonation id in body), 400 for empty/overlong message
  and bad `source`, 503 when support email is blank, send rejection →
  non-2xx, 429 on the 6th POST with the limiter opted in
  (`FEEDBACK_RATE_LIMITER_ENABLED` true in that test; `resetKey`
  between tests). Confirm `POST /api/admin/test-email` is unchanged.
- **Build-config** (`pnpm --filter=@faims3/build-config test`):
  `SUPPORT_EMAIL` / limiter env parse; do not break existing parse
  fixtures.
- **Control Centre / Designer**
  (`pnpm --filter=@faims3/web exec vitest --run`): Feedback control
  present in the protected header and designer AppBar; dialog submit
  calls the API mock with the right `source`; success closes; error
  leaves it open; empty message does not POST; designer submit does
  not call the uiSpecification save mutation.
- **App** (`pnpm --filter=@faims3/app test`): drawer item present when
  authenticated, absent when not; offline disables send; submit hits
  the feedback path with `source: 'app'`.

Manual (stack up; optional if the unit tests above ship in the same
change):

1. Control Centre `http://localhost:3001`: sign in as `admin`, header
   Feedback, send a line of text, confirm MOCK/`emailService` log (or
   SMTP inbox when configured).
2. Open a project in the Designer, send from the designer AppBar,
   confirm `source` is designer and the editor stays open.
3. App `http://localhost:3000`: drawer Feedback while online; toggle
   offline and confirm Send is blocked; mailto on About Build still
   works.

Commands:

```bash
pnpm --filter=@faims3/data-model test
pnpm --filter=@faims3/build-config test
pnpm --filter=@faims3/api test
pnpm --filter=@faims3/web exec vitest --run
pnpm --filter=@faims3/app test
```

No new browser e2e required for this MVP. Existing smoke logins should
still pass.

## 6. Risk class and why

**Med.** Size: **m**.

The change is additive (new route, action, and chrome) and does not
touch Couch schemas, sync, or form data. Residual risk is real: any
signed-in user can trigger SMTP, so a stolen or shared token becomes a
mail-flood vector; user text and page URLs (which may include project
or record ids) land in an operator inbox as PII. Dedicated per-user
rate limits, authenticated-only access, HTML escaping, no attachments,
and a server-side recipient keep that contained, which is why the
class is medium rather than high. Local `EMAIL_SERVICE_TYPE=MOCK` does
not exercise real SMTP; production still depends on existing email
config being correct.

## 7. Open questions

1. Exact copy for the success toast and the App offline disable
   message — implementer can match neighbouring strings unless product
   supplies wording.
2. Should `pageUrl` from the App omit the record-id path segment so
   support sees survey-level context only? This spec sends the
   truncated `window.location.href` (auth query keys stripped) because
   the user chose to include the screen they are on.
