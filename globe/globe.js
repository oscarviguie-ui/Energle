// ============================================================
//  ATLAS GLOBE — test page at energle.org/globe/ (everything it needs lives in this folder).
//  A plain map on a globe (MapLibre GL, vector tiles from OpenFreeMap: no key, no quota),
//  every country named; click a country to fly to it and read its Energle profile in the panel.
//
//  Only active on the test page (globe/index.html sets window.GLOBE_PAGE).
//  Libraries load from jsDelivr when the globe first opens. Country shapes for clicks and the
//  highlight: Natural Earth 1:50m via world-atlas (public domain), globe/world.json.
//  Map data: © OpenStreetMap contributors, tiles by OpenFreeMap.
// ============================================================
const GLOBE_DIR = 'globe/';
function globeOn() { return !!window.GLOBE_PAGE; }

const GLOBE_LIBS = [
  'https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.js',
  'https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/dist/topojson-client.min.js',
];
const GLOBE_CSS = 'https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.css';
const GLOBE_STYLE = 'https://tiles.openfreemap.org/styles/positron';
const GLOBE_WIDE = '(min-width: 1100px)';
const GLOBE_ACCENT = '#f5a623';
const FOSSIL = ['Coal', 'Gas', 'Other Fossil'];

let GLOBE = null, GLOBE_GEO = null, GLOBE_SEL = null, GLOBE_LOADING = null;

function globeScript(src) {
  return new Promise((ok, fail) => {
    if ([...document.scripts].some(s => s.src === src)) return ok();
    const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => fail(new Error('could not load ' + src));
    document.head.appendChild(s);
  });
}
function globeLoad() {
  if (!GLOBE_LOADING) GLOBE_LOADING = (async () => {
    if (![...document.styleSheets].some(s => s.href === GLOBE_CSS)) {
      const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = GLOBE_CSS; document.head.appendChild(l);
    }
    const [topo] = await Promise.all([fetch(GLOBE_DIR + 'world.json').then(r => r.json()), ...GLOBE_LIBS.map(globeScript)]);
    const known = new Set(COUNTRIES.map(c => c.iso3));
    GLOBE_GEO = topojson.feature(topo, topo.objects.countries);
    GLOBE_GEO.features = GLOBE_GEO.features.filter(f => known.has(f.properties.iso3));
    GLOBE_GEO.features.forEach((f, i) => { f.id = i; f.properties.span = globeSpan(f); });
  })().catch(e => { GLOBE_LOADING = null; throw e; });
  return GLOBE_LOADING;
}

// Widest extent of a shape in degrees (for how far to zoom), handling shapes across the date line
function globeSpan(f) {
  const lats = [], lngs = [];
  const walk = a => typeof a[0] === 'number' ? (lngs.push(a[0]), lats.push(a[1])) : a.forEach(walk);
  // a country in several pieces (France and French Guiana, the US and Alaska...): frame the biggest piece
  const g = f.geometry, parts = g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates];
  walk(parts.reduce((a, b) => (b[0].length > a[0].length ? b : a)));
  const latSpan = Math.max(...lats) - Math.min(...lats);
  const sorted = [...new Set(lngs.map(x => Math.round(x)))].sort((a, b) => a - b);
  let gap = 360 - (sorted[sorted.length - 1] - sorted[0]);
  for (let i = 1; i < sorted.length; i++) gap = Math.max(gap, sorted[i] - sorted[i - 1]);
  const lngSpan = (360 - gap) * Math.cos((Math.max(...lats) + Math.min(...lats)) / 2 * Math.PI / 180);
  return Math.max(latSpan, lngSpan, 0.5);
}

// ---------- the profile shown in the panel ----------
function globeProfile(c) {
  const yd = (ALL_DATA[c.name] && ALL_DATA[c.name].years[c.latestYear]) || {}, tot = yd.Total || 0;
  const src = SOURCES.map(k => ({ k, p: tot ? (yd[k] || 0) / tot : 0, v: yd[k] || 0 })).sort((a, b) => b.p - a.p);
  return { src, low: src.filter(x => !FOSSIL.includes(x.k)).reduce((a, x) => a + x.p, 0), tot, dpc: c.latestDpc };
}
const pct = p => Math.round(p * 100) + '%';
function worldDpcNow() { if (!WORLD_DPC) return null; const ys = Object.keys(WORLD_DPC).map(Number); return WORLD_DPC[Math.max(...ys)]; }
let GLOBE_RANKS = null;
function globeRanks() {
  if (!GLOBE_RANKS) {
    const ps = COUNTRIES.map(c => ({ iso: c.iso3, ...globeProfile(c) }));
    const rank = key => Object.fromEntries([...ps].sort((a, b) => (key(b) || 0) - (key(a) || 0)).map((p, i) => [p.iso, i + 1]));
    GLOBE_RANKS = { tot: rank(p => p.tot), low: rank(p => p.low), dpc: rank(p => p.dpc), n: ps.length };
  }
  return GLOBE_RANKS;
}
// Generation by source over the years, as a small stacked area chart (SVG)
function globeTrend(c) {
  const Y = (ALL_DATA[c.name] || {}).years || {}, yrs = Object.keys(Y).map(Number).sort((a, b) => a - b);
  if (yrs.length < 3) return '';
  const W = 320, H = 96, P = 2, max = Math.max(...yrs.map(y => Y[y].Total || 0)) || 1;
  const x = i => P + i * (W - 2 * P) / (yrs.length - 1), y = v => H - 14 - v / max * (H - 22);
  const base = yrs.map(() => 0);
  const layers = SOURCES.map(k => {
    const lo = base.slice(), hi = yrs.map((yr, i) => (base[i] += (Y[yr][k] || 0)));
    if (!hi.some((v, i) => v - lo[i] > 0)) return '';
    return '<polygon points="' + hi.map((v, i) => x(i).toFixed(1) + ',' + y(v).toFixed(1)).join(' ') + ' '
      + lo.map((v, i) => x(i).toFixed(1) + ',' + y(v).toFixed(1)).reverse().join(' ') + '" fill="' + COLORS[k] + '" opacity=".85"/>';
  }).join('');
  return '<svg class="gl-trend" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Generation by source, ' + yrs[0] + ' to ' + yrs[yrs.length - 1] + '">'
    + layers + '<text x="' + P + '" y="' + (H - 2) + '">' + yrs[0] + '</text><text x="' + (W - P) + '" y="' + (H - 2) + '" text-anchor="end">' + yrs[yrs.length - 1] + '</text>'
    + '<text x="' + (W - P) + '" y="9" text-anchor="end">peak ' + fmtTwh(max) + '</text></svg>';
}
function globeCountryHTML(c) {
  const p = globeProfile(c), wd = worldDpcNow(), R = globeRanks();
  return '<button type="button" class="gl-x" id="gl-x" aria-label="Close">×</button>'
    + '<div class="gl-p-head">' + flagImg(c.iso3, 'gl-flag') + '<div><h3>' + escHtml(c.name) + '</h3><span>' + (REGION_LABEL[c.continent] || '') + ' · ' + c.latestYear + '</span></div></div>'
    + '<div class="gl-p-nums"><span><b>' + fmtTwh(p.tot) + '</b>generated<em>#' + R.tot[c.iso3] + ' of ' + R.n + '</em></span>'
    +   '<span><b>' + (p.dpc != null ? p.dpc.toFixed(1) + ' MWh' : '–') + '</b>per person<em>' + (wd && p.dpc != null ? (p.dpc / wd).toFixed(1) + '× world avg.' : '') + '</em></span>'
    +   '<span><b>' + pct(p.low) + '</b>low-carbon<em>#' + R.low[c.iso3] + ' of ' + R.n + '</em></span></div>'
    + '<span class="gl-p-bar">' + p.src.filter(x => x.p >= 0.005).map(x => '<i style="flex:' + x.p.toFixed(3) + ';background:' + COLORS[x.k] + '"></i>').join('') + '</span>'
    + '<ul class="gl-p-src">' + p.src.filter(x => x.p >= 0.005).map(x => '<li><i style="background:' + COLORS[x.k] + '"></i>' + x.k
      + '<span>' + fmtTwh(x.v) + '</span><b>' + pct(x.p) + '</b></li>').join('') + '</ul>'
    + '<div class="gl-p-trend"><span class="gl-side-h">Generation since ' + Object.keys(ALL_DATA[c.name].years)[0] + '</span>' + globeTrend(c) + '</div>'
    + '<button type="button" class="gl-open" id="gl-open">Open the full profile →</button>';
}
function globeSide() {
  const el = document.getElementById('gl-side'); if (!el) return;
  const wide = matchMedia(GLOBE_WIDE).matches;
  el.innerHTML = GLOBE_SEL ? globeCountryHTML(GLOBE_SEL)
    : wide ? '<p class="gl-empty"><b>Click a country</b>to see its electricity profile: what it generates, how much per person, and how its mix has changed.</p>' : '';
  el.hidden = !GLOBE_SEL && !wide;
  el.classList.toggle('is-country', !!GLOBE_SEL);
  const x = document.getElementById('gl-x'); if (x) x.addEventListener('click', () => globeSelect(null));
  const o = document.getElementById('gl-open'); if (o) o.addEventListener('click', () => browseCountry(GLOBE_SEL.iso3));
}

// ---------- markup ----------
function globeHTML() {
  return '<div class="gl-layout" id="gl-layout">'
    + '<div class="gl-wrap" id="gl-wrap"><div class="gl-canvas" id="gl-canvas" aria-label="Map of the world. Click a country for its electricity profile; the list view is keyboard-friendly."></div>'
    + '<p class="gl-loading" id="gl-loading">Loading the map…</p></div>'
    + '<aside class="gl-side" id="gl-side" aria-live="polite"></aside>'
    + '</div>';
}

// ---------- behaviour ----------
function globeSelect(c, fly = true) {
  GLOBE_SEL = c || null;
  globeSide();
  if (!GLOBE || !GLOBE.getSource('energle')) return;
  GLOBE.setFilter('energle-sel-fill', ['==', ['get', 'iso3'], GLOBE_SEL ? GLOBE_SEL.iso3 : '']);
  GLOBE.setFilter('energle-sel-line', ['==', ['get', 'iso3'], GLOBE_SEL ? GLOBE_SEL.iso3 : '']);
  if (!fly || !GLOBE_SEL) return;
  const f = GLOBE_GEO.features.filter(x => x.properties.iso3 === GLOBE_SEL.iso3).sort((a, b) => b.properties.span - a.properties.span)[0];
  const span = f ? f.properties.span : 10;
  // on laptops the panel sits beside the map; on phones it covers the bottom, so frame the country in the top part
  const phone = !matchMedia(GLOBE_WIDE).matches, cv = GLOBE.getContainer();
  const room = Math.min(cv.clientWidth, cv.clientHeight * (phone ? 0.5 : 0.9));
  const zoom = Math.max(1, Math.min(6.5, Math.log2(0.6 * room * 360 / (512 * span))));      // the country fills ~60% of the room
  GLOBE.flyTo({ center: [GLOBE_SEL.lng, GLOBE_SEL.lat], zoom, duration: 1400, essential: true, offset: phone ? [0, -80] : [0, 0] });
}
function globeFlyTo(iso3) { const c = COUNTRIES.find(x => x.iso3 === iso3); if (c) globeSelect(c); }
const GLOBE_REGIONS = { all: [10, 25, 1.5], europe: [15, 52, 2.6], africa: [20, 3, 2.1], asia: [95, 25, 1.9], americas: [-80, 10, 1.6] };
function globeRegion(r) { const v = GLOBE_REGIONS[r]; if (GLOBE && v) GLOBE.flyTo({ center: [v[0], v[1]], zoom: v[2], duration: 1200 }); }

// Our own country names (the game's spelling, every country), drawn with the map's own font
function globeAddLayers(map, labelFont) {
  map.addSource('energle', { type: 'geojson', data: GLOBE_GEO, tolerance: 0.6 });
  map.addSource('energle-names', { type: 'geojson', data: { type: 'FeatureCollection', features: COUNTRIES.map(c => ({
    type: 'Feature', geometry: { type: 'Point', coordinates: [c.lng, c.lat] }, properties: { name: c.name, rank: -(c.latestTotal || 0) } })) } });
  map.addLayer({ id: 'energle-hit', type: 'fill', source: 'energle', paint: { 'fill-color': '#000', 'fill-opacity': 0 } });
  map.addLayer({ id: 'energle-sel-fill', type: 'fill', source: 'energle', filter: ['==', ['get', 'iso3'], ''], paint: { 'fill-color': GLOBE_ACCENT, 'fill-opacity': 0.22 } });
  map.addLayer({ id: 'energle-sel-line', type: 'line', source: 'energle', filter: ['==', ['get', 'iso3'], ''], paint: { 'line-color': GLOBE_ACCENT, 'line-width': 2 } });
  if (labelFont) map.addLayer({ id: 'energle-names', type: 'symbol', source: 'energle-names',
    layout: { 'text-field': ['get', 'name'], 'text-font': labelFont, 'text-size': ['interpolate', ['linear'], ['zoom'], 1, 10, 4, 13, 6, 15],
              'symbol-sort-key': ['get', 'rank'], 'text-max-width': 7, 'text-padding': 2 },
    paint: { 'text-color': '#3a3a3a', 'text-halo-color': 'rgba(255,255,255,0.9)', 'text-halo-width': 1.4 } });
}
function globeFallbackStyle() {        // if the map tiles can't load: plain land on a blue sea, no names
  return { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#cfe0ee' } }] };
}

async function globeMount() {
  const el = document.getElementById('gl-canvas'); if (!el) return;
  try { await globeLoad(); } catch (e) {
    const l = document.getElementById('gl-loading'); if (l) l.textContent = 'The map could not load here. The list view still works.'; return;
  }
  if (!document.body.contains(el)) return;                    // the page was redrawn or left while loading
  if (GLOBE) { try { GLOBE.remove(); } catch (e) {} GLOBE = null; }
  GLOBE_SEL = null;
  let style = GLOBE_STYLE;
  try { const r = await fetch(GLOBE_STYLE); if (!r.ok) throw 0; style = await r.json(); } catch (e) { style = globeFallbackStyle(); }
  if (!document.body.contains(el)) return;
  // the base map's own country names are replaced by ours; its other labels stay
  let labelFont = null;
  if (style.layers) style.layers = style.layers.filter(L => {
    const isCountry = L.type === 'symbol' && /country/i.test(L.id + ' ' + (L['source-layer'] || ''));
    if (isCountry && !labelFont) labelFont = (L.layout || {})['text-font'] || null;
    return !isCountry;
  });
  if (!labelFont && style.glyphs) labelFont = ['Noto Sans Regular'];
  if (!style.layers.some(L => L.source)) {                    // fallback: draw the land ourselves
    style.sources = { land: { type: 'geojson', data: GLOBE_GEO } };
    style.layers.push({ id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': '#f2efe9' } }, { id: 'border', type: 'line', source: 'land', paint: { 'line-color': '#b9b3a8', 'line-width': 0.6 } });
  }
  const map = GLOBE = new maplibregl.Map({
    container: el, style, center: [10, 25], zoom: matchMedia('(max-width: 600px)').matches ? 0.7 : 1.5,
    attributionControl: { compact: true }, renderWorldCopies: false, fadeDuration: 0,
    pixelRatio: Math.min(window.devicePixelRatio || 1, 2), maxZoom: 9, dragRotate: false, pitchWithRotate: false,
  });
  map.touchZoomRotate.disableRotation();
  map.on('style.load', () => {
    map.setProjection({ type: 'globe' });
    globeAddLayers(map, labelFont);
    const l = document.getElementById('gl-loading'); if (l) l.remove();
    if (ATLAS.last) { const iso = ATLAS.last; ATLAS.last = null; globeFlyTo(iso); }
  });
  map.on('click', 'energle-hit', e => { const iso = e.features[0] && e.features[0].properties.iso3; if (iso) globeFlyTo(iso); });
  map.on('click', e => { if (!map.queryRenderedFeatures(e.point, { layers: ['energle-hit'] }).length && GLOBE_SEL) globeSelect(null, false); });
  map.on('mouseenter', 'energle-hit', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'energle-hit', () => { map.getCanvas().style.cursor = ''; });
  globeSide();
  const mq = matchMedia(GLOBE_WIDE), onMq = () => { globeSide(); map.resize(); }; mq.addEventListener('change', onMq);
  // leaving the atlas: free the map and its WebGL context
  const mo = new MutationObserver(() => {
    if (document.body.contains(el)) return;
    mo.disconnect(); mq.removeEventListener('change', onMq); document.body.classList.remove('at-globe');
    try { map.remove(); } catch (e) {}
    if (GLOBE === map) GLOBE = null;
  });
  mo.observe(document.getElementById('app'), { childList: true });
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && GLOBE_SEL && GLOBE) globeSelect(null, false); });
