import { useMemo, useRef } from 'react';
import { useDashboard } from '../../state/DashboardContext';
import { useGeoOptions } from '../../hooks/useGeoOptions';
import { GeoFilterFields } from '../shared/GeoFilterFields';
import { Field, Select } from '../shared/Field';
import { KpiTile } from '../shared/OpPill';
import { WorldMap } from '../WorldMap';
import { computeGeoAgg, countryLabel, fmt, pct } from '../../lib/dashboardIndex';
import { COUNTRY_CENTROIDS } from '../../lib/geoRef';

export function GeoTab() {
  const { idx, geo, updateGeo, reclass, saveReclass, hoverCountryIdx, setHoverCountryIdx, pinnedCountryIdx, setPinnedCountryIdx } = useDashboard();
  const opts = useGeoOptions(idx, geo, updateGeo);
  const mapRef = useRef(null);

  const agg = useMemo(() => computeGeoAgg(idx, geo, reclass.includeContractors), [idx, geo, reclass.includeContractors]);
  const isNoUsageMetric = geo.metric === 'noUsageShare';
  const sortBy = geo.sortBy || 'share', sortDir = geo.sortDir || 'desc';

  const rankTop = useMemo(() => {
    const rankBase = [...agg.byCountry.entries()].map(([cIdx, c]) => {
      const activeShare = c.headcount.size ? (c.active.size / c.headcount.size) * 100 : 0;
      return { idx: cIdx, headcount: c.headcount.size, active: c.active.size, activeShare, shareVal: isNoUsageMetric ? 100 - activeShare : activeShare, prompts: c.prompts };
    });
    const sortKeyFns = {
      country: (r) => countryLabel(r.idx, idx.dash), headcount: (r) => r.headcount,
      active: (r) => r.active, share: (r) => r.shareVal, prompts: (r) => r.prompts,
    };
    const sortFn = sortKeyFns[sortBy] || sortKeyFns.share;
    rankBase.sort((a, b) => {
      const av = sortFn(a), bv = sortFn(b);
      const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    let top = rankBase.slice(0, 10);
    if (pinnedCountryIdx !== null && pinnedCountryIdx !== undefined && !top.some((r) => r.idx === pinnedCountryIdx)) {
      const pinnedRow = rankBase.find((r) => r.idx === pinnedCountryIdx);
      if (pinnedRow) top = [...top, pinnedRow];
    }
    return top;
  }, [agg, isNoUsageMetric, sortBy, sortDir, pinnedCountryIdx, idx]);

  const onMakeSort = (key) => () => updateGeo((g) => ({ sortBy: key, sortDir: g.sortBy === key && (g.sortDir || 'desc') === 'desc' ? 'asc' : 'desc' }));
  const sortArrow = (key) => (sortBy === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');
  const shareColLabel = isNoUsageMetric ? '%SansUs' : '%Act';

  let kpiTile2Label = 'Utilisateurs actifs', kpiTile2Value = fmt(agg.totals.active), kpiTile2Color = 'var(--teal-dark)';
  let kpiTile3Label = "Taux d'adoption", kpiTile3Value = pct(agg.totals.headcount ? (agg.totals.active / agg.totals.headcount) * 100 : 0);
  if (geo.metric === 'noUsageShare') {
    const noUsage = agg.totals.headcount - agg.totals.active;
    kpiTile2Label = 'Sans usage'; kpiTile2Value = fmt(noUsage); kpiTile2Color = 'var(--amber)';
    kpiTile3Label = 'Taux sans usage'; kpiTile3Value = pct(agg.totals.headcount ? (noUsage / agg.totals.headcount) * 100 : 0);
  } else if (geo.metric === 'prompts') {
    kpiTile2Label = 'Prompts (périmètre)'; kpiTile2Value = fmt(agg.totals.prompts);
  } else if (geo.metric === 'headcount') {
    kpiTile2Label = 'Effectif (périmètre)'; kpiTile2Value = fmt(agg.totals.headcount);
  }

  const hoverIdx = hoverCountryIdx ?? pinnedCountryIdx;
  const hoverDetail = useMemo(() => {
    if (hoverIdx === null || hoverIdx === undefined || !agg.byCountry.has(hoverIdx)) return null;
    const c = agg.byCountry.get(hoverIdx);
    return {
      countryLabel: countryLabel(hoverIdx, idx.dash), headcount: fmt(c.headcount.size), active: fmt(c.active.size),
      inactive: fmt(c.headcount.size - c.active.size), activeShare: pct(c.headcount.size ? (c.active.size / c.headcount.size) * 100 : 0), prompts: fmt(c.prompts),
    };
  }, [hoverIdx, agg, idx]);

  const onSelectCountry = (cIdx) => {
    const code = idx.dash.dicts.countries[cIdx];
    mapRef.current?.rotateToCountry(code);
    setPinnedCountryIdx(cIdx);
  };

  return (
    <div>
      <h1 className="h1-title">Utilisation des LLM dans le monde</h1>
      <p className="h1-sub">Filtrez par géographie, BU, segment, équipe, mois et opérateur. Cliquez sur une bulle pour le détail.</p>

      <div className="filter-bar">
        <GeoFilterFields opts={opts} fields={['bu', 'year', 'month', 'region', 'country', 'segment', 'jobFunction', 'operator', 'opStatus']} />
        <Field label="Métrique de la carte">
          <Select value={geo.metric} onChange={opts.onGeoMetricChange} style={{ minWidth: 170 }}>
            <option value="activeShare">% utilisateurs actifs</option>
            <option value="noUsageShare">% sans usage</option>
            <option value="prompts">Volume de prompts</option>
            <option value="headcount">Effectif</option>
          </Select>
        </Field>
        <Field label="Taille des bulles">
          <Select value={geo.sizeMetric} onChange={opts.onGeoSizeMetricChange} style={{ minWidth: 150 }}>
            <option value="headcount">Nb personnes</option>
            <option value="prompts">Nb prompts</option>
            <option value="active">Nb actifs</option>
          </Select>
        </Field>
        <Field label="">
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={reclass.includeContractors} onChange={(e) => saveReclass({ includeContractors: e.target.checked })} />
            Inclure les Contractors
          </label>
        </Field>
        <div style={{ marginLeft: 'auto', alignSelf: 'flex-end', display: 'flex', gap: 6 }}>
          <button className={'btn' + (geo.view === 'globe' ? ' btn-ghost-active' : '')} onClick={() => updateGeo({ view: 'globe' })}>Globe</button>
          <button className={'btn' + (geo.view === 'flat' ? ' btn-ghost-active' : '')} onClick={() => updateGeo({ view: 'flat' })}>Carte plate</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 18 }}>
        <KpiTile label="Effectif (périmètre)" value={fmt(agg.totals.headcount)} />
        <KpiTile label={kpiTile2Label} value={kpiTile2Value} color={kpiTile2Color} />
        <KpiTile label={kpiTile3Label} value={kpiTile3Value} />
        <KpiTile label="Total prompts" value={fmt(agg.totals.prompts)} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2.1fr 1fr', gap: 16 }}>
        <div className="card" style={{ padding: 8 }}>
          <WorldMap ref={mapRef} idx={idx} geo={geo} countryCentroids={COUNTRY_CENTROIDS} pinnedCountryIdx={pinnedCountryIdx} includeContractors={reclass.includeContractors} onHoverCountry={setHoverCountryIdx} onSelectCountry={onSelectCountry} />
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 10 }}>Classement pays (top 10) — cliquez une colonne pour trier</div>
          <div className="table-head" style={{ gridTemplateColumns: '1.3fr .8fr .8fr .8fr .9fr', padding: '6px 6px' }}>
            <div className="sortable" onClick={onMakeSort('country')}>Pays{sortArrow('country')}</div>
            <div className="sortable" style={{ textAlign: 'right' }} onClick={onMakeSort('headcount')}>Eff.{sortArrow('headcount')}</div>
            <div className="sortable" style={{ textAlign: 'right' }} onClick={onMakeSort('active')}>Act.{sortArrow('active')}</div>
            <div className="sortable" style={{ textAlign: 'right' }} onClick={onMakeSort('share')}>{shareColLabel}{sortArrow('share')}</div>
            <div className="sortable" style={{ textAlign: 'right' }} onClick={onMakeSort('prompts')}>Prompts{sortArrow('prompts')}</div>
          </div>
          {rankTop.map((r) => (
            <div
              key={r.idx}
              onClick={() => onSelectCountry(r.idx)}
              className="table-row"
              style={{ gridTemplateColumns: '1.3fr .8fr .8fr .8fr .9fr', cursor: 'pointer', borderRadius: 6, background: r.idx === pinnedCountryIdx ? 'var(--teal-bg)' : 'transparent', fontSize: 11.5 }}
            >
              <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{countryLabel(r.idx, idx.dash)}</div>
              <div style={{ textAlign: 'right', color: 'oklch(40% 0.01 60)' }}>{fmt(r.headcount)}</div>
              <div style={{ textAlign: 'right', color: 'var(--teal-dark)' }}>{fmt(r.active)}</div>
              <div style={{ textAlign: 'right', color: 'oklch(40% 0.01 60)' }}>{pct(r.shareVal)}</div>
              <div style={{ textAlign: 'right', color: 'oklch(40% 0.01 60)' }}>{fmt(r.prompts)}</div>
            </div>
          ))}
          {hoverDetail && (
            <div style={{ marginTop: 14, padding: 12, background: 'var(--teal-bg)', borderRadius: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>{hoverDetail.countryLabel}</div>
              <div style={{ fontSize: 12, color: 'oklch(40% 0.01 60)', lineHeight: 1.6 }}>
                Effectif : {hoverDetail.headcount}<br />
                Actifs : {hoverDetail.active} ({hoverDetail.activeShare})<br />
                Inactifs : {hoverDetail.inactive}<br />
                Prompts : {hoverDetail.prompts}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
