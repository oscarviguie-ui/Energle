// ============================================================
//  GLOBE — test page at energle.org/globe/ (everything it needs lives in this folder).
//  Only active there (globe/index.html sets window.GLOBE_PAGE). Three parts:
//   1. EXPLORE: the Practice tab becomes "Explore" and opens on a terrain globe; click a country to
//      fly to it and read its profile in the daily puzzle's own cards. Practice by group is one click away.
//   2. GUESS MAP: in every game (daily, archive, practice), a map under the charts. Tap a country to put it
//      in the guess box; each guess is coloured by closeness, with a ring at its distance from the answer.
//   3. Shared map set-up: MapLibre GL on a globe, OpenFreeMap base map (no key, no quota), open AWS
//      elevation tiles for the terrain, every country named in the game's own spelling.
//  Libraries load from jsDelivr when a map first opens. Country shapes: Natural Earth 1:50m via
//  world-atlas (public domain), globe/world.json. Map data: © OpenStreetMap contributors.
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
const GLOBE_WIDE = '(min-width: 1100px)';
const GLOBE_ACCENT = '#f5a623';
const GLOBE_ICON = '<svg class="hd-ico" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">'
  + '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.6 3.9 5.6 3.9 9s-1.3 6.4-3.9 9M12 3C9.4 5.6 8.1 8.6 8.1 12s1.3 6.4 3.9 9"/></svg>';

let GLOBE = null, GLOBE_GEO = null, GLOBE_SEL = null, GLOBE_LOADING = null, GLOBE_STYLE_P = null;

// ---------- loading (once) ----------
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
// The base map style, with its own country names taken out (ours replace them); a plain fallback if it can't load
function globeStyle() {
  if (!GLOBE_STYLE_P) GLOBE_STYLE_P = fetch(GLOBE_STYLE).then(r => { if (!r.ok) throw 0; return r.json(); }).catch(() => null);
  return GLOBE_STYLE_P.then(src => {
    const style = src ? JSON.parse(JSON.stringify(src)) : { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#cfe0ee' } }] };
    let labelFont = null;
    style.layers = style.layers.filter(L => {
      const isCountry = L.type === 'symbol' && /country/i.test(L.id + ' ' + (L['source-layer'] || ''));
      if (isCountry && !labelFont) labelFont = (L.layout || {})['text-font'] || null;
      return !isCountry;
    });
    if (!labelFont && style.glyphs) labelFont = ['Noto Sans Regular'];
    if (!style.layers.some(L => L.source)) {                  // fallback: draw the land ourselves
      style.sources = { land: { type: 'geojson', data: GLOBE_GEO } };
      style.layers.push({ id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': '#f2efe9' } }, { id: 'border', type: 'line', source: 'land', paint: { 'line-color': '#b9b3a8', 'line-width': 0.6 } });
    }
    return { style, labelFont };
  });
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
function globeSpanOf(iso3) {
  const f = GLOBE_GEO && GLOBE_GEO.features.filter(x => x.properties.iso3 === iso3).sort((a, b) => b.properties.span - a.properties.span)[0];
  return f ? f.properties.span : 10;
}

// ---------- one map, shared set-up ----------
// Terrain under the water, roads and names: green lowlands, ochre hills, brown and grey mountains, snowy peaks
function globeAddTerrain(map) {
  map.addSource('dem', GLOBE_DEM);
  const L = map.getStyle().layers;
  const below = (L.find(l => /water|ocean/i.test(l.id) && l.type === 'fill') || L.find(l => l.type !== 'background') || {}).id;
  map.addLayer({ id: 'relief', type: 'color-relief', source: 'dem', paint: {
    'color-relief-opacity': 0.75,
    'color-relief-color': ['interpolate', ['linear'], ['elevation'],
      0, '#cfe3c0', 150, '#bfdaa6', 400, '#d9dca8', 800, '#e3cf9c', 1500, '#cfae82', 2500, '#b48f72', 3500, '#a4958c', 4500, '#e4e1de', 6000, '#ffffff'] } }, below);
  map.addLayer({ id: 'hillshade', type: 'hillshade', source: 'dem', paint: {
    'hillshade-exaggeration': 0.45, 'hillshade-shadow-color': '#5b5146', 'hillshade-highlight-color': '#ffffff', 'hillshade-accent-color': '#7a6a58' } }, below);
}
// Country shapes (for clicks and highlights) and our own names (the game's spelling, every country)
function globeAddCountries(map, labelFont) {
  map.addSource('energle', { type: 'geojson', data: GLOBE_GEO, tolerance: 0.6 });
  map.addSource('energle-names', { type: 'geojson', data: { type: 'FeatureCollection', features: COUNTRIES.map(c => ({
    type: 'Feature', geometry: { type: 'Point', coordinates: [c.lng, c.lat] }, properties: { iso3: c.iso3, name: c.name, rank: -(c.latestTotal || 0) } })) } });
  map.addLayer({ id: 'energle-hit', type: 'fill', source: 'energle', paint: { 'fill-color': '#000', 'fill-opacity': 0 } });
}
function globeAddNames(map, labelFont) {
  if (labelFont) map.addLayer({ id: 'energle-names', type: 'symbol', source: 'energle-names',
    layout: { 'text-field': ['get', 'name'], 'text-font': labelFont, 'text-size': ['interpolate', ['linear'], ['zoom'], 1, 10, 4, 13, 6, 15],
              'symbol-sort-key': ['get', 'rank'], 'text-max-width': 7, 'text-padding': 2 },
    paint: { 'text-color': '#3a3a3a', 'text-halo-color': 'rgba(255,255,255,0.9)', 'text-halo-width': 1.4 } });
}
// A map in `el`; `ready(map, labelFont)` runs once the style is in. Freed when `el` leaves the page.
async function globeMakeMap(el, opts, ready) {
  await globeLoad();
  const { style, labelFont } = await globeStyle();
  if (!document.body.contains(el)) return null;
  const map = new maplibregl.Map(Object.assign({
    container: el, style, center: [10, 25], zoom: 1.5,
    attributionControl: { compact: true }, renderWorldCopies: false, fadeDuration: 0,
    pixelRatio: Math.min(window.devicePixelRatio || 1, 2), maxZoom: 9, dragRotate: false, pitchWithRotate: false,
  }, opts));
  map.touchZoomRotate.disableRotation();
  map.on('style.load', () => {
    map.setProjection({ type: 'globe' });
    try { globeAddTerrain(map); } catch (e) { /* terrain is a bonus: the plain map still works */ }
    globeAddCountries(map);
    ready(map, labelFont);
  });
  map.on('mouseenter', 'energle-hit', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'energle-hit', () => { map.getCanvas().style.cursor = ''; });
  const ro = new ResizeObserver(() => map.resize()); ro.observe(el);
  const mo = new MutationObserver(() => {
    if (document.body.contains(el)) return;
    mo.disconnect(); ro.disconnect();
    try { map.remove(); } catch (e) {}
    if (map._onGone) map._onGone();
  });
  mo.observe(document.getElementById('app'), { childList: true, subtree: true });
  return map;
}
function globeZoomFor(map, iso3, share = 0.6) {
  const cv = map.getContainer(), room = Math.min(cv.clientWidth, cv.clientHeight * 0.9);
  return Math.max(1, Math.min(6.5, Math.log2(share * room * 360 / (512 * globeSpanOf(iso3)))));    // the country fills `share` of the room
}

// ============================================================
//  1. EXPLORE (the atlas page, globe view)
// ============================================================
let GLOBE_PREV_TARGET;                      // the game's `target`, put back when the panel closes or the page is left
function globeRestoreTarget() {
  if (GLOBE_PREV_TARGET !== undefined) { target = GLOBE_PREV_TARGET; GLOBE_PREV_TARGET = undefined; }
  if (typeof lineChart !== 'undefined' && lineChart) { lineChart.destroy(); lineChart = null; }
  if (typeof barChart !== 'undefined' && barChart) { barChart.destroy(); barChart = null; }
}
// The daily puzzle's own cards; the mix and its history first, since they say the most about a country
function globeCountryHTML(c) {
  return '<div class="gl-p-head">' + flagImg(c.iso3, 'gl-flag') + '<div><h3>' + escHtml(c.name) + '</h3><span>' + (REGION_LABEL[c.continent] || c.continent || '') + '</span></div>'
    + '<button type="button" class="gl-x" id="gl-x" aria-label="Close">×</button></div>'
    + '<div id="charts-section">'
    +   '<div id="chart-left"><p class="chart-label" id="line-label">Generation by source over time (TWh)</p><div id="line-wrapper"><canvas id="line-chart"></canvas></div></div>'
    +   '<div id="chart-right"><p class="chart-label" id="bar-label">Latest year mix</p><div id="bar-wrapper"><canvas id="bar-chart"></canvas></div></div>'
    + '</div>'
    + '<div id="legend-shared"></div>'
    + balanceCardHTML()
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
  if (GLOBE_SEL) { renderCharts(); renderStatBar(); renderFlowBar(); }
  const x = document.getElementById('gl-x'); if (x) x.addEventListener('click', () => globeSelect(null));
  const o = document.getElementById('gl-open'); if (o) o.addEventListener('click', () => { const iso = GLOBE_SEL.iso3; globeRestoreTarget(); browseCountry(iso); });
}
function globeHTML() {
  return '<div class="gl-layout" id="gl-layout">'
    + '<div class="gl-wrap" id="gl-wrap"><div class="gl-canvas" id="gl-canvas" aria-label="Map of the world. Click a country for its electricity profile; the list view is keyboard-friendly."></div>'
    + '<p class="gl-loading" id="gl-loading">Loading the map…</p></div>'
    + '<aside class="gl-side" id="gl-side" aria-live="polite"></aside>'
    + '</div>';
}
function globeSelect(c, fly = true) {
  GLOBE_SEL = c || null;
  globeSide();
  if (!GLOBE || !GLOBE.getLayer('energle-sel-fill')) return;
  const f = ['==', ['get', 'iso3'], GLOBE_SEL ? GLOBE_SEL.iso3 : ''];
  GLOBE.setFilter('energle-sel-fill', f); GLOBE.setFilter('energle-sel-line', f);
  if (fly && GLOBE_SEL) GLOBE.flyTo({ center: [GLOBE_SEL.lng, GLOBE_SEL.lat], zoom: globeZoomFor(GLOBE, GLOBE_SEL.iso3), duration: 1400, essential: true });
}
function globeFlyTo(iso3) { const c = COUNTRIES.find(x => x.iso3 === iso3); if (c) globeSelect(c); }
const GLOBE_REGIONS = { all: [10, 25, 1.5], europe: [15, 52, 2.6], africa: [20, 3, 2.1], asia: [95, 25, 1.9], americas: [-80, 10, 1.6] };
function globeRegion(r) { const v = GLOBE_REGIONS[r]; if (GLOBE && v) GLOBE.flyTo({ center: [v[0], v[1]], zoom: v[2], duration: 1200 }); }

async function globeMount() {
  const el = document.getElementById('gl-canvas'); if (!el) return;
  if (GLOBE) { try { GLOBE.remove(); } catch (e) {} GLOBE = null; }
  GLOBE_SEL = null;
  let map;
  try {
    map = await globeMakeMap(el, { zoom: matchMedia('(max-width: 600px)').matches ? 0.7 : 1.5 }, (m, labelFont) => {
      m.addLayer({ id: 'energle-sel-fill', type: 'fill', source: 'energle', filter: ['==', ['get', 'iso3'], ''], paint: { 'fill-color': GLOBE_ACCENT, 'fill-opacity': 0.22 } });
      m.addLayer({ id: 'energle-sel-line', type: 'line', source: 'energle', filter: ['==', ['get', 'iso3'], ''], paint: { 'line-color': GLOBE_ACCENT, 'line-width': 2 } });
      globeAddNames(m, labelFont);
      const l = document.getElementById('gl-loading'); if (l) l.remove();
      if (ATLAS.last) { const iso = ATLAS.last; ATLAS.last = null; globeFlyTo(iso); }
    });
  } catch (e) { const l = document.getElementById('gl-loading'); if (l) l.textContent = 'The map could not load here. The list view still works.'; return; }
  if (!map) return;
  GLOBE = map;
  map.on('click', 'energle-hit', e => { const iso = e.features[0] && e.features[0].properties.iso3; if (iso) globeFlyTo(iso); });
  map.on('click', e => { if (!map.queryRenderedFeatures(e.point, { layers: ['energle-hit'] }).length && GLOBE_SEL) globeSelect(null, false); });
  globeSide();
  const mq = matchMedia(GLOBE_WIDE), onMq = () => { if (GLOBE_SEL) globeSelect(GLOBE_SEL, false); else globeSide(); }; mq.addEventListener('change', onMq);
  map._onGone = () => {                     // left the page: put the game back as it was
    mq.removeEventListener('change', onMq); document.body.classList.remove('at-globe');
    GLOBE_SEL = null; if (GLOBE_PREV_TARGET !== undefined) { target = GLOBE_PREV_TARGET; GLOBE_PREV_TARGET = undefined; }
    if (GLOBE === map) GLOBE = null;
  };
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && GLOBE_SEL && GLOBE) globeSelect(null, false); });

// ============================================================
//  2. GUESS MAP — the Map button in the guess bar opens the globe inside the page, next to the
//     information (on a laptop: a column on the right; on a phone: just above the guess bar), so the
//     charts stay in view while you look around. Tap a country to put it in the guess box.
//     Guessed countries are shaded in their closeness colour; at the end the answer is outlined.
//     Nothing is stored between puzzles: the map is redrawn from the current game every time.
// ============================================================
let GMAP = null, GMAP_PICK = null;
let GMAP_ON = (() => { try { return localStorage.getItem('energle_gmap') === 'on'; } catch (e) { return false; } })();
const GMAP_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">'
  + '<path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5V4l-6 2.5z"/><path d="M9 4v13M15 6.5v13"/></svg>';
function gmapButtonHTML() { return '<button type="button" id="gm-btn" class="gm-btn" aria-pressed="false" title="Show the map">' + GMAP_ICON + '<span class="gm-lbl">Map</span></button>'; }
function gmapUpdate() {
  const m = GMAP; if (!m || !m.getLayer('gm-fill') || !target) return;
  const done = guesses.filter(g => g.iso3 !== target.iso3);
  const fills = done.flatMap(g => [['==', ['get', 'iso3'], g.iso3], 'rgb(' + closeRGB(guessInfo(g).prox).join(',') + ')']);
  m.setPaintProperty('gm-fill', 'fill-color', fills.length ? ['case', ...fills, 'rgba(0,0,0,0)'] : 'rgba(0,0,0,0)');
  m.setFilter('gm-fill', ['in', ['get', 'iso3'], ['literal', done.map(g => g.iso3)]]);
  const pick = ['==', ['get', 'iso3'], gameOver ? '' : (GMAP_PICK || '')];
  m.setFilter('gm-pick', pick); m.setFilter('gm-pick-fill', pick);
  const ans = ['==', ['get', 'iso3'], gameOver ? target.iso3 : ''];
  m.setFilter('gm-answer', ans); m.setFilter('gm-answer-line', ans);
}
function gmapPick(iso3) {
  if (gameOver) return;
  const c = COUNTRIES.find(x => x.iso3 === iso3); if (!c) return;
  const input = document.getElementById('guess-input'), err = document.getElementById('error');
  if (guesses.some(g => g.iso3 === iso3)) { if (err) err.textContent = c.name + ' is already guessed.'; return; }
  if (err) err.textContent = '';
  if (input) { input.value = c.name; syncInputFlag(); }
  GMAP_PICK = iso3; gmapUpdate();
  const btn = document.getElementById('submit-btn'); if (btn) { btn.classList.remove('gm-ready'); void btn.offsetWidth; btn.classList.add('gm-ready'); }
}
// Where the map goes: beside the information on wide screens, right above the guess bar otherwise
const GMAP_WIDE = '(min-width: 1100px)';
function gmapPlace() {
  const card = document.getElementById('gm-card'); if (!card) return;
  const col = document.getElementById('gw-map'), head = document.getElementById('guess-head');
  if (matchMedia(GMAP_WIDE).matches) { if (col && card.parentNode !== col) col.appendChild(card); }
  else if (head && card.nextSibling !== head) head.before(card);
}
function gmapShow(on) {
  GMAP_ON = on; try { localStorage.setItem('energle_gmap', on ? 'on' : 'off'); } catch (e) {}
  document.body.classList.toggle('gm-on', on);
  const b = document.getElementById('gm-btn'); if (b) { b.setAttribute('aria-pressed', String(on)); b.title = on ? 'Hide the map' : 'Show the map'; }
  let card = document.getElementById('gm-card');
  if (!on) { if (card) card.hidden = true; return; }
  if (!card) {
    card = document.createElement('section'); card.id = 'gm-card'; card.className = 'gm-card'; card.setAttribute('aria-label', 'Map');
    card.innerHTML = '<div class="gm-wrap"><div class="gl-canvas" id="gm-canvas"></div><p class="gl-loading" id="gm-loading">Loading the map…</p>'
      + '<button type="button" class="gm-x" id="gm-x" aria-label="Hide the map">×</button></div>';
    document.body.appendChild(card); gmapPlace();
    card.querySelector('#gm-x').addEventListener('click', () => gmapShow(false));
    const cv = document.getElementById('gm-canvas'), fill = Math.log2(1.0 * Math.min(cv.clientWidth || 400, cv.clientHeight || 400) * Math.PI / 512);
    GMAP = null;
    globeMakeMap(cv, { zoom: Math.max(0.5, fill), center: target ? [target.lng > 0 ? 60 : -40, 25] : [10, 25] }, (m, labelFont) => {
      m.addLayer({ id: 'gm-fill', type: 'fill', source: 'energle', filter: ['==', ['get', 'iso3'], ''], paint: { 'fill-color': 'rgba(0,0,0,0)', 'fill-opacity': 0.55 } });
      m.addLayer({ id: 'gm-pick-fill', type: 'fill', source: 'energle', filter: ['==', ['get', 'iso3'], ''], paint: { 'fill-color': GLOBE_ACCENT, 'fill-opacity': 0.25 } });
      m.addLayer({ id: 'gm-pick', type: 'line', source: 'energle', filter: ['==', ['get', 'iso3'], ''], paint: { 'line-color': GLOBE_ACCENT, 'line-width': 2.5 } });
      m.addLayer({ id: 'gm-answer', type: 'fill', source: 'energle', filter: ['==', ['get', 'iso3'], ''], paint: { 'fill-color': '#22a35a', 'fill-opacity': 0.4 } });
      m.addLayer({ id: 'gm-answer-line', type: 'line', source: 'energle', filter: ['==', ['get', 'iso3'], ''], paint: { 'line-color': '#15803d', 'line-width': 2 } });
      globeAddNames(m, labelFont);
      const l = document.getElementById('gm-loading'); if (l) l.remove();
      GMAP = m; gmapUpdate();
    }).then(map => {
      if (!map) return;
      map.on('click', 'energle-hit', e => { const iso = e.features[0] && e.features[0].properties.iso3; if (iso) gmapPick(iso); });
      map._onGone = () => { if (GMAP === map) GMAP = null; };
    }).catch(() => { const l = document.getElementById('gm-loading'); if (l) l.textContent = 'The map could not load here.'; });
  }
  card.hidden = false; gmapPlace();
  if (GMAP) { GMAP.resize(); gmapUpdate(); }
}
matchMedia(GMAP_WIDE).addEventListener('change', () => { gmapPlace(); if (GMAP) setTimeout(() => GMAP.resize(), 50); });

// ============================================================
//  3. LAYOUT — the information (charts, mix, totals, legend) as one block, the guess bar always under it.
//     Wide, short windows put the charts and the totals side by side, so the guess bar is on screen.
//     With the map open on a wide screen, the map is a column on the right and everything else stays left.
// ============================================================
function gwLayout() {
  const charts = document.getElementById('charts-section'), bal = document.getElementById('balance-card');
  if (!charts || !bal || document.getElementById('gw-cols')) return;
  const cols = document.createElement('div'); cols.id = 'gw-cols'; cols.className = 'gw-cols';
  cols.innerHTML = '<div class="gw-main" id="gw-main"><div class="gw-info" id="gw-info"></div></div><div class="gw-map" id="gw-map"></div>';
  bal.before(cols);
  const info = cols.querySelector('#gw-info'), main = cols.querySelector('#gw-main');
  ['charts-section', 'balance-card', 'legend-shared'].forEach(id => { const n = document.getElementById(id); if (n) info.appendChild(n); });
  ['clue-cards', 'guess-head', 'input-area', 'error', 'banner', 'guesses'].forEach(id => { const n = document.getElementById(id); if (n) main.appendChild(n); });
}

// ============================================================
//  4. HOOKS into the game (script.js loads after this file, so they are set once the page is parsed)
// ============================================================
if (globeOn()) document.addEventListener('DOMContentLoaded', () => {
  document.body.classList.add('gl-page');
  // Practice -> Explore, with a globe; Explore opens the map, groups are one click further
  const _switcher = modeSwitcherHTML;
  window.modeSwitcherHTML = function () {
    return _switcher().replace(/>Practice(<|$)/, '>' + GLOBE_ICON + 'Explore$1');
  };
  const _switch = switchMode;
  window.switchMode = function (mode) {
    if (mode !== 'practice' || !practiceUnlocked()) return _switch(mode);
    hideLockTip();
    if (lineChart) { lineChart.destroy(); lineChart = null; }
    if (barChart) { barChart.destroy(); barChart = null; }
    clearInterval(resultTicker);
    MODE = 'practice'; ATLAS.view = 'globe'; renderBrowseScreen(); updateDonePill();
  };
  const _browse = renderBrowseScreen;
  window.renderBrowseScreen = function () {
    document.body.classList.remove('gm-on');
    _browse();
    const t = document.querySelector('.sub-lead'), r = document.querySelector('.sub-rest');
    if (t) t.textContent = 'Explore'; if (r) r.textContent = 'every country’s electricity on the map';
    const b = document.getElementById('back-to-cats'); if (b) b.textContent = 'Practice by group →';
  };
  const _picker = renderPracticePickerScreen;
  window.renderPracticePickerScreen = function () {
    document.body.classList.remove('gm-on');
    _picker();
    const t = document.querySelector('.pc-atlas-title'), s = document.querySelector('.pc-atlas-sub'), c = document.querySelector('.pc-atlas-cta');
    if (t) t.textContent = 'Explore the map'; if (s) s.textContent = 'Every country on a terrain globe, with its profile a click away'; if (c) c.textContent = 'Back to the map →';
  };
  const _archive = renderArchiveScreen;
  window.renderArchiveScreen = function (d) { document.body.classList.remove('gm-on'); return _archive(d); };
  // the game screen: one information block, the guess bar under it, a Map button in the guess bar
  const _game = renderGameScreen;
  window.renderGameScreen = function () {
    const old = document.getElementById('gm-card'); if (old) old.remove();
    _game();
    gwLayout();
    const sub = document.getElementById('submit-btn');
    if (sub && !document.getElementById('gm-btn')) { sub.insertAdjacentHTML('beforebegin', gmapButtonHTML()); document.getElementById('gm-btn').addEventListener('click', () => gmapShow(!GMAP_ON)); }
    GMAP_PICK = null; gmapShow(GMAP_ON);
  };
  const _row = addGuessRow;
  window.addGuessRow = function (country, isCorrect, animate) { _row(country, isCorrect, animate); GMAP_PICK = null; gmapUpdate(); };
  const _end = endGame;
  window.endGame = function () { _end(); gmapUpdate(); };
  const _new = newGame;
  window.newGame = function () { _new(); GMAP_PICK = null; gmapUpdate(); };
});
