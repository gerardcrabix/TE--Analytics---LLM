import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createEmptyDash, isDashEmpty } from '../lib/dataModel';
import { buildIndex } from '../lib/dashboardIndex';
import { importUsageFile, importEmployeesFile, datasetSummary, parseScenarioXlsxFile, matchScenarioImportRows } from '../lib/xlsxImport';
import { KEYS, loadJSON, saveJSON, removeKey } from '../lib/storage';

const DEFAULT_GEO = {
  month: 'all', year: 'all', region: 'all', country: 'all', segment: 'all', jobFunction: 'all',
  bu: 'all', operator: 'all', opStatus: 'all', metric: 'activeShare', sizeMetric: 'headcount',
  sortBy: 'share', sortDir: 'desc', view: 'globe',
};
const DEFAULT_KOL = { minPrompts: 100, months: 3, requireSameTeam: true, requireSameGeo: false, lowThreshold: 5, sortBy: 'sum', sortDir: 'desc' };
const DEFAULT_TREE = { level: 1, search: '', selectedUserId: null, mode: 'person', domainJobFunIdx: null };
const DEFAULT_RECLASS = { descOverrides: {}, targetPct: 80, includeContractors: true, lastAction: null, scenarios: [], newScenarioName: '', pendingImport: null };
const DEFAULT_PIVOT = { dims: ['year', 'month', 'opStatus'], expanded: [] };
const DEFAULT_SCENARIO_COMPARE = { aId: '', bId: '', planId: '' };

const DashboardContext = createContext(null);

export function DashboardProvider({ children }) {
  const [dash, setDash] = useState(() => loadJSON(KEYS.data, null) || createEmptyDash());
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

  const idx = useMemo(() => buildIndex(dash), [dash]);

  useEffect(() => { saveJSON(KEYS.data, dash); }, [dash]);
  useEffect(() => { saveJSON(KEYS.reclass, reclass); }, [reclass]);

  const updateGeo = useCallback((patch) => setGeo((g) => ({ ...g, ...(typeof patch === 'function' ? patch(g) : patch) })), []);
  const updateKol = useCallback((patch) => setKol((k) => ({ ...k, ...patch })), []);
  const updateTree = useCallback((patch) => setTree((t) => ({ ...t, ...patch })), []);
  const saveReclass = useCallback((patch) => setReclass((r) => ({ ...r, ...patch })), []);
  const updatePivot = useCallback((patch) => setPivot((p) => ({ ...p, ...(typeof patch === 'function' ? patch(p) : patch) })), []);
  const updateScenarioCompare = useCallback((patch) => setScenarioCompare((s) => ({ ...s, ...patch })), []);

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
    const { descOverrides, count, unmatched } = matchScenarioImportRows(rows, dash);
    setReclass((r) => ({ ...r, pendingImport: { name, descOverrides, count, unmatched } }));
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
    try {
      const prevSummary = datasetSummary(dash);
      let nextDash = dash;
      let usageAdded = 0, usageUpdated = 0, newMonths = [];
      if (usageFile) {
        const r = await importUsageFile(usageFile, nextDash);
        nextDash = r.dash; usageAdded = r.usageAdded; usageUpdated = r.usageUpdated; newMonths = r.newMonths;
      }
      let employeesReplaced = false, employeesCount = nextDash.employees.length;
      if (employeesFile) {
        const r = await importEmployeesFile(employeesFile, nextDash);
        nextDash = r.dash; employeesReplaced = true; employeesCount = r.employeesCount;
      }
      setDash(nextDash);
      const entry = { ts: Date.now(), usageAdded, usageUpdated, newMonths, employeesReplaced, employeesCount, prevSummary };
      setDataHistory((h) => {
        const next = [...h, entry];
        saveJSON(KEYS.dataHistory, next);
        return next;
      });
      const msg = `Import réussi : ${usageAdded} nouvelle(s) ligne(s) d'usage, ${usageUpdated} mise(s) à jour${newMonths.length ? ', nouveaux mois : ' + newMonths.join(', ') : ''}${employeesReplaced ? ', référentiel employés remplacé (' + employeesCount + ' personnes)' : ''}.`;
      setDataMsg({ busy: false, message: msg, error: null });
    } catch (e) {
      setDataMsg({ busy: false, message: null, error: String((e && e.message) || e) });
    }
  }, [dash]);

  const resetData = useCallback(() => {
    removeKey(KEYS.data);
    removeKey(KEYS.dataHistory);
    setDash(createEmptyDash());
    setDataHistory([]);
    setDataMsg({ busy: false, message: 'Données réinitialisées.', error: null });
  }, []);

  const pushRecoEntry = useCallback((entry) => {
    setRecoHistory((h) => {
      const next = [...h, entry];
      saveJSON(KEYS.recommendations, next);
      return next;
    });
  }, []);

  const value = {
    dash, idx, hasData: !isDashEmpty(dash),
    tab, setTab,
    geo, updateGeo, kol, updateKol, tree, updateTree,
    reclass, saveReclass, pivot, updatePivot,
    scenarioCompare, updateScenarioCompare,
    setDescOverride, forceSubtreeOverride, revertDescOverride, undoLastAction,
    saveScenario, restoreScenario, updateScenario, deleteScenario,
    importScenarioFile, confirmImportAsNew, confirmImportOverwrite, cancelImport,
    selectedEmailIdx, setSelectedEmailIdx, hoverCountryIdx, setHoverCountryIdx, pinnedCountryIdx, setPinnedCountryIdx,
    dataMsg, dataHistory, runImport, resetData,
    recoHistory, pushRecoEntry,
  };

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error('useDashboard must be used within DashboardProvider');
  return ctx;
}
