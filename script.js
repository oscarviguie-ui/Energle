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
    return res.ok;
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

async function sbFetchAllTime() {
  try {
    const res = await fetch(
      SUPABASE_URL + '/rest/v1/scores?order=username.asc,day.asc&limit=5000',
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
      day: getDayNumber(), guesses: guesses.map(g => g.iso3), gameOver,
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
let ALL_DATA = null, WORLD_DPC = null, COUNTRIES = [], POOL = [];
let target = null, guesses = [], gameOver = false;
let lineChart = null, barChart = null;
let MODE = 'normal', PRACTICE_CAT = null;

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
  return `<div class="mode-switcher">
    <button class="mode-btn ${dA}" onclick="switchMode('normal')">Daily</button>
    <button class="mode-btn ${pA} ${lC}" onclick="switchMode('practice')">Practice${lI}</button>
    <button class="mode-btn" onclick="showStatsModal(false)">Stats</button>
    <button class="mode-btn" onclick="showLeaderboardModal()">Leaderboard</button>
  </div>`;
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
    '<header><div class="header-top"><h1>⚡ Energle</h1>' + modeSwitcherHTML() + '</div>'
    + '<div class="subtitle-row"><p class="subtitle">Browse all country energy profiles</p>'
    + '<button id="back-to-cats">← Categories</button></div></header>'
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
    '<header><div class="header-top"><h1>⚡ Energle</h1>' + modeSwitcherHTML() + '</div>'
    + '<div class="subtitle-row"><p class="subtitle">' + country.name + ' · ' + (country.continent || '') + '</p>'
    + '<button id="back-to-browse">← Browse</button></div></header>'
    + '<div id="stat-bar">'
    + '<div class="stat-item"><span class="stat-label">Total generation</span><span class="stat-value" id="stat-total">—</span></div>'
    + '<div class="stat-divider"></div>'
    + '<div class="stat-item"><span class="stat-label">Demand per capita</span><span class="stat-value" id="stat-dpc">—</span></div>'
    + '<div class="stat-item stat-world"><span class="stat-label">World average</span><span class="stat-value" id="stat-world">—</span></div>'
    + '</div>'
    + '<div id="flow-bar"><div class="flow-label">Energy balance — latest year</div>'
    + '<div class="flow-track" id="flow-track"></div>'
    + '<div class="flow-legend">'
    + '<span class="flow-legend-item"><span class="flow-swatch generation"></span>Generation</span>'
    + '<span class="flow-legend-item"><span class="flow-swatch exports"></span>Net exports</span>'
    + '<span class="flow-legend-item"><span class="flow-swatch imports"></span>Net imports</span>'
    + '</div></div>'
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
    '<header><div class="header-top"><h1>⚡ Energle</h1>' + modeSwitcherHTML() + '</div>'
    + '<p class="subtitle">Choose a category to practice</p></header>'
    + '<div class="cat-grid">' + cards + '</div>'
    + '<div class="browse-btn-wrap"><button class="browse-all-btn" onclick="tryBrowse()">🔍 Browse all countries</button></div>'
    + '<footer><p>Data: <a href="https://ember-climate.org" target="_blank">Ember Global Electricity Review</a></p></footer>';
}

// ============================================================
//  INIT
// ============================================================
function initApp() { POOL = COUNTRIES; renderGameScreen(); restoreDailyGame(); }

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
    '<header><div class="header-top"><h1>⚡ Energle</h1>' + modeSwitcherHTML() + '</div>'
    + '<div class="subtitle-row"><p class="subtitle">' + subtitle + '</p>' + backBtn + '</div></header>'
    + '<div id="lives-container"></div>'
    + '<div id="stat-bar">'
    + '<div class="stat-item"><span class="stat-label">Total generation</span><span class="stat-value" id="stat-total">—</span></div>'
    + '<div class="stat-divider"></div>'
    + '<div class="stat-item"><span class="stat-label">Demand per capita</span><span class="stat-value" id="stat-dpc">—</span></div>'
    + '<div class="stat-item stat-world"><span class="stat-label">World average</span><span class="stat-value" id="stat-world">—</span></div>'
    + '</div>'
    + '<div id="flow-bar"><div class="flow-label">Energy balance — latest year</div>'
    + '<div class="flow-track" id="flow-track"></div>'
    + '<div class="flow-legend">'
    + '<span class="flow-legend-item"><span class="flow-swatch generation"></span>Generation</span>'
    + '<span class="flow-legend-item"><span class="flow-swatch exports"></span>Net exports</span>'
    + '<span class="flow-legend-item"><span class="flow-swatch imports"></span>Net imports</span>'
    + '</div></div>'
    + '<div id="charts-section">'
    + '<div id="chart-left"><p class="chart-label">Generation by source over time (TWh)</p><div id="line-wrapper"><canvas id="line-chart"></canvas></div></div>'
    + '<div id="chart-right"><p class="chart-label" id="bar-label">Latest year mix</p><div id="bar-wrapper"><canvas id="bar-chart"></canvas></div></div>'
    + '</div>'
    + '<div id="legend-shared"></div>'
    + '<div id="input-area"><div id="autocomplete-wrapper">'
    + '<input id="guess-input" type="text" placeholder="Type a country name…" autocomplete="off" />'
    + '<div id="autocomplete-list"></div></div>'
    + '<button id="submit-btn">Guess</button></div>'
    + '<p id="error"></p>'
    + '<div id="guesses"></div>'
    + '<div id="banner"></div>'
    + '<button id="new-game-btn" style="display:none">' + (isPractice ? 'Next puzzle ↺' : 'Come back tomorrow 🌙') + '</button>'
    + '<footer><p>Data: <a href="https://ember-climate.org" target="_blank">Ember Global Electricity Review</a></p></footer>';

  document.getElementById('submit-btn').addEventListener('click', submitGuess);
  document.getElementById('new-game-btn').addEventListener('click', () => { if (MODE === 'practice') newGame(); });
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
  document.getElementById('stat-total').textContent = fmtTWh(total);
  document.getElementById('stat-dpc').textContent   = dpc != null ? dpc.toFixed(1) + ' MWh / person (' + latest + ')' : '—';
  document.getElementById('stat-world').textContent = worldDpc != null ? worldDpc.toFixed(1) + ' MWh / person' : '—';
}

function renderFlowBar() {
  const info = ALL_DATA[target.name], latest = info.latestYear, d = info.years[latest];
  const gen = d.Total ?? 0, netImp = d.NetImports ?? 0, demand = d.Demand ?? 0;
  const track = document.getElementById('flow-track'); track.innerHTML = '';
  if (netImp < 0) {
    const gp = (demand/gen*100).toFixed(1), ep = (Math.abs(netImp)/gen*100).toFixed(1);
    track.innerHTML = seg('generation', gp, fmtFlowLabel(demand, 'demand'), fmtFlowLabel(demand, 'demand') + ' (' + gp + '% of generation)')
      + seg('exports', ep, fmtFlowLabel(Math.abs(netImp), 'exported'), fmtFlowLabel(Math.abs(netImp), 'exported') + ' (' + ep + '% of generation)');
  } else {
    const tot = demand > 0 ? demand : gen + netImp;
    const gp = (gen/tot*100).toFixed(1), ip = (netImp/tot*100).toFixed(1);
    track.innerHTML = seg('generation', gp, fmtFlowLabel(gen, 'generated'), fmtFlowLabel(gen, 'generated') + ' (' + gp + '% of demand)')
      + seg('imports', Math.max(ip, 0), fmtFlowLabel(netImp, 'imported'), fmtFlowLabel(netImp, 'imported') + ' (' + ip + '% of demand)');
  }
}

function seg(cls, pct, il, tl) {
  const p = Math.max(0, Math.min(100, parseFloat(pct)));
  if (p < 0.1) return '';
  return '<div class="flow-segment ' + cls + '" style="width:' + p + '%" title="' + tl + '"><span>' + (p > 10 ? il : '') + '</span></div>';
}

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
    borderColor: COLORS[src], backgroundColor: COLORS[src] + '22',
    borderWidth: 1.5, pointRadius: 1.5, pointHoverRadius: 4, fill: false, tension: 0.3,
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
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: { enabled: false, external: externalTooltipLine } },
      scales: {
        x: { grid: { color:'#f0f0f0' }, ticks: { color:'#888', font:{size:11}, maxTicksLimit:10, autoSkip:true } },
        y: { grid: { color:'#f0f0f0' }, ticks: { color:'#888', font:{size:11} }, title: { display:true, text:'TWh', color:'#aaa', font:{size:11} } },
      },
    },
  });

  barChart = new Chart(document.getElementById('bar-chart').getContext('2d'), {
    type: 'bar',
    data: { labels: [''], datasets: [...activeSources].reverse().map(src => ({ label:src, data:[latestData[src]||0], backgroundColor:COLORS[src], borderWidth:0 })) },
    options: {
      responsive: true, maintainAspectRatio: false,
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
    .map(src => '<div class="legend-item"><span class="legend-swatch" style="background:' + COLORS[src] + '"></span>' + src + '</div>')
    .join('')
    + '<button class="glossary-btn" onclick="showGlossaryModal()"><span class="glossary-icon">?</span> Resource type details</button>';
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
  if (netImp !== null && netImp !== 0) html += tooltipRow(netImp<0?'#2ab5a0':'#e8925a', netImp<0?'Net exports':'Net imports', Math.abs(netImp), total, true);
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
  if (data.NetImports && data.NetImports !== 0) html += tooltipRow(data.NetImports<0?'#2ab5a0':'#e8925a', data.NetImports<0?'Net exports':'Net imports', Math.abs(data.NetImports), total, true);
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
//  LIVES
// ============================================================
function renderLives() {
  const container = document.getElementById('lives-container'); container.innerHTML = '';
  const label = document.createElement('span'); label.className = 'lives-label'; label.textContent = 'Guesses left:';
  container.appendChild(label);
  for (let i = 0; i < MAX_GUESSES; i++) {
    const dot = document.createElement('div');
    dot.className = 'life' + (i < MAX_GUESSES - guesses.length ? ' active' : '');
    container.appendChild(dot);
  }
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
  guesses.push(match); renderLives();
  const isCorrect = match.iso3 === target.iso3;
  addGuessRow(match, isCorrect);
  input.value = ''; document.getElementById('autocomplete-list').style.display = 'none';
  saveDailyState();
  if (isCorrect)                          { showBanner(true);  endGame(); }
  else if (guesses.length >= MAX_GUESSES) { showBanner(false); endGame(); }
}

function addGuessRow(country, isCorrect) {
  const row = document.createElement('div'); row.className = 'guess-row' + (isCorrect ? ' correct' : '');
  const num = guesses.length; // this guess's number (1-based, set after push in submitGuess)
  const nameEl = document.createElement('span'); nameEl.className = 'guess-name';
  nameEl.innerHTML = '<span class="guess-num">' + num + '</span>' + (isCorrect ? '✓ ' : '✗ ') + country.name;
  row.appendChild(nameEl);
  if (!isCorrect) {
    const dist    = Math.round(haversineKm(country.lat, country.lng, target.lat, target.lng));
    const bearing = bearingDeg(country.lat, country.lng, target.lat, target.lng);
    const worldDpc = WORLD_DPC[country.latestYear] ?? WORLD_DPC[Math.max(...Object.keys(WORLD_DPC).map(Number))];
    const hint = document.createElement('span'); hint.className = 'guess-hint';
    hint.innerHTML =
      '<span class="guess-arrow">' + bearingArrowSVG(bearing) + '</span>'
      + '<span class="guess-direction">' + bearingLabel(bearing) + '</span>'
      + '<span class="hint-divider">·</span>'
      + '<span>' + dist.toLocaleString() + ' km</span>'
      + '<span class="hint-divider">·</span>'
      + '<span>' + fmtTWh(country.latestTotal) + ' generated</span>'
      + (country.latestDpc != null
        ? '<span class="hint-divider">·</span>'
          + '<span>' + country.latestDpc.toFixed(1) + ' MWh/person</span>'
          + '<span style="color:#bbb"> (world avg: ' + (worldDpc?.toFixed(1) ?? '—') + ')</span>'
        : '');
    row.appendChild(hint);
  }
  // Newest guess at the top, directly under the input box
  const container = document.getElementById('guesses');
  container.insertBefore(row, container.firstChild);
}

function showBanner(won) {
  const div = document.createElement('div'); div.className = won ? 'win' : 'lose';
  div.textContent = won
    ? '🎉 Correct in ' + guesses.length + (guesses.length === 1 ? ' guess!' : ' guesses!')
    : '❌ The answer was ' + target.name + (MODE === 'practice' ? '. Keep practising!' : '. Better luck tomorrow!');
  const banner = document.getElementById('banner'); banner.innerHTML = ''; banner.appendChild(div);
}

function endGame() {
  gameOver = true; saveDailyState();
  if (MODE === 'practice') recordPracticeResult(guesses.length > 0 && guesses[guesses.length-1].iso3 === target.iso3);
  if (MODE === 'normal') {
    const won = guesses.length > 0 && guesses[guesses.length-1].iso3 === target.iso3;
    recordDailyResult(won, guesses.length);
    // If username already set, submit immediately; otherwise prompt after 2.5s
    // so the player can see their result first
    const submitScore = (username) => {
      sbInsert({ username, day: getDayNumber(), guesses: guesses.length, won }).catch(() => {});
    };
    if (getUsername()) {
      submitScore(getUsername());
    } else {
      setTimeout(() => ensureUsername().then(submitScore), 2500);
    }
  }
  document.getElementById('input-area').style.display   = 'none';
  document.getElementById('new-game-btn').style.display = 'block';
  if (MODE === 'normal') {
    const switcher = document.querySelector('.mode-switcher');
    if (switcher) { const tmp = document.createElement('div'); tmp.innerHTML = modeSwitcherHTML(); switcher.replaceWith(tmp.firstElementChild); }
    // 2.5s delay so banner is fully visible before stats modal opens
    setTimeout(() => showStatsModal(true), 2500);
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
    if (activeIdx >= 0 && activeIdx < items.length) { input.value = items[activeIdx].textContent; list.style.display = 'none'; activeIdx = -1; return true; }
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
      const item = document.createElement('div'); item.className = 'ac-item'; item.textContent = c.name;
      item.addEventListener('mousedown', e => { e.preventDefault(); input.value = c.name; list.style.display = 'none'; activeIdx = -1; });
      list.appendChild(item);
    });
    list.style.display = 'block';
  }
  input.addEventListener('input', () => buildList(input.value.toLowerCase().trim()));
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

// ============================================================
//  DAILY GAME
// ============================================================
function restoreDailyGame() {
  target = getDailyTarget(COUNTRIES); guesses = []; gameOver = false;
  document.getElementById('guesses').innerHTML      = '';
  document.getElementById('banner').innerHTML       = '';
  document.getElementById('error').textContent      = '';
  document.getElementById('input-area').style.display   = 'flex';
  document.getElementById('new-game-btn').style.display = 'none';
  document.getElementById('guess-input').value      = '';
  renderLives(); renderStatBar(); renderFlowBar(); renderCharts();
  const saved = loadDailyState();
  if (saved && saved.guesses.length > 0) {
    for (const iso3 of saved.guesses) {
      const country = COUNTRIES.find(c => c.iso3 === iso3); if (!country) continue;
      guesses.push(country); addGuessRow(country, country.iso3 === target.iso3);
    }
    renderLives();
    if (saved.gameOver) {
      const won = guesses.length > 0 && guesses[guesses.length-1].iso3 === target.iso3;
      showBanner(won); gameOver = true;
      document.getElementById('input-area').style.display   = 'none';
      document.getElementById('new-game-btn').style.display = 'block';
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
  document.getElementById('new-game-btn').style.display = 'none';
  document.getElementById('guess-input').value      = '';
  renderLives(); renderStatBar(); renderFlowBar(); renderCharts();
}

// ============================================================
//  SHARE + COUNTDOWN
// ============================================================
function buildShareText() {
  const won = guesses.length > 0 && guesses[guesses.length-1].iso3 === target.iso3;
  const score = won ? guesses.length : 'X';
  let grid = '';
  for (let i = 0; i < guesses.length; i++) grid += guesses[i].iso3 === target.iso3 ? '🟩' : '🟥';
  if (!won) for (let i = guesses.length; i < MAX_GUESSES; i++) grid += '⬛';
  return 'Energle ⚡ #' + getDayNumber() + '  ' + score + '/' + MAX_GUESSES + '\n' + grid + '\nhttps://oscarviguie-ui.github.io/Energle/';
}

function copyShare() {
  navigator.clipboard.writeText(buildShareText()).then(() => {
    const btn = document.getElementById('share-btn');
    if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Share 📋'; }, 2000); }
  }).catch(() => { const btn = document.getElementById('share-btn'); if (btn) btn.textContent = 'Copy failed'; });
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
function showStatsModal(afterGame) {
  const existing = document.getElementById('stats-modal'); if (existing) existing.remove();
  const stats = loadStats(), winPct = stats.played > 0 ? Math.round(stats.won/stats.played*100) : 0;
  const maxDist = Math.max(1, ...Object.values(stats.dist));
  const won = afterGame && gameOver && MODE === 'normal' && guesses.length > 0 && guesses[guesses.length-1].iso3 === target.iso3;
  const currentKey = afterGame && gameOver && MODE === 'normal' ? (won ? guesses.length : 'X') : null;

  const distRows = [1,2,3,4,5,6,'X'].map(k => {
    const val = stats.dist[k] || 0, pct = Math.round(val/maxDist*100), isCurrent = k === currentKey;
    return '<div class="st-dist-row"><span class="st-dist-label">' + k + '</span>'
      + '<div class="st-dist-bar-wrap"><div class="st-dist-bar' + (isCurrent ? ' st-dist-bar--current' : '') + '" style="width:max(' + pct + '%,24px)">' + val + '</div></div></div>';
  }).join('');

  // Today's result banner shown at top of modal when opened after a game
  const todayResult = (afterGame && MODE === 'normal' && gameOver)
    ? ('<div class="st-today ' + (won ? 'st-today--won' : 'st-today--lost') + '">'
      + (won
        ? '🎉 Puzzle #' + getDayNumber() + ' solved in ' + guesses.length + (guesses.length === 1 ? ' guess' : ' guesses') + '!'
        : '❌ Puzzle #' + getDayNumber() + ' — the answer was <strong>' + target.name + '</strong>')
      + '</div>')
    : '';

  const cdId = 'stcd' + Date.now();
  const modal = document.createElement('div'); modal.id = 'stats-modal';
  modal.innerHTML =
    '<div class="st-backdrop"></div>'
    + '<div class="st-box">'
    + '<div class="st-header"><span class="st-title">Statistics</span><button class="st-close" id="st-close-btn">×</button></div>'
    + todayResult
    + '<div class="st-grid">'
    + '<div class="st-stat"><span class="st-num">' + stats.played + '</span><span class="st-lbl">Played</span></div>'
    + '<div class="st-stat"><span class="st-num">' + winPct + '</span><span class="st-lbl">Win %</span></div>'
    + '<div class="st-stat"><span class="st-num">' + stats.streak + '</span><span class="st-lbl">Streak</span></div>'
    + '<div class="st-stat"><span class="st-num">' + stats.bestStreak + '</span><span class="st-lbl">Best</span></div>'
    + '</div>'
    + '<div class="st-section-title">Guess distribution</div>'
    + '<div class="st-dist">' + distRows + '</div>'
    + '<div class="st-footer">'
    + '<div class="st-countdown-wrap"><span class="st-countdown-lbl">Next puzzle</span><span class="st-countdown" id="' + cdId + '">' + getCountdown() + '</span></div>'
    + (afterGame && MODE === 'normal' ? '<button class="st-share-btn" id="share-btn" onclick="copyShare()">Share 📋</button>' : '')
    + (afterGame ? '<button class="st-practice-btn" onclick="document.getElementById(\'stats-modal\').remove();switchMode(\'practice\')">Practice →</button>' : '')
    + '</div></div>';

  modal.querySelector('.st-backdrop').addEventListener('click', () => modal.remove());
  document.body.appendChild(modal);
  document.getElementById('st-close-btn').addEventListener('click', () => modal.remove());
  const ticker = setInterval(() => {
    const el = document.getElementById(cdId); if (!el) { clearInterval(ticker); return; }
    el.textContent = getCountdown();
  }, 1000);
}

// ============================================================
//  LEADERBOARD MODAL
// ============================================================
function showLeaderboardModal() {
  const existing = document.getElementById('lb-modal'); if (existing) existing.remove();
  const modal = document.createElement('div'); modal.id = 'lb-modal';
  modal.innerHTML =
    '<div class="st-backdrop"></div>'
    + '<div class="st-box">'
    + '<div class="st-header"><span class="st-title">Leaderboard</span><button class="st-close" id="lb-close-btn">×</button></div>'
    + '<div class="lb-tabs">'
    + '<button class="lb-tab lb-tab--active" id="lb-tab-today" onclick="lbSwitchTab(\'today\')">Today</button>'
    + '<button class="lb-tab" id="lb-tab-alltime" onclick="lbSwitchTab(\'alltime\')">All Time</button>'
    + '</div>'
    + '<div class="lb-body" id="lb-body"><div class="lb-loading">Loading…</div></div>'
    + '</div>';
  modal.querySelector('.st-backdrop').addEventListener('click', () => modal.remove());
  document.body.appendChild(modal);
  document.getElementById('lb-close-btn').addEventListener('click', () => modal.remove());
  lbLoadTab('today');
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

function renderLbAllTime(rows, me) {
  if (!rows.length) {
    document.getElementById('lb-body').innerHTML = '<div class="lb-empty">No scores yet.</div>';
    return;
  }
  const agg = {};
  rows.forEach(r => {
    if (!agg[r.username]) agg[r.username] = { played:0, won:0, totalGuesses:0, streak:0, bestStreak:0, lastDay:0 };
    const a = agg[r.username]; a.played++;
    a.totalGuesses += r.won ? r.guesses : 7; // count a loss as 7 (worse than max)
    if (r.won) { a.won++; a.streak = r.day === a.lastDay+1 ? a.streak+1 : 1; a.bestStreak = Math.max(a.bestStreak, a.streak); }
    else { a.streak = 0; }
    a.lastDay = r.day;
  });
  const sorted = Object.entries(agg)
    .map(([username, s]) => ({
      username, ...s,
      avgGuesses: (s.totalGuesses / s.played).toFixed(2),
      winPct: Math.round(s.won / s.played * 100),
    }))
    // Rank by win% desc, then games played desc, then avg guesses asc (lower = better)
    .sort((a,b) => b.winPct - a.winPct || b.played - a.played || parseFloat(a.avgGuesses) - parseFloat(b.avgGuesses));
  const medals = ['🥇','🥈','🥉'];
  document.getElementById('lb-body').innerHTML = '<div class="lb-list">'
    + '<div class="lb-header-row">'
    + '<span class="lb-rank">#</span>'
    + '<span class="lb-name">Player</span>'
    + '<span class="lb-score lb-score--hdr">Win %</span>'
    + '<span class="lb-score lb-score--hdr">Avg</span>'
    + '<span class="lb-score lb-score--hdr">Played</span>'
    + '</div>'
    + sorted.map((r, i) => {
        const isMe = me && r.username.toLowerCase() === me.toLowerCase();
        const rank = i < 3 ? medals[i] : (i+1) + '.';
        return '<div class="lb-row lb-row--alltime' + (isMe ? ' lb-row--me' : '') + '">'
          + '<span class="lb-rank">' + rank + '</span>'
          + '<span class="lb-name">' + escHtml(r.username) + (isMe ? ' 👤' : '') + '</span>'
          + '<span class="lb-score' + (r.winPct >= 50 ? ' lb-score--won' : '') + '">' + r.winPct + '%</span>'
          + '<span class="lb-score lb-score--won">' + r.avgGuesses + '</span>'
          + '<span class="lb-score">' + r.played + '</span>'
          + '</div>';
      }).join('')
    + '</div>';
}

// ============================================================
//  BOOT
// ============================================================
loadData();
