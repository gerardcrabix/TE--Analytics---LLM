import { USAGE_COL as U, EMP_COL as E } from './dataModel';
import { countryLabel as countryLabelFor } from './geoRef';

/** Builds the lookup structures the rest of the app queries against. Kept
 * separate from React state: this only depends on the raw `dash` dataset, so
 * it is cheap to recompute with `useMemo` whenever a new file is imported,
 * and every filter/selection is applied on top of it without rebuilding it. */
export function buildIndex(dash) {
  const byEmail = new Map();
  for (const row of dash.usage) {
    const emailIdx = row[U.EMAIL];
    if (!byEmail.has(emailIdx)) byEmail.set(emailIdx, { rows: [], latest: null });
    const rec = byEmail.get(emailIdx);
    rec.rows.push(row);
    if (!rec.latest || row[U.MONTH] > rec.latest[U.MONTH]) rec.latest = row;
  }

  const empByUserId = new Map();
  const empByEmailIdx = new Map();
  const childrenByUserId = new Map();
  for (const e of dash.employees) {
    const userId = e[E.USER_ID];
    const emailIdx = e[E.EMAIL];
    const supUserId = e[E.SUPERVISOR];
    empByUserId.set(userId, e);
    if (emailIdx >= 0) empByEmailIdx.set(emailIdx, e);
    if (supUserId) {
      if (!childrenByUserId.has(supUserId)) childrenByUserId.set(supUserId, []);
      childrenByUserId.get(supUserId).push(userId);
    }
  }
  for (const [emailIdx, rec] of byEmail) rec.emp = empByEmailIdx.get(emailIdx) || null;

  // First-seen domain/sub-domain a given job family/job description was
  // observed under — powers the domain search autocomplete's "jump to" links.
  const familyToFunc = new Map(), descToFunc = new Map(), descToFamily = new Map();
  for (const row of dash.usage) {
    const famIdx = row[U.JOB_FAMILY], funIdx = row[U.JOB_FUNCTION], descIdx = row[U.JOB_DESC];
    if (famIdx !== null && famIdx !== undefined && !familyToFunc.has(famIdx)) familyToFunc.set(famIdx, funIdx);
    if (descIdx !== null && descIdx !== undefined) {
      if (!descToFunc.has(descIdx)) descToFunc.set(descIdx, funIdx);
      if (!descToFamily.has(descIdx)) descToFamily.set(descIdx, famIdx);
    }
  }

  const pairCounts = new Map(), buTotals = new Map(), segTotals = new Map();
  for (const row of dash.usage) {
    const segIdx = row[U.SEGMENT], buIdx = row[U.BU];
    const key = buIdx + ':' + segIdx;
    pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
    buTotals.set(buIdx, (buTotals.get(buIdx) || 0) + 1);
    segTotals.set(segIdx, (segTotals.get(segIdx) || 0) + 1);
  }
  const buToSegments = new Map(), segmentToBus = new Map();
  const DOMINANCE_THRESHOLD = 0.02;
  for (const [key, count] of pairCounts) {
    const [buIdx, segIdx] = key.split(':').map(Number);
    if (count / buTotals.get(buIdx) < DOMINANCE_THRESHOLD) continue;
    if (!buToSegments.has(buIdx)) buToSegments.set(buIdx, new Set());
    buToSegments.get(buIdx).add(segIdx);
    if (!segmentToBus.has(segIdx)) segmentToBus.set(segIdx, new Set());
    segmentToBus.get(segIdx).add(buIdx);
  }

  return {
    dash,
    byEmail, empByUserId, empByEmailIdx, childrenByUserId,
    buToSegments, segmentToBus,
    familyToFunc, descToFunc, descToFamily,
    hasJobHierarchy: (dash.dicts.jobDescriptions || []).length > 0,
    numMonths: dash.months.length,
  };
}

export const fmt = (n) => Math.round(n || 0).toLocaleString('fr-FR');
export const pct = (n) => Math.round(n || 0) + '%';

export function countryLabel(idx, dash) {
  const code = dash.dicts.countries[idx];
  return countryLabelFor(code);
}

export function opStatusPill(idx) {
  if (idx === 0) return { label: 'Operator', bg: 'var(--op-bg)', color: 'var(--op-text)' };
  if (idx === 1) return { label: 'Non-Op.', bg: 'oklch(93% 0.006 60)', color: 'var(--muted)' };
  return { label: '—', bg: 'oklch(95% 0.006 60)', color: 'var(--muted-2)' };
}

export function opStatusPillStyle(idx, size) {
  const pill = opStatusPill(idx);
  const fontSize = size === 'sm' ? 9 : 10;
  const padding = size === 'sm' ? '1px 5px' : '2px 7px';
  const borderRadius = size === 'sm' ? 4 : 5;
  return { ...pill, style: { fontSize, fontWeight: 700, padding, borderRadius, background: pill.bg, color: pill.color } };
}

export function isContractor(idx, rec) {
  if (!rec || !rec.latest) return false;
  const userTypeIdx = rec.latest[U.USER_TYPE];
  if (userTypeIdx === undefined || userTypeIdx === null) return false;
  return idx.dash.dicts.userTypes[userTypeIdx] === 'CONTRACTOR';
}

/** Row-level contractor check (vs. `isContractor`'s person/latest-row check)
 * — used wherever an aggregation walks raw usage rows directly. */
export function isContractorRow(idx, row) {
  const userTypeIdx = row[U.USER_TYPE];
  if (userTypeIdx === undefined || userTypeIdx === null) return false;
  return idx.dash.dicts.userTypes[userTypeIdx] === 'CONTRACTOR';
}

export function personSumInWindow(idx, rec, months) {
  const minIdx = Math.max(0, idx.numMonths - months);
  let sum = 0;
  for (const row of rec.rows) if (row[U.MONTH] >= minIdx) sum += row[U.TOTAL];
  return sum;
}

export function personSumFiltered(idx, rec, geo, kolMonths) {
  if (geo.year === 'all' && geo.month === 'all') return personSumInWindow(idx, rec, kolMonths);
  let sum = 0;
  for (const row of rec.rows) {
    const mIdx = row[U.MONTH];
    if (geo.month !== 'all') { if (mIdx !== geo.month) continue; }
    else { const m = idx.dash.months[mIdx]; if (!m || m.year !== geo.year) continue; }
    sum += row[U.TOTAL];
  }
  return sum;
}

/** The usage row matching the selected year/month scope for a person (not
 * necessarily their most recent row) — used so the job family/description
 * shown for someone reflects the period actually being looked at. Falls
 * back to their latest row when no year/month filter is active. */
export function rowForGeo(idx, rec, geo) {
  if (geo.month === 'all' && (!geo.year || geo.year === 'all')) return rec.latest;
  let found = null;
  for (const row of rec.rows) {
    const mIdx = row[U.MONTH];
    if (geo.month !== 'all') { if (mIdx === geo.month) { found = row; break; } }
    else { const m = idx.dash.months[mIdx]; if (m && m.year === geo.year) found = row; }
  }
  return found;
}

export function statusColorFor(status) {
  if (status === 'engaged') return 'var(--teal)';
  if (status === 'low') return 'var(--amber)';
  if (status === 'none') return 'var(--gray-dot-2)';
  return 'oklch(88% 0.006 60)';
}

export function metricValue(c, metric) {
  if (metric === 'prompts') return c.prompts;
  if (metric === 'headcount') return c.headcount.size;
  if (metric === 'activeShare') return c.headcount.size ? (c.active.size / c.headcount.size) * 100 : 0;
  return c.headcount.size ? (1 - c.active.size / c.headcount.size) * 100 : 0;
}

export function sizeMetricValue(c, key) {
  if (key === 'prompts') return c.prompts;
  if (key === 'active') return c.active.size;
  return c.headcount.size;
}

/** Aggregate usage rows into per-country totals, honoring every geo/operator/
 * population filter used across the app. */
export function computeGeoAgg(idx, f, includeContractors = true) {
  const byCountry = new Map();
  const totalHead = new Set(), totalActive = new Set();
  let totalPrompts = 0;
  for (const row of idx.dash.usage) {
    if (!includeContractors && isContractorRow(idx, row)) continue;
    const monthIdx = row[U.MONTH], countryIdx = row[U.COUNTRY], regionIdx = row[U.REGION], segmentIdx = row[U.SEGMENT];
    const jobFunIdx = row[U.JOB_FUNCTION], buIdx = row[U.BU], opStatusIdx = row[U.OP_STATUS];
    if (f.year && f.year !== 'all' && idx.dash.months[monthIdx].year !== f.year) continue;
    if (f.month !== 'all' && monthIdx !== f.month) continue;
    if (f.region !== 'all' && regionIdx !== f.region) continue;
    if (f.country && f.country !== 'all' && countryIdx !== f.country) continue;
    if (f.segment !== 'all' && segmentIdx !== f.segment) continue;
    if (f.jobFunction !== 'all' && jobFunIdx !== f.jobFunction) continue;
    if (f.bu !== 'all' && buIdx !== f.bu) continue;
    if (f.opStatus !== 'all' && opStatusIdx !== f.opStatus) continue;
    let val = row[U.TOTAL];
    if (f.operator === 'chatgpt') val = row[U.CHATGPT];
    else if (f.operator === 'copilot') val = row[U.COPILOT];
    else if (f.operator === 'telme') val = row[U.TELME];
    const emailIdx = row[U.EMAIL];
    if (!byCountry.has(countryIdx)) byCountry.set(countryIdx, { headcount: new Set(), active: new Set(), prompts: 0 });
    const c = byCountry.get(countryIdx);
    c.headcount.add(emailIdx);
    if (val > 0) c.active.add(emailIdx);
    c.prompts += val;
    totalHead.add(emailIdx);
    if (val > 0) totalActive.add(emailIdx);
    totalPrompts += val;
  }
  return { byCountry, totals: { headcount: totalHead.size, active: totalActive.size, prompts: totalPrompts } };
}

export function computeKolCandidates(idx, f, includeContractors = true) {
  const list = [];
  for (const [emailIdx, rec] of idx.byEmail) {
    const latest = rec.latest;
    if (!latest) continue;
    if (!includeContractors && isContractor(idx, rec)) continue;
    const countryIdx = latest[U.COUNTRY], regionIdx = latest[U.REGION], segmentIdx = latest[U.SEGMENT];
    const jobFunIdx = latest[U.JOB_FUNCTION], buIdx = latest[U.BU], opStatusIdx = latest[U.OP_STATUS];
    if (f.region !== 'all' && regionIdx !== f.region) continue;
    if (f.country && f.country !== 'all' && countryIdx !== f.country) continue;
    if (f.segment !== 'all' && segmentIdx !== f.segment) continue;
    if (f.jobFunction !== 'all' && jobFunIdx !== f.jobFunction) continue;
    if (f.bu !== 'all' && buIdx !== f.bu) continue;
    if (f.opStatus !== 'all' && opStatusIdx !== f.opStatus) continue;
    const sum = personSumInWindow(idx, rec, f.months);
    if (sum < f.minPrompts) continue;
    list.push({
      emailIdx, sum, countryIdx, regionIdx, segmentIdx, jobFunIdx, opStatusIdx,
      name: rec.emp ? rec.emp[E.NAME] : idx.dash.dicts.emails[emailIdx],
      title: rec.emp ? rec.emp[E.TITLE] : null,
    });
  }
  list.sort((a, b) => b.sum - a.sum);
  return list;
}

export function computeInfluence(idx, kol, f) {
  const kolRec = idx.byEmail.get(kol.emailIdx);
  const kolSupUserId = kolRec.emp ? kolRec.emp[E.SUPERVISOR] : null;
  const list = [];
  for (const [emailIdx, rec] of idx.byEmail) {
    if (emailIdx === kol.emailIdx) continue;
    const latest = rec.latest;
    if (!latest) continue;
    const countryIdx = latest[U.COUNTRY], jobFunIdx = latest[U.JOB_FUNCTION], jobDescIdx = latest[U.JOB_DESC], opStatusIdx = latest[U.OP_STATUS];
    if (f.requireSameTeam && jobFunIdx !== kol.jobFunIdx) continue;
    if (f.requireSameGeo && countryIdx !== kol.countryIdx) continue;
    if (f.requireSameJob && jobDescIdx !== kol.jobDescIdx) continue;
    const sum = personSumInWindow(idx, rec, f.months);
    if (sum >= f.lowThreshold) continue;
    const sameSup = !!(rec.emp && kolSupUserId && rec.emp[E.SUPERVISOR] === kolSupUserId);
    const sameCountry = countryIdx === kol.countryIdx;
    list.push({
      emailIdx, sum, countryIdx, jobFunIdx, opStatusIdx, sameSup, sameCountry,
      name: rec.emp ? rec.emp[E.NAME] : idx.dash.dicts.emails[emailIdx],
      title: rec.emp ? rec.emp[E.TITLE] : null,
    });
  }
  list.sort((a, b) => (b.sameSup - a.sameSup) || (b.sameCountry - a.sameCountry) || (a.sum - b.sum));
  return list.slice(0, 60);
}

export function findRoot(idx, userId, n) {
  let cur = userId;
  for (let i = 0; i < n; i++) {
    const emp = idx.empByUserId.get(cur);
    if (!emp) break;
    const sup = emp[E.SUPERVISOR];
    if (!sup || !idx.empByUserId.has(sup)) break;
    cur = sup;
  }
  return cur;
}

function descOverrideFor(descOverrides, jobDescIdx) {
  if (jobDescIdx === null || jobDescIdx === undefined) return null;
  return (descOverrides || {})[jobDescIdx] || null;
}

export function effectiveOpStatusIdx(descOverrides, jobDescIdx, rawOpStatusIdx) {
  const ov = descOverrideFor(descOverrides, jobDescIdx);
  if (ov === 'operator') return 0;
  if (ov === 'nonOperator') return 1;
  return rawOpStatusIdx;
}

/** Build the managerial tree rooted at `rootUserId`. `reclass` carries
 * {descOverrides, includeContractors}; `geo`/`kolMonths` scope the usage sum
 * shown on each node the same way the rest of the app is filtered. */
export function buildTree(idx, rootUserId, geo, kolMonths, minPrompts, reclass) {
  const visited = new Set();
  const build = (userId) => {
    if (visited.has(userId)) return null;
    visited.add(userId);
    const emp = idx.empByUserId.get(userId);
    if (!emp) return null;
    const rec = emp[E.EMAIL] >= 0 ? idx.byEmail.get(emp[E.EMAIL]) : null;
    // Engagement dots reflect "ever active in the recent window", independent of
    // any month/year scoping — the stats cards below the tree are what respect it.
    const sum = rec ? personSumInWindow(idx, rec, kolMonths) : null;
    let status = 'unknown';
    if (rec) status = sum >= minPrompts ? 'engaged' : sum > 0 ? 'low' : 'none';
    const childIds = idx.childrenByUserId.get(userId) || [];
    const children = childIds.map(build).filter(Boolean);
    const jobDescIdx = idx.hasJobHierarchy && rec && rec.latest ? rec.latest[U.JOB_DESC] : null;
    const opStatusIdx = rec && rec.latest ? effectiveOpStatusIdx(reclass.descOverrides, jobDescIdx, rec.latest[U.OP_STATUS]) : null;
    return {
      userId, name: emp[E.NAME], title: emp[E.TITLE], sum, status, children, opStatusIdx, jobDescIdx,
      isContractor: rec ? isContractor(idx, rec) : false,
      jobDescLabel: jobDescIdx !== null && jobDescIdx !== undefined ? idx.dash.dicts.jobDescriptions[jobDescIdx] || null : null,
      teamLabel: rec && rec.latest ? idx.dash.dicts.jobFunctions[rec.latest[U.JOB_FUNCTION]] : null,
      countryLabel: rec && rec.latest ? countryLabel(rec.latest[U.COUNTRY], idx.dash) : null,
    };
  };
  const root = build(rootUserId);
  return root ? computeLeafCounts(root, reclass.includeContractors) : null;
}

/** Collects every distinct jobDescIdx under `node` (inclusive) — used to
 * force a whole managerial-tree branch to Operator/Non-Operator at once. */
export function collectJobDescIds(node) {
  const ids = new Set();
  const walk = (n) => {
    if (n.jobDescIdx !== null && n.jobDescIdx !== undefined) ids.add(n.jobDescIdx);
    (n.children || []).forEach(walk);
  };
  walk(node);
  return ids;
}

export function computeLeafCounts(node, includeContractors) {
  if (!node.children || node.children.length === 0) {
    if (node.isContractor && !includeContractors) {
      Object.assign(node, { leafTotal: 0, leafActive: 0, leafInactive: 0, leafActiveOp: 0, leafActiveNonOp: 0, leafInactiveOp: 0, leafInactiveNonOp: 0 });
      return node;
    }
    const active = node.sum && node.sum > 0 ? 1 : 0;
    const isOp = node.opStatusIdx === 0;
    Object.assign(node, {
      leafTotal: 1, leafActive: active, leafInactive: 1 - active,
      leafActiveOp: isOp && active ? 1 : 0, leafActiveNonOp: !isOp && active ? 1 : 0,
      leafInactiveOp: isOp && !active ? 1 : 0, leafInactiveNonOp: !isOp && !active ? 1 : 0,
    });
    return node;
  }
  let total = 0, active = 0, activeOp = 0, activeNonOp = 0, inactiveOp = 0, inactiveNonOp = 0;
  node.children.forEach((c) => {
    computeLeafCounts(c, includeContractors);
    total += c.leafTotal; active += c.leafActive;
    activeOp += c.leafActiveOp; activeNonOp += c.leafActiveNonOp;
    inactiveOp += c.leafInactiveOp; inactiveNonOp += c.leafInactiveNonOp;
  });
  Object.assign(node, {
    leafTotal: total, leafActive: active, leafInactive: total - active,
    leafActiveOp: activeOp, leafActiveNonOp: activeNonOp, leafInactiveOp: inactiveOp, leafInactiveNonOp: inactiveNonOp,
  });
  return node;
}

/** Aggregate stats + optional job-family/job-description breakdown, over
 * whatever population `scopeFilter(row, emailIdx, rec)` selects.
 *
 * - `ignoreOverrides: true` computes the "before forcing" baseline (raw
 *   operator_status, no descOverrides applied) — used to show before/after.
 * - `overridesMap` lets a scenario's own descOverrides be used instead of
 *   the live `reclass.descOverrides` — used by the scenario plan/compare
 *   tools to evaluate a scenario without touching current state. */
export function computeReclassInfo(idx, scopeFilter, geo, kolMonths, reclass, ignoreOverrides, overridesMap, monthYear) {
  const effGeo = monthYear ? { ...geo, month: monthYear.month, year: monthYear.year } : geo;
  let total = 0, active = 0, nonOpTotal = 0, nonOpActive = 0, opTotal = 0, opActive = 0;
  const byDesc = new Map();
  const descOverrides = overridesMap || reclass.descOverrides;
  for (const [emailIdx, rec] of idx.byEmail) {
    const latest = rowForGeo(idx, rec, effGeo);
    if (!latest) continue;
    if (!reclass.includeContractors && isContractor(idx, rec)) continue;
    if (scopeFilter && !scopeFilter(latest, emailIdx, rec)) continue;
    const jobDescIdx = idx.hasJobHierarchy ? latest[U.JOB_DESC] : null;
    const jobFunIdx = latest[U.JOB_FUNCTION], jobFamilyIdx = latest[U.JOB_FAMILY];
    const effOpIdx = ignoreOverrides ? latest[U.OP_STATUS] : effectiveOpStatusIdx(descOverrides, jobDescIdx, latest[U.OP_STATUS]);
    const sum = personSumFiltered(idx, rec, effGeo, kolMonths);
    const act = sum > 0 ? 1 : 0;
    total++; active += act;
    if (effOpIdx !== 0) { nonOpTotal++; nonOpActive += act; } else { opTotal++; opActive += act; }
    if (jobDescIdx !== null && jobDescIdx !== undefined && jobDescIdx >= 0) {
      if (!byDesc.has(jobDescIdx)) byDesc.set(jobDescIdx, { jobDescIdx, jobFunIdx, jobFamilyIdx, total: 0, active: 0, nonOpTotal: 0, nonOpActive: 0, opTotal: 0, opActive: 0 });
      const d = byDesc.get(jobDescIdx);
      d.total++; d.active += act;
      if (effOpIdx !== 0) { d.nonOpTotal++; d.nonOpActive += act; } else { d.opTotal++; d.opActive += act; }
    }
  }
  return { total, active, nonOpTotal, nonOpActive, opTotal, opActive, byDesc };
}

/** Per-month stats for a fixed geo/BU/domain filter, ignoring the shared
 * `geo.month`/`geo.year` scope — powers the timeline/report month-by-month
 * series. */
export function computeMonthStats(idx, monthIdx, f, overridesMap, ignoreOverrides, reclass) {
  let total = 0, active = 0, opTotal = 0, opActive = 0, nonOpTotal = 0, nonOpActive = 0;
  for (const row of idx.dash.usage) {
    if (row[U.MONTH] !== monthIdx) continue;
    if (!reclass.includeContractors && isContractorRow(idx, row)) continue;
    const countryIdx = row[U.COUNTRY], regionIdx = row[U.REGION], segmentIdx = row[U.SEGMENT];
    const jobFunIdx = row[U.JOB_FUNCTION], totalPrompts = row[U.TOTAL], jobDescIdx = row[U.JOB_DESC], buIdx = row[U.BU], opStatusIdx = row[U.OP_STATUS];
    if (f.region !== 'all' && regionIdx !== f.region) continue;
    if (f.country && f.country !== 'all' && countryIdx !== f.country) continue;
    if (f.segment !== 'all' && segmentIdx !== f.segment) continue;
    if (f.jobFunction !== 'all' && jobFunIdx !== f.jobFunction) continue;
    if (f.bu !== 'all' && buIdx !== f.bu) continue;
    const effOp = ignoreOverrides ? opStatusIdx : effectiveOpStatusIdx(overridesMap, idx.hasJobHierarchy ? jobDescIdx : null, opStatusIdx);
    const act = totalPrompts > 0 ? 1 : 0;
    total++; active += act;
    if (effOp !== 0) { nonOpTotal++; nonOpActive += act; } else { opTotal++; opActive += act; }
  }
  return {
    total, active, opTotal, opActive, nonOpTotal, nonOpActive,
    pctAll: total ? Math.round((active / total) * 100) : null,
    pctOp: opTotal ? Math.round((opActive / opTotal) * 100) : null,
    pctNonOp: nonOpTotal ? Math.round((nonOpActive / nonOpTotal) * 100) : null,
  };
}

/** Turns a series of {label, [curKey], [scKey]} points into SVG polyline
 * coordinates + grid lines + per-dot label placements, shared by every
 * Timeline-tab chart. */
export function buildLineChart(points, curKey, scKey, opts) {
  opts = opts || {};
  const n = points.length;
  const curVals = points.map((p) => p[curKey]).filter((v) => v !== null && v !== undefined);
  const scVals = scKey ? points.map((p) => p[scKey]).filter((v) => v !== null && v !== undefined) : [];
  const allVals = curVals.concat(scVals);
  const rawMin = allVals.length ? Math.min(...allVals) : 0;
  const rawMax = allVals.length ? Math.max(...allVals) : (opts.isPercent ? 100 : 10);
  let min, max;
  if (opts.isPercent) {
    min = Math.max(0, Math.floor(rawMin) - 5);
    max = Math.min(100, Math.ceil(rawMax) + 5);
    if (max <= min) max = min + 10;
  } else {
    const span = Math.max(1, rawMax - rawMin);
    let niceStep = Math.pow(10, Math.floor(Math.log10(span / 4 || 1)));
    if (span / niceStep > 8) niceStep *= 2;
    if (!niceStep || !isFinite(niceStep)) niceStep = 1;
    min = Math.floor(rawMin / niceStep) * niceStep;
    max = Math.ceil(rawMax / niceStep) * niceStep + niceStep;
    if (opts.forceMinZero) min = Math.min(0, min);
    if (max <= min) max = min + 1;
  }
  const chartW = 860, chartH = 220;
  const xFor = (i) => (n <= 1 ? 0 : (chartW * i) / (n - 1));
  const yFor = (v) => chartH - ((Math.max(min, Math.min(max, v === null || v === undefined ? min : v)) - min) / (max - min)) * chartH;
  const fmtVal = (v) => (opts.isPercent ? Math.round(v) + '%' : Math.round(v) + (opts.unit || ''));
  const curLine = points.map((p, i) => xFor(i) + ',' + Math.round(yFor(p[curKey]) * 10) / 10).join(' ');
  const scLine = scKey ? points.map((p, i) => xFor(i) + ',' + Math.round(yFor(p[scKey]) * 10) / 10).join(' ') : '';
  const tickCount = 5;
  const gridLines = Array.from({ length: tickCount }, (_, k) => {
    const v = min + ((max - min) * k) / (tickCount - 1);
    return { topPx: Math.round(yFor(v)), label: opts.isPercent ? Math.round(v) + '%' : String(Math.round(v)) };
  });
  const dots = points.map((p, i) => {
    const cv = p[curKey], sv = scKey ? p[scKey] : null;
    const dir = (scKey && sv !== null && sv !== undefined && cv !== null && cv !== undefined && cv < sv) ? 14 : -16;
    return {
      leftPct: Math.round((xFor(i) / chartW) * 1000) / 10, topPx: Math.round(yFor(cv)), labelOffset: dir,
      tickLabel: (n > 14 && i % 2 !== 0) ? '' : p.label,
      valueLabel: cv === null || cv === undefined ? '' : fmtVal(cv),
      hoverTitle: p.label + ' — ' + (opts.curName || 'Actuel') + ' : ' + (cv === null || cv === undefined ? '—' : fmtVal(cv)),
    };
  });
  const scDots = scKey ? points.map((p, i) => {
    const cv = p[curKey], sv = p[scKey];
    const dir = (sv !== null && sv !== undefined && cv !== null && cv !== undefined && sv <= cv) ? 14 : -16;
    return {
      leftPct: Math.round((xFor(i) / chartW) * 1000) / 10, topPx: Math.round(yFor(sv)), labelOffset: dir,
      valueLabel: sv === null || sv === undefined ? '' : fmtVal(sv),
      hoverTitle: p.label + ' — ' + (opts.scName || 'Scénario') + ' : ' + (sv === null || sv === undefined ? '—' : fmtVal(sv)),
    };
  }) : [];
  return { curLine, scLine, gridLines, dots, scDots, chartW, chartH, empty: n === 0 };
}

/** Groups every job description with inactive Non-Operators (under the given
 * `descOverrides`) into an "activable" action plan: mobilize existing KOLs
 * where one is already identified, plan formal training where none is, and
 * flag branches that look misclassified (already mostly active). Powers the
 * "Plan d'action pour un scénario" card in Comparer scénarios. */
export function computeScenarioPlan(idx, descOverrides, includeContractors, geo, kolMonths, kolMinPrompts, monthYear) {
  const reclass = { includeContractors, descOverrides };
  const info = computeReclassInfo(idx, null, geo, kolMonths, reclass, false, descOverrides, monthYear);
  const branches = [];
  for (const [jobDescIdx, d] of info.byDesc) {
    const inactive = d.nonOpTotal - d.nonOpActive;
    if (inactive <= 0) continue;
    const kolNames = [];
    for (const rec of idx.byEmail.values()) {
      const latest = rec.latest;
      if (!latest || latest[U.JOB_DESC] !== jobDescIdx) continue;
      const sum = personSumInWindow(idx, rec, kolMonths);
      if (sum >= kolMinPrompts && rec.emp && rec.emp[E.NAME]) kolNames.push(rec.emp[E.NAME]);
    }
    branches.push({
      jobDescIdx, name: idx.dash.dicts.jobDescriptions[jobDescIdx] || '—', inactive,
      nonOpTotal: d.nonOpTotal, nonOpActive: d.nonOpActive,
      activePct: d.nonOpTotal ? Math.round((d.nonOpActive / d.nonOpTotal) * 100) : 0,
      kolCount: kolNames.length, kolNames: kolNames.slice(0, 3),
    });
  }
  branches.sort((a, b) => b.inactive - a.inactive);
  const withKol = branches.filter((b) => b.kolCount > 0).slice(0, 4);
  const withoutKol = branches.filter((b) => b.kolCount === 0).slice(0, 4);
  const misclassified = branches.filter((b) => b.nonOpTotal >= 5 && b.activePct >= 75).slice(0, 4);
  const cards = [];
  if (withKol.length) {
    const total = withKol.reduce((s, b) => s + b.inactive, 0);
    cards.push({
      key: 'kol', title: 'Mobiliser les Non-Operators inactifs via les KOLs identifiés',
      justification: `${total} personne(s) inactive(s) sur ${withKol.length} job description(s) où un ou plusieurs KOL sont déjà identifiés (onglet KOL & influence).`,
      actions: withKol.map((b) => `${b.name} : ${b.inactive} inactif(s) / ${b.nonOpTotal} Non-Operators (${b.activePct}% actifs) — mobiliser ${b.kolNames.join(', ')}${b.kolCount > b.kolNames.length ? ' et autres' : ''} pour du pair-coaching ciblé.`),
    });
  }
  if (withoutKol.length) {
    const total = withoutKol.reduce((s, b) => s + b.inactive, 0);
    cards.push({
      key: 'training', title: 'Organiser des sessions de formation ciblées',
      justification: `${total} personne(s) inactive(s) sur ${withoutKol.length} job description(s) sans champion (KOL) identifié — un accompagnement formel est nécessaire faute de relais interne.`,
      actions: withoutKol.map((b) => `${b.name} : ${b.inactive} inactif(s) / ${b.nonOpTotal} Non-Operators (${b.activePct}% actifs) — planifier une session de formation dédiée à ce métier.`),
    });
  }
  if (misclassified.length) {
    cards.push({
      key: 'reclass', title: 'Revoir la classification de certaines branches',
      justification: `${misclassified.length} job description(s) classée(s) Non-Operator affichent un taux d'actifs ≥ 75%, proche d'un comportement Operator.`,
      actions: misclassified.map((b) => `${b.name} : ${b.activePct}% actifs sur ${b.nonOpTotal} pers. — vérifier si cette branche devrait être reclassée Operator (onglet Managérial / Domaine, arbre).`),
    });
  }
  return cards;
}

export function computeReclassAdvice(idx, byDesc, kolMinPrompts, kolMonths) {
  let priority = null, maxInactive = -1;
  for (const [jobDescIdx, d] of byDesc) {
    const inactive = d.nonOpTotal - d.nonOpActive;
    if (inactive > maxInactive) { maxInactive = inactive; priority = jobDescIdx; }
  }
  if (priority === null || maxInactive <= 0) return null;
  const kols = [];
  for (const [emailIdx, rec] of idx.byEmail) {
    const latest = rec.latest;
    if (!latest || latest[U.JOB_DESC] !== priority) continue;
    const sum = personSumInWindow(idx, rec, kolMonths);
    if (sum >= kolMinPrompts) kols.push({ name: rec.emp ? rec.emp[E.NAME] : idx.dash.dicts.emails[emailIdx], sum });
  }
  kols.sort((a, b) => b.sum - a.sum);
  const d = byDesc.get(priority);
  return {
    jobDescIdx: priority, jobFunIdx: d.jobFunIdx, inactiveCount: maxInactive, poolTotal: d.nonOpTotal,
    poolActivePct: d.nonOpTotal ? Math.round((d.nonOpActive / d.nonOpTotal) * 100) : 0,
    kolCount: kols.length, kolNames: kols.slice(0, 3).map((k) => k.name),
  };
}

/** Domaine (job function) → job family → job description tree, used by the
 * "Domaine" mode of the Managérial/Domaine tab. `domainJobFunIdx === 'all'`
 * aggregates every domain together. */
export function computeDomainTree(idx, domainJobFunIdx, geo, kolMonths, reclass, monthYear) {
  const isAll = domainJobFunIdx === 'all';
  geo = monthYear ? { ...geo, month: monthYear.month, year: monthYear.year } : geo;
  const passGeo = (latest) => {
    if (geo.region !== 'all' && latest[U.REGION] !== geo.region) return false;
    if (geo.country !== 'all' && latest[U.COUNTRY] !== geo.country) return false;
    if (geo.segment !== 'all' && latest[U.SEGMENT] !== geo.segment) return false;
    if (geo.bu !== 'all' && latest[U.BU] !== geo.bu) return false;
    if (geo.opStatus !== 'all' && latest[U.OP_STATUS] !== geo.opStatus) return false;
    return true;
  };
  const domainName = isAll ? 'Tous les domaines' : idx.dash.dicts.jobFunctions[domainJobFunIdx] || '—';
  if (!idx.hasJobHierarchy) {
    let total = 0, opTotal = 0, opActive = 0, nonOpTotal = 0, nonOpActive = 0;
    for (const [, rec] of idx.byEmail) {
      const latest = rowForGeo(idx, rec, geo);
      if (!latest || (!isAll && latest[U.JOB_FUNCTION] !== domainJobFunIdx) || !passGeo(latest)) continue;
      if (!reclass.includeContractors && isContractor(idx, rec)) continue;
      const sum = personSumFiltered(idx, rec, geo, kolMonths);
      const act = sum > 0 ? 1 : 0;
      total++;
      if (latest[U.OP_STATUS] === 0) { opTotal++; opActive += act; } else { nonOpTotal++; nonOpActive += act; }
    }
    return {
      key: 'domain:' + domainJobFunIdx, jobFunIdx: domainJobFunIdx, name: domainName,
      total, active: opActive + nonOpActive, inactive: total - (opActive + nonOpActive),
      opTotal, opActive, nonOpTotal, nonOpActive, children: [],
    };
  }
  const families = new Map();
  let dTotal = 0, dOpTotal = 0, dNonOpTotal = 0, dOpActive = 0, dNonOpActive = 0;
  for (const [, rec] of idx.byEmail) {
    const latest = rowForGeo(idx, rec, geo);
    if (!latest || (!isAll && latest[U.JOB_FUNCTION] !== domainJobFunIdx) || !passGeo(latest)) continue;
    if (!reclass.includeContractors && isContractor(idx, rec)) continue;
    const jobFamilyIdx = latest[U.JOB_FAMILY], jobDescIdx = latest[U.JOB_DESC];
    const sum = personSumFiltered(idx, rec, geo, kolMonths);
    const act = sum > 0 ? 1 : 0;
    if (!families.has(jobFamilyIdx)) families.set(jobFamilyIdx, new Map());
    const descs = families.get(jobFamilyIdx);
    if (!descs.has(jobDescIdx)) descs.set(jobDescIdx, { jobDescIdx, total: 0, opTotal: 0, nonOpTotal: 0, opActive: 0, nonOpActive: 0 });
    const d = descs.get(jobDescIdx);
    d.total++;
    if (latest[U.OP_STATUS] === 0) { d.opTotal++; d.opActive += act; } else { d.nonOpTotal++; d.nonOpActive += act; }
  }
  const familyNodes = [...families.entries()].map(([jobFamilyIdx, descs]) => {
    const descNodes = [...descs.values()].map((d) => {
      const ov = descOverrideFor(reclass.descOverrides, d.jobDescIdx);
      const natural = d.opTotal >= d.nonOpTotal ? 'operator' : 'nonOperator';
      const effStatus = ov || natural;
      const effTotal = d.total, effActive = d.opActive + d.nonOpActive;
      const opTotal = effStatus === 'operator' ? effTotal : 0, opActive = effStatus === 'operator' ? effActive : 0;
      const nonOpTotal = effStatus === 'nonOperator' ? effTotal : 0, nonOpActive = effStatus === 'nonOperator' ? effActive : 0;
      return {
        key: 'desc:' + d.jobDescIdx, jobDescIdx: d.jobDescIdx, name: idx.dash.dicts.jobDescriptions[d.jobDescIdx] || '—',
        effStatus, naturalStatus: natural, overrideValue: ov, total: effTotal, active: effActive, inactive: effTotal - effActive,
        opTotal, opActive, nonOpTotal, nonOpActive, children: [],
      };
    }).sort((a, b) => b.total - a.total);
    const agg = descNodes.reduce((a, n) => ({
      total: a.total + n.total, active: a.active + n.active, opTotal: a.opTotal + n.opTotal,
      opActive: a.opActive + n.opActive, nonOpTotal: a.nonOpTotal + n.nonOpTotal, nonOpActive: a.nonOpActive + n.nonOpActive,
    }), { total: 0, active: 0, opTotal: 0, opActive: 0, nonOpTotal: 0, nonOpActive: 0 });
    dTotal += agg.total; dOpTotal += agg.opTotal; dNonOpTotal += agg.nonOpTotal; dOpActive += agg.opActive; dNonOpActive += agg.nonOpActive;
    return {
      key: 'fam:' + jobFamilyIdx, jobFamilyIdx, name: idx.dash.dicts.jobFamilies[jobFamilyIdx] || '—',
      total: agg.total, active: agg.active, inactive: agg.total - agg.active,
      opTotal: agg.opTotal, opActive: agg.opActive, nonOpTotal: agg.nonOpTotal, nonOpActive: agg.nonOpActive, children: descNodes,
    };
  }).sort((a, b) => b.total - a.total);
  return {
    key: 'domain:' + domainJobFunIdx, jobFunIdx: domainJobFunIdx, name: domainName,
    total: dTotal, active: dOpActive + dNonOpActive, inactive: dTotal - (dOpActive + dNonOpActive),
    opTotal: dOpTotal, opActive: dOpActive, nonOpTotal: dNonOpTotal, nonOpActive: dNonOpActive, children: familyNodes,
  };
}

/** Per-domain (job function) synthesis — headcount, Operator/Non-Operator
 * share of the total population, and each population's own active rate —
 * shown as the "Synthèse par domaine (avant transfert)" table in domain
 * mode, before any forçage is applied. */
export function computeDomainSynthesis(idx, geo, kolMonths, reclass, monthYear) {
  const effGeo = monthYear ? { ...geo, month: monthYear.month, year: monthYear.year } : geo;
  const byFun = new Map();
  for (const [, rec] of idx.byEmail) {
    const latest = rowForGeo(idx, rec, effGeo);
    if (!latest) continue;
    if (!reclass.includeContractors && isContractor(idx, rec)) continue;
    const jobFunIdx = latest[U.JOB_FUNCTION];
    if (jobFunIdx === undefined || jobFunIdx === null || jobFunIdx < 0 || !idx.dash.dicts.jobFunctions[jobFunIdx]) continue;
    if (!byFun.has(jobFunIdx)) byFun.set(jobFunIdx, { jobFunIdx, label: idx.dash.dicts.jobFunctions[jobFunIdx], total: 0, opTotal: 0, opActive: 0, nonOpTotal: 0, nonOpActive: 0 });
    const d = byFun.get(jobFunIdx);
    const sum = personSumFiltered(idx, rec, effGeo, kolMonths);
    const act = sum > 0 ? 1 : 0;
    d.total++;
    if (latest[U.OP_STATUS] === 0) { d.opTotal++; d.opActive += act; } else { d.nonOpTotal++; d.nonOpActive += act; }
  }
  return Array.from(byFun.values())
    .map((d) => ({
      ...d, active: d.opActive + d.nonOpActive,
      opShareOfTotal: d.total ? Math.round((d.opTotal / d.total) * 100) : 0,
      nonOpShareOfTotal: d.total ? Math.round((d.nonOpTotal / d.total) * 100) : 0,
      opActivePct: d.opTotal ? Math.round((d.opActive / d.opTotal) * 100) : null,
      nonOpPct: d.nonOpTotal ? Math.round((d.nonOpActive / d.nonOpTotal) * 100) : null,
    }))
    .map((d) => ({ ...d, opActivePctLabel: d.opActivePct === null ? '—' : d.opActivePct + '%', nonOpPctLabel: d.nonOpPct === null ? '—' : d.nonOpPct + '%' }))
    .sort((a, b) => b.total - a.total);
}

/** Fuzzy search across domains / sub-domains (job families) / job
 * descriptions for the Tree tab's domain autocomplete. Each result carries
 * enough to jump straight to it (`funIdx`/`famIdx`/`descIdx`). */
export function buildDomainSearchResults(idx, query) {
  const q = (query || '').trim().toLowerCase();
  if (q.length < 2) return [];
  const dicts = idx.dash.dicts;
  const results = [];
  dicts.jobFunctions.forEach((name, i) => {
    if (name && name.toLowerCase().includes(q)) results.push({ key: 'r-fun-' + i, typeLabel: 'Domaine', name, funIdx: i, famIdx: null, descIdx: null });
  });
  (dicts.jobFamilies || []).forEach((name, i) => {
    if (!name || !name.toLowerCase().includes(q)) return;
    const funIdx = idx.familyToFunc.get(i);
    if (funIdx !== undefined) results.push({ key: 'r-fam-' + i, typeLabel: 'Sous-domaine · ' + (dicts.jobFunctions[funIdx] || '—'), name, funIdx, famIdx: i, descIdx: null });
  });
  (dicts.jobDescriptions || []).forEach((name, i) => {
    if (!name || !name.toLowerCase().includes(q)) return;
    const funIdx = idx.descToFunc.get(i), famIdx = idx.descToFamily.get(i);
    if (funIdx !== undefined) results.push({ key: 'r-desc-' + i, typeLabel: 'Job description · ' + (dicts.jobFunctions[funIdx] || '—'), name, funIdx, famIdx: famIdx === undefined ? null : famIdx, descIdx: i });
  });
  return results.slice(0, 25);
}

/** Region / country / function breakdown of before-vs-after reclassification,
 * used by the Rapport tab's priority tables. */
export function computeReportBreakdown(idx, geo, kolMonths, reclass, overridesMap, monthYear) {
  const effGeo = monthYear ? { ...geo, month: monthYear.month, year: monthYear.year } : geo;
  const byRegion = new Map(), byCountry = new Map(), byFunction = new Map();
  const bump = (map, key, label) => {
    if (key === undefined || key === null || key < 0) return null;
    if (!map.has(key)) map.set(key, { label, beforeOpTotal: 0, beforeNonOpTotal: 0, beforeNonOpActive: 0, afterOpTotal: 0, afterNonOpTotal: 0, afterNonOpActive: 0, reclassToOp: 0, reclassToNonOp: 0 });
    return map.get(key);
  };
  for (const [, rec] of idx.byEmail) {
    const latest = rowForGeo(idx, rec, effGeo);
    if (!latest) continue;
    if (!reclass.includeContractors && isContractor(idx, rec)) continue;
    const jobDescIdx = idx.hasJobHierarchy ? latest[U.JOB_DESC] : null, jobFunIdx = latest[U.JOB_FUNCTION];
    const regionIdx = latest[U.REGION], countryIdx = latest[U.COUNTRY];
    const rawOp = latest[U.OP_STATUS];
    const beforeIsNonOp = rawOp !== 0;
    const afterIsNonOp = effectiveOpStatusIdx(overridesMap, jobDescIdx, rawOp) !== 0;
    const sum = personSumFiltered(idx, rec, effGeo, kolMonths);
    const act = sum > 0 ? 1 : 0;
    [[byRegion, regionIdx, idx.dash.dicts.regions[regionIdx]], [byCountry, countryIdx, countryLabel(countryIdx, idx.dash)], [byFunction, jobFunIdx, idx.dash.dicts.jobFunctions[jobFunIdx] || '—']].forEach(([map, key, label]) => {
      const d = bump(map, key, label);
      if (!d) return;
      if (beforeIsNonOp) { d.beforeNonOpTotal++; d.beforeNonOpActive += act; } else { d.beforeOpTotal++; }
      if (afterIsNonOp) { d.afterNonOpTotal++; d.afterNonOpActive += act; } else { d.afterOpTotal++; }
      if (beforeIsNonOp && !afterIsNonOp) d.reclassToOp++;
      if (!beforeIsNonOp && afterIsNonOp) d.reclassToNonOp++;
    });
  }
  const toRows = (map) => Array.from(map.values()).map((d) => {
    const beforeTotal = d.beforeOpTotal + d.beforeNonOpTotal, afterTotal = d.afterOpTotal + d.afterNonOpTotal;
    const inactive = d.beforeNonOpTotal - d.beforeNonOpActive;
    return {
      ...d, beforeTotal, afterTotal, inactive, netMovement: d.reclassToOp - d.reclassToNonOp,
      beforePct: d.beforeNonOpTotal ? Math.round((d.beforeNonOpActive / d.beforeNonOpTotal) * 100) : null,
      afterPct: d.afterNonOpTotal ? Math.round((d.afterNonOpActive / d.afterNonOpTotal) * 100) : null,
      priority: inactive,
    };
  }).sort((a, b) => b.priority - a.priority).map((r, i) => ({ ...r, rank: i + 1, isTop: i === 0 }));
  return { byRegion: toRows(byRegion), byCountry: toRows(byCountry), byFunction: toRows(byFunction) };
}

/** Month `<option>` list restricted to a given year (or all months when
 * `year === 'all'`) — used by every tab with its own decoupled year/month
 * filter (Tree, Reco, Pivot, Comparer scénarios, Évolution temporelle,
 * Rapport), each scoped independently from the shared `geo.year`/`geo.month`. */
export function monthOptionsFor(dash, year) {
  return dash.months
    .map((m, i) => ({ value: String(i), label: m.label, year: m.year }))
    .filter((o) => year === 'all' || o.year === year);
}

export const DIM_LABELS = {
  year: 'Année', month: 'Mois', region: 'Région', country: 'Pays', segment: 'Segment',
  bu: 'Business Unit', jobFunction: 'Équipe/Fonction', opStatus: 'Operator/Non-Operator',
};

export function pivotDimDef(idx, key) {
  const dash = idx.dash;
  const defs = {
    year: { getKey: (r) => dash.months[r[U.MONTH]].year, getLabel: (k) => String(k) },
    month: { getKey: (r) => r[U.MONTH], getLabel: (k) => dash.months[k].label },
    region: { getKey: (r) => r[U.REGION], getLabel: (k) => dash.dicts.regions[k] },
    country: { getKey: (r) => r[U.COUNTRY], getLabel: (k) => countryLabel(k, dash) },
    segment: { getKey: (r) => r[U.SEGMENT], getLabel: (k) => dash.dicts.segments[k] },
    bu: { getKey: (r) => r[U.BU], getLabel: (k) => dash.dicts.businessUnits[k] },
    jobFunction: { getKey: (r) => r[U.JOB_FUNCTION], getLabel: (k) => dash.dicts.jobFunctions[k] || '—' },
    opStatus: { getKey: (r) => r[U.OP_STATUS], getLabel: (k) => dash.dicts.operatorStatuses[k] },
  };
  return defs[key];
}

export function filterUsageRows(idx, f, includeContractors = true) {
  return idx.dash.usage.filter((row) => {
    if (!includeContractors && isContractorRow(idx, row)) return false;
    const monthIdx = row[U.MONTH], countryIdx = row[U.COUNTRY], regionIdx = row[U.REGION], segmentIdx = row[U.SEGMENT];
    const jobFunIdx = row[U.JOB_FUNCTION], buIdx = row[U.BU], opStatusIdx = row[U.OP_STATUS];
    if (f.year && f.year !== 'all' && idx.dash.months[monthIdx].year !== f.year) return false;
    if (f.month && f.month !== 'all' && monthIdx !== f.month) return false;
    if (f.region !== 'all' && regionIdx !== f.region) return false;
    if (f.country && f.country !== 'all' && countryIdx !== f.country) return false;
    if (f.segment !== 'all' && segmentIdx !== f.segment) return false;
    if (f.jobFunction !== 'all' && jobFunIdx !== f.jobFunction) return false;
    if (f.bu !== 'all' && buIdx !== f.bu) return false;
    if (f.opStatus !== 'all' && opStatusIdx !== f.opStatus) return false;
    return true;
  });
}

export function pivotNodeMetrics(rows) {
  const head = new Set(), active = new Set();
  rows.forEach((r) => { head.add(r[U.EMAIL]); if (r[U.TOTAL] > 0) active.add(r[U.EMAIL]); });
  return { headcount: head.size, active: active.size, inactive: head.size - active.size };
}

export function buildPivotNode(idx, rows, dims, depth, path) {
  const metrics = pivotNodeMetrics(rows);
  let children = [];
  if (depth < dims.length && rows.length) {
    const dimDef = pivotDimDef(idx, dims[depth]);
    const groups = new Map();
    rows.forEach((r) => { const k = dimDef.getKey(r); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); });
    children = [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([k, subRows]) => {
      const childPath = path + '/' + dims[depth] + ':' + k;
      const child = buildPivotNode(idx, subRows, dims, depth + 1, childPath);
      return { ...child, label: dimDef.getLabel(k), path: childPath };
    });
  }
  return { ...metrics, children, path };
}

export function flattenPivot(nodes, depth, expandedPaths, out) {
  nodes.forEach((n) => {
    const hasChildren = n.children && n.children.length > 0;
    const expanded = depth === 0 || expandedPaths.has(n.path);
    out.push({
      depth, path: n.path, label: n.label, headcount: n.headcount, active: n.active, inactive: n.inactive,
      hasChildren, expanded,
    });
    if (hasChildren && expanded) flattenPivot(n.children, depth + 1, expandedPaths, out);
  });
}
