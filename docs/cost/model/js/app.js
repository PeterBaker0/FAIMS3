/*
 * DASS operating cost model: UI controller. Renders inputs once per structural
 * change and refreshes outputs on every edit.
 */
(function () {
  'use strict';

  const M = window.CostModel;
  const C = window.Charts;
  const STORAGE_KEY = 'dass-cost-model-v1';

  const COST_COLORS = {
    hosting: '#1f4e79',
    people: '#0b6b5a',
    backfill: '#c2410c',
    other: '#7c5cbf',
    contingency: '#a3acb7',
  };
  const HOSTING_COLORS = {
    couchCompute: '#1f4e79',
    couchStorage: '#5b8bb5',
    conductor: '#0b6b5a',
    spatial: '#6aa84f',
    s3: '#94c9b8',
    egress: '#b45309',
    network: '#7c5cbf',
    observability: '#d4a017',
    platform: '#8a96a3',
    nonProd: '#c8ced6',
    savings: '#2e8b57',
    gst: '#9a3412',
  };
  const JOB_PALETTE = [
    '#1f4e79', '#0b6b5a', '#b45309', '#7c5cbf', '#6aa84f', '#c2410c', '#2b8cbe',
    '#d4a017', '#8c564b', '#e377c2', '#17becf', '#5d6877', '#9467bd', '#bcbd22', '#ff7f0e',
  ];

  let state = load();
  let result = null;
  let activeTab = 'overview';
  let demandYear = 0;
  let pending = false;

  // ---------- persistence ----------

  function isObj(v) {
    return v && typeof v === 'object' && !Array.isArray(v);
  }

  function merge(base, over) {
    Object.keys(over || {}).forEach(k => {
      if (isObj(base[k]) && isObj(over[k])) merge(base[k], over[k]);
      else base[k] = over[k];
    });
    return base;
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return merge(M.defaultState(), JSON.parse(raw));
    } catch (e) {
      console.warn('Could not load saved model', e);
    }
    return M.defaultState();
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Could not save model', e);
    }
  }

  // ---------- helpers ----------

  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  }

  function getPath(obj, path) {
    return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  }

  function setPath(obj, path, v) {
    const ks = path.split('.');
    let o = obj;
    for (let i = 0; i < ks.length - 1; i++) {
      if (o[ks[i]] == null) o[ks[i]] = {};
      o = o[ks[i]];
    }
    o[ks[ks.length - 1]] = v;
  }

  function aud(v) {
    const r = Math.round(v || 0);
    return `${r < 0 ? '−' : ''}A$${Math.abs(r).toLocaleString('en-AU')}`;
  }

  function audk(v) {
    const a = Math.abs(v || 0);
    const sign = v < 0 ? '−' : '';
    if (a >= 1e6) return `${sign}A$${(a / 1e6).toFixed(a >= 1e7 ? 1 : 2)}M`;
    if (a >= 1e4) return `${sign}A$${Math.round(a / 1e3)}k`;
    if (a >= 1e3) return `${sign}A$${(a / 1e3).toFixed(1)}k`;
    return `${sign}A$${Math.round(a)}`;
  }

  function usd(v) {
    return `US$${(v || 0).toLocaleString('en-AU', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  }

  function num(v, d = 0) {
    return (v || 0).toLocaleString('en-AU', {minimumFractionDigits: d, maximumFractionDigits: d});
  }

  function gb(v) {
    if (v >= 1000) return `${(v / 1024).toFixed(v >= 10240 ? 0 : 1)} TB`;
    return `${num(v, v > 0 && v < 10 ? 1 : 0)} GB`;
  }

  function uid(prefix) {
    return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  }

  function badge(kind) {
    if (!kind) return '';
    if (kind === 'measured') return '<span class="badge measured">measured</span>';
    return '<span class="badge">estimate</span>';
  }

  function jobColor(i) {
    return JOB_PALETTE[i % JOB_PALETTE.length];
  }

  function annualise(y) {
    return 12 / y.months;
  }

  const JOB_TYPES = [
    ['Run', 'Keep the live service safe and available: patching, monitoring, incidents, infrastructure, security.'],
    ['Maintain', 'Keep the product working and shippable without changing what it does: bug fixes, releases, QA.'],
    ['Improve', 'Add or improve capability: new features and enhancements.'],
    ['Support', 'Help agencies and users: helpdesk, onboarding and training, data requests, documentation.'],
    ['Govern', 'Direct and account for the service: product management, roadmap, stakeholder and funder reporting.'],
  ];
  const JOB_TYPE_HELP = Object.fromEntries(JOB_TYPES);

  // ---------- field definitions ----------

  const GLOBAL_FIELDS = [
    {path: 'meta.startMonth', label: 'Start month', type: 'month'},
    {path: 'meta.horizonMonths', label: 'Projection length', type: 'select', options: [[12, '1 year'], [24, '2 years'], [36, '3 years'], [48, '4 years'], [60, '5 years']], numeric: true},
    {path: 'meta.fxUsdAud', label: 'AUD per 1 USD', step: 0.01, hint: 'AWS bills in USD. All outputs are in AUD.'},
    {path: 'meta.gstOnAws', label: 'Add 10% GST to AWS', type: 'toggle', hint: 'The prod bill already carries GST. Untick if GST is recovered as an input tax credit.'},
    {path: 'meta.contingencyPct', label: 'Contingency', unit: '%', step: 1},
    {path: 'meta.salaryEscalationPct', label: 'Day-rate escalation', unit: '%/yr', step: 0.5},
    {path: 'meta.awsEscalationPct', label: 'AWS price change', unit: '%/yr', step: 0.5},
    {path: 'meta.otherEscalationPct', label: 'Other-cost escalation', unit: '%/yr', step: 0.5},
    {path: 'meta.overheadPct', label: 'On-costs on day rates', unit: '%', step: 1, hint: 'Leave at 0 if the day rates are already fully loaded.'},
    {path: 'meta.priceUnmetDemand', label: 'Price unmet work', type: 'toggle', hint: 'Work nobody is allocated to is costed at the backfill rate.'},
    {path: 'meta.backfillDayRate', label: 'Backfill day rate', unit: 'A$/day', step: 50},
  ];

  const ADOPTION_FIELDS = [
    {path: 'adoption.agenciesStart', label: 'Agencies at start', type: 'range', min: 0, max: 100, step: 1},
    {path: 'adoption.agenciesEnd', label: 'Agencies at end', type: 'range', min: 0, max: 150, step: 1},
    {path: 'adoption.usersPerAgencyStart', label: 'Users per agency at start', type: 'range', min: 1, max: 300, step: 1},
    {path: 'adoption.usersPerAgencyEnd', label: 'Users per agency at end', type: 'range', min: 1, max: 300, step: 1},
    {path: 'adoption.activeFraction', label: 'Share of users active in a month', type: 'range', min: 0.05, max: 1, step: 0.05, hint: 'Field data collection is seasonal. Usage-driven costs scale with active users.'},
    {path: 'adoption.curve', label: 'Adoption curve', type: 'select', options: [['linear', 'Linear'], ['s', 'S-curve (slow, fast, plateau)'], ['early', 'Front-loaded']]},
  ];

  const USAGE_FIELDS = [
    {path: 'adoption.recordsPerUserMonth', label: 'Records created', unit: '/month', type: 'range', min: 0, max: 2000, step: 10},
    {path: 'adoption.recordKB', label: 'Record size (JSON)', unit: 'KB', type: 'range', min: 1, max: 100, step: 1},
    {path: 'adoption.couchOverhead', label: 'CouchDB storage multiplier on records', unit: '×', type: 'range', min: 1, max: 6, step: 0.1, hint: 'Revisions, view indexes and compaction slack.'},
    {path: 'adoption.photoMBPerUserMonth', label: 'Photos and attachments', unit: 'MB/mo', type: 'range', min: 0, max: 2000, step: 10, hint: 'Stored inside CouchDB today, so they grow the EBS volume.'},
    {path: 'adoption.mapLayersPerAgencyMonth', label: 'Map layers uploaded per agency', unit: '/month', type: 'range', min: 0, max: 50, step: 0.5},
    {path: 'adoption.mapLayerMB', label: 'Map layer upload size', unit: 'MB', type: 'range', min: 0, max: 5000, step: 10},
    {path: 'adoption.mapDerivedFactor', label: 'Processed outputs vs upload size', unit: '×', type: 'range', min: 0, max: 5, step: 0.1, hint: 'Tiles / cloud-optimised outputs kept in S3 beside the original.'},
    {path: 'adoption.processingMinPerLayer', label: 'GDAL processing time per layer', unit: 'min', type: 'range', min: 0, max: 240, step: 1},
    {path: 'adoption.syncGBPerUserMonth', label: 'Sync and API egress', unit: 'GB/mo', type: 'range', min: 0, max: 10, step: 0.05, hint: 'Today about 0.15 GB per active user, measured.'},
    {path: 'adoption.mapDownloadGBPerUserMonth', label: 'Custom map-layer downloads', unit: 'GB/mo', type: 'range', min: 0, max: 10, step: 0.05},
    {path: 'adoption.logMBPerUserMonth', label: 'Log volume', unit: 'MB/mo', type: 'range', min: 0, max: 200, step: 1},
  ];

  const COUCH_FIELDS = [
    {path: 'infra.currentDataGB', label: 'CouchDB data today', unit: 'GB', step: 1, badge: 'estimate', hint: 'Inferred from about 18 GB-months of snapshot billing. Check with df on the instance.'},
    {path: 'infra.attachmentsInS3', label: 'Store photos in S3 instead of CouchDB', type: 'toggle', hint: 'Architecture change lever: S3 at US$0.025/GB vs gp3 EBS × headroom × nodes.'},
    {path: 'infra.couchNodes', label: 'CouchDB nodes', type: 'select', options: [[1, '1 (single node, today)'], [3, '3 (cluster)']], numeric: true},
    {path: 'infra.couchTierFloor', label: 'Smallest instance allowed', type: 'select', optionsFn: () => state.infra.couchTiers.map(t => [t.type, t.type]), hint: 'Today m5.xlarge. AWS rightsizing says m5.large would do (max CPU 23%).'},
    {path: 'infra.volumeHeadroom', label: 'EBS headroom over data', unit: '×', step: 0.1},
    {path: 'infra.minVolumeGB', label: 'Minimum data volume', unit: 'GB', step: 50},
    {path: 'infra.volumeStepGB', label: 'Volume grows in steps of', unit: 'GB', step: 50},
    {path: 'infra.rootVolGB', label: 'Root volume (gp2)', unit: 'GB', step: 1},
  ];

  const COMPUTE_FIELDS = [
    {path: 'infra.conductorVcpu', label: 'Conductor task vCPU', type: 'select', options: [[0.25, '0.25'], [0.5, '0.5'], [1, '1'], [2, '2 (today)'], [4, '4'], [8, '8']], numeric: true},
    {path: 'infra.conductorGB', label: 'Conductor task memory', unit: 'GB', step: 0.5},
    {path: 'infra.activeUsersPerTask', label: 'Active users per conductor task', step: 50},
    {path: 'infra.minConductorTasks', label: 'Minimum conductor tasks', step: 1},
    {path: 'infra.workerVcpu', label: 'Spatial worker vCPU', step: 0.25},
    {path: 'infra.workerGB', label: 'Spatial worker memory', unit: 'GB', step: 0.5},
    {path: 'infra.workerEphemeralGB', label: 'Worker scratch disk', unit: 'GB', step: 10},
    {path: 'infra.workerIdleExitMin', label: 'Worker idle time before exit', unit: 'min', step: 1},
    {path: 'infra.currentMapGB', label: 'Map layers in S3 today', unit: 'GB', step: 1, badge: 'estimate'},
    {path: 'infra.fixedPublicIps', label: 'Fixed public IPv4 (ALB ×2, Kuma)', step: 1, badge: 'measured'},
    {path: 'infra.albBaseLcuHoursMonth', label: 'Load balancer idle floor', unit: 'LCU-h/mo', step: 5, badge: 'measured', hint: 'About 40 LCU-hours a month at today\'s low traffic (health checks, open sync connections). Traffic on top is costed automatically from the sync, upload and download volumes on the Adoption tab.'},
  ];

  const COMMERCIAL_FIELDS = [
    {path: 'infra.baseLogGBMonth', label: 'Baseline log ingest', unit: 'GB/mo', step: 0.1, badge: 'estimate'},
    {path: 'infra.logRetentionMonths', label: 'Log retention', unit: 'months', step: 1, hint: 'The CouchDB log group currently has no retention set.'},
    {path: 'infra.savingsPlanPct', label: 'Compute Savings Plan discount', unit: '%', type: 'range', min: 0, max: 45, step: 1, hint: 'Applies to EC2 and Fargate. CE quotes about 16% for a 1-year no-upfront plan.'},
    {path: 'infra.nonProdUsdMonth', label: 'Dev and staging environments', unit: 'US$/mo', step: 10, badge: 'estimate', hint: 'Not measured. Set from the non-prod account bill.'},
  ];

  const PRICE_LABELS = {
    fargateVcpuHr: 'Fargate per vCPU-hour',
    fargateGBHr: 'Fargate per GB-hour',
    fargateEphemeralGBHr: 'Fargate scratch disk per GB-hour over 20 GB',
    gp3GBMonth: 'EBS gp3 per GB-month',
    gp2GBMonth: 'EBS gp2 per GB-month',
    snapshotGBMonth: 'EBS snapshot per GB-month',
    s3GBMonth: 'S3 Standard per GB-month',
    egressGB: 'Data transfer out per GB',
    albHr: 'ALB per hour',
    lcuHr: 'ALB per LCU-hour',
    ipv4Hr: 'Public IPv4 per hour',
    logIngestGB: 'CloudWatch Logs ingest per GB',
    logStoreGBMonth: 'CloudWatch Logs storage per GB-month',
    cloudwatchFixedMonth: 'CloudWatch metrics, dashboard, alarms per month',
    secretsMonth: 'Secrets Manager per month',
    securityBaselineMonth: 'Security Hub, GuardDuty, Inspector, Config per month',
    miscMonth: 'SSM, Route 53, KMS, misc per month',
    kumaMonth: 'Uptime Kuma (t3.micro + 30 GB) per month',
  };

  const SCENARIO_PATHS = /^(adoption\.|infra\.couchNodes$|infra\.minConductorTasks$)/;

  // ---------- field rendering ----------

  function fieldHtml(d) {
    const v = getPath(state, d.path);
    const id = `f_${d.path.replace(/\W/g, '_')}`;
    const hint = d.hint || d.badge ? `<div class="hint">${d.hint || ''}${badge(d.badge)}</div>` : '';
    const unit = d.unit ? `<span class="unit">${d.unit}</span>` : '';
    if (d.type === 'toggle') {
      return `<div class="field"><label for="${id}">${d.label}</label><div class="control"><input type="checkbox" class="toggle" id="${id}" data-path="${d.path}" data-type="bool" ${v ? 'checked' : ''}/></div>${hint}</div>`;
    }
    if (d.type === 'select') {
      const opts = (d.optionsFn ? d.optionsFn() : d.options)
        .map(([val, lab]) => `<option value="${esc(val)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(lab)}</option>`)
        .join('');
      return `<div class="field"><label for="${id}">${d.label}</label><div class="control"><select id="${id}" data-path="${d.path}" data-type="${d.numeric ? 'num' : 'text'}">${opts}</select></div>${hint}</div>`;
    }
    if (d.type === 'month') {
      return `<div class="field"><label for="${id}">${d.label}</label><div class="control"><input type="month" id="${id}" data-path="${d.path}" data-type="text" value="${esc(v)}"/></div>${hint}</div>`;
    }
    if (d.type === 'range') {
      return `<div class="field range"><label for="${id}">${d.label}</label><div class="control"><input type="range" min="${d.min}" max="${d.max}" step="${d.step}" value="${v}" data-path="${d.path}" data-type="num" aria-label="${esc(d.label)}"/><input type="number" class="narrow" id="${id}" step="${d.step}" value="${v}" data-path="${d.path}" data-type="num"/>${unit}</div>${hint}</div>`;
    }
    return `<div class="field"><label for="${id}">${d.label}</label><div class="control"><input type="number" id="${id}" step="${d.step || 'any'}" value="${v}" data-path="${d.path}" data-type="num"/>${unit}</div>${hint}</div>`;
  }

  function renderFields(container, defs) {
    $(container).innerHTML = defs.map(fieldHtml).join('');
  }

  // ---------- structural rendering ----------

  function renderScenarioControls() {
    const keys = Object.keys(M.SCENARIOS);
    $('#scenarioButtons').innerHTML =
      keys
        .map(k => `<button data-action="scenario" data-key="${k}" class="${state.scenario === k ? 'active' : ''}">${esc(M.SCENARIOS[k].label)}</button>`)
        .join('') + `<button class="${state.scenario === 'custom' ? 'active' : ''}" disabled>Custom (edited)</button>`;
    $('#scenarioNote').textContent =
      state.scenario === 'custom'
        ? 'You have edited adoption or usage values. Pick a preset to reset them.'
        : M.SCENARIOS[state.scenario]?.desc || '';
    $('#scenarioCards').innerHTML = keys
      .map(
        k => `<button class="scenario-card ${state.scenario === k ? 'active' : ''}" data-action="scenario" data-key="${k}">
          <h3>${esc(M.SCENARIOS[k].label)}</h3><p>${esc(M.SCENARIOS[k].desc)}</p></button>`
      )
      .join('');
  }

  function renderTierTable() {
    const rows = state.infra.couchTiers
      .map(
        (t, i) => `<tr>
        <td><input type="text" value="${esc(t.type)}" data-list="infra.couchTiers" data-idx="${i}" data-key="type" data-type="text" style="width:7rem"/></td>
        <td class="num-input"><input type="number" step="0.01" value="${t.usdHr}" data-list="infra.couchTiers" data-idx="${i}" data-key="usdHr" data-type="num"/></td>
        <td class="num-input"><input type="number" step="50" value="${t.maxActiveUsers ?? ''}" placeholder="no limit" data-list="infra.couchTiers" data-idx="${i}" data-key="maxActiveUsers" data-type="numnull"/></td>
      </tr>`
      )
      .join('');
    $('#tierTable').innerHTML = `<table><thead><tr><th>Instance</th><th>US$/hour</th><th>Up to active users</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  function renderPriceFields() {
    $('#priceFields').innerHTML = Object.keys(state.prices)
      .map(k => fieldHtml({path: `prices.${k}`, label: PRICE_LABELS[k] || k, step: 'any'}))
      .join('');
  }

  function renderDemandYearSelect() {
    const n = Math.ceil(state.meta.horizonMonths / 12);
    if (demandYear >= n) demandYear = n - 1;
    $('#demandYear').innerHTML = Array.from({length: n}, (_, i) => `<option value="${i}" ${i === demandYear ? 'selected' : ''}>Year ${i + 1}</option>`).join('');
  }

  function renderPeopleStructure() {
    $('#peopleCards').innerHTML = state.people
      .map(
        (p, i) => `<div class="person">
        <div class="row"><input type="text" class="name" value="${esc(p.name)}" data-list="people" data-idx="${i}" data-key="name" data-type="text" aria-label="Name"/>
          <button class="icon danger" data-action="del-person" data-idx="${i}" title="Remove">✕</button></div>
        <div class="row"><input type="text" value="${esc(p.role)}" data-list="people" data-idx="${i}" data-key="role" data-type="text" aria-label="Role" placeholder="Role"/></div>
        <div class="row"><span class="small muted">Day rate (A$)</span><input type="number" step="50" value="${p.dayRate}" data-list="people" data-idx="${i}" data-key="dayRate" data-type="num"/></div>
        <div class="row"><span class="small muted">Available days / yr</span><input type="number" step="5" value="${p.availableDays}" data-list="people" data-idx="${i}" data-key="availableDays" data-type="num"/></div>
        <div class="stats">
          <div>Allocated<b data-out="pdays-${p.id}"></b></div>
          <div>Utilisation<b data-out="putil-${p.id}"></b></div>
          <div>Cost / yr<b data-out="pcost-${p.id}"></b></div>
        </div>
        <div class="split-bar" data-out-html="psplit-${p.id}"></div>
      </div>`
      )
      .join('');

    const head = `<tr><th>Job</th><th>Demand</th>${state.people.map(p => `<th>${esc(p.name)}</th>`).join('')}<th>Allocated</th><th>Gap / spare</th></tr>`;
    const body = state.jobs
      .map(
        (j, ji) => `<tr>
        <td><i style="display:inline-block;width:9px;height:9px;background:${jobColor(ji)};margin-right:6px"></i>${esc(j.name)}<span class="cat" title="${esc(JOB_TYPE_HELP[j.category] || '')}">${esc(j.category)}</span></td>
        <td data-out="jdemand-${j.id}"></td>
        ${state.people
          .map(
            (p, pi) => `<td class="num-input"><input type="number" min="0" step="0.5" value="${p.alloc?.[j.id] || 0}" data-list="people" data-idx="${pi}" data-key="alloc.${j.id}" data-type="num" aria-label="${esc(p.name)} days on ${esc(j.name)}"/></td>`
          )
          .join('')}
        <td data-out="jalloc-${j.id}"></td>
        <td data-out="jgap-${j.id}"></td>
      </tr>`
      )
      .join('');
    const foot = `<tr><td>Total</td><td data-out="tdemand"></td>${state.people.map(p => `<td data-out="pdays2-${p.id}"></td>`).join('')}<td data-out="talloc"></td><td data-out="tgap"></td></tr>`;
    $('#allocMatrix').innerHTML = `<table><thead>${head}</thead><tbody>${body}</tbody><tfoot>${foot}</tfoot></table>`;

    const jobRows = state.jobs
      .map(
        (j, i) => `<tr>
        <td><input type="text" class="wide" value="${esc(j.name)}" data-list="jobs" data-idx="${i}" data-key="name" data-type="text"/></td>
        <td><select data-list="jobs" data-idx="${i}" data-key="category" data-type="text">${JOB_TYPES
          .map(([c, help]) => `<option ${c === j.category ? 'selected' : ''} title="${esc(help)}">${c}</option>`)
          .join('')}</select></td>
        ${['base', 'perAgency', 'per1000Users', 'perNewAgency']
          .map(k => `<td class="num-input"><input type="number" min="0" step="0.5" value="${j[k]}" data-list="jobs" data-idx="${i}" data-key="${k}" data-type="num"/></td>`)
          .join('')}
        <td><button class="icon danger" data-action="del-job" data-idx="${i}" title="Remove job">✕</button></td>
      </tr>`
      )
      .join('');
    $('#jobTypes').innerHTML = JOB_TYPES.map(([c, help]) => `<dt>${c}</dt><dd>${esc(help)}</dd>`).join('');
    $('#jobsTable').innerHTML = `<table><thead><tr><th>Job</th><th title="A grouping label for reporting. It does not change any calculation.">Type ⓘ</th><th>Base days/yr</th><th>+ per agency</th><th>+ per 1,000 users</th><th>Per new agency (once)</th><th></th></tr></thead><tbody>${jobRows}</tbody></table>`;
  }

  function renderOtherStructure() {
    const rows = state.otherCosts
      .map(
        (o, i) => `<tr>
        <td><input type="text" class="wide" value="${esc(o.name)}" data-list="otherCosts" data-idx="${i}" data-key="name" data-type="text"/></td>
        <td class="num-input"><input type="number" step="10" value="${o.amount}" data-list="otherCosts" data-idx="${i}" data-key="amount" data-type="num" style="width:6rem"/></td>
        <td><select data-list="otherCosts" data-idx="${i}" data-key="currency" data-type="text">${['AUD', 'USD'].map(c => `<option ${c === o.currency ? 'selected' : ''}>${c}</option>`).join('')}</select></td>
        <td><select data-list="otherCosts" data-idx="${i}" data-key="scaling" data-type="text">${[
          ['none', 'Fixed'],
          ['perAgency', 'Per agency'],
          ['per1000Users', 'Per 1,000 users'],
        ]
          .map(([v, l]) => `<option value="${v}" ${v === o.scaling ? 'selected' : ''}>${l}</option>`)
          .join('')}</select></td>
        <td data-out="other-${o.id}"></td>
        <td><button class="icon danger" data-action="del-other" data-idx="${i}" title="Remove">✕</button></td>
      </tr>`
      )
      .join('');
    $('#otherTable').innerHTML = `<table><thead><tr><th>Item</th><th>Amount / yr</th><th>Currency</th><th>Scaling</th><th>Year 1 (AUD)</th><th></th></tr></thead>
      <tbody>${rows}</tbody><tfoot><tr><td>Total</td><td></td><td></td><td></td><td data-out="other-total"></td><td></td></tr></tfoot></table>`;
  }

  function renderRecoveryStructure() {
    const r = state.recovery;
    const defs = [
      {path: 'recovery.externalMode', label: 'External funding expressed as', type: 'select', options: [['pct', 'Share of total cost'], ['fixed', 'Fixed amount per year']]},
      r.externalMode === 'fixed'
        ? {path: 'recovery.externalFixedAud', label: 'External funding', unit: 'A$/yr', step: 5000, hint: 'Grants, NCRIS or programme funding. Capped at total cost.'}
        : {path: 'recovery.externalPct', label: 'External funding share', unit: '%', type: 'range', min: 0, max: 100, step: 1, hint: 'Grants, NCRIS or programme funding.'},
      {path: 'recovery.internalPct', label: 'Internal contribution (of the rest)', unit: '%', type: 'range', min: 0, max: 100, step: 1, hint: 'Share of the non-external remainder absorbed internally (for example CSIRO in-kind). The rest is charged to agencies.'},
      {path: 'recovery.marginPct', label: 'Margin / reserve on recovered amount', unit: '%', step: 1},
      {path: 'recovery.method', label: 'Split between agencies', type: 'select', options: [['equal', 'Equal share'], ['tiered', 'Tiered by agency size']]},
      {path: 'recovery.agencySource', label: 'Number of agencies paying', type: 'select', options: [['scenario', 'From the adoption scenario (average per year)'], ['override', 'Fixed number']]},
    ];
    if (r.agencySource === 'override') defs.push({path: 'recovery.overrideAgencies', label: 'Agencies paying', step: 1});
    defs.push({path: 'recovery.gstOnPrice', label: 'Quote prices including GST', type: 'toggle'});
    renderFields('#recoveryFields', defs);

    const rows = r.tiers
      .map(
        (t, i) => `<tr>
        <td><input type="text" value="${esc(t.name)}" data-list="recovery.tiers" data-idx="${i}" data-key="name" data-type="text" style="width:8rem"/></td>
        <td class="num-input"><input type="number" step="1" value="${t.share}" data-list="recovery.tiers" data-idx="${i}" data-key="share" data-type="num"/></td>
        <td class="num-input"><input type="number" step="0.5" value="${t.weight}" data-list="recovery.tiers" data-idx="${i}" data-key="weight" data-type="num"/></td>
        <td><button class="icon danger" data-action="del-tier" data-idx="${i}" title="Remove tier">✕</button></td>
      </tr>`
      )
      .join('');
    $('#tiersTable').innerHTML = `<table><thead><tr><th>Tier</th><th>% of agencies</th><th>Price weight</th><th></th></tr></thead><tbody>${rows}</tbody></table>
      <p class="caption">A weight of 2 pays twice the small-tier price. Percentages are normalised if they do not add up to 100. Tiers are used only when the split is "Tiered".</p>`;
  }

  function renderInputs() {
    renderScenarioControls();
    renderFields('#globalFields', GLOBAL_FIELDS);
    renderFields('#adoptionFields', ADOPTION_FIELDS);
    renderFields('#usageFields', USAGE_FIELDS);
    renderFields('#couchFields', COUCH_FIELDS);
    renderFields('#computeFields', COMPUTE_FIELDS);
    renderFields('#commercialFields', COMMERCIAL_FIELDS);
    renderTierTable();
    renderPriceFields();
    renderDemandYearSelect();
    renderPeopleStructure();
    renderOtherStructure();
    renderRecoveryStructure();
    renderMethod();
  }

  // ---------- outputs ----------

  function setOut(key, text, cls) {
    $$(`[data-out="${key}"]`).forEach(el => {
      el.textContent = text;
      if (cls !== undefined) el.className = cls;
    });
  }

  function setOutHtml(key, html) {
    $$(`[data-out-html="${key}"]`).forEach(el => (el.innerHTML = html));
  }

  function scenarioName() {
    return state.scenario === 'custom' ? 'Custom' : M.SCENARIOS[state.scenario]?.label || '';
  }

  function renderSummary() {
    const t = result.totals;
    const y1 = result.years[0];
    const last = result.months[result.months.length - 1];
    const rec = result.recovery[0];
    const items = [
      ['Scenario', scenarioName()],
      [`Total, ${state.meta.horizonMonths} months`, aud(t.totalAud)],
      ['Year 1', aud(y1.totalAud)],
      ['Hosting, final month', aud(last.hostingAud)],
      ['Year-1 price per agency', aud(rec.perAgencyAnnualised)],
    ];
    $('#summaryBar').innerHTML = items.map(([l, v]) => `<div class="item"><span class="label">${l}</span><span class="value">${esc(v)}</span></div>`).join('');
  }

  function costSeries(months) {
    return [
      {name: 'AWS hosting', color: COST_COLORS.hosting, values: months.map(m => m.hostingAud)},
      {name: 'People (allocated)', color: COST_COLORS.people, values: months.map(m => m.peopleAud)},
      {name: 'Unmet work (backfill)', color: COST_COLORS.backfill, values: months.map(m => m.backfillAud)},
      {name: 'Other operating costs', color: COST_COLORS.other, values: months.map(m => m.otherAud)},
      {name: 'Contingency', color: COST_COLORS.contingency, values: months.map(m => m.contingencyAud)},
    ];
  }

  function renderOverview() {
    const t = result.totals;
    const ys = result.years;
    const years = state.meta.horizonMonths / 12;
    const share = v => `${Math.round((v / t.totalAud) * 100)}%`;
    const rec = result.recovery[0];
    const finalY = ys[ys.length - 1];
    $('#kpis').innerHTML = [
      ['Total cost over period', aud(t.totalAud), `${state.meta.horizonMonths} months from ${result.months[0].label}`],
      ['Average per year', aud(t.totalAud / years), `Year 1 ${audk(ys[0].totalAud)} · final year ${audk(finalY.totalAud * annualise(finalY))}/yr`],
      ['People vs hosting', `${share(t.peopleAud + t.backfillAud)} / ${share(t.hostingAud)}`, `People incl. unmet work ${audk(t.peopleAud + t.backfillAud)} · AWS ${audk(t.hostingAud)}`],
      ['Year-1 price per agency', aud(rec.perAgencyAnnualised), `${num(rec.agencies, 1)} agencies share ${audk(rec.recoverable)} after funding`],
    ]
      .map(([l, v, h]) => `<div class="kpi"><div class="label">${l}</div><div class="value">${v}</div><div class="hint">${h}</div></div>`)
      .join('');

    const labels = result.months.map(m => m.label);
    C.stacked($('#chartTotal'), {labels, series: costSeries(result.months), fmt: aud, tickFmt: audk, height: 320, yLabel: 'AUD per month'});

    let cum = 0;
    let cumHost = 0;
    const cumVals = result.months.map(m => (cum += m.totalAud));
    const cumHostVals = result.months.map(m => (cumHost += m.hostingAud));
    C.lines($('#chartCumulative'), {
      labels,
      series: [
        {name: 'All costs', color: COST_COLORS.people, values: cumVals},
        {name: 'AWS hosting only', color: COST_COLORS.hosting, values: cumHostVals, dash: true},
      ],
      fmt: aud,
      tickFmt: audk,
      height: 240,
    });

    renderScenarioCompare();

    const rows = ys
      .map((y, i) => {
        const r = result.recovery[i];
        return `<tr><td>${y.label}</td><td>${num(y.avgAgencies, 1)}</td><td>${num(y.avgUsers)}</td>
        <td>${aud(y.hostingAud)}</td><td>${aud(y.peopleAud)}</td><td>${aud(y.backfillAud)}</td><td>${aud(y.otherAud)}</td><td>${aud(y.contingencyAud)}</td>
        <td><b>${aud(y.totalAud)}</b></td><td>${aud(y.totalAud / Math.max(1, y.avgAgencies))}</td><td>${aud(r.perAgency)}</td></tr>`;
      })
      .join('');
    const tr = result.recovery.reduce((x, r) => x + r.recoverable, 0);
    $('#annualTable').innerHTML = `<table>
      <thead><tr><th>Period</th><th>Avg agencies</th><th>Avg users</th><th>AWS hosting</th><th>People</th><th>Unmet work</th><th>Other</th><th>Contingency</th><th>Total</th><th>Gross cost / agency</th><th>Agency price</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td>Total</td><td></td><td></td><td>${aud(t.hostingAud)}</td><td>${aud(t.peopleAud)}</td><td>${aud(t.backfillAud)}</td><td>${aud(t.otherAud)}</td><td>${aud(t.contingencyAud)}</td><td>${aud(t.totalAud)}</td><td></td><td>${aud(tr)} recovered</td></tr></tfoot>
    </table>`;

    renderSensitivity();
  }

  function renderScenarioCompare() {
    const rows = Object.keys(M.SCENARIOS).map(k => {
      const s = M.applyScenario(M.clone(state), k);
      const r = M.project(s);
      const last = r.months[r.months.length - 1];
      return {k, label: M.SCENARIOS[k].label, r, last};
    });
    $('#scenarioCompare').innerHTML = `<table>
      <thead><tr><th>Scenario</th><th>Total</th><th>AWS</th><th>People + unmet</th><th>Hosting, final month</th><th>Y1 price / agency</th></tr></thead>
      <tbody>${rows
        .map(
          x => `<tr ${x.k === state.scenario ? 'style="background:var(--accent-soft)"' : ''}><td>${esc(x.label)}</td><td><b>${audk(x.r.totals.totalAud)}</b></td><td>${audk(x.r.totals.hostingAud)}</td>
          <td>${audk(x.r.totals.peopleAud + x.r.totals.backfillAud)}</td><td>${aud(x.last.hostingAud)}</td><td>${aud(x.r.recovery[0].perAgencyAnnualised)}</td></tr>`
        )
        .join('')}</tbody></table>`;
  }

  const SENSITIVITY = [
    {label: 'Agencies at end ±50%', lo: s => (s.adoption.agenciesEnd *= 0.5), hi: s => (s.adoption.agenciesEnd *= 1.5)},
    {label: 'Users per agency at end ±50%', lo: s => (s.adoption.usersPerAgencyEnd *= 0.5), hi: s => (s.adoption.usersPerAgencyEnd *= 1.5)},
    {label: 'Photo MB per active user ±50%', lo: s => (s.adoption.photoMBPerUserMonth *= 0.5), hi: s => (s.adoption.photoMBPerUserMonth *= 1.5)},
    {label: 'Staff day rates ±15%', lo: s => s.people.forEach(p => (p.dayRate *= 0.85)), hi: s => s.people.forEach(p => (p.dayRate *= 1.15))},
    {label: 'Allocated staff days ±20%', lo: s => scaleAlloc(s, 0.8), hi: s => scaleAlloc(s, 1.2)},
    {label: 'Backfill day rate ±25%', lo: s => (s.meta.backfillDayRate *= 0.75), hi: s => (s.meta.backfillDayRate *= 1.25)},
    {label: 'AUD per USD ±10%', lo: s => (s.meta.fxUsdAud *= 0.9), hi: s => (s.meta.fxUsdAud *= 1.1)},
    {label: 'Photos in S3 instead of CouchDB', lo: s => (s.infra.attachmentsInS3 = true), hi: null},
    {label: 'CouchDB 3-node cluster', lo: s => (s.infra.couchNodes = 1), hi: s => (s.infra.couchNodes = 3)},
    {label: 'CouchDB allowed down to m5.large', lo: s => (s.infra.couchTierFloor = s.infra.couchTiers[0].type), hi: null},
    {label: '20% Compute Savings Plan', lo: s => (s.infra.savingsPlanPct = 20), hi: null},
  ];

  function scaleAlloc(s, f) {
    s.people.forEach(p => Object.keys(p.alloc || {}).forEach(k => (p.alloc[k] *= f)));
  }

  function renderSensitivity() {
    const base = result.totals.totalAud;
    const rows = SENSITIVITY.map(x => {
      const run = fn => {
        if (!fn) return 0;
        const s = M.clone(state);
        fn(s);
        return M.project(s).totals.totalAud - base;
      };
      return {label: x.label, lo: run(x.lo), hi: run(x.hi)};
    }).filter(r => Math.abs(r.lo) > 1 || Math.abs(r.hi) > 1);
    rows.sort((a, b) => Math.max(Math.abs(b.lo), Math.abs(b.hi)) - Math.max(Math.abs(a.lo), Math.abs(a.hi)));
    const max = Math.max(1, ...rows.map(r => Math.max(Math.abs(r.lo), Math.abs(r.hi))));
    const bar = v => {
      if (Math.abs(v) < 1) return '';
      const w = (Math.abs(v) / max) * 50;
      const left = v < 0 ? 50 - w : 50;
      const tagPos = v < 0 ? `right:${50 + w}%;padding-right:4px` : `left:${50 + w}%;padding-left:4px`;
      return `<span class="${v < 0 ? 'lo' : 'hi'}" style="left:${left}%;width:${w}%"></span><span class="tag" style="${tagPos}">${v > 0 ? '+' : ''}${audk(v)}</span>`;
    };
    $('#sensitivity').innerHTML = `<div class="sens">${rows
      .map(r => `<div>${esc(r.label)}</div><div class="track">${bar(r.lo)}${bar(r.hi)}</div>`)
      .join('')}</div>`;
  }

  function renderAdoption() {
    const labels = result.months.map(m => m.label);
    const host = $('#chartAdoption');
    host.innerHTML = '<div id="chartAgencies"></div><div id="chartUsers" style="margin-top:0.8rem"></div>';
    C.lines($('#chartAgencies'), {labels, series: [{name: 'Agencies', color: '#7c5cbf', values: result.months.map(m => m.agencies)}], fmt: v => num(v, 1), tickFmt: v => num(v), height: 170, yLabel: 'Agencies'});
    C.lines($('#chartUsers'), {
      labels,
      series: [
        {name: 'Registered users', color: '#1f4e79', values: result.months.map(m => m.users)},
        {name: 'Active users in month', color: '#0b6b5a', values: result.months.map(m => m.active), dash: true},
      ],
      fmt: v => num(v),
      height: 200,
      yLabel: 'Users',
    });
    C.lines($('#chartStorage'), {
      labels,
      series: [
        {name: 'CouchDB data', color: '#1f4e79', values: result.months.map(m => m.couchDataGB)},
        {name: 'EBS provisioned per node', color: '#5b8bb5', values: result.months.map(m => m.ebsVolumeGB), dash: true},
        {name: 'S3 (map layers, photos if moved)', color: '#0b6b5a', values: result.months.map(m => m.s3GB)},
      ],
      fmt: gb,
      tickFmt: gb,
      height: 300,
      yLabel: 'Storage',
    });

    const ends = result.years.map(y => result.months[Math.min(result.months.length - 1, y.year * 12 + y.months - 1)]);
    const head = `<tr><th>Metric</th>${ends.map((_, i) => `<th>End of ${result.years[i].label}</th>`).join('')}</tr>`;
    const row = (label, fn) => `<tr><td>${label}</td>${ends.map(m => `<td>${fn(m)}</td>`).join('')}</tr>`;
    $('#footprintTable').innerHTML = `<table><thead>${head}</thead><tbody>
      ${row('Agencies', m => num(m.agencies, 1))}
      ${row('Registered / active users', m => `${num(m.users)} / ${num(m.active)}`)}
      ${row('CouchDB data', m => gb(m.couchDataGB))}
      ${row('EBS per node × nodes', m => `${gb(m.ebsVolumeGB)} × ${m.nodes}`)}
      ${row('CouchDB instance', m => m.tier)}
      ${row('Conductor tasks', m => m.tasks)}
      ${row('S3 stored', m => gb(m.s3GB))}
      ${row('Map layers processed / month', m => num(m.layers, 1))}
      ${row('Spatial worker hours / month', m => num(m.workerHours, 1))}
      ${row('Data transfer out / month', m => gb(m.egressGB))}
      ${row('Traffic through load balancer / month', m => gb(m.albGB))}
      ${row('AWS hosting / month', m => aud(m.hostingAud))}
    </tbody></table>`;
  }

  function renderHosting() {
    const s0 = M.clone(state);
    s0.meta.horizonMonths = 1;
    s0.meta.awsEscalationPct = 0;
    s0.adoption.agenciesEnd = s0.adoption.agenciesStart;
    s0.adoption.usersPerAgencyEnd = s0.adoption.usersPerAgencyStart;
    const m0 = M.project(s0).months[0];
    const fx = state.meta.fxUsdAud;
    const lines = m0.hostingLinesAud;
    const prodExGst = (m0.hostingUsd - lines.gst / fx - lines.nonProd / fx);
    $('#calibration').innerHTML = `<strong>Calibration.</strong> With today's footprint (the scenario's starting agencies and users), the model gives production hosting of <b>${usd(prodExGst)}</b> per month ex-GST, excluding dev/staging.
      Cost Explorer shows <b>US$392.77</b> ex-tax for October 2026, before the capacity-manager task (about US$11/month) started in November. The Cost Explorer forecast for November 2026 is US$411.89 incl. GST.
      See the <a href="../dass-prod-12-month-cost-report.html">12-month prod cost report</a>.`;

    const months = result.months;
    const warnings = [];
    const bigVol = months.find(m => m.ebsVolumeGB > 16384);
    if (bigVol) warnings.push(`EBS volume passes the 16 TiB gp3 per-volume limit in ${bigVol.label}. You would need to shard CouchDB, stripe volumes or move photos to S3.`);
    const lastTier = state.infra.couchTiers[state.infra.couchTiers.length - 1].type;
    const maxed = months.find(m => m.tier === lastTier);
    if (maxed) warnings.push(`CouchDB reaches the largest instance tier (${esc(lastTier)}) in ${maxed.label}. Plan a cluster or a split before then.`);
    const singleAtScale = months.find(m => m.nodes === 1 && m.active > 1000);
    if (singleAtScale) warnings.push(`From ${singleAtScale.label} more than 1,000 active users depend on a single CouchDB node. Consider the 3-node option for availability.`);
    const last = months[months.length - 1];
    const storShare = last.hostingLinesAud.couchStorage / last.hostingAud;
    if (!state.infra.attachmentsInS3 && storShare > 0.3)
      warnings.push(`CouchDB storage is ${Math.round(storShare * 100)}% of hosting by ${last.label}. Moving photo attachments to S3 is the largest hosting lever (see the toggle under CouchDB).`);
    $('#hostingWarnings').innerHTML = warnings.map(w => `<div class="callout warn">${w}</div>`).join('');

    const labels = months.map(m => m.label);
    const series = M.HOSTING_GROUPS.map(g => ({name: g.label, color: HOSTING_COLORS[g.key], values: months.map(m => m.hostingLinesAud[g.key])})).filter(
      s => s.values.some(v => Math.abs(v) > 0.005)
    );
    C.stacked($('#chartHosting'), {labels, series, fmt: aud, tickFmt: audk, height: 320, yLabel: 'AUD per month'});

    const ys = result.years;
    const rows = M.HOSTING_GROUPS.map(g => {
      const vals = ys.map(y => y.hostingLinesAud[g.key] || 0);
      const tot = vals.reduce((a, b) => a + b, 0);
      if (Math.abs(tot) < 0.5) return '';
      return `<tr><td><i style="display:inline-block;width:9px;height:9px;background:${HOSTING_COLORS[g.key]};margin-right:6px"></i>${g.label}</td>${vals.map(v => `<td>${aud(v)}</td>`).join('')}<td>${aud(tot)}</td></tr>`;
    }).join('');
    $('#hostingTable').innerHTML = `<table><thead><tr><th>Component</th>${ys.map(y => `<th>${y.label}</th>`).join('')}<th>Total</th></tr></thead>
      <tbody>${rows}</tbody><tfoot><tr><td>Total AWS</td>${ys.map(y => `<td>${aud(y.hostingAud)}</td>`).join('')}<td>${aud(result.totals.hostingAud)}</td></tr></tfoot></table>`;
  }

  function renderPeopleOutputs() {
    const y = result.years[demandYear] || result.years[0];
    const f = annualise(y);
    const overhead = 1 + state.meta.overheadPct / 100;
    let tDemand = 0;
    let tAlloc = 0;
    let tGap = 0;
    state.jobs.forEach(j => {
      const d = (y.demandByJob[j.id] || 0) * f;
      const a = result.allocByJob[j.id] || 0;
      tDemand += d;
      tAlloc += a;
      tGap += Math.max(0, d - a);
      setOut(`jdemand-${j.id}`, num(d, 1));
      setOut(`jalloc-${j.id}`, num(a, 1));
      const diff = a - d;
      setOut(`jgap-${j.id}`, Math.abs(diff) < 0.05 ? '—' : diff < 0 ? `${num(-diff, 1)} short` : `${num(diff, 1)} spare`, diff < -0.05 ? 'gap' : diff > 0.05 ? 'surplus' : '');
    });
    setOut('tdemand', num(tDemand, 1));
    setOut('talloc', num(tAlloc, 1));
    setOut('tgap', `${num(tGap, 1)} short`, tGap > 0.05 ? 'gap' : '');

    state.people.forEach(p => {
      const days = state.jobs.reduce((s, j) => s + (Number(p.alloc?.[j.id]) || 0), 0);
      const util = days / Math.max(1, p.availableDays);
      setOut(`pdays-${p.id}`, `${num(days, 1)} d`);
      setOut(`pdays2-${p.id}`, num(days, 1));
      setOut(`putil-${p.id}`, `${Math.round(util * 100)}%`, util > 1 ? 'over' : '');
      setOut(`pcost-${p.id}`, audk(days * p.dayRate * overhead));
      const split = state.jobs
        .map((j, i) => {
          const d = Number(p.alloc?.[j.id]) || 0;
          return d > 0 ? `<span title="${esc(j.name)}: ${num(d, 1)} d" style="width:${(d / Math.max(days, p.availableDays)) * 100}%;background:${jobColor(i)}"></span>` : '';
        })
        .join('');
      setOutHtml(`psplit-${p.id}`, split);
    });

    const labels = result.months.map(m => m.label);
    C.lines($('#chartWork'), {
      labels,
      series: [
        {name: 'Work demand', color: '#c2410c', values: result.months.map(m => m.demandDays)},
        {name: 'Allocated (staffed)', color: '#0b6b5a', values: result.months.map(m => m.staffedDays), dash: true},
      ],
      fmt: v => `${num(v, 1)} days`,
      tickFmt: v => num(v),
      height: 260,
      yLabel: 'Person-days per month',
    });

    const maxV = Math.max(1, ...state.jobs.map(j => Math.max((y.demandByJob[j.id] || 0) * f, result.allocByJob[j.id] || 0)));
    $('#jobBars').innerHTML = `<div class="hbars">${state.jobs
      .map(j => {
        const d = (y.demandByJob[j.id] || 0) * f;
        const a = result.allocByJob[j.id] || 0;
        return `<div class="hbar"><div title="${esc(j.name)}">${esc(j.name.length > 38 ? `${j.name.slice(0, 36)}…` : j.name)}</div>
          <div class="track"><span class="alloc" style="width:${(a / maxV) * 100}%"></span><span class="demand" style="width:${(d / maxV) * 100}%"></span></div>
          <div class="val">${num(a, 0)} / ${num(d, 0)} d</div></div>`;
      })
      .join('')}</div><p class="caption">Filled bar is allocated days. Outline is demand in ${y.label}.</p>`;
  }

  function renderOtherOutputs() {
    const y = result.years[0];
    let total = 0;
    state.otherCosts.forEach(o => {
      const scale = o.scaling === 'perAgency' ? y.avgAgencies : o.scaling === 'per1000Users' ? y.avgUsers / 1000 : 1;
      const v = (o.currency === 'USD' ? o.amount * state.meta.fxUsdAud : o.amount) * scale * (y.months / 12);
      total += v;
      setOut(`other-${o.id}`, aud(v));
    });
    setOut('other-total', aud(total));
  }

  function renderRecovery() {
    const recs = result.recovery;
    const tiered = state.recovery.method === 'tiered';
    const tierHead = tiered ? state.recovery.tiers.map(t => `<th>${esc(t.name)}</th>`).join('') : '<th>Price per agency</th>';
    const rows = recs
      .map(r => {
        const f = 12 / r.months;
        const prices = tiered ? r.tierPrices.map(t => `<td><b>${aud(t.annualised)}</b><div class="small muted">${num(t.count, 1)} agencies</div></td>`).join('') : `<td><b>${aud(r.perAgencyAnnualised)}</b></td>`;
        return `<tr><td>${r.label}</td><td>${aud(r.cost)}</td><td>${aud(r.external)}</td><td>${aud(r.internal)}</td><td>${aud(r.recoverable)}</td><td>${num(r.agencies, 1)}</td>${prices}${f !== 1 ? '' : ''}</tr>`;
      })
      .join('');
    $('#recoveryTable').innerHTML = `<table><thead><tr><th>Period</th><th>Total cost</th><th>External funding</th><th>Internal contribution</th><th>To recover from agencies</th><th>Agencies</th>${tierHead}</tr></thead>
      <tbody>${rows}</tbody></table>
      <p class="caption">Prices are per agency per year${state.recovery.gstOnPrice ? ', including GST' : ', ex-GST'}. Partial years are annualised. ${state.recovery.marginPct ? `Recovery includes a ${state.recovery.marginPct}% margin.` : ''}</p>`;

    C.stacked($('#chartRecovery'), {
      labels: recs.map(r => r.label),
      series: [
        {name: 'External funding', color: '#1f4e79', values: recs.map(r => r.external)},
        {name: 'Internal contribution', color: '#8a96a3', values: recs.map(r => r.internal)},
        {name: 'Recovered from agencies', color: '#0b6b5a', values: recs.map(r => r.recoverable)},
      ],
      fmt: aud,
      tickFmt: audk,
      height: 300,
      barWidth: 0.55,
    });

    const endAgencies = result.years[result.years.length - 1].endAgencies;
    const maxN = Math.min(100, Math.max(20, Math.ceil(endAgencies * 2)));
    const curve = M.priceCurve(state, maxN);
    const marker = Math.max(0, Math.min(maxN - 1, Math.round(recs[0].agencies) - 1));
    C.lines($('#chartPriceCurve'), {
      labels: curve.map(c => String(c.agencies)),
      series: [
        {name: 'Price per agency (equal share, A$/yr)', color: '#0b6b5a', values: curve.map(c => c.perAgency)},
        {name: 'Total annual cost ÷ agencies (no funding)', color: '#8a96a3', values: curve.map(c => c.cost / c.agencies), dash: true},
      ],
      fmt: aud,
      tickFmt: audk,
      height: 300,
      markers: [marker],
      yLabel: 'AUD per agency per year',
    });
  }

  function renderMethod() {
    $('#methodText').innerHTML = `
      <h3>What this model covers</h3>
      <p>Total cost of running DASS in operations: AWS hosting (prod plus an allowance for dev/staging), the people who run, maintain, improve and support it, other operating costs, and a contingency. Everything is projected monthly and shown in AUD.</p>
      <h3>Hosting</h3>
      <ul>
        <li>Unit prices are AWS on-demand list prices for ap-southeast-2 (Sydney), USD, ex-GST. Edit them under <em>Hosting and levers → AWS unit prices</em>.</li>
        <li>The fixed footprint matches the production account as read on 25 Nov 2026: CouchDB on one m5.xlarge with 300 GB gp3, the Conductor API on Fargate (2 vCPU / 4 GB), a 0.25 vCPU capacity manager, an ALB, 5 public IPv4 addresses, Uptime Kuma, CloudWatch and the security baseline.</li>
        <li>Usage-driven costs scale with <em>active</em> users: CouchDB data (records × size × overhead, plus photos), EBS volume (data × headroom, rounded up, never shrinks), snapshots, conductor task count, ALB capacity units, egress and logs. Load-balancer capacity units are not an input: they are a measured idle floor plus 1 LCU-hour per GB of sync, upload and download traffic, which is how ALB bills when processed bytes is the busiest dimension. Map layers drive spatial-worker Fargate hours and S3 storage.</li>
        <li>The CouchDB instance moves up a tier when active users pass each tier's limit, and never drops below the "smallest instance allowed".</li>
        <li>Photo attachments live in CouchDB today, so they are stored on EBS (with headroom, per node). The "store photos in S3" toggle models an architecture change. It is not a configuration switch that exists today.</li>
      </ul>
      <h3>People</h3>
      <ul>
        <li>Each job has a demand driver: base days a year, plus days per agency, per 1,000 users, and a one-off effort per new agency.</li>
        <li>People are costed on their allocated days × day rate (× on-costs), escalated each year. Allocations are fixed staffing. They do not grow by themselves.</li>
        <li>If demand for a job is higher than the days allocated to it, the shortfall is priced at the backfill day rate (contractor or surge). Turn this off in the sidebar to see staffed cost only.</li>
      </ul>
      <h3>Cost recovery</h3>
      <ul>
        <li>External funding is taken off first, as a share of cost or a fixed amount per year. An optional internal contribution then absorbs part of what remains. The rest, plus any margin, is split between agencies.</li>
        <li>Split options are an equal share, or size tiers with price weights. The number of paying agencies is either the scenario's average for each year or a fixed number.</li>
      </ul>
      <h3>Known gaps</h3>
      <ul>
        <li>Dev and staging AWS costs are an estimate. Set them from the non-prod account bill.</li>
        <li>Current CouchDB data size and user counts are inferred, not measured. Check them before using the outputs for pricing.</li>
        <li>Day rates and job demand are starting points for discussion, not benchmarks.</li>
      </ul>
      <p class="small muted">Inputs are saved in this browser's local storage. Use <em>Save JSON</em> to share a model and <em>Load JSON</em> to restore it.</p>`;
  }

  function renderActive() {
    if (activeTab === 'overview') renderOverview();
    if (activeTab === 'adoption') renderAdoption();
    if (activeTab === 'hosting') renderHosting();
    if (activeTab === 'people') renderPeopleOutputs();
    if (activeTab === 'other') renderOtherOutputs();
    if (activeTab === 'recovery') renderRecovery();
  }

  function update() {
    pending = false;
    result = M.project(state);
    save();
    renderSummary();
    renderActive();
  }

  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(update);
  }

  // ---------- events ----------

  function parseInput(t) {
    const type = t.dataset.type;
    if (type === 'bool') return t.checked;
    if (type === 'text') return t.value;
    if (type === 'numnull') return t.value === '' ? null : Number(t.value);
    if (t.value === '' || Number.isNaN(Number(t.value))) return undefined;
    return Number(t.value);
  }

  function onInput(e) {
    const t = e.target;
    if (t.id === 'demandYear') {
      demandYear = Number(t.value);
      schedule();
      return;
    }
    if (t.dataset.path) {
      const v = parseInput(t);
      if (v === undefined) return;
      setPath(state, t.dataset.path, v);
      $$(`[data-path="${t.dataset.path}"]`).forEach(el => {
        if (el !== t && el.type !== 'checkbox') el.value = v;
      });
      if (SCENARIO_PATHS.test(t.dataset.path) && state.scenario !== 'custom') {
        state.scenario = 'custom';
        renderScenarioControls();
      }
      if (t.dataset.path === 'meta.horizonMonths') renderDemandYearSelect();
      if (t.dataset.path.startsWith('recovery.externalMode') || t.dataset.path.startsWith('recovery.agencySource')) renderRecoveryStructure();
      schedule();
      return;
    }
    if (t.dataset.list) {
      const v = parseInput(t);
      if (v === undefined) return;
      const list = getPath(state, t.dataset.list);
      const item = list[Number(t.dataset.idx)];
      setPath(item, t.dataset.key, v);
      if (t.dataset.list === 'people' && t.dataset.key === 'name') {
        const ths = $$('#allocMatrix thead th');
        const th = ths[2 + Number(t.dataset.idx)];
        if (th) th.textContent = v;
      }
      if (t.dataset.list === 'infra.couchTiers' && t.dataset.key === 'type') renderFields('#couchFields', COUCH_FIELDS);
      schedule();
    }
  }

  function download(name, text, type) {
    const blob = new Blob([text], {type});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 0);
  }

  function exportCsv() {
    const cols = [
      ['month', m => m.label],
      ['agencies', m => m.agencies.toFixed(2)],
      ['users', m => m.users.toFixed(1)],
      ['active_users', m => m.active.toFixed(1)],
      ['couchdb_data_gb', m => m.couchDataGB.toFixed(2)],
      ['ebs_gb_per_node', m => m.ebsVolumeGB],
      ['couchdb_nodes', m => m.nodes],
      ['couchdb_instance', m => m.tier],
      ['conductor_tasks', m => m.tasks],
      ['s3_gb', m => m.s3GB.toFixed(2)],
      ['egress_gb', m => m.egressGB.toFixed(2)],
      ['alb_processed_gb', m => m.albGB.toFixed(2)],
      ['alb_lcu_hours', m => m.lcuHours.toFixed(1)],
      ...M.HOSTING_GROUPS.map(g => [`aws_${g.key}_aud`, m => m.hostingLinesAud[g.key].toFixed(2)]),
      ['aws_total_aud', m => m.hostingAud.toFixed(2)],
      ['people_aud', m => m.peopleAud.toFixed(2)],
      ['unmet_work_aud', m => m.backfillAud.toFixed(2)],
      ['other_aud', m => m.otherAud.toFixed(2)],
      ['contingency_aud', m => m.contingencyAud.toFixed(2)],
      ['total_aud', m => m.totalAud.toFixed(2)],
      ['demand_days', m => m.demandDays.toFixed(2)],
      ['staffed_days', m => m.staffedDays.toFixed(2)],
      ['unmet_days', m => m.gapDays.toFixed(2)],
    ];
    const lines = [cols.map(c => c[0]).join(',')].concat(result.months.map(m => cols.map(c => `"${String(c[1](m)).replace(/"/g, '""')}"`).join(',')));
    download('dass-cost-model-monthly.csv', lines.join('\n'), 'text/csv');
  }

  function fitDemand() {
    const y = result.years[demandYear] || result.years[0];
    const f = annualise(y);
    const round = v => Math.round(v * 2) / 2;
    state.jobs.forEach(j => {
      const d = (y.demandByJob[j.id] || 0) * f;
      const holders = state.people.filter(p => (Number(p.alloc?.[j.id]) || 0) > 0);
      const a = holders.reduce((s, p) => s + Number(p.alloc[j.id]), 0);
      if (a > 0) {
        holders.forEach(p => (p.alloc[j.id] = round((Number(p.alloc[j.id]) / a) * d)));
      } else if (state.people.length) {
        const spare = p => p.availableDays - Object.values(p.alloc || {}).reduce((s, v) => s + (Number(v) || 0), 0);
        const target = state.people.slice().sort((p, q) => spare(q) - spare(p))[0];
        target.alloc = target.alloc || {};
        target.alloc[j.id] = round(d);
      }
    });
    renderPeopleStructure();
    update();
  }

  function onClick(e) {
    const tab = e.target.closest('[data-tab]');
    if (tab) {
      showTab(tab.dataset.tab);
      history.replaceState(null, '', `#${activeTab}`);
      return;
    }
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const idx = Number(btn.dataset.idx);
    switch (btn.dataset.action) {
      case 'scenario':
        M.applyScenario(state, btn.dataset.key);
        renderInputs();
        update();
        break;
      case 'add-person':
        state.people.push({id: uid('p'), name: `Person ${state.people.length + 1}`, role: '', dayRate: 1000, availableDays: 220, alloc: {}});
        renderPeopleStructure();
        update();
        break;
      case 'del-person':
        if (confirm(`Remove ${state.people[idx].name}?`)) {
          state.people.splice(idx, 1);
          renderPeopleStructure();
          update();
        }
        break;
      case 'add-job':
        state.jobs.push({id: uid('j'), name: 'New job', category: 'Run', base: 5, perAgency: 0, per1000Users: 0, perNewAgency: 0});
        renderPeopleStructure();
        update();
        break;
      case 'del-job': {
        const j = state.jobs[idx];
        if (confirm(`Remove job "${j.name}"? Allocations to it are removed too.`)) {
          state.jobs.splice(idx, 1);
          state.people.forEach(p => p.alloc && delete p.alloc[j.id]);
          renderPeopleStructure();
          update();
        }
        break;
      }
      case 'match-demand':
        fitDemand();
        break;
      case 'add-other':
        state.otherCosts.push({id: uid('o'), name: 'New cost', amount: 1000, currency: 'AUD', scaling: 'none'});
        renderOtherStructure();
        update();
        break;
      case 'del-other':
        state.otherCosts.splice(idx, 1);
        renderOtherStructure();
        update();
        break;
      case 'add-tier':
        state.recovery.tiers.push({id: uid('t'), name: 'New tier', share: 10, weight: 1});
        renderRecoveryStructure();
        update();
        break;
      case 'del-tier':
        state.recovery.tiers.splice(idx, 1);
        renderRecoveryStructure();
        update();
        break;
      case 'export-json':
        download('dass-cost-model.json', JSON.stringify(state, null, 2), 'application/json');
        break;
      case 'export-csv':
        exportCsv();
        break;
      case 'print':
        printAll();
        break;
      case 'reset':
        if (confirm('Reset every input to the defaults? Your saved model in this browser will be replaced.')) {
          state = M.defaultState();
          renderInputs();
          update();
        }
        break;
      default:
        break;
    }
  }

  function showTab(name) {
    if (!$(`.panel[data-panel="${name}"]`)) return;
    activeTab = name;
    $$('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    $$('.panel').forEach(p => p.classList.toggle('active', p.dataset.panel === name));
    renderActive();
  }

  function printAll() {
    const prev = activeTab;
    $$('.panel').forEach(p => p.classList.add('active'));
    ['overview', 'adoption', 'hosting', 'people', 'other', 'recovery'].forEach(t => {
      activeTab = t;
      renderActive();
    });
    activeTab = prev;
    window.print();
    $$('.panel').forEach(p => p.classList.toggle('active', p.dataset.panel === activeTab));
    renderActive();
  }

  function onImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        state = merge(M.defaultState(), JSON.parse(reader.result));
        renderInputs();
        update();
      } catch (err) {
        alert(`Could not read that file: ${err.message}`);
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  }

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(renderActive, 150);
  });

  document.addEventListener('input', onInput);
  document.addEventListener('click', onClick);
  $('#importFile').addEventListener('change', onImport);

  renderInputs();
  update();
  if (location.hash) showTab(location.hash.slice(1));
})();
