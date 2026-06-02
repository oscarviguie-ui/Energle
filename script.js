// ============================================================
//  CONFIG
// ============================================================

const MAX_GUESSES = 6;

const SOURCES = [
  'Coal', 'Gas', 'Other Fossil',
  'Nuclear',
  'Hydro', 'Wind', 'Solar', 'Bioenergy', 'Other Renewables'
];

const COLORS = {
  'Coal':             '#4a4a4a',
  'Gas':              '#e8925a',
  'Other Fossil':     '#c0654a',
  'Nuclear':          '#9b6dbd',
  'Hydro':            '#4a90c4',
  'Wind':             '#5ab88a',
  'Solar':            '#f5c842',
  'Bioenergy':        '#a0724a',
  'Other Renewables': '#2ab5a0',
};

// ============================================================
//  PRACTICE CATEGORIES
//  Continent strings from Ember CSV:
//    Africa | Asia | Europe | North America | South America | Oceania
//  Americas category combines North + South America.
//  Asia & Pacific category combines Asia + Oceania.
// ============================================================

const PRACTICE_CATEGORIES = [
  {
    id:     'europe',
    emoji:  '🇪🇺',
    label:  'Europe',
    filter: c => c.continent === 'Europe',
  },
  {
    id:     'africa',
    emoji:  '🌍',
    label:  'Africa',
    filter: c => c.continent === 'Africa',
  },
  {
    id:     'asia',
    emoji:  '🌏',
    label:  'Asia & Pacific',
    filter: c => c.continent === 'Asia' || c.continent === 'Oceania',
  },
  {
    id:     'americas',
    emoji:  '🌎',
    label:  'Americas',
    filter: c => c.continent === 'North America' || c.continent === 'South America',
  },
  {
    id:     'major',
    emoji:  '⚡',
    label:  'Major Producers',
    filter: c => c.latestTotal >= 100,
  },
  {
    id:     'highcap',
    emoji:  '💡',
    label:  'High Per-Capita',
    filter: c => (c.latestDpc ?? 0) >= 7,
  },
  {
    id:     'green',
    emoji:  '🌱',
    label:  'Green Leaders',
    filter: c => (c.renewablePct ?? 0) >= 70,
  },
  {
    id:     'fossil',
    emoji:  '🔥',
    label:  'Fossil Heavy',
    filter: c => (c.fossilPct ?? 0) >= 90,
  },
  {
    id:     'lowcap',
    emoji:  '🏚️',
    label:  'Low Per-Capita',
    filter: c => (c.latestDpc ?? 0) > 0 && (c.latestDpc ?? 0) < 0.5,
  },
];

// ============================================================
//  DAILY PUZZLE — epoch & numbering
//  Puzzle #1 = 2025-06-02 UTC. Number increments at midnight UTC.
// ============================================================

const EPOCH_DATE = new Date(Date.UTC(2025, 5, 2)); // month is 0-indexed

function getDayNumber() {
  const now      = new Date();
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((todayUTC - EPOCH_DATE.getTime()) / 86400000) + 1;
}

// Deterministic seeded RNG (mulberry32)
function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function getDailyTarget(countries) {
  const day = getDayNumber();
  const rng = mulberry32(day * 2654435761);
  const arr = [...countries];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr[0];
}

// ============================================================
//  DAILY STATE — localStorage persistence
// ============================================================

const LS_KEY = 'energle_daily_v1';

function loadDailyState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (saved.day !== getDayNumber()) return null;
    return saved; // { day, guesses: [iso3, ...], gameOver }
  } catch { return null; }
}

function saveDailyState() {
  if (MODE !== 'normal') return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      day:      getDayNumber(),
      guesses:  guesses.map(g => g.iso3),
      gameOver,
    }));
  } catch {}
}

// ============================================================
//  STATE
// ============================================================

let ALL_DATA     = null;
let WORLD_DPC    = null;
let COUNTRIES    = [];       // full list, all countries
let POOL         = [];       // active pool for current game (filtered or full)
let target       = null;
let guesses      = [];
let gameOver     = false;
let lineChart    = null;
let barChart     = null;
let MODE         = 'normal'; // 'normal' | 'practice'
let PRACTICE_CAT = null;     // active category id in practice mode

// ============================================================
//  PRACTICE GATE
// ============================================================

function practiceUnlocked() {
  // Unlocked if daily is done today (saved or current session)
  if (MODE === 'practice') return true;
  if (gameOver) return true;
  const saved = loadDailyState();
  return saved?.gameOver === true;
}

// ============================================================
//  ISO3 → CONTINENT FALLBACK
//  Used when the JSON pre-dates the continent field (i.e. before
//  build_json.py is re-run with the Ember CSV Continent column).
//  Once the JSON is rebuilt this map is still consulted as a
//  safety net for any country that comes through with a null.
// ============================================================

const ISO3_CONTINENT = {
  // Europe
  'ALB':'Europe','ARM':'Europe','AUT':'Europe','AZE':'Europe','BLR':'Europe',
  'BEL':'Europe','BIH':'Europe','BGR':'Europe','HRV':'Europe','CYP':'Europe',
  'CZE':'Europe','DNK':'Europe','EST':'Europe','FIN':'Europe','FRA':'Europe',
  'GEO':'Europe','DEU':'Europe','GRC':'Europe','HUN':'Europe','ISL':'Europe',
  'IRL':'Europe','ITA':'Europe','XKX':'Europe','LVA':'Europe','LTU':'Europe',
  'LUX':'Europe','MLT':'Europe','MDA':'Europe','MNE':'Europe','NLD':'Europe',
  'MKD':'Europe','NOR':'Europe','POL':'Europe','PRT':'Europe','ROU':'Europe',
  'RUS':'Europe','SRB':'Europe','SVK':'Europe','SVN':'Europe','ESP':'Europe',
  'SWE':'Europe','CHE':'Europe','UKR':'Europe','GBR':'Europe',
  // Africa
  'DZA':'Africa','AGO':'Africa','BEN':'Africa','BWA':'Africa','BFA':'Africa',
  'BDI':'Africa','CPV':'Africa','CMR':'Africa','CAF':'Africa','TCD':'Africa',
  'COM':'Africa','COD':'Africa','COG':'Africa','CIV':'Africa','DJI':'Africa',
  'EGY':'Africa','GNQ':'Africa','ERI':'Africa','SWZ':'Africa','ETH':'Africa',
  'GAB':'Africa','GMB':'Africa','GHA':'Africa','GIN':'Africa','GNB':'Africa',
  'KEN':'Africa','LSO':'Africa','LBR':'Africa','LBY':'Africa','MDG':'Africa',
  'MWI':'Africa','MLI':'Africa','MRT':'Africa','MUS':'Africa','MAR':'Africa',
  'MOZ':'Africa','NAM':'Africa','NER':'Africa','NGA':'Africa','RWA':'Africa',
  'SEN':'Africa','SLE':'Africa','SOM':'Africa','ZAF':'Africa','SSD':'Africa',
  'SDN':'Africa','TZA':'Africa','TGO':'Africa','TUN':'Africa','UGA':'Africa',
  'ZMB':'Africa','ZWE':'Africa',
  // Asia
  'AFG':'Asia','BHR':'Asia','BGD':'Asia','BTN':'Asia','BRN':'Asia',
  'KHM':'Asia','CHN':'Asia','IND':'Asia','IDN':'Asia','IRN':'Asia',
  'IRQ':'Asia','ISR':'Asia','JPN':'Asia','JOR':'Asia','KAZ':'Asia',
  'PRK':'Asia','KOR':'Asia','KWT':'Asia','KGZ':'Asia','LAO':'Asia',
  'LBN':'Asia','MYS':'Asia','MDV':'Asia','MNG':'Asia','MMR':'Asia',
  'NPL':'Asia','OMN':'Asia','PAK':'Asia','PHL':'Asia','QAT':'Asia',
  'SAU':'Asia','SGP':'Asia','LKA':'Asia','SYR':'Asia','TWN':'Asia',
  'TJK':'Asia','THA':'Asia','TLS':'Asia','TKM':'Asia','ARE':'Asia',
  'UZB':'Asia','VNM':'Asia','YEM':'Asia','PSE':'Asia',
  // Oceania
  'AUS':'Oceania','NZL':'Oceania','FJI':'Oceania','PNG':'Oceania',
  // North America
  'BHS':'North America','BLZ':'North America','CAN':'North America',
  'CRI':'North America','CUB':'North America','DOM':'North America',
  'SLV':'North America','GTM':'North America','HTI':'North America',
  'HND':'North America','JAM':'North America','MEX':'North America',
  'NIC':'North America','PAN':'North America','PRI':'North America',
  'TTO':'North America','USA':'North America',
  // South America
  'ARG':'South America','BOL':'South America','BRA':'South America',
  'CHL':'South America','COL':'South America','ECU':'South America',
  'GUY':'South America','PRY':'South America','PER':'South America',
  'SUR':'South America','URY':'South America','VEN':'South America',
};

// ============================================================
//  LOAD DATA
// ============================================================

async function loadData() {
  document.getElementById('app').innerHTML =
    '<div id="loading">Loading data…</div>';
  const res = await fetch('energle_data.json');
  const raw = await res.json();
  WORLD_DPC = raw['__world_dpc__'];
  delete raw['__world_dpc__'];
  ALL_DATA  = raw;

  COUNTRIES = Object.entries(ALL_DATA).map(([name, info]) => {
    const latest   = info.latestYear;
    const yearData = info.years[latest] ?? {};
    const total    = yearData.Total ?? 0;
    const renewables = ['Hydro','Wind','Solar','Bioenergy','Other Renewables'];
    const fossils    = ['Coal','Gas','Other Fossil'];
    const renSum  = renewables.reduce((s, k) => s + (yearData[k] ?? 0), 0);
    const fosSum  = fossils.reduce((s, k) => s + (yearData[k] ?? 0), 0);
    return {
      name,
      iso3:         info.iso3,
      lat:          info.lat,
      lng:          info.lng,
      continent:    info.continent ?? ISO3_CONTINENT[info.iso3] ?? null,
      latestYear:   latest,
      latestDpc:    info.latestDpc,
      latestTotal:  total,
      renewablePct: total > 0 ? (renSum / total * 100) : 0,
      fossilPct:    total > 0 ? (fosSum / total * 100) : 0,
    };
  });

  POOL = COUNTRIES;
  initApp();
}

// ============================================================
//  MODE SWITCHER (with gate)
// ============================================================

function switchMode(mode) {
  if (mode === 'practice' && !practiceUnlocked()) {
    const btn = document.querySelector('.mode-btn.locked');
    if (btn) {
      btn.classList.add('locked-flash');
      setTimeout(() => btn.classList.remove('locked-flash'), 500);
    }
    return;
  }

  if (lineChart) { lineChart.destroy(); lineChart = null; }
  if (barChart)  { barChart.destroy();  barChart  = null; }

  MODE = mode;
  if (mode === 'normal') {
    POOL = COUNTRIES;
    PRACTICE_CAT = null;
    renderGameScreen();
    restoreDailyGame(); // never re-randomise — always restore today's puzzle
  } else {
    renderPracticePickerScreen();
  }
}

function startPractice(catId) {
  const cat = PRACTICE_CATEGORIES.find(c => c.id === catId);
  if (!cat) return;
  PRACTICE_CAT = catId;
  POOL = COUNTRIES.filter(cat.filter);
  if (POOL.length === 0) { alert('No countries match this category.'); return; }

  if (lineChart) { lineChart.destroy(); lineChart = null; }
  if (barChart)  { barChart.destroy();  barChart  = null; }

  renderGameScreen();
  newGame();
}

// ============================================================
//  RENDER HELPERS
// ============================================================

function modeSwitcherHTML() {
  const locked         = !practiceUnlocked();
  const dailyActive    = MODE === 'normal'   ? 'active' : '';
  const practiceActive = MODE === 'practice' ? 'active' : '';
  const lockedClass    = locked ? 'locked' : '';
  const lockIcon       = locked ? ' 🔒' : '';
  return '<div class="mode-switcher">'
    + '<button class="mode-btn ' + dailyActive + '" onclick="switchMode('normal')">Daily</button>'
    + '<button class="mode-btn ' + practiceActive + ' ' + lockedClass + '" onclick="switchMode('practice')">'
    + 'Practice' + lockIcon
    + '</button>'
    + '</div>';
}

function modeSwitcher() {
  return modeSwitcherHTML();
}

function practiceSubtitle() {
  if (MODE !== 'practice' || !PRACTICE_CAT) return '';
  const cat = PRACTICE_CATEGORIES.find(c => c.id === PRACTICE_CAT);
  return cat ? `${cat.emoji} ${cat.label} · ${POOL.length} countries` : '';
}

function renderGameScreen() {
  const isPractice   = MODE === 'practice';
  const subtitle     = isPractice
    ? practiceSubtitle()
    : 'Puzzle #' + getDayNumber() + ' · Guess the country from its electricity generation mix';
  const backBtn      = isPractice ? '<button id="back-to-categories">← Categories</button>' : '';

  document.getElementById('app').innerHTML = `
    <header>
      <div class="header-top">
        <h1>Energle ⚡</h1>
        ${modeSwitcher()}
      </div>
      <div class="subtitle-row">
        <p class="subtitle">${subtitle}</p>
        ${backBtn}
      </div>
    </header>

    <div id="lives-container"></div>

    <div id="stat-bar">
      <div class="stat-item">
        <span class="stat-label">Total generation</span>
        <span class="stat-value" id="stat-total">—</span>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-item">
        <span class="stat-label">Demand per capita</span>
        <span class="stat-value" id="stat-dpc">—</span>
      </div>
      <div class="stat-item stat-world">
        <span class="stat-label">World average</span>
        <span class="stat-value" id="stat-world">—</span>
      </div>
    </div>

    <div id="flow-bar">
      <div class="flow-label">Energy balance — latest year</div>
      <div class="flow-track" id="flow-track"></div>
      <div class="flow-legend">
        <span class="flow-legend-item"><span class="flow-swatch generation"></span>Generation</span>
        <span class="flow-legend-item"><span class="flow-swatch exports"></span>Net exports</span>
        <span class="flow-legend-item"><span class="flow-swatch imports"></span>Net imports</span>
      </div>
    </div>

    <div id="charts-section">
      <div id="chart-left">
        <p class="chart-label">Generation by source over time (TWh)</p>
        <div id="line-wrapper"><canvas id="line-chart"></canvas></div>
      </div>
      <div id="chart-right">
        <p class="chart-label" id="bar-label">Latest year mix</p>
        <div id="bar-wrapper"><canvas id="bar-chart"></canvas></div>
      </div>
    </div>

    <div id="legend-shared"></div>

    <details id="glossary">
      <summary id="glossary-trigger">
        <span class="glossary-icon">?</span>
        <span>What does each source mean?</span>
        <span class="glossary-arrow">›</span>
      </summary>
      <div id="glossary-body">
        <div class="glossary-section">
          <h3 class="glossary-heading fossil">Fossil fuels</h3>
          <div class="glossary-grid">
            <div class="glossary-item"><span class="glossary-swatch" style="background:#4a4a4a"></span><div><strong>Coal</strong><p>Hard coal and lignite burned in thermal power stations. The most carbon-intensive electricity source.</p></div></div>
            <div class="glossary-item"><span class="glossary-swatch" style="background:#e8925a"></span><div><strong>Gas</strong><p>Natural gas and LNG burned in gas turbines or combined-cycle plants. Roughly half the CO₂ of coal per kWh.</p></div></div>
            <div class="glossary-item"><span class="glossary-swatch" style="background:#c0654a"></span><div><strong>Other Fossil</strong><p>Oil, diesel, heavy fuel oil, petroleum products, manufactured gas, and waste incineration.</p></div></div>
          </div>
        </div>
        <div class="glossary-section">
          <h3 class="glossary-heading low-carbon">Low-carbon</h3>
          <div class="glossary-grid">
            <div class="glossary-item"><span class="glossary-swatch" style="background:#9b6dbd"></span><div><strong>Nuclear</strong><p>Electricity from uranium fission. Very low lifecycle emissions and reliable baseload power.</p></div></div>
          </div>
        </div>
        <div class="glossary-section">
          <h3 class="glossary-heading renewables">Renewables</h3>
          <div class="glossary-grid">
            <div class="glossary-item"><span class="glossary-swatch" style="background:#4a90c4"></span><div><strong>Hydro</strong><p>Run-of-river and reservoir hydropower.</p></div></div>
            <div class="glossary-item"><span class="glossary-swatch" style="background:#5ab88a"></span><div><strong>Wind</strong><p>Onshore and offshore wind turbines.</p></div></div>
            <div class="glossary-item"><span class="glossary-swatch" style="background:#f5c842"></span><div><strong>Solar</strong><p>Solar photovoltaic (PV) panels and solar thermal plants.</p></div></div>
            <div class="glossary-item"><span class="glossary-swatch" style="background:#a0724a"></span><div><strong>Bioenergy</strong><p>Biomass burning, biogas, sugarcane bagasse, and wood pellets.</p></div></div>
            <div class="glossary-item"><span class="glossary-swatch" style="background:#2ab5a0"></span><div><strong>Other Renewables</strong><p>Geothermal, tidal, and wave energy.</p></div></div>
          </div>
        </div>
        <p class="glossary-source">Source: <a href="https://ember-climate.org" target="_blank">Ember Global Electricity Review</a></p>
      </div>
    </details>

    <div id="guesses"></div>
    <div id="banner"></div>
    <p id="error"></p>

    <div id="input-area">
      <div id="autocomplete-wrapper">
        <input id="guess-input" type="text"
               placeholder="Type a country name…" autocomplete="off" />
        <div id="autocomplete-list"></div>
      </div>
      <button id="submit-btn">Guess</button>
    </div>

    <button id="new-game-btn" style="display:none">
      ${MODE === 'practice' ? 'Next puzzle ↺' : 'New game ↺'}
    </button>

    <footer>
      <p>Data: <a href="https://ember-climate.org" target="_blank">
        Ember Global Electricity Review</a></p>
    </footer>
  `;

  document.getElementById('submit-btn').addEventListener('click', submitGuess);
  document.getElementById('new-game-btn').addEventListener('click', () => newGame());
  if (MODE === 'practice') {
    document.getElementById('back-to-categories').addEventListener('click', () => {
      if (lineChart) { lineChart.destroy(); lineChart = null; }
      if (barChart)  { barChart.destroy();  barChart  = null; }
      renderPracticePickerScreen();
    });
  }
  setupAutocomplete();
}

function renderPracticePickerScreen() {
  const cards = PRACTICE_CATEGORIES.map(cat => {
    const count = COUNTRIES.filter(cat.filter).length;
    return `
      <button class="cat-card" onclick="startPractice('${cat.id}')">
        <span class="cat-emoji">${cat.emoji}</span>
        <span class="cat-label">${cat.label}</span>
        <span class="cat-desc">${count} countries</span>
      </button>
    `;
  }).join('');

  document.getElementById('app').innerHTML = `
    <header>
      <div class="header-top">
        <h1>Energle ⚡</h1>
        ${modeSwitcher()}
      </div>
      <p class="subtitle">Choose a category to practice</p>
    </header>

    <div class="cat-grid">${cards}</div>

    <footer>
      <p>Data: <a href="https://ember-climate.org" target="_blank">
        Ember Global Electricity Review</a></p>
    </footer>
  `;
}

// ============================================================
//  INIT
// ============================================================

function initApp() {
  POOL = COUNTRIES;
  renderGameScreen();
  restoreDailyGame();
}

// ============================================================
//  GEOGRAPHY
// ============================================================

function haversineKm(lat1, lng1, lat2, lng2) {
  const R    = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a    =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearingDeg(lat1, lng1, lat2, lng2) {
  const dLng = lng2 - lng1;
  const dLat = lat2 - lat1;
  return (Math.atan2(dLng, dLat) * 180 / Math.PI + 360) % 360;
}

function bearingArrowSVG(deg) {
  return `<svg width="18" height="18" viewBox="0 0 20 20"
    style="transform:rotate(${deg}deg);display:inline-block;vertical-align:middle;flex-shrink:0"
    aria-label="${Math.round(deg)}°">
    <polygon points="10,2 14,16 10,13 6,16" fill="currentColor"/>
  </svg>`;
}

function bearingLabel(deg) {
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

// ============================================================
//  FORMAT HELPERS
// ============================================================

function fmtTWh(v) {
  if (v === null || v === undefined) return '—';
  const abs = Math.abs(v);
  if (abs >= 1000) return (v / 1000).toFixed(2) + ' PWh';
  return v.toFixed(1) + ' TWh';
}

function fmtFlowLabel(v, label) {
  const abs = Math.abs(v);
  const num = abs >= 1000
    ? (v / 1000).toFixed(1) + ' PWh'
    : v.toFixed(1) + ' TWh';
  return num + (label ? ' ' + label : '');
}

// ============================================================
//  STAT BAR
// ============================================================

function renderStatBar() {
  const info     = ALL_DATA[target.name];
  const latest   = info.latestYear;
  const total    = info.years[latest]?.Total ?? 0;
  const dpc      = info.latestDpc;
  const worldDpc = WORLD_DPC[latest] ??
    WORLD_DPC[Math.max(...Object.keys(WORLD_DPC).map(Number))];

  document.getElementById('stat-total').textContent = fmtTWh(total);
  document.getElementById('stat-dpc').textContent =
    dpc != null ? dpc.toFixed(1) + ' MWh / person (' + latest + ')' : '—';
  document.getElementById('stat-world').textContent =
    worldDpc != null ? worldDpc.toFixed(1) + ' MWh / person' : '—';
}

// ============================================================
//  ENERGY FLOW BAR
// ============================================================

function renderFlowBar() {
  const info   = ALL_DATA[target.name];
  const latest = info.latestYear;
  const d      = info.years[latest];
  const gen    = d.Total      ?? 0;
  const netImp = d.NetImports ?? 0;
  const demand = d.Demand     ?? 0;

  const isExporter = netImp < 0;
  const tradeAbs   = Math.abs(netImp);
  const track      = document.getElementById('flow-track');
  track.innerHTML  = '';

  if (isExporter) {
    const genPct    = (demand / gen * 100).toFixed(1);
    const exportPct = (tradeAbs / gen * 100).toFixed(1);
    track.innerHTML =
      seg('generation', genPct,
        fmtFlowLabel(demand, 'demand'),
        fmtFlowLabel(demand, 'demand') + ' (' + genPct + '% of generation)') +
      seg('exports', exportPct,
        fmtFlowLabel(tradeAbs, 'exported'),
        fmtFlowLabel(tradeAbs, 'exported') + ' (' + exportPct + '% of generation)');
  } else {
    const total     = demand > 0 ? demand : gen + netImp;
    const genPct    = (gen / total * 100).toFixed(1);
    const importPct = (netImp / total * 100).toFixed(1);
    track.innerHTML =
      seg('generation', genPct,
        fmtFlowLabel(gen, 'generated'),
        fmtFlowLabel(gen, 'generated') + ' (' + genPct + '% of demand)') +
      seg('imports', Math.max(importPct, 0),
        fmtFlowLabel(netImp, 'imported'),
        fmtFlowLabel(netImp, 'imported') + ' (' + importPct + '% of demand)');
  }
}

function seg(cls, pct, inlineLabel, tooltipLabel) {
  const p = Math.max(0, Math.min(100, parseFloat(pct)));
  if (p < 0.1) return '';
  return `<div class="flow-segment ${cls}" style="width:${p}%"
    title="${tooltipLabel}">` +
    `<span>${p > 10 ? inlineLabel : ''}</span></div>`;
}

// ============================================================
//  CHART HELPERS
// ============================================================

function sortedSources(name) {
  const info       = ALL_DATA[name];
  const latest     = info.latestYear;
  const latestData = info.years[latest];
  return [...SOURCES].sort((a, b) => (latestData[b] || 0) - (latestData[a] || 0));
}

// ============================================================
//  WEIGHTED RANDOM
// ============================================================

function interestScore(country) {
  const total = country.latestTotal;
  const dpc   = country.latestDpc ?? 0;
  const generationScore = Math.log10(Math.max(total, 1));
  const dpcScore        = Math.log10(Math.max(dpc * 10, 1));
  const penalty         = (total < 5 && dpc < 1) ? 0.2 : 1;
  return (generationScore + dpcScore) * penalty;
}

function weightedRandomCountry() {
  const scores = POOL.map(c => interestScore(c));
  const total  = scores.reduce((a, b) => a + b, 0);
  let   rand   = Math.random() * total;
  for (let i = 0; i < POOL.length; i++) {
    rand -= scores[i];
    if (rand <= 0) return POOL[i];
  }
  return POOL[POOL.length - 1];
}

// ============================================================
//  RENDER CHARTS
// ============================================================

function renderCharts() {
  const info       = ALL_DATA[target.name];
  const years      = Object.keys(info.years).map(Number).sort((a, b) => a - b);
  const latest     = years[years.length - 1];
  const latestData = info.years[latest];
  const ordered    = sortedSources(target.name);

  document.getElementById('bar-label').textContent = 'Latest mix (' + latest + ')';

  if (lineChart) { lineChart.destroy(); lineChart = null; }
  if (barChart)  { barChart.destroy();  barChart  = null; }

  const sourceDatasets = ordered.map(src => ({
    label:           src,
    data:            years.map(y => info.years[y]?.[src] ?? 0),
    borderColor:     COLORS[src],
    backgroundColor: COLORS[src] + '22',
    borderWidth:     1.5,
    pointRadius:     1.5,
    pointHoverRadius:4,
    fill:            false,
    tension:         0.3,
  }));

  const hiddenDatasets = [
    { label: '__total__',      data: years.map(y => info.years[y]?.Total ?? 0) },
    { label: '__netimports__', data: years.map(y => info.years[y]?.NetImports ?? null), spanGaps: true },
    { label: '__demand__',     data: years.map(y => info.years[y]?.Demand ?? null), spanGaps: true },
  ].map(d => ({
    ...d,
    borderColor: 'transparent', backgroundColor: 'transparent',
    borderWidth: 0, pointRadius: 0, pointHoverRadius: 0,
    hidden: true, fill: false, tension: 0.3,
  }));

  const lineCtx = document.getElementById('line-chart').getContext('2d');
  lineChart = new Chart(lineCtx, {
    type: 'line',
    data: { labels: years, datasets: [...sourceDatasets, ...hiddenDatasets] },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend:  { display: false },
        tooltip: { enabled: false, external: externalTooltipLine },
      },
      scales: {
        x: { grid: { color: '#f0f0f0' }, ticks: { color: '#888', font: { size: 11 }, maxTicksLimit: 10, autoSkip: true } },
        y: { grid: { color: '#f0f0f0' }, ticks: { color: '#888', font: { size: 11 } }, title: { display: true, text: 'TWh', color: '#aaa', font: { size: 11 } } },
      },
    },
  });

  const reversed    = [...ordered].reverse();
  const barDatasets = reversed.map(src => ({
    label: src, data: [latestData[src] || 0],
    backgroundColor: COLORS[src], borderWidth: 0,
  }));

  const barCtx = document.getElementById('bar-chart').getContext('2d');
  barChart = new Chart(barCtx, {
    type: 'bar',
    data: { labels: [''], datasets: barDatasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend:  { display: false },
        tooltip: { enabled: false, external: externalTooltipBar },
      },
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { display: false } },
        y: { stacked: true, grid: { color: '#f0f0f0' }, ticks: { color: '#888', font: { size: 11 } }, title: { display: true, text: 'TWh', color: '#aaa', font: { size: 11 } } },
      },
    },
  });

  renderLegend(ordered);
}

// ============================================================
//  SHARED LEGEND
// ============================================================

function renderLegend(ordered) {
  const info  = ALL_DATA[target.name];
  const years = Object.keys(info.years).map(Number);
  const items = ordered
    .filter(src => years.some(y => (info.years[y]?.[src] ?? 0) > 0))
    .map(src =>
      '<div class="legend-item">' +
      '<span class="legend-swatch" style="background:' + COLORS[src] + '"></span>' +
      src + '</div>'
    ).join('');
  document.getElementById('legend-shared').innerHTML = items;
}

// ============================================================
//  TOOLTIPS
// ============================================================

function showTooltip(html, canvasEl, caretX, caretY) {
  const tip    = document.getElementById('tooltip');
  tip.innerHTML     = html;
  tip.style.opacity = '1';
  const rect   = canvasEl.getBoundingClientRect();
  const tw     = 270;
  const margin = 12;
  let left = rect.left + caretX + 14;
  let top  = rect.top  + caretY - 10;
  if (left + tw > window.innerWidth - margin) left = rect.left + caretX - tw - 14;
  tip.style.left = left + 'px';
  tip.style.top  = top  + 'px';
  const tipHeight = tip.getBoundingClientRect().height;
  if (top + tipHeight > window.innerHeight - margin) top = window.innerHeight - tipHeight - margin;
  tip.style.top = top + 'px';
}

function hideTooltip() {
  document.getElementById('tooltip').style.opacity = '0';
}

function tooltipRow(color, label, twh, total, bold) {
  const pct = total > 0 ? (Math.abs(twh) / total * 100).toFixed(1) : '0.0';
  return '<div style="display:flex;align-items:center;gap:6px;margin:2px 0">' +
    '<span style="width:8px;height:8px;border-radius:2px;flex-shrink:0;background:' + color + '"></span>' +
    '<span style="min-width:110px;font-size:0.85em;' + (bold ? 'font-weight:600' : '') + '">' + label + '</span>' +
    '<span style="font-weight:500">' + fmtTWh(Math.abs(twh)) + '</span>' +
    '<span style="color:#888;margin-left:3px;font-size:0.85em">(' + pct + '%)</span>' +
    '</div>';
}

function externalTooltipLine(context) {
  const model = context.tooltip;
  if (model.opacity === 0) { hideTooltip(); return; }
  const year     = parseInt(model.title?.[0]);
  const yearData = ALL_DATA[target.name]?.years[year] ?? {};
  const total    = yearData.Total      ?? 0;
  const demand   = yearData.Demand     ?? null;
  const netImp   = yearData.NetImports ?? null;
  let html = '<div style="font-weight:700;font-size:0.9em;margin-bottom:6px;border-bottom:1px solid #eee;padding-bottom:4px">Year: ' + year + '</div>';
  html += tooltipRow('#4a90c4', 'Total generation', total, total, true);
  if (demand !== null && demand > 0) html += tooltipRow('#1a1a1a', 'Demand', demand, total, true);
  if (netImp !== null && netImp !== 0) {
    const isExport = netImp < 0;
    html += tooltipRow(isExport ? '#2ab5a0' : '#e8925a', isExport ? 'Net exports' : 'Net imports', Math.abs(netImp), total, true);
  }
  html += '<div style="border-top:1px solid #eee;margin-top:5px;padding-top:5px">';
  model.dataPoints
    .filter(dp => !dp.dataset.label.startsWith('__') && (dp.parsed?.y ?? 0) > 0)
    .sort((a, b) => (b.parsed?.y ?? 0) - (a.parsed?.y ?? 0))
    .forEach(dp => { html += tooltipRow(COLORS[dp.dataset.label], dp.dataset.label, dp.parsed.y, total, false); });
  html += '</div>';
  showTooltip(html, context.chart.canvas, model.caretX, model.caretY);
}

function externalTooltipBar(context) {
  const model = context.tooltip;
  if (model.opacity === 0) { hideTooltip(); return; }
  const info   = ALL_DATA[target.name];
  const latest = info.latestYear;
  const data   = info.years[latest];
  const total  = data.Total ?? 0;
  let html = '<div style="font-weight:700;font-size:0.9em;margin-bottom:6px;border-bottom:1px solid #eee;padding-bottom:4px">Mix (' + latest + ')</div>';
  html += tooltipRow('#4a90c4', 'Total generation', total, total, true);
  if (data.Demand && data.Demand > 0) html += tooltipRow('#1a1a1a', 'Demand', data.Demand, total, true);
  if (data.NetImports && data.NetImports !== 0) {
    const isExport = data.NetImports < 0;
    html += tooltipRow(isExport ? '#2ab5a0' : '#e8925a', isExport ? 'Net exports' : 'Net imports', Math.abs(data.NetImports), total, true);
  }
  html += '<div style="border-top:1px solid #eee;margin-top:5px;padding-top:5px">';
  sortedSources(target.name).filter(src => (data[src] || 0) > 0)
    .forEach(src => { html += tooltipRow(COLORS[src], src, data[src], total, false); });
  html += '</div>';
  showTooltip(html, context.chart.canvas, model.caretX, model.caretY);
}

document.addEventListener('mousemove', e => {
  const section = document.getElementById('charts-section');
  if (section && !section.contains(e.target)) hideTooltip();
});

// ============================================================
//  LIVES
// ============================================================

function renderLives() {
  const container = document.getElementById('lives-container');
  container.innerHTML = '';
  const label = document.createElement('span');
  label.className   = 'lives-label';
  label.textContent = 'Guesses left:';
  container.appendChild(label);
  for (let i = 0; i < MAX_GUESSES; i++) {
    const dot     = document.createElement('div');
    dot.className = 'life' + (i < MAX_GUESSES - guesses.length ? ' active' : '');
    container.appendChild(dot);
  }
}

// ============================================================
//  GUESS LOGIC
// ============================================================

function submitGuess() {
  if (gameOver) return;
  const input = document.getElementById('guess-input');
  const error = document.getElementById('error');
  const val   = input.value.trim();

  if (!val) { error.textContent = 'Please type a country name.'; return; }

  const match = COUNTRIES.find(c => c.name.toLowerCase() === val.toLowerCase());
  if (!match) { error.textContent = '"' + val + '" not found — check spelling.'; return; }
  if (guesses.find(g => g.iso3 === match.iso3)) { error.textContent = 'Already guessed!'; return; }

  error.textContent = '';
  guesses.push(match);
  renderLives();

  const isCorrect = match.iso3 === target.iso3;
  addGuessRow(match, isCorrect);
  input.value = '';
  document.getElementById('autocomplete-list').style.display = 'none';

  saveDailyState(); // persist after every guess (no-op in practice mode)

  if (isCorrect)                          { showBanner(true);  endGame(); }
  else if (guesses.length >= MAX_GUESSES) { showBanner(false); endGame(); }
}

function addGuessRow(country, isCorrect) {
  const row     = document.createElement('div');
  row.className = 'guess-row' + (isCorrect ? ' correct' : '');

  const nameEl  = document.createElement('span');
  nameEl.className   = 'guess-name';
  nameEl.textContent = (isCorrect ? '✓ ' : '✗ ') + country.name;
  row.appendChild(nameEl);

  if (!isCorrect) {
    const dist    = Math.round(haversineKm(country.lat, country.lng, target.lat, target.lng));
    const bearing = bearingDeg(country.lat, country.lng, target.lat, target.lng);
    const label   = bearingLabel(bearing);
    const guessTotal = country.latestTotal;
    const guessDpc   = country.latestDpc;
    const worldDpc   = WORLD_DPC[country.latestYear] ??
      WORLD_DPC[Math.max(...Object.keys(WORLD_DPC).map(Number))];

    const hint     = document.createElement('span');
    hint.className = 'guess-hint';
    hint.innerHTML =
      '<span class="guess-arrow">' + bearingArrowSVG(bearing) + '</span>' +
      '<span class="guess-direction">' + label + '</span>' +
      '<span class="hint-divider">·</span>' +
      '<span>' + dist.toLocaleString() + ' km</span>' +
      '<span class="hint-divider">·</span>' +
      '<span>' + fmtTWh(guessTotal) + ' generated</span>' +
      (guessDpc != null
        ? '<span class="hint-divider">·</span>' +
          '<span>' + guessDpc.toFixed(1) + ' MWh/person</span>' +
          '<span style="color:#bbb">&nbsp;(world avg: ' +
          (worldDpc?.toFixed(1) ?? '—') + ')</span>'
        : '');
    row.appendChild(hint);
  }

  document.getElementById('guesses').appendChild(row);
}

function showBanner(won) {
  const banner  = document.getElementById('banner');
  const div     = document.createElement('div');
  div.className = won ? 'win' : 'lose';
  div.textContent = won
    ? '🎉 Correct in ' + guesses.length + (guesses.length === 1 ? ' guess!' : ' guesses!')
    : '❌ The answer was ' + target.name + (MODE === 'practice' ? '. Keep practising!' : '. Better luck next time!');
  banner.innerHTML = '';
  banner.appendChild(div);
}

function endGame() {
  gameOver = true;
  saveDailyState(); // capture gameOver=true so practice unlocks on reload
  document.getElementById('input-area').style.display   = 'none';
  document.getElementById('new-game-btn').style.display = 'block';

  // Replace the mode-switcher element so Practice button unlocks immediately
  if (MODE === 'normal') {
    const switcher = document.querySelector('.mode-switcher');
    if (switcher) {
      const tmp = document.createElement('div');
      tmp.innerHTML = modeSwitcherHTML();
      switcher.replaceWith(tmp.firstElementChild);
    }
  }
}

// ============================================================
//  AUTOCOMPLETE
// ============================================================

function setupAutocomplete() {
  const input = document.getElementById('guess-input');
  const list  = document.getElementById('autocomplete-list');

  input.addEventListener('input', () => {
    const q = input.value.toLowerCase().trim();
    if (q.length < 2) { list.style.display = 'none'; return; }
    const matches = COUNTRIES.filter(c => c.name.toLowerCase().includes(q)).slice(0, 8);
    if (!matches.length) { list.style.display = 'none'; return; }
    list.innerHTML = '';
    matches.forEach(c => {
      const item       = document.createElement('div');
      item.className   = 'ac-item';
      item.textContent = c.name;
      item.addEventListener('mousedown', e => {
        e.preventDefault();
        input.value        = c.name;
        list.style.display = 'none';
        submitGuess();
      });
      list.appendChild(item);
    });
    list.style.display = 'block';
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { list.style.display = 'none'; submitGuess(); }
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('#autocomplete-wrapper')) list.style.display = 'none';
  });
}

// ============================================================
//  NEW GAME
// ============================================================

// newGame is used only for PRACTICE — picks a weighted random country.
function newGame() {
  target   = weightedRandomCountry();
  guesses  = [];
  gameOver = false;

  document.getElementById('guesses').innerHTML      = '';
  document.getElementById('banner').innerHTML       = '';
  document.getElementById('error').textContent      = '';
  document.getElementById('input-area').style.display   = 'flex';
  document.getElementById('new-game-btn').style.display = 'none';
  document.getElementById('guess-input').value      = '';

  renderLives();
  renderStatBar();
  renderFlowBar();
  renderCharts();
}

// restoreDailyGame — always called when entering/returning to Daily mode.
// Picks today's seeded target and replays any saved guesses from localStorage.
function restoreDailyGame() {
  target   = getDailyTarget(COUNTRIES);
  guesses  = [];
  gameOver = false;

  document.getElementById('guesses').innerHTML      = '';
  document.getElementById('banner').innerHTML       = '';
  document.getElementById('error').textContent      = '';
  document.getElementById('input-area').style.display   = 'flex';
  document.getElementById('new-game-btn').style.display = 'none';
  document.getElementById('guess-input').value      = '';

  renderLives();
  renderStatBar();
  renderFlowBar();
  renderCharts();

  // Replay saved guesses silently
  const saved = loadDailyState();
  if (saved && saved.guesses.length > 0) {
    for (const iso3 of saved.guesses) {
      const country = COUNTRIES.find(c => c.iso3 === iso3);
      if (!country) continue;
      guesses.push(country);
      const isCorrect = country.iso3 === target.iso3;
      addGuessRow(country, isCorrect);
    }
    renderLives();
    // Restore end state if game was already over
    if (saved.gameOver) {
      const won = guesses.length > 0 && guesses[guesses.length - 1].iso3 === target.iso3;
      showBanner(won);
      gameOver = true;
      document.getElementById('input-area').style.display   = 'none';
      document.getElementById('new-game-btn').style.display = 'block';
    }
  }
}

// ============================================================
//  BOOT
// ============================================================

loadData();
