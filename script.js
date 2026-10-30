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

// Today's average path (see path_stats.sql). Only running totals are stored, never a player's guesses.
async function sbRecordPath(day, kms, iso3s) {
  try {
    const res = await fetch(SUPABASE_URL + '/rest/v1/rpc/record_path', {
      method: 'POST', headers: SB_HEADERS,
      body: JSON.stringify({ p_day: day, p_km: kms, p_iso3: iso3s }),
    });
    return res.ok;
  } catch { return false; }
}
async function sbFetchPathStats(day) {
  try {
    const [t, c] = await Promise.all([
      fetch(SUPABASE_URL + '/rest/v1/path_totals?day=eq.' + day + '&select=step,players,sum_km&order=step.asc', { headers: SB_HEADERS }),
      fetch(SUPABASE_URL + '/rest/v1/guess_counts?day=eq.' + day + '&select=step,iso3,n&order=step.asc,n.desc', { headers: SB_HEADERS }),
    ]);
    return { totals: t.ok ? await t.json() : [], counts: c.ok ? await c.json() : [] };
  } catch { return { totals: [], counts: [] }; }
}
// Every row of a list, read in pages of 1000 (the most Supabase returns in one request)
async function sbFetchPaged(url) {
  const out = [], PAGE = 1000;
  for (let off = 0; off < 50000; off += PAGE) {
    const res = await fetch(url + '&limit=' + PAGE + '&offset=' + off, { headers: SB_HEADERS });
    if (!res.ok) break;
    const rows = await res.json();
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}
async function sbFetchToday(day) {
  try {
    return await sbFetchPaged(SUPABASE_URL + '/rest/v1/scores?day=eq.' + day + '&order=guesses.asc,created_at.asc,username.asc');
  } catch { return []; }
}

// This player's own results, by puzzle number (first row per day)
async function sbFetchMine(username) {
  try {
    const res = await fetch(SUPABASE_URL + '/rest/v1/scores?username=eq.' + encodeURIComponent(username)
      + '&select=day,guesses,won,created_at&order=created_at.asc&limit=2000', { headers: SB_HEADERS });
    if (!res.ok) return {};
    const out = {};
    (await res.json()).forEach(r => { if (!out[r.day]) out[r.day] = { n: r.guesses, won: r.won }; });
    return out;
  } catch { return {}; }
}

// All-time stats are aggregated in Postgres by the `leaderboard_alltime` view
// (one row per player, first attempt per day only). Ranked by Weighted Score
// (lower is better), ties broken by more puzzles played. The podium uses the same order.
async function sbFetchAllTime(limit) {     // no limit: every player
  const url = SUPABASE_URL + '/rest/v1/leaderboard_alltime?order=score.asc,played.desc,username.asc';
  try {
    if (limit) { const res = await fetch(url + '&limit=' + limit, { headers: SB_HEADERS }); return res.ok ? res.json() : []; }
    return await sbFetchPaged(url);
  } catch { return []; }
}

// Since 2010 (or the first year with data): how much the mix and the output changed; and trade in the latest year
function trendFacts(info, yd, total) {
  const SRC = ['Coal','Gas','Other Fossil','Nuclear','Hydro','Wind','Solar','Bioenergy','Other Renewables'];
  const first = info.years['2010'] || info.years[Object.keys(info.years).sort()[0]] || {};
  const t0 = first.Total || 0;
  const mixChange = total > 0 && t0 > 0 ? 0.5 * SRC.reduce((a, k) => a + Math.abs((yd[k] || 0) / total - (first[k] || 0) / t0), 0) : null;
  const ni = yd.NetImports, dem = yd.Demand;
  return {
    mixChange,                                                              // 0 to 1: share of the mix that switched source
    growth:      t0 > 0 ? total / t0 : null,                                // latest generation / 2010 generation
    importShare: ni > 0 && dem > 0 ? ni / dem : 0,                          // net imports as a share of demand
    exportShare: ni < 0 && total > 0 ? -ni / total : 0,                     // net exports as a share of generation
  };
}

// ============================================================
//  PRACTICE CATEGORIES
// ============================================================
const PRACTICE_CATEGORIES = [
  { id:'all',      group:'region',  label:'All countries',          rule:'Every country in the game',          filter: c => true },
  { id:'europe',   group:'region',  label:'Europe',                 rule:'',                                   filter: c => c.continent === 'Europe' },
  { id:'africa',   group:'region',  label:'Africa',                 rule:'',                                   filter: c => c.continent === 'Africa' },
  { id:'asia',     group:'region',  label:'Asia & Pacific',         rule:'',                                   filter: c => c.continent === 'Asia' || c.continent === 'Oceania' },
  { id:'americas', group:'region',  label:'Americas',               rule:'',                                   filter: c => c.continent === 'North America' || c.continent === 'South America' },
  { id:'major',    group:'profile', label:'Major producers',        rule:'Generate 100 TWh or more a year',     filter: c => c.latestTotal >= 100 },
  { id:'highcap',  group:'profile', label:'High use per person',    rule:'Use 7 MWh or more per person',        filter: c => (c.latestDpc ?? 0) >= 7 },
  { id:'green',    group:'profile', label:'Green leaders',          rule:'70% or more from renewables',         filter: c => (c.renewablePct ?? 0) >= 70 },
  { id:'fossil',   group:'profile', label:'Fossil heavy',           rule:'90% or more from fossil fuels',       filter: c => (c.fossilPct ?? 0) >= 90 },
  { id:'lowcap',   group:'profile', label:'Low use per person',     rule:'Use under 0.5 MWh per person',        filter: c => (c.latestDpc ?? 0) > 0 && (c.latestDpc ?? 0) < 0.5 },
  { id:'movers',   group:'trend',   label:'Fast movers',            rule:'Mix changed by 30+ points since 2010',  filter: c => (c.mixChange ?? 0) >= 0.30 },
  { id:'growing',  group:'trend',   label:'Growing fast',           rule:'Generation at least doubled since 2010', filter: c => (c.growth ?? 0) >= 2 },
  { id:'falling',  group:'trend',   label:'Generating less',        rule:'Generation down 10%+ since 2010',       filter: c => c.growth != null && c.growth <= 0.9 },
  { id:'importers',group:'trend',   label:'Big importers',          rule:'Imports cover 20%+ of demand',          filter: c => c.importShare >= 0.20 },
  { id:'exporters',group:'trend',   label:'Power exporters',        rule:'Export 10%+ of what they generate',     filter: c => c.exportShare >= 0.10 },
];
const REGION_LABEL = { 'Europe': 'Europe', 'Africa': 'Africa', 'Asia': 'Asia', 'Oceania': 'Oceania', 'North America': 'N. America', 'South America': 'S. America' };

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

// ------------------------------------------------------------
//  DAILY ANSWERS
//  The answers live in a locked Supabase table. The website can only call released_puzzles(),
//  which returns the puzzles that have already started (up to today, by the database's own clock).
//  Nothing in this file or in the repository can tell a future answer.
// ------------------------------------------------------------
let RELEASED = null;           // { day: ISO3 } for every puzzle up to today; null = could not be loaded

async function sbReleasedPuzzles() {
  try {
    const res = await fetch(SUPABASE_URL + '/rest/v1/rpc/released_puzzles', { method: 'POST', headers: SB_HEADERS, body: '{}', cache: 'no-store' });
    if (!res.ok) return null;
    const rows = await res.json();
    if (!Array.isArray(rows) || !rows.length) return null;
    return Object.fromEntries(rows.map(r => [r.day, r.iso3]));
  } catch { return null; }
}

function getDailyTarget(countries, day = getDayNumber()) {
  const iso = RELEASED && RELEASED[day];
  return (iso && countries.find(c => c.iso3 === iso)) || null;
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
  if (MODE === 'archive') {
    const prev = loadHistory()[ARCHIVE_DAY];
    if (prev && prev.done) return;                     // a finished puzzle is never overwritten
    saveHistoryEntry(ARCHIVE_DAY, { g: guesses.map(g => g.iso3), c: SHOP.saveData(), done: gameOver, src: 'archive' });
    return;
  }
  if (MODE !== 'normal') return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      day: getDayNumber(), guesses: guesses.map(g => g.iso3), gameOver, submitted: scoreSubmitted, pathSent,
      cards: SHOP.saveData(), cardsSent: SHOP.sent,
    }));
  } catch {}
  saveHistoryEntry(getDayNumber(), { g: guesses.map(g => g.iso3), c: SHOP.saveData(), done: gameOver, src: 'daily', ps: pathSent });
}

// Every puzzle played on this device: { day: { g: [ISO3 guesses], done, src: 'daily' | 'archive', ps: added to the average path } }.
// Kept from 25 Oct 2026; older days are known only from the scores table (result, not the guesses).
const LS_HISTORY_KEY = 'energle_history_v1';
function loadHistory() {
  try { return JSON.parse(localStorage.getItem(LS_HISTORY_KEY)) || {}; } catch { return {}; }
}
function saveHistoryEntry(day, entry) {
  try { const h = loadHistory(); h[day] = entry; localStorage.setItem(LS_HISTORY_KEY, JSON.stringify(h)); } catch {}
}
// The last daily game saved before the history existed (often yesterday's) goes into it once
function migrateDailyToHistory() {
  try {
    const st = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (!st || !st.day || !Array.isArray(st.guesses) || !st.guesses.length) return;
    if (!loadHistory()[st.day]) saveHistoryEntry(st.day, { g: st.guesses, done: !!st.gameOver, src: 'daily', ps: st.pathSent === true });
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
let NAME_ALIAS = {};
const DISPLAY_NAMES = {
  'Bahamas (the)': 'Bahamas', 'Bosnia Herzegovina': 'Bosnia and Herzegovina', 'Brunei Darussalam': 'Brunei',
  'Central African Republic (the)': 'Central African Republic', 'Comoros (the)': 'Comoros',
  'Congo (the Democratic Republic of the)': 'DR Congo', 'Congo (the)': 'Congo', 'Dominican Republic (the)': 'Dominican Republic',
  'Gambia (the)': 'Gambia', 'Iran (Islamic Republic of)': 'Iran', "Korea (the Democratic People's Republic of)": 'North Korea',
  "Lao People's Democratic Republic (the)": 'Laos', 'Niger (the)': 'Niger', 'Palestine, State of': 'Palestine',
  'Philippines (the)': 'Philippines', 'Russian Federation (the)': 'Russia', 'Sudan (the)': 'Sudan',
  'Syrian Arab Republic (the)': 'Syria', 'Tanzania, the United Republic of': 'Tanzania',
  'United States of America': 'United States', 'Venezuela (Bolivarian Republic of)': 'Venezuela', 'Viet Nam': 'Vietnam',
};
// A typed name matches the everyday name or the official one from the data
function nameMatches(c, typed) {
  const v = typed.trim().toLowerCase();
  return c.name.toLowerCase() === v || (NAME_ALIAS[c.name] || '').toLowerCase() === v;
}

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
let ARCHIVE_DAY = null, MY_SCORES = null;      // past puzzle on screen; this player's results from the scores table
function currentDay() { return MODE === 'archive' ? ARCHIVE_DAY : getDayNumber(); }
let scoreSubmitted = false; // has today's daily result reached Supabase?
let pathSent = false, pathSending = null; // has today's game been added to the average-path totals?

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
    const [res, released] = await Promise.all([fetch('energle_data.json'), sbReleasedPuzzles(), shopLoadData()]);
    const raw = await res.json();
    RELEASED = released;
    WORLD_DPC = raw['__world_dpc__'];
    delete raw['__world_dpc__'];
    // Everyday names for the official-style ones in the data; the official name still works as a guess
    NAME_ALIAS = {};
    ALL_DATA = Object.fromEntries(Object.entries(raw).map(([k, v]) => {
      const nice = DISPLAY_NAMES[k] || k;
      if (nice !== k) NAME_ALIAS[nice] = k;
      return [nice, v];
    }));
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
        ...trendFacts(info, yd, total),
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
// small line icons (stroke = text colour), sized to the button text
const HD_SVG = (d, extra = '') => '<svg class="hd-ico' + extra + '" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
const HD_ICO = {
  daily:   HD_SVG('<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M12 13.2v3.6M10.2 15h3.6" stroke-width="1.8"/>'),
  archive: HD_SVG('<rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v9.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V9M10 13h4"/>'),
  stats:   HD_SVG('<path d="M4 20h16M6.5 20v-6M11 20V8M15.5 20v-9M20 20V5" stroke-width="2.2"/>', ' ico-stats'),
  trophy:  HD_SVG('<path d="M7.5 4h9v5a4.5 4.5 0 0 1-9 0z"/><path d="M7.5 6H4.5v1.2A3 3 0 0 0 7.7 10.2M16.5 6h3v1.2a3 3 0 0 1-3.2 3M12 13.5v3.5M8.5 20.5h7M9.5 20.5l.6-3.5h3.8l.6 3.5"/>', ' ico-trophy')
};

// Daily / Archive / Practice: a pill like the By source / By category toggle; the active mode is dark, the others dimmed
function modeSwitcherHTML() {
  const locked = !practiceUnlocked();
  const b = (mode, label, extra = '') => '<button type="button" class="mode-btn' + (MODE === mode ? ' active' : '') + extra + '" aria-pressed="' + (MODE === mode)
    + '"' + (extra ? ' aria-disabled="true"' : '') + ' onclick="switchMode(\'' + mode + '\')">' + label + '</button>';
  return '<div class="mode-switcher hd-modes" id="mode-nav" role="group" aria-label="Game mode">'
    + b('normal', HD_ICO.daily + 'Daily') + b('archive', HD_ICO.archive + 'Archive')
    + b('practice', 'Practice' + (locked ? '<span class="hd-lockemo" aria-label="locked">🔒</span>' : ''), locked ? ' locked' : '') + '</div>';
}

// Page header, above the line: title, podium, Daily / Practice / Stats and Leaderboard (the parts that never change).
// Below the line: the puzzle number and task, which change every day (pageSubtitleHTML).
// Stats & Leaderboard is one button with two halves: the left half opens your stats, the right half today's leaderboard.
function pageHeaderHTML() {
  return '<header><div class="hd-grid"><div class="hd-brand">' + logoHTML()
    + '<span class="hd-by">by <a href="https://www.linkedin.com/in/oscar-viguie/" target="_blank" rel="noopener">Oscar Viguié</a></span></div>'
    + podiumHTML() + modeSwitcherHTML()
    + '<div class="mode-switcher lb-switcher lb-split" role="group" aria-label="Stats and leaderboard">'
    +   '<button type="button" class="mode-btn" onclick="showStatsModal(false)" title="Your stats">' + HD_ICO.stats + 'Stats</button>'
    +   '<span class="lb-amp" aria-hidden="true">&amp;</span>'
    +   '<button type="button" class="mode-btn" onclick="HUB_LB_TAB = \'today\'; showLeaderboardModal(\'today\')" title="Today’s leaderboard">Leaderboard' + HD_ICO.trophy + '</button>'
    + '</div>'
    + '</div></header>';
}
function pageSubtitleHTML(lead, rest = '', extra = '') {
  return '<div class="subtitle-row"><p class="subtitle"><span class="sub-lead">' + lead + '</span>'
    + (rest ? '<span class="sub-sep"> · </span><span class="sub-rest">' + rest + '</span>' : '') + '</p>' + extra + '</div>';
}
// Footer: where the data comes from, credited as Ember asks (CC BY 4.0)
// Every data source, one linked name each (Ember keeps the credit line it asks for). Cards and charts use the same names.
const DATA_SOURCES = [
  ['World Bank', 'https://databank.worldbank.org/source/world-development-indicators'],
  ['EIA', 'https://www.eia.gov/international/data/world'],
  ['OPEC', 'https://www.opec.org/annual-statistical-bulletin.html'],
  ['CIA', 'https://www.cia.gov/the-world-factbook/'],
  ['USGS', 'https://www.usgs.gov/centers/national-minerals-information-center/mineral-commodity-summaries'],
  ['CEPII', 'https://www.cepii.fr/CEPII/en/bdd_modele/bdd_modele_item.asp?id=37'],
  ['ENTSO-E', 'https://transparency.entsoe.eu/'],
  ['NASA', 'https://power.larc.nasa.gov/'],
  ['NOAA', 'https://www.ncei.noaa.gov/products/etopo-global-relief-model'],
];
function footerHTML() {
  const sep = '<span class="ft-sep" aria-hidden="true">·</span>';
  // the clue-card sources are listed once the cards can be seen (shop on, or the ?shop=on preview)
  const more = typeof shopLive === 'function' && shopLive()
    ? sep + '<span class="ft-more">' + DATA_SOURCES.map(([n, u]) => '<a href="' + u + '" target="_blank" rel="noopener">' + n + '</a>').join('<span class="ft-dot" aria-hidden="true"> · </span>') + '</span>' : '';
  return '<footer><p><span>Data: <a href="https://ember-energy.org/data/yearly-electricity-data/" target="_blank" rel="noopener">Yearly Electricity Data | Ember</a> (CC BY 4.0)</span>'
    + more + sep + '<button type="button" class="ft-link" onclick="showNotice()">What’s new</button></p></footer>';
}
function todayLabel() {
  return new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
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
    const btn = document.querySelector('#mode-nav .mode-btn.locked');
    if (btn) lockTip(btn, '<strong>Finish today’s daily to unlock Practice.</strong> Then play as many extra rounds as you like.', true);
    return;
  }
  hideLockTip();
  if (lineChart) { lineChart.destroy(); lineChart = null; }
  if (barChart)  { barChart.destroy();  barChart  = null; }
  clearInterval(resultTicker);
  MODE = mode;
  if (mode === 'normal') { POOL = COUNTRIES; PRACTICE_CAT = null; renderGameScreen(); restoreDailyGame(); }
  else if (mode === 'archive') { renderArchiveScreen(); }
  else { renderPracticePickerScreen(); }
  updateDonePill();
}

// ============================================================
//  LOCKED BUTTONS: a short "no" wiggle and a bubble saying why
// ============================================================
let lockTipTimer = null;
function hideLockTip() { clearTimeout(lockTipTimer); const t = document.getElementById('lock-tip'); if (t) t.remove(); }
// below = true puts the bubble under the button (near the top of the page), otherwise above it
function lockTip(btn, msg, below) {
  hideLockTip();
  const r = btn.getBoundingClientRect();
  const tip = document.createElement('div');
  tip.id = 'lock-tip'; tip.className = below ? 'is-below' : ''; tip.setAttribute('role', 'status');
  tip.innerHTML = '<span class="lt-lock" aria-hidden="true"></span><span>' + msg + '</span>';
  if (below) tip.style.top = (r.bottom + 10) + 'px'; else tip.style.bottom = (window.innerHeight - r.top + 10) + 'px';
  tip.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
  tip.style.setProperty('--arrow', Math.max(10, r.width / 2 - 6) + 'px');
  document.body.appendChild(tip);
  btn.classList.remove('is-denied'); void btn.offsetWidth; btn.classList.add('is-denied');
  lockTipTimer = setTimeout(hideLockTip, 4000);
}
window.addEventListener('scroll', hideLockTip, { passive: true });
window.addEventListener('resize', hideLockTip);
document.addEventListener('keydown', e => { if (e.key === 'Escape') hideLockTip(); });
document.addEventListener('click', e => { if (!e.target.closest('#lock-tip, .mode-btn.locked, #shop-btn')) hideLockTip(); });

function startPractice(catId) {
  const cat = PRACTICE_CATEGORIES.find(c => c.id === catId); if (!cat) return;
  PRACTICE_CAT = catId;
  POOL = COUNTRIES.filter(cat.filter);
  practiceSession = { played: 0, solved: 0 };
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
  // the group's picture, and its combined mix with the key, on top of the list
  const art = typeof PRACTICE_ART !== 'undefined' ? PRACTICE_ART[cat.id] : null;
  const shares = groupShares(countries);
  const key = CATEGORIES.map(g => { const s = shares.find(x => x.k === g.key); return '<span class="pc-key-i"><span class="pc-key-sw" style="background:' + g.color + '80;box-shadow:inset 0 0 0 1px ' + g.color + 'b3"></span>'
    + g.key + ' <strong>' + Math.round((s ? s.p : 0) * 100) + '%</strong></span>'; }).join('');
  modal.innerHTML =
    '<div class="cl-backdrop"></div>'
    + '<div class="cl-box" role="dialog" aria-modal="true" aria-labelledby="cl-title">'
    + '<div class="cl-header">' + (art ? '<span class="pc-art pc-art--sm" style="--pa:' + art.col + '">' + art.svg() + '</span>' : '')
    + '<span class="cl-titles"><span class="cl-title" id="cl-title">' + cat.label + '</span>'
    + '<span class="cl-count">' + countries.length + ' countries' + (cat.rule ? ' · ' + cat.rule.toLowerCase() : '') + '</span></span>'
    + '<button type="button" class="cl-close" id="cl-close-btn" aria-label="Close">×</button></div>'
    + '<div class="cl-group"><span class="cl-group-lbl">Combined mix of the group</span>' + mixBarHTML(shares, 'cl-gmix') + '<span class="pc-key cl-gkey">' + key + '</span></div>'
    + '<div class="cl-body">'
    + countries.map(c => '<div class="cl-row">' + flagImg(c.iso3, 'cl-flag') + '<span class="cl-name">' + c.name + '</span>'
      + mixBarHTML(sharesOf(c), 'cl-mix') + '<span class="cl-meta">' + fmtTwh(c.latestTotal) + '</span></div>').join('')
    + '</div>'
    + '<div class="cl-foot"><button type="button" class="cl-play" id="cl-play">Practise this group</button></div>'
    + '</div>';
  const close = () => { modal.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  modal.querySelector('.cl-backdrop').addEventListener('click', close);
  document.body.appendChild(modal);
  document.getElementById('cl-close-btn').addEventListener('click', close);
  document.getElementById('cl-play').addEventListener('click', () => { close(); startPractice(catId); });
  document.addEventListener('keydown', onKey);
}
function fmtTwh(v) { return (v >= 100 ? Math.round(v).toLocaleString('en-US') : v >= 10 ? v.toFixed(0) : v.toFixed(1)) + ' TWh'; }

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

let ATLAS = { q: '', region: 'all', sort: 'name' };
function renderBrowseScreen() {
  if (lineChart) { lineChart.destroy(); lineChart = null; }
  if (barChart)  { barChart.destroy();  barChart  = null; }
  const regions = [['all', 'All'], ['europe', 'Europe'], ['africa', 'Africa'], ['asia', 'Asia & Pacific'], ['americas', 'Americas']];
  const rows = COUNTRIES.map(c => {
    const sh = sharesOf(c), ren = sh.find(x => x.k === 'Renewables').p;
    return '<button type="button" class="browse-row at-row" onclick="browseCountry(\'' + c.iso3 + '\')"'
      + ' data-name="' + escHtml(c.name.toLowerCase()) + '" data-alias="' + escHtml((NAME_ALIAS[c.name] || '').toLowerCase()) + '"'
      + ' data-g="' + c.latestTotal + '" data-dpc="' + (c.latestDpc || 0) + '" data-ren="' + ren.toFixed(4) + '" data-cont="' + (c.continent || '') + '">'
      + '<span class="at-who">' + flagImg(c.iso3, 'at-flag') + '<span class="at-names"><span class="browse-name">' + c.name + '</span>'
      + '<span class="at-region">' + (REGION_LABEL[c.continent] || '') + '</span></span></span>'
      + mixBarHTML(sh, 'at-mix')
      + '<span class="at-num">' + fmtTwh(c.latestTotal) + '</span>'
      + '<span class="at-num at-dpc">' + (c.latestDpc != null ? c.latestDpc.toFixed(1) + ' MWh' : '–') + '</span>'
      + '</button>';
  }).join('');
  document.getElementById('app').innerHTML =
    pageHeaderHTML()
    + pageSubtitleHTML('Country atlas', 'every country’s electricity profile', '<button type="button" id="back-to-cats">← Practice</button>')
    + '<div class="at-tools">'
    +   '<label class="cr-sr" for="browse-search">Search countries</label>'
    +   '<input id="browse-search" type="search" placeholder="Search a country…" autocomplete="off" />'
    +   '<div class="at-chips" role="group" aria-label="Region">' + regions.map(([id, l]) => '<button type="button" class="at-chip" data-r="' + id + '">' + l + '</button>').join('') + '</div>'
    +   '<label class="at-sort"><span>Sort</span><select id="at-sort">'
    +     '<option value="name">A–Z</option><option value="g">Generation</option><option value="dpc">Use per person</option><option value="ren">Renewable share</option>'
    +   '</select></label>'
    + '</div>'
    + '<div class="at-head" aria-hidden="true"><span>Country</span><span class="at-keyhead">' + CATEGORIES.map(g => '<span class="pc-key-i"><span class="pc-key-sw" style="background:' + g.color + '80;box-shadow:inset 0 0 0 1px ' + g.color + 'b3"></span>' + g.key + '</span>').join('') + '</span><span>Generation</span><span>Per person</span></div>'
    + '<div class="browse-list at-list" id="at-list">' + rows + '</div>'
    + '<p class="at-empty" id="at-empty" hidden>No country matches.</p>'
    + footerHTML();
  document.getElementById('back-to-cats').addEventListener('click', renderPracticePickerScreen);
  const search = document.getElementById('browse-search'), sort = document.getElementById('at-sort');
  search.value = ATLAS.q; sort.value = ATLAS.sort;
  search.addEventListener('input', () => { ATLAS.q = search.value.toLowerCase().trim(); applyAtlas(); });
  sort.addEventListener('change', () => { ATLAS.sort = sort.value; applyAtlas(); });
  document.querySelectorAll('.at-chip').forEach(b => b.addEventListener('click', () => { ATLAS.region = b.dataset.r; applyAtlas(); }));
  applyAtlas();
}
function applyAtlas() {
  const cat = PRACTICE_CATEGORIES.find(c => c.id === ATLAS.region);
  const inRegion = cont => !cat || cat.filter({ continent: cont });
  const list = document.getElementById('at-list'); if (!list) return;
  const rows = [...list.children];
  const key = ATLAS.sort;
  rows.sort((a, b) => key === 'name' ? a.dataset.name.localeCompare(b.dataset.name) : (+b.dataset[key]) - (+a.dataset[key]));
  let shown = 0;
  rows.forEach(r => {
    const ok = inRegion(r.dataset.cont) && (!ATLAS.q || r.dataset.name.includes(ATLAS.q) || r.dataset.alias.includes(ATLAS.q));
    r.hidden = !ok; if (ok) shown++;
    list.appendChild(r);
  });
  document.getElementById('at-empty').hidden = shown > 0;
  document.querySelectorAll('.at-chip').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.r === ATLAS.region)));
}

function browseCountry(iso3) {
  const country = COUNTRIES.find(c => c.iso3 === iso3); if (!country) return;
  if (lineChart) { lineChart.destroy(); lineChart = null; }
  if (barChart)  { barChart.destroy();  barChart  = null; }
  const prevTarget = target; target = country;
  document.getElementById('app').innerHTML =
    pageHeaderHTML()
    + pageSubtitleHTML(escHtml(country.name), country.continent || '', '<button type="button" id="back-to-browse">← Atlas</button>')
    + balanceCardHTML()
    + '<div id="charts-section">'
    + '<div id="chart-left"><p class="chart-label" id="line-label">Generation by source over time (TWh)</p><div id="line-wrapper"><canvas id="line-chart"></canvas></div></div>'
    + '<div id="chart-right"><p class="chart-label" id="bar-label">Latest year mix</p><div id="bar-wrapper"><canvas id="bar-chart"></canvas></div></div>'
    + '</div>'
    + '<div id="legend-shared"></div>'
    + footerHTML();
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
  MODE = 'practice'; clearInterval(resultTicker);
  if (lineChart) { lineChart.destroy(); lineChart = null; }
  if (barChart)  { barChart.destroy();  barChart  = null; }
  // one picture per group (practice-art.js); the group's combined mix lives in "See the N countries"
  const card = cat => {
    const list = COUNTRIES.filter(cat.filter), art = typeof PRACTICE_ART !== 'undefined' ? PRACTICE_ART[cat.id] : null;
    return '<div class="pc-card pc-card--art">'
      + '<button type="button" class="pc-main" onclick="startPractice(\'' + cat.id + '\')">'
      +   (art ? '<span class="pc-art" style="--pa:' + art.col + '">' + art.svg() + '</span>' : '')
      +   '<span class="pc-txt"><span class="pc-top"><span class="pc-name">' + cat.label + '</span><span class="pc-count">' + list.length + '</span></span>'
      +   '<span class="pc-rule">' + (cat.rule || topSourceText(list)) + '</span></span>'
      + '</button>'
      + '<button type="button" class="pc-list" onclick="showCountryList(\'' + cat.id + '\')">See the ' + list.length + ' countries</button>'
      + '</div>';
  };
  const section = (group, title, sub) => '<section class="pc-section" aria-label="' + title + '">'
    + '<div class="pc-head"><span class="pc-h">' + title + '</span><span class="pc-sub">' + sub + '</span></div>'
    + '<div class="pc-grid">' + PRACTICE_CATEGORIES.filter(c => c.group === group).map(card).join('') + '</div></section>';
  document.getElementById('app').innerHTML =
    pageHeaderHTML()
    + pageSubtitleHTML('Practice', 'pick a group of countries to train on', '<span class="sub-date">No score, no streak</span>')
    + section('region', 'By region', '')
    + section('profile', 'By profile', 'Countries that share a trait')
    + section('trend', 'By trend & trade', 'How each grid changed since 2010, and what crosses its borders')
    + '<button type="button" class="pc-atlas" onclick="tryBrowse()">'
    +   '<span class="pc-atlas-txt"><span class="pc-atlas-title">Country atlas</span>'
    +   '<span class="pc-atlas-sub">Look up any country’s charts, compare their mixes, no guessing</span></span>'
    +   '<span class="pc-atlas-cta">Open the atlas →</span></button>'
    + footerHTML();
}

// ============================================================
//  PAST PUZZLES (archive): replay, or look back at your own path. Never touches stats, streak or leaderboard.
// ============================================================
function lastPastDay() { return getDayNumber() - 1; }
function puzzleDate(day, opts) {
  return new Date(EPOCH_DATE.getTime() + (day - 1) * 86400000)
    .toLocaleDateString('en-GB', Object.assign({ timeZone: 'UTC' }, opts || { weekday: 'long', day: 'numeric', month: 'long' }));
}
// What this player did on a past puzzle.
//   onDay:  the daily game on its own day (this device's history, else the scores table, which only holds daily games)
//   replay: a game played later from the archive (never counted anywhere)
// cells a saved game used: its guesses plus the guesses spent on clue cards
function histCells(h) { return h.g.length + (Array.isArray(h.c) ? h.c.reduce((a, c) => a + (c.cost || 0), 0) : 0); }
function archiveStatus(day) {
  const h = loadHistory()[day], t = getDailyTarget(COUNTRIES, day), ans = t && t.iso3;
  const sc = MY_SCORES && MY_SCORES[day];
  let onDay = null, replay = null;
  if (h && h.src === 'daily' && h.done && h.g.length) onDay = { won: h.g[h.g.length - 1] === ans, n: histCells(h) };
  else if (sc) onDay = { won: !!sc.won, n: sc.n };
  if (h && h.g.length && !(h.src === 'daily' && h.done)) replay = { done: !!h.done, won: !!h.done && h.g[h.g.length - 1] === ans, n: histCells(h) };
  const kind = onDay ? (onDay.won ? 'solved' : 'missed') : replay ? (replay.done ? 'replayed' : 'started') : 'new';
  return { kind, onDay, replay };
}
function archiveStatusText(st) {
  const rp = st.replay;
  const rpText = rp ? (rp.done ? (rp.won ? 'replay solved in ' + rp.n : 'replay missed') : rp.n + ' guess' + (rp.n > 1 ? 'es' : '') + ' so far') : '';
  if (st.kind === 'solved') return 'Solved in ' + st.onDay.n;
  if (st.kind === 'missed') return 'Missed' + (rpText ? ' · ' + rpText : '');
  if (st.kind === 'new') return 'Not played';
  return rpText.charAt(0).toUpperCase() + rpText.slice(1);
}
function loadMyScores() {
  const u = getUsername();
  if (!u || MY_SCORES) return Promise.resolve(MY_SCORES);
  return sbFetchMine(u).then(r => { MY_SCORES = r; return r; });
}

// Shown when the answers can't be fetched (offline, or the puzzle server is down),
// or when today's puzzle isn't out yet (a device clock ahead of midnight UTC)
function renderUnavailable(where) {
  if (lineChart) { lineChart.destroy(); lineChart = null; }
  if (barChart)  { barChart.destroy();  barChart  = null; }
  const early = !!RELEASED, day = getDayNumber();
  document.getElementById('app').innerHTML =
    pageHeaderHTML()
    + pageSubtitleHTML(where === 'archive' ? 'Archive' : 'Puzzle #' + day, '', dateButtonHTML())
    + '<div class="un-card" role="status">'
    +   '<p class="un-title">' + (early ? 'Puzzle #' + day + ' is on its way' : 'Couldn’t reach the puzzle server') + '</p>'
    +   '<p class="un-text">' + (early ? 'A new puzzle opens every day at midnight UTC. Try again in a moment.' : 'Check your connection and try again.') + '</p>'
    +   '<button type="button" class="un-btn" onclick="retryRelease(\'' + where + '\')">Try again</button>'
    + '</div>'
    + footerHTML();
}
async function retryRelease(where) {
  const btn = document.querySelector('.un-btn'); if (btn) { btn.disabled = true; btn.textContent = 'Loading…'; }
  RELEASED = (await sbReleasedPuzzles()) || RELEASED;
  if (where === 'archive') renderArchiveScreen(); else switchMode('normal');
}

function renderArchiveScreen(focusDay) {
  if (lineChart) { lineChart.destroy(); lineChart = null; }
  if (barChart)  { barChart.destroy();  barChart  = null; }
  MODE = 'archive'; ARCHIVE_DAY = null;
  if (!RELEASED) { renderUnavailable('archive'); return; }
  const today = getDayNumber(), last = today - 1;
  const sts = {}; let solved = 0, missed = 0, open = 0;
  for (let d = 1; d <= last; d++) {
    const st = sts[d] = archiveStatus(d);
    if (st.kind === 'solved') solved++; else if (st.kind === 'missed') missed++; else if (!(st.replay && st.replay.done)) open++;
  }
  const row = (d, st, isToday) => '<button type="button" class="ax-row ax-row--' + st.kind + (isToday ? ' ax-row--today' : '') + '" id="ax-' + d + '" onclick="'
    + (isToday ? 'switchMode(\'normal\')' : 'openArchive(' + d + ')') + '">'
    + '<span class="ax-num">#' + d + '</span>'
    + '<span class="ax-date">' + (isToday ? 'Today' : puzzleDate(d, { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '')) + '</span>'
    + '<span class="ax-status">' + (isToday && st.kind === 'new' ? 'Play it in Daily' : archiveStatusText(st)) + '</span>'
    + '<svg class="ax-chev" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';
  // today: your daily result, or a way into it (its answer is never listed here)
  const todayTarget = getDailyTarget(COUNTRIES);
  const ds = loadDailyState(), dWon = !!(ds && ds.gameOver && ds.guesses.length && todayTarget && ds.guesses[ds.guesses.length - 1] === todayTarget.iso3);
  const todaySt = ds && ds.gameOver ? { kind: dWon ? 'solved' : 'missed', onDay: { won: dWon, n: savedCells(ds) } } : { kind: 'new' };
  let html = '', d = today;
  while (d >= 1) {
    const key = puzzleDate(d, { month: 'long', year: 'numeric' });
    let rows = '', n = 0, ok = 0;
    while (d >= 1 && puzzleDate(d, { month: 'long', year: 'numeric' }) === key) {
      if (d === today) rows += row(d, todaySt, true);
      else { rows += row(d, sts[d]); n++; if (sts[d].kind === 'solved') ok++; }
      d--;
    }
    html += '<section class="ax-month"><div class="ax-mhead"><span class="pc-h">' + key + '</span><span class="pc-sub">' + (n ? ok + ' of ' + n + ' solved on the day' : '') + '</span></div>'
      + '<div class="ax-list">' + rows + '</div></section>';
  }
  document.getElementById('app').innerHTML =
    pageHeaderHTML()
    + pageSubtitleHTML('Archive', 'every daily puzzle since 2 June', '<span class="sub-date">Replays don’t count in stats or the leaderboard</span>')
    + '<div class="ax-sum"><span><strong>' + solved + '</strong> solved on the day</span><span><strong>' + missed + '</strong> missed</span>'
    +   '<span><strong>' + open + '</strong> left to play</span>'
    +   '<span class="ax-key"><span class="ax-sw ax-sw--solved"></span>Shaded: solved on the day</span></div>'
    + html
    + footerHTML();
  const f = focusDay && document.getElementById('ax-' + focusDay);
  if (f) f.scrollIntoView({ block: 'center' });
  if (!MY_SCORES && getUsername()) loadMyScores().then(() => { if (MODE === 'archive' && ARCHIVE_DAY === null) renderArchiveScreen(); });
}

function openArchive(day) {
  const last = lastPastDay();
  if (last < 1) return;
  day = Math.max(1, Math.min(last, day));
  if (MODE === 'archive' && day === ARCHIVE_DAY && document.getElementById('ar-nav')) return;
  if (!MY_SCORES && getUsername()) loadMyScores().then(() => { if (MODE === 'archive' && ARCHIVE_DAY === day) refreshArchiveStatus(); });
  if (lineChart) { lineChart.destroy(); lineChart = null; }
  if (barChart)  { barChart.destroy();  barChart  = null; }
  clearInterval(resultTicker);
  MODE = 'archive'; ARCHIVE_DAY = day; POOL = COUNTRIES; PRACTICE_CAT = null;
  renderGameScreen(); restoreArchiveGame();
  window.scrollTo({ top: 0 });
}
function archiveNavHTML() {
  const d = ARCHIVE_DAY, last = lastPastDay(), st = archiveStatus(d);
  return '<div class="subtitle-row ar-row"><div class="ar-nav" id="ar-nav">'
    + '<button type="button" class="ar-arrow" aria-label="Previous puzzle"' + (d <= 1 ? ' disabled' : '') + ' onclick="openArchive(' + (d - 1) + ')">'
    +   '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>'
    + '<span class="ar-title"><span class="ar-num">Puzzle #' + d + '</span><span class="ar-date">' + puzzleDate(d) + '</span></span>'
    + '<button type="button" class="ar-arrow" aria-label="Next puzzle"' + (d >= last ? ' disabled' : '') + ' onclick="openArchive(' + (d + 1) + ')">'
    +   '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>'
    + '</div><span class="pr-extra"><span class="ar-status ar-status--' + st.kind + '" id="ar-status">' + archiveStatusText(st) + '</span>'
    + '<button type="button" id="back-to-archive">← Archive</button></span></div>';
}
function refreshArchiveStatus() {
  const el = document.getElementById('ar-status'); if (!el) return;
  const st = archiveStatus(ARCHIVE_DAY);
  el.className = 'ar-status ar-status--' + st.kind; el.textContent = archiveStatusText(st);
}
function restoreArchiveGame() {
  const day = ARCHIVE_DAY;
  target = getDailyTarget(COUNTRIES, day); guesses = []; gameOver = false; SHOP.reset(); CARDS_RESTORING = true; updateDonePill();
  if (!target) { renderUnavailable('archive'); CARDS_RESTORING = false; return; }
  const h = loadHistory()[day];
  pathSent = !!(h && h.src === 'daily' && h.ps);      // (see below)      // your own daily game is already inside that day's average
  document.getElementById('guesses').innerHTML = '';
  document.getElementById('banner').innerHTML  = '';
  document.getElementById('error').textContent = '';
  document.getElementById('input-area').style.display = 'flex';
  document.getElementById('guess-input').value = ''; syncInputFlag();
  renderLives(); renderStatBar(); renderFlowBar(); renderCharts();
  if (h && h.g.length) {
    h.g.forEach((iso3, i) => {
      shopReplayCards(h.c, i);                       // clue cards bought before this guess
      const country = COUNTRIES.find(c => c.iso3 === iso3); if (!country) return;
      guesses.push(country); shopNoteGuess(country); addGuessRow(country, country.iso3 === target.iso3, false);
    });
    shopReplayCards(h.c, h.g.length);
    renderLives();
    if (h.done) {
      gameOver = true;
      renderResultCard(guesses[guesses.length - 1].iso3 === target.iso3, false);
      document.getElementById('input-area').style.display = 'none';
    }
    renderClueCards(); updateShopButton(); CARDS_RESTORING = false;
    if (gameOver) { window.scrollTo(0, 0); updateDonePill(); }
    return;
  }
  renderClueCards(); updateShopButton(); CARDS_RESTORING = false;
  const st = archiveStatus(day);
  if (st.onDay)
    document.getElementById('banner').innerHTML = '<p class="ar-note">You ' + (st.onDay.won ? 'solved this one in ' + st.onDay.n : 'missed this one')
      + ' on the day. Guesses from before 25 October weren’t saved, so you can play it again here: it won’t change your stats.</p>';
}
document.addEventListener('keydown', e => {
  if (MODE !== 'archive' || ARCHIVE_DAY === null || e.altKey || e.ctrlKey || e.metaKey) return;
  const t = e.target;
  if (t && (/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName) || t.isContentEditable)) return;
  if (document.querySelector('#cl-modal, #stats-modal, #lb-modal, #notice-modal, #username-modal')) return;
  if (e.key === 'ArrowLeft') openArchive(ARCHIVE_DAY - 1);
  else if (e.key === 'ArrowRight') openArchive(ARCHIVE_DAY + 1);
});

// Combined mix of a group of countries (shares of their total generation, each at its latest year)
function topSourceText(list) {
  const top = sourceShares(list).sort((a, b) => b.p - a.p)[0];
  return top && top.p ? 'Largest source: ' + top.k.toLowerCase() + ', ' + Math.round(top.p * 100) + '%' : '';
}
// Bars use the three groups of the "By category" chart view: fossil, nuclear, renewables
function sourceShares(list) {
  const sum = {}; let all = 0;
  list.forEach(c => {
    const yd = (ALL_DATA[c.name] && ALL_DATA[c.name].years[c.latestYear]) || {};
    SOURCES.forEach(k => { sum[k] = (sum[k] || 0) + (yd[k] || 0); });
    all += yd.Total || 0;
  });
  return SOURCES.map(k => ({ k, p: all ? sum[k] / all : 0 }));
}
function toGroups(src) {
  return CATEGORIES.map(g => ({ k: g.key, p: src.filter(x => g.members.includes(x.k)).reduce((a, x) => a + x.p, 0) }));
}
function sharesOf(c) { return toGroups(sourceShares([c])); }
function groupShares(list) { return toGroups(sourceShares(list)); }
function mixBarHTML(shares, cls) {
  const parts = shares.filter(x => x.p >= 0.005);
  const title = [...parts].sort((a, b) => b.p - a.p).map(x => x.k + ' ' + Math.round(x.p * 100) + '%').join(', ');
  return '<span class="mixbar ' + cls + '" role="img" aria-label="' + title + '" title="' + title + '">'
    + parts.map(x => '<span style="flex:' + x.p.toFixed(4) + ';background:' + CAT_COLORS[x.k] + '80;box-shadow:inset 0 0 0 1px ' + CAT_COLORS[x.k] + 'b3"></span>').join('') + '</span>';
}

// ============================================================
//  INIT
// ============================================================
function initApp() {
  try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch (e) {}   // a reload opens at the top, not mid-page
  migrateDailyToHistory();
  POOL = COUNTRIES; renderGameScreen(); playIntro(); restoreDailyGame(); loadPodium();
  scheduleAmbientPulse();
  maybeShowNotice();
  maybeShowShopIntro();
}

// ============================================================
//  WHAT'S NEW: shown once to returning players, and from the footer link
// ============================================================
const NOTICE_KEY = 'energle_notice_v2';
// Only what changes how the game plays or what data it shows (modes, mechanics, new figures, data refreshes), newest first
const UPDATES = [
  ['28 Oct', 'Carbon intensity added', 'The latest mix now shows how much CO\u2082 each kWh of the country’s electricity emits, from Ember’s data.'],
  ['25 Oct', 'The Archive', 'Every past puzzle, one tap away. Replays never count in your stats or on the leaderboard.'],
  ['25 Oct', 'A smarter daily line-up', 'From puzzle #146, big and telling grids like Canada, France or Brazil come up more often, and no country repeats within 50 days.'],
  ['Monthly', 'Fresh data every month', 'Ember’s figures refresh on the 1st of each month; 91 countries already show their 2025 mix.'],
];
// What's coming: the first one is the big one; the rest stay vague on purpose
const COMING = [
  ['The Clue Shop', 'Stuck after a guess? Trade a spare guess for a clue card: its sun and wind, what lies underground, who it trades fuel and power with, how its people live.'],
  ['Head to head', 'A way to settle it with your friends.'],
  ['A special mode', 'For the days the grid misbehaves.'],
];
function maybeShowNotice() {
  let seen = true, returning = false;
  try {
    seen = !!localStorage.getItem(NOTICE_KEY);
    returning = !!(localStorage.getItem(LS_KEY) || localStorage.getItem(LS_STATS_KEY));
    if (!seen && !returning) localStorage.setItem(NOTICE_KEY, '1');      // first visit: nothing changed for them
  } catch (e) { return; }
  if (!seen && returning) setTimeout(showNotice, REDUCED_MOTION ? 0 : 700);
}
// the header's What's new button: a dot until the latest update has been seen
const NEWS_SEEN_KEY = 'energle_news_seen';
const newsId = () => UPDATES[0][0] + ' ' + UPDATES[0][1];
function newsUnseen() { try { return localStorage.getItem(NEWS_SEEN_KEY) !== newsId(); } catch (e) { return false; } }
// the date on the puzzle line opens What's new; a message icon sits in front of it while the latest update is unread
const NEWS_ICON = '<svg class="sd-ico" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M2.5 3.5h11a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H7l-3 2.5v-2.5H2.5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1z" fill="currentColor"/><circle cx="5.5" cy="7.5" r=".9" fill="#fff"/><circle cx="8" cy="7.5" r=".9" fill="#fff"/><circle cx="10.5" cy="7.5" r=".9" fill="#fff"/></svg>';
function dateButtonHTML() {
  const fresh = newsUnseen();
  return '<button type="button" class="sub-date sub-date--btn' + (fresh ? ' has-news' : '') + '" id="sub-date" onclick="showNotice()" title="What’s new"'
    + ' aria-label="' + todayLabel() + (fresh ? ' · new update' : '') + ' · What’s new">' + (fresh ? NEWS_ICON : '') + '<span class="sd-txt">' + todayLabel() + '</span></button>';
}
function showNotice() {
  if (document.getElementById('notice-modal')) return;
  try { localStorage.setItem(NOTICE_KEY, '1'); localStorage.setItem(NEWS_SEEN_KEY, newsId()); } catch (e) {}
  const sd = document.getElementById('sub-date'); if (sd) { sd.classList.remove('has-news'); const ic = sd.querySelector('.sd-ico'); if (ic) ic.remove(); }
  const modal = document.createElement('div'); modal.id = 'notice-modal';
  modal.innerHTML = '<div class="st-backdrop"></div>'
    + '<div class="nt-box nt-box--log" role="dialog" aria-modal="true" aria-labelledby="nt-title">'
    + '<span class="nt-eyebrow">What’s new</span>'
    + '<h2 class="nt-title" id="nt-title">Latest updates</h2>'
    + '<ol class="nt-log">' + UPDATES.map(([d, t, x]) => '<li><span class="nt-date">' + d + '</span><span class="nt-item"><strong>' + t + '</strong>' + x + '</span></li>').join('') + '</ol>'
    + '<div class="nt-soon"><span class="nt-eyebrow">Coming soon</span>'
    + COMING.map(([t, x], i) => '<div class="nt-soon-item' + (i ? '' : ' is-big') + '"><strong>' + t + '</strong><span>' + x + '</span></div>').join('') + '</div>'
    + '<button type="button" class="nt-btn" id="nt-ok">Got it</button>'
    + '</div>';
  const close = () => { modal.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  modal.querySelector('.st-backdrop').addEventListener('click', close);
  document.body.appendChild(modal);
  document.getElementById('nt-ok').addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  document.getElementById('nt-ok').focus();
}

// ============================================================
//  MOTION — load animations + ambient pulses
//  Everything here is skipped when the visitor asks for reduced motion.
// ============================================================
const REDUCED_MOTION = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

function logoHTML() { return '<h1><span class="logo-bolt" aria-hidden="true">⚡</span><span class="logo-gap"> </span><span class="logo-word">Energle</span></h1>'; }

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
  setTimeout(() => { runAmbientPulse(); scheduleAmbientPulse(); }, 8000 + Math.random() * 5000);
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
  const color = colorOf(pick.d.label), trail = Math.min(70, L * 0.18), dur = 1500, t0 = performance.now();

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
  return cat ? cat.label + ' · ' + POOL.length + ' countries' : '';
}

function renderGameScreen() {
  const isPractice = MODE === 'practice';
  const cat = isPractice ? PRACTICE_CATEGORIES.find(c => c.id === PRACTICE_CAT) : null;
  const lead = isPractice ? 'Practice · ' + (cat ? cat.label : 'All countries') : 'Puzzle #' + getDayNumber();
  const rest = isPractice ? 'guess the country from its mix' : 'Guess the country from its electricity generation mix';
  const backBtn = isPractice ? '<span class="pr-extra"><span class="pr-session" id="pr-session">' + practiceSessionText() + '</span>'
    + '<button type="button" id="back-to-categories">Change group</button></span>' : '';

  document.getElementById('app').innerHTML =
    pageHeaderHTML()
    + (MODE === 'archive' ? archiveNavHTML() : pageSubtitleHTML(lead, rest, isPractice ? backBtn : dateButtonHTML()))
    + balanceCardHTML()
    + '<div id="charts-section">'
    + '<div id="chart-left"><p class="chart-label" id="line-label">Generation by source over time (TWh)</p><div id="line-wrapper"><canvas id="line-chart"></canvas></div></div>'
    + '<div id="chart-right"><p class="chart-label" id="bar-label">Latest year mix</p><div id="bar-wrapper"><canvas id="bar-chart"></canvas></div></div>'
    + '</div>'
    + '<div id="legend-shared"></div>'
    + '<section id="clue-cards" class="fg-clues" aria-label="Clue cards"></section>'
    + '<div id="guess-head"><span class="section-title">Guesses</span><span id="lives-count"></span><span id="lives-container"></span></div>'
    + '<div id="input-area"><div id="autocomplete-wrapper">'
    + '<span id="guess-flag" aria-hidden="true"></span>'
    + '<input id="guess-input" type="text" placeholder="Type a country name…" autocomplete="off" />'
    + '<div id="autocomplete-list"></div></div>'
    + shopButtonHTML()
    + '<button id="submit-btn">Guess</button></div>'
    + '<p id="error"></p>'
    + '<div id="banner"></div>'
    + '<div id="guesses"></div>'
    + footerHTML();

  document.getElementById('submit-btn').addEventListener('click', submitGuess);
  if (MODE === 'archive') {
    const day = ARCHIVE_DAY;
    document.getElementById('back-to-archive').addEventListener('click', () => { clearInterval(resultTicker); renderArchiveScreen(day); });
  }
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
    +   '<div class="bc-stat"><span class="stat-label">Electricity generated</span><span class="stat-value" id="stat-total">—</span><span class="bc-world bc-world--gen" id="stat-world-gen"></span></div>'
    +   '<div class="bc-stat"><span class="stat-label">Electricity demand per capita</span><span class="stat-value" id="stat-dpc">—</span><span class="bc-world bc-world--dem" id="stat-world"></span></div>'
    + '</div>'
    + '<div class="bc-flow">'
    +   '<span class="stat-label">Electricity generation &amp; net trade — <span id="bc-year"></span></span>'
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
  const HMAX = narrow ? 70 : 86, MIN = 8, GAP = 8, FIT = narrow ? 15 : 17;      // compact: about a quarter shorter
  const CW = narrow ? 96 : 128, BH = narrow ? 36 : 40;
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
    box('L', 0, hI, tI, FLOW_COLORS.imp, 'NET IMPORTS', imp);
    box('L', yG, hG, tG, FLOW_COLORS.gen, 'GENERATED', gen);
    box('R', yD, hD, tI + tG, FLOW_COLORS.dem, 'DEMAND', use);
    tag(tI >= FIT ? cI : cI - tI / 2 - 9, pct(imp / use * 100), '#b0126b');          // too thin: just above
    tag(tG >= FIT ? cG : cG + tG / 2 + 9, pct(gen / use * 100), '#1f2937');          // too thin: just below
    H = totL + 2;
    mainTip  = fmtTWh(gen) + ' generated · ' + pct(gen / use * 100) + ' of demand';
    tradeTip = fmtTWh(imp) + ' net imports · ' + pct(imp / use * 100) + ' of demand';
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
    box('R', yE, hE, tE, FLOW_COLORS.exp, 'NET EXPORTS', exp);
    tag(tU >= FIT ? s0 + tU / 2 : s0 - 9, pct(use / gen * 100), '#1f2937');
    tag(tE >= FIT ? s0 + tU + tE / 2 : s0 + tU + tE + 9, pct(exp / gen * 100), '#2f2c9a');   // too thin: just below
    H = Math.max(totR, tE >= FIT ? 0 : s0 + tU + tE + 18) + 2;
    mainTip  = fmtTWh(use) + ' used at home · ' + pct(use / gen * 100) + ' of generation';
    tradeTip = fmtTWh(exp) + ' net exports · ' + pct(exp / gen * 100) + ' of generation';
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
    ? fmtTWh(gen) + ' generated plus ' + fmtTWh(imp) + ' of net imports gives ' + fmtTWh(use) + ' of demand'
    : exp > 0 ? fmtTWh(gen) + ' generated: ' + fmtTWh(use) + ' used at home and ' + fmtTWh(exp) + ' of net exports'
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
// ------------------------------------------------------------
//  CHART VIEW: by source (default) or by category (fossil / nuclear / renewables).
//  The three categories don't overlap and add up to total generation. Low-carbon = nuclear + renewables,
//  shown as a total in the tooltips. The category colours are the glossary's group colours.
// ------------------------------------------------------------
const CATEGORIES = [
  { key: 'Fossil',     color: '#8a4a2a', members: ['Coal', 'Gas', 'Other Fossil'] },
  { key: 'Nuclear',    color: '#6a4a9a', members: ['Nuclear'] },
  { key: 'Renewables', color: '#2a7a4a', members: ['Hydro', 'Wind', 'Solar', 'Bioenergy', 'Other Renewables'] },
];
const CAT_COLORS = Object.fromEntries(CATEGORIES.map(c => [c.key, c.color]));
let CHART_VIEW = (() => { try { return localStorage.getItem('energle_chart_view_v1') === 'category' ? 'category' : 'source'; } catch (e) { return 'source'; } })();

function colorOf(key) {
  if (CHART_VIEW === 'category' && CAT_COLORS[key]) return CAT_COLORS[key];
  return COLORS[key] || CAT_COLORS[key] || '#888888';
}
// Low-carbon total (nuclear + renewables) for one year, used in the category view's tooltips
function lowCarbonOf(yd) {
  return ['Nuclear', 'Renewables'].reduce((s, k) => s + (viewYear(yd)[k] || 0), 0);
}
// One year of data as the current view sees it (categories are summed from their sources)
function viewYear(yd) {
  if (!yd) return {};
  if (CHART_VIEW !== 'category') return yd;
  const out = { ...yd };
  CATEGORIES.forEach(c => { out[c.key] = c.members.reduce((s, m) => s + (yd[m] || 0), 0); });
  return out;
}
// The series to chart, biggest first in the latest year
function viewKeys(name) {
  if (CHART_VIEW !== 'category') return sortedSources(name);
  const info = ALL_DATA[name], ld = viewYear(info.years[info.latestYear]);
  return CATEGORIES.map(c => c.key).sort((a, b) => (ld[b] || 0) - (ld[a] || 0));
}
function setChartView(view) {
  if (view === CHART_VIEW) return;
  CHART_VIEW = view;
  try { localStorage.setItem('energle_chart_view_v1', view); } catch (e) {}
  renderCharts();
}

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

let practiceSession = { played: 0, solved: 0 };
function recordPracticeResult(won) {
  if (!won) practiceRetry.push(target);
  practiceSession.played++; if (won) practiceSession.solved++;
  const el = document.getElementById('pr-session'); if (el) el.textContent = practiceSessionText();
}
function practiceSessionText() {
  const s = practiceSession;
  return s.played ? s.solved + ' of ' + s.played + ' solved' : PRACTICE_POOL_SIZE() + ' countries';
}
function PRACTICE_POOL_SIZE() { return POOL.length; }

// ============================================================
//  RENDER CHARTS
// ============================================================
// Line chart: a dot where each line ends, with the source and its latest value beside it (labels are
// nudged apart so they never overlap). On phones only the value is written, to save width.
const LINE_END_LABELS = {
  id: 'lineEndLabels',
  afterDatasetsDraw(chart) {
    const narrow = window.innerWidth <= 600, ctx = chart.ctx, area = chart.chartArea;
    const items = [];
    chart.data.datasets.forEach((d, i) => {
      if (d.label.startsWith('__')) return;
      const meta = chart.getDatasetMeta(i); if (meta.hidden) return;
      const pt = meta.data[meta.data.length - 1]; if (!pt) return;
      const y = pt.getProps(['y'], true).y, x = pt.getProps(['x'], true).x;
      if (!isFinite(y)) return;
      items.push({ src: d.label, x, y, ly: y, v: d.data[d.data.length - 1] || 0 });
    });
    items.sort((a, b) => a.y - b.y);
    spreadLabels(items, narrow ? 12 : 14, area.top + 2, area.bottom + 4);
    ctx.save();
    const font = getComputedStyle(document.body).fontFamily;
    items.forEach(it => {
      const dim = FOCUS_SRC && FOCUS_SRC !== it.src, col = dim ? colorOf(it.src) + '40' : colorOf(it.src);
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(it.x, it.y, 3, 0, Math.PI * 2); ctx.fill();
      const lx = it.x + 8;
      if (Math.abs(it.ly - it.y) > 2) {                    // a short leader when the label had to move
        ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.globalAlpha = .5;
        ctx.beginPath(); ctx.moveTo(it.x + 4, it.y); ctx.lineTo(lx - 2, it.ly); ctx.stroke(); ctx.globalAlpha = 1;
      }
      ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      const val = it.v >= 100 ? Math.round(it.v) : it.v.toFixed(1);
      if (narrow) {
        ctx.font = '600 10.5px ' + font; ctx.fillStyle = dim ? '#c8c8c4' : col; ctx.fillText(val, lx, it.ly);
      } else {
        ctx.font = '600 11px ' + font; ctx.fillStyle = dim ? '#c8c8c4' : col;
        ctx.fillText(it.src, lx, it.ly);
        const w = ctx.measureText(it.src).width;
        ctx.font = '400 11px ' + font; ctx.fillStyle = dim ? '#d4d4d0' : '#888';
        ctx.fillText(' ' + val, lx + w, it.ly);
      }
    });
    ctx.restore();
  },
};

// Spreads labels (sorted top to bottom, each with a wanted position `ly`) so none are closer than `gap`,
// keeping them between minY and maxY. Only labels that are actually crowded move: a label with room
// to spare stays beside its own point (shifting the whole column used to push a lone top label off the chart).
function spreadLabels(list, gap, minY, maxY) {
  const n = list.length; if (!n) return;
  for (let k = 1; k < n; k++) if (list[k].ly - list[k - 1].ly < gap) list[k].ly = list[k - 1].ly + gap;
  if (list[n - 1].ly > maxY) {
    list[n - 1].ly = maxY;
    for (let k = n - 2; k >= 0; k--) if (list[k + 1].ly - list[k].ly < gap) list[k].ly = list[k + 1].ly - gap;
  }
  if (list[0].ly < minY) {
    list[0].ly = minY;
    for (let k = 1; k < n; k++) if (list[k].ly - list[k - 1].ly < gap) list[k].ly = list[k - 1].ly + gap;
  }
}

// Room to keep on the right of the line chart for the end labels (measured, so long names never get cut)
function endLabelRoom(keys, latestValues) {
  const narrow = window.innerWidth <= 600, ctx = document.createElement('canvas').getContext('2d');
  const font = getComputedStyle(document.body).fontFamily;
  let w = 0;
  keys.forEach(k => {
    const v = latestValues?.[k] || 0, val = v >= 100 ? String(Math.round(v)) : v.toFixed(1);
    ctx.font = '600 11px ' + font;
    const name = narrow ? 0 : ctx.measureText(k).width;
    ctx.font = (narrow ? '600 10.5px ' : '400 11px ') + font;
    w = Math.max(w, name + ctx.measureText((narrow ? '' : ' ') + val).width);
  });
  return Math.ceil(w + 16);
}

// Line chart: a faint vertical guide at the hovered year
const HOVER_GUIDE = {
  id: 'hoverGuide',
  beforeDatasetsDraw(chart) {
    const act = chart.tooltip && chart.tooltip.getActiveElements ? chart.tooltip.getActiveElements() : [];
    if (!act.length) return;
    const x = act[0].element.x, a = chart.chartArea, ctx = chart.ctx;
    ctx.save(); ctx.strokeStyle = '#d6d4cf'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(x, a.top); ctx.lineTo(x, a.bottom); ctx.stroke(); ctx.restore();
  },
};

// Bar chart: every segment's share of the latest year, written beside the bar on a "_/" leader line.
// Labels alternate between the two sides so the bar stays centred, and are nudged apart so they never overlap.
const BAR_SHARE_LABELS = {
  id: 'barShareLabels',
  afterDatasetsDraw(chart) {
    const total = chart.data.datasets.reduce((s, d) => s + (d.data[0] || 0), 0); if (!total) return;
    const ctx = chart.ctx, area = chart.chartArea, font = getComputedStyle(document.body).fontFamily;
    const fmt = p => (p < 0.1 ? '<0.1' : p < 10 ? p.toFixed(1) : String(Math.round(p))) + '%';
    const dark = c => 'rgb(' + [1, 3, 5].map(k => Math.round(parseInt(c.slice(k, k + 2), 16) * 0.6)).join(',') + ')';
    const segs = [];
    chart.data.datasets.forEach((d, i) => {
      const v = d.data[0] || 0, bar = chart.getDatasetMeta(i).data[0]; if (!v || !bar) return;
      const top = Math.min(bar.y, bar.base), h = Math.abs(bar.base - bar.y);
      segs.push({ cy: top + h / 2, x: bar.x, half: bar.width / 2, col: colorOf(d.label), text: fmt(v / total * 100), dim: FOCUS_SRC && FOCUS_SRC !== d.label });
    });
    segs.sort((a, b) => a.cy - b.cy);                       // top of the bar first
    const sides = [[], []];
    segs.forEach((sg, k) => { sg.side = k % 2 === 0 ? 1 : -1; sg.ly = sg.cy - 8; sides[k % 2].push(sg); });   // labels sit a little above: "_/"
    const GAP = 14;
    sides.forEach(list => spreadLabels(list, GAP, area.top + 4, area.bottom - 4));
    ctx.save(); ctx.textBaseline = 'middle'; ctx.lineWidth = 1; ctx.lineJoin = 'round';
    segs.forEach(o => {
      const s = o.side, e = o.x + s * o.half;                // segment edge on this side
      const x1 = e + s * 7, x2 = e + s * 15, x3 = e + s * 19, tx = e + s * 22;
      ctx.globalAlpha = o.dim ? 0.25 : 0.8; ctx.strokeStyle = o.col;
      ctx.beginPath(); ctx.moveTo(e + s * 1.5, o.cy); ctx.lineTo(x1, o.cy); ctx.lineTo(x2, o.ly); ctx.lineTo(x3, o.ly); ctx.stroke();
      ctx.globalAlpha = o.dim ? 0.35 : 1;
      ctx.font = '600 11px ' + font; ctx.textAlign = s > 0 ? 'left' : 'right'; ctx.fillStyle = dark(o.col);
      ctx.fillText(o.text, tx, o.ly);
    });
    ctx.restore();
  },
};

// ------------------------------------------------------------
//  TOOLTIPS ON TOUCH SCREENS
//  Charts: a tap on a point opens its tooltip, a tap on the same point (or anywhere else) closes it,
//  a tap on another point moves it. Scrolling, rotating or resizing closes every tooltip.
//  The game handles the taps itself, so a swipe that starts on a chart never opens anything.
// ------------------------------------------------------------
const IS_TOUCH = !!(window.matchMedia && window.matchMedia('(hover: none)').matches);
let tipOwner = null;    // { chart, index } of the chart tooltip that is open, or null

function closeChartTips() {
  hideTooltip();
  tipOwner = null;
  [lineChart, barChart].forEach(ch => {
    if (!ch || !ch.getActiveElements || !ch.getActiveElements().length) return;
    ch.setActiveElements([]); ch.tooltip.setActiveElements([], { x: 0, y: 0 }); ch.update('none');
  });
}
function closeRowTips() {
  document.querySelectorAll('.gr-num.is-open, .gr-hint.is-open').forEach(el => el.classList.remove('is-open'));
}
function closeAllTips() { closeChartTips(); closeRowTips(); closeDotTip(); }

function bindTapTooltip(chart) {
  // one listener per canvas, always acting on the chart currently drawn on it (charts are redrawn on the same canvas)
  if (!IS_TOUCH || chart.canvas.dataset.tapBound) return;
  chart.canvas.dataset.tapBound = '1';
  chart.canvas.addEventListener('click', e => {
    chart = Chart.getChart(e.currentTarget); if (!chart) return;
    const mode = chart.options.interaction?.mode || 'nearest', opts = chart.options.interaction || { intersect: true };
    const els = chart.getElementsAtEventForMode(e, mode, opts, false).filter(el => !chart.data.datasets[el.datasetIndex].label.startsWith('__') || mode === 'index');
    const idx = els.length ? els[0].index : null;
    const same = tipOwner && tipOwner.chart === chart && tipOwner.index === idx;
    closeAllTips();
    if (idx === null || same) return;
    const r = chart.canvas.getBoundingClientRect();
    chart.setActiveElements(els);
    chart.tooltip.setActiveElements(els, { x: e.clientX - r.left, y: e.clientY - r.top });
    chart.update('none');
    tipOwner = { chart, index: idx };
  });
}

// Distance chart: the flags and the grey average points carry their details in a title (shown on hover);
// on touch screens a tap shows the same text in a small bubble, and a second tap closes it.
let dotTipEl = null;
function closeDotTip() {
  if (!dotTipEl) return;
  const t = document.getElementById('dot-tip'); if (t) t.remove();
  dotTipEl = null;
}
function openDotTip(el) {
  const text = el.getAttribute('data-tip') || el.getAttribute('title'); if (!text) return;
  if (!el.getAttribute('data-tip')) { el.setAttribute('data-tip', text); el.removeAttribute('title'); }
  const tip = document.createElement('div'); tip.id = 'dot-tip'; tip.textContent = text; document.body.appendChild(tip);
  const r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight, m = 8;
  let left = r.left + r.width / 2 - w / 2, top = r.top - h - 8;
  if (top < m) top = r.bottom + 8;
  tip.style.left = Math.max(m, Math.min(left, innerWidth - w - m)) + 'px';
  tip.style.top = top + 'px';
  dotTipEl = el;
}

if (IS_TOUCH) {
  document.addEventListener('click', e => {
    if (e.target.closest('#charts-section canvas')) return;                 // handled by bindTapTooltip
    const dot = e.target.closest('.dc [title], .dc [data-tip]');
    if (dot) { const again = dotTipEl === dot; closeAllTips(); if (!again) openDotTip(dot); return; }
    if (!e.target.closest('.gr-num, .gr-hint')) closeAllTips();
  });
}
['scroll', 'resize', 'orientationchange'].forEach(ev => window.addEventListener(ev, () => {
  if (tipOwner || dotTipEl || document.querySelector('.gr-num.is-open, .gr-hint.is-open')) closeAllTips();
}, { passive: true }));

function renderCharts() {
  const info = ALL_DATA[target.name];
  const years = Object.keys(info.years).map(Number).sort((a,b) => a-b);
  const V = {}; years.forEach(y => { V[y] = viewYear(info.years[y]); });
  const latest = years[years.length-1], latestData = V[latest], ordered = viewKeys(target.name);

  document.getElementById('bar-label').textContent = 'Electricity mix (' + latest + ')';
  const lineLabel = document.getElementById('line-label');
  if (lineLabel) lineLabel.textContent = 'Electricity generation by ' + (CHART_VIEW === 'category' ? 'category' : 'source') + ' (TWh)';
  closeAllTips();
  if (lineChart) { lineChart.destroy(); lineChart = null; }
  if (barChart)  { barChart.destroy();  barChart  = null; }

  // Only chart sources the country has actually used (non-zero in at least one year)
  // — otherwise unused sources render as flat dotted lines along the x-axis
  const activeSources = ordered.filter(src => years.some(y => (V[y]?.[src] ?? 0) > 0));
  const AREA = false;
  const srcDS = activeSources.map(src => ({
    label: src, data: years.map(y => V[y]?.[src] ?? 0),
    // Colours are functions so a legend highlight (FOCUS_SRC) restyles every line on update
    borderColor: () => focusColor(src, '2e'), backgroundColor: colorOf(src) + '22',
    borderWidth: () => (FOCUS_SRC === src ? 2.8 : 2),
    pointRadius: 0, pointHoverRadius: 4, pointBorderColor: '#fff', pointBorderWidth: 1.5,
    pointBackgroundColor: () => focusColor(src, '2e'), pointHoverBorderWidth: 2,
    fill: false, cubicInterpolationMode: 'monotone',   // slight rounding that never dips below a real value (or below zero)
  }));
  const hidDS = [
    { label:'__total__',      data: years.map(y => info.years[y]?.Total ?? 0) },
    { label:'__netimports__', data: years.map(y => info.years[y]?.NetImports ?? null), spanGaps: true },
    { label:'__demand__',     data: years.map(y => info.years[y]?.Demand ?? null), spanGaps: true },
  ].map(d => ({ ...d, borderColor:'transparent', backgroundColor:'transparent', borderWidth:0, pointRadius:0, pointHoverRadius:0, hidden:true, fill:false, tension:0.3 }));

  lineChart = new Chart(document.getElementById('line-chart').getContext('2d'), {
    type: 'line', data: { labels: years, datasets: [...srcDS, ...hidDS] },
    plugins: [LINE_END_LABELS, HOVER_GUIDE],
    options: {
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { right: endLabelRoom(activeSources, V[latest]), top: 6 } },
      ...(IS_TOUCH ? { events: [] } : {}),                   // phones: taps are handled by bindTapTooltip
      animations: lineDrawAnimation(years.length),
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: { enabled: false, external: externalTooltipLine } },
      scales: {
        x: { grid: { display: false }, border: { color: '#e4e3df' },
             ticks: { color:'#9a9a96', font:{size:11}, maxTicksLimit:7, autoSkip:true, maxRotation:0 } },
        y: { grid: { color:'#efeeea' }, border: { display:false },
             ticks: { color:'#9a9a96', font:{size:11}, padding:6, maxTicksLimit:6 }, beginAtZero: true },
      },
    },
  });

  lineChartBornAt = performance.now();
  bindTapTooltip(lineChart);

  barChart = new Chart(document.getElementById('bar-chart').getContext('2d'), {
    type: 'bar',
    data: { labels: [''], datasets: [...activeSources].reverse().map(src => ({ label:src, data:[latestData[src]||0],
      // semi-transparent fill with a solid edge in the same colour, like the energy balance flows
      backgroundColor: () => FOCUS_SRC && FOCUS_SRC !== src ? colorOf(src) + '1a' : colorOf(src) + '80',
      borderColor: () => focusColor(src, '40'), borderWidth: 1.5, borderSkipped: false, borderRadius: 3,
      barPercentage: 0.7, categoryPercentage: 1, maxBarThickness: window.innerWidth > 600 ? 46 : 64 })) },
    plugins: [BAR_SHARE_LABELS],
    options: {
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { left: 6, right: 6, top: 4 } },
      ...(IS_TOUCH ? { events: [] } : {}),
      animation: barStackAnimation(),
      plugins: { legend: { display: false }, tooltip: { enabled: false, external: externalTooltipBar } },
      scales: {
        x: { stacked:true, grid:{display:false}, ticks:{display:false}, border:{color:'#e4e3df'} },
        y: { stacked:true, grid:{color:'#efeeea'}, border:{display:false, dash:[3,4]}, ticks:{color:'#9a9a96',font:{size:11},padding:6,maxTicksLimit:6},
          ...phoneBarAxis(activeSources.reduce((a, s) => a + (latestData[s] || 0), 0)) },
      },
    },
  });

  bindTapTooltip(barChart);
  renderLegend(activeSources);
  clearTimeout(smokeTimer);
  smokeTimer = setTimeout(addCarbonSmoke, REDUCED_MOTION ? 0 : 900);   // once the bar has stacked up
}

// ============================================================
//  CARBON SMOKE: soft puffs rising from the latest-mix bar, more and darker the dirtier the grid.
//  Uses Ember's CO2 intensity (gCO2/kWh) when the data has it, otherwise an estimate from the mix.
// ============================================================
const CO2_FACTOR = { 'Coal': 820, 'Gas': 490, 'Other Fossil': 650, 'Bioenergy': 230, 'Nuclear': 12, 'Hydro': 24, 'Wind': 11, 'Solar': 41, 'Other Renewables': 38 };
let smokeTimer = null, WORLD_CO2 = null;
function co2Intensity(yd) {
  if (!yd) return null;
  if (typeof yd.CO2 === 'number' && yd.CO2 > 0) return yd.CO2;
  const tot = yd.Total || 0; if (!tot) return null;
  return Object.keys(CO2_FACTOR).reduce((a, k) => a + (yd[k] || 0) * CO2_FACTOR[k], 0) / tot;
}
function worldCo2() {
  if (WORLD_CO2 !== null) return WORLD_CO2;
  let g = 0, e = 0;
  Object.values(ALL_DATA).forEach(info => {
    const yd = info.years[info.latestYear] || {}, i = co2Intensity(yd);
    if (i !== null) { g += yd.Total; e += i * yd.Total; }
  });
  return (WORLD_CO2 = g ? e / g : 0);
}
// Soft grey puffs rising from the top of the latest-mix bar. Grids around the world average get a
// light wisp; only heavy polluters get a thick, dark column, and even then it stops at the top edge
// of the card (it may just brush the card above, never cover it).
// Phone: the bar chart is short, so the axis stops just above the bar (at most 5 steps of 1, 2, 2.5 or 5 × 10ⁿ)
// instead of leaving a whole empty step on top. Desktop keeps Chart.js's own ticks.
function phoneBarAxis(total) {
  if (window.innerWidth > 600 || !(total > 0)) return {};
  const mag = Math.pow(10, Math.floor(Math.log10(total / 5)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => Math.ceil(total * 1.04 / s) <= 5);
  return { max: Math.ceil(total * 1.04 / step) * step, ticks: { color:'#9a9a96', font:{size:11}, padding:6, stepSize: step } };
}

const PUFF_SVG = '<svg viewBox="0 0 44 32" aria-hidden="true"><path d="M11 27a8 8 0 0 1-1.6-15.8A10 10 0 0 1 28.5 8.6a8 8 0 0 1 7.3 13.1A5.6 5.6 0 0 1 32 27z"/></svg>';
function addCarbonSmoke() {
  if (!barChart || !target) return;
  const info = ALL_DATA[target.name], yd = info.years[info.latestYear] || {};
  const I = co2Intensity(yd); if (I === null) return;
  const wrap = document.getElementById('bar-wrapper'), card = document.getElementById('chart-right');
  if (!wrap || !card) return;
  wrap.querySelectorAll('.co2-smoke').forEach(n => n.remove());
  // the figure sits under the chart, out of the smoke's way
  card.querySelectorAll('.co2-note').forEach(n => n.remove());
  const w = Math.round(worldCo2() / 10) * 10;
  // two matching columns: this grid | world average, same label + value layout as the stat cards
  card.insertAdjacentHTML('beforeend', '<div class="co2-note" title="Grams of CO₂ emitted for each kWh of electricity">'
    + '<div class="co2-col"><span class="co2-lbl"><svg viewBox="0 0 44 32" width="13" height="10" aria-hidden="true"><path d="M11 27a8 8 0 0 1-1.6-15.8A10 10 0 0 1 28.5 8.6a8 8 0 0 1 7.3 13.1A5.6 5.6 0 0 1 32 27z"/></svg>CO₂ intensity</span>'
    + '<span class="co2-val"><strong>' + Math.round(I / 10) * 10 + '</strong> g/kWh</span></div>'
    + '<div class="co2-col co2-world"><span class="co2-lbl">World avg.</span>'
    + '<span class="co2-val"><strong>' + w + '</strong> g/kWh</span></div></div>');
  if (I < 80) return;                                         // clean grids: no smoke
  const metas = barChart.data.datasets.map((d, i) => barChart.getDatasetMeta(i)).filter(m => !m.hidden && m.data[0]);
  if (!metas.length) return;
  const pts = metas.map(m => m.data[0].getProps(['x', 'y'], true));
  const x = pts[0].x, yTop = Math.min(...pts.map(p => p.y));
  // 0 at 80 g, 1 at 900 g; the curve keeps average grids (about 400 g) light: k ≈ 0.25 there, 0.55 at 620 g
  const k = Math.pow(Math.min(1, (I - 80) / 820), 1.4);
  const n = 3 + Math.round(7 * k);
  const alpha = (0.5 + 0.38 * k).toFixed(2), tone = Math.round(150 - 72 * k);
  // never higher than the top edge of the card (+ a few pixels for the worst, just brushing the card above)
  const toCardTop = yTop + (wrap.getBoundingClientRect().top - card.getBoundingClientRect().top);
  let rise = Math.max(26, Math.min(40 + 150 * k, toCardTop - 8 + 22 * k));
  // phone: a shorter, straighter, smaller column that stays under the chart title
  const phone = window.innerWidth <= 600;
  if (phone) {
    const lbl = document.getElementById('bar-label');
    const titleBottom = lbl ? lbl.getBoundingClientRect().bottom - wrap.getBoundingClientRect().top : -8;
    rise = Math.max(16, yTop - titleBottom - 12);
  }
  const smoke = document.createElement('div');
  smoke.className = 'co2-smoke'; smoke.setAttribute('aria-hidden', 'true');
  smoke.style.cssText = 'left:' + x + 'px;top:' + yTop + 'px;--c:' + tone + ',' + tone + ',' + (tone - 4)
    + ';--l:' + (tone - 40) + ',' + (tone - 40) + ',' + (tone - 46) + ';--a:' + alpha + ';--rise:' + rise.toFixed(0) + 'px';
  const dur = 3.6 - 0.4 * k;
  for (let i = 0; i < n; i++) {
    const p = document.createElement('span');
    p.className = 'co2-puff';
    p.innerHTML = PUFF_SVG;
    p.style.setProperty('--dx', phone ? ((i % 2 ? 1 : -1) * (1 + i % 3)) + 'px' : ((i % 2 ? 1 : -1) * (4 + (i * 7) % 14) + 10 * k) + 'px');
    p.style.setProperty('--s', phone ? (0.8 + 0.45 * k + (i % 3) * 0.08).toFixed(2) : (1.1 + 1.1 * k + (i % 3) * 0.15).toFixed(2));
    p.style.animationDuration = dur.toFixed(2) + 's';
    p.style.animationDelay = (-i * dur / n).toFixed(2) + 's';
    smoke.appendChild(p);
  }
  wrap.appendChild(smoke);
}

function renderLegend(keys) {
  const cat = CHART_VIEW === 'category';
  const toggle = '<div class="view-toggle" role="group" aria-label="Group the charts">'
    + '<button type="button" class="vt-btn' + (cat ? '' : ' is-on') + '" aria-pressed="' + !cat + '" onclick="setChartView(\'source\')">By source</button>'
    + '<button type="button" class="vt-btn' + (cat ? ' is-on' : '') + '" aria-pressed="' + cat + '" onclick="setChartView(\'category\')">By category</button></div>';
  document.getElementById('legend-shared').innerHTML =
    '<div class="lg-head">' + toggle
    + '<button type="button" class="glossary-btn" onclick="showGlossaryModal()" aria-label="What each source covers"><span class="glossary-icon" aria-hidden="true">i</span>'
    + '<span class="gb-long">What each source covers</span><span class="gb-short">Details</span></button></div>'
    + '<div class="lg-items' + (cat ? ' lg-items--cat' : '') + '">' + keys
      .map(k => {
        const group = cat ? CATEGORIES.find(c => c.key === k) : null;
        return '<div class="legend-item" data-src="' + k + '" tabindex="0" role="button" aria-pressed="false"' + (group ? ' title="' + group.members.join(', ') + '"' : '') + '>'
          + '<span class="legend-swatch" style="background:' + colorOf(k) + '"></span><span class="legend-name">' + k + '</span>'
          + (group ? '<span class="legend-members">' + group.members.join(' · ') + '</span>' : '') + '</div>';
      })
      .join('') + '</div>'
    + '<p class="og-src og-src--in">Source: Ember</p>';
  bindLegendFocus();
}
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
  return FOCUS_SRC && FOCUS_SRC !== src ? colorOf(src) + fadedAlpha : colorOf(src);
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
const GLOSSARY = [
  { group: 'Fossil fuels', tone: '#8a4a2a', items: [
    ['Coal', 'Hard coal and lignite burned in thermal power stations.'],
    ['Gas', 'Natural gas and LNG burned in gas turbines or combined-cycle plants.'],
    ['Other Fossil', 'Oil, diesel, heavy fuel oil, other petroleum products and waste incineration.'] ] },
  { group: 'Low-carbon · nuclear', tone: '#6a4a9a', items: [
    ['Nuclear', 'Electricity from uranium fission. Very low lifecycle emissions.'] ] },
  { group: 'Low-carbon · renewables', tone: '#2a7a4a', items: [
    ['Hydro', 'Run-of-river and reservoir hydropower.'],
    ['Wind', 'Onshore and offshore wind turbines.'],
    ['Solar', 'Solar photovoltaic (PV) panels and solar thermal plants.'],
    ['Bioenergy', 'Biomass, biogas, sugarcane bagasse and wood pellets.'],
    ['Other Renewables', 'Geothermal, tidal and wave energy.'] ] },
];

function showGlossaryModal() {
  const existing = document.getElementById('glossary-modal'); if (existing) existing.remove();
  // Sources that appear in today's charts get a small tag, so the list maps onto what is on screen
  const info = target && ALL_DATA[target.name];
  const inMix = src => !!info && Object.values(info.years).some(y => (y?.[src] ?? 0) > 0);
  const body = GLOSSARY.map(g => '<section class="gl-group"><h3 class="gl-group-title" style="color:' + g.tone + '">' + g.group + '</h3><ul class="gl-list">'
    + g.items.map(([src, desc]) => '<li class="gl-item' + (inMix(src) ? '' : ' is-absent') + '">'
      + '<span class="gl-sw" style="background:' + COLORS[src] + '" aria-hidden="true"></span>'
      + '<div class="gl-text"><span class="gl-name">' + src + (inMix(src) ? '<span class="gl-here">In this chart</span>' : '') + '</span>'
      + '<span class="gl-desc">' + desc + '</span></div></li>').join('')
    + '</ul></section>').join('');
  const modal = document.createElement('div'); modal.id = 'glossary-modal';
  modal.innerHTML = '<div class="st-backdrop"></div>'
    + '<div class="gl-box" role="dialog" aria-modal="true" aria-labelledby="gl-title">'
    + '<span class="gl-grab" aria-hidden="true"></span>'
    + '<div class="gl-head"><div class="gl-heading"><span class="gl-title" id="gl-title">Electricity sources</span>'
    + '<span class="gl-sub">What each colour in the charts includes</span></div>'
    + '<button type="button" class="sx-close" id="gl-close-btn" aria-label="Close">×</button></div>'
    + '<div class="gl-body">' + body + '</div>'
    + '<p class="gl-foot">Source: <a href="https://ember-energy.org/data/yearly-electricity-data/" target="_blank" rel="noopener">Yearly Electricity Data | Ember</a> (CC BY 4.0)</p>'
    + '</div>';
  const close = () => { modal.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  modal.querySelector('.st-backdrop').addEventListener('click', close);
  document.body.appendChild(modal);
  document.getElementById('gl-close-btn').addEventListener('click', close);
  document.addEventListener('keydown', onKey);
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
  const maxW     = Math.min(isMobile ? 250 : 270, window.innerWidth - margin * 2);
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
    // Phones: just above the tapped point, centred on it; below it when there is no room above
    left = rect.left + caretX - maxW / 2;
    top  = rect.top + caretY - tipH - 14;
    if (top < margin) top = rect.top + caretY + 18;
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
  const p = total > 0 ? Math.abs(twh) / total * 100 : 0;
  return '<div class="tt-row' + (bold ? ' tt-row--b' : '') + '"><span class="tt-sw" style="background:' + color + '"></span>'
    + '<span class="tt-l">' + label + '</span><span class="tt-v">' + fmtTWh(Math.abs(twh)) + '</span>'
    + '<span class="tt-p">' + (p < 10 ? p.toFixed(1) : Math.round(p)) + '%</span></div>';
}

function externalTooltipLine(context) {
  const model = context.tooltip; if (model.opacity === 0) { hideTooltip(); return; }
  const year = parseInt(model.title?.[0]), yd = ALL_DATA[target.name]?.years[year] ?? {};
  const total = yd.Total ?? 0, demand = yd.Demand ?? null, netImp = yd.NetImports ?? null;
  let html = '<div class="tt-h">' + year + '</div>';
  html += tooltipRow('#4a90c4', 'Total generation', total, total, true);
  if (demand !== null && demand > 0) html += tooltipRow('#1a1a1a', 'Demand', demand, total, true);
  if (netImp !== null && netImp !== 0) html += tooltipRow(netImp<0?'#3f3cbb':'#e0218a', netImp<0?'Net exports':'Net imports', Math.abs(netImp), total, true);
  if (CHART_VIEW === 'category') html += tooltipRow('#3f7f66', 'Low-carbon (nuclear + renewables)', lowCarbonOf(yd), total, true);
  html += '<div class="tt-sep"></div><div>';
  model.dataPoints.filter(dp => !dp.dataset.label.startsWith('__') && (dp.parsed?.y ?? 0) > 0)
    .sort((a,b) => (b.parsed?.y??0) - (a.parsed?.y??0))
    .forEach(dp => { html += tooltipRow(colorOf(dp.dataset.label), dp.dataset.label, dp.parsed.y, total, false); });
  html += '</div>'; showTooltip(html, context.chart.canvas, model.caretX, model.caretY);
}

function externalTooltipBar(context) {
  const model = context.tooltip; if (model.opacity === 0) { hideTooltip(); return; }
  const info = ALL_DATA[target.name], latest = info.latestYear, data = info.years[latest], total = data.Total ?? 0;
  let html = '<div class="tt-h">Mix in ' + latest + '</div>';
  html += tooltipRow('#4a90c4', 'Total generation', total, total, true);
  if (data.Demand && data.Demand > 0) html += tooltipRow('#1a1a1a', 'Demand', data.Demand, total, true);
  if (data.NetImports && data.NetImports !== 0) html += tooltipRow(data.NetImports<0?'#3f3cbb':'#e0218a', data.NetImports<0?'Net exports':'Net imports', Math.abs(data.NetImports), total, true);
  if (CHART_VIEW === 'category') html += tooltipRow('#3f7f66', 'Low-carbon (nuclear + renewables)', lowCarbonOf(data), total, true);
  html += '<div class="tt-sep"></div><div>';
  const vd = viewYear(data);
  viewKeys(target.name).filter(src => (vd[src]||0) > 0)
    .forEach(src => { html += tooltipRow(colorOf(src), src, vd[src], total, false); });
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

// Compass: two light quarter arcs (north-east and south-west), an "N", and a black needle.
const COMPASS_DIAL = (() => {
  const P = (a, r) => { const q = a * Math.PI / 180; return (26 + r * Math.sin(q)).toFixed(1) + ' ' + (26 - r * Math.cos(q)).toFixed(1); };
  const arcs = [16, 196].map(a => 'M' + P(a, 17) + ' A17 17 0 0 1 ' + P(a + 58, 17)).join(' ');
  return '<svg viewBox="0 0 52 52" width="22" height="22"><path d="' + arcs + '" fill="none" stroke="#b9bec6" stroke-width="2.5" stroke-linecap="round"/>'
    + '<text x="26" y="12.5" text-anchor="middle" font-size="13" font-weight="800" fill="#1a1a1a" font-family="inherit">N</text></svg>';
})();
function compassHTML(deg) {
  return '<span class="gr-compass" aria-hidden="true">' + COMPASS_DIAL
    + '<span class="gr-needle" style="--deg:' + deg.toFixed(1) + 'deg"><svg viewBox="0 0 52 52" width="22" height="22">'
    + '<polygon points="26,12 26,30 17.5,35" fill="#1a1a1a"/><polygon points="26,12 34.5,35 26,30" fill="#4b4b4b"/></svg></span></span>';
}

// ============================================================
//  GUESSES LEFT: a six-cell battery
//  Green with 4-6 left, amber with 2-3, red with the last one. A wrong guess makes the
//  cell it uses flicker out; on a win the cells left glow one after another.
// ============================================================
function renderLives(drain = false) {
  const container = document.getElementById('lives-container'); if (!container) return;
  const left = MAX_GUESSES - cellsUsed();
  const color = left >= 4 ? 'is-high' : left >= 2 ? 'is-mid' : 'is-low';
  let cells = '';
  for (let i = 0; i < MAX_GUESSES; i++) {
    const on = i < left, justUsed = drain && i === left;
    cells += '<span class="battery-cell' + (on ? ' is-on ' + color : '') + (justUsed ? ' is-drain' : '') + '"></span>';
  }
  container.innerHTML = '<span class="battery" role="img" aria-label="' + left + ' of ' + MAX_GUESSES + ' guesses left">'
    +   '<span class="battery-body">' + cells + '</span><span class="battery-cap"></span></span>';
  const count = document.getElementById('lives-count');
  if (count) count.textContent = left + '/' + MAX_GUESSES;
  updateShopButton();
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
  const match = COUNTRIES.find(c => nameMatches(c, val));
  if (!match) { error.textContent = '"' + val + '" not found — check spelling.'; return; }
  if (guesses.find(g => g.iso3 === match.iso3)) { error.textContent = 'Already guessed!'; return; }
  error.textContent = '';
  guesses.push(match); shopNoteGuess(match);
  const isCorrect = match.iso3 === target.iso3;
  renderLives(!isCorrect);
  addGuessRow(match, isCorrect);
  input.value = ''; syncInputFlag(); document.getElementById('autocomplete-list').style.display = 'none';
  saveDailyState();
  if (isCorrect)                          { renderResultCard(true);  endGame(); }
  else if (cellsUsed() >= MAX_GUESSES)   { renderResultCard(false); endGame(); }
  else renderClueCards();
}

// One slim row per guess, newest on top.
//   left:  closeness ring around the guess number · flag · country · that country's own figures
//   right: the hint toward the answer: compass and direction as one piece, the distance (in the closeness colour) under it
//   under: a thin "live wire" energised up to the closeness level; the ambient pulse sometimes runs along one
function addGuessRow(country, isCorrect, animate = true) {
  const num = cellsUsed();    // this guess's number (1-based, set after the push; cells spent on clue cards count too)
  const onCards = SHOP.cardCells();
  const row = document.createElement('div');
  row.className = 'gr-row' + (isCorrect ? ' gr-row--win' : '') + (animate && !REDUCED_MOTION ? ' gr-anim' : '');
  const name = escHtml(country.name);
  if (isCorrect) {
    row.innerHTML = '<span class="gr-sweep" aria-hidden="true"></span><span class="gr-current" aria-hidden="true"></span>'
      + '<div class="gr-winline"><span class="gr-badge">' + num + '</span>'
      + '<span class="gr-name">' + flagImg(country.iso3) + '<span>' + name + '</span></span>'
      + '<span class="gr-wintxt">Puzzle solved in ' + num + (onCards ? '<span class="u-long"> · ' + onCards + ' on clue cards</span>' : '') + '</span>'
      + '<span class="gr-check" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span></div>';
  } else {
    const h = guessInfo(country), col = closeRGB(h.prox);
    const L = 2 * Math.PI * 13, filled = L * h.prox / 100;
    row.style.setProperty('--cl', col.join(','));
    const facts = fmtTWh(country.latestTotal) + '<span class="u-long"> generated</span>'
      + (country.latestDpc != null ? '<span class="gr-dot">·</span>' + country.latestDpc.toFixed(1)
        + ' MWh/<span class="u-long">person</span><span class="u-short">cap</span>' : '');
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
      +   '<span class="gr-hintbox"><span class="gr-hintdir">' + compassHTML(h.deg) + '<span class="gr-dir">' + h.dir + '</span></span>'
      +   '<span class="gr-km" style="color:' + darker(col) + '">' + fmtKm(h.km) + '</span></span>'
      +   '<span class="gr-htip" role="tooltip">Hint toward the answer: it lies about ' + fmtKm(h.km) + ' to the ' + DIR_NAMES[h.dir] + ' of ' + name
      +   '. The figures on the left are ' + name + '’s own.</span>'
      + '</button></div>'
      + '<span class="gr-wire" aria-hidden="true"><span class="gr-wire-fill" style="width:' + h.prox + '%"></span></span>';
  }
  const container = document.getElementById('guesses');
  container.insertBefore(row, container.firstChild);
}

// Guess rows: a tap opens the ring's or the hint's explanation (hover does it with a mouse);
// a second tap, a tap anywhere else, or scrolling closes it. Only one is open at a time.
document.addEventListener('click', e => {
  const t = e.target.closest('.gr-num, .gr-hint'); if (!t) return;
  const wasOpen = t.classList.contains('is-open');
  closeAllTips();
  if (!wasOpen) t.classList.add('is-open');
});

// ------------------------------------------------------------
//  RESULT CARD (replaces the old emoji banner, sits where the input was)
//  The guesses are stops on a line, in order, each the country's flag in its closeness colour.
//  Win: a current runs along the line to the answer, which lights green.
//  Loss: the current stops at the last guess; a dashed gap leads to the answer, revealed greyed out.
// ------------------------------------------------------------
// ------------------------------------------------------------
//  DISTANCE CHART (result card and stats screen)
//  How far each guess was from the answer, guess by guess. The answer sits on the 0 km line:
//  reached on a win, joined by a dashed line on a loss.
// ------------------------------------------------------------
// Heights for the guesses: on a log scale between the closest and the farthest guess, then spread so that
// any two different distances are always visibly apart (order kept, exact km written on each point).
function distanceLevels(kms) {
  const fn = distanceLevelFn(kms);
  return kms.map(fn);
}
// The same scale as a function, so any distance (e.g. today's average) can be placed on it.
// Between two of your guesses it interpolates on the log scale; beyond them it extends gently.
// floor: height of the closest guess above the 0 km line (higher after a loss, so the final drop stays visible)
function distanceLevelFn(kms, floor = 0.22) {
  const uniq = [...new Set(kms)].sort((a, b) => a - b);
  if (uniq.length === 1) {
    const k0 = uniq[0];
    return km => (km <= 0 ? 0 : Math.max(0.08, Math.min(1.1, 0.6 + 0.25 * Math.log(km / k0))));
  }
  const lo = Math.log(uniq[0]), hi = Math.log(uniq[uniq.length - 1]);
  const t = uniq.map(k => (Math.log(k) - lo) / ((hi - lo) || 1));
  const MIN = Math.min(0.16, 1 / (uniq.length - 1));
  for (let i = 1; i < t.length; i++) t[i] = Math.max(t[i], t[i - 1] + MIN);
  const top = t[t.length - 1];
  const anchors = uniq.map((k, i) => [Math.log(k), floor + (1 - floor) * t[i] / top]);   // the answer sits on the 0 line
  return km => {
    if (km <= 0) return 0;
    const lk = Math.log(km);
    if (lk <= anchors[0][0]) return Math.max(0.06, anchors[0][1] - (anchors[0][0] - lk) * 0.12);
    const L = anchors.length - 1;
    if (lk >= anchors[L][0]) return Math.min(1.12, anchors[L][1] + (lk - anchors[L][0]) * 0.12);
    let i = 1; while (anchors[i][0] < lk) i++;
    const [x0, y0] = anchors[i - 1], [x1, y1] = anchors[i];
    return y0 + (y1 - y0) * (lk - x0) / (x1 - x0);
  };
}
// Distances in the distance chart: whole kilometres with a thousands separator, e.g. 7,484 km
function chartNum(km) { return Math.round(km).toLocaleString('en-US'); }
function chartKm(km) { return chartNum(km) + ' km'; }

function pathHTML(won, mini, animate) {
  if (SHOP.cardCells()) return shopPathHTML(won, mini, animate);
  // Win: every wrong guess, then the answer on the 0 km line.
  // Loss: the six guesses only, and a straight drop from the last one to the 0 km line with its distance.
  const pts = guesses.filter(c => c.iso3 !== target.iso3).map(c => ({ c, h: guessInfo(c), isAns: false }));
  if (won) pts.push({ c: target, h: null, isAns: true });
  const n = pts.length, last = n - 1;
  const kmList = pts.filter(p => !p.isAns).map(p => Math.max(1, p.h.km));
  const levelOf = distanceLevelFn(kmList.length ? kmList : [1000], won ? 0.22 : 0.36);
  pts.forEach((p, i) => {
    p.x = n > 1 ? i / last : 0.5;
    p.y = p.isAns ? 0 : levelOf(Math.max(1, p.h.km));
    p.col = p.isAns ? WIN_RGB : closeRGB(p.h.prox);
  });
  const RUN = Math.min(1.6, 0.4 + 0.3 * last), START = 0.35;
  const at = p => START + RUN * p.x;
  const X = p => (p.x * 100).toFixed(2), Y = p => ((1 - p.y) * 100).toFixed(2);

  // y-axis: the 0 km line (the answer) plus round distances placed on the same scale as the points
  let grid = '<span class="dc-grid dc-grid--base" style="top:100%">' + (mini ? '' : '<span class="dc-yl">0</span>') + '</span>';
  if (!mini && kmList.length) {
    const lo = Math.min(...kmList), hi = Math.max(...kmList);
    const ticks = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 15000, 20000]
      .filter(c => c >= lo * 0.8 && c <= hi * 1.15).map(c => [c, levelOf(c)]).filter(t => t[1] <= 1.06).sort((a, b) => b[1] - a[1]);
    const kept = [];
    ticks.forEach(t => { if (t[1] >= 0.12 && kept.every(k => Math.abs(k[1] - t[1]) >= 0.18)) kept.push(t); });
    kept.forEach(t => { grid += '<span class="dc-grid" style="top:' + ((1 - t[1]) * 100).toFixed(2) + '%"><span class="dc-yl">' + chartNum(t[0]) + '</span></span>'; });
    grid += '<span class="dc-yt">km</span>';
  }
  let svg = '';
  if (n > 1) {
    svg = '<div class="dc-reveal" style="--dur:' + RUN.toFixed(2) + 's;--at:' + START + 's;--end:100%">'
      + '<svg class="dc-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">'
      + '<polyline class="dc-line" points="' + pts.map(p => X(p) + ',' + Y(p)).join(' ') + '"/></svg></div>';
  }
  let drop = '';
  if (!won && n) {
    const lp = pts[last];
    drop = '<svg class="dc-svg dc-dropsvg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" style="--at:' + (START + RUN).toFixed(2) + 's">'
      + '<line class="dc-drop" x1="' + X(lp) + '" y1="' + Y(lp) + '" x2="' + X(lp) + '" y2="100"/></svg>'
      + (mini ? '' : '<span class="dc-droplbl" style="left:' + X(lp) + '%;top:' + ((1 - lp.y / 2) * 100).toFixed(2) + '%;--at:' + (START + RUN).toFixed(2) + 's">'
        + chartNum(lp.h.km) + '<span class="u-long"> km</span></span>');
  }
  const nodes = pts.map(p => {
    const title = p.isAns ? p.c.name + ', the answer' : p.c.name + ', ' + chartKm(p.h.km) + ' away (' + p.h.prox + '% close)';
    const cls = 'go-node' + (p.isAns ? ' go-node--answer' : '');
    return '<span class="dc-node" style="left:' + X(p) + '%;top:' + Y(p) + '%">'
      + '<span class="' + cls + '" style="--cl:' + p.col.join(',') + ';--at:' + at(p).toFixed(2) + 's" title="' + escHtml(title) + '">'
      + '<span class="go-ring">' + flagImg(p.c.iso3, 'go-flag') + '</span>'
      + (p.isAns && !mini ? '<span class="go-badge" aria-hidden="true">✓</span><span class="go-burst" aria-hidden="true"></span>' : '')
      + '</span></span>';
  }).join('');
  let labels = '', xs = '';
  if (!mini) {
    // distance above each guess (the last guess of a lost game has its distance on the drop line instead)
    labels = pts.filter((p, i) => !p.isAns && (won || i < last)).map((p, i) => {
      const pos = i === 0 && n > 1 ? 'l' : 'c';
      return '<span class="dc-lbl dc-lbl--' + pos + '" style="left:' + X(p) + '%;top:' + Y(p) + '%;--at:' + at(p).toFixed(2) + 's">' + chartNum(p.h.km) + '<span class="u-long"> km</span></span>';
    }).join('');
    // guess numbers under the chart; on a win the answer's name sits under the answer
    xs = '<div class="dc-x">' + pts.map((p, i) => p.isAns
      ? '<span class="dc-x-ans" style="left:' + X(p) + '%;color:#2f7a4d">' + escHtml(p.c.name) + '</span>'
      : '<span style="left:' + X(p) + '%">' + (i + 1) + '</span>').join('') + '</div>';
  }
  const label = 'Distance to the answer, guess by guess: ' + pts.filter(p => !p.isAns).map(p => chartKm(p.h.km)).join(', ')
    + (won ? ', then the answer' : (MODE === 'normal' ? '. Today’s country was ' : '. The country was ') + target.name);
  return { html: '<div class="dc' + (mini ? ' dc--mini' : '') + (n === 1 ? ' dc--one' : '') + (won ? '' : ' dc--lost') + (animate && !REDUCED_MOTION ? ' go-anim' : '') + '" role="img" aria-label="' + escHtml(label) + '">'
      + '<div class="dc-plot">' + grid + '<div class="dc-in">' + svg + drop + nodes + labels + '</div></div>' + xs + '</div>',
    doneAt: START + RUN + 0.2 };
}

// Adds today's finished daily game to the shared totals, once per day (remembered across reloads)
function recordPathOnce() {
  if (MODE !== 'normal' || !gameOver || pathSent) return Promise.resolve(pathSent);
  if (pathSending) return pathSending;
  const kms = guesses.map(c => (c.iso3 === target.iso3 ? 0 : guessInfo(c).km));
  pathSending = sbRecordPath(getDayNumber(), kms, guesses.map(c => c.iso3)).then(ok => {
    if (ok) { pathSent = true; saveDailyState(); }
    pathSending = null; return ok;
  });
  return pathSending;
}

// Today's average path for everyone else: at each guess number, total distance ÷ players, with this
// player's own game taken back out. A player who already solved counts as 0 km from then on.
// Also the most common guess at each step. Shown once at least 3 other players have finished.
function averagePath(stats) {
  const solved = guesses.length > 0 && guesses[guesses.length - 1].iso3 === target.iso3;
  const mineKm = k => (k < guesses.length ? (guesses[k].iso3 === target.iso3 ? 0 : guessInfo(guesses[k]).km) : (solved ? 0 : null));
  const totals = Object.fromEntries((stats.totals || []).map(r => [r.step, r]));
  const avg = [], common = [];
  let others1 = 0;
  for (let k = 0; k < MAX_GUESSES; k++) {
    const t = totals[k + 1]; if (!t) break;
    const mk = pathSent ? mineKm(k) : null;
    const players = t.players - (mk !== null ? 1 : 0), sum = Number(t.sum_km) - (mk !== null ? mk : 0);
    if (k === 0) others1 = players;
    if (players < 1) break;
    avg.push(sum / players);
    const rows = (stats.counts || []).filter(r => r.step === k + 1).map(r => ({ iso3: r.iso3,
      n: r.n - (pathSent && guesses[k] && guesses[k].iso3 === r.iso3 ? 1 : 0) }));
    const all = rows.reduce((a, r) => a + Math.max(0, r.n), 0);
    const top = rows.filter(r => r.n > 0).sort((a, b) => b.n - a.n)[0];
    common.push(top && all ? { iso3: top.iso3, share: top.n / all } : null);
  }
  return others1 >= 3 && avg.length ? { avg, common, players: others1 } : null;
}

// Keeps each distance label clear of the average line: lift it a little higher above its flag, or else move it
// under, right of or left of the flag; failing all, the spot with the least overlap (the white halo keeps it readable)
function dodgeAverage(dc) {
  const inn = dc && dc.querySelector('.dc-in'), avg = dc && dc.querySelector('.dc-avgline');
  if (!inn || !avg) return;
  const R = inn.getBoundingClientRect(), D = dc.getBoundingClientRect();
  const toPx = poly => poly.getAttribute('points').trim().split(/\s+/).map(t => t.split(',').map(Number))
    .map(([x, y]) => [R.left + x / 100 * R.width, R.top + y / 100 * R.height]);
  const avgP = toPx(avg), own = [...dc.querySelectorAll('.dc-line')].map(toPx);
  const lineY = (P, x) => {
    for (let i = 1; i < P.length; i++) {
      const [x0, y0] = P[i - 1], [x1, y1] = P[i];
      if (x >= x0 - 0.5 && x <= x1 + 0.5) return x1 === x0 ? y0 : y0 + (y1 - y0) * (x - x0) / (x1 - x0);
    }
    return null;
  };
  const hits = (P, r) => { let h = 0; for (let x = r.left - 3; x <= r.right + 3; x += 2) { const y = lineY(P, x); if (y !== null && y > r.top - 4 && y < r.bottom + 4) h++; } return h; };
  const nodes = [...dc.querySelectorAll('.dc-node .go-node')].map(n => n.getBoundingClientRect());
  const score = (r, bound) => {
    if (r.bottom > R.bottom - 2 || r.top < bound || r.left < R.left - 14 || r.right > R.right + 14) return Infinity;  // 0 km line or the chart's edge
    let sc = 3 * hits(avgP, r);
    own.forEach(P => { sc += hits(P, r); });
    nodes.forEach(n => { if (r.left < n.right + 2 && r.right > n.left - 2 && r.top < n.bottom + 2 && r.bottom > n.top - 2) sc += 20; });
    return sc;
  };
  const SPOTS = ['dc-lbl--below', 'dc-lbl--right', 'dc-lbl--left'];
  dc.querySelectorAll('.dc-lbl').forEach(l => {
    SPOTS.forEach(k => l.classList.remove(k)); l.style.removeProperty('--lift');
    const r0 = l.getBoundingClientRect(), bound = Math.min(D.top, r0.top) - 0.5;
    const s0 = score(r0, bound);
    if (!s0) return;
    const tries = [];
    // 1. a little higher: just above the average line where it crosses the label
    let top = Infinity;
    for (let x = r0.left - 3; x <= r0.right + 3; x += 2) { const y = lineY(avgP, x); if (y !== null) top = Math.min(top, y); }
    const lift = r0.bottom - top + 5;
    if (lift > 0 && lift <= 30) tries.push(['', lift]);
    SPOTS.forEach(k => tries.push([k, 0]));
    let best = ['', 0], bestScore = s0;
    for (const [k, lf] of tries) {
      if (k) l.classList.add(k); if (lf) l.style.setProperty('--lift', lf.toFixed(1) + 'px');
      const sc = score(l.getBoundingClientRect(), bound);
      if (k) l.classList.remove(k); l.style.removeProperty('--lift');
      if (sc < bestScore) { best = [k, lf]; bestScore = sc; }
      if (!sc) break;
    }
    if (best[0]) l.classList.add(best[0]);
    if (best[1]) l.style.setProperty('--lift', best[1].toFixed(1) + 'px');
  });
}
let dodgeTimer = null;
window.addEventListener('resize', () => { clearTimeout(dodgeTimer); dodgeTimer = setTimeout(() => dodgeAverage(document.querySelector('#banner .go-card .dc')), 150); });

async function addAveragePath(won) {
  if (MODE !== 'normal' && MODE !== 'archive') return;
  const day = currentDay(), when = MODE === 'archive' ? 'that day' : 'today';
  await new Promise(r => setTimeout(r, 0));          // let endGame() finish first
  await recordPathOnce();
  if (SHOP.cardCells()) return;
  const res = averagePath(await sbFetchPathStats(day));
  if (currentDay() !== day) return;
  const dc = document.querySelector('#banner .go-card .dc'); if (!res || !dc || dc.dataset.avg) return;
  dc.dataset.avg = '1';
  const mine = guesses.filter(c => c.iso3 !== target.iso3).map(c => Math.max(1, guessInfo(c).km));
  const level = distanceLevelFn(mine.length ? mine : [1000], won ? 0.22 : 0.36);
  const n = guesses.length, last = n - 1;                      // the same x positions as your own guesses
  const xs = k => (n > 1 ? Math.min(k, last) / last : 0.5);
  const pts = res.avg.slice(0, n).map((km, k) => [xs(k), level(km), km]);
  if (pts.length >= 2) {
    const line = pts.map(p => (p[0] * 100).toFixed(2) + ',' + ((1 - p[1]) * 100).toFixed(2)).join(' ');
    const dots = pts.map(p => '<span class="dc-avgdot" style="left:' + (p[0] * 100).toFixed(2) + '%;top:' + ((1 - p[1]) * 100).toFixed(2)
      + '%" title="Average: ' + chartKm(p[2]) + '"></span>').join('');
    dc.querySelector('.dc-in').insertAdjacentHTML('afterbegin',
      '<div class="dc-avg"><svg class="dc-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">'
      + '<polyline class="dc-avgline" points="' + line + '"/></svg>' + dots + '</div>');
  }
  dodgeAverage(dc);
  // most common guess at each step, under the guess numbers
  const steps = Math.min(res.common.length, n);
  let row = '';
  for (let k = 0; k < steps; k++) {
    const c = res.common[k]; if (!c) continue;
    const country = COUNTRIES.find(x => x.iso3 === c.iso3);
    row += '<span class="dc-common-item" style="left:' + (xs(k) * 100).toFixed(2) + '%" title="Most common guess ' + (k + 1) + ': '
      + escHtml(country ? country.name : c.iso3) + ' (' + Math.round(c.share * 100) + '%)">'
      + flagImg(c.iso3, 'dc-common-flag') + '<span>' + Math.round(c.share * 100) + '%</span></span>';
  }
  if (row) dc.insertAdjacentHTML('beforeend', '<div class="dc-common"><span class="dc-common-lbl">Most<br>guessed</span>' + row + '</div>');
  // key: placed before the line under the chart (if any)
  // key: just the average line ("Most guessed" is already named beside its row)
  const key = '<div class="dc-legend" title="Other players ' + when + ': ' + res.players + '">'
    + '<span class="dc-key-avg" aria-hidden="true"><span class="dc-key-avgdot"></span></span>'
    + '<span class="u-long">Average distance at each guess, across ' + res.players + ' other players ' + when + '</span>'
    + '<span class="u-short">Average of ' + res.players + ' other players ' + when + '</span></div>';
  dc.insertAdjacentHTML('afterend', key);
  if (row) dc.classList.add('dc--common');
}

let resultTicker = null;
function renderResultCard(won, animate = true) {
  const host = document.getElementById('banner'); if (!host) return;
  const p = pathHTML(won, false, animate);
  // Win: no sentence (the chart and its key say it). Loss: how far the final guess was.
  const summary = won ? '' : 'Your final guess was ' + chartKm(guessInfo(guesses[guesses.length - 1]).km) + ' away.';
  const tagline = MODE === 'practice' ? escHtml(practiceSubtitle().replace(/ · \d+ countries$/, '') || 'Practice') : 'Puzzle #' + currentDay();
  const d = ARCHIVE_DAY, last = lastPastDay();
  const foot = MODE === 'archive'
    ? '<span class="go-next">From the archive · not counted in your stats</span>'
      + '<div class="go-actions"><button type="button" class="go-btn" onclick="openArchive(' + (d - 1) + ')"' + (d <= 1 ? ' disabled' : '') + '>← #' + Math.max(1, d - 1) + '</button>'
      + '<button type="button" class="go-btn go-btn--dark" onclick="openArchive(' + (d + 1) + ')"' + (d >= last ? ' disabled' : '') + '>#' + Math.min(last, d + 1) + ' →</button></div>'
    : MODE === 'practice'
    ? '<span class="go-next">Practice round</span>'
      + '<div class="go-actions"><button type="button" class="go-btn go-btn--dark" onclick="newGame()">Next puzzle ↺</button></div>'
    : '<span class="go-next">Next puzzle in <strong id="go-countdown">' + getCountdown() + '</strong></span>'
      + '<div class="go-actions"><button type="button" class="go-btn" onclick="showStatsModal(true)">Stats</button>'
      + '<button type="button" class="go-btn go-btn--dark" onclick="copyShare(this)">Share</button></div>';
  host.innerHTML = '<div class="go-card ' + (won ? 'go-card--won' : 'go-card--lost') + (animate && !REDUCED_MOTION ? ' go-anim' : '') + '">'
    + '<div class="go-head"><span class="go-title">' + (won ? 'Your path to ' + escHtml(target.name)
        : (MODE === 'normal' ? 'Today\u2019s country was ' : 'The country was ') + escHtml(target.name) + '.') + '</span>'
    + '<span class="go-tag">' + tagline + '</span></div>'
    + p.html
    + (summary ? '<p class="go-summary">' + summary + '</p>' : '')
    + '<div class="go-foot">' + foot + '</div></div>';
  if (won && animate) glowBattery(p.doneAt);
  addAveragePath(won);
  requestAnimationFrame(updateDonePill);
  clearInterval(resultTicker);
  if (MODE === 'normal') resultTicker = setInterval(() => {
    const el = document.getElementById('go-countdown'); if (!el) { clearInterval(resultTicker); return; }
    el.textContent = getCountdown();
  }, 1000);
}

function endGame() {
  gameOver = true; saveDailyState();
  if (MODE === 'practice') recordPracticeResult(guesses.length > 0 && guesses[guesses.length-1].iso3 === target.iso3);
  if (MODE === 'archive') refreshArchiveStatus();
  if (MODE === 'normal') {
    const won = guesses.length > 0 && guesses[guesses.length-1].iso3 === target.iso3;
    recordDailyResult(won, cellsUsed());
    recordPathOnce();
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
  shopOnEnd(guesses.length > 0 && guesses[guesses.length-1].iso3 === target.iso3);
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
  const ok = await sbInsert({ username, day: getDayNumber(), guesses: cellsUsed(), won });
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
    const matches = q.length === 0 ? source : source.filter(c => c.name.toLowerCase().includes(q) || (NAME_ALIAS[c.name] || '').toLowerCase().includes(q));
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
  const match = val ? COUNTRIES.find(c => nameMatches(c, val)) : null;
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
  target = getDailyTarget(COUNTRIES); guesses = []; gameOver = false; scoreSubmitted = false; pathSent = false; SHOP.reset();
  CARDS_RESTORING = true; updateDonePill();
  if (!target) { renderUnavailable('normal'); return; }
  document.getElementById('guesses').innerHTML      = '';
  document.getElementById('banner').innerHTML       = '';
  document.getElementById('error').textContent      = '';
  document.getElementById('input-area').style.display   = 'flex';
  document.getElementById('guess-input').value      = ''; syncInputFlag();
  renderLives(); renderStatBar(); renderFlowBar(); renderCharts();
  const saved = loadDailyState();
  if (saved && saved.guesses.length > 0) {
    const cardsOn = SHOP.on();                    // clue cards bought today go back in between the guesses
    saved.guesses.forEach((iso3, i) => {
      if (cardsOn) shopReplayCards(saved.cards, i);
      const country = COUNTRIES.find(c => c.iso3 === iso3); if (!country) return;
      guesses.push(country); shopNoteGuess(country); addGuessRow(country, country.iso3 === target.iso3, false);
    });
    if (cardsOn) shopReplayCards(saved.cards, saved.guesses.length);
    SHOP.sent = saved.cardsSent === true; SHOP.seen = SHOP.owned().length > 0;
    renderLives();
    if (saved.gameOver) {
      const won = guesses.length > 0 && guesses[guesses.length-1].iso3 === target.iso3;
      gameOver = true; renderResultCard(won, false);
      document.getElementById('input-area').style.display   = 'none';
      shopOnEnd(won);
      // Saved states from before this fix have no flag — treat them as already sent
      // so nobody gets a duplicate row today.
      scoreSubmitted = saved.submitted !== false;
      pathSent = saved.pathSent === true;
      if (!scoreSubmitted) {
        if (getUsername()) submitDailyScore();
        else setTimeout(() => ensureUsername().then(submitDailyScore), 1000);
      }
    }
  }
  renderClueCards(); updateShopButton();
  CARDS_RESTORING = false;
  if (gameOver) { window.scrollTo(0, 0); updateDonePill(); }     // a finished game reopens at the top, with the reminder pill
}

// ============================================================
//  RESULT REMINDER: once a game is over, a small pill at the bottom of the screen recalls the answer
//  and the score, follows the page as it scrolls, and slides into the result card when that comes into view
// ============================================================
let donePillRaf = 0;
function updateDonePill() {
  let pill = document.getElementById('done-pill');
  const card = document.querySelector('#banner .go-card');
  if (!gameOver || !card || !target || !guesses.length) { if (pill) pill.remove(); return; }
  if (!pill) {
    pill = document.createElement('button'); pill.type = 'button'; pill.id = 'done-pill'; pill.className = 'is-merged';
    pill.addEventListener('click', () => { const c = document.querySelector('#banner .go-card'); if (c) c.scrollIntoView({ behavior: REDUCED_MOTION ? 'auto' : 'smooth', block: 'center' }); });
    document.body.appendChild(pill);
  }
  const won = guesses[guesses.length - 1].iso3 === target.iso3, n = cellsUsed();
  const key = MODE + ':' + currentDay() + ':' + target.iso3 + ':' + n + ':' + won;
  if (pill.dataset.key !== key) {
    pill.dataset.key = key;
    const tag = MODE === 'practice' ? 'Practice' : '#' + currentDay();
    pill.innerHTML = '<span class="dp-tag">' + tag + '</span>' + flagImg(target.iso3, 'dp-flag') + '<span class="dp-name">' + escHtml(target.name) + '</span>'
      + '<span class="dp-score dp-score--' + (won ? 'won' : 'lost') + '">' + (won ? n + '/' + MAX_GUESSES : 'X/' + MAX_GUESSES) + '</span>'
      + '<svg class="dp-arrow" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M8 3v10M3.5 8.5 8 13l4.5-4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    pill.setAttribute('aria-label', (won ? 'Solved: ' + target.name + ' in ' + n : 'Missed: the country was ' + target.name) + '. Go to your result');
  }
  // hidden (merged) as soon as the result card reaches the screen, or once it has been scrolled past
  const r = card.getBoundingClientRect();
  pill.classList.toggle('is-merged', r.top < window.innerHeight - 24);
}
['scroll', 'resize'].forEach(ev => window.addEventListener(ev, () => {
  if (donePillRaf) return;
  donePillRaf = requestAnimationFrame(() => { donePillRaf = 0; updateDonePill(); });
}, { passive: true }));
// ============================================================
function newGame() {
  target = nextPracticeCountry(); guesses = []; gameOver = false; SHOP.reset(); updateDonePill();
  document.getElementById('guesses').innerHTML      = '';
  document.getElementById('banner').innerHTML       = '';
  document.getElementById('error').textContent      = '';
  document.getElementById('input-area').style.display   = 'flex';
  document.getElementById('guess-input').value      = ''; syncInputFlag();
  renderLives(); renderStatBar(); renderFlowBar(); renderCharts();
  renderClueCards(); updateShopButton();
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
  const score = won ? cellsUsed() : 'X';
  const squares = shopShareSquares() || guesses.map(shareSquare).join('');     // a 💡 for every guess spent on a clue card
  return 'Energle ⚡ #' + getDayNumber() + '  ' + score + '/' + MAX_GUESSES + '\n' + squares + '\nhttps://energle.org';
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

// Stats and the leaderboard share one window. Top: Stats | Leaderboard. Under Leaderboard: Today / All time.
let HUB_LB_TAB = 'today';
function hubBarHTML(active, closeId) {
  const lb = active !== 'you';
  const top = (k, l, on) => '<button type="button" class="hub-tab' + (on ? ' is-on' : '') + '" role="tab" aria-selected="' + on + '" onclick="hubGo(\'' + k + '\')">' + l + '</button>';
  const sub = (k, l) => '<button type="button" class="hub-sub-btn' + (active === k ? ' is-on' : '') + '" data-tab="' + k + '" aria-pressed="' + (active === k)
    + '" onclick="hubGo(\'' + k + '\')">' + l + '</button>';
  return '<div class="hub-bar"><div class="hub-tabs" role="tablist">' + top('you', 'Stats', !lb) + top('lb', 'Leaderboard', lb) + '</div>'
    + '<button type="button" class="hub-close" id="' + closeId + '" aria-label="Close">×</button></div>'
    + (lb ? '<div class="hub-subbar"><div class="hub-sub" role="group" aria-label="Leaderboard period">' + sub('today', 'Today') + sub('alltime', 'All time') + '</div>'
      + '<span class="hub-cap" id="hub-cap">' + hubCaption(active) + '</span></div>' : '');
}
function hubCaption(tab) {
  return tab === 'today' ? 'Puzzle #' + getDayNumber() + ' · fewest guesses first' : 'Every daily puzzle so far · best weighted score first';
}
function hubGo(tab) {
  const st = document.getElementById('stats-modal'), lb = document.getElementById('lb-modal');
  if (tab === 'lb') tab = HUB_LB_TAB;
  if (tab === 'you') { if (!st) { showStatsModal(false); if (lb) lb.remove(); } return; }
  HUB_LB_TAB = tab;
  if (lb) lbSwitchTab(tab);
  else { showLeaderboardModal(tab); if (st) st.remove(); }
}

function showStatsModal(afterGame) {
  const existing = document.getElementById('stats-modal'); if (existing) existing.remove();
  const stats = loadStats();
  const name = getUsername();
  const winPct = stats.played > 0 ? Math.round(stats.won / stats.played * 100) : 0;
  const solvedGuesses = [1, 2, 3, 4, 5, 6].reduce((s, k) => s + k * (stats.dist[k] || 0), 0);
  const avg = stats.won > 0 ? (solvedGuesses / stats.won).toFixed(1) : '–';
  const won = afterGame && gameOver && MODE === 'normal' && guesses.length > 0 && guesses[guesses.length - 1].iso3 === target.iso3;
  const currentKey = afterGame && gameOver && MODE === 'normal' ? (won ? cellsUsed() : 'X') : null;

  // Header: who these stats belong to
  const header = '<div class="sx-head">'
    + '<span class="sx-avatar" aria-hidden="true" style="background:' + (name ? avatarColor(name) : '#c9c9c6') + '">'
    +   (name ? escHtml(name.charAt(0).toUpperCase()) : '?') + '</span>'
    + '<div class="sx-who"><span class="sx-name">' + (name ? escHtml(name) : 'Guest') + '</span>'
    +   '<span class="sx-sub" id="sx-rank">' + (name ? 'Looking up your rank…' : 'Not on the leaderboard yet. You pick a name after your first daily.') + '</span></div></div>';

  // Today's result, only right after the daily
  let today = '';
  if (afterGame && MODE === 'normal' && gameOver) {
    const streakLine = won
      ? (stats.streak > 1 ? stats.streak + ' days in a row.' + (stats.streak >= stats.bestStreak ? ' Your best run yet.' : '') : 'Streak started. See you tomorrow.')
      : 'Streak reset.';
    // Today's result with the same guess path as the result card, in miniature
    today = '<div class="sx-today ' + (won ? 'sx-today--won' : 'sx-today--lost') + '">'
      + '<div class="sx-today-top"><span class="sx-today-title">' + (won
          ? 'Puzzle #' + getDayNumber() + ' solved in ' + cellsUsed()
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
    + '<div class="sx-box hub-box" role="dialog" aria-label="Stats and leaderboard">'
    + hubBarHTML('you', 'st-close-btn')
    + '<div class="hub-scroll">'
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
    + '</div></div>';

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
  HUB_LB_TAB = tab;
  const existing = document.getElementById('lb-modal'); if (existing) existing.remove();
  const modal = document.createElement('div'); modal.id = 'lb-modal';
  modal.innerHTML =
    '<div class="st-backdrop"></div>'
    // `lb-box` makes this modal larger than the shared .st-box (see style.css)
    + '<div class="st-box lb-box hub-box" role="dialog" aria-label="Stats and leaderboard">'
    + hubBarHTML(tab, 'lb-close-btn')
    + '<div class="lb-body" id="lb-body"><div class="lb-loading">Loading…</div></div>'
    + '</div>';
  modal.querySelector('.st-backdrop').addEventListener('click', () => modal.remove());
  document.body.appendChild(modal);
  document.getElementById('lb-close-btn').addEventListener('click', () => modal.remove());
  lbLoadTab(tab);
}

function lbSwitchTab(tab) {
  HUB_LB_TAB = tab;
  document.querySelectorAll('#lb-modal .hub-sub-btn').forEach(b => { b.classList.toggle('is-on', b.dataset.tab === tab); b.setAttribute('aria-pressed', String(b.dataset.tab === tab)); });
  const cap = document.getElementById('hub-cap'); if (cap) cap.textContent = hubCaption(tab);
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
