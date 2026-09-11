import { useMemo, useState } from 'react';
import { useDashboard } from '../../state/DashboardContext';
import { useGeoOptions } from '../../hooks/useGeoOptions';
import { GeoFilterFields } from '../shared/GeoFilterFields';
import { KpiTile } from '../shared/OpPill';
import { Select } from '../shared/Field';
import { monthOptionsFor } from '../../lib/dashboardIndex';
import { computeRecoSnapshot, generateRecommendationText } from '../../lib/recommend';

function recoFilterKey(f) {
  return `bu:${f.bu}|region:${f.region}|country:${f.country}|jobFunction:${f.jobFunction}|opStatus:${f.opStatus}|year:${f.year}|month:${f.month}`;
}

export function RecoTab() {
  const { idx, geo, updateGeo, kol, recoMY, updateRecoMY, reclass, saveReclass, recoHistory, pushRecoEntry } = useDashboard();
  const opts = useGeoOptions(idx, geo, updateGeo);
  const dash = idx.dash;
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  const recoMonthOptions = useMemo(() => monthOptionsFor(idx.dash, recoMY.year), [idx.dash, recoMY.year]);
  const recoYearValue = recoMY.year === 'all' ? 'all' : String(recoMY.year);
  const recoMonthValue = recoMY.month === 'all' ? 'all' : String(recoMY.month);
  const onRecoYearChange = (e) => updateRecoMY({ year: e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10) });
  const onRecoMonthChange = (e) => updateRecoMY({ month: e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10) });

  const filters = useMemo(() => ({ bu: geo.bu, region: geo.region, country: geo.country, jobFunction: geo.jobFunction, opStatus: geo.opStatus, year: recoMY.year, month: recoMY.month }),
    [geo.bu, geo.region, geo.country, geo.jobFunction, geo.opStatus, recoMY.year, recoMY.month]);
  const filterKey = recoFilterKey(filters);
  const snapshot = useMemo(() => computeRecoSnapshot(idx, filters, kol, reclass.includeContractors), [idx, filters, kol, reclass.includeContractors]);

  const historyForFilter = useMemo(() => recoHistory
    .filter((e) => e.filterKey === filterKey)
    .sort((a, b) => b.ts - a.ts)
    .map((entry) => {
      const delta = snapshot.adoptionRate - entry.snapshot.adoptionRate;
      return {
        ...entry,
        dateLabel: new Date(entry.ts).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }),
        deltaLabel: (delta > 0 ? '+' : '') + delta + ' pts',
        deltaColor: delta > 0 ? 'var(--teal-dark)' : delta < 0 ? 'oklch(55% 0.15 25)' : 'oklch(45% 0.01 60)',
      };
    }), [recoHistory, filterKey, snapshot]);

  const onGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const buLabel = filters.bu === 'all' ? 'toutes BU' : dash.dicts.businessUnits[filters.bu];
      const regionLabel = filters.region === 'all' ? 'toutes régions' : dash.dicts.regions[filters.region];
      const countryLabelTxt = filters.country === 'all' ? 'tous pays' : dash.dicts.countries[filters.country];
      const teamLabel = filters.jobFunction === 'all' ? 'toutes équipes' : dash.dicts.jobFunctions[filters.jobFunction];
      const popLabel = filters.opStatus === 'all' ? 'Operator + Non-Operator' : dash.dicts.operatorStatuses[filters.opStatus];
      const text = await generateRecommendationText({ buLabel, regionLabel, countryLabel: countryLabelTxt, teamLabel, popLabel, snapshot });
      pushRecoEntry({ id: Date.now(), ts: Date.now(), filters, filterKey, buLabel, regionLabel, teamLabel, popLabel, snapshot, text });
    } catch (e) {
      setError(String((e && e.message) || e));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div>
      <h1 className="h1-title">Recommandations</h1>
      <p className="h1-sub">Générez des recommandations ciblées pour un périmètre BU / géo / équipe. Chaque génération est datée et conservée : au fil des mises à jour du fichier, comparez la situation à date avec ce qui avait été identifié.</p>

      <div className="filter-bar">
        <div>
          <label className="field-label">Année</label>
          <Select value={recoYearValue} onChange={onRecoYearChange} style={{ minWidth: 100 }}>
            <option value="all">Toutes années</option>
            {opts.yearOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </div>
        <div>
          <label className="field-label">Mois</label>
          <Select value={recoMonthValue} onChange={onRecoMonthChange} style={{ minWidth: 140 }}>
            <option value="all">Tous les mois (cumul)</option>
            {recoMonthOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </div>
        <GeoFilterFields opts={opts} fields={['bu', 'region', 'country', 'jobFunction', 'opStatus']} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, alignSelf: 'flex-end', paddingBottom: 8 }}>
          <input type="checkbox" checked={reclass.includeContractors} onChange={(e) => saveReclass({ includeContractors: e.target.checked })} />
          Inclure les Contractors
        </label>
        <div style={{ alignSelf: 'flex-end' }}>
          <button className="btn btn-primary" disabled={generating} onClick={onGenerate}>{generating ? 'Génération…' : 'Générer une recommandation'}</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        <KpiTile label="Effectif du périmètre" value={snapshot.headcount} />
        <KpiTile label="Utilisateurs actifs" value={snapshot.active} color="var(--teal-dark)" />
        <KpiTile label="Taux d'adoption" value={snapshot.adoptionRate + '%'} />
        <KpiTile label="KOL identifiés" value={snapshot.kolCount} />
      </div>

      {error && <div style={{ background: 'var(--amber-bg)', color: 'var(--amber-dark)', padding: '10px 14px', borderRadius: 8, fontSize: 12.5, marginBottom: 16 }}>Erreur : {error}</div>}

      {historyForFilter.length === 0 ? (
        <div className="empty-state">Aucune recommandation générée pour ce périmètre. Cliquez sur "Générer" ci-dessus.</div>
      ) : (
        historyForFilter.map((entry) => (
          <div key={entry.id} className="card" style={{ padding: '18px 20px', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'oklch(35% 0.01 60)' }}>Généré le {entry.dateLabel}</div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                Adoption alors : <b>{entry.snapshot.adoptionRate}%</b> → aujourd'hui : <b style={{ color: entry.deltaColor }}>{snapshot.adoptionRate}% ({entry.deltaLabel})</b>
              </div>
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.6, color: 'oklch(30% 0.01 60)', whiteSpace: 'pre-wrap', margin: 0 }}>{entry.text}</p>
          </div>
        ))
      )}
    </div>
  );
}
