import * as XLSX from 'xlsx';
import { USAGE_COL, EMP_COL } from './dataModel';
import { computeReclassInfo } from './dashboardIndex';

const OP_LABEL = { operator: 'Operator', nonOperator: 'Non-Operator' };
const STATUS_MAP = { operator: 'operator', 'non-operator': 'nonOperator', 'non operator': 'nonOperator' };

/** Read an .xlsx File into an array-of-arrays (header row included), picking
 * whichever sheet actually has the expected header (some exports put a
 * "METADATA" dictionary sheet first). */
export function readWorkbookRows(file, requiredHeaderLower) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        let sheetName = wb.SheetNames[0];
        if (requiredHeaderLower) {
          const match = wb.SheetNames.find((name) => {
            const s = wb.Sheets[name];
            const firstRow = XLSX.utils.sheet_to_json(s, { header: 1, raw: true, defval: null })[0] || [];
            return firstRow.some((h) => String(h || '').trim().toLowerCase() === requiredHeaderLower);
          });
          if (match) sheetName = match;
        }
        const sheet = wb.Sheets[sheetName];
        let rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
        // Some exports declare a bloated used-range (up to Excel's row limit) far beyond the
        // real data — trim trailing rows that are entirely empty so counts/logs reflect reality.
        let lastNonEmpty = rows.length - 1;
        while (lastNonEmpty >= 0 && (!rows[lastNonEmpty] || rows[lastNonEmpty].every((c) => c === null || c === undefined || String(c).trim() === ''))) lastNonEmpty--;
        rows = rows.slice(0, lastNonEmpty + 1);
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

/** Repairs the classic "UTF-8 bytes misread as Latin-1" corruption (é → Ã©)
 * some export tools produce, without touching text that is already correctly
 * encoded. */
export function fixMojibake(s) {
  if (!s || !/[ÂÃâã]/.test(s)) return s;
  try {
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) {
      const code = s.charCodeAt(i);
      if (code > 0xFF) return s;
      bytes[i] = code;
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return s;
  }
}

/** Some Usage LLM exports carry mojibake (broken-encoding) job labels, or
 * stray double spaces. Normalizing keeps dictionary keys stable across
 * imports instead of silently duplicating the same job description under
 * two different byte sequences. */
function cleanLabel(s) {
  if (!s) return s;
  return fixMojibake(s.replace(/\s+/g, ' ').trim());
}

/** Repairs job-hierarchy labels already sitting in a loaded `dash` (imported
 * before this mojibake fix existed) — run once whenever a dataset is loaded
 * or restored, not just at import time. */
export function repairMojibakeInDicts(dash) {
  if (!dash || !dash.dicts) return dash;
  let changed = false;
  const dicts = { ...dash.dicts };
  ['jobFamilies', 'jobFunctionDescriptions', 'jobDescriptions'].forEach((key) => {
    if (!Array.isArray(dicts[key])) return;
    const next = dicts[key].map((v) => {
      const fixed = fixMojibake(v);
      if (fixed !== v) changed = true;
      return fixed;
    });
    dicts[key] = next;
  });
  return changed ? { ...dash, dicts } : dash;
}

/** Older imports could bind "Operator" to whichever dictionary index the
 * source file happened to list first, but every read site compares
 * opStatusIdx to the literal 0/1 — reindex to the canonical
 * 0=Operator/1=Non-Operator convention using the strings themselves as
 * ground truth, remapping every usage row that referenced the old indices. */
export function repairOperatorStatusIndices(dash) {
  const arr = dash && dash.dicts && dash.dicts.operatorStatuses;
  if (!Array.isArray(arr)) return dash;
  const norm = (v) => String(v || '').trim().toLowerCase();
  const opIdx = arr.findIndex((v) => norm(v) === 'operator' || norm(v) === 'op');
  const nonOpIdx = arr.findIndex((v) => ['non-operator', 'nonoperator', 'non operator', 'non-op'].includes(norm(v)));
  if (opIdx === -1 && nonOpIdx === -1) return dash;
  const remap = new Map();
  const newArr = [];
  newArr[0] = opIdx !== -1 ? arr[opIdx] : 'Operator';
  newArr[1] = nonOpIdx !== -1 ? arr[nonOpIdx] : 'Non-Operator';
  if (opIdx !== -1) remap.set(opIdx, 0);
  if (nonOpIdx !== -1) remap.set(nonOpIdx, 1);
  let nextFree = 2;
  arr.forEach((v, i) => {
    if (i === opIdx || i === nonOpIdx) return;
    remap.set(i, nextFree); newArr[nextFree] = v; nextFree++;
  });
  if (!arr.some((v, i) => remap.get(i) !== i)) return dash;
  const usage = dash.usage.map((row) => {
    const v = row[USAGE_COL.OP_STATUS];
    if (v === undefined || v === null || !remap.has(v)) return row;
    const next = row.slice();
    next[USAGE_COL.OP_STATUS] = remap.get(v);
    return next;
  });
  return { ...dash, dicts: { ...dash.dicts, operatorStatuses: newArr }, usage };
}

/** Applies every load-time data repair. Call whenever a dataset enters app
 * state from anywhere other than a fresh import: initial load from
 * localStorage, and backup restore. (Import itself keeps indices canonical
 * going in via `upsertOpStatus`, but this is the single source of truth.) */
export function repairDash(dash) {
  return repairOperatorStatusIndices(repairMojibakeInDicts(dash));
}

function upsertInto(map, arr, value) {
  if (map.has(value)) return map.get(value);
  const idx = arr.length;
  arr.push(value);
  map.set(value, idx);
  return idx;
}

/** Operator/Non-Operator must always resolve to stable semantic indices
 * (0=Operator, 1=Non-Operator) regardless of which string the import
 * encounters first or its exact casing/spelling — dozens of call sites
 * compare against 0/1 directly. */
function upsertOpStatus(dicts, opStatusMap, rawValue) {
  if (!opStatusMap.has('operator')) { dicts.operatorStatuses[0] = 'Operator'; opStatusMap.set('operator', 0); }
  if (!opStatusMap.has('non-operator')) { dicts.operatorStatuses[1] = 'Non-Operator'; opStatusMap.set('non-operator', 1); }
  const norm = String(rawValue || '').trim().toLowerCase();
  if (norm === 'operator' || norm === 'op') return 0;
  if (norm === 'non-operator' || norm === 'nonoperator' || norm === 'non operator' || norm === 'non-op') return 1;
  if (opStatusMap.has(norm)) return opStatusMap.get(norm);
  const idx = dicts.operatorStatuses.length;
  dicts.operatorStatuses.push(String(rawValue || '').trim() || ('#' + idx));
  opStatusMap.set(norm, idx);
  return idx;
}

function cloneDicts(dicts) {
  return {
    emails: [...dicts.emails],
    countries: [...dicts.countries],
    regions: [...dicts.regions],
    segments: [...dicts.segments],
    jobFunctions: [...dicts.jobFunctions],
    businessUnits: [...dicts.businessUnits],
    operatorStatuses: [...dicts.operatorStatuses],
    jobFamilies: [...(dicts.jobFamilies || [])],
    jobFunctionDescriptions: [...(dicts.jobFunctionDescriptions || [])],
    jobDescriptions: [...(dicts.jobDescriptions || [])],
    userTypes: [...(dicts.userTypes || [])],
  };
}

const FR_MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

/** Merge a "Usage LLM" export into `dash`. Returns { dash, usageAdded,
 * usageUpdated, newMonths, log }. One row per person per month is kept — a
 * re-imported month for the same person overwrites the earlier row. `log`
 * captures counts/samples for the "Journal d'import" panel. */
export async function importUsageFile(file, dash) {
  const rows = await readWorkbookRows(file, 'job_function');
  const headerRow = (rows[0] || []).map((h) => String(h || '').trim().toLowerCase());
  const idx = (name) => headerRow.indexOf(name);
  const col = {
    email: idx('email_address'), country: idx('country'), region: idx('region'),
    segment: idx('hr_business_segment'), bu: idx('hr_business_unit'), jobFunction: idx('job_function'),
    opStatus: idx('operator_status'), jobFamily: idx('job_family_description'),
    jobFuncDesc: idx('job_function_description'), jobDesc: idx('job_description'),
    userType: idx('user_type'), year: idx('year'), month: idx('month'), monthYear: idx('month_year'),
    chatgpt: idx('chatgpt_prompts'), copilotTotal: idx('copilot_total_prompts'), telme: idx('telme_prompts'),
  };
  if (col.email < 0) {
    throw new Error("Colonne 'email_address' introuvable dans le fichier Usage LLM.");
  }
  const log = { fileName: file.name, rowsRead: Math.max(0, rows.length - 1), rowsRejected: 0, rejectSamples: [], missingCols: [], opStatusCounts: {} };
  Object.entries(col).forEach(([k, v]) => { if (v < 0) log.missingCols.push(k); });

  const months = [...dash.months];
  const usage = [...dash.usage];
  const dicts = cloneDicts(dash.dicts);

  const emailMap = new Map(dicts.emails.map((v, i) => [v, i]));
  const countryMap = new Map(dicts.countries.map((v, i) => [v, i]));
  const regionMap = new Map(dicts.regions.map((v, i) => [v, i]));
  const segmentMap = new Map(dicts.segments.map((v, i) => [v, i]));
  const buMap = new Map(dicts.businessUnits.map((v, i) => [v, i]));
  const jobFunMap = new Map(dicts.jobFunctions.map((v, i) => [v, i]));
  const opStatusMap = new Map(dicts.operatorStatuses.map((v, i) => [String(v || '').trim().toLowerCase(), i]));
  const jobFamilyMap = new Map(dicts.jobFamilies.map((v, i) => [v, i]));
  const jobFuncDescMap = new Map(dicts.jobFunctionDescriptions.map((v, i) => [v, i]));
  const jobDescMap = new Map(dicts.jobDescriptions.map((v, i) => [v, i]));
  const userTypeMap = new Map(dicts.userTypes.map((v, i) => [v, i]));
  const monthKeyToIdx = new Map(months.map((m, i) => [m.key, i]));
  const existingKey = new Map();
  usage.forEach((r, i) => existingKey.set(r[USAGE_COL.EMAIL] + '|' + r[USAGE_COL.MONTH], i));

  let usageAdded = 0, usageUpdated = 0;
  const newMonths = [];

  rows.slice(1).forEach((r, ri) => {
    if (!r || col.email < 0 || !r[col.email]) {
      log.rowsRejected++;
      if (log.rejectSamples.length < 5) log.rejectSamples.push({ row: ri + 2, reason: 'email_address vide ou colonne absente' });
      return;
    }
    const email = String(r[col.email]).trim().toLowerCase();
    if (!email) {
      log.rowsRejected++;
      if (log.rejectSamples.length < 5) log.rejectSamples.push({ row: ri + 2, reason: 'email_address vide' });
      return;
    }
    const emailIdx = upsertInto(emailMap, dicts.emails, email);
    const year = parseInt(r[col.year], 10);
    const monthNum = parseInt(r[col.month], 10);
    if (!year || !monthNum) {
      log.rowsRejected++;
      if (log.rejectSamples.length < 5) log.rejectSamples.push({ row: ri + 2, reason: `year/month invalide (year="${r[col.year]}", month="${r[col.month]}")` });
      return;
    }
    const key = year + '-' + String(monthNum).padStart(2, '0');
    let monthIdx = monthKeyToIdx.get(key);
    if (monthIdx === undefined) {
      const serial = r[col.monthYear] ? Number(r[col.monthYear]) : null;
      months.push({ serial, label: FR_MONTHS[monthNum - 1] + ' ' + year, key, year });
      monthIdx = months.length - 1;
      monthKeyToIdx.set(key, monthIdx);
      newMonths.push(key);
    }
    const countryIdx = upsertInto(countryMap, dicts.countries, String(r[col.country] || '').trim());
    const regionIdx = upsertInto(regionMap, dicts.regions, String(r[col.region] || '').trim());
    const segmentIdx = upsertInto(segmentMap, dicts.segments, String(r[col.segment] || '').trim());
    const buIdx = upsertInto(buMap, dicts.businessUnits, String(r[col.bu] || '').trim());
    const jobFunIdx = upsertInto(jobFunMap, dicts.jobFunctions, String(r[col.jobFunction] || '').trim());
    const opStatusIdx = upsertOpStatus(dicts, opStatusMap, r[col.opStatus]);
    const opStatusLabel = dicts.operatorStatuses[opStatusIdx];
    log.opStatusCounts[opStatusLabel] = (log.opStatusCounts[opStatusLabel] || 0) + 1;
    const jobFamilyIdx = upsertInto(jobFamilyMap, dicts.jobFamilies, cleanLabel(String(r[col.jobFamily] || '').trim()));
    const jobFuncDescIdx = upsertInto(jobFuncDescMap, dicts.jobFunctionDescriptions, cleanLabel(String(r[col.jobFuncDesc] || '').trim()));
    const jobDescIdx = upsertInto(jobDescMap, dicts.jobDescriptions, cleanLabel(String(r[col.jobDesc] || '').trim()));
    const userTypeIdx = upsertInto(userTypeMap, dicts.userTypes, String(r[col.userType] || 'EMPLOYEE').trim());
    const chatgpt = Number(r[col.chatgpt]) || 0;
    const copilotTotal = Number(r[col.copilotTotal]) || 0;
    const telme = Number(r[col.telme]) || 0;
    const total = chatgpt + copilotTotal + telme;
    const newRow = [];
    newRow[USAGE_COL.EMAIL] = emailIdx;
    newRow[USAGE_COL.MONTH] = monthIdx;
    newRow[USAGE_COL.COUNTRY] = countryIdx;
    newRow[USAGE_COL.REGION] = regionIdx;
    newRow[USAGE_COL.SEGMENT] = segmentIdx;
    newRow[USAGE_COL.JOB_FAMILY] = jobFamilyIdx;
    newRow[USAGE_COL.JOB_FUNCTION] = jobFunIdx;
    newRow[USAGE_COL.CHATGPT] = chatgpt;
    newRow[USAGE_COL.COPILOT] = copilotTotal;
    newRow[USAGE_COL.TELME] = telme;
    newRow[USAGE_COL.TOTAL] = total;
    newRow[USAGE_COL.JOB_FUNC_DESC] = jobFuncDescIdx;
    newRow[USAGE_COL.JOB_DESC] = jobDescIdx;
    newRow[USAGE_COL.BU] = buIdx;
    newRow[USAGE_COL.OP_STATUS] = opStatusIdx;
    newRow[USAGE_COL.USER_TYPE] = userTypeIdx;

    const dedupKey = emailIdx + '|' + monthIdx;
    if (existingKey.has(dedupKey)) {
      usage[existingKey.get(dedupKey)] = newRow;
      usageUpdated++;
    } else {
      usage.push(newRow);
      existingKey.set(dedupKey, usage.length - 1);
      usageAdded++;
    }
  });

  return { dash: { ...dash, months, usage, dicts }, usageAdded, usageUpdated, newMonths, log };
}

/** Replace the whole employee referential from an "Employees" export.
 * Returns { dash, employeesCount, log }. */
export async function importEmployeesFile(file, dash) {
  const rows = await readWorkbookRows(file, 'userid');
  const headerRow = (rows[0] || []).map((h) => String(h || '').trim().toUpperCase());
  const idx = (name) => headerRow.indexOf(name);
  const col = {
    userId: idx('USERID'), name: idx('AD_DISPLAY_NAME'), title: idx('EMPLOYEE_JOB_DESC'),
    email: idx('EMAIL_ADDRESS'), sup: idx('SUPERVISOR_USER_ID'),
  };
  if (col.userId < 0) {
    throw new Error("Colonne 'USERID' introuvable dans le fichier Employés.");
  }
  const log = { fileName: file.name, rowsRead: Math.max(0, rows.length - 1), rowsRejected: 0, missingCols: [] };
  Object.entries(col).forEach(([k, v]) => { if (v < 0) log.missingCols.push(k); });
  const dicts = cloneDicts(dash.dicts);
  const emailMap = new Map(dicts.emails.map((v, i) => [v, i]));
  const employees = [];
  rows.slice(1).forEach((r) => {
    if (!r || !r[col.userId]) { log.rowsRejected++; return; }
    const email = col.email >= 0 ? String(r[col.email] || '').trim().toLowerCase() : '';
    const emailIdx = email ? upsertInto(emailMap, dicts.emails, email) : -1;
    const row = [];
    row[EMP_COL.EMAIL] = emailIdx;
    row[EMP_COL.USER_ID] = String(r[col.userId]).trim();
    row[EMP_COL.NAME] = r[col.name] || '';
    row[EMP_COL.TITLE] = r[col.title] || '';
    row[EMP_COL.SUPERVISOR] = r[col.sup] ? String(r[col.sup]).trim() : null;
    employees.push(row);
  });
  return { dash: { ...dash, dicts, employees }, employeesCount: employees.length, log };
}

export function datasetSummary(dash) {
  return {
    months: dash.months.length,
    employees: dash.employees.length,
    usageRows: dash.usage.length,
    monthRange: dash.months.length ? dash.months[0].label + ' → ' + dash.months[dash.months.length - 1].label : '—',
  };
}

/** Downloads a saved reclassification scenario as an .xlsx (a "Forçages"
 * sheet listing each overridden job description's original vs. scenario
 * status, plus a "Meta" sheet carrying the scenario name) — so it can be
 * shared or re-imported into another browser/session. */
export function exportScenarioXlsx(scenario, idx, geo, kolMonths, reclass) {
  const baseline = computeReclassInfo(idx, null, geo, kolMonths, reclass, true);
  const rows = [['Index', 'Job description', 'Statut origine', 'Statut scénario']];
  Object.entries(scenario.descOverrides || {}).forEach(([jobDescIdx, status]) => {
    const id = parseInt(jobDescIdx, 10);
    const d = baseline.byDesc.get(id);
    const natural = d && d.nonOpTotal > 0 && d.total > 0 && d.total - d.nonOpTotal >= d.nonOpTotal ? 'operator' : 'nonOperator';
    rows.push([id, idx.dash.dicts.jobDescriptions[id] || '#' + id, OP_LABEL[natural], OP_LABEL[status]]);
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Forçages');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['ScenarioName', scenario.name]]), 'Meta');
  XLSX.writeFile(wb, `scenario_${scenario.name.replace(/[^a-z0-9]+/gi, '_')}.xlsx`);
}

/** Parses a scenario .xlsx (as produced by exportScenarioXlsx, or hand-built
 * with equivalent columns) into { name, descOverrides, count, unmatched }.
 * Job descriptions are matched by the "Index" column when present and still
 * valid against the current dataset (current export format), falling back
 * to a case-insensitive name match (legacy exports, or a hand-edited file
 * without a working index) — rows that match neither are counted but
 * skipped. */
export function parseScenarioXlsxFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsBinaryString(file);
  }).then((binaryString) => {
    const wb = XLSX.read(binaryString, { type: 'binary' });
    let name = file.name.replace(/\.[^.]+$/, '');
    const metaSheet = wb.Sheets['Meta'];
    if (metaSheet) {
      const meta = XLSX.utils.sheet_to_json(metaSheet, { header: 1 });
      if (meta[0] && meta[0][1]) name = String(meta[0][1]);
    }
    const sheetName = wb.SheetNames.includes('Forçages') ? 'Forçages' : wb.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 });
    return { name, rows };
  });
}

export function matchScenarioImportRows(rows, dash) {
  const revMap = new Map();
  dash.dicts.jobDescriptions.forEach((nm, idx) => revMap.set(String(nm).trim(), idx));
  const revMapLower = new Map();
  dash.dicts.jobDescriptions.forEach((nm, idx) => {
    const k = String(nm).trim().toLowerCase();
    if (!revMapLower.has(k)) revMapLower.set(k, idx);
  });
  const header = rows[0] || [];
  const hasIndexCol = String(header[0] || '').trim().toLowerCase() === 'index';
  const nameCol = hasIndexCol ? 1 : 0, statusCol = hasIndexCol ? 3 : 2;
  const descOverrides = {};
  const unmatchedNames = [];
  rows.slice(1).forEach((r) => {
    if (!r || (r[nameCol] === undefined && r[0] === undefined)) return;
    const exactName = String(r[nameCol] || '').trim();
    let idx = revMap.get(exactName);
    if (idx === undefined) idx = revMapLower.get(exactName.toLowerCase());
    if (idx === undefined && hasIndexCol && r[0] !== undefined && r[0] !== '' && dash.dicts.jobDescriptions[parseInt(r[0], 10)] !== undefined) {
      idx = parseInt(r[0], 10);
    }
    if (idx === undefined) { unmatchedNames.push(exactName || ('#' + r[0])); return; }
    const target = STATUS_MAP[String(r[statusCol] || '').trim().toLowerCase()];
    if (target) descOverrides[idx] = target;
  });
  const unmatched = unmatchedNames.length;
  return { descOverrides, count: Object.keys(descOverrides).length, unmatched, unmatchedNames };
}
