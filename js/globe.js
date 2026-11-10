// ============================================================
//  ATLAS GLOBE — a 3-D globe on the atlas page: countries coloured by their electricity
//  profile, hover for the mix, click to fly in (satellite imagery shows when zoomed) and
//  open the profile.
//
//  Behind a flag while it is tested: add ?globe=on to the address (?globe=nasa tries NASA's
//  imagery instead of Esri's). Libraries and shapes load only when the globe is first opened.
//  Shapes: Natural Earth 1:50m via world-atlas (public domain), data/world.json.
//  Base texture: NASA Blue Marble (public domain), img/globe/.
// ============================================================
const GLOBE_FLAG = (location.search.match(/[?&]globe=(on|nasa|esri)\b/) || [])[1] || null;
function globeOn() { return !!GLOBE_FLAG; }

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
const GLOBE_SRC = GLOBE_IMAGERY[GLOBE_FLAG === 'nasa' ? 'nasa' : 'esri'];
const GLOBE_TILES_BELOW = 1.1;          // camera altitude (globe radii) under which the satellite tiles take over

let GLOBE = null, GLOBE_FEATS = null, GLOBE_SEL = null, GLOBE_HOVER = null, GLOBE_LOADING = null;
let GLOBE_COLOR = (() => { try { return localStorage.getItem('energle_globe_color') || 'main'; } catch (e) { return 'main'; } })();

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
    const topo = await (await fetch('data/world.json')).json();
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
  const src = SOURCES.map(k => ({ k, p: tot ? (yd[k] || 0) / tot : 0 })).sort((a, b) => b.p - a.p);
  const low = src.filter(x => !['Coal', 'Gas', 'Other Fossil'].includes(x.k)).reduce((a, x) => a + x.p, 0);
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

// ---------- view ----------
function globeHTML() {
  return '<div class="gl-wrap" id="gl-wrap">'
    + '<div class="gl-canvas" id="gl-canvas" aria-label="Globe of every country’s electricity profile. Use the list view for a keyboard-friendly version."></div>'
    + '<div class="gl-top">'
    +   '<label class="gl-color"><span>Colour by</span><select id="gl-color">'
    +     Object.entries(GLOBE_MODES).map(([k, m]) => '<option value="' + k + '"' + (k === GLOBE_COLOR ? ' selected' : '') + '>' + m.label + '</option>').join('')
    +   '</select></label>'
    +   '<div class="gl-legend" id="gl-legend"></div>'
    + '</div>'
    + '<div class="gl-panel" id="gl-panel" hidden></div>'
    + '<p class="gl-loading" id="gl-loading">Loading the globe…</p>'
    + '<div class="gl-foot"><span class="gl-hint">Drag to turn · scroll or pinch to zoom · tap a country</span>'
    +   '<span class="gl-credit" id="gl-credit">Base: NASA Blue Marble</span></div>'
    + '</div>';
}
function globeLegend() {
  const el = document.getElementById('gl-legend'); if (!el) return;
  el.innerHTML = GLOBE_MODES[GLOBE_COLOR].legend().map(([n, c]) => '<span class="gl-key"><i style="background:' + c + '"></i>' + n + '</span>').join('');
}
const GLOBE_TOUCH = matchMedia('(hover: none)').matches;      // a tap selects: the panel says it all, no tooltip on top
function globeLabel(f) {
  if (!f.c || GLOBE_TOUCH) return '';
  const p = f.prof, top = p.src.filter(x => x.p >= 0.005).slice(0, 3);
  return '<div class="gl-tip"><b>' + escHtml(f.c.name) + '</b>'
    + '<span class="gl-tip-bar">' + p.src.filter(x => x.p >= 0.005).map(x => '<i style="flex:' + x.p.toFixed(3) + ';background:' + COLORS[x.k] + '"></i>').join('') + '</span>'
    + '<span class="gl-tip-row">' + top.map(x => x.k + ' ' + Math.round(x.p * 100) + '%').join(' · ') + '</span>'
    + '<span class="gl-tip-row gl-tip-mute">' + fmtTwh(p.tot) + (p.dpc != null ? ' · ' + p.dpc.toFixed(1) + ' MWh per person' : '') + '</span></div>';
}
function globePanel(f) {
  const el = document.getElementById('gl-panel'); if (!el) return;
  if (!f) { el.hidden = true; el.innerHTML = ''; return; }
  const c = f.c, p = f.prof;
  el.innerHTML = '<button type="button" class="gl-x" id="gl-x" aria-label="Back to the whole globe">×</button>'
    + '<div class="gl-p-head">' + flagImg(c.iso3, 'gl-flag') + '<div><h3>' + escHtml(c.name) + '</h3><span>' + (REGION_LABEL[c.continent] || '') + ' · ' + c.latestYear + '</span></div></div>'
    + '<div class="gl-p-bar">' + p.src.filter(x => x.p >= 0.005).map(x => '<i style="flex:' + x.p.toFixed(3) + ';background:' + COLORS[x.k] + '" title="' + x.k + ' ' + Math.round(x.p * 100) + '%"></i>').join('') + '</div>'
    + '<ul class="gl-p-src">' + p.src.filter(x => x.p >= 0.02).slice(0, 4).map(x => '<li><i style="background:' + COLORS[x.k] + '"></i>' + x.k + '<b>' + Math.round(x.p * 100) + '%</b></li>').join('') + '</ul>'
    + '<div class="gl-p-nums"><span><b>' + fmtTwh(p.tot) + '</b>generated</span><span><b>' + (p.dpc != null ? p.dpc.toFixed(1) + ' MWh' : '–') + '</b>per person</span><span><b>' + Math.round(p.low * 100) + '%</b>low-carbon</span></div>'
    + '<button type="button" class="gl-open" id="gl-open">Open the full profile →</button>';
  el.hidden = false;
  document.getElementById('gl-x').addEventListener('click', () => globeSelect(null));
  document.getElementById('gl-open').addEventListener('click', () => browseCountry(c.iso3));
}
function globeRefresh() { if (GLOBE) GLOBE.polygonCapColor(f => globeFill(f)).polygonStrokeColor(f => f === GLOBE_SEL ? '#ffffff' : 'rgba(255,255,255,0.55)').polygonAltitude(f => f === GLOBE_SEL ? 0.012 : f === GLOBE_HOVER ? 0.008 : 0.004); }
function globeTiles(alt) {
  if (!GLOBE) return;
  const want = alt < GLOBE_TILES_BELOW;
  if (want === !!GLOBE.globeTileEngineUrl()) return;
  GLOBE.globeTileEngineUrl(want ? GLOBE_SRC.url : null);
  const cr = document.getElementById('gl-credit'); if (cr) cr.textContent = want ? GLOBE_SRC.credit : 'Base: NASA Blue Marble';
}
function globeSelect(f, fly = true) {
  GLOBE_SEL = f && f.c ? f : null;
  globeRefresh(); globePanel(GLOBE_SEL);
  if (!GLOBE) return;
  if (GLOBE_SEL && fly) {
    const alt = Math.min(2.2, Math.max(0.18, GLOBE_SEL.span / 38));
    GLOBE.pointOfView({ lat: GLOBE_SEL.c.lat, lng: GLOBE_SEL.c.lng, altitude: alt }, 1400);
  } else if (!GLOBE_SEL && fly) {
    const pov = GLOBE.pointOfView(); GLOBE.pointOfView({ lat: pov.lat, lng: pov.lng, altitude: Math.max(pov.altitude, 1.9) }, 1000);
  }
}
function globeFlyTo(iso3) { const f = GLOBE_FEATS && GLOBE_FEATS.find(x => x.c && x.c.iso3 === iso3); if (f) globeSelect(f); }
const GLOBE_REGIONS = { all: [20, 10, 1.9], europe: [52, 15, 1.1], africa: [3, 20, 1.5], asia: [25, 95, 1.8], americas: [10, -80, 2.1] };
function globeRegion(r) { const v = GLOBE_REGIONS[r]; if (GLOBE && v) { globeSelect(null, false); GLOBE.pointOfView({ lat: v[0], lng: v[1], altitude: v[2] }, 1200); } }

async function globeMount() {
  const el = document.getElementById('gl-canvas'); if (!el) return;
  try { await globeLoad(); } catch (e) {
    const l = document.getElementById('gl-loading'); if (l) l.textContent = 'The globe could not load here. The list view still works.'; return;
  }
  if (!document.body.contains(el)) return;                    // the page was redrawn or left while loading
  const phone = matchMedia('(max-width: 600px)').matches;
  if (GLOBE) { try { GLOBE._destructor && GLOBE._destructor(); } catch (e) {} GLOBE = null; }
  GLOBE_SEL = null; GLOBE_HOVER = null;
  GLOBE = Globe({ animateIn: true })(el)
    .width(el.clientWidth).height(el.clientHeight)
    .backgroundColor('rgba(0,0,0,0)')
    .globeImageUrl(phone ? 'img/globe/earth-blue-marble-2k.jpg' : 'img/globe/earth-blue-marble.jpg')
    .globeTileEngineMaxLevel(GLOBE_SRC.max)
    .showAtmosphere(true).atmosphereColor('#9cc6ff').atmosphereAltitude(0.16)
    .polygonsData(GLOBE_FEATS)
    .polygonCapColor(globeFill)
    .polygonSideColor(() => 'rgba(0,0,0,0.12)')
    .polygonStrokeColor(f => f === GLOBE_SEL ? '#ffffff' : 'rgba(255,255,255,0.55)')
    .polygonAltitude(0.004)
    .polygonCapCurvatureResolution(phone ? 6 : 4)
    .polygonLabel(globeLabel)
    .polygonsTransitionDuration(250)
    .onPolygonHover(f => { GLOBE_HOVER = f && f.c ? f : null; el.style.cursor = GLOBE_HOVER ? 'pointer' : 'grab'; globeRefresh(); })
    .onPolygonClick(f => globeSelect(f))
    .onGlobeClick(() => { if (GLOBE_SEL) globeSelect(null); })
    .onZoom(pov => globeTiles(pov.altitude));
  const ctl = GLOBE.controls(); ctl.autoRotate = !matchMedia('(prefers-reduced-motion: reduce)').matches; ctl.autoRotateSpeed = 0.35;
  ['pointerdown', 'wheel', 'touchstart'].forEach(ev => el.addEventListener(ev, () => { ctl.autoRotate = false; }, { passive: true, once: true }));
  GLOBE.pointOfView({ lat: 25, lng: 10, altitude: phone ? 2.6 : 1.9 });
  const l = document.getElementById('gl-loading'); if (l) l.remove();
  globeLegend();
  document.getElementById('gl-color').addEventListener('change', e => {
    GLOBE_COLOR = e.target.value; try { localStorage.setItem('energle_globe_color', GLOBE_COLOR); } catch (er) {}
    globeLegend(); globeRefresh();
  });
  const ro = new ResizeObserver(() => { if (GLOBE && document.body.contains(el)) GLOBE.width(el.clientWidth).height(el.clientHeight); });
  ro.observe(el);
  // leaving the atlas: stop drawing and free the WebGL context
  const mine = GLOBE, mo = new MutationObserver(() => {
    if (document.body.contains(el)) return;
    mo.disconnect(); ro.disconnect(); document.body.classList.remove('at-globe');
    try { mine.pauseAnimation(); mine._destructor && mine._destructor(); } catch (e) {}
    if (GLOBE === mine) GLOBE = null;
  });
  mo.observe(document.getElementById('app'), { childList: true });
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && GLOBE_SEL && GLOBE) globeSelect(null); });
