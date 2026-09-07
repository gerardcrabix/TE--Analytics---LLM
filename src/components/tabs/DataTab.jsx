import { useRef, useState } from 'react';
import { useDashboard } from '../../state/DashboardContext';
import { datasetSummary } from '../../lib/xlsxImport';
import { loadJSON, saveJSON, KEYS } from '../../lib/storage';

export function DataTab() {
  const { idx, dataMsg, dataHistory, runImport, resetData } = useDashboard();
  const usageInputRef = useRef(null);
  const employeesInputRef = useRef(null);
  const [usageFileName, setUsageFileName] = useState(null);
  const [employeesFileName, setEmployeesFileName] = useState(null);
  const [settings, setSettings] = useState(() => loadJSON(KEYS.settings, {}));

  const summary = datasetSummary(idx.dash);

  const onImport = () => {
    runImport(usageInputRef.current?.files?.[0] || null, employeesInputRef.current?.files?.[0] || null);
  };

  const saveSettings = (patch) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveJSON(KEYS.settings, next);
  };

  return (
    <div style={{ maxWidth: 760 }}>
      <h1 className="h1-title">Données</h1>
      <p className="h1-sub">
        Importez un nouveau mois d'usage LLM ou un nouveau référentiel employés (.xlsx). Rien n'est envoyé
        à un serveur : tout est parsé dans le navigateur et stocké en local (localStorage). Ce dépôt Git ne
        contient aucune donnée personnelle.
      </p>

      <div className="card" style={{ padding: '16px 18px', marginBottom: 16 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>Jeu de données actuel</div>
        <div style={{ fontSize: 12.5, color: 'oklch(35% 0.01 60)', lineHeight: 1.7 }}>
          Mois couverts : <b>{summary.monthRange}</b> ({summary.months} mois)<br />
          Employés référencés : <b>{summary.employees}</b><br />
          Lignes d'usage : <b>{summary.usageRows}</b>
        </div>
      </div>

      <div className="card" style={{ padding: 18, marginBottom: 16 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 12 }}>Importer de nouveaux fichiers</div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)', marginBottom: 5 }}>
            <b style={{ color: 'var(--text)' }}>Usage LLM (.xlsx)</b> — ajoute un nouveau mois ou met à jour un mois existant.
            Sélectionnez ce fichier pour activer la hiérarchie Job family / Job description.
          </label>
          <input type="file" accept=".xlsx" ref={usageInputRef} onChange={(e) => setUsageFileName(e.target.files?.[0]?.name || null)} style={{ fontSize: 12 }} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)', marginBottom: 5 }}>
            Référentiel employés (.xlsx) — remplace intégralement l'organigramme
          </label>
          <input type="file" accept=".xlsx" ref={employeesInputRef} onChange={(e) => setEmployeesFileName(e.target.files?.[0]?.name || null)} style={{ fontSize: 12 }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn btn-teal" disabled={dataMsg.busy} onClick={onImport}>
            {dataMsg.busy ? 'Import en cours…' : 'Importer'}
          </button>
          <button className="btn" onClick={resetData}>Réinitialiser (effacer toutes les données)</button>
        </div>
        {(usageFileName || employeesFileName) && (
          <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--muted)' }}>
            Sélectionné : {usageFileName || '—'} {employeesFileName ? '· ' + employeesFileName : ''}
          </div>
        )}
        {dataMsg.message && (
          <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--green-bg)', color: 'oklch(32% 0.1 145)', borderRadius: 8, fontSize: 12.5 }}>{dataMsg.message}</div>
        )}
        {dataMsg.error && (
          <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--amber-bg)', color: 'var(--amber-dark)', borderRadius: 8, fontSize: 12.5 }}>Erreur : {dataMsg.error}</div>
        )}
      </div>

      <div className="card" style={{ padding: 18, marginBottom: 16 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>Recommandations (optionnel)</div>
        <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: '0 0 10px' }}>
          Pour que l'onglet Recommandations rédige la synthèse via l'API Anthropic plutôt qu'un résumé local,
          collez une clé API. Elle reste uniquement dans le navigateur (localStorage) — jamais envoyée ailleurs
          qu'à api.anthropic.com, et jamais commitée dans ce dépôt.
        </p>
        <input
          type="password"
          placeholder="sk-ant-…"
          defaultValue={settings.anthropicApiKey || ''}
          onBlur={(e) => saveSettings({ anthropicApiKey: e.target.value.trim() || undefined })}
          className="field-control"
          style={{ width: '100%', maxWidth: 360 }}
        />
      </div>

      <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 10 }}>Historique des imports</div>
      {dataHistory.length === 0 ? (
        <div className="empty-state">Aucun import effectué pour l'instant.</div>
      ) : (
        [...dataHistory].reverse().map((h) => (
          <div key={h.ts} className="card" style={{ padding: '12px 16px', marginBottom: 10, fontSize: 12.5, color: 'oklch(35% 0.01 60)', lineHeight: 1.6 }}>
            <b>{new Date(h.ts).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</b>
            {' — '}
            {h.usageAdded} ligne(s) ajoutée(s), {h.usageUpdated} mise(s) à jour
            {h.newMonths?.length ? ', nouveaux mois : ' + h.newMonths.join(', ') : ''}
            {h.employeesReplaced ? ', référentiel employés remplacé (' + h.employeesCount + ')' : ''}
            <br />
            <span style={{ color: 'var(--muted-2)', fontSize: 11.5 }}>
              Avant import : {h.prevSummary ? `${h.prevSummary.usageRows} lignes, ${h.prevSummary.employees} employés, ${h.prevSummary.monthRange}` : '—'}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
