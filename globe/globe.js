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
    // shapes that cross the date line (Russia's far east, Fiji) jump from +180 to -180 inside one ring, which
    // draws a band across the globe; moving their western-hemisphere points past +180 keeps each ring in one piece
    GLOBE_GEO.features.forEach(f => {
      const polys = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
      polys.forEach(p => p.forEach(r => {
        if (r.some((pt, i) => i && Math.abs(pt[0] - r[i - 1][0]) > 180)) r.forEach(pt => { if (pt[0] < 0) pt[0] += 360; });
      }));
    });
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
// ---------- regions: the same cards for a whole region, summed over its countries ----------
// Generation by source, demand and net imports add up; CO2 intensity is weighted by generation; demand per
// person is total demand over total population (each country's population = its demand / its demand per person).
// A country whose data stops a year early carries its last year forward, so the latest year isn't short of countries.
// The groups on the chips: continents, then a few blocs (members as of 2026)
const GLOBE_GROUPS = [
  { id: 'all', chip: 'World', name: 'The world', test: () => true },
  { id: 'europe', chip: 'Europe', name: 'Europe', test: c => c.continent === 'Europe' },
  { id: 'africa', chip: 'Africa', name: 'Africa', test: c => c.continent === 'Africa' },
  { id: 'asiaonly', chip: 'Asia', name: 'Asia', test: c => c.continent === 'Asia' },
  { id: 'oceania', chip: 'Oceania', name: 'Oceania', test: c => c.continent === 'Oceania' },
  { id: 'namerica', chip: 'N. America', name: 'North & Central America', test: c => c.continent === 'North America' },
  { id: 'samerica', chip: 'S. America', name: 'South America', test: c => c.continent === 'South America' },
  { id: 'eu', chip: 'EU', name: 'European Union', bloc: true, iso: 'AUT BEL BGR HRV CYP CZE DNK EST FIN FRA DEU GRC HUN IRL ITA LVA LTU LUX MLT NLD POL PRT ROU SVK SVN ESP SWE' },
  { id: 'g7', chip: 'G7', name: 'G7', bloc: true, iso: 'CAN FRA DEU ITA JPN GBR USA' },
  { id: 'opec', chip: 'OPEC', name: 'OPEC', bloc: true, iso: 'DZA COG GNQ GAB IRN IRQ KWT LBY NGA SAU ARE VEN' },
  { id: 'brics', chip: 'BRICS', name: 'BRICS', bloc: true, iso: 'BRA RUS IND CHN ZAF EGY ETH IRN ARE IDN' },
];
GLOBE_GROUPS.forEach(g => { if (g.iso) { const set = new Set(g.iso.split(' ')); g.test = c => set.has(c.iso3); } });
const groupOf = id => GLOBE_GROUPS.find(g => g.id === id) || GLOBE_GROUPS[0];
const REGION_NAMES = Object.fromEntries(GLOBE_GROUPS.map(g => [g.id, g.name]));
const AGG_CACHE = {};
function globeAggregate(rid) {
  if (AGG_CACHE[rid]) return AGG_CACHE[rid];
  const members = COUNTRIES.filter(groupOf(rid).test);
  const yrsCount = {}; members.forEach(c => { yrsCount[c.latestYear] = (yrsCount[c.latestYear] || 0) + 1; });
  const latest = +Object.entries(yrsCount).sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
  const first = Math.min(...members.map(c => Math.min(...Object.keys(ALL_DATA[c.name].years).map(Number))));
  const years = {}, dpc = {};
  for (let y = first; y <= latest; y++) {
    const o = { Total: 0, Demand: 0, NetImports: 0 }; let co2 = 0, co2Gen = 0, pop = 0, popDem = 0;
    members.forEach(c => {
      const Y = ALL_DATA[c.name].years, d = Y[y] || (y > c.latestYear ? Y[c.latestYear] : null); if (!d) return;
      SOURCES.forEach(k => { o[k] = (o[k] || 0) + (d[k] || 0); });
      o.Total += d.Total || 0; o.Demand += d.Demand || 0; o.NetImports += d.NetImports || 0;
      if (typeof d.CO2 === 'number' && d.CO2 > 0) { co2 += d.CO2 * (d.Total || 0); co2Gen += d.Total || 0; }
      const cd = (ALL_DATA[c.name].dpc || {})[y] ?? (y > c.latestYear ? c.latestDpc : null);
      if (cd > 0 && d.Demand > 0) { pop += d.Demand / cd; popDem += d.Demand; }
    });
    if (co2Gen > 0) o.CO2 = co2 / co2Gen;
    years[y] = o;
    if (pop > 0) dpc[y] = popDem / pop;
  }
  const name = REGION_NAMES[rid] || 'Region';
  ALL_DATA[name] = { iso3: 'R_' + rid, years, dpc, latestYear: latest, latestDpc: dpc[latest] ?? null };
  return (AGG_CACHE[rid] = { name, iso3: 'R_' + rid, latestYear: latest, latestDpc: dpc[latest] ?? null, latestTotal: years[latest].Total,
    region: rid, n: members.length, members: members.map(c => c.iso3) });
}

// The daily puzzle's own cards, in the game's order: totals and trade flow, charts, legend, then the clue cards
function globeCardsHTML() {
  return balanceCardHTML()
    + '<div id="charts-section">'
    +   '<div id="chart-left"><p class="chart-label" id="line-label">Generation by source over time (TWh)</p><div id="line-wrapper"><canvas id="line-chart"></canvas></div></div>'
    +   '<div id="chart-right"><p class="chart-label" id="bar-label">Latest year mix</p><div id="bar-wrapper"><canvas id="bar-chart"></canvas></div></div>'
    + '</div>'
    + '<div id="legend-shared"></div>';
}
function globeCountryHTML(c) {
  return '<div class="gl-p-head">' + flagImg(c.iso3, 'gl-flag') + '<div><h3>' + escHtml(c.name) + '</h3><span>' + (REGION_LABEL[c.continent] || c.continent || '') + '</span></div>'
    + '<button type="button" class="gl-x" id="gl-x" aria-label="Close">×</button></div>'
    + globeCardsHTML() + '<section id="clue-cards" class="gl-cards"></section>';
}
function globeRegionHTML(r) {
  return '<div class="gl-p-head"><span class="gl-reg-ico" aria-hidden="true">' + GLOBE_ICON + '</span><div><h3>' + r.name + '</h3><span>'
    + (groupOf(r.region).trait ? groupOf(r.region).rule + ' · ' : '') + r.n + ' countries added together · ' + r.latestYear + '</span></div>'
    + '<button type="button" class="gl-practice" onclick="startPractice(\'' + r.region + '\')">Practice ' + (r.region === 'all' ? 'all' : 'these ' + r.n) + ' →</button>'
    + (r.region !== 'all' ? '<button type="button" class="gl-x" id="gl-x" aria-label="Back to the world">×</button>' : '') + '</div>'
    + globeCardsHTML() + '<p class="gl-hint">Click a country on the map to see its full profile, clue cards included.</p>';
}
let GLOBE_REGION = 'all';
function globeSide() {
  const el = document.getElementById('gl-side'), lay = document.getElementById('gl-layout'); if (!el) return;
  globeRestoreTarget();
  const reg = !GLOBE_SEL ? globeAggregate(GLOBE_REGION) : null;
  GLOBE_PREV_TARGET = target; target = GLOBE_SEL || reg;
  el.innerHTML = GLOBE_SEL ? globeCountryHTML(GLOBE_SEL) : globeRegionHTML(reg);
  el.classList.toggle('is-region', !GLOBE_SEL);
  el.hidden = false;
  if (lay) lay.classList.add('has-sel');
  renderStatBar(); renderFlowBar(); renderCharts();
  if (!GLOBE_SEL) {                      // a world average next to a regional total says nothing: show its share of the world instead
    const pill = document.getElementById('stat-world-gen'), w = globeAggregate('all');
    if (pill) { const fresh = pill.cloneNode(false); fresh.removeAttribute('id');      // a fresh node: the count-up keeps writing to the old one
      fresh.textContent = reg.region === 'all' ? reg.n + ' countries' : Math.round(100 * reg.latestTotal / w.latestTotal) + '% of world generation'; pill.replaceWith(fresh); }
  } else if (typeof renderAtlasCards === 'function') renderAtlasCards();
  el.scrollTop = 0;
  const x = document.getElementById('gl-x'); if (x) x.addEventListener('click', () => GLOBE_SEL ? globeSelect(null) : globeRegion('all'));
  const foot = document.querySelector('#app > footer'); if (foot && matchMedia(GLOBE_WIDE).matches) el.appendChild(foot);   // credits at the end of the panel
  globeSideFit();
}
// marks the panel when it has more below than it shows (its scroll bar only appears then, on hover)
let GLOBE_SIDE_RO = null;
function globeSideFit() {
  const el = document.getElementById('gl-side'); if (!el) return;
  const check = () => el.classList.toggle('gl-overflows', el.scrollHeight > el.clientHeight + 1);
  check();
  if (!GLOBE_SIDE_RO && typeof ResizeObserver !== 'undefined') GLOBE_SIDE_RO = new ResizeObserver(() => { const e = document.getElementById('gl-side'); if (e) e.classList.toggle('gl-overflows', e.scrollHeight > e.clientHeight + 1); });
  if (GLOBE_SIDE_RO) { GLOBE_SIDE_RO.disconnect(); GLOBE_SIDE_RO.observe(el); [...el.children].forEach(c => GLOBE_SIDE_RO.observe(c)); }
}
function globeHTML() {
  return '<div class="gl-layout" id="gl-layout">'
    + '<div class="gl-wrap" id="gl-wrap"><div class="gl-canvas" id="gl-canvas" aria-label="Map of the world. Click a country for its electricity profile; the list view is keyboard-friendly."></div>'
    + '<p class="gl-loading" id="gl-loading">Loading the map…</p><div class="gl-key" id="gl-key" hidden></div></div>'
    + '<aside class="gl-side" id="gl-side" aria-live="polite"></aside>'
    + '</div>';
}
// How each group is defined, shown on the map next to the highlight
const GLOBE_DEFS = {
  eu: 'The 27 member states of the European Union.',
  g7: 'Canada, France, Germany, Italy, Japan, the United Kingdom and the United States.',
  opec: 'The 12 members of OPEC: Algeria, Congo, Equatorial Guinea, Gabon, Iran, Iraq, Kuwait, Libya, Nigeria, Saudi Arabia, the UAE and Venezuela.',
  brics: 'Brazil, Russia, India, China and South Africa, plus Egypt, Ethiopia, Iran and the UAE (joined 2024) and Indonesia (2025).',
  major: 'Generated 100 TWh or more in its latest year of data.',
  highcap: 'Electricity demand of 7 MWh or more per person in its latest year of data.',
  green: 'Renewables (hydro, wind, solar, bioenergy and other renewables) make up 70% or more of generation in its latest year. Nuclear does not count as renewable.',
  fossil: 'Coal, gas and other fossil fuels make up 90% or more of generation in its latest year.',
  lowcap: 'Electricity demand under 0.5 MWh per person in its latest year of data.',
  movers: 'At least 30% of the generation mix moved from one source to another between 2010 (or its first year of data) and its latest year.',
  growing: 'Generation in its latest year is at least double its 2010 level (or its first year of data).',
  falling: 'Generation in its latest year is at least 10% below its 2010 level (or its first year of data).',
  importers: 'Net imports cover 20% or more of electricity demand in its latest year.',
  exporters: 'Net exports are 10% or more of what it generates in its latest year.',
};
// continents: the countries whose continent could be argued, named when they are in
const GLOBE_EDGE = ['RUS', 'TUR', 'CYP', 'GEO', 'ARM', 'AZE', 'KAZ', 'EGY', 'PNG'];
function globeDef(g) {
  if (GLOBE_DEFS[g.id]) return GLOBE_DEFS[g.id];
  const edge = COUNTRIES.filter(c => GLOBE_EDGE.includes(c.iso3) && g.test(c)).map(c => c.name);
  return edge.length ? 'Includes ' + (edge.length > 1 ? edge.slice(0, -1).join(', ') + ' and ' + edge.at(-1) : edge[0]) + '.' : '';
}
function globeKey() {
  const el = document.getElementById('gl-key'); if (!el) return;
  if (GLOBE_SEL || GLOBE_REGION === 'all') { el.hidden = true; return; }
  const g = groupOf(GLOBE_REGION), r = globeAggregate(GLOBE_REGION), def = globeDef(g);
  // phones: the definition folds under the title (tap to open), so the key doesn't cover the map
  const top = '<span class="gl-key-sw" aria-hidden="true"></span><b>' + g.name + '</b><span class="gl-key-n">' + r.n + ' countries</span>';
  el.innerHTML = def
    ? '<details' + (matchMedia('(max-width: 600px)').matches ? '' : ' open') + '><summary class="gl-key-top">' + top + '<span class="gl-key-i" aria-hidden="true">i</span></summary>'
      + '<p class="gl-key-def">' + (g.trait ? '<span class="gl-key-tag">Energle’s definition</span> ' : '') + def + '</p></details>'
    : '<div class="gl-key-top">' + top + '</div>';
  el.classList.toggle('gl-key--low', !!g.trait);       // the flat world: keep the key over the southern ocean, clear of the countries
  el.hidden = false;
}
function globeHighlight() {
  if (!GLOBE || !GLOBE.getLayer('energle-sel-fill')) return;
  const f = ['==', ['get', 'iso3'], GLOBE_SEL ? GLOBE_SEL.iso3 : ''];
  GLOBE.setFilter('energle-sel-fill', f); GLOBE.setFilter('energle-sel-line', f);
  const reg = !GLOBE_SEL && GLOBE_REGION !== 'all' ? globeAggregate(GLOBE_REGION).members : [];
  GLOBE.setFilter('energle-reg-fill', ['in', ['get', 'iso3'], ['literal', reg]]); GLOBE.setFilter('energle-reg-line', ['in', ['get', 'iso3'], ['literal', reg]]);
  globeKey();
}
function globeSelect(c, fly = true) {
  GLOBE_SEL = c || null;
  globeSide(); globeHighlight();
  if (fly && GLOBE_SEL && GLOBE) globeProj('globe');
  if (fly && GLOBE_SEL && GLOBE) GLOBE.flyTo({ center: [GLOBE_SEL.lng, GLOBE_SEL.lat], zoom: globeZoomFor(GLOBE, GLOBE_SEL.iso3), duration: 1400, essential: true });
}
function globeFlyTo(iso3) { const c = COUNTRIES.find(x => x.iso3 === iso3); if (c) globeSelect(c); }
const GLOBE_REGIONS = Object.fromEntries(GLOBE_GROUPS.map(g => [g.id, true]));
// Where each geographic group sits: [longitude, latitude] of its middle and the radius (km) to keep in view.
// Groups made of traits are spread around the world, so the map shows the whole globe for them.
const GLOBE_VIEWS = {
  europe: [16, 53, 2600], africa: [19, 3, 3900], asiaonly: [88, 32, 4600], oceania: [157, -25, 3200],
  namerica: [-92, 33, 3900], samerica: [-60, -19, 3500],
  eu: [13, 51, 2200], g7: [-35, 45, 6200], opec: [20, 18, 5200], brics: [62, 18, 6500],
};
let GLOBE_PROJ = 'globe';
function globeProj(type) {
  if (!GLOBE || GLOBE_PROJ === type) return;
  GLOBE_PROJ = type; GLOBE.setProjection({ type });
  GLOBE.setMinZoom(type === 'mercator' ? -1 : null);
}
function globeViewZoom(km) {
  const cv = GLOBE.getContainer(), room = Math.min(cv.clientWidth, cv.clientHeight);
  // the group's diameter takes ~85% of the map's shorter side
  return Math.max(1, Math.min(5, Math.log2(0.85 * room * 40075 / (512 * 2 * km))));
}
function globeRegion(r) {
  GLOBE_REGION = GLOBE_REGIONS[r] ? r : 'all';
  if (ATLAS.region !== GLOBE_REGION) ATLAS.region = GLOBE_REGION;
  globeApplyGroup();
  GLOBE_SEL = null; globeSide(); globeHighlight();
  if (!GLOBE) return;
  const v = GLOBE_VIEWS[GLOBE_REGION];
  const flat = !!groupOf(GLOBE_REGION).trait;
  globeProj(flat ? 'mercator' : 'globe');
  if (flat) {                            // a trait is spread over the world: lay the whole world flat so every member shows
    const cv = GLOBE.getContainer();
    GLOBE.jumpTo({ center: [12, 22], zoom: Math.max(-1, Math.log2(cv.clientWidth / 512) - 0.05) }); return;
  }
  if (!v) { GLOBE.easeTo({ center: [10, 25], zoom: 1.5, duration: 1100 }); return; }
  GLOBE.easeTo({ center: [v[0], v[1]], zoom: globeViewZoom(v[2]), duration: 1100 });
}
// The chips (continents, then blocs) and the list view's filter for them
function globeChipsHTML() {
  const chip = g => '<button type="button" class="at-chip" data-r="' + g.id + '" aria-pressed="' + (g.id === ATLAS.region) + '">' + g.chip + '</button>';
  const item = g => '<button type="button" class="at-chip gl-trait" role="menuitem" data-r="' + g.id + '" aria-pressed="' + (g.id === ATLAS.region) + '">'
    + '<span class="gl-trait-name">' + g.chip + '</span><span class="gl-trait-rule">' + g.rule + '</span></button>';
  const traits = GLOBE_GROUPS.filter(g => g.trait);
  const folder = (cls, label, menu) => '<span class="gl-more ' + cls + '"' + (cls === 'gl-overflow' ? ' hidden' : '') + '>'
    + '<button type="button" class="at-chip gl-more-btn" data-label="' + label + '" aria-haspopup="true" aria-expanded="false">' + label + ' <span aria-hidden="true">▾</span></button>'
    + '<span class="gl-more-menu" role="menu" hidden>' + menu + '</span></span>';
  return '<div class="at-chips gl-chips" role="group" aria-label="Group">' + GLOBE_GROUPS.filter(g => !g.bloc && !g.trait).map(chip).join('')
    + '<span class="gl-chip-sep" aria-hidden="true"></span>' + GLOBE_GROUPS.filter(g => g.bloc).map(chip).join('')
    + folder('gl-overflow', 'More', '')
    + (traits.length ? '<span class="gl-chip-sep gl-sep-traits" aria-hidden="true"></span>' + folder('gl-traits', 'By trait',
        '<span class="gl-menu-h">Profile</span>' + traits.filter(g => g.trait === 'profile').map(item).join('')
        + '<span class="gl-menu-h">Trend &amp; trade</span>' + traits.filter(g => g.trait === 'trend').map(item).join('')) : '')
    + '</div>';
}
// The tools row: the search box takes the free width, the group chips sit on the right. When the chips
// would leave the search box less than SEARCH_MIN, the last ones fold into a "More" menu.
const SEARCH_MIN = 280;
function globeFitChips() {
  const row = document.querySelector('.gl-chips'), search = document.getElementById('browse-search'); if (!row || !search) return;
  const more = row.querySelector('.gl-overflow'), menu = more.querySelector('.gl-more-menu'), sep = row.querySelector('.gl-chip-sep');
  // start from everything on the row, in the original order
  menu.querySelectorAll('.gl-menu-sep').forEach(x => x.remove());
  [...menu.children].forEach(c => row.insertBefore(c, more)); more.hidden = true;
  if (matchMedia(GLOBE_WIDE).matches) {
    const inRow = () => [...row.querySelectorAll(':scope > .at-chip')];
    const fold = c => { more.hidden = false; menu.insertBefore(c, menu.firstChild); };
    // the blocs fold together first, then continents one by one from the end
    if (search.getBoundingClientRect().width < SEARCH_MIN) inRow().filter(c => groupOf(c.dataset.r).bloc).reverse().forEach(fold);
    while (search.getBoundingClientRect().width < SEARCH_MIN && inRow().length > 2) fold(inRow().pop());
    const firstCont = menu.querySelector('.at-chip:not([data-r="eu"]):not([data-r="g7"]):not([data-r="opec"]):not([data-r="brics"])');
    if (firstCont && menu.querySelector('[data-r="eu"]')) menu.insertBefore(Object.assign(document.createElement('span'), { className: 'gl-menu-sep' }), menu.querySelector('[data-r="eu"]'));
  }
  sep.hidden = !row.querySelector(':scope > .at-chip[data-r="eu"], :scope > .at-chip[data-r="g7"], :scope > .at-chip[data-r="opec"], :scope > .at-chip[data-r="brics"]')
    || !row.querySelector(':scope > .at-chip:not(.gl-more-btn)');
  globeMoreSync();
}
// a folder shows the name of the group picked inside it
function globeMoreSync() {
  document.querySelectorAll('.gl-more').forEach(more => {
    const btn = more.querySelector('.gl-more-btn'), on = more.querySelector('.gl-more-menu .at-chip[aria-pressed="true"]');
    btn.firstChild.textContent = (on ? (on.querySelector('.gl-trait-name') || on).textContent : btn.dataset.label) + ' ';
    btn.setAttribute('aria-pressed', String(!!on));
  });
}
// menus are placed on the page (fixed), so the chip row's own scrolling on phones never clips them
function globeMoreOpen(open, more) {
  document.querySelectorAll('.gl-more').forEach(m => {
    const on = !!open && m === more, menu = m.querySelector('.gl-more-menu'), btn = m.querySelector('.gl-more-btn');
    menu.hidden = !on; btn.setAttribute('aria-expanded', String(on));
    if (on) {
      const r = btn.getBoundingClientRect();
      menu.style.top = Math.round(r.bottom + 6) + 'px';
      menu.style.right = Math.max(8, Math.round(document.documentElement.clientWidth - r.right)) + 'px';
    }
  });
}
let GLOBE_FIT_RAF = 0;
window.addEventListener('resize', () => { cancelAnimationFrame(GLOBE_FIT_RAF); GLOBE_FIT_RAF = requestAnimationFrame(globeFitChips); });
document.addEventListener('click', e => { if (!e.target.closest('.gl-more')) globeMoreOpen(false); });
document.addEventListener('scroll', () => globeMoreOpen(false), true);
window.addEventListener('resize', () => globeMoreOpen(false));
function globeApplyGroup() {
  const g = groupOf(ATLAS.region), byIso = Object.fromEntries(COUNTRIES.map(c => [c.iso3, c]));
  let shown = 0;
  document.querySelectorAll('#at-list .at-row').forEach(r => {
    const iso = (r.getAttribute('onclick').match(/'(\w+)'/) || [])[1], c = byIso[iso];
    const ok = !!c && g.test(c) && (!ATLAS.q || r.dataset.name.includes(ATLAS.q) || r.dataset.alias.includes(ATLAS.q));
    r.hidden = !ok; if (ok) shown++;
  });
  const empty = document.getElementById('at-empty'); if (empty) empty.hidden = shown > 0;
  document.querySelectorAll('.at-chip[data-r]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.r === ATLAS.region)));
  globeMoreSync();
}

async function globeMount() {
  const el = document.getElementById('gl-canvas'); if (!el) return;
  if (GLOBE) { try { GLOBE.remove(); } catch (e) {} GLOBE = null; }
  GLOBE_SEL = null; GLOBE_REGION = ATLAS.region && GLOBE_REGIONS[ATLAS.region] ? ATLAS.region : 'all'; ATLAS.region = GLOBE_REGION;
  globeSide();                               // the region's cards show while the map loads
  let map;
  try {
    map = await globeMakeMap(el, { zoom: matchMedia('(max-width: 600px)').matches ? 0.7 : 1.5 }, (m, labelFont) => {
      m.addLayer({ id: 'energle-reg-fill', type: 'fill', source: 'energle', filter: ['in', ['get', 'iso3'], ['literal', []]], paint: { 'fill-color': GLOBE_ACCENT, 'fill-opacity': 0.38 } });
      m.addLayer({ id: 'energle-reg-line', type: 'line', source: 'energle', filter: ['in', ['get', 'iso3'], ['literal', []]], paint: { 'line-color': '#c97d0a', 'line-width': 1.1 } });
      m.addLayer({ id: 'energle-sel-fill', type: 'fill', source: 'energle', filter: ['==', ['get', 'iso3'], ''], paint: { 'fill-color': GLOBE_ACCENT, 'fill-opacity': 0.22 } });
      m.addLayer({ id: 'energle-sel-line', type: 'line', source: 'energle', filter: ['==', ['get', 'iso3'], ''], paint: { 'line-color': GLOBE_ACCENT, 'line-width': 2 } });
      globeAddNames(m, labelFont);
      const l = document.getElementById('gl-loading'); if (l) l.remove();
      globeHighlight();
      if (ATLAS.last) { const iso = ATLAS.last; ATLAS.last = null; globeFlyTo(iso); }
      else if (GLOBE_REGION !== 'all') globeRegion(GLOBE_REGION);   // back on the map with a group picked: frame it again
    });
  } catch (e) { const l = document.getElementById('gl-loading'); if (l) l.textContent = 'The map could not load here. The list view still works.'; return; }
  if (!map) return;
  GLOBE = map; GLOBE_PROJ = 'globe';
  map.on('click', 'energle-hit', e => { const iso = e.features[0] && e.features[0].properties.iso3; if (iso) globeFlyTo(iso); });
  map.on('click', e => { if (!map.queryRenderedFeatures(e.point, { layers: ['energle-hit'] }).length && GLOBE_SEL) globeSelect(null, false); });
  const mq = matchMedia(GLOBE_WIDE), onMq = () => { if (GLOBE_SEL) globeSelect(GLOBE_SEL, false); else globeSide(); }; mq.addEventListener('change', onMq);
  map._onGone = () => {                     // left the page: put the game back as it was
    mq.removeEventListener('change', onMq); document.body.classList.remove('at-globe');
    const foot = document.querySelector('.gl-side footer'); if (foot) foot.remove();
    GLOBE_SEL = null; if (GLOBE_PREV_TARGET !== undefined) { target = GLOBE_PREV_TARGET; GLOBE_PREV_TARGET = undefined; }
    if (GLOBE === map) GLOBE = null;
  };
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && GLOBE_SEL && GLOBE) globeSelect(null, false); });

// ============================================================
//  2. GUESS MAP — the Map button in the guess bar opens the globe inside the page, next to the
//     information (on a laptop: a column on the right; on a phone: just above the guess bar), so the
//     charts stay in view while you look around (laptop: the map in the middle, the cards around it). Tap a country to put it in the guess box.
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
  const fills = done.flatMap(g => [['==', ['get', 'iso3'], g.iso3], 'rgb(' + closeRGB(kmBand(guessInfo(g).km).prox).join(',') + ')']);
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
  const info = document.getElementById('gw-info');
  if (matchMedia(GMAP_WIDE).matches) { if (info && card.parentNode !== info) info.appendChild(card); }   // the middle of the information block
  else if (head && card.nextSibling !== head) head.before(card);
}
function gmapShow(on) {
  GMAP_ON = on; try { localStorage.setItem('energle_gmap', on ? 'on' : 'off'); } catch (e) {}
  document.body.classList.toggle('gm-on', on);
  const b = document.getElementById('gm-btn'); if (b) { b.setAttribute('aria-pressed', String(on)); b.title = on ? 'Hide the map' : 'Show the map'; }
  let card = document.getElementById('gm-card');
  if (!on) { if (card) card.hidden = true; gmapRedrawFlow(); return; }
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
  gmapRedrawFlow();
}
// the trade flow is drawn to the width it had: redraw it when the map opens or closes and the column changes width
function gmapRedrawFlow() { if (document.getElementById('flow-chart') && target) requestAnimationFrame(() => renderFlowBar(false)); }
matchMedia(GMAP_WIDE).addEventListener('change', () => { gmapPlace(); if (GMAP) setTimeout(() => GMAP.resize(), 50); gmapRedrawFlow(); });

// ============================================================
//  DISTANCE LEVELS — with a map at hand, an exact distance pins the answer down too easily (above all for
//  close guesses), so the guess rows show a band instead. The closeness ring and colour step with the band.
//  The exact distances stay in the result's pathway, once the game is over.
// ============================================================
const KM_BANDS = [[1000, '<1k km', 'less than 1,000 km'], [2500, '1\u20132.5k km', '1,000 to 2,500 km'], [5000, '2.5\u20135k km', '2,500 to 5,000 km'],
  [10000, '5\u201310k km', '5,000 to 10,000 km'], [Infinity, '>10k km', 'more than 10,000 km']];
const BAND_MID = [600, 1750, 3750, 7500, 13000];
function kmBand(km) { const i = KM_BANDS.findIndex(b => km < b[0]); return { i, short: KM_BANDS[i][1], long: KM_BANDS[i][2], prox: closeness(BAND_MID[i]) }; }
// rewrite a freshly drawn guess row: band instead of kilometres, ring and colour by band
function bandRow(country) {
  const row = document.getElementById('guesses') && document.getElementById('guesses').firstElementChild;
  if (!row || row.classList.contains('gr-row--win')) return;
  const h = guessInfo(country), b = kmBand(h.km), col = closeRGB(b.prox), name = country.name;
  const L = 2 * Math.PI * 13, filled = L * b.prox / 100;
  row.style.setProperty('--cl', col.join(','));
  const ring = row.querySelector('.gr-ring'); if (ring) { ring.setAttribute('stroke-dasharray', filled.toFixed(1) + ' ' + L.toFixed(1)); ring.style.setProperty('--c', filled.toFixed(1)); }
  const num = row.querySelector('.gr-num'); if (num) num.setAttribute('aria-label', 'Guess, ' + b.long + ' from the answer');
  const tip = row.querySelector('.gr-tip'); if (tip) tip.textContent = 'The answer is ' + b.long + ' away. The fuller and greener the ring, the closer this guess is.';
  const km = row.querySelector('.gr-km'); if (km) { km.textContent = b.short; km.style.color = darker(col); }
  const hint = row.querySelector('.gr-hint'); if (hint) hint.setAttribute('aria-label', 'Hint: the answer is ' + b.long + ' ' + DIR_NAMES[h.dir] + ' of ' + name);
  const ht = row.querySelector('.gr-htip'); if (ht) ht.textContent = 'Hint toward the answer: it lies ' + b.long + ' to the ' + DIR_NAMES[h.dir] + ' of ' + name + '. The figures on the left are ' + name + '\u2019s own. Exact distances show in your path once the game is over.';
  const wire = row.querySelector('.gr-wire-fill'); if (wire) wire.style.width = b.prox + '%';
}

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
  ['balance-card', 'charts-section', 'legend-shared'].forEach(id => { const n = document.getElementById(id); if (n) info.appendChild(n); });   // the game's own order
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
    if (!GLOBE_REGIONS[ATLAS.region]) ATLAS.region = 'all';
    const chips = document.querySelector('.at-chips');
    if (chips) {
      chips.outerHTML = globeChipsHTML();
      document.querySelectorAll('.at-chip[data-r]').forEach(btn => btn.addEventListener('click', () => {
        globeMoreOpen(false);
        ATLAS.region = btn.dataset.r;
        if (ATLAS.view === 'globe') globeRegion(ATLAS.region); else globeApplyGroup();
        globeFitChips();                     // a folder now shows the group's name, which can change what fits
      }));
    }
    document.querySelectorAll('.gl-more-btn').forEach(mb => mb.addEventListener('click', () => globeMoreOpen(mb.getAttribute('aria-expanded') !== 'true', mb.closest('.gl-more'))));
    const search = document.getElementById('browse-search');
    if (search) search.addEventListener('input', () => setTimeout(globeApplyGroup, 0));
    document.querySelectorAll('.at-sort select, select.at-sort, #at-sort').forEach(el => el.addEventListener('change', () => setTimeout(globeApplyGroup, 0)));
    globeApplyGroup();
    globeFitChips();
  };
  if (typeof ISO3_CONTINENT !== 'undefined' && !ISO3_CONTINENT.TUR) ISO3_CONTINENT.TUR = 'Europe';
  // Explore also adds up the practice profiles and trends (big producers, green leaders, importers...)
  PRACTICE_CATEGORIES.filter(c => c.group === 'profile' || c.group === 'trend').forEach(c => {
    if (GLOBE_GROUPS.some(g => g.id === c.id)) return;
    GLOBE_GROUPS.push({ id: c.id, chip: c.label, name: c.label, trait: c.group, rule: c.rule, test: c.filter });
    REGION_NAMES[c.id] = c.label; GLOBE_REGIONS[c.id] = true;
  });
  // Practice uses the same groups as the Explore chips: continents split like the map, plus the blocs.
  // Asia & Pacific and Americas stay defined (old links and saved sessions) but leave the picker.
  PRACTICE_CATEGORIES.forEach(c => { if (c.id === 'asia' || c.id === 'americas') c.group = 'retired'; });
  const at = PRACTICE_CATEGORIES.findIndex(c => c.group !== 'region' && c.group !== 'retired');
  const RULES = { eu: 'The 27 member states', g7: 'The seven largest advanced economies', opec: 'The 12 oil-exporting members', brics: 'Brazil, Russia, India, China, South Africa and the 2024–25 joiners' };
  const added = GLOBE_GROUPS.filter(g => !PRACTICE_CATEGORIES.some(c => c.id === g.id)).map(g => ({
    id: g.id, group: g.bloc ? 'bloc' : 'region', label: g.name,
    rule: RULES[g.id] || '', filter: g.test }));
  PRACTICE_CATEGORIES.splice(at, 0, ...added);
  Object.assign(CAT_EMOJIS, { asiaonly: '🌏', oceania: '🌏', namerica: '🌎', samerica: '🌎', eu: '🇪🇺', g7: '🏛️', opec: '🛢️', brics: '🌐' });
  const _picker = renderPracticePickerScreen;
  window.renderPracticePickerScreen = function () {
    document.body.classList.remove('gm-on');
    // the picker draws region, profile and trend; the blocs ride in the region grid, then move to their own section
    const blocs = PRACTICE_CATEGORIES.filter(c => c.group === 'bloc'); blocs.forEach(c => c.group = 'region');
    try { _picker(); } finally { blocs.forEach(c => c.group = 'bloc'); }
    const reg = document.querySelector('.pc-section[aria-label="By region"]');
    if (reg) {
      reg.insertAdjacentHTML('afterend', '<section class="pc-section" aria-label="By bloc"><div class="pc-head"><span class="pc-h">By bloc</span>'
        + '<span class="pc-sub">Economic and political groups</span></div><div class="pc-grid"></div></section>');
      const grid = reg.nextElementSibling.querySelector('.pc-grid');
      blocs.forEach(c => { const b = reg.querySelector('.pc-main[onclick="startPractice(\'' + c.id + '\')"]'); if (b) grid.appendChild(b.closest('.pc-card')); });
    }
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
  window.addGuessRow = function (country, isCorrect, animate) { _row(country, isCorrect, animate); if (!isCorrect) bandRow(country); GMAP_PICK = null; gmapUpdate(); };
  const _end = endGame;
  window.endGame = function () { _end(); gmapUpdate(); };
  const _new = newGame;
  window.newGame = function () { _new(); GMAP_PICK = null; gmapUpdate(); };
});
