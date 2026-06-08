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
// ============================================================

const PRACTICE_CATEGORIES = [
  { id:'all',      emoji:'GLOBE',  label:'All Countries',  filter: c => true },
  { id:'europe',   emoji:'EU',     label:'Europe',         filter: c => c.continent === 'Europe' },
  { id:'africa',   emoji:'EARTH1', label:'Africa',         filter: c => c.continent === 'Africa' },
  { id:'asia',     emoji:'EARTH2', label:'Asia & Pacific', filter: c => c.continent === 'Asia' || c.continent === 'Oceania' },
  { id:'americas', emoji:'EARTH3', label:'Americas',       filter: c => c.continent === 'North America' || c.continent === 'South America' },
  { id:'major',    emoji:'BOLT',   label:'Major Producers',filter: c => c.latestTotal >= 100 },
  { id:'highcap',  emoji:'BULB',   label:'High Per-Capita',filter: c => (c.latestDpc ?? 0) >= 7 },
  { id:'green',    emoji:'LEAF',   label:'Green Leaders',  filter: c => (c.renewablePct ?? 0) >= 70 },
  { id:'fossil',   emoji:'FIRE',   label:'Fossil Heavy',   filter: c => (c.fossilPct ?? 0) >= 90 },
  { id:'lowcap',   emoji:'HOUSE',  label:'Low Per-Capita', filter: c => (c.latestDpc ?? 0) > 0 && (c.latestDpc ?? 0) < 0.5 },
];

const CAT_EMOJI = {
  'GLOBE':'🌐','EU':'🇪🇺','EARTH1':'🌍','EARTH2':'🌏','EARTH3':'🌎',
  'BOLT':'⚡','BULB':'💡','LEAF':'🌱','FIRE':'🔥','HOUSE':'🏚️',
};
function catEmoji(id) {
  const cat = PRACTICE_CATEGORIES.find(c => c.id === id);
  return cat ? (CAT_EMOJI[cat.emoji] || cat.emoji) : '';
}

// ============================================================
//  DAILY PUZZLE
// ============================================================

const EPOCH_DATE = new Date(Date.UTC(2026, 5, 2));

function getDayNumber() {
  const now      = new Date();
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((todayUTC - EPOCH_DATE.getTime()) / 86400000) + 1;
}

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
//  DAILY STATE — localStorage
// ============================================================

const LS_KEY = 'energle_daily_v1';

function loadDailyState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (saved.day !== getDayNumber()) return null;
    return saved;
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

// ============================================================
//  ISO3 CONTINENT FALLBACK
// ============================================================

const ISO3_CONTINENT = {
  'ALB':'Europe','ARM':'Europe','AUT':'Europe','AZE':'Europe','BLR':'Europe',
  'BEL':'Europe','BIH':'Europe','BGR':'Europe','HRV':'Europe','CYP':'Europe',
  'CZE':'Europe','DNK':'Europe','EST':'Europe','FIN':'Europe','FRA':'Europe',
  'GEO':'Europe','DEU':'Europe','GRC':'Europe','HUN':'Europe','ISL':'Europe',
  'IRL':'Europe','ITA':'Europe','XKX':'Europe','LVA':'Europe','LTU':'Europe',
  'LUX':'Europe','MLT':'Europe','MDA':'Europe','MNE':'Europe','NLD':'Europe',
  'MKD':'Europe','NOR':'Europe','POL':'Europe','PRT':'Europe','ROU':'Europe',
  'RUS':'Europe','SRB':'Europe','SVK':'Europe','SVN':'Europe','ESP':'Europe',
  'SWE':'Europe','CHE':'Europe','UKR':'Europe','GBR':'Europe',
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
  'AFG':'Asia','BHR':'Asia','BGD':'Asia','BTN':'Asia','BRN':'Asia',
  'KHM':'Asia','CHN':'Asia','IND':'Asia','IDN':'Asia','IRN':'Asia',
  'IRQ':'Asia','ISR':'Asia','JPN':'Asia','JOR':'Asia','KAZ':'Asia',
  'PRK':'Asia','KOR':'Asia','KWT':'Asia','KGZ':'Asia','LAO':'Asia',
  'LBN':'Asia','MYS':'Asia','MDV':'Asia','MNG':'Asia','MMR':'Asia',
  'NPL':'Asia','OMN':'Asia','PAK':'Asia','PHL':'Asia','QAT':'Asia',
  'SAU':'Asia','SGP':'Asia','LKA':'Asia','SYR':'Asia','TWN':'Asia',
  'TJK':'Asia','THA':'Asia','TLS':'Asia','TKM':'Asia','ARE':'Asia',
  'UZB':'Asia','VNM':'Asia','YEM':'Asia','PSE':'Asia',
  'AUS':'Oceania','NZL':'Oceania','FJI':'Oceania','PNG':'Oceania',
  'BHS':'North America','BLZ':'North America','CAN':'North America',
  'CRI':'North America','CUB':'North America','DOM':'North America',
  'SLV':'North America','GTM':'North America','HTI':'North America',
  'HND':'North America','JAM':'North America','MEX':'North America',
  'NIC':'North America','PAN':'North America','PRI':'North America',
  'TTO':'North America','USA':'North America',
  'ARG':'South America','BOL':'South America','BRA':'South America',
  'CHL':'South America','COL':'South America','ECU':'South America',
  'GUY':'South America','PRY':'South America','PER':'South America',
  'SUR':'South America','URY':'South America','VEN':'South America',
};

// ============================================================
//  STATE
// ============================================================

let ALL_DATA     = null;
let WORLD_DPC    = null;
let COUNTRIES    = [];
let POOL         = [];
let target       = null;
let guesses      = [];
let gameOver     = false;
let lineChart    = null;
let barChart     = null;
let MODE         = 'normal';
let PRACTICE_CAT = null;

// ============================================================
//  PRACTICE GATE
// ============================================================

function practiceUnlocked() {
  if (MODE === 'practice') return true;
  if (gameOver) return true;
  const saved = loadDailyState();
  return saved ? saved.gameOver === true : false;
}

// ============================================================
//  LOAD DATA
// ============================================================

async function loadData() {
  document.getElementById('app').innerHTML = '<div id="loading">Loading data...</div>';
  try {
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
      const renSum = renewables.reduce((s, k) => s + (yearData[k] ?? 0), 0);
      const fosSum = fossils.reduce((s, k) => s + (yearData[k] ?? 0), 0);
      return {
        name, iso3: info.iso3, lat: info.lat, lng: info.lng,
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
  } catch(err) {
    document.getElementById('app').innerHTML =
      '<div id="loading">Error loading data: ' + err.message + '</div>';
  }
}

// ============================================================
//  MODE SWITCHER
// ============================================================

function modeSwitcherHTML() {
  const locked         = !practiceUnlocked();
  const dailyActive    = MODE === 'normal'   ? 'active' : '';
  const practiceActive = MODE === 'practice' ? 'active' : '';
  const lockedClass    = locked ? 'locked' : '';
  const lockIcon       = locked ? ' \uD83D\uDD12' : '';
  return '<div class="mode-switcher">'
    + '<button class="mode-btn ' + dailyActive + '" onclick="switchMode(\'normal\')">Daily</button>'
    + '<button class="mode-btn ' + practiceActive + ' ' + lockedClass
    + '" onclick="switchMode(\'practice\')">Practice' + lockIcon + '</button>'
    + '</div>';
}

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
    restoreDailyGame();
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
  resetPracticeQueue();
  renderGameScreen();
  newGame();
}

// ============================================================
//  COUNTRY LIST MODAL
// ============================================================

function showCountryList(catId) {
  const cat = PRACTICE_CATEGORIES.find(c => c.id === catId);
  if (!cat) return;
  const countries = COUNTRIES.filter(cat.filter)
    .sort((a, b) => a.name.localeCompare(b.name));

  const rows = countries.map(c =>
    '<div class="cl-row">'
    + '<span class="cl-name">' + c.name + '</span>'
    + '<span class="cl-meta">' + (c.continent || '') + '</span>'
    + '</div>'
  ).join('');

  const existing = document.getElementById('cl-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'cl-modal';
  modal.innerHTML =
    '<div class="cl-backdrop"></div>'
    + '<div class="cl-box">'
    + '<div class="cl-header">'
    + '<span>' + catEmoji(catId) + ' ' + cat.label
    + ' <span class="cl-count">(' + countries.length + ' countries)</span></span>'
    + '<button class="cl-close" id="cl-close-btn">x</button>'
    + '</div>'
    + '<div class="cl-body">' + rows + '</div>'
    + '</div>';

  modal.querySelector('.cl-backdrop').addEventListener('click', () => modal.remove());
  document.body.appendChild(modal);
  document.getElementById('cl-close-btn').addEventListener('click', () => modal.remove());
}

// ============================================================
//  BROWSE MODE
// ============================================================

function renderBrowseScreen() {
  if (lineChart) { lineChart.destroy(); lineChart = null; }
  if (barChart)  { barChart.destroy();  barChart  = null; }

  const sorted = [...COUNTRIES].sort((a, b) => a.name.localeCompare(b.name));
  const rows = sorted.map(c =>
    '<button class="browse-row" onclick="browseCountry(\'' + c.iso3 + '\')">'
    + '<span class="browse-name">' + c.name + '</span>'
    + '<span class="browse-meta">' + (c.continent || '') + ' \u00b7 ' + c.latestTotal.toFixed(1) + ' TWh</span>'
    + '</button>'
  ).join('');

  document.getElementById('app').innerHTML =
    '<header>'
    + '<div class="header-top"><h1>Energle \u26a1</h1>' + modeSwitcherHTML() + '</div>'
    + '<div class="subtitle-row">'
    + '<p class="subtitle">Browse all country energy profiles</p>'
    + '<button id="back-to-cats">\u2190 Categories</button>'
    + '</div>'
    + '</header>'
    + '<div class="browse-search-wrap">'
    + '<input id="browse-search" type="text" placeholder="Search countries..." autocomplete="off" />'
    + '</div>'
    + '<div class="browse-list" id="browse-list">' + rows + '</div>'
    + '<footer><p>Data: <a href="https://ember-climate.org" target="_blank">Ember Global Electricity Review</a></p></footer>';

  document.getElementById('back-to-cats').addEventListener('click', renderPracticePickerScreen);
  document.getElementById('browse-search').addEventListener('input', function() {
    const q = this.value.toLowerCase().trim();
    document.querySelectorAll('.browse-row').forEach(btn => {
      const visible = btn.querySelector('.browse-name').textContent.toLowerCase().includes(q);
      btn.style.display = visible ? '' : 'none';
    });
  });
}

function browseCountry(iso3) {
  const country = COUNTRIES.find(c => c.iso3 === iso3);
  if (!country) return;
  if (lineChart) { lineChart.destroy(); lineChart = null; }
  if (barChart)  { barChart.destroy();  barChart  = null; }

  const prevTarget = target;
  target = country;

  document.getElementById('app').innerHTML =
    '<header>'
    + '<div class="header-top"><h1>Energle \u26a1</h1>' + modeSwitcherHTML() + '</div>'
    + '<div class="subtitle-row">'
    + '<p class="subtitle">' + country.name + ' \u00b7 ' + (country.continent || '') + '</p>'
    + '<button id="back-to-browse">\u2190 Browse</button>'
    + '</div>'
    + '</header>'
    + '<div id="stat-bar">'
    + '<div class="stat-item"><span class="stat-label">Total generation</span><span class="stat-value" id="stat-total">\u2014</span></div>'
    + '<div class="stat-divider"></div>'
    + '<div class="stat-item"><span class="stat-label">Demand per capita</span><span class="stat-value" id="stat-dpc">\u2014</span></div>'
    + '<div class="stat-item stat-world"><span class="stat-label">World average</span><span class="stat-value" id="stat-world">\u2014</span></div>'
    + '</div>'
    + '<div id="flow-bar"><div class="flow-label">Energy balance \u2014 latest year</div>'
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
    target = prevTarget;
    renderBrowseScreen();
  });

  renderStatBar();
  renderFlowBar();
  renderCharts();
}

// ============================================================
//  PRACTICE PICKER
// ============================================================

function renderPracticePickerScreen() {
  if (lineChart) { lineChart.destroy(); lineChart = null; }
  if (barChart)  { barChart.destroy();  barChart  = null; }

  const cards = PRACTICE_CATEGORIES.map(cat => {
    const count = COUNTRIES.filter(cat.filter).length;
    return '<div class="cat-card-wrap">'
      + '<button class="cat-card" onclick="startPractice(\'' + cat.id + '\')">'
      + '<span class="cat-emoji">' + catEmoji(cat.id) + '</span>'
      + '<span class="cat-label">' + cat.label + '</span>'
      + '<span class="cat-desc">' + count + ' countries</span>'
      + '</button>'
      + '<button class="cat-list-btn" onclick="showCountryList(\'' + cat.id + '\')" title="See country list">'
      + '\u2630'
      + '</button>'
      + '</div>';
  }).join('');

  document.getElementById('app').innerHTML =
    '<header>'
    + '<div class="header-top"><h1>Energle \u26a1</h1>' + modeSwitcherHTML() + '</div>'
    + '<p class="subtitle">Choose a category to practice</p>'
    + '</header>'
    + '<div class="cat-grid">' + cards + '</div>'
    + '<div class="browse-btn-wrap">'
    + '<button class="browse-all-btn" onclick="renderBrowseScreen()">'
    + '\uD83D\uDD0D\u00a0 Browse all countries'
    + '</button>'
    + '</div>'
    + '<footer><p>Data: <a href="https://ember-climate.org" target="_blank">Ember Global Electricity Review</a></p></footer>';
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
//  RENDER HELPERS
// ============================================================

function practiceSubtitle() {
  if (MODE !== 'practice' || !PRACTICE_CAT) return '';
  const cat = PRACTICE_CATEGORIES.find(c => c.id === PRACTICE_CAT);
  return cat ? catEmoji(cat.id) + ' ' + cat.label + ' \u00b7 ' + POOL.length + ' countries' : '';
}

function renderGameScreen() {
  const isPractice = MODE === 'practice';
  const subtitle   = isPractice
    ? practiceSubtitle()
    : 'Puzzle #' + getDayNumber() + ' \u00b7 Guess the country from its electricity generation mix';
  const backBtn = isPractice
    ? '<button id="back-to-categories">\u2190 Categories</button>'
    : '';

  document.getElementById('app').innerHTML =
    '<header>'
    + '<div class="header-top"><h1>Energle \u26a1</h1>' + modeSwitcherHTML() + '</div>'
    + '<div class="subtitle-row"><p class="subtitle">' + subtitle + '</p>' + backBtn + '</div>'
    + '</header>'
    + '<div id="lives-container"></div>'
    + '<div id="stat-bar">'
    + '<div class="stat-item"><span class="stat-label">Total generation</span><span class="stat-value" id="stat-total">\u2014</span></div>'
    + '<div class="stat-divider"></div>'
    + '<div class="stat-item"><span class="stat-label">Demand per capita</span><span class="stat-value" id="stat-dpc">\u2014</span></div>'
    + '<div class="stat-item stat-world"><span class="stat-label">World average</span><span class="stat-value" id="stat-world">\u2014</span></div>'
    + '</div>'
    + '<div id="flow-bar"><div class="flow-label">Energy balance \u2014 latest year</div>'
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
    + '<details id="glossary">'
    + '<summary id="glossary-trigger"><span class="glossary-icon">?</span><span>What does each source mean?</span><span class="glossary-arrow">\u203a</span></summary>'
    + '<div id="glossary-body">'
    + '<div class="glossary-section"><h3 class="glossary-heading fossil">Fossil fuels</h3><div class="glossary-grid">'
    + '<div class="glossary-item"><span class="glossary-swatch" style="background:#4a4a4a"></span><div><strong>Coal</strong><p>Hard coal and lignite burned in thermal power stations.</p></div></div>'
    + '<div class="glossary-item"><span class="glossary-swatch" style="background:#e8925a"></span><div><strong>Gas</strong><p>Natural gas and LNG burned in gas turbines or combined-cycle plants.</p></div></div>'
    + '<div class="glossary-item"><span class="glossary-swatch" style="background:#c0654a"></span><div><strong>Other Fossil</strong><p>Oil, diesel, heavy fuel oil, petroleum products, manufactured gas, and waste incineration.</p></div></div>'
    + '</div></div>'
    + '<div class="glossary-section"><h3 class="glossary-heading low-carbon">Low-carbon</h3><div class="glossary-grid">'
    + '<div class="glossary-item"><span class="glossary-swatch" style="background:#9b6dbd"></span><div><strong>Nuclear</strong><p>Electricity from uranium fission. Very low lifecycle emissions and reliable baseload power.</p></div></div>'
    + '</div></div>'
    + '<div class="glossary-section"><h3 class="glossary-heading renewables">Renewables</h3><div class="glossary-grid">'
    + '<div class="glossary-item"><span class="glossary-swatch" style="background:#4a90c4"></span><div><strong>Hydro</strong><p>Run-of-river and reservoir hydropower.</p></div></div>'
    + '<div class="glossary-item"><span class="glossary-swatch" style="background:#5ab88a"></span><div><strong>Wind</strong><p>Onshore and offshore wind turbines.</p></div></div>'
    + '<div class="glossary-item"><span class="glossary-swatch" style="background:#f5c842"></span><div><strong>Solar</strong><p>Solar photovoltaic (PV) panels and solar thermal plants.</p></div></div>'
    + '<div class="glossary-item"><span class="glossary-swatch" style="background:#a0724a"></span><div><strong>Bioenergy</strong><p>Biomass burning, biogas, sugarcane bagasse, and wood pellets.</p></div></div>'
    + '<div class="glossary-item"><span class="glossary-swatch" style="background:#2ab5a0"></span><div><strong>Other Renewables</strong><p>Geothermal, tidal, and wave energy.</p></div></div>'
    + '</div></div>'
    + '<p class="glossary-source">Source: <a href="https://ember-climate.org" target="_blank">Ember Global Electricity Review</a></p>'
    + '</div></details>'
    + '<div id="guesses"></div>'
    + '<div id="banner"></div>'
    + '<p id="error"></p>'
    + '<div id="input-area">'
    + '<div id="autocomplete-wrapper">'
    + '<input id="guess-input" type="text" placeholder="Type a country name..." autocomplete="off" />'
    + '<div id="autocomplete-list"></div>'
    + '</div>'
    + '<button id="submit-btn">Guess</button>'
    + '</div>'
    + '<button id="new-game-btn" style="display:none">'
    + (isPractice ? 'Next puzzle \u21ba' : 'Come back tomorrow \uD83C\uDF19')
    + '</button>'
    + '<footer><p>Data: <a href="https://ember-climate.org" target="_blank">Ember Global Electricity Review</a></p></footer>';

  document.getElementById('submit-btn').addEventListener('click', submitGuess);
  document.getElementById('new-game-btn').addEventListener('click', () => {
    if (MODE === 'practice') newGame();
  });
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
  return '<svg width="18" height="18" viewBox="0 0 20 20"'
    + ' style="transform:rotate(' + deg + 'deg);display:inline-block;vertical-align:middle;flex-shrink:0">'
    + '<polygon points="10,2 14,16 10,13 6,16" fill="currentColor"/></svg>';
}

function bearingLabel(deg) {
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

// ============================================================
//  FORMAT HELPERS
// ============================================================

function fmtTWh(v) {
  if (v === null || v === undefined) return '\u2014';
  const abs = Math.abs(v);
  if (abs >= 1000) return (v / 1000).toFixed(2) + ' PWh';
  return v.toFixed(1) + ' TWh';
}

function fmtFlowLabel(v, label) {
  const num = Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + ' PWh' : v.toFixed(1) + ' TWh';
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
  const worldDpc = WORLD_DPC[latest] ?? WORLD_DPC[Math.max(...Object.keys(WORLD_DPC).map(Number))];
  document.getElementById('stat-total').textContent = fmtTWh(total);
  document.getElementById('stat-dpc').textContent =
    dpc != null ? dpc.toFixed(1) + ' MWh / person (' + latest + ')' : '\u2014';
  document.getElementById('stat-world').textContent =
    worldDpc != null ? worldDpc.toFixed(1) + ' MWh / person' : '\u2014';
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
      seg('generation', genPct, fmtFlowLabel(demand, 'demand'), fmtFlowLabel(demand, 'demand') + ' (' + genPct + '% of generation)') +
      seg('exports', exportPct, fmtFlowLabel(tradeAbs, 'exported'), fmtFlowLabel(tradeAbs, 'exported') + ' (' + exportPct + '% of generation)');
  } else {
    const total     = demand > 0 ? demand : gen + netImp;
    const genPct    = (gen / total * 100).toFixed(1);
    const importPct = (netImp / total * 100).toFixed(1);
    track.innerHTML =
      seg('generation', genPct, fmtFlowLabel(gen, 'generated'), fmtFlowLabel(gen, 'generated') + ' (' + genPct + '% of demand)') +
      seg('imports', Math.max(importPct, 0), fmtFlowLabel(netImp, 'imported'), fmtFlowLabel(netImp, 'imported') + ' (' + importPct + '% of demand)');
  }
}

function seg(cls, pct, inlineLabel, tooltipLabel) {
  const p = Math.max(0, Math.min(100, parseFloat(pct)));
  if (p < 0.1) return '';
  return '<div class="flow-segment ' + cls + '" style="width:' + p + '%" title="' + tooltipLabel + '">'
    + '<span>' + (p > 10 ? inlineLabel : '') + '</span></div>';
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
//  PRACTICE QUEUE — with anti-repetition cooldown
// ============================================================

function interestScore(country) {
  const total = country.latestTotal;
  const dpc   = country.latestDpc ?? 0;
  return (Math.log10(Math.max(total, 1)) + Math.log10(Math.max(dpc * 10, 1)))
    * ((total < 5 && dpc < 1) ? 0.2 : 1);
}

function weightedShuffle(arr) {
  const items = arr.map(c => ({ c, score: interestScore(c) }));
  const result = [];
  while (items.length) {
    const total = items.reduce((s, x) => s + x.score, 0);
    let rand = Math.random() * total, idx = 0;
    for (; idx < items.length - 1; idx++) { rand -= items[idx].score; if (rand <= 0) break; }
    result.push(items[idx].c);
    items.splice(idx, 1);
  }
  return result;
}

function applyCooldown(queue, history) {
  const cooldown = Math.min(Math.floor(POOL.length / 2), 12);
  const hot = new Set(history.slice(-cooldown).map(c => c.iso3));
  return [...queue.filter(c => !hot.has(c.iso3)), ...queue.filter(c => hot.has(c.iso3))];
}

let practiceQueue   = [];
let practiceRetry   = [];
let practiceHistory = [];

function resetPracticeQueue() {
  practiceQueue   = weightedShuffle([...POOL]);
  practiceRetry   = [];
  practiceHistory = [];
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

function recordPracticeResult(won) {
  if (!won) practiceRetry.push(target);
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
    label: src, data: years.map(y => info.years[y]?.[src] ?? 0),
    borderColor: COLORS[src], backgroundColor: COLORS[src] + '22',
    borderWidth: 1.5, pointRadius: 1.5, pointHoverRadius: 4, fill: false, tension: 0.3,
  }));

  const hiddenDatasets = [
    { label: '__total__',      data: years.map(y => info.years[y]?.Total ?? 0) },
    { label: '__netimports__', data: years.map(y => info.years[y]?.NetImports ?? null), spanGaps: true },
    { label: '__demand__',     data: years.map(y => info.years[y]?.Demand ?? null), spanGaps: true },
  ].map(d => ({ ...d, borderColor: 'transparent', backgroundColor: 'transparent',
    borderWidth: 0, pointRadius: 0, pointHoverRadius: 0, hidden: true, fill: false, tension: 0.3 }));

  lineChart = new Chart(document.getElementById('line-chart').getContext('2d'), {
    type: 'line',
    data: { labels: years, datasets: [...sourceDatasets, ...hiddenDatasets] },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: { enabled: false, external: externalTooltipLine } },
      scales: {
        x: { grid: { color: '#f0f0f0' }, ticks: { color: '#888', font: { size: 11 }, maxTicksLimit: 10, autoSkip: true } },
        y: { grid: { color: '#f0f0f0' }, ticks: { color: '#888', font: { size: 11 } }, title: { display: true, text: 'TWh', color: '#aaa', font: { size: 11 } } },
      },
    },
  });

  barChart = new Chart(document.getElementById('bar-chart').getContext('2d'), {
    type: 'bar',
    data: { labels: [''], datasets: [...ordered].reverse().map(src => ({
      label: src, data: [latestData[src] || 0], backgroundColor: COLORS[src], borderWidth: 0,
    })) },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false, external: externalTooltipBar } },
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { display: false } },
        y: { stacked: true, grid: { color: '#f0f0f0' }, ticks: { color: '#888', font: { size: 11 } }, title: { display: true, text: 'TWh', color: '#aaa', font: { size: 11 } } },
      },
    },
  });

  renderLegend(ordered);
}

function renderLegend(ordered) {
  const info  = ALL_DATA[target.name];
  const years = Object.keys(info.years).map(Number);
  document.getElementById('legend-shared').innerHTML = ordered
    .filter(src => years.some(y => (info.years[y]?.[src] ?? 0) > 0))
    .map(src => '<div class="legend-item"><span class="legend-swatch" style="background:' + COLORS[src] + '"></span>' + src + '</div>')
    .join('');
}

// ============================================================
//  TOOLTIPS
// ============================================================

function showTooltip(html, canvasEl, caretX, caretY) {
  const tip = document.getElementById('tooltip');
  tip.innerHTML = html; tip.style.opacity = '1';
  const rect = canvasEl.getBoundingClientRect();
  const tw = 270, margin = 12;
  let left = rect.left + caretX + 14, top = rect.top + caretY - 10;
  if (left + tw > window.innerWidth - margin) left = rect.left + caretX - tw - 14;
  tip.style.left = left + 'px'; tip.style.top = top + 'px';
  const h = tip.getBoundingClientRect().height;
  if (top + h > window.innerHeight - margin) top = window.innerHeight - h - margin;
  tip.style.top = top + 'px';
}

function hideTooltip() { document.getElementById('tooltip').style.opacity = '0'; }

function tooltipRow(color, label, twh, total, bold) {
  const pct = total > 0 ? (Math.abs(twh) / total * 100).toFixed(1) : '0.0';
  return '<div style="display:flex;align-items:center;gap:6px;margin:2px 0">'
    + '<span style="width:8px;height:8px;border-radius:2px;flex-shrink:0;background:' + color + '"></span>'
    + '<span style="min-width:110px;font-size:0.85em;' + (bold ? 'font-weight:600' : '') + '">' + label + '</span>'
    + '<span style="font-weight:500">' + fmtTWh(Math.abs(twh)) + '</span>'
    + '<span style="color:#888;margin-left:3px;font-size:0.85em">(' + pct + '%)</span>'
    + '</div>';
}

function externalTooltipLine(context) {
  const model = context.tooltip;
  if (model.opacity === 0) { hideTooltip(); return; }
  const year = parseInt(model.title?.[0]);
  const yearData = ALL_DATA[target.name]?.years[year] ?? {};
  const total = yearData.Total ?? 0, demand = yearData.Demand ?? null, netImp = yearData.NetImports ?? null;
  let html = '<div style="font-weight:700;font-size:0.9em;margin-bottom:6px;border-bottom:1px solid #eee;padding-bottom:4px">Year: ' + year + '</div>';
  html += tooltipRow('#4a90c4', 'Total generation', total, total, true);
  if (demand !== null && demand > 0) html += tooltipRow('#1a1a1a', 'Demand', demand, total, true);
  if (netImp !== null && netImp !== 0) {
    const isExport = netImp < 0;
    html += tooltipRow(isExport ? '#2ab5a0' : '#e8925a', isExport ? 'Net exports' : 'Net imports', Math.abs(netImp), total, true);
  }
  html += '<div style="border-top:1px solid #eee;margin-top:5px;padding-top:5px">';
  model.dataPoints.filter(dp => !dp.dataset.label.startsWith('__') && (dp.parsed?.y ?? 0) > 0)
    .sort((a, b) => (b.parsed?.y ?? 0) - (a.parsed?.y ?? 0))
    .forEach(dp => { html += tooltipRow(COLORS[dp.dataset.label], dp.dataset.label, dp.parsed.y, total, false); });
  html += '</div>';
  showTooltip(html, context.chart.canvas, model.caretX, model.caretY);
}

function externalTooltipBar(context) {
  const model = context.tooltip;
  if (model.opacity === 0) { hideTooltip(); return; }
  const info = ALL_DATA[target.name], latest = info.latestYear, data = info.years[latest], total = data.Total ?? 0;
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
  label.className = 'lives-label'; label.textContent = 'Guesses left:';
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
  const input = document.getElementById('guess-input');
  const error = document.getElementById('error');
  const val   = input.value.trim();
  if (!val) { error.textContent = 'Please type a country name.'; return; }
  const match = COUNTRIES.find(c => c.name.toLowerCase() === val.toLowerCase());
  if (!match) { error.textContent = '"' + val + '" not found \u2014 check spelling.'; return; }
  if (guesses.find(g => g.iso3 === match.iso3)) { error.textContent = 'Already guessed!'; return; }
  error.textContent = '';
  guesses.push(match);
  renderLives();
  const isCorrect = match.iso3 === target.iso3;
  addGuessRow(match, isCorrect);
  input.value = '';
  document.getElementById('autocomplete-list').style.display = 'none';
  saveDailyState();
  if (isCorrect)                          { showBanner(true);  endGame(); }
  else if (guesses.length >= MAX_GUESSES) { showBanner(false); endGame(); }
}

function addGuessRow(country, isCorrect) {
  const row = document.createElement('div');
  row.className = 'guess-row' + (isCorrect ? ' correct' : '');
  const nameEl = document.createElement('span');
  nameEl.className = 'guess-name';
  nameEl.textContent = (isCorrect ? '\u2713 ' : '\u2717 ') + country.name;
  row.appendChild(nameEl);
  if (!isCorrect) {
    const dist    = Math.round(haversineKm(country.lat, country.lng, target.lat, target.lng));
    const bearing = bearingDeg(country.lat, country.lng, target.lat, target.lng);
    const worldDpc = WORLD_DPC[country.latestYear] ?? WORLD_DPC[Math.max(...Object.keys(WORLD_DPC).map(Number))];
    const hint = document.createElement('span');
    hint.className = 'guess-hint';
    hint.innerHTML =
      '<span class="guess-arrow">' + bearingArrowSVG(bearing) + '</span>'
      + '<span class="guess-direction">' + bearingLabel(bearing) + '</span>'
      + '<span class="hint-divider">\u00b7</span>'
      + '<span>' + dist.toLocaleString() + ' km</span>'
      + '<span class="hint-divider">\u00b7</span>'
      + '<span>' + fmtTWh(country.latestTotal) + ' generated</span>'
      + (country.latestDpc != null
        ? '<span class="hint-divider">\u00b7</span>'
          + '<span>' + country.latestDpc.toFixed(1) + ' MWh/person</span>'
          + '<span style="color:#bbb">&nbsp;(world avg: ' + (worldDpc?.toFixed(1) ?? '\u2014') + ')</span>'
        : '');
    row.appendChild(hint);
  }
  document.getElementById('guesses').appendChild(row);
}

function showBanner(won) {
  const div = document.createElement('div');
  div.className = won ? 'win' : 'lose';
  div.textContent = won
    ? '\uD83C\uDF89 Correct in ' + guesses.length + (guesses.length === 1 ? ' guess!' : ' guesses!')
    : '\u274C The answer was ' + target.name + (MODE === 'practice' ? '. Keep practising!' : '. Better luck tomorrow!');
  const banner = document.getElementById('banner');
  banner.innerHTML = '';
  banner.appendChild(div);
}

function endGame() {
  gameOver = true;
  saveDailyState();
  if (MODE === 'practice') {
    recordPracticeResult(guesses.length > 0 && guesses[guesses.length - 1].iso3 === target.iso3);
  }
  document.getElementById('input-area').style.display   = 'none';
  document.getElementById('new-game-btn').style.display = 'block';
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
  let activeIdx = -1;

  function getItems() { return list.querySelectorAll('.ac-item'); }

  function highlight(idx) {
    const items = getItems();
    items.forEach(el => el.classList.remove('ac-active'));
    if (idx >= 0 && idx < items.length) {
      items[idx].classList.add('ac-active');
      items[idx].scrollIntoView({ block: 'nearest' });
    }
    activeIdx = idx;
  }

  function selectActive() {
    const items = getItems();
    if (activeIdx >= 0 && activeIdx < items.length) {
      input.value = items[activeIdx].textContent;
      list.style.display = 'none'; activeIdx = -1; return true;
    }
    return false;
  }

  function buildList(q) {
    activeIdx = -1;
    if (q.length < 2) { list.style.display = 'none'; return; }
    const matches = COUNTRIES.filter(c => c.name.toLowerCase().includes(q)).slice(0, 8);
    if (!matches.length) { list.style.display = 'none'; return; }
    list.innerHTML = '';
    matches.forEach(c => {
      const item = document.createElement('div');
      item.className = 'ac-item'; item.textContent = c.name;
      item.addEventListener('mousedown', e => {
        e.preventDefault(); input.value = c.name;
        list.style.display = 'none'; activeIdx = -1;
      });
      list.appendChild(item);
    });
    list.style.display = 'block';
  }

  input.addEventListener('input', () => buildList(input.value.toLowerCase().trim()));

  input.addEventListener('keydown', e => {
    const items = getItems();
    const open  = list.style.display === 'block' && items.length > 0;
    if (e.key === 'ArrowDown') {
      e.preventDefault(); highlight(open ? Math.min(activeIdx + 1, items.length - 1) : 0);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault(); highlight(open ? Math.max(activeIdx - 1, 0) : items.length - 1);
    } else if (e.key === 'Tab' && open) {
      e.preventDefault();
      const next = e.shiftKey ? Math.max(activeIdx - 1, 0) : Math.min(activeIdx + 1, items.length - 1);
      highlight(activeIdx === -1 ? 0 : next); selectActive();
    } else if (e.key === 'Enter') {
      if (open && activeIdx >= 0) { e.preventDefault(); selectActive(); }
      else { list.style.display = 'none'; submitGuess(); }
    } else if (e.key === 'Escape') {
      list.style.display = 'none'; activeIdx = -1;
    }
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('#autocomplete-wrapper')) { list.style.display = 'none'; activeIdx = -1; }
  });
}

// ============================================================
//  DAILY GAME
// ============================================================

function restoreDailyGame() {
  target = getDailyTarget(COUNTRIES);
  guesses = []; gameOver = false;
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
      const country = COUNTRIES.find(c => c.iso3 === iso3);
      if (!country) continue;
      guesses.push(country);
      addGuessRow(country, country.iso3 === target.iso3);
    }
    renderLives();
    if (saved.gameOver) {
      const won = guesses.length > 0 && guesses[guesses.length - 1].iso3 === target.iso3;
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
//  BOOT
// ============================================================

loadData();
