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
// Terrain: open elevation tiles (Mapzen "Terrarium" on AWS Open Data, no key), shaded and tinted by height in the browser
const GLOBE_DEM = { type: 'raster-dem', tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], encoding: 'terrarium',
  tileSize: 256, maxzoom: 12, attribution: 'Terrain: Mapzen, AWS Open Data (SRTM, GMTED2010, ETOPO1)' };
let GLOBE_TERRAIN = (() => { try { return localStorage.getItem('energle_globe_terrain') !== 'off'; } catch (e) { return true; } })();
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

// ---------- the profile shown in the panel: the daily puzzle's own cards ----------
let GLOBE_PREV_TARGET;                      // the game's `target`, put back when the panel closes or the atlas is left
function globeRestoreTarget() {
  if (GLOBE_PREV_TARGET !== undefined) { target = GLOBE_PREV_TARGET; GLOBE_PREV_TARGET = undefined; }
  if (typeof lineChart !== 'undefined' && lineChart) { lineChart.destroy(); lineChart = null; }
  if (typeof barChart !== 'undefined' && barChart) { barChart.destroy(); barChart = null; }
}
function globeCountryHTML(c) {
  return '<div class="gl-p-head">' + flagImg(c.iso3, 'gl-flag') + '<div><h3>' + escHtml(c.name) + '</h3><span>' + (REGION_LABEL[c.continent] || c.continent || '') + '</span></div>'
    + '<button type="button" class="gl-x" id="gl-x" aria-label="Close">×</button></div>'
    + balanceCardHTML()
    + '<div id="charts-section">'
    +   '<div id="chart-left"><p class="chart-label" id="line-label">Generation by source over time (TWh)</p><div id="line-wrapper"><canvas id="line-chart"></canvas></div></div>'
    +   '<div id="chart-right"><p class="chart-label" id="bar-label">Latest year mix</p><div id="bar-wrapper"><canvas id="bar-chart"></canvas></div></div>'
    + '</div>'
    + '<div id="legend-shared"></div>'
    + '<button type="button" class="gl-open" id="gl-open">Open the full profile and clue cards →</button>';
}
function globeSide() {
  const el = document.getElementById('gl-side'), lay = document.getElementById('gl-layout'); if (!el) return;
  const wide = matchMedia(GLOBE_WIDE).matches;
  globeRestoreTarget();
  if (GLOBE_SEL) {
    GLOBE_PREV_TARGET = target; target = GLOBE_SEL;
    el.innerHTML = globeCountryHTML(GLOBE_SEL);
  } else el.innerHTML = wide ? '<p class="gl-empty"><b>Click a country</b>to see its electricity profile, laid out as in the daily puzzle.</p>' : '';
  el.hidden = !GLOBE_SEL && !wide;
  if (lay) lay.classList.toggle('has-sel', !!GLOBE_SEL);
  if (GLOBE_SEL) { renderStatBar(); renderFlowBar(); renderCharts(); }
  const x = document.getElementById('gl-x'); if (x) x.addEventListener('click', () => globeSelect(null));
  const o = document.getElementById('gl-open'); if (o) o.addEventListener('click', () => { const iso = GLOBE_SEL.iso3; globeRestoreTarget(); browseCountry(iso); });
}

// ---------- markup ----------
function globeHTML() {
  return '<div class="gl-layout" id="gl-layout">'
    + '<div class="gl-wrap" id="gl-wrap"><div class="gl-canvas" id="gl-canvas" aria-label="Map of the world. Click a country for its electricity profile; the list view is keyboard-friendly."></div>'
    + '<div class="gl-layers" role="group" aria-label="Map style"><button type="button" class="gl-lbtn" data-l="terrain">Terrain</button><button type="button" class="gl-lbtn" data-l="map">Map</button></div>'
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
  const cv = GLOBE.getContainer(), room = Math.min(cv.clientWidth, cv.clientHeight * 0.9);
  const zoom = Math.max(1, Math.min(6.5, Math.log2(0.6 * room * 360 / (512 * span))));      // the country fills ~60% of the room
  GLOBE.flyTo({ center: [GLOBE_SEL.lng, GLOBE_SEL.lat], zoom, duration: 1400, essential: true });
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
// Terrain under the water, roads and names: green lowlands, ochre hills, brown and grey mountains, snowy peaks
function globeAddTerrain(map) {
  map.addSource('dem', GLOBE_DEM);
  const L = map.getStyle().layers;
  const below = (L.find(l => /water|ocean/i.test(l.id) && l.type === 'fill') || L.find(l => l.type !== 'background') || {}).id;
  const vis = GLOBE_TERRAIN ? 'visible' : 'none';
  map.addLayer({ id: 'relief', type: 'color-relief', source: 'dem', layout: { visibility: vis }, paint: {
    'color-relief-opacity': 0.75,
    'color-relief-color': ['interpolate', ['linear'], ['elevation'],
      0, '#cfe3c0', 150, '#bfdaa6', 400, '#d9dca8', 800, '#e3cf9c', 1500, '#cfae82', 2500, '#b48f72', 3500, '#a4958c', 4500, '#e4e1de', 6000, '#ffffff'] } }, below);
  map.addLayer({ id: 'hillshade', type: 'hillshade', source: 'dem', layout: { visibility: vis }, paint: {
    'hillshade-exaggeration': 0.45, 'hillshade-shadow-color': '#5b5146', 'hillshade-highlight-color': '#ffffff', 'hillshade-accent-color': '#7a6a58' } }, below);
}
function globeSetTerrain(on) {
  GLOBE_TERRAIN = on; try { localStorage.setItem('energle_globe_terrain', on ? 'on' : 'off'); } catch (e) {}
  if (GLOBE && GLOBE.getLayer('relief')) ['relief', 'hillshade'].forEach(id => GLOBE.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'));
  document.querySelectorAll('.gl-lbtn').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.l === 'terrain') === on)));
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
    try { globeAddTerrain(map); } catch (e) { /* terrain is a bonus: the plain map still works */ }
    globeAddLayers(map, labelFont);
    const l = document.getElementById('gl-loading'); if (l) l.remove();
    if (ATLAS.last) { const iso = ATLAS.last; ATLAS.last = null; globeFlyTo(iso); }
  });
  map.on('click', 'energle-hit', e => { const iso = e.features[0] && e.features[0].properties.iso3; if (iso) globeFlyTo(iso); });
  map.on('click', e => { if (!map.queryRenderedFeatures(e.point, { layers: ['energle-hit'] }).length && GLOBE_SEL) globeSelect(null, false); });
  map.on('mouseenter', 'energle-hit', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'energle-hit', () => { map.getCanvas().style.cursor = ''; });
  globeSide();
  document.querySelectorAll('.gl-lbtn').forEach(b => b.addEventListener('click', () => globeSetTerrain(b.dataset.l === 'terrain')));
  globeSetTerrain(GLOBE_TERRAIN);
  const ro = new ResizeObserver(() => map.resize()); ro.observe(el);
  const mq = matchMedia(GLOBE_WIDE), onMq = () => { if (GLOBE_SEL) globeSelect(GLOBE_SEL, false); else globeSide(); }; mq.addEventListener('change', onMq);
  // leaving the atlas: free the map and its WebGL context
  const mo = new MutationObserver(() => {
    if (document.body.contains(el)) return;
    mo.disconnect(); ro.disconnect(); mq.removeEventListener('change', onMq); document.body.classList.remove('at-globe');
    GLOBE_SEL = null; if (GLOBE_PREV_TARGET !== undefined) { target = GLOBE_PREV_TARGET; GLOBE_PREV_TARGET = undefined; }
    try { map.remove(); } catch (e) {}
    if (GLOBE === map) GLOBE = null;
  });
  mo.observe(document.getElementById('app'), { childList: true });
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && GLOBE_SEL && GLOBE) globeSelect(null, false); });
