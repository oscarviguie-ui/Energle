// ============================================================
//  ATLAS GLOBE — test page at energle.org/globe/ (everything it needs lives in this folder).
//  Countries coloured by their electricity profile; hover for the mix; click to fly in
//  (satellite imagery shows when zoomed) and read the profile in the side panel.
//
//  Only active on the test page (globe/index.html sets window.GLOBE_PAGE). ?imagery=nasa tries
//  NASA's open imagery instead of Esri's. Libraries load from jsDelivr when the globe opens.
//  Shapes: Natural Earth 1:50m via world-atlas (public domain), globe/world.json.
//  Base texture: NASA Blue Marble (public domain), globe/earth-blue-marble*.jpg.
// ============================================================
const GLOBE_DIR = 'globe/';
function globeOn() { return !!window.GLOBE_PAGE; }

const GLOBE_LIBS = [
  'https://cdn.jsdelivr.net/npm/globe.gl@2.46.2/dist/globe.gl.min.js',
  'https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/dist/topojson-client.min.js',
];
// Satellite tiles, used only once the camera is close (far away, the Blue Marble texture is enough)
const GLOBE_IMAGERY = {
  esri: { url: (x, y, l) => 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/' + l + '/' + y + '/' + x,
          max: 17, credit: 'Imagery: Esri, Maxar, Earthstar Geographics' },
  nasa: { url: (x, y, l) => 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/' + l + '/' + y + '/' + x + '.jpeg',
          max: 8, credit: 'Imagery: NASA Blue Marble (GIBS)' },
};
const GLOBE_SRC = GLOBE_IMAGERY[/[?&]imagery=nasa\b/.test(location.search) ? 'nasa' : 'esri'];
const GLOBE_TILES_BELOW = 1.1;          // camera altitude (globe radii) under which the satellite tiles take over
const GLOBE_WIDE = '(min-width: 1100px)';
const GLOBE_TOUCH = matchMedia('(hover: none)').matches;      // a tap selects: the panel says it all, no tooltip on top

let GLOBE = null, GLOBE_FEATS = null, GLOBE_SEL = null, GLOBE_HOVER = null, GLOBE_LOADING = null;
let GLOBE_COLOR = (() => { try { return localStorage.getItem('energle_globe_color') || 'main'; } catch (e) { return 'main'; } })();
const FOSSIL = ['Coal', 'Gas', 'Other Fossil'];

function globeScript(src) {
  return new Promise((ok, fail) => {
    if ([...document.scripts].some(s => s.src === src)) return ok();
    const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => fail(new Error('could not load ' + src));
    document.head.appendChild(s);
  });
}
function globeLoad() {
  if (!GLOBE_LOADING) GLOBE_LOADING = (async () => {
    for (const src of GLOBE_LIBS) await globeScript(src);
    const topo = await (await fetch(GLOBE_DIR + 'world.json')).json();
    const byIso = Object.fromEntries(COUNTRIES.map(c => [c.iso3, c]));
    GLOBE_FEATS = topojson.feature(topo, topo.objects.countries).features.map(f => {
      const c = byIso[f.properties.iso3] || null;
      return Object.assign(f, { c, prof: c ? globeProfile(c) : null, span: globeSpan(f) });
    });
  })().catch(e => { GLOBE_LOADING = null; throw e; });
  return GLOBE_LOADING;
}

// Shares of the latest year by source, the main source, low-carbon share
function globeProfile(c) {
  const yd = (ALL_DATA[c.name] && ALL_DATA[c.name].years[c.latestYear]) || {}, tot = yd.Total || 0;
  const src = SOURCES.map(k => ({ k, p: tot ? (yd[k] || 0) / tot : 0, v: yd[k] || 0 })).sort((a, b) => b.p - a.p);
  const low = src.filter(x => !FOSSIL.includes(x.k)).reduce((a, x) => a + x.p, 0);
  return { src, main: src[0], low, tot, dpc: c.latestDpc };
}
// Widest extent of a shape in degrees (for how far to zoom), handling shapes across the date line
function globeSpan(f) {
  const lats = [], lngs = [];
  const walk = a => typeof a[0] === 'number' ? (lngs.push(a[0]), lats.push(a[1])) : a.forEach(walk);
  walk(f.geometry.coordinates);
  const latSpan = Math.max(...lats) - Math.min(...lats);
  const sorted = [...new Set(lngs.map(x => Math.round(x)))].sort((a, b) => a - b);
  let gap = 360 - (sorted[sorted.length - 1] - sorted[0]);
  for (let i = 1; i < sorted.length; i++) gap = Math.max(gap, sorted[i] - sorted[i - 1]);
  const lngSpan = (360 - gap) * Math.cos((Math.max(...lats) + Math.min(...lats)) / 2 * Math.PI / 180);
  return Math.max(latSpan, lngSpan, 0.5);
}

// ---------- colours ----------
const GLOBE_MODES = {
  main: { label: 'Main source', legend: () => SOURCES.map(k => [k, COLORS[k]]) },
  low:  { label: 'Low-carbon share', legend: () => [['0%', globeRamp(0)], ['50%', globeRamp(0.5)], ['100%', globeRamp(1)]] },
  dpc:  { label: 'Use per person', legend: () => [['0.1 MWh', globeDpcCol(0.1)], ['1', globeDpcCol(1)], ['5', globeDpcCol(5)], ['20+', globeDpcCol(20)]] },
};
const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mixRgb = (a, b, t) => { const A = hexRgb(a), B = hexRgb(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
function globeRamp(t) { return t < 0.5 ? mixRgb('#8a4a2a', '#e6dcc8', t * 2) : mixRgb('#e6dcc8', '#2a7a4a', (t - 0.5) * 2); }
function globeDpcCol(v) { const t = Math.min(1, Math.max(0, (Math.log10(Math.max(v, 0.1)) + 1) / (Math.log10(20) + 1))); return mixRgb('#e9eef4', '#1f4e79', t); }
function globeBase(f) {
  if (!f.prof) return '#d9d6cf';
  if (GLOBE_COLOR === 'low') return globeRamp(f.prof.low);
  if (GLOBE_COLOR === 'dpc') return globeDpcCol(f.prof.dpc || 0);
  return COLORS[f.prof.main.k];
}
function globeFill(f) {
  const a = GLOBE_SEL ? (f === GLOBE_SEL ? '00' : '33') : f === GLOBE_HOVER ? 'f2' : 'd0';
  return globeBase(f) + a;
}

// ---------- markup ----------
function globeHTML() {
  return '<div class="gl-layout" id="gl-layout">'
    + '<div class="gl-wrap" id="gl-wrap">'
    +   '<div class="gl-canvas" id="gl-canvas" aria-label="Globe of every country’s electricity profile. The list view is keyboard-friendly."></div>'
    +   '<div class="gl-top">'
    +     '<label class="gl-color"><span>Colour by</span><select id="gl-color">'
    +       Object.entries(GLOBE_MODES).map(([k, m]) => '<option value="' + k + '"' + (k === GLOBE_COLOR ? ' selected' : '') + '>' + m.label + '</option>').join('')
    +     '</select></label>'
    +     '<div class="gl-legend" id="gl-legend"></div>'
    +   '</div>'
    +   '<p class="gl-loading" id="gl-loading">Loading the globe…</p>'
    +   '<div class="gl-foot"><span class="gl-hint">Drag to turn · scroll or pinch to zoom · click a country</span>'
    +     '<span class="gl-credit" id="gl-credit">Base: NASA Blue Marble</span></div>'
    + '</div>'
    + '<aside class="gl-side" id="gl-side" aria-live="polite"></aside>'
    + '</div>';
}
function globeLegend() {
  const el = document.getElementById('gl-legend'); if (!el) return;
  el.innerHTML = GLOBE_MODES[GLOBE_COLOR].legend().map(([n, c]) => '<span class="gl-key"><i style="background:' + c + '"></i>' + n + '</span>').join('');
}
const pct = p => Math.round(p * 100) + '%';
const mixBar = (src, cls) => '<span class="' + cls + '">' + src.filter(x => x.p >= 0.005).map(x => '<i style="flex:' + x.p.toFixed(3) + ';background:' + COLORS[x.k] + '" title="' + x.k + ' ' + pct(x.p) + '"></i>').join('') + '</span>';
function globeLabel(f) {
  if (!f.c || GLOBE_TOUCH) return '';
  const p = f.prof, top = p.src.filter(x => x.p >= 0.005).slice(0, 3);
  return '<div class="gl-tip"><b>' + escHtml(f.c.name) + '</b>' + mixBar(p.src, 'gl-tip-bar')
    + '<span class="gl-tip-row">' + top.map(x => x.k + ' ' + pct(x.p)).join(' · ') + '</span>'
    + '<span class="gl-tip-row gl-tip-mute">' + fmtTwh(p.tot) + (p.dpc != null ? ' · ' + p.dpc.toFixed(1) + ' MWh per person' : '') + '</span></div>';
}
function worldDpcNow() { if (!WORLD_DPC) return null; const ys = Object.keys(WORLD_DPC).map(Number); return WORLD_DPC[Math.max(...ys)]; }

// Generation by source over the years, as a small stacked area chart (SVG)
function globeTrend(c) {
  const yrs = Object.keys((ALL_DATA[c.name] || {}).years || {}).map(Number).sort((a, b) => a - b);
  if (yrs.length < 3) return '';
  const W = 320, H = 96, P = 2, Y = ALL_DATA[c.name].years;
  const max = Math.max(...yrs.map(y => Y[y].Total || 0)) || 1;
  const x = i => P + i * (W - 2 * P) / (yrs.length - 1), y = v => H - 14 - v / max * (H - 22);
  const base = yrs.map(() => 0);
  const layers = SOURCES.map(k => {
    const lo = base.slice(), hi = yrs.map((yr, i) => (base[i] += (Y[yr][k] || 0)));
    if (!hi.some((v, i) => v - lo[i] > 0)) return '';
    const top = hi.map((v, i) => x(i).toFixed(1) + ',' + y(v).toFixed(1)).join(' ');
    const bot = lo.map((v, i) => x(i).toFixed(1) + ',' + y(v).toFixed(1)).reverse().join(' ');
    return '<polygon points="' + top + ' ' + bot + '" fill="' + COLORS[k] + '" opacity=".85"/>';
  }).join('');
  return '<svg class="gl-trend" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Generation by source, ' + yrs[0] + ' to ' + yrs[yrs.length - 1] + '">'
    + layers + '<text x="' + P + '" y="' + (H - 2) + '">' + yrs[0] + '</text><text x="' + (W - P) + '" y="' + (H - 2) + '" text-anchor="end">' + yrs[yrs.length - 1] + '</text>'
    + '<text x="' + (W - P) + '" y="9" text-anchor="end">' + fmtTwh(max) + ' peak</text></svg>';
}
function globeCountryHTML(f) {
  const c = f.c, p = f.prof, wd = worldDpcNow();
  const all = globeCountries();
  const rank = (key, val) => 1 + all.filter(g => (key(g) || 0) > val).length, n = all.length;
  return '<button type="button" class="gl-x" id="gl-x" aria-label="Back to the whole globe">×</button>'
    + '<div class="gl-p-head">' + flagImg(c.iso3, 'gl-flag') + '<div><h3>' + escHtml(c.name) + '</h3><span>' + (REGION_LABEL[c.continent] || '') + ' · ' + c.latestYear + '</span></div></div>'
    + mixBar(p.src, 'gl-p-bar')
    + '<ul class="gl-p-src">' + p.src.filter(x => x.p >= 0.005).map(x => '<li><i style="background:' + COLORS[x.k] + '"></i>' + x.k
      + '<span class="gl-wide-only">' + fmtTwh(x.v) + '</span><b>' + pct(x.p) + '</b></li>').join('') + '</ul>'
    + '<div class="gl-p-nums"><span><b>' + fmtTwh(p.tot) + '</b>generated<em class="gl-wide-only">#' + rank(g => g.prof.tot, p.tot) + ' of ' + n + '</em></span>'
    +   '<span><b>' + (p.dpc != null ? p.dpc.toFixed(1) + ' MWh' : '–') + '</b>per person<em class="gl-wide-only">' + (wd && p.dpc != null ? (p.dpc / wd).toFixed(1) + '× world avg.' : '') + '</em></span>'
    +   '<span><b>' + pct(p.low) + '</b>low-carbon<em class="gl-wide-only">#' + rank(g => g.prof.low, p.low) + ' of ' + n + '</em></span></div>'
    + '<div class="gl-wide-only gl-p-trend"><span class="gl-side-h">Generation since ' + Object.keys(ALL_DATA[c.name].years)[0] + '</span>' + globeTrend(c) + '</div>'
    + '<button type="button" class="gl-open" id="gl-open">Open the full profile →</button>';
}
// Wide screens, nothing selected: what the current colours say, with countries to click
// one shape per country (a few countries are drawn as more than one shape)
function globeCountries() { const seen = new Set(); return GLOBE_FEATS.filter(f => f.prof && !seen.has(f.c.iso3) && seen.add(f.c.iso3)); }
function globeOverviewHTML() {
  const fs = globeCountries();
  const row = f => '<button type="button" class="gl-row" data-iso="' + f.c.iso3 + '">' + flagImg(f.c.iso3, 'gl-rflag') + '<span>' + escHtml(f.c.name) + '</span>';
  let body = '';
  if (GLOBE_COLOR === 'main') {
    const by = {}; fs.forEach(f => { (by[f.prof.main.k] = by[f.prof.main.k] || []).push(f); });
    body = '<span class="gl-side-h">Main source of electricity</span><ul class="gl-count">'
      + Object.entries(by).sort((a, b) => b[1].length - a[1].length).map(([k, list]) => '<li><i style="background:' + COLORS[k] + '"></i>' + k
        + '<span class="gl-count-bar"><span style="width:' + (list.length / fs.length * 100).toFixed(1) + '%;background:' + COLORS[k] + '"></span></span><b>' + list.length + '</b></li>').join('') + '</ul>'
      + '<p class="gl-note">Number of countries where each source makes the most electricity.</p>'
      + '<span class="gl-side-h">Biggest generators</span><div class="gl-rows">' + [...fs].sort((a, b) => b.prof.tot - a.prof.tot).slice(0, 8).map(f => row(f) + '<b>' + fmtTwh(f.prof.tot) + '</b></button>').join('') + '</div>';
  } else {
    const key = GLOBE_COLOR === 'low' ? f => f.prof.low : f => f.prof.dpc || 0, fmt = GLOBE_COLOR === 'low' ? pct : v => v.toFixed(1) + ' MWh';
    const sorted = [...fs].sort((a, b) => key(b) - key(a));
    body = '<span class="gl-side-h">Highest</span><div class="gl-rows">' + sorted.slice(0, 7).map(f => row(f) + '<b>' + fmt(key(f)) + '</b></button>').join('') + '</div>'
      + '<span class="gl-side-h">Lowest</span><div class="gl-rows">' + sorted.slice(-5).reverse().map(f => row(f) + '<b>' + fmt(key(f)) + '</b></button>').join('') + '</div>'
      + (GLOBE_COLOR === 'dpc' && worldDpcNow() ? '<p class="gl-note">World average: ' + worldDpcNow().toFixed(1) + ' MWh per person.</p>' : '');
  }
  return '<h3 class="gl-side-title">' + GLOBE_MODES[GLOBE_COLOR].label + '</h3>' + body;
}
function globeSide() {
  const el = document.getElementById('gl-side'); if (!el || !GLOBE_FEATS) return;
  const wide = matchMedia(GLOBE_WIDE).matches;
  if (GLOBE_SEL) el.innerHTML = globeCountryHTML(GLOBE_SEL);
  else el.innerHTML = wide ? globeOverviewHTML() : '';
  el.classList.toggle('is-country', !!GLOBE_SEL);
  el.hidden = !GLOBE_SEL && !wide;
  const x = document.getElementById('gl-x'); if (x) x.addEventListener('click', () => globeSelect(null));
  const o = document.getElementById('gl-open'); if (o) o.addEventListener('click', () => browseCountry(GLOBE_SEL.c.iso3));
  el.querySelectorAll('.gl-row').forEach(b => b.addEventListener('click', () => globeFlyTo(b.dataset.iso)));
}

// ---------- behaviour ----------
function globeRefresh() {
  if (!GLOBE) return;
  GLOBE.polygonCapColor(f => globeFill(f))                     // a new accessor each time, so the globe repaints
    .polygonStrokeColor(f => f === GLOBE_SEL ? '#ffffff' : 'rgba(255,255,255,0.55)')
    .polygonAltitude(f => f === GLOBE_SEL ? 0.012 : f === GLOBE_HOVER ? 0.008 : 0.004);
}
function globeTiles(alt) {
  if (!GLOBE) return;
  const want = alt < GLOBE_TILES_BELOW;
  if (want === !!GLOBE.globeTileEngineUrl()) return;
  GLOBE.globeTileEngineUrl(want ? GLOBE_SRC.url : null);
  const cr = document.getElementById('gl-credit'); if (cr) cr.textContent = want ? GLOBE_SRC.credit : 'Base: NASA Blue Marble';
}
function globeSelect(f, fly = true) {
  GLOBE_SEL = f && f.c ? f : null;
  globeRefresh(); globeSide();
  if (!GLOBE || !fly) return;
  if (GLOBE_SEL) GLOBE.pointOfView({ lat: GLOBE_SEL.c.lat, lng: GLOBE_SEL.c.lng, altitude: Math.min(2.2, Math.max(0.18, GLOBE_SEL.span / 38)) }, 1400);
  else { const pov = GLOBE.pointOfView(); GLOBE.pointOfView({ lat: pov.lat, lng: pov.lng, altitude: Math.max(pov.altitude, 1.9) }, 1000); }
}
function globeFlyTo(iso3) {                      // the country's biggest shape (Australia's island territories are separate shapes)
  const f = GLOBE_FEATS && GLOBE_FEATS.filter(x => x.c && x.c.iso3 === iso3).sort((a, b) => b.span - a.span)[0]; if (f) globeSelect(f);
}
const GLOBE_REGIONS = { all: [20, 10, 1.9], europe: [52, 15, 1.1], africa: [3, 20, 1.5], asia: [25, 95, 1.8], americas: [10, -80, 2.1] };
function globeRegion(r) { const v = GLOBE_REGIONS[r]; if (GLOBE && v) { globeSelect(null, false); GLOBE.pointOfView({ lat: v[0], lng: v[1], altitude: v[2] }, 1200); } }

async function globeMount() {
  const el = document.getElementById('gl-canvas'); if (!el) return;
  try { await globeLoad(); } catch (e) {
    const l = document.getElementById('gl-loading'); if (l) l.textContent = 'The globe could not load here. The list view still works.'; return;
  }
  if (!document.body.contains(el)) return;                    // the page was redrawn or left while loading
  const phone = matchMedia('(max-width: 600px)').matches;
  if (GLOBE) { try { GLOBE.pauseAnimation(); GLOBE._destructor && GLOBE._destructor(); } catch (e) {} GLOBE = null; }
  GLOBE_SEL = null; GLOBE_HOVER = null;
  GLOBE = Globe({ animateIn: true })(el)
    .width(el.clientWidth).height(el.clientHeight)
    .backgroundColor('rgba(0,0,0,0)')
    .globeImageUrl(GLOBE_DIR + (phone ? 'earth-blue-marble-2k.jpg' : 'earth-blue-marble.jpg'))
    .globeTileEngineMaxLevel(GLOBE_SRC.max)
    .showAtmosphere(true).atmosphereColor('#9cc6ff').atmosphereAltitude(0.16)
    .polygonsData(GLOBE_FEATS)
    .polygonSideColor(() => 'rgba(0,0,0,0.12)')
    .polygonCapCurvatureResolution(phone ? 6 : 4)
    .polygonLabel(globeLabel)
    .polygonsTransitionDuration(250)
    .onPolygonHover(f => { GLOBE_HOVER = f && f.c ? f : null; el.style.cursor = GLOBE_HOVER ? 'pointer' : 'grab'; globeRefresh(); })
    .onPolygonClick(f => globeSelect(f))
    .onGlobeClick(() => { if (GLOBE_SEL) globeSelect(null); })
    .onZoom(pov => globeTiles(pov.altitude));
  globeRefresh();
  const ctl = GLOBE.controls(); ctl.autoRotate = !matchMedia('(prefers-reduced-motion: reduce)').matches; ctl.autoRotateSpeed = 0.35;
  ['pointerdown', 'wheel', 'touchstart'].forEach(ev => el.addEventListener(ev, () => { ctl.autoRotate = false; }, { passive: true, once: true }));
  GLOBE.pointOfView({ lat: 25, lng: 10, altitude: phone ? 2.6 : 1.9 });
  const l = document.getElementById('gl-loading'); if (l) l.remove();
  globeLegend(); globeSide();
  document.getElementById('gl-color').addEventListener('change', e => {
    GLOBE_COLOR = e.target.value; try { localStorage.setItem('energle_globe_color', GLOBE_COLOR); } catch (er) {}
    globeLegend(); globeRefresh(); globeSide();
  });
  const ro = new ResizeObserver(() => { if (GLOBE && document.body.contains(el)) { GLOBE.width(el.clientWidth).height(el.clientHeight); } });
  ro.observe(el);
  const mq = matchMedia(GLOBE_WIDE), onMq = () => globeSide(); mq.addEventListener('change', onMq);
  // leaving the atlas: stop drawing and free the WebGL context
  const mine = GLOBE, mo = new MutationObserver(() => {
    if (document.body.contains(el)) return;
    mo.disconnect(); ro.disconnect(); mq.removeEventListener('change', onMq); document.body.classList.remove('at-globe');
    try { mine.pauseAnimation(); mine._destructor && mine._destructor(); } catch (e) {}
    if (GLOBE === mine) GLOBE = null;
  });
  mo.observe(document.getElementById('app'), { childList: true });
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && GLOBE_SEL && GLOBE) globeSelect(null); });
