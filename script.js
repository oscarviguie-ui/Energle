// ============================================================
//  CONFIG
// ============================================================
const MAX_GUESSES = 6;
const SOURCES = ['Coal','Gas','Other Fossil','Nuclear','Hydro','Wind','Solar','Bioenergy','Other Renewables'];
const COLORS = {
  'Coal':'#4a4a4a','Gas':'#e8925a','Other Fossil':'#c0654a','Nuclear':'#9b6dbd',
  'Hydro':'#4a90c4','Wind':'#5ab88a','Solar':'#f5c842','Bioenergy':'#a0724a','Other Renewables':'#2ab5a0',
};

// ============================================================
//  SUPABASE
// ============================================================
const SUPABASE_URL = 'https://chjipjiaemwfvwgdhccn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNoamlwamlhZW13ZnZ3Z2RoY2NuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MTU4MTAsImV4cCI6MjA5NjQ5MTgxMH0.j8QiHY5VhU70kPn_4zqsFaQPVBcipGMEXXgG_3tHKxU';
const SB_HEADERS = {
  'Content-Type': 'application/json',
  'apikey': SUPABASE_KEY,
  'Authorization': 'Bearer ' + SUPABASE_KEY,
};

async function sbInsert(row) {
  try {
    const res = await fetch(SUPABASE_URL + '/rest/v1/scores', {
      method: 'POST',
      headers: { ...SB_HEADERS, 'Prefer': 'return=minimal' },
      body: JSON.stringify(row),
    });
    // 409 = this player already has a row for today (if a unique constraint exists) — count as sent
    return res.ok || res.status === 409;
  } catch { return false; }
}

async function sbFetchToday(day) {
  try {
    const res = await fetch(
      SUPABASE_URL + '/rest/v1/scores?day=eq.' + day + '&order=guesses.asc,created_at.asc&limit=100',
      { headers: SB_HEADERS }
    );
    return res.ok ? res.json() : [];
  } catch { return []; }
}

// All-time stats are aggregated in Postgres by the `leaderboard_alltime` view
// (one row per player, first attempt per day only). Ranked by Weighted Score
// (lower is better), ties broken by more puzzles played. The podium uses the same order.
async function sbFetchAllTime(limit = 500) {
  try {
    const res = await fetch(
      SUPABASE_URL + '/rest/v1/leaderboard_alltime?order=score.asc,played.desc&limit=' + limit,
      { headers: SB_HEADERS }
    );
    return res.ok ? res.json() : [];
  } catch { return []; }
}

// ============================================================
//  PRACTICE CATEGORIES
// ============================================================
const PRACTICE_CATEGORIES = [
  { id:'all',      label:'All Countries',  filter: c => true },
  { id:'europe',   label:'Europe',         filter: c => c.continent === 'Europe' },
  { id:'africa',   label:'Africa',         filter: c => c.continent === 'Africa' },
  { id:'asia',     label:'Asia & Pacific', filter: c => c.continent === 'Asia' || c.continent === 'Oceania' },
  { id:'americas', label:'Americas',       filter: c => c.continent === 'North America' || c.continent === 'South America' },
  { id:'major',    label:'Major Producers',filter: c => c.latestTotal >= 100 },
  { id:'highcap',  label:'High Per-Capita',filter: c => (c.latestDpc ?? 0) >= 7 },
  { id:'green',    label:'Green Leaders',  filter: c => (c.renewablePct ?? 0) >= 70 },
  { id:'fossil',   label:'Fossil Heavy',   filter: c => (c.fossilPct ?? 0) >= 90 },
  { id:'lowcap',   label:'Low Per-Capita', filter: c => (c.latestDpc ?? 0) > 0 && (c.latestDpc ?? 0) < 0.5 },
];

const CAT_EMOJIS = {
  all: '🌐', europe: '🇪🇺', africa: '🌍', asia: '🌏',
  americas: '🌎', major: '⚡', highcap: '💡', green: '🌱',
  fossil: '🔥', lowcap: '🏚️',
};
function catEmoji(id) { return CAT_EMOJIS[id] || ''; }

// ============================================================
//  DAILY PUZZLE
// ============================================================
const EPOCH_DATE = new Date(Date.UTC(2026, 5, 2));

function getDayNumber() {
  const now = new Date();
  return Math.floor(
    (Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - EPOCH_DATE.getTime()) / 86400000
  ) + 1;
}

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function getDailyTarget(countries) {
  const rng = mulberry32(getDayNumber() * 2654435761);
  const arr = [...countries];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr[0];
}

// ============================================================
//  LOCALSTORAGE — daily, stats, username
// ============================================================
const LS_KEY          = 'energle_daily_v1';
const LS_STATS_KEY    = 'energle_stats_v1';
const LS_USERNAME_KEY = 'energle_username_v1';

function loadDailyState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s.day === getDayNumber() ? s : null;
  } catch { return null; }
}

function saveDailyState() {
  if (MODE !== 'normal') return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      day: getDayNumber(), guesses: guesses.map(g => g.iso3), gameOver, submitted: scoreSubmitted,
    }));
  } catch {}
}

function loadStats() {
  try {
    const raw = localStorage.getItem(LS_STATS_KEY);
    return raw ? JSON.parse(raw) : { played:0, won:0, streak:0, bestStreak:0, dist:{1:0,2:0,3:0,4:0,5:0,6:0,X:0} };
  } catch { return { played:0, won:0, streak:0, bestStreak:0, dist:{1:0,2:0,3:0,4:0,5:0,6:0,X:0} }; }
}

function saveStats(s) {
  try { localStorage.setItem(LS_STATS_KEY, JSON.stringify(s)); } catch {}
}

function recordDailyResult(won, n) {
  const s = loadStats(); s.played++;
  if (won) { s.won++; s.streak++; s.bestStreak = Math.max(s.bestStreak, s.streak); s.dist[n] = (s.dist[n] || 0) + 1; }
  else { s.streak = 0; s.dist['X'] = (s.dist['X'] || 0) + 1; }
  saveStats(s);
}

function getUsername() { return localStorage.getItem(LS_USERNAME_KEY) || null; }
function setUsername(name) { localStorage.setItem(LS_USERNAME_KEY, name.trim()); }

function ensureUsername() {
  return new Promise(resolve => {
    const existing = getUsername();
    if (existing) { resolve(existing); return; }

    const modal = document.createElement('div');
    modal.id = 'username-modal';
    modal.innerHTML =
      '<div class="st-backdrop"></div>'
      + '<div class="st-box" style="max-width:340px">'
      + '<div class="st-header"><span class="st-title">Choose a display name</span></div>'
      + '<div style="padding:1.2rem">'
      + '<p style="font-size:0.82rem;color:#666;margin-bottom:0.75rem">How you appear on the leaderboard. Cannot be changed later.</p>'
      + '<input id="username-input" type="text" maxlength="20" placeholder="e.g. OscarV" style="width:100%;padding:8px 12px;border:1px solid #d0d0d0;border-radius:3px;font-size:0.92rem;outline:none;box-sizing:border-box" />'
      + '<p id="username-error" style="color:#dc2626;font-size:0.78rem;min-height:16px;margin-top:4px"></p>'
      + '<button id="username-confirm" style="width:100%;margin-top:0.5rem;padding:9px;background:#1a1a1a;color:#fff;border:none;border-radius:3px;font-size:0.92rem;font-weight:600;cursor:pointer">Confirm</button>'
      + '</div></div>';
    document.body.appendChild(modal);

    const input  = document.getElementById('username-input');
    const errEl  = document.getElementById('username-error');
    const btn    = document.getElementById('username-confirm');
    input.focus();

    function confirm() {
      const val = input.value.trim();
      if (val.length < 2)  { errEl.textContent = 'At least 2 characters.'; return; }
      if (val.length > 20) { errEl.textContent = 'Max 20 characters.'; return; }
      if (!/^[a-zA-Z0-9_ .\-]+$/.test(val)) { errEl.textContent = 'Letters, numbers, spaces, _ - . only.'; return; }
      setUsername(val); modal.remove(); resolve(val);
    }
    btn.addEventListener('click', confirm);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') confirm(); });
  });
}

// ============================================================
//  ISO3 CONTINENT FALLBACK
// ============================================================
const ISO3_CONTINENT = {
  'ALB':'Europe','ARM':'Europe','AUT':'Europe','AZE':'Europe','BLR':'Europe','BEL':'Europe',
  'BIH':'Europe','BGR':'Europe','HRV':'Europe','CYP':'Europe','CZE':'Europe','DNK':'Europe',
  'EST':'Europe','FIN':'Europe','FRA':'Europe','GEO':'Europe','DEU':'Europe','GRC':'Europe',
  'HUN':'Europe','ISL':'Europe','IRL':'Europe','ITA':'Europe','XKX':'Europe','LVA':'Europe',
  'LTU':'Europe','LUX':'Europe','MLT':'Europe','MDA':'Europe','MNE':'Europe','NLD':'Europe',
  'MKD':'Europe','NOR':'Europe','POL':'Europe','PRT':'Europe','ROU':'Europe','RUS':'Europe',
  'SRB':'Europe','SVK':'Europe','SVN':'Europe','ESP':'Europe','SWE':'Europe','CHE':'Europe',
  'UKR':'Europe','GBR':'Europe',
  'DZA':'Africa','AGO':'Africa','BEN':'Africa','BWA':'Africa','BFA':'Africa','BDI':'Africa',
  'CPV':'Africa','CMR':'Africa','CAF':'Africa','TCD':'Africa','COM':'Africa','COD':'Africa',
  'COG':'Africa','CIV':'Africa','DJI':'Africa','EGY':'Africa','GNQ':'Africa','ERI':'Africa',
  'SWZ':'Africa','ETH':'Africa','GAB':'Africa','GMB':'Africa','GHA':'Africa','GIN':'Africa',
  'GNB':'Africa','KEN':'Africa','LSO':'Africa','LBR':'Africa','LBY':'Africa','MDG':'Africa',
  'MWI':'Africa','MLI':'Africa','MRT':'Africa','MUS':'Africa','MAR':'Africa','MOZ':'Africa',
  'NAM':'Africa','NER':'Africa','NGA':'Africa','RWA':'Africa','SEN':'Africa','SLE':'Africa',
  'SOM':'Africa','ZAF':'Africa','SSD':'Africa','SDN':'Africa','TZA':'Africa','TGO':'Africa',
  'TUN':'Africa','UGA':'Africa','ZMB':'Africa','ZWE':'Africa',
  'AFG':'Asia','BHR':'Asia','BGD':'Asia','BTN':'Asia','BRN':'Asia','KHM':'Asia','CHN':'Asia',
  'IND':'Asia','IDN':'Asia','IRN':'Asia','IRQ':'Asia','ISR':'Asia','JPN':'Asia','JOR':'Asia',
  'KAZ':'Asia','PRK':'Asia','KOR':'Asia','KWT':'Asia','KGZ':'Asia','LAO':'Asia','LBN':'Asia',
  'MYS':'Asia','MDV':'Asia','MNG':'Asia','MMR':'Asia','NPL':'Asia','OMN':'Asia','PAK':'Asia',
  'PHL':'Asia','QAT':'Asia','SAU':'Asia','SGP':'Asia','LKA':'Asia','SYR':'Asia','TWN':'Asia',
  'TJK':'Asia','THA':'Asia','TLS':'Asia','TKM':'Asia','ARE':'Asia','UZB':'Asia','VNM':'Asia',
  'YEM':'Asia','PSE':'Asia',
  'AUS':'Oceania','NZL':'Oceania','FJI':'Oceania','PNG':'Oceania',
  'BHS':'North America','BLZ':'North America','CAN':'North America','CRI':'North America',
  'CUB':'North America','DOM':'North America','SLV':'North America','GTM':'North America',
  'HTI':'North America','HND':'North America','JAM':'North America','MEX':'North America',
  'NIC':'North America','PAN':'North America','PRI':'North America','TTO':'North America','USA':'North America',
  'ARG':'South America','BOL':'South America','BRA':'South America','CHL':'South America',
  'COL':'South America','ECU':'South America','GUY':'South America','PRY':'South America',
  'PER':'South America','SUR':'South America','URY':'South America','VEN':'South America',
};

// ============================================================
//  STATE
// ============================================================
let ALL_DATA = null, WORLD_DPC = null, WORLD_GEN = {}, COUNTRIES = [], POOL = [];

// World average total generation per country, by year: the simple mean of every
// country's Total (TWh) in that year. Built once from the loaded data.
function buildWorldGen() {
  const sums = {}, counts = {};
  for (const info of Object.values(ALL_DATA)) {
    for (const [year, yd] of Object.entries(info.years)) {
      const t = yd?.Total;
      if (t == null || t <= 0) continue;
      sums[year] = (sums[year] || 0) + t;
      counts[year] = (counts[year] || 0) + 1;
    }
  }
  WORLD_GEN = {};
  for (const y of Object.keys(sums)) WORLD_GEN[y] = sums[y] / counts[y];
}
let target = null, guesses = [], gameOver = false;
let lineChart = null, barChart = null;
let MODE = 'normal', PRACTICE_CAT = null;
let scoreSubmitted = false; // has today's daily result reached Supabase?

function practiceUnlocked() {
  if (MODE === 'practice') return true;
  if (gameOver) return true;
  const s = loadDailyState();
  return s ? s.gameOver === true : false;
}

// ============================================================
//  LOAD DATA
// ============================================================
async function loadData() {
  document.getElementById('app').innerHTML = '<div id="loading">Loading data…</div>';
  try {
    const res = await fetch('energle_data.json');
    const raw = await res.json();
    WORLD_DPC = raw['__world_dpc__'];
    delete raw['__world_dpc__'];
    ALL_DATA = raw;
    buildWorldGen();
    COUNTRIES = Object.entries(ALL_DATA).map(([name, info]) => {
      const latest = info.latestYear, yd = info.years[latest] ?? {}, total = yd.Total ?? 0;
      const renSum = ['Hydro','Wind','Solar','Bioenergy','Other Renewables'].reduce((s,k) => s + (yd[k] ?? 0), 0);
      const fosSum = ['Coal','Gas','Other Fossil'].reduce((s,k) => s + (yd[k] ?? 0), 0);
      return {
        name, iso3: info.iso3, lat: info.lat, lng: info.lng,
        continent:    info.continent ?? ISO3_CONTINENT[info.iso3] ?? null,
        latestYear:   latest, latestDpc: info.latestDpc, latestTotal: total,
        renewablePct: total > 0 ? renSum / total * 100 : 0,
        fossilPct:    total > 0 ? fosSum / total * 100 : 0,
      };
    });
    POOL = COUNTRIES;
    initApp();
  } catch(err) {
    document.getElementById('app').innerHTML = '<div id="loading">Error loading data: ' + err.message + '</div>';
  }
}

// ============================================================
//  MODE SWITCHER
// ============================================================
function modeSwitcherHTML() {
  const locked = !practiceUnlocked();
  const dA = MODE === 'normal'   ? 'active' : '';
  const pA = MODE === 'practice' ? 'active' : '';
  const lC = locked ? 'locked' : '';
  const lI = locked ? ' 🔒' : '';
  return `<div class="mode-switcher" id="mode-nav">
    <button class="mode-btn ${dA}" onclick="switchMode('normal')">Daily</button>
    <button class="mode-btn ${pA} ${lC}" onclick="switchMode('practice')">Practice${lI}</button>
    <button class="mode-btn" onclick="showStatsModal(false)">Stats</button>
  </div>`;
}

// Row under the header line: lives on the left (game screen only), mode buttons on the right
function navRowHTML(withLives) {
  return '<div class="nav-row">'
    + (withLives ? '<div id="lives-container"></div>' : '<div></div>')
    + modeSwitcherHTML()
    + '</div>';
}

// Top-right of the header: all-time podium + Leaderboard button
function headerRightHTML() {
  return '<div class="header-right">'
    + podiumHTML()
    + '<div class="mode-switcher lb-switcher">'
    + '<button class="mode-btn" onclick="showLeaderboardModal()">Leaderboard</button>'
    + '</div></div>';
}

// ============================================================
//  PODIUM — top 3 of the all-time leaderboard
// ============================================================
let PODIUM = null; // null = not loaded yet; [] = no scores

function podiumHTML() {
  const medals = ['🥇','🥈','🥉'];
  const slots = medals.map((m, i) => {
    const r = PODIUM && PODIUM[i];
    const name = r ? escHtml(r.username) : (PODIUM ? '—' : '…');
    return '<div class="podium-slot">'
      + '<span class="podium-medal">' + m + '</span>'
      + '<span class="podium-name" title="' + name + '">' + name + '</span>'
      + '</div>';
  }).join('');
  return '<button id="podium" class="podium" onclick="showLeaderboardModal(\'alltime\')" title="All-time leaderboard">'
    + slots + '</button>';
}

async function loadPodium() {
  PODIUM = await sbFetchAllTime(3);
  const el = document.getElementById('podium');
  if (el) el.outerHTML = podiumHTML();
}

function switchMode(mode) {
  if (mode === 'practice' && !practiceUnlocked()) {
    const btn = document.querySelector('.mode-btn.locked');
    if (btn) { btn.classList.add('locked-flash'); setTimeout(() => btn.classList.remove('locked-flash'), 500); }
    return;
  }
  if (lineChart) { lineChart.destroy(); lineChart = null; }
  if (barChart)  { barChart.destroy();  barChart  = null; }
  MODE = mode;
  if (mode === 'normal') { POOL = COUNTRIES; PRACTICE_CAT = null; renderGameScreen(); restoreDailyGame(); }
  else { renderPracticePickerScreen(); }
}

function startPractice(catId) {
  const cat = PRACTICE_CATEGORIES.find(c => c.id === catId); if (!cat) return;
  PRACTICE_CAT = catId;
  POOL = COUNTRIES.filter(cat.filter);
  if (POOL.length === 0) { alert('No countries match this category.'); return; }
  if (lineChart) { lineChart.destroy(); lineChart = null; }
  if (barChart)  { barChart.destroy();  barChart  = null; }
  resetPracticeQueue(); renderGameScreen(); newGame();
}

// ============================================================
//  COUNTRY LIST MODAL
// ============================================================
function showCountryList(catId) {
  const cat = PRACTICE_CATEGORIES.find(c => c.id === catId); if (!cat) return;
  const countries = COUNTRIES.filter(cat.filter).sort((a,b) => a.name.localeCompare(b.name));
  const existing = document.getElementById('cl-modal'); if (existing) existing.remove();
  const modal = document.createElement('div'); modal.id = 'cl-modal';
  modal.innerHTML =
    '<div class="cl-backdrop"></div>'
    + '<div class="cl-box">'
    + '<div class="cl-header"><span>' + catEmoji(catId) + ' ' + cat.label
    + ' <span class="cl-count">(' + countries.length + ' countries)</span></span>'
    + '<button class="cl-close" id="cl-close-btn">×</button></div>'
    + '<div class="cl-body">'
    + countries.map(c => '<div class="cl-row"><span class="cl-name">' + c.name + '</span><span class="cl-meta">' + (c.continent || '') + '</span></div>').join('')
    + '</div></div>';
  modal.querySelector('.cl-backdrop').addEventListener('click', () => modal.remove());
  document.body.appendChild(modal);
  document.getElementById('cl-close-btn').addEventListener('click', () => modal.remove());
}

// ============================================================
//  BROWSE GATE + BROWSE MODE
// ============================================================
function tryBrowse() {
  if (!practiceUnlocked()) {
    const existing = document.getElementById('browse-gate-msg'); if (existing) return;
    const msg = document.createElement('p'); msg.id = 'browse-gate-msg';
    msg.style.cssText = 'text-align:center;color:#dc2626;font-size:0.82rem;margin-top:0.5rem;';
    msg.textContent = 'Complete today\'s daily puzzle to unlock Browse.';
    const wrap = document.querySelector('.browse-btn-wrap'); if (wrap) wrap.after(msg);
    setTimeout(() => msg.remove(), 3000);
    return;
  }
  renderBrowseScreen();
}

function renderBrowseScreen() {
  if (lineChart) { lineChart.destroy(); lineChart = null; }
  if (barChart)  { barChart.destroy();  barChart  = null; }
  const sorted = [...COUNTRIES].sort((a,b) => a.name.localeCompare(b.name));
  const rows = sorted.map(c => {
    const fn = "browseCountry('" + c.iso3 + "')";
    return '<button class="browse-row" onclick="' + fn + '">'
      + '<span class="browse-name">' + c.name + '</span>'
      + '<span class="browse-meta">' + (c.continent || '') + ' · ' + c.latestTotal.toFixed(1) + ' TWh</span>'
      + '</button>';
  }).join('');
  document.getElementById('app').innerHTML =
    '<header><div class="header-top">' + logoHTML() + headerRightHTML() + '</div>'
    + '<div class="subtitle-row"><p class="subtitle">Browse all country energy profiles</p>'
    + '<button id="back-to-cats">← Categories</button></div></header>'
    + navRowHTML(false)
    + '<div class="browse-search-wrap"><input id="browse-search" type="text" placeholder="Search countries…" autocomplete="off" /></div>'
    + '<div class="browse-list">' + rows + '</div>'
    + '<footer><p>Data: <a href="https://ember-climate.org" target="_blank">Ember Global Electricity Review</a></p></footer>';
  document.getElementById('back-to-cats').addEventListener('click', renderPracticePickerScreen);
  document.getElementById('browse-search').addEventListener('input', function () {
    const q = this.value.toLowerCase().trim();
    document.querySelectorAll('.browse-row').forEach(b => {
      b.style.display = b.querySelector('.browse-name').textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });
}

function browseCountry(iso3) {
  const country = COUNTRIES.find(c => c.iso3 === iso3); if (!country) return;
  if (lineChart) { lineChart.destroy(); lineChart = null; }
  if (barChart)  { barChart.destroy();  barChart  = null; }
  const prevTarget = target; target = country;
  document.getElementById('app').innerHTML =
    '<header><div class="header-top">' + logoHTML() + headerRightHTML() + '</div>'
    + '<div class="subtitle-row"><p class="subtitle">' + country.name + ' · ' + (country.continent || '') + '</p>'
    + '<button id="back-to-browse">← Browse</button></div></header>'
    + navRowHTML(false)
    + balanceCardHTML()
    + '<div id="charts-section">'
    + '<div id="chart-left"><p class="chart-label">Generation by source over time (TWh)</p><div id="line-wrapper"><canvas id="line-chart"></canvas></div></div>'
    + '<div id="chart-right"><p class="chart-label" id="bar-label">Latest year mix</p><div id="bar-wrapper"><canvas id="bar-chart"></canvas></div></div>'
    + '</div>'
    + '<div id="legend-shared"></div>'
    + '<footer><p>Data: <a href="https://ember-climate.org" target="_blank">Ember Global Electricity Review</a></p></footer>';
  document.getElementById('back-to-browse').addEventListener('click', () => {
    if (lineChart) { lineChart.destroy(); lineChart = null; }
    if (barChart)  { barChart.destroy();  barChart  = null; }
    target = prevTarget; renderBrowseScreen();
  });
  renderStatBar(); renderFlowBar(); renderCharts();
}

// ============================================================
//  PRACTICE PICKER
// ============================================================
function renderPracticePickerScreen() {
  if (lineChart) { lineChart.destroy(); lineChart = null; }
  if (barChart)  { barChart.destroy();  barChart  = null; }
  const cards = PRACTICE_CATEGORIES.map(cat => {
    const count    = COUNTRIES.filter(cat.filter).length;
    const startFn  = "startPractice('" + cat.id + "')";
    const listFn   = "showCountryList('" + cat.id + "')";
    return '<div class="cat-card-wrap">'
      + '<button class="cat-card" onclick="' + startFn + '">'
      + '<span class="cat-emoji">' + catEmoji(cat.id) + '</span>'
      + '<span class="cat-label">' + cat.label + '</span>'
      + '<span class="cat-desc">' + count + ' countries</span>'
      + '</button>'
      + '<button class="cat-list-btn" onclick="' + listFn + '" title="See country list">☰</button>'
      + '</div>';
  }).join('');
  document.getElementById('app').innerHTML =
    '<header><div class="header-top">' + logoHTML() + headerRightHTML() + '</div>'
    + '<p class="subtitle">Choose a category to practice</p></header>'
    + navRowHTML(false)
    + '<div class="cat-grid">' + cards + '</div>'
    + '<div class="browse-btn-wrap"><button class="browse-all-btn" onclick="tryBrowse()">🔍 Browse all countries</button></div>'
    + '<footer><p>Data: <a href="https://ember-climate.org" target="_blank">Ember Global Electricity Review</a></p></footer>';
}

// ============================================================
//  INIT
// ============================================================
function initApp() {
  POOL = COUNTRIES; renderGameScreen(); playIntro(); restoreDailyGame(); loadPodium();
  scheduleAmbientPulse();
}

// ============================================================
//  MOTION — load animations + ambient pulses
//  Everything here is skipped when the visitor asks for reduced motion.
// ============================================================
const REDUCED_MOTION = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

function logoHTML() { return '<h1><span class="logo-bolt" aria-hidden="true">⚡</span> Energle</h1>'; }

// First page load only: logo flickers on, a current runs along the header line.
function playIntro() {
  if (REDUCED_MOTION) return;
  const header = document.querySelector('header'); if (!header) return;
  const line = document.createElement('span'); line.className = 'header-current'; line.setAttribute('aria-hidden', 'true');
  header.appendChild(line); header.classList.add('intro-play');
  setTimeout(() => { header.classList.remove('intro-play'); line.remove(); }, 2000);
}

// Animate a number from 0 to `to`, writing fmt(value) into el.
function countUp(el, to, fmt, delay = 0, dur = 750) {
  if (!el) return;
  if (to == null || REDUCED_MOTION) { el.textContent = to == null ? '—' : fmt(to); return; }
  const token = (el._countToken || 0) + 1; el._countToken = token;
  el.textContent = fmt(0);
  const start = performance.now() + delay;
  const step = now => {
    if (el._countToken !== token) return;
    const x = Math.min(1, Math.max(0, (now - start) / dur));
    el.textContent = fmt(to * (1 - Math.pow(1 - x, 3)));
    if (x < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Chart.js: draw each source line left to right, one after another.
function lineDrawAnimation(nPoints) {
  if (REDUCED_MOTION) return {};
  const per = 900 / Math.max(nPoints, 1);
  const delay = (ctx, key) => {
    if (ctx.type !== 'data' || ctx[key]) return 0;
    ctx[key] = true;
    return 250 + ctx.datasetIndex * 120 + ctx.index * per;
  };
  const prevY = ctx => ctx.index === 0
    ? ctx.chart.scales.y.getPixelForValue(ctx.raw ?? 0)
    : ctx.chart.getDatasetMeta(ctx.datasetIndex).data[ctx.index - 1].getProps(['y'], true).y;
  return {
    x: { type: 'number', easing: 'linear', duration: per, from: NaN, delay: ctx => delay(ctx, 'xStarted') },
    y: { type: 'number', easing: 'linear', duration: per, from: prevY, delay: ctx => delay(ctx, 'yStarted') },
  };
}

// Chart.js: stack the latest-mix bar from the bottom up, segment by segment.
function barStackAnimation() {
  if (REDUCED_MOTION) return false;
  return {
    duration: 420, easing: 'easeOutCubic',
    delay: ctx => (ctx.type === 'data' && ctx.mode === 'default' ? 700 + ctx.datasetIndex * 110 : 0),
  };
}

// Ambient pulse, every 4–9 s: one charge travels through the page.
// The bolt flashes, a current runs along the header line, then a spark runs along a chart line.
let lineChartBornAt = 0;
function scheduleAmbientPulse() {
  if (REDUCED_MOTION) return;
  setTimeout(() => { runAmbientPulse(); scheduleAmbientPulse(); }, 4000 + Math.random() * 5000);
}

function runAmbientPulse() {
  const header = document.querySelector('header');
  if (document.hidden || !header || header.classList.contains('intro-play')) return;
  // 1. bolt
  const bolt = header.querySelector('.logo-bolt');
  if (bolt) { bolt.classList.remove('bolt-pulse'); void bolt.offsetWidth; bolt.classList.add('bolt-pulse'); }
  // 2. header line
  if (!header.querySelector('.header-current')) {
    const line = document.createElement('span');
    line.className = 'header-current is-pulse'; line.setAttribute('aria-hidden', 'true');
    header.appendChild(line);
    setTimeout(() => line.remove(), 1400);
  }
  // 3. chart line, as the header current arrives; at the same time a shine sweeps the energy balance flows
  setTimeout(runLinePulse, 450);
  setTimeout(() => {
    document.querySelectorAll('#flow-chart .fc-shine-anim').forEach(a => { try { a.beginElement(); } catch (e) {} });
  }, 300);
  // 4. and, when there are guesses, along the live wire of one of them
  setTimeout(() => {
    const wires = document.querySelectorAll('#guesses .gr-wire-fill');
    if (!wires.length) return;
    const w = wires[Math.floor(Math.random() * wires.length)];
    w.classList.remove('is-pulse'); void w.offsetWidth; w.classList.add('is-pulse');
  }, 600);
}

function runLinePulse() {
  const chart = lineChart;
  if (!chart || document.hidden || performance.now() - lineChartBornAt < 3000) return;
  const wrap = chart.canvas.parentNode; if (!wrap) return;
  // Datasets are ordered biggest-first, so pick one of the top 4 real sources
  const real = chart.data.datasets.map((d, i) => ({ d, i })).filter(o => !o.d.label.startsWith('__') && !o.d.hidden);
  if (!real.length) return;
  const pick = real[Math.floor(Math.random() * Math.min(real.length, 4))];
  const pts = chart.getDatasetMeta(pick.i).data; if (pts.length < 2) return;

  // Sample the drawn curve (Chart.js keeps the bezier control points on each point)
  const path = [];
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k], b = pts[k + 1];
    const c1x = a.cp2x ?? a.x, c1y = a.cp2y ?? a.y, c2x = b.cp1x ?? b.x, c2y = b.cp1y ?? b.y;
    for (let s = 0; s < 10; s++) {
      const t = s / 10, u = 1 - t;
      path.push([u*u*u*a.x + 3*u*u*t*c1x + 3*u*t*t*c2x + t*t*t*b.x, u*u*u*a.y + 3*u*u*t*c1y + 3*u*t*t*c2y + t*t*t*b.y]);
    }
  }
  path.push([pts[pts.length - 1].x, pts[pts.length - 1].y]);
  const cum = [0];
  for (let k = 1; k < path.length; k++) cum.push(cum[k-1] + Math.hypot(path[k][0] - path[k-1][0], path[k][1] - path[k-1][1]));
  const L = cum[cum.length - 1]; if (!L) return;
  const at = d => {
    d = Math.max(0, Math.min(L, d));
    let k = 1; while (k < cum.length - 1 && cum[k] < d) k++;
    const seg = cum[k] - cum[k-1] || 1, t = (d - cum[k-1]) / seg;
    return [path[k-1][0] + (path[k][0] - path[k-1][0]) * t, path[k-1][1] + (path[k][1] - path[k-1][1]) * t];
  };

  let ov = wrap.querySelector('canvas.line-pulse');
  if (!ov) { ov = document.createElement('canvas'); ov.className = 'line-pulse'; ov.setAttribute('aria-hidden', 'true'); wrap.appendChild(ov); }
  const dpr = chart.currentDevicePixelRatio || window.devicePixelRatio || 1;
  ov.width = chart.width * dpr; ov.height = chart.height * dpr;
  ov.style.width = chart.width + 'px'; ov.style.height = chart.height + 'px';
  const g = ov.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const color = COLORS[pick.d.label], trail = Math.min(70, L * 0.18), dur = 1500, t0 = performance.now();

  const frame = now => {
    if (lineChart !== chart) { g.clearRect(0, 0, ov.width, ov.height); return; }
    const x = Math.min(1, (now - t0) / dur);
    const head = (x < 0.5 ? 2*x*x : 1 - Math.pow(-2*x + 2, 2) / 2) * (L + trail);
    g.clearRect(0, 0, chart.width, chart.height);
    g.lineCap = 'round'; g.strokeStyle = color; g.shadowColor = color;
    for (let s = 0; s < 14; s++) {               // tail: fades and thins towards the back
      const d1 = head - trail * (s / 14), d0 = head - trail * ((s + 1) / 14);
      if (d1 <= 0 || d0 >= L) continue;
      const p0 = at(d0), p1 = at(d1);
      g.globalAlpha = 0.85 * (1 - s / 14); g.lineWidth = 3.2 - s * 0.15; g.shadowBlur = 8;
      g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.stroke();
    }
    if (head > 0 && head < L) {                  // bright head
      const p = at(head);
      g.globalAlpha = 1; g.shadowBlur = 10; g.fillStyle = '#ffffff';
      g.beginPath(); g.arc(p[0], p[1], 2.6, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1; g.shadowBlur = 0;
    if (x < 1) requestAnimationFrame(frame); else g.clearRect(0, 0, chart.width, chart.height);
  };
  requestAnimationFrame(frame);
}

function practiceSubtitle() {
  if (MODE !== 'practice' || !PRACTICE_CAT) return '';
  const cat = PRACTICE_CATEGORIES.find(c => c.id === PRACTICE_CAT);
  return cat ? catEmoji(cat.id) + ' ' + cat.label + ' · ' + POOL.length + ' countries' : '';
}

function renderGameScreen() {
  const isPractice = MODE === 'practice';
  const subtitle   = isPractice
    ? practiceSubtitle()
    : 'Puzzle #' + getDayNumber() + ' · Guess the country from its electricity generation mix';
  const backBtn = isPractice ? '<button id="back-to-categories">← Categories</button>' : '';

  document.getElementById('app').innerHTML =
    '<header><div class="header-top">' + logoHTML() + headerRightHTML() + '</div>'
    + '<div class="subtitle-row"><p class="subtitle">' + subtitle + '</p>' + backBtn + '</div></header>'
    + navRowHTML(true)
    + balanceCardHTML()
    + '<div id="charts-section">'
    + '<div id="chart-left"><p class="chart-label">Generation by source over time (TWh)</p><div id="line-wrapper"><canvas id="line-chart"></canvas></div></div>'
    + '<div id="chart-right"><p class="chart-label" id="bar-label">Latest year mix</p><div id="bar-wrapper"><canvas id="bar-chart"></canvas></div></div>'
    + '</div>'
    + '<div id="legend-shared"></div>'
    + '<div id="input-area"><div id="autocomplete-wrapper">'
    + '<span id="guess-flag" aria-hidden="true"></span>'
    + '<input id="guess-input" type="text" placeholder="Type a country name…" autocomplete="off" />'
    + '<div id="autocomplete-list"></div></div>'
    + '<button id="submit-btn">Guess</button></div>'
    + '<p id="error"></p>'
    + '<div id="banner"></div>'
    + '<div id="guesses"></div>'
    + '<footer><p>Data: <a href="https://ember-climate.org" target="_blank">Ember Global Electricity Review</a></p></footer>';

  document.getElementById('submit-btn').addEventListener('click', submitGuess);
  if (isPractice) {
    document.getElementById('back-to-categories').addEventListener('click', () => {
      if (lineChart) { lineChart.destroy(); lineChart = null; }
      if (barChart)  { barChart.destroy();  barChart  = null; }
      renderPracticePickerScreen();
    });
  }
  setupAutocomplete();
}

// ============================================================
//  GEOGRAPHY
// ============================================================
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371, dLat = (lat2-lat1)*Math.PI/180, dLng = (lng2-lng1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function bearingDeg(lat1, lng1, lat2, lng2) {
  return (Math.atan2(lng2-lng1, lat2-lat1) * 180/Math.PI + 360) % 360;
}
function bearingArrowSVG(deg) {
  return '<svg width="18" height="18" viewBox="0 0 20 20" style="transform:rotate(' + deg + 'deg);display:inline-block;vertical-align:middle;flex-shrink:0"><polygon points="10,2 14,16 10,13 6,16" fill="currentColor"/></svg>';
}
function bearingLabel(deg) {
  return ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(deg/22.5)%16];
}

// ============================================================
//  FORMAT HELPERS
// ============================================================
function fmtTWh(v) {
  if (v == null) return '—';
  return Math.abs(v) >= 1000 ? (v/1000).toFixed(2) + ' PWh' : v.toFixed(1) + ' TWh';
}
function fmtFlowLabel(v, label) {
  const num = Math.abs(v) >= 1000 ? (v/1000).toFixed(1) + ' PWh' : v.toFixed(1) + ' TWh';
  return num + (label ? ' ' + label : '');
}

// ============================================================
//  STAT BAR / FLOW BAR
// ============================================================
function renderStatBar() {
  const info = ALL_DATA[target.name], latest = info.latestYear;
  const total = info.years[latest]?.Total ?? 0, dpc = info.latestDpc;
  const worldDpc = WORLD_DPC[latest] ?? WORLD_DPC[Math.max(...Object.keys(WORLD_DPC).map(Number))];
  // Same year as the country's figure; fall back to the latest year available
  const worldGen = WORLD_GEN[latest] ?? WORLD_GEN[Math.max(...Object.keys(WORLD_GEN).map(Number))];
  countUp(document.getElementById('stat-total'), total, fmtTWh, 300);
  countUp(document.getElementById('stat-world-gen'), worldGen, v => 'World Avg: ' + fmtTWh(v), 380);
  countUp(document.getElementById('stat-dpc'), dpc, v => v.toFixed(1) + ' MWh', 460);
  countUp(document.getElementById('stat-world'), worldDpc, v => 'World Avg: ' + v.toFixed(1) + ' MWh', 540);
  const yr = document.getElementById('bc-year'); if (yr) yr.textContent = latest;
}

// Two cards side by side: the headline stats (narrow, left) and the energy balance flow chart (wide, right).
// The world-average pills are tinted with the generation and demand colours of the flow chart.
function balanceCardHTML() {
  return '<div id="balance-card">'
    + '<div class="bc-stats">'
    +   '<div class="bc-stat"><span class="stat-label">Total generation</span><span class="stat-value" id="stat-total">—</span><span class="bc-world bc-world--gen" id="stat-world-gen"></span></div>'
    +   '<div class="bc-stat"><span class="stat-label">Demand per capita</span><span class="stat-value" id="stat-dpc">—</span><span class="bc-world bc-world--dem" id="stat-world"></span></div>'
    + '</div>'
    + '<div class="bc-flow">'
    +   '<span class="stat-label">Energy balance — <span id="bc-year"></span></span>'
    +   '<div id="flow-chart"></div>'
    + '</div>'
    + '</div>';
}

// ------------------------------------------------------------
//  ENERGY BALANCE FLOW CHART
//  Boxes at both ends (TWh), ribbons between them (true scale, a trade
//  flow is never thinner than 10 px), each flow's share written inside
//  it next to the left box — or just outside it when the flow is too thin.
// ------------------------------------------------------------
const FLOW_COLORS = { imp: '#e0218a', exp: '#3f3cbb', gen: '#64748b', dem: '#1f2937' };

function renderFlowBar(animate = true) {
  const host = document.getElementById('flow-chart'); if (!host) return;
  const info = ALL_DATA[target.name], latest = info.latestYear, d = info.years[latest] ?? {};
  const gen = d.Total ?? 0, net = d.NetImports ?? 0;
  const imp = Math.max(net, 0), exp = Math.max(-net, 0), use = gen + net;   // demand = generation + net imports
  const w = Math.max(260, Math.round(host.clientWidth || 600)), narrow = w < 420;
  const HMAX = narrow ? 90 : 116, MIN = 10, GAP = 12, FIT = narrow ? 17 : 19;
  const CW = narrow ? 104 : 142, BH = narrow ? 46 : 52;
  const xL = CW, xR = w - CW;
  const r = v => Math.round(v * 10) / 10;
  const pct = v => (v > 0 && v < 10 ? v.toFixed(1) : String(Math.round(v))) + '%';
  const boxH = t => Math.max(BH, t + 12);
  const link = (x0, a0, a1, x1, b0, b1) => {
    const tip = 7, xe = x1 - tip, xm = (x0 + xe) / 2, bm = (b0 + b1) / 2;
    return 'M' + x0 + ' ' + r(a0) + ' C' + r(xm) + ' ' + r(a0) + ' ' + r(xm) + ' ' + r(b0) + ' ' + r(xe) + ' ' + r(b0)
      + ' L' + x1 + ' ' + r(bm) + ' L' + r(xe) + ' ' + r(b1)
      + ' C' + r(xm) + ' ' + r(b1) + ' ' + r(xm) + ' ' + r(a1) + ' ' + x0 + ' ' + r(a1) + ' Z';
  };
  let boxes = '', tags = '', pMain = '', pTrade = '', tradeFrom = FLOW_COLORS.gen, tradeTo = FLOW_COLORS.gen, H = 0;
  let mainTip = '', tradeTip = '';
  const box = (side, y, h, flowT, color, name, val) => {
    const left = side === 'L' ? 0 : xR;
    boxes += '<div class="fc-box" style="left:' + left + 'px;top:' + r(y) + 'px;width:' + CW + 'px;height:' + r(h) + 'px">'
      + '<span class="fc-accent fc-accent--' + side + '" style="top:' + r(h / 2 - flowT / 2 - 1) + 'px;height:' + r(flowT) + 'px;background:' + color + '"></span>'
      + '<span class="fc-name" style="color:' + (color === FLOW_COLORS.dem ? '#374151' : color) + '">' + name + '</span>'
      + '<span class="fc-val">' + fmtTWh(val) + '</span></div>';
  };
  const tag = (y, text, color) => { tags += '<span class="fc-tag" style="left:' + (xL + 10) + 'px;top:' + r(y) + 'px;color:' + color + '">' + text + '</span>'; };

  if (imp > 0) {
    let tI = imp / use * HMAX, tG = gen / use * HMAX;
    if (tI < MIN) { tI = MIN; tG = HMAX - MIN; }
    if (tG < MIN) { tG = MIN; tI = HMAX - MIN; }
    const hI = boxH(tI), hG = boxH(tG), yG = hI + GAP, totL = yG + hG;
    const hD = boxH(tI + tG), yD = (totL - hD) / 2, d0 = yD + hD / 2 - (tI + tG) / 2;
    const cI = hI / 2, cG = yG + hG / 2;
    pTrade = link(xL, cI - tI / 2, cI + tI / 2, xR, d0, d0 + tI);
    pMain  = link(xL, cG - tG / 2, cG + tG / 2, xR, d0 + tI, d0 + tI + tG);
    tradeFrom = tradeTo = FLOW_COLORS.imp;
    box('L', 0, hI, tI, FLOW_COLORS.imp, 'IMPORTED', imp);
    box('L', yG, hG, tG, FLOW_COLORS.gen, 'GENERATED', gen);
    box('R', yD, hD, tI + tG, FLOW_COLORS.dem, 'DEMAND', use);
    tag(tI >= FIT ? cI : cI - tI / 2 - 9, pct(imp / use * 100), '#b0126b');          // too thin: just above
    tag(tG >= FIT ? cG : cG + tG / 2 + 9, pct(gen / use * 100), '#1f2937');          // too thin: just below
    H = totL + 2;
    mainTip  = fmtTWh(gen) + ' generated · ' + pct(gen / use * 100) + ' of demand';
    tradeTip = fmtTWh(imp) + ' imported · ' + pct(imp / use * 100) + ' of demand';
  } else if (exp > 0) {
    let tU = use / gen * HMAX, tE = exp / gen * HMAX;
    if (tE < MIN) { tE = MIN; tU = HMAX - MIN; }
    if (tU < MIN) { tU = MIN; tE = HMAX - MIN; }
    const hU = boxH(tU), hE = boxH(tE), yE = hU + GAP, totR = yE + hE;
    const hG = boxH(tU + tE), yG = (totR - hG) / 2, s0 = yG + hG / 2 - (tU + tE) / 2;
    const cU = hU / 2, cE = yE + hE / 2;
    pMain  = link(xL, s0, s0 + tU, xR, cU - tU / 2, cU + tU / 2);
    pTrade = link(xL, s0 + tU, s0 + tU + tE, xR, cE - tE / 2, cE + tE / 2);
    tradeFrom = FLOW_COLORS.gen; tradeTo = FLOW_COLORS.exp;
    box('L', yG, hG, tU + tE, FLOW_COLORS.gen, 'GENERATED', gen);
    box('R', 0, hU, tU, FLOW_COLORS.dem, 'DEMAND', use);
    box('R', yE, hE, tE, FLOW_COLORS.exp, 'EXPORTED', exp);
    tag(tU >= FIT ? s0 + tU / 2 : s0 - 9, pct(use / gen * 100), '#1f2937');
    tag(tE >= FIT ? s0 + tU + tE / 2 : s0 + tU + tE + 9, pct(exp / gen * 100), '#2f2c9a');   // too thin: just below
    H = Math.max(totR, tE >= FIT ? 0 : s0 + tU + tE + 18) + 2;
    mainTip  = fmtTWh(use) + ' used at home · ' + pct(use / gen * 100) + ' of generation';
    tradeTip = fmtTWh(exp) + ' exported · ' + pct(exp / gen * 100) + ' of generation';
  } else {
    const t = HMAX * 0.6, h = boxH(t), c = h / 2;
    pMain = link(xL, c - t / 2, c + t / 2, xR, c - t / 2, c + t / 2);
    box('L', 0, h, t, FLOW_COLORS.gen, 'GENERATED', gen);
    box('R', 0, h, t, FLOW_COLORS.dem, 'DEMAND', use);
    tag(c, '100%', '#1f2937');
    H = h + 2;
    mainTip = fmtTWh(gen) + ' generated and used at home';
  }
  H = Math.round(H);
  host.className = animate && !REDUCED_MOTION ? 'fc-animate' : '';
  host.style.height = H + 'px';
  // Each ribbon: a soft gradient fill (stronger where it leaves the source, lighter where it lands),
  // a hairline edge in the same colour for definition, a native tooltip, and a "shine" copy that
  // a bright band sweeps across whenever the ambient pulse fires.
  const grad = (id, from, to, a0, a1) => '<linearGradient id="' + id + '" x1="0" x2="1" y1="0" y2="0">'
    + '<stop offset="0" stop-color="' + from + '" stop-opacity="' + a0 + '"/><stop offset="1" stop-color="' + to + '" stop-opacity="' + a1 + '"/></linearGradient>';
  const ribbon = (cls, d, fillId, edge, tip) => '<g class="' + cls + '">'
    + '<path class="fc-fill" d="' + d + '" fill="url(#' + fillId + ')" stroke="' + edge + '" stroke-opacity="0.35" stroke-width="1" stroke-linejoin="round"><title>' + tip + '</title></path>'
    + '<path class="fc-shine" d="' + d + '" fill="url(#fc-shine)" pointer-events="none"/></g>';
  host.innerHTML =
    '<svg width="' + w + '" height="' + H + '" viewBox="0 0 ' + w + ' ' + H + '">'
    + '<defs>'
    + grad('fc-gA', FLOW_COLORS.gen, FLOW_COLORS.dem, 0.36, 0.26)
    + grad('fc-gB', tradeFrom, tradeTo, 0.46, 0.34)
    + '<linearGradient id="fc-shine" gradientUnits="userSpaceOnUse" x1="-180" x2="0" y1="0" y2="0">'
    +   '<stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>'
    +   '<animate class="fc-shine-anim" attributeName="x1" from="-180" to="' + w + '" dur="1.1s" begin="indefinite" fill="freeze"/>'
    +   '<animate class="fc-shine-anim" attributeName="x2" from="0" to="' + (w + 180) + '" dur="1.1s" begin="indefinite" fill="freeze"/>'
    + '</linearGradient></defs>'
    + '<g class="fc-links">'
    + ribbon('fc-link', pMain, 'fc-gA', FLOW_COLORS.gen, mainTip)
    + (pTrade ? ribbon('fc-link fc-link--trade', pTrade, 'fc-gB', tradeTo, tradeTip) : '')
    + '</g></svg>' + boxes + tags;
  host.setAttribute('role', 'img');
  host.setAttribute('aria-label', imp > 0
    ? fmtTWh(gen) + ' generated plus ' + fmtTWh(imp) + ' imported gives ' + fmtTWh(use) + ' of demand'
    : exp > 0 ? fmtTWh(gen) + ' generated: ' + fmtTWh(use) + ' used at home and ' + fmtTWh(exp) + ' exported'
    : fmtTWh(gen) + ' generated, all used at home');
}

// Redraw the flow chart to the new width when the window is resized (no animation).
let flowResizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(flowResizeTimer);
  flowResizeTimer = setTimeout(() => { if (target && document.getElementById('flow-chart')) renderFlowBar(false); }, 150);
});

// ============================================================
//  CHART HELPERS
// ============================================================
function sortedSources(name) {
  const info = ALL_DATA[name], ld = info.years[info.latestYear];
  return [...SOURCES].sort((a,b) => (ld[b]||0) - (ld[a]||0));
}

// ============================================================
//  PRACTICE QUEUE
// ============================================================
function interestScore(c) {
  return (Math.log10(Math.max(c.latestTotal, 1)) + Math.log10(Math.max((c.latestDpc ?? 0) * 10, 1)))
    * ((c.latestTotal < 5 && (c.latestDpc ?? 0) < 1) ? 0.2 : 1);
}

function weightedShuffle(arr) {
  const items = arr.map(c => ({ c, score: interestScore(c) }));
  const result = [];
  while (items.length) {
    const tot = items.reduce((s,x) => s + x.score, 0);
    let rand = Math.random() * tot, idx = 0;
    for (; idx < items.length-1; idx++) { rand -= items[idx].score; if (rand <= 0) break; }
    result.push(items[idx].c); items.splice(idx, 1);
  }
  return result;
}

function applyCooldown(queue, history) {
  const cd = Math.min(Math.floor(POOL.length/2), 12);
  const hot = new Set(history.slice(-cd).map(c => c.iso3));
  return [...queue.filter(c => !hot.has(c.iso3)), ...queue.filter(c => hot.has(c.iso3))];
}

let practiceQueue = [], practiceRetry = [], practiceHistory = [];

function resetPracticeQueue() {
  practiceQueue = weightedShuffle([...POOL]); practiceRetry = []; practiceHistory = [];
}

function nextPracticeCountry() {
  if (practiceQueue.length === 0) {
    practiceQueue = practiceRetry.length > 0
      ? applyCooldown(weightedShuffle(practiceRetry), practiceHistory)
      : applyCooldown(weightedShuffle([...POOL]), practiceHistory);
    practiceRetry = [];
  }
  const next = practiceQueue.shift();
  practiceHistory.push(next);
  if (practiceHistory.length > 200) practiceHistory.shift();
  return next;
}

function recordPracticeResult(won) { if (!won) practiceRetry.push(target); }

// ============================================================
//  RENDER CHARTS
// ============================================================
function renderCharts() {
  const info = ALL_DATA[target.name];
  const years = Object.keys(info.years).map(Number).sort((a,b) => a-b);
  const latest = years[years.length-1], latestData = info.years[latest], ordered = sortedSources(target.name);

  document.getElementById('bar-label').textContent = 'Latest mix (' + latest + ')';
  if (lineChart) { lineChart.destroy(); lineChart = null; }
  if (barChart)  { barChart.destroy();  barChart  = null; }

  // Only chart sources the country has actually used (non-zero in at least one year)
  // — otherwise unused sources render as flat dotted lines along the x-axis
  const activeSources = ordered.filter(src => years.some(y => (info.years[y]?.[src] ?? 0) > 0));
  const srcDS = activeSources.map(src => ({
    label: src, data: years.map(y => info.years[y]?.[src] ?? 0),
    // Colours are functions so a legend highlight (FOCUS_SRC) restyles every point on update
    borderColor: () => focusColor(src, '2e'), backgroundColor: COLORS[src] + '22',
    pointBorderColor: () => focusColor(src, '2e'), pointBackgroundColor: () => focusColor(src, '2e'),
    borderWidth: () => (FOCUS_SRC === src ? 2.6 : 1.5),
    pointRadius: () => (FOCUS_SRC && FOCUS_SRC !== src ? 0 : 1.5),
    pointHoverRadius: 4, fill: false, tension: 0.3,
  }));
  const hidDS = [
    { label:'__total__',      data: years.map(y => info.years[y]?.Total ?? 0) },
    { label:'__netimports__', data: years.map(y => info.years[y]?.NetImports ?? null), spanGaps: true },
    { label:'__demand__',     data: years.map(y => info.years[y]?.Demand ?? null), spanGaps: true },
  ].map(d => ({ ...d, borderColor:'transparent', backgroundColor:'transparent', borderWidth:0, pointRadius:0, pointHoverRadius:0, hidden:true, fill:false, tension:0.3 }));

  lineChart = new Chart(document.getElementById('line-chart').getContext('2d'), {
    type: 'line', data: { labels: years, datasets: [...srcDS, ...hidDS] },
    options: {
      responsive: true, maintainAspectRatio: false,
      animations: lineDrawAnimation(years.length),
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: { enabled: false, external: externalTooltipLine } },
      scales: {
        x: { grid: { color:'#f0f0f0' }, ticks: { color:'#888', font:{size:11}, maxTicksLimit:10, autoSkip:true } },
        y: { grid: { color:'#f0f0f0' }, ticks: { color:'#888', font:{size:11} }, title: { display:true, text:'TWh', color:'#aaa', font:{size:11} } },
      },
    },
  });

  lineChartBornAt = performance.now();

  barChart = new Chart(document.getElementById('bar-chart').getContext('2d'), {
    type: 'bar',
    data: { labels: [''], datasets: [...activeSources].reverse().map(src => ({ label:src, data:[latestData[src]||0], backgroundColor: () => focusColor(src, '40'), borderWidth:0 })) },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: barStackAnimation(),
      plugins: { legend: { display: false }, tooltip: { enabled: false, external: externalTooltipBar } },
      scales: {
        x: { stacked:true, grid:{display:false}, ticks:{display:false} },
        y: { stacked:true, grid:{color:'#f0f0f0'}, ticks:{color:'#888',font:{size:11}}, title:{display:true,text:'TWh',color:'#aaa',font:{size:11}} },
      },
    },
  });

  renderLegend(ordered);
}

function renderLegend(ordered) {
  const info = ALL_DATA[target.name], years = Object.keys(info.years).map(Number);
  document.getElementById('legend-shared').innerHTML = ordered
    .filter(src => years.some(y => (info.years[y]?.[src] ?? 0) > 0))
    .map(src => '<div class="legend-item" data-src="' + src + '" tabindex="0" role="button" aria-pressed="false">'
      + '<span class="legend-swatch" style="background:' + COLORS[src] + '"></span>' + src + '</div>')
    .join('')
    + '<button class="glossary-btn" onclick="showGlossaryModal()"><span class="glossary-icon">?</span> Resource type details</button>';
  bindLegendFocus();
}

// Hover (or tap) a legend item to bring that source forward in both charts.
// A tap locks the highlight until the same item is tapped again.
let lockedSource = null;
function bindLegendFocus() {
  lockedSource = null; FOCUS_SRC = null;
  document.querySelectorAll('#legend-shared .legend-item').forEach(el => {
    const src = el.dataset.src;
    el.addEventListener('mouseenter', () => focusSource(src));
    el.addEventListener('mouseleave', () => focusSource(lockedSource));
    el.addEventListener('focus', () => focusSource(src));
    el.addEventListener('blur', () => focusSource(lockedSource));
    el.addEventListener('click', () => { lockedSource = lockedSource === src ? null : src; focusSource(lockedSource); });
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } });
  });
}

// Highlighted source (null = none). Chart colours read it through focusColor().
let FOCUS_SRC = null;
function focusColor(src, fadedAlpha) {
  return FOCUS_SRC && FOCUS_SRC !== src ? COLORS[src] + fadedAlpha : COLORS[src];
}

function focusSource(src) {
  FOCUS_SRC = src || null;
  if (lineChart) lineChart.update('none');
  if (barChart)  barChart.update('none');
  document.querySelectorAll('#legend-shared .legend-item').forEach(el => {
    el.classList.toggle('is-dim', !!src && el.dataset.src !== src);
    el.classList.toggle('is-on', !!src && el.dataset.src === src);
    el.setAttribute('aria-pressed', String(lockedSource === el.dataset.src));
  });
}

// ============================================================
//  GLOSSARY MODAL
// ============================================================
function showGlossaryModal() {
  const existing = document.getElementById('glossary-modal'); if (existing) existing.remove();
  const modal = document.createElement('div'); modal.id = 'glossary-modal';
  modal.innerHTML =
    '<div class="st-backdrop"></div>'
    + '<div class="st-box gl-box">'
    + '<div class="st-header"><span class="st-title">Resource types</span><button class="st-close" id="gl-close-btn">×</button></div>'
    + '<div class="gl-body">'
    + '<div class="glossary-section"><h3 class="glossary-heading fossil">Fossil fuels</h3><div class="glossary-grid">'
    + '<div class="glossary-item"><span class="glossary-swatch" style="background:#4a4a4a"></span><div><strong>Coal</strong><p>Hard coal and lignite burned in thermal power stations.</p></div></div>'
    + '<div class="glossary-item"><span class="glossary-swatch" style="background:#e8925a"></span><div><strong>Gas</strong><p>Natural gas and LNG burned in gas turbines or combined-cycle plants.</p></div></div>'
    + '<div class="glossary-item"><span class="glossary-swatch" style="background:#c0654a"></span><div><strong>Other Fossil</strong><p>Oil, diesel, heavy fuel oil, petroleum products, and waste incineration.</p></div></div>'
    + '</div></div>'
    + '<div class="glossary-section"><h3 class="glossary-heading low-carbon">Low-carbon</h3><div class="glossary-grid">'
    + '<div class="glossary-item"><span class="glossary-swatch" style="background:#9b6dbd"></span><div><strong>Nuclear</strong><p>Electricity from uranium fission. Very low lifecycle emissions.</p></div></div>'
    + '</div></div>'
    + '<div class="glossary-section"><h3 class="glossary-heading renewables">Renewables</h3><div class="glossary-grid">'
    + '<div class="glossary-item"><span class="glossary-swatch" style="background:#4a90c4"></span><div><strong>Hydro</strong><p>Run-of-river and reservoir hydropower.</p></div></div>'
    + '<div class="glossary-item"><span class="glossary-swatch" style="background:#5ab88a"></span><div><strong>Wind</strong><p>Onshore and offshore wind turbines.</p></div></div>'
    + '<div class="glossary-item"><span class="glossary-swatch" style="background:#f5c842"></span><div><strong>Solar</strong><p>Solar photovoltaic (PV) panels and solar thermal plants.</p></div></div>'
    + '<div class="glossary-item"><span class="glossary-swatch" style="background:#a0724a"></span><div><strong>Bioenergy</strong><p>Biomass burning, biogas, sugarcane bagasse, and wood pellets.</p></div></div>'
    + '<div class="glossary-item"><span class="glossary-swatch" style="background:#2ab5a0"></span><div><strong>Other Renewables</strong><p>Geothermal, tidal, and wave energy.</p></div></div>'
    + '</div></div>'
    + '<p class="glossary-source">Source: <a href="https://ember-climate.org" target="_blank">Ember Global Electricity Review</a></p>'
    + '</div></div>';
  modal.querySelector('.st-backdrop').addEventListener('click', () => modal.remove());
  document.body.appendChild(modal);
  document.getElementById('gl-close-btn').addEventListener('click', () => modal.remove());
}

// ============================================================
//  TOOLTIPS
// ============================================================
function showTooltip(html, canvasEl, caretX, caretY) {
  const tip = document.getElementById('tooltip');
  tip.innerHTML = html;

  // On narrow screens, cap width to viewport and pin to top of chart area
  const isMobile = window.innerWidth <= 600;
  const margin   = 8;
  const maxW     = Math.min(270, window.innerWidth - margin * 2);
  tip.style.maxWidth = maxW + 'px';

  // Temporarily show off-screen to measure height
  tip.style.opacity = '0';
  tip.style.left = '0px';
  tip.style.top  = '0px';
  tip.style.display = 'block';
  const tipH = tip.getBoundingClientRect().height;
  tip.style.display = '';

  const rect = canvasEl.getBoundingClientRect();

  let left, top;

  if (isMobile) {
    // On mobile: centre the tooltip above the chart, pinned just below the header
    left = margin;
    top  = rect.top - tipH - 8;
    // If no room above the chart, show just inside the top of the chart
    if (top < margin) top = rect.top + 8;
  } else {
    // Desktop: prefer right of cursor, flip left if it would overflow
    left = rect.left + caretX + 14;
    top  = rect.top  + caretY - 10;
    if (left + maxW > window.innerWidth - margin) left = rect.left + caretX - maxW - 14;
    if (top  + tipH > window.innerHeight - margin) top = window.innerHeight - tipH - margin;
  }

  // Hard clamp — never let it go off either edge
  left = Math.max(margin, Math.min(left, window.innerWidth  - maxW - margin));
  top  = Math.max(margin, Math.min(top,  window.innerHeight - tipH - margin));

  tip.style.left    = left + 'px';
  tip.style.top     = top  + 'px';
  tip.style.opacity = '1';
}
function hideTooltip() { document.getElementById('tooltip').style.opacity = '0'; }

function tooltipRow(color, label, twh, total, bold) {
  const pct = total > 0 ? (Math.abs(twh)/total*100).toFixed(1) : '0.0';
  return '<div style="display:flex;align-items:center;gap:6px;margin:2px 0">'
    + '<span style="width:8px;height:8px;border-radius:2px;flex-shrink:0;background:' + color + '"></span>'
    + '<span style="min-width:110px;font-size:0.85em;' + (bold ? 'font-weight:600' : '') + '">' + label + '</span>'
    + '<span style="font-weight:500">' + fmtTWh(Math.abs(twh)) + '</span>'
    + '<span style="color:#888;margin-left:3px;font-size:0.85em">(' + pct + '%)</span></div>';
}

function externalTooltipLine(context) {
  const model = context.tooltip; if (model.opacity === 0) { hideTooltip(); return; }
  const year = parseInt(model.title?.[0]), yd = ALL_DATA[target.name]?.years[year] ?? {};
  const total = yd.Total ?? 0, demand = yd.Demand ?? null, netImp = yd.NetImports ?? null;
  let html = '<div style="font-weight:700;font-size:0.9em;margin-bottom:6px;border-bottom:1px solid #eee;padding-bottom:4px">Year: ' + year + '</div>';
  html += tooltipRow('#4a90c4', 'Total generation', total, total, true);
  if (demand !== null && demand > 0) html += tooltipRow('#1a1a1a', 'Demand', demand, total, true);
  if (netImp !== null && netImp !== 0) html += tooltipRow(netImp<0?'#3f3cbb':'#e0218a', netImp<0?'Net exports':'Net imports', Math.abs(netImp), total, true);
  html += '<div style="border-top:1px solid #eee;margin-top:5px;padding-top:5px">';
  model.dataPoints.filter(dp => !dp.dataset.label.startsWith('__') && (dp.parsed?.y ?? 0) > 0)
    .sort((a,b) => (b.parsed?.y??0) - (a.parsed?.y??0))
    .forEach(dp => { html += tooltipRow(COLORS[dp.dataset.label], dp.dataset.label, dp.parsed.y, total, false); });
  html += '</div>'; showTooltip(html, context.chart.canvas, model.caretX, model.caretY);
}

function externalTooltipBar(context) {
  const model = context.tooltip; if (model.opacity === 0) { hideTooltip(); return; }
  const info = ALL_DATA[target.name], latest = info.latestYear, data = info.years[latest], total = data.Total ?? 0;
  let html = '<div style="font-weight:700;font-size:0.9em;margin-bottom:6px;border-bottom:1px solid #eee;padding-bottom:4px">Mix (' + latest + ')</div>';
  html += tooltipRow('#4a90c4', 'Total generation', total, total, true);
  if (data.Demand && data.Demand > 0) html += tooltipRow('#1a1a1a', 'Demand', data.Demand, total, true);
  if (data.NetImports && data.NetImports !== 0) html += tooltipRow(data.NetImports<0?'#3f3cbb':'#e0218a', data.NetImports<0?'Net exports':'Net imports', Math.abs(data.NetImports), total, true);
  html += '<div style="border-top:1px solid #eee;margin-top:5px;padding-top:5px">';
  sortedSources(target.name).filter(src => (data[src]||0) > 0)
    .forEach(src => { html += tooltipRow(COLORS[src], src, data[src], total, false); });
  html += '</div>'; showTooltip(html, context.chart.canvas, model.caretX, model.caretY);
}

document.addEventListener('mousemove', e => {
  const s = document.getElementById('charts-section');
  if (s && !s.contains(e.target)) hideTooltip();
});

// ============================================================
//  FLAGS, CLOSENESS, COMPASS
//  Shared by the guess rows, the result card and the stats screen.
// ============================================================
// ISO 3166 alpha-3 → alpha-2, for flag images (flagcdn.com, public domain flags)
const ISO3_TO_ISO2 = {ABW:'aw',AFG:'af',AGO:'ao',AIA:'ai',ALA:'ax',ALB:'al',AND:'ad',ARE:'ae',ARG:'ar',ARM:'am',ASM:'as',ATA:'aq',ATF:'tf',ATG:'ag',AUS:'au',AUT:'at',AZE:'az',BDI:'bi',BEL:'be',BEN:'bj',BES:'bq',BFA:'bf',BGD:'bd',BGR:'bg',BHR:'bh',BHS:'bs',BIH:'ba',BLM:'bl',BLR:'by',BLZ:'bz',BMU:'bm',BOL:'bo',BRA:'br',BRB:'bb',BRN:'bn',BTN:'bt',BVT:'bv',BWA:'bw',CAF:'cf',CAN:'ca',CCK:'cc',CHE:'ch',CHL:'cl',CHN:'cn',CIV:'ci',CMR:'cm',COD:'cd',COG:'cg',COK:'ck',COL:'co',COM:'km',CPV:'cv',CRI:'cr',CUB:'cu',CUW:'cw',CXR:'cx',CYM:'ky',CYP:'cy',CZE:'cz',DEU:'de',DJI:'dj',DMA:'dm',DNK:'dk',DOM:'do',DZA:'dz',ECU:'ec',EGY:'eg',ERI:'er',ESH:'eh',ESP:'es',EST:'ee',ETH:'et',FIN:'fi',FJI:'fj',FLK:'fk',FRA:'fr',FRO:'fo',FSM:'fm',GAB:'ga',GBR:'gb',GEO:'ge',GGY:'gg',GHA:'gh',GIB:'gi',GIN:'gn',GLP:'gp',GMB:'gm',GNB:'gw',GNQ:'gq',GRC:'gr',GRD:'gd',GRL:'gl',GTM:'gt',GUF:'gf',GUM:'gu',GUY:'gy',HKG:'hk',HMD:'hm',HND:'hn',HRV:'hr',HTI:'ht',HUN:'hu',IDN:'id',IMN:'im',IND:'in',IOT:'io',IRL:'ie',IRN:'ir',IRQ:'iq',ISL:'is',ISR:'il',ITA:'it',JAM:'jm',JEY:'je',JOR:'jo',JPN:'jp',KAZ:'kz',KEN:'ke',KGZ:'kg',KHM:'kh',KIR:'ki',KNA:'kn',KOR:'kr',KWT:'kw',LAO:'la',LBN:'lb',LBR:'lr',LBY:'ly',LCA:'lc',LIE:'li',LKA:'lk',LSO:'ls',LTU:'lt',LUX:'lu',LVA:'lv',MAC:'mo',MAF:'mf',MAR:'ma',MCO:'mc',MDA:'md',MDG:'mg',MDV:'mv',MEX:'mx',MHL:'mh',MKD:'mk',MLI:'ml',MLT:'mt',MMR:'mm',MNE:'me',MNG:'mn',MNP:'mp',MOZ:'mz',MRT:'mr',MSR:'ms',MTQ:'mq',MUS:'mu',MWI:'mw',MYS:'my',MYT:'yt',NAM:'na',NCL:'nc',NER:'ne',NFK:'nf',NGA:'ng',NIC:'ni',NIU:'nu',NLD:'nl',NOR:'no',NPL:'np',NRU:'nr',NZL:'nz',OMN:'om',PAK:'pk',PAN:'pa',PCN:'pn',PER:'pe',PHL:'ph',PLW:'pw',PNG:'pg',POL:'pl',PRI:'pr',PRK:'kp',PRT:'pt',PRY:'py',PSE:'ps',PYF:'pf',QAT:'qa',REU:'re',ROU:'ro',RUS:'ru',RWA:'rw',SAU:'sa',SDN:'sd',SEN:'sn',SGP:'sg',SGS:'gs',SHN:'sh',SJM:'sj',SLB:'sb',SLE:'sl',SLV:'sv',SMR:'sm',SOM:'so',SPM:'pm',SRB:'rs',SSD:'ss',STP:'st',SUR:'sr',SVK:'sk',SVN:'si',SWE:'se',SWZ:'sz',SXM:'sx',SYC:'sc',SYR:'sy',TCA:'tc',TCD:'td',TGO:'tg',THA:'th',TJK:'tj',TKL:'tk',TKM:'tm',TLS:'tl',TON:'to',TTO:'tt',TUN:'tn',TUR:'tr',TUV:'tv',TWN:'tw',TZA:'tz',UGA:'ug',UKR:'ua',UMI:'um',URY:'uy',USA:'us',UZB:'uz',VAT:'va',VCT:'vc',VEN:'ve',VGB:'vg',VIR:'vi',VNM:'vn',VUT:'vu',WLF:'wf',WSM:'ws',XKX:'xk',YEM:'ye',ZAF:'za',ZMB:'zm',ZWE:'zw'};

function flagImg(iso3, cls = 'flag') {
  const a2 = ISO3_TO_ISO2[iso3];
  if (!a2) return '<span class="' + cls + ' flag--none" aria-hidden="true"></span>';
  return '<img class="' + cls + '" src="https://flagcdn.com/w40/' + a2 + '.png" srcset="https://flagcdn.com/w80/' + a2 + '.png 2x"'
    + ' alt="" loading="lazy" decoding="async" onerror="this.style.visibility=\'hidden\'">';
}

// Closeness: 0 km = 100 %, 10,000 km or more = 0 %
function closeness(km) { return Math.max(0, Math.round(100 - km / 100)); }

// Closeness colour: muted red (0 %) → muted amber (50 %) → muted green (100 %)
const CLOSE_STOPS = [[196, 112, 96], [214, 168, 80], [84, 160, 112]];
const WIN_RGB = [63, 154, 99], MISS_RGB = [196, 112, 96];
function closeRGB(p) {
  const t = Math.min(1, Math.max(0, p / 100)), i = t <= 0.5 ? 0 : 1, u = (t - i * 0.5) / 0.5;
  return CLOSE_STOPS[i].map((v, k) => Math.round(v + (CLOSE_STOPS[i + 1][k] - v) * u));
}
function rgbaOf(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
function darker(c) { return rgbaOf(c.map(v => Math.round(v * 0.72)), 1); }

const DIR_NAMES = { N: 'north', NNE: 'north-northeast', NE: 'northeast', ENE: 'east-northeast', E: 'east', ESE: 'east-southeast',
  SE: 'southeast', SSE: 'south-southeast', S: 'south', SSW: 'south-southwest', SW: 'southwest', WSW: 'west-southwest',
  W: 'west', WNW: 'west-northwest', NW: 'northwest', NNW: 'north-northwest' };

// Distance, bearing and closeness from a guessed country to today's answer
function guessInfo(c) {
  const km = Math.round(haversineKm(c.lat, c.lng, target.lat, target.lng));
  const deg = bearingDeg(c.lat, c.lng, target.lat, target.lng);
  return { km, deg, dir: bearingLabel(deg), prox: closeness(km) };
}
function fmtKm(km) { return km.toLocaleString('en-US') + ' km'; }

// Compass: four light arcs with gaps at the cardinal points, points at E, S and W, an "N", and a black needle.
const COMPASS_DIAL = (() => {
  const P = (a, r) => { const q = a * Math.PI / 180; return (26 + r * Math.sin(q)).toFixed(1) + ' ' + (26 - r * Math.cos(q)).toFixed(1); };
  const arcs = [14, 104, 194, 284].map(a => 'M' + P(a, 17) + ' A17 17 0 0 1 ' + P(a + 62, 17)).join(' ');
  const spikes = [90, 180, 270].map(a => 'M' + P(a, 25) + ' L' + P(a - 11, 17) + ' L' + P(a + 11, 17) + ' Z').join(' ');
  return '<svg viewBox="0 0 52 52" width="26" height="26"><path d="' + arcs + '" fill="none" stroke="#c4c9d0" stroke-width="2.5"/>'
    + '<path d="' + spikes + '" fill="#c4c9d0"/>'
    + '<text x="26" y="12.5" text-anchor="middle" font-size="13" font-weight="800" fill="#1a1a1a" font-family="inherit">N</text></svg>';
})();
function compassHTML(deg) {
  return '<span class="gr-compass" aria-hidden="true">' + COMPASS_DIAL
    + '<span class="gr-needle" style="--deg:' + deg.toFixed(1) + 'deg"><svg viewBox="0 0 52 52" width="26" height="26">'
    + '<polygon points="26,12 26,30 17.5,35" fill="#1a1a1a"/><polygon points="26,12 34.5,35 26,30" fill="#4b4b4b"/></svg></span></span>';
}

// ============================================================
//  GUESSES LEFT: a six-cell battery
//  Green with 4-6 left, amber with 2-3, red with the last one. A wrong guess makes the
//  cell it uses flicker out; on a win the cells left glow one after another.
// ============================================================
function renderLives(drain = false) {
  const container = document.getElementById('lives-container'); if (!container) return;
  const left = MAX_GUESSES - guesses.length;
  const color = left >= 4 ? 'is-high' : left >= 2 ? 'is-mid' : 'is-low';
  let cells = '';
  for (let i = 0; i < MAX_GUESSES; i++) {
    const on = i < left, justUsed = drain && i === left;
    cells += '<span class="battery-cell' + (on ? ' is-on ' + color : '') + (justUsed ? ' is-drain' : '') + '"></span>';
  }
  container.innerHTML = '<span class="lives-label">Guesses left</span>'
    + '<span class="battery" role="img" aria-label="' + left + ' of ' + MAX_GUESSES + ' guesses left">'
    +   '<span class="battery-body">' + cells + '</span><span class="battery-cap"></span></span>'
    + '<span class="battery-count">' + left + '/' + MAX_GUESSES + '</span>';
}
function glowBattery(delay) {
  if (REDUCED_MOTION) return;
  document.querySelectorAll('#lives-container .battery-cell.is-on').forEach((c, i) => {
    c.style.animationDelay = (delay + i * 0.1).toFixed(2) + 's'; c.classList.add('is-glow');
  });
}

// ============================================================
//  GUESS LOGIC
// ============================================================
function submitGuess() {
  if (gameOver) return;
  const input = document.getElementById('guess-input'), error = document.getElementById('error');
  const val = input.value.trim();
  if (!val) { error.textContent = 'Please type a country name.'; return; }
  const match = COUNTRIES.find(c => c.name.toLowerCase() === val.toLowerCase());
  if (!match) { error.textContent = '"' + val + '" not found — check spelling.'; return; }
  if (guesses.find(g => g.iso3 === match.iso3)) { error.textContent = 'Already guessed!'; return; }
  error.textContent = '';
  guesses.push(match);
  const isCorrect = match.iso3 === target.iso3;
  renderLives(!isCorrect);
  addGuessRow(match, isCorrect);
  input.value = ''; syncInputFlag(); document.getElementById('autocomplete-list').style.display = 'none';
  saveDailyState();
  if (isCorrect)                          { renderResultCard(true);  endGame(); }
  else if (guesses.length >= MAX_GUESSES) { renderResultCard(false); endGame(); }
}

// One slim row per guess, newest on top.
//   left:  closeness ring around the guess number · flag · country · that country's own figures
//   right: the hint toward the answer (compass, direction, distance) in a pill tinted with the closeness colour
//   under: a thin "live wire" energised up to the closeness level; the ambient pulse sometimes runs along one
function addGuessRow(country, isCorrect, animate = true) {
  const num = guesses.length; // this guess's number (1-based, set after the push)
  const row = document.createElement('div');
  row.className = 'gr-row' + (isCorrect ? ' gr-row--win' : '') + (animate && !REDUCED_MOTION ? ' gr-anim' : '');
  const name = escHtml(country.name);
  if (isCorrect) {
    row.innerHTML = '<span class="gr-sweep" aria-hidden="true"></span><span class="gr-current" aria-hidden="true"></span>'
      + '<div class="gr-winline"><span class="gr-badge">' + num + '</span>'
      + '<span class="gr-name">' + flagImg(country.iso3) + '<span>' + name + '</span></span>'
      + '<span class="gr-wintxt">Puzzle solved in ' + num + '</span>'
      + '<span class="gr-check" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span></div>';
  } else {
    const h = guessInfo(country), col = closeRGB(h.prox);
    const L = 2 * Math.PI * 13, filled = L * h.prox / 100;
    row.style.setProperty('--cl', col.join(','));
    const facts = fmtTWh(country.latestTotal) + ' generated'
      + (country.latestDpc != null ? '<span class="gr-dot">·</span>' + country.latestDpc.toFixed(1) + ' MWh/person' : '');
    row.innerHTML = '<div class="gr-main">'
      + '<button type="button" class="gr-num" aria-label="Guess ' + num + ', closeness ' + h.prox + '%">'
      +   '<svg viewBox="0 0 30 30" width="30" height="30" aria-hidden="true"><circle class="gr-ring-bg" cx="15" cy="15" r="13"/>'
      +   '<circle class="gr-ring" cx="15" cy="15" r="13" stroke-dasharray="' + filled.toFixed(1) + ' ' + L.toFixed(1) + '" style="--c:' + filled.toFixed(1) + '" transform="rotate(-90 15 15)"/></svg>'
      +   '<span class="gr-n">' + num + '</span>'
      +   '<span class="gr-tip" role="tooltip">Closeness ' + h.prox + '% (' + fmtKm(h.km) + ' away). The fuller and greener the ring, the closer this guess is to the answer.</span>'
      + '</button>'
      + '<span class="gr-who"><span class="gr-name">' + flagImg(country.iso3) + '<span title="' + name + '">' + name + '</span></span>'
      +   '<span class="gr-facts">' + facts + '</span></span>'
      + '<button type="button" class="gr-hint" aria-label="Hint: the answer is ' + fmtKm(h.km) + ' ' + DIR_NAMES[h.dir] + ' of ' + name + '">'
      +   '<span class="gr-pill">' + compassHTML(h.deg) + '<span class="gr-dir">' + h.dir + '</span>'
      +   '<span class="gr-km" style="color:' + darker(col) + '">' + fmtKm(h.km) + '</span></span>'
      +   '<span class="gr-htip" role="tooltip">Hint toward the answer: it lies about ' + fmtKm(h.km) + ' to the ' + DIR_NAMES[h.dir] + ' of ' + name
      +   '. The figures on the left are ' + name + '’s own.</span>'
      + '</button></div>'
      + '<span class="gr-wire" aria-hidden="true"><span class="gr-wire-fill" style="width:' + h.prox + '%"></span></span>';
  }
  const container = document.getElementById('guesses');
  container.insertBefore(row, container.firstChild);
}

// Tap to open a row's tooltip on touch screens (hover does it on desktop); a tap anywhere else closes it
document.addEventListener('click', e => {
  const t = e.target.closest('.gr-num, .gr-hint');
  document.querySelectorAll('.gr-num.is-open, .gr-hint.is-open').forEach(el => { if (el !== t) el.classList.remove('is-open'); });
  if (t) t.classList.toggle('is-open');
});

// ------------------------------------------------------------
//  RESULT CARD (replaces the old emoji banner, sits where the input was)
//  The guesses are stops on a line, in order, each the country's flag in its closeness colour.
//  Win: a current runs along the line to the answer, which lights green.
//  Loss: the current stops at the last guess; a dashed gap leads to the answer, revealed greyed out.
// ------------------------------------------------------------
function pathModel(won) {
  const path = won ? guesses.slice() : guesses.concat([target]);
  const n = path.length, last = n - 1;
  const frac = i => (last ? i / last : 0);
  const liveEnd = won ? 1 : (last > 1 ? frac(last - 1) : 0);
  const nodes = path.map((c, i) => {
    const isAns = c.iso3 === target.iso3, h = isAns ? null : guessInfo(c);
    return { c, isAns, h, frac: frac(i), col: isAns ? (won ? WIN_RGB : MISS_RGB) : closeRGB(h.prox) };
  });
  const live = nodes.filter((nd, i) => won || i < last);
  const stops = live.map(nd => rgbaOf(nd.col, 0.85) + ' ' + (liveEnd ? nd.frac / liveEnd * 100 : 0).toFixed(1) + '%').join(', ');
  return { nodes, n, liveEnd, stops };
}

function pathHTML(won, mini, animate) {
  const m = pathModel(won), RUN = Math.min(1.6, 0.4 + 0.3 * (m.n - 1)), START = 0.35;
  const at = nd => (!won && nd.isAns ? START + RUN * m.liveEnd + 0.35 : START + RUN * nd.frac);
  const lineW = (m.liveEnd * 100).toFixed(2) + '%';
  let line = '';
  if (m.n > 1) {
    line = '<span class="go-linebox">'
      + '<span class="go-line" style="width:' + lineW + ';background:linear-gradient(90deg,' + m.stops + ');--dur:' + (RUN * m.liveEnd).toFixed(2) + 's;--at:' + START + 's"></span>'
      + (won ? '' : '<span class="go-gap" style="left:' + lineW + ';--at:' + (START + RUN * m.liveEnd).toFixed(2) + 's"></span>')
      + (mini ? '' : '<span class="go-spark" style="--to:' + lineW + ';--dur:' + (RUN * m.liveEnd).toFixed(2) + 's;--at:' + START + 's"></span>')
      + '</span>';
  }
  const nodes = m.nodes.map(nd => {
    const title = nd.isAns ? nd.c.name + (won ? ', the answer' : ', the answer you missed')
      : nd.c.name + ', ' + fmtKm(nd.h.km) + ' away (' + nd.h.prox + '% close)';
    const cls = 'go-node' + (nd.isAns ? ' go-node--answer' : '') + (!won && nd.isAns ? ' go-node--miss' : '');
    return '<span class="' + cls + '" style="--cl:' + nd.col.join(',') + ';--at:' + at(nd).toFixed(2) + 's" title="' + escHtml(title) + '">'
      + '<span class="go-ring">' + flagImg(nd.c.iso3, 'go-flag') + '</span>'
      + (nd.isAns && !mini ? '<span class="go-badge" aria-hidden="true">' + (won ? '✓' : '?') + '</span>' : '')
      + (nd.isAns && won && !mini ? '<span class="go-burst" aria-hidden="true"></span>' : '')
      + '</span>';
  }).join('');
  const labels = mini ? '' : '<div class="go-labels">' + m.nodes.map(nd =>
      '<span class="go-label' + (nd.isAns ? ' go-label--answer' : '') + '" style="--at:' + at(nd).toFixed(2) + 's;color:'
      + (nd.isAns ? (won ? '#2f7a4d' : '#a85a4a') : darker(nd.col)) + '">' + (nd.isAns ? escHtml(nd.c.name) : fmtKm(nd.h.km)) + '</span>').join('') + '</div>';
  return { html: '<div class="go-path' + (mini ? ' go-path--mini' : '') + (m.n === 1 ? ' go-path--one' : '') + (animate && !REDUCED_MOTION ? ' go-anim' : '') + '">'
      + '<div class="go-track">' + line + '<div class="go-nodes">' + nodes + '</div></div>' + labels + '</div>',
    doneAt: START + RUN + 0.2 };
}

let resultTicker = null;
function renderResultCard(won, animate = true) {
  const host = document.getElementById('banner'); if (!host) return;
  const p = pathHTML(won, false, animate);
  let summary;
  if (won) {
    summary = guesses.length > 1
      ? 'Your guesses closed in from ' + fmtKm(guessInfo(guesses[0]).km) + ' to ' + escHtml(target.name) + '.'
      : 'First guess, straight to ' + escHtml(target.name) + '.';
  } else {
    const best = guesses.map(c => [c, guessInfo(c)]).sort((a, b) => a[1].km - b[1].km)[0];
    summary = 'Closest guess: ' + escHtml(best[0].name) + ', ' + fmtKm(best[1].km) + ' away. '
      + escHtml(target.name) + ' lay to its ' + DIR_NAMES[best[1].dir] + '.';
  }
  const tagline = MODE === 'practice' ? escHtml(practiceSubtitle().replace(/ · \d+ countries$/, '') || 'Practice') : 'Puzzle #' + getDayNumber();
  const foot = MODE === 'practice'
    ? '<span class="go-next">Practice round</span>'
      + '<div class="go-actions"><button type="button" class="go-btn go-btn--dark" onclick="newGame()">Next puzzle ↺</button></div>'
    : '<span class="go-next">Next puzzle in <strong id="go-countdown">' + getCountdown() + '</strong></span>'
      + '<div class="go-actions"><button type="button" class="go-btn" onclick="showStatsModal(true)">Stats</button>'
      + '<button type="button" class="go-btn go-btn--dark" onclick="copyShare(this)">Share</button></div>';
  host.innerHTML = '<div class="go-card ' + (won ? 'go-card--won' : 'go-card--lost') + (animate && !REDUCED_MOTION ? ' go-anim' : '') + '">'
    + '<div class="go-head"><span class="go-title">' + (won ? 'Your path to ' + escHtml(target.name) : 'Out of guesses. It was ' + escHtml(target.name) + '.') + '</span>'
    + '<span class="go-tag">' + tagline + '</span></div>'
    + p.html
    + '<p class="go-summary">' + summary + '</p>'
    + '<div class="go-foot">' + foot + '</div></div>';
  if (won && animate) glowBattery(p.doneAt);
  clearInterval(resultTicker);
  if (MODE !== 'practice') resultTicker = setInterval(() => {
    const el = document.getElementById('go-countdown'); if (!el) { clearInterval(resultTicker); return; }
    el.textContent = getCountdown();
  }, 1000);
}

function endGame() {
  gameOver = true; saveDailyState();
  if (MODE === 'practice') recordPracticeResult(guesses.length > 0 && guesses[guesses.length-1].iso3 === target.iso3);
  if (MODE === 'normal') {
    const won = guesses.length > 0 && guesses[guesses.length-1].iso3 === target.iso3;
    recordDailyResult(won, guesses.length);
    // Returning player: submit now, stats after 2.5s.
    // First-time player: after 2.5s ask for a name FIRST, then submit, then show stats —
    // previously both modals opened together and the stats modal covered the name prompt,
    // so many first-time scores (wins and losses) were never sent.
    if (getUsername()) {
      submitDailyScore();
      setTimeout(() => showStatsModal(true), 2500);
    } else {
      setTimeout(() => ensureUsername().then(() => { submitDailyScore(); showStatsModal(true); }), 2500);
    }
  }
  document.getElementById('input-area').style.display   = 'none';
  if (MODE === 'normal') {
    const switcher = document.getElementById('mode-nav');
    if (switcher) { const tmp = document.createElement('div'); tmp.innerHTML = modeSwitcherHTML(); switcher.replaceWith(tmp.firstElementChild); }
  }
}

// Sends today's result once. `scoreSubmitted` is saved in the daily state, so a score that
// failed to send (no name yet, tab closed, network error) is retried on the next visit.
async function submitDailyScore() {
  const username = getUsername();
  if (!username || scoreSubmitted || !gameOver || MODE !== 'normal') return;
  const won = guesses.length > 0 && guesses[guesses.length-1].iso3 === target.iso3;
  const ok = await sbInsert({ username, day: getDayNumber(), guesses: guesses.length, won });
  if (ok) {
    scoreSubmitted = true;
    saveDailyState();
    loadPodium(); // refresh in case the top 3 changed
  }
}

// ============================================================
//  AUTOCOMPLETE
// ============================================================
function setupAutocomplete() {
  const input = document.getElementById('guess-input'), list = document.getElementById('autocomplete-list');
  let activeIdx = -1;
  function getItems() { return list.querySelectorAll('.ac-item'); }
  function highlight(idx) {
    const items = getItems(); items.forEach(el => el.classList.remove('ac-active'));
    if (idx >= 0 && idx < items.length) { items[idx].classList.add('ac-active'); items[idx].scrollIntoView({ block: 'nearest' }); }
    activeIdx = idx;
  }
  function selectActive() {
    const items = getItems();
    if (activeIdx >= 0 && activeIdx < items.length) { input.value = items[activeIdx].textContent; syncInputFlag(); list.style.display = 'none'; activeIdx = -1; return true; }
    return false;
  }
  function buildList(q) {
    activeIdx = -1;
    // Empty query: show the full eligible pool (alphabetical, scrollable).
    // POOL is the active country set, so practice categories are filtered automatically.
    const source = [...POOL].sort((a,b) => a.name.localeCompare(b.name));
    const matches = q.length === 0 ? source : source.filter(c => c.name.toLowerCase().includes(q));
    if (!matches.length) { list.style.display = 'none'; return; }
    list.innerHTML = '';
    matches.forEach(c => {
      const item = document.createElement('div'); item.className = 'ac-item';
      item.innerHTML = flagImg(c.iso3, 'ac-flag') + '<span>' + escHtml(c.name) + '</span>';
      item.addEventListener('mousedown', e => { e.preventDefault(); input.value = c.name; syncInputFlag(); list.style.display = 'none'; activeIdx = -1; });
      list.appendChild(item);
    });
    list.style.display = 'block';
  }
  input.addEventListener('input', () => { syncInputFlag(); buildList(input.value.toLowerCase().trim()); });
  input.addEventListener('focus', () => buildList(input.value.toLowerCase().trim()));
  input.addEventListener('keydown', e => {
    const items = getItems(), open = list.style.display === 'block' && items.length > 0;
    if (e.key === 'ArrowDown') { e.preventDefault(); highlight(open ? Math.min(activeIdx+1, items.length-1) : 0); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); highlight(open ? Math.max(activeIdx-1, 0) : items.length-1); }
    else if (e.key === 'Tab' && open) {
      // Tab behaves exactly like Enter: select the highlighted suggestion
      // (or the first one if none is highlighted) into the input field.
      e.preventDefault();
      if (activeIdx === -1) highlight(0);
      selectActive();
    }
    else if (e.key === 'Enter') { if (open && activeIdx >= 0) { e.preventDefault(); selectActive(); } else { list.style.display = 'none'; submitGuess(); } }
    else if (e.key === 'Escape') { list.style.display = 'none'; activeIdx = -1; }
  });
  document.addEventListener('click', e => { if (!e.target.closest('#autocomplete-wrapper')) { list.style.display = 'none'; activeIdx = -1; } });
}

// Show the flag inside the input once the text matches a country exactly
function syncInputFlag() {
  const input = document.getElementById('guess-input'), slot = document.getElementById('guess-flag');
  if (!input || !slot) return;
  const val = input.value.trim().toLowerCase();
  const match = val ? COUNTRIES.find(c => c.name.toLowerCase() === val) : null;
  const key = match ? match.iso3 : '';
  if (slot.dataset.iso3 === key) return;
  slot.dataset.iso3 = key;
  slot.innerHTML = match ? flagImg(match.iso3, 'ac-flag') : '';
  slot.parentNode.classList.toggle('has-flag', !!match);
}

// ============================================================
//  DAILY GAME
// ============================================================
function restoreDailyGame() {
  target = getDailyTarget(COUNTRIES); guesses = []; gameOver = false; scoreSubmitted = false;
  document.getElementById('guesses').innerHTML      = '';
  document.getElementById('banner').innerHTML       = '';
  document.getElementById('error').textContent      = '';
  document.getElementById('input-area').style.display   = 'flex';
  document.getElementById('guess-input').value      = ''; syncInputFlag();
  renderLives(); renderStatBar(); renderFlowBar(); renderCharts();
  const saved = loadDailyState();
  if (saved && saved.guesses.length > 0) {
    for (const iso3 of saved.guesses) {
      const country = COUNTRIES.find(c => c.iso3 === iso3); if (!country) continue;
      guesses.push(country); addGuessRow(country, country.iso3 === target.iso3, false);
    }
    renderLives();
    if (saved.gameOver) {
      const won = guesses.length > 0 && guesses[guesses.length-1].iso3 === target.iso3;
      gameOver = true; renderResultCard(won, false);
      document.getElementById('input-area').style.display   = 'none';
      // Saved states from before this fix have no flag — treat them as already sent
      // so nobody gets a duplicate row today.
      scoreSubmitted = saved.submitted !== false;
      if (!scoreSubmitted) {
        if (getUsername()) submitDailyScore();
        else setTimeout(() => ensureUsername().then(submitDailyScore), 1000);
      }
    }
  }
}

// ============================================================
//  PRACTICE GAME
// ============================================================
function newGame() {
  target = nextPracticeCountry(); guesses = []; gameOver = false;
  document.getElementById('guesses').innerHTML      = '';
  document.getElementById('banner').innerHTML       = '';
  document.getElementById('error').textContent      = '';
  document.getElementById('input-area').style.display   = 'flex';
  document.getElementById('guess-input').value      = ''; syncInputFlag();
  renderLives(); renderStatBar(); renderFlowBar(); renderCharts();
}

// ============================================================
//  SHARE + COUNTDOWN
// ============================================================
// Each wrong guess becomes a square by closeness: 🟥 under 40 %, 🟧 40-74 %, 🟨 75 % and up; the answer is 🟩.
function shareSquare(c) {
  if (c.iso3 === target.iso3) return '🟩';
  const p = guessInfo(c).prox;
  return p >= 75 ? '🟨' : p >= 40 ? '🟧' : '🟥';
}

function buildShareText() {
  const won = guesses.length > 0 && guesses[guesses.length-1].iso3 === target.iso3;
  const score = won ? guesses.length : 'X';
  return 'Energle ⚡ #' + getDayNumber() + '  ' + score + '/' + MAX_GUESSES + '\n' + guesses.map(shareSquare).join('') + '\nhttps://energle.org';
}

function copyShare(btn) {
  btn = btn || document.getElementById('share-btn');
  const label = btn ? btn.textContent : 'Share';
  const reset = () => { if (btn) setTimeout(() => { btn.textContent = label; }, 2000); };
  navigator.clipboard.writeText(buildShareText())
    .then(() => { if (btn) btn.textContent = 'Copied!'; reset(); })
    .catch(() => { if (btn) btn.textContent = 'Copy failed'; reset(); });
}

function getCountdown() {
  const now = new Date(), next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()+1));
  const diff = next - now;
  const h = Math.floor(diff/3600000), m = Math.floor((diff%3600000)/60000), s = Math.floor((diff%60000)/1000);
  return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
}

// ============================================================
//  STATS MODAL
// ============================================================
// ============================================================
//  STATS MODAL
//  Personal header (avatar, name, all-time rank), today's result,
//  a row of four numbers, and the guess distribution as shares of games played.
//  Stats live in this browser; the name and rank come from the leaderboard.
// ============================================================
const AVATAR_COLORS = ['#4a90c4', '#5ab88a', '#e8925a', '#9b6dbd', '#2ab5a0', '#c0654a'];

function avatarColor(name) {
  let h = 0;
  for (const ch of name) h = (h + ch.charCodeAt(0)) % 997;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function showStatsModal(afterGame) {
  const existing = document.getElementById('stats-modal'); if (existing) existing.remove();
  const stats = loadStats();
  const name = getUsername();
  const winPct = stats.played > 0 ? Math.round(stats.won / stats.played * 100) : 0;
  const solvedGuesses = [1, 2, 3, 4, 5, 6].reduce((s, k) => s + k * (stats.dist[k] || 0), 0);
  const avg = stats.won > 0 ? (solvedGuesses / stats.won).toFixed(1) : '–';
  const won = afterGame && gameOver && MODE === 'normal' && guesses.length > 0 && guesses[guesses.length - 1].iso3 === target.iso3;
  const currentKey = afterGame && gameOver && MODE === 'normal' ? (won ? guesses.length : 'X') : null;

  // Header: who these stats belong to
  const header = '<div class="sx-head">'
    + '<span class="sx-avatar" aria-hidden="true" style="background:' + (name ? avatarColor(name) : '#c9c9c6') + '">'
    +   (name ? escHtml(name.charAt(0).toUpperCase()) : '?') + '</span>'
    + '<div class="sx-who"><span class="sx-name">' + (name ? escHtml(name) : 'Guest') + '</span>'
    +   '<span class="sx-sub" id="sx-rank">' + (name ? 'Looking up your rank…' : 'Not on the leaderboard yet. You pick a name after your first daily.') + '</span></div>'
    + '<button class="sx-close" id="st-close-btn" aria-label="Close">×</button></div>';

  // Today's result, only right after the daily
  let today = '';
  if (afterGame && MODE === 'normal' && gameOver) {
    const streakLine = won
      ? (stats.streak > 1 ? stats.streak + ' days in a row.' + (stats.streak >= stats.bestStreak ? ' Your best run yet.' : '') : 'Streak started. See you tomorrow.')
      : 'Streak reset.';
    // Today's result with the same guess path as the result card, in miniature
    today = '<div class="sx-today ' + (won ? 'sx-today--won' : 'sx-today--lost') + '">'
      + '<div class="sx-today-top"><span class="sx-today-title">' + (won
          ? 'Puzzle #' + getDayNumber() + ' solved in ' + guesses.length
          : 'Puzzle #' + getDayNumber() + ': it was ' + escHtml(target.name)) + '</span>'
      + '<span class="sx-today-sub">' + streakLine + '</span></div>'
      + pathHTML(won, true, false).html + '</div>';
  }

  const tiles = [[stats.played, 'Played'], [winPct + '%', 'Win rate'], [stats.streak, 'Streak'], [stats.bestStreak, 'Best streak']]
    .map(([v, l]) => '<div class="sx-tile"><span class="sx-tile-num">' + v + '</span><span class="sx-tile-lbl">' + l + '</span></div>').join('');

  const rows = [1, 2, 3, 4, 5, 6, 'X'].map((k, i) => {
    const n = stats.dist[k] || 0, share = stats.played ? n / stats.played : 0, isToday = k === currentKey;
    const cls = isToday ? (k === 'X' ? ' sx-fill--lost' : ' sx-fill--today') : (k === 'X' ? ' sx-fill--x' : '');
    return '<div class="sx-row"><span class="sx-key">' + k + '</span>'
      + '<span class="sx-track"><span class="sx-fill' + cls + '" style="width:' + (share * 100).toFixed(1) + '%;animation-delay:' + (0.12 + i * 0.06).toFixed(2) + 's">'
      +   (isToday ? '<span class="sx-pulse"></span>' : '') + '</span></span>'
      + '<span class="sx-count' + (n ? '' : ' sx-count--zero') + (isToday ? ' sx-count--today' : '') + '">'
      + (n ? n + ' · ' + Math.round(share * 100) + '%' : '–') + '</span></div>';
  }).join('');

  const cdId = 'stcd' + Date.now();
  const modal = document.createElement('div'); modal.id = 'stats-modal';
  modal.innerHTML =
    '<div class="st-backdrop"></div>'
    + '<div class="sx-box" role="dialog" aria-label="Statistics">'
    + header + today
    + '<div class="sx-tiles">' + tiles + '</div>'
    + '<div class="sx-dist-head"><span>Guesses to solve</span><span>avg ' + avg + '</span></div>'
    + '<div class="sx-dist">' + rows + '</div>'
    + '<div class="sx-foot">'
    +   '<div class="sx-next"><span class="sx-next-lbl">Next puzzle</span><span class="sx-next-time" id="' + cdId + '">' + getCountdown() + '</span></div>'
    +   '<div class="sx-actions">'
    +     (afterGame && MODE === 'normal' ? '<button class="sx-btn sx-btn--dark" id="share-btn" onclick="copyShare(this)">Share</button>' : '')
    +     (afterGame ? '<button class="sx-btn" onclick="document.getElementById(\'stats-modal\').remove();switchMode(\'practice\')">Practice</button>' : '')
    +   '</div>'
    + '</div>'
    + (afterGame && MODE === 'normal' && gameOver
        ? '<div class="sx-share"><span class="sx-share-lbl">Share copies</span><pre class="sx-share-txt">' + escHtml(buildShareText()) + '</pre></div>' : '')
    + '</div>';

  modal.querySelector('.st-backdrop').addEventListener('click', () => modal.remove());
  document.body.appendChild(modal);
  document.getElementById('st-close-btn').addEventListener('click', () => modal.remove());
  const ticker = setInterval(() => {
    const el = document.getElementById(cdId); if (!el) { clearInterval(ticker); return; }
    el.textContent = getCountdown();
  }, 1000);

  // All-time rank and Weighted Score, from the same view as the leaderboard
  if (name) {
    sbFetchAllTime().then(rows => {
      const el = document.getElementById('sx-rank'); if (!el) return;
      const i = rows.findIndex(r => (r.username || '').toLowerCase() === name.toLowerCase());
      el.textContent = i >= 0
        ? 'All-time rank #' + (i + 1) + ' of ' + rows.length + ' · Weighted score ' + Number(rows[i].score).toFixed(2)
        : 'Not ranked yet. Finish a daily puzzle to appear on the leaderboard.';
    }).catch(() => { const el = document.getElementById('sx-rank'); if (el) el.textContent = 'Playing on the leaderboard as ' + name; });
  }
}

// ============================================================
//  LEADERBOARD MODAL
// ============================================================
function showLeaderboardModal(tab = 'today') {
  const existing = document.getElementById('lb-modal'); if (existing) existing.remove();
  const modal = document.createElement('div'); modal.id = 'lb-modal';
  modal.innerHTML =
    '<div class="st-backdrop"></div>'
    // `lb-box` makes this modal larger than the shared .st-box (see style.css)
    + '<div class="st-box lb-box">'
    + '<div class="st-header"><span class="st-title">Leaderboard</span><button class="st-close" id="lb-close-btn">×</button></div>'
    + '<div class="lb-tabs">'
    + '<button class="lb-tab' + (tab === 'today' ? ' lb-tab--active' : '') + '" id="lb-tab-today" onclick="lbSwitchTab(\'today\')">Today</button>'
    + '<button class="lb-tab' + (tab === 'alltime' ? ' lb-tab--active' : '') + '" id="lb-tab-alltime" onclick="lbSwitchTab(\'alltime\')">All Time</button>'
    + '</div>'
    + '<div class="lb-body" id="lb-body"><div class="lb-loading">Loading…</div></div>'
    + '</div>';
  modal.querySelector('.st-backdrop').addEventListener('click', () => modal.remove());
  document.body.appendChild(modal);
  document.getElementById('lb-close-btn').addEventListener('click', () => modal.remove());
  lbLoadTab(tab);
}

function lbSwitchTab(tab) {
  document.querySelectorAll('.lb-tab').forEach(b => b.classList.remove('lb-tab--active'));
  document.getElementById('lb-tab-' + tab).classList.add('lb-tab--active');
  document.getElementById('lb-body').innerHTML = '<div class="lb-loading">Loading…</div>';
  lbLoadTab(tab);
}

async function lbLoadTab(tab) {
  const me = getUsername();
  try {
    const rows = tab === 'today' ? await sbFetchToday(getDayNumber()) : await sbFetchAllTime();
    tab === 'today' ? renderLbToday(rows, me) : renderLbAllTime(rows, me);
  } catch {
    document.getElementById('lb-body').innerHTML = '<div class="lb-loading">Could not load scores.</div>';
  }
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function renderLbToday(rows, me) {
  if (!rows.length) {
    document.getElementById('lb-body').innerHTML = '<div class="lb-empty">No scores yet for Puzzle #' + getDayNumber() + '. Be the first!</div>';
    return;
  }
  // Sort by effective score: a loss counts as 7 so it always ranks below any win.
  // Ties broken by submission time (earlier first).
  const effScore = r => r.won ? r.guesses : 7;
  const sorted = [...rows].sort((a,b) =>
    effScore(a) - effScore(b) ||
    new Date(a.created_at) - new Date(b.created_at)
  );
  const medals = ['🥇','🥈','🥉'];
  document.getElementById('lb-body').innerHTML = '<div class="lb-list">' + sorted.map((r, i) => {
    const isMe = me && r.username.toLowerCase() === me.toLowerCase();
    const rank = i < 3 ? medals[i] : (i+1) + '.';
    const scoreStr = r.won ? r.guesses + '/6' : 'X/6';
    return '<div class="lb-row' + (isMe ? ' lb-row--me' : '') + '">'
      + '<span class="lb-rank">' + rank + '</span>'
      + '<span class="lb-name">' + escHtml(r.username) + (isMe ? ' 👤' : '') + '</span>'
      + '<span class="lb-score' + (r.won ? ' lb-score--won' : ' lb-score--lost') + '">' + scoreStr + '</span>'
      + '</div>';
  }).join('') + '</div>';
}

// Rows arrive aggregated and sorted by the `leaderboard_alltime` view:
// { username, played, avg_guesses, score, site_avg } — one row per player, best score first.
function renderLbAllTime(rows, me) {
  if (!rows.length) {
    document.getElementById('lb-body').innerHTML = '<div class="lb-empty">No scores yet.</div>';
    return;
  }
  const medals  = ['🥇','🥈','🥉'];
  const typical = Number(rows[0].site_avg).toFixed(2); // average guesses per game, all players

  // How fast your score becomes your own. Your results make up n/(n+m) of the score,
  // where m (weight_games) = 2 × the puzzles played by the player behind a typical result
  // = 2 × sum(played²) / sum(played). One-off visitors barely move it; regulars raise it.
  const weight = Math.round(Number(rows[0].weight_games));
  const pace = '<li>Your score is halfway to your own Avg after about <strong>' + weight + ' puzzles</strong>. '
    + 'It isn\'t a fixed number: it\'s recalculated from everyone\'s results, so it rises as regulars keep playing and one-off visits barely change it.</li>';

  // Explanation: hidden until the player taps "Weighted Score ⓘ" in the column header
  const info =
    '<div class="lb-info-panel" id="lb-info-panel" hidden>'
    + '<div class="lb-info-head"><span>How the ranking works</span>'
    + '<button class="lb-info-close" onclick="lbToggleInfo()" aria-label="Close">×</button></div>'
    + '<ul>'
    + '<li><strong>Weighted Score decides your rank.</strong> It combines how few guesses you need with how many puzzles you\'ve played. Lower is better.</li>'
    + '<li>After only a few puzzles, your score stays close to a typical result on Energle (<strong>' + typical + ' guesses</strong>). Every puzzle you play moves it closer to your own Avg.</li>'
    + pace
    + '<li>So one lucky puzzle won\'t put you on top, but playing well regularly will, whenever you started.</li>'
    + '</ul>'
    + '<div class="lb-info-sub">The other columns</div>'
    + '<ul>'
    + '<li><strong>Win %:</strong> the share of daily puzzles you solved.</li>'
    + '<li><strong>Avg:</strong> your average number of guesses per puzzle. A puzzle you didn\'t solve counts as 7.</li>'
    + '<li><strong>Played:</strong> how many daily puzzles you\'ve played. Only your first try at each one counts.</li>'
    + '</ul></div>';

  let dividerShown = false;
  const body = rows.map((r, i) => {
    const isMe  = me && r.username.toLowerCase() === me.toLowerCase();
    const rank  = i < 3 ? medals[i] : (i+1) + '.';
    const score = Number(r.score);
    // Reference line where scores pass the typical result
    let divider = '';
    if (!dividerShown && score > Number(typical)) {
      dividerShown = true;
      divider = '<div class="lb-avg-divider"><span>Typical result · ' + typical + '</span></div>';
    }
    return divider
      + '<div class="lb-row lb-row--alltime' + (isMe ? ' lb-row--me' : '') + '">'
      + '<span class="lb-rank">' + rank + '</span>'
      + '<span class="lb-name">' + escHtml(r.username) + (isMe ? ' 👤' : '') + '</span>'
      + '<span class="lb-score' + (Number(r.win_pct) >= 50 ? ' lb-score--won' : '') + '">' + Number(r.win_pct) + '%</span>'
      + '<span class="lb-score">' + Number(r.avg_guesses).toFixed(2) + '</span>'
      + '<span class="lb-score">' + r.played + '</span>'
      + '<span class="lb-score lb-score--main">' + score.toFixed(2) + '</span>'
      + '</div>';
  }).join('');

  document.getElementById('lb-body').innerHTML = info
    + '<div class="lb-list">'
    + '<div class="lb-header-row">'
    + '<span class="lb-rank">#</span>'
    + '<span class="lb-name">Player</span>'
    + '<span class="lb-score lb-score--hdr">Win %</span>'
    + '<span class="lb-score lb-score--hdr">Avg</span>'
    + '<span class="lb-score lb-score--hdr">Played</span>'
    + '<button class="lb-score lb-score--hdr lb-score--main-hdr lb-info-btn" id="lb-info-btn" onclick="lbToggleInfo()" aria-expanded="false" title="How the ranking works">'
    +   'Weighted Score <span class="lb-info-icon">i</span></button>'
    + '</div>'
    + body
    + '</div>';
}

function lbToggleInfo() {
  const panel = document.getElementById('lb-info-panel');
  const btn   = document.getElementById('lb-info-btn');
  if (!panel) return;
  panel.hidden = !panel.hidden;
  btn.setAttribute('aria-expanded', String(!panel.hidden));
  if (!panel.hidden) document.getElementById('lb-body').scrollTop = 0;
}

// ============================================================
//  BOOT
// ============================================================
loadData();
