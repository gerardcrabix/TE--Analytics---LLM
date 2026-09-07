import { Field, Select } from './Field';

/** Renders a chosen subset of the geo/BU/segment/... filter selects, wired
 * to the shared `useGeoOptions()` result. Every tab in the original
 * prototype repeated this same block of <select>s with a different subset —
 * here it's one component driven by a `fields` whitelist. */
export function GeoFilterFields({ fields, opts, style, selectStyle }) {
  const has = (k) => fields.includes(k);
  return (
    <>
      {has('bu') && (
        <Field label="Business Unit" style={style}>
          <Select value={opts.geoBuValue} onChange={opts.onGeoBuChange} style={selectStyle}>
            <option value="all">Toutes BU</option>
            {opts.businessUnitOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>
      )}
      {has('year') && (
        <Field label="Année" style={style}>
          <Select value={opts.geoYearValue} onChange={opts.onGeoYearChange} style={selectStyle}>
            <option value="all">Toutes années</option>
            {opts.yearOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>
      )}
      {has('month') && (
        <Field label="Mois" style={style}>
          <Select value={opts.geoMonthValue} onChange={opts.onGeoMonthChange} style={selectStyle}>
            <option value="all">Tous les mois (cumul)</option>
            {opts.monthOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>
      )}
      {has('region') && (
        <Field label="Géo (région)" style={style}>
          <Select value={opts.geoRegionValue} onChange={opts.onGeoRegionChange} style={selectStyle}>
            <option value="all">Toutes régions</option>
            {opts.regionOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>
      )}
      {has('country') && (
        <Field label="Pays" style={style}>
          <Select value={opts.geoCountryValue} onChange={opts.onGeoCountryChange} style={selectStyle}>
            <option value="all">Tous pays</option>
            {opts.countryOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>
      )}
      {has('segment') && (
        <Field label="Segment" style={style}>
          <Select value={opts.geoSegmentValue} onChange={opts.onGeoSegmentChange} style={selectStyle}>
            <option value="all">Tous segments</option>
            {opts.segmentOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>
      )}
      {has('jobFunction') && (
        <Field label="Équipe / Fonction" style={style}>
          <Select value={opts.geoJobFunctionValue} onChange={opts.onGeoJobFunctionChange} style={selectStyle}>
            <option value="all">Toutes équipes</option>
            {opts.jobFunctionOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>
      )}
      {has('opStatus') && (
        <Field label="Population" style={style}>
          <Select value={opts.geoOpStatusValue} onChange={opts.onGeoOpStatusChange} style={selectStyle}>
            <option value="all">Tous (Operator+Non-Operator)</option>
            {opts.opStatusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>
      )}
      {has('operator') && (
        <Field label="Opérateur" style={style}>
          <Select value={opts.operator} onChange={opts.onGeoOperatorChange} style={selectStyle}>
            <option value="all">Tous (ChatGPT+Copilot+TelMe)</option>
            <option value="chatgpt">ChatGPT</option>
            <option value="copilot">Copilot</option>
            <option value="telme">TelMe</option>
          </Select>
        </Field>
      )}
    </>
  );
}
