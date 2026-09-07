import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createEmptyDash, isDashEmpty } from '../lib/dataModel';
import { buildIndex } from '../lib/dashboardIndex';
import { importUsageFile, importEmployeesFile, datasetSummary } from '../lib/xlsxImport';
import { KEYS, loadJSON, saveJSON, removeKey } from '../lib/storage';

const DEFAULT_GEO = {
  month: 'all', year: 'all', region: 'all', country: 'all', segment: 'all', jobFunction: 'all',
  bu: 'all', operator: 'all', opStatus: 'all', metric: 'activeShare', sizeMetric: 'headcount',
  sortBy: 'share', sortDir: 'desc', view: 'globe',
};
const DEFAULT_KOL = { minPrompts: 100, months: 3, requireSameTeam: true, requireSameGeo: false, lowThreshold: 5, sortBy: 'sum', sortDir: 'desc' };
const DEFAULT_TREE = { level: 1, search: '', selectedUserId: null, mode: 'person', domainJobFunIdx: null };
const DEFAULT_RECLASS = { descOverrides: {}, targetPct: 80, includeContractors: true };
const DEFAULT_PIVOT = { dims: ['year', 'month', 'opStatus'], expanded: [] };

const DashboardContext = createContext(null);

export function DashboardProvider({ children }) {
  const [dash, setDash] = useState(() => loadJSON(KEYS.data, null) || createEmptyDash());
  const [tab, setTab] = useState('geo');
  const [geo, setGeo] = useState(DEFAULT_GEO);
  const [kol, setKol] = useState(DEFAULT_KOL);
  const [tree, setTree] = useState(DEFAULT_TREE);
  const [pivot, setPivot] = useState(DEFAULT_PIVOT);
  const [reclass, setReclass] = useState(() => ({ ...DEFAULT_RECLASS, ...loadJSON(KEYS.reclass, {}) }));
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
