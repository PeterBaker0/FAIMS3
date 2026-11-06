# Plan: in-app feedback button

Issue: [#62](https://github.com/PeterBaker0/FAIMS3/issues/62)
Spec: [spec.md](./spec.md)

One pull request. Size **m**, risk **med**. Authenticated email to
`SUPPORT_EMAIL`; no Couch store, attachments, or offline outbox.

```yaml
approach: >
  One pull request adds Action.SUBMIT_FEEDBACK and the Zod request body,
  then wires SUPPORT_EMAIL and a dedicated per-user feedback limiter into
  Conductor env. Next it implements POST /api/feedback, which emails the
  server-configured inbox through emailService with escaped HTML and no
  Couch write. After that route is tested, document it and add Feedback
  dialogs in the Control Centre header, the Designer AppBar, and the App
  drawer. Clients POST with a bearer token and source enum; they do not
  choose the recipient or open mailto from the new control.
tasks:
  - key: submit-feedback-action
    title: Add SUBMIT_FEEDBACK action and request schema
    description: >
      Add Action.SUBMIT_FEEDBACK to SYSTEM actions with actionDetails
      (resource SYSTEM, not resource-specific) and grant it on
      Role.GENERAL_USER and Role.OPERATIONS_ADMIN, matching VERIFY_EMAIL.
      Add PostFeedback request/response Zod types in
      library/data-model/src/api.ts (message 1–10000, source enum
      app|control-centre|designer, optional pageUrl max 2048). Add
      permissionfunctions-style tests; keep permissionintegrity green.
    depends_on: []
    files_hint:
      - library/data-model/src/permission/model.ts
      - library/data-model/src/api.ts
      - library/data-model/tests/permissionfunctions.test.ts
      - library/data-model/tests/permissionintegrity.test.ts
    acceptance:
      - 8
    risk: low
    size: s
    tier: cheap
  - key: support-email-env
    title: Add SUPPORT_EMAIL and feedback limiter env
    description: >
      Parse SUPPORT_EMAIL from core.support.supportEmail (default
      support@fieldmark.au) and FEEDBACK_RATE_LIMITER_ENABLED / WINDOW_MS /
      PER_WINDOW (default 5 per 3600000 ms, enabled except under
      runningUnderTest). Wire parseApiEnv, env-contract, SHARED_DEFAULTS,
      LimitsBuildConfigSchema, api/.env.dist, and generate-build-config
      tests. Do not use EMAIL_REPLY_TO or TEST_EMAIL_ADDRESS as the inbox.
    depends_on: []
    files_hint:
      - library/build-config/src/client-env/api-env.ts
      - library/build-config/src/env-contract.ts
      - library/build-config/src/shared-schemas.ts
      - library/build-config/src/build-config.ts
      - library/build-config/test/client-env.test.ts
      - library/build-config/test/generate-build-config.test.ts
      - api/.env.dist
      - api/src/buildconfig.ts
    acceptance:
      - 12
    risk: low
    size: s
    tier: cheap
  - key: feedback-api
    title: Implement POST /api/feedback with limiter and mail
    description: >
      Add sendSupportFeedbackEmail (reuse escapeHtml; html+text; to
      config.supportEmail; From unchanged). Optional per-send replyTo from
      the first people-db email only; empty emails still send. Dedicated
      per-user limiter after auth (user:${user_id}); 6th POST in the window
      is 429 and does not send. POST /api/feedback with
      requireAuthenticationAPI, SUBMIT_FEEDBACK, validate(body). 401/403/400
      send nothing; blank SUPPORT_EMAIL is 503; sendEmail rejection is 5xx.
      Spy sendEmail in api tests including impersonatingUserId in the body.
    depends_on:
      - submit-feedback-action
      - support-email-env
    files_hint:
      - api/src/api/feedback.ts
      - api/src/expressSetup.ts
      - api/src/feedbackRateLimiter.ts
      - api/src/utils/emailHelpers.ts
      - api/src/services/emailService.ts
      - api/src/exceptions.ts
      - api/test/feedback.api.test.ts
    acceptance:
      - 1
      - 2
      - 3
      - 4
      - 5
      - 6
      - 7
    risk: med
    size: m
    tier: mid
  - key: feedback-docs
    title: Document the feedback route in swagger and README
    description: >
      Document POST /feedback in api/public/swagger.json (Auth,
      SUBMIT_FEEDBACK, body, 401/403/400/429/503). Describe the endpoint
      next to the email section in api/README.md. Confirm api/.env.dist
      lists SUPPORT_EMAIL and FEEDBACK_RATE_LIMITER_*. Do not change
      POST /api/admin/test-email.
    depends_on:
      - feedback-api
    files_hint:
      - api/public/swagger.json
      - api/README.md
      - api/.env.dist
    acceptance:
      - 12
    risk: low
    size: s
    tier: cheap
  - key: web-header-feedback
    title: Add Control Centre header Feedback dialog
    description: >
      Put a Feedback control in the protected header next to Documentation /
      App (data-testid web-feedback-button). Use a self-contained Radix
      Dialog, not the layout Dialog root. POST via existing post() with
      source control-centre and pageUrl from window.location.href (truncate,
      strip exchangeToken). Success toast then close and clear; error keeps
      the dialog open; empty message does not POST. Vitest the control,
      source, and success/error paths.
    depends_on:
      - feedback-api
    files_hint:
      - web/src/routes/_protected.tsx
      - web/src/components/feedback/feedback-dialog.tsx
      - web/src/components/feedback/feedback-dialog.test.tsx
      - web/src/hooks/queries.ts
      - web/src/lib/feedback-page-url.ts
    acceptance:
      - 9
    risk: low
    size: s
    tier: mid
  - key: designer-feedback
    title: Add Designer AppBar Feedback dialog
    description: >
      Add Feedback on the DesignerWidget title-row AppBar, trailing side
      left of close (data-testid web-designer-feedback-button), visible on
      Design, Info, and Setup. MUI dialog stacked above the overlay.
      Submit source designer using the same web POST helper; do not PUT
      uiSpecification, discard the draft, or close the editor. Vitest the
      control and that the save mutation is not called.
    depends_on:
      - web-header-feedback
    files_hint:
      - web/src/designer/DesignerWidget.tsx
      - web/src/designer/DesignerWidget.test.tsx
      - web/src/components/feedback/feedback-dialog.tsx
    acceptance:
      - 10
    risk: med
    size: s
    tier: mid
  - key: app-feedback
    title: Add App drawer Feedback dialog
    description: >
      Add a signed-in-only Feedback item in the drawer bottom list next to
      About Build (data-testid app-feedback-button). Open a MUI dialog;
      POST via ListingFetch with source app and stripped pageUrl. Disable
      Send when useIsOnline is false; do not queue; keep mailto
      SupportEmail / About Build. Signed-out users must not see the item.
      Vitest auth visibility, offline disable, and source app.
    depends_on:
      - feedback-api
    files_hint:
      - app/src/gui/layout/appBar.tsx
      - app/src/gui/components/feedback/FeedbackDialog.tsx
      - app/src/gui/components/feedback/FeedbackDialog.test.tsx
      - app/src/utils/apiOperations/client.tsx
      - app/src/gui/components/footer/supportEmail.tsx
    acceptance:
      - 11
    risk: low
    size: s
    tier: mid
```
