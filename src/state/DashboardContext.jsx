import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createEmptyDash, isDashEmpty } from '../lib/dataModel';
import { buildIndex } from '../lib/dashboardIndex';
import { importUsageFile, importEmployeesFile, datasetSummary, parseScenarioXlsxFile, matchScenarioImportRows, repairDash } from '../lib/xlsxImport';
import { KEYS, loadJSON, saveJSON, removeKey } from '../lib/storage';

const DEFAULT_GEO = {
  month: 'all', year: 'all', region: 'all', country: 'all', segment: 'all', jobFunction: 'all',
  bu: 'all', operator: 'all', opStatus: 'all', metric: 'activeShare', sizeMetric: 'headcount',
  sortBy: 'share', sortDir: 'desc', view: 'globe',
};
const DEFAULT_KOL = { minPrompts: 100, months: 3, requireSameTeam: true, requireSameGeo: false, requireSameJob: false, nameSearch: '', lowThreshold: 5, sortBy: 'sum', sortDir: 'desc' };
const DEFAULT_TREE = { level: 1, search: '', selectedUserId: null, mode: 'person', domainJobFunIdx: null, domainSearch: '' };
const DEFAULT_RECLASS = { descOverrides: {}, targetPct: 80, includeContractors: true, lastAction: null, scenarios: [], newScenarioName: '', pendingImport: null };
const DEFAULT_PIVOT = { dims: ['year', 'month', 'opStatus'], expanded: [] };
const DEFAULT_SCENARIO_COMPARE = { aId: '', bId: '', planId: '' };
const DEFAULT_MY = { month: 'all', year: 'all' };
const DEFAULT_REPORT = { scenarioId: 'current' };
const DEFAULT_TIMELINE = { scenarioId: '', view: 'all' };

const DashboardContext = createContext(null);

export function DashboardProvider({ children }) {
  const [dash, setDash] = useState(() => repairDash(loadJSON(KEYS.data, null) || createEmptyDash()));
  const [tab, setTab] = useState('geo');
  const [geo, setGeo] = useState(DEFAULT_GEO);
  const [kol, setKol] = useState(DEFAULT_KOL);
  const [tree, setTree] = useState(DEFAULT_TREE);
  const [pivot, setPivot] = useState(DEFAULT_PIVOT);
  const [reclass, setReclass] = useState(() => ({ ...DEFAULT_RECLASS, ...loadJSON(KEYS.reclass, {}) }));
  const [scenarioCompare, setScenarioCompare] = useState(DEFAULT_SCENARIO_COMPARE);
  const [selectedEmailIdx, setSelectedEmailIdx] = useState(null);
  const [hoverCountryIdx, setHoverCountryIdx] = useState(null);
  const [pinnedCountryIdx, setPinnedCountryIdx] = useState(null);
  const [dataMsg, setDataMsg] = useState({ busy: false, message: null, error: null });
  const [dataHistory, setDataHistory] = useState(() => loadJSON(KEYS.dataHistory, []));
  const [recoHistory, setRecoHistory] = useState(() => loadJSON(KEYS.recommendations, []));
  // Per-tab year/month scopes, decoupled from the shared `geo` filters used
  // by the Carte mondiale / KOL tabs — each tab keeps its own so switching
  // one doesn't silently re-scope the others.
  const [treeMY, setTreeMY] = useState(DEFAULT_MY);
  const [recoMY, setRecoMY] = useState(DEFAULT_MY);
  const [pivotMY, setPivotMY] = useState(DEFAULT_MY);
  const [scenarioMY, setScenarioMY] = useState(DEFAULT_MY);
  const [timelineMY, setTimelineMY] = useState(DEFAULT_MY);
  const [reportMY, setReportMY] = useState(DEFAULT_MY);
  const [report, setReport] = useState(DEFAULT_REPORT);
  const [timeline, setTimeline] = useState(DEFAULT_TIMELINE);
  const [importLog, setImportLog] = useState(() => loadJSON(KEYS.importLog, null));
  const [showImportLog, setShowImportLog] = useState(false);
  const [actionLog, setActionLog] = useState(() => loadJSON(KEYS.actionLog, []));
  const [branding, setBrandingState] = useState(() => loadJSON(KEYS.branding, null));

  const idx = useMemo(() => buildIndex(dash), [dash]);
  const months = dash.months;

  useEffect(() => { saveJSON(KEYS.data, dash); }, [dash]);
  useEffect(() => { saveJSON(KEYS.reclass, reclass); }, [reclass]);

  const updateGeo = useCallback((patch) => setGeo((g) => ({ ...g, ...(typeof patch === 'function' ? patch(g) : patch) })), []);
  const updateKol = useCallback((patch) => setKol((k) => ({ ...k, ...patch })), []);
  const updateTree = useCallback((patch) => setTree((t) => ({ ...t, ...patch })), []);
  const saveReclass = useCallback((patch) => setReclass((r) => ({ ...r, ...patch })), []);
  const updatePivot = useCallback((patch) => setPivot((p) => ({ ...p, ...(typeof patch === 'function' ? patch(p) : patch) })), []);
  const updateScenarioCompare = useCallback((patch) => setScenarioCompare((s) => ({ ...s, ...patch })), []);
  const updateReport = useCallback((patch) => setReport((r) => ({ ...r, ...patch })), []);
  const updateTimeline = useCallback((patch) => setTimeline((t) => ({ ...t, ...patch })), []);

  // Generic setter for the per-tab month/year pairs above: picking a year
  // resets the month back to "all" if the currently-selected month isn't
  // part of that year (avoids landing on an impossible year/month pair).
  const makeMYUpdater = useCallback((setter) => (patch) => {
    setter((cur) => {
      let year = 'year' in patch ? patch.year : cur.year;
      let month = 'month' in patch ? patch.month : cur.month;
      if ('year' in patch && year !== 'all' && month !== 'all' && months[month] && months[month].year !== year) month = 'all';
      return { month, year };
    });
  }, [months]);
  const updateTreeMY = useMemo(() => makeMYUpdater(setTreeMY), [makeMYUpdater]);
  const updateRecoMY = useMemo(() => makeMYUpdater(setRecoMY), [makeMYUpdater]);
  const updatePivotMY = useMemo(() => makeMYUpdater(setPivotMY), [makeMYUpdater]);
  const updateScenarioMY = useMemo(() => makeMYUpdater(setScenarioMY), [makeMYUpdater]);
  const updateTimelineMY = useMemo(() => makeMYUpdater(setTimelineMY), [makeMYUpdater]);
  const updateReportMY = useMemo(() => makeMYUpdater(setReportMY), [makeMYUpdater]);

  // --- Job-description Operator/Non-Operator overrides, with one-step undo ---
  const setDescOverride = useCallback((jobDescIdx, status) => {
    if (jobDescIdx === null || jobDescIdx === undefined) return;
    setReclass((r) => {
      const current = r.descOverrides || {};
      const prevValue = current[jobDescIdx] || null;
      const next = { ...current };
      if (next[jobDescIdx] === status) delete next[jobDescIdx]; else next[jobDescIdx] = status;
      return { ...r, descOverrides: next, lastAction: { type: 'single', jobDescIdx, prevValue } };
    });
  }, []);

  const forceSubtreeOverride = useCallback((jobDescIds, status) => {
    setReclass((r) => {
      const current = r.descOverrides || {};
      const prevValues = {};
      jobDescIds.forEach((id) => { prevValues[id] = current[id] || null; });
      const next = { ...current };
      jobDescIds.forEach((id) => { next[id] = status; });
      return { ...r, descOverrides: next, lastAction: { type: 'bulk', prevValues } };
    });
  }, []);

  // Re-attaches an "orphan" override (a forçage whose job description no
  // longer exists in the current data, typically because it was renamed on
  // a later import) onto a different, currently-valid job description.
  const applyOverrideRemap = useCallback((oldIdx, newIdx, status) => {
    if (Number.isNaN(newIdx)) return;
    setReclass((r) => {
      const next = { ...(r.descOverrides || {}) };
      delete next[oldIdx];
      next[newIdx] = status;
      return { ...r, descOverrides: next };
    });
  }, []);

  const revertDescOverride = useCallback((jobDescIdx) => {
    setReclass((r) => {
      const next = { ...(r.descOverrides || {}) };
      delete next[jobDescIdx];
      return { ...r, descOverrides: next };
    });
  }, []);

  const undoLastAction = useCallback(() => {
    setReclass((r) => {
      const last = r.lastAction;
      if (!last) return r;
      const next = { ...(r.descOverrides || {}) };
      if (last.type === 'single') {
        if (last.prevValue === null) delete next[last.jobDescIdx]; else next[last.jobDescIdx] = last.prevValue;
      } else if (last.type === 'bulk') {
        Object.entries(last.prevValues).forEach(([id, v]) => { if (v === null) delete next[id]; else next[id] = v; });
      }
      return { ...r, descOverrides: next, lastAction: null };
    });
  }, []);

  // --- Reclassification scenarios (save/restore/update/delete) ---
  const saveScenario = useCallback((name) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return;
    setReclass((r) => {
      const scenario = {
        id: Date.now() + '-' + Math.random().toString(36).slice(2, 7),
        name: trimmed, date: new Date().toISOString(),
        descOverrides: { ...(r.descOverrides || {}) },
        targetPct: r.targetPct, includeContractors: r.includeContractors,
      };
      return { ...r, scenarios: [...(r.scenarios || []), scenario] };
    });
  }, []);

  const restoreScenario = useCallback((id) => {
    setReclass((r) => {
      const scenario = (r.scenarios || []).find((s) => s.id === id);
      if (!scenario) return r;
      return { ...r, descOverrides: { ...scenario.descOverrides }, targetPct: scenario.targetPct, includeContractors: scenario.includeContractors, lastAction: null };
    });
  }, []);

  const updateScenario = useCallback((id) => {
    setReclass((r) => {
      const scenario = (r.scenarios || []).find((s) => s.id === id);
      if (!scenario) return r;
      const scenarios = r.scenarios.map((s) => (s.id === id
        ? { ...s, descOverrides: { ...(r.descOverrides || {}) }, targetPct: r.targetPct, includeContractors: r.includeContractors, date: new Date().toISOString() }
        : s));
      return { ...r, scenarios };
    });
  }, []);

  const deleteScenario = useCallback((id) => {
    setReclass((r) => ({ ...r, scenarios: (r.scenarios || []).filter((s) => s.id !== id) }));
  }, []);

  // --- Scenario import from .xlsx (export is a synchronous download, called
  // directly from the component with exportScenarioXlsx) ---
  const importScenarioFile = useCallback(async (file) => {
    const { name, rows } = await parseScenarioXlsxFile(file);
    const { descOverrides, count, unmatched, unmatchedNames } = matchScenarioImportRows(rows, dash);
    setReclass((r) => ({ ...r, pendingImport: { name, descOverrides, count, unmatched, unmatchedNames } }));
  }, [dash]);

  const confirmImportAsNew = useCallback(() => {
    setReclass((r) => {
      const p = r.pendingImport;
      if (!p) return r;
      const scenario = {
        id: Date.now() + '-' + Math.random().toString(36).slice(2, 7), name: p.name, date: new Date().toISOString(),
        descOverrides: { ...p.descOverrides }, targetPct: r.targetPct, includeContractors: r.includeContractors,
      };
      return { ...r, scenarios: [...(r.scenarios || []), scenario], pendingImport: null };
    });
  }, []);

  const confirmImportOverwrite = useCallback((targetId) => {
    setReclass((r) => {
      const p = r.pendingImport;
      if (!p || !targetId) return r;
      const scenarios = (r.scenarios || []).map((s) => (s.id === targetId ? { ...s, descOverrides: { ...p.descOverrides }, date: new Date().toISOString() } : s));
      return { ...r, scenarios, pendingImport: null };
    });
  }, []);

  const cancelImport = useCallback(() => {
    setReclass((r) => ({ ...r, pendingImport: null }));
  }, []);

  const runImport = useCallback(async (usageFile, employeesFile) => {
    if (!usageFile && !employeesFile) {
      setDataMsg({ busy: false, message: null, error: 'Sélectionnez au moins un fichier à importer.' });
      return;
    }
    setDataMsg({ busy: true, message: null, error: null });
    await new Promise((r) => setTimeout(r, 30)); // laisse le bouton "Import en cours…" s'afficher avant le travail lourd
    const t0 = Date.now();
    try {
      const prevSummary = datasetSummary(dash);
      let nextDash = dash;
      let usageAdded = 0, usageUpdated = 0, newMonths = [], usageLog = null;
      if (usageFile) {
        const r = await importUsageFile(usageFile, nextDash);
        nextDash = r.dash; usageAdded = r.usageAdded; usageUpdated = r.usageUpdated; newMonths = r.newMonths; usageLog = r.log;
      }
      let employeesReplaced = false, employeesCount = nextDash.employees.length, employeesLog = null;
      if (employeesFile) {
        const r = await importEmployeesFile(employeesFile, nextDash);
        nextDash = r.dash; employeesReplaced = true; employeesCount = r.employeesCount; employeesLog = r.log;
      }
      nextDash = repairDash(nextDash);
      setDash(nextDash);
      const durationMs = Date.now() - t0;
      const entry = { ts: Date.now(), durationMs, usageAdded, usageUpdated, newMonths, employeesReplaced, employeesCount, prevSummary, usage: usageLog, employees: employeesLog };
      setDataHistory((h) => {
        const next = [...h, entry];
        saveJSON(KEYS.dataHistory, next);
        return next;
      });
      setImportLog(entry);
      saveJSON(KEYS.importLog, entry);
      const rejectNote = usageLog && usageLog.rowsRejected ? `. ⚠ ${usageLog.rowsRejected} ligne(s) usage rejetée(s) — voir le journal d'import.` : '';
      const msg = `Import réussi (${(durationMs / 1000).toFixed(1)}s) : ${usageAdded} nouvelle(s) ligne(s) d'usage, ${usageUpdated} mise(s) à jour${newMonths.length ? ', nouveaux mois : ' + newMonths.join(', ') : ''}${employeesReplaced ? ', référentiel employés remplacé (' + employeesCount + ' personnes)' : ''}${rejectNote}`;
      setDataMsg({ busy: false, message: msg, error: null });
    } catch (e) {
      setDataMsg({ busy: false, message: null, error: String((e && e.message) || e) });
    }
  }, [dash]);

  const toggleImportLog = useCallback(() => setShowImportLog((v) => !v), []);

  const resetData = useCallback(() => {
    removeKey(KEYS.data);
    removeKey(KEYS.dataHistory);
    setDash(createEmptyDash());
    setDataHistory([]);
    setDataMsg({ busy: false, message: 'Données réinitialisées.', error: null });
  }, []);

  // --- Full backup (usage, employees, scénarios, historique) as a single
  // downloadable .json — separate from the "Réinitialiser" button above,
  // which only clears the usage/employees dataset. ---
  const backupAll = useCallback(() => {
    const backup = { type: 'llmDashBackup', version: 1, ts: new Date().toISOString(), dash, reclass, dataHistory, recoHistory };
    const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `backup_llmdash_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [dash, reclass, dataHistory, recoHistory]);

  const clearAllData = useCallback(() => {
    if (!window.confirm('Vider toutes les données actuelles (usage, employés, scénarios, historique) ? Cette action est irréversible sans sauvegarde.')) return;
    removeKey(KEYS.dataHistory);
    removeKey(KEYS.recommendations);
    setDash(createEmptyDash());
    setReclass({ ...DEFAULT_RECLASS });
    setDataHistory([]);
    setRecoHistory([]);
    setDataMsg({ busy: false, message: 'Données vidées. Importez de nouveaux fichiers ou réimportez une sauvegarde.', error: null });
  }, []);

  const restoreBackupFile = useCallback((file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const backup = JSON.parse(ev.target.result);
        if (!backup || backup.type !== 'llmDashBackup' || !backup.dash) throw new Error('Fichier de sauvegarde invalide.');
        setDash(repairDash(backup.dash));
        if (backup.reclass) setReclass((r) => ({ ...r, ...backup.reclass, pendingImport: null }));
        if (backup.dataHistory) { setDataHistory(backup.dataHistory); saveJSON(KEYS.dataHistory, backup.dataHistory); }
        if (backup.recoHistory) { setRecoHistory(backup.recoHistory); saveJSON(KEYS.recommendations, backup.recoHistory); }
        setDataMsg({ busy: false, message: `Sauvegarde du ${new Date(backup.ts).toLocaleString('fr-FR')} restaurée.`, error: null });
      } catch (err) {
        setDataMsg({ busy: false, message: null, error: String((err && err.message) || err) });
      }
    };
    reader.readAsText(file);
  }, []);

  const pushRecoEntry = useCallback((entry) => {
    setRecoHistory((h) => {
      const next = [...h, entry];
      saveJSON(KEYS.recommendations, next);
      return next;
    });
  }, []);

  // --- Action log: "we already launched this" entries, so the Rapport tab
  // doesn't re-propose an action plan item that's already underway. ---
  const addActionLogEntry = useCallback((scope, action, date) => {
    const trimmedScope = (scope || '').trim(), trimmedAction = (action || '').trim();
    if (!trimmedScope || !trimmedAction) return;
    setActionLog((list) => {
      const next = [...list, { id: Date.now() + '-' + Math.random().toString(36).slice(2, 7), date: date || new Date().toISOString().slice(0, 10), scope: trimmedScope, action: trimmedAction }];
      saveJSON(KEYS.actionLog, next);
      return next;
    });
  }, []);

  const removeActionLogEntry = useCallback((id) => {
    setActionLog((list) => {
      const next = list.filter((x) => x.id !== id);
      saveJSON(KEYS.actionLog, next);
      return next;
    });
  }, []);

  // --- Report branding: colors/font/logo extracted from an uploaded .pptx
  // template, reused when generating the Rapport tab's .pptx export. ---
  const setBranding = useCallback((next) => {
    setBrandingState(next);
    try { saveJSON(KEYS.branding, next); } catch {
      // Cover image can be large — retry without it rather than losing colors/font/logo.
      try { saveJSON(KEYS.branding, { ...next, coverBg: null }); } catch { /* localStorage full — keep in-memory only */ }
    }
  }, []);

  const clearBranding = useCallback(() => {
    removeKey(KEYS.branding);
    setBrandingState(null);
  }, []);

  const value = {
    dash, idx, hasData: !isDashEmpty(dash),
    tab, setTab,
    geo, updateGeo, kol, updateKol, tree, updateTree,
    reclass, saveReclass, pivot, updatePivot,
    scenarioCompare, updateScenarioCompare,
    setDescOverride, forceSubtreeOverride, revertDescOverride, undoLastAction, applyOverrideRemap,
    saveScenario, restoreScenario, updateScenario, deleteScenario,
    importScenarioFile, confirmImportAsNew, confirmImportOverwrite, cancelImport,
    selectedEmailIdx, setSelectedEmailIdx, hoverCountryIdx, setHoverCountryIdx, pinnedCountryIdx, setPinnedCountryIdx,
    dataMsg, dataHistory, runImport, resetData,
    backupAll, clearAllData, restoreBackupFile,
    recoHistory, pushRecoEntry,
    treeMY, updateTreeMY, recoMY, updateRecoMY, pivotMY, updatePivotMY,
    scenarioMY, updateScenarioMY, timelineMY, updateTimelineMY, reportMY, updateReportMY,
    report, updateReport, timeline, updateTimeline,
    importLog, showImportLog, toggleImportLog,
    actionLog, addActionLogEntry, removeActionLogEntry,
    branding, setBranding, clearBranding,
  };

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error('useDashboard must be used within DashboardProvider');
  return ctx;
}
