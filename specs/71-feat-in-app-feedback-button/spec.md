# In-app feedback button

GitHub issue: [#71](https://github.com/PeterBaker0/FAIMS3/issues/71)

## Problem

Field collectors, Control Centre operators, and notebook authors have no in-product way to send product feedback besides a `mailto:` on the data-collection app footer and About Build page. That fallback needs a configured mail client, which field tablets often lack, and it does not exist in Control Centre or Designer.

The three surfaces are:

- Data-collection app (`app`, `:3000`) — MUI chrome: account menu, drawer, About Build, footer `SupportEmail`.
- Control Centre (`web`, `:3001`) — shadcn sidebar + header (`Documentation`, app link, theme toggle, user menu).
- Designer — fullscreen overlay (`DesignerWidget` / `DesignerDialog`) that covers Control Centre chrome, with its own MUI app bar.

MVP: a **Send feedback** control on each surface that posts a short message to Conductor, which emails the configured support inbox using the existing SMTP/`emailService` stack. Rate-limit it independently of the global IP limiter so it cannot be used as an open mail relay.

## Constraints

- Do not add a new mail vendor. Send through `api/src/services/emailService.ts` (`SMTP` or `MOCK`), the same path as verification and invite mail (`api/src/utils/emailHelpers.ts`).
- Authenticate with `requireAuthenticationAPI`. Any signed-in user may submit. Do not add a new `Action` for MVP.
- Destination is operator-configurable and defaults to the existing support address (`support.supportEmail`, default `support@fieldmark.au`). The API does not currently read that value (only `VITE_SUPPORT_EMAIL` on the app); wire it into API env (for example `FEEDBACK_EMAIL`, falling back to `support.supportEmail`).
- Put request/response types in `@faims3/data-model` and validate with the existing `validate` / express-zod-safe middleware. Cap the message with `INPUT_LIMITS.LONG_TEXT_MAX_LENGTH` (10 000). Reject unknown fields.
- Dedicated limiter, same shape as `api/src/exportRateLimiter.ts`: independent of `RATE_LIMITER_ENABLED`, keyed by authenticated `user_id`, skippable in tests, env-configurable (`FEEDBACK_RATE_LIMITER_ENABLED` / `WINDOW_MS` / `PER_WINDOW`). Default **5 requests per 10 minutes** per user. Return **429** with a clear retry message. Do not accept attachments.
- HTML-escape user-controlled text before interpolating it into the HTML part of the mail (same `escapeHtml` pattern as `emailHelpers.ts`). Take identity from the access token, not from the body.
- Set `Reply-To` to the submitter’s email when the account has one, otherwise the configured `emailReplyTo`.
- Designer is a fullscreen overlay (`web/src/components/dialogs/designer-dialog.tsx`) that hides Control Centre header and sidebar. Designer must have its own control; the Control Centre header button is not visible while editing.
- App and web use different UI kits. Share the API contract, not a cross-package dialog. Web + Designer can share one dialog component inside `web`.
- Offline: no queue for MVP. If the app is offline or the POST fails with a network error, show that feedback needs a connection. Leave the existing footer / About `mailto:` in place as a fallback.
- Do not auto-attach record values, GPS, notebook JSON, or local database dumps. Client may send bounded diagnostics only: `source` (`app` | `web` | `designer`), optional `category`, optional current path/URL (truncated), optional client version, optional user-agent.
- `EMAIL_SERVICE_TYPE=MOCK` must still return success from the API so local UI can be exercised without SMTP.
- Log submissions without the full message body (user id, source, category, timestamp only) so support inboxes hold the PII, not API logs.
- Impersonation: still allow send; include both impersonator and target ids in the mail so support is not misled.

## Acceptance criteria

1. `POST /api/feedback` with a valid bearer token and a body `{ message }` (non-empty after trim, ≤ `INPUT_LIMITS.LONG_TEXT_MAX_LENGTH`) returns **200** and `{ success: true }`, and calls `emailService.sendEmail` once with `to` equal to the configured feedback destination. Check: `pnpm --filter=@faims3/api test` (new route tests, spy on `emailService.sendEmail` as in `api/test/api.test.ts`).
2. The same route without a bearer token, or with an invalid token, returns **401** and does not call `sendEmail`. Check: same API test file.
3. Empty / whitespace-only `message`, `message` longer than `INPUT_LIMITS.LONG_TEXT_MAX_LENGTH`, invalid `source`, or unknown body fields return **400** and do not send mail. Check: same API test file plus `pnpm --filter=@faims3/data-model test` for the shared Zod schema.
4. After the configured per-user maximum in the window (test with max=2), the next authenticated `POST /api/feedback` returns **429** and does not send a further mail. Check: `pnpm --filter=@faims3/api test`, following `api/test/exportRateLimit.test.ts` (enable the limiter in `beforeEach`, `resetKey` in `afterEach`).
5. The HTML mail body uses the authenticated user’s id/username/email from `req.user`, not client-supplied identity fields. Injected HTML in `message` appears escaped in the HTML part (`&lt;` not a live tag). Check: API test inspecting the `options` passed to `sendEmail`.
6. New limiter/destination env vars parse through `@faims3/build-config` with the defaults above and appear in `api/.env.dist` (and CDK/build-config docs if that package already documents `exportRateLimiter*`). Check: `pnpm --filter=@faims3/build-config test` and diff of `.env.dist`.
7. Signed-in data-collection app: account menu (`app/src/gui/components/authentication/appbarAuth.tsx`) has a **Send feedback** item (`data-testid="app-feedback-button"`) that opens a dialog with a required message field and submit. Submit calls `POST {activeServer}/api/feedback` with the bearer token. Success closes the dialog and shows a confirmation; 429 and network failure show an error and leave the text. Check: `pnpm --filter=@faims3/app test` and browser check A.
8. Signed-in Control Centre: the protected header (`web/src/routes/_protected.tsx`) has a **Feedback** control (`data-testid="web-feedback-button"`) next to Documentation / app link. It opens the same dialog contract as criterion 7 against `config.apiUrl`. Check: `pnpm --filter=@faims3/web exec vitest --run` and browser check B.
9. Open Designer (template or project editor). The Designer app bar (`DesignerWidget`) has a **Feedback** control (`data-testid="web-designer-feedback-button"`) that opens the same web dialog with `source: "designer"`. The Control Centre header control is not required to be visible while Designer is open. Check: web vitest targeting `DesignerWidget` and browser check C.
10. Unauthenticated app users do not see **Send feedback** in the account menu (sign-in button remains). The existing About Build / footer `mailto:` is unchanged. Check: app vitest for `appbarAuth` signed-out state; About Build test still finds `config.supportEmail`.
11. While `navigator.onLine` is false, the app dialog does not POST; it shows that a connection is required. Check: app vitest with `onLine` stubbed false.

## Out of scope

- Ticketing (GitHub, Jira, Zendesk) or in-app ticket status.
- Screenshots, attachments, screen recordings, or Bugsnag “user feedback” reports.
- Offline queue / sync of unsent feedback.
- Unauthenticated submissions.
- Changing or removing the existing app footer / About `mailto:`.
- Live chat, NPS surveys, or public changelog.
- Auto-including record data, GPS, or database dumps.
- A new RBAC `Action` or per-role gating of the button.
- Redesigning app / Control Centre / Designer navigation beyond adding the one control and dialog on each surface.

## Test plan

Check: browser

Size: m

Automated (required — this change adds API, validation, mail, and rate-limit behaviour):

- `pnpm --filter=@faims3/data-model test` — Zod schema bounds and discriminators.
- `pnpm --filter=@faims3/build-config test` — new env defaults and fallbacks.
- `pnpm --filter=@faims3/api test` — auth, validation, send, HTML escape, 429 (see criteria 1–5).
- `pnpm --filter=@faims3/app test` — account-menu item, dialog validation, offline guard, mailto unchanged.
- `pnpm --filter=@faims3/web exec vitest --run` — header button, shared dialog, Designer app-bar button.

No new e2e suite for MVP; unit/integration coverage of the API and the three entry points is enough. Add `data-testid`s so a later e2e can hook them.

Manual (browser — placement is the issue; code tests cannot show the three chromes):

- **A. App.** Sign in at `http://localhost:3000`. Open the account menu → **Send feedback**. Submit a short message. Confirm success. Submit until 429 and confirm the error. Toggle offline (DevTools) and confirm submit is blocked. Confirm footer `mailto:` still works.
- **B. Control Centre.** Sign in at `http://localhost:3001`. Use the header **Feedback** control on a project list page. Confirm the dialog and a successful submit (`EMAIL_SERVICE_TYPE=MOCK` is enough locally).
- **C. Designer.** From a template or project, open the designer overlay. Confirm Control Centre header is covered. Use the Designer app-bar **Feedback** control, submit, confirm success without leaving the editor.

## Risk class and why

**med**

The route sends mail on behalf of any authenticated user, so a missing auth check or a limiter that only follows the optional global IP limiter (`RATE_LIMITER_ENABLED` is often off behind WAF) would make Conductor an abuse/spam vector and a cost risk. Message text is PII once it hits the support inbox; logging the full body would spread that further.

It is not **high**: MVP is authenticated, length-capped, attachment-free, HTML-escaped, and uses a dedicated per-user limiter. It is not **low**: new public API plus email side effects, three UI entry points, and impersonation metadata.

Size **m**: one Conductor route + limiter + env wiring, a shared Zod contract, and three chrome entry points (app MUI dialog, web header, Designer app bar). No new service, no Couch schema, no offline queue.

## Open questions

1. Should the destination be the existing support inbox (`support@fieldmark.au`) or a dedicated product-feedback address? Spec defaults to support email; operators can override with `FEEDBACK_EMAIL`.
2. Keep optional `category` (`bug` | `suggestion` | `other`) in MVP, or message-only? Spec includes optional category because triage is cheap; drop it if copy should stay one field.
3. When SMTP send fails, return **503** and do not tell the client that the message was stored. Is a later “outbox” (Couch doc + retry) wanted, or is fail-and-tell-them-to-retry enough? MVP is fail-and-retry.
4. Should unsigned-in app users get a dialog that falls back to `mailto:`, or is the existing footer enough? Spec leaves unsigned-in users on `mailto:` only.
