import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import { computeGeoAgg, countryLabel, fmt, metricValue, pct, sizeMetricValue } from '../lib/dashboardIndex';

let worldFeaturesPromise = null;
function loadWorldFeatures() {
  // Bundled locally (public/world-110m.json, from the `world-atlas` npm
  // package) rather than fetched from a CDN at runtime — keeps the map
  // working offline/behind a corporate firewall and avoids depending on an
  // external host being reachable.
  if (!worldFeaturesPromise) {
    worldFeaturesPromise = fetch(`${import.meta.env.BASE_URL}world-110m.json`)
      .then((r) => r.json())
      .then((topo) => topojson.feature(topo, topo.objects.countries).features);
  }
  return worldFeaturesPromise;
}

/** Orthographic globe / flat world map with usage bubbles, ported from the
 * prototype's d3 rendering. Rotation is kept in a ref (not React state) so
 * dragging stays smooth — only the redraw touches the DOM directly, exactly
 * like the original. */
export const WorldMap = forwardRef(function WorldMap({ idx, geo, countryCentroids, pinnedCountryIdx, includeContractors = true, onHoverCountry, onSelectCountry }, ref) {
  const containerRef = useRef(null);
  const rotationRef = useRef([10, -20]);
  const worldFeaturesRef = useRef(null);
  const svgSelRef = useRef(null);
  const projectionRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);
  const latestPropsRef = useRef({ idx, geo, countryCentroids, pinnedCountryIdx, includeContractors });
  latestPropsRef.current = { idx, geo, countryCentroids, pinnedCountryIdx, includeContractors };

  useEffect(() => {
    let cancelled = false;
    loadWorldFeatures().then((features) => {
      if (cancelled) return;
      worldFeaturesRef.current = features;
      drawFrame();
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function drawFrame() {
    const container = containerRef.current;
    if (!container || !worldFeaturesRef.current) return;
    const { idx, geo, countryCentroids, pinnedCountryIdx, includeContractors } = latestPropsRef.current;
    const width = container.clientWidth || 800, height = 500;
    let svg = d3.select(container).select('svg');
    if (svg.empty()) {
      svg = d3.select(container).append('svg').attr('width', '100%').attr('height', height).attr('viewBox', `0 0 ${width} ${height}`);
      svg.append('g').attr('class', 'basemap');
      svg.append('g').attr('class', 'bubbles');
      svg.call(d3.drag().on('drag', (event) => {
        rotationRef.current[0] += event.dx * 0.4;
        rotationRef.current[1] = Math.max(-90, Math.min(90, rotationRef.current[1] - event.dy * 0.4));
        drawFrame();
      }));
    }
    svgSelRef.current = svg;
    const isGlobe = geo.view === 'globe';
    const scale = isGlobe ? Math.min(width, height) / 2 - 10 : width / 6.3;
    const projection = isGlobe
      ? d3.geoOrthographic().scale(scale).translate([width / 2, height / 2]).rotate(rotationRef.current).clipAngle(90)
      : d3.geoNaturalEarth1().fitSize([width, height], { type: 'Sphere' });
    projectionRef.current = projection;
    const path = d3.geoPath(projection);
    const g = svg.select('.basemap');
    let ocean = g.select('.ocean');
    if (isGlobe) {
      if (ocean.empty()) ocean = g.append('circle').attr('class', 'ocean');
      ocean.attr('cx', width / 2).attr('cy', height / 2).attr('r', projection.scale())
        .attr('fill', 'oklch(94% 0.01 210)').attr('stroke', 'oklch(85% 0.01 210)');
    } else {
      g.select('.ocean').remove();
    }
    const countries = g.selectAll('path.country').data(worldFeaturesRef.current);
    countries.enter().append('path').attr('class', 'country').merge(countries)
      .attr('d', path).attr('fill', 'oklch(90% 0.008 150)').attr('stroke', 'oklch(82% 0.008 150)').attr('stroke-width', 0.5);
    countries.exit().remove();

    const agg = computeGeoAgg(idx, geo, includeContractors);
    const rows = [];
    for (const [countryIdx, c] of agg.byCountry) {
      const code = idx.dash.dicts.countries[countryIdx];
      const centroid = countryCentroids[code];
      if (!centroid) continue;
      rows.push({ countryIdx, lat: centroid[0], lon: centroid[1], c, metricVal: metricValue(c, geo.metric), sizeVal: sizeMetricValue(c, geo.sizeMetric || 'headcount') });
    }
    const maxSize = Math.max(1, ...rows.map((r) => r.sizeVal));
    const rScale = d3.scaleSqrt().domain([0, maxSize]).range([3, 26]);
    const isShare = geo.metric === 'activeShare' || geo.metric === 'noUsageShare';
    const colorScale = d3.scaleLinear().domain([0, 100]).range(['oklch(60% 0.13 55)', 'oklch(58% 0.11 190)']);
    const bg = svg.select('.bubbles');
    const sel = bg.selectAll('circle.bubble').data(rows, (d) => d.countryIdx);
    sel.enter().append('circle').attr('class', 'bubble')
      .on('mouseenter', function (e, d) {
        const inactive = d.c.headcount.size - d.c.active.size;
        const share = pct(d.c.headcount.size ? (d.c.active.size / d.c.headcount.size) * 100 : 0);
        setTooltip({
          x: d._cx, y: d._cy,
          html: `<b>${countryLabel(d.countryIdx, idx.dash)}</b><br>Effectif : ${fmt(d.c.headcount.size)}<br>Actifs : ${fmt(d.c.active.size)} (${share})<br>Inactifs : ${fmt(inactive)}<br>Prompts : ${fmt(d.c.prompts)}`,
        });
        onHoverCountry(d.countryIdx);
      })
      .on('mouseleave', () => { setTooltip(null); onHoverCountry(null); })
      .on('click', (e, d) => onSelectCountry(d.countryIdx))
      .merge(sel)
      .attr('cx', (d) => { const p = projection([d.lon, d.lat]); d._cx = p ? p[0] : -9999; d._cy = p ? p[1] : -9999; return d._cx; })
      .attr('cy', (d) => d._cy)
      .attr('r', (d) => rScale(d.sizeVal))
      .attr('fill', (d) => (isShare ? colorScale(d.metricVal) : 'oklch(58% 0.11 190)'))
      .attr('fill-opacity', 0.78)
      .attr('stroke', (d) => (d.countryIdx === pinnedCountryIdx ? 'oklch(25% 0.01 60)' : 'white'))
      .attr('stroke-width', (d) => (d.countryIdx === pinnedCountryIdx ? 2.5 : 1.2))
      .style('cursor', 'pointer')
      .style('display', (d) => {
        if (!isGlobe) return null;
        const r = projection.rotate();
        return d3.geoDistance([d.lon, d.lat], [-r[0], -r[1]]) < Math.PI / 2 ? null : 'none';
      });
    sel.exit().remove();
  }

  useEffect(() => {
    drawFrame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, geo, countryCentroids, pinnedCountryIdx, includeContractors]);

  useEffect(() => {
    const onResize = () => drawFrame();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(ref, () => ({
    rotateToCountry(code) {
      const centroid = countryCentroids[code];
      if (centroid) {
        rotationRef.current = [-centroid[1], -centroid[0]];
        drawFrame();
      }
    },
  }));

  return (
    <div style={{ position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%', height: 500 }} />
      {tooltip && (
        <div
          style={{
            position: 'absolute', pointerEvents: 'none', left: tooltip.x + 14, top: tooltip.y - 10,
            background: 'white', border: '1px solid var(--border-2)', borderRadius: 8, padding: '9px 12px',
            fontSize: 11.5, lineHeight: 1.6, boxShadow: '0 4px 14px rgba(0,0,0,.14)', zIndex: 5, color: 'oklch(30% 0.01 60)', maxWidth: 200,
          }}
          dangerouslySetInnerHTML={{ __html: tooltip.html }}
        />
      )}
      <div style={{ position: 'absolute', bottom: 16, left: 16, fontSize: 11, color: 'var(--muted-2)', background: 'rgba(255,255,255,.85)', padding: '4px 8px', borderRadius: 6 }}>
        Glisser pour tourner le globe · taille = volume · couleur = adoption
      </div>
    </div>
  );
});
