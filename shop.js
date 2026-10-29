// ============================================================
//  CLUE SHOP + CLUE CARDS
//  Players trade guesses for clue cards about the daily country. A card costs 1 cell (set per card in SHOP_CARDS) of the
//  six-cell battery; the shop opens after the first guess and the last guess can never be spent.
//  The score counts cards like guesses. Unopened cards are revealed for free when the game ends.
//
//  Switch: SHOP_LIVE. While it is false the guess row shows the "Soon" teaser and nothing else changes.
//  Test before launch: add ?shop=on to the address (needs cards.json next to index.html).
//  Card figures come from cards.json (built monthly by scripts/build_cards.py); markup and figure
//  builders are in shop-cards.js; styles in shop.css. Loaded before script.js; everything here runs
//  only when the game calls it.
// ============================================================
const SHOP_LIVE = false;
const SHOP_LAUNCH_DAY = null;          // puzzle number of launch day: the intro is shown for 7 days from it
const SHOP_OPENS_AFTER = 1;            // guesses made before the shop opens
const SHOP_TEST = (() => { try { return new URLSearchParams(location.search).get('shop') === 'on'; } catch (e) { return false; } })();
function shopLive() { return SHOP_LIVE || SHOP_TEST; }

// fixed order, grouped: the land · what it trades · the grid and its people
const SHOP_CARDS = [
  { k: 'nature', cost: 1, name: 'Renewables Potential', desc: 'Sun and wind month by month, rain, fresh water and how high its land sits.', src: 'NASA POWER · NOAA · World Bank' },
  { k: 'under',  cost: 1, name: 'Underground Riches', desc: 'Oil, gas and coal reserves, transition minerals, and what mining brings in.', src: 'U.S. EIA · USGS · World Bank' },
  { k: 'trade',  cost: 1, name: 'Fuel Trade', full: true, desc: 'Who it buys oil, gas and coal from, and who it sells to.', src: 'CEPII BACI (UN Comtrade)' },
  { k: 'market', cost: 1, name: 'Electricity Trade', desc: 'How much electricity it imports and exports, and with which neighbours.', src: 'ENTSO-E · UN Comtrade · U.S. EIA' },
  { k: 'people', cost: 1, name: 'People & Power', desc: 'Who has power at home, power cuts, heating and cooling needs, way of life.', src: 'World Bank · NASA POWER' }
];

// ---------- card data (cards.json) ----------
let CARDS_DATA = null;
async function shopLoadData() {
  if (!shopLive()) return;
  try { const r = await fetch('cards.json', { cache: 'no-cache' }); if (r.ok) CARDS_DATA = await r.json(); } catch (e) { CARDS_DATA = null; }
}
function shopEntry() { return (CARDS_DATA && CARDS_DATA.countries && target && CARDS_DATA.countries[target.iso3]) || null; }

// ---------- state for today's daily ----------
const SHOP = {
  events: [],            // in order: { t: 'g', c } for a guess, { t: 'c', k, cost } for a card
  open: false, confirm: null, justBought: null,
  seen: false,           // shop opened at least once this game: stops the attention animation
  sent: false,           // usage already recorded for today (record_cards)
  on() {
    return !!(shopLive() && MODE === 'normal' && target && CARDS_DATA);
  },
  // every card is always for sale; one without data for today's country costs nothing and opens empty
  cards() { return SHOP_CARDS; },
  owned() { return this.events.filter(e => e.t === 'c').map(e => e.k); },
  cardCells() { return this.on() ? this.events.filter(e => e.t === 'c').reduce((a, e) => a + e.cost, 0) : 0; },
  reset() { this.events = []; this.open = false; this.confirm = null; this.justBought = null; this.seen = false; this.sent = false; closeShopModal(); hideLockTip(); CARD_SCOPE_ISO = null; },
  // what the daily save keeps: each card with the number of guesses made before it
  saveData() {
    let g = 0; const out = [];
    this.events.forEach(e => { if (e.t === 'g') g++; else out.push({ k: e.k, cost: e.cost, at: g }); });
    return out;
  }
};
function cardHasData(k) { const e = shopEntry(); return !!(e && Array.isArray(e.cards) && e.cards.includes(k)); }
function cellsUsed() { return guesses.length + SHOP.cardCells(); }
function savedCells(ds) { return (ds && ds.guesses ? ds.guesses.length : 0) + (ds && Array.isArray(ds.cards) ? ds.cards.reduce((a, c) => a + (c.cost || 0), 0) : 0); }
const guessWord = n => n + ' guess' + (n > 1 ? 'es' : '');
const cellsHTML = (n, cls = 'sp-cell') => Array.from({ length: n }, () => '<span class="' + cls + '"></span>').join('');

// game hooks ------------------------------------------------------
function shopNoteGuess(country) { if (MODE === 'normal') SHOP.events.push({ t: 'g', c: country }); }
// restore: the cards bought after `at` guesses go back in before the next guess
function shopReplayCards(saved, at) {
  if (!Array.isArray(saved)) return;
  saved.filter(c => c.at === at && SHOP_CARDS.some(x => x.k === c.k)).forEach(c => {
    SHOP.events.push({ t: 'c', k: c.k, cost: c.cost });
    addCardLogRow(SHOP_CARDS.find(x => x.k === c.k), c.cost, false);
  });
}
function shopOnEnd(won) {
  closeShopModal(); hideLockTip();
  renderClueCards(); updateShopButton();
  if (MODE === 'normal') recordCardsOnce(won);
}

// ---------- template filler for CARD_TPL (sc-for / sc-if / {{path}}) ----------
function tplGet(scope, expr) {
  expr = expr.trim();
  if (expr === 'true') return true;
  if (expr === 'false') return false;
  return expr.split('.').reduce((o, k) => (o == null ? undefined : o[k]), scope);
}
function tplFill(str, scope) {
  return str.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (m, e) => { const v = tplGet(scope, e); return v == null ? '' : String(v); });
}
function tplNode(node, scope, out) {
  if (node.nodeType === 3) { out.appendChild(document.createTextNode(tplFill(node.nodeValue, scope))); return; }
  if (node.nodeType !== 1) return;
  const tag = node.tagName.toLowerCase();
  if (tag === 'sc-for') {
    const list = tplGet(scope, node.getAttribute('list').replace(/^\{\{|\}\}$/g, '')) || [];
    const as = node.getAttribute('as');
    list.forEach(item => { const s = Object.assign(Object.create(scope), { [as]: item }); node.childNodes.forEach(c => tplNode(c, s, out)); });
    return;
  }
  if (tag === 'sc-if') {
    if (tplGet(scope, node.getAttribute('value').replace(/^\{\{|\}\}$/g, ''))) node.childNodes.forEach(c => tplNode(c, scope, out));
    return;
  }
  const el = node.namespaceURI === 'http://www.w3.org/2000/svg' ? document.createElementNS(node.namespaceURI, node.tagName) : document.createElement(tag);
  for (const a of node.attributes) {
    if (/^on/i.test(a.name)) continue;
    el.setAttribute(a.name, tplFill(a.value, scope));
  }
  node.childNodes.forEach(c => tplNode(c, scope, el));
  out.appendChild(el);
}
const TPL_CACHE = {};
function tplRender(name, scope) {
  if (!TPL_CACHE[name]) { const t = document.createElement('template'); t.innerHTML = CARD_TPL[name]; TPL_CACHE[name] = t.content; }
  const frag = document.createDocumentFragment();
  TPL_CACHE[name].childNodes.forEach(c => tplNode(c, scope, frag));
  const box = document.createElement('div'); box.appendChild(frag); return box.innerHTML;
}
// flags for trade partners (two-letter codes); "OTHER" gets a plain grey tile
function shopFlagSrc(a2) {
  if (!a2 || a2 === 'OTHER') return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 4 3'%3E%3Crect width='4' height='3' fill='%23d6d4cf'/%3E%3C/svg%3E";
  return 'https://flagcdn.com/w40/' + String(a2).toLowerCase() + '.png';
}

// ---------- the shop button (or the "Soon" teaser while the shop is off) ----------
const SHOP_ICON = '<svg class="shop-ico" viewBox="0 0 32 32" width="26" height="26" aria-hidden="true"><path d="M5 13h22v14H5z" fill="#fff" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M4 7h24l-1.5 6.2a3 3 0 0 1-5.6.6 3 3 0 0 1-5.6 0 3 3 0 0 1-5.6 0 3 3 0 0 1-5.6-.6z" fill="var(--awn)" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9.6 7l-.9 6.8M16 7v6.8M22.4 7l.9 6.8" stroke="currentColor" stroke-width="1.4"/><path d="M13 27v-7h6v7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
const LS_SHOP_TEASER = 'energle_shop_teaser_v1';
function shopTeaserSeen() { try { return localStorage.getItem(LS_SHOP_TEASER) === '1'; } catch (e) { return false; } }
function shopButtonHTML() {
  if (MODE !== 'normal') return '';
  return '<button type="button" id="shop-btn" class="shop-btn is-soon" aria-label="Clue Shop">' + SHOP_ICON
    + '<span class="shop-lbl">Clue Shop</span><span class="shop-soon">Soon</span><span class="shop-badge" hidden></span></button>';
}
function shopState(c) {
  const left = MAX_GUESSES - cellsUsed();
  if (SHOP.owned().includes(c.k)) return 'owned';
  if (guesses.length < SHOP_OPENS_AFTER) return 'locked';
  return left - c.cost >= 1 ? 'buy' : 'broke';
}
function updateShopButton() {
  const btn = document.getElementById('shop-btn'); if (!btn) return;
  const live = SHOP.on();
  if (!live) {
    // teaser: after the first guess of the daily, the little shop jolts a couple of times, until the player has opened it once
    btn.className = 'shop-btn is-soon' + (MODE === 'normal' && guesses.length >= 1 && !gameOver && !shopTeaserSeen() ? ' is-calling' : '');
    btn.setAttribute('aria-label', 'Clue Shop: coming soon'); btn.removeAttribute('aria-disabled');
    const b = btn.querySelector('.shop-badge'); if (b) b.hidden = true;
    return;
  }
  const locked = guesses.length < SHOP_OPENS_AFTER || gameOver;
  const n = locked ? 0 : SHOP.cards().filter(c => shopState(c) === 'buy').length;
  btn.className = 'shop-btn' + (locked ? ' is-locked' : '') + (n ? ' has-cards' : '') + (n && !SHOP.seen && !SHOP.owned().length ? ' is-calling' : '');
  btn.setAttribute('aria-disabled', locked ? 'true' : 'false');
  btn.setAttribute('aria-label', locked ? (gameOver ? 'Clue Shop: the game is over' : 'Clue Shop: opens after your first guess') : 'Clue Shop: trade guesses for clue cards');
  btn.title = btn.getAttribute('aria-label');
  if (!locked) hideLockTip();
  const b = btn.querySelector('.shop-badge');
  if (b) { b.hidden = locked || !n; b.textContent = n; }
}
document.addEventListener('click', e => {
  const btn = e.target.closest('#shop-btn'); if (!btn) return;
  if (!SHOP.on()) {
    try { localStorage.setItem(LS_SHOP_TEASER, '1'); } catch (err) {}
    btn.classList.remove('is-calling');
    lockTip(btn, '<strong>The Clue Shop is coming soon.</strong> Trade spare guesses for clue cards: renewables potential, underground riches, fuel and power trade, people and power.', false);
    return;
  }
  if (gameOver) { lockTip(btn, '<strong>The game is over.</strong> Every clue card is shown above your guesses.', false); return; }
  if (guesses.length < SHOP_OPENS_AFTER) { lockTip(btn, '<strong>Make your first guess to open the Clue Shop.</strong> Then trade spare guesses for clue cards.', false); return; }
  hideLockTip(); SHOP.open = true; SHOP.seen = true; SHOP.confirm = null; updateShopButton(); renderShopModal();
});

// ---------- the shop window ----------
const SHOP_ART = {
  nature: '<svg viewBox="0 0 200 110" preserveAspectRatio="none"><g fill="#e0b225" fill-opacity=".7">' + [20, 30, 46, 60, 70, 74, 72, 62, 48, 34, 22, 16].map((h, i) => '<rect x="' + (8 + i * 8) + '" y="' + (70 - h * 0.8) + '" width="6" height="' + (h * 0.8) + '"/>').join('') + '</g><g fill="#5ab88a" fill-opacity=".7">' + [44, 42, 40, 36, 32, 30, 30, 31, 34, 38, 42, 44].map((h, i) => '<rect x="' + (108 + i * 7.5) + '" y="' + (70 - h) + '" width="5.5" height="' + h + '"/>').join('') + '</g><rect x="8" y="84" width="90" height="7" rx="3" fill="#4a90c4" fill-opacity=".6"/><rect x="108" y="80" width="40" height="5" rx="2" fill="#9c8b74"/><rect x="108" y="88" width="70" height="5" rx="2" fill="#9c8b74"/><rect x="108" y="96" width="55" height="5" rx="2" fill="#9c8b74"/></svg>',
  under: '<svg viewBox="0 0 200 110" preserveAspectRatio="none"><g fill="#f0efeb" stroke="#d6d3cc">' + [0, 1, 2, 3, 4, 5, 6, 7].map(i => '<rect x="' + (10 + (i % 4) * 46) + '" y="' + (12 + Math.floor(i / 4) * 30) + '" width="40" height="24" rx="4"/>').join('') + '</g><rect x="10" y="12" width="40" height="24" rx="4" fill="#eef0f3" stroke="#5b6573" stroke-width="2"/><rect x="148" y="42" width="40" height="24" rx="4" fill="#eef0f3" stroke="#5b6573" stroke-width="2"/><rect x="10" y="84" width="180" height="10" rx="3" fill="#eeede9"/><rect x="10" y="84" width="60" height="10" rx="3" fill="#5b6573" fill-opacity=".6"/></svg>',
  trade: '<svg viewBox="0 0 200 110" preserveAspectRatio="none"><path d="M0 18 C80 18 80 46 100 46 L100 64 C80 64 80 38 0 38Z" fill="#d9773f" fill-opacity=".55"/><path d="M0 46 C80 46 80 64 100 64 L100 78 C80 78 80 60 0 60Z" fill="#6b4a2b" fill-opacity=".55"/><path d="M0 70 C80 70 80 78 100 78 L100 86 C80 86 80 80 0 80Z" fill="#3f86b8" fill-opacity=".55"/><path d="M108 50 C130 50 140 30 200 30 L200 44 C140 44 130 60 108 60Z" fill="#b07a3c" fill-opacity=".55"/><rect x="98" y="40" width="12" height="50" rx="3" fill="#1a1a1a"/></svg>',
  market: '<svg viewBox="0 0 200 110" preserveAspectRatio="none"><rect x="98" y="8" width="2" height="94" fill="#cfcdc7"/><rect x="40" y="14" width="58" height="10" rx="2" fill="#e0218a" fill-opacity=".55"/><rect x="100" y="14" width="14" height="10" rx="2" fill="#3f3cbb" fill-opacity=".55"/><rect x="62" y="36" width="36" height="10" rx="2" fill="#e0218a" fill-opacity=".55"/><rect x="100" y="36" width="52" height="10" rx="2" fill="#3f3cbb" fill-opacity=".55"/><rect x="80" y="58" width="18" height="10" rx="2" fill="#e0218a" fill-opacity=".55"/><rect x="100" y="58" width="44" height="10" rx="2" fill="#3f3cbb" fill-opacity=".55"/><path d="M10 96 C40 92 50 104 80 100 C110 96 140 84 190 90" fill="none" stroke="#d9773f" stroke-width="3"/></svg>',
  people: '<svg viewBox="0 0 200 110" preserveAspectRatio="none"><g fill="#4a4a46"><path d="M10 40 l12 -10 l12 10 v14 h-24z"/><path d="M40 40 l12 -10 l12 10 v14 h-24z"/><path d="M70 40 l12 -10 l12 10 v14 h-24z"/></g><g fill="#d6d4cf"><path d="M100 40 l12 -10 l12 10 v14 h-24z"/></g><rect x="130" y="30" width="60" height="8" rx="4" fill="url(#pvt)"/><defs><linearGradient id="pvt"><stop offset="0" stop-color="#4a90c4"/><stop offset="1" stop-color="#d9773f"/></linearGradient></defs><rect x="12" y="74" width="176" height="7" rx="3" fill="#eeede9"/><rect x="12" y="74" width="120" height="7" rx="3" fill="#8a8a86"/><rect x="12" y="90" width="176" height="7" rx="3" fill="#eeede9"/><rect x="12" y="90" width="70" height="7" rx="3" fill="#8a8a86"/></svg>'
};
function batteryHTML(left, lose = 0) {
  const keep = left - lose, tone = keep >= 4 ? 'is-high' : keep >= 2 ? 'is-mid' : 'is-low';
  return '<span class="battery" aria-hidden="true"><span class="battery-body">'
    + Array.from({ length: MAX_GUESSES }, (_, i) => '<span class="battery-cell' + (i < keep ? ' is-on ' + (lose ? tone : (left >= 4 ? 'is-high' : left >= 2 ? 'is-mid' : 'is-low')) : i < left ? ' is-lose' : '') + '"></span>').join('')
    + '</span><span class="battery-cap"></span></span>';
}
function renderShopModal() {
  let m = document.getElementById('shop-modal');
  if (!SHOP.open) { if (m) m.remove(); return; }
  if (!m) { m = document.createElement('div'); m.id = 'shop-modal'; m.className = 'sh-modal'; document.body.appendChild(m); }
  const left = MAX_GUESSES - cellsUsed(), locked = guesses.length < SHOP_OPENS_AFTER;
  const tiles = SHOP.cards().map(c => {
    const st = shopState(c);
    const btn = st === 'owned' ? 'Opened' : st === 'locked' ? 'After your 1st guess' : st === 'broke' ? 'Needs ' + (c.cost + 1) + ' left' : 'Buy';
    return '<article class="sh-card is-' + st + '"><div class="sh-preview"><div class="sh-art" aria-hidden="true">' + SHOP_ART[c.k] + '</div>'
      + (st === 'locked' || st === 'broke' ? '<span class="sh-lock"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2"/></svg></span>' : '')
      + '</div>'
      + '<div class="sh-body"><span class="sh-name">' + c.name + '</span><span class="sh-desc">' + c.desc + '</span><span class="sh-src">' + c.src + '</span></div>'
      + '<div class="sh-foot"><span class="sh-price">' + cellsHTML(c.cost) + guessWord(c.cost) + '</span>'
      + '<button type="button" class="sh-buy" data-k="' + c.k + '"' + (st === 'buy' ? '' : ' disabled') + '>' + btn + '</button></div></article>';
  }).join('');
  const cc = SHOP.confirm && SHOP_CARDS.find(c => c.k === SHOP.confirm);
  m.innerHTML = '<div class="sh-backdrop" data-close="1"></div>'
    + '<div class="sh-box" role="dialog" aria-modal="true" aria-label="Clue Shop">'
    + '<div class="sh-head"><span class="sh-sign" aria-hidden="true">' + SHOP_ICON.replace('class="shop-ico"', 'style="--awn:#f5c842;color:#1a1a1a"') + '</span>'
    + '<span class="sh-titles"><span class="sh-title">Clue Shop</span><span class="sh-sub">Trade guesses for clue cards · <button type="button" class="sh-how" data-how="1">How it works</button></span></span>'
    + '<button type="button" class="hub-close" data-close="1" aria-label="Close">×</button></div>'
    + '<div class="sh-wallet">' + batteryHTML(left) + '<span class="sh-wallet-txt"><strong>' + left + '</strong> guess' + (left === 1 ? '' : 'es') + ' left · your last guess can never be spent · opened cards appear under the charts</span></div>'
    + '<div class="sh-grid">' + tiles + '</div>'
    + '<p class="sh-note">' + (locked ? 'Have a look now: cards open after your first guess.' : 'Every card you skip is revealed for free once the game is over.') + '</p>'
    + (cc ? '<div class="sh-confirm" role="alertdialog" aria-modal="true" aria-label="Confirm purchase"><div class="sh-cbox">'
      + '<span class="sh-ctitle">Open “' + cc.name + '”?</span>'
      + '<span class="sh-ctext">It costs <strong>' + guessWord(cc.cost) + '</strong>. You’ll have <strong>' + (left - cc.cost) + '</strong> left to find the country. If its sources have nothing on today’s country, it’s free and opens empty.</span>'
      + '<span class="sh-cbat">' + batteryHTML(left, cc.cost) + '</span>'
      + '<div class="sh-cbtns"><button type="button" class="sh-cbtn" data-cancel="1">Keep my guesses</button><button type="button" class="sh-cbtn sh-cbtn--dark" data-confirm="1">Open for ' + guessWord(cc.cost) + '</button></div>'
      + '</div></div>' : '')
    + '</div>';
  const focus = m.querySelector(cc ? '[data-confirm]' : '.sh-buy:not([disabled])') || m.querySelector('.hub-close');
  if (focus) focus.focus({ preventScroll: true });
}
function closeShopModal() { SHOP.open = false; SHOP.confirm = null; const m = document.getElementById('shop-modal'); if (m) m.remove(); }
document.addEventListener('click', e => {
  const m = e.target.closest('#shop-modal'); if (!m) return;
  if (e.target.closest('[data-close]')) { closeShopModal(); return; }
  if (e.target.closest('[data-how]')) { closeShopModal(); showShopIntro(); return; }
  const buy = e.target.closest('.sh-buy');
  if (buy && !buy.disabled) { SHOP.confirm = buy.dataset.k; renderShopModal(); return; }
  if (e.target.closest('[data-cancel]')) { SHOP.confirm = null; renderShopModal(); return; }
  if (e.target.closest('[data-confirm]')) buyCard(SHOP.confirm);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && SHOP.open) { if (SHOP.confirm) { SHOP.confirm = null; renderShopModal(); } else closeShopModal(); } });

function addCardLogRow(c, cost, animate = true) {
  if (!cost) {                       // no data for today's country: free, and the log says so
    const row = document.createElement('div'); row.className = 'sp-logrow sp-logrow--free' + (animate && !REDUCED_MOTION ? ' gr-anim' : '');
    row.innerHTML = '<span class="sp-lognum">·</span><span>Opened <strong>' + c.name + '</strong>: no data for this country</span><span class="sp-logcost">free</span>';
    const list = document.getElementById('guesses'); if (list) list.insertBefore(row, list.firstChild);
    return;
  }
  const step0 = cellsUsed() - cost;
  const lbl = cost === 1 ? String(step0 + 1) : (step0 + 1) + '–' + (step0 + cost);
  const row = document.createElement('div'); row.className = 'sp-logrow' + (animate && !REDUCED_MOTION ? ' gr-anim' : '');
  row.innerHTML = '<span class="sp-lognum">' + lbl + '</span>' + cellsHTML(cost, 'sp-cell sp-cell--log') + '<span>Opened <strong>' + c.name + '</strong></span><span class="sp-logcost">' + guessWord(cost) + '</span>';
  const list = document.getElementById('guesses'); if (list) list.insertBefore(row, list.firstChild);
}
function buyCard(k) {
  const c = SHOP_CARDS.find(x => x.k === k);
  if (!c || !SHOP.on() || shopState(c) !== 'buy') return;
  const cost = cardHasData(k) ? c.cost : 0;          // no data: the guesses are not taken
  SHOP.events.push({ t: 'c', k, cost }); SHOP.justBought = k;
  closeShopModal();
  renderLives(cost > 0);
  addCardLogRow(c, cost);
  saveDailyState();
  renderClueCards();
  const card = document.querySelector('#clue-cards .is-new');
  if (card && card.scrollIntoView) card.scrollIntoView({ behavior: REDUCED_MOTION ? 'auto' : 'smooth', block: 'nearest' });
  // the cards and guesses share the six cells: a purchase can never end the game (the last guess is never for sale)
}

// ---------- clue cards under the charts ----------
let CARD_SCOPE = null, CARD_SCOPE_ISO = null;
// stand-in figures for the parts a country has no data for: they are only ever drawn as an empty card
const CARD_BLANK = { sun: Array(12).fill(0), wind: Array(12).fill(0), rain: 0, flow: 0, terr: [[0, 0], [1, 0]], elevMean: 0,
  fossil: { oil: [0, null, null], gas: [0, null, null], coal: [0, null, null] }, minerals: {}, rents: { oil: 0, gas: 0, coal: 0, min: 0 },
  access: [0, 0], cook: 0, cuts: null, cold: 0, hot: 0, coldM: 'Jan', hotM: 'Jul', hdd: 0, cdd: 0, urban: 0, gdp: 0, industry: 0 };
function cardScope() {
  const e = Object.assign({}, CARD_BLANK, shopEntry() || {});
  const v3 = cardsV3Vals({ C: e, scene: 'two' });
  const info = ALL_DATA[target.name], yd = (info && info.years[info.latestYear]) || {};
  const v2 = shopV2Vals({ europe: true, IN: (e.trade || {}).IN, OUT: (e.trade || {}).OUT, NB: (e.elec || {}).NB || [], demand: yd.Demand });
  const r = Object.assign({}, v3);
  ['buyTot', 'sellTot', 'buyVals', 'sellVals', 'nbImp', 'nbExp', 'grossTot', 'grossShare', 'tradeBands', 'tradeLeft', 'tradeRight', 'fuelKey',
   'hubY', 'hubH', 'hubPos', 'hubLPos', 'tradeAria', 'neighbours', 'dayPts', 'dayArea', 'avgLine'].forEach(k => { r[k] = v2[k]; });
  r.tradeYear = (e.trade || {}).year || '';
  r.elecYear = (e.elec || {}).year || '';
  r.noNeighbours = !((e.elec || {}).NB || []).some(n => n[2] + n[3] > 0);
  return r;
}
function renderClueCards() {
  const host = document.getElementById('clue-cards'); if (!host) return;
  if (!SHOP.on()) { host.innerHTML = ''; return; }
  if (CARD_SCOPE_ISO !== target.iso3) {
    try { CARD_SCOPE = cardScope(); CARD_SCOPE_ISO = target.iso3; } catch (err) { console.error('clue cards', err); host.innerHTML = ''; return; }
  }
  const owned = SHOP.owned(), all = SHOP.cards();
  const shown = all.filter(c => gameOver || owned.includes(c.k));
  if (!shown.length) { host.innerHTML = ''; return; }
  // keep the guesses where they are on screen while cards appear above them (no jolt at the end of a game)
  const anchor = document.getElementById('guess-head'), before = anchor ? anchor.getBoundingClientRect().top : null;
  const html = shown.map(c => {
    const have = owned.includes(c.k), cost = (SHOP.events.find(e => e.t === 'c' && e.k === c.k) || c).cost;
    if (!cardHasData(c.k)) return emptyCardHTML(c, have);
    const o = { cls: 'ic-card v3-card' + (c.full ? ' is-full' : ' is-half') + (have ? '' : ' is-unused') + (have && c.k === SHOP.justBought ? ' is-new' : ''),
      tagCls: have ? 'ic-cost' : 'ic-cost ic-cost--unused ic-cost--icon', tag: have ? 'Bought for ' + guessWord(cost) : '',
      tagTitle: have ? '' : 'Not opened: revealed after the game',
      cells: have ? Array.from({ length: cost }, () => ({})) : [] };
    try { return tplRender(c.k, Object.assign(Object.create(CARD_SCOPE), { o })); } catch (err) { console.error('card ' + c.k, err); return ''; }
  }).join('');
  const nOwned = owned.length, nOther = all.length - nOwned;
  const sub = gameOver ? (nOwned ? 'You opened ' + nOwned + (nOther ? ' · the other ' + nOther + ' are revealed too' : '') : 'You played without any: here is what they held')
    : nOwned + ' opened';
  host.innerHTML = '<div class="ic-sechead"><span class="section-title">Clue cards</span><span class="ic-secsub">' + sub + '</span></div><div class="ic-slot">' + html + '</div>';
  packCards(host);
  if (anchor && before !== null && !SHOP.justBought) { const d = anchor.getBoundingClientRect().top - before; if (Math.abs(d) > 1) window.scrollBy(0, d); }
  SHOP.justBought = null;
}
// a card with no data for today's country: unmistakably empty
function emptyCardHTML(c, have) {
  const isNew = have && c.k === SHOP.justBought;
  return '<section class="ic-card v3-card is-half is-empty' + (have ? '' : ' is-unused') + (isNew ? ' is-new' : '') + '">'
    + '<div class="ic-head"><span class="ic-title"><span class="ic-ico" aria-hidden="true"></span>' + c.name + '</span>'
    + '<span class="ic-cost ic-cost--free">' + (have ? 'No data · free' : 'No data') + '</span></div>'
    + '<div class="ic-none"><svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M6 18L18 6" stroke="currentColor" stroke-width="1.8"/></svg>'
    + '<strong>No data for this country</strong><span>Sources checked: ' + c.src + '.' + (have ? ' No guess was spent.' : '') + '</span></div></section>';
}
// pack the half-width cards into two columns of nearly equal height; Fuel Trade (full width) goes underneath.
// A lone half-width card takes the full row. Phones: one column.
function packCards(host) {
  const slot = host.querySelector('.ic-slot'); if (!slot) return;
  const cards = [...slot.children];
  const halves = cards.filter(c => c.classList.contains('is-half')), fulls = cards.filter(c => c.classList.contains('is-full'));
  if (halves.length === 1) { halves[0].classList.replace('is-half', 'is-full'); slot.appendChild(halves[0]); fulls.forEach(f => slot.appendChild(f)); return; }
  if (halves.length < 2 || window.matchMedia('(max-width: 600px)').matches) return;
  const h = new Map(halves.map(c => [c, c.getBoundingClientRect().height]));
  const cols = [[], []], tot = [0, 0];
  [...halves].sort((a, b) => h.get(b) - h.get(a)).forEach(c => { const i = tot[0] <= tot[1] ? 0 : 1; cols[i].push(c); tot[i] += h.get(c) + 12; });
  cols.forEach(col => col.sort((a, b) => cards.indexOf(a) - cards.indexOf(b)));
  if (tot[1] > tot[0]) cols.reverse();            // the taller column on the left
  const wrap = document.createElement('div'); wrap.className = 'ic-cols';
  cols.forEach(col => { const d = document.createElement('div'); d.className = 'ic-col'; col.forEach(c => d.appendChild(c)); wrap.appendChild(d); });
  slot.textContent = ''; slot.appendChild(wrap); fulls.forEach(f => slot.appendChild(f));
}
let packTimer = null;
window.addEventListener('resize', () => { clearTimeout(packTimer); packTimer = setTimeout(() => { if (SHOP.on()) renderClueCards(); }, 200); });

// legends: hover (or tap) an entry to pick out its part of the chart, and its numbers
function hlSet(card, key) {
  if (!card) return;
  card.querySelectorAll('.is-hl').forEach(el => el.classList.remove('is-hl'));
  card.classList.remove('hl-on', 'hl-world');
  card.querySelectorAll('[data-hl].is-act').forEach(el => el.classList.remove('is-act'));
  card.querySelectorAll('.is-swapped').forEach(t => { t.textContent = t.dataset.orig; delete t.dataset.orig; t.classList.remove('is-swapped'); });
  card.querySelectorAll('.hl-lgdim').forEach(el => el.classList.remove('hl-lgdim'));
  if (!key) return;
  if (key === 'world:all') { card.classList.add('hl-world'); return; }
  const group = key.split(':')[0];
  card.classList.add('hl-on');
  card.querySelectorAll('[data-hl-target^="' + group + ':"]').forEach(el => { el.classList.add('hl-dim'); if (el.getAttribute('data-hl-target') === key) el.classList.add('is-hl'); });
  card.querySelectorAll('[data-hl="' + key + '"]').forEach(el => el.classList.add('is-act'));
  card.querySelectorAll('[data-hl^="' + group + ':"]').forEach(el => { if (!el.classList.contains('is-act')) el.classList.add('hl-lgdim'); });
  card.querySelectorAll('[data-hl-any]').forEach(el => {
    const list = (el.getAttribute('data-hl-any') || '').split(' ');
    if (!list.some(x => x.startsWith(group + ':'))) return;
    el.classList.add('hl-dim'); if (list.includes(key)) el.classList.add('is-hl');
  });
  card.querySelectorAll('[data-vals]').forEach(el => {
    let vals; try { vals = JSON.parse(el.getAttribute('data-vals') || 'null'); } catch (e) { vals = null; }
    if (!vals || !(key in vals)) return;
    const t = el.querySelector('.ft-val') || el;
    if (t.dataset.orig === undefined) t.dataset.orig = t.textContent;
    t.textContent = vals[key]; t.classList.add('is-swapped');
  });
}
['mouseover', 'focusin'].forEach(ev => document.addEventListener(ev, e => {
  const lg = e.target.closest && e.target.closest('#clue-cards [data-hl]'); if (!lg) return;
  hlSet(lg.closest('.ic-card'), lg.getAttribute('data-hl'));
}));
['mouseout', 'focusout'].forEach(ev => document.addEventListener(ev, e => {
  const lg = e.target.closest && e.target.closest('#clue-cards [data-hl]'); if (!lg) return;
  if (e.relatedTarget && lg.contains(e.relatedTarget)) return;
  const card = lg.closest('.ic-card'); hlSet(card, null); card.querySelectorAll('.hl-dim').forEach(el => el.classList.remove('hl-dim'));
}));

// ---------- share: a 💡 for every guess spent on a card ----------
function shopShareSquares() {
  if (!SHOP.cardCells()) return null;
  return SHOP.events.map(e => e.t === 'c' ? '💡'.repeat(e.cost) : shareSquare(e.c)).join('');
}

// ---------- the distance chart with clue cards on it (result card, stats) ----------
function shopPathHTML(won, mini, animate) {
  const items = []; let cell = 0;
  SHOP.events.forEach(e => {
    if (e.t === 'c' && !e.cost) return;              // a free (empty) card took no step
    if (e.t === 'c') { const c = SHOP_CARDS.find(x => x.k === e.k); items.push({ card: c, cost: e.cost, c0: cell, c1: cell + e.cost - 1 }); cell += e.cost; }
    else { items.push({ c: e.c, isAns: e.c.iso3 === target.iso3, h: e.c.iso3 === target.iso3 ? null : guessInfo(e.c), c0: cell, c1: cell }); cell += 1; }
  });
  const N = cell;
  const kmList = items.filter(p => p.c && !p.isAns).map(p => Math.max(1, p.h.km));
  const levelOf = distanceLevelFn(kmList.length ? kmList : [1000], won ? 0.22 : 0.36);
  let prevY = 0.6;
  items.forEach(p => {
    p.x = N > 1 ? ((p.c0 + p.c1) / 2) / (N - 1) : 0.5;
    if (p.card) p.y = prevY;
    else { p.y = p.isAns ? 0 : levelOf(Math.max(1, p.h.km)); prevY = p.y; }
    p.col = p.isAns ? WIN_RGB : p.card ? null : closeRGB(p.h.prox);
  });
  const RUN = Math.min(1.6, 0.4 + 0.3 * Math.max(0, N - 1)), START = 0.35;
  const at = p => START + RUN * p.x;
  const X = p => (p.x * 100).toFixed(2), Y = p => ((1 - p.y) * 100).toFixed(2);
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
  if (items.length > 1) {
    const segs = items.map((p, i) => p.card && i > 0 ? '<line class="cp-seg" x1="' + X(items[i - 1]) + '" y1="' + Y(p) + '" x2="' + X(p) + '" y2="' + Y(p) + '"/>' : '').join('');
    svg = '<div class="dc-reveal" style="--dur:' + RUN.toFixed(2) + 's;--at:' + START + 's;--end:100%">'
      + '<svg class="dc-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">'
      + '<polyline class="dc-line" points="' + items.map(p => X(p) + ',' + Y(p)).join(' ') + '"/>' + segs + '</svg></div>';
  }
  let drop = '';
  const lastG = items.filter(p => p.c && !p.isAns).pop();
  if (!won && lastG) {
    drop = '<svg class="dc-svg dc-dropsvg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" style="--at:' + (START + RUN).toFixed(2) + 's">'
      + '<line class="dc-drop" x1="' + X(lastG) + '" y1="' + Y(lastG) + '" x2="' + X(lastG) + '" y2="100"/></svg>'
      + (mini ? '' : '<span class="dc-droplbl" style="left:' + X(lastG) + '%;top:' + ((1 - lastG.y / 2) * 100).toFixed(2) + '%;--at:' + (START + RUN).toFixed(2) + 's">'
        + chartNum(lastG.h.km) + '<span class="u-long"> km</span></span>');
  }
  const CARD_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2.5" fill="#fff" stroke="#b08a2a" stroke-width="1.8"/><path d="M8.5 8h7M8.5 11.5h7M8.5 15h4" stroke="#b08a2a" stroke-width="1.6" stroke-linecap="round"/></svg>';
  const nodes = items.map(p => {
    const pos = 'left:' + X(p) + '%;top:' + Y(p) + '%';
    if (p.card) return '<span class="dc-node" style="' + pos + '"><span class="cp-card" style="--at:' + at(p).toFixed(2) + 's" title="' + escHtml(p.card.name + ', ' + guessWord(p.cost)) + '">' + CARD_ICON + '</span></span>';
    const title = p.isAns ? p.c.name + ', the answer' : p.c.name + ', ' + chartKm(p.h.km) + ' away (' + p.h.prox + '% close)';
    return '<span class="dc-node" style="' + pos + '"><span class="go-node' + (p.isAns ? ' go-node--answer' : '') + '" style="--cl:' + p.col.join(',') + ';--at:' + at(p).toFixed(2) + 's" title="' + escHtml(title) + '">'
      + '<span class="go-ring">' + flagImg(p.c.iso3, 'go-flag') + '</span>'
      + (p.isAns && !mini ? '<span class="go-badge" aria-hidden="true">✓</span><span class="go-burst" aria-hidden="true"></span>' : '') + '</span></span>';
  }).join('');
  let labels = '', xs = '';
  if (!mini) {
    labels = items.map((p, i) => {
      if (p.card) return '<span class="cp-lbl" style="left:' + X(p) + '%;top:' + Y(p) + '%">' + escHtml(p.card.name) + '</span>';
      if (p.isAns || (!won && p === lastG)) return '';
      return '<span class="dc-lbl dc-lbl--' + (i === 0 && items.length > 1 ? 'l' : 'c') + '" style="left:' + X(p) + '%;top:' + Y(p) + '%;--at:' + at(p).toFixed(2) + 's">' + chartNum(p.h.km) + '<span class="u-long"> km</span></span>';
    }).join('');
    xs = '<div class="dc-x">' + items.map(p => p.isAns
      ? '<span class="dc-x-ans" style="left:' + X(p) + '%;color:#2f7a4d">' + escHtml(p.c.name) + '</span>'
      : '<span' + (p.card ? ' class="cp-x"' : '') + ' style="left:' + X(p) + '%">' + (p.c0 === p.c1 ? p.c0 + 1 : (p.c0 + 1) + '–' + (p.c1 + 1)) + '</span>').join('') + '</div>';
  }
  const label = 'Distance to the answer, step by step: ' + items.map(p => p.card ? p.card.name + ' (clue card)' : p.isAns ? 'the answer' : chartKm(p.h.km)).join(', ')
    + (won ? '' : '. Today’s country was ' + target.name);
  const key = !mini ? '<div class="cp-key"><span><span class="cp-card cp-card--key" aria-hidden="true"><svg viewBox="0 0 24 24" width="12" height="12"><rect x="5" y="3" width="14" height="18" rx="2.5" fill="#fff" stroke="#b08a2a" stroke-width="2"/></svg></span>clue card: the guesses it cost, no new distance</span></div>' : '';
  return { html: '<div class="dc cp-dc' + (mini ? ' dc--mini' : '') + (items.length === 1 ? ' dc--one' : '') + (won ? '' : ' dc--lost') + (animate && !REDUCED_MOTION ? ' go-anim' : '') + '" role="img" aria-label="' + escHtml(label) + '">'
      + '<div class="dc-plot">' + grid + '<div class="dc-in">' + svg + drop + nodes + labels + '</div></div>' + xs + '</div>' + key,
    doneAt: START + RUN + 0.2 };
}

// ---------- usage, for setting prices: anonymous running totals per day and card (record_cards) ----------
async function recordCardsOnce(won) {
  if (!SHOP.on() || SHOP.sent) return;
  SHOP.sent = true;
  let g = 0; const cards = [], costs = [], steps = [];
  SHOP.events.forEach(e => { if (e.t === 'g') g++; else if (e.cost) { cards.push(e.k); costs.push(e.cost); steps.push(g); } });
  try {
    const res = await fetch(SUPABASE_URL + '/rest/v1/rpc/record_cards', {
      method: 'POST', headers: SB_HEADERS,
      body: JSON.stringify({ p_day: getDayNumber(), p_cards: cards, p_costs: costs, p_steps: steps, p_won: !!won, p_guesses: guesses.length, p_opened: SHOP.seen || cards.length > 0 })
    });
    if (!res.ok) SHOP.sent = false;
  } catch (e) { SHOP.sent = false; }
  saveDailyState();
}

// ============================================================
//  LAUNCH-WEEK INTRO: four short steps on the shop, shown once per device during the 7 days
//  from SHOP_LAUNCH_DAY (and any time from "How it works" in the shop). Skippable at every step.
// ============================================================
const LS_SHOP_INTRO = 'energle_shop_intro_v1';
function maybeShowShopIntro() {
  if (!SHOP.on() || SHOP_LAUNCH_DAY == null) return;
  const d = getDayNumber();
  if (d < SHOP_LAUNCH_DAY || d > SHOP_LAUNCH_DAY + 6) return;
  try { if (localStorage.getItem(LS_SHOP_INTRO)) return; } catch (e) { return; }
  // wait for any other "What's new" window to close first
  let tries = 0;
  const go = () => { if (document.getElementById('notice-modal') || document.getElementById('username-modal')) { if (++tries < 120) setTimeout(go, 500); return; } showShopIntro(); };
  setTimeout(go, REDUCED_MOTION ? 0 : 900);
}
function shopIntroSteps() {
  const cell = cls => '<span class="battery-cell ' + cls + '"></span>';
  const bat = '<span class="battery si-bat" aria-hidden="true"><span class="battery-body">' + cell('is-on is-high') + cell('is-on is-high') + cell('is-on is-high') + cell('is-on is-high') + cell('si-card') + cell('si-used') + '</span><span class="battery-cap"></span></span>';
  const tiles = SHOP_CARDS.map(c => '<span class="si-tile"><span class="si-art" aria-hidden="true">' + SHOP_ART[c.k] + '</span><span class="si-name">' + c.name + '</span><span class="si-cost">' + cellsHTML(c.cost) + guessWord(c.cost) + '</span></span>').join('');
  return [
    { art: '<span class="si-sign" aria-hidden="true">' + SHOP_ICON.replace('class="shop-ico"', 'class="si-shop" style="--awn:#f5c842;color:#1a1a1a"') + '</span>',
      title: 'New: the Clue Shop', text: 'Stuck after a guess? Next to the Guess button you’ll now find the Clue Shop: it trades spare guesses for clue cards about today’s country.' },
    { art: bat,
      title: 'You pay with guesses', text: 'Each card costs 1 cell of your battery. The shop opens after your first guess, and your last guess can never be spent, so you always get a final try.' },
    { art: '<span class="si-tiles">' + tiles + '</span>',
      title: 'Five cards, five angles', text: 'From sun and wind to what lies underground, who it trades with and how people live. Each card is drawn from open data and shows its source. If the sources have nothing on today’s country, the card is free and opens empty.' },
    { art: '<span class="si-share" aria-hidden="true">🟥🟨💡🟩</span>',
      title: 'Every card counts', text: 'Cards count in your score like guesses, and show as 💡 when you share. Skip them and they’re all revealed for free once the game is over.' }
  ];
}
function showShopIntro() {
  if (document.getElementById('shop-intro')) return;
  try { localStorage.setItem(LS_SHOP_INTRO, '1'); } catch (e) {}
  const steps = shopIntroSteps(); let i = 0;
  const modal = document.createElement('div'); modal.id = 'shop-intro';
  const draw = () => {
    const s = steps[i], last = i === steps.length - 1;
    modal.innerHTML = '<div class="st-backdrop" data-si-skip="1"></div>'
      + '<div class="nt-box si-box" role="dialog" aria-modal="true" aria-labelledby="si-title">'
      + '<div class="si-top"><span class="nt-eyebrow">What’s new · ' + (i + 1) + ' of ' + steps.length + '</span>'
      + (last ? '' : '<button type="button" class="si-skip" data-si-skip="1">Skip</button>') + '</div>'
      + '<div class="si-art-wrap' + (i === 0 && !REDUCED_MOTION ? ' is-jolt' : '') + '">' + s.art + '</div>'
      + '<h2 class="nt-title" id="si-title">' + s.title + '</h2><p>' + s.text + '</p>'
      + '<div class="si-foot"><span class="si-dots" aria-hidden="true">' + steps.map((x, k) => '<span class="si-dot' + (k === i ? ' is-on' : '') + '"></span>').join('') + '</span>'
      + '<span class="si-btns">' + (i ? '<button type="button" class="si-back" data-si-back="1">Back</button>' : '')
      + '<button type="button" class="nt-btn si-next" data-si-next="1">' + (last ? 'Start playing' : 'Next') + '</button></span></div></div>';
    const b = modal.querySelector('[data-si-next]'); if (b) b.focus({ preventScroll: true });
  };
  const close = () => { modal.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight' && i < steps.length - 1) { i++; draw(); }
    else if (e.key === 'ArrowLeft' && i > 0) { i--; draw(); }
  };
  modal.addEventListener('click', e => {
    if (e.target.closest('[data-si-skip]')) { close(); return; }
    if (e.target.closest('[data-si-back]')) { i = Math.max(0, i - 1); draw(); return; }
    if (e.target.closest('[data-si-next]')) { if (i < steps.length - 1) { i++; draw(); } else close(); }
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(modal);
  draw();
}
