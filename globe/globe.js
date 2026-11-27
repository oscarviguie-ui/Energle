// ============================================================
//  PHONES: Safari's bars slide in and out as the page scrolls, and each time the window "resizes" in height only. The
//  game redrew its clue cards on every resize, which on a finished game yanked the page back down while scrolling up.
//  On touch screens, a resize that keeps the width is swallowed here, before the game's own listeners (this file loads
//  first, by capturing). Real changes (rotating the phone) still go through. Not on the Explore map, whose layout follows the height.
// ============================================================
(function () {
  let w = window.innerWidth;
  const touch = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  window.addEventListener('resize', e => {
    const nw = window.innerWidth;
    if (touch && nw === w && !document.body.classList.contains('at-globe')) {
      e.stopImmediatePropagation();
      // the clue cards' own listener was added before this one and still runs: cancel the redraw it just scheduled
      setTimeout(() => { try { clearTimeout(packTimer); } catch (err) {} }, 0);
      return;
    }
    w = nw;
  }, { capture: true });   // capture: runs before the listeners added earlier (shop.js loads before this file)
})();

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
// on trial (test page): three more blocs
if (window.ENERGLE_TEST) GLOBE_GROUPS.push(
  { id: 'oecd', chip: 'OECD', name: 'OECD', bloc: true, iso: 'AUS AUT BEL CAN CHL COL CRI CZE DNK EST FIN FRA DEU GRC HUN ISL IRL ISR ITA JPN KOR LVA LTU LUX MEX NLD NZL NOR POL PRT SVK SVN ESP SWE CHE TUR GBR USA' },
  { id: 'nato', chip: 'NATO', name: 'NATO', bloc: true, iso: 'ALB BEL BGR CAN HRV CZE DNK EST FIN FRA DEU GRC HUN ISL ITA LVA LTU LUX MNE NLD MKD NOR POL PRT ROU SVK SVN ESP SWE TUR GBR USA' },
  { id: 'asean', chip: 'ASEAN', name: 'ASEAN', bloc: true, iso: 'BRN KHM IDN LAO MYS MMR PHL SGP THA VNM TLS' });
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
    + '<div class="gl-pane" id="gl-pane-profile">' + globeCardsHTML()
    + '<p class="gl-more-row"><a class="gl-cpage" href="/country/' + countrySlug(c.name) + '/" target="_blank" rel="noopener">Read about ' + escHtml(c.name) + '’s electricity ↗</a></p>'   // its own page, in words
    + '</div><section id="clue-cards" class="gl-cards gl-pane"></section>';
}
function globeRegionHTML(r) {
  return '<div class="gl-p-head"><span class="gl-reg-ico" aria-hidden="true">' + GLOBE_ICON + '</span><div><h3>' + r.name + '</h3><span>'
    + (groupOf(r.region).trait && groupOf(r.region).trait !== 'source' ? '<span class="gl-sub-x gl-sub-rule">' + groupOf(r.region).rule + ' · </span>' : '') + r.n + ' countries<span class="gl-sub-x"> added together</span> · ' + r.latestYear + '</span></div>'
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
  globeHintSync();
  el.hidden = false;
  if (lay) lay.classList.add('has-sel');
  renderStatBar(); renderFlowBar(); renderCharts();
  if (!GLOBE_SEL) {                      // a world average next to a regional total says nothing: show its share of the world instead
    const pill = document.getElementById('stat-world-gen'), w = globeAggregate('all');
    if (pill) { const fresh = pill.cloneNode(false); fresh.removeAttribute('id');      // a fresh node: the count-up keeps writing to the old one
      fresh.textContent = reg.region === 'all' ? reg.n + ' countries' : Math.round(100 * reg.latestTotal / w.latestTotal) + '% of world generation'; pill.replaceWith(fresh); }
    globeRegionCards(reg); globeTabs();
  } else if (typeof renderAtlasCards === 'function') { renderAtlasCards(); if (!globeOn()) globeTabs(); }   // the wrapper below lays them out
  el.scrollTop = 0;
  const x = document.getElementById('gl-x'); if (x) x.addEventListener('click', () => GLOBE_SEL ? globeSelect(null) : globeRegion('all'));
  const foot = document.querySelector('#app > footer'); if (foot && lay && matchMedia(GLOBE_WIDE).matches) lay.appendChild(foot);   // credits under the map
  globeShadeRelock();
  globeSideFit();
  gphAfterSide();
  globeHeadSlot();
  globeLayoutFit(); globeLegendScroll();
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
  // the globe is round: past its width, a taller map only adds empty sea. Its height stops a little past its width.
  const w0 = document.getElementById('gl-wrap'); if (w0 && w0.clientWidth) document.body.style.setProperty('--gl-map-max', Math.round(w0.clientWidth * GLOBE_MAP_RATIO) + 'px');
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
  const old = document.getElementById('gl-cards-left'); if (old) old.remove();      // the last panel's cards, shared out under the globe
  const bar = document.getElementById('gl-tabs'), cards = [...document.querySelectorAll('#clue-cards .ic-card')]; if (!bar) return;
  const names = cards.map(c => { const t = ((c.querySelector('.ic-title') || {}).textContent || 'Clue card').split('·')[0].trim(); return GLOBE_TAB_NAMES[t] || t; });
  GLOBE_TAB = GLOBE_TAB_NAME === 'Profile' ? 0 : names.indexOf(GLOBE_TAB_NAME) + 1;     // a card the panel lacks: back to Profile
  bar.innerHTML = '<button type="button" class="gl-tab" role="tab" data-t="0">' + (window.ENERGLE_TEST ? 'Electricity Mix' : 'Profile') + '</button>'
    + (cards.length ? '<span class="gl-tabs-sep" aria-hidden="true"></span>' : '') + names.map((n, i) => '<button type="button" class="gl-tab gl-tab--card" role="tab" data-t="' + (i + 1) + '">' + n + '</button>').join('');
  if (!bar.dataset.bound) { bar.dataset.bound = '1'; bar.addEventListener('click', e => { const b = e.target.closest('.gl-tab'); if (b) globeTab(+b.dataset.t); }); }
  globeStackFit();
  globeTab(document.body.classList.contains('gl-stack') ? 0 : GLOBE_TAB, true);
  globeColumns();
}
const GLOBE_MAP_RATIO = 1.06;
// Very tall screens: under the (capped) globe there is room too, so the clue cards fill both columns, each card going to
// the shorter one, in order: less to scroll, nothing stretched. The cards keep their order for the tabs.
function globeColumns() {
  if (GLOBE_COL_MO) GLOBE_COL_MO.disconnect();                        // our own moves don't count as new cards
  globeColumnsDo();
  // cards that arrive later (they're drawn one by one) are shared out too
  const cc0 = document.getElementById('clue-cards');
  if (cc0 && document.body.classList.contains('gl-stack') && typeof MutationObserver !== 'undefined') {
    if (!GLOBE_COL_MO) GLOBE_COL_MO = new MutationObserver(ms => {
      if (!ms.some(m => [...m.addedNodes].some(n => n.nodeType === 1 && (n.matches('.ic-card') || n.querySelector('.ic-card'))))) return;
      clearTimeout(GLOBE_COL_RT); GLOBE_COL_RT = setTimeout(globeColumns, 80);
    });
    GLOBE_COL_MO.observe(cc0, { childList: true, subtree: true });
  }
}
const GLOBE_CARD_HOME = new WeakMap();    // where each card was drawn (the panel lays them out in its own columns)
function globeColumnsDo() {
  const lay = document.getElementById('gl-layout'), wrap = document.getElementById('gl-wrap'), cc0 = document.getElementById('clue-cards');
  const cc = cc0 && (cc0.querySelector('.ic-slot') || cc0);
  let left = document.getElementById('gl-cards-left');
  const ord = c => c.dataset.ord == null ? 1e9 : +c.dataset.ord;
  // first, every card back where it was drawn, in its order
  [...document.querySelectorAll('#gl-cards-left .ic-card, #clue-cards .ic-card')].filter(c => GLOBE_CARD_HOME.has(c))
    .sort((x, y) => ord(x) - ord(y)).forEach(c => { const home = GLOBE_CARD_HOME.get(c); if (home && home.isConnected) home.appendChild(c); });
  if (lay) lay.classList.remove('gl-cols');
  if (!lay || !wrap || !cc || !document.body.classList.contains('gl-stack')) { if (left) left.remove(); return; }
  // the map ends where the profile ends (its legend): the two columns start level, and the cards share out under both.
  // Never shorter than 420 px, never taller than the screen or (a round globe) 15% past its width.
  const avail = window.innerHeight - Math.max(0, lay.getBoundingClientRect().top) - 22;
  const prof0 = document.getElementById('gl-pane-profile');
  const profH = prof0 ? Math.round(prof0.getBoundingClientRect().bottom - wrap.getBoundingClientRect().top) : avail;
  const mapH = Math.max(420, Math.min(profH, avail, Math.round(wrap.clientWidth * 1.15)));   // a touch more leeway than alone, to line up
  const cards = [...cc0.querySelectorAll('.ic-card')];
  if (avail - mapH < 220 || !cards.length) { wrap.style.removeProperty('--gl-map-h'); if (left) left.remove(); return; }   // no real room under the globe
  wrap.style.setProperty('--gl-map-h', mapH + 'px');
  if (!left) { left = document.createElement('div'); left.id = 'gl-cards-left'; left.className = 'gl-cards-left'; wrap.after(left); }
  lay.classList.add('gl-cols');
  cards.forEach((c, i) => { c.dataset.ord = i; GLOBE_CARD_HOME.set(c, c.parentElement); c.remove(); });
  // then each card, in order, to whichever column ends higher: under the globe, or under the profile (one column there)
  cards.forEach(c => {
    const lb = (left.lastElementChild || wrap).getBoundingClientRect().bottom;
    const rb = (cc.lastElementChild || cc0).getBoundingClientRect().bottom;
    (lb <= rb ? left : cc).appendChild(c);
  });
  cc.classList.add('gl-flat');
  try { if (GLOBE) GLOBE.resize(); } catch (e) {}
  const prof = document.getElementById('gl-pane-profile');
  // the profile settles a beat later (charts, flow bar): share the cards out again if its height changes
  if (typeof ResizeObserver !== 'undefined' && prof) {
    if (!GLOBE_COL_RO) GLOBE_COL_RO = new ResizeObserver(es => {
      const h = Math.round(es[0].contentRect.height); if (Math.abs(h - GLOBE_COL_H) < 8) return; GLOBE_COL_H = h;
      clearTimeout(GLOBE_COL_RT); GLOBE_COL_RT = setTimeout(globeColumns, 120);
    });
    GLOBE_COL_RO.disconnect(); GLOBE_COL_H = Math.round(prof.getBoundingClientRect().height); GLOBE_COL_RO.observe(prof);
  }
}
let GLOBE_COL_RO = null, GLOBE_COL_H = 0, GLOBE_COL_RT = null, GLOBE_COL_MO = null;
// Tall laptop screens: when the profile leaves room under it for a clue card, the cards are stacked below it instead of
// behind tabs (nothing is stretched to fill the height); the tabs then jump to each card, and follow the scrolling.
const GLOBE_STACK_ROOM = 300;
function globeStackFit() {
  const side = document.getElementById('gl-side'), prof = document.getElementById('gl-pane-profile'), cc = document.getElementById('clue-cards');
  const wide = document.body.classList.contains('at-globe') && matchMedia('(min-width: 1100px)').matches;
  let stack = false;
  if (wide && side && prof && cc && cc.querySelector('.ic-card')) {
    const ph = prof.hidden, ch = cc.hidden; prof.hidden = false; cc.hidden = true;
    document.body.classList.remove('gl-stack');
    const lay = document.getElementById('gl-layout');
    const avail = window.innerHeight - Math.max(0, lay.getBoundingClientRect().top) - 22;      // the screen under the tools
    const used = prof.getBoundingClientRect().bottom - lay.getBoundingClientRect().top;
    stack = avail - used >= GLOBE_STACK_ROOM;
    prof.hidden = ph; cc.hidden = ch;
  }
  document.body.classList.toggle('gl-stack', stack);
  return stack;
}
function globeStackSpy() {
  if (!document.body.classList.contains('gl-stack')) return;
  const cards = [...document.querySelectorAll('#clue-cards .ic-card, #gl-cards-left .ic-card')].sort((a, b) => (+a.dataset.ord || 0) - (+b.dataset.ord || 0)), line = 90;
  if (Date.now() < GLOBE_SPY_LOCK) return;                      // a tab was just clicked: its card is the one, even if the page can't scroll it to the top
  // the card that last crossed the top of the screen (with two columns, the nearest one above the line)
  let t = 0, best = -Infinity; cards.forEach((c, i) => { const y = c.getBoundingClientRect().top; if (y < line && y > best) { best = y; t = i + 1; } });
  if (t === GLOBE_TAB) return;
  GLOBE_TAB = t; document.querySelectorAll('#gl-tabs .gl-tab').forEach(b => b.setAttribute('aria-selected', String(+b.dataset.t === t)));
}
let GLOBE_SPY_RAF = 0, GLOBE_SPY_LOCK = 0;
window.addEventListener('scroll', () => { cancelAnimationFrame(GLOBE_SPY_RAF); GLOBE_SPY_RAF = requestAnimationFrame(globeStackSpy); }, { passive: true });
let GLOBE_COL_T = null;
window.addEventListener('resize', () => {
  if (!document.getElementById('gl-tabs')) return;
  clearTimeout(GLOBE_COL_T);
  GLOBE_COL_T = setTimeout(() => { globeColumns(); const was = document.body.classList.contains('gl-stack'); if (globeStackFit() !== was) globeTab(GLOBE_TAB, true); globeColumns(); }, 150);
});
function globeTab(t, first) {
  const was = GLOBE_TAB; GLOBE_TAB = t;
  const tb = document.querySelector('#gl-tabs .gl-tab[data-t="' + t + '"]'); if (!first && tb) GLOBE_TAB_NAME = tb.textContent;
  document.querySelectorAll('#gl-tabs .gl-tab').forEach(b => b.setAttribute('aria-selected', String(+b.dataset.t === t)));
  const prof = document.getElementById('gl-pane-profile'), cc = document.getElementById('clue-cards');
  if (document.body.classList.contains('gl-stack')) {
    if (prof) prof.hidden = false;
    if (cc) { cc.hidden = false; cc.querySelectorAll('.ic-card').forEach(c => { c.hidden = false; }); }
    if (first && was === t) { /* a redraw: keep the scroll */ }
    else if (!first || t) {
      const all = [...document.querySelectorAll('#clue-cards .ic-card, #gl-cards-left .ic-card')].sort((a, b) => (+a.dataset.ord || 0) - (+b.dataset.ord || 0));
      const el = t ? all[t - 1] : null, how = first ? 'auto' : 'smooth';
      if (!first) GLOBE_SPY_LOCK = Date.now() + 1500;
      requestAnimationFrame(() => el ? el.scrollIntoView({ block: 'start', behavior: how }) : window.scrollTo({ top: 0, behavior: how }));
    }
    if (first) requestAnimationFrame(() => { try { if (lineChart) lineChart.resize(); if (barChart) barChart.resize(); } catch (e) {} if (target) renderFlowBar(false); });
    return;
  }
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
  oecd: 'The 38 members of the OECD, the club of mostly high-income economies: most of Europe, North America, Japan, South Korea, Australia, New Zealand, Israel, Turkey, and Chile, Colombia, Costa Rica and Mexico.',
  nato: 'The 32 members of NATO: the United States, Canada and 30 European countries, Finland (2023) and Sweden (2024) the newest. Albania has no electricity data here, so 31 are added up.',
  asean: 'The 11 members of ASEAN: Brunei, Cambodia, Indonesia, Laos, Malaysia, Myanmar, the Philippines, Singapore, Thailand, Vietnam and Timor-Leste (2025).',
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
if (window.ENERGLE_TEST) Object.assign(GLOBE_VIEWS, { oecd: [-25, 40, 7000], nato: [-35, 50, 6800], asean: [113, 8, 3400] });
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
  // one layer at a time: picking a group (not a source's producers) stops the map's colouring by a source
  if (GLOBE_SHADE && !String(r).startsWith('src_')) globeShadeOff();
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
let GMAP_ON = false;   // the puzzle always opens without its map (it loads faster): the Map button brings it in, for the rest of the visit
const GMAP_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">'
  + '<path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5V4l-6 2.5z"/><path d="M9 4v13M15 6.5v13"/></svg>';
function gmapButtonHTML() { return '<button type="button" id="gm-btn" class="gm-btn" aria-pressed="false" title="Show the map">' + GMAP_ICON + '<span class="gm-lbl">Map</span></button>'; }
function gmapUpdate() {
  gmapReopenSync();
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
  GMAP_ON = on;
  document.body.classList.toggle('gm-on', on);
  const b = document.getElementById('gm-btn'); if (b) { b.setAttribute('aria-pressed', String(on)); b.title = on ? 'Hide the map' : 'Show the map'; }
  let card = document.getElementById('gm-card');
  gmapReopenSync();
  if (!on) { if (card) card.hidden = true; gmapRedrawFlow(); return; }
  if (!card) {
    card = document.createElement('section'); card.id = 'gm-card'; card.className = 'gm-card'; card.setAttribute('aria-label', 'Map');
    card.innerHTML = '<div class="gm-wrap"><div class="gl-canvas" id="gm-canvas"></div><p class="gl-loading" id="gm-loading">Loading the map…</p>'
      + '<button type="button" class="gm-x" id="gm-x" aria-label="Hide the map">×</button>'
      + '<button type="button" class="gm-size" id="gm-size" aria-label="Make the map taller" aria-pressed="false">' + GMAP_GROW_SVG + '</button>'
      + '<div class="gm-grip" id="gm-grip" role="separator" aria-orientation="horizontal" aria-label="Drag to resize the map" tabindex="0"><span></span></div></div>';
    document.body.appendChild(card); gmapPlace();
    card.querySelector('#gm-x').addEventListener('click', () => gmapShow(false));
    gmapSizeBind(card);
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
// ---------- the map's height (laptops): a grip along its bottom edge to drag, and a button to toggle tall / normal ----------
const GMAP_GROW_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="gm-sz-grow" d="M8 9l4-4 4 4M8 15l4 4 4-4"/><path class="gm-sz-shrink" d="M8 5l4 4 4-4M8 19l4-4 4 4"/></svg>';
const GMAP_H_KEY = 'energle_gmap_h';
// taller is only worth it wider: a tall map breaks out of the column into the page's margins, up to 1,400 px, and is
// never taller than it is wide (a round globe gains nothing from height alone)
function gmapWideW() { return Math.min(window.innerWidth - 64, 1400); }
function gmapSizeLimits() { const W = gmapWideW(); return { min: 260, max: Math.max(320, Math.min(Math.round(window.innerHeight * 0.86), W)), tall: Math.max(320, Math.min(Math.round(window.innerHeight * 0.8), Math.round(W * 0.62))) }; }
function gmapBaseH() { return Math.round(Math.max(300, Math.min(520, window.innerHeight * 0.42))); }   // = .gm-wrap's CSS height on laptops
function gmapSetH(wrap, h, save) {
  const L = gmapSizeLimits(); h = Math.round(Math.max(L.min, Math.min(L.max, h)));
  const m = GMAP, fitBefore = m ? Math.abs(m.getZoom() - gmapFitZoom(m, m.getCenter().lat)) < 0.08 : false;
  const tall = h > gmapBaseH() + 40, b = document.getElementById('gm-size'), card = wrap.closest('.gm-card');
  if (card) card.classList.toggle('is-wide', tall && gmapWideW() > card.parentElement.clientWidth + 40);
  wrap.style.height = h + 'px';
  if (b) { b.classList.toggle('is-tall', tall); b.setAttribute('aria-pressed', String(tall)); b.setAttribute('aria-label', tall ? 'Make the map shorter' : 'Make the map taller'); }
  if (m) { m.resize(); if (fitBefore) m.jumpTo({ zoom: gmapFitZoom(m, m.getCenter().lat) }); }   // still at "whole globe": keep it filling the frame
  if (save) try { localStorage.setItem(GMAP_H_KEY, String(h)); } catch (e) {}
}
function gmapSizeBind(card) {
  const wrap = card.querySelector('.gm-wrap'), grip = card.querySelector('#gm-grip'), btn = card.querySelector('#gm-size');
  const wide = () => matchMedia('(min-width: 900px)').matches;
  try { const h = +localStorage.getItem(GMAP_H_KEY); if (h && wide()) gmapSetH(wrap, h, false); } catch (e) {}
  btn.addEventListener('click', () => {
    const tall = btn.classList.contains('is-tall'), L = gmapSizeLimits();
    const wasFit = GMAP ? Math.abs(GMAP.getZoom() - gmapFitZoom(GMAP, GMAP.getCenter().lat)) < 0.08 : false;
    wrap.classList.add('is-anim'); gmapSetH(wrap, tall ? gmapBaseH() : L.tall, true);
    // once the frame has grown or shrunk: a globe that was whole is fitted to the new frame (a zoomed-in view is left alone)
    const end = () => { wrap.classList.remove('is-anim'); if (GMAP) { GMAP.resize(); const fz = gmapFitZoom(GMAP, GMAP.getCenter().lat); if (wasFit || GMAP.getZoom() < fz) GMAP.easeTo({ zoom: fz, duration: 300 }); } };
    // refit once the height has settled: on the transition's end, and at 700 ms in case it never reports (both are harmless)
    const onEnd = e => { if (e.target === wrap && e.propertyName === 'height') { wrap.removeEventListener('transitionend', onEnd); end(); } };
    wrap.addEventListener('transitionend', onEnd); setTimeout(end, 700);
    if (!tall) requestAnimationFrame(() => card.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  });
  let y0 = null, h0 = 0, raf = 0;
  grip.addEventListener('pointerdown', e => { if (!wide()) return; y0 = e.clientY; h0 = wrap.offsetHeight; grip.setPointerCapture(e.pointerId); wrap.classList.add('is-drag'); e.preventDefault(); });
  grip.addEventListener('pointermove', e => { if (y0 == null) return; const y = e.clientY; cancelAnimationFrame(raf); raf = requestAnimationFrame(() => gmapSetH(wrap, h0 + y - y0, false)); });
  const up = () => { if (y0 == null) return; y0 = null; wrap.classList.remove('is-drag'); gmapSetH(wrap, wrap.offsetHeight, true); };
  grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up);
  grip.addEventListener('dblclick', () => btn.click());
  grip.addEventListener('keydown', e => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return; e.preventDefault();
    gmapSetH(wrap, wrap.offsetHeight + (e.key === 'ArrowDown' ? 40 : -40), true);
  });
  window.addEventListener('resize', () => { if (!document.body.contains(wrap)) return; if (!wide()) { wrap.style.height = ''; if (GMAP) GMAP.resize(); } else if (wrap.style.height) gmapSetH(wrap, parseFloat(wrap.style.height), false); });
}
function gmapReopenSync() {
  let b = document.getElementById('gm-reopen');
  // only when the guess bar (and its Map button) is gone: a finished game, not a new one that reuses the screen
  const ia = document.getElementById('input-area');
  const need = !GMAP_ON && typeof gameOver !== 'undefined' && gameOver && document.getElementById('gw-cols') && !(ia && ia.offsetParent);
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
    document.body.classList.remove('gm-on', 'ex-picker'); globeFrame(false); document.body.classList.add('ex-hdr');
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
    document.body.classList.remove('gm-on'); globeFrame(false); document.body.classList.add('ex-hdr', 'ex-picker');
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
  window.renderArchiveScreen = function (d) { document.body.classList.remove('gm-on', 'ex-picker', 'at-globe'); globeFrame(true); document.body.classList.add('ex-hdr'); return _archive(d); };
  // the game screen: one information block, the guess bar under it, a Map button in the guess bar
  const _game = renderGameScreen;
  window.renderGameScreen = function () {
    document.body.classList.remove('ex-picker', 'at-globe'); globeFrame(true); document.body.classList.add('ex-hdr');   // (Explore's class goes now, not when its map is torn down a moment later: the puzzle must be laid out as the puzzle)
      // the same header on every tab; the puzzle in its own column
    const old = document.getElementById('gm-card'); if (old) old.remove();
    _game();
    gwLayout();
    const sub = document.getElementById('submit-btn');
    if (sub && !document.getElementById('gm-btn')) { sub.insertAdjacentHTML('beforebegin', gmapButtonHTML()); document.getElementById('gm-btn').addEventListener('click', () => gmapShow(!GMAP_ON, true)); }
    GMAP_PICK = null; gmapShow(GMAP_ON);
    requestAnimationFrame(gmapReopenSync);   // once the game has set itself up (new or finished)
  };
  const _row = addGuessRow;
  window.addGuessRow = function (country, isCorrect, animate) { _row(country, isCorrect, animate); if (!isCorrect) bandRow(country); GMAP_PICK = null; gmapUpdate(); if (animate !== false && country) gmapTurn(country.iso3); };
  const _end = endGame;
  window.endGame = function () { _end(); gmapUpdate(); if (target) gmapTurn(target.iso3, 1200); gmapReopenSync(); };
  const _new = newGame;
  window.newGame = function () { _new(); GMAP_PICK = null; gmapUpdate(); gmapReopenSync(); };
});

// ============================================================
//  WHAT'S NEW (test page): a wider window that fits one screen on laptops, led by the Explore update
//  with a small demo that plays through what Explore does, using the real numbers.
// ============================================================
// What's new: the Clue Shop from round 1 (while window.SHOP_FROM_START is set)
const SHOP_ROUND1_UPDATE = ['23 Nov', 'Clue Shop from round 1',
  'The Clue Shop now opens before your first guess: trade a guess for a clue card whenever you like, even to start. Your last guess can never be spent, so you always get a final try.'];
const FE_UPDATE = ['26 Nov', 'A new layer: final energy',
  'Until now Energle showed electricity, about a fifth of the energy the world uses. Now it shows all of it. '
  + 'Final energy follows every fuel to the people using it, from oil in cars and gas in boilers to wood in stoves and power at the socket, and shows what it is for: industry, transport, homes, services, raw materials. '
  + 'Electricity becomes one source among six, so you can see how electrified a country really is, who still cooks with wood, and where pipes heat whole cities. '
  + 'Every card now also shows the year of its data: a red year with a ! is not the year of the electricity data.'];
const EXPLORE_UPDATE = ['13 Nov', 'Explore: the world on a map',
  'Practice is now Explore. Click any country for its full profile and clue cards. Add up a continent, a bloc like the EU or OPEC, or a trait like Green leaders, clue cards included. Click a source under the charts to colour the map by it. And practise on any group. In the daily, the Map button opens a globe to pick your guesses on.'];
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
  const nOf = id => COUNTRIES.filter(groupOf(id).test).length;
  const steps = [
    grp('all', 'Every country, on the map', { title: 'Every country, on a globe',
      say: 'Spin the globe, zoom in, and see what the world generated: ' + nxGen(globeAggregate('all').latestTotal) + ' from ' + nOf('all') + ' countries, with its mix and how it changed since 2000.' }),
    grp('europe', 'Add up a continent', { title: 'Add up a continent',
      say: 'Pick a continent from the menu on the map: its ' + nOf('europe') + ' countries light up and add up into one profile, charts included.' }),
    grp('eu', '…a bloc like the EU or OPEC', { title: 'Or a bloc',
      say: 'The EU, OPEC, the G7 and BRICS work the same way: each one is summed as if it were a single country.' }),
    grp('green', '…or a trait, with its definition', { title: 'Or a trait',
      say: 'Traits group countries by their profile, like Green leaders or Fossil heavy. Energle’s definition is always shown, so you know who is in and why.' })];
  // the source map: Nuclear, darker for a bigger share
  try {
    const sh = globeShares('Nuclear'), max = Math.max(...sh.map(x => x[1])), id = globeSourceGroup('Nuclear'), r = globeAggregate(id);
    const top = sh.slice().sort((a, b) => b[1] - a[1])[0], topC = COUNTRIES.find(c => c.iso3 === top[0]);
    steps.push({ cap: 'Click a source under the charts: the map takes its colour', title: 'Colour the map by a source',
      say: 'Click a source under the charts, like Nuclear: the darker a country, the bigger its share. The ' + r.n + ' producers add up too, clue cards included.', shade: new Map(sh), shadeMax: max, shadeCol: colorOf('Nuclear'),
      head: '<b>Nuclear producers</b><span>' + r.n + ' countries · darker = more</span>', big: nxGen(r.latestTotal),
      def: 'Up to ' + Math.round(max * 100) + '% of generation (' + (topC ? topC.name : '') + ') · their totals and clue cards add up too', mix: groupShares(COUNTRIES.filter(groupOf(id).test)) });
  } catch (e) {}
  // a group's clue cards, added up: OPEC's reserves
  try {
    const e = globeAggCards('opec');
    if (e && e.fossil) {
      const pct = v => v >= 0.01 ? Math.round(v * 100) + '%' : '<1%';
      steps.push(grp('opec', 'Clue cards add up for groups', { title: 'Clue cards add up',
        say: 'A group’s clue cards are summed too. OPEC’s ' + e._n + ' members hold ' + (e._share.oil >= 0.01 ? Math.round(e._share.oil * 100) + '%' : 'under 1%') + ' of the world’s proven oil reserves.',
        head: '<b>OPEC · Underground riches</b><span>' + e._n + ' members, reserves summed</span>',
        row: '<div class="nx-ug">' + [['oil', 'Oil', v => Math.round(v).toLocaleString('en-US') + ' bn barrels'], ['gas', 'Gas', v => Math.round(v) + ' tn m³'], ['coal', 'Coal', v => (v < 10 ? v.toFixed(1) : Math.round(v)) + ' bn t']]
          .map(([k, n, f]) => '<span class="nx-ug-row"><b>' + n + '</b><span>' + f(e.fossil[k][0]) + '</span><em>' + pct(e._share[k]) + ' of the world</em></span>').join('') + '</div>',
        def: '' }));
    }
  } catch (e) {}
  const fr = COUNTRIES.find(c => c.iso3 === 'FRA');
  if (fr) steps.push({ cap: 'Click a country for its profile and clue cards', iso: new Set(['FRA']), one: true, title: 'Open any country',
    say: 'Click a country, or search for it, to see its full profile: generation, mix, CO₂ and all five clue cards.',
    head: flagImg('FRA', 'nx-flag') + '<b>France</b><span>' + fr.latestYear + ' · 5 clue cards</span>', big: nxGen(fr.latestTotal), def: 'Sun & wind · People & power · Underground · Power trade · Fuel trade', mix: sharesOf(fr) });
  steps.push(grp('brics', 'Practise on any group', { title: 'Practise on any group',
    say: 'Every group has a Practice button: a round of guesses on just those countries, with no score and no streak.', row: '<div class="nx-row"><div class="nx-card-h"><b>BRICS</b><span>' + COUNTRIES.filter(groupOf('brics').test).length + ' countries</span></div>'
    + '<span class="nx-pill">Practice these ' + COUNTRIES.filter(groupOf('brics').test).length + ' →</span></div>', def: 'A round of guesses on just those countries: no score, no streak' }));
  return steps;
}
function nxDemoHTML() {
  return '<div class="nx-demo" id="nx-demo"><div class="nx-stage"><div class="nx-mapbox" id="nx-mapbox"></div>'
    + '<button type="button" class="nx-arr nx-prev" aria-label="Previous feature"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>'
    + '<button type="button" class="nx-arr nx-next" aria-label="Next feature"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button></div>'
    + '<div class="nx-card" id="nx-card" aria-live="polite"></div><div class="nx-cap" id="nx-cap"></div>'
    + '<div class="nx-dots" id="nx-dots" role="tablist" aria-label="Demo steps"></div></div>';
}
// a colour between the map's paper and the source's colour
function nxMix(col, t) {
  const h = x => parseInt(x, 16), c = col.replace('#', ''), a = [246, 239, 224], b = [h(c.slice(0, 2)), h(c.slice(2, 4)), h(c.slice(4, 6))];
  return 'rgb(' + a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',') + ')';
}
function nxDemoStart(root, opts) {
  opts = opts || {}; const auto = opts.auto !== false;
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
    if (opts.onShow) opts.onShow(k, s, steps.length);
  };
  const play = () => { clearInterval(timer); if (auto && !REDUCED_MOTION) timer = setInterval(() => { if (!document.body.contains(root)) return clearInterval(timer); show((i + 1) % steps.length); }, 3400); };
  // flick through: the arrows on the map, a swipe, or the keyboard's arrows (a manual step restarts the 3.4 s clock)
  const go = d => { show((i + d + steps.length) % steps.length); play(); };
  dots.addEventListener('click', e => { const d = e.target.closest('.nx-dot'); if (d) { show(+d.dataset.k); play(); } });
  root.querySelector('.nx-prev').addEventListener('click', () => go(-1));
  root.querySelector('.nx-next').addEventListener('click', () => go(1));
  let sx = null, sy = null;
  root.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  root.addEventListener('touchend', e => {
    if (sx == null) return; const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy; sx = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.3) (opts.onSwipe || go)(dx < 0 ? 1 : -1);
  }, { passive: true });
  if (auto) { root.addEventListener('mouseenter', () => clearInterval(timer)); root.addEventListener('mouseleave', play); }
  // the card under the map is as tall as its tallest step, so nothing is cut off (OPEC's reserves run to two lines)
  // and the window doesn't jump from one step to the next
  const fit = () => {
    if (!card.offsetParent) return;
    const keep = i, quiet = opts.onShow; opts.onShow = null; card.style.minHeight = '';
    let h = 0; steps.forEach((s, k) => { show(k); h = Math.max(h, card.offsetHeight); });
    opts.onShow = quiet; show(keep); card.style.minHeight = h + 'px';
  };
  nxMapSVG().then(svg => { box.innerHTML = svg; paths = [...box.querySelectorAll('path[data-i]')]; show(i); });
  show(0); requestAnimationFrame(fit); play();
  let rz = null; const onRz = () => { if (!document.body.contains(root)) return window.removeEventListener('resize', onRz); clearTimeout(rz); rz = setTimeout(fit, 150); };
  window.addEventListener('resize', onRz);
  return { steps, show: k => { show(k); play(); }, go, at: () => i };
}
function showNoticeWide() {
  if (document.getElementById('notice-modal')) return;
  try { localStorage.setItem(NOTICE_KEY, '1'); localStorage.setItem(NEWS_SEEN_KEY, newsId()); } catch (e) {}
  const sd = document.getElementById('sub-date'); if (sd) { sd.classList.remove('has-news'); const ic = sd.querySelector('.sd-ico'); if (ic) ic.remove(); }
  const [d0, t0, x0] = UPDATES[0], open = practiceUnlocked(), shopNews = t0 === SHOP_ROUND1_UPDATE[1], feNews = t0 === FE_UPDATE[1];
  // the featured update: the Clue Shop (its own picture) or Explore (the map demo)
  const cell = c => '<span class="battery-cell ' + c + '"></span>';
  const feature = feNews
    ? '<div class="nx-demo fe-demo" id="fe-demo"><div class="nx-stage fe-stage"><div class="fe-vis" id="fe-vis" aria-hidden="true"></div>'
      + '<button type="button" class="nx-arr nx-prev" aria-label="Previous"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>'
      + '<button type="button" class="nx-arr nx-next" aria-label="Next"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button></div>'
      + '<div class="fe-foot"><p class="fe-cap" id="fe-cap" aria-live="polite"></p><div class="fe-dots" id="fe-dots" role="tablist" aria-label="Demo steps"></div></div></div>'
    : shopNews
    ? '<div class="nx-shop" aria-hidden="true">' + SHOP_ICON.replace('class="shop-ico"', 'class="nx-shop-sign" style="--awn:#f5c842;color:#1a1a1a"')
      + '<span class="nx-shop-bat"><span class="battery si-bat"><span class="battery-body">' + cell('si-card') + cell('is-on is-high') + cell('is-on is-high') + cell('is-on is-high') + cell('is-on is-high') + cell('is-on is-high') + '</span><span class="battery-cap"></span></span><em>a card before your first guess</em></span>'
      + '<span class="si-tiles">' + SHOP_CARDS.map(c => '<span class="si-tile"><span class="si-art">' + SHOP_ART[c.k] + '</span><span class="si-name">' + c.name + '</span></span>').join('') + '</span></div>'
    : nxDemoHTML();
  const ctas = feNews
    ? (document.getElementById('use-card') ? '<button type="button" class="nx-cta" id="nx-fe-go">See it for this country →</button>' : '')
    : shopNews
    ? (MODE !== 'practice' && !gameOver ? '<button type="button" class="nx-cta" id="nx-shop">Open the Clue Shop →</button>' : '') + '<button type="button" class="nx-tour" id="nx-shop-how">How it works</button>'
    : (open ? '<button type="button" class="nx-cta" id="nx-cta">Open Explore →</button>' : '') + '<button type="button" class="nx-tour" id="nx-tour">Step by step</button>';
  const modal = document.createElement('div'); modal.id = 'notice-modal';
  modal.innerHTML = '<div class="st-backdrop"></div>'
    + '<div class="nt-box nt-box--log nt-wide" role="dialog" aria-modal="true" aria-labelledby="nt-title">'
    + '<div class="nx-top"><div><span class="nt-eyebrow">What’s new</span><h2 class="nt-title" id="nt-title">Latest updates</h2></div>'
    + '<button type="button" class="gl-x nx-close" aria-label="Close">×</button></div>'
    + '<section class="nx-feature' + (shopNews ? ' is-shop' : '') + (feNews ? ' is-fe' : '') + '">' + feature
    + '<div class="nx-text"><span class="nx-new">New · ' + d0 + '</span><h3>' + t0 + '</h3><p>' + x0 + '</p>'
    + '<div class="nx-ctas">' + ctas + '</div>'
    + (open || shopNews || feNews ? '' : '<p class="nx-lock">🔒 Explore opens once you’ve finished today’s puzzle.</p>') + '</div></section>'
    + '<div class="nx-earlier"><span class="nt-eyebrow nx-sub">Earlier updates</span><ol class="nt-log nx-log">'
    + UPDATES.slice(1).map(([d, t, x]) => '<li title="' + escHtml(x.replace(/<[^>]+>/g, '')) + '"><span class="nt-date">' + d + '</span><span class="nt-item"><strong>' + t + '</strong><span class="nx-x">' + x + '</span></span></li>').join('') + '</ol></div>'
    + '<div class="nx-foot"><div class="nt-soon"><span class="nt-eyebrow">Coming soon</span><div class="nx-soon-row">'
    + COMING.map(([t, x]) => '<div class="nt-soon-item"><strong>' + t + '</strong><span>' + x + '</span></div>').join('') + '</div></div>'
    + '<div class="nx-foot-end"><p class="nt-fb">Have an idea for the next update? <button type="button" class="ft-link nt-fb-link" onclick="showFeedback()">Send feedback</button></p>'
    + '<button type="button" class="nt-btn" id="nt-ok">Got it</button></div></div>'
    + '</div>';
  const close = () => { modal.remove(); document.removeEventListener('keydown', onKey); };
  let demo = null;
  const onKey = e => { if (e.key === 'Escape') close(); else if (demo && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) demo.go(e.key === 'ArrowRight' ? 1 : -1); };
  modal.querySelector('.st-backdrop').addEventListener('click', close);
  document.body.appendChild(modal);
  modal.querySelector('.nx-close').addEventListener('click', close);
  document.getElementById('nt-ok').addEventListener('click', close);
  const cta = document.getElementById('nx-cta'); if (cta) cta.addEventListener('click', () => { close(); switchMode('practice'); });
  document.addEventListener('keydown', onKey);
  if (!shopNews && !feNews) demo = nxDemoStart(modal.querySelector('.nx-feature'));
  if (feNews) Promise.all([ucLoad(), nxMapSVG()]).then(([, svg]) => feDemoStart(modal.querySelector('#fe-demo'), svg)).catch(() => {});
  const fg = document.getElementById('nx-fe-go'); if (fg) fg.addEventListener('click', () => { close(); const c = document.getElementById('use-card'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  const tl = document.getElementById('nx-tour'); if (tl) tl.addEventListener('click', () => { close(); showExploreTour(true); });
  const so = document.getElementById('nx-shop'); if (so) so.addEventListener('click', () => { close(); const b = document.getElementById('shop-btn'); if (b) b.click(); });
  const sh = document.getElementById('nx-shop-how'); if (sh) sh.addEventListener('click', () => { close(); showShopIntro(); });
  document.getElementById('nt-ok').focus({ preventScroll: true });
}

// ============================================================
//  THE EXPLORE TOUR: shown once to returning players on their first visit after the update (in place of the What's new
//  window), step by step: the same demo, one feature per step, with what it does in a sentence. Back / Next, the arrows
//  on the map, a swipe or the keyboard; × or Esc skips it. Also from What's new ("Step by step"), and ?tour=1.
// ============================================================
const TOUR_KEY = 'energle_explore_tour_v1';
function showExploreTour(fromNews) {
  if (document.getElementById('tour-modal')) return;
  try { localStorage.setItem(TOUR_KEY, '1'); localStorage.setItem(NOTICE_KEY, '1'); localStorage.setItem(NEWS_SEEN_KEY, newsId()); } catch (e) {}
  const sd = document.getElementById('sub-date'); if (sd) { sd.classList.remove('has-news'); const ic = sd.querySelector('.sd-ico'); if (ic) ic.remove(); }
  const open = practiceUnlocked();
  const modal = document.createElement('div'); modal.id = 'tour-modal';
  modal.innerHTML = '<div class="st-backdrop"></div>'
    + '<div class="nt-box tr-box" role="dialog" aria-modal="true" aria-labelledby="tr-title">'
    + '<div class="tr-top"><span class="nt-eyebrow">New · Explore <span class="tr-n" id="tr-n"></span></span>'
    + '<button type="button" class="gl-x tr-x" aria-label="Close the tour">×</button></div>'
    + '<div class="tr-main">' + nxDemoHTML()
    + '<div class="tr-text"><h2 class="tr-title" id="tr-title"></h2><p class="tr-say" id="tr-say" aria-live="polite"></p>'
    + '<div class="tr-foot"><button type="button" class="tr-back" id="tr-back">← Back</button>'
    + '<span class="tr-dots" id="tr-dots" aria-hidden="true"></span>'
    + '<button type="button" class="tr-next" id="tr-next">Next →</button></div></div></div></div>';
  const close = () => { modal.remove(); document.removeEventListener('keydown', onKey); };
  let demo = null, n = 0;
  const back = modal.querySelector('#tr-back'), next = modal.querySelector('#tr-next'), dots = modal.querySelector('#tr-dots');
  const step = d => { const k = demo.at() + d; if (k < 0) return; if (k >= n) return finish(); demo.show(k); };
  const finish = () => { close(); if (open) switchMode('practice'); };
  const onKey = e => { if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight') step(1); else if (e.key === 'ArrowLeft') step(-1); };
  modal.querySelector('.st-backdrop').addEventListener('click', close);
  modal.querySelector('.tr-x').addEventListener('click', close);
  back.addEventListener('click', () => step(-1)); next.addEventListener('click', () => step(1));
  document.addEventListener('keydown', onKey);
  document.body.appendChild(modal);
  demo = nxDemoStart(modal.querySelector('.tr-main'), { auto: false, onSwipe: d => step(d), onShow: (k, s, len) => {
    n = len;
    modal.querySelector('#tr-n').textContent = '· ' + (k + 1) + ' of ' + len;
    modal.querySelector('#tr-title').textContent = s.title || s.cap;
    modal.querySelector('#tr-say').textContent = (s.say || '') + (k === len - 1 && !open ? ' Explore opens once you’ve finished today’s puzzle.' : '');
    back.disabled = k === 0;
    const last = k === len - 1;
    next.textContent = last ? (open ? 'Open Explore →' : 'Got it') : 'Next →';
    next.classList.toggle('is-last', last);
    dots.innerHTML = Array.from({ length: len }, (_, j) => '<i' + (j === k ? ' class="on"' : '') + '></i>').join('');
  } });
  // the map's own arrows stop at the ends, like Back and Next
  modal.querySelector('.nx-prev').replaceWith(modal.querySelector('.nx-prev').cloneNode(true));
  modal.querySelector('.nx-next').replaceWith(modal.querySelector('.nx-next').cloneNode(true));
  modal.querySelector('.nx-prev').addEventListener('click', () => step(-1));
  modal.querySelector('.nx-next').addEventListener('click', () => step(1));
  next.focus({ preventScroll: true });
}
if (globeOn()) document.addEventListener('DOMContentLoaded', () => {
  if (typeof UPDATES !== 'undefined' && !UPDATES.some(u => u[1] === EXPLORE_UPDATE[1])) UPDATES.unshift(EXPLORE_UPDATE);
  if (typeof UPDATES !== 'undefined' && window.SHOP_FROM_START && !UPDATES.some(u => u[1] === SHOP_ROUND1_UPDATE[1])) UPDATES.unshift(SHOP_ROUND1_UPDATE);
  if (typeof UPDATES !== 'undefined' && window.USE_CARD && !UPDATES.some(u => u[1] === FE_UPDATE[1])) UPDATES.unshift(FE_UPDATE);   // draft, test page
  window.showNotice = showNoticeWide;
  const _maybe = maybeShowNotice;
  window.maybeShowNotice = function () {
    let returning = false, toured = true;
    try { returning = !!(localStorage.getItem(LS_KEY) || localStorage.getItem(LS_STATS_KEY)); toured = !!localStorage.getItem(TOUR_KEY); } catch (e) { return _maybe(); }
    const force = /[?&]tour=1\b/.test(location.search);
    if (!force && (!returning || toured)) return _maybe();
    let tries = 0;   // after the name prompt or any other window
    const go = () => { if (document.querySelector('#username-modal, #notice-modal, #shop-intro, #stats-modal')) { if (++tries < 120) setTimeout(go, 500); return; } showExploreTour(); };
    setTimeout(go, REDUCED_MOTION ? 0 : 700);
  };
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
  try { localStorage.setItem('energle_maphint_mini', mini ? '1' : '0'); if (!mini) localStorage.setItem('energle_maphint_seen', '1'); } catch (err) {}
  if (!mini) b.classList.remove('is-hop');
  globeHintSync();
});
// While the tip is open on the map, the sources under the charts glow in turn (they're what "click a source" points at).
// Folded, the ? hops now and then until it has been opened once.
function globeHintSync() {
  const mh = document.getElementById('gl-maphint');
  const open = !!mh && !mh.hidden && !mh.classList.contains('is-mini') && document.body.classList.contains('at-globe');
  document.body.classList.toggle('gl-hint-open', open);
  if (mh && mh.classList.contains('is-mini')) {
    let seen = false; try { seen = localStorage.getItem('energle_maphint_seen') === '1'; } catch (e) {}
    mh.classList.toggle('is-hop', !seen);
  }
}
function globeShade(src) {
  GLOBE_SHADE = src || null;
  const key = document.getElementById('gl-shade'), mh = document.getElementById('gl-maphint');
  if (mh) mh.hidden = !!src || !!GLOBE_SEL || GLOBE_REGION !== 'all';
  globeHintSync();
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
// stop colouring the map by a source: the legend's chip lets go too
function globeShadeOff() {
  lockedSource = null; GLOBE_SRC_PREV = null;
  if (typeof _globeFocus === 'function') _globeFocus(null);
  globeShade(null);
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
let HD_RAF = 0;
function hdSoon() { if (HD_RAF) return; HD_RAF = requestAnimationFrame(() => { HD_RAF = 0; try { hdAlignNav(); } catch (e) {} }); }   // one fit per frame, however many asked
// Explore, wide windows: the mode switch and Stats & Leaderboard sit with their bottom edge on the wordmark's baseline,
// and the mode switch is centred on the page (as far as the logo and the right-hand buttons allow)
function hdAlignNav() {
  const nav = document.getElementById('mode-nav'), word = document.querySelector('.hd-brand .logo-word'), lb = document.querySelector('.hd-grid .lb-split'), pod = document.querySelector('.hd-grid .podium');
  if (!nav || !word) return;
  if (typeof FRAME_BUSY !== 'undefined' && FRAME_BUSY) return;     // mid-move the pieces are off their places: fitted when it ends
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
if (globeOn()) { document.addEventListener('DOMContentLoaded', () => { const app = document.getElementById('app'); if (app && window.MutationObserver) new MutationObserver(hdSoon).observe(app, { childList: true }); }); window.addEventListener('resize', hdSoon); }

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
  if (typeof loadPodium === 'function') { const _lp = loadPodium; window.loadPodium = async function () { const r = await _lp.apply(this, arguments); hdSoon(); return r; }; }
  window.addEventListener('load', hdSoon);
  // first visits: the legend's sources shimmer once, so people find out they colour the map
  try { if (!localStorage.getItem('energle_srcmap_seen')) document.body.classList.add('gl-srcnudge'); } catch (e) {}
});

// ============================================================
//  WINDOWS ON PHONES (What's new, stats, leaderboard, the shop, feedback…): iPhone Safari moves its bars as the page scrolls, and a
//  fixed full-screen layer can then sit partly under them, cutting off the window's top (its ×) or bottom (Got it).
//  While one is open, the layer is pinned to exactly the visible part of the screen (visualViewport), kept in step
//  as the bars move, and the page behind doesn't scroll.
// ============================================================
(function () {
  const IDS = ['notice-modal', 'tour-modal', 'howto-modal', 'welcome-modal', 'shop-intro', 'feedback-modal', 'stats-modal', 'lb-modal', 'glossary-modal', 'cl-modal', 'shop-modal', 'device-modal', 'username-modal', 'rename-modal'];
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

// ============================================================
//  THE EXPLORE LEGEND ON LAPTOPS: one line that slides sideways when the sources don't fit. The ends fade, and an arrow
//  appears on the side with more; the mouse wheel and a trackpad swipe slide it too. Re-bound every time the legend is drawn.
// ============================================================
function globeLegendScroll() {
  const lg = document.querySelector('body.at-globe .gl-side #legend-shared'), row = lg && lg.querySelector('.lg-items');
  if (!row) return;
  const svg = d => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + d + '"/></svg>';
  if (!lg.querySelector('.lg-arr')) {
    lg.insertAdjacentHTML('beforeend', '<button type="button" class="lg-arr lg-arr-l" aria-label="Earlier sources">' + svg('M15 5l-7 7 7 7') + '</button>'
      + '<button type="button" class="lg-arr lg-arr-r" aria-label="More sources">' + svg('M9 5l7 7-7 7') + '</button>');
    const by = d => row.scrollBy({ left: d * Math.max(120, row.clientWidth * 0.7) });
    lg.querySelector('.lg-arr-l').addEventListener('click', () => by(-1));
    lg.querySelector('.lg-arr-r').addEventListener('click', () => by(1));
  }
  const sync = () => {
    const over = row.scrollWidth > row.clientWidth + 2;
    lg.classList.toggle('can-l', over && row.scrollLeft > 2);
    lg.classList.toggle('can-r', over && row.scrollLeft < row.scrollWidth - row.clientWidth - 2);
  };
  if (!row.dataset.scr) {
    row.dataset.scr = '1';
    row.addEventListener('scroll', sync, { passive: true });
    row.addEventListener('wheel', e => {
      if (row.scrollWidth <= row.clientWidth + 2 || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;   // a sideways swipe scrolls by itself
      const max = row.scrollWidth - row.clientWidth;
      if ((e.deltaY < 0 && row.scrollLeft <= 0) || (e.deltaY > 0 && row.scrollLeft >= max)) return;  // at the end: let the page scroll
      e.preventDefault(); row.scrollLeft += e.deltaY;
    }, { passive: false });
    // the source picked from the map or the keyboard slides into view
    row.addEventListener('focusin', e => { const it = e.target.closest('.legend-item'); if (it) it.scrollIntoView({ block: 'nearest', inline: 'nearest' }); });
  }
  sync(); requestAnimationFrame(sync);
}
if (globeOn()) document.addEventListener('DOMContentLoaded', () => {
  const _lg = renderLegend;
  window.renderLegend = function (keys) { _lg(keys); globeLegendScroll(); };
  window.addEventListener('resize', () => globeLegendScroll());
});

// ============================================================
//  UNDERGROUND RICHES · RESOURCE RENTS: the bar had a hidden 0–20% scale, so a quarter of the oil states ran off its end
//  and filled it, with nothing to say what its width meant. It now runs 0–60% of GDP on a square-root scale (the median
//  country is about 1%, Libya 61%), with the scale written under it; the segments split the bar by fuel.
// ============================================================
if (globeOn()) document.addEventListener('DOMContentLoaded', () => {
  if (typeof CARD_TPL === 'undefined' || typeof cardsV3Vals !== 'function') return;
  const MAX = 60, pos = v => Math.sqrt(Math.max(0, Math.min(v, MAX)) / MAX) * 100;
  if (CARD_TPL.under && !CARD_TPL.under.includes('rn-axis'))
    CARD_TPL.under = CARD_TPL.under.replace('<div class="rn-key">',
      '<span class="rn-axis" aria-hidden="true"><sc-for list="{{rentAxis}}" as="a" hint-placeholder-count="7"><span class="rn-tk" style="{{a.style}}">{{a.t}}</span></sc-for></span>\n                <div class="rn-key">');
  const _v3 = cardsV3Vals;
  window.cardsV3Vals = function (st0) {
    const v = _v3(st0), C = st0 && st0.C;
    if (!C || !C.rents) return v;
    const W = Object.assign({ rent: 2.9 }, st0.W || {});
    const RENT = [['oil', 'Oil', '#c0654a'], ['gas', 'Gas', '#e8925a'], ['coal', 'Coal', '#4a4a4a'], ['min', 'Minerals', '#5b6573']];
    const tot = Object.values(C.rents).reduce((a, x) => a + x, 0), T = pos(tot);
    v.rentSegs = RENT.filter(([k]) => C.rents[k] > 0).map(([k, name, col]) => ({ name, hl: 'rent:' + k,
      style: 'width: ' + Math.max(0.6, tot ? T * C.rents[k] / tot : 0).toFixed(2) + '%; background: ' + col + '8c; box-shadow: inset 0 0 0 1px ' + col }));
    v.rentMark = 'left: ' + pos(W.rent).toFixed(1) + '%';
    v.rentAxis = [0, 1, 5, 10, 20, 40, 60].map((t, i, a) => ({ t: t ? t + '%' : '0',
      style: 'left: ' + pos(t).toFixed(1) + '%' + (i === 0 ? '; transform: none' : i === a.length - 1 ? '; transform: translateX(-100%)' : '') }));
    return v;
  };
});

// ============================================================
//  THE GAME'S CARD REDRAW ON RESIZE, IN EXPLORE: the daily redraws its clue cards when the window is resized. In Explore
//  that put the daily's version of a group's cards in the panel ("No data for this country", world ranks instead of
//  shares) and showed every card at once behind the tabs. Here a group keeps its own cards, and a country's are redrawn
//  then laid out again (tabs, columns).
// ============================================================
if (globeOn()) document.addEventListener('DOMContentLoaded', () => {
  const inPanel = () => document.body.classList.contains('at-globe') && document.querySelector('#gl-side #clue-cards');
  if (typeof renderClueCards === 'function') {
    const _rcc = renderClueCards;
    window.renderClueCards = function () { if (inPanel()) return; return _rcc.apply(this, arguments); };
  }
  if (typeof renderAtlasCards === 'function') {
    const _rac = renderAtlasCards;
    window.renderAtlasCards = function () {
      if (inPanel() && !GLOBE_SEL) return;                 // a group: its cards are Explore's own
      const r = _rac.apply(this, arguments);
      if (inPanel()) {
        // cards with no data for this country go last, after the ones worth reading (and so do their tabs)
        const cc = document.querySelector('#gl-side #clue-cards'), slot = cc && (cc.querySelector('.ic-slot') || cc);
        if (slot) cc.querySelectorAll('.ic-card.is-empty').forEach(c => slot.appendChild(c));
        globeTabs();
      }
      return r;
    };
  }
});

// the header is re-fitted by the game (a new tab bar once the daily is solved, a resize): line it up again each time
if (globeOn()) document.addEventListener('DOMContentLoaded', () => {
  if (typeof fitHeader !== 'function') return;
  const _fit = fitHeader;
  window.fitHeader = function () { const r = _fit.apply(this, arguments); try { hdAlignNav(); } catch (e) {} return r; };
  const _rgs = window.renderGameScreen;
  window.renderGameScreen = function () { const r = _rgs.apply(this, arguments); hdSoon(); return r; };
});

// ---- the page's width between tabs: narrow (the puzzle, the archive) or wide (Explore).
// The new tab is laid out ONCE, at its final width; the change of width is then played with transforms only (the header's
// pieces slide from where they were, the rule under them stretches, the content fades in). Nothing is re-measured or
// re-drawn frame by frame: no chart, map or card is resized while the animation runs, so every entrance animation plays
// once, at the right scale.
const FRAME_MS = 420, FRAME_EASE = 'cubic-bezier(.22,.8,.24,1)';
const FRAME_PARTS = ['.hd-brand', '#mode-nav', '.hd-grid .lb-split', '.hd-grid .podium', '.subtitle-row .subtitle', '.subtitle-row > :last-child'];
let FRAME_READY = false, FRAME_N = 0, FRAME_BUSY = false;
if (globeOn()) document.addEventListener('DOMContentLoaded', () => setTimeout(() => { FRAME_READY = true; }, 600));   // not on the first paint
function globeFrame(narrow) {
  const was = document.body.classList.contains('pz-col'), hd = document.querySelector('header');
  const play = was !== narrow && FRAME_READY && !REDUCED_MOTION && hd && hd.animate && matchMedia('(min-width: 1100px)').matches;
  const q = sel => { const e = document.querySelector(sel); return e ? e.getBoundingClientRect() : null; };
  const first = play ? FRAME_PARTS.map(q) : null, hd0 = play ? hd.getBoundingClientRect() : null;   // where everything is now…
  document.body.classList.toggle('pz-col', narrow);
  if (!play) return;
  const n = ++FRAME_N;
  Promise.resolve().then(() => {                                 // …and, once the new tab is drawn (before it is painted), where it ends up
    if (n !== FRAME_N) return;
    FRAME_BUSY = false;
    try { hdAlignNav(); } catch (e) {}
    const hd = document.querySelector('header'); if (!hd) return;          // the header is drawn anew with each tab
    const hd1 = hd.getBoundingClientRect(); if (!hd1.width || Math.abs(hd1.width - hd0.width) < 2) return;
    const opt = { duration: FRAME_MS, easing: FRAME_EASE };
    FRAME_PARTS.forEach((sel, i) => {
      const e = document.querySelector(sel), a = first[i]; if (!e || !a || !a.width) return;
      const b = e.getBoundingClientRect(), dx = Math.round(a.left - b.left); if (!b.width || !dx) return;
      e.animate([{ transform: 'translateX(' + dx + 'px)' }, { transform: 'none' }], opt);
    });
    // the rule under the header: drawn by a stand-in for the time of the move, so it can be scaled
    hd.querySelectorAll('.hd-rule').forEach(x => x.remove());
    const rule = document.createElement('span'); rule.className = 'hd-rule'; hd.appendChild(rule); hd.classList.add('hd-moving');
    FRAME_BUSY = true;
    const done = () => { rule.remove(); hd.classList.remove('hd-moving'); if (n !== FRAME_N) return; FRAME_BUSY = false; hdSoon(); };
    setTimeout(() => { if (n === FRAME_N && FRAME_BUSY) done(); }, FRAME_MS + 400);          // should the end go unreported
    const an = rule.animate([{ transform: 'scaleX(' + (hd0.width / hd1.width).toFixed(4) + ')' }, { transform: 'none' }], opt);
    an.onfinish = done; an.oncancel = done;
    document.querySelectorAll('#app > *').forEach(e => { if (e !== hd && !e.contains(hd)) e.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' }); });
  });
}

// ---- the puzzle's latest-mix bar: a little thicker in the 1,100 px column (its card is wider there), so it uses the room
if (globeOn() && window.Chart) window.Chart = class extends window.Chart {
  constructor(ctx, cfg) {
    try {
      const cv = ctx && (ctx.canvas || ctx);
      if (cv && cv.id === 'bar-chart' && document.body.classList.contains('pz-col') && !document.body.classList.contains('at-globe') && innerWidth > 600)
        (cfg.data.datasets || []).forEach(d => { d.maxBarThickness = 64; });
    } catch (e) {}
    super(ctx, cfg);
  }
};

// ============================================================
//  HOW TO PLAY: the rules in four steps, each with a small picture of the thing it describes.
//  Opens by itself once, on a newcomer's first daily; afterwards from the "How to play" link on the puzzle line
//  (only until a first game is played) and from the footer.
// ============================================================
const HOWTO_KEY = 'energle_howto_v1';
const howtoOn = () => globeOn();
function howtoNewcomer() { try { return !(loadStats().played > 0); } catch (e) { return true; } }
function howtoHTML() {
  const seg = (k, w) => '<span style="width:' + w + '%;background:' + colorOf(k) + '"></span>';
  const row = (name, km, dir, deg, p) => {
    const c = closeRGB(p);
    return '<span class="ht-guess"><span class="ht-gname">' + name + '</span>'
      + '<svg class="ht-arrow" viewBox="0 0 16 16" width="14" height="14" style="transform:rotate(' + deg + 'deg)" aria-hidden="true"><path d="M8 2v12M3.5 6.5 8 2l4.5 4.5" fill="none" stroke="#1a1a1a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      + '<span class="ht-gkm" style="color:' + darker(c) + ';background:' + rgbaOf(c, .16) + '">' + km + ' ' + dir + '</span></span>';
  };
  const cells = '<span class="ht-batt">' + [1, 1, 1, 1, 1, 0].map(f => '<i class="' + (f ? 'is-on' : '') + '"></i>').join('') + '</span>';
  const steps = [
    ['Read the profile', 'One country a day, through its electricity: how much it generates, its mix by source since 2000, and what it trades with its neighbours.',
      '<span class="ht-mix">' + seg('Coal', 34) + seg('Gas', 22) + seg('Hydro', 18) + seg('Nuclear', 12) + seg('Wind', 9) + seg('Solar', 5) + '</span>'],
    ['Guess the country', 'Six guesses. After a miss, the arrow points to the answer and gives the distance; the colour turns from red to green as you get closer.',
      row('Brazil', '9,400 km', 'NE', 40, 6) + row('Poland', '850 km', 'SE', 140, 92)],
    ['Stuck? Buy a clue', (shopOpensAfter() ? 'From your second try, the' : 'At any point, the') + ' Clue Shop trades one guess for a clue card: its sun and wind, what lies underground, its fuel trade, how its people live.', cells],
    ['Or guess on the map', 'The Map button next to Guess opens a globe: tap a country to fill in your guess.',
      '<span class="ht-map">' + GMAP_ICON + '</span>'],
  ];
  return '<div class="st-backdrop"></div>'
    + '<div class="nt-box ht-box" role="dialog" aria-modal="true" aria-labelledby="ht-title">'
    + '<button type="button" class="ht-x" id="ht-x" aria-label="Close">×</button>'
    + '<span class="nt-eyebrow">Energle</span><h2 class="nt-title" id="ht-title">How to play</h2>'
    + '<ol class="ht-steps">' + steps.map(([t, x, pic], i) => '<li><span class="ht-pic">' + pic + '</span><span class="ht-txt"><strong><b>' + (i + 1) + '</b>' + t + '</strong>' + x + '</span></li>').join('') + '</ol>'
    + '<p class="ht-foot">A new country every day at midnight UTC. Finish it to unlock <strong>Explore</strong>: every country on a globe, to practise on.</p>'
    + '<button type="button" class="nt-btn" id="ht-ok">Let’s play</button>'
    + '</div>';
}
function showHowTo() {
  if (document.getElementById('howto-modal')) return;
  try { localStorage.setItem(HOWTO_KEY, '1'); } catch (e) {}
  const modal = document.createElement('div'); modal.id = 'howto-modal'; modal.innerHTML = howtoHTML();
  const close = () => { modal.remove(); document.removeEventListener('keydown', onKey); const q = document.getElementById('ht-q'); if (q) q.focus({ preventScroll: true }); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.body.appendChild(modal);
  modal.querySelector('.st-backdrop').addEventListener('click', close);
  modal.querySelector('#ht-x').addEventListener('click', close);
  modal.querySelector('#ht-ok').addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  modal.querySelector('#ht-ok').focus({ preventScroll: true });
}
// the link on the puzzle line: only for people who have never played a game (they may have skipped the welcome);
// regulars find How to play in the footer
function howtoLink() {
  if (!howtoOn() || document.getElementById('ht-q') || !howtoNewcomer()) return;
  const vis = e => e && getComputedStyle(e).display !== 'none';            // phones hide the task: the link then follows the puzzle number
  const rest = [document.querySelector('.subtitle-row .sub-rest'), document.querySelector('.subtitle-row .sub-lead'), document.querySelector('.subtitle-row .subtitle')].find(vis); if (!rest) return;
  const nb = true;
  rest.insertAdjacentHTML('beforeend', '<button type="button" class="ht-q' + (nb ? ' is-text' : '') + '" id="ht-q" title="How to play" aria-label="How to play">'
    + (nb ? 'How to play' : '?') + '</button>');
  document.getElementById('ht-q').addEventListener('click', showHowTo);
}
if (globeOn()) document.addEventListener('DOMContentLoaded', () => {
  if (!howtoOn()) return;
  const _rgs = window.renderGameScreen;
  window.renderGameScreen = function () { const r = _rgs.apply(this, arguments); howtoLink(); return r; };
  if (typeof footerHTML === 'function') {
    const _ft = footerHTML;
    window.footerHTML = function () {
      return _ft.apply(this, arguments).replace('<span class="ft-nav">', '<span class="ft-nav"><button type="button" class="ft-link" onclick="showHowTo()">How to play</button><span class="ft-dot" aria-hidden="true"> · </span><a class="ft-link" href="/about/">About</a><span class="ft-dot" aria-hidden="true"> · </span><a class="ft-link" href="/country/">Countries</a><span class="ft-dot" aria-hidden="true"> · </span>');
    };
  }
  // a newcomer's first daily: the rules open by themselves, once, after anything else that opens on arrival
  const _maybe = window.maybeShowNotice;
  window.maybeShowNotice = function () {
    const r = _maybe.apply(this, arguments);
    let due = false;
    try { due = !localStorage.getItem(HOWTO_KEY) && !(localStorage.getItem(LS_KEY) || localStorage.getItem(LS_STATS_KEY)); } catch (e) {}
    if (/[?&](howto|welcome)=1\b/.test(location.search)) due = true;
    if (due && MODE === 'normal') {
      let tries = 0;
      const go = () => { if (document.querySelector('#username-modal, #notice-modal, #tour-modal, #shop-intro, #stats-modal')) { if (++tries < 120) setTimeout(go, 500); return; } showWelcome(); };   // the detailed walkthrough; How to play is the short version for later
      setTimeout(go, REDUCED_MOTION ? 0 : 600);
    }
    return r;
  };
});

// ============================================================
//  WELCOME: the detailed how-to-play, step by step, opened once on a newcomer's first daily (How to play is the short
//  version, for later). It walks through one real example country (never today's answer), card by card, then the
//  guesses on it, the map, the Clue Shop and what comes after.
// ============================================================
const WELCOME_KEY = 'energle_welcome_v1';
const WL_EXAMPLES = ['Italy', 'Finland', 'Hungary', 'Portugal'];
function wlExample() {
  const name = WL_EXAMPLES.find(n => ALL_DATA[n] && !(typeof target !== 'undefined' && target && target.name === n)) || WL_EXAMPLES[0];
  const info = ALL_DATA[name], y = info.latestYear, d = info.years[y], c = COUNTRIES.find(x => x.name === name);
  return { name, info, y, d, c };
}
function wlBearing(a, b) {   // flat geometry, as in the game
  const deg = (Math.atan2(b.lng - a.lng, b.lat - a.lat) * 180 / Math.PI + 360) % 360;
  const DIRS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return { deg, dir: DIRS[Math.round(deg / 22.5) % 16] };
}
function wlGuesses(ex) {
  const pick = n => COUNTRIES.find(x => x.name === n);
  const far = pick('Brazil'), near = ex.name === 'Italy' ? pick('Germany') : ex.name === 'Finland' ? pick('Poland') : ex.name === 'Hungary' ? pick('France') : pick('France');
  return [far, near].filter(Boolean).map(g => {
    const km = Math.round(haversineKm(g.lat, g.lng, ex.c.lat, ex.c.lng)), b = wlBearing(g, ex.c);
    return { c: g, km, dir: b.dir, deg: b.deg, p: closeness(km) };
  });
}
function hexRGB(h) { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(h || ''); return m ? [1, 2, 3].map(i => parseInt(m[i], 16)) : [90, 90, 90]; }
const WL_ARROW = deg => '<svg class="ht-arrow" viewBox="0 0 16 16" width="15" height="15" style="transform:rotate(' + Math.round(deg) + 'deg)" aria-hidden="true"><path d="M8 2v12M3.5 6.5 8 2l4.5 4.5" fill="none" stroke="#1a1a1a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
// the picture for each step, drawn from the example country's own figures
function wlStage(k, ex) {
  const { d, info, y } = ex;
  const srcs = SOURCES.filter(s => (d[s] || 0) > 0.5).sort((a, b) => d[b] - d[a]);
  const fmtP = v => (v < 10 ? v.toFixed(1) : Math.round(v)) + '%';
  const pct = s => d[s] / d.Total * 100;
  const mixBar = h => '<span class="wl-mix" style="height:' + h + 'px">' + srcs.map(s => '<i style="flex:' + d[s] + ';background:' + colorOf(s) + '"></i>').join('') + '</span>';
  const chips = n => '<span class="wl-chips">' + srcs.slice(0, n).map(s => '<span><i style="background:' + colorOf(s) + '"></i>' + s + ' <b>' + fmtP(pct(s)) + '</b></span>').join('') + '</span>';
  if (k === 0) return '<div class="wl-hero"><span class="wl-q">?</span>' + mixBar(30) + chips(4) + '</div>';
  if (k === 1) {
    const wg = WORLD_GEN[y] ?? WORLD_GEN[Math.max(...Object.keys(WORLD_GEN).map(Number))], wd = WORLD_DPC[y] ?? WORLD_DPC[Math.max(...Object.keys(WORLD_DPC).map(Number))];
    const net = d.NetImports || 0, dem = d.Total + net;
    const trade = net > 0.05 ? fmtP(net / dem * 100) + ' of demand imported' : net < -0.05 ? fmtP(-net / d.Total * 100) + ' of output exported' : 'no net trade';
    // the line chart, small: the top four sources since 2000
    const yrs = Object.keys(info.years).map(Number).filter(v => v >= 2000).sort((a, b) => a - b), top = srcs.slice(0, 4);
    const W = 300, H = 74, max = Math.max(...yrs.flatMap(v => top.map(s => info.years[v][s] || 0))) || 1;
    const X = v => 2 + (v - yrs[0]) / (yrs[yrs.length - 1] - yrs[0]) * (W - 4), Y = v => 3 + (1 - v / max) * (H - 6);
    const lines = top.map(s => '<polyline fill="none" stroke="' + colorOf(s) + '" stroke-width="2" stroke-linejoin="round" points="' + yrs.map(v => X(v).toFixed(1) + ',' + Y(info.years[v][s] || 0).toFixed(1)).join(' ') + '"/>').join('');
    return '<div class="wl-prof">'
      + '<div class="wl-stats"><div><span class="stat-label">Generated</span><b>' + fmtTWh(d.Total) + '</b><span class="bc-world bc-world--gen">World Avg: ' + fmtTWh(wg) + '</span></div>'
      + '<div><span class="stat-label">Use per person</span><b>' + info.latestDpc.toFixed(1) + ' MWh</b><span class="bc-world bc-world--dem">World Avg: ' + wd.toFixed(1) + ' MWh</span></div></div>'
      + '<span class="wl-trade" style="--c:' + (net > 0.05 ? FLOW_COLORS.imp : net < -0.05 ? FLOW_COLORS.exp : FLOW_COLORS.gen) + '">' + trade + '</span>'
      + '<div class="wl-card">' + mixBar(16) + chips(3) + '</div>'
      + '<div class="wl-card"><svg class="wl-line" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">' + lines + '</svg><span class="wl-ax"><span>' + yrs[0] + '</span><span>' + yrs[yrs.length - 1] + '</span></span></div>'
      + '</div>';
  }
  if (k === 2) {
    const gs = wlGuesses(ex);
    const row = (g, i) => { const col = closeRGB(g.p);
      return '<span class="wl-grow"><span class="wl-gn">' + (i + 1) + '</span><span class="wl-gname">' + g.c.name + '</span>' + WL_ARROW(g.deg)
        + '<span class="ht-gkm" style="color:' + darker(col) + ';background:' + rgbaOf(col, .16) + '">' + fmtKm(g.km) + ' ' + g.dir + '</span></span>'; };
    return '<div class="wl-guess">' + gs.map(row).join('')
      + '<span class="wl-grow is-win"><span class="wl-gn">' + (gs.length + 1) + '</span><span class="wl-gname">' + ex.name + '</span><span class="ht-gkm" style="color:' + darker(WIN_RGB) + ';background:' + rgbaOf(WIN_RGB, .16) + '">Solved</span></span>'
      + '<span class="wl-gfoot"><span class="ht-map">' + GMAP_ICON + '</span><span class="ht-batt">' + [0, 0, 0, 1, 1, 1].map(f => '<i class="' + (f ? 'is-on' : '') + '"></i>').join('') + '</span></span></div>';
  }
  if (k === 3) return '<div class="wl-shop"><span class="ht-batt">' + [0, 1, 1, 1, 1, 1].map(f => '<i class="' + (f ? 'is-on' : '') + '"></i>').join('') + '</span>'
    + '<span class="wl-cards">' + ['Renewables potential', 'Underground riches', 'Fuel trade', 'People & power'].map(t => '<span>' + t + '</span>').join('') + '</span></div>';
  if (k === 4) return '<div class="wl-map" id="wl-map"></div><span class="wl-maptag"><b>European Union</b> ' + COUNTRIES.filter(groupOf('eu').test).length + ' countries added up</span>';
  return '<div class="wl-after">' + [['Archive', 'every past puzzle'], ['Stats', 'your streak and spread'], ['Leaderboard', 'today and all time'], ['Share', 'your result, no spoilers']].map(([a, b]) => '<span><b>' + a + '</b>' + b + '</span>').join('') + '</div>';
}
function wlSteps(ex) {
  const { d, name } = ex, top = SOURCES.filter(s => (d[s] || 0) > 0.5).sort((a, b) => d[b] - d[a])[0];
  return [
    ['Welcome to Energle', 'Every day, one country hides behind its electricity: how it makes and uses its power, never its name. You have six tries to find it. Our example: ' + name + '.'],
    ['Read its profile', 'How much it generates, and uses per person, against the world average; what it trades with its neighbours; its mix today and since 2000. Every number is a clue: here, ' + top.toLowerCase() + ' leads with ' + Math.round(d[top] / d.Total * 100) + '%.'],
    ['Guess, by name or on the map', 'Type a country, or tap it on the map. After a miss, an arrow points to the answer, with the distance, from red (far) to green (close).'],
    ['Stuck? Trade a guess for a clue', (shopOpensAfter() ? 'From your second try, the' : 'At any point, even before your first guess, the') + ' Clue Shop swaps a guess for a clue card: natural resources, fuel trade, how people live, and more.'],
    ['Then explore the world', 'Once the daily is done, Explore opens: every country on a globe, continents and blocs like the EU added up, the map coloured by any source, and practice on any group.'],
    ['A new country every day', 'At midnight UTC. Keep your streak, climb the leaderboard, share your result, and replay any past puzzle in the Archive.'],
  ];
}
function showWelcome() {
  if (document.getElementById('welcome-modal') || !ALL_DATA) return;
  try { localStorage.setItem(WELCOME_KEY, '1'); localStorage.setItem(HOWTO_KEY, '1'); } catch (e) {}
  const ex = wlExample(), steps = wlSteps(ex), n = steps.length;
  const modal = document.createElement('div'); modal.id = 'welcome-modal';
  modal.innerHTML = '<div class="st-backdrop"></div>'
    + '<div class="nt-box tr-box wl-box" role="dialog" aria-modal="true" aria-labelledby="wl-title">'
    + '<div class="tr-top"><span class="nt-eyebrow">Welcome <span class="tr-n" id="wl-n"></span></span>'
    + '<button type="button" class="gl-x tr-x" aria-label="Skip the welcome">×</button></div>'
    + '<div class="tr-main"><div class="wl-stage" id="wl-stage"></div>'
    + '<div class="tr-text"><div class="wl-copy" id="wl-copy"><h2 class="tr-title" id="wl-title"></h2><p class="tr-say" id="wl-say" aria-live="polite"></p></div>'
    + '<div class="tr-foot"><button type="button" class="tr-back" id="wl-back">← Back</button>'
    + '<span class="tr-dots" id="wl-dots" aria-hidden="true"></span>'
    + '<button type="button" class="tr-next" id="wl-next">Next →</button></div>'
    + '<button type="button" class="wl-skip" id="wl-skip">Skip, I’ll figure it out</button></div></div></div>';
  let k = 0, x0 = null;
  const stage = modal.querySelector('#wl-stage'), copy = modal.querySelector('#wl-copy'), box = modal.querySelector('.wl-box');
  const fill = i => {
    stage.innerHTML = '<div class="wl-pic">' + wlStage(i, ex) + '</div>';
    modal.querySelector('#wl-title').textContent = steps[i][0];
    modal.querySelector('#wl-say').textContent = steps[i][1];
  };
  // Sizing: every step is laid out once (unseen, in the same frame) to find the tallest picture and the tallest text at
  // this width; the stage and the text then keep those heights, so the window never jumps from step to step. If the
  // screen is too short for the tallest picture, every picture is scaled down evenly (never squeezed) to fit.
  const fit = () => {
    stage.style.height = ''; copy.style.minHeight = ''; stage.style.removeProperty('--wl-k');
    let pic = 0, txt = 0;
    for (let i = 0; i < n; i++) { fill(i); const p = stage.firstChild; pic = Math.max(pic, p.scrollHeight); txt = Math.max(txt, copy.scrollHeight); }
    copy.style.minHeight = txt + 'px';
    const pad = parseFloat(getComputedStyle(stage).paddingTop) * 2;
    fill(k); stage.style.height = (pic + pad) + 'px';
    const vh = (window.visualViewport ? visualViewport.height : innerHeight) - 24, over = box.scrollHeight - vh;
    if (over > 0) { const room = Math.max(120, pic - over), s = Math.max(.55, room / pic); stage.style.height = Math.round(pic * s + pad) + 'px'; stage.style.setProperty('--wl-k', s.toFixed(3)); }
    if (k === 4) wlMap(stage.querySelector('#wl-map'), ex);
  };
  const close = () => { modal.remove(); document.removeEventListener('keydown', onKey); removeEventListener('resize', onRz); };
  const show = i => {
    k = i; fill(k); stage.firstChild.classList.add('is-in');
    if (k === 4) wlMap(stage.querySelector('#wl-map'), ex);
    modal.querySelector('#wl-n').textContent = '· ' + (k + 1) + ' of ' + n;
    modal.querySelector('#wl-back').disabled = k === 0;
    const nx = modal.querySelector('#wl-next'), last = k === n - 1;
    nx.textContent = last ? 'Let’s play →' : 'Next →'; nx.classList.toggle('is-last', last);
    modal.querySelector('#wl-skip').style.visibility = last ? 'hidden' : '';
    modal.querySelector('#wl-dots').innerHTML = steps.map((_, j) => '<i' + (j === k ? ' class="on"' : '') + '></i>').join('');
  };
  const go = dl => { const j = k + dl; if (j < 0) return; if (j >= n) { close(); const inp = document.getElementById('guess-input'); if (inp && !matchMedia('(hover: none)').matches) inp.focus({ preventScroll: true }); return; } show(j); };
  const onKey = e => { if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight') go(1); else if (e.key === 'ArrowLeft') go(-1); };
  let rzT = null, lastW = 0;
  const onRz = () => { clearTimeout(rzT); rzT = setTimeout(() => { if (!document.body.contains(modal)) return; fit(); stage.firstChild.classList.add('is-in'); }, 120); };
  modal.querySelector('.st-backdrop').addEventListener('click', close);
  modal.querySelector('.tr-x').addEventListener('click', close);
  modal.querySelector('#wl-skip').addEventListener('click', close);
  modal.querySelector('#wl-back').addEventListener('click', () => go(-1));
  modal.querySelector('#wl-next').addEventListener('click', () => go(1));
  stage.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  stage.addEventListener('touchend', e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1); });
  document.addEventListener('keydown', onKey); addEventListener('resize', onRz);
  if (window.visualViewport) visualViewport.addEventListener('resize', onRz);
  document.body.appendChild(modal);
  show(0); fit(); show(0);
  modal.querySelector('#wl-next').focus({ preventScroll: true });
}
// the Explore step: the demo world map with the EU lit up as one group, the example country picked out
function wlMap(el, ex) {
  if (!el) return;
  nxMapSVG().then(svg => {
    if (!svg || !document.body.contains(el)) return;
    el.innerHTML = svg;
    const sv = el.querySelector('svg'); if (sv) sv.setAttribute('viewBox', '0 3 640 336');   // the whole globe outline, not cut at the bottom
    const eu = new Set(COUNTRIES.filter(groupOf('eu').test).map(c => c.iso3));
    el.querySelectorAll('path[data-i]').forEach(p => { if (eu.has(p.dataset.i)) p.classList.add('on'); });
    const a = el.querySelector('path[data-i="' + ex.c.iso3 + '"]'); if (a) a.classList.add('pick');
  });
}
if (globeOn()) document.addEventListener('DOMContentLoaded', () => {
  if (!howtoOn()) return;
  window.showHowTo = (function (_h) { return function () { _h(); const box = document.querySelector('#howto-modal .ht-foot');
    if (box && !box.querySelector('.ht-full')) { box.insertAdjacentHTML('beforeend', ' <button type="button" class="ft-link ht-full">See the full walkthrough</button>');
      box.querySelector('.ht-full').addEventListener('click', () => { document.getElementById('howto-modal').remove(); showWelcome(); }); } }; })(showHowTo);
});

// By source / By category: a colouring the new view has no chip for is switched off (with its group), not left on unselected
if (globeOn()) document.addEventListener('DOMContentLoaded', () => {
  if (typeof setChartView !== 'function') return;
  const _scv = setChartView;
  window.setChartView = function () {
    const r = _scv.apply(this, arguments);
    if (GLOBE_SHADE && document.body.classList.contains('at-globe') && !document.querySelector('#legend-shared .legend-item[data-src="' + GLOBE_SHADE + '"]')) {
      const back = String(GLOBE_REGION).startsWith('src_') ? (GLOBE_SRC_PREV || 'all') : null;
      globeShadeOff();
      if (back && !GLOBE_SEL) globeRegion(back);
    }
    return r;
  };
});

// ---- leaderboard: the rank column is as wide as the longest rank in the list ("1234." no longer runs into the name)
function lbRankFit() {
  const body = document.getElementById('lb-body'); if (!body) return;
  const n = Math.max(0, ...[...body.querySelectorAll('.lb-rank')].map(e => e.textContent.trim().length));
  body.querySelectorAll('.lb-list').forEach(l => l.style.setProperty('--lb-rank-n', n));
}
if (globeOn()) document.addEventListener('DOMContentLoaded', () => {
  ['renderLbToday', 'renderLbAllTime'].forEach(fn => {
    const f = window[fn]; if (typeof f !== 'function') return;
    window[fn] = function () { const r = f.apply(this, arguments); lbRankFit(); return r; };
  });
});

// ============================================================
//  CHANGE NAME: a name keeps its history when it changes. There are no accounts: this browser holds a random key, and a
//  name is tied to the first key that claims it (on any visit, or when it is first chosen). Only that browser can
//  rename it, to a name nobody else uses (capitals ignored). The rename runs in the database (rename_player), which
//  moves every past score to the new name and logs it.
// ============================================================
const PLAYER_KEY_LS = 'energle_player_key';
function playerKey() {
  let k = null; try { k = localStorage.getItem(PLAYER_KEY_LS); } catch (e) {}
  if (k && k.length >= 32) return k;
  const b = new Uint8Array(16); crypto.getRandomValues(b); k = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  try { localStorage.setItem(PLAYER_KEY_LS, k); } catch (e) {}
  return k;
}
async function sbRpc(fn, args) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/rpc/' + fn, { method: 'POST', headers: SB_HEADERS, body: JSON.stringify(args) });
  if (!res.ok) throw new Error(fn + ' ' + res.status);
  return res.json();
}
let NAME_CLAIM = null;   // 'mine' | 'other' | null (not asked yet / offline)
async function nameClaim() {
  const u = getUsername(); if (!u) return null;
  try { NAME_CLAIM = await sbRpc('claim_name', { p_name: u, p_key: playerKey() }); } catch (e) { NAME_CLAIM = null; }
  return NAME_CLAIM;
}
function showRenameModal() {
  const old = getUsername(); if (!old || document.getElementById('rename-modal')) return;
  const modal = document.createElement('div'); modal.id = 'rename-modal';
  modal.innerHTML = '<div class="st-backdrop"></div>'
    + '<div class="st-box rn-box" role="dialog" aria-modal="true" aria-labelledby="rn-title">'
    + '<div class="st-header"><span class="st-title" id="rn-title">Change your name</span><button type="button" class="rn-x" aria-label="Close">×</button></div>'
    + '<div class="rn-body"><p class="rn-note">Your scores, rank and streak move to the new name.</p>'
    + '<input id="rn-input" type="text" maxlength="20" autocomplete="off" spellcheck="false" value="' + escHtml(old) + '">'
    + '<p class="rn-msg" id="rn-msg" aria-live="polite"></p>'
    + '<button type="button" class="rn-go" id="rn-go" disabled>Change name</button></div></div>';
  document.body.appendChild(modal);
  const input = modal.querySelector('#rn-input'), msg = modal.querySelector('#rn-msg'), go = modal.querySelector('#rn-go');
  const close = () => { modal.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  const say = (t, ok) => { msg.textContent = t; msg.classList.toggle('is-ok', !!ok); };
  let seq = 0, T = null;
  const check = () => {
    const v = input.value.trim(); go.disabled = true;
    if (v === old) return say('');
    if (v.length < 2) return say('At least 2 characters.');
    if (!/^[a-zA-Z0-9_ .\-]+$/.test(v)) return say('Letters, numbers, spaces, _ - . only.');
    if (v.toLowerCase() === old.toLowerCase()) { go.disabled = false; return say('Same name, new capitals.', true); }
    say('Checking…'); const n = ++seq; clearTimeout(T);
    T = setTimeout(async () => {
      let free = null; try { free = await sbRpc('name_free', { p_name: v }); } catch (e) {}
      if (n !== seq) return;
      if (free === null) return say('Couldn’t check the name. Try again in a moment.');
      go.disabled = !free; say(free ? 'Available.' : 'Someone already uses this name.', free);
    }, 300);
  };
  input.addEventListener('input', check);
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !go.disabled) go.click(); });
  go.addEventListener('click', async () => {
    const v = input.value.trim(); go.disabled = true; say('Changing…');
    if (NAME_CLAIM !== 'mine') await nameClaim();
    let r = null; try { r = await sbRpc('rename_player', { p_old: old, p_new: v, p_key: playerKey() }); } catch (e) {}
    if (r === 'ok') {
      setUsername(v); NAME_CLAIM = 'mine';
      MY_SCORES = null; STREAKS_P = null; PODIUM = null;
      try { loadPodium(); } catch (e) {}
      close();
      const st = document.getElementById('stats-modal'); if (st) showStatsModal(false);
      return;
    }
    go.disabled = false;
    say(r === 'not_yours' ? 'This name was first used on another device, so it can only be changed there.'
      : r === 'taken' ? 'Someone already uses this name.' : r === 'invalid' ? 'Letters, numbers, spaces, _ - . only (2 to 20).'
      : 'Couldn’t reach the server. Try again in a moment.');
  });
  modal.querySelector('.st-backdrop').addEventListener('click', close);
  modal.querySelector('.rn-x').addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  input.focus(); input.select();
}
if (globeOn()) document.addEventListener('DOMContentLoaded', () => {
  nameClaim();                                                     // tie this browser to its name early (first come)
  const _set = window.setUsername;
  window.setUsername = function (n) { const r = _set.apply(this, arguments); if (!document.getElementById('rename-modal')) nameClaim(); return r; };
  // the first-name prompt no longer says the name is final
  const _ens = window.ensureUsername;
  window.ensureUsername = function () {
    const p = _ens.apply(this, arguments);
    const note = document.querySelector('#username-modal p'); if (note) note.textContent = 'How you appear on the leaderboard. You can change it later in Stats.';
    nameGuard();
    if (window.ENERGLE_TEST) deviceLinkInPrompt();
    return p;
  };
  // Stats: a small "Change name" link under the name
  const _stats = window.showStatsModal;
  window.showStatsModal = function () {
    const r = _stats.apply(this, arguments);
    const who = document.querySelector('#stats-modal .sx-who');
    if (who && getUsername() && !who.querySelector('.rn-link')) {
      who.insertAdjacentHTML('beforeend', '<button type="button" class="rn-link">Change name</button>'
        + (NAME_CLAIM === 'other' ? '<span class="rn-held">Another device holds this name: your next result will ask you for a new one.</span>' : ''));
      who.querySelector('.rn-link').addEventListener('click', showRenameModal);
      if (window.ENERGLE_TEST) {
        const rn = who.querySelector('.rn-link'), row = document.createElement('span'); row.className = 'rn-links';
        rn.replaceWith(row); row.appendChild(rn);                       // both links on one row, under the name
        row.insertAdjacentHTML('beforeend', '<button type="button" class="rn-link dv-link">Use on another device</button>');
        row.querySelector('.dv-link').addEventListener('click', () => showDeviceModal());
      }
    }
    return r;
  };
});

// ---- Today's leaderboard: a dashed line where the scores pass today's average (a miss counts as 7, as in Avg).
// Same look as the All time "Typical result" line.
function lbTodayAvgLine(rows) {
  const list = document.querySelector('#lb-body .lb-list'); if (!list || !rows || rows.length < 2) return;
  const eff = r => r.won ? Number(r.guesses) : 7;
  const avg = rows.reduce((a, r) => a + eff(r), 0) / rows.length;
  const after = [...list.querySelectorAll('.lb-row')].find(el => {
    const t = (el.querySelector('.lb-score') || {}).textContent || '';
    const v = /^X/i.test(t) ? 7 : parseInt(t, 10);
    return v > avg;
  });
  if (!after) return;                               // everyone on the same score: no line to draw
  after.insertAdjacentHTML('beforebegin', '<div class="lb-avg-divider lb-avg-today"><span>Today’s average · ' + avg.toFixed(2) + ' guesses</span></div>');
}
if (globeOn()) document.addEventListener('DOMContentLoaded', () => {
  if (typeof renderLbToday !== 'function') return;
  const _t = window.renderLbToday;
  window.renderLbToday = function (rows) { const r = _t.apply(this, arguments); lbTodayAvgLine(rows); return r; };
});

// Turkey has no continent in the game's table, so it fell outside Europe and every continent group
if (globeOn()) document.addEventListener('DOMContentLoaded', () => { try { if (!ISO3_CONTINENT.TUR) ISO3_CONTINENT.TUR = 'Europe'; } catch (e) {} });

// the address of a country's page (scripts/build_country_pages.py makes the same slug)
function countrySlug(name) { return name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }

// ============================================================
//  COUNTRY PAGES (energle.org/country/<name>/, built by scripts/build_country_pages.py): Energle itself, opened on
//  Explore with one country picked (window.ENERGLE_COUNTRY). The page carries a few sentences about the country in
//  words, no figures (#cp-words). Until today's puzzle is finished in this browser, the profile stays locked: the
//  panel shows those words and a blurred outline, the map tools are put away, and clicking another country opens its
//  own page. Search engines never play, so they only ever see the words. Once the puzzle is done, it is plain Explore.
// ============================================================
const CP_ISO = window.ENERGLE_COUNTRY || null, CP_INDEX = CP_ISO === '*';   // '*': the countries index (the whole world)
function cpLocked() { try { const s = loadDailyState(); return !(s && s.gameOver); } catch (e) { return true; } }
function cpCountry() { return CP_ISO && !CP_INDEX && typeof COUNTRIES !== 'undefined' ? COUNTRIES.find(c => c.iso3 === CP_ISO) : null; }
function cpWordsClone() {
  const src = document.getElementById('cp-words'); if (!src) return '';
  const k = src.cloneNode(true); k.removeAttribute('id'); k.removeAttribute('aria-labelledby'); k.className = 'cp-words-in';
  const h = k.querySelector('h1'); if (h) h.remove();                    // the panel already names the country (or the list)
  return k.outerHTML;
}
function cpLockedHTML(c) {
  const name = escHtml(c.name);
  return '<div class="gl-p-head">' + flagImg(c.iso3, 'gl-flag') + '<div><h3>' + name + '</h3><span>' + (REGION_LABEL[c.continent] || c.continent || '') + '</span></div></div>'
    + cpWordsClone()
    + '<div class="cp-lock"><div class="cp-skel" aria-hidden="true"><i class="w2"></i><i class="w2"></i><i class="bar"></i><i class="chart"></i><i class="w3"></i><i class="w3"></i><i class="w3"></i></div>'
    + '<div class="cp-lock-msg"><b>' + name + '’s full profile</b><span>Its figures, charts and clue cards open here once you’ve played today’s puzzle.</span>'
    + '<a class="cp-play" href="/">Play today’s puzzle</a></div></div>';
}
if (globeOn() && CP_ISO) document.addEventListener('DOMContentLoaded', () => {
  document.body.classList.add('cp-page', 'cp-ready');
  // start on Explore, this country picked (no notices or intros: the visitor came for the country)
  window.initApp = function () {
    try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch (e) {}
    try { migrateDailyToHistory(); } catch (e) {}
    POOL = COUNTRIES; MODE = 'practice'; ATLAS.view = 'globe'; ATLAS.region = 'all';
    document.body.classList.toggle('cp-locked', cpLocked());
    renderBrowseScreen(); updateDonePill();
    try { loadPodium(); } catch (e) {}
    const c = cpCountry(); if (!c) { if (CP_INDEX) globeSide(); return; }
    globeSelect(c, false);
    let n = 0; const fly = setInterval(() => {                           // fly there once the globe is up
      if (GLOBE && GLOBE.loaded && GLOBE.loaded()) { clearInterval(fly); if (GLOBE_SEL && GLOBE_SEL.iso3 === CP_ISO) globeSelect(c); }
      else if (++n > 80) clearInterval(fly);
    }, 150);
  };
  // locked: the panel is the words and the outline, whatever asks for it
  const _side = window.globeSide;
  window.globeSide = function () {
    const locked = cpLocked(); document.body.classList.toggle('cp-locked', locked);
    const el = document.getElementById('gl-side'), c = cpCountry();
    if (locked && el && CP_INDEX) {                                     // the index, locked: the world's list of countries
      el.innerHTML = '<div class="gl-p-head"><span class="gl-reg-ico" aria-hidden="true">' + GLOBE_ICON + '</span><div><h3>Electricity by country</h3><span>Pick a country</span></div></div>' + cpWordsClone();
      el.hidden = false; el.classList.add('is-region');
      const lay = document.getElementById('gl-layout'); if (lay) lay.classList.add('has-sel');
      return;
    }
    if (locked && el && c) {
      el.innerHTML = cpLockedHTML(c); el.hidden = false; el.classList.remove('is-region');
      const lay = document.getElementById('gl-layout'); if (lay) lay.classList.add('has-sel');
      return;
    }
    const r = _side.apply(this, arguments);
    if (el && GLOBE_SEL && GLOBE_SEL.iso3 === CP_ISO) {                  // unlocked: plain Explore (the words are only for those who haven't played)
      const more = el.querySelector('.gl-more-row'); if (more) more.remove();   // no link to the page it is on
    }
    return r;
  };
  const _sel = window.globeSelect;
  window.globeSelect = function (c, fly) {
    if (cpLocked()) {
      if (c && (CP_INDEX || c.iso3 !== CP_ISO)) { location.href = '/country/' + countrySlug(c.name) + '/'; return; }   // another country: its own page
      if (!c) return;                                                    // nothing to close while locked
    }
    return _sel.apply(this, arguments);
  };
  // the daily lives at energle.org itself
  const _sw = window.switchMode;
  window.switchMode = function (mode) { if (mode === 'normal') { location.href = '/'; return; } return _sw.apply(this, arguments); };
});

// ============================================================
//  ALL ENERGY VIEW (test page: window.ENERGY_VIEW): a switch above the base cards, "Electricity | All energy". In the
//  energy view the same cards show the country's total energy use (data/energy.json, scripts/build_energy.py): what it
//  consumes by source, what it produces and trades, use per person, and the change since 2000. Oil sits in the
//  "Other Fossil" slot and is labelled Oil. The swap is the whole data layer (ALL_DATA, world averages), so Daily,
//  Archive and Explore all follow, and the choice is kept for the visit.
// ============================================================
const EV_ON = () => globeOn() && !!window.ENERGY_VIEW;
let EV = 'elec', EV_DATA = null, EV_ELEC = null, EV_LABELS = null;
async function evLoad() {
  if (EV_DATA) return EV_DATA;
  const raw = await (await fetch('data/energy.json')).json();
  const wd = raw.__world_dpc__; delete raw.__world_dpc__;
  EV_DATA = { data: Object.fromEntries(Object.entries(raw).map(([k, v]) => [DISPLAY_NAMES[k] || k, v])), wd };
  return EV_DATA;
}
async function evSet(v) {
  if (v === EV) return;
  if (v === 'energy') { try { await evLoad(); } catch (e) { return; } }
  if (!EV_ELEC) EV_ELEC = { data: ALL_DATA, wd: WORLD_DPC };
  const src = v === 'energy' ? EV_DATA : EV_ELEC;
  ALL_DATA = src.data; WORLD_DPC = src.wd; buildWorldGen();
  EV = v; document.body.classList.toggle('view-energy', v === 'energy');
  try { sessionStorage.setItem('energle_view', v); } catch (e) {}
  evRedraw();
}
function evRedraw() {
  if (document.body.classList.contains('at-globe')) { try { globeSide(); } catch (e) {} }
  else if (target && document.getElementById('balance-card')) { renderStatBar(); renderFlowBar(false); renderCharts(); }
  evDecorate();
}
// the switch, above the base cards wherever they are
function evToggleHTML() {
  return '<div class="ev-toggle" role="group" aria-label="What the cards show">'
    + '<button type="button" data-ev="elec" aria-pressed="' + (EV === 'elec') + '">Electricity</button>'
    + '<button type="button" data-ev="energy" aria-pressed="' + (EV === 'energy') + '">All energy</button></div>';
}
function evDecorate() {
  const bc = document.getElementById('balance-card'); if (!bc) return;
  let t = document.querySelector('.ev-toggle');
  if (!t) { bc.insertAdjacentHTML('beforebegin', evToggleHTML()); t = document.querySelector('.ev-toggle');
    t.addEventListener('click', e => { const b = e.target.closest('[data-ev]'); if (b) evSet(b.dataset.ev); }); }
  t.querySelectorAll('[data-ev]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.ev === EV)));
  const labs0 = document.querySelectorAll('#balance-card .stat-label'), fl0 = document.querySelector('#balance-card .bc-flow > .stat-label');
  if (!EV_LABELS && labs0.length) EV_LABELS = { a: labs0[0].textContent, b: labs0[1] && labs0[1].textContent, f: fl0 && fl0.firstChild && fl0.firstChild.textContent };
  if (EV !== 'energy') {   // back to electricity: the static labels come back (the rest is redrawn by the game)
    if (EV_LABELS) { if (labs0[0]) labs0[0].textContent = EV_LABELS.a; if (labs0[1] && EV_LABELS.b) labs0[1].textContent = EV_LABELS.b;
      if (fl0 && fl0.firstChild && fl0.firstChild.nodeType === 3 && EV_LABELS.f) fl0.firstChild.textContent = EV_LABELS.f; }
    const n = document.getElementById('ev-note'); if (n) n.remove();
    return;
  }
  const info = target && ALL_DATA[target.name], y = info && info.latestYear;
  const set = (sel, txt) => { const e = document.querySelector(sel); if (e && e.textContent !== txt) e.textContent = txt; };
  const labs = document.querySelectorAll('#balance-card .stat-label');
  if (labs[0]) labs[0].textContent = 'Energy consumed';
  if (labs[1]) labs[1].textContent = 'Energy use per capita';
  const fl = document.querySelector('#balance-card .bc-flow > .stat-label');
  if (fl && fl.firstChild && fl.firstChild.nodeType === 3) fl.firstChild.textContent = 'Energy production & net trade — ';
  set('#bar-label', 'Energy mix (' + (y || '') + ')');
  set('#line-label', 'Energy use by ' + (CHART_VIEW === 'category' ? 'category' : 'source') + ' (TWh)');
  document.querySelectorAll('#flow-chart .fc-box *').forEach(n => { if (n.children.length) return;
    if (n.textContent === 'GENERATED') n.textContent = 'PRODUCED'; else if (n.textContent === 'DEMAND') n.textContent = 'CONSUMED'; });
  document.querySelectorAll('#legend-shared, #chart-right, #chart-left').forEach(root => {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let c;
    while ((c = w.nextNode())) if (c.textContent.includes('Other Fossil')) c.textContent = c.textContent.replace('Other Fossil', 'Oil'); });
  document.querySelectorAll('.og-src--in').forEach(e => { e.textContent = 'Sources: EIA, Ember, Energy Institute method'; });
  const note = document.getElementById('ev-note'), gap = info && info.woodGap;
  const host = document.getElementById('chart-right');
  if (gap && host && !note) host.insertAdjacentHTML('beforeend', '<p class="ev-note" id="ev-note">Excludes wood and charcoal, a large share of energy use here.</p>');
  else if (!gap && note) note.remove();
}
if (EV_ON()) document.addEventListener('DOMContentLoaded', () => {
  document.body.classList.add('ev-ready');
  // every redraw of the cards gets the switch, and the energy labels
  ['renderStatBar', 'renderFlowBar', 'renderCharts'].forEach(fn => {
    const f = window[fn]; if (typeof f !== 'function') return;
    window[fn] = function () { const r = f.apply(this, arguments); try { evDecorate(); } catch (e) {} return r; };
  });
  // the flow: in this view, what the country produces + what it trades = what it consumes
  const _flow = window.renderFlowBar;
  window.renderFlowBar = function () {
    const info = EV === 'energy' && target && ALL_DATA[target.name], d = info && info.years[info.latestYear];
    if (!d || d.Produced == null) return _flow.apply(this, arguments);
    const keep = d.Total; d.Total = d.Produced;
    try { return _flow.apply(this, arguments); } finally { d.Total = keep; }
  };
  // chart labels: Oil, not Other Fossil, in this view
  if (window.Chart) { const C = window.Chart; window.Chart = class extends C { constructor(ctx, cfg) {
    try { if (EV === 'energy') { (cfg.data.datasets || []).forEach(ds => { if (ds.label === 'Other Fossil') ds.label = 'Oil'; });
      if (Array.isArray(cfg.data.labels)) cfg.data.labels = cfg.data.labels.map(l => l === 'Other Fossil' ? 'Oil' : l); } } catch (e) {}
    super(ctx, cfg); } }; }
  let saved = null; try { saved = sessionStorage.getItem('energle_view'); } catch (e) {}
  if (saved === 'energy') { const go = () => { if (typeof ALL_DATA !== 'undefined' && ALL_DATA) evSet('energy'); else setTimeout(go, 200); }; setTimeout(go, 300); }
});

// ============================================================
//  FINAL ENERGY USE (test page: window.USE_CARD): a card under the charts with the country's final energy use (UN
//  Energy Statistics, data/usage.json, scripts/build_usage.py), two ways that add up to the same total. Sources: fuels used
//  on site (oil, natural gas, coal, biomass) and what is made elsewhere (electricity, district heat). Applications:
//  industry, transport, homes, services, feedstocks. A flow links the two; ? buttons define final energy and each group.
//  Country vs world bars, a tile per part (the world's share beside it), and each part over time; pointing at a part
//  picks out its line. Daily, Archive and Explore (single countries).
// ============================================================
const UC_ON = () => globeOn() && !!window.USE_CARD;
const UC_SECTORS = [
  { k: 'Industry', c: '#5b6b82', tip: 'Factories, mines and construction',
    ic: '<path d="M3 20V11l5 3v-3l5 3v-3l5 3V5h3v15z"/><path d="M7 17h2M12 17h2M16.5 17h1.5"/>' },
  { k: 'Transport', c: '#d98a2b', tip: 'Road, rail, domestic flights and shipping (international trips not counted)',
    ic: '<path d="M4 15l1.6-4.6A2 2 0 0 1 7.5 9h9a2 2 0 0 1 1.9 1.4L20 15v3h-2M4 15v3h2M4 15h16"/><circle cx="8" cy="18" r="1.6"/><circle cx="16" cy="18" r="1.6"/>' },
  { k: 'Homes', c: '#c0567a', tip: 'Heating, hot water, cooking, cooling and appliances',
    ic: '<path d="M3.5 11.5L12 5l8.5 6.5"/><path d="M6 10v10h12V10"/><path d="M10 20v-5h4v5"/>' },
  { k: 'Services', c: '#3f95a8', tip: 'Offices, shops, schools, hospitals, farming and fishing',
    ic: '<rect x="5" y="4" width="14" height="16" rx="1.2"/><path d="M9 8h2M13 8h2M9 12h2M13 12h2M11 20v-3.5h2V20"/>' },
  { k: 'Feedstocks', c: '#9a7b5f', tip: 'Oil, gas and coal used as raw material, not burnt: plastics, fertiliser, asphalt',
    ic: '<path d="M9.5 3.5h5M10.5 3.5v6L5.3 18a2 2 0 0 0 1.7 3h10a2 2 0 0 0 1.7-3l-5.2-8.5v-6"/><path d="M7.4 15h9.2"/>' }
];
const UC_SOURCES = [
  { k: 'Oil', c: '#c0654a', g: 'f', tip: 'Petrol, diesel, jet fuel, heating oil, LPG, and oil for plastics and asphalt',
    ic: '<path d="M12 3.5c3 4 5.5 7 5.5 10.2a5.5 5.5 0 0 1-11 0C6.5 10.5 9 7.5 12 3.5z"/><path d="M9.3 14.5a2.8 2.8 0 0 0 2.2 2.4"/>' },
  { k: 'Natural gas', c: '#e8925a', g: 'f', tip: 'Burnt in boilers, stoves, factories and vehicles, or made into fertiliser',
    ic: '<path d="M12 3c.8 3.4 5 5.6 5 10a5 5 0 0 1-10 0c0-2.4 1.2-4 2.5-5 .2 1.6 1 2.6 2 3 .3-2.6 0-5.4.5-8z"/>' },
  { k: 'Coal', c: '#4a4a4a', g: 'f', tip: 'Coal, coke and peat, mostly in steel and cement',
    ic: '<path d="M3.5 17.5l2.8-5.2 4 .9 2.2-4.2 4.2 1.6 3.8 6.9-3 2.5H6.5z"/><path d="M10.3 13.2l2.2 3.8M16.7 10.6l-1.2 5.9"/>' },
  { k: 'Electricity', c: '#3d6fd8', g: 'd', tip: 'Made from the mix shown in the game, delivered by the grid',
    ic: '<path d="M13 3L5.5 13.5H11L10 21l8-11h-5.5z"/>' },
  { k: 'Biomass', c: '#a0724a', g: 'f', tip: 'Wood, charcoal, crop waste, biofuels, biogas and waste, plus solar and geothermal heat used directly',
    ic: '<path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14"/><path d="M5 19c3-4 6-7 10-9"/>' },
  { k: 'District heat', c: '#8e5bb8', g: 'd', tip: 'Made in central plants (gas, coal, biomass, geothermal) and piped to buildings',
    ic: '<path d="M8 3.5c-1.4 1.8 1.4 3.4 0 5.3s0 3.2 0 3.2M12 3.5c-1.4 1.8 1.4 3.4 0 5.3s0 3.2 0 3.2M16 3.5c-1.4 1.8 1.4 3.4 0 5.3s0 3.2 0 3.2"/><rect x="4.5" y="15.5" width="15" height="4.5" rx="1"/>' }
];
const UC_SRC_ORDER = [0, 1, 2, 4, 3, 5];   // fuels used on site, then electricity and district heat (made elsewhere)
const ucFeText = () => '<p class="uc-fe-def"><b>Final energy</b> Energy as it reaches users (fuel in the tank, gas in the boiler, power at the socket, heat from the pipe), after what is lost making electricity, heat and petrol, and what the energy industry uses itself.</p>';
// Electricity, from generation to use (UN electricity balance): why the card's electricity is below the generation above.
function ucElecBridge(info) {
  // trade is shown net, as on the electricity cards: generated + net imports = what the country has to use (Ember's "demand")
  const e = info && info.elec; if (!e || !(e.gen > 0)) return '';
  const net = e.imp - e.exp, supply = e.gen + Math.max(net, 0), tw = v => v / supply * 100;
  const parts = [
    ['Consumed by users', e.final, '#3d6fd8'],
    ['Grid losses', e.losses, '#b9b9b3'],
    ['Power plants’ own use', e.plants, '#8f8f88'],
    ['Rest of the energy industry', e.industry + e.heat, '#6c6c65'],
    ['Net exports', Math.max(-net, 0), '#e3a06c'],
    ['Unaccounted', e.rest > 0 ? e.rest : 0, 'repeating-linear-gradient(135deg,#d8d8d2 0 3px,#f4f4f0 3px 6px)'],
  ].filter(x => x[1] > supply * 0.002);
  const pct = v => ucPct(v / supply);
  return '<div class="uc-eb"><p class="uc-eb-in"><b class="uc-eb-t">Electricity' + (e.differs ? '<span class="uc-ast" aria-hidden="true">*</span>' : '') + '</b>'
    + '<span>' + e.y + ' (UN): generated <strong>' + ucFmt(e.gen) + '</strong></span>'
    + (net > supply * 0.002 ? '<span>+ net imports <strong>' + ucFmt(net) + '</strong></span>' : '') + '</p>'
    + '<div class="uc-eb-bar">' + parts.map(x => '<span style="width:' + tw(x[1]).toFixed(2) + '%;background:' + x[2] + '" title="' + x[0] + ': ' + ucFmt(x[1]) + ' (' + pct(x[1]) + ')"></span>').join('') + '</div>'
    + '<ul class="uc-eb-k">' + parts.map(x => '<li><i style="background:' + x[2] + '"></i>' + x[0] + ' <strong>' + ucFmt(x[1]) + '</strong> <em>' + pct(x[1]) + '</em></li>').join('') + '</ul>'
    + (e.rest < -supply * 0.02 ? '<p class="uc-eb-n">Users are reported to consume ' + ucFmt(-e.rest) + ' more than the balance accounts for.</p>' : '')
    + (e.differs ? '<p class="uc-eb-d"><span class="uc-ast">*</span> For ' + e.y + ', the UN’s electricity figures here differ from the electricity data in the cards above (Ember): simply different data, not all sources agree.</p>' : '')
    + '</div>';
}
let UC_DATA = null, UC_MODE = 's', UC_CHART = null, UC_LOADING = null, UC_FE_OPEN = false, UC_DEF_OPEN = false;
function ucLoad() {
  if (UC_DATA) return Promise.resolve(UC_DATA);
  if (!UC_LOADING) UC_LOADING = fetch('data/usage.json').then(r => r.json()).then(raw => {
    const world = raw.__world__; delete raw.__world__;
    UC_DATA = { by: Object.fromEntries(Object.entries(raw).map(([k, v]) => [DISPLAY_NAMES[k] || k, v])), world };
    return UC_DATA;
  });
  return UC_LOADING;
}
// Units (the card's own menu, remembered). The data is in TWh; per person in MWh.
//   1 TWh = 3.6 PJ · 1 Mtoe = 11.63 TWh · 1 boe = 1.7 MWh (6.12 GJ)
const ucNum = (v, d) => v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const ucSig = v => v >= 100 ? ucNum(v, 0) : v >= 10 ? ucNum(v, 1) : ucNum(v, 2);
const UC_UNITS = {
  twh:  { label: 'TWh', name: 'Terawatt-hours',
          tot: t => t >= 1000 ? ucSig(t / 1000) + ' PWh' : ucSig(t) + ' TWh', per: m => ucSig(m) + ' MWh',
          axis: big => big >= 1000 ? ['PWh', 1 / 1000] : ['TWh', 1], note: '1 TWh = a billion kWh, the unit of the electricity cards' },
  pj:   { label: 'PJ', name: 'Joules',
          tot: t => { const pj = t * 3.6; return pj >= 1000 ? ucSig(pj / 1000) + ' EJ' : ucSig(pj) + ' PJ'; }, per: m => ucSig(m * 3.6) + ' GJ',
          axis: big => big * 3.6 >= 1000 ? ['EJ', 3.6 / 1000] : ['PJ', 3.6], note: '1 EJ = 1,000 PJ ≈ 278 TWh, the unit of most energy statistics' },
  mtoe: { label: 'Mtoe', name: 'Tonnes of oil equivalent',
          tot: t => { const m = t / 11.63; return m >= 1 ? ucSig(m) + ' Mtoe' : ucSig(m * 1000) + ' ktoe'; }, per: m => ucSig(m / 11.63) + ' toe',
          axis: big => big / 11.63 >= 1 ? ['Mtoe', 1 / 11.63] : ['ktoe', 1000 / 11.63], note: '1 Mtoe = the energy in a million tonnes of oil ≈ 11.6 TWh' },
  boe:  { label: 'boe/d', name: 'Barrels of oil equivalent a day',
          tot: t => { const d = t * 1e6 / 1.7 / 365; return d >= 1e6 ? ucSig(d / 1e6) + 'M boe/d' : d >= 1e3 ? ucSig(d / 1e3) + 'k boe/d' : ucSig(d) + ' boe/d'; },
          per: m => ucSig(m / 1.7) + ' boe',
          axis: big => big * 1e6 / 1.7 / 365 >= 1e6 ? ['M boe/d', 1e6 / 1.7 / 365 / 1e6] : ['k boe/d', 1e6 / 1.7 / 365 / 1e3], note: 'the energy in that many barrels of oil, every day, as on the Fuel Trade card' },
};
let UC_UNIT = (() => { try { const u = localStorage.getItem('energle_fe_unit'); return UC_UNITS[u] ? u : 'twh'; } catch (e) { return 'twh'; } })();
const ucFmt = t => UC_UNITS[UC_UNIT].tot(t || 0);
const ucPct = s => s > 0 && s < 0.01 ? '<1%' : Math.round(s * 100) + '%';
function ucPop(name) {   // people, from the electricity data (demand ÷ demand per person)
  const i = ALL_DATA[name]; if (!i || !i.latestDpc) return 0;
  const d = i.years[i.latestYear] || {}; return d.Demand ? d.Demand * 1e6 / i.latestDpc : 0;
}
// Groups (a continent, a bloc, a trait, the World): the members' final energy added up, like the electricity cards.
// Each year sums every member (a member whose data stops earlier keeps its latest year, as globeAggregate does). The latest
// year is the one most members have; its flow sums the members' flows (scaled to that year by application), and the tiles
// are read off that same flow, so every figure in the card agrees.
const UC_AGG = {};
function ucInfo(t) {
  if (!t || !UC_DATA) return null;
  if (UC_DATA.by[t.name]) return UC_DATA.by[t.name];
  const a = ALL_DATA[t.name], rid = a && String(a.iso3 || '').startsWith('R_') ? a.iso3.slice(2) : null;
  if (!rid || typeof groupOf !== 'function') return null;
  if (UC_AGG[rid]) return UC_AGG[rid];
  const mem = COUNTRIES.filter(groupOf(rid).test).map(c => UC_DATA.by[c.name]).filter(Boolean);
  if (!mem.length) return null;
  const cnt = {}; mem.forEach(m => { cnt[m.latestYear] = (cnt[m.latestYear] || 0) + 1; });
  const latest = +Object.entries(cnt).sort((x, y) => y[1] - x[1] || y[0] - x[0])[0][0];
  const first = Math.min(...mem.map(m => Math.min(...Object.keys(m.years).map(Number))));
  const years = {};
  for (let y = first; y <= latest; y++) {
    const o = { e: [0, 0, 0, 0, 0], s: [0, 0, 0, 0, 0, 0] };
    mem.forEach(m => { const d = m.years[y] || (y > m.latestYear ? m.years[m.latestYear] : null); if (!d) return;
      d.e.forEach((v, i) => { o.e[i] += v; }); d.s.forEach((v, i) => { o.s[i] += v; }); });
    years[y] = o;
  }
  const flow = [0, 1, 2, 3, 4].map(() => [0, 0, 0, 0, 0, 0]);
  mem.forEach(m => { if (!m.flow) return;
    const ly = m.years[String(m.latestYear)].e, ty = (m.years[latest] || m.years[String(m.latestYear)]).e;
    m.flow.forEach((row, i) => { const k = ly[i] > 0 ? ty[i] / ly[i] : 0; row.forEach((v, j) => { flow[i][j] += v * k; }); }); });
  years[latest] = { e: flow.map(r => r.reduce((x, y) => x + y, 0)), s: [0, 1, 2, 3, 4, 5].map(j => flow.reduce((x, r) => x + r[j], 0)) };
  const eb = { y: latest, gen: 0, imp: 0, exp: 0, plants: 0, industry: 0, heat: 0, losses: 0, final: 0, rest: 0 };
  mem.forEach(m => { if (m.elec) Object.keys(eb).forEach(k => { if (k !== 'y') eb[k] += m.elec[k] || 0; }); });
  return (UC_AGG[rid] = { iso3: null, latestYear: latest, years, flow, elec: eb.gen > 0 ? eb : null, group: true, n: mem.length });
}
let UC_WORLD_POP = 0;
function ucWorldPop() {   // people in all the countries the card covers
  if (!UC_WORLD_POP) UC_WORLD_POP = Object.keys(UC_DATA.by).reduce((a, n) => a + ucPop(n), 0);
  return UC_WORLD_POP;
}
function ucIcon(sec) { return '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + sec.ic + '</svg>'; }
// The flow: sources on the left, applications on the right, each band as wide as the TWh going from one to the other.
function ucFlowSVG(m, W, Hbox) {
  const H = Math.max(W < 420 ? 230 : 250, Math.min(460, Hbox || (W < 420 ? 250 : 290))), NW = 9, GAP = W < 420 ? 5 : 6, LW = W < 420 ? 104 : 116, RW = W < 420 ? 104 : 118;
  const x0 = LW, x1 = W - RW - NW;
  const sv = UC_SOURCES.map((_, j) => m.reduce((t, r) => t + r[j], 0)), av = m.map(r => r.reduce((t, v) => t + v, 0));
  const tot = sv.reduce((t, v) => t + v, 0) || 1;
  const place = (vals, order, brk) => {   // node heights (a sliver for any used part); a wider gap before index brk
    const ord = order || vals.map((_, i) => i), used = ord.filter(i => vals[i] > 0);
    const extra = brk != null && used.some(i => i === brk) && used[0] !== brk ? GAP * 2.5 : 0;
    const room = H - GAP * Math.max(0, used.length - 1) - extra;
    const hs = vals.map(v => v > 0 ? Math.max(2, v / tot * room) : 0), k = room / (hs.reduce((t, h) => t + h, 0) || 1);
    const out = vals.map(() => ({ y: 0, h: 0 })); let y = 0;
    ord.forEach(i => { if (!(vals[i] > 0)) return; if (i === brk && y > 0) y += extra; out[i] = { y, h: hs[i] * k }; y += hs[i] * k + GAP; });
    return out;
  };
  const firstMade = UC_SRC_ORDER.find(j => UC_SOURCES[j].g === 'd' && sv[j] > 0);
  const S = place(sv, UC_SRC_ORDER, firstMade), A = place(av), sOff = S.map(n => n.y), aOff = A.map(n => n.y);
  const pct = v => ucPct(v / tot), xm = (x0 + NW + x1) / 2;
  let links = '';
  UC_SRC_ORDER.forEach(j => { const src = UC_SOURCES[j]; m.forEach((row, i) => {
    const v = row[j]; if (!(v > 0)) return;
    const hs = sv[j] ? v / sv[j] * S[j].h : 0, ha = av[i] ? v / av[i] * A[i].h : 0;
    const ya = sOff[j], yb = aOff[i]; sOff[j] += hs; aOff[i] += ha;
    const L = x0 + NW, R = x1;
    links += '<path class="uf-l" data-s="' + j + '" data-a="' + i + '" data-v="' + v + '" data-ps="' + (sv[j] ? v / sv[j] : 0) + '" data-pa="' + (av[i] ? v / av[i] : 0) + '" data-pt="' + v / tot + '" fill="' + src.c + '" d="M' + L + ',' + ya.toFixed(1) + 'C' + xm + ',' + ya.toFixed(1) + ' ' + xm + ',' + yb.toFixed(1) + ' ' + R + ',' + yb.toFixed(1)
      + 'L' + R + ',' + (yb + ha).toFixed(1) + 'C' + xm + ',' + (yb + ha).toFixed(1) + ' ' + xm + ',' + (ya + hs).toFixed(1) + ' ' + L + ',' + (ya + hs).toFixed(1) + 'Z"'
      + ' aria-label="' + src.k + ' to ' + UC_SECTORS[i].k + ': ' + ucFmt(v) + '"></path>';   // the box comes from ucLinkTip
  }); });
  const labels = (nodes, vals, list, side) => {     // labels beside the nodes, nudged apart so none overlap
    const items = nodes.map((n, i) => ({ i, c: n.y + n.h / 2, n, v: vals[i] })).filter(o => o.v > 0).sort((a, b) => a.c - b.c);
    const MIN = 15; for (let k = 1; k < items.length; k++) items[k].c = Math.max(items[k].c, items[k - 1].c + MIN);
    const over = items.length ? items[items.length - 1].c - (H - 6) : 0;
    if (over > 0) { items[items.length - 1].c -= over; for (let k = items.length - 2; k >= 0; k--) items[k].c = Math.min(items[k].c, items[k + 1].c - MIN); }
    return items.map(o => {
      const x = side === 'l' ? x0 - 7 : x1 + NW + 7, anchor = side === 'l' ? 'end' : 'start';
      return '<text class="uf-t" x="' + x + '" y="' + (o.c + 4).toFixed(1) + '" text-anchor="' + anchor + '" data-' + side + '="' + o.i + '">'
        + (side === 'l' ? '<tspan class="uf-n">' + list[o.i].k + '</tspan> <tspan class="uf-p">' + pct(o.v) + '</tspan>'
                        : '<tspan class="uf-p">' + pct(o.v) + '</tspan> <tspan class="uf-n">' + list[o.i].k + '</tspan>') + '</text>';
    }).join('');
  };
  const nodes = (ns, vals, list, x, side) => ns.map((n, i) => vals[i] > 0
    ? '<rect class="uf-node" data-' + side + '="' + i + '" x="' + x + '" y="' + n.y.toFixed(1) + '" width="' + NW + '" height="' + Math.max(1, n.h).toFixed(1) + '" rx="2" fill="' + list[i].c + '"><title>' + list[i].k + ': ' + ucFmt(vals[i]) + '</title></rect>' : '').join('');
  return '<svg class="uf-svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="Where each source of final energy goes">'
    + '<g class="uf-links">' + links + '</g>' + nodes(S, sv, UC_SOURCES, x0, 'l') + nodes(A, av, UC_SECTORS, x1, 'r')
    + labels(S, sv, UC_SOURCES, 'l') + labels(A, av, UC_SECTORS, 'r') + '</svg>';
}
function ucFlowDraw() {
  const box = document.getElementById('uc-flow'), info = ucInfo(target);
  if (!box || !info || !info.flow) return;
  // the flow fills its box: as wide as the column, and as tall as the row the cards beside it make (see the CSS)
  const W = Math.round(box.clientWidth), H = Math.round(box.clientHeight), key = W + 'x' + H;
  if (!W || key === box.dataset.k) return;
  box.dataset.k = key; box.innerHTML = ucFlowSVG(info.flow, W, H);
}
function ucPick(kind, i) {   // light up one source or application: its bands in the flow, its line in the chart
  const card = document.getElementById('use-card'); if (!card) return;
  if (UC_LINK_ON) { UC_LINK_ON = false; hideTooltip(); }
  card.classList.toggle('uf-on', i != null);
  card.querySelectorAll('.uf-l').forEach(p => p.classList.toggle('is-hi', i != null && p.dataset[kind] === String(i)));
  card.querySelectorAll('[data-l],[data-r]').forEach(n => n.classList.toggle('is-hi', i != null && ((kind === 's' && n.dataset.l === String(i)) || (kind === 'a' && n.dataset.r === String(i)))));
  const mine = (UC_MODE === 's') === (kind === 's');
  if (UC_CHART) { UC_CHART.$pick = mine ? i : null;
    UC_CHART.data.datasets.forEach(d => { const on = i == null || !mine || i === d._i; d.borderColor = on ? d._c : d._c + '2e'; d.borderWidth = mine && i === d._i ? 2.8 : 2; });
    UC_CHART.update('none'); }
}
let UC_RO = null, UC_TIP_ON = false;
// the chart's tooltip: the main chart's box (year, total, then each line with its value and share), in the card's unit
function ucTooltip(context) {
  const model = context.tooltip, ch = context.chart;
  if (model.opacity === 0) { UC_TIP_ON = false; hideTooltip(); return; }
  UC_TIP_ON = true;
  const unit = ch.$unit || '', fmt = v => ucSig(v) + ' ' + unit, i = model.dataPoints[0].dataIndex;
  const total = ch.data.datasets.reduce((t, d) => t + (d.data[i] || 0), 0);
  const row = (c, l, v, b) => { const p = total > 0 ? v / total * 100 : 0;
    return '<div class="tt-row' + (b ? ' tt-row--b' : '') + '"><span class="tt-sw" style="background:' + c + '"></span><span class="tt-l">' + l + '</span>'
      + '<span class="tt-v">' + fmt(v) + '</span><span class="tt-p">' + (p < 10 ? p.toFixed(1) : Math.round(p)) + '%</span></div>'; };
  let html = '<div class="tt-h">' + model.title[0] + '</div>' + row('#1a1a1a', 'Final energy used', total, true) + '<div class="tt-sep"></div><div>';
  model.dataPoints.filter(dp => (dp.parsed.y || 0) > 0).sort((a, b) => b.parsed.y - a.parsed.y)
    .forEach(dp => { html += row(dp.dataset._c, dp.dataset.label, dp.parsed.y, false); });
  showTooltip(html + '</div>', ch.canvas, model.caretX, model.caretY);
}
// the game hides its tooltip whenever the mouse leaves the main charts: not while it is on this card's chart
document.addEventListener('DOMContentLoaded', () => {
  const _hide = window.hideTooltip; if (typeof _hide !== 'function') return;
  window.hideTooltip = function () { if (UC_TIP_ON || UC_LINK_ON) return; return _hide.apply(this, arguments); };
  document.addEventListener('mousemove', e => { if (UC_TIP_ON && !e.target.closest('#uc-canvas')) { UC_TIP_ON = false; _hide(); } });
});
function ucPanelFit() {   // the panel covers the left column; if its list is taller (small phones), the column grows
  const left = document.querySelector('#use-card .uc-left'), pn = document.getElementById('uc-panel'); if (!left || !pn) return;
  left.style.minHeight = '';
  if (UC_DEF_OPEN && pn.scrollHeight > left.clientHeight) left.style.minHeight = pn.scrollHeight + 'px';
}
// end labels on the chart, like the game's main line chart: the name and latest value beside each line
const UC_END_LABELS = {
  id: 'ucEndLabels',
  afterDatasetsDraw(chart) {
    const narrow = window.innerWidth <= 600, ctx = chart.ctx, area = chart.chartArea, items = [];
    chart.data.datasets.forEach((d, i) => {
      const meta = chart.getDatasetMeta(i); if (meta.hidden) return;
      const pt = meta.data[meta.data.length - 1]; if (!pt) return;
      const { x, y } = pt.getProps(['x', 'y'], true); if (!isFinite(y)) return;
      items.push({ d, x, y, ly: y, v: d.data[d.data.length - 1] || 0 });
    });
    items.sort((a, b) => a.y - b.y);
    if (typeof spreadLabels === 'function') spreadLabels(items, narrow ? 12 : 14, area.top + 2, area.bottom + 4);
    const font = getComputedStyle(document.body).fontFamily, dimAll = chart.$pick != null;
    ctx.save();
    items.forEach(it => {
      const dim = dimAll && chart.$pick !== it.d._i, col = dim ? it.d._c + '40' : it.d._c;
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(it.x, it.y, 3, 0, Math.PI * 2); ctx.fill();
      const lx = it.x + 8;
      if (Math.abs(it.ly - it.y) > 2) { ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.globalAlpha = .5; ctx.beginPath(); ctx.moveTo(it.x + 4, it.y); ctx.lineTo(lx - 2, it.ly); ctx.stroke(); ctx.globalAlpha = 1; }
      ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      const val = ucSig(it.v);
      if (narrow) { ctx.font = '600 10.5px ' + font; ctx.fillStyle = dim ? '#c8c8c4' : col; ctx.fillText(val, lx, it.ly); }
      else {
        ctx.font = '600 11px ' + font; ctx.fillStyle = dim ? '#c8c8c4' : col; ctx.fillText(it.d.label, lx, it.ly);
        const w = ctx.measureText(it.d.label).width;
        ctx.font = '400 11px ' + font; ctx.fillStyle = dim ? '#d4d4d0' : '#888'; ctx.fillText(' ' + val, lx + w, it.ly);
      }
    });
    ctx.restore();
  },
};
function ucEndRoom(sets) {
  const narrow = window.innerWidth <= 600, ctx = document.createElement('canvas').getContext('2d'), font = getComputedStyle(document.body).fontFamily;
  let w = 0;
  sets.forEach(d => { const v = ucSig(d.data[d.data.length - 1] || 0);
    ctx.font = '600 11px ' + font; const nm = narrow ? 0 : ctx.measureText(d.label).width;
    ctx.font = (narrow ? '600 10.5px ' : '400 11px ') + font; w = Math.max(w, nm + ctx.measureText(' ' + v).width); });
  return Math.ceil(w) + 14;
}
function ucRender() {
  const legend = document.getElementById('legend-shared');
  let card = document.getElementById('use-card');
  const info = ucInfo(target);
  if (!legend || !info) { if (card) card.remove(); if (UC_CHART) { UC_CHART.destroy(); UC_CHART = null; } return; }
  if (!card) {
    legend.insertAdjacentHTML('afterend', '<section id="use-card" aria-label="Final energy use"></section>');
    card = document.getElementById('use-card');
    card.addEventListener('click', e => {
      if (e.target.closest('.uc-title')) {   // the definition of final energy unfolds under the title
        UC_FE_OPEN = !UC_FE_OPEN; card.querySelector('.uc-fe').classList.toggle('is-open', UC_FE_OPEN);
        card.querySelector('.uc-title').setAttribute('aria-expanded', UC_FE_OPEN); return;
      }
      if (e.target.closest('.uc-defs, .uc-px')) {   // the groups' definitions slide in from the left, over the flow
        UC_DEF_OPEN = e.target.closest('.uc-px') ? false : !UC_DEF_OPEN; ucPanelFit();
        card.querySelector('.uc-panel').classList.toggle('is-open', UC_DEF_OPEN);
        card.querySelector('.uc-panel').setAttribute('aria-hidden', !UC_DEF_OPEN);
        card.querySelector('.uc-defs').setAttribute('aria-expanded', UC_DEF_OPEN); return;
      }
      const b = e.target.closest('[data-uc]'); if (b && b.dataset.uc !== UC_MODE) { UC_MODE = b.dataset.uc; ucRender(); }
    });
    card.addEventListener('change', e => {
      if (!e.target.matches('.uc-unit select')) return;
      UC_UNIT = e.target.value; try { localStorage.setItem('energle_fe_unit', UC_UNIT); } catch (x) {}
      ucRender();
    });
    card.addEventListener('mouseover', e => {
      const t = e.target.closest('[data-si],[data-l],[data-r],.uf-l');
      if (!t) return ucPick(null);
      if (t.dataset.si != null) return ucPick(UC_MODE === 's' ? 's' : 'a', +t.dataset.si);
      if (t.dataset.l != null) return ucPick('s', +t.dataset.l);
      if (t.dataset.r != null) return ucPick('a', +t.dataset.r);
      ucLinkTip(t, e);
    });
    card.addEventListener('mousemove', e => { const t = e.target.closest('.uf-l'); if (t) ucLinkTip(t, e); });
    card.addEventListener('mouseleave', () => ucPick(null));
    card.addEventListener('click', e => { const t = e.target.closest('.uf-l'); if (t) ucLinkTip(t, e); });   // phones: a tap
  }
  const U = UC_UNITS[UC_UNIT];
  const src = UC_MODE === 's', y = String(info.latestYear), d = info.years[y][UC_MODE];
  const secs = (src ? UC_SOURCES : UC_SECTORS).slice(0, d.length), total = d.reduce((a, b) => a + b, 0);
  const wy = UC_DATA.world[y] || UC_DATA.world[Object.keys(UC_DATA.world).sort().pop()];
  const w = wy[UC_MODE], wt = w.reduce((a, b) => a + b, 0);
  const pop = ucPop(target.name), per = pop ? total * 1e6 / pop : 0, wper = ucWorldPop() ? wt * 1e6 / ucWorldPop() : 0;
  const gap = info.notReported || [], gapHere = src ? [] : gap;
  const sh = d.map(v => total ? v / total : 0), ws = w.map(v => wt ? v / wt : 0);
  const top = sh.indexOf(Math.max(...sh));
  const tile = i => {
    const s = secs[i], nr = gapHere.includes(i), diff = Math.round((sh[i] - ws[i]) * 100);
    return '<div class="uc-tile' + (i === top ? ' is-top' : '') + '" data-si="' + i + '" style="--c:' + s.c + '" title="' + s.tip + '">'
      + '<span class="uc-ic">' + ucIcon(s) + '</span>'
      + '<span class="uc-pc">' + (nr ? '—' : ucPct(sh[i])) + '</span>'
      + '<span class="uc-nm">' + s.k + '</span>'
      + '<span class="uc-wd">' + (nr ? 'not reported' : '<span>World avg</span> <span>' + ucPct(ws[i]) + (Math.abs(diff) >= 3 ? ' <b class="' + (diff > 0 ? 'up' : 'dn') + '">' + (diff > 0 ? '▲' : '▼') + '</b>' : '') + '</span>') + '</span></div>';
  };
  const grp = (cap, idx, cls) => '<div class="uc-tg ' + cls + '" style="--n:' + idx.length + '"><span class="uc-tgl">' + cap + '</span><div class="uc-tiles">' + idx.map(tile).join('') + '</div></div>';
  const tiles = src
    ? '<div class="uc-tgs">' + grp('Fuels used on site', UC_SRC_ORDER.filter(j => UC_SOURCES[j].g === 'f'), 'is-f') + grp('Made elsewhere', UC_SRC_ORDER.filter(j => UC_SOURCES[j].g === 'd'), 'is-d') + '</div>'
    // applications in three plain groups, laid out like the sources' two, so the switch doesn't change the card's height
    : '<div class="uc-tgs">' + grp('Making things', [0, 4], 'is-m') + grp('Moving', [1], 'is-v') + grp('Buildings', [2, 3], 'is-b') + '</div>';
  const defs = (src ? UC_SRC_ORDER.map(j => UC_SOURCES[j]) : UC_SECTORS)
    .map(x => '<li><span class="uc-hi" style="--c:' + x.c + '">' + ucIcon(x) + '</span><span><b>' + x.k + '</b>' + x.tip + '</span></li>').join('');
  const chev = '<svg class="uc-chev" viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M2.5 4.5L6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const big = Math.max(...Object.values(info.years).map(v => v[UC_MODE].reduce((a, b) => Math.max(a, b), 0)));
  const [cu, cf] = U.axis(big);
  // the section's heading (same as the electricity section's), with the card's controls; the card itself below it
  card.innerHTML = '<div class="uc-head sec-h">'
    + '<button type="button" class="uc-title" aria-expanded="' + UC_FE_OPEN + '" aria-controls="uc-fe"><span class="sec-t">Final energy — ' + y + '</span>' + chev + '<span class="sec-d">what reaches users</span></button><span class="sec-line" aria-hidden="true"></span>'
    + '<div class="uc-ctrls"><div class="uc-switch" role="group" aria-label="Sources or applications">'
    + '<button type="button" data-uc="s" aria-pressed="' + src + '">Sources</button>'
    + '<button type="button" data-uc="e" aria-pressed="' + !src + '">Applications</button></div>'
    + '<button type="button" class="uc-defs" aria-expanded="' + UC_DEF_OPEN + '" aria-controls="uc-panel" aria-label="Definitions">'
    + '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M6 2.5v11M3.3 5.5h1M3.3 8h1M3.3 10.5h1"/></svg><span class="uc-defs-t">Definitions</span></button></div>'
    + '<label class="uc-unit" title="' + U.name + '"><span class="sr-only">Unit</span><select aria-label="Unit">'
    + Object.entries(UC_UNITS).map(([k, u]) => '<option value="' + k + '"' + (k === UC_UNIT ? ' selected' : '') + '>' + u.label + '</option>').join('') + '</select>'
    + '<svg viewBox="0 0 12 12" width="9" height="9" aria-hidden="true"><path d="M2.5 4.5L6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></label></div>'
    + '<div class="uc-box"><div class="uc-fe' + (UC_FE_OPEN ? ' is-open' : '') + '" id="uc-fe"><div class="uc-fe-in"><div class="uc-fe-box">' + ucFeText() + ucElecBridge(info) + '</div></div></div>'
    + '<div class="uc-body"><div class="uc-left">'
    + '<aside class="uc-panel' + (UC_DEF_OPEN ? ' is-open' : '') + '" id="uc-panel" aria-hidden="' + !UC_DEF_OPEN + '">'
    + '<div class="uc-ph"><span>' + (src ? 'Sources' : 'Applications') + '</span><button type="button" class="uc-px" aria-label="Close">×</button></div>'
    + '<ul class="uc-hl">' + defs + '</ul><p class="uc-hn">World avg: all countries in the game added up.</p></aside>'
    + '<div class="uc-stats"><div class="bc-stat"><span class="stat-label">Final energy used</span><span class="uc-big">' + ucFmt(total) + '</span>'
    + '<span class="bc-world bc-world--gen">World Avg: ' + ucFmt(wt / Math.max(1, Object.keys(UC_DATA.by).length)) + '</span></div>'
    + (per ? '<div class="bc-stat"><span class="stat-label">Per person, each year</span><span class="uc-big">' + U.per(per) + '</span>'
      + '<span class="bc-world bc-world--dem">World Avg: ' + U.per(wper) + '</span></div>' : '') + '</div>'
    + '<div class="uc-flow" id="uc-flow"></div>'
    + (info.onlyElectricity ? '<p class="uc-note">Only electricity use is reported to the UN here: fuels such as petrol and gas are missing.</p>'
      : gap.length ? '<p class="uc-note">' + gap.map(i => UC_SECTORS[i].k).join(', ') + ' not reported to the UN</p>' : '')
    + '</div><div class="uc-right">' + tiles
    + '<p class="chart-label">' + (src ? 'Sources' : 'Applications') + ' over time (' + cu + ') — ' + Object.keys(info.years).sort()[0] + '–' + y + '</p><div class="uc-chart"><canvas id="uc-canvas"></canvas></div></div></div>'
    + '<p class="og-src og-src--in uc-src">Source: UN Energy Statistics Database (UNSD)</p></div>';
  if (typeof ucPlace === 'function') ucPlace();
  ucFlowDraw(); ucPanelFit(); if (typeof ucShadeMark === 'function') ucShadeMark();
  if (!UC_RO && window.ResizeObserver) { UC_RO = new ResizeObserver(() => ucFlowDraw()); }
  if (UC_RO) { UC_RO.disconnect(); UC_RO.observe(document.getElementById('uc-flow')); }
  if (UC_CHART) { UC_CHART.destroy(); UC_CHART = null; }
  const ys = Object.keys(info.years).sort(), cv = document.getElementById('uc-canvas');
  const sets = secs.map((s, i) => ({ label: s.k, _c: s.c, _i: i, data: ys.map(yy => gapHere.includes(i) ? null : +(info.years[yy][UC_MODE][i] * cf).toFixed(4)),
    borderColor: s.c, backgroundColor: s.c + '22', borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, pointBorderColor: '#fff', pointBorderWidth: 1.5,
    pointBackgroundColor: s.c, fill: false, cubicInterpolationMode: 'monotone' })).filter((ds, i) => !(d[i] <= 0 && ds.data.every(v => !v)));
  if (window.Chart && cv) UC_CHART = new Chart(cv, {
    type: 'line', data: { labels: ys, datasets: sets }, plugins: [UC_END_LABELS, HOVER_GUIDE],
    options: { responsive: true, maintainAspectRatio: false, animation: false,
      ...(IS_TOUCH ? { events: [] } : {}),                   // phones: taps, as on the main chart
      layout: { padding: { right: ucEndRoom(sets), top: 6 } },
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: { enabled: false, external: ucTooltip } },
      scales: {
        x: { grid: { display: false }, border: { color: '#e4e3df' }, ticks: { color: '#9a9a96', font: { size: 11 }, maxTicksLimit: 7, autoSkip: true, maxRotation: 0 } },
        y: { grid: { color: '#efeeea' }, border: { display: false }, ticks: { color: '#9a9a96', font: { size: 11 }, padding: 6, maxTicksLimit: 6 }, beginAtZero: true } } }
  });
  if (UC_CHART) { UC_CHART.$unit = cu; try { bindTapTooltip(UC_CHART); } catch (e) {} }
}
if (UC_ON()) document.addEventListener('DOMContentLoaded', () => {
  const f = window.renderCharts; if (typeof f !== 'function') return;
  window.renderCharts = function () { const r = f.apply(this, arguments); ucLoad().then(() => { try { ucRender(); } catch (e) {} }).catch(() => {}); return r; };
});


// ============================================================
//  FIRST NAME: TAKEN NAMES ARE REFUSED. The name box no longer suggests a real player's name (its old
//  example, "e.g. OscarV", was being typed in as is), and before the name is accepted it is claimed for this device:
//  a name another player already holds is refused, so nobody's results land under someone else's name. If the check
//  can't reach the server, the name is accepted as before.
// ============================================================
function nameGuard() {
  const modal = document.getElementById('username-modal'); if (!modal || modal.dataset.guard) return;
  modal.dataset.guard = '1';
  const input = modal.querySelector('#username-input'), err = modal.querySelector('#username-error'), btn = modal.querySelector('#username-confirm');
  if (!input || !btn) return;
  input.placeholder = 'e.g. SolarFox';
  let ok = '', busy = false;
  const check = async e => {
    const v = input.value.trim();
    if (ok && v === ok) return;                                  // already checked: let the game take the name
    if (v.length < 2 || v.length > 20 || !/^[a-zA-Z0-9_ .\-]+$/.test(v)) return;   // the game explains these
    e.preventDefault(); e.stopImmediatePropagation();
    if (busy) return; busy = true; btn.disabled = true; err.style.color = '#888'; err.textContent = 'Checking…';
    let r = null; try { r = await sbRpc('claim_name', { p_name: v, p_key: playerKey() }); } catch (x) {}
    busy = false; btn.disabled = false; err.style.color = '';
    if (r === 'other') { err.textContent = 'Someone already plays as “' + v + '”. Pick another name.'; input.focus(); return; }
    err.textContent = ''; ok = v; NAME_CLAIM = r === 'mine' ? 'mine' : NAME_CLAIM; btn.click();
  };
  btn.addEventListener('click', check, true);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') check(e); }, true);
}

// ============================================================
//  RESULTS GO OUT WITH THE BROWSER'S KEY. A name belongs to the browser that claimed it first (see nameClaim). Today's
//  result is sent through the database function submit_score, which checks that this browser holds the name before it
//  saves anything. If another browser holds it, the player is asked for a new name and the result is saved under that.
//  Until the database has submit_score, results go out the old way.
// ============================================================
async function nameTakenAsk(old) {
  try { localStorage.removeItem(LS_USERNAME_KEY); } catch (e) {}
  NAME_CLAIM = null;
  const p = ensureUsername();
  const note = document.querySelector('#username-modal p');
  if (note) note.textContent = 'Someone else already plays as “' + old + '” on another device. Pick a new name to save today’s result. You can change it again later in Stats.';
  return p;
}
document.addEventListener('DOMContentLoaded', () => {
  const _ins = window.sbInsert; if (typeof _ins !== 'function') return;
  window.sbInsert = async function (row) {
    let r;
    try {
      const res = await fetch(SUPABASE_URL + '/rest/v1/rpc/submit_score', { method: 'POST', headers: SB_HEADERS,
        body: JSON.stringify({ p_username: row.username, p_day: row.day, p_guesses: row.guesses, p_won: row.won, p_key: playerKey() }) });
      if (res.status === 404) return _ins.apply(this, arguments);       // the database doesn't have it yet: the old way
      if (!res.ok) return false;                                          // tried again on the next visit
      r = await res.json();
    } catch (e) { return false; }
    STREAKS_P = null;
    if (r === 'ok' || r === 'dup') { NAME_CLAIM = 'mine'; return true; }
    if (r === 'taken') {
      const n = await nameTakenAsk(row.username);
      return n ? window.sbInsert(Object.assign({}, row, { username: n })) : false;
    }
    return false;
  };
});

// ============================================================
//  ONE NAME, SEVERAL DEVICES (test page). A name belongs to the browser key that claimed it, so to play under the same
//  name on a phone and a laptop, the second browser takes the first one's key: Stats -> "Use on another device" shows
//  this browser's code, and the other browser enters the name and that code. The code is checked against the name
//  (claim_name answers 'mine' only for the key that holds it) before it is adopted. Also offered in the first-name
//  prompt and when a result comes back with the name taken.
// ============================================================
const dvFmt = k => (k || '').toUpperCase().match(/.{1,4}/g).join('-\u200b');   // may break after each dash
const dvRaw = v => (v || '').toLowerCase().replace(/[^0-9a-f]/g, '');
function showDeviceModal(onLinked) {
  if (document.getElementById('device-modal')) return;
  const name = getUsername(), code = dvFmt(playerKey());
  const modal = document.createElement('div'); modal.id = 'device-modal';
  modal.innerHTML = '<div class="st-backdrop"></div>'
    + '<div class="st-box rn-box dv-box" role="dialog" aria-modal="true" aria-labelledby="dv-title">'
    + '<div class="st-header"><span class="st-title" id="dv-title">Play on another device</span><button type="button" class="rn-x" aria-label="Close">×</button></div>'
    + '<div class="rn-body">'
    + (name && !onLinked ? '<p class="dv-h">This device’s code</p>'
      + '<p class="rn-note">To play as <b>' + escHtml(name) + '</b> on another device, open Stats there, tap “Use on another device” and enter your name and this code. Keep it private: anyone with it can play as you.</p>'
      + '<div class="dv-code"><code id="dv-mine">' + code + '</code><button type="button" class="dv-copy">Copy</button></div>'
      + '<hr class="dv-rule">' : '')
    + '<p class="dv-h">Have a code from another device?</p>'
    + '<p class="rn-note">Enter the name you play under there and its code. This device then plays under that name too.</p>'
    + '<input id="dv-name" class="dv-in" type="text" maxlength="20" autocomplete="off" spellcheck="false" placeholder="Your name">'
    + '<input id="dv-code" class="dv-in" type="text" maxlength="48" autocomplete="off" spellcheck="false" placeholder="Code from your other device">'
    + '<p class="rn-msg" id="dv-msg" aria-live="polite"></p>'
    + '<button type="button" class="rn-go" id="dv-go">Use this name here</button></div></div>';
  document.body.appendChild(modal);
  const msg = modal.querySelector('#dv-msg'), go = modal.querySelector('#dv-go');
  const close = () => { modal.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  modal.querySelector('.rn-x').addEventListener('click', close);
  modal.querySelector('.st-backdrop').addEventListener('click', close);
  const cp = modal.querySelector('.dv-copy');
  if (cp) cp.addEventListener('click', () => {
    const t = modal.querySelector('#dv-mine').textContent.replace(/\u200b/g, '');
    const done = () => { cp.textContent = 'Copied'; setTimeout(() => { cp.textContent = 'Copy'; }, 1500); };
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(done).catch(() => {
      const r = document.createRange(); r.selectNodeContents(modal.querySelector('#dv-mine')); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); });
  });
  const say = (t, ok) => { msg.textContent = t; msg.classList.toggle('is-ok', !!ok); };
  go.addEventListener('click', async () => {
    const n = modal.querySelector('#dv-name').value.trim(), k = dvRaw(modal.querySelector('#dv-code').value);
    if (n.length < 2) return say('Enter the name you play under.');
    if (k.length !== 32) return say('The code has 32 letters and numbers (dashes don’t matter).');
    if (k === dvRaw(playerKey()) && n === name) return say('That’s already this device.', true);
    go.disabled = true; say('Checking…', true);
    let r = null; try { r = await sbRpc('claim_name', { p_name: n, p_key: k }); } catch (e) {}
    go.disabled = false;
    if (r === 'other') return say('That code doesn’t match the name “' + n + '”.');
    if (r !== 'mine') return say('Couldn’t check the code. Try again in a moment.');
    try { localStorage.setItem(PLAYER_KEY_LS, k); } catch (e) {}
    NAME_CLAIM = 'mine'; MY_SCORES = null; STREAKS_P = null;
    close();
    if (onLinked) return onLinked(n);
    setUsername(n);
    try { loadPodium(); } catch (e) {}
    const st = document.getElementById('stats-modal'); if (st) showStatsModal(false);
  });
}
function deviceLinkInPrompt() {
  const modal = document.getElementById('username-modal'); if (!modal || modal.querySelector('.dv-link')) return;
  const btn = modal.querySelector('#username-confirm'); if (!btn) return;
  btn.insertAdjacentHTML('afterend', '<button type="button" class="rn-link dv-link dv-in-prompt">Already play on another device?</button>');
  modal.querySelector('.dv-link').addEventListener('click', () => showDeviceModal(n => {
    const input = modal.querySelector('#username-input'); if (!input) return;
    input.value = n; btn.click();                         // the name is now this device's: the prompt takes it as usual
  }));
}

// ============================================================
//  CARD DATES (test page). Every year in a card's title is bold; a year that is not the year of the electricity data
//  (Ember, the cards at the top) turns matte dark red with a "!", so a card from another year is never mistaken for the
//  same moment. Applied to whatever the game draws (base cards, clue cards, final energy), whenever it draws it.
// ============================================================
const DATE_SEL = '.chart-label, .stat-label, .ic-title, .uc-eb-in, .uc-eb-cmp, .sec-t';
const YR = '(?:19[89]\\d|20[0-4]\\d)';
const RE_RANGE_OR_YEAR = new RegExp('\\b(' + YR + ')(?:\\s*[–-]\\s*(' + YR + '))?\\b|long-term avg', 'g');   // a climate average is a date too
function markDates() {
  const app = document.getElementById('app'); if (!app || typeof target === 'undefined' || !target) return;
  const info = ALL_DATA && ALL_DATA[target.name], ref = info && String(info.latestYear);
  // two sections, each with a heading: electricity (the cards from Ember) and final energy (its own card)
  const bc = document.getElementById('balance-card');
  if (bc && ref) {
    let h = document.getElementById('sec-elec');
    if (!h || h.nextElementSibling !== bc) {
      if (h) h.remove();
      bc.insertAdjacentHTML('beforebegin', '<div class="sec-h" id="sec-elec"><span class="sec-t">Electricity — ' + ref + '</span><span class="sec-d">generated, traded and mixed</span><span class="sec-line" aria-hidden="true"></span></div>');
    } else if (h.dataset.y !== ref) {
      h.querySelector('.sec-t').textContent = 'Electricity — ' + ref;
    }
    document.getElementById('sec-elec').dataset.y = ref;
  }
  // every card carries its year: the stat card's labels, the chart over time its range ("2000–2025")
  if (info && ref) {
    const first = Object.keys(info.years).sort()[0];
    const addYr = (el, txt) => { if (el && !/\b(19|20)\d\d\b/.test(el.textContent)) el.appendChild(document.createTextNode(' — ' + txt)); };
    app.querySelectorAll('#balance-card .bc-stat > .stat-label').forEach(el => addYr(el, ref));
    addYr(document.getElementById('line-label'), first + '–' + ref);
  }
  app.querySelectorAll(DATE_SEL).forEach(el => {
    // no brackets round a year: "Electricity mix (2025)" -> "Electricity mix — 2025"
    const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let tn;
    while ((tn = tw.nextNode())) if (/\(\s*(19|20)\d\d\s*\)/.test(tn.textContent)) tn.textContent = tn.textContent.replace(/\s*\(\s*((?:19|20)\d\d)\s*\)/g, ' — $1');
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentElement.closest('.cd-yr') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
    const hits = []; let n;
    while ((n = w.nextNode())) { RE_RANGE_OR_YEAR.lastIndex = 0; if (RE_RANGE_OR_YEAR.test(n.textContent)) hits.push(n); }
    hits.forEach(t => {
      const frag = document.createDocumentFragment(), txt = t.textContent; let last = 0;
      txt.replace(RE_RANGE_OR_YEAR, (m, y1, y2, i) => {
        frag.appendChild(document.createTextNode(txt.slice(last, i)));
        const end = y2 || y1, b = document.createElement('b');   // a range is judged by its last year
        b.className = 'cd-yr'; if (end) b.dataset.y = end; b.textContent = m;
        frag.appendChild(b); last = i + m.length; return m;
      });
      frag.appendChild(document.createTextNode(txt.slice(last)));
      t.replaceWith(frag);
    });
  });
  // red with a ! when the year is not the electricity data's year (checked again whenever the country changes)
  app.querySelectorAll('.cd-yr').forEach(b => {
    const off = !!(ref && b.dataset.y && b.dataset.y !== ref), bang = b.querySelector('.cd-bang');
    b.classList.toggle('is-off', off);
    if (off && !bang) { b.title = 'Not the same year as the electricity data (' + ref + ')'; b.insertAdjacentHTML('beforeend', '<span class="cd-bang" aria-hidden="true">!</span>'); }
    if (!off && bang) { bang.remove(); b.removeAttribute('title'); }
  });
}
if (globeOn() && window.ENERGLE_TEST) document.addEventListener('DOMContentLoaded', () => {
  let queued = false;
  const mo = new MutationObserver(() => {
    if (queued) return; queued = true;
    requestAnimationFrame(() => { queued = false; mo.disconnect(); try { markDates(); } catch (e) {} watch(); });
  });
  const watch = () => { const app = document.getElementById('app') || document.body; mo.observe(app, { childList: true, subtree: true, characterData: true }); };
  watch();
});

// ============================================================
//  FINAL ENERGY ON THE MAP (test page, Explore): a click on a tile of the final energy card colours the globe by that part's
//  share of each country's final energy (Electricity: how electrified; Biomass: who cooks with wood; District heat: where
//  pipes heat cities...), with the same key as a source. A second click, or the key's ×, stops it.
// ============================================================
let UC_SHADE = null;   // { kind: 's' | 'e', i }
function ucShares(kind, i) {
  if (!UC_DATA) return [];
  return Object.entries(UC_DATA.by).map(([name, v]) => {
    if (kind === 's' && v.onlyElectricity) return null;
    const d = v.years[String(v.latestYear)][kind], t = d.reduce((a, b) => a + b, 0);
    return t > 0 && v.iso3 ? [v.iso3, d[i] / t] : null;
  }).filter(Boolean);
}
function ucShadeMap(kind, i) {
  const off = !kind || (UC_SHADE && UC_SHADE.kind === kind && UC_SHADE.i === i);
  if (off) { UC_SHADE = null; if (typeof globeShade === 'function') globeShade(null); ucShadeMark(); return; }
  if (!GLOBE || !GLOBE.getLayer('energle-shade')) return;
  const part = (kind === 's' ? UC_SOURCES : UC_SECTORS)[i], sh = ucShares(kind, i);
  if (GLOBE_SHADE && !String(GLOBE_SHADE).startsWith('fe:')) { try { lockedSource = null; _globeFocus(null); } catch (e) {} }
  UC_SHADE = { kind, i }; GLOBE_SHADE = 'fe:' + part.k;
  const max = Math.max(0.1, Math.ceil(Math.max(...sh.map(x => x[1])) * 10) / 10), val = ['match', ['get', 'iso3'], ...sh.flat(), 0];
  GLOBE.setPaintProperty('energle-shade', 'fill-color', ['interpolate', ['linear'], val, 0, '#f6efe0', max, part.c]);
  GLOBE.setPaintProperty('energle-shade', 'fill-opacity', ['case', ['>', val, 0.005], 0.9, 0]);
  GLOBE.setLayoutProperty('energle-shade', 'visibility', 'visible');
  GLOBE.setPaintProperty('energle-reg-fill', 'fill-opacity', 0); GLOBE.setPaintProperty('energle-sel-fill', 'fill-opacity', 0);
  const key = document.getElementById('gl-shade'), mh = document.getElementById('gl-maphint');
  if (mh) mh.hidden = true;
  if (key) {
    key.innerHTML = '<span class="gl-shade-name"><span class="gl-shade-sw" style="background:' + part.c + '"></span>' + escHtml(part.k) + '</span>'
      + '<span class="gl-shade-txt">share of each country’s final energy · ' + sh.filter(x => x[1] > 0.005).length + ' countries</span>'
      + '<span class="gl-shade-scale"><small>0%</small><span class="gl-shade-bar" style="background:linear-gradient(90deg,#f6efe0,' + part.c + ')"></span><small>' + Math.round(max * 100) + '%</small></span>'
      + '<button type="button" class="gl-shade-x" aria-label="Stop colouring the map">×</button>';
    key.querySelector('.gl-shade-x').addEventListener('click', () => ucShadeMap(null));
    key.hidden = false;
  }
  ucShadeMark();
}
function ucShadeMark() {   // the tile that colours the map stays marked
  document.querySelectorAll('#use-card .uc-tile').forEach(t => {
    const on = !!UC_SHADE && (UC_MODE === 's' ? 's' : 'e') === UC_SHADE.kind && +t.dataset.si === UC_SHADE.i;
    t.classList.toggle('is-map', on);
  });
}
if (globeOn() && window.ENERGLE_TEST) document.addEventListener('DOMContentLoaded', () => {
  document.body.classList.add('ex-test');
  document.addEventListener('click', e => {
    const t = e.target.closest('#use-card .uc-tile'); if (!t || !document.body.classList.contains('at-globe')) return;
    ucShadeMap(UC_MODE === 's' ? 's' : 'e', +t.dataset.si);
  });
  // a source chosen under the charts takes over the map: the final energy colouring lets go
  const _gs = window.globeShade;
  if (typeof _gs === 'function') window.globeShade = function (src) { if (src || !String(GLOBE_SHADE || '').startsWith('fe:')) { UC_SHADE = null; ucShadeMark(); } return _gs.apply(this, arguments); };
  // the panel is redrawn for each country: the final energy colouring stays (it is not a legend chip)
  const _rl = window.globeShadeRelock;
  if (typeof _rl === 'function') window.globeShadeRelock = function () { if (String(GLOBE_SHADE || '').startsWith('fe:')) return; return _rl.apply(this, arguments); };
  // the map's tools (Globe/List, search, groups) span exactly the map, whatever width the cards take
  const fitTools = () => { const w = document.querySelector('.gl-wrap'); if (w && w.offsetWidth) document.body.style.setProperty('--ex-map-w', w.offsetWidth + 'px'); };
  if (window.ResizeObserver) { const ro = new ResizeObserver(fitTools); const watch = () => { const w = document.querySelector('.gl-wrap'); if (w) ro.observe(w); else setTimeout(watch, 500); }; watch(); }
  window.addEventListener('resize', fitTools);
});

// ============================================================
//  EXPLORE LAYOUT (test page, laptops). Default: the map beside the electricity cards, exactly as tall as they are, and
//  the final energy card the full width underneath, so each rectangle is filled. "Enlarge map": the map grows tall and
//  stays in view, the cards take the right-hand column and final energy moves there, under the electricity cards.
// ============================================================
const EX_BIG_KEY = 'energle_ex_bigmap';
function exWide() { return document.body.classList.contains('at-globe') && document.body.classList.contains('ex-test') && matchMedia('(min-width: 1100px)').matches; }
function ucPlace() {
  const card = document.getElementById('use-card'), lay = document.querySelector('.gl-layout'); if (!card || !lay) return;
  const below = exWide() && !document.body.classList.contains('ex-bigmap');
  if (below) {
    if (card.parentElement !== lay) { const ft = lay.querySelector(':scope > footer'); lay.insertBefore(card, ft || null); }
    card.classList.add('uc-wide');
  } else {
    card.classList.remove('uc-wide');
    const legend = document.getElementById('legend-shared');
    if (legend && card.previousElementSibling !== legend) legend.insertAdjacentElement('afterend', card);
  }
}
function exBigMap(on) {
  document.body.classList.toggle('ex-bigmap', !!on);
  try { localStorage.setItem(EX_BIG_KEY, on ? '1' : '0'); } catch (e) {}
  const b = document.getElementById('ex-big');
  if (b) { b.setAttribute('aria-pressed', String(!!on)); b.querySelector('span').textContent = on ? 'Smaller map' : 'Enlarge map'; }
  ucPlace();
  const fit = () => { try { if (GLOBE) GLOBE.resize(); } catch (e) {} try { ucFlowDraw(); } catch (e) {} };
  requestAnimationFrame(fit); setTimeout(fit, 350);
}
if (globeOn() && window.ENERGLE_TEST) document.addEventListener('DOMContentLoaded', () => {
  let big = false; try { big = localStorage.getItem(EX_BIG_KEY) === '1'; } catch (e) {}
  document.body.classList.toggle('ex-bigmap', big);
  const addBtn = () => {
    const wrap = document.querySelector('.gl-wrap'); if (!wrap) return setTimeout(addBtn, 400);
    if (document.getElementById('ex-big')) return;
    wrap.insertAdjacentHTML('beforeend', '<button type="button" class="ex-big" id="ex-big" aria-pressed="' + big + '">'
      + '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M9.5 2.5h4v4M13.5 2.5L9 7M6.5 13.5h-4v-4M2.5 13.5L7 9"/></svg>'
      + '<span>' + (big ? 'Smaller map' : 'Enlarge map') + '</span></button>');
    document.getElementById('ex-big').addEventListener('click', () => exBigMap(!document.body.classList.contains('ex-bigmap')));
  };
  addBtn();
  window.addEventListener('resize', () => { try { ucPlace(); } catch (e) {} });
  // leaving Explore or coming back: the card goes where that page wants it
  new MutationObserver(() => { try { ucPlace(); } catch (e) {} }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
});

// ============================================================
//  WHAT'S NEW: THE FINAL ENERGY DEMO. Five steps drawn from the data itself (the arrows, the dots, a swipe or the keyboard;
//  it moves on by itself unless the mouse is over it): the world's flow; a country against the world (Iceland); a change
//  over time (China); the map coloured by a tile (Explore); groups added up (Explore).
// ============================================================
function feDemoStart(root, mapSvg) {
  if (!root || !UC_DATA) return;
  const vis = root.querySelector('#fe-vis'), cap = root.querySelector('#fe-cap'), dots = root.querySelector('#fe-dots');
  const by = UC_DATA.by, latestS = v => v.years[String(v.latestYear)].s, pct = x => Math.round(x * 100) + '%';
  const share = v => { const s = latestS(v), t = s.reduce((a, b) => a + b, 0); return s.map(x => t ? x / t : 0); };
  // the world: every country's flow added up
  const W = [0, 1, 2, 3, 4].map(() => [0, 0, 0, 0, 0, 0]);
  Object.values(by).forEach(v => (v.flow || []).forEach((r, i) => r.forEach((x, j) => { W[i][j] += x || 0; })));
  const wS = [0, 1, 2, 3, 4, 5].map(j => W.reduce((a, r) => a + r[j], 0)), wT = wS.reduce((a, b) => a + b, 0), wSh = wS.map(x => x / wT);
  const ice = by['Iceland'], iSh = ice ? share(ice) : null;
  const ch = by['China'];
  const tile = (src, v, w) => '<div class="uc-tile fe-tile" style="--c:' + src.c + '"><span class="uc-ic">' + ucIcon(src) + '</span><span class="uc-pc">' + ucPct(v) + '</span>'
    + '<span class="uc-nm">' + src.k + '</span><span class="uc-wd"><span>World avg</span> <span>' + ucPct(w) + '</span></span></div>';
  // China over time: every source, coal and electricity picked out
  const chinaSVG = (Wd, Hd) => {
    const ys = Object.keys(ch.years).sort(), x0 = 34, x1 = Wd - 86, y0 = 10, y1 = Hd - 22;
    const max = Math.max(...ys.flatMap(y => ch.years[y].s)), X = i => x0 + (x1 - x0) * i / (ys.length - 1), Y = v => y1 - (y1 - y0) * v / max;
    const line = (j, w, o) => '<polyline class="fe-ln" pathLength="1" fill="none" stroke="' + UC_SOURCES[j].c + '" stroke-width="' + w + '" opacity="' + o + '" stroke-linejoin="round" points="' + ys.map((y, i) => X(i).toFixed(1) + ',' + Y(ch.years[y].s[j]).toFixed(1)).join(' ') + '"/>';
    const last = j => Y(ch.years[ys[ys.length - 1]].s[j]);
    let ticks = ''; for (let k = 0; k <= 4; k++) { const v = max * k / 4, yy = Y(v); ticks += '<line x1="' + x0 + '" x2="' + x1 + '" y1="' + yy + '" y2="' + yy + '" stroke="#efeeea"/><text x="' + (x0 - 6) + '" y="' + (yy + 3) + '" text-anchor="end" class="fe-ax">' + ucNum(v / 1000, v ? 1 : 0) + '</text>'; }
    const yl = [0, Math.floor((ys.length - 1) / 2), ys.length - 1].map(i => '<text x="' + X(i) + '" y="' + (Hd - 6) + '" text-anchor="middle" class="fe-ax">' + ys[i] + '</text>').join('');
    return '<svg viewBox="0 0 ' + Wd + ' ' + Hd + '" width="' + Wd + '" height="' + Hd + '" class="fe-chart">' + ticks + yl
      + [0, 1, 4, 5].map(j => line(j, 1.6, .35)).join('') + line(2, 2.8, 1) + line(3, 2.8, 1)
      + '<text x="' + (x1 + 6) + '" y="' + (last(3) + 4) + '" class="fe-lb" fill="' + UC_SOURCES[3].c + '">Electricity</text>'
      + '<text x="' + (x1 + 6) + '" y="' + (last(2) + 4) + '" class="fe-lb" fill="' + UC_SOURCES[2].c + '">Coal</text>'
      + '<text x="' + x0 + '" y="' + (y0 - 1) + '" class="fe-ax" text-anchor="start">PWh</text></svg>';
  };
  const cross = ch && Object.keys(ch.years).sort().find(y => ch.years[y].s[3] > ch.years[y].s[2]);
  // groups: World, Europe, Africa, Asia as 100% bars by source
  const grp = ['all', 'europe', 'africa', 'asiaonly', 'opec'].map(rid => { try { const a = globeAggregate(rid), inf = ucInfo({ name: a.name }); return inf && { name: rid === 'all' ? 'World' : a.name, sh: share(inf) }; } catch (e) { return null; } }).filter(Boolean);
  const grpHTML = () => '<div class="fe-grp">' + grp.map(g => '<div class="fe-grow"><span class="fe-gn">' + escHtml(g.name) + '</span><span class="fe-gbar">'
    + UC_SRC_ORDER.map(j => g.sh[j] > 0.004 ? '<span style="flex:' + g.sh[j].toFixed(4) + ' 0 0;background:' + UC_SOURCES[j].c + '" title="' + UC_SOURCES[j].k + ' ' + pct(g.sh[j]) + '">' + (g.sh[j] >= 0.09 ? pct(g.sh[j]) : '') + '</span>' : '').join('') + '</span></div>').join('')
    + '<div class="fe-gkey">' + UC_SRC_ORDER.map(j => '<span><i style="background:' + UC_SOURCES[j].c + '"></i>' + UC_SOURCES[j].k + '</span>').join('') + '</div></div>';
  const af = grp.find(g => g.name === 'Africa'), eu = grp.find(g => g.name === 'Europe');
  const steps = [
    { cap: 'All of it, not just electricity: the world’s final energy, from what it uses to what it is for. Electricity is ' + pct(wSh[3]) + ' of it.',
      draw: (w, h) => ucFlowSVG(W, w, h) },
    iSh && { cap: 'Every country against the world. Iceland runs ' + pct(iSh[3]) + ' on electricity, and ' + pct(iSh[5]) + ' of its energy is geothermal heat piped into buildings.',
      draw: () => '<div class="fe-tiles">' + UC_SRC_ORDER.map(j => tile(UC_SOURCES[j], iSh[j], wSh[j])).join('') + '</div>' },
    ch && { cap: 'Every year since 2000. In China, electricity overtook coal' + (cross ? ' in ' + cross : '') + ': ' + pct(share({ years: ch.years, latestYear: 2000 })[3]) + ' of final energy in 2000, ' + pct(share(ch)[3]) + ' in ' + ch.latestYear + '.',
      draw: (w, h) => chinaSVG(w, h) },
    mapSvg && { cap: 'In Explore, a click on any tile colours the map. Here: electricity’s share of each country’s final energy.',
      draw: () => mapSvg, after: box => {
        const m = new Map(Object.values(by).filter(v => v.iso3 && !v.onlyElectricity).map(v => [v.iso3, share(v)[3]])), mx = Math.max(...m.values());
        const paint = () => box.querySelectorAll('path[data-i]').forEach(p => { const v = m.get(p.dataset.i); if (v != null) p.style.fill = nxMix(UC_SOURCES[3].c, Math.min(1, v / mx)); });
        if (REDUCED_MOTION) paint(); else requestAnimationFrame(() => requestAnimationFrame(paint));   // the colours wash in (CSS transition)
      } },
    grp.length > 1 && { cap: 'Add up any region, bloc or trait. Biomass is ' + (af ? pct(af.sh[4]) : '') + ' of Africa’s final energy, ' + (eu ? pct(eu.sh[4]) : '') + ' of Europe’s; district heat ' + (eu ? pct(eu.sh[5]) : '') + ' of Europe’s.',
      draw: () => grpHTML() },
  ].filter(Boolean);
  let i = 0, timer = null;
  dots.innerHTML = steps.map((st, k) => '<button type="button" class="fe-dot" role="tab" aria-label="Step ' + (k + 1) + '" data-k="' + k + '"></button>').join('');
  const show = k => {
    i = k; const st = steps[k], w = Math.round(vis.clientWidth) || 560, h = Math.round(vis.clientHeight) || 250;
    vis.classList.remove('is-in', 'uc-play'); vis.innerHTML = st.draw(w, h); if (st.after) st.after(vis);
    if (!REDUCED_MOTION) { void vis.offsetWidth; vis.classList.add('uc-play'); vis.querySelectorAll('.uc-pc').forEach((el, k) => ucCount(el, 250 + k * 70)); }
    requestAnimationFrame(() => vis.classList.add('is-in'));
    cap.textContent = st.cap;
    dots.querySelectorAll('.fe-dot').forEach((d, j) => d.setAttribute('aria-selected', String(j === k)));
  };
  const play = () => { clearInterval(timer); if (!REDUCED_MOTION) timer = setInterval(() => { if (!document.body.contains(root)) return clearInterval(timer); show((i + 1) % steps.length); }, 5200); };
  const go = d => { show((i + d + steps.length) % steps.length); play(); };
  dots.addEventListener('click', e => { const d = e.target.closest('.fe-dot'); if (d) { show(+d.dataset.k); play(); } });
  root.querySelector('.nx-prev').addEventListener('click', () => go(-1));
  root.querySelector('.nx-next').addEventListener('click', () => go(1));
  let sx = null;
  root.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
  root.addEventListener('touchend', e => { if (sx == null) return; const dx = e.changedTouches[0].clientX - sx; sx = null; if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1); }, { passive: true });
  root.addEventListener('mouseenter', () => clearInterval(timer)); root.addEventListener('mouseleave', play);
  document.addEventListener('keydown', function onK(e) { if (!document.body.contains(root)) return document.removeEventListener('keydown', onK); if (e.key === 'ArrowRight') go(1); else if (e.key === 'ArrowLeft') go(-1); });
  // the caption keeps the height of the longest step, so the window doesn't jump
  let hc = 0; steps.forEach(st => { cap.textContent = st.cap; hc = Math.max(hc, cap.offsetHeight); }); cap.style.minHeight = hc + 'px';
  show(0); play();
}

// ============================================================
//  EXPLORE (test, laptops): ONE HEIGHT FOR THE MAP'S ROW. The row was as tall as the panel, so the map grew and shrank
//  with every tab (a clue card is half the profile's height) and every country. Now the row takes the tallest
//  electricity profile seen at this window width and keeps it: tabs and countries change, the map and the final energy
//  card below don't move. The profile's charts and the clue cards stretch to fill the row.
// ============================================================
let EX_ROW = { w: 0, h: 0 };
function exRowLock() {
  const side = document.getElementById('gl-side'); if (!side) return;
  const on = exWide() && !document.body.classList.contains('ex-bigmap') && !document.body.classList.contains('gl-stack');
  document.body.classList.toggle('ex-rowlock', on);
  if (!on) { side.style.removeProperty('min-height'); return; }
  if (EX_ROW.w !== window.innerWidth) EX_ROW = { w: window.innerWidth, h: 0 };
  const prof = document.getElementById('gl-pane-profile');
  if (prof && !prof.hidden && side.querySelector('.gl-p-head')) {      // the profile is showing: the row is at least its height
    // the world's profile has neither a group's definition nor a country's "Read about …" line (40px with its gap):
    // count that line, so going on to a country doesn't move anything
    // (only when the content itself is taller than the row: a panel held at the row's height says nothing new)
    const cur = side.offsetHeight;
    if (cur > EX_ROW.h) EX_ROW.h = cur + (side.querySelector('.gl-more-row, .gl-def') ? 0 : 40);
  }
  if (EX_ROW.h && side.style.minHeight !== EX_ROW.h + 'px') side.style.minHeight = EX_ROW.h + 'px';
  // the profile's charts and flow arrive late: whenever the panel's size changes, measure again
  if (!side.dataset.exRo && typeof ResizeObserver !== 'undefined') { side.dataset.exRo = '1'; new ResizeObserver(() => requestAnimationFrame(exRowLock)).observe(side); }
}
if (window.ENERGLE_TEST) {
  const _gt = window.globeTab;
  // the profile's charts and flow are drawn a frame or two later: measure again once they are in
  let exT = 0; const exLockSoon = () => { exRowLock(); requestAnimationFrame(() => requestAnimationFrame(exRowLock)); clearTimeout(exT); exT = setTimeout(exRowLock, 400); };
  window.globeTab = function (t, first) { const r = _gt.apply(this, arguments); exLockSoon(); return r; };
  const _gs = window.globeSide;
  window.globeSide = function () { const r = _gs.apply(this, arguments); exLockSoon(); return r; };
  window.addEventListener('resize', () => requestAnimationFrame(exRowLock));
}

// ============================================================
//  THE FLOW, BRANCH BY BRANCH: hover a band (tap, on phones) and it alone lights up, with its two ends, and a box like
//  the charts' says what it carries: how much, its share of all final energy, of its source and of its application.
// ============================================================
let UC_LINK_ON = false;
function ucLinkTip(p, e) {
  const card = document.getElementById('use-card'), svg = p.ownerSVGElement; if (!card || !svg) return;
  const j = +p.dataset.s, i = +p.dataset.a, S = UC_SOURCES[j], A = UC_SECTORS[i];
  card.classList.add('uf-on');
  card.querySelectorAll('.uf-l').forEach(q => q.classList.toggle('is-hi', q === p));
  card.querySelectorAll('[data-l],[data-r]').forEach(n => n.classList.toggle('is-hi', n.dataset.l === String(j) || n.dataset.r === String(i)));
  const k = UC_MODE === 's' ? j : i;
  if (UC_CHART) { UC_CHART.$pick = k;
    UC_CHART.data.datasets.forEach(d => { const on = k === d._i; d.borderColor = on ? d._c : d._c + '2e'; d.borderWidth = on ? 2.8 : 2; });
    UC_CHART.update('none'); }
  const pc = x => { const v = x * 100; return (v > 0 && v < 1 ? '<1' : v < 10 ? v.toFixed(1) : Math.round(v)) + '%'; };
  const row = (c, l, v, q, b) => '<div class="tt-row' + (b ? ' tt-row--b' : '') + '"><span class="tt-sw" style="background:' + c + '"></span><span class="tt-l">' + l + '</span><span class="tt-v">' + v + '</span><span class="tt-p">' + q + '</span></div>';
  const html = '<div class="tt-h">' + S.k + ' → ' + A.k + '</div>'
    + row(S.c, 'Carried', ucFmt(+p.dataset.v), '', true) + '<div class="tt-sep"></div>'
    + row('#1a1a1a', 'of all final energy', '', pc(+p.dataset.pt), false)
    + row(S.c, 'of all ' + S.k.toLowerCase(), '', pc(+p.dataset.ps), false)
    + row(A.c, 'of all ' + A.k.toLowerCase(), '', pc(+p.dataset.pa), false);
  const r = svg.getBoundingClientRect();
  UC_LINK_ON = true; showTooltip(html, svg, e.clientX - r.left, e.clientY - r.top);
}
document.addEventListener('pointerdown', e => {   // a tap anywhere else closes it
  if (UC_LINK_ON && !e.target.closest('#use-card .uf-l')) { UC_LINK_ON = false; hideTooltip(); ucPick(null); }
}, true);

// the tiles keep one height whichever way the card is switched (a tile name on two lines would otherwise move
// everything below): the tallest seen at this card width holds, and the shorter set stretches to it
const UC_TGS_H = {};
{ const _r = window.ucRender;
  window.ucRender = function () {
    const out = _r.apply(this, arguments);
    const card = document.getElementById('use-card'), tgs = card && card.querySelector('.uc-tgs');
    if (tgs) { const k = Math.round(card.clientWidth); UC_TGS_H[k] = Math.max(UC_TGS_H[k] || 0, tgs.offsetHeight); tgs.style.minHeight = UC_TGS_H[k] + 'px'; }
    return out;
  }; }

// ============================================================
//  FINAL ENERGY: ENTRANCE ANIMATIONS, in the main page's manner. When the card comes into view (on a new country, or a
//  switch between sources and applications; not a unit change): the two figures and the tiles' percentages count up,
//  the flow's nodes grow and its bands sweep out from the left, source by source, the tiles rise in, and the chart's
//  lines draw from left to right like the main chart's. Nothing moves the layout: transforms and opacity only.
// ============================================================
function ucCount(el, delay, dur) {       // counts the number inside a text ("2.39 PWh", "40%") up from zero
  const txt = el.textContent, m = txt.match(/^([^\d]*)(\d[\d,]*(?:\.\d+)?)(.*)$/); if (!m || /[<>]/.test(m[1])) return;   // "<1%" stays as it is
  const to = parseFloat(m[2].replace(/,/g, '')), dec = (m[2].split('.')[1] || '').length, comma = m[2].includes(',');
  const fmt = v => { const t = v.toFixed(dec); return comma ? Number(t).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : t; };
  const tok = (el._ucTok || 0) + 1; el._ucTok = tok; el.textContent = m[1] + fmt(0) + m[3];
  const t0 = performance.now() + (delay || 0), D = dur || 750;
  const f = now => { if (el._ucTok !== tok) return; const k = Math.max(0, Math.min(1, (now - t0) / D)), e = 1 - Math.pow(1 - k, 3);
    el.textContent = k >= 1 ? txt : m[1] + fmt(to * e) + m[3]; if (k < 1) requestAnimationFrame(f); };
  requestAnimationFrame(f);
}
let UC_SKIP_ANIM = false, UC_IO = null;
document.addEventListener('change', e => { if (e.target.closest && e.target.closest('#use-card .uc-unit')) UC_SKIP_ANIM = true; }, true);
function ucPlay(card) {
  card.dataset.pending = '';
  if (UC_CHART) {
    const cv = UC_CHART.canvas; cv.style.visibility = '';
    UC_CHART.options.animation = {}; UC_CHART.options.animations = lineDrawAnimation(UC_CHART.data.labels.length);
    UC_CHART.reset(); UC_CHART.update();
    setTimeout(() => { if (UC_CHART && UC_CHART.canvas === cv) { UC_CHART.options.animation = false; UC_CHART.options.animations = {}; } }, 2600);
  }
  card.querySelectorAll('.uc-big').forEach((el, k) => ucCount(el, k * 120));
  card.querySelectorAll('.uc-tile .uc-pc').forEach(el => ucCount(el, 300 + (+el.closest('.uc-tile').dataset.si || 0) * 70));
  card.classList.remove('uc-play'); void card.offsetWidth; card.classList.add('uc-play');
  clearTimeout(card._ucPlayT); card._ucPlayT = setTimeout(() => card.classList.remove('uc-play'), 2400);   // later redraws (a resize) stay still
}
if (!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) { const _r = window.ucRender;   // (script.js, which defines REDUCED_MOTION, loads after this file)
  window.ucRender = function () {
    const skip = UC_SKIP_ANIM; UC_SKIP_ANIM = false;
    const out = _r.apply(this, arguments);
    const card = document.getElementById('use-card'); if (!card || skip) return out;
    card.dataset.pending = '1';
    if (UC_CHART) UC_CHART.canvas.style.visibility = 'hidden';       // drawn when it plays, not before
    if (!UC_IO && window.IntersectionObserver) UC_IO = new IntersectionObserver(es => es.forEach(en => {
      if (en.isIntersecting && en.target.dataset.pending === '1') ucPlay(en.target); }), { threshold: 0.2 });
    if (UC_IO) { UC_IO.unobserve(card); UC_IO.observe(card); } else ucPlay(card);
    return out;
  }; }
