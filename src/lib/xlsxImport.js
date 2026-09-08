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
        resolve(XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null }));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

/** Some Usage LLM exports carry mojibake (broken-encoding) job labels.
 * Neutralizing non-ASCII characters keeps dictionary keys stable across
 * imports instead of silently duplicating the same job description under
 * two different byte sequences. */
function cleanLabel(s) {
  if (!s) return s;
  // eslint-disable-next-line no-control-regex -- \x00 is intentional: this strips everything outside printable ASCII.
  return s.replace(/[^\x00-\x7F]/g, 'A');
}

function upsertInto(map, arr, value) {
  if (map.has(value)) return map.get(value);
  const idx = arr.length;
  arr.push(value);
  map.set(value, idx);
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
 * usageUpdated, newMonths }. One row per person per month is kept — a
 * re-imported month for the same person overwrites the earlier row. */
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

  const months = [...dash.months];
  const usage = [...dash.usage];
  const dicts = cloneDicts(dash.dicts);

  const emailMap = new Map(dicts.emails.map((v, i) => [v, i]));
  const countryMap = new Map(dicts.countries.map((v, i) => [v, i]));
  const regionMap = new Map(dicts.regions.map((v, i) => [v, i]));
  const segmentMap = new Map(dicts.segments.map((v, i) => [v, i]));
  const buMap = new Map(dicts.businessUnits.map((v, i) => [v, i]));
  const jobFunMap = new Map(dicts.jobFunctions.map((v, i) => [v, i]));
  const opStatusMap = new Map(dicts.operatorStatuses.map((v, i) => [v, i]));
  const jobFamilyMap = new Map(dicts.jobFamilies.map((v, i) => [v, i]));
  const jobFuncDescMap = new Map(dicts.jobFunctionDescriptions.map((v, i) => [v, i]));
  const jobDescMap = new Map(dicts.jobDescriptions.map((v, i) => [v, i]));
  const userTypeMap = new Map(dicts.userTypes.map((v, i) => [v, i]));
  const monthKeyToIdx = new Map(months.map((m, i) => [m.key, i]));
  const existingKey = new Map();
  usage.forEach((r, i) => existingKey.set(r[USAGE_COL.EMAIL] + '|' + r[USAGE_COL.MONTH], i));

  let usageAdded = 0, usageUpdated = 0;
  const newMonths = [];

  rows.slice(1).forEach((r) => {
    if (!r || !r[col.email]) return;
    const email = String(r[col.email]).trim().toLowerCase();
    if (!email) return;
    const emailIdx = upsertInto(emailMap, dicts.emails, email);
    const year = parseInt(r[col.year], 10);
    const monthNum = parseInt(r[col.month], 10);
    if (!year || !monthNum) return;
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
    const opStatusIdx = upsertInto(opStatusMap, dicts.operatorStatuses, String(r[col.opStatus] || '').trim());
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

  return { dash: { ...dash, months, usage, dicts }, usageAdded, usageUpdated, newMonths };
}

/** Replace the whole employee referential from an "Employees" export.
 * Returns { dash, employeesCount }. */
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
  const dicts = cloneDicts(dash.dicts);
  const emailMap = new Map(dicts.emails.map((v, i) => [v, i]));
  const employees = [];
  rows.slice(1).forEach((r) => {
    if (!r || !r[col.userId]) return;
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
  return { dash: { ...dash, dicts, employees }, employeesCount: employees.length };
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
