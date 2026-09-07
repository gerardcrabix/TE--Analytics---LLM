import { useMemo } from 'react';
import { useDashboard } from '../../state/DashboardContext';
import { useGeoOptions } from '../../hooks/useGeoOptions';
import { GeoFilterFields } from '../shared/GeoFilterFields';
import { Select } from '../shared/Field';
import { DIM_LABELS, buildPivotNode, filterUsageRows, flattenPivot, fmt } from '../../lib/dashboardIndex';

const ALL_DIMS = ['year', 'month', 'region', 'country', 'segment', 'bu', 'jobFunction', 'opStatus'];

export function PivotTab() {
  const { idx, geo, updateGeo, pivot, updatePivot } = useDashboard();
  const opts = useGeoOptions(idx, geo, updateGeo);

  const dims = pivot.dims;
  const expandedSet = useMemo(() => new Set(pivot.expanded || []), [pivot.expanded]);
  const togglePath = (path) => updatePivot((p) => {
    const set = new Set(p.expanded || []);
    if (set.has(path)) set.delete(path); else set.add(path);
    return { expanded: [...set] };
  });

  const baseRows = useMemo(() => filterUsageRows(idx, {
    year: geo.year, month: geo.month, region: geo.region, country: geo.country,
    segment: geo.segment, jobFunction: geo.jobFunction, bu: geo.bu, opStatus: geo.opStatus,
  }), [idx, geo.year, geo.month, geo.region, geo.country, geo.segment, geo.jobFunction, geo.bu, geo.opStatus]);

  const rows = useMemo(() => {
    if (!dims.length) return [];
    const tree = buildPivotNode(idx, baseRows, dims, 0, 'root').children;
    const out = [];
    flattenPivot(tree, 0, expandedSet, out);
    return out;
  }, [idx, baseRows, dims, expandedSet]);

  const availableDims = ALL_DIMS.filter((d) => !dims.includes(d));

  return (
    <div>
      <h1 className="h1-title">Analyse dynamique</h1>
      <p className="h1-sub">Choisissez un périmètre puis un ordre de décomposition (ex. Année → Mois → Operator/Non-Operator). Chaque niveau indique le nombre d'utilisateurs total / actifs / inactifs.</p>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20 }}>
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 10 }}>Périmètre</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <Select value={opts.geoYearValue} onChange={opts.onGeoYearChange}><option value="all">Toutes années</option>{opts.yearOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>
          </div>
          <div style={{ marginBottom: 6 }}>
            <Select value={opts.geoMonthValue} onChange={opts.onGeoMonthChange}><option value="all">Tous les mois (cumul)</option>{opts.monthOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>
          </div>
          <GeoFilterFields opts={opts} fields={['bu', 'region', 'country', 'segment', 'jobFunction', 'opStatus']} style={{ marginBottom: 6 }} />

          <div style={{ height: 1, background: 'var(--border)', margin: '6px 0 14px' }} />
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>Ordre de décomposition</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {dims.map((d, i) => (
              <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--teal-bg-2)', color: 'oklch(30% 0.08 190)', borderRadius: 6, padding: '5px 8px', fontSize: 11.5, fontWeight: 600 }}>
                {DIM_LABELS[d]}
                <span onClick={() => updatePivot((p) => ({ dims: p.dims.filter((_, j) => j !== i) }))} style={{ cursor: 'pointer', color: 'oklch(45% 0.01 60)' }}>×</span>
              </div>
            ))}
            {dims.length === 0 && <div style={{ fontSize: 11.5, color: 'var(--muted-2)' }}>Aucun niveau — ajoutez-en un ci-dessous.</div>}
          </div>
          <Select value="__add" onChange={(e) => { const v = e.target.value; if (v && v !== '__add') updatePivot((p) => ({ dims: [...p.dims, v] })); }}>
            <option value="__add">+ Ajouter un niveau…</option>
            {availableDims.map((d) => <option key={d} value={d}>{DIM_LABELS[d]}</option>)}
          </Select>
        </div>

        <div className="card" style={{ padding: 6, overflow: 'auto', minWidth: 0 }}>
          <div className="table-head" style={{ gridTemplateColumns: '1fr .8fr .8fr .8fr', padding: '10px 14px' }}>
            <div>Niveau</div><div style={{ textAlign: 'right' }}>Total</div><div style={{ textAlign: 'right' }}>Actifs</div><div style={{ textAlign: 'right' }}>Inactifs</div>
          </div>
          {rows.map((row) => (
            <div
              key={row.path}
              onClick={row.hasChildren ? () => togglePath(row.path) : undefined}
              className="table-row"
              style={{ gridTemplateColumns: '1fr .8fr .8fr .8fr', paddingLeft: 14 + row.depth * 20, cursor: row.hasChildren ? 'pointer' : 'default' }}
            >
              <div style={{ fontWeight: row.depth === 0 ? 700 : 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 12, color: 'var(--muted-2)', fontSize: 10 }}>{row.hasChildren ? (row.expanded ? '▾' : '▸') : '·'}</span>
                {row.label}
              </div>
              <div style={{ textAlign: 'right', color: 'oklch(35% 0.01 60)' }}>{fmt(row.headcount)}</div>
              <div style={{ textAlign: 'right', color: 'var(--teal-dark)', fontWeight: 600 }}>{fmt(row.active)}</div>
              <div style={{ textAlign: 'right', color: 'var(--muted-2)' }}>{fmt(row.inactive)}</div>
            </div>
          ))}
          {dims.length === 0 && <div style={{ textAlign: 'center', padding: 50, fontSize: 12.5, color: 'var(--muted-2)' }}>Ajoutez au moins un niveau de décomposition.</div>}
        </div>
      </div>
    </div>
  );
}
