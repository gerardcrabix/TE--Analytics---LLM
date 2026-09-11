import { useRef, useState } from 'react';
import { useDashboard } from '../../state/DashboardContext';
import { datasetSummary } from '../../lib/xlsxImport';
import { extractPptxBranding } from '../../lib/branding';
import { loadJSON, saveJSON, KEYS } from '../../lib/storage';

export function DataTab() {
  const {
    idx, dataMsg, dataHistory, runImport, resetData, backupAll, clearAllData, restoreBackupFile,
    importLog, showImportLog, toggleImportLog,
    actionLog, addActionLogEntry, removeActionLogEntry,
    branding, setBranding, clearBranding,
  } = useDashboard();
  const usageInputRef = useRef(null);
  const employeesInputRef = useRef(null);
  const restoreInputRef = useRef(null);
  const [usageFileName, setUsageFileName] = useState(null);
  const [employeesFileName, setEmployeesFileName] = useState(null);
  const [settings, setSettings] = useState(() => loadJSON(KEYS.settings, {}));
  const [brandingBusy, setBrandingBusy] = useState(false);
  const [brandingError, setBrandingError] = useState(null);
  const [logDate, setLogDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [logScope, setLogScope] = useState('');
  const [logAction, setLogAction] = useState('');

  const summary = datasetSummary(idx.dash);

  const onImport = () => {
    runImport(usageInputRef.current?.files?.[0] || null, employeesInputRef.current?.files?.[0] || null);
  };

  const saveSettings = (patch) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveJSON(KEYS.settings, next);
  };

  const onBrandingFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBrandingBusy(true);
    setBrandingError(null);
    try {
      setBranding(await extractPptxBranding(file));
    } catch (err) {
      setBrandingError(String((err && err.message) || err));
    } finally {
      setBrandingBusy(false);
    }
    e.target.value = '';
  };

  const onAddActionLog = () => {
    addActionLogEntry(logScope, logAction, logDate);
    setLogScope('');
    setLogAction('');
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
          <button className="btn" onClick={toggleImportLog}>Journal d'import</button>
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

      {showImportLog && (
        <div style={{ position: 'fixed', inset: 0, background: 'oklch(20% 0.01 60 / 55%)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={toggleImportLog}>
          <div style={{ background: 'white', borderRadius: 12, maxWidth: 640, width: '92%', maxHeight: '80vh', overflow: 'auto', padding: '20px 22px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700 }}>Journal du dernier import</div>
              <button onClick={toggleImportLog} style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--muted-2)' }}>×</button>
            </div>
            {importLog ? (
              <>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
                  {new Date(importLog.ts).toLocaleString('fr-FR')} — durée {(importLog.durationMs / 1000).toFixed(1)}s
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>Fichier usage : {importLog.usage ? importLog.usage.fileName || '—' : '—'}</div>
                <div style={{ fontSize: 12, color: 'oklch(35% 0.01 60)', marginBottom: 4 }}>
                  Lignes lues : {importLog.usage ? importLog.usage.rowsRead : 0} — ajoutées : {importLog.usageAdded} — mises à jour : {importLog.usageUpdated} — rejetées : {importLog.usage ? importLog.usage.rowsRejected : 0}
                </div>
                {importLog.usage?.opStatusCounts && Object.keys(importLog.usage.opStatusCounts).length > 0 && (
                  <div style={{ fontSize: 12, color: 'oklch(40% 0.1 55)', marginBottom: 4 }}>
                    Répartition Operator/Non-Operator détectée : {Object.entries(importLog.usage.opStatusCounts).map(([k, v]) => `${k} : ${v}`).join(', ')}
                  </div>
                )}
                {importLog.usage?.missingCols?.length > 0 && (
                  <div style={{ fontSize: 12, color: 'oklch(40% 0.1 55)', marginBottom: 4 }}>⚠ Colonnes introuvables dans l'en-tête : {importLog.usage.missingCols.join(', ')}</div>
                )}
                {importLog.usage?.rejectSamples?.length > 0 && (
                  <>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)', margin: '6px 0 4px' }}>Exemples de lignes rejetées :</div>
                    {importLog.usage.rejectSamples.map((s, i) => (
                      <div key={i} style={{ fontSize: 11.5, color: 'var(--muted)', padding: '2px 0' }}>Ligne {s.row} : {s.reason}</div>
                    ))}
                  </>
                )}
                <div style={{ height: 1, background: 'var(--border)', margin: '14px 0' }} />
                <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>Fichier employés : {importLog.employees ? importLog.employees.fileName || '—' : '—'}</div>
                <div style={{ fontSize: 12, color: 'oklch(35% 0.01 60)', marginBottom: 4 }}>
                  Lignes lues : {importLog.employees ? importLog.employees.rowsRead : 0} — rejetées : {importLog.employees ? importLog.employees.rowsRejected : 0} — total après import : {importLog.employeesCount}
                </div>
                {importLog.employees?.missingCols?.length > 0 && (
                  <div style={{ fontSize: 12, color: 'oklch(40% 0.1 55)' }}>⚠ Colonnes introuvables dans l'en-tête : {importLog.employees.missingCols.join(', ')}</div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>Aucun import n'a encore été effectué.</div>
            )}
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 18, marginBottom: 16 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>Sauvegarde complète</div>
        <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: '0 0 12px' }}>
          Exportez l'intégralité des données actuelles (usage, employés, scénarios, historique) dans un fichier
          de sauvegarde, videz le jeu de données pour repartir de zéro, ou réimportez une sauvegarde précédente.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-teal" onClick={backupAll}>Sauvegarder toutes les données</button>
          <button
            style={{ padding: '9px 14px', borderRadius: 7, border: '1px solid oklch(58% 0.15 25)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', background: 'white', color: 'oklch(50% 0.15 25)' }}
            onClick={clearAllData}
          >
            Vider les données actuelles
          </button>
          <label
            style={{ display: 'inline-block', padding: '9px 14px', borderRadius: 7, border: '1px solid oklch(85% 0.008 60)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', background: 'white', color: 'oklch(45% 0.01 60)' }}
          >
            Réimporter une sauvegarde
            <input
              type="file" accept=".json" ref={restoreInputRef} style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) restoreBackupFile(f); e.target.value = ''; }}
            />
          </label>
        </div>
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

      <div className="card" style={{ padding: '16px 18px', margin: '16px 0' }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>Modèle PPTx (branding du rapport)</div>
        <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: '0 0 10px' }}>
          Importez un .pptx existant : logo, couleurs et police en sont extraits et réutilisés pour le rapport généré dans l'onglet Rapport.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <label style={{ display: 'inline-block', padding: '8px 14px', borderRadius: 7, border: '1px solid var(--purple)', color: 'var(--purple)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            {brandingBusy ? 'Extraction…' : 'Importer un modèle (.pptx)'}
            <input type="file" accept=".pptx" onChange={onBrandingFileChange} style={{ display: 'none' }} />
          </label>
          {branding && (
            <>
              {branding.logoBase64 && <img src={branding.logoBase64} style={{ height: 32, maxWidth: 120, objectFit: 'contain' }} alt="Logo" />}
              <div style={{ display: 'flex', gap: 4 }}>
                {Object.values(branding.colors || {}).filter(Boolean).map((c, i) => (
                  <div key={i} style={{ width: 18, height: 18, borderRadius: 4, border: '1px solid var(--border)', background: c }} />
                ))}
              </div>
              <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{branding.fontFamily || 'Police par défaut'} — {branding.fileName}</span>
              <button onClick={clearBranding} style={{ border: 'none', background: 'none', color: 'oklch(58% 0.15 25)', fontSize: 11.5, cursor: 'pointer', textDecoration: 'underline' }}>Retirer</button>
            </>
          )}
        </div>
        {brandingError && <div style={{ marginTop: 8, fontSize: 11.5, color: 'oklch(35% 0.1 55)' }}>Erreur : {brandingError}</div>}
      </div>

      <div className="card" style={{ padding: '16px 18px', marginBottom: 16 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>Journal des actions exécutées</div>
        <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: '0 0 10px' }}>
          Consignez les plans d'action déjà lancés (par domaine/métier/géo) pour que le rapport ne les repropose pas.
        </p>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          <input type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} style={{ padding: '7px 8px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 12 }} />
          <input type="text" value={logScope} onChange={(e) => setLogScope(e.target.value)} placeholder="Périmètre (ex: Maintenance Technician, France…)" className="field-control" style={{ flex: 1, minWidth: 160 }} />
          <input type="text" value={logAction} onChange={(e) => setLogAction(e.target.value)} placeholder="Action menée (ex: formation ciblée réalisée)" className="field-control" style={{ flex: 1, minWidth: 160 }} />
          <button onClick={onAddActionLog} style={{ padding: '7px 14px', borderRadius: 7, border: 'none', background: 'var(--purple)', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Ajouter</button>
        </div>
        {[...actionLog].reverse().map((l) => (
          <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--row-border)', fontSize: 12 }}>
            <span style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{l.date}</span>
            <span style={{ flex: 1 }}><b>{l.scope}</b> — {l.action}</span>
            <button onClick={() => removeActionLogEntry(l.id)} style={{ border: 'none', background: 'none', color: 'oklch(58% 0.15 25)', cursor: 'pointer', fontSize: 11.5 }}>Retirer</button>
          </div>
        ))}
        {actionLog.length === 0 && <div style={{ fontSize: 11.5, color: 'var(--muted-2)' }}>Aucune action consignée.</div>}
      </div>
    </div>
  );
}
