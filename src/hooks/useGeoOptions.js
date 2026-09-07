import { useMemo } from 'react';
import { countryLabel as countryLabelFor } from '../lib/geoRef';

/** Builds every filter-select's option list (with the BU<->Segment
 * cascading the original prototype grew through several rounds of feedback)
 * plus their onChange handlers, so tabs just spread `{...geoOptions}` into
 * their filter bar instead of re-deriving this per tab. */
export function useGeoOptions(idx, geo, updateGeo) {
  return useMemo(() => {
    const dash = idx.dash;
    const monthOptions = dash.months
      .map((m, i) => ({ value: String(i), label: m.label, year: m.year }))
      .filter((o) => geo.year === 'all' || o.year === geo.year);
    const regionOptions = dash.dicts.regions.map((r, i) => ({ value: String(i), label: r }));
    const jobFunctionOptions = dash.dicts.jobFunctions
      .map((s, i) => ({ value: String(i), label: s }))
      .filter((o) => o.label);
    const allowedSegForBu = geo.bu !== 'all' ? idx.buToSegments.get(geo.bu) : null;
    const allowedBuForSeg = geo.segment !== 'all' ? idx.segmentToBus.get(geo.segment) : null;
    const segmentOptions = dash.dicts.segments
      .map((s, i) => ({ value: String(i), label: s }))
      .filter((o) => !allowedSegForBu || allowedSegForBu.has(Number(o.value)));
    const businessUnitOptions = dash.dicts.businessUnits
      .map((b, i) => ({ value: String(i), label: b }))
      .filter((o) => !allowedBuForSeg || allowedBuForSeg.has(Number(o.value)));
    const opStatusOptions = dash.dicts.operatorStatuses.map((s, i) => ({ value: String(i), label: s }));
    const yearsSet = [...new Set(dash.months.map((m) => m.year))].sort((a, b) => a - b);
    const yearOptions = yearsSet.map((y) => ({ value: String(y), label: String(y) }));
    const countryOptions = dash.dicts.countries
      .map((code, i) => ({ value: String(i), label: countryLabelFor(code) }))
      .sort((a, b) => a.label.localeCompare(b.label));

    const values = {
      geoMonthValue: geo.month === 'all' ? 'all' : String(geo.month),
      geoRegionValue: geo.region === 'all' ? 'all' : String(geo.region),
      geoSegmentValue: geo.segment === 'all' ? 'all' : String(geo.segment),
      geoJobFunctionValue: geo.jobFunction === 'all' ? 'all' : String(geo.jobFunction),
      geoBuValue: geo.bu === 'all' ? 'all' : String(geo.bu),
      geoOpStatusValue: geo.opStatus === 'all' ? 'all' : String(geo.opStatus),
      geoYearValue: geo.year === 'all' ? 'all' : String(geo.year),
      geoCountryValue: geo.country === 'all' ? 'all' : String(geo.country),
    };

    const handlers = {
      onGeoMonthChange: (e) => updateGeo({ month: e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10) }),
      onGeoYearChange: (e) => {
        const v = e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10);
        updateGeo((g) => {
          let month = g.month;
          if (v !== 'all' && month !== 'all' && dash.months[month].year !== v) month = 'all';
          return { year: v, month };
        });
      },
      onGeoCountryChange: (e) => updateGeo({ country: e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10) }),
      onGeoRegionChange: (e) => updateGeo({ region: e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10) }),
      onGeoSegmentChange: (e) => {
        const v = e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10);
        updateGeo((g) => {
          let bu = g.bu;
          if (v !== 'all' && bu !== 'all' && !(idx.segmentToBus.get(v) || new Set()).has(bu)) bu = 'all';
          return { segment: v, bu };
        });
      },
      onGeoJobFunctionChange: (e) => updateGeo({ jobFunction: e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10) }),
      onGeoBuChange: (e) => {
        const v = e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10);
        updateGeo((g) => {
          let seg = g.segment;
          if (v !== 'all' && seg !== 'all' && !(idx.buToSegments.get(v) || new Set()).has(seg)) seg = 'all';
          return { bu: v, segment: seg };
        });
      },
      onGeoOpStatusChange: (e) => updateGeo({ opStatus: e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10) }),
      onGeoOperatorChange: (e) => updateGeo({ operator: e.target.value }),
      onGeoMetricChange: (e) => updateGeo({ metric: e.target.value, sortBy: 'share', sortDir: 'desc' }),
      onGeoSizeMetricChange: (e) => updateGeo({ sizeMetric: e.target.value }),
    };

    return { monthOptions, regionOptions, jobFunctionOptions, segmentOptions, businessUnitOptions, opStatusOptions, yearOptions, countryOptions, ...values, ...handlers };
  }, [idx, geo, updateGeo]);
}
