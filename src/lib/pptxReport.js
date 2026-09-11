import pptxgen from 'pptxgenjs';
import { USAGE_COL as U, EMP_COL as E } from './dataModel';
import { computeMonthStats, computeReclassInfo, computeReportBreakdown, personSumInWindow } from './dashboardIndex';
import { buildDecompositionTree } from './reportChart';

function pct(a, b) { return b ? Math.round((a / b) * 100) : 0; }

/** The 3-row (All/Operator/Non-Operator) before/after table for a given
 * contractor-inclusion flag — used to show "with vs. without contractors"
 * side by side without mutating shared reclass state (unlike the original
 * prototype, `reclass` is a plain parameter here, so no restore-after step
 * is needed). */
export function computeReclassRowsForContractorFlag(idx, geo, kolMonths, reclass, includeContractors, overrides, monthYear) {
  const r = { ...reclass, includeContractors };
  const baseline = computeReclassInfo(idx, null, geo, kolMonths, r, true, undefined, monthYear);
  const after = computeReclassInfo(idx, null, geo, kolMonths, r, false, overrides, monthYear);
  return [
    { label: 'All', before: baseline.total, beforeActive: baseline.active, beforePct: pct(baseline.active, baseline.total), after: after.total, afterActive: after.active, afterPct: pct(after.active, after.total) },
    { label: 'Operator', before: baseline.opTotal, beforeActive: baseline.opActive, beforePct: pct(baseline.opActive, baseline.opTotal), after: after.opTotal, afterActive: after.opActive, afterPct: pct(after.opActive, after.opTotal) },
    { label: 'Non-Operator', before: baseline.nonOpTotal, beforeActive: baseline.nonOpActive, beforePct: pct(baseline.nonOpActive, baseline.nonOpTotal), after: after.nonOpTotal, afterActive: after.nonOpActive, afterPct: pct(after.nonOpActive, after.nonOpTotal) },
  ];
}

/** Every job description with inactive Non-Operators, grouped into "has a
 * KOL to mobilize" / "no champion, needs training" / "looks misclassified"
 * — the raw data behind the Rapport tab's action-plan cards and the .pptx's
 * English action-plan bullets. */
export function computeReclassBranches(idx, geo, kolMonths, kolMinPrompts, reclass, overridesMap, monthYear) {
  const info = computeReclassInfo(idx, null, geo, kolMonths, reclass, false, overridesMap, monthYear);
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
      jobDescIdx, name: idx.dash.dicts.jobDescriptions[jobDescIdx] || '—', jobFunIdx: d.jobFunIdx,
      inactive, nonOpTotal: d.nonOpTotal, nonOpActive: d.nonOpActive,
      activePct: d.nonOpTotal ? Math.round((d.nonOpActive / d.nonOpTotal) * 100) : 0,
      kolCount: kolNames.length, kolNames: kolNames.slice(0, 3),
    });
  }
  branches.sort((a, b) => b.inactive - a.inactive);
  return {
    branches,
    withKol: branches.filter((b) => b.kolCount > 0).slice(0, 4),
    withoutKol: branches.filter((b) => b.kolCount === 0).slice(0, 4),
    misclassified: branches.filter((b) => b.nonOpTotal >= 5 && b.activePct >= 75).slice(0, 4),
  };
}

/** Everything the Rapport tab (thumbnails, tables, action plan) and the
 * .pptx export both need, computed once. `reclass.includeContractors` is
 * always treated as false here for the headline numbers/tables — the
 * with/without split is computed explicitly via `rowsWithContractors` /
 * `rowsWithoutContractors`. */
export function computeReportExportData({ idx, geo, kol, reclass, report, reportMY, actionLog }) {
  const dash = idx.dash;
  const scenarios = reclass.scenarios || [];
  const reportScenarioId = report.scenarioId;
  const reportScenario = reportScenarioId === 'current' ? null : scenarios.find((s) => s.id === reportScenarioId);
  const overrides = reportScenario ? reportScenario.descOverrides : (reclass.descOverrides || {});
  const reclassNoContractors = { ...reclass, includeContractors: false };

  const rowsWithContractors = computeReclassRowsForContractorFlag(idx, geo, kol.months, reclass, true, overrides, reportMY);
  const rowsWithoutContractors = computeReclassRowsForContractorFlag(idx, geo, kol.months, reclass, false, overrides, reportMY);

  const baseline = computeReclassInfo(idx, null, geo, kol.months, reclassNoContractors, true, undefined, reportMY);
  const after = computeReclassInfo(idx, null, geo, kol.months, reclassNoContractors, false, overrides, reportMY);

  // Resolve a job function label for each reclassified job description,
  // falling back via the most common function seen for its job family when
  // the direct link isn't present on the current scope.
  const jobDescToFun = new Map(), jobDescToFam = new Map(), famFunCount = new Map();
  dash.usage.forEach((row) => {
    const jd = row[U.JOB_DESC], jf = row[U.JOB_FUNCTION], fam = row[U.JOB_FAMILY];
    const jfValid = jf !== undefined && jf !== null && jf >= 0 && dash.dicts.jobFunctions[jf];
    if (jd !== undefined && jd !== null && jd >= 0) {
      if (jfValid && !jobDescToFun.has(jd)) jobDescToFun.set(jd, jf);
      if (fam !== undefined && fam !== null && fam >= 0 && dash.dicts.jobFamilies[fam] && !jobDescToFam.has(jd)) jobDescToFam.set(jd, fam);
    }
    if (jfValid && fam !== undefined && fam !== null && fam >= 0) {
      if (!famFunCount.has(fam)) famFunCount.set(fam, new Map());
      const m = famFunCount.get(fam);
      m.set(jf, (m.get(jf) || 0) + 1);
    }
  });
  const funByFam = new Map();
  famFunCount.forEach((m, fam) => {
    let best = null, bestN = 0;
    m.forEach((n, jf) => { if (n > bestN) { bestN = n; best = jf; } });
    funByFam.set(fam, best);
  });
  const resolveFun = (jobDescIdx) => {
    const direct = jobDescToFun.get(jobDescIdx);
    if (direct !== undefined && direct !== null) return direct;
    const fam = jobDescToFam.get(jobDescIdx);
    if (fam !== undefined && fam !== null && funByFam.has(fam)) return funByFam.get(fam);
    return null;
  };

  const reclassEntries = Object.entries(overrides || {})
    .filter(([, v]) => v === 'operator' || v === 'nonOperator')
    .map(([k, v]) => {
      const id = parseInt(k, 10);
      const d = baseline.byDesc.get(id) || after.byDesc.get(id);
      const dFunIdx = d && d.jobFunIdx !== undefined && d.jobFunIdx !== null && d.jobFunIdx >= 0 && dash.dicts.jobFunctions[d.jobFunIdx] ? d.jobFunIdx : null;
      const jobFunIdx = dFunIdx !== null ? dFunIdx : resolveFun(id);
      const direction = v === 'operator' ? 'Non-Operator → Operator' : 'Operator → Non-Operator';
      return {
        jobDescIdx: id, name: dash.dicts.jobDescriptions[id] || '—',
        jobFunLabel: jobFunIdx !== undefined && jobFunIdx !== null && jobFunIdx >= 0 && dash.dicts.jobFunctions[jobFunIdx] ? dash.dicts.jobFunctions[jobFunIdx] : '—',
        direction,
      };
    });
  const byFunctionCount = new Map();
  reclassEntries.forEach((e) => byFunctionCount.set(e.jobFunLabel, (byFunctionCount.get(e.jobFunLabel) || 0) + 1));
  const reclassByFunction = Array.from(byFunctionCount, ([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);

  const monthPoints = dash.months.map((m, i) => ({ label: m.label, idx: i, year: m.year })).filter((o) => reportMY.year === 'all' || o.year === reportMY.year);
  const emptyGeo = { region: 'all', country: 'all', segment: 'all', jobFunction: 'all', bu: 'all' };
  const series = monthPoints.map((p) => {
    const cur = computeMonthStats(idx, p.idx, emptyGeo, null, true, reclassNoContractors);
    const sc = computeMonthStats(idx, p.idx, emptyGeo, overrides, false, reclassNoContractors);
    return { label: p.label, curOpPct: cur.pctOp, scOpPct: sc.pctOp, curNonOpPct: cur.pctNonOp, scNonOpPct: sc.pctNonOp, curOpPop: cur.opTotal, scOpPop: sc.opTotal, curNonOpPop: cur.nonOpTotal, scNonOpPop: sc.nonOpTotal };
  });

  const breakdown = computeReportBreakdown(idx, geo, kol.months, reclassNoContractors, overrides, reportMY);
  const branchInfo = computeReclassBranches(idx, geo, kol.months, kol.minPrompts, reclassNoContractors, overrides, reportMY);
  const targetPct = reclass.targetPct;
  const scenarioName = reportScenario ? reportScenario.name : 'Current working scenario';
  const contractorsIncluded = reclass.includeContractors;
  const periodLabel = reportMY.year === 'all' ? 'All periods' : (reportMY.month === 'all' ? String(reportMY.year) : (dash.months[reportMY.month] ? dash.months[reportMY.month].label : String(reportMY.year)));
  const latestMY = dash.months.length ? { month: dash.months.length - 1, year: dash.months[dash.months.length - 1].year } : { month: 'all', year: 'all' };
  const latestLabel = dash.months.length ? dash.months[dash.months.length - 1].label : 'Latest month';

  const treeFor = (my, includeContractors, periodLbl) => {
    const rws = computeReclassRowsForContractorFlag(idx, geo, kol.months, reclass, includeContractors, overrides, my);
    const bkd = computeReportBreakdown(idx, geo, kol.months, { ...reclass, includeContractors }, overrides, my);
    return buildDecompositionTree(rws, bkd, { periodLabel: periodLbl, contractorLabel: includeContractors ? 'avec contractors' : 'sans contractors' });
  };
  const treeGlobalWithout = treeFor({ month: 'all', year: 'all' }, false, 'Global (toutes périodes)');
  const treeGlobalWith = treeFor({ month: 'all', year: 'all' }, true, 'Global (toutes périodes)');
  const treeLatestWithout = treeFor(latestMY, false, latestLabel);
  const treeLatestWith = treeFor(latestMY, true, latestLabel);

  return {
    rows: rowsWithoutContractors, rowsWithContractors, rowsWithoutContractors,
    reclassEntries, reclassByFunction, series, breakdown, branchInfo, targetPct, scenarioName, contractorsIncluded,
    actionLogList: actionLog || [], periodLabel, latestLabel,
    treeGlobalWithout, treeGlobalWith, treeLatestWithout, treeLatestWith,
  };
}

/** Builds and downloads the English-language .pptx report from data already
 * computed by `computeReportExportData`, styled from an optional `branding`
 * kit (extracted from an uploaded .pptx in the Données tab). */
export async function generateReportPptx(d, branding) {
  const accent = (branding && branding.colors && branding.colors.accent1) || 'F28D00';
  const dark = (branding && branding.colors && branding.colors.dk2) || '414141';
  const teal = (branding && branding.colors && branding.colors.accent2) || '2E4957';
  const font = (branding && branding.fontFamily) || 'Arial';
  const hex = (c) => (c || '').replace('#', '');

  const pptx = new pptxgen();
  pptx.defineLayout({ name: 'RPT', width: 13.33, height: 7.5 });
  pptx.layout = 'RPT';
  let pageNum = 1;
  const footer = (slide) => {
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 7.36, w: 13.33, h: 0.14, fill: { color: hex(accent) } });
    slide.addText('TE Energy — LLM Adoption Report', { x: 0.4, y: 7.08, w: 6, h: 0.26, fontSize: 9, color: hex(dark), fontFace: font });
    slide.addText(String(pageNum++), { x: 12.7, y: 7.08, w: 0.5, h: 0.26, fontSize: 9, color: hex(dark), fontFace: font, align: 'right' });
  };
  const header = (slide, title) => {
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.08, fill: { color: hex(accent) } });
    if (branding && branding.logoBase64) slide.addImage({ data: branding.logoBase64, x: 11.65, y: 0.05, w: 1.18, h: 0.68, sizing: { type: 'contain', w: 1.18, h: 0.68 } });
    slide.addText(title, { x: 0.6, y: 0.3, w: 10.8, h: 0.6, fontSize: 22, bold: true, color: hex(dark), fontFace: font });
    footer(slide);
  };
  const headFill = { bold: true, fill: { color: hex(dark) }, color: 'FFFFFF' };
  const axisOpts = (xTitle, yTitle) => ({ showCatAxisTitle: true, catAxisTitle: xTitle, catAxisTitleFontFace: font, catAxisTitleFontSize: 10, showValAxisTitle: true, valAxisTitle: yTitle, valAxisTitleFontFace: font, valAxisTitleFontSize: 10 });
  const contractorsLine = 'shown with and without contractors below';

  const cover = pptx.addSlide();
  if (branding && branding.coverBg) {
    cover.addImage({ data: branding.coverBg, x: 0, y: 0, w: 13.33, h: 7.5, sizing: { type: 'cover', w: 13.33, h: 7.5 } });
    cover.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 7.5, fill: { color: hex(dark), transparency: 35 } });
  } else {
    cover.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 7.5, fill: { color: hex(dark) } });
  }
  cover.addShape(pptx.ShapeType.rect, { x: 0, y: 4.6, w: 13.33, h: 0.1, fill: { color: hex(accent) } });
  if (branding && branding.logoBase64) cover.addImage({ data: branding.logoBase64, x: 11.65, y: 0.35, w: 1.18, h: 0.68, sizing: { type: 'contain', w: 1.18, h: 0.68 } });
  cover.addText('LLM Adoption Report', { x: 0.7, y: 3.1, w: 11.9, h: 1.1, fontSize: 40, bold: true, color: 'FFFFFF', fontFace: font });
  cover.addText(`Scenario: Non-Op → Op reclassification  |  ${d.periodLabel}  |  ${contractorsLine}`, { x: 0.7, y: 4.8, w: 11.9, h: 0.5, fontSize: 15, color: hex(accent), fontFace: font });
  cover.addText(`Generated ${new Date().toLocaleDateString('en-GB')}`, { x: 0.7, y: 6.9, w: 6, h: 0.4, fontSize: 11, color: 'BBBBBB', fontFace: font });

  const s1 = pptx.addSlide();
  header(s1, 'Executive Summary');
  const nonOp = d.rowsWithoutContractors[2];
  const nonOpC = d.rowsWithContractors[2];
  const periodTag = d.periodLabel === 'All periods' ? 'Total months' : d.periodLabel;
  const summaryLines = [
    'We reclassify Non-Operator staff into Operator whenever their actual AI usage matches Operator behavior, to measure the true adoption rate.',
    `Excluding contractors, the Non-Operator active rate is currently ${nonOp.beforePct}%. After reclassification (scenario Non-Op → Op), it reaches ${nonOp.afterPct}% (target: ${d.targetPct}%).`,
    `Including contractors, it moves from ${nonOpC.beforePct}% to ${nonOpC.afterPct}%.`,
  ];
  s1.addText(summaryLines.map((t) => ({ text: t, options: { breakLine: true, paraSpaceAfter: 10 } })), { x: 0.6, y: 1.25, w: 12, h: 1.7, fontSize: 13, color: hex(dark), fontFace: font, valign: 'top', lineSpacingMultiple: 1.15 });
  s1.addText(`Period: ${periodTag}`, { x: 0.6, y: 3.05, w: 5.9, h: 0.28, fontSize: 10.5, italic: true, color: hex(dark), fontFace: font });
  const tblRow = (rows) => rows.map((woc) => [{ text: woc.label, options: { bold: true } }, { text: `${woc.beforePct}%` }, { text: `${woc.afterPct}%`, options: { color: hex(accent), bold: true } }]);
  const tbl1 = [[{ text: 'Population', options: headFill }, { text: 'Current', options: headFill }, { text: 'Scenario Non-Op → Op', options: headFill }], ...tblRow(d.rowsWithoutContractors)];
  const tbl2 = [[{ text: 'Population', options: headFill }, { text: 'Current', options: headFill }, { text: 'Scenario Non-Op → Op', options: headFill }], ...tblRow(d.rowsWithContractors)];
  s1.addText('Without contractors', { x: 0.6, y: 3.4, w: 5.9, h: 0.3, fontSize: 12.5, bold: true, color: hex(dark), fontFace: font });
  s1.addTable(tbl1, { x: 0.6, y: 3.75, w: 5.9, fontSize: 11, fontFace: font, border: { type: 'solid', color: 'DDDDDD', pt: 1 }, rowH: 0.35 });
  s1.addText('With contractors', { x: 0.6, y: 5.45, w: 5.9, h: 0.3, fontSize: 12.5, bold: true, color: hex(dark), fontFace: font });
  s1.addTable(tbl2, { x: 0.6, y: 5.8, w: 5.9, fontSize: 11, fontFace: font, border: { type: 'solid', color: 'DDDDDD', pt: 1 }, rowH: 0.35 });
  s1.addText('Reclassifications by function', { x: 6.9, y: 3.4, w: 5.9, h: 0.3, fontSize: 12.5, bold: true, color: hex(dark), fontFace: font });
  const funcBullets = d.reclassByFunction.length
    ? d.reclassByFunction.slice(0, 8).map((f) => ({ text: `${f.label}: ${f.count} reclassified`, options: { bullet: true, fontSize: 12, color: hex(dark), fontFace: font, breakLine: true } }))
    : [{ text: 'No reclassification applied on this scenario.', options: { fontSize: 12, color: hex(dark), fontFace: font } }];
  s1.addText(funcBullets, { x: 7.0, y: 3.75, w: 5.8, h: 3.2 });

  const treeSlide = (title, img) => {
    const s = pptx.addSlide();
    header(s, title);
    if (img) s.addImage({ data: img, x: 0.65, y: 1.0, w: 12, h: 6.3, sizing: { type: 'contain', w: 12, h: 6.3 } });
  };
  treeSlide('Decomposition Tree — Global (all periods), without contractors', d.treeGlobalWithout);
  treeSlide('Decomposition Tree — Global (all periods), with contractors', d.treeGlobalWith);
  treeSlide(`Decomposition Tree — ${d.latestLabel} (last loaded month), without contractors`, d.treeLatestWithout);
  treeSlide(`Decomposition Tree — ${d.latestLabel} (last loaded month), with contractors`, d.treeLatestWith);

  const s2 = pptx.addSlide();
  header(s2, 'Adoption Rate Over Time — Current vs Scenario');
  const labels = d.series.map((p) => p.label);
  const scLegend = 'Scenario (Non-Op → Op reclassified)';
  const niceRange = (vals) => {
    const nums = vals.filter((v) => v !== null && v !== undefined);
    if (!nums.length) return { min: 0, max: 100 };
    return { min: Math.max(0, Math.floor(Math.min(...nums)) - 5), max: Math.min(100, Math.ceil(Math.max(...nums)) + 5) };
  };
  const lineOpts = (x, range, yTitle) => ({ x, y: 1.1, w: 5.9, h: 5.5, showLegend: true, legendPos: 'b', showValue: true, dataLabelFontSize: 9, dataLabelColor: hex(dark), dataLabelPosition: 't', lineDataSymbol: 'circle', lineSize: 2.5, catAxisLabelFontFace: font, valAxisLabelFontFace: font, valAxisMaxVal: range.max, valAxisMinVal: range.min, chartColors: [hex(teal), hex(accent)], ...axisOpts('Month', yTitle) });
  s2.addText('Non-Operator active rate (%)', { x: 0.5, y: 0.95, w: 5.9, h: 0.3, fontSize: 12, bold: true, color: hex(dark), fontFace: font });
  s2.addChart(pptx.ChartType.line, [{ name: 'Current', labels, values: d.series.map((p) => p.curNonOpPct) }, { name: scLegend, labels, values: d.series.map((p) => p.scNonOpPct) }], lineOpts(0.5, niceRange(d.series.flatMap((p) => [p.curNonOpPct, p.scNonOpPct])), 'Active rate (%)'));
  s2.addText('Operator active rate (%)', { x: 6.9, y: 0.95, w: 5.9, h: 0.3, fontSize: 12, bold: true, color: hex(dark), fontFace: font });
  s2.addChart(pptx.ChartType.line, [{ name: 'Current', labels, values: d.series.map((p) => p.curOpPct) }, { name: scLegend, labels, values: d.series.map((p) => p.scOpPct) }], lineOpts(6.9, niceRange(d.series.flatMap((p) => [p.curOpPct, p.scOpPct])), 'Active rate (%)'));

  const s3 = pptx.addSlide();
  header(s3, 'Population & Point Gain Over Time');
  const popRange = (vals) => {
    const nums = vals.filter((v) => v !== null && v !== undefined);
    if (!nums.length) return { min: 0, max: 10 };
    return { min: Math.floor((Math.min(...nums) - 100) / 100) * 100, max: Math.ceil((Math.max(...nums) + 100) / 100) * 100 };
  };
  const nonOpPopRange = popRange(d.series.flatMap((p) => [p.curNonOpPop, p.scNonOpPop]));
  const opPopRange = popRange(d.series.flatMap((p) => [p.curOpPop, p.scOpPop]));
  const popChartOpts = (x, range) => ({ x, y: 1.35, w: 5.9, h: 5.4, showLegend: true, legendPos: 'b', showValue: true, dataLabelFontSize: 8, dataLabelColor: hex(dark), dataLabelPosition: 't', lineDataSymbol: 'circle', chartColors: [hex(teal), hex(accent)], catAxisLabelFontFace: font, valAxisLabelFontFace: font, valAxisMinVal: range.min, valAxisMaxVal: range.max, ...axisOpts('Month', 'Headcount') });
  s3.addText('Non-Operator population (headcount)', { x: 0.5, y: 0.95, w: 5.9, h: 0.3, fontSize: 12, bold: true, color: hex(dark), fontFace: font });
  s3.addChart(pptx.ChartType.line, [{ name: 'Current', labels, values: d.series.map((p) => p.curNonOpPop) }, { name: scLegend, labels, values: d.series.map((p) => p.scNonOpPop) }], popChartOpts(0.5, nonOpPopRange));
  s3.addText('Operator population (headcount)', { x: 6.9, y: 0.95, w: 5.9, h: 0.3, fontSize: 12, bold: true, color: hex(dark), fontFace: font });
  s3.addChart(pptx.ChartType.line, [{ name: 'Current', labels, values: d.series.map((p) => p.curOpPop) }, { name: scLegend, labels, values: d.series.map((p) => p.scOpPop) }], popChartOpts(6.9, opPopRange));

  const s3b = pptx.addSlide();
  header(s3b, 'Point Gain Over Time — % vs Volume');
  s3b.addText('Point gain — Non-Operator active rate (percentage points, scenario minus current)', { x: 0.5, y: 0.95, w: 12, h: 0.3, fontSize: 12, bold: true, color: hex(dark), fontFace: font });
  s3b.addChart(pptx.ChartType.bar, [{ name: 'Gain (pt)', labels, values: d.series.map((p) => (p.curNonOpPct !== null && p.scNonOpPct !== null) ? Math.round((p.scNonOpPct - p.curNonOpPct) * 10) / 10 : 0) }], { x: 0.5, y: 1.3, w: 12, h: 2.7, barDir: 'col', chartColors: [hex(accent)], catAxisLabelFontFace: font, valAxisLabelFontFace: font, showValue: true, dataLabelFontSize: 9, dataLabelPosition: 'outEnd', ...axisOpts('Month', 'Point gain (pt)') });
  s3b.addText('Volume gain — headcount moved from Non-Operator to Operator (scenario minus current)', { x: 0.5, y: 4.2, w: 12, h: 0.3, fontSize: 12, bold: true, color: hex(dark), fontFace: font });
  s3b.addChart(pptx.ChartType.bar, [{ name: 'Gain (headcount)', labels, values: d.series.map((p) => (p.curOpPop !== null && p.scOpPop !== null) ? Math.round(p.scOpPop - p.curOpPop) : 0) }], { x: 0.5, y: 4.55, w: 12, h: 2.3, barDir: 'col', chartColors: [hex(teal)], catAxisLabelFontFace: font, valAxisLabelFontFace: font, showValue: true, dataLabelFontSize: 9, dataLabelPosition: 'outEnd', ...axisOpts('Month', 'Headcount gain') });

  const s4 = pptx.addSlide();
  header(s4, 'Key Messages');
  const gapAll = nonOp.afterPct - nonOp.beforePct;
  const topRegion = d.breakdown.byRegion[0];
  const topFunction = d.breakdown.byFunction[0];
  const messages = [
    `Non-Operator active rate improves by ${gapAll >= 0 ? '+' : ''}${gapAll} pt after reclassification, ${nonOp.afterPct >= d.targetPct ? 'reaching' : 'still short of'} the ${d.targetPct}% target.`,
    topRegion ? `Priority target — region: ${topRegion.label}, ${topRegion.beforeTotal} people currently, ${topRegion.inactive} inactive at ${topRegion.beforePct ?? '—'}% (biggest quick win to raise the rate fastest).` : 'No regional reclassification recorded on this scenario.',
    topFunction ? `Priority target — function: ${topFunction.label}, ${topFunction.beforeTotal} people currently, ${topFunction.inactive} inactive at ${topFunction.beforePct ?? '—'}%.` : 'No function-level reclassification recorded on this scenario.',
    `${d.actionLogList.length} action(s) already logged as executed — flagged "[In progress]" on the following slides.`,
  ].map((t) => ({ text: t, options: { bullet: true, fontSize: 15, color: hex(dark), fontFace: font, breakLine: true } }));
  s4.addText(messages, { x: 0.6, y: 1.3, w: 11.8, h: 2.5 });

  const s4b = pptx.addSlide();
  header(s4b, 'Regional / Country Analysis');
  const geoTbl = [[{ text: '#', options: headFill }, { text: 'Region', options: headFill }, { text: 'Headcount', options: headFill }, { text: 'Inactive', options: headFill }, { text: 'Rate before', options: headFill }, { text: 'Rate after', options: headFill }, { text: 'Moved', options: headFill }]];
  d.breakdown.byRegion.slice(0, 8).forEach((r) => geoTbl.push([{ text: String(r.rank) }, { text: (r.label || '—') + (r.isTop ? ' ★' : '') }, { text: String(r.beforeTotal) }, { text: String(r.inactive) }, { text: r.beforePct === null ? '—' : r.beforePct + '%' }, { text: r.afterPct === null ? '—' : r.afterPct + '%', options: { color: hex(accent), bold: true } }, { text: (r.netMovement >= 0 ? '+' : '') + r.netMovement }]));
  s4b.addTable(geoTbl, { x: 0.5, y: 1.1, w: 6.0, fontSize: 10.5, fontFace: font, border: { type: 'solid', color: 'DDDDDD', pt: 1 }, autoPage: false });
  const countryTbl = [[{ text: '#', options: headFill }, { text: 'Country', options: headFill }, { text: 'Headcount', options: headFill }, { text: 'Inactive', options: headFill }, { text: 'Rate before', options: headFill }, { text: 'Rate after', options: headFill }, { text: 'Moved', options: headFill }]];
  d.breakdown.byCountry.slice(0, 8).forEach((r) => countryTbl.push([{ text: String(r.rank) }, { text: (r.label || '—') + (r.isTop ? ' ★' : '') }, { text: String(r.beforeTotal) }, { text: String(r.inactive) }, { text: r.beforePct === null ? '—' : r.beforePct + '%' }, { text: r.afterPct === null ? '—' : r.afterPct + '%', options: { color: hex(accent), bold: true } }, { text: (r.netMovement >= 0 ? '+' : '') + r.netMovement }]));
  s4b.addTable(countryTbl, { x: 6.7, y: 1.1, w: 6.0, fontSize: 10.5, fontFace: font, border: { type: 'solid', color: 'DDDDDD', pt: 1 }, autoPage: false });

  const s4c = pptx.addSlide();
  header(s4c, 'Domain / Function Analysis & Action Plan');
  const funcTbl = [[{ text: '#', options: headFill }, { text: 'Function', options: headFill }, { text: 'Headcount', options: headFill }, { text: 'Inactive', options: headFill }, { text: 'Rate before', options: headFill }, { text: 'Rate after', options: headFill }, { text: 'Moved', options: headFill }]];
  d.breakdown.byFunction.slice(0, 8).forEach((r) => funcTbl.push([{ text: String(r.rank) }, { text: (r.label || '—') + (r.isTop ? ' ★' : '') }, { text: String(r.beforeTotal) }, { text: String(r.inactive) }, { text: r.beforePct === null ? '—' : r.beforePct + '%' }, { text: r.afterPct === null ? '—' : r.afterPct + '%', options: { color: hex(accent), bold: true } }, { text: (r.netMovement >= 0 ? '+' : '') + r.netMovement }]));
  s4c.addTable(funcTbl, { x: 0.6, y: 1.1, w: 5.9, fontSize: 10.5, fontFace: font, border: { type: 'solid', color: 'DDDDDD', pt: 1 }, autoPage: false });
  const actionBullets = [];
  d.branchInfo.withKol.slice(0, 3).forEach((b) => actionBullets.push(`${b.name}: mobilize ${b.kolNames.join(', ')} for peer coaching (${b.inactive}/${b.nonOpTotal} inactive).`));
  d.branchInfo.withoutKol.slice(0, 3).forEach((b) => actionBullets.push(`${b.name}: no champion — schedule dedicated training (${b.inactive}/${b.nonOpTotal} inactive).`));
  d.branchInfo.misclassified.slice(0, 2).forEach((b) => actionBullets.push(`${b.name}: ${b.activePct}% active — verify if this should be reclassified Operator.`));
  const actionTexts = actionBullets.length ? actionBullets : ['No significant action needed on this scenario.'];
  s4c.addText('Action plan', { x: 6.8, y: 1.1, w: 5.9, h: 0.35, fontSize: 13, bold: true, color: hex(accent), fontFace: font });
  s4c.addText(actionTexts.map((t) => {
    const done = d.actionLogList.some((l) => (l.scope || '').toLowerCase().split(' ').some((w) => w.length > 3 && t.toLowerCase().includes(w)));
    return { text: (done ? '[In progress] ' : '') + t, options: { bullet: true, fontSize: 11, color: hex(dark), fontFace: font, breakLine: true } };
  }), { x: 6.8, y: 1.5, w: 5.9, h: 4.5 });

  const s5 = pptx.addSlide();
  header(s5, 'Priority Targets — Region & Function (biggest headcount, lowest rate first)');
  const priTblCols = (rows) => [
    [{ text: '#', options: headFill }, { text: 'Label', options: headFill }, { text: 'Headcount', options: headFill }, { text: 'Inactive', options: headFill }, { text: 'Rate before', options: headFill }, { text: 'Rate after', options: headFill }, { text: 'Moved', options: headFill }],
    ...rows.slice(0, 6).map((r) => [{ text: String(r.rank) }, { text: (r.label || '—') + (r.isTop ? ' ★' : ''), options: r.isTop ? { bold: true } : {} }, { text: String(r.beforeTotal) }, { text: String(r.inactive) }, { text: r.beforePct === null ? '—' : r.beforePct + '%' }, { text: r.afterPct === null ? '—' : r.afterPct + '%', options: { color: hex(accent), bold: true } }, { text: (r.netMovement >= 0 ? '+' : '') + r.netMovement }]),
  ];
  s5.addText('By region — sorted by priority (headcount × inactive share)', { x: 0.5, y: 0.95, w: 12.3, h: 0.3, fontSize: 12, bold: true, color: hex(dark), fontFace: font });
  s5.addTable(priTblCols(d.breakdown.byRegion), { x: 0.5, y: 1.3, w: 12.3, fontSize: 10.5, fontFace: font, border: { type: 'solid', color: 'DDDDDD', pt: 1 }, autoPage: false });
  s5.addText('By function/domain — sorted by priority (headcount × inactive share)', { x: 0.5, y: 3.65, w: 12.3, h: 0.3, fontSize: 12, bold: true, color: hex(dark), fontFace: font });
  s5.addTable(priTblCols(d.breakdown.byFunction), { x: 0.5, y: 4.0, w: 12.3, fontSize: 10.5, fontFace: font, border: { type: 'solid', color: 'DDDDDD', pt: 1 }, autoPage: false });
  const topR = d.breakdown.byRegion[0], topF = d.breakdown.byFunction[0];
  const priComment = [
    topR ? `Region priority: ${topR.label} — ${topR.beforeTotal} people, ${topR.inactive} inactive (${topR.beforePct ?? '—'}% active) — the fastest lever to raise the global rate.` : 'No region data.',
    topF ? `Function priority: ${topF.label} — ${topF.beforeTotal} people, ${topF.inactive} inactive (${topF.beforePct ?? '—'}% active).` : 'No function data.',
  ].join('  ');
  s5.addText(priComment, { x: 0.5, y: 6.6, w: 12.3, h: 0.6, fontSize: 11, italic: true, color: hex(dark), fontFace: font });

  const s6 = pptx.addSlide();
  header(s6, 'Appendix — Reclassified Job Descriptions');
  const appTbl = [[{ text: 'Job description', options: headFill }, { text: 'Function / Domain', options: headFill }, { text: 'Reclassification applied', options: headFill }]];
  if (d.reclassEntries.length) d.reclassEntries.forEach((e) => appTbl.push([{ text: e.name }, { text: e.jobFunLabel }, { text: e.direction }]));
  else appTbl.push([{ text: 'No reclassification applied on this scenario.', options: { colspan: 3 } }, { text: '' }, { text: '' }]);
  s6.addTable(appTbl, { x: 0.6, y: 1.0, w: 12, fontSize: 8, fontFace: font, rowH: 0.22, border: { type: 'solid', color: 'DDDDDD', pt: 0.5 }, autoPage: true });

  await pptx.writeFile({ fileName: `llm-adoption-report-${new Date().toISOString().slice(0, 10)}.pptx` });
}
