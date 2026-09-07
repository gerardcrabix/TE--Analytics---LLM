# Usage LLM — TE Energy

Analytics dashboard for LLM (ChatGPT / Copilot / TelMe) adoption across TE Energy /
ENG: a world map of usage, Key Opinion Leader detection with sphere-of-influence
lookup, a managerial/domain tree for building action plans, an
Operator/Non-Operator reclassification simulator, targeted recommendations, and
a dynamic pivot analysis.

This is a React + Vite implementation of a dashboard originally prototyped in
[Claude Design](https://claude.ai/design) (see the design handoff notes below).

## No data is stored in this repository

**Nothing here contains real employee or usage data.** The app ships empty —
there is no server and no database. All data lives in the browser:

1. Go to the **Données** tab.
2. Import the monthly "Usage LLM" export (`.xlsx`) and/or the employee
   referential export (`.xlsx`).
3. Files are parsed entirely client-side (via [SheetJS](https://sheetjs.com/))
   and the resulting dataset is kept in `localStorage`, scoped to your
   browser profile. Nothing is uploaded anywhere.
4. Re-importing a new month's Usage file merges it in (existing rows for
   the same person/month are updated in place); re-importing the Employees
   file replaces the whole org referential. Import history is kept so you
   can see what changed at each step.
5. "Réinitialiser" clears everything back to the empty state.

Because of this, every screenshot, commit, and code review in this repo is
free of PII by construction — there is nothing to leak.

### Recommendations tab

The Recommandations tab can call the Anthropic API directly from the browser
to draft a synthesis + action plan for the selected scope. This is optional:

- Without an API key, it falls back to a deterministic local summary built
  from the same stats.
- To use Claude instead, paste an API key in the **Données** tab (under
  "Recommandations (optionnel)"). The key is stored only in `localStorage`
  and is sent only to `api.anthropic.com` — never committed, never sent
  anywhere else.

## Expected file formats

**Usage LLM (.xlsx)** — one row per person per month, with (at least) these
columns: `email_address`, `country`, `region`, `hr_business_segment`,
`hr_business_unit`, `job_function`, `operator_status`, `year`, `month`,
`chatgpt_prompts`, `copilot_total_prompts`, `telme_prompts`, `sum_llm`.
Optional columns `job_family_description`, `job_function_description`,
`job_description`, `user_type` unlock the job-hierarchy view in
Managérial/Domaine (Domaine mode) and the reclassification simulator.

**Employees (.xlsx)** — one row per person, with `USERID`,
`AD_DISPLAY_NAME`, `EMPLOYEE_JOB_DESC`, `EMAIL_ADDRESS`,
`SUPERVISOR_USER_ID` — used to build the managerial tree (N+1/N+2/N+3).

## Development

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build to dist/
npm run lint
```

Stack: React 19, Vite, [d3](https://d3js.org/) + [topojson-client](https://github.com/topojson/topojson-client)
for the globe/flat map (world topology is bundled locally in
`public/world-110m.json`, no CDN dependency at runtime), and
[xlsx (SheetJS)](https://sheetjs.com/) for parsing imports. No backend.

## Design source

This was implemented from a Claude Design handoff bundle (chat transcripts +
an interactive HTML/CSS/JS prototype). The prototype's structure was not
copied 1:1 — this rebuild reorganizes the logic into reusable modules
(`src/lib/dashboardIndex.js` for the aggregation/query layer, one component
per tab, shared filter components) while matching its visual design and
feature set: world map (globe + flat), KOL & influence, Managérial/Domaine
tree with Operator/Non-Operator reclassification simulation, Recommandations,
Analyse dynamique (pivot), and Données (import).
