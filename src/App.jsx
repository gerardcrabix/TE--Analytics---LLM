import { DashboardProvider, useDashboard } from './state/DashboardContext';
import { Sidebar } from './components/Sidebar';
import { GeoTab } from './components/tabs/GeoTab';
import { KolTab } from './components/tabs/KolTab';
import { TreeTab } from './components/tabs/TreeTab';
import { ScenarioCompareTab } from './components/tabs/ScenarioCompareTab';
import { RecoTab } from './components/tabs/RecoTab';
import { TimelineTab } from './components/tabs/TimelineTab';
import { PivotTab } from './components/tabs/PivotTab';
import { DataTab } from './components/tabs/DataTab';
import { ReportTab } from './components/tabs/ReportTab';

function Shell() {
  const { tab, hasData } = useDashboard();
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div style={{ flex: 1, minWidth: 0, padding: '28px 32px 60px', overflow: 'auto' }}>
        {!hasData && tab !== 'data' ? (
          <EmptyDataNotice />
        ) : (
          <>
            {tab === 'geo' && <GeoTab />}
            {tab === 'kol' && <KolTab />}
            {tab === 'tree' && <TreeTab />}
            {tab === 'scenarioCompare' && <ScenarioCompareTab />}
            {tab === 'reco' && <RecoTab />}
            {tab === 'timeline' && <TimelineTab />}
            {tab === 'pivot' && <PivotTab />}
            {tab === 'data' && <DataTab />}
            {tab === 'report' && <ReportTab />}
          </>
        )}
      </div>
    </div>
  );
}

function EmptyDataNotice() {
  const { setTab } = useDashboard();
  return (
    <div style={{ maxWidth: 560, marginTop: 60 }}>
      <h1 className="h1-title">Aucune donnée importée</h1>
      <p className="h1-sub">
        Ce tableau de bord ne contient aucune donnée par défaut — rien n'est stocké dans ce dépôt.
        Importez un fichier d'usage LLM et/ou un référentiel employés (.xlsx) depuis l'onglet Données
        pour commencer. Tout reste dans le navigateur (localStorage), rien n'est envoyé à un serveur.
      </p>
      <button className="btn btn-teal" onClick={() => setTab('data')}>Aller à l'onglet Données</button>
    </div>
  );
}

export default function App() {
  return (
    <DashboardProvider>
      <Shell />
    </DashboardProvider>
  );
}
