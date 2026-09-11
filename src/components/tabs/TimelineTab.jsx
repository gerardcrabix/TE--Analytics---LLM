import { useMemo } from 'react';
import { useDashboard } from '../../state/DashboardContext';
import { useGeoOptions } from '../../hooks/useGeoOptions';
import { GeoFilterFields } from '../shared/GeoFilterFields';
import { Field, Select } from '../shared/Field';
import { buildLineChart, computeMonthStats, monthOptionsFor } from '../../lib/dashboardIndex';

/** Renders one of the 4 timeline charts: an SVG polyline (current, and
 * optionally a dashed scenario line) over absolutely-positioned grid lines
 * and per-point value labels — the same geometry `buildLineChart` computes
 * for every chart on this tab. */
function TimelineChart({ chart, curColor, curLabelColor, scColor, scLabelColor, showScenario, leftMargin = 30 }) {
  if (chart.empty) return <div style={{ textAlign: 'center', padding: 40, fontSize: 13, color: 'var(--muted-2)' }}>Aucune donnée pour ce périmètre.</div>;
  return (
    <div style={{ position: 'relative', height: 220, margin: `0 0 34px ${leftMargin}px` }}>
      <svg viewBox={`0 0 ${chart.chartW} ${chart.chartH}`} preserveAspectRatio="none" style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: 220, overflow: 'visible' }}>
        <polyline points={chart.curLine} fill="none" stroke={curColor} strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
        {showScenario && <polyline points={chart.scLine} fill="none" stroke={scColor} strokeWidth={2.5} strokeDasharray="6,4" vectorEffect="non-scaling-stroke" />}
      </svg>
      {chart.gridLines.map((gl, i) => (
        <div key={'g' + i} style={{ position: 'absolute', left: -leftMargin, right: 0, top: gl.topPx }}>
          <span style={{ position: 'absolute', left: 0, top: 0, transform: 'translateY(-50%)', fontSize: 10, color: '#8b8784', width: leftMargin - 4, textAlign: 'right' }}>{gl.label}</span>
          <div style={{ position: 'absolute', left: leftMargin, right: 0, top: 0, height: 1, background: '#e7e4e1' }} />
        </div>
      ))}
      {chart.dots.map((d, i) => (
        <div key={'d' + i} style={{ position: 'absolute', left: d.leftPct + '%', top: d.topPx }}>
          <div title={d.hoverTitle} style={{ position: 'absolute', left: 0, top: 0, transform: 'translate(-50%,-50%)', width: 9, height: 9, borderRadius: '50%', background: curColor }} />
          <div style={{ position: 'absolute', left: 0, top: d.labelOffset, transform: 'translateX(-50%)', fontSize: 9.5, fontWeight: 700, color: curLabelColor, whiteSpace: 'nowrap' }}>{d.valueLabel}</div>
        </div>
      ))}
      {chart.dots.map((d, i) => (
        <div key={'t' + i} style={{ position: 'absolute', left: d.leftPct + '%', top: 228, transform: 'translateX(-50%)', fontSize: 9, color: '#787470', whiteSpace: 'nowrap' }}>{d.tickLabel}</div>
      ))}
      {showScenario && chart.scDots.map((d, i) => (
        <div key={'s' + i} style={{ position: 'absolute', left: d.leftPct + '%', top: d.topPx }}>
          <div title={d.hoverTitle} style={{ position: 'absolute', left: 0, top: 0, transform: 'translate(-50%,-50%)', width: 9, height: 9, borderRadius: '50%', background: scColor }} />
          <div style={{ position: 'absolute', left: 0, top: d.labelOffset, transform: 'translateX(-50%)', fontSize: 9.5, fontWeight: 700, color: scLabelColor, whiteSpace: 'nowrap' }}>{d.valueLabel}</div>
        </div>
      ))}
    </div>
  );
}

const CUR_COLOR = '#2f8fa0', CUR_LABEL = '#1c6875';
const SC_COLOR = '#6c4fb5', SC_LABEL = '#4b3684';
const GAP_COLOR = '#c15a3a', GAP_LABEL = '#8a3f27';

export function TimelineTab() {
  const { idx, geo, updateGeo, reclass, saveReclass, timelineMY, updateTimelineMY, timeline, updateTimeline } = useDashboard();
  const opts = useGeoOptions(idx, geo, updateGeo);
  const dash = idx.dash;
  const scenarios = reclass.scenarios || [];

  const timelineMonthOptions = useMemo(() => monthOptionsFor(idx.dash, timelineMY.year), [idx.dash, timelineMY.year]);
  const timelineYearValue = timelineMY.year === 'all' ? 'all' : String(timelineMY.year);
  const timelineMonthValue = timelineMY.month === 'all' ? 'all' : String(timelineMY.month);
  const onTimelineYearChange = (e) => updateTimelineMY({ year: e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10) });
  const onTimelineMonthChange = (e) => updateTimelineMY({ month: e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10) });

  const timelineScenario = scenarios.find((s) => s.id === timeline.scenarioId) || null;
  const hasTimelineScenario = !!timelineScenario;
  const timelineScenarioName = hasTimelineScenario ? timelineScenario.name : null;
  const tlView = timeline.view || 'all';
  const pctKey = tlView === 'op' ? 'pctOp' : tlView === 'nonOp' ? 'pctNonOp' : 'pctAll';
  const totKey = tlView === 'op' ? 'opTotal' : tlView === 'nonOp' ? 'nonOpTotal' : 'total';
  const actKey = tlView === 'op' ? 'opActive' : tlView === 'nonOp' ? 'nonOpActive' : 'active';

  const timelineIsYearCompare = timelineMY.month !== 'all';
  const timelineRawPoints = useMemo(() => {
    if (!timelineIsYearCompare) {
      return dash.months.map((m, i) => ({ m, i })).filter((o) => timelineMY.year === 'all' || o.m.year === timelineMY.year)
        .map((o) => ({ label: o.m.label, idx: o.i }));
    }
    const fixedMonthNum = dash.months[timelineMY.month] ? dash.months[timelineMY.month].key.split('-')[1] : null;
    return dash.months.map((m, i) => ({ m, i })).filter((o) => o.m.key.split('-')[1] === fixedMonthNum)
      .sort((a, b) => a.m.year - b.m.year).map((o) => ({ label: String(o.m.year), idx: o.i }));
  }, [dash.months, timelineIsYearCompare, timelineMY]);

  const timelinePoints = useMemo(() => timelineRawPoints.map((p) => {
    const cur = computeMonthStats(idx, p.idx, geo, null, true, reclass);
    const sc = hasTimelineScenario ? computeMonthStats(idx, p.idx, geo, timelineScenario.descOverrides, false, reclass) : null;
    return {
      label: p.label, curPct: cur[pctKey], curTotal: cur[totKey], curActive: cur[actKey],
      scPct: sc ? sc[pctKey] : null, scTotal: sc ? sc[totKey] : null, scActive: sc ? sc[actKey] : null,
    };
  }), [timelineRawPoints, idx, geo, reclass, hasTimelineScenario, timelineScenario, pctKey, totKey, actKey]);

  const timelineEmpty = timelinePoints.length === 0;
  const chartPct = useMemo(() => buildLineChart(timelinePoints, 'curPct', hasTimelineScenario ? 'scPct' : null, { isPercent: true, curName: 'Actuel', scName: timelineScenarioName }), [timelinePoints, hasTimelineScenario, timelineScenarioName]);
  const chartGapPct = useMemo(() => {
    const pts = timelinePoints.map((p) => ({ label: p.label, val: p.curPct !== null && p.scPct !== null ? Math.abs(p.curPct - p.scPct) : null }));
    return buildLineChart(pts, 'val', null, { unit: ' pt', forceMinZero: true, curName: 'Écart' });
  }, [timelinePoints]);
  const chartActive = useMemo(() => buildLineChart(timelinePoints, 'curActive', hasTimelineScenario ? 'scActive' : null, { unit: ' pers.', curName: 'Actuel', scName: timelineScenarioName }), [timelinePoints, hasTimelineScenario, timelineScenarioName]);
  const chartGapActive = useMemo(() => {
    const pts = timelinePoints.map((p) => ({ label: p.label, val: p.curActive !== null && p.scActive !== null ? Math.abs(p.curActive - p.scActive) : null }));
    return buildLineChart(pts, 'val', null, { unit: ' pers.', forceMinZero: true, curName: 'Écart' });
  }, [timelinePoints]);

  const timelineTableRows = useMemo(() => timelinePoints.map((p) => {
    const delta = hasTimelineScenario && p.curPct !== null && p.scPct !== null ? p.scPct - p.curPct : null;
    return {
      label: p.label, curPctLabel: p.curPct === null ? '—' : p.curPct + '%', curFrac: p.curTotal ? `${p.curActive} / ${p.curTotal}` : '—',
      scPctLabel: hasTimelineScenario ? (p.scPct === null ? '—' : p.scPct + '%') : null,
      scFrac: hasTimelineScenario ? (p.scTotal ? `${p.scActive} / ${p.scTotal}` : '—') : null,
      deltaLabel: delta === null ? null : (delta > 0 ? '+' : '') + delta + ' pt',
      deltaColor: delta === null ? null : (delta > 0 ? 'oklch(45% 0.1 190)' : delta < 0 ? 'oklch(55% 0.15 25)' : 'oklch(45% 0.01 60)'),
    };
  }), [timelinePoints, hasTimelineScenario]);

  const viewBtn = (key, label) => (
    <button
      onClick={() => updateTimeline({ view: key })}
      style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', background: tlView === key ? 'oklch(58% 0.11 190)' : 'white', color: tlView === key ? 'white' : 'oklch(35% 0.01 60)' }}
    >{label}</button>
  );

  return (
    <div>
      <h1 className="h1-title">Évolution temporelle du taux d'actifs</h1>
      <p className="h1-sub">Mois par mois pour la situation actuelle, comparée à un scénario sauvegardé. Fixez un mois précis pour comparer ce même mois d'une année sur l'autre.</p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <GeoFilterFields opts={opts} fields={['bu']} />
        <Field label="Année">
          <Select value={timelineYearValue} onChange={onTimelineYearChange} style={{ minWidth: 100 }}>
            <option value="all">Toutes années</option>
            {opts.yearOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>
        <Field label="Mois (fixe → comparaison annuelle)">
          <Select value={timelineMonthValue} onChange={onTimelineMonthChange} style={{ minWidth: 180 }}>
            <option value="all">Tous les mois (courbe chronologique)</option>
            {timelineMonthOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>
        <GeoFilterFields opts={opts} fields={['region', 'country', 'segment', 'jobFunction']} />
        <Field label="">
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={reclass.includeContractors} onChange={(e) => saveReclass({ includeContractors: e.target.checked })} />
            Inclure les Contractors
          </label>
        </Field>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end', marginBottom: 18 }}>
        <div>
          <label className="field-label">Population</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {viewBtn('all', 'Tous')}
            {viewBtn('op', 'Operator')}
            {viewBtn('nonOp', 'Non-Operator')}
          </div>
        </div>
        <Field label="Comparer au scénario">
          <select value={timeline.scenarioId} onChange={(e) => updateTimeline({ scenarioId: e.target.value })} className="field-control" style={{ minWidth: 200 }}>
            <option value="">Situation actuelle uniquement</option>
            {scenarios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
      </div>

      <div className="card" style={{ padding: 18, marginBottom: 18 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>
          Taux d'actifs (%) — <span style={{ color: CUR_COLOR }}>Actuel</span>
          {hasTimelineScenario && <> vs <span style={{ color: SC_COLOR }}>{timelineScenarioName}</span> (pointillés)</>}
        </div>
        {timelineEmpty ? (
          <div style={{ textAlign: 'center', padding: 40, fontSize: 13, color: 'var(--muted-2)' }}>Aucune donnée pour ce périmètre.</div>
        ) : (
          <TimelineChart chart={chartPct} curColor={CUR_COLOR} curLabelColor={CUR_LABEL} scColor={SC_COLOR} scLabelColor={SC_LABEL} showScenario={hasTimelineScenario} />
        )}
      </div>

      {hasTimelineScenario && (
        <>
          <div className="card" style={{ padding: 18, marginBottom: 18 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>Écart en points de % (|Actuel − {timelineScenarioName}|)</div>
            {!timelineEmpty && <TimelineChart chart={chartGapPct} curColor={GAP_COLOR} curLabelColor={GAP_LABEL} showScenario={false} />}
          </div>

          <div className="card" style={{ padding: 18, marginBottom: 18 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>
              Population active (effectifs) — <span style={{ color: CUR_COLOR }}>Actuel</span> vs <span style={{ color: SC_COLOR }}>{timelineScenarioName}</span> (pointillés)
            </div>
            {!timelineEmpty && <TimelineChart chart={chartActive} curColor={CUR_COLOR} curLabelColor={CUR_LABEL} scColor={SC_COLOR} scLabelColor={SC_LABEL} showScenario leftMargin={38} />}
          </div>

          <div className="card" style={{ padding: 18, marginBottom: 18 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>Écart de population active (|Actuel − {timelineScenarioName}|, en personnes)</div>
            {!timelineEmpty && <TimelineChart chart={chartGapActive} curColor={GAP_COLOR} curLabelColor={GAP_LABEL} showScenario={false} leftMargin={38} />}
          </div>
        </>
      )}

      <div className="card" style={{ padding: 6, overflow: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr .9fr .9fr .7fr', gap: 8, padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
          <div>Période</div><div style={{ textAlign: 'right' }}>Actuel</div><div style={{ textAlign: 'right' }}>Scénario</div><div style={{ textAlign: 'right' }}>Écart</div>
        </div>
        {timelineTableRows.map((row, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr .9fr .9fr .7fr', gap: 8, padding: '8px 14px', fontSize: 12, borderBottom: '1px solid var(--row-border)' }}>
            <div>{row.label}</div>
            <div style={{ textAlign: 'right' }}><b>{row.curPctLabel}</b> <span style={{ color: 'var(--muted)', fontSize: 10.5 }}>({row.curFrac})</span></div>
            <div style={{ textAlign: 'right' }}>{hasTimelineScenario ? <><b>{row.scPctLabel}</b> <span style={{ color: 'var(--muted)', fontSize: 10.5 }}>({row.scFrac})</span></> : '—'}</div>
            <div style={{ textAlign: 'right', color: row.deltaColor || 'inherit', fontWeight: 700 }}>{row.deltaLabel || '—'}</div>
          </div>
        ))}
        {timelineTableRows.length === 0 && <div className="empty-state">Aucune donnée pour ce périmètre.</div>}
      </div>
    </div>
  );
}
