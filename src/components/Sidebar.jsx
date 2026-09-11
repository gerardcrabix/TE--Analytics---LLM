import { useDashboard } from '../state/DashboardContext';

const TABS = [
  { key: 'geo', label: 'Carte mondiale', dot: 'var(--teal)' },
  { key: 'kol', label: 'KOL & influence', dot: 'var(--amber)' },
  { key: 'tree', label: 'Managérial / Domaine', dot: 'var(--gray-dot)' },
  { key: 'scenarioCompare', label: 'Comparer scénarios', dot: 'var(--purple)' },
  { key: 'reco', label: 'Recommandations', dot: 'var(--purple)' },
  { key: 'timeline', label: 'Évolution temporelle', dot: 'oklch(55% 0.14 30)' },
  { key: 'pivot', label: 'Analyse dynamique', dot: 'var(--green)' },
  { key: 'data', label: 'Données', dot: 'oklch(55% 0.01 60)' },
  { key: 'report', label: 'Rapport', dot: 'oklch(50% 0.15 300)' },
];

export function Sidebar() {
  const { tab, setTab, idx } = useDashboard();
  const dash = idx.dash;
  const monthRangeLabel = dash.months.length
    ? dash.months[0].label + ' → ' + dash.months[dash.months.length - 1].label
    : 'Aucune donnée importée';
  const personCountLabel = idx.byEmail.size.toLocaleString('fr-FR') + ' personnes suivies';

  return (
    <div style={{ width: 230, flex: 'none', background: 'var(--panel)', borderRight: '1px solid var(--border)', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 4, minHeight: '100vh' }}>
      <div style={{ padding: '0 8px 20px', font: "700 15px/1.3 'IBM Plex Sans', sans-serif" }}>
        Usage LLM<br />
        <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 12.5 }}>TE Energy · ENG</span>
      </div>
      {TABS.map((t) => {
        const active = tab === t.key;
        return (
          <div
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              cursor: 'pointer', padding: '10px 12px', borderRadius: 8, fontSize: 13.5, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 10,
              background: active ? 'var(--teal-bg-2)' : 'transparent',
              color: active ? 'oklch(30% 0.08 190)' : 'oklch(35% 0.01 60)',
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.dot, flex: 'none' }} />
            {t.label}
          </div>
        );
      })}
      <div style={{ marginTop: 'auto', padding: '12px 8px 0', fontSize: 11, color: 'var(--muted-2)', borderTop: '1px solid var(--border)' }}>
        {monthRangeLabel}<br />{personCountLabel}
      </div>
    </div>
  );
}
