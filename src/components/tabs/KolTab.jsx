import { useMemo } from 'react';
import { useDashboard } from '../../state/DashboardContext';
import { useGeoOptions } from '../../hooks/useGeoOptions';
import { GeoFilterFields } from '../shared/GeoFilterFields';
import { OpPill } from '../shared/OpPill';
import { computeInfluence, computeKolCandidates, countryLabel, fmt, opStatusPill } from '../../lib/dashboardIndex';

export function KolTab() {
  const { idx, geo, updateGeo, kol, updateKol, reclass, saveReclass, selectedEmailIdx, setSelectedEmailIdx } = useDashboard();
  const opts = useGeoOptions(idx, geo, updateGeo);
  const dash = idx.dash;

  const kolCandidatesRaw0 = useMemo(() => computeKolCandidates(idx, {
    minPrompts: kol.minPrompts, months: kol.months, region: geo.region, country: geo.country,
    segment: geo.segment, jobFunction: geo.jobFunction, bu: geo.bu, opStatus: geo.opStatus,
  }, reclass.includeContractors), [idx, kol.minPrompts, kol.months, geo.region, geo.country, geo.segment, geo.jobFunction, geo.bu, geo.opStatus, reclass.includeContractors]);

  const kolNameSearch = (kol.nameSearch || '').trim().toLowerCase();
  const kolCandidatesRaw = useMemo(() => (
    kolNameSearch ? kolCandidatesRaw0.filter((c) => (c.name || '').toLowerCase().includes(kolNameSearch)) : kolCandidatesRaw0
  ), [kolCandidatesRaw0, kolNameSearch]);

  const kolSortBy = kol.sortBy || 'sum', kolSortDir = kol.sortDir || 'desc';
  const kolCandidates = useMemo(() => {
    const sortKeyFns = {
      name: (c) => c.name || '', team: (c) => dash.dicts.jobFunctions[c.jobFunIdx] || '',
      geo: (c) => countryLabel(c.countryIdx, dash) || '', segment: (c) => dash.dicts.segments[c.segmentIdx] || '',
      sum: (c) => c.sum, status: (c) => opStatusPill(c.opStatusIdx).label || '',
    };
    const sortFn = sortKeyFns[kolSortBy] || sortKeyFns.sum;
    return [...kolCandidatesRaw].sort((a, b) => {
      const av = sortFn(a), bv = sortFn(b);
      const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
      return kolSortDir === 'asc' ? cmp : -cmp;
    }).slice(0, 200);
  }, [kolCandidatesRaw, kolSortBy, kolSortDir, dash]);

  const onMakeKolSort = (key) => () => updateKol({ sortBy: key, sortDir: kol.sortBy === key && (kol.sortDir || 'desc') === 'desc' ? 'asc' : 'desc' });
  const kolSortArrow = (key) => (kolSortBy === key ? (kolSortDir === 'asc' ? ' ▲' : ' ▼') : '');

  const selectedKol = useMemo(() => {
    if (selectedEmailIdx === null || !idx.byEmail.has(selectedEmailIdx)) return null;
    const rec = idx.byEmail.get(selectedEmailIdx);
    const latest = rec.latest;
    if (!latest) return null;
    return { emailIdx: selectedEmailIdx, name: rec.emp ? rec.emp[2] : dash.dicts.emails[selectedEmailIdx], countryIdx: latest[2], jobFunIdx: latest[6], jobDescIdx: latest[12] };
  }, [selectedEmailIdx, idx, dash]);

  const influenceRows = useMemo(() => {
    if (!selectedKol) return [];
    return computeInfluence(idx, selectedKol, { requireSameTeam: kol.requireSameTeam, requireSameGeo: kol.requireSameGeo, requireSameJob: kol.requireSameJob, lowThreshold: kol.lowThreshold, months: kol.months });
  }, [idx, selectedKol, kol.requireSameTeam, kol.requireSameGeo, kol.requireSameJob, kol.lowThreshold, kol.months]);

  return (
    <div>
      <h1 className="h1-title">Key Opinion Leaders &amp; sphère d'influence</h1>
      <p className="h1-sub">Un KOL = une personne dont l'usage cumulé dépasse un seuil sur une fenêtre récente. Sélectionnez-en un pour lister qui, dans son entourage, aurait besoin d'être formé.</p>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20 }}>
        <div className="card" style={{ padding: 18, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 14 }}>Seuil KOL</div>
          <label style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)', marginBottom: 4 }}>
            Min. prompts sur la fenêtre : <b style={{ color: 'var(--text)' }}>{kol.minPrompts}</b>
          </label>
          <input type="range" min={10} max={500} step={10} value={kol.minPrompts} onChange={(e) => updateKol({ minPrompts: parseInt(e.target.value, 10) })} style={{ width: '100%', marginBottom: 14 }} />
          <label style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)', marginBottom: 4 }}>
            Fenêtre : derniers <b style={{ color: 'var(--text)' }}>{kol.months}</b> mois
          </label>
          <input type="range" min={1} max={idx.numMonths || 1} step={1} value={kol.months} onChange={(e) => updateKol({ months: parseInt(e.target.value, 10) })} style={{ width: '100%', marginBottom: 18 }} />

          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0 14px' }} />
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 10 }}>Filtrer les candidats</div>
          <input
            type="text" value={kol.nameSearch || ''} onChange={(e) => updateKol({ nameSearch: e.target.value })}
            placeholder="Rechercher un nom…" className="field-control" style={{ width: '100%', marginBottom: 8 }}
          />
          <GeoFilterFields opts={opts} fields={['bu', 'region', 'country', 'segment', 'jobFunction', 'opStatus']} style={{ marginBottom: 8 }} selectStyle={{ width: '100%' }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted)', cursor: 'pointer' }}>
            <input type="checkbox" checked={reclass.includeContractors} onChange={(e) => saveReclass({ includeContractors: e.target.checked })} />
            Inclure les Contractors
          </label>
          <div style={{ marginTop: 16, fontSize: 11, color: 'var(--muted-2)' }}>{kolCandidatesRaw.length} candidat(s) trouvé(s)</div>
        </div>

        <div className="card" style={{ padding: 4, overflow: 'auto', minWidth: 0 }}>
          <div style={{ minWidth: 640 }}>
            <div className="table-head" style={{ gridTemplateColumns: '1.5fr 1fr 1fr 1fr .8fr .9fr' }}>
              <div className="sortable" onClick={onMakeKolSort('name')}>Nom{kolSortArrow('name')}</div>
              <div className="sortable" onClick={onMakeKolSort('team')}>Équipe{kolSortArrow('team')}</div>
              <div className="sortable" onClick={onMakeKolSort('geo')}>Pays{kolSortArrow('geo')}</div>
              <div className="sortable" onClick={onMakeKolSort('segment')}>Segment{kolSortArrow('segment')}</div>
              <div className="sortable" style={{ textAlign: 'right' }} onClick={onMakeKolSort('sum')}>Prompts{kolSortArrow('sum')}</div>
              <div className="sortable" onClick={onMakeKolSort('status')}>Statut{kolSortArrow('status')}</div>
            </div>
            <div style={{ maxHeight: 640, overflow: 'auto' }}>
              {kolCandidates.map((c) => (
                <div
                  key={c.emailIdx}
                  onClick={() => setSelectedEmailIdx(c.emailIdx)}
                  className="table-row"
                  style={{ gridTemplateColumns: '1.5fr 1fr 1fr 1fr .8fr .9fr', cursor: 'pointer', background: c.emailIdx === selectedEmailIdx ? 'var(--teal-bg)' : 'white' }}
                >
                  <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {c.name}
                    <div style={{ fontSize: 11, color: 'var(--muted-2)', fontWeight: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</div>
                  </div>
                  <div style={{ color: 'oklch(40% 0.01 60)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dash.dicts.jobFunctions[c.jobFunIdx] || '—'}</div>
                  <div style={{ color: 'oklch(40% 0.01 60)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{countryLabel(c.countryIdx, dash)}</div>
                  <div style={{ color: 'oklch(40% 0.01 60)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dash.dicts.segments[c.segmentIdx]}</div>
                  <div style={{ textAlign: 'right', fontWeight: 700, color: 'var(--teal-dark)' }}>{fmt(c.sum)}</div>
                  <div><OpPill opStatusIdx={c.opStatusIdx} /></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {selectedKol && (
        <div style={{ marginTop: 26 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>Sphère d'influence de {selectedKol.name}</h2>
          <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '0 0 14px' }}>Collègues à faible usage qu'il/elle pourrait former en priorité.</p>

          <div className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', marginBottom: 14, padding: '14px 16px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
              <input type="checkbox" checked={kol.requireSameTeam} onChange={(e) => updateKol({ requireSameTeam: e.target.checked })} /> Même équipe/fonction
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
              <input type="checkbox" checked={kol.requireSameGeo} onChange={(e) => updateKol({ requireSameGeo: e.target.checked })} /> Même pays
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
              <input type="checkbox" checked={kol.requireSameJob} onChange={(e) => updateKol({ requireSameJob: e.target.checked })} /> Même job description
            </label>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label className="field-label">Seuil "faible usage" : &lt; {kol.lowThreshold} prompts</label>
              <input type="range" min={0} max={100} step={5} value={kol.lowThreshold} onChange={(e) => updateKol({ lowThreshold: parseInt(e.target.value, 10) })} style={{ width: '100%' }} />
            </div>
          </div>

          <div className="card" style={{ overflow: 'auto' }}>
            <div style={{ minWidth: 600 }}>
              <div className="table-head" style={{ gridTemplateColumns: '1.4fr 1fr 1fr .8fr .8fr 1fr' }}>
                <div>Nom</div><div>Équipe</div><div>Pays</div><div style={{ textAlign: 'right' }}>Prompts</div><div>Statut</div><div>Proximité</div>
              </div>
              <div style={{ maxHeight: 420, overflow: 'auto' }}>
                {influenceRows.map((r) => (
                  <div key={r.emailIdx} className="table-row" style={{ gridTemplateColumns: '1.4fr 1fr 1fr .8fr .8fr 1fr' }}>
                    <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {r.name}
                      <div style={{ fontSize: 11, color: 'var(--muted-2)', fontWeight: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                    </div>
                    <div style={{ color: 'oklch(40% 0.01 60)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dash.dicts.jobFunctions[r.jobFunIdx] || '—'}</div>
                    <div style={{ color: 'oklch(40% 0.01 60)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{countryLabel(r.countryIdx, dash)}</div>
                    <div style={{ textAlign: 'right', color: 'var(--amber)', fontWeight: 700 }}>{fmt(r.sum)}</div>
                    <div><OpPill opStatusIdx={r.opStatusIdx} /></div>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{r.sameSup ? 'Même manager' : r.sameCountry ? 'Même pays' : 'Même équipe'}</div>
                  </div>
                ))}
                {influenceRows.length === 0 && <div className="empty-state">Aucun collègue ne correspond à ces critères.</div>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
