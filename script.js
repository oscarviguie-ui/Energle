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
//  STATE
// ============================================================

let ALL_DATA  = null;
let WORLD_DPC = null;
let COUNTRIES = [];
let target    = null;
let guesses   = [];
let gameOver  = false;
let lineChart = null;
let barChart  = null;

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
  COUNTRIES = Object.entries(ALL_DATA).map(([name, info]) => ({
    name,
    iso3:        info.iso3,
    lat:         info.lat,
    lng:         info.lng,
    latestYear:  info.latestYear,
    latestDpc:   info.latestDpc,
    latestTotal: info.years[info.latestYear]?.Total ?? 0,
  }));
  initApp();
}

// ============================================================
//  APP HTML
// ============================================================

function initApp() {
  document.getElementById('app').innerHTML = `
    <header>
      <h1>Energle ⚡</h1>
      <p class="subtitle">Guess the country from its electricity generation mix</p>
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
        <span class="flow-legend-item">
          <span class="flow-swatch generation"></span>Generation
        </span>
        <span class="flow-legend-item">
          <span class="flow-swatch exports"></span>Net exports
        </span>
        <span class="flow-legend-item">
          <span class="flow-swatch imports"></span>Net imports
        </span>
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
            <div class="glossary-item">
              <span class="glossary-swatch" style="background:#4a4a4a"></span>
              <div><strong>Coal</strong>
                <p>Hard coal and lignite burned in thermal power stations. The most carbon-intensive electricity source.</p>
              </div>
            </div>
            <div class="glossary-item">
              <span class="glossary-swatch" style="background:#e8925a"></span>
              <div><strong>Gas</strong>
                <p>Natural gas and LNG burned in gas turbines or combined-cycle plants. Roughly half the CO₂ of coal per kWh.</p>
              </div>
            </div>
            <div class="glossary-item">
              <span class="glossary-swatch" style="background:#c0654a"></span>
              <div><strong>Other Fossil</strong>
                <p>Oil, diesel, heavy fuel oil, petroleum products, manufactured gas, and waste incineration. Common in islands and countries with limited grid infrastructure.</p>
              </div>
            </div>
          </div>
        </div>
        <div class="glossary-section">
          <h3 class="glossary-heading low-carbon">Low-carbon</h3>
          <div class="glossary-grid">
            <div class="glossary-item">
              <span class="glossary-swatch" style="background:#9b6dbd"></span>
              <div><strong>Nuclear</strong>
                <p>Electricity from uranium fission. Very low lifecycle emissions and provides reliable baseload power.</p>
              </div>
            </div>
          </div>
        </div>
        <div class="glossary-section">
          <h3 class="glossary-heading renewables">Renewables</h3>
          <div class="glossary-grid">
            <div class="glossary-item">
              <span class="glossary-swatch" style="background:#4a90c4"></span>
              <div><strong>Hydro</strong>
                <p>Run-of-river and reservoir hydropower. Excludes pumped-storage, which consumes as much energy as it produces.</p>
              </div>
            </div>
            <div class="glossary-item">
              <span class="glossary-swatch" style="background:#5ab88a"></span>
              <div><strong>Wind</strong>
                <p>Onshore and offshore wind turbines. Output varies with weather but has near-zero operational emissions.</p>
              </div>
            </div>
            <div class="glossary-item">
              <span class="glossary-swatch" style="background:#f5c842"></span>
              <div><strong>Solar</strong>
                <p>Solar photovoltaic (PV) panels and solar thermal plants. Includes rooftop distributed generation where reported.</p>
              </div>
            </div>
            <div class="glossary-item">
              <span class="glossary-swatch" style="background:#a0724a"></span>
              <div><strong>Bioenergy</strong>
                <p>Biomass burning, biogas, sugarcane bagasse, and wood pellets. Classified as renewable but with important sustainability caveats.</p>
              </div>
            </div>
            <div class="glossary-item">
              <span class="glossary-swatch" style="background:#2ab5a0"></span>
              <div><strong>Other Renewables</strong>
                <p>Geothermal (heat from the Earth), tidal, and wave energy. Geothermal dominates — Iceland is the most prominent example.</p>
              </div>
            </div>
          </div>
        </div>
        <p class="glossary-source">Source definitions:
          <a href="https://ember-climate.org" target="_blank">Ember Global Electricity Review</a>
        </p>
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

    <button id="new-game-btn" style="display:none">New game ↺</button>

    <footer>
      <p>Data: <a href="https://ember-climate.org" target="_blank">
        Ember Global Electricity Review</a></p>
    </footer>
  `;

  document.getElementById('submit-btn').addEventListener('click', submitGuess);
  document.getElementById('new-game-btn').addEventListener('click', newGame);
  setupAutocomplete();
  newGame();
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
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const la1  = lat1 * Math.PI / 180;
  const la2  = lat2 * Math.PI / 180;
  const y    = Math.sin(dLng) * Math.cos(la2);
  const x    = Math.cos(la1) * Math.sin(la2) -
               Math.sin(la1) * Math.cos(la2) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

// Returns an inline SVG arrow rotated to the exact bearing degree
function bearingArrowSVG(deg) {
  return `<svg width="18" height="18" viewBox="0 0 20 20"
    style="transform:rotate(${deg}deg);display:inline-block;vertical-align:middle;flex-shrink:0"
    aria-label="${Math.round(deg)}°">
    <polygon points="10,2 14,16 10,13 6,16" fill="currentColor"/>
  </svg>`;
}

// Human-readable compass label for a bearing (16 directions)
function bearingLabel(deg) {
  const dirs = [
    'N','NNE','NE','ENE',
    'E','ESE','SE','SSE',
    'S','SSW','SW','WSW',
    'W','WNW','NW','NNW'
  ];
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
//  RENDER CHARTS
// ============================================================
function interestScore(country) {
  const total = country.latestTotal;        // TWh generated
  const dpc   = country.latestDpc ?? 0;    // MWh/capita

  // Reward high generation OR high per-capita (interesting either way)
  const generationScore = Math.log10(Math.max(total, 1));   // log scale so China doesn't dominate
  const dpcScore        = Math.log10(Math.max(dpc * 10, 1));

  // Penalise very tiny generators with low dpc (uninteresting)
  const penalty = (total < 5 && dpc < 1) ? 0.2 : 1;

  return (generationScore + dpcScore) * penalty;
}

function weightedRandomCountry() {
  const scores = COUNTRIES.map(c => interestScore(c));
  const total  = scores.reduce((a, b) => a + b, 0);
  let   rand   = Math.random() * total;
  for (let i = 0; i < COUNTRIES.length; i++) {
    rand -= scores[i];
    if (rand <= 0) return COUNTRIES[i];
  }
  return COUNTRIES[COUNTRIES.length - 1];
}

function renderCharts() {
  const info       = ALL_DATA[target.name];
  const years      = Object.keys(info.years).map(Number).sort((a, b) => a - b);
  const latest     = years[years.length - 1];
  const latestData = info.years[latest];
  const ordered    = sortedSources(target.name);

  document.getElementById('bar-label').textContent = 'Latest mix (' + latest + ')';

  if (lineChart) { lineChart.destroy(); lineChart = null; }
  if (barChart)  { barChart.destroy();  barChart  = null; }

  // ---------- LINE CHART — generation sources only ----------
  // Hidden datasets (Total, NetImports, Demand) use hidden:true so Chart.js
  // skips rendering them entirely — this fixes the phantom black baseline line.
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
    {
      label: '__total__',
      data:  years.map(y => info.years[y]?.Total ?? 0),
    },
    {
      label:    '__netimports__',
      data:     years.map(y => info.years[y]?.NetImports ?? null),
      spanGaps: true,
    },
    {
      label:    '__demand__',
      data:     years.map(y => info.years[y]?.Demand ?? null),
      spanGaps: true,
    },
  ].map(d => ({
    ...d,
    borderColor:     'transparent',
    backgroundColor: 'transparent',
    borderWidth:     0,
    pointRadius:     0,
    pointHoverRadius:0,
    hidden:          true,   // ← fixes the black baseline line
    fill:            false,
    tension:         0.3,
  }));

  const lineCtx = document.getElementById('line-chart').getContext('2d');
  lineChart = new Chart(lineCtx, {
    type: 'line',
    data: {
      labels:   years,
      datasets: [...sourceDatasets, ...hiddenDatasets],
    },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend:  { display: false },
        tooltip: { enabled: false, external: externalTooltipLine },
      },
      scales: {
        x: {
          grid:  { color: '#f0f0f0' },
          ticks: { color: '#888', font: { size: 11 },
                   maxTicksLimit: 10, autoSkip: true },
        },
        y: {
          grid:  { color: '#f0f0f0' },
          ticks: { color: '#888', font: { size: 11 } },
          title: { display: true, text: 'TWh',
                   color: '#aaa', font: { size: 11 } },
        },
      },
    },
  });

  // ---------- BAR CHART ----------
  const reversed    = [...ordered].reverse();
  const barDatasets = reversed.map(src => ({
    label:           src,
    data:            [latestData[src] || 0],
    backgroundColor: COLORS[src],
    borderWidth:     0,
  }));

  const barCtx = document.getElementById('bar-chart').getContext('2d');
  barChart = new Chart(barCtx, {
    type: 'bar',
    data: { labels: [''], datasets: barDatasets },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      plugins: {
        legend:  { display: false },
        tooltip: { enabled: false, external: externalTooltipBar },
      },
      scales: {
        x: {
          stacked: true,
          grid:    { display: false },
          ticks:   { display: false },
        },
        y: {
          stacked: true,
          grid:    { color: '#f0f0f0' },
          ticks:   { color: '#888', font: { size: 11 } },
          title:   { display: true, text: 'TWh',
                     color: '#aaa', font: { size: 11 } },
        },
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
  if (top + tipHeight > window.innerHeight - margin) {
    top = window.innerHeight - tipHeight - margin;
  }
  tip.style.top = top + 'px';
}

function hideTooltip() {
  document.getElementById('tooltip').style.opacity = '0';
}

function tooltipRow(color, label, twh, total, bold) {
  const pct = total > 0 ? (Math.abs(twh) / total * 100).toFixed(1) : '0.0';
  return '<div style="display:flex;align-items:center;gap:6px;margin:2px 0">' +
    '<span style="width:8px;height:8px;border-radius:2px;flex-shrink:0;background:' +
    color + '"></span>' +
    '<span style="min-width:110px;font-size:0.85em;' +
    (bold ? 'font-weight:600' : '') + '">' + label + '</span>' +
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

  let html =
    '<div style="font-weight:700;font-size:0.9em;margin-bottom:6px;' +
    'border-bottom:1px solid #eee;padding-bottom:4px">Year: ' + year + '</div>';

  html += tooltipRow('#4a90c4', 'Total generation', total, total, true);

  if (demand !== null && demand > 0)
    html += tooltipRow('#1a1a1a', 'Demand', demand, total, true);

  if (netImp !== null && netImp !== 0) {
    const isExport = netImp < 0;
    html += tooltipRow(
      isExport ? '#2ab5a0' : '#e8925a',
      isExport ? 'Net exports' : 'Net imports',
      Math.abs(netImp), total, true
    );
  }

  html +=
    '<div style="border-top:1px solid #eee;margin-top:5px;padding-top:5px">';
  model.dataPoints
    .filter(dp => !dp.dataset.label.startsWith('__') && (dp.parsed?.y ?? 0) > 0)
    .sort((a, b) => (b.parsed?.y ?? 0) - (a.parsed?.y ?? 0))
    .forEach(dp => {
      html += tooltipRow(
        COLORS[dp.dataset.label], dp.dataset.label,
        dp.parsed.y, total, false
      );
    });
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

  let html =
    '<div style="font-weight:700;font-size:0.9em;margin-bottom:6px;' +
    'border-bottom:1px solid #eee;padding-bottom:4px">Mix (' + latest + ')</div>';

  html += tooltipRow('#4a90c4', 'Total generation', total, total, true);

  if (data.Demand && data.Demand > 0)
    html += tooltipRow('#1a1a1a', 'Demand', data.Demand, total, true);

  if (data.NetImports && data.NetImports !== 0) {
    const isExport = data.NetImports < 0;
    html += tooltipRow(
      isExport ? '#2ab5a0' : '#e8925a',
      isExport ? 'Net exports' : 'Net imports',
      Math.abs(data.NetImports), total, true
    );
  }

  html +=
    '<div style="border-top:1px solid #eee;margin-top:5px;padding-top:5px">';
  sortedSources(target.name)
    .filter(src => (data[src] || 0) > 0)
    .forEach(src => {
      html += tooltipRow(COLORS[src], src, data[src], total, false);
    });
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
  if (!match) {
    error.textContent = '"' + val + '" not found — check spelling.'; return;
  }
  if (guesses.find(g => g.iso3 === match.iso3)) {
    error.textContent = 'Already guessed!'; return;
  }

  error.textContent = '';
  guesses.push(match);
  renderLives();

  const isCorrect = match.iso3 === target.iso3;
  addGuessRow(match, isCorrect);
  input.value = '';
  document.getElementById('autocomplete-list').style.display = 'none';

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
    const dist    = Math.round(haversineKm(
      country.lat, country.lng, target.lat, target.lng
    ));
    const bearing = bearingDeg(
      country.lat, country.lng, target.lat, target.lng
    );
    const label       = bearingLabel(bearing);
    const guessTotal  = country.latestTotal;
    const guessDpc    = country.latestDpc;
    const worldDpc    = WORLD_DPC[country.latestYear] ??
      WORLD_DPC[Math.max(...Object.keys(WORLD_DPC).map(Number))];

    const hint     = document.createElement('span');
    hint.className = 'guess-hint';
    hint.innerHTML =
      // Rotated SVG arrow at exact bearing + compass label
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
    ? '🎉 Correct in ' + guesses.length +
      (guesses.length === 1 ? ' guess!' : ' guesses!')
    : '❌ The answer was ' + target.name + '. Better luck next time!';
  banner.innerHTML = '';
  banner.appendChild(div);
}

function endGame() {
  gameOver = true;
  document.getElementById('input-area').style.display   = 'none';
  document.getElementById('new-game-btn').style.display = 'block';
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
    const matches = COUNTRIES
      .filter(c => c.name.toLowerCase().includes(q))
      .slice(0, 8);
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

function newGame() {
  target = weightedRandomCountry();
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

// ============================================================
//  BOOT
// ============================================================

loadData();
