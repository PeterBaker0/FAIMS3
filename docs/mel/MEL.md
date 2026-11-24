---
title: 'MEL metrics for DASS'
subtitle: 'Branch context: misc/mel-metrics'
date: 'November 2026'
toc: false
---

# Purpose

NBIC (CSIRO's
[National Bushfire Intelligence Capability](https://research.csiro.au/nbic/))
runs a Monitoring, Evaluation and Learning (MEL) framework. The framework asks
a fixed set of questions under four themes (Adoption, Deliverables, Engagement,
Operations). It then answers them from a mix of sources: Twenty CRM, the
quantitative spreadsheet (DAP dashboard), use case investigations, the
on-demand MEL form, activity lead meetings, leadership team retros, governance
activities and the annual or biannual strategic review.

This branch works out which metrics the Disaster Assessment Surveyor System
(DASS) could provide for each MEL question, so that reporting can draw on
evidence rather than only anecdote.

## DASS, FAIMS3 and Fieldmark

- **FAIMS3** is the shared open-source code base (this repository),
  maintained by CSIRO, Macquarie University and Electronic Field Notebooks
  (EFN).
- **DASS** is CSIRO's private fork of FAIMS3 for NBIC: light theming plus
  configuration for the DASS AWS environment. It is the deployment these
  metrics are about.
- **Fieldmark** is a separate, proprietary FAIMS3 deployment run by EFN. It is
  not part of DASS and its usage must not be counted in DASS metrics.

Because DASS shares the FAIMS3 code, any instrumentation proposed here would
normally land upstream in FAIMS3 and be switched on by DASS configuration.

## What DASS is for

DASS supports the collection of post-impact survey data on properties and
sites damaged by bushfire. It is available to all relevant Australian State
and Territory stakeholders, and the collecting agency keeps custodianship of
its data. Its goals, which the metrics should reflect, are:

- consistent, standardised post-bushfire impact data that is comparable
  across time and between jurisdictions;
- better collaboration and data exchange between bushfire and emergency
  service agencies;
- support for national modelling, preparedness and resilience work.

The platform is a field app (iOS, Android and web) backed by Australian-hosted
cloud infrastructure. Key features that metrics can attach to: offline
collection with later sync, no per-device licences and simple sign-up, a
national library of endorsed templates, a form designer for agency
customisation, uploaded spatial layers for offline use, in-field helper text,
and one-click exports plus API integration.

# Scope of this branch

This branch is documentation only. It does not change application code.

1. Document the MEL questions and break each one down into:
   - **indicators**: what would tell us the question is being answered well;
   - **measures**: a quantity or judgement against an indicator, with the
     **time span** it should be reported over;
   - **proxy metrics**: concrete things we can count or collect, with the
     **source** they come from and whether that source exists today.
2. Do not limit the list to what we can collect today. Where a metric needs
   new instrumentation, say so, so the gap list can feed the roadmap.
3. Provide a markdown-to-PDF pipeline, so drafts can be circulated to people
   who do not read markdown.

# Files

| File                | What it is                                   |
| ------------------- | -------------------------------------------- |
| `MEL.md`            | This file: task and branch context           |
| `mel-metrics.md`    | The metrics draft, by question               |
| `build-pdf.sh`      | Builds a PDF from one or more markdown files |
| `assets/mel.css`    | Print stylesheet used for the PDF            |
| `out/` (gitignored) | Generated HTML and PDF output                |

# Building the PDF

The pipeline is pandoc (markdown to self-contained HTML, with a table of
contents) followed by headless Chromium (HTML to PDF). Styling lives in
`assets/mel.css`, so the look can be changed without touching the script.

```bash
# Build every markdown file in docs/mel into docs/mel/out/
./docs/mel/build-pdf.sh

# Build specific files, landscape (better for wide tables)
./docs/mel/build-pdf.sh --landscape docs/mel/mel-metrics.md
```

Requirements:

- `pandoc` 3.x on `PATH`. If you have no root access, download the static
  release from <https://github.com/jgm/pandoc/releases> and copy
  `bin/pandoc` into `~/.local/bin`.
- A Chromium or Chrome binary. The script uses `$CHROME_BIN` if set, then
  looks for `chrome-headless-shell`, `google-chrome`, `chromium` and
  `chromium-browser` on `PATH`, then in the Playwright browser cache
  (`~/.cache/ms-playwright`, populated by `npx playwright install
chromium-headless-shell`). The headless shell is the most reliable choice
  on machines with no display. Page numbers in the footer need Chromium 131
  or newer.

# Working notes

- The source codes used in `mel-metrics.md` (for example "Admin stats" or
  "Audit logs") are defined once in its source catalogue section.
- Each metric is tagged **Now** (collectable today), **Derive** (the data
  exists but needs a query or script) or **Build** (needs new
  instrumentation or a new process).
- Follow-up work, once the draft is agreed, is likely to be:
  - scripts that produce the **Derive** metrics from CouchDB and CloudWatch;
  - deciding which **Build** items are worth the privacy and engineering
    cost (most notably opt-in client telemetry);
  - a periodic export of these metrics into the DAP dashboard.
