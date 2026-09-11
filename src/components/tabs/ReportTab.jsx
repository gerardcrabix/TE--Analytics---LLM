import { useMemo, useState } from 'react';
import { useDashboard } from '../../state/DashboardContext';
import { computeScenarioPlan, monthOptionsFor } from '../../lib/dashboardIndex';
import { computeReportExportData, generateReportPptx } from '../../lib/pptxReport';
import { Field, Select } from '../shared/Field';

export function ReportTab() {
  const { idx, geo, kol, reclass, saveReclass, report, updateReport, reportMY, updateReportMY, actionLog, branding } = useDashboard();
  const dash = idx.dash;
  const [pptxBusy, setPptxBusy] = useState(false);
  const [pptxError, setPptxError] = useState(null);

  const scenarios = reclass.scenarios || [];
  const yearsSet = useMemo(() => [...new Set(dash.months.map((m) => m.year))].sort((a, b) => a - b), [dash.months]);
  const monthOptionsReport = useMemo(() => monthOptionsFor(dash, reportMY.year), [dash, reportMY.year]);
  const reportYearValue = reportMY.year === 'all' ? 'all' : String(reportMY.year);
  const reportMonthValue = reportMY.month === 'all' ? 'all' : String(reportMY.month);
  const onReportYearChange = (e) => updateReportMY({ year: e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10) });
  const onReportMonthChange = (e) => updateReportMY({ month: e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10) });

  const reportScenario = report.scenarioId === 'current' ? null : scenarios.find((s) => s.id === report.scenarioId);
  const reportOverrides = reportScenario ? reportScenario.descOverrides : (reclass.descOverrides || {});

  const data = useMemo(() => computeReportExportData({ idx, geo, kol, reclass, report, reportMY, actionLog }),
    [idx, geo, kol, reclass, report, reportMY, actionLog]);

  const scenarioLabel = reportScenario ? `scénario "${reportScenario.name}"` : 'situation actuelle';
  const contractorsLabel = reclass.includeContractors ? 'contractors inclus' : 'contractors exclus';
  const reportSummaryText = `Sur le périmètre analysé (${scenarioLabel}, ${contractorsLabel}), le taux d'actifs Non-Operator est de ${data.rows[2].afterPct}% (${data.rows[2].afterActive}/${data.rows[2].after}) contre ${data.rows[2].beforePct}% sans reclassification, pour une cible de ${reclass.targetPct}%. Le taux Operator est de ${data.rows[1].afterPct}% et le taux global de ${data.rows[0].afterPct}%.`;

  const reportActionPlansRaw = useMemo(() => computeScenarioPlan(idx, reportOverrides, reclass.includeContractors, geo, kol.months, kol.minPrompts, reportMY),
    [idx, reportOverrides, reclass.includeContractors, geo, kol.months, kol.minPrompts, reportMY]);
  const reportActionPlans = reportActionPlansRaw.map((card) => ({
    ...card,
    actionsAnnotated: card.actions.map((text) => ({ text, done: actionLog.some((l) => l.scope && text.toLowerCase().includes(l.scope.toLowerCase())) })),
  }));

  const reportScenarioHistoryRows = [...scenarios].reverse().map((s) => ({
    name: s.name, targetPct: s.targetPct, contractorsLabel: s.includeContractors ? 'contractors inclus' : 'contractors exclus',
    dateLabel: new Date(s.date).toLocaleDateString('fr-FR'),
  }));

  const onGeneratePptx = async () => {
    setPptxBusy(true);
    setPptxError(null);
    try {
      await generateReportPptx(data, branding);
    } catch (err) {
      setPptxError(String((err && err.message) || err));
    } finally {
      setPptxBusy(false);
    }
  };

  const rowLabelFr = { All: 'Tous', Operator: 'Operator', 'Non-Operator': 'Non-Operator' };

  return (
    <div>
      <h1 className="h1-title">Rapport</h1>
      <p className="h1-sub">Synthèse Tous / Operator / Non-Operator, effet des reclassifications et du filtre contractors, plan d'action détaillé — exportable en .pptx.</p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end', marginBottom: 18, background: 'white', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
        <Field label="Scénario">
          <select value={report.scenarioId} onChange={(e) => updateReport({ scenarioId: e.target.value })} className="field-control" style={{ minWidth: 220 }}>
            <option value="current">Situation actuelle (mes reclassifications en cours)</option>
            {scenarios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Année">
          <Select value={reportYearValue} onChange={onReportYearChange}>
            <option value="all">Toutes</option>
            {yearsSet.map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
        </Field>
        <Field label="Mois">
          <Select value={reportMonthValue} onChange={onReportMonthChange}>
            <option value="all">Tous les mois</option>
            {monthOptionsReport.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, paddingBottom: 8 }}>
          <input type="checkbox" checked={reclass.includeContractors} onChange={(e) => saveReclass({ includeContractors: e.target.checked })} /> Inclure les Contractors
        </label>
        <div style={{ flex: 1 }} />
        <button onClick={onGeneratePptx} disabled={pptxBusy} style={{ padding: '10px 18px', borderRadius: 7, border: 'none', fontSize: 13, fontWeight: 700, cursor: pptxBusy ? 'default' : 'pointer', background: 'oklch(45% 0.15 300)', color: 'white', opacity: pptxBusy ? 0.7 : 1 }}>
          {pptxBusy ? 'Génération…' : 'Télécharger le rapport PPTx (EN)'}
        </button>
      </div>
      {pptxError && <div style={{ marginBottom: 14, padding: '10px 14px', background: 'oklch(94% 0.04 55)', color: 'oklch(35% 0.1 55)', borderRadius: 8, fontSize: 12.5 }}>Erreur export : {pptxError}</div>}

      <div style={{ background: 'oklch(97% 0.02 190)', border: '1px solid oklch(85% 0.03 190)', borderRadius: 12, padding: '16px 18px', marginBottom: 18, fontSize: 12.5, color: 'oklch(30% 0.06 190)', lineHeight: 1.7 }}>{reportSummaryText}</div>

      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Aperçu — avec / sans contractors (contenu inclus dans le PPTx)</div>
      <div className="card" style={{ padding: '12px 16px', marginBottom: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, fontSize: 12, fontWeight: 700, borderBottom: '1px solid var(--border)', paddingBottom: 6, marginBottom: 6 }}>
          <div>Population</div><div>Avec contractors</div><div>Sans contractors</div>
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, fontSize: 12.5, padding: '4px 0' }}>
            <div><b>{rowLabelFr[data.rowsWithoutContractors[i].label]}</b></div>
            <div>{data.rowsWithContractors[i].beforePct}%→{data.rowsWithContractors[i].afterPct}%</div>
            <div style={{ color: 'oklch(60% 0.15 40)', fontWeight: 700 }}>{data.rowsWithoutContractors[i].beforePct}%→{data.rowsWithoutContractors[i].afterPct}%</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Arbre de décomposition — Actuel vs Scénario, avec/sans contractors (images incluses dans le PPTx)</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
        <div className="card" style={{ padding: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>Global (toutes périodes) — sans contractors</div>
          <img src={data.treeGlobalWithout} style={{ width: '100%', display: 'block' }} alt="Arbre global sans contractors" />
        </div>
        <div className="card" style={{ padding: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>Global (toutes périodes) — avec contractors</div>
          <img src={data.treeGlobalWith} style={{ width: '100%', display: 'block' }} alt="Arbre global avec contractors" />
        </div>
        <div className="card" style={{ padding: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>{data.latestLabel} (dernier mois chargé) — sans contractors</div>
          <img src={data.treeLatestWithout} style={{ width: '100%', display: 'block' }} alt="Arbre dernier mois sans contractors" />
        </div>
        <div className="card" style={{ padding: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>{data.latestLabel} (dernier mois chargé) — avec contractors</div>
          <img src={data.treeLatestWith} style={{ width: '100%', display: 'block' }} alt="Arbre dernier mois avec contractors" />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 20 }}>
        {data.rows.map((r) => (
          <div key={r.label} className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>{rowLabelFr[r.label]}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>Sans reclassification</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{r.beforePct}% <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--muted-2)' }}>({r.beforeActive}/{r.before})</span></div>
            <div style={{ fontSize: 11, color: 'oklch(35% 0.06 190)' }}>Après reclassification</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'oklch(35% 0.06 190)' }}>{r.afterPct}% <span style={{ fontSize: 12, fontWeight: 600 }}>({r.afterActive}/{r.after})</span></div>
          </div>
        ))}
      </div>

      {[{ title: 'Cibles prioritaires par région', rows: data.breakdown.byRegion.slice(0, 6), colLabel: 'Région' },
        { title: 'Cibles prioritaires par domaine / fonction', rows: data.breakdown.byFunction.slice(0, 6), colLabel: 'Fonction' }].map((section) => (
        <div key={section.title}>
          <div style={{ fontSize: 13, fontWeight: 700, margin: '0 0 8px' }}>{section.title} <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 11.5 }}>(plus fort effectif, taux le plus bas — à traiter en premier)</span></div>
          <div className="card" style={{ overflow: 'hidden', marginBottom: 20 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr style={{ background: 'var(--panel)' }}>
                <th style={{ textAlign: 'left', padding: '8px 10px' }}>#</th>
                <th style={{ textAlign: 'left', padding: '8px 10px' }}>{section.colLabel}</th>
                <th style={{ textAlign: 'right', padding: '8px 10px' }}>Effectif actuel</th>
                <th style={{ textAlign: 'right', padding: '8px 10px' }}>Inactifs</th>
                <th style={{ textAlign: 'right', padding: '8px 10px' }}>Taux avant</th>
                <th style={{ textAlign: 'right', padding: '8px 10px' }}>Taux après</th>
                <th style={{ textAlign: 'right', padding: '8px 10px' }}>Mouvement</th>
              </tr></thead>
              <tbody>
                {section.rows.map((r) => (
                  <tr key={r.label} style={{ borderTop: '1px solid var(--row-border)' }}>
                    <td style={{ padding: '7px 10px' }}>{r.rank}</td>
                    <td style={{ padding: '7px 10px', fontWeight: 600 }}>
                      {r.label}
                      {r.isTop && <span style={{ fontSize: 9.5, fontWeight: 700, color: 'white', background: 'oklch(55% 0.15 40)', padding: '2px 6px', borderRadius: 5, marginLeft: 6 }}>CIBLE PRIORITAIRE</span>}
                    </td>
                    <td style={{ padding: '7px 10px', textAlign: 'right' }}>{r.beforeTotal}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right' }}>{r.inactive}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right' }}>{r.beforePct === null ? '—' : r.beforePct + '%'}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right' }}>{r.afterPct === null ? '—' : r.afterPct + '%'}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: 'oklch(35% 0.06 190)' }}>{r.netMovement >= 0 ? '+' : ''}{r.netMovement}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Plan d'action détaillé</div>
      {reportActionPlans.map((card) => (
        <div key={card.key} className="card" style={{ padding: '14px 16px', marginBottom: 10 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'oklch(30% 0.06 190)', marginBottom: 4 }}>{card.title}</div>
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 8 }}>{card.justification}</div>
          {card.actionsAnnotated.map((a, i) => (
            <div key={i} style={{ fontSize: 12, color: 'oklch(35% 0.01 60)', padding: '3px 0' }}>
              {a.done && <span style={{ color: 'var(--teal-dark)', fontWeight: 700 }}>✓ déjà en cours — </span>}
              {a.text}
            </div>
          ))}
        </div>
      ))}
      {reportActionPlans.length === 0 && <div style={{ fontSize: 12, color: 'var(--muted-2)', marginBottom: 20 }}>Aucun écart significatif détecté sur ce périmètre.</div>}

      <div style={{ fontSize: 14, fontWeight: 700, margin: '20px 0 10px' }}>Historique des scénarios sauvegardés</div>
      {reportScenarioHistoryRows.map((h, i) => (
        <div key={i} className="card" style={{ padding: '10px 16px', marginBottom: 8, fontSize: 12, display: 'flex', justifyContent: 'space-between' }}>
          <span><b>{h.name}</b> — cible {h.targetPct}%, {h.contractorsLabel}</span>
          <span style={{ color: 'var(--muted)' }}>{h.dateLabel}</span>
        </div>
      ))}
      {reportScenarioHistoryRows.length === 0 && <div style={{ fontSize: 12, color: 'var(--muted-2)' }}>Aucun scénario sauvegardé.</div>}
    </div>
  );
}
