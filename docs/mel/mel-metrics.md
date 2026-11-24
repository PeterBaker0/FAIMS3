---
title: 'DASS MEL metrics'
subtitle: 'Indicators, measures and proxy metrics for the NBIC MEL framework (first draft)'
date: 'November 2026'
---

# How to read this document

This is a first draft of the metrics the Disaster Assessment Surveyor System
(DASS) could contribute to the NBIC Monitoring, Evaluation and Learning (MEL)
framework. It is meant to be argued with: it deliberately lists more than we
can collect today, so that gaps are visible and can be prioritised.

Each MEL question is broken down in four levels:

- **Indicator**: an observable sign that the question is being answered well.
- **Measure**: a quantity or structured judgement against that indicator.
  Every measure states the **time span** it should be reported over.
- **Proxy metric**: something concrete we can count or collect that stands in
  for the measure. Every metric states its **source** and its **status**.

Metric status:

- **Now**: collectable today with no new work (beyond reading it off).
- **Derive**: the raw data exists, but needs a query, script or manual
  collation to produce the number.
- **Build**: needs new instrumentation, new metadata or a new process.

Identifiers like `1.2-A3` mean question 1.2, indicator A, measure 3. They are
there so discussion and the DAP dashboard can refer to a specific line.

## Time spans used

| Time span           | Meaning                                                            |
| ------------------- | ------------------------------------------------------------------ |
| Snapshot            | Value at the reporting date (for example, total registered users)  |
| Monthly / Quarterly | Count of things that happened within the period                    |
| Season              | Financial year, 1 July to 30 June (see the seasonality note below) |
| Per event           | Windows anchored to a fire event: before, response and recovery    |
| Rolling 12 months   | Smooths seasonality for trend lines                                |
| Cumulative          | Since DASS launch                                                  |
| Review cycle        | Per governance cycle (three per year) or per strategic review      |

**Seasonality.** DASS use is driven by fire events, so a quiet quarter is not
evidence of poor adoption. Southern Australia's fire season broadly runs
spring to autumn, while northern Australia's runs through the dry season
(roughly April to November). Most activity measures should therefore be
reported per season and per event, with monthly figures used only for
operational monitoring. Year-on-year comparisons should compare like seasons.

**Per-event windows.** Unless stated otherwise: _pre-event_ is the 90 days
before the event start date, _response_ is days 0 to 30, and _recovery_ is
days 31 to 180.

# Sources

The first group is the evidence sources named in the NBIC MEL framework. The
second group is sources that DASS (or the FAIMS3 code it runs) provides or
could provide.

## MEL framework sources

| Source                  | What it gives us                                                      |
| ----------------------- | --------------------------------------------------------------------- |
| Twenty CRM              | Engagement counts and organisations engaged (currently DASS only)     |
| DAP dashboard           | The quantitative spreadsheet; downloads and product totals            |
| Use case investigations | Qualitative accounts of adoption, reception and decision change       |
| MEL form                | On-demand qualitative input against any question                      |
| Activity lead meetings  | Mostly qualitative feedback; counts possible if responses are tallied |
| Leadership retros       | Team reflection on ways of working                                    |
| Governance meetings     | Board, council and technical meetings, three times a year             |
| Strategic review        | Annual or biannual synthesis of all of the above                      |

## DASS platform and delivery sources

| Source            | What it is                                                                                                                                                                                                                                                             | Limits today                                                                                                                                            |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin stats       | `GET /api/admin/stats` and the Control Centre Stats page. Counts of teams, users, surveys, templates, records, attachments, bytes, map layers, logged-in users, invites, API tokens and deleted surveys, with per-team and per-person breakdowns                       | Point-in-time only. No history unless we snapshot it                                                                                                    |
| CouchDB query     | Timestamps already stored on documents: survey and template `createdAt`/`createdBy`, team `createdAt`, record and revision `created`/`created_by`, invite redemptions (`uses[].usedAt`), map layer uploads, deleted-survey tombstones, API token `lastUsedTimestampMs` | Users have no created or last-login time. Expired tokens, invites, email codes and download grants are deleted by TTL cleanup, so their history is lost |
| Audit logs        | Structured JSON log lines: `[InviteAudit]` (create, lookup, consume, revoke), `[DownloadAudit]` (export minted and downloaded, with format), `[MapAssetProcessing]` (upload stages, timings, outcome), `[Impersonation]`                                               | CloudWatch log retention is one month. Year-on-year analysis needs export or longer retention                                                           |
| CloudWatch        | CouchDB dashboard and alarms (CPU, memory, disk, status, 5XX), load balancer request count and response time, ECS Container Insights, TTL cleanup failure alerts, AWS Backup jobs                                                                                      | No external uptime check. No CloudFront or load balancer access logs                                                                                    |
| Bugsnag           | Errors from the API, field app and Control Centre, with app version; version-mismatch events from the app                                                                                                                                                              | Errors only, not usage                                                                                                                                  |
| Feedback inbox    | In-app feedback (`POST /api/feedback`) emailed to support, with app version                                                                                                                                                                                            | Unstructured email; needs manual tagging                                                                                                                |
| App stores        | App Store Connect and Google Play Console: installs, active devices, ratings, reviews, crash rates, version spread                                                                                                                                                     | Native apps only; web users invisible                                                                                                                   |
| GitHub            | DASS fork and upstream FAIMS3: releases, changelog, issues, pull requests, milestones, Actions runs, deployments                                                                                                                                                       | Labelling conventions needed for some metrics                                                                                                           |
| AWS Cost Explorer | Infrastructure spend by service and month, for the DASS AWS account                                                                                                                                                                                                    | Needs cost allocation tags to split shared costs                                                                                                        |
| Project register  | NBIC milestone plan, risk register, action register, time or effort records                                                                                                                                                                                            | Whatever NBIC already uses; may need agreed fields                                                                                                      |
| Bibliometrics     | Publications, citations (FAIMS3 `CITATION.cff` DOIs), dataset DOIs, Google Scholar or Scopus                                                                                                                                                                           | Manual collation                                                                                                                                        |
| User survey       | **Build.** Short periodic survey of agency users and administrators (satisfaction, usability, perceived value), plus a standard post-event debrief                                                                                                                     | Does not exist yet. Could itself run as a DASS survey                                                                                                   |
| Client telemetry  | **Build.** Opt-in, privacy-preserving app signals: platform, app version, sync success, time from capture to sync, offline duration                                                                                                                                    | Does not exist. App version and platform currently stay on the device                                                                                   |
| Support desk      | **Build** (or adopt). A ticketing process with categories, so support load and themes can be counted                                                                                                                                                                   | Support is currently email-based                                                                                                                        |

## Principles for platform metrics

- **Counts, not content.** Agencies own their data. Platform metrics should
  use document metadata (timestamps, counts, which template a survey came
  from), not the contents of records. Any metric that looks inside records
  (for example, field completeness) should be agreed with data custodians
  first and reported only in aggregate.
- **Aggregate and suppress.** Report geography at state or territory level at
  most. Suppress any cell with fewer than five agencies or users when it is
  shared beyond the DASS team.
- **DASS only.** Fieldmark is a separate deployment. All platform metrics must
  come from the DASS AWS environment only.
- **Record a baseline.** Several measures compare against "how agencies did
  this before DASS". That baseline must be captured at onboarding, because it
  cannot be reconstructed later.

# Theme 1: Adoption {.theme}

## 1.1 Decision-making before and after events

> How have NBIC tools, services and products strengthened stakeholders'
> decision-making by improving their ability to (A) plan more effectively
> before events, in the long and medium term, and (B) capture lessons-learned
> data and recover more efficiently after events?

DASS is primarily a post-event tool, so its strongest evidence is under (B).
Its contribution to (A) is indirect: agencies being ready to survey before a
season starts, and DASS data feeding the models and plans used for
preparedness.

### Indicator 1.1-A: Agencies are prepared to survey before events

#### 1.1-A1 Pre-season readiness

**Time span:** snapshot at the start of each jurisdiction's fire season,
compared season on season.

Share of onboarded agencies that, before the season starts, have an active
team, a configured survey based on a current national template, trained users
and any needed map layers loaded.

| Proxy metric                                                           | Source                     | Status |
| ---------------------------------------------------------------------- | -------------------------- | ------ |
| Teams with at least one non-archived survey                            | Admin stats, CouchDB query | Derive |
| Surveys created or updated in the 90 days before season start, by team | CouchDB query              | Derive |
| Map layers uploaded in the 90 days before season start, by team        | CouchDB query              | Derive |
| Invites redeemed (new users joining) before season start, by team      | CouchDB query              | Derive |
| Training sessions and exercises run with agencies                      | Twenty CRM, activity leads | Now    |
| Records created in surveys marked as training or exercise              | Survey purpose flag        | Build  |

#### 1.1-A2 DASS data used in planning and preparedness

**Time span:** annual, synthesised at the strategic review.

Count and description of preparedness products (risk models, planning
reports, building-standard inputs, training material) that use DASS data.

| Proxy metric                                                           | Source                            | Status |
| ---------------------------------------------------------------------- | --------------------------------- | ------ |
| Documented cases of DASS data used in models, plans or standards       | Use case investigations, MEL form | Now    |
| Exports from DASS by format and team (a proxy for downstream use)      | Audit logs (`[DownloadAudit]`)    | Derive |
| API tokens in active use for system integration (used in last 90 days) | Admin stats, CouchDB query        | Derive |
| Reports and publications citing DASS data                              | Bibliometrics, MEL form           | Derive |

### Indicator 1.1-B: Impact data is captured faster, more consistently and more completely after events

#### 1.1-B1 Speed of deployment

**Time span:** per event, then summarised per season.

Days from the event start (or from access being permitted) to the first
record, and to the bulk of records, for that event.

| Proxy metric                                                  | Source                                | Status |
| ------------------------------------------------------------- | ------------------------------------- | ------ |
| First and last record `created` time per survey               | CouchDB query                         | Derive |
| Survey creation date relative to event date                   | CouchDB query plus event register     | Derive |
| Event register: event name, start date, affected area, agency | Event tag on surveys or NBIC register | Build  |
| Days to reach 50% and 90% of the event's final record count   | CouchDB query plus event register     | Build  |

#### 1.1-B2 Field throughput and completeness

**Time span:** per event (response window), then per season.

How much is captured per surveyor, and how complete each record is.

| Proxy metric                                       | Source                       | Status |
| -------------------------------------------------- | ---------------------------- | ------ |
| Records per active surveyor per field day          | CouchDB query                | Derive |
| Attachments (photos) per record                    | Admin stats, CouchDB query   | Derive |
| Share of records with a location captured          | CouchDB query (agreed)       | Derive |
| Share of records passing all required-field checks | Validation status on records | Build  |
| Number of revisions per record (rework indicator)  | CouchDB query                | Derive |

#### 1.1-B3 Consistency across agencies and events

**Time span:** per season, and cumulative.

How far collected data follows the national templates, which is what makes it
comparable across time and jurisdictions.

| Proxy metric                                                                      | Source                           | Status |
| --------------------------------------------------------------------------------- | -------------------------------- | ------ |
| Share of active surveys created from a national template                          | CouchDB query plus national flag | Build  |
| Distinct template variants in use for the same purpose                            | CouchDB query                    | Derive |
| Template drift: fields added, removed or changed relative to the national version | Template lineage and version     | Build  |
| Share of records collected in surveys aligned to the current data standard        | CouchDB query plus lineage       | Build  |

#### 1.1-B4 Time to usable data

**Time span:** per event.

Time from capture in the field to data being on the server, and then to data
being exported or handed to decision makers.

| Proxy metric                                                | Source                                 | Status |
| ----------------------------------------------------------- | -------------------------------------- | ------ |
| Time from record creation to arrival on the server          | Server receipt timestamp, or telemetry | Build  |
| Time from event start to first export of that survey's data | Audit logs plus event register         | Derive |
| Number of exports during the response and recovery windows  | Audit logs                             | Derive |

CouchDB does not record when a document arrived on the server, so capture-to-
sync time needs either a server-side receipt stamp or client telemetry.

#### 1.1-B5 Decisions informed by DASS data

**Time span:** per event (debrief), synthesised annually.

Documented instances where DASS data changed or informed a decision, such as
recovery resourcing, community information, building-assessment
prioritisation or a lessons-learned review.

| Proxy metric                                                           | Source                               | Status |
| ---------------------------------------------------------------------- | ------------------------------------ | ------ |
| Use case accounts of decision change, tagged to 1.1(A) or 1.1(B)       | Use case investigations, MEL form    | Now    |
| Post-event debrief responses ("did DASS data inform a decision?")      | User survey (debrief)                | Build  |
| Lessons-learned or after-action reviews that cite DASS data            | Activity leads, governance, MEL form | Derive |
| Mentions in activity lead and governance meetings, tallied against 1.1 | Activity leads, governance           | Derive |

#### 1.1-B6 Effort compared with previous methods

**Time span:** baseline at onboarding, then per season.

Agency-reported time and effort per assessment compared with their pre-DASS
process (paper, spreadsheets or bespoke apps).

| Proxy metric                                                    | Source                               | Status |
| --------------------------------------------------------------- | ------------------------------------ | ------ |
| Baseline time per assessment and to compile a report, pre-DASS  | Onboarding interview                 | Build  |
| Reported time per assessment and to compile a report, with DASS | User survey, use case investigations | Build  |
| Median minutes between consecutive records by one surveyor      | CouchDB query                        | Derive |

## 1.2 Extent of adoption

> What evidence do we have for the extent to which NBIC data, tools, products
> and services have been adopted? (Includes use cases.)

### Indicator 1.2-A: Agencies and jurisdictions have taken up DASS

#### 1.2-A1 Agencies onboarded

**Time span:** quarterly snapshot; cumulative.

Agencies with a DASS team, against the target of all relevant State and
Territory stakeholders.

| Proxy metric                                           | Source                    | Status |
| ------------------------------------------------------ | ------------------------- | ------ |
| Number of teams                                        | Admin stats               | Now    |
| Teams mapped to agency, jurisdiction and sector        | Team metadata or CRM link | Build  |
| Organisations at "onboarded" stage in the CRM pipeline | Twenty CRM                | Derive |
| Onboarded agencies as a share of the target list       | Twenty CRM plus team map  | Build  |

#### 1.2-A2 Active agencies

**Time span:** per season (primary) and quarterly (operational).

Agencies that created records in the period.

| Proxy metric                                         | Source                | Status |
| ---------------------------------------------------- | --------------------- | ------ |
| Teams with at least one record created in the period | CouchDB query         | Derive |
| Change in per-team record counts between snapshots   | Admin stats snapshots | Build  |
| Teams with surveys created or updated in the period  | CouchDB query         | Derive |

#### 1.2-A3 Jurisdictional coverage

**Time span:** per season; cumulative.

| Proxy metric                                                     | Source                 | Status |
| ---------------------------------------------------------------- | ---------------------- | ------ |
| States and territories with at least one active agency           | Team metadata          | Build  |
| Records by state or territory (from record location, aggregated) | CouchDB query (agreed) | Derive |

### Indicator 1.2-B: People are using DASS

#### 1.2-B1 Registered users

**Time span:** quarterly snapshot; new users per quarter.

| Proxy metric                                              | Source                     | Status |
| --------------------------------------------------------- | -------------------------- | ------ |
| Total registered users; disabled users                    | Admin stats                | Now    |
| New users per period (first invite redemption as a proxy) | CouchDB query              | Derive |
| User account creation date (not stored today)             | `createdAt` on user record | Build  |

#### 1.2-B2 Active users

**Time span:** monthly (operational); per season and per event (reporting).

| Proxy metric                                        | Source                       | Status |
| --------------------------------------------------- | ---------------------------- | ------ |
| Distinct users who created records in the period    | CouchDB query                | Derive |
| Users currently logged in (holding a valid session) | Admin stats                  | Now    |
| Users who signed in during the period               | `lastLoginAt` on user record | Build  |
| Peak concurrent field users during an event         | CouchDB query                | Derive |

#### 1.2-B3 Devices and platforms

**Time span:** quarterly.

| Proxy metric                                 | Source                                              | Status |
| -------------------------------------------- | --------------------------------------------------- | ------ |
| Installs and active devices, iOS and Android | App stores                                          | Now    |
| Split of native app and web use              | Client telemetry, or server-side record of platform | Build  |
| App version spread among active users        | Bugsnag (partial), client telemetry                 | Build  |

#### 1.2-B4 Retention

**Time span:** season on season.

| Proxy metric                                                           | Source        | Status |
| ---------------------------------------------------------------------- | ------------- | ------ |
| Share of agencies active last season that are active again this season | CouchDB query | Derive |
| Share of users active last season that are active again this season    | CouchDB query | Derive |

### Indicator 1.2-C: DASS is used in depth, not just tried

#### 1.2-C1 Volume

**Time span:** snapshot each quarter; additions per season.

| Proxy metric                                                   | Source                | Status |
| -------------------------------------------------------------- | --------------------- | ------ |
| Surveys (active and archived), templates, records, attachments | Admin stats           | Now    |
| Data stored (bytes) overall and per team                       | Admin stats           | Now    |
| The same figures as a time series                              | Admin stats snapshots | Build  |

#### 1.2-C2 Feature breadth

**Time span:** per season.

Which platform features agencies actually use: photos, map layers, spatial
features, related records, conditional logic, helper text, exports and API
integration.

| Proxy metric                                                                       | Source                     | Status |
| ---------------------------------------------------------------------------------- | -------------------------- | ------ |
| Map layers and their storage, per team                                             | Admin stats                | Now    |
| Share of active surveys whose templates use each feature (from template structure) | Template analysis script   | Derive |
| Share of questions with helper text in active templates                            | Template analysis script   | Derive |
| Exports by format (CSV, attachments zip, GeoJSON, KML, GeoPackage)                 | Audit logs                 | Derive |
| Active API tokens and when last used                                               | Admin stats, CouchDB query | Derive |

#### 1.2-C3 Uptake of the national template library and designer

**Time span:** per season.

| Proxy metric                                        | Source                           | Status |
| --------------------------------------------------- | -------------------------------- | ------ |
| Surveys created from each national template         | CouchDB query plus national flag | Build  |
| Agencies that customised a template in the designer | CouchDB query                    | Derive |
| Templates created or edited per season, by team     | CouchDB query                    | Derive |

#### 1.2-C4 Collaboration on the platform

**Time span:** per season.

| Proxy metric                                                     | Source           | Status |
| ---------------------------------------------------------------- | ---------------- | ------ |
| Surveys with members from more than one team                     | CouchDB query    | Derive |
| Templates reused by a team other than the one that authored them | Template lineage | Build  |

### Indicator 1.2-D: Use cases are documented

#### 1.2-D1 Documented use cases

**Time span:** annual; cumulative.

Number and type of use cases: post-fire impact assessment, research,
training and exercises, and any other hazards (for example flood or storm).

| Proxy metric                                                  | Source                            | Status |
| ------------------------------------------------------------- | --------------------------------- | ------ |
| Use cases by type and jurisdiction                            | Use case investigations, MEL form | Now    |
| Surveys by declared purpose (operational, exercise, research) | Survey purpose flag               | Build  |

## 1.3 Reception after adoption

> What has been the reception of NBIC tools, products and services once
> adopted?

The framework notes it is unclear whether pain points are collected. This
draft recommends collecting them explicitly (indicator 1.3-C).

### Indicator 1.3-A: Users are satisfied and find DASS usable

#### 1.3-A1 Satisfaction

**Time span:** per season (post-season survey) and per event (debrief).

| Proxy metric                                                   | Source                            | Status |
| -------------------------------------------------------------- | --------------------------------- | ------ |
| Satisfaction (CSAT) and likelihood to recommend (NPS), by role | User survey                       | Build  |
| App store ratings and review themes                            | App stores                        | Now    |
| Qualitative satisfaction statements                            | Use case investigations, MEL form | Now    |

#### 1.3-A2 Usability and onboarding

**Time span:** per season; onboarding measures per agency.

| Proxy metric                                                             | Source                    | Status |
| ------------------------------------------------------------------------ | ------------------------- | ------ |
| System Usability Scale (SUS) score                                       | User survey               | Build  |
| Onboarding funnel: invites created, redeemed, then first record per user | Audit logs, CouchDB query | Derive |
| Median days from a user's first invite redemption to their first record  | CouchDB query             | Derive |
| Expired invites never redeemed                                           | Audit logs                | Derive |

### Indicator 1.3-B: DASS is reliable in the field

#### 1.3-B1 Errors and crashes

**Time span:** monthly (operational); per season and per event (reporting).

| Proxy metric                               | Source                 | Status |
| ------------------------------------------ | ---------------------- | ------ |
| Crash-free users and sessions, by platform | Bugsnag, app stores    | Now    |
| Errors per 1,000 records created           | Bugsnag, CouchDB query | Derive |
| New error types introduced per release     | Bugsnag                | Now    |

#### 1.3-B2 Sync and data safety

**Time span:** per event; per season.

| Proxy metric                                | Source                       | Status |
| ------------------------------------------- | ---------------------------- | ------ |
| Sync attempts and success rate              | Client telemetry             | Build  |
| Longest time a device held unsynced records | Client telemetry             | Build  |
| Reported data-loss incidents (target: zero) | Support desk, feedback inbox | Derive |
| Records with edit conflicts                 | CouchDB query                | Derive |

#### 1.3-B3 Service availability

**Time span:** monthly; per event (availability during response windows).

| Proxy metric                                                | Source                   | Status |
| ----------------------------------------------------------- | ------------------------ | ------ |
| API availability from an external uptime check              | Uptime monitor           | Build  |
| Load balancer healthy hosts, 5XX rate and p95 response time | CloudWatch               | Now    |
| Incidents and alarm events per month                        | CloudWatch, incident log | Derive |

#### 1.3-B4 Map layer processing

**Time span:** quarterly.

| Proxy metric                            | Source                              | Status |
| --------------------------------------- | ----------------------------------- | ------ |
| Upload success rate and failure reasons | Audit logs (`[MapAssetProcessing]`) | Derive |
| Processing time by file size and format | Audit logs (`[MapAssetProcessing]`) | Derive |

### Indicator 1.3-C: Pain points are surfaced and acted on

#### 1.3-C1 Feedback and requests

**Time span:** monthly volume; quarterly themes.

| Proxy metric                                      | Source               | Status |
| ------------------------------------------------- | -------------------- | ------ |
| In-app feedback messages, tagged by theme         | Feedback inbox       | Derive |
| Support requests per active agency, by category   | Support desk         | Build  |
| Issues raised from DASS feedback, open and closed | GitHub (label)       | Derive |
| Median time to resolve reported problems          | GitHub, support desk | Derive |

#### 1.3-C2 Disengagement signals

**Time span:** per season.

| Proxy metric                                                   | Source                       | Status |
| -------------------------------------------------------------- | ---------------------------- | ------ |
| Agencies with no activity for a full season after being active | CouchDB query                | Derive |
| Deleted surveys and disabled users                             | Admin stats                  | Now    |
| Stated reasons for disengagement                               | Use case investigations, CRM | Derive |

#### 1.3-C3 Advocacy

**Time span:** annual.

| Proxy metric                                         | Source                   | Status |
| ---------------------------------------------------- | ------------------------ | ------ |
| Agencies referred by another agency                  | Twenty CRM               | Build  |
| Unsolicited endorsements and requests to extend DASS | Activity leads, MEL form | Derive |

# Theme 2: Deliverables {.theme}

## 2.1 Delivering agreed outputs on time

> How is NBIC tracking to deliver our agreed-upon outputs on time?

### Indicator 2.1-A: Milestones are delivered as planned

#### 2.1-A1 Milestone delivery rate

**Time span:** quarterly; reported each governance cycle.

| Proxy metric                                              | Source           | Status |
| --------------------------------------------------------- | ---------------- | ------ |
| Share of milestones delivered on or before their due date | Project register | Derive |
| Days of slippage on late milestones                       | Project register | Derive |
| Milestones re-baselined in the period                     | Project register | Derive |
| GitHub milestone completion against due date              | GitHub           | Derive |

#### 2.1-A2 Release cadence

**Time span:** quarterly.

| Proxy metric                                                       | Source     | Status |
| ------------------------------------------------------------------ | ---------- | ------ |
| Releases deployed to DASS per quarter                              | GitHub     | Derive |
| Days between an upstream FAIMS3 release and its deployment to DASS | GitHub     | Derive |
| App store submission-to-approval time                              | App stores | Derive |

### Indicator 2.1-B: The delivery process is healthy

#### 2.1-B1 Delivery performance (DORA measures)

**Time span:** monthly, trended quarterly.

| Proxy metric                                                | Source                   | Status |
| ----------------------------------------------------------- | ------------------------ | ------ |
| Deployment frequency                                        | GitHub Actions           | Derive |
| Lead time from pull request opened to deployed              | GitHub                   | Derive |
| Change failure rate (releases needing a hotfix or rollback) | GitHub, incident log     | Derive |
| Time to restore service after an incident                   | Incident log, CloudWatch | Derive |

#### 2.1-B2 Backlog health

**Time span:** monthly snapshot.

| Proxy metric                           | Source | Status |
| -------------------------------------- | ------ | ------ |
| Open bugs by severity and age          | GitHub | Derive |
| Planned versus completed roadmap items | GitHub | Derive |

### Indicator 2.1-C: Delivery risks are visible

#### 2.1-C1 Risks and dependencies

**Time span:** each governance cycle.

| Proxy metric                                                         | Source           | Status |
| -------------------------------------------------------------------- | ---------------- | ------ |
| Open and overdue risks, by rating                                    | Project register | Derive |
| Items blocked on external dependencies (agencies, vendors, upstream) | GitHub, register | Derive |

## 2.2 Deliverables meeting expectations

> Are deliverables meeting our expectations, and those of our stakeholders?

### Indicator 2.2-A: Deliverables meet quality requirements

#### 2.2-A1 Acceptance and escaped defects

**Time span:** per release, summarised quarterly.

| Proxy metric                                           | Source                       | Status |
| ------------------------------------------------------ | ---------------------------- | ------ |
| Share of deliverables accepted without rework          | Project register, governance | Derive |
| Bugs reported within 30 days of a release, per release | GitHub, Bugsnag              | Derive |
| CI and end-to-end test pass rate on the release branch | GitHub Actions               | Now    |

#### 2.2-A2 Security, sovereignty and resilience

**Time span:** quarterly; annual attestation.

| Proxy metric                                                 | Source                               | Status |
| ------------------------------------------------------------ | ------------------------------------ | ------ |
| Open dependency vulnerabilities by severity; time to patch   | GitHub security alerts, `pnpm audit` | Derive |
| Security review or penetration test findings open and closed | Project register                     | Derive |
| All data stores confirmed in Australian regions              | AWS configuration review             | Derive |
| Successful backup jobs; date of last tested restore          | CloudWatch (AWS Backup), restore log | Derive |

#### 2.2-A3 Service levels

**Time span:** monthly.

| Proxy metric                                                     | Source         | Status |
| ---------------------------------------------------------------- | -------------- | ------ |
| Availability against the agreed target                           | Uptime monitor | Build  |
| p95 API response time                                            | CloudWatch     | Now    |
| Recovery point and recovery time objectives met in restore tests | Restore log    | Build  |

### Indicator 2.2-B: Stakeholders find deliverables fit for purpose

#### 2.2-B1 Stakeholder assessment

**Time span:** each governance cycle; annual survey.

| Proxy metric                                                           | Source                           | Status |
| ---------------------------------------------------------------------- | -------------------------------- | ------ |
| Stakeholder rating of recent deliverables                              | User survey, governance meetings | Build  |
| Stakeholder requests delivered or closed, as a share of those received | Twenty CRM, GitHub (label)       | Derive |

#### 2.2-B2 Uptake of new features

**Time span:** 90 days after each feature release.

| Proxy metric                                             | Source                           | Status |
| -------------------------------------------------------- | -------------------------------- | ------ |
| Share of active teams using a new feature within 90 days | CouchDB query, template analysis | Derive |

### Indicator 2.2-C: The data produced meets the national data goal

#### 2.2-C1 National dataset quality

**Time span:** per season.

This is the outcome DASS exists for: consistent, comparable impact data.

| Proxy metric                                                | Source                          | Status |
| ----------------------------------------------------------- | ------------------------------- | ------ |
| Share of records conforming to the national data standard   | Template lineage, CouchDB query | Build  |
| Field completeness for the national core fields (aggregate) | CouchDB query (agreed)          | Derive |
| Agencies contributing data to a cross-jurisdiction dataset  | Data sharing register           | Build  |

# Theme 3: Engagement {.theme}

## 3.1 Engagement with science

> How has NBIC engaged with science, or the scientific community, to create or
> contribute to new science, including methodologies, data layers and others?

### Indicator 3.1-A: DASS produces scientific outputs

#### 3.1-A1 Publications and citations

**Time span:** annual; cumulative.

| Proxy metric                                                         | Source                  | Status |
| -------------------------------------------------------------------- | ----------------------- | ------ |
| Papers, reports and presentations describing DASS or using DASS data | Bibliometrics, MEL form | Derive |
| Citations of the FAIMS3 software DOI and DASS outputs                | Bibliometrics           | Derive |

#### 3.1-A2 Data layers and datasets

**Time span:** annual; cumulative.

| Proxy metric                                                             | Source                       | Status |
| ------------------------------------------------------------------------ | ---------------------------- | ------ |
| Derived datasets or data layers published (with DOIs) that use DASS data | DAP dashboard, bibliometrics | Derive |
| Downloads of those datasets                                              | DAP dashboard                | Now    |

### Indicator 3.1-B: DASS contributes methods and standards

#### 3.1-B1 National templates and data standards

**Time span:** per review cycle.

| Proxy metric                                                      | Source                           | Status |
| ----------------------------------------------------------------- | -------------------------------- | ------ |
| National templates published, and versions released               | CouchDB query plus national flag | Build  |
| Agencies using each national template                             | CouchDB query plus national flag | Build  |
| Damage-classification or assessment methods developed or endorsed | Governance, MEL form             | Derive |

#### 3.1-B2 Open-source contribution

**Time span:** quarterly.

| Proxy metric                                                 | Source | Status |
| ------------------------------------------------------------ | ------ | ------ |
| Pull requests from the DASS team merged into upstream FAIMS3 | GitHub | Derive |
| Commits the DASS fork is ahead of or behind upstream         | GitHub | Derive |
| External contributors, forks and other deployments of FAIMS3 | GitHub | Now    |

### Indicator 3.1-C: Researchers use the platform and data

#### 3.1-C1 Research use

**Time span:** annual.

| Proxy metric                                                        | Source                       | Status |
| ------------------------------------------------------------------- | ---------------------------- | ------ |
| Research teams using DASS                                           | Team metadata, Twenty CRM    | Build  |
| Data access requests for research, and time to fulfil               | Data access request register | Build  |
| Models or analyses fed by DASS data (for example house-loss models) | Use case investigations      | Now    |
| Co-authored outputs with agencies or universities                   | Bibliometrics                | Derive |

## 3.2 External stakeholders and business opportunities

> How has NBIC engaged external stakeholders and business opportunities,
> including Indigenous stakeholders?

### Indicator 3.2-A: Engagement is broad and growing

#### 3.2-A1 Engagements and organisations

**Time span:** quarterly; cumulative.

| Proxy metric                                                                 | Source     | Status |
| ---------------------------------------------------------------------------- | ---------- | ------ |
| Engagements and organisations engaged, by sector and jurisdiction            | Twenty CRM | Now    |
| New versus returning organisations                                           | Twenty CRM | Derive |
| Training sessions, webinars and conference activities, with attendee numbers | Twenty CRM | Derive |

#### 3.2-A2 Depth of engagement

**Time span:** quarterly snapshot.

Movement along a pipeline: aware, demonstrated, trialling, onboarded, active,
advocate. "Active" can be set automatically from platform data once teams are
linked to CRM organisations.

| Proxy metric                                    | Source                        | Status |
| ----------------------------------------------- | ----------------------------- | ------ |
| Organisations at each pipeline stage            | Twenty CRM (stages)           | Build  |
| Conversion rate and median time between stages  | Twenty CRM                    | Build  |
| CRM organisations linked to an active DASS team | Twenty CRM plus team metadata | Build  |

### Indicator 3.2-B: Agencies collaborate through DASS

#### 3.2-B1 Cross-agency collaboration

**Time span:** per season.

| Proxy metric                                                    | Source                           | Status |
| --------------------------------------------------------------- | -------------------------------- | ------ |
| Surveys with users from more than one agency                    | CouchDB query plus team metadata | Derive |
| Templates shared between agencies                               | Template lineage                 | Build  |
| Data-sharing agreements between agencies that involve DASS data | Agreements register              | Build  |

### Indicator 3.2-C: Indigenous stakeholders are engaged on their terms

Measures here should be designed with Indigenous partners and follow the CARE
principles for Indigenous data governance. Counts are a weak proxy; the
qualitative account matters more.

#### 3.2-C1 Engagement with Indigenous organisations

**Time span:** quarterly counts; annual narrative.

| Proxy metric                                                                   | Source                  | Status |
| ------------------------------------------------------------------------------ | ----------------------- | ------ |
| Engagements with Indigenous organisations, ranger groups or Traditional Owners | Twenty CRM (sector tag) | Derive |
| Indigenous ranger or community teams onboarded and active                      | Team metadata           | Build  |
| Templates or fields co-designed with Indigenous partners                       | Governance, MEL form    | Derive |
| Data governance agreements reflecting Indigenous data sovereignty              | Agreements register     | Build  |
| Partner accounts of the engagement                                             | Use case investigations | Now    |

### Indicator 3.2-D: DASS creates business and partnership opportunities

#### 3.2-D1 Opportunities and partnerships

**Time span:** annual; per review cycle.

| Proxy metric                                                        | Source                           | Status |
| ------------------------------------------------------------------- | -------------------------------- | ------ |
| Partnership, funding or co-investment proposals, and their value    | Twenty CRM, project register     | Derive |
| MoUs and data-sharing agreements signed                             | Agreements register              | Build  |
| Requests to extend DASS to other hazards or uses                    | Twenty CRM, MEL form             | Derive |
| Infrastructure cost per active agency (for sustainability planning) | AWS Cost Explorer, CouchDB query | Derive |

# Theme 4: Operations {.theme}

## 4.1 Effective ways of working

> Are NBIC's ways of working (meetings, governance, collaboration,
> communication and so on) effective in supporting NBIC to achieve its goals?
> If not, what is ineffective and what must we do differently?

### Indicator 4.1-A: Meetings and governance lead to decisions and actions

#### 4.1-A1 Action follow-through

**Time span:** per meeting; quarterly roll-up.

| Proxy metric                                                 | Source             | Status |
| ------------------------------------------------------------ | ------------------ | ------ |
| Actions recorded per meeting and share completed by due date | Action register    | Derive |
| Decisions logged per governance meeting                      | Governance minutes | Derive |
| Attendance of key roles                                      | Meeting records    | Derive |

### Indicator 4.1-B: The team finds its ways of working effective

#### 4.1-B1 Team perception

**Time span:** per retro; quarterly trend.

| Proxy metric                                                       | Source            | Status |
| ------------------------------------------------------------------ | ----------------- | ------ |
| Pulse rating of meetings, communication and collaboration (1 to 5) | Leadership retros | Build  |
| Recurring retro themes, and share resolved within two retros       | Leadership retros | Derive |

### Indicator 4.1-C: Collaboration across partners works

#### 4.1-C1 Code collaboration across CSIRO, Macquarie and EFN

**Time span:** monthly.

| Proxy metric                                         | Source | Status |
| ---------------------------------------------------- | ------ | ------ |
| Median time to first review on pull requests         | GitHub | Derive |
| Pull requests reviewed across organisations          | GitHub | Derive |
| Divergence between the DASS fork and upstream FAIMS3 | GitHub | Derive |

### Indicator 4.1-D: Operational processes work under pressure

#### 4.1-D1 Incident and support response

**Time span:** monthly; per event.

| Proxy metric                                            | Source                   | Status |
| ------------------------------------------------------- | ------------------------ | ------ |
| Time to acknowledge and to resolve alarms and incidents | CloudWatch, incident log | Derive |
| Post-incident reviews completed                         | Incident log             | Derive |
| Support requests answered within the agreed time        | Support desk             | Build  |

## 4.2 Benefit compared with time, resources and workload

> Are NBIC's current ways of working providing reasonable benefit when
> evaluated against associated time, resources and workload required?

### Indicator 4.2-A: Running DASS is cost-efficient

#### 4.2-A1 Infrastructure cost

**Time span:** monthly; annual total.

| Proxy metric                                                | Source                         | Status |
| ----------------------------------------------------------- | ------------------------------ | ------ |
| Monthly AWS spend for DASS, by service                      | AWS Cost Explorer              | Now    |
| Cost per active agency, per 1,000 records and per GB stored | AWS Cost Explorer, admin stats | Derive |

### Indicator 4.2-B: Effort is proportionate to benefit

#### 4.2-B1 Effort by activity

**Time span:** quarterly.

| Proxy metric                                                                      | Source           | Status |
| --------------------------------------------------------------------------------- | ---------------- | ------ |
| Effort split across development, support, onboarding, engagement, governance, MEL | Project register | Build  |
| Engineering effort on fork maintenance and upstream merges versus new features    | GitHub (labels)  | Derive |

#### 4.2-B2 Support and onboarding load

**Time span:** quarterly; per agency onboarded.

| Proxy metric                                                     | Source                      | Status |
| ---------------------------------------------------------------- | --------------------------- | ------ |
| Support requests per active agency and per active user           | Support desk, CouchDB query | Build  |
| Staff hours to onboard an agency                                 | Project register            | Build  |
| Agencies onboarded with no hands-on support (self-service share) | Twenty CRM                  | Derive |

#### 4.2-B3 Cost of MEL itself

**Time span:** annual.

| Proxy metric                                                            | Source           | Status |
| ----------------------------------------------------------------------- | ---------------- | ------ |
| Hours spent collecting and reporting MEL data                           | Project register | Build  |
| Share of these metrics produced automatically (Now and scripted Derive) | This document    | Derive |

### Indicator 4.2-C: Agencies get value for their effort

#### 4.2-C1 Agency-side benefit

**Time span:** annual.

| Proxy metric                                                        | Source                               | Status |
| ------------------------------------------------------------------- | ------------------------------------ | ------ |
| Reported time saved per assessment and per post-event report        | User survey, use case investigations | Build  |
| Licence costs avoided (active users times a typical per-seat price) | Admin stats plus stated assumption   | Derive |

## 4.3 Clarity of purpose and contribution to mission

> Do we have a clear understanding of what we're doing, and how our ways of
> working are contributing to NBIC's current and future mission?

### Indicator 4.3-A: The team understands how its work contributes

#### 4.3-A1 Shared understanding

**Time span:** twice yearly.

| Proxy metric                                                              | Source            | Status |
| ------------------------------------------------------------------------- | ----------------- | ------ |
| Share agreeing "I understand how my work contributes to the NBIC mission" | Team pulse survey | Build  |
| Consistency of team members' one-line description of DASS's purpose       | Leadership retros | Derive |

### Indicator 4.3-B: Work is traceable to strategy

#### 4.3-B1 Traceability

**Time span:** quarterly.

| Proxy metric                                                      | Source                    | Status |
| ----------------------------------------------------------------- | ------------------------- | ------ |
| Share of roadmap items linked to a strategic objective or outcome | GitHub (labels), register | Build  |
| Roadmap and theory of change reviewed within the last 12 months   | Strategic review          | Derive |

### Indicator 4.3-C: MEL findings change what we do

#### 4.3-C1 Learning loop

**Time span:** annual, at the strategic review.

| Proxy metric                                                 | Source                            | Status |
| ------------------------------------------------------------ | --------------------------------- | ------ |
| MEL findings that led to a recorded action or roadmap change | Strategic review, action register | Derive |
| Stakeholder endorsement of the roadmap                       | Governance meetings               | Derive |

# Instrumentation gaps {.theme}

These **Build** items unlock the most metrics. They are listed roughly by
value for effort. Most would land upstream in FAIMS3 behind DASS
configuration.

| #   | Gap                                                                                                | Unlocks                             | Effort |
| --- | -------------------------------------------------------------------------------------------------- | ----------------------------------- | ------ |
| 1   | Scheduled snapshot of admin stats (for example monthly) to S3 or a CouchDB database                | Every trend line in 1.2 and 4.2     | Low    |
| 2   | Keep audit logs longer than one month (export to S3, or longer CloudWatch retention)               | Exports, invites, map layer metrics | Low    |
| 3   | Metrics extraction script that writes the **Derive** platform metrics to CSV for the DAP dashboard | Most of themes 1 and 2              | Medium |
| 4   | Team metadata: agency, jurisdiction, sector (including Indigenous organisation) and purpose        | 1.2-A, 3.1-C, 3.2                   | Low    |
| 5   | User `createdAt` and `lastLoginAt`                                                                 | 1.2-B                               | Low    |
| 6   | Survey metadata: event tag (name, start date, area) and purpose (operational, exercise, research)  | 1.1-A1, 1.1-B, 1.2-D                | Medium |
| 7   | National template flag, plus template lineage and version recorded when a survey is created        | 1.1-B3, 1.2-C3, 2.2-C, 3.1-B        | Medium |
| 8   | Server-side record of app version and platform when a client refreshes its session (aggregated)    | 1.2-B3, version-support decisions   | Low    |
| 9   | External uptime monitor on the API and apps                                                        | 1.3-B3, 2.2-A3                      | Low    |
| 10  | Opt-in, privacy-preserving client telemetry for sync success and capture-to-sync time              | 1.1-B4, 1.3-B2                      | High   |
| 11  | Standard post-event debrief and post-season user survey (could run as DASS surveys)                | 1.1-B5, 1.1-B6, 1.3-A, 4.2-C        | Medium |
| 12  | Support desk with categories, and GitHub labels linking issues to stakeholders and strategy        | 1.3-C, 2.2-B, 4.2-B, 4.3-B          | Low    |
| 13  | CRM pipeline stages and a link from CRM organisations to DASS teams                                | 3.2-A2, 1.2-A1                      | Low    |
| 14  | Baseline interview at onboarding (previous method, time and cost)                                  | 1.1-B6, 4.2-C                       | Low    |

# Reporting rhythm

How the metrics above could feed each MEL activity.

| MEL activity           | Cadence            | Metrics to bring                                                                                   |
| ---------------------- | ------------------ | -------------------------------------------------------------------------------------------------- |
| DAP dashboard          | Monthly refresh    | All **Now** and scripted **Derive** platform counts: teams, users, records, exports, errors, cost  |
| Activity lead meetings | Monthly or as held | Operational view: active agencies and users, incidents, feedback themes, delivery status           |
| Leadership retros      | Per retro          | Ways-of-working pulse, action follow-through, effort split                                         |
| Governance meetings    | Three times a year | Milestones and risks, adoption trends, stakeholder engagement, service levels, security posture    |
| Per event              | After each event   | Speed of deployment, throughput, time to usable data, debrief responses, availability during event |
| Strategic review       | Annual or biannual | Season-on-season trends, use case synthesis, decision-change evidence, value for effort, gaps list |

# Open questions

- **DAP.** Confirm what the DAP dashboard covers, and whether DASS platform
  counts should be pushed into it or kept alongside it.
- **Events.** Is there an authoritative register of fire events (for example
  from agencies or AFAC) that surveys could be linked to, or should DASS
  capture the event on the survey itself?
- **National templates.** How is "endorsed national template" decided today,
  and who maintains the list? This determines how the national flag (gap 7)
  is set.
- **Targets.** What is the target list of agencies per jurisdiction for
  measuring coverage (1.2-A1)?
- **Custodian consent.** Which metrics that look inside records (location,
  completeness) are acceptable to agencies, and does that need to be written
  into data agreements?
- **CRM scope.** The framework notes Twenty CRM is currently DASS only. If it
  expands to other NBIC products, DASS engagements need a consistent product
  tag.
