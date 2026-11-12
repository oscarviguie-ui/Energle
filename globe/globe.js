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
    map.setProjection({ type: opts && opts.flat ? 'mercator' : 'globe' });
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
    + '<div class="gl-tabs" id="gl-tabs" role="tablist" aria-label="Profile and clue cards"></div>'
    + '<button type="button" class="gl-x" id="gl-x" aria-label="Close">×</button></div>'
    + '<div class="gl-pane" id="gl-pane-profile">' + globeCardsHTML() + '</div><section id="clue-cards" class="gl-cards gl-pane"></section>';
}
function globeRegionHTML(r) {
  return '<div class="gl-p-head"><span class="gl-reg-ico" aria-hidden="true">' + GLOBE_ICON + '</span><div><h3>' + r.name + '</h3><span>'
    + (groupOf(r.region).trait && groupOf(r.region).trait !== 'source' ? '<span class="gl-sub-x">' + groupOf(r.region).rule + ' · </span>' : '') + r.n + ' countries<span class="gl-sub-x"> added together</span> · ' + r.latestYear + '</span></div>'
    + (r.region === 'all'      // the world: every practice group; a group: a round on just its countries
      ? '<button type="button" class="gl-practice" onclick="renderPracticePickerScreen()">Practice<span class="gl-pr-n"> by group</span> →</button>'
      : '<button type="button" class="gl-practice" onclick="startPractice(\'' + r.region + '\')">Practice<span class="gl-pr-n"> these ' + r.n + '</span> →</button>')
    + '<div class="gl-tabs" id="gl-tabs" role="tablist" aria-label="Profile and clue cards"></div>'
    + (r.region !== 'all' ? '<button type="button" class="gl-x" id="gl-x" aria-label="Back to the world">×</button>' : '') + '</div>'
    // the group's definition sits in the panel, under its title (the map shows no key)
    + (GLOBE_DEFS[r.region] ? '<p class="gl-def">' + (groupOf(r.region).trait ? '<span class="gl-key-tag">Energle’s definition</span> ' : '') + GLOBE_DEFS[r.region] + '</p>' : '')
    + '<div class="gl-pane" id="gl-pane-profile">' + globeCardsHTML() + '</div><section id="clue-cards" class="gl-cards gl-pane"></section>';
}
let GLOBE_REGION = 'all';
function globeSide() {
  const el = document.getElementById('gl-side'), lay = document.getElementById('gl-layout'); if (!el) return;
  globeRestoreTarget();
  const reg = !GLOBE_SEL ? globeAggregate(GLOBE_REGION) : null;
  GLOBE_PREV_TARGET = target; target = GLOBE_SEL || reg;
  el.innerHTML = GLOBE_SEL ? globeCountryHTML(GLOBE_SEL) : globeRegionHTML(reg);
  el.classList.toggle('is-region', !GLOBE_SEL);
  const mh = document.getElementById('gl-maphint'); if (mh) mh.hidden = !!GLOBE_SEL || GLOBE_REGION !== 'all' || !!GLOBE_SHADE;
  el.hidden = false;
  if (lay) lay.classList.add('has-sel');
  renderStatBar(); renderFlowBar(); renderCharts();
  if (!GLOBE_SEL) {                      // a world average next to a regional total says nothing: show its share of the world instead
    const pill = document.getElementById('stat-world-gen'), w = globeAggregate('all');
    if (pill) { const fresh = pill.cloneNode(false); fresh.removeAttribute('id');      // a fresh node: the count-up keeps writing to the old one
      fresh.textContent = reg.region === 'all' ? reg.n + ' countries' : Math.round(100 * reg.latestTotal / w.latestTotal) + '% of world generation'; pill.replaceWith(fresh); }
    globeRegionCards(reg); globeTabs();
  } else if (typeof renderAtlasCards === 'function') { renderAtlasCards(); globeTabs(); }
  el.scrollTop = 0;
  const x = document.getElementById('gl-x'); if (x) x.addEventListener('click', () => GLOBE_SEL ? globeSelect(null) : globeRegion('all'));
  const foot = document.querySelector('#app > footer'); if (foot && lay && matchMedia(GLOBE_WIDE).matches) lay.appendChild(foot);   // credits under the map
  globeShadeRelock();
  globeSideFit();
  gphAfterSide();
  globeHeadSlot();
  globeLayoutFit();
}
// the panel's title stays at the top of the panel (an older layout moved it up to the tools row)
function globeHeadSlot() {
  const slot = document.getElementById('gl-head-slot'), side = document.getElementById('gl-side');
  if (slot && slot.firstChild && side) side.insertBefore(slot.firstChild, side.querySelector('.gl-grab') ? side.querySelector('.gl-grab').nextSibling : side.firstChild);
}
// laptops: the map and the panel fill at least the window's height (CSS min-height from --gl-top); when the panel needs
// more (the charts never shrink below their 300px), the page grows by exactly that much and scrolls as a whole
let GLOBE_WRAP_RO = null, GLOBE_CHART_RO = null;
function globeLayoutFit() {
  const lay = document.getElementById('gl-layout'); if (!lay) return;
  document.body.style.setProperty('--gl-top', Math.round(lay.getBoundingClientRect().top + window.scrollY) + 'px');
  // the charts follow their boxes at once (Chart.js's own resize can lag a beat, leaving the mix over the CO2 strip)
  if (typeof ResizeObserver !== 'undefined') {
    if (!GLOBE_CHART_RO) GLOBE_CHART_RO = new ResizeObserver(() => { try { if (lineChart) lineChart.resize(); if (barChart) barChart.resize(); } catch (e) {} });
    GLOBE_CHART_RO.disconnect();
    ['line-wrapper', 'bar-wrapper'].forEach(id => { const e = document.getElementById(id); if (e) GLOBE_CHART_RO.observe(e); });
  }
  const wrap = document.getElementById('gl-wrap');
  if (wrap && typeof ResizeObserver !== 'undefined') {
    if (!GLOBE_WRAP_RO) GLOBE_WRAP_RO = new ResizeObserver(() => { if (GLOBE) try { GLOBE.resize(); } catch (e) {} });
    GLOBE_WRAP_RO.disconnect(); GLOBE_WRAP_RO.observe(wrap);
  }
}
window.addEventListener('resize', () => { requestAnimationFrame(() => { globeHeadSlot(); globeLayoutFit(); }); });
// A country's panel: Profile, then one tab per clue card, so everything fits without scrolling.
// The tab you're on stays when you click the next country, to compare one card across countries.
let GLOBE_TAB = 0, GLOBE_TAB_NAME = 'Profile';
const GLOBE_TAB_NAMES = { 'Renewables Potential': 'Sun & wind', 'People & Power': 'People & power', 'Underground Riches': 'Underground', 'Electricity Trade': 'Power trade', 'Fuel Trade': 'Fuel trade' };
function globeTabs() {
  const bar = document.getElementById('gl-tabs'), cards = [...document.querySelectorAll('#clue-cards .ic-card')]; if (!bar) return;
  const names = cards.map(c => { const t = ((c.querySelector('.ic-title') || {}).textContent || 'Clue card').split('·')[0].trim(); return GLOBE_TAB_NAMES[t] || t; });
  GLOBE_TAB = GLOBE_TAB_NAME === 'Profile' ? 0 : names.indexOf(GLOBE_TAB_NAME) + 1;     // a card the panel lacks: back to Profile
  bar.innerHTML = '<button type="button" class="gl-tab" role="tab" data-t="0">Profile</button>'
    + (cards.length ? '<span class="gl-tabs-sep" aria-hidden="true"></span>' : '') + names.map((n, i) => '<button type="button" class="gl-tab gl-tab--card" role="tab" data-t="' + (i + 1) + '">' + n + '</button>').join('');
  bar.addEventListener('click', e => { const b = e.target.closest('.gl-tab'); if (b) globeTab(+b.dataset.t); });
  globeTab(GLOBE_TAB, true);
}
function globeTab(t, first) {
  const was = GLOBE_TAB; GLOBE_TAB = t;
  const tb = document.querySelector('#gl-tabs .gl-tab[data-t="' + t + '"]'); if (!first && tb) GLOBE_TAB_NAME = tb.textContent;
  document.querySelectorAll('#gl-tabs .gl-tab').forEach(b => b.setAttribute('aria-selected', String(+b.dataset.t === t)));
  const prof = document.getElementById('gl-pane-profile'), cc = document.getElementById('clue-cards');
  if (prof) prof.hidden = t !== 0;
  if (cc) { cc.hidden = t === 0; cc.querySelectorAll('.ic-card').forEach((c, i) => { c.hidden = i !== t - 1; }); cc.scrollTop = 0; }
  // the charts were drawn while hidden: draw them again at their real size
  if (t === 0 && (was !== 0 || first)) requestAnimationFrame(() => { try { if (lineChart) lineChart.resize(); if (barChart) barChart.resize(); } catch (e) {} if (target) renderFlowBar(false); });
  if (!first) requestAnimationFrame(globeLayoutFit);
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
    + '<p class="gl-loading" id="gl-loading">Loading the map…</p><div class="gl-key" id="gl-key" hidden></div>'
    + globeHintHTML()
    + '<div class="gl-shade" id="gl-shade" hidden></div></div>'
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
  GLOBE.setFilter('energle-reg-fill', ['in', ['get', 'iso3'], ['literal', reg]]);
  // a source's producers are already shown by the map's colour: no outlines around a hundred countries
  GLOBE.setFilter('energle-reg-line', ['in', ['get', 'iso3'], ['literal', String(GLOBE_REGION).startsWith('src_') ? [] : reg]]);
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
// The part of the map nothing covers: the tools floating on top, the phone's sheet below. MapLibre centres
// every view (start, groups, countries) in that part, so the globe never sits half under the sheet.
function globePad(map) {
  map = map || GLOBE; if (!map) return { top: 0, bottom: 0, left: 0, right: 0 };
  const cv = map.getContainer(), r = cv.getBoundingClientRect();
  let top = 0, bottom = 0;
  const tools = document.querySelector('body.at-globe .at-tools');
  if (tools) { const t = tools.getBoundingClientRect(); if (t.height && t.top >= r.top - 4 && t.bottom > r.top && t.bottom < r.bottom) top = Math.round(t.bottom - r.top) + 4; }
  if (typeof gphOn === 'function' && gphOn()) {
    const side = document.getElementById('gl-side');
    // the sheet's target height, not its current one: it slides (CSS transition), so mid-slide it is still at the old height
    if (side) { const h = parseFloat(side.style.height) || side.getBoundingClientRect().height; bottom = Math.max(0, Math.round(h)); try { bottom = Math.min(bottom, gphHeights().half); } catch (e) {} }
  }
  const p = { top, bottom, left: 0, right: 0 };
  // setting the padding mid-move would stop the move (a fly to a country, a turn to a group): set it once it lands
  if (map.isMoving && map.isMoving()) {
    if (!map._padWait) { map._padWait = true; map.once('moveend', () => { map._padWait = false; globePad(map); }); }
    return p;
  }
  try { map.setPadding(p); } catch (e) {}
  return p;
}
// the zoom at which the whole globe, `share` of the free room across, fits (MapLibre: radius = worldSize / 2π / cos(lat))
function globeFitZoom(map, share, lat, pad) {
  const cv = map.getContainer(), p = pad || { top: 0, bottom: 0 };
  const room = Math.min(cv.clientWidth, cv.clientHeight - p.top - p.bottom) * (share || 0.9);
  return Math.log2(Math.max(60, room) * Math.cos((lat || 0) * Math.PI / 180) / (1024 / (2 * Math.PI)));
}
function globeViewZoom(km) {
  const cv = GLOBE.getContainer(), p = globePad(), room = Math.min(cv.clientWidth, cv.clientHeight - p.top - p.bottom);
  // the group's diameter takes ~85% of the map's shorter side
  return Math.max(1, Math.min(5, Math.log2(0.85 * room * 40075 / (512 * 2 * km))));
}
// the middle of a spread-out group: members' positions on the sphere, weighted by what they generate (of that source, for a
// source's group); with nothing to weigh, Europe and Africa
function globeGroupMiddle(g) {
  let x = 0, y = 0, z = 0;
  // a source's group leans toward where that source is made (France and the US for nuclear), not just big grids
  const share = /^src_/.test(g.id) ? new Map(globeShares(g.id.slice(4))) : null;
  COUNTRIES.filter(g.test).forEach(c => {
    if (c.lat == null || c.lng == null) return;
    const w = (c.latestTotal || 1) * (share ? share.get(c.iso3) || 0 : 1), la = c.lat * Math.PI / 180, lo = c.lng * Math.PI / 180;
    x += w * Math.cos(la) * Math.cos(lo); y += w * Math.cos(la) * Math.sin(lo); z += w * Math.sin(la);
  });
  const h = Math.hypot(x, y); if (!h && !z) return [10, 25];
  const lat = Math.atan2(z, h) * 180 / Math.PI, lng = Math.atan2(y, x) * 180 / Math.PI;
  return [lng, Math.max(-30, Math.min(35, lat))];   // kept near the equator so both hemispheres show
}
function globeRegion(r) {
  GLOBE_REGION = GLOBE_REGIONS[r] ? r : 'all';
  if (ATLAS.region !== GLOBE_REGION) ATLAS.region = GLOBE_REGION;
  globeApplyGroup();
  GLOBE_SEL = null; globeSide(); globeHighlight();
  if (!GLOBE) return;
  const v = GLOBE_VIEWS[GLOBE_REGION];
  globeProj('globe');                    // always the globe, groups made of a trait or a source included
  if (groupOf(GLOBE_REGION).trait) {     // spread over the world: the whole globe, turned toward where most of the members' power is made
    const c = globeGroupMiddle(groupOf(GLOBE_REGION));
    const pad = globePad(); GLOBE.easeTo({ center: c, zoom: globeFitZoom(GLOBE, 0.9, c[1], pad), padding: pad, duration: 1100 }); return;
  }
  const pad = globePad();
  if (!v) { GLOBE.easeTo({ center: [10, 25], zoom: globeFitZoom(GLOBE, 0.9, 25, pad), padding: pad, duration: 1100 }); return; }
  GLOBE.easeTo({ center: [v[0], v[1]], zoom: globeViewZoom(v[2]), padding: pad, duration: 1100 });
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
// The tools row: the search box takes the free width; the groups sit in folders beside it (laptops and phones)
// or in a sliding row of chips (tablets).
function globeFitChips() {
  const row = document.querySelector('.gl-chips'), search = document.getElementById('browse-search'); if (!row || !search) return;
  const more = row.querySelector('.gl-overflow'), menu = more.querySelector('.gl-more-menu'), sep = row.querySelector('.gl-chip-sep');
  const traits = row.querySelector('.gl-traits'), tmenu = traits && traits.querySelector('.gl-more-menu'), tsep = row.querySelector('.gl-sep-traits');
  // start from everything on the row, in the original order (trait items back in their own folder)
  menu.querySelectorAll('.gl-menu-sep, .gl-menu-ph').forEach(x => x.remove());
  [...menu.children].forEach(c => { if (c.matches('.gl-trait, .gl-menu-h')) tmenu.appendChild(c); else row.insertBefore(c, more); });
  more.hidden = true; if (traits) traits.hidden = false; if (tsep) tsep.hidden = false;
  const inRow = () => [...row.querySelectorAll(':scope > .at-chip')];
  const head = t => Object.assign(document.createElement('span'), { className: 'gl-menu-h gl-menu-ph', textContent: t });
  const phone = matchMedia(GLOBE_PHONE).matches, wide = matchMedia(GLOBE_WIDE).matches;
  more.querySelector('.gl-more-btn').dataset.label = phone || wide ? 'Regions' : 'More';
  if (phone || wide) {
    // phones: one button beside the search box holds every group, so the map gets the chips' row;
    // laptops: regions and blocs in one button, traits in the other, so the panel's title fits on the tools row
    more.hidden = false;
    menu.appendChild(head('Regions'));
    inRow().forEach(c => { if (groupOf(c.dataset.r).bloc) return; menu.appendChild(c); });
    menu.appendChild(head('Blocs'));
    inRow().forEach(c => menu.appendChild(c));
    if (phone) { if (tmenu) [...tmenu.children].forEach(c => menu.appendChild(c)); if (traits) traits.hidden = true; if (tsep) tsep.hidden = true; }
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
document.addEventListener('scroll', e => { if (e.target && e.target.closest && e.target.closest('.gl-more-menu')) return; globeMoreOpen(false); }, true);
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
    map = await globeMakeMap(el, { zoom: matchMedia('(max-width: 600px)').matches ? 1.05 : 1.5 }, (m, labelFont) => {
      m.addLayer({ id: 'energle-reg-fill', type: 'fill', source: 'energle', filter: ['in', ['get', 'iso3'], ['literal', []]], paint: { 'fill-color': GLOBE_ACCENT, 'fill-opacity': 0.38 } });
      m.addLayer({ id: 'energle-shade', type: 'fill', source: 'energle', layout: { visibility: 'none' }, paint: { 'fill-color': '#f2efe9', 'fill-opacity': 0 } });
      m.addLayer({ id: 'energle-reg-line', type: 'line', source: 'energle', filter: ['in', ['get', 'iso3'], ['literal', []]], paint: { 'line-color': '#c97d0a', 'line-width': 1.1 } });
      m.addLayer({ id: 'energle-sel-fill', type: 'fill', source: 'energle', filter: ['==', ['get', 'iso3'], ''], paint: { 'fill-color': GLOBE_ACCENT, 'fill-opacity': 0.22 } });
      m.addLayer({ id: 'energle-sel-line', type: 'line', source: 'energle', filter: ['==', ['get', 'iso3'], ''], paint: { 'line-color': GLOBE_ACCENT, 'line-width': 2 } });
      globeAddNames(m, labelFont);
      const l = document.getElementById('gl-loading'); if (l) l.remove();
      globeHighlight();
      if (GLOBE_SHADE) requestAnimationFrame(() => globeShade(GLOBE_SHADE));
      if (ATLAS.last) { const iso = ATLAS.last; ATLAS.last = null; globeFlyTo(iso); }
      else if (GLOBE_REGION !== 'all') globeRegion(GLOBE_REGION);   // back on the map with a group picked: frame it again
    });
  } catch (e) { const l = document.getElementById('gl-loading'); if (l) l.textContent = 'The map could not load here. The list view still works.'; return; }
  if (!map) return;
  GLOBE = map; GLOBE_PROJ = 'globe';
  { const p = globePad(map); if (GLOBE_REGION === 'all' && !ATLAS.last) map.jumpTo({ zoom: globeFitZoom(map, 0.9, 25, p) }); }
  if (!window._glPadRz) { window._glPadRz = true; window.addEventListener('resize', () => { if (GLOBE) globePad(); }); }
  map.once('idle', () => map.fire('drag'));   // fold the map credits behind their (i): they'd sit under the map's own key
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
  // a full-width strip between the cards and the guess bar, on every screen
  const head = document.getElementById('guess-head') || document.getElementById('input-area');
  if (head && card.nextSibling !== head) head.before(card);
}
// the whole globe fits the strip's height; it turns to show each guess, and the answer at the end
function gmapFitZoom(m, lat) { return globeFitZoom(m, 0.94, lat); }
function gmapTurn(iso3, dur) {
  const m = GMAP, c = iso3 && COUNTRIES.find(x => x.iso3 === iso3); if (!m || !c) return;
  m.easeTo({ center: [c.lng, Math.max(-50, Math.min(55, c.lat))], zoom: Math.max(m.getZoom(), gmapFitZoom(m, Math.max(-50, Math.min(55, c.lat)))), duration: dur == null ? 900 : dur });
}
function gmapStart() {
  // where the map opens: on the answer once the game is over, else on the last guess, else Europe and Africa
  const last = guesses.length ? guesses[guesses.length - 1].iso3 : null;
  return gameOver && target ? target.iso3 : last;
}
function gmapShow(on, scroll) {
  GMAP_ON = on; try { localStorage.setItem('energle_gmap', on ? 'on' : 'off'); } catch (e) {}
  document.body.classList.toggle('gm-on', on);
  const b = document.getElementById('gm-btn'); if (b) { b.setAttribute('aria-pressed', String(on)); b.title = on ? 'Hide the map' : 'Show the map'; }
  let card = document.getElementById('gm-card');
  gmapReopenSync();
  if (!on) { if (card) card.hidden = true; gmapRedrawFlow(); return; }
  if (!card) {
    card = document.createElement('section'); card.id = 'gm-card'; card.className = 'gm-card'; card.setAttribute('aria-label', 'Map');
    card.innerHTML = '<div class="gm-wrap"><div class="gl-canvas" id="gm-canvas"></div><p class="gl-loading" id="gm-loading">Loading the map…</p>'
      + '<button type="button" class="gm-x" id="gm-x" aria-label="Hide the map">×</button></div>';
    document.body.appendChild(card); gmapPlace();
    card.querySelector('#gm-x').addEventListener('click', () => gmapShow(false));
    // a wide, short strip: the whole world laid flat fills it, every country one tap away
    const cv = document.getElementById('gm-canvas');
    GMAP = null;
    globeMakeMap(cv, { center: [10, 25], zoom: 0.5 }, (m, labelFont) => {
      m.addLayer({ id: 'gm-fill', type: 'fill', source: 'energle', filter: ['==', ['get', 'iso3'], ''], paint: { 'fill-color': 'rgba(0,0,0,0)', 'fill-opacity': 0.55 } });
      m.addLayer({ id: 'gm-pick-fill', type: 'fill', source: 'energle', filter: ['==', ['get', 'iso3'], ''], paint: { 'fill-color': GLOBE_ACCENT, 'fill-opacity': 0.25 } });
      m.addLayer({ id: 'gm-pick', type: 'line', source: 'energle', filter: ['==', ['get', 'iso3'], ''], paint: { 'line-color': GLOBE_ACCENT, 'line-width': 2.5 } });
      m.addLayer({ id: 'gm-answer', type: 'fill', source: 'energle', filter: ['==', ['get', 'iso3'], ''], paint: { 'fill-color': '#22a35a', 'fill-opacity': 0.4 } });
      m.addLayer({ id: 'gm-answer-line', type: 'line', source: 'energle', filter: ['==', ['get', 'iso3'], ''], paint: { 'line-color': '#15803d', 'line-width': 2 } });
      globeAddNames(m, labelFont);
      const l = document.getElementById('gm-loading'); if (l) l.remove();
      GMAP = m; m.jumpTo({ zoom: gmapFitZoom(m, 25) }); m.setMinZoom(Math.max(-2, gmapFitZoom(m, 0) - 0.6));
      const st = gmapStart(); if (st) gmapTurn(st, 0);
      gmapUpdate();
      // credits folded behind their (i) so they don't cover the short strip
      m.once('idle', () => m.fire('drag'));   // MapLibre folds compact credits on the first drag
    }).then(map => {
      if (!map) return;
      map.on('click', 'energle-hit', e => { const iso = e.features[0] && e.features[0].properties.iso3; if (iso) gmapPick(iso); });
      map._onGone = () => { if (GMAP === map) GMAP = null; };
    }).catch(() => { const l = document.getElementById('gm-loading'); if (l) l.textContent = 'The map could not load here.'; });
  }
  card.hidden = false; gmapPlace();
  if (GMAP) { GMAP.resize(); gmapUpdate(); const st = gmapStart(); if (st) gmapTurn(st, 0); }
  // opened from the button: bring the map and the guess bar into view together
  if (scroll) requestAnimationFrame(() => { const ia = document.getElementById('input-area'); if (ia) ia.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); });
  gmapRedrawFlow();
}
function gmapReopenSync() {
  let b = document.getElementById('gm-reopen');
  const need = !GMAP_ON && typeof gameOver !== 'undefined' && gameOver && document.getElementById('gw-cols');
  if (!need) { if (b) b.remove(); return; }
  if (!b) {
    b = document.createElement('button'); b.type = 'button'; b.id = 'gm-reopen'; b.className = 'gm-reopen';
    b.innerHTML = GMAP_ICON + '<span>Show the map</span>';
    b.addEventListener('click', () => gmapShow(true, false));
  }
  const head = document.getElementById('guess-head') || document.getElementById('guesses');
  if (head && b.nextSibling !== head) head.before(b);
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
    document.body.classList.remove('gm-on', 'ex-picker'); document.body.classList.add('ex-hdr');
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
    gphMount();
    globeSuggestBind();
    // list view: the practice picker sits at the end of the tools row (the page has no title row there)
    const tl = document.querySelector('.at-tools');
    if (tl && !tl.querySelector('.gl-tools-practice')) tl.insertAdjacentHTML('beforeend', '<button type="button" class="gl-tools-practice" onclick="renderPracticePickerScreen()">Practice<span class="gl-pr-n"> by group</span> →</button>');
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
    document.body.classList.remove('gm-on'); document.body.classList.add('ex-hdr', 'ex-picker');
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
    // the way back to the map sits at the top, plain and obvious; the bottom asks for new categories
    const sr = document.querySelector('.subtitle-row');
    if (sr) {
      const rest = sr.querySelector('.sub-rest'); if (rest) rest.textContent = 'pick a group of countries to train on · no score, no streak';
      const tag = sr.querySelector('.sub-date'); if (tag) tag.remove();
      sr.insertAdjacentHTML('beforeend', '<button type="button" class="pc-back-map" onclick="switchMode(\'practice\')"><span aria-hidden="true">←</span>' + GLOBE_ICON + 'Explore map</button>');
    }
    // "By region" gets its line like the others; every card opens its group on the Explore map instead of a list
    const rs = reg && reg.querySelector('.pc-sub'); if (rs) rs.textContent = 'Continents as drawn on the map';
    document.querySelectorAll('.pc-grid').forEach(g => { if (g.children.length <= 7) g.style.setProperty('--n', g.children.length); });
    document.querySelectorAll('.pc-list').forEach(b => {
      const id = (b.getAttribute('onclick') || '').match(/showCountryList\('([^']+)'\)/); if (!id) return;
      b.removeAttribute('onclick'); b.classList.add('pc-onmap');
      b.innerHTML = GLOBE_ICON + 'On the map <span aria-hidden="true">→</span>';
      b.addEventListener('click', () => { ATLAS.region = id[1]; switchMode('practice'); });
    });
    const at = document.querySelector('.pc-atlas');
    if (at) at.outerHTML = '<button type="button" class="pc-atlas pc-suggest" onclick="globeSuggestCategory()">'
      + '<span class="pc-atlas-txt"><span class="pc-atlas-title">Missing a group?</span>'
      + '<span class="pc-atlas-sub">Suggest a category to practice and explore: a region, a bloc or a trait</span></span>'
      + '<span class="pc-atlas-cta">Suggest a category →</span></button>';
  };
  const _archive = renderArchiveScreen;
  window.renderArchiveScreen = function (d) { document.body.classList.remove('gm-on', 'ex-hdr', 'ex-picker'); return _archive(d); };
  // the game screen: one information block, the guess bar under it, a Map button in the guess bar
  const _game = renderGameScreen;
  window.renderGameScreen = function () {
    document.body.classList.remove('ex-hdr', 'ex-picker');
    const old = document.getElementById('gm-card'); if (old) old.remove();
    _game();
    gwLayout();
    const sub = document.getElementById('submit-btn');
    if (sub && !document.getElementById('gm-btn')) { sub.insertAdjacentHTML('beforebegin', gmapButtonHTML()); document.getElementById('gm-btn').addEventListener('click', () => gmapShow(!GMAP_ON, true)); }
    GMAP_PICK = null; gmapShow(GMAP_ON);
  };
  const _row = addGuessRow;
  window.addGuessRow = function (country, isCorrect, animate) { _row(country, isCorrect, animate); if (!isCorrect) bandRow(country); GMAP_PICK = null; gmapUpdate(); if (animate !== false && country) gmapTurn(country.iso3); };
  const _end = endGame;
  window.endGame = function () { _end(); gmapUpdate(); if (target) gmapTurn(target.iso3, 1200); gmapReopenSync(); };
  const _new = newGame;
  window.newGame = function () { _new(); GMAP_PICK = null; gmapUpdate(); };
});

// ============================================================
//  WHAT'S NEW (test page): a wider window that fits one screen on laptops, led by the Explore update
//  with a small demo that plays through what Explore does, using the real numbers.
// ============================================================
const EXPLORE_UPDATE = ['10 Nov', 'Explore: the world on a map',
  'Practice is now Explore. Click any country for its full profile and clue cards. Add up a continent, a bloc like the EU or OPEC, or a trait like Green leaders, clue cards included. Click a source under the charts to colour the map by it. And practise on any group.'];
let NX_SVG = null;
function nxMapSVG() {
  if (!NX_SVG) NX_SVG = fetch(GLOBE_DIR + 'explore-demo.svg').then(r => r.ok ? r.text() : '').catch(() => '');
  return NX_SVG;
}
const nxGen = v => v >= 1000 ? (v / 1000).toFixed(2) + ' PWh' : fmtTwh(v);
// the demo's steps, one per thing Explore does: groups (continent, bloc, trait), the source map, the group clue cards,
// a country, and practice
function nxSteps() {
  const grp = (id, cap, extra) => {
    const g = groupOf(id), r = globeAggregate(id), list = COUNTRIES.filter(g.test);
    return Object.assign({ cap, iso: new Set(list.map(c => c.iso3)), all: id === 'all',
      head: '<b>' + g.name + '</b><span>' + (id === 'all' ? r.n + ' countries' : r.n + ' countries added together') + ' · ' + r.latestYear + '</span>',
      big: nxGen(r.latestTotal), def: g.trait ? '<span class="gl-key-tag">Energle’s definition</span> ' + g.rule : '', mix: groupShares(list) }, extra || {});
  };
  const steps = [grp('all', 'Every country, on the map'), grp('europe', 'Add up a continent'), grp('eu', '…a bloc like the EU or OPEC'), grp('green', '…or a trait, with its definition')];
  // the source map: Nuclear, darker for a bigger share
  try {
    const sh = globeShares('Nuclear'), max = Math.max(...sh.map(x => x[1])), id = globeSourceGroup('Nuclear'), r = globeAggregate(id);
    const top = sh.slice().sort((a, b) => b[1] - a[1])[0], topC = COUNTRIES.find(c => c.iso3 === top[0]);
    steps.push({ cap: 'Click a source under the charts: the map takes its colour', shade: new Map(sh), shadeMax: max, shadeCol: colorOf('Nuclear'),
      head: '<b>Nuclear producers</b><span>' + r.n + ' countries · darker = more</span>', big: nxGen(r.latestTotal),
      def: 'Up to ' + Math.round(max * 100) + '% of generation (' + (topC ? topC.name : '') + ') · their totals and clue cards add up too', mix: groupShares(COUNTRIES.filter(groupOf(id).test)) });
  } catch (e) {}
  // a group's clue cards, added up: OPEC's reserves
  try {
    const e = globeAggCards('opec');
    if (e && e.fossil) {
      const pct = v => v >= 0.01 ? Math.round(v * 100) + '%' : '<1%';
      steps.push(grp('opec', 'Clue cards add up for groups', {
        head: '<b>OPEC · Underground riches</b><span>' + e._n + ' members, reserves summed</span>',
        row: '<div class="nx-ug">' + [['oil', 'Oil', v => Math.round(v).toLocaleString('en-US') + ' bn barrels'], ['gas', 'Gas', v => Math.round(v) + ' tn m³'], ['coal', 'Coal', v => (v < 10 ? v.toFixed(1) : Math.round(v)) + ' bn t']]
          .map(([k, n, f]) => '<span class="nx-ug-row"><b>' + n + '</b><span>' + f(e.fossil[k][0]) + '</span><em>' + pct(e._share[k]) + ' of the world</em></span>').join('') + '</div>',
        def: '' }));
    }
  } catch (e) {}
  const fr = COUNTRIES.find(c => c.iso3 === 'FRA');
  if (fr) steps.push({ cap: 'Click a country for its profile and clue cards', iso: new Set(['FRA']), one: true,
    head: flagImg('FRA', 'nx-flag') + '<b>France</b><span>' + fr.latestYear + ' · 5 clue cards</span>', big: nxGen(fr.latestTotal), def: 'Sun & wind · People & power · Underground · Power trade · Fuel trade', mix: sharesOf(fr) });
  steps.push(grp('brics', 'Practise on any group', { row: '<div class="nx-row"><div class="nx-card-h"><b>BRICS</b><span>' + COUNTRIES.filter(groupOf('brics').test).length + ' countries</span></div>'
    + '<span class="nx-pill">Practice these ' + COUNTRIES.filter(groupOf('brics').test).length + ' →</span></div>', def: 'A round of guesses on just those countries: no score, no streak' }));
  return steps;
}
function nxDemoHTML() {
  return '<div class="nx-demo" id="nx-demo"><div class="nx-mapbox" id="nx-mapbox"></div>'
    + '<div class="nx-card" id="nx-card" aria-live="polite"></div><div class="nx-cap" id="nx-cap"></div>'
    + '<div class="nx-dots" id="nx-dots" role="tablist" aria-label="Demo steps"></div></div>';
}
// a colour between the map's paper and the source's colour
function nxMix(col, t) {
  const h = x => parseInt(x, 16), c = col.replace('#', ''), a = [246, 239, 224], b = [h(c.slice(0, 2)), h(c.slice(2, 4)), h(c.slice(4, 6))];
  return 'rgb(' + a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',') + ')';
}
function nxDemoStart(root) {
  const steps = nxSteps(); let i = 0, timer = null, paths = [];
  const box = root.querySelector('#nx-mapbox'), card = root.querySelector('#nx-card'), cap = root.querySelector('#nx-cap'), dots = root.querySelector('#nx-dots');
  dots.innerHTML = steps.map((s, k) => '<button type="button" class="nx-dot" role="tab" aria-label="' + s.cap + '" data-k="' + k + '"></button>').join('');
  const show = k => {
    i = k; const s = steps[k];
    paths.forEach(p => {
      if (s.shade) { const v = s.shade.get(p.dataset.i) || 0; p.classList.remove('on', 'lit', 'pick'); p.style.fill = v > 0.005 ? nxMix(s.shadeCol, Math.min(1, v / s.shadeMax)) : ''; return; }
      p.style.fill = '';
      const on = s.all ? true : s.iso.has(p.dataset.i); p.classList.toggle('on', on && !s.all); p.classList.toggle('lit', on && s.all); p.classList.toggle('pick', !!s.one && on);
    });
    card.innerHTML = (s.row || '<div class="nx-row"><div class="nx-card-h">' + s.head + '</div><div class="nx-big">' + s.big + '<small>generated</small></div>' + mixBarHTML(s.mix, 'nx-mix') + '</div>')
      .replace('<div class="nx-ug">', '<div class="nx-row"><div class="nx-card-h">' + s.head + '</div></div><div class="nx-ug">')
      + (s.row && s.row.includes('nx-ug') ? '' : '<p class="nx-def">' + (s.def || '&nbsp;') + '</p>');
    cap.textContent = s.cap;
    dots.querySelectorAll('.nx-dot').forEach((d, j) => d.setAttribute('aria-selected', String(j === k)));
  };
  const play = () => { clearInterval(timer); if (!REDUCED_MOTION) timer = setInterval(() => { if (!document.body.contains(root)) return clearInterval(timer); show((i + 1) % steps.length); }, 3400); };
  dots.addEventListener('click', e => { const d = e.target.closest('.nx-dot'); if (d) { show(+d.dataset.k); play(); } });
  root.addEventListener('mouseenter', () => clearInterval(timer)); root.addEventListener('mouseleave', play);
  nxMapSVG().then(svg => { box.innerHTML = svg; paths = [...box.querySelectorAll('path[data-i]')]; show(i); });
  show(0); play();
}
function showNoticeWide() {
  if (document.getElementById('notice-modal')) return;
  try { localStorage.setItem(NOTICE_KEY, '1'); localStorage.setItem(NEWS_SEEN_KEY, newsId()); } catch (e) {}
  const sd = document.getElementById('sub-date'); if (sd) { sd.classList.remove('has-news'); const ic = sd.querySelector('.sd-ico'); if (ic) ic.remove(); }
  const [d0, t0, x0] = UPDATES[0], open = practiceUnlocked();
  const modal = document.createElement('div'); modal.id = 'notice-modal';
  modal.innerHTML = '<div class="st-backdrop"></div>'
    + '<div class="nt-box nt-box--log nt-wide" role="dialog" aria-modal="true" aria-labelledby="nt-title">'
    + '<div class="nx-top"><div><span class="nt-eyebrow">What’s new</span><h2 class="nt-title" id="nt-title">Latest updates</h2></div>'
    + '<button type="button" class="gl-x nx-close" aria-label="Close">×</button></div>'
    + '<section class="nx-feature">' + nxDemoHTML()
    + '<div class="nx-text"><span class="nx-new">New · ' + d0 + '</span><h3>' + t0 + '</h3><p>' + x0 + '</p>'
    + (open ? '<button type="button" class="nx-cta" id="nx-cta">Open Explore →</button>'
            : '<p class="nx-lock">🔒 Explore opens once you’ve finished today’s puzzle.</p>') + '</div></section>'
    + '<div class="nx-earlier"><span class="nt-eyebrow nx-sub">Earlier updates</span><ol class="nt-log nx-log">'
    + UPDATES.slice(1).map(([d, t, x]) => '<li title="' + escHtml(x.replace(/<[^>]+>/g, '')) + '"><span class="nt-date">' + d + '</span><span class="nt-item"><strong>' + t + '</strong><span class="nx-x">' + x + '</span></span></li>').join('') + '</ol></div>'
    + '<div class="nx-foot"><div class="nt-soon"><span class="nt-eyebrow">Coming soon</span><div class="nx-soon-row">'
    + COMING.map(([t, x]) => '<div class="nt-soon-item"><strong>' + t + '</strong><span>' + x + '</span></div>').join('') + '</div></div>'
    + '<div class="nx-foot-end"><p class="nt-fb">Have an idea for the next update? <button type="button" class="ft-link nt-fb-link" onclick="showFeedback()">Send feedback</button></p>'
    + '<button type="button" class="nt-btn" id="nt-ok">Got it</button></div></div>'
    + '</div>';
  const close = () => { modal.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  modal.querySelector('.st-backdrop').addEventListener('click', close);
  document.body.appendChild(modal);
  modal.querySelector('.nx-close').addEventListener('click', close);
  document.getElementById('nt-ok').addEventListener('click', close);
  const cta = document.getElementById('nx-cta'); if (cta) cta.addEventListener('click', () => { close(); switchMode('practice'); });
  document.addEventListener('keydown', onKey);
  nxDemoStart(modal.querySelector('.nx-feature'));
  document.getElementById('nt-ok').focus({ preventScroll: true });
}
if (globeOn()) document.addEventListener('DOMContentLoaded', () => {
  if (typeof UPDATES !== 'undefined' && UPDATES[0][1] !== EXPLORE_UPDATE[1]) UPDATES.unshift(EXPLORE_UPDATE);
  window.showNotice = showNoticeWide;
});


// ============================================================
//  SEARCH SUGGESTIONS (every width): as you type on the map view, the matching countries drop down under the box
// ============================================================
function globeSuggestBind() {
  const inp = document.getElementById('browse-search'); if (!inp || inp.dataset.sugg) return; inp.dataset.sugg = '1';
  const box = document.createElement('div'); box.className = 'gl-sugg'; box.id = 'gl-sugg'; box.setAttribute('role', 'listbox'); box.hidden = true;
  inp.insertAdjacentElement('afterend', box);
  const close = () => { box.hidden = true; };
  const pick = iso => { close(); inp.value = ''; inp.dispatchEvent(new Event('input')); inp.blur(); globeFlyTo(iso); };
  inp.addEventListener('input', () => {
    const q = inp.value.trim().toLowerCase();
    if (!q || ATLAS.view !== 'globe') return close();
    const hits = COUNTRIES.filter(c => c.name.toLowerCase().includes(q) || (NAME_ALIAS[c.name] || '').toLowerCase().includes(q))
      .sort((a, b) => a.name.toLowerCase().indexOf(q) - b.name.toLowerCase().indexOf(q) || a.name.localeCompare(b.name)).slice(0, 6);
    box.innerHTML = hits.length ? hits.map(c => '<button type="button" class="gl-sugg-row" role="option" data-i="' + c.iso3 + '">' + flagImg(c.iso3, 'gl-sugg-flag')
      + '<span>' + escHtml(c.name) + '</span><small>' + fmtTwh(c.latestTotal) + '</small></button>').join('') : '<p class="gl-sugg-none">No country matches.</p>';
    box.hidden = false;
  });
  box.addEventListener('pointerdown', e => e.preventDefault());           // keep the box open while tapping a row
  box.addEventListener('click', e => { const r = e.target.closest('.gl-sugg-row'); if (r) pick(r.dataset.i); });
  inp.addEventListener('blur', () => setTimeout(close, 120));
  inp.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
}

// ============================================================
//  PHONES: the header and tools stay as they are; the map takes the rest of the screen and the panel is a sheet
//  that slides up over the map's lower part (peek → half → full).
// ============================================================
const GLOBE_PHONE = '(max-width: 700px)';
let GPH_STATE = 'peek';
const gphOn = () => document.body.classList.contains('at-globe') && matchMedia(GLOBE_PHONE).matches;
function gphMount() {
  const nb = document.getElementById('mode-nav');   // the header's Daily / Archive / Explore pill
  if (nb) document.body.style.setProperty('--gph-hb', Math.round(nb.getBoundingClientRect().height) + 'px');
  gphAfterSide();
}
// the sheet's three heights
function gphHeights() {
  const side = document.getElementById('gl-side'), head = side && side.querySelector('.gl-p-head'), lay = document.getElementById('gl-layout');
  const H = lay ? lay.clientHeight : window.innerHeight * 0.6;
  const peek = head ? Math.round(head.offsetTop + head.offsetHeight + 12) : 90;
  // the tools float on the map, so the sheet can rise further: half is 60% of the map, full stops under the tools
  const tools = document.querySelector('.at-tools'), under = tools ? Math.max(0, tools.getBoundingClientRect().bottom - (lay ? lay.getBoundingClientRect().top : 0)) + 6 : 0;
  return { peek, half: Math.round(Math.max(peek + 40, H * 0.6)), full: Math.round(H - under), nav: 0, top: 0 };
}
function gphSheet(state, h) {
  const side = document.getElementById('gl-side'); if (!side || !gphOn()) return;
  const hs = gphHeights(); GPH_STATE = state || GPH_STATE;
  const px = h != null ? h : hs[GPH_STATE];
  side.style.height = px + 'px'; side.dataset.sheet = GPH_STATE;
  if (GPH_STATE === 'peek' && h == null) side.scrollTop = 0;
  document.body.style.setProperty('--gph-sheet', px + 'px');
  if (GLOBE && h == null) requestAnimationFrame(() => globePad());
}
function gphAfterSide() {
  const side = document.getElementById('gl-side'); if (!side) return;
  if (!gphOn()) { side.style.height = ''; delete side.dataset.sheet; if (GLOBE) globePad(); return; }
  if (!side.querySelector('.gl-grab')) side.insertAdjacentHTML('afterbegin', '<div class="gl-grab" aria-hidden="true"></div>');
  if (!side.dataset.gphBound) { side.dataset.gphBound = '1'; gphDrag(side); }
  gphSheet(GLOBE_SEL ? (GPH_STATE === 'full' ? 'full' : 'half') : 'peek');
}
// drag the sheet by its handle or its header; a tap toggles between peek and half
function gphDrag(side) {
  let y0 = null, h0 = 0, moved = false;
  side.addEventListener('pointerdown', e => {
    if (!gphOn() || e.target.closest('button, a, input, .gl-tabs')) return;
    if (!e.target.closest('.gl-grab, .gl-p-head')) return;
    y0 = e.clientY; h0 = side.offsetHeight; moved = false; side.classList.add('is-dragging'); side.setPointerCapture(e.pointerId);
  });
  side.addEventListener('pointermove', e => {
    if (y0 == null) return; const dy = y0 - e.clientY; if (Math.abs(dy) > 6) moved = true;
    const hs = gphHeights(); gphSheet(null, Math.max(hs.peek, Math.min(hs.full, h0 + dy)));
  });
  const end = () => {
    if (y0 == null) return; side.classList.remove('is-dragging');
    const hs = gphHeights(), h = side.offsetHeight; y0 = null;
    if (!moved) return gphSheet(GPH_STATE === 'peek' ? 'half' : 'peek');
    const near = ['peek', 'half', 'full'].sort((a, b) => Math.abs(hs[a] - h) - Math.abs(hs[b] - h))[0];
    gphSheet(near);
  };
  side.addEventListener('pointerup', end); side.addEventListener('pointercancel', end);
}
window.addEventListener('resize', () => { if (document.getElementById('gl-side')) gphAfterSide(); });

// ============================================================
//  GROUP CLUE CARDS: the cards that add up are added up over a group's members, from cards.json:
//  Underground Riches (reserves summed, share of the world, rents weighted by GDP) and People & Power
//  (population- or GDP-weighted averages). Sun & wind and the two trade cards don't add up simply.
// ============================================================
const AGG_CARDS = {};
function globeAggCards(rid) {
  if (AGG_CARDS[rid]) return AGG_CARDS[rid];
  const CD = CARDS_DATA && CARDS_DATA.countries; if (!CD) return null;
  const all = Object.keys(CD).filter(k => !k.startsWith('R_'));
  const mem = globeAggregate(rid).members.map(iso => ({ iso, e: CD[iso], c: COUNTRIES.find(x => x.iso3 === iso) })).filter(m => m.e && m.c);
  const pop = c => { const d = (ALL_DATA[c.name].years || {})[c.latestYear] || {}; return c.latestDpc > 0 && d.Demand > 0 ? d.Demand / c.latestDpc : 0; };
  mem.forEach(m => { m.pop = pop(m.c); m.gdpTot = (m.e.gdp || 0) * m.pop; });
  // a weighted average over the members that have the value
  const wavg = (get, w) => { let a = 0, b = 0; mem.forEach(m => { const v = get(m), k = w(m); if (typeof v === 'number' && isFinite(v) && k > 0) { a += v * k; b += k; } }); return b ? a / b : null; };
  const has = k => mem.filter(m => (m.e.cards || []).includes(k));
  const out = { cards: [], _n: mem.length, _of: globeAggregate(rid).n };
  // ---- Underground Riches
  const U = has('under');
  if (U.length) {
    out.cards.push('under');
    out.fossil = {}; out._share = {}; out._held = {};
    ['oil', 'gas', 'coal'].forEach(k => {
      const v = U.reduce((a, m) => a + (((m.e.fossil || {})[k] || [])[0] || 0), 0);
      const w = all.reduce((a, iso) => a + (((CD[iso].fossil || {})[k] || [])[0] || 0), 0);
      out.fossil[k] = [v, null, null]; out._share[k] = w ? v / w : 0;
      out._held[k] = U.filter(m => (((m.e.fossil || {})[k] || [])[0] || 0) > 0).length;
    });
    out.minerals = {};
    const syms = new Set(); U.forEach(m => Object.keys(m.e.minerals || {}).forEach(s => syms.add(s)));
    syms.forEach(sym => {
      const rows = U.map(m => (m.e.minerals || {})[sym]).filter(Boolean);
      const units = {}; rows.forEach(r => { units[r[1]] = (units[r[1]] || 0) + 1; });
      const u = Object.keys(units).sort((a, b) => units[b] - units[a])[0];
      const best = i => { const v = rows.map(r => r[i]).filter(x => x); return v.length ? Math.min(...v) : null; };
      out.minerals[sym] = [rows.filter(r => r[1] === u).reduce((a, r) => a + (r[0] || 0), 0), u, best(2), best(3)];
    });
    out.rents = {};
    ['oil', 'gas', 'coal', 'min'].forEach(k => { out.rents[k] = wavg(m => (m.e.rents || {})[k], m => m.gdpTot) || 0; });
    out.coalYears = null;
  }
  // ---- People & Power
  const P = has('people');
  if (P.length) {
    out.cards.push('people');
    const urb = m => m.pop * (m.e.urban || 0) / 100, rur = m => m.pop * (100 - (m.e.urban || 0)) / 100;
    const r0 = v => v == null ? 0 : Math.round(v);
    out.access = [r0(wavg(m => (m.e.access || [])[0], urb)), r0(wavg(m => (m.e.access || [])[1], rur))];
    out.cook = r0(wavg(m => m.e.cook, m => m.pop));
    out.cuts = null;
    out.hdd = r0(wavg(m => m.e.hdd, m => m.pop)); out.cdd = r0(wavg(m => m.e.cdd, m => m.pop));
    out.cold = r0(wavg(m => m.e.cold, m => m.pop)); out.hot = r0(wavg(m => m.e.hot, m => m.pop));
    out.coldM = 'Coldest month'; out.hotM = 'Hottest month';
    out.urban = r0(wavg(m => m.e.urban, m => m.pop));
    const gp = mem.reduce((a, m) => a + (m.e.gdp > 0 ? m.pop : 0), 0);
    out.gdp = gp ? Math.round(mem.reduce((a, m) => a + (m.e.gdp > 0 ? m.gdpTot : 0), 0) / gp) : 0;
    out.industry = r0(wavg(m => m.e.industry, m => m.gdpTot));
  }
  return (AGG_CARDS[rid] = out);
}
function globeRegionCards(r) {
  const host = document.getElementById('clue-cards'); if (!host) return;
  host.innerHTML = '';
  if (typeof cardScope !== 'function' || !CARDS_DATA) return;
  const e = globeAggCards(r.region); if (!e || !e.cards.length) return;
  CARDS_DATA.countries[target.iso3] = e;                 // the group's own entry, so the cards' own renderers can read it
  let scope;
  try { scope = cardScope(); } catch (err) { console.error('group cards', err); return; }
  CARD_SCOPE_ISO = null;                                  // never reused by the daily
  const pct = v => v >= 0.1 ? Math.round(v * 100) + '%' : v > 0 ? (v * 100 < 1 ? '<1%' : (v * 100).toFixed(1) + '%') : '—';
  if (scope.fossil) scope.fossil = scope.fossil.map((f, i) => { const k = ['oil', 'gas', 'coal'][i];
    return Object.assign({}, f, { r: pct(e._share[k]), rCls: 'ug-chip' + (e._share[k] ? ' is-share' : ' is-none'),
      p: e._held[k] ? e._held[k] + ' of ' + e._n : '—', pCls: 'ug-chip' + (e._held[k] ? ' is-held' : ' is-none') }); });
  const html = e.cards.map(k => {
    const c = SHOP_CARDS.find(x => x.k === k);
    const o = { cls: 'ic-card v3-card' + (c && c.full ? ' is-full' : ' is-half'), tagCls: 'ic-cost ic-cost--none', tag: '', tagTitle: '', cells: [] };
    try { return tplRender(k, Object.assign(Object.create(scope), { o })); } catch (err) { console.error('group card ' + k, err); return ''; }
  }).join('');
  host.innerHTML = '<div class="ic-sechead"><span class="section-title">Clue cards</span><span class="ic-secsub">Added up over ' + e._n + ' of ' + e._of + ' countries</span></div><div class="ic-slot">' + html + '</div>';
  // say what the numbers are for a group: shares of the world and how many members hold some, not world ranks
  const hs = host.querySelectorAll('.fs-h'); if (hs[2]) hs[2].textContent = 'Share of world'; if (hs[3]) hs[3].textContent = 'Held by';
  // a reserve wraps between its number and its unit, never inside the unit ("1,725 / bn barrels", not "1,725 bn / barrels")
  host.querySelectorAll('.fs-table .ug-val').forEach(v => { if (v.children.length) return; v.textContent = v.textContent.trim().replace(/^(\S+)\s+(.+)$/, (m, a, b) => a + ' ' + b.replace(/ /g, '\u00a0')); });
  const mn = host.querySelector('.mn-tiles'), note = mn && mn.parentElement.querySelector('.v3-note'); if (note) note.textContent = 'lit = a member in the world top 10 · summed reserves';
  host.querySelectorAll('.ic-card').forEach(card => card.insertAdjacentHTML('beforeend', '<p class="gl-agg-note">Added up over the ' + e._n + ' members with data: totals are summed; shares and averages are weighted by population or GDP.</p>'));
}

// the practice picker's last card: the feedback box, opened on a category idea
function globeSuggestCategory() {
  showFeedback();
  const t = document.getElementById('fb-text'), h = document.getElementById('fb-title');
  if (h) h.textContent = 'Suggest a category';
  if (t) { t.placeholder = 'Which group of countries would you like to practice or explore? (e.g. Nordic countries, island nations, nuclear users)'; t.value = 'Category idea: '; t.focus(); }
}


// ============================================================
//  SOURCE MAP: click a source in the legend (Coal, Hydro, Nuclear…, or Fossil / Nuclear / Renewables "by category")
//  and the map colours every country by that source's share of its generation, darker for more. Click it again, or
//  the ×, to go back. It lives in the legend the panel already has, so it takes no room of its own.
// ============================================================
let GLOBE_SHADE = null;
function globeShares(src) {
  const cat = typeof CATEGORIES !== 'undefined' ? CATEGORIES.find(c => c.key === src) : null;
  const keys = cat ? cat.members : [src];
  return COUNTRIES.map(c => {
    const d = (ALL_DATA[c.name].years || {})[c.latestYear] || {};
    const v = keys.reduce((a, k) => a + (d[k] || 0), 0);
    return [c.iso3, d.Total > 0 ? Math.max(0, Math.min(1, v / d.Total)) : 0];
  });
}
// The map's hint: one click folds it into a ? bubble in the bottom-right corner, one click on the ? opens it again (remembered)
function globeHintMini() { try { return localStorage.getItem('energle_maphint_mini') === '1'; } catch (e) { return false; } }
function globeHintHTML() {
  const mini = globeHintMini();
  return '<button type="button" class="gl-maphint' + (mini ? ' is-mini' : '') + '" id="gl-maphint" aria-expanded="' + !mini + '" title="' + (mini ? 'How the map works' : 'Hide this tip') + '">'
    + '<span class="gl-mh-txt"><b>Click a country</b> for its profile · <b>click a source</b> under the charts to colour the map</span>'
    + '<span class="gl-mh-q" aria-hidden="true">?</span><span class="cr-sr gl-mh-sr">' + (mini ? 'Show how the map works' : '') + '</span></button>';
}
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('#gl-maphint'); if (!b) return;
  const mini = !b.classList.contains('is-mini');
  b.classList.toggle('is-mini', mini); b.setAttribute('aria-expanded', String(!mini));
  b.title = mini ? 'How the map works' : 'Hide this tip';
  const sr = b.querySelector('.gl-mh-sr'); if (sr) sr.textContent = mini ? 'Show how the map works' : '';
  try { localStorage.setItem('energle_maphint_mini', mini ? '1' : '0'); } catch (err) {}
});
function globeShade(src) {
  GLOBE_SHADE = src || null;
  const key = document.getElementById('gl-shade'), mh = document.getElementById('gl-maphint');
  if (mh) mh.hidden = !!src || !!GLOBE_SEL || GLOBE_REGION !== 'all';
  if (!GLOBE || !GLOBE.getLayer('energle-shade')) { if (key) key.hidden = !src; return; }
  if (!src) {
    GLOBE.setLayoutProperty('energle-shade', 'visibility', 'none');
    GLOBE.setPaintProperty('energle-reg-fill', 'fill-opacity', 0.38); GLOBE.setPaintProperty('energle-sel-fill', 'fill-opacity', 0.22);
    if (key) key.hidden = true;
    return;
  }
  const sh = globeShares(src), max = Math.max(0.1, Math.ceil(Math.max(...sh.map(x => x[1])) * 10) / 10);
  const col = colorOf(src), val = ['match', ['get', 'iso3'], ...sh.flat(), 0];
  GLOBE.setPaintProperty('energle-shade', 'fill-color', ['interpolate', ['linear'], val, 0, '#f6efe0', max, col]);
  GLOBE.setPaintProperty('energle-shade', 'fill-opacity', ['case', ['>', val, 0.005], 0.9, 0]);
  GLOBE.setLayoutProperty('energle-shade', 'visibility', 'visible');
  GLOBE.setPaintProperty('energle-reg-fill', 'fill-opacity', 0); GLOBE.setPaintProperty('energle-sel-fill', 'fill-opacity', 0);   // group and country keep their outlines only
  const n = sh.filter(x => x[1] > 0.005).length;
  if (key) {
    key.innerHTML = '<span class="gl-shade-name"><span class="gl-shade-sw" style="background:' + col + '"></span>' + escHtml(src) + '</span>'
      + '<span class="gl-shade-txt">share of each country’s generation · ' + n + ' countries</span>'
      + '<span class="gl-shade-scale"><small>0%</small><span class="gl-shade-bar" style="background:linear-gradient(90deg,#f6efe0,' + col + ')"></span><small>' + Math.round(max * 100) + '%</small></span>'
      + '<button type="button" class="gl-shade-x" aria-label="Stop colouring the map">×</button>';
    key.querySelector('.gl-shade-x').addEventListener('click', () => { lockedSource = null; focusSource(null); });
    key.hidden = false;
  }
}
// after the panel (and its legend) is redrawn: keep the source that colours the map selected
function globeShadeRelock() {
  if (!GLOBE_SHADE) return;
  const chip = document.querySelector('#legend-shared .legend-item[data-src="' + GLOBE_SHADE + '"]');
  if (!chip) { globeShade(null); return; }
  lockedSource = GLOBE_SHADE; FOCUS_SRC = GLOBE_SHADE; _globeFocus(GLOBE_SHADE);
}
let _globeFocus = null;
if (globeOn()) document.addEventListener('DOMContentLoaded', () => {
  _globeFocus = focusSource;
  // a click in the legend (it locks a source) colours the map; hovering only highlights the charts, as before
  window.focusSource = function (src) {
    _globeFocus(src);
    if (!document.getElementById('gl-wrap') || !document.body.classList.contains('at-globe')) return;
    const want = lockedSource || null;
    if (want === GLOBE_SHADE) return;
    globeShade(want);
    try { localStorage.setItem('energle_srcmap_seen', '1'); } catch (e) {}
    document.body.classList.remove('gl-srcnudge');
    if (want && !GLOBE_SEL) {                     // the producers of that source become the group: totals and clue cards added up
      if (!String(GLOBE_REGION).startsWith('src_')) GLOBE_SRC_PREV = GLOBE_REGION;
      globeRegion(globeSourceGroup(want));
    } else if (!want && String(GLOBE_REGION).startsWith('src_')) globeRegion(GLOBE_SRC_PREV || 'all');
  };
});

// phones: the gold medal and name are sized to the header's boxes (the mode switch's height)
function hdBoxFit() { const n = document.getElementById('mode-nav'); if (n) document.body.style.setProperty('--hd-box', Math.round(n.getBoundingClientRect().height) + 'px'); }
if (globeOn()) { document.addEventListener('DOMContentLoaded', () => { const app = document.getElementById('app'); if (app && window.MutationObserver) new MutationObserver(() => requestAnimationFrame(hdBoxFit)).observe(app, { childList: true }); }); window.addEventListener('resize', hdBoxFit); }
// Explore, wide windows: the mode switch and Stats & Leaderboard sit with their bottom edge on the wordmark's baseline,
// and the mode switch is centred on the page (as far as the logo and the right-hand buttons allow)
function hdAlignNav() {
  const nav = document.getElementById('mode-nav'), word = document.querySelector('.hd-brand .logo-word'), lb = document.querySelector('.hd-grid .lb-split'), pod = document.querySelector('.hd-grid .podium');
  if (!nav || !word) return;
  [nav, lb, pod].forEach(e => { if (e) { e.style.top = ''; e.style.left = ''; } });
  hdBoxFit();
  if (!(document.body.classList.contains('ex-hdr') && matchMedia('(min-width: 1240px)').matches)) return;
  const probe = document.createElement('span'); probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
  word.appendChild(probe);
  const base = probe.getBoundingClientRect().top; probe.remove();
  [nav, lb, pod].forEach(e => { if (e) e.style.top = Math.round(base - e.getBoundingClientRect().bottom) + 'px'; });
  const g = document.querySelector('.hd-grid').getBoundingClientRect(), n = nav.getBoundingClientRect(), br = document.querySelector('.hd-brand').getBoundingClientRect();
  const lo = br.right + 24 - n.left, hi = (lb ? lb.getBoundingClientRect().left : g.right) - 24 - n.right;
  nav.style.left = Math.round(Math.max(lo, Math.min(hi, (g.left + g.right) / 2 - (n.left + n.right) / 2))) + 'px';
}
if (globeOn()) { document.addEventListener('DOMContentLoaded', () => { const app = document.getElementById('app'); if (app && window.MutationObserver) new MutationObserver(() => requestAnimationFrame(hdAlignNav)).observe(app, { childList: true }); }); window.addEventListener('resize', hdAlignNav); }

// ---- a source as a group: every country where it made at least 0.5% of generation in its latest year
let GLOBE_SRC_PREV = 'all';
function globeSourceGroup(src) {
  const id = 'src_' + src.replace(/\W+/g, '_');
  if (!GLOBE_REGIONS[id]) {
    const share = new Map(globeShares(src)), name = src + ' producers';
    const test = c => (share.get(c.iso3) || 0) >= 0.005;
    GLOBE_GROUPS.push({ id, chip: name, name, trait: 'source', rule: src + ' is 0.5% or more of generation', test });
    REGION_NAMES[id] = name; GLOBE_REGIONS[id] = true;
    GLOBE_DEFS[id] = 'Every country where ' + src.toLowerCase() + ' made 0.5% or more of its electricity in its latest year of data. The map’s colour shows how much.';
    if (typeof PRACTICE_CATEGORIES !== 'undefined' && !PRACTICE_CATEGORIES.some(c => c.id === id))
      PRACTICE_CATEGORIES.push({ id, group: 'source', label: name, rule: src + ' is 0.5% or more of generation', filter: test });
  }
  return id;
}
// podium names arrive after the header is drawn (and replace it): line them up again
if (globeOn()) document.addEventListener('DOMContentLoaded', () => {
  if (typeof loadPodium === 'function') { const _lp = loadPodium; window.loadPodium = async function () { const r = await _lp.apply(this, arguments); requestAnimationFrame(() => { hdBoxFit(); hdAlignNav(); }); return r; }; }
  window.addEventListener('load', () => requestAnimationFrame(hdAlignNav));
  // first visits: the legend's sources shimmer once, so people find out they colour the map
  try { if (!localStorage.getItem('energle_srcmap_seen')) document.body.classList.add('gl-srcnudge'); } catch (e) {}
});

// ============================================================
//  WINDOWS ON PHONES (What's new, the shop intro, feedback): iPhone Safari moves its bars as the page scrolls, and a
//  fixed full-screen layer can then sit partly under them, cutting off the window's top (its ×) or bottom (Got it).
//  While one is open, the layer is pinned to exactly the visible part of the screen (visualViewport), kept in step
//  as the bars move, and the page behind doesn't scroll.
// ============================================================
(function () {
  const IDS = ['notice-modal', 'shop-intro', 'feedback-modal'];
  const vv = window.visualViewport;
  const open = () => IDS.map(id => document.getElementById(id)).filter(Boolean);
  function fit() {
    const els = open();
    document.documentElement.classList.toggle('mdl-open', els.length > 0);
    if (!vv) return;
    els.forEach(el => {
      el.style.top = Math.round(vv.offsetTop) + 'px'; el.style.left = Math.round(vv.offsetLeft) + 'px';
      el.style.width = Math.round(vv.width) + 'px'; el.style.height = Math.round(vv.height) + 'px';
      el.style.bottom = 'auto'; el.style.right = 'auto';
      el.style.setProperty('--vvh', Math.round(vv.height) + 'px');
    });
  }
  const watch = () => new MutationObserver(fit).observe(document.body, { childList: true });
  if (document.body) watch(); else document.addEventListener('DOMContentLoaded', watch);
  if (vv) { vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit); }
  window.addEventListener('orientationchange', () => setTimeout(fit, 300));
})();

// ============================================================
//  PULL TO REFRESH on the phone's Explore page: the map fills the screen and catches every drag, so Safari's own
//  pull-down only worked on the thin header. Pulling down on the header or the tools row above the map reloads the page,
//  with a small arrow that turns as you pull.
// ============================================================
(function () {
  const ZONE = 'header, .hd-grid, .subtitle-row, .at-tools', NOT = '.gl-more-menu, .gl-sugg';
  const on = () => document.body.classList.contains('at-globe') && matchMedia('(max-width: 700px)').matches;
  const NEED = 80;
  let x0 = null, y0 = null, dy = 0, pulling = false, ind = null;
  const show = d => {
    if (!ind) { ind = document.createElement('div'); ind.className = 'ptr'; ind.setAttribute('aria-hidden', 'true');
      ind.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/></svg>';
      document.body.appendChild(ind); }
    const k = Math.min(1, d / NEED);
    ind.style.transform = 'translate(-50%, ' + Math.round(Math.min(d, NEED * 1.4) * 0.6) + 'px) rotate(' + Math.round(k * 300) + 'deg)';
    ind.style.opacity = String(Math.min(1, d / 30));
    ind.classList.toggle('is-ready', k >= 1);
  };
  const hide = () => { if (ind) { ind.remove(); ind = null; } };
  document.addEventListener('touchstart', e => {
    x0 = y0 = null; pulling = false; dy = 0;
    if (!on() || e.touches.length !== 1 || window.scrollY > 0 || document.documentElement.classList.contains('mdl-open')) return;
    const t = e.target; if (!t.closest || !t.closest(ZONE) || t.closest(NOT)) return;
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (y0 == null) return;
    const dx = e.touches[0].clientX - x0; dy = e.touches[0].clientY - y0;
    if (!pulling) {
      if (dy < -6 || Math.abs(dx) > 14) { y0 = null; return; }   // a swipe sideways or up is someone else's
      if (dy < 10 || Math.abs(dx) > dy) return;
      pulling = true;
    }
    e.preventDefault(); show(dy);
  }, { passive: false });
  const end = () => {
    if (pulling && dy >= NEED) { if (ind) ind.classList.add('is-going'); location.reload(); }
    else hide();
    x0 = y0 = null; pulling = false; dy = 0;
  };
  document.addEventListener('touchend', end); document.addEventListener('touchcancel', () => { hide(); x0 = y0 = null; pulling = false; });
})();
