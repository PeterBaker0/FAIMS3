/*
 * DASS operating cost model: pure calculation module (no DOM).
 *
 * All AWS unit prices are USD, ap-southeast-2 on-demand, ex-GST. People and
 * other costs are AUD. `project()` converts everything to AUD.
 *
 * Calibration baseline (Cost Explorer, account 405894845938, Oct/Nov 2026):
 *   CouchDB m5.xlarge + 300 GB gp3, Conductor Fargate 2 vCPU / 4 GB,
 *   capacity manager 0.25 vCPU / 0.5 GB, ALB, 5 public IPv4, Uptime Kuma
 *   t3.micro, CloudWatch ~US$23, security baseline ~US$12, GST 10%.
 *   Nov 2026 CE forecast: US$411.89 incl. tax.
 */
(function (root) {
  'use strict';

  const HOURS_PER_MONTH = 730;

  const PRICES = {
    fargateVcpuHr: 0.04856,
    fargateGBHr: 0.00532,
    fargateEphemeralGBHr: 0.000134,
    gp3GBMonth: 0.096,
    gp2GBMonth: 0.12,
    snapshotGBMonth: 0.055,
    s3GBMonth: 0.025,
    egressGB: 0.114,
    albHr: 0.0252,
    lcuHr: 0.008,
    ipv4Hr: 0.005,
    logIngestGB: 0.57,
    logStoreGBMonth: 0.033,
    cloudwatchFixedMonth: 22,
    secretsMonth: 5.6,
    securityBaselineMonth: 11.6,
    miscMonth: 2.5,
    kumaMonth: 13.24,
  };

  const COUCH_TIERS = [
    {type: 'm5.large', usdHr: 0.12, maxActiveUsers: 300},
    {type: 'm5.xlarge', usdHr: 0.24, maxActiveUsers: 1200},
    {type: 'm5.2xlarge', usdHr: 0.48, maxActiveUsers: 4000},
    {type: 'm5.4xlarge', usdHr: 0.96, maxActiveUsers: Infinity},
  ];

  const SCENARIOS = {
    steady: {
      label: 'Low / steady state',
      desc: 'Current agencies plus a couple more. Usage per user grows slowly. No architecture change.',
      adoption: {
        agenciesStart: 4,
        agenciesEnd: 6,
        usersPerAgencyStart: 25,
        usersPerAgencyEnd: 30,
        activeFraction: 0.5,
        curve: 'linear',
        recordsPerUserMonth: 100,
        recordKB: 8,
        couchOverhead: 2.5,
        photoMBPerUserMonth: 100,
        mapLayersPerAgencyMonth: 1,
        mapLayerMB: 150,
        mapDerivedFactor: 1.5,
        processingMinPerLayer: 10,
        syncGBPerUserMonth: 0.15,
        mapDownloadGBPerUserMonth: 0.05,
        logMBPerUserMonth: 5,
      },
      infra: {couchNodes: 1, minConductorTasks: 1},
    },
    moderate: {
      label: 'Moderate adoption',
      desc: 'Roughly 4 to 15 agencies over the period, with larger teams and more photos and map layers.',
      adoption: {
        agenciesStart: 4,
        agenciesEnd: 15,
        usersPerAgencyStart: 25,
        usersPerAgencyEnd: 50,
        activeFraction: 0.5,
        curve: 's',
        recordsPerUserMonth: 200,
        recordKB: 8,
        couchOverhead: 2.5,
        photoMBPerUserMonth: 200,
        mapLayersPerAgencyMonth: 3,
        mapLayerMB: 250,
        mapDerivedFactor: 1.5,
        processingMinPerLayer: 15,
        syncGBPerUserMonth: 0.4,
        mapDownloadGBPerUserMonth: 0.2,
        logMBPerUserMonth: 5,
      },
      infra: {couchNodes: 1, minConductorTasks: 1},
    },
    aggressive: {
      label: 'Aggressive adoption',
      desc: 'National roll-out: about 40 agencies, large field teams, heavy photo and map use. Assumes a 3-node CouchDB cluster and 2 or more conductor tasks for availability.',
      adoption: {
        agenciesStart: 4,
        agenciesEnd: 40,
        usersPerAgencyStart: 25,
        usersPerAgencyEnd: 80,
        activeFraction: 0.5,
        curve: 'early',
        recordsPerUserMonth: 300,
        recordKB: 8,
        couchOverhead: 2.5,
        photoMBPerUserMonth: 250,
        mapLayersPerAgencyMonth: 6,
        mapLayerMB: 400,
        mapDerivedFactor: 1.5,
        processingMinPerLayer: 20,
        syncGBPerUserMonth: 0.8,
        mapDownloadGBPerUserMonth: 0.5,
        logMBPerUserMonth: 5,
      },
      infra: {couchNodes: 3, minConductorTasks: 2},
    },
  };

  const JOBS = [
    {id: 'patch', name: 'Security patching and OS / container image updates', category: 'Run', base: 18, perAgency: 0, per1000Users: 2, perNewAgency: 0},
    {id: 'deps', name: 'Dependency and platform upgrades (Node, React, Capacitor, CouchDB versions)', category: 'Run', base: 20, perAgency: 0, per1000Users: 0, perNewAgency: 0},
    {id: 'incident', name: 'Monitoring, incident response and on-call', category: 'Run', base: 12, perAgency: 0, per1000Users: 6, perNewAgency: 0},
    {id: 'infra', name: 'Infrastructure ops, backups, DR testing and cost management', category: 'Run', base: 12, perAgency: 0, per1000Users: 3, perNewAgency: 0},
    {id: 'bugs', name: 'Bug triage and fixes', category: 'Maintain', base: 30, perAgency: 1.5, per1000Users: 5, perNewAgency: 0},
    {id: 'features', name: 'Feature improvements and enhancements', category: 'Improve', base: 40, perAgency: 2, per1000Users: 0, perNewAgency: 0},
    {id: 'release', name: 'Release management, QA and app store submissions', category: 'Maintain', base: 15, perAgency: 0, per1000Users: 0, perNewAgency: 0},
    {id: 'support', name: 'User support (helpdesk L1 / L2)', category: 'Support', base: 10, perAgency: 3, per1000Users: 15, perNewAgency: 0},
    {id: 'onboard', name: 'Agency onboarding, training and notebook design help', category: 'Support', base: 5, perAgency: 1, per1000Users: 0, perNewAgency: 5},
    {id: 'security', name: 'Security and compliance (assessments, privacy, accessibility, pen-test fixes)', category: 'Run', base: 10, perAgency: 0.5, per1000Users: 0, perNewAgency: 0},
    {id: 'data', name: 'Data requests (exports, restores, deletion, migrations)', category: 'Support', base: 3, perAgency: 1, per1000Users: 0, perNewAgency: 0},
    {id: 'pm', name: 'Product management, governance and stakeholder reporting', category: 'Govern', base: 20, perAgency: 1, per1000Users: 0, perNewAgency: 0},
    {id: 'docs', name: 'Documentation and knowledge base', category: 'Support', base: 8, perAgency: 0, per1000Users: 0, perNewAgency: 0},
  ];

  const PEOPLE = [
    {id: 'p1', name: 'Tech lead', role: 'Senior software engineer', dayRate: 1300, availableDays: 220,
      alloc: {patch: 4, deps: 10, incident: 4, bugs: 10, features: 18, release: 5, security: 7, pm: 6, docs: 2}},
    {id: 'p2', name: 'Software engineer', role: 'Software engineer', dayRate: 1000, availableDays: 220,
      alloc: {deps: 8, bugs: 27, features: 28, release: 10, support: 4, data: 5, docs: 3}},
    {id: 'p3', name: 'Platform engineer', role: 'DevOps / cloud engineer', dayRate: 1100, availableDays: 220,
      alloc: {patch: 15, deps: 2, incident: 9, infra: 13, security: 6}},
    {id: 'p4', name: 'Product owner', role: 'Product owner / project manager', dayRate: 1050, availableDays: 220,
      alloc: {features: 3, pm: 19, onboard: 6, support: 4, data: 3, docs: 2}},
    {id: 'p5', name: 'Support officer', role: 'Support and training officer', dayRate: 750, availableDays: 220,
      alloc: {support: 18, onboard: 7, docs: 2}},
  ];

  const OTHER_COSTS = [
    {id: 'o1', name: 'Apple Developer Program', amount: 149, currency: 'AUD', scaling: 'none'},
    {id: 'o2', name: 'Error monitoring (Bugsnag)', amount: 1500, currency: 'AUD', scaling: 'none'},
    {id: 'o3', name: 'Map tiles and address autosuggest provider', amount: 400, currency: 'AUD', scaling: 'per1000Users'},
    {id: 'o4', name: 'Domains, DNS, certificates', amount: 100, currency: 'AUD', scaling: 'none'},
    {id: 'o5', name: 'Independent penetration test (annualised)', amount: 12000, currency: 'AUD', scaling: 'none'},
    {id: 'o6', name: 'Transactional email (SMTP)', amount: 50, currency: 'AUD', scaling: 'per1000Users'},
  ];

  function clone(v) {
    return JSON.parse(JSON.stringify(v));
  }

  function nextMonthIso() {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function defaultState() {
    return {
      version: 1,
      scenario: 'moderate',
      meta: {
        startMonth: nextMonthIso(),
        horizonMonths: 36,
        fxUsdAud: 1.55,
        gstOnAws: true,
        salaryEscalationPct: 3.5,
        awsEscalationPct: 0,
        otherEscalationPct: 3,
        contingencyPct: 10,
        overheadPct: 0,
        priceUnmetDemand: true,
        backfillDayRate: 1500,
      },
      adoption: clone(SCENARIOS.moderate.adoption),
      infra: {
        currentDataGB: 15,
        currentMapGB: 2,
        attachmentsInS3: false,
        couchNodes: 1,
        couchTierFloor: 'm5.xlarge',
        couchTiers: clone(COUCH_TIERS).map(t => ({...t, maxActiveUsers: Number.isFinite(t.maxActiveUsers) ? t.maxActiveUsers : null})),
        minVolumeGB: 300,
        volumeHeadroom: 1.5,
        volumeStepGB: 100,
        rootVolGB: 8,
        conductorVcpu: 2,
        conductorGB: 4,
        activeUsersPerTask: 400,
        minConductorTasks: 1,
        workerVcpu: 1,
        workerGB: 2,
        workerEphemeralGB: 80,
        workerIdleExitMin: 5,
        fixedPublicIps: 3,
        albBaseLcuHoursMonth: 40,
        baseLogGBMonth: 0.5,
        logRetentionMonths: 12,
        savingsPlanPct: 0,
        nonProdUsdMonth: 200,
      },
      prices: clone(PRICES),
      jobs: clone(JOBS),
      people: clone(PEOPLE),
      otherCosts: clone(OTHER_COSTS),
      recovery: {
        externalMode: 'pct',
        externalPct: 40,
        externalFixedAud: 150000,
        internalPct: 20,
        marginPct: 0,
        method: 'tiered',
        agencySource: 'scenario',
        overrideAgencies: 10,
        gstOnPrice: false,
        tiers: [
          {id: 't1', name: 'Small', share: 50, weight: 1},
          {id: 't2', name: 'Medium', share: 35, weight: 2},
          {id: 't3', name: 'Large', share: 15, weight: 4},
        ],
      },
    };
  }

  function curve(kind, t) {
    if (kind === 'linear') return t;
    if (kind === 'early') return 1 - Math.pow(1 - t, 2.2);
    const k = 9;
    const l = x => 1 / (1 + Math.exp(-k * (x - 0.5)));
    return (l(t) - l(0)) / (l(1) - l(0));
  }

  function tierIndex(tiers, type) {
    const i = tiers.findIndex(t => t.type === type);
    return i < 0 ? 0 : i;
  }

  function pickTier(tiers, activeUsers, floorType) {
    let idx = tiers.length - 1;
    for (let i = 0; i < tiers.length; i++) {
      const max = tiers[i].maxActiveUsers;
      if (max === null || max === undefined || activeUsers <= max) {
        idx = i;
        break;
      }
    }
    return tiers[Math.max(idx, tierIndex(tiers, floorType))];
  }

  function monthLabel(startIso, offset) {
    const [y, m] = startIso.split('-').map(Number);
    const d = new Date(y, m - 1 + offset, 1);
    return d.toLocaleString('en-AU', {month: 'short', year: '2-digit'});
  }

  const HOSTING_GROUPS = [
    {key: 'couchCompute', label: 'CouchDB compute (EC2)'},
    {key: 'couchStorage', label: 'CouchDB storage (EBS + snapshots)'},
    {key: 'conductor', label: 'Conductor API (Fargate)'},
    {key: 'spatial', label: 'Map-layer processing (spatial workers)'},
    {key: 's3', label: 'Object storage (S3)'},
    {key: 'egress', label: 'Data transfer out'},
    {key: 'network', label: 'Load balancer and public IPv4'},
    {key: 'observability', label: 'CloudWatch metrics and logs'},
    {key: 'platform', label: 'Security baseline, secrets, Kuma, misc'},
    {key: 'nonProd', label: 'Non-production environments'},
    {key: 'savings', label: 'Savings Plan discount'},
    {key: 'gst', label: 'GST on AWS'},
  ];

  function project(s) {
    const H = Math.max(1, Math.round(s.meta.horizonMonths));
    const a = s.adoption;
    const inf = s.infra;
    const p = s.prices;
    const fx = s.meta.fxUsdAud;
    const tiers = inf.couchTiers;
    const overhead = 1 + (s.meta.overheadPct || 0) / 100;
    const contingency = (s.meta.contingencyPct || 0) / 100;

    const months = [];
    let dataGB = inf.currentDataGB;
    let mapGB = inf.currentMapGB;
    let s3PhotoGB = 0;
    let volGB = 0;
    let prevAgencies = a.agenciesStart;
    const logHistory = [];

    const allocByJob = {};
    s.jobs.forEach(j => (allocByJob[j.id] = 0));
    const personAnnual = s.people.map(person => {
      const days = Object.entries(person.alloc || {}).reduce((sum, [jobId, d]) => {
        if (allocByJob[jobId] === undefined) return sum;
        allocByJob[jobId] += Number(d) || 0;
        return sum + (Number(d) || 0);
      }, 0);
      return {id: person.id, days, annualAud: days * person.dayRate * overhead};
    });

    for (let m = 0; m < H; m++) {
      const t = H > 1 ? m / (H - 1) : 1;
      const f = curve(a.curve, t);
      const year = Math.floor(m / 12);
      const agencies = a.agenciesStart + (a.agenciesEnd - a.agenciesStart) * f;
      const usersPerAgency = a.usersPerAgencyStart + (a.usersPerAgencyEnd - a.usersPerAgencyStart) * f;
      const users = agencies * usersPerAgency;
      const active = users * a.activeFraction;
      const newAgencies = Math.max(0, agencies - prevAgencies);
      prevAgencies = agencies;

      const awsEsc = Math.pow(1 + s.meta.awsEscalationPct / 100, year);
      const rateEsc = Math.pow(1 + s.meta.salaryEscalationPct / 100, year);
      const otherEsc = Math.pow(1 + s.meta.otherEscalationPct / 100, year);

      const jsonGB = (active * a.recordsPerUserMonth * a.recordKB * a.couchOverhead) / 1e6;
      const photoGB = (active * a.photoMBPerUserMonth) / 1000;
      const addedCouchGB = jsonGB + (inf.attachmentsInS3 ? 0 : photoGB);
      dataGB += addedCouchGB;
      if (inf.attachmentsInS3) s3PhotoGB += photoGB;

      const step = Math.max(1, inf.volumeStepGB);
      const needVol = Math.max(inf.minVolumeGB, Math.ceil((dataGB * inf.volumeHeadroom) / step) * step);
      volGB = Math.max(volGB, needVol);

      const nodes = Math.max(1, Math.round(inf.couchNodes));
      const tier = pickTier(tiers, active, inf.couchTierFloor);
      const couchEc2 = nodes * HOURS_PER_MONTH * tier.usdHr;
      const couchEbs = nodes * (volGB * p.gp3GBMonth + inf.rootVolGB * p.gp2GBMonth);
      const snapshots = (dataGB * 1.2 + addedCouchGB) * p.snapshotGBMonth;

      const tasks = Math.max(inf.minConductorTasks, Math.ceil(active / Math.max(1, inf.activeUsersPerTask)));
      const taskHr = inf.conductorVcpu * p.fargateVcpuHr + inf.conductorGB * p.fargateGBHr;
      const managerHr = 0.25 * p.fargateVcpuHr + 0.5 * p.fargateGBHr;
      const conductor = tasks * HOURS_PER_MONTH * taskHr + HOURS_PER_MONTH * managerHr;

      const layers = agencies * a.mapLayersPerAgencyMonth;
      const workerHours = (layers * (a.processingMinPerLayer + inf.workerIdleExitMin)) / 60;
      const workerHr =
        inf.workerVcpu * p.fargateVcpuHr +
        inf.workerGB * p.fargateGBHr +
        Math.max(0, inf.workerEphemeralGB - 20) * p.fargateEphemeralGBHr;
      const spatial = workerHours * workerHr;
      mapGB += (layers * a.mapLayerMB * (1 + a.mapDerivedFactor)) / 1000;
      const s3GB = mapGB + s3PhotoGB;
      const s3 = s3GB * p.s3GBMonth;

      const egressGB = active * (a.syncGBPerUserMonth + a.mapDownloadGBPerUserMonth);
      const egress = egressGB * p.egressGB;

      // ALB bills the busiest of its capacity dimensions each hour. For DASS that
      // is processed bytes (1 LCU-hour per GB, both directions) on top of an
      // idle floor from health checks and long-lived sync connections.
      const uploadGB = photoGB + (active * a.recordsPerUserMonth * a.recordKB) / 1e6 + (layers * a.mapLayerMB) / 1000;
      const albGB = egressGB + uploadGB;
      const lcuHours = inf.albBaseLcuHoursMonth + albGB;
      const ips = inf.fixedPublicIps + tasks + 1;
      const network =
        HOURS_PER_MONTH * p.albHr + lcuHours * p.lcuHr + (ips * HOURS_PER_MONTH + workerHours) * p.ipv4Hr;

      const logIngest = inf.baseLogGBMonth + (active * a.logMBPerUserMonth) / 1000;
      logHistory.push(logIngest);
      const retention = Math.max(1, Math.round(inf.logRetentionMonths));
      const logStored = logHistory.slice(-retention).reduce((x, y) => x + y, 0);
      const observability = p.cloudwatchFixedMonth + logIngest * p.logIngestGB + logStored * p.logStoreGBMonth;

      const platform = p.secretsMonth + p.securityBaselineMonth + p.miscMonth + p.kumaMonth;
      const compute = couchEc2 + conductor + spatial;
      const savings = -compute * (inf.savingsPlanPct / 100);

      const usd = {
        couchCompute: couchEc2,
        couchStorage: couchEbs + snapshots,
        conductor,
        spatial,
        s3,
        egress,
        network,
        observability,
        platform,
        nonProd: inf.nonProdUsdMonth,
        savings,
      };
      let usdExGst = 0;
      Object.keys(usd).forEach(k => {
        usd[k] *= awsEsc;
        usdExGst += usd[k];
      });
      usd.gst = s.meta.gstOnAws ? usdExGst * 0.1 : 0;
      const hostingUsd = usdExGst + usd.gst;
      const hostingAud = hostingUsd * fx;
      const hostingLinesAud = {};
      Object.keys(usd).forEach(k => (hostingLinesAud[k] = usd[k] * fx));

      const demandByJob = {};
      let demandDays = 0;
      let gapDays = 0;
      s.jobs.forEach(j => {
        const d =
          (j.base + j.perAgency * agencies + (j.per1000Users * users) / 1000) / 12 + j.perNewAgency * newAgencies;
        demandByJob[j.id] = d;
        demandDays += d;
        gapDays += Math.max(0, d - allocByJob[j.id] / 12);
      });
      const staffedDays = Object.values(allocByJob).reduce((x, y) => x + y, 0) / 12;
      const peopleAud = (personAnnual.reduce((x, y) => x + y.annualAud, 0) / 12) * rateEsc;
      const backfillAud = s.meta.priceUnmetDemand ? gapDays * s.meta.backfillDayRate * overhead * rateEsc : 0;

      let otherAud = 0;
      s.otherCosts.forEach(o => {
        const scale = o.scaling === 'perAgency' ? agencies : o.scaling === 'per1000Users' ? users / 1000 : 1;
        const amt = o.currency === 'USD' ? o.amount * fx : o.amount;
        otherAud += (amt * scale * otherEsc) / 12;
      });

      const subtotal = hostingAud + peopleAud + backfillAud + otherAud;
      const contingencyAud = subtotal * contingency;

      months.push({
        index: m,
        year,
        label: monthLabel(s.meta.startMonth, m),
        agencies,
        newAgencies,
        users,
        active,
        tier: tier.type,
        nodes,
        tasks,
        layers,
        workerHours,
        couchDataGB: dataGB,
        ebsVolumeGB: volGB,
        s3GB,
        egressGB,
        albGB,
        lcuHours,
        logStoredGB: logStored,
        hostingUsd,
        hostingAud,
        hostingLinesAud,
        peopleAud,
        backfillAud,
        otherAud,
        contingencyAud,
        totalAud: subtotal + contingencyAud,
        demandDays,
        staffedDays,
        gapDays,
        demandByJob,
      });
    }

    const years = [];
    months.forEach(mo => {
      if (!years[mo.year]) {
        years[mo.year] = {
          year: mo.year,
          months: 0,
          label: '',
          hostingAud: 0,
          peopleAud: 0,
          backfillAud: 0,
          otherAud: 0,
          contingencyAud: 0,
          totalAud: 0,
          agenciesSum: 0,
          usersSum: 0,
          endAgencies: 0,
          endUsers: 0,
          demandDays: 0,
          staffedDays: 0,
          gapDays: 0,
          demandByJob: {},
          hostingLinesAud: {},
        };
      }
      const y = years[mo.year];
      y.months += 1;
      ['hostingAud', 'peopleAud', 'backfillAud', 'otherAud', 'contingencyAud', 'totalAud', 'demandDays', 'staffedDays', 'gapDays'].forEach(
        k => (y[k] += mo[k])
      );
      y.agenciesSum += mo.agencies;
      y.usersSum += mo.users;
      y.endAgencies = mo.agencies;
      y.endUsers = mo.users;
      Object.entries(mo.demandByJob).forEach(([k, v]) => (y.demandByJob[k] = (y.demandByJob[k] || 0) + v));
      Object.entries(mo.hostingLinesAud).forEach(([k, v]) => (y.hostingLinesAud[k] = (y.hostingLinesAud[k] || 0) + v));
    });
    years.forEach(y => {
      y.avgAgencies = y.agenciesSum / y.months;
      y.avgUsers = y.usersSum / y.months;
      y.label = `Year ${y.year + 1}${y.months < 12 ? ` (${y.months} mo)` : ''}`;
    });

    const totals = months.reduce(
      (acc, mo) => {
        acc.hostingAud += mo.hostingAud;
        acc.peopleAud += mo.peopleAud;
        acc.backfillAud += mo.backfillAud;
        acc.otherAud += mo.otherAud;
        acc.contingencyAud += mo.contingencyAud;
        acc.totalAud += mo.totalAud;
        return acc;
      },
      {hostingAud: 0, peopleAud: 0, backfillAud: 0, otherAud: 0, contingencyAud: 0, totalAud: 0}
    );

    return {months, years, totals, personAnnual, allocByJob, recovery: recover(s, years)};
  }

  function recover(s, years) {
    const r = s.recovery;
    const tiers = r.tiers || [];
    const shareSum = tiers.reduce((x, t) => x + (Number(t.share) || 0), 0) || 1;
    const weightedUnit = tiers.reduce((x, t) => x + ((Number(t.share) || 0) / shareSum) * (Number(t.weight) || 0), 0) || 1;
    const gst = r.gstOnPrice ? 1.1 : 1;
    return years.map(y => {
      const cost = y.totalAud;
      const annualise = 12 / y.months;
      const external =
        r.externalMode === 'fixed' ? Math.min(cost, (r.externalFixedAud * y.months) / 12) : cost * (r.externalPct / 100);
      const afterExternal = cost - external;
      const internal = afterExternal * (r.internalPct / 100);
      const recoverable = (afterExternal - internal) * (1 + r.marginPct / 100);
      const agencies = r.agencySource === 'override' ? Math.max(1, r.overrideAgencies) : Math.max(1, y.avgAgencies);
      const perAgencyEqual = recoverable / agencies;
      const perUnit = recoverable / (agencies * weightedUnit);
      const tierPrices = tiers.map(t => ({
        id: t.id,
        name: t.name,
        count: (agencies * (Number(t.share) || 0)) / shareSum,
        price: perUnit * (Number(t.weight) || 0) * gst,
        annualised: perUnit * (Number(t.weight) || 0) * gst * annualise,
      }));
      return {
        label: y.label,
        months: y.months,
        cost,
        external,
        internal,
        recoverable,
        agencies,
        perAgency: perAgencyEqual * gst,
        perAgencyAnnualised: perAgencyEqual * gst * annualise,
        tierPrices,
      };
    });
  }

  function priceCurve(s, maxAgencies) {
    const out = [];
    for (let n = 1; n <= maxAgencies; n++) {
      const t = clone(s);
      t.meta.horizonMonths = 12;
      t.adoption.agenciesStart = n;
      t.adoption.agenciesEnd = n;
      t.adoption.usersPerAgencyStart = s.adoption.usersPerAgencyEnd;
      t.recovery.agencySource = 'scenario';
      const res = project(t);
      const rec = res.recovery[0];
      out.push({agencies: n, perAgency: rec.perAgency, cost: rec.cost});
    }
    return out;
  }

  function applyScenario(s, key) {
    const sc = SCENARIOS[key];
    if (!sc) return s;
    s.scenario = key;
    s.adoption = {...s.adoption, ...clone(sc.adoption)};
    s.infra = {...s.infra, ...clone(sc.infra)};
    return s;
  }

  const api = {
    HOURS_PER_MONTH,
    PRICES,
    SCENARIOS,
    HOSTING_GROUPS,
    defaultState,
    applyScenario,
    project,
    priceCurve,
    curve,
    clone,
  };

  root.CostModel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
