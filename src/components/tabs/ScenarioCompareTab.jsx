import { useMemo } from 'react';
import { useDashboard } from '../../state/DashboardContext';
import { useGeoOptions } from '../../hooks/useGeoOptions';
import { GeoFilterFields } from '../shared/GeoFilterFields';
import { Field, Select } from '../shared/Field';
import { computeReclassInfo, computeScenarioPlan, monthOptionsFor } from '../../lib/dashboardIndex';

const OP_LABEL = { operator: 'Operator', nonOperator: 'Non-Operator' };
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const CURRENT_SCENARIO = { id: 'current', name: 'Situation actuelle', descOverrides: {} };

export function ScenarioCompareTab() {
  const { idx, geo, updateGeo, kol, reclass, saveReclass, scenarioCompare, updateScenarioCompare, scenarioMY, updateScenarioMY } = useDashboard();
  const opts = useGeoOptions(idx, geo, updateGeo);
  const dash = idx.dash;
  const scenarios = reclass.scenarios || [];

  const scenarioMonthOptions = useMemo(() => monthOptionsFor(idx.dash, scenarioMY.year), [idx.dash, scenarioMY.year]);
  const scenarioYearValue = scenarioMY.year === 'all' ? 'all' : String(scenarioMY.year);
  const scenarioMonthValue = scenarioMY.month === 'all' ? 'all' : String(scenarioMY.month);
  const onScenarioYearChange = (e) => updateScenarioMY({ year: e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10) });
  const onScenarioMonthChange = (e) => updateScenarioMY({ month: e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10) });

  const scopeFilter = useMemo(() => (latest) => {
    if (geo.region !== 'all' && latest[3] !== geo.region) return false;
    if (geo.country !== 'all' && latest[2] !== geo.country) return false;
    if (geo.segment !== 'all' && latest[4] !== geo.segment) return false;
    if (geo.jobFunction !== 'all' && latest[6] !== geo.jobFunction) return false;
    if (geo.bu !== 'all' && latest[13] !== geo.bu) return false;
    return true;
  }, [geo]);

  const planScenario = scenarioCompare.planId === 'current' ? { name: 'Situation actuelle' } : scenarios.find((s) => s.id === scenarioCompare.planId);
  const planOverrides = scenarioCompare.planId === 'current' ? reclass.descOverrides || {} : planScenario ? planScenario.descOverrides : null;
  const scenarioActionPlans = useMemo(
    () => (planOverrides ? computeScenarioPlan(idx, planOverrides, reclass.includeContractors, geo, kol.months, kol.minPrompts, scenarioMY) : []),
    [idx, planOverrides, reclass.includeContractors, geo, kol.months, kol.minPrompts, scenarioMY]
  );

  const scenarioA = scenarioCompare.aId === 'current' ? CURRENT_SCENARIO : scenarios.find((s) => s.id === scenarioCompare.aId);
  const scenarioB = scenarioCompare.bId === 'current' ? CURRENT_SCENARIO : scenarios.find((s) => s.id === scenarioCompare.bId);
  const hasComparison = !!(scenarioA && scenarioB);

  const compare = useMemo(() => {
    if (!hasComparison) return null;
    const infoA = computeReclassInfo(idx, scopeFilter, geo, kol.months, { includeContractors: reclass.includeContractors, descOverrides: scenarioA.descOverrides }, scenarioA.id === 'current', scenarioA.descOverrides, scenarioMY);
    const infoB = computeReclassInfo(idx, scopeFilter, geo, kol.months, { includeContractors: reclass.includeContractors, descOverrides: scenarioB.descOverrides }, scenarioB.id === 'current', scenarioB.descOverrides, scenarioMY);
    const allIds = new Set([...Object.keys(scenarioA.descOverrides || {}), ...Object.keys(scenarioB.descOverrides || {})]);
    const diffs = [...allIds]
      .filter((id) => (scenarioA.descOverrides[id] || null) !== (scenarioB.descOverrides[id] || null))
      .map((id) => ({
        name: dash.dicts.jobDescriptions[id] || '—',
        aLabel: OP_LABEL[scenarioA.descOverrides[id]] || 'Origine',
        bLabel: OP_LABEL[scenarioB.descOverrides[id]] || 'Origine',
      }));
    const toOperator = diffs.filter((d) => d.bLabel === 'Operator').length;
    const toNonOperator = diffs.filter((d) => d.bLabel === 'Non-Operator').length;
    const nonOpPctDelta = pct(infoB.nonOpActive, infoB.nonOpTotal) - pct(infoA.nonOpActive, infoA.nonOpTotal);
    const globalPctDelta = pct(infoB.active, infoB.total) - pct(infoA.active, infoA.total);
    const comment = `${scenarioB.name} diffère de ${scenarioA.name} par ${diffs.length} reclassification(s) de job description. Le taux d'actifs Non-Operator passe de ${pct(infoA.nonOpActive, infoA.nonOpTotal)}% à ${pct(infoB.nonOpActive, infoB.nonOpTotal)}% (${nonOpPctDelta >= 0 ? '+' : ''}${nonOpPctDelta} pt), et le taux global de ${pct(infoA.active, infoA.total)}% à ${pct(infoB.active, infoB.total)}% (${globalPctDelta >= 0 ? '+' : ''}${globalPctDelta} pt).`;
    const actionNonOp = toNonOperator > 0
      ? `${toNonOperator} job description(s) supplémentaire(s) reclassé(s) en Non-Operator dans ${scenarioB.name} — vérifiez que l'effectif concerné reçoit bien un plan d'activation (formation, communication) pour ne pas dégrader le taux Non-Operator.`
      : "Aucun reclassement supplémentaire vers Non-Operator.";
    const actionOp = toOperator > 0
      ? `${toOperator} job description(s) reclassé(s) en Operator dans ${scenarioB.name} — confirmez ce changement avec les managers concernés avant de le faire remonter au référentiel officiel.`
      : "Aucun reclassement supplémentaire vers Operator.";
    return { infoA, infoB, diffs, comment, actionNonOp, actionOp };
  }, [hasComparison, idx, scopeFilter, geo, kol.months, reclass.includeContractors, scenarioA, scenarioB, scenarioMY, dash]);

  return (
    <div>
      <h1 className="h1-title">Comparer 2 scénarios</h1>
      <p className="h1-sub">Comparez la situation actuelle (sans reclassification) ou deux scénarios sauvegardés, sur un périmètre filtré.</p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <Field label="Année">
          <Select value={scenarioYearValue} onChange={onScenarioYearChange} style={{ minWidth: 100 }}>
            <option value="all">Toutes années</option>
            {opts.yearOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>
        <Field label="Mois">
          <Select value={scenarioMonthValue} onChange={onScenarioMonthChange} style={{ minWidth: 140 }}>
            <option value="all">Tous les mois (cumul)</option>
            {scenarioMonthOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>
        <GeoFilterFields opts={opts} fields={['bu', 'region', 'country', 'segment', 'jobFunction']} />
        <Field label="">
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={reclass.includeContractors} onChange={(e) => saveReclass({ includeContractors: e.target.checked })} />
            Inclure les Contractors
          </label>
        </Field>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
        <select value={scenarioCompare.aId} onChange={(e) => updateScenarioCompare({ aId: e.target.value })} className="field-control" style={{ width: '100%' }}>
          <option value="">Scénario A…</option>
          <option value="current">Situation actuelle (sans reclassification)</option>
          {scenarios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={scenarioCompare.bId} onChange={(e) => updateScenarioCompare({ bId: e.target.value })} className="field-control" style={{ width: '100%' }}>
          <option value="">Scénario B…</option>
          {scenarios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      <div className="card" style={{ padding: 18, marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13.5, fontWeight: 700 }}>Plan d'action pour un scénario</div>
          <select value={scenarioCompare.planId} onChange={(e) => updateScenarioCompare({ planId: e.target.value })} className="field-control" style={{ minWidth: 220 }}>
            <option value="">Choisir un scénario…</option>
            <option value="current">Situation actuelle (non sauvegardée)</option>
            {scenarios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        {planOverrides ? (
          <>
            <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '6px 0 14px' }}>Recommandations activables pour <b>{planScenario?.name}</b>, classées par levier, avec justification chiffrée.</p>
            {scenarioActionPlans.map((card) => (
              <div key={card.key} style={{ background: 'var(--panel)', borderRadius: 10, padding: '14px 16px', marginBottom: 10 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'oklch(30% 0.06 190)', marginBottom: 4 }}>{card.title}</div>
                <div style={{ fontSize: 11.5, color: 'oklch(45% 0.01 60)', marginBottom: 8, lineHeight: 1.5 }}>{card.justification}</div>
                {card.actions.map((a, i) => (
                  <div key={i} style={{ fontSize: 12, color: 'oklch(30% 0.01 60)', lineHeight: 1.6, paddingLeft: 14, position: 'relative', marginBottom: 4 }}>
                    <span style={{ position: 'absolute', left: 0 }}>→</span>{a}
                  </div>
                ))}
              </div>
            ))}
            {scenarioActionPlans.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--muted-2)' }}>Aucun écart significatif détecté sur ce scénario : les Non-Operators inactifs sont marginaux ou déjà couverts.</div>
            )}
          </>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--muted-2)' }}>Sélectionnez un scénario (ou la situation actuelle) pour générer un plan d'action.</div>
        )}
      </div>

      {!hasComparison ? (
        <div style={{ textAlign: 'center', padding: 60, fontSize: 13, color: 'var(--muted-2)' }}>Choisissez deux scénarios à comparer.</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div className="card" style={{ padding: 18 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 10 }}>{scenarioA.name}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>Actifs / Population totale</div>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{compare.infoA.active} / {compare.infoA.total} ({pct(compare.infoA.active, compare.infoA.total)}%)</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>Actifs Non-Op / Population Non-Op</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{compare.infoA.nonOpActive} / {compare.infoA.nonOpTotal} ({pct(compare.infoA.nonOpActive, compare.infoA.nonOpTotal)}%)</div>
            </div>
            <div className="card" style={{ padding: 18 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 10 }}>{scenarioB.name}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>Actifs / Population totale</div>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{compare.infoB.active} / {compare.infoB.total} ({pct(compare.infoB.active, compare.infoB.total)}%)</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>Actifs Non-Op / Population Non-Op</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{compare.infoB.nonOpActive} / {compare.infoB.nonOpTotal} ({pct(compare.infoB.nonOpActive, compare.infoB.nonOpTotal)}%)</div>
            </div>
          </div>

          <div className="card" style={{ padding: 18, marginBottom: 14 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 10 }}>Différences de classification ({compare.diffs.length})</div>
            {compare.diffs.length === 0 ? (
              <div style={{ fontSize: 11.5, color: 'var(--muted-2)' }}>Aucune différence de forçage entre les deux scénarios.</div>
            ) : (
              compare.diffs.map((d, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 11.5, padding: '6px 0', borderBottom: '1px solid var(--row-border)' }}>
                  <span>{d.name}</span>
                  <span style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{d.aLabel} → {d.bLabel}</span>
                </div>
              ))
            )}
          </div>

          <div style={{ background: 'oklch(97% 0.02 190)', border: '1px solid oklch(85% 0.03 190)', borderRadius: 12, padding: 18 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 10, color: 'oklch(30% 0.06 190)' }}>Commentaire et plan d'action différencié</div>
            <div style={{ fontSize: 12, color: 'oklch(30% 0.05 190)', lineHeight: 1.7 }}>
              {compare.comment}<br /><br />
              <b>Côté Non-Operator :</b> {compare.actionNonOp}<br />
              <b>Côté Operator :</b> {compare.actionOp}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
