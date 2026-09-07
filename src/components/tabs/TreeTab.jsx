import { useMemo, useState } from 'react';
import { useDashboard } from '../../state/DashboardContext';
import { useGeoOptions } from '../../hooks/useGeoOptions';
import { GeoFilterFields } from '../shared/GeoFilterFields';
import { Select } from '../shared/Field';
import { OrgTree } from '../OrgTree';
import { DomainTree } from '../DomainTree';
import {
  buildTree, collectJobDescIds, computeDomainTree, computeReclassAdvice, computeReclassInfo,
  findRoot, opStatusPillStyle,
} from '../../lib/dashboardIndex';

const OP_LABEL = { operator: 'Operator', nonOperator: 'Non-Operator' };

export function TreeTab() {
  const {
    idx, geo, updateGeo, kol, tree, updateTree, reclass, saveReclass, selectedEmailIdx,
    setDescOverride, forceSubtreeOverride, revertDescOverride, undoLastAction,
    saveScenario, restoreScenario, updateScenario, deleteScenario,
  } = useDashboard();
  const opts = useGeoOptions(idx, geo, updateGeo);
  const dash = idx.dash;
  const isDomain = tree.mode === 'domain';
  const [scenarioName, setScenarioName] = useState('');

  const rootId = tree.selectedUserId && idx.empByUserId.has(tree.selectedUserId) ? findRoot(idx, tree.selectedUserId, tree.level) : null;
  const treeData = useMemo(() => (rootId ? buildTree(idx, rootId, geo, kol.months, kol.minPrompts, reclass) : null),
    [idx, rootId, geo, kol.months, kol.minPrompts, reclass]);
  const selectedEmp = tree.selectedUserId ? idx.empByUserId.get(tree.selectedUserId) : null;
  const rootEmp = rootId ? idx.empByUserId.get(rootId) : null;
  const selectedEmpDetail = useMemo(() => {
    if (!selectedEmp) return null;
    const rec = selectedEmp[0] >= 0 ? idx.byEmail.get(selectedEmp[0]) : null;
    const latest = rec ? rec.latest : null;
    return {
      jobFamilyLabel: latest ? dash.dicts.jobFamilies[latest[5]] || null : null,
      jobDescLabel: latest ? dash.dicts.jobDescriptions[latest[12]] || null : null,
    };
  }, [selectedEmp, idx, dash]);

  const domainJobFunIdx = tree.domainJobFunIdx;
  const domainTree = useMemo(() => (isDomain && domainJobFunIdx !== null ? computeDomainTree(idx, domainJobFunIdx, geo, kol.months, reclass) : null),
    [isDomain, idx, domainJobFunIdx, geo, kol.months, reclass]);

  const hasScopeData = isDomain ? domainJobFunIdx !== null : !!treeData;
  const domainLabel = domainJobFunIdx === 'all' ? 'Tous les domaines' : domainJobFunIdx !== null ? dash.dicts.jobFunctions[domainJobFunIdx] || '—' : '—';
  const scopeStatsLabel = isDomain
    ? 'Domaine : ' + domainLabel
    : 'Sous ' + (rootEmp ? rootEmp[2] : selectedEmp ? selectedEmp[2] : '—');

  const scopeStats = useMemo(() => {
    if (!isDomain && treeData) {
      return { total: treeData.leafTotal, active: treeData.leafActive, inactive: treeData.leafInactive, activeOp: treeData.leafActiveOp, activeNonOp: treeData.leafActiveNonOp, inactiveOp: treeData.leafInactiveOp, inactiveNonOp: treeData.leafInactiveNonOp };
    }
    if (isDomain && domainTree) {
      return { total: domainTree.total, active: domainTree.active, inactive: domainTree.inactive, activeOp: domainTree.opActive, activeNonOp: domainTree.nonOpActive, inactiveOp: domainTree.opTotal - domainTree.opActive, inactiveNonOp: domainTree.nonOpTotal - domainTree.nonOpActive };
    }
    return null;
  }, [isDomain, treeData, domainTree]);

  const scopeFilter = useMemo(() => {
    if (isDomain) {
      if (domainJobFunIdx === null) return null;
      return (latest) => {
        if (domainJobFunIdx !== 'all' && latest[6] !== domainJobFunIdx) return false;
        if (geo.region !== 'all' && latest[3] !== geo.region) return false;
        if (geo.country !== 'all' && latest[2] !== geo.country) return false;
        if (geo.segment !== 'all' && latest[4] !== geo.segment) return false;
        if (geo.bu !== 'all' && latest[13] !== geo.bu) return false;
        if (geo.opStatus !== 'all' && latest[14] !== geo.opStatus) return false;
        return true;
      };
    }
    if (!treeData) return null;
    const scopeIds = new Set();
    const walk = (n) => { scopeIds.add(n.userId); (n.children || []).forEach(walk); };
    walk(treeData);
    return (latest, emailIdx, rec) => rec.emp && scopeIds.has(rec.emp[1]);
  }, [isDomain, domainJobFunIdx, geo, treeData]);

  const reclassInfo = useMemo(() => computeReclassInfo(idx, scopeFilter, geo, kol.months, reclass), [idx, scopeFilter, geo, kol.months, reclass]);
  const baselineInfo = useMemo(() => computeReclassInfo(idx, scopeFilter, geo, kol.months, reclass, true), [idx, scopeFilter, geo, kol.months, reclass]);

  const afterNonOpTotal = reclassInfo.nonOpTotal, afterNonOpActive = reclassInfo.nonOpActive;
  const afterNonOpPct = reclassInfo.nonOpTotal ? Math.round((reclassInfo.nonOpActive / reclassInfo.nonOpTotal) * 100) : 0;
  const beforeGlobalTotal = baselineInfo.total, beforeGlobalActive = baselineInfo.active;
  const beforeGlobalPct = beforeGlobalTotal ? Math.round((beforeGlobalActive / beforeGlobalTotal) * 100) : 0;
  const beforeNonOpTotal = baselineInfo.nonOpTotal, beforeNonOpActive = baselineInfo.nonOpActive;
  const beforeNonOpPct = beforeNonOpTotal ? Math.round((beforeNonOpActive / beforeNonOpTotal) * 100) : 0;
  const afterOpTotal = reclassInfo.opTotal, afterOpActive = reclassInfo.opActive;
  const afterOpPct = afterOpTotal ? Math.round((afterOpActive / afterOpTotal) * 100) : 0;
  const beforeOpTotal = baselineInfo.opTotal, beforeOpActive = baselineInfo.opActive;
  const beforeOpPct = beforeOpTotal ? Math.round((beforeOpActive / beforeOpTotal) * 100) : 0;
  const globalTotal = reclassInfo.total, globalActive = reclassInfo.active;
  const globalPct = globalTotal ? Math.round((globalActive / globalTotal) * 100) : 0;
  const nonOpGapAfter = reclass.targetPct - afterNonOpPct;
  const globalGap = reclass.targetPct - globalPct;
  const opGapAfter = reclass.targetPct - afterOpPct;
  const nonOpAfterColor = afterNonOpPct >= reclass.targetPct ? 'var(--teal-dark)' : 'var(--amber)';
  const globalColor = globalPct >= reclass.targetPct ? 'var(--teal-dark)' : 'var(--amber)';
  const opAfterColor = afterOpPct >= reclass.targetPct ? 'var(--teal-dark)' : 'var(--amber)';
  const nonOpTargetMet = afterNonOpPct >= reclass.targetPct;
  const reclassAdvice = hasScopeData ? computeReclassAdvice(idx, reclassInfo.byDesc, kol.minPrompts, kol.months) : null;

  const hasAnyDescOverride = Object.keys(reclass.descOverrides || {}).length > 0;
  const forcedTransfers = useMemo(() => Object.entries(reclass.descOverrides || {})
    .filter(([jobDescIdx]) => reclassInfo.byDesc.has(parseInt(jobDescIdx, 10)) || baselineInfo.byDesc.has(parseInt(jobDescIdx, 10)))
    .map(([jobDescIdx, status]) => {
      const id = parseInt(jobDescIdx, 10);
      const d = reclassInfo.byDesc.get(id) || baselineInfo.byDesc.get(id);
      const naturalStatus = d && d.nonOpTotal > 0 && d.total > 0 && d.total - d.nonOpTotal >= d.nonOpTotal ? 'operator' : 'nonOperator';
      return { name: dash.dicts.jobDescriptions[id] || '—', fromLabel: OP_LABEL[naturalStatus], toLabel: OP_LABEL[status], total: d ? d.total : 0, active: d ? d.active : 0 };
    }), [reclass.descOverrides, reclassInfo, baselineInfo, dash]);
  const forcingRecommendation = nonOpTargetMet
    ? `L'objectif de ${reclass.targetPct}% est atteint sur ce périmètre ; documentez ces forçages avant de les proposer en révision officielle du référentiel job description.`
    : `Il reste ${reclass.targetPct - afterNonOpPct} pt d'écart après forçage ; complétez soit par d'autres reclassifications, soit par une action d'activation (formation, communication) sur les job descriptions Non-Operator restants.`;

  const scenariosView = (reclass.scenarios || []).map((s) => ({
    id: s.id, name: s.name, count: Object.keys(s.descOverrides || {}).length,
    dateLabel: new Date(s.date).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
  }));

  // person search
  const searchQ = (tree.search || '').trim().toLowerCase();
  const anyGeoFilterActive = geo.region !== 'all' || geo.segment !== 'all' || geo.jobFunction !== 'all' || geo.bu !== 'all' || geo.country !== 'all';
  const matchedEmployees = useMemo(() => {
    if (isDomain || (searchQ.length < 2 && !anyGeoFilterActive)) return [];
    return dash.employees.filter((e) => {
      if (searchQ.length >= 2 && !(e[2] || '').toLowerCase().includes(searchQ)) return false;
      const rec = e[0] >= 0 ? idx.byEmail.get(e[0]) : null;
      const latest = rec ? rec.latest : null;
      if (!latest) return searchQ.length >= 2;
      if (geo.region !== 'all' && latest[3] !== geo.region) return false;
      if (geo.country !== 'all' && latest[2] !== geo.country) return false;
      if (geo.segment !== 'all' && latest[4] !== geo.segment) return false;
      if (geo.jobFunction !== 'all' && latest[6] !== geo.jobFunction) return false;
      if (geo.bu !== 'all' && latest[13] !== geo.bu) return false;
      return true;
    }).slice(0, 30);
  }, [isDomain, searchQ, anyGeoFilterActive, dash.employees, idx, geo]);

  const hasSelectedKolForTree = selectedEmailIdx !== null && idx.empByEmailIdx.has(selectedEmailIdx);

  const onForceSubtree = (node, status) => forceSubtreeOverride(collectJobDescIds(node), status);
  const onDomainChange = (e) => {
    const v = e.target.value;
    updateTree({ domainJobFunIdx: v === '' ? null : v === 'all' ? 'all' : parseInt(v, 10) });
  };

  return (
    <div>
      <h1 className="h1-title">Arbre managérial &amp; cartographie des métiers</h1>
      <p className="h1-sub">Partez d'une personne (ligne managériale) ou d'un domaine (job function) pour explorer les job description, corriger leur classification Operator/Non-Operator branche par branche, et voir l'impact sur la cible.</p>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, marginBottom: 24 }}>
        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            <button className={'btn' + (!isDomain ? ' btn-ghost-active' : '')} style={{ flex: 1 }} onClick={() => updateTree({ mode: 'person' })}>Personne</button>
            <button className={'btn' + (isDomain ? ' btn-ghost-active' : '')} style={{ flex: 1 }} onClick={() => updateTree({ mode: 'domain' })}>Domaine (métier)</button>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: 'oklch(35% 0.01 60)', marginBottom: 14, cursor: 'pointer' }}>
            <input type="checkbox" checked={reclass.includeContractors} onChange={(e) => saveReclass({ includeContractors: e.target.checked })} />
            Inclure les Contractors (décoché = exclus des statistiques)
          </label>

          {isDomain ? (
            <>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 10 }}>Domaine (job function)</div>
              <Select value={domainJobFunIdx === null ? '' : String(domainJobFunIdx)} onChange={onDomainChange} style={{ marginBottom: 10 }}>
                <option value="">Choisir un domaine…</option>
                <option value="all">TOUS les domaines</option>
                {opts.jobFunctionOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
              <div style={{ fontSize: 11.5, color: 'var(--muted-2)', lineHeight: 1.6, marginBottom: 12 }}>L'arbre affiche la hiérarchie Domaine → Job family → Job description, avec le statut Operator/Non-Operator de chaque branche.</div>
              <GeoFilterFields opts={opts} fields={['bu', 'region', 'country', 'segment', 'opStatus']} style={{ marginBottom: 6 }} />
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                <Select value={opts.geoYearValue} onChange={opts.onGeoYearChange}><option value="all">Toutes années</option>{opts.yearOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>
                <Select value={opts.geoMonthValue} onChange={opts.onGeoMonthChange}><option value="all">Tous les mois</option>{opts.monthOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>
              </div>
              {!idx.hasJobHierarchy && (
                <div style={{ marginTop: 10, padding: '8px 10px', background: 'var(--amber-bg)', color: 'var(--amber-dark)', borderRadius: 7, fontSize: 11, lineHeight: 1.5 }}>
                  Le détail Job family / Job description n'est pas encore chargé. Réimportez le fichier Usage (onglet Données) pour l'activer — en attendant, seul le total par domaine s'affiche.
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 10 }}>Filtrer / rechercher une personne</div>
              <GeoFilterFields opts={opts} fields={['bu', 'region', 'country', 'segment', 'jobFunction', 'opStatus']} style={{ marginBottom: 6 }} />
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                <Select value={opts.geoYearValue} onChange={opts.onGeoYearChange}><option value="all">Toutes années</option>{opts.yearOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>
                <Select value={opts.geoMonthValue} onChange={opts.onGeoMonthChange}><option value="all">Tous les mois</option>{opts.monthOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>
              </div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                <input type="text" value={tree.search} onChange={(e) => updateTree({ search: e.target.value })} placeholder="Nom…" className="field-control" style={{ flex: 1, minWidth: 0 }} />
                <button className="btn btn-primary" onClick={() => { if (matchedEmployees.length) updateTree({ selectedUserId: matchedEmployees[0][1] }); }}>Filtrer</button>
              </div>
              <div style={{ maxHeight: 220, overflow: 'auto', border: '1px solid var(--row-border)', borderRadius: 8, marginBottom: 10 }}>
                {matchedEmployees.map((e) => {
                  const rec = e[0] >= 0 ? idx.byEmail.get(e[0]) : null;
                  const pill = opStatusPillStyle(rec && rec.latest ? rec.latest[14] : null, 'sm');
                  return (
                    <div key={e[1]} onClick={() => updateTree({ selectedUserId: e[1] })} style={{ cursor: 'pointer', padding: '8px 10px', fontSize: 12.5, borderBottom: '1px solid var(--row-border)', background: e[1] === tree.selectedUserId ? 'var(--teal-bg)' : 'white' }}>
                      <div style={{ fontWeight: 600 }}>{e[2]}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <div style={{ fontSize: 11, color: 'var(--muted-2)' }}>{e[3]}</div>
                        <span style={pill.style}>{pill.label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {hasSelectedKolForTree && (
                <div onClick={() => updateTree({ selectedUserId: idx.empByEmailIdx.get(selectedEmailIdx)[1] })} style={{ cursor: 'pointer', fontSize: 11.5, padding: '8px 10px', background: 'var(--teal-bg)', borderRadius: 7, marginBottom: 10, color: 'var(--teal-text)', fontWeight: 600 }}>
                  Charger le KOL de la sphère d'influence : {idx.empByEmailIdx.get(selectedEmailIdx)[2]} →
                </div>
              )}
              <div style={{ height: 1, background: 'var(--border)', margin: '16px 0 14px' }} />
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>Niveau de remontée</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {[1, 2, 3].map((lvl) => (
                  <button key={lvl} className={'btn' + (tree.level === lvl ? ' btn-ghost-active' : '')} style={{ flex: 1 }} onClick={() => updateTree({ level: lvl })}>N+{lvl}</button>
                ))}
              </div>
              {selectedEmp && (
                <div style={{ marginTop: 16, padding: 12, background: 'var(--panel)', borderRadius: 8, fontSize: 12, lineHeight: 1.6 }}>
                  <b>{selectedEmp[2]}</b><br />
                  <span style={{ color: 'var(--muted)' }}>{selectedEmp[3]}</span><br />
                  {selectedEmpDetail?.jobFamilyLabel && <><span style={{ color: 'var(--muted)', fontSize: 11 }}>Job family : {selectedEmpDetail.jobFamilyLabel}</span><br /></>}
                  {selectedEmpDetail?.jobDescLabel && <><span style={{ color: 'var(--muted)', fontSize: 11 }}>Job description : {selectedEmpDetail.jobDescLabel}</span><br /></>}
                  Racine affichée : <b>{rootEmp ? rootEmp[2] : '—'}</b>
                </div>
              )}
            </>
          )}

          {scopeStats && (
            <div style={{ marginTop: 10, padding: 12, background: 'white', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11.5, lineHeight: 1.7 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>{scopeStatsLabel} ({scopeStats.total} pers.)</div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Actifs</span><b style={{ color: 'var(--teal-dark)' }}>{scopeStats.active}</b></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 10, color: 'var(--muted)' }}><span>· dont Operator</span><span>{scopeStats.activeOp}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 10, color: 'var(--muted)' }}><span>· dont Non-Operator</span><span>{scopeStats.activeNonOp}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}><span>Inactifs</span><b style={{ color: 'var(--amber)' }}>{scopeStats.inactive}</b></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 10, color: 'var(--muted)' }}><span>· dont Operator</span><span>{scopeStats.inactiveOp}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 10, color: 'var(--muted)' }}><span>· dont Non-Operator</span><span>{scopeStats.inactiveNonOp}</span></div>
            </div>
          )}

          <div style={{ marginTop: 16, display: 'flex', gap: 12, fontSize: 11, color: 'var(--muted)', flexWrap: 'wrap' }}>
            <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--teal)', marginRight: 4 }} />Engagé (≥ seuil KOL)</span>
            <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--amber)', marginRight: 4 }} />Usage faible</span>
            <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--gray-dot-2)', marginRight: 4 }} />Aucun usage</span>
          </div>
        </div>

        <div className="card" style={{ padding: 24, overflow: 'auto', minHeight: 500 }}>
          {isDomain ? (
            domainTree ? <DomainTree root={domainTree} onForce={setDescOverride} onRevert={revertDescOverride} /> : (
              <div style={{ textAlign: 'center', padding: 60, fontSize: 13, color: 'var(--muted-2)' }}>Choisissez un domaine (job function) pour afficher sa cartographie de métiers.</div>
            )
          ) : (
            treeData ? (
              <OrgTree root={treeData} onSelectRoot={(userId) => updateTree({ selectedUserId: userId, level: 0 })} onForceSubtree={onForceSubtree} />
            ) : (
              <div style={{ textAlign: 'center', padding: 60, fontSize: 13, color: 'var(--muted-2)' }}>Sélectionnez une personne pour afficher son arbre managérial.</div>
            )
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>Taux d'actifs — Non-Operators ({scopeStatsLabel})</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {!!reclass.lastAction && <span onClick={undoLastAction} style={{ cursor: 'pointer', fontSize: 11, color: 'var(--purple)', fontWeight: 600 }}>↩ Revenir à la dernière sélection</span>}
              {hasAnyDescOverride && <span onClick={() => saveReclass({ descOverrides: {} })} style={{ cursor: 'pointer', fontSize: 11, color: 'oklch(55% 0.15 25)', fontWeight: 600 }}>↺ Revenir à la situation d'origine</span>}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>Cible</span>
                <input type="number" min={0} max={100} value={reclass.targetPct} onChange={(e) => saveReclass({ targetPct: parseInt(e.target.value, 10) || 0 })} className="field-control" style={{ width: 52, padding: '5px 6px' }} />
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>%</span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, marginBottom: 2 }}><span>Taux actuel</span><b style={{ color: nonOpAfterColor }}>{afterNonOpPct}%</b></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--muted)', marginBottom: 10 }}><span>Effectif Non-Op</span><span>{afterNonOpTotal}</span></div>
          <div style={{ height: 1, background: 'var(--border)', marginBottom: 10 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--muted)' }}><span>Écart vs cible {reclass.targetPct}%</span><span>{nonOpGapAfter} pt</span></div>
        </div>
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>Taux d'actifs — Operators ({scopeStatsLabel})</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, marginBottom: 2 }}><span>Taux actuel</span><b style={{ color: opAfterColor }}>{afterOpPct}%</b></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--muted)', marginBottom: 10 }}><span>Actifs / Effectif Operator</span><span>{afterOpActive} / {afterOpTotal}</span></div>
          <div style={{ height: 1, background: 'var(--border)', marginBottom: 10 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--muted)' }}><span>Écart vs cible {reclass.targetPct}%</span><span>{opGapAfter} pt</span></div>
        </div>
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>Taux d'actifs — Global (tous statuts, {scopeStatsLabel})</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, marginBottom: 2 }}><span>Taux actuel</span><b style={{ color: globalColor }}>{globalPct}%</b></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--muted)', marginBottom: 10 }}><span>Actifs / Effectif</span><span>{globalActive} / {globalTotal}</span></div>
          <div style={{ height: 1, background: 'var(--border)', marginBottom: 10 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--muted)' }}><span>Écart vs cible {reclass.targetPct}%</span><span>{globalGap} pt</span></div>
        </div>
      </div>

      {reclassAdvice && (
        <div style={{ background: 'oklch(97% 0.02 190)', border: '1px solid oklch(85% 0.03 190)', borderRadius: 12, padding: 18 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 10, color: 'oklch(30% 0.06 190)' }}>Plan d'action pour atteindre {reclass.targetPct}%</div>
          {nonOpTargetMet ? (
            <div style={{ fontSize: 12, color: 'oklch(35% 0.06 190)' }}>La cible est déjà atteinte sur ce périmètre ({afterNonOpPct}%).</div>
          ) : (
            <div style={{ fontSize: 12, color: 'oklch(30% 0.05 190)', lineHeight: 1.7 }}>
              Job description le plus contributeur à l'écart : <b>{dash.dicts.jobDescriptions[reclassAdvice.jobDescIdx] || '—'}</b> — {reclassAdvice.inactiveCount} inactif(s) sur {reclassAdvice.poolTotal} Non-Operators ({reclassAdvice.poolActivePct}% actifs).<br />
              Deux leviers : reclasser cette branche si elle est en fait Operator (bouton sur le nœud dans l'arbre ci-dessus), ou activer les personnes en place via une formation ciblée.<br />
              KOL(s) déjà identifié(s) sur ce job description (onglet KOL &amp; influence) : <b>{reclassAdvice.kolCount > 0 ? reclassAdvice.kolNames.join(', ') + (reclassAdvice.kolCount > 3 ? ` (+${reclassAdvice.kolCount - 3} autres)` : '') : "aucun KOL identifié avec les seuils actuels de l'onglet KOL"}</b>. Appuyez-vous sur eux pour animer la formation.<br />
              <span onClick={() => updateTree({ mode: 'domain', domainJobFunIdx: reclassAdvice.jobFunIdx })} style={{ cursor: 'pointer', color: 'var(--purple)', fontWeight: 600, textDecoration: 'underline' }}>→ Voir ce domaine dans la cartographie ci-dessus</span>
            </div>
          )}
        </div>
      )}

      {hasAnyDescOverride && (
        <div className="card" style={{ padding: 18, marginTop: 14 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 12 }}>Récapitulatif des forçages ({scopeStatsLabel})</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div style={{ padding: 12, background: 'var(--panel)', borderRadius: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'oklch(35% 0.01 60)', marginBottom: 8 }}>Avant forçage</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>Actifs / Population totale</div>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{beforeGlobalActive} / {beforeGlobalTotal} <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted-2)' }}>({beforeGlobalPct}%)</span></div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>Actifs Non-Op / Population Non-Op</div>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{beforeNonOpActive} / {beforeNonOpTotal} <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted-2)' }}>({beforeNonOpPct}%)</span></div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>Actifs Operator / Population Operator</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{beforeOpActive} / {beforeOpTotal} <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted-2)' }}>({beforeOpPct}%)</span></div>
            </div>
            <div style={{ padding: 12, background: 'oklch(97% 0.02 190)', borderRadius: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'oklch(35% 0.06 190)', marginBottom: 8 }}>Après forçage</div>
              <div style={{ fontSize: 11, color: 'oklch(35% 0.06 190)' }}>Actifs / Population totale</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'oklch(35% 0.06 190)', marginBottom: 6 }}>{globalActive} / {globalTotal} <span style={{ fontSize: 12, fontWeight: 600 }}>({globalPct}%)</span></div>
              <div style={{ fontSize: 11, color: 'oklch(35% 0.06 190)' }}>Actifs Non-Op / Population Non-Op</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'oklch(35% 0.06 190)', marginBottom: 6 }}>{afterNonOpActive} / {afterNonOpTotal} <span style={{ fontSize: 12, fontWeight: 600 }}>({afterNonOpPct}%)</span></div>
              <div style={{ fontSize: 11, color: 'oklch(35% 0.06 190)' }}>Actifs Operator / Population Operator</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'oklch(35% 0.06 190)' }}>{afterOpActive} / {afterOpTotal} <span style={{ fontSize: 12, fontWeight: 600 }}>({afterOpPct}%)</span></div>
            </div>
          </div>
          <div style={{ fontSize: 11.5, fontWeight: 700, marginBottom: 6 }}>Transferts entre catégories</div>
          <div style={{ maxHeight: 160, overflow: 'auto', marginBottom: 12 }}>
            {forcedTransfers.map((t, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 11.5, padding: '6px 0', borderBottom: '1px solid var(--row-border)' }}>
                <span>{t.name} — {t.fromLabel} → {t.toLabel}</span>
                <span style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{t.total} pers. ({t.active} actifs)</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11.5, lineHeight: 1.7, color: 'oklch(30% 0.01 60)' }}>
            <b>Effet sur les stats :</b> Non-Operators actifs {beforeNonOpActive}/{beforeNonOpTotal} ({beforeNonOpPct}%) → {afterNonOpActive}/{afterNonOpTotal} ({afterNonOpPct}%) ; global actifs {beforeGlobalActive}/{beforeGlobalTotal} ({beforeGlobalPct}%) → {globalActive}/{globalTotal} ({globalPct}%).<br />
            <b>Recommandation :</b> {forcingRecommendation}
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 18, marginTop: 14 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 10 }}>Scénarios de reclassification</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <input type="text" value={scenarioName} onChange={(e) => setScenarioName(e.target.value)} placeholder="Nom du scénario…" className="field-control" style={{ flex: 1, minWidth: 0 }} />
          <button className="btn btn-primary" onClick={() => { saveScenario(scenarioName); setScenarioName(''); }}>Sauvegarder</button>
        </div>
        {scenariosView.length === 0 ? (
          <div style={{ fontSize: 11.5, color: 'var(--muted-2)' }}>Aucun scénario sauvegardé.</div>
        ) : (
          scenariosView.map((s) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 10px', borderBottom: '1px solid var(--row-border)', fontSize: 12 }}>
              <div>
                <div style={{ fontWeight: 600 }}>{s.name}</div>
                <div style={{ fontSize: 10.5, color: 'var(--muted-2)' }}>{s.dateLabel} — {s.count} forçage(s)</div>
              </div>
              <div style={{ display: 'flex', gap: 6, flex: 'none' }}>
                <button onClick={() => restoreScenario(s.id)} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--purple)', background: 'white', color: 'var(--purple)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Reprendre</button>
                <button onClick={() => updateScenario(s.id)} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--teal)', background: 'white', color: 'var(--teal-dark)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Mettre à jour</button>
                <button onClick={() => deleteScenario(s.id)} style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid oklch(75% 0.01 60)', background: 'white', color: 'oklch(50% 0.01 60)', fontSize: 11, cursor: 'pointer' }}>✕</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
