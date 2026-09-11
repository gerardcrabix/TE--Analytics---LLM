import { computeGeoAgg, computeKolCandidates } from './dashboardIndex';
import { loadJSON, KEYS } from './storage';

export function computeRecoSnapshot(idx, f, kol, includeContractors = true) {
  const opStatus = f.opStatus !== undefined ? f.opStatus : 'all';
  const year = f.year !== undefined ? f.year : 'all', month = f.month !== undefined ? f.month : 'all';
  const agg = computeGeoAgg(idx, { year, month, region: f.region, country: f.country, segment: 'all', jobFunction: f.jobFunction, bu: f.bu, operator: 'all', opStatus }, includeContractors);
  const byOperator = {};
  ['chatgpt', 'copilot', 'telme'].forEach((op) => {
    const a = computeGeoAgg(idx, { year, month, region: f.region, country: f.country, segment: 'all', jobFunction: f.jobFunction, bu: f.bu, operator: op, opStatus }, includeContractors);
    byOperator[op] = a.totals.prompts;
  });
  const kols = computeKolCandidates(idx, { minPrompts: kol.minPrompts, months: kol.months, region: f.region, country: f.country, segment: 'all', jobFunction: f.jobFunction, bu: f.bu, opStatus }, includeContractors);
  return {
    headcount: agg.totals.headcount, active: agg.totals.active,
    adoptionRate: agg.totals.headcount ? Math.round((agg.totals.active / agg.totals.headcount) * 100) : 0,
    prompts: agg.totals.prompts, byOperator, kolCount: kols.length,
  };
}

function buildPrompt({ buLabel, regionLabel, countryLabel, teamLabel, popLabel, snapshot }) {
  return `Tu es consultant en adoption d'IA générative en entreprise (TE Energy, division ENG). Voici les statistiques d'usage LLM pour le périmètre sélectionné :
- Business Unit : ${buLabel}
- Région : ${regionLabel}
- Pays : ${countryLabel}
- Équipe / fonction : ${teamLabel}
- Population : ${popLabel}
- Effectif : ${snapshot.headcount}
- Utilisateurs actifs : ${snapshot.active} (taux d'adoption ${snapshot.adoptionRate}%)
- Prompts cumulés : ${snapshot.prompts} (ChatGPT: ${snapshot.byOperator.chatgpt}, Copilot: ${snapshot.byOperator.copilot}, TelMe: ${snapshot.byOperator.telme})
- Nombre de Key Opinion Leaders (KOL) identifiés dans ce périmètre : ${snapshot.kolCount}

Rédige une synthèse courte (2-3 phrases) puis 3 à 5 recommandations d'actions concrètes et ciblées pour augmenter le taux d'usage des LLM sur ce périmètre précis. Sois spécifique (qui, quoi, comment), pas générique. Réponds en français, en texte simple sans markdown.`;
}

function fallbackText({ snapshot, buLabel, teamLabel }) {
  const gap = 100 - snapshot.adoptionRate;
  const lines = [
    `Sur ce périmètre (${buLabel} / ${teamLabel}), ${snapshot.active} des ${snapshot.headcount} personnes suivies ont utilisé un LLM, soit un taux d'adoption de ${snapshot.adoptionRate}% (${gap} points restant à combler). ${snapshot.kolCount} KOL sont déjà identifiés dans ce périmètre.`,
    '',
    'Recommandations :',
    `1. Mobiliser les ${snapshot.kolCount || 0} KOL du périmètre pour animer une session de démonstration ciblée auprès des collègues à faible usage de leur équipe (onglet KOL & influence, sphère d'influence).`,
    "2. Prioriser les job descriptions où le taux d'actifs Non-Operator est le plus bas (onglet Managérial/Domaine, encart Plan d'action) pour une campagne de formation courte.",
    `3. Suivre l'évolution mensuelle du taux d'adoption sur ce périmètre après chaque nouvel import de données, pour vérifier l'effet des actions ci-dessus.`,
    `4. Comparer l'usage par opérateur (ChatGPT: ${snapshot.byOperator.chatgpt}, Copilot: ${snapshot.byOperator.copilot}, TelMe: ${snapshot.byOperator.telme}) pour orienter la formation vers l'outil le moins adopté.`,
    '',
    "Recommandation générée localement (aucune clé API configurée dans l'onglet Données). Renseignez une clé Anthropic pour obtenir une synthèse rédigée par Claude.",
  ];
  return lines.join('\n');
}

/** Calls the Anthropic Messages API directly from the browser using a key
 * the user pasted into Settings (stored only in localStorage, never
 * committed to this repo). Falls back to a deterministic local summary when
 * no key is configured, or if the call fails. */
export async function generateRecommendationText(ctx) {
  const prompt = buildPrompt(ctx);
  const settings = loadJSON(KEYS.settings, {});
  const apiKey = settings.anthropicApiKey;
  if (!apiKey) return fallbackText(ctx);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: settings.anthropicModel || 'claude-sonnet-5',
        max_tokens: 700,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`API ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = await res.json();
    const text = (data.content || []).map((b) => b.text || '').join('').trim();
    return text || fallbackText(ctx);
  } catch (err) {
    return fallbackText(ctx) + `\n\n(Appel API Anthropic échoué : ${err.message})`;
  }
}
