---
title: 'DASS MEL metrics'
subtitle: 'Indicators, measures and proxy metrics for the NBIC MEL framework (draft 2)'
date: 'November 2026'
---

# How to read this document

Each MEL question is broken down in four levels:

- **Indicator**: an observable change in the world that suggests DASS is
  having its intended impact. For example, under question 1.2 (adoption), one
  indicator is "agencies are collecting their post-impact data in DASS". We
  cannot observe "adoption" directly, but we can observe agencies doing this.
- **Measure**: a quantity or structured judgement against that indicator.
  Every measure states its **frequency** (how often it is measured) and its
  **span** (the period the value covers).
- **Proxy metric**: something concrete we can count or collect that stands in
  for the measure. Every metric states its **unit**, its **goal**, its
  **source** and its **status**.

Goal says which direction is good:

- **Maximise** or **Minimise**: more (or less) is better.
- **Target**: there is a specific value to hit, given in the table (for
  example zero data-loss incidents). Values marked TBD are still to be agreed.
- **Monitor**: context only; neither direction is good or bad on its own.

Status says whether we can collect the metric:

- **Now**: collectable today with no new work (beyond reading it off).
- **Derive**: the raw data exists, but needs a query, script or manual
  collation to produce the number.
- **Build (L/M/H)**: needs new instrumentation, new metadata or a new process.
  The letter is the rough effort: **L**ow (days), **M**edium (weeks) or
  **H**igh (a significant project, or one needing privacy design work).

Identifiers like `1.2-A3` mean question 1.2, indicator A, measure 3. They let
discussion and standard reporting refer to a specific line.

## Frequency and span

| Frequency        | How often the measure is taken                      |
| ---------------- | --------------------------------------------------- |
| Live             | Always current, from a dashboard or on-demand query |
| Monthly          | Once a month                                        |
| Quarterly        | Once a quarter                                      |
| Governance cycle | Three times a year, ahead of governance meetings    |
| Annual           | Once a year, ahead of the strategic review          |
| Per event        | After each significant event that DASS was used for |

| Span          | The period the value covers                                         |
| ------------- | ------------------------------------------------------------------- |
| Point in time | The state at the moment of measurement (a snapshot)                 |
| Period        | Activity since the previous measurement (for example, last quarter) |
| Annual        | The previous 12 months, or the financial year                       |
| Per event     | Activity associated with one event                                  |
| Cumulative    | Since DASS launch                                                   |

A **Live** measure with a **Point in time** span should still be snapshotted
at each standard report, so that it becomes a trend over time.

**Surge usage.** Usage of a system like DASS is inherently spiky: it peaks
during and after events and can be quiet in between. Short-period figures
will swing widely, so a quiet quarter is not by itself evidence of poor
adoption. Trends should use annual spans, and event-related measures should be
reported per event. Infrastructure and support measures should be read with
surge load in mind.

# Privacy risks

Agencies own the data they collect in DASS. The DASS team operates the
platform and so has technical access to it, but MEL metrics must never depend
on looking at that data. Several metrics in this document carry privacy
risks that need managing before they are collected.

**Risks**

- **Looking inside records.** Some metrics read record contents, even if only
  to count (for example records with a location, or records by state). Those
  are marked "agreed with custodians" in the tables. Even aggregated,
  locations of damaged properties are sensitive.
- **Monitoring individual staff.** Per-user activity (for example records per
  surveyor) could be read as performance monitoring of agency staff and
  volunteers. Such metrics should only be reported in aggregate, never by
  named individual.
- **Small numbers.** With few agencies onboarded, a "by jurisdiction" or "by
  agency" figure can identify a single organisation or person.
- **Logs.** Audit logs include user IDs, IP addresses and browser details.
  Keeping them longer for MEL (gap 2) increases that exposure, so they should
  be reduced to the fields metrics need before long-term retention.
- **Telemetry.** Any client telemetry (gap 13) would collect new data from
  devices and must be opt-in and designed for privacy from the start.

**Privacy policy and terms of service**

DASS should have its own privacy policy and terms of service that state
plainly what the DASS team does and does not look at. They should say that
the team uses **aggregated metadata metrics** (for example record counts,
active users and feature usage) to understand and improve how the platform
is used, and that this gives **no visibility into the actual data
collected**. Agencies should agree to this when they onboard. The field app
already links to a configurable privacy policy (`VITE_APP_PRIVACY_POLICY_URL`),
which DASS should point at its own policy.

**Principles**

- **Counts, not content.** Use document metadata (timestamps, counts, which
  template a survey came from), not the contents of records. Any metric that
  looks inside records must be agreed with data custodians first.
- **Aggregate and suppress.** Report geography at state or territory level at
  most. Suppress any cell with fewer than five agencies or users when it is
  shared beyond the DASS team.
- **No individual performance reporting.** Per-user figures are inputs to
  aggregate metrics only.
- **Keep only what is needed.** Strip personal details from anything kept
  for trend analysis, and set a retention period for it.

# User surveys in an early adoption phase

Several metrics rely on a user survey or post-event debrief. These are
useful but hard to do well while DASS is still being adopted:

- **Small, uneven population.** Few agencies are onboarded, so response
  numbers will be too small for scores to be statistically meaningful, and
  one agency's experience can dominate the result.
- **Users at different stages.** Some users have only seen DASS in training
  or one event. Their answers reflect onboarding friction more than
  steady-state use, and the product itself is changing between surveys.
- **Timing around events.** The best time to ask is soon after field use,
  which is also when responders are busiest and most fatigued. Asking
  between events relies on memory.
- **Survey fatigue.** Emergency services staff are asked to complete many
  surveys, so response rates may be low.
- **Reaching field users.** Field users may be volunteers or seasonal staff,
  and we usually reach them only through agency administrators.
- **Bias.** Engaged champions are more likely to respond than people who
  stopped using DASS. Early partners may also be reluctant to criticise a
  project they are invested in.
- **Baseline.** Comparisons with "how agencies did this before DASS" need a
  baseline captured at onboarding, because it cannot be reconstructed later.

To reduce these problems:

- Keep surveys short, with a small fixed set of core questions so results
  can be compared over time.
- While responses are few (say under 30), report counts and themes from
  comments rather than average scores.
- Treat early results as formative input to improve DASS, not as a baseline
  for judging success.
- Fit the post-event debrief into agencies' existing after-action processes
  rather than adding a separate request, and consider running it as a DASS
  survey.
- Complement surveys with anecdotal feedback logged in Twenty CRM (see
  1.3-A1), which costs users nothing.

# Sources

## MEL framework sources

These are the evidence sources named in the NBIC MEL framework. Not all of
them are relevant to DASS. Metrics in this document that rely on a source
marked **Uncertain** need that confirmed.

| Source                  | What it gives us                                                      | DASS relevant?            |
| ----------------------- | --------------------------------------------------------------------- | ------------------------- |
| Twenty CRM              | Engagement counts and organisations engaged                           | Yes (currently DASS only) |
| DAP dashboard           | The quantitative spreadsheet; downloads and product totals            | No                        |
| Use case investigations | Qualitative accounts of adoption, reception and decision change       | Uncertain                 |
| MEL form                | On-demand qualitative input against any question                      | Potentially               |
| Activity lead meetings  | Mostly qualitative feedback; counts possible if responses are tallied | Uncertain                 |
| Leadership retros       | Team reflection on ways of working                                    | Uncertain                 |
| Governance meetings     | Board, council and technical meetings, three times a year             | Uncertain                 |
| Strategic review        | Annual or biannual synthesis of all of the above                      | Uncertain                 |

## DASS platform and delivery sources

These are sources that DASS, the FAIMS3 code it runs, or the DASS team
provides or could provide.

| Source            | What it is                                                                                                                                                                                                                                                                        | Limits today                                                                                                                                              |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin stats       | `GET /api/admin/stats` and the Control Centre Stats page. Counts of teams, users, surveys, templates, records, attachments, bytes, map layers, logged-in users, invites, long-lived API tokens and deleted surveys, with per-team and per-person breakdowns                       | Point-in-time only. No history unless we snapshot it                                                                                                      |
| CouchDB query     | Timestamps already stored on documents: survey and template `createdAt`/`createdBy`, team `createdAt`, record and revision `created`/`created_by`, invite redemptions (`uses[].usedAt`), map layer uploads, deleted-survey tombstones, long-lived API token `lastUsedTimestampMs` | Users have no created or last-login time. Expired sessions, invites, email codes and download grants are deleted by TTL cleanup, so their history is lost |
| Audit logs        | Structured JSON log lines: `[InviteAudit]` (create, lookup, consume, revoke), `[DownloadAudit]` (export minted and downloaded, with format), `[MapAssetProcessing]` (upload stages, timings, outcome), `[Impersonation]`                                                          | CloudWatch log retention is one month. Year-on-year analysis needs export or longer retention                                                             |
| CloudWatch        | CouchDB dashboard and alarms (CPU, memory, disk, status, 5XX), load balancer request count and response time, ECS Container Insights, TTL cleanup failure alerts, AWS Backup jobs                                                                                                 | No external uptime check. No CloudFront or load balancer access logs                                                                                      |
| Bugsnag           | Errors from the API, field app and Control Centre, with app version; version-mismatch events from the app                                                                                                                                                                         | Errors only, not usage                                                                                                                                    |
| Feedback inbox    | In-app feedback (`POST /api/feedback`) emailed to support, with app version                                                                                                                                                                                                       | Unstructured email; needs manual tagging                                                                                                                  |
| App stores        | App Store Connect and Google Play Console: installs, active devices, ratings, reviews, crash rates, version spread                                                                                                                                                                | Native apps only; web users invisible                                                                                                                     |
| GitHub            | DASS fork and upstream FAIMS3: releases, changelog, issues (including incident and security issues), pull requests, milestones, Actions runs, deployments                                                                                                                         | Labelling conventions needed for some metrics                                                                                                             |
| AWS Cost Explorer | Infrastructure spend by service and month, for the DASS AWS account                                                                                                                                                                                                               | Needs cost allocation tags to split shared costs                                                                                                          |
| CDK configuration | The DASS infrastructure code and deployed AWS configuration (regions, backups, log retention)                                                                                                                                                                                     | Read by review, not automatically                                                                                                                         |
| Bibliometrics     | Publications, citations of the FAIMS3 software DOIs (`CITATION.cff`), dataset DOIs                                                                                                                                                                                                | Manual collation                                                                                                                                          |
| Event register    | **Build (M).** A list of events DASS was used for (name, start date, area, agencies), linked to surveys. Could live in Twenty CRM or a separate database we maintain                                                                                                              | Does not exist yet                                                                                                                                        |
| User survey       | **Build (M).** Short periodic survey of agency users and administrators (satisfaction, usability, perceived value), plus a standard post-event debrief                                                                                                                            | Does not exist yet. Could itself run as a DASS survey                                                                                                     |
| Client telemetry  | **Build (H).** Opt-in, privacy-preserving app signals: platform, app version, sync success, time from capture to sync, offline duration                                                                                                                                           | Does not exist. App version and platform currently stay on the device                                                                                     |
| Uptime monitor    | **Build (L).** External availability check on the API, field app and Control Centre                                                                                                                                                                                               | Does not exist yet                                                                                                                                        |
| Support desk      | **Build (L)** (or adopt). A ticketing process with categories, so support load and themes can be counted                                                                                                                                                                          | Support is currently email-based                                                                                                                          |

# Theme 1: Adoption {.theme}

## 1.1 Decision-making before and after events

> How have NBIC tools, services and products strengthened stakeholders'
> decision-making by improving their ability to (A) plan more effectively
> before events, in the long and medium term, and (B) capture lessons-learned
> data and recover more efficiently after events?

DASS contributes to both parts. Post-impact surveys are its core use and
evidence part (B). DASS's scope is also broadening into preparedness work
before events, such as Fuel Hazard Assessments, which DFES (WA) has already
adopted. That gives direct evidence for part (A), alongside the indirect
contribution of agencies being ready to deploy and of DASS data feeding
preparedness models and plans.

### Indicator 1.1-A: Agencies use DASS to plan and prepare before events

#### 1.1-A1 Preparedness use of DASS

**Frequency:** quarterly. **Span:** period, plus cumulative.

Agencies using DASS for pre-event work, such as Fuel Hazard Assessments, and
how much of that work is captured in DASS.

| Proxy metric                                                          | Unit             | Goal     | Source                                 | Status    |
| --------------------------------------------------------------------- | ---------------- | -------- | -------------------------------------- | --------- |
| Agencies with an active preparedness survey (for example fuel hazard) | count            | Maximise | CouchDB query plus survey purpose flag | Build (L) |
| Preparedness records created                                          | count            | Maximise | CouchDB query plus survey purpose flag | Build (L) |
| Preparedness templates available in the national library              | count            | Monitor  | CouchDB query plus national flag       | Build (M) |
| Documented planning decisions informed by DASS preparedness data      | count, narrative | Maximise | Use case investigations, MEL form      | Now       |

#### 1.1-A2 Readiness to deploy

**Frequency:** live, snapshotted at each standard report. **Span:** point in
time.

Whether each onboarded agency is ready to survey at short notice: an active
team, a configured survey based on a current national template, users with
access, and any needed map layers loaded. Capturing this routinely gives a
live readiness status, and the snapshots show how readiness changes over
time.

| Proxy metric                                                       | Unit  | Goal     | Source                                 | Status    |
| ------------------------------------------------------------------ | ----- | -------- | -------------------------------------- | --------- |
| Onboarded agencies meeting all readiness criteria                  | %     | Maximise | CouchDB query, admin stats             | Derive    |
| Teams with at least one non-archived survey                        | count | Maximise | Admin stats, CouchDB query             | Derive    |
| Teams whose surveys use the current version of a national template | %     | Maximise | CouchDB query plus lineage             | Build (M) |
| Users with access, per team                                        | count | Monitor  | CouchDB query                          | Derive    |
| Teams with map layers loaded                                       | count | Monitor  | Admin stats                            | Now       |
| Training sessions and exercises run with agencies                  | count | Maximise | Twenty CRM                             | Now       |
| Records created in surveys marked as training or exercise          | count | Maximise | CouchDB query plus survey purpose flag | Build (L) |

#### 1.1-A3 DASS data used in planning and preparedness

**Frequency:** annual. **Span:** annual.

Count and description of preparedness products (risk models, planning
reports, building-standard inputs, training material) that use DASS data.

| Proxy metric                                                          | Unit             | Goal     | Source                            | Status |
| --------------------------------------------------------------------- | ---------------- | -------- | --------------------------------- | ------ |
| Documented cases of DASS data used in models, plans or standards      | count, narrative | Maximise | Use case investigations, MEL form | Now    |
| Exports from DASS, by format and team (a proxy for downstream use)    | count            | Maximise | Audit logs (`[DownloadAudit]`)    | Derive |
| Long-lived API tokens used for system integration in the last 90 days | count            | Maximise | Admin stats, CouchDB query        | Derive |
| Reports and publications citing DASS data                             | count            | Maximise | Bibliometrics, MEL form           | Derive |

### Indicator 1.1-B: Impact data is captured faster, more consistently and more completely after events

#### 1.1-B1 Speed of deployment

**Frequency:** per event, summarised annually. **Span:** per event.

Days from the event start (or from access being permitted) to the first
record, and to the bulk of records, for that event.

| Proxy metric                                                | Unit      | Goal     | Source                            | Status    |
| ----------------------------------------------------------- | --------- | -------- | --------------------------------- | --------- |
| First and last record `created` time per survey             | date-time | Monitor  | CouchDB query                     | Derive    |
| Days from event start to survey creation                    | days      | Minimise | CouchDB query plus event register | Build (M) |
| Days from event start to first record                       | days      | Minimise | CouchDB query plus event register | Build (M) |
| Days to reach 50% and 90% of the event's final record count | days      | Minimise | CouchDB query plus event register | Build (M) |

The event register does not exist yet; it could be held in Twenty CRM or in a
separate database we maintain.

#### 1.1-B2 Field throughput and completeness

**Frequency:** per event, summarised annually. **Span:** per event.

How much is captured per surveyor, and how complete each record is.

| Proxy metric                              | Unit                     | Goal     | Source                                      | Status    |
| ----------------------------------------- | ------------------------ | -------- | ------------------------------------------- | --------- |
| Records per active surveyor per field day | records per surveyor-day | Maximise | CouchDB query                               | Derive    |
| Attachments (photos) per record           | attachments per record   | Monitor  | Admin stats, CouchDB query                  | Derive    |
| Records with a location captured          | %                        | Maximise | CouchDB query (agreed with custodians)      | Derive    |
| Records passing all required-field checks | %                        | Maximise | CouchDB query plus stored validation status | Build (M) |
| Revisions per record (rework indicator)   | revisions per record     | Minimise | CouchDB query                               | Derive    |

#### 1.1-B3 Consistency across agencies and events

**Frequency:** annual. **Span:** annual, plus cumulative.

How far collected data follows the national templates, which is what makes it
comparable across time and jurisdictions.

| Proxy metric                                                                      | Unit              | Goal     | Source                           | Status    |
| --------------------------------------------------------------------------------- | ----------------- | -------- | -------------------------------- | --------- |
| Active surveys created from a national template                                   | %                 | Maximise | CouchDB query plus national flag | Build (M) |
| Distinct template variants in use for the same purpose                            | count per purpose | Minimise | CouchDB query                    | Derive    |
| Template drift: fields added, removed or changed relative to the national version | fields per survey | Minimise | CouchDB query plus lineage       | Build (M) |
| Records collected in surveys aligned to the current data standard                 | %                 | Maximise | CouchDB query plus lineage       | Build (M) |

#### 1.1-B4 Time to usable data

**Frequency:** per event. **Span:** per event.

Time from capture in the field to data being on the server, and then to data
being exported or handed to decision makers.

| Proxy metric                                                | Unit  | Goal     | Source                         | Status    |
| ----------------------------------------------------------- | ----- | -------- | ------------------------------ | --------- |
| Median time from record creation to arrival on the server   | hours | Minimise | Server receipt timestamp       | Build (M) |
| The same, from the device's view, including time offline    | hours | Minimise | Client telemetry               | Build (H) |
| Days from event start to first export of that survey's data | days  | Minimise | Audit logs plus event register | Build (M) |
| Exports of the event's surveys                              | count | Monitor  | Audit logs                     | Derive    |

CouchDB does not record when a document arrived on the server, so capture-to-
sync time needs either a server-side receipt stamp or client telemetry.

#### 1.1-B5 Decisions informed by DASS data

**Frequency:** per event (debrief), synthesised annually. **Span:** per event,
and annual.

Documented instances where DASS data changed or informed a decision, such as
recovery resourcing, community information, building-assessment
prioritisation or a lessons-learned review.

| Proxy metric                                                       | Unit             | Goal     | Source                                      | Status    |
| ------------------------------------------------------------------ | ---------------- | -------- | ------------------------------------------- | --------- |
| Use case accounts of decision change, tagged to 1.1(A) or 1.1(B)   | count, narrative | Maximise | Use case investigations, MEL form           | Now       |
| Debrief respondents reporting that DASS data informed a decision   | %                | Maximise | User survey (debrief)                       | Build (M) |
| Lessons-learned or after-action reviews that cite DASS data        | count            | Maximise | MEL form, governance meetings               | Derive    |
| Distinct decision examples recorded in meeting notes, coded to 1.1 | count            | Maximise | Activity lead meetings, governance meetings | Derive    |

The last metric means: whenever a DASS-informed decision comes up in a
meeting, note it as a short example and code it to part (A) or part (B).
Each example is counted once, so the annual synthesis counts distinct
decisions rather than relying on memory or counting repeat mentions.

#### 1.1-B6 Effort compared with previous methods

**Frequency:** once at onboarding (baseline), then annual. **Span:** annual.

Agency-reported time and effort per assessment compared with their pre-DASS
process (paper, spreadsheets or bespoke apps).

| Proxy metric                                                    | Unit           | Goal     | Source                               | Status    |
| --------------------------------------------------------------- | -------------- | -------- | ------------------------------------ | --------- |
| Baseline time per assessment and to compile a report, pre-DASS  | minutes, hours | Monitor  | Twenty CRM (onboarding notes)        | Build (L) |
| Reported time per assessment and to compile a report, with DASS | minutes, hours | Minimise | User survey, use case investigations | Build (M) |
| Median time between consecutive records by one surveyor         | minutes        | Minimise | CouchDB query                        | Derive    |

## 1.2 Extent of adoption

> What evidence do we have for the extent to which NBIC data, tools, products
> and services have been adopted? (Includes use cases.)

### Indicator 1.2-A: Agencies and jurisdictions have taken up DASS

#### 1.2-A1 Agencies onboarded

**Frequency:** quarterly. **Span:** point in time, plus cumulative.

Agencies with a DASS team, against the target of all relevant State and
Territory stakeholders.

| Proxy metric                                         | Unit  | Goal         | Source                           | Status    |
| ---------------------------------------------------- | ----- | ------------ | -------------------------------- | --------- |
| Teams                                                | count | Maximise     | Admin stats                      | Now       |
| Teams mapped to agency, jurisdiction and sector      | %     | Target: 100% | Team metadata or Twenty CRM link | Build (L) |
| Organisations at the "onboarded" stage in Twenty CRM | count | Maximise     | Twenty CRM                       | Derive    |
| Onboarded agencies as a share of the target list     | %     | Maximise     | Twenty CRM plus team mapping     | Build (L) |

#### 1.2-A2 Active agencies

**Frequency:** quarterly. **Span:** period, and annual.

Agencies that created records or other resources (surveys, templates, map
layers, exports) in the period.

| Proxy metric                                                     | Unit  | Goal     | Source                | Status    |
| ---------------------------------------------------------------- | ----- | -------- | --------------------- | --------- |
| Teams with at least one record created in the period             | count | Maximise | CouchDB query         | Derive    |
| Teams that created or updated a survey or template in the period | count | Maximise | CouchDB query         | Derive    |
| Teams that uploaded a map layer in the period                    | count | Maximise | CouchDB query         | Derive    |
| Teams that exported data in the period                           | count | Maximise | Audit logs            | Derive    |
| Change in per-team counts between admin stats snapshots          | count | Monitor  | Admin stats snapshots | Build (L) |

#### 1.2-A3 Jurisdictional coverage

**Frequency:** annual. **Span:** annual, plus cumulative.

| Proxy metric                                                     | Unit  | Goal      | Source                                 | Status    |
| ---------------------------------------------------------------- | ----- | --------- | -------------------------------------- | --------- |
| States and territories with at least one active agency           | count | Target: 8 | Team metadata                          | Build (L) |
| Records by state or territory (from record location, aggregated) | count | Monitor   | CouchDB query (agreed with custodians) | Derive    |

### Indicator 1.2-B: People are using DASS

#### 1.2-B1 Registered users

**Frequency:** quarterly. **Span:** point in time, plus new users in the
period.

| Proxy metric                                             | Unit  | Goal     | Source                     | Status    |
| -------------------------------------------------------- | ----- | -------- | -------------------------- | --------- |
| Registered users                                         | count | Maximise | Admin stats                | Now       |
| New users (first invite redemption as a proxy)           | count | Maximise | CouchDB query              | Derive    |
| New users (from account creation date, not stored today) | count | Maximise | `createdAt` on user record | Build (L) |

#### 1.2-B2 Active users

**Frequency:** monthly (operational) and per event. **Span:** period, per
event, and annual.

| Proxy metric                                        | Unit  | Goal     | Source                       | Status    |
| --------------------------------------------------- | ----- | -------- | ---------------------------- | --------- |
| Distinct users who created records                  | count | Maximise | CouchDB query                | Derive    |
| Users currently logged in (holding a valid session) | count | Monitor  | Admin stats                  | Now       |
| Users who signed in                                 | count | Maximise | `lastLoginAt` on user record | Build (L) |
| Peak concurrent field users during an event         | count | Monitor  | CouchDB query                | Derive    |

The app does not report sessions to the server, so peak concurrency is
derived from record creation times: for each hour of the event, count the
distinct users who created a record in that hour, and take the highest
hourly count. This approximates concurrency as "active in the same hour".

#### 1.2-B3 Devices and platforms

**Frequency:** quarterly. **Span:** period.

| Proxy metric                                 | Unit  | Goal     | Source                                           | Status    |
| -------------------------------------------- | ----- | -------- | ------------------------------------------------ | --------- |
| Installs and active devices, iOS and Android | count | Maximise | App stores                                       | Now       |
| Share of use from native app versus web      | %     | Monitor  | Server-side record of platform                   | Build (L) |
| Active users on a supported app version      | %     | Maximise | Server-side record of version, Bugsnag (partial) | Build (L) |

#### 1.2-B4 Retention

**Frequency:** annual. **Span:** annual, compared with the previous year.

| Proxy metric                                              | Unit | Goal     | Source        | Status |
| --------------------------------------------------------- | ---- | -------- | ------------- | ------ |
| Agencies active last year that are active again this year | %    | Maximise | CouchDB query | Derive |
| Users active last year that are active again this year    | %    | Maximise | CouchDB query | Derive |

### Indicator 1.2-C: DASS is used in depth, not just tried

#### 1.2-C1 Volume

**Frequency:** quarterly. **Span:** point in time, plus additions in the
period.

| Proxy metric                      | Unit  | Goal     | Source      | Status |
| --------------------------------- | ----- | -------- | ----------- | ------ |
| Active surveys                    | count | Maximise | Admin stats | Now    |
| Archived surveys                  | count | Monitor  | Admin stats | Now    |
| Templates                         | count | Maximise | Admin stats | Now    |
| Records                           | count | Maximise | Admin stats | Now    |
| Attachments (photos and files)    | count | Maximise | Admin stats | Now    |
| Data stored, overall and per team | GB    | Monitor  | Admin stats | Now    |

Each value can be read from admin stats today. Reporting how it changes over
time needs the scheduled admin stats snapshot (gap 1, Build (L)).

#### 1.2-C2 Feature breadth

**Frequency:** annual. **Span:** annual.

Which platform features agencies actually use: photos, map layers, spatial
features, related records, conditional logic, helper text, exports and API
integration.

| Proxy metric                                                       | Unit      | Goal     | Source                             | Status |
| ------------------------------------------------------------------ | --------- | -------- | ---------------------------------- | ------ |
| Map layers and their storage, per team                             | count, GB | Monitor  | Admin stats                        | Now    |
| Active surveys whose templates use each feature                    | %         | Monitor  | CouchDB query (template structure) | Derive |
| Questions with helper text in active templates                     | %         | Maximise | CouchDB query (template structure) | Derive |
| Exports by format (CSV, attachments zip, GeoJSON, KML, GeoPackage) | count     | Monitor  | Audit logs                         | Derive |
| Long-lived API tokens in use, and when each was last used          | count     | Maximise | Admin stats, CouchDB query         | Derive |

#### 1.2-C3 Uptake of the national template library and designer

**Frequency:** annual. **Span:** annual.

| Proxy metric                                        | Unit  | Goal     | Source                           | Status    |
| --------------------------------------------------- | ----- | -------- | -------------------------------- | --------- |
| Surveys created from each national template         | count | Maximise | CouchDB query plus national flag | Build (M) |
| Agencies that customised a template in the designer | count | Monitor  | CouchDB query                    | Derive    |
| Templates created or edited, by team                | count | Monitor  | CouchDB query                    | Derive    |

#### 1.2-C4 Collaboration on the platform

**Frequency:** annual. **Span:** annual.

| Proxy metric                                                     | Unit  | Goal     | Source                     | Status    |
| ---------------------------------------------------------------- | ----- | -------- | -------------------------- | --------- |
| Surveys with members from more than one team                     | count | Maximise | CouchDB query              | Derive    |
| Templates reused by a team other than the one that authored them | count | Maximise | CouchDB query plus lineage | Build (M) |

### Indicator 1.2-D: Use cases are documented

#### 1.2-D1 Documented use cases

**Frequency:** annual. **Span:** annual, plus cumulative.

Number and type of use cases: post-impact assessment, preparedness (for
example fuel hazard assessment), research, training and exercises, and any
other hazards.

| Proxy metric                                                                | Unit  | Goal     | Source                                 | Status    |
| --------------------------------------------------------------------------- | ----- | -------- | -------------------------------------- | --------- |
| Use cases by type and jurisdiction                                          | count | Maximise | Use case investigations, MEL form      | Now       |
| Surveys by declared purpose (post-impact, preparedness, exercise, research) | count | Monitor  | CouchDB query plus survey purpose flag | Build (L) |

## 1.3 Reception after adoption

> What has been the reception of NBIC tools, products and services once
> adopted?

### Indicator 1.3-A: Users are satisfied and find DASS usable

#### 1.3-A1 Satisfaction

**Frequency:** annual survey, plus per-event debrief. **Span:** annual, and
per event.

| Proxy metric                                                                                        | Unit             | Goal     | Source                                                       | Status    |
| --------------------------------------------------------------------------------------------------- | ---------------- | -------- | ------------------------------------------------------------ | --------- |
| Overall satisfaction with DASS ("How satisfied are you with DASS?"), by role                        | score (1 to 10)  | Maximise | User survey                                                  | Build (M) |
| Likelihood to recommend DASS to a colleague (0 = not at all likely, 10 = extremely likely), by role | score (0 to 10)  | Maximise | User survey                                                  | Build (M) |
| App store rating                                                                                    | score (1 to 5)   | Maximise | App stores                                                   | Now       |
| Feedback about DASS, positive and negative, by theme                                                | count, narrative | Monitor  | Twenty CRM (feedback log), use case investigations, MEL form | Build (L) |

We should start using Twenty CRM to explicitly track **all** feedback we hear
about DASS, including anecdotal comments. In meetings we often hear things
like "it was really usable" or "this part was hard", and today those
comments are lost. Logging each one in Twenty CRM against the organisation,
with a short theme, turns them into countable evidence for this question
at no cost to users. See also the section on user surveys in an early
adoption phase, which explains why surveys alone will not be enough.

#### 1.3-A2 Usability and onboarding

**Frequency:** annual (survey); quarterly (onboarding). **Span:** annual, and
period.

| Proxy metric                                                            | Unit             | Goal     | Source                    | Status    |
| ----------------------------------------------------------------------- | ---------------- | -------- | ------------------------- | --------- |
| System Usability Scale (a standard 10-question usability questionnaire) | score (0 to 100) | Maximise | User survey               | Build (M) |
| Invites redeemed, as a share of invites created                         | %                | Maximise | Audit logs, CouchDB query | Derive    |
| Users who created a record, as a share of users who redeemed an invite  | %                | Maximise | CouchDB query             | Derive    |
| Median time from a user's first invite redemption to their first record | days             | Minimise | CouchDB query             | Derive    |

### Indicator 1.3-B: DASS is reliable in the field

#### 1.3-B1 Errors and crashes

**Frequency:** monthly (operational), per event. **Span:** period, per event,
and annual.

| Proxy metric                   | Unit                   | Goal     | Source                 | Status |
| ------------------------------ | ---------------------- | -------- | ---------------------- | ------ |
| Crash-free users, by platform  | %                      | Maximise | Bugsnag, app stores    | Now    |
| Errors per 100 records created | errors per 100 records | Minimise | Bugsnag, CouchDB query | Derive |

#### 1.3-B2 Sync and data safety

**Frequency:** per event; monthly (operational). **Span:** per event, and
period.

| Proxy metric                                | Unit  | Goal      | Source                       | Status    |
| ------------------------------------------- | ----- | --------- | ---------------------------- | --------- |
| Sync attempts that succeed                  | %     | Maximise  | Client telemetry             | Build (H) |
| Longest time a device held unsynced records | hours | Monitor   | Client telemetry             | Build (H) |
| Reported data-loss incidents                | count | Target: 0 | Support desk, feedback inbox | Derive    |
| Records with unresolved edit conflicts      | count | Minimise  | CouchDB query                | Derive    |

#### 1.3-B3 Service availability

**Frequency:** monthly, and per event. **Span:** period, and per event.

| Proxy metric                            | Unit          | Goal        | Source                         | Status    |
| --------------------------------------- | ------------- | ----------- | ------------------------------ | --------- |
| API availability from an external check | %             | Target: TBD | Uptime monitor                 | Build (L) |
| Server error (5XX) responses            | % of requests | Minimise    | CloudWatch                     | Now       |
| p95 API response time                   | milliseconds  | Minimise    | CloudWatch                     | Now       |
| Incidents and alarm events              | count         | Minimise    | CloudWatch, GitHub (incidents) | Derive    |

#### 1.3-B4 Map layer processing

**Frequency:** quarterly. **Span:** period.

| Proxy metric                                    | Unit    | Goal     | Source                              | Status |
| ----------------------------------------------- | ------- | -------- | ----------------------------------- | ------ |
| Uploads that process successfully               | %       | Maximise | Audit logs (`[MapAssetProcessing]`) | Derive |
| Median processing time, by file size and format | seconds | Minimise | Audit logs (`[MapAssetProcessing]`) | Derive |

### Indicator 1.3-C: Pain points are surfaced and acted on

#### 1.3-C1 Feedback and requests

**Frequency:** monthly (volume); quarterly (themes). **Span:** period.

| Proxy metric                                              | Unit                | Goal     | Source                    | Status    |
| --------------------------------------------------------- | ------------------- | -------- | ------------------------- | --------- |
| In-app feedback messages, by theme                        | count               | Monitor  | Feedback inbox            | Derive    |
| Pain points heard in meetings and conversations, by theme | count               | Monitor  | Twenty CRM (feedback log) | Build (L) |
| Support requests per active agency, by category           | requests per agency | Minimise | Support desk              | Build (L) |
| Issues raised from DASS feedback, open and closed         | count               | Monitor  | GitHub (label)            | Derive    |
| Median time to resolve reported problems                  | days                | Minimise | GitHub, support desk      | Derive    |

#### 1.3-C2 Disengagement signals

**Frequency:** annual. **Span:** annual.

| Proxy metric                                                 | Unit      | Goal     | Source                              | Status |
| ------------------------------------------------------------ | --------- | -------- | ----------------------------------- | ------ |
| Agencies with no activity for a full year after being active | count     | Minimise | CouchDB query                       | Derive |
| Deleted surveys                                              | count     | Monitor  | Admin stats                         | Now    |
| Stated reasons for disengagement                             | narrative | Monitor  | Use case investigations, Twenty CRM | Derive |

#### 1.3-C3 Advocacy

**Frequency:** annual. **Span:** annual.

| Proxy metric                                         | Unit  | Goal     | Source                           | Status    |
| ---------------------------------------------------- | ----- | -------- | -------------------------------- | --------- |
| Agencies referred by another agency                  | count | Maximise | Twenty CRM (referral field)      | Build (L) |
| Unsolicited endorsements and requests to extend DASS | count | Maximise | Activity lead meetings, MEL form | Derive    |

# Theme 2: Deliverables {.theme}

## 2.1 Delivering agreed outputs on time

> How is NBIC tracking to deliver our agreed-upon outputs on time?

### Indicator 2.1-A: Milestones are delivered as planned

#### 2.1-A1 Milestone delivery rate

**Frequency:** governance cycle. **Span:** period.

| Proxy metric                                     | Unit  | Goal     | Source                      | Status |
| ------------------------------------------------ | ----- | -------- | --------------------------- | ------ |
| Milestones delivered on or before their due date | %     | Maximise | Governance meetings, GitHub | Derive |
| Slippage on late milestones                      | days  | Minimise | Governance meetings, GitHub | Derive |
| Milestones re-baselined                          | count | Minimise | Governance meetings         | Derive |

#### 2.1-A2 Release cadence

**Frequency:** quarterly. **Span:** period.

| Proxy metric                                                   | Unit  | Goal     | Source     | Status |
| -------------------------------------------------------------- | ----- | -------- | ---------- | ------ |
| Releases deployed to DASS                                      | count | Monitor  | GitHub     | Derive |
| Time from an upstream FAIMS3 release to its deployment to DASS | days  | Minimise | GitHub     | Derive |
| App store submission-to-approval time                          | days  | Minimise | App stores | Derive |

### Indicator 2.1-B: The delivery process is healthy

#### 2.1-B1 Delivery performance (DORA measures)

**Frequency:** quarterly. **Span:** period.

| Proxy metric                                                | Unit              | Goal     | Source                         | Status |
| ----------------------------------------------------------- | ----------------- | -------- | ------------------------------ | ------ |
| Deployment frequency                                        | deploys per month | Maximise | GitHub Actions                 | Derive |
| Lead time from pull request opened to deployed              | days              | Minimise | GitHub                         | Derive |
| Releases needing a hotfix or rollback (change failure rate) | %                 | Minimise | GitHub                         | Derive |
| Time to restore service after an incident                   | hours             | Minimise | GitHub (incidents), CloudWatch | Derive |

#### 2.1-B2 Backlog health

**Frequency:** monthly. **Span:** point in time.

| Proxy metric                    | Unit  | Goal     | Source | Status |
| ------------------------------- | ----- | -------- | ------ | ------ |
| Open bugs, by severity          | count | Minimise | GitHub | Derive |
| Median age of open bugs         | days  | Minimise | GitHub | Derive |
| Planned roadmap items completed | %     | Maximise | GitHub | Derive |

### Indicator 2.1-C: Delivery risks are visible

#### 2.1-C1 Risks and dependencies

**Frequency:** governance cycle. **Span:** point in time.

| Proxy metric                                                         | Unit  | Goal     | Source              | Status |
| -------------------------------------------------------------------- | ----- | -------- | ------------------- | ------ |
| Open and overdue risks, by rating                                    | count | Minimise | Governance meetings | Derive |
| Items blocked on external dependencies (agencies, vendors, upstream) | count | Minimise | GitHub              | Derive |

## 2.2 Deliverables meeting expectations

> Are deliverables meeting our expectations, and those of our stakeholders?

### Indicator 2.2-A: Deliverables meet quality requirements

#### 2.2-A1 Acceptance and escaped defects

**Frequency:** per release, summarised quarterly. **Span:** per release.

| Proxy metric                                           | Unit             | Goal     | Source                                      | Status |
| ------------------------------------------------------ | ---------------- | -------- | ------------------------------------------- | ------ |
| Deliverables accepted without rework                   | %                | Maximise | Governance meetings, activity lead meetings | Derive |
| Bugs reported within 30 days of a release              | bugs per release | Minimise | GitHub, Bugsnag                             | Derive |
| CI and end-to-end test pass rate on the release branch | %                | Maximise | GitHub Actions                              | Now    |

#### 2.2-A2 Security, sovereignty and resilience

**Frequency:** quarterly, plus an annual attestation. **Span:** point in time.

| Proxy metric                                       | Unit  | Goal         | Source                               | Status    |
| -------------------------------------------------- | ----- | ------------ | ------------------------------------ | --------- |
| Open dependency vulnerabilities, by severity       | count | Minimise     | GitHub security alerts, `pnpm audit` | Derive    |
| Median time to patch a high-severity vulnerability | days  | Minimise     | GitHub                               | Derive    |
| Open security review findings                      | count | Minimise     | GitHub (security issues)             | Derive    |
| Data stores confirmed in Australian regions        | %     | Target: 100% | CDK configuration                    | Derive    |
| Backup jobs that succeed                           | %     | Target: 100% | CloudWatch (AWS Backup)              | Now       |
| Time since the last tested restore                 | days  | Minimise     | GitHub (restore test issue)          | Build (L) |

#### 2.2-A3 Service levels

**Frequency:** monthly. **Span:** period.

| Proxy metric                                                   | Unit         | Goal         | Source                      | Status    |
| -------------------------------------------------------------- | ------------ | ------------ | --------------------------- | --------- |
| Availability against the agreed target                         | %            | Target: TBD  | Uptime monitor              | Build (L) |
| p95 API response time                                          | milliseconds | Minimise     | CloudWatch                  | Now       |
| Restore tests meeting recovery point and recovery time targets | %            | Target: 100% | GitHub (restore test issue) | Build (L) |

### Indicator 2.2-B: Stakeholders find deliverables fit for purpose

#### 2.2-B1 Stakeholder assessment

**Frequency:** governance cycle, plus annual survey. **Span:** period.

| Proxy metric                                                | Unit           | Goal     | Source                           | Status    |
| ----------------------------------------------------------- | -------------- | -------- | -------------------------------- | --------- |
| Stakeholder rating of recent deliverables                   | score (1 to 5) | Maximise | User survey, governance meetings | Build (M) |
| Stakeholder requests delivered or closed, of those received | %              | Maximise | Twenty CRM, GitHub (label)       | Derive    |

#### 2.2-B2 Uptake of new features

**Frequency:** once, 90 days after each feature release. **Span:** the 90 days
after release.

| Proxy metric                                    | Unit | Goal     | Source                             | Status |
| ----------------------------------------------- | ---- | -------- | ---------------------------------- | ------ |
| Active teams using a new feature within 90 days | %    | Maximise | CouchDB query (data and templates) | Derive |

### Indicator 2.2-C: The data produced meets the national data goal

#### 2.2-C1 National dataset quality

**Frequency:** annual. **Span:** annual.

This is the outcome DASS exists for: consistent, comparable impact data.

| Proxy metric                                               | Unit  | Goal     | Source                                 | Status    |
| ---------------------------------------------------------- | ----- | -------- | -------------------------------------- | --------- |
| Records conforming to the national data standard           | %     | Maximise | CouchDB query plus lineage             | Build (M) |
| Completeness of the national core fields (aggregate)       | %     | Maximise | CouchDB query (agreed with custodians) | Derive    |
| Agencies contributing data to a cross-jurisdiction dataset | count | Maximise | Twenty CRM (data agreements)           | Build (L) |

# Theme 3: Engagement {.theme}

## 3.1 Engagement with science

> How has NBIC engaged with science, or the scientific community, to create or
> contribute to new science, including methodologies, data layers and others?

### Indicator 3.1-A: DASS produces scientific outputs

#### 3.1-A1 Publications and citations

**Frequency:** annual. **Span:** annual, plus cumulative.

| Proxy metric                                                         | Unit  | Goal     | Source                  | Status |
| -------------------------------------------------------------------- | ----- | -------- | ----------------------- | ------ |
| Papers, reports and presentations describing DASS or using DASS data | count | Maximise | Bibliometrics, MEL form | Derive |
| Citations of the FAIMS3 software DOIs and DASS outputs               | count | Maximise | Bibliometrics           | Derive |

#### 3.1-A2 Data layers and datasets

**Frequency:** annual. **Span:** annual, plus cumulative.

| Proxy metric                                                             | Unit  | Goal     | Source                              | Status |
| ------------------------------------------------------------------------ | ----- | -------- | ----------------------------------- | ------ |
| Derived datasets or data layers published (with DOIs) that use DASS data | count | Maximise | Bibliometrics                       | Derive |
| Downloads of those datasets                                              | count | Maximise | The repository hosting each dataset | Derive |

### Indicator 3.1-B: DASS contributes methods and standards

#### 3.1-B1 National templates and data standards

**Frequency:** governance cycle. **Span:** cumulative.

| Proxy metric                                                                 | Unit  | Goal     | Source                           | Status    |
| ---------------------------------------------------------------------------- | ----- | -------- | -------------------------------- | --------- |
| National templates published, and versions released                          | count | Monitor  | CouchDB query plus national flag | Build (M) |
| Agencies using each national template                                        | count | Maximise | CouchDB query plus national flag | Build (M) |
| Assessment methods (for example damage classification) developed or endorsed | count | Maximise | Governance meetings, MEL form    | Derive    |

#### 3.1-B2 Open-source contribution

**Frequency:** quarterly. **Span:** period.

| Proxy metric                                                 | Unit    | Goal     | Source | Status |
| ------------------------------------------------------------ | ------- | -------- | ------ | ------ |
| Pull requests from the DASS team merged into upstream FAIMS3 | count   | Maximise | GitHub | Derive |
| Commits the DASS fork is behind upstream                     | commits | Minimise | GitHub | Derive |
| External contributors and other FAIMS3 deployments           | count   | Maximise | GitHub | Now    |

### Indicator 3.1-C: Researchers use the platform and data

#### 3.1-C1 Research use

**Frequency:** annual. **Span:** annual.

| Proxy metric                                                        | Unit             | Goal     | Source                       | Status    |
| ------------------------------------------------------------------- | ---------------- | -------- | ---------------------------- | --------- |
| Research teams using DASS                                           | count            | Maximise | Team metadata, Twenty CRM    | Build (L) |
| Data access requests for research                                   | count            | Monitor  | Twenty CRM (request records) | Build (L) |
| Median time to fulfil a data access request                         | days             | Minimise | Twenty CRM (request records) | Build (L) |
| Models or analyses fed by DASS data (for example house-loss models) | count, narrative | Maximise | Use case investigations      | Now       |
| Co-authored outputs with agencies or universities                   | count            | Maximise | Bibliometrics                | Derive    |

## 3.2 External stakeholders and business opportunities

> How has NBIC engaged external stakeholders and business opportunities,
> including Indigenous stakeholders?

### Indicator 3.2-A: Engagement is broad and growing

#### 3.2-A1 Engagements and organisations

**Frequency:** quarterly. **Span:** period, plus cumulative.

| Proxy metric                                                       | Unit  | Goal     | Source     | Status |
| ------------------------------------------------------------------ | ----- | -------- | ---------- | ------ |
| Engagements, by sector and jurisdiction                            | count | Maximise | Twenty CRM | Now    |
| Organisations engaged, by sector and jurisdiction                  | count | Maximise | Twenty CRM | Now    |
| New organisations engaged, as a share of all organisations engaged | %     | Monitor  | Twenty CRM | Derive |
| Training sessions, webinars and conference activities              | count | Maximise | Twenty CRM | Derive |
| Attendees at those activities                                      | count | Maximise | Twenty CRM | Derive |

#### 3.2-A2 Depth of engagement

**Frequency:** quarterly. **Span:** point in time.

Movement along a pipeline: aware, demonstrated, trialling, onboarded, active,
advocate. "Active" can be set automatically from platform data once teams are
linked to Twenty CRM organisations.

| Proxy metric                                           | Unit  | Goal     | Source                        | Status    |
| ------------------------------------------------------ | ----- | -------- | ----------------------------- | --------- |
| Organisations at each pipeline stage                   | count | Monitor  | Twenty CRM (stages)           | Build (L) |
| Conversion rate between stages                         | %     | Maximise | Twenty CRM (stages)           | Build (L) |
| Median time between stages                             | days  | Minimise | Twenty CRM (stages)           | Build (L) |
| Twenty CRM organisations linked to an active DASS team | count | Maximise | Twenty CRM plus team metadata | Build (L) |

### Indicator 3.2-B: Agencies collaborate through DASS

#### 3.2-B1 Cross-agency collaboration

**Frequency:** annual. **Span:** annual.

| Proxy metric                                                 | Unit  | Goal     | Source                           | Status    |
| ------------------------------------------------------------ | ----- | -------- | -------------------------------- | --------- |
| Surveys with users from more than one agency                 | count | Maximise | CouchDB query plus team metadata | Build (L) |
| Templates shared between agencies                            | count | Maximise | CouchDB query plus lineage       | Build (M) |
| Data-sharing agreements between agencies involving DASS data | count | Maximise | Twenty CRM (data agreements)     | Build (L) |

### Indicator 3.2-C: Indigenous stakeholders are engaged on their terms

Measures here should be designed with Indigenous partners and follow the CARE
principles for Indigenous data governance. Counts are a weak proxy; the
qualitative account matters more.

#### 3.2-C1 Engagement with Indigenous organisations

**Frequency:** quarterly (counts); annual (narrative). **Span:** period, and
annual.

| Proxy metric                                                                   | Unit      | Goal     | Source                        | Status    |
| ------------------------------------------------------------------------------ | --------- | -------- | ----------------------------- | --------- |
| Engagements with Indigenous organisations, ranger groups or Traditional Owners | count     | Maximise | Twenty CRM (sector tag)       | Derive    |
| Indigenous ranger or community teams onboarded and active                      | count     | Maximise | Team metadata                 | Build (L) |
| Templates or fields co-designed with Indigenous partners                       | count     | Maximise | Governance meetings, MEL form | Derive    |
| Data governance agreements reflecting Indigenous data sovereignty              | count     | Maximise | Twenty CRM (data agreements)  | Build (L) |
| Partner accounts of the engagement                                             | narrative | Monitor  | Use case investigations       | Now       |

### Indicator 3.2-D: DASS creates business and partnership opportunities

#### 3.2-D1 Opportunities and partnerships

**Frequency:** governance cycle. **Span:** period, plus cumulative.

| Proxy metric                                                        | Unit         | Goal     | Source                           | Status    |
| ------------------------------------------------------------------- | ------------ | -------- | -------------------------------- | --------- |
| Partnership, funding or co-investment proposals                     | count, AUD   | Maximise | Twenty CRM                       | Derive    |
| MoUs and data-sharing agreements signed                             | count        | Maximise | Twenty CRM (data agreements)     | Build (L) |
| Requests to extend DASS to other hazards or uses                    | count        | Maximise | Twenty CRM, MEL form             | Derive    |
| Infrastructure cost per active agency (for sustainability planning) | AUD per year | Minimise | AWS Cost Explorer, CouchDB query | Derive    |

# Theme 4: Operations {.theme}

## 4.1 Effective ways of working

> Are NBIC's ways of working (meetings, governance, collaboration,
> communication and so on) effective in supporting NBIC to achieve its goals?
> If not, what is ineffective and what must we do differently?

### Indicator 4.1-A: Meetings and governance lead to decisions and actions

#### 4.1-A1 Action follow-through

**Frequency:** per meeting, rolled up quarterly. **Span:** period.

| Proxy metric                            | Unit                  | Goal     | Source                                      | Status |
| --------------------------------------- | --------------------- | -------- | ------------------------------------------- | ------ |
| Actions completed by their due date     | %                     | Maximise | Activity lead meetings, governance meetings | Derive |
| Decisions logged per governance meeting | decisions per meeting | Monitor  | Governance meetings                         | Derive |
| Attendance of key roles                 | %                     | Maximise | Activity lead meetings, governance meetings | Derive |

### Indicator 4.1-B: The team finds its ways of working effective

#### 4.1-B1 Team perception

**Frequency:** per retro, trended quarterly. **Span:** period.

| Proxy metric                                              | Unit           | Goal     | Source                             | Status    |
| --------------------------------------------------------- | -------------- | -------- | ---------------------------------- | --------- |
| Pulse rating of meetings, communication and collaboration | score (1 to 5) | Maximise | Leadership retros (pulse question) | Build (L) |
| Recurring retro themes resolved within two retros         | %              | Maximise | Leadership retros                  | Derive    |

### Indicator 4.1-C: Collaboration across partners works

#### 4.1-C1 Code collaboration across CSIRO, Macquarie and EFN

**Frequency:** monthly. **Span:** period.

| Proxy metric                                    | Unit    | Goal     | Source | Status |
| ----------------------------------------------- | ------- | -------- | ------ | ------ |
| Median time to first review on pull requests    | hours   | Minimise | GitHub | Derive |
| Pull requests reviewed by another organisation  | %       | Monitor  | GitHub | Derive |
| Commits the DASS fork is behind upstream FAIMS3 | commits | Minimise | GitHub | Derive |

### Indicator 4.1-D: Operational processes work under pressure

#### 4.1-D1 Incident and support response

**Frequency:** monthly, and per event. **Span:** period, and per event.

| Proxy metric                                     | Unit    | Goal         | Source                         | Status    |
| ------------------------------------------------ | ------- | ------------ | ------------------------------ | --------- |
| Median time to acknowledge an alarm or incident  | minutes | Minimise     | CloudWatch, GitHub (incidents) | Derive    |
| Median time to resolve an incident               | hours   | Minimise     | GitHub (incidents)             | Derive    |
| Incidents with a completed post-incident review  | %       | Target: 100% | GitHub (incidents)             | Derive    |
| Support requests answered within the agreed time | %       | Maximise     | Support desk                   | Build (L) |

## 4.2 Benefit compared with time, resources and workload

> Are NBIC's current ways of working providing reasonable benefit when
> evaluated against associated time, resources and workload required?

### Indicator 4.2-A: Running DASS is cost-efficient

#### 4.2-A1 Infrastructure cost

**Frequency:** monthly. **Span:** period, and annual.

| Proxy metric                   | Unit                  | Goal     | Source                           | Status |
| ------------------------------ | --------------------- | -------- | -------------------------------- | ------ |
| AWS spend for DASS, by service | AUD per month         | Minimise | AWS Cost Explorer                | Now    |
| Cost per active agency         | AUD per agency        | Minimise | AWS Cost Explorer, CouchDB query | Derive |
| Cost per 1,000 records         | AUD per 1,000 records | Minimise | AWS Cost Explorer, admin stats   | Derive |
| Cost per GB stored             | AUD per GB            | Minimise | AWS Cost Explorer, admin stats   | Derive |

### Indicator 4.2-B: Effort is proportionate to benefit

#### 4.2-B1 Effort by activity

**Frequency:** quarterly. **Span:** period.

| Proxy metric                                                                               | Unit               | Goal     | Source                                 | Status    |
| ------------------------------------------------------------------------------------------ | ------------------ | -------- | -------------------------------------- | --------- |
| Team-estimated effort split: development, support, onboarding, engagement, governance, MEL | % of effort        | Monitor  | Leadership retros (quarterly estimate) | Build (L) |
| Engineering effort on fork maintenance and upstream merges, versus new features            | % of pull requests | Minimise | GitHub (labels)                        | Derive    |

#### 4.2-B2 Support and onboarding load

**Frequency:** quarterly. **Span:** period.

| Proxy metric                                               | Unit              | Goal     | Source                         | Status    |
| ---------------------------------------------------------- | ----------------- | -------- | ------------------------------ | --------- |
| Support requests per active user                           | requests per user | Minimise | Support desk, CouchDB query    | Build (L) |
| Staff time to onboard an agency                            | hours per agency  | Minimise | Twenty CRM (onboarding effort) | Build (L) |
| Agencies onboarded with no hands-on support (self-service) | %                 | Maximise | Twenty CRM                     | Derive    |

#### 4.2-B3 Cost of MEL itself

**Frequency:** annual. **Span:** annual.

| Proxy metric                                                | Unit           | Goal     | Source                              | Status    |
| ----------------------------------------------------------- | -------------- | -------- | ----------------------------------- | --------- |
| Team-estimated time spent collecting and reporting MEL data | hours per year | Minimise | Leadership retros (annual estimate) | Build (L) |
| Metrics in this document produced automatically             | %              | Maximise | This document                       | Derive    |

### Indicator 4.2-C: Agencies get value for their effort

#### 4.2-C1 Agency-side benefit

**Frequency:** annual. **Span:** annual.

| Proxy metric                                                        | Unit                   | Goal     | Source                               | Status    |
| ------------------------------------------------------------------- | ---------------------- | -------- | ------------------------------------ | --------- |
| Reported time saved per assessment                                  | minutes per assessment | Maximise | User survey, use case investigations | Build (M) |
| Licence costs avoided (active users times a typical per-seat price) | AUD per year           | Maximise | Admin stats plus stated assumption   | Derive    |

## 4.3 Clarity of purpose and contribution to mission

> Do we have a clear understanding of what we're doing, and how our ways of
> working are contributing to NBIC's current and future mission?

### Indicator 4.3-A: The team understands how its work contributes

#### 4.3-A1 Shared understanding

**Frequency:** twice a year. **Span:** point in time.

| Proxy metric                                                                     | Unit | Goal     | Source                             | Status    |
| -------------------------------------------------------------------------------- | ---- | -------- | ---------------------------------- | --------- |
| Team agreeing "I understand how my work contributes to the NBIC mission"         | %    | Maximise | Leadership retros (pulse question) | Build (L) |
| Team members whose one-line description of DASS's purpose matches the agreed one | %    | Maximise | Leadership retros                  | Derive    |

### Indicator 4.3-B: Work is traceable to strategy

#### 4.3-B1 Traceability

**Frequency:** quarterly. **Span:** point in time.

| Proxy metric                                                   | Unit   | Goal     | Source           | Status    |
| -------------------------------------------------------------- | ------ | -------- | ---------------- | --------- |
| Roadmap items linked to a strategic objective or outcome       | %      | Maximise | GitHub (labels)  | Build (L) |
| Time since the roadmap and theory of change were last reviewed | months | Minimise | Strategic review | Derive    |

### Indicator 4.3-C: MEL findings change what we do

#### 4.3-C1 Learning loop

**Frequency:** annual. **Span:** annual.

| Proxy metric                                                 | Unit   | Goal        | Source              | Status |
| ------------------------------------------------------------ | ------ | ----------- | ------------------- | ------ |
| MEL findings that led to a recorded action or roadmap change | %      | Maximise    | Strategic review    | Derive |
| Roadmap endorsed by governance in the current cycle          | yes/no | Target: yes | Governance meetings | Derive |

# Instrumentation gaps {.theme}

These **Build** items unlock the most metrics. They are listed roughly by
value for effort. Most would land upstream in FAIMS3 behind DASS
configuration.

| #   | Gap                                                                                                                                     | Unlocks                                           | Effort |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------ |
| 1   | Scheduled snapshot of admin stats (for example monthly) to S3 or a CouchDB database                                                     | Every trend line in 1.2 and 4.2                   | L      |
| 2   | Keep audit logs longer than one month (export to S3, or longer CloudWatch retention)                                                    | Exports, invites, map layer metrics               | L      |
| 3   | Metrics extraction script that writes the **Derive** platform metrics to CSV for standard reporting                                     | Most of themes 1 and 2                            | M      |
| 4   | Team metadata: agency, jurisdiction, sector (including Indigenous organisation)                                                         | 1.2-A, 3.1-C, 3.2                                 | L      |
| 5   | Survey purpose flag: post-impact, preparedness (for example fuel hazard), exercise, research                                            | 1.1-A1, 1.1-A2, 1.2-D                             | L      |
| 6   | User `createdAt` and `lastLoginAt`                                                                                                      | 1.2-B                                             | L      |
| 7   | Event register (in Twenty CRM or a separate database), linked to surveys                                                                | 1.1-B1, 1.1-B4                                    | M      |
| 8   | National template flag, plus template lineage and version recorded when a survey is created                                             | 1.1-A2, 1.1-B3, 1.2-C3, 2.2-C, 3.1-B              | M      |
| 9   | Server-side record of app version and platform when a client refreshes its session (aggregated)                                         | 1.2-B3, version-support decisions                 | L      |
| 10  | External uptime monitor on the API and apps                                                                                             | 1.3-B3, 2.2-A3                                    | L      |
| 11  | Server receipt timestamp on synced records                                                                                              | 1.1-B4                                            | M      |
| 12  | Stored validation status on records                                                                                                     | 1.1-B2                                            | M      |
| 13  | Opt-in, privacy-preserving client telemetry for sync success and capture-to-sync time                                                   | 1.1-B4, 1.3-B2                                    | H      |
| 14  | Standard post-event debrief and annual user survey (could run as DASS surveys)                                                          | 1.1-B5, 1.1-B6, 1.3-A, 2.2-B, 4.2-C               | M      |
| 15  | Support desk with categories, and GitHub labels linking issues to stakeholders and strategy                                             | 1.3-C, 2.2-B, 4.2-B, 4.3-B                        | L      |
| 16  | Twenty CRM additions: feedback log, pipeline stages, link to DASS teams, data agreements, data requests, onboarding baseline and effort | 1.1-B6, 1.2-A1, 1.3-A1, 1.3-C1, 3.1-C, 3.2, 4.2-B | L      |
| 18  | DASS privacy policy and terms of service covering aggregated usage metrics (see Privacy risks)                                          | Every metric marked "agreed with custodians"      | L      |
| 17  | Pulse questions in leadership retros (ways of working, purpose, effort split)                                                           | 4.1-B, 4.2-B, 4.3-A                               | L      |

# Reporting rhythm

How the metrics above could feed each reporting activity.

| Activity               | Cadence                   | Metrics to bring                                                                                              |
| ---------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------- |
| DASS metrics dashboard | Live, snapshotted monthly | All **Now** and scripted **Derive** platform metrics: readiness, teams, users, records, exports, errors, cost |
| Activity lead meetings | Monthly or as held        | Operational view: active agencies and users, incidents, feedback themes, delivery status                      |
| Leadership retros      | Per retro                 | Ways-of-working pulse, action follow-through, effort split                                                    |
| Governance meetings    | Three times a year        | Milestones and risks, adoption trends, stakeholder engagement, service levels, security posture               |
| Per event              | After each event          | Speed of deployment, throughput, time to usable data, debrief responses, availability during event            |
| Strategic review       | Annual or biannual        | Annual trends, use case synthesis, decision-change evidence, value for effort, gaps list                      |

# Open questions

- **Framework sources.** Confirm which of the MEL framework sources marked
  Uncertain are relevant to DASS.
- **Event register.** Should events live in Twenty CRM or in a separate
  database, and who keeps it up to date during an event?
- **National templates.** How is "endorsed national template" decided today,
  and who maintains the list? This determines how the national flag (gap 8)
  is set.
- **Targets.** What is the target list of agencies per jurisdiction for
  measuring coverage (1.2-A1), and what availability target should DASS
  commit to (1.3-B3, 2.2-A3)?
- **Custodian consent.** Which metrics that look inside records (location,
  completeness) are acceptable to agencies, and does that need to be written
  into data agreements?
- **CRM scope.** Twenty CRM is currently DASS only. If it expands to other
  NBIC products, DASS engagements need a consistent product tag.
