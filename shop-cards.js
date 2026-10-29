// ============================================================
//  CLUE CARDS: templates and figure builders (generated from the card designs; edit here from now on)
//  CARD_TPL: one template per card ({{path}}, <sc-for>, <sc-if>), filled by tplRender() in shop.js.
//  cardsV3Vals({ C }): Renewables Potential, Underground Riches, People & Power from one country's cards.json entry.
//  shopV2Vals({ IN, OUT, NB, demand }): Fuel Trade and Electricity Trade.
//  World averages are still written in here; they move to cards.json "world" once the pipeline computes them.
// ============================================================
const CARD_TPL = {
 "nature": "<section class=\"{{o.cls}}\">\n            <div class=\"ic-head\">\n              <span class=\"ic-title\"><span class=\"ic-ico\" aria-hidden=\"true\"></span>Renewables Potential</span>\n              <span class=\"v3-headr\"><span class=\"v3-key\" data-hl=\"world:all\" tabindex=\"0\"><span class=\"v3-tick\" aria-hidden=\"true\"></span>world average</span><span class=\"{{o.tagCls}}\" title=\"{{o.tagTitle}}\"><sc-for list=\"{{o.cells}}\" as=\"cc\" hint-placeholder-count=\"0\"><span class=\"sp-cell\"></span></sc-for>{{o.tag}}</span></span>\n            </div>\n            <div class=\"nv-grid\">\n              <sc-for list=\"{{skies}}\" as=\"s\" hint-placeholder-count=\"2\">\n                <div class=\"v3-tile\">\n                  <span class=\"ec-h\">{{s.label}}</span>\n                  <span class=\"v3-hval v3-hval--line\">{{s.pre}}<strong>{{s.val}}</strong> {{s.unit}}</span>\n                  <span class=\"v3-wline\"><span class=\"v3-dash\" aria-hidden=\"true\"></span>{{s.wtxt}}</span>\n                  <div class=\"mb-plot\" role=\"img\" aria-label=\"{{s.aria}}\">\n                    <sc-for list=\"{{s.bars}}\" as=\"m\" hint-placeholder-count=\"12\">\n                      <span class=\"mb-col\"><span class=\"mb-bar\" style=\"{{m.style}}\"></span><span class=\"mb-m\">{{m.m}}</span></span>\n                    </sc-for>\n                    <span class=\"mb-world\" style=\"{{s.wl}}\"></span>\n                  </div>\n                  <sc-for list=\"{{s.facts}}\" as=\"f\" hint-placeholder-count=\"0\"><span class=\"v3-fact\">{{f.k}} <strong>{{f.v}}</strong></span></sc-for>\n                </div>\n              </sc-for>\n\n              <div class=\"v3-tile nv-wide\">\n                <span class=\"ec-h\">Water</span>\n                <div class=\"dd-rows wt-rows\">\n                  <sc-for list=\"{{water}}\" as=\"w\" hint-placeholder-count=\"2\">\n                    <div class=\"dd-row wt-row\" title=\"{{w.title}}\"><span class=\"dd-l\">{{w.label}}</span><span class=\"dd-track\"><span class=\"dd-fill\" style=\"{{w.fill}}\"></span><span class=\"ne-mark\" style=\"{{w.mark}}\"></span></span><span class=\"dd-v\">{{w.val}} <span class=\"wt-u\">{{w.unit}}</span></span></div>\n                  </sc-for>\n                </div>\n              </div>\n\n              <div class=\"v3-tile nv-wide\">\n                <div class=\"v3-hv v3-hv--top\"><span class=\"ec-h\">Elevation</span>\n                  <span class=\"v3-hright\"><span class=\"v3-hval\">average <strong>{{terrMean}}</strong></span><span class=\"v3-wline\"><span class=\"v3-tick\" aria-hidden=\"true\"></span>world average {{terrWorld}}</span></span></div>\n                <div class=\"ds-rows\" role=\"img\" aria-label=\"{{terrAria}}\" title=\"Share of its land in each height band; ticks show the world\">\n                  <sc-for list=\"{{terrBins}}\" as=\"d\" hint-placeholder-count=\"6\">\n                    <span class=\"ds-row\"><span class=\"ds-x\">{{d.lbl}}</span><span class=\"ds-track\"><span class=\"ds-bar\" style=\"{{d.style}}\"></span><span class=\"ne-mark\" style=\"{{d.world}}\"></span></span><span class=\"ds-v\">{{d.txt}}</span></span>\n                  </sc-for>\n                </div>\n              </div>\n            </div>\n            <span class=\"ic-src\">Source: NASA POWER · NOAA ETOPO · World Bank</span>\n          </section>",
 "under": "<section class=\"{{o.cls}}\">\n            <div class=\"ic-head\">\n              <span class=\"ic-title\"><span class=\"ic-ico\" aria-hidden=\"true\"></span>Underground Riches</span>\n              <span class=\"v3-headr\"><span class=\"v3-key\" data-hl=\"world:all\" tabindex=\"0\"><span class=\"v3-tick\" aria-hidden=\"true\"></span>world average</span><span class=\"{{o.tagCls}}\" title=\"{{o.tagTitle}}\"><sc-for list=\"{{o.cells}}\" as=\"cc\" hint-placeholder-count=\"0\"><span class=\"sp-cell\"></span></sc-for>{{o.tag}}</span></span>\n            </div>\n            <div class=\"ug-grid\">\n              <div class=\"v3-tile\">\n                <div class=\"fs-table\">\n                  <span class=\"fs-h\">Oil, gas &amp; coal</span><span class=\"fs-h\">Reserves</span><span class=\"fs-h\">World rank</span><span class=\"fs-h\">Output rank</span>\n                  <sc-for list=\"{{fossil}}\" as=\"x\" hint-placeholder-count=\"3\">\n                    <span class=\"ug-name\"><span class=\"sp-sw\" style=\"{{x.sw}}\"></span>{{x.name}}</span><span class=\"ug-val\">{{x.val}}</span><span class=\"{{x.rCls}}\">{{x.r}}</span><span class=\"{{x.pCls}}\">{{x.p}}</span>\n                  </sc-for>\n                </div>\n              </div>\n\n              <div class=\"v3-tile\">\n                <div class=\"v3-hv\"><span class=\"ec-h\">Transition minerals</span><span class=\"v3-note\">lit = world top 10 · reserves</span></div>\n                <div class=\"mn-tiles\">\n                  <sc-for list=\"{{minTiles}}\" as=\"t\" hint-placeholder-count=\"8\">\n                    <span class=\"{{t.cls}}\" title=\"{{t.title}}\"><span class=\"mn-sym\">{{t.sym}}</span><span class=\"mn-name\">{{t.sub}}</span><span class=\"mn-band\">{{t.band}}</span></span>\n                  </sc-for>\n                </div>\n              </div>\n\n              <div class=\"v3-tile ug-rents\" title=\"Resource rents: the value of the oil, gas, coal and ore it extracts each year, minus the cost of getting them out, as a share of the whole economy (GDP)\">\n                <div class=\"v3-hv\"><span class=\"ec-h\">Share of total GDP from extraction</span><span class=\"v3-hval\"><strong data-vals=\"{{rentVals}}\">{{rentTotal}}</strong> of GDP</span></div>\n                <span class=\"rn-sub\">by source, each as a share of total GDP</span>\n                <span class=\"rn-track\">\n                  <sc-for list=\"{{rentSegs}}\" as=\"g\" hint-placeholder-count=\"2\"><span class=\"rn-seg\" style=\"{{g.style}}\" title=\"{{g.name}}\" data-hl-target=\"{{g.hl}}\"></span></sc-for>\n                  <span class=\"ne-mark\" style=\"{{rentMark}}\"></span>\n                </span>\n                <div class=\"rn-key\">\n                  <sc-for list=\"{{rentKey}}\" as=\"k\" hint-placeholder-count=\"4\"><span class=\"ft-key\" data-hl=\"{{k.hl}}\" tabindex=\"0\"><span class=\"sp-sw\" style=\"{{k.sw}}\"></span>{{k.name}} <strong>{{k.v}}</strong></span></sc-for>\n                </div>\n              </div>\n            </div>\n            <span class=\"ic-src\">Source: U.S. EIA · USGS · World Bank</span>\n          </section>",
 "people": "<section class=\"{{o.cls}}\">\n            <div class=\"ic-head\">\n              <span class=\"ic-title\"><span class=\"ic-ico\" aria-hidden=\"true\"></span>People &amp; Power</span>\n              <span class=\"v3-headr\"><span class=\"v3-key\" data-hl=\"world:all\" tabindex=\"0\"><span class=\"v3-tick\" aria-hidden=\"true\"></span>world average</span><span class=\"{{o.tagCls}}\" title=\"{{o.tagTitle}}\"><sc-for list=\"{{o.cells}}\" as=\"cc\" hint-placeholder-count=\"0\"><span class=\"sp-cell\"></span></sc-for>{{o.tag}}</span></span>\n            </div>\n            <div class=\"pp-grid\">\n              <div class=\"v3-tile pp-home\">\n                <sc-for list=\"{{accessRows}}\" as=\"ar\" hint-placeholder-count=\"3\">\n                  <div class=\"ec-hrow\">\n                    <span class=\"ec-hlbl\">{{ar.lbl}}</span>\n                    <span class=\"ec-houses\" role=\"img\" aria-label=\"{{ar.aria}}\">\n                      <sc-for list=\"{{ar.icons}}\" as=\"hs\" hint-placeholder-count=\"10\">\n                        <svg viewBox=\"0 0 24 24\" width=\"17\" height=\"17\" class=\"{{hs.cls}}\" data-hl-target=\"{{hs.hl}}\" aria-hidden=\"true\"><path d=\"{{hs.d}}\" fill=\"currentColor\" class=\"{{hs.pc}}\"></path><rect x=\"{{hs.rx}}\" y=\"{{hs.ry}}\" width=\"{{hs.rw}}\" height=\"{{hs.rh}}\" rx=\"0.8\" class=\"{{hs.rc}}\"></rect></svg>\n                      </sc-for>\n                    </span>\n                    <span class=\"ec-hval\" data-vals=\"{{ar.vals}}\">{{ar.val}}</span>\n                  </div>\n                </sc-for>\n                <div class=\"ck-key\">\n                  <span data-hl=\"cook:clean\" tabindex=\"0\"><svg viewBox=\"0 0 24 24\" width=\"12\" height=\"12\" class=\"ec-stove is-clean\" aria-hidden=\"true\"><path class=\"ec-flame\" d=\"M12 5c2.5 3 4 5 4 7.5a4 4 0 0 1-8 0C8 10 9.5 8 12 5z\"></path></svg>electricity, gas, LPG</span>\n                  <span data-hl=\"cook:wood\" tabindex=\"0\"><svg viewBox=\"0 0 24 24\" width=\"12\" height=\"12\" class=\"ec-stove is-wood\" aria-hidden=\"true\"><path class=\"ec-flame\" d=\"M12 4c1 3 4 4.5 4 8.5a4 4 0 0 1-8 0c0-2 1-3 1.5-4 .5 1.5 1.5 2 1.5 2 0-2 .2-4 1-6.5z\"></path></svg>wood, charcoal, kerosene</span>\n                </div>\n              </div>\n\n              <div class=\"v3-tile pp-cuts\">\n                <div class=\"v3-hv\"><span class=\"ec-h\">Power cuts</span><span class=\"v3-note\">{{cutYear}}</span></div>\n                <sc-if value=\"{{hasCuts}}\" hint-placeholder-val=\"{{ true }}\">\n                  <div class=\"pc-wrap\">\n                    <div class=\"pc-left\">\n                      <div class=\"pc-month\" role=\"img\" aria-label=\"{{cutAria}}\">\n                        <sc-for list=\"{{cutDays}}\" as=\"d\" hint-placeholder-count=\"30\"><span class=\"{{d.cls}}\"></span></sc-for>\n                      </div>\n                      <span class=\"pc-n\"><strong class=\"v3-mid\">{{cutsTxt}}</strong> cuts a month</span>\n                    </div>\n                    <div class=\"pc-meters\">\n                      <sc-for list=\"{{cutRows}}\" as=\"w\" hint-placeholder-count=\"2\">\n                        <div class=\"dd-row pc-row\" title=\"{{w.title}}\"><span class=\"dd-l\">{{w.label}}</span><span class=\"dd-track\"><span class=\"dd-fill\" style=\"{{w.fill}}\"></span><span class=\"ne-mark\" style=\"{{w.mark}}\"></span></span><span class=\"dd-v\">{{w.val}}</span></div>\n                      </sc-for>\n                    </div>\n                  </div>\n                </sc-if>\n                <sc-if value=\"{{noCuts}}\" hint-placeholder-val=\"{{ false }}\">\n                  <span class=\"pc-empty\">Not surveyed: the World Bank firm survey skips most high-income countries</span>\n                </sc-if>\n              </div>\n\n              <div class=\"v3-tile\" title=\"Degree-days: how far and how long temperatures sit below (heating) or above (cooling) 18°C in a year, where people live\">\n                <div class=\"v3-hv\"><span class=\"ec-h\">Climate</span><span class=\"v3-note\">monthly averages, where people live</span></div>\n                <div class=\"tm-strip\">\n                  <span class=\"tm-range\" style=\"{{tmRange}}\"></span>\n                  <span class=\"tm-lab\" style=\"{{tmLo}}\">{{tmLoTxt}}</span>\n                  <span class=\"tm-lab\" style=\"{{tmHi}}\">{{tmHiTxt}}</span>\n                </div>\n                <div class=\"dd-rows\">\n                  <div class=\"dd-row\"><span class=\"dd-l\">Heating need</span><span class=\"dd-track\"><span class=\"dd-fill dv-fill--h\" style=\"{{hddW}}\"></span><span class=\"ne-mark\" style=\"{{hddWorld}}\"></span></span><span class=\"dd-v\">{{hddTxt}}</span></div>\n                  <div class=\"dd-row\"><span class=\"dd-l\">Cooling need</span><span class=\"dd-track\"><span class=\"dd-fill dv-fill--c\" style=\"{{cddW}}\"></span><span class=\"ne-mark\" style=\"{{cddWorld}}\"></span></span><span class=\"dd-v\">{{cddTxt}}</span></div>\n                </div>\n                <span class=\"dd-unit\">degree-days a year (days × °C below or above 18°C)</span>\n              </div>\n\n              <div class=\"v3-tile pp-life\">\n                <sc-for list=\"{{life}}\" as=\"l\" hint-placeholder-count=\"3\">\n                  <div class=\"mt-row\" title=\"{{l.title}}\">\n                    <div class=\"v3-hv\"><span class=\"mt-l\">{{l.label}}</span><span class=\"v3-hval\"><strong>{{l.val}}</strong></span></div>\n                    <span class=\"ne-track\"><span class=\"ne-fill\" style=\"{{l.fill}}\"></span><span class=\"ne-mark\" style=\"{{l.mark}}\"></span></span>\n                  </div>\n                </sc-for>\n              </div>\n            </div>\n            <span class=\"ic-src\">Source: World Bank · NASA POWER</span>\n          </section>",
 "trade": "<section class=\"{{o.cls}}\">\n          <div class=\"ic-head\">\n            <span class=\"ic-title\"><span class=\"ic-ico\" aria-hidden=\"true\"></span>Fuel Trade · {{tradeYear}}</span>\n            <span class=\"{{o.tagCls}}\" title=\"{{o.tagTitle}}\"><sc-for list=\"{{o.cells}}\" as=\"cc\" hint-placeholder-count=\"0\"><span class=\"sp-cell\"></span></sc-for>{{o.tag}}</span>\n          </div>\n          <div class=\"ft-wrap\">\n            <div class=\"ft-colhs\"><span class=\"ft-colh ft-colh--l\"><span>Buys from</span><strong class=\"ft-tot\" data-vals=\"{{buyVals}}\">{{buyTot}}</strong></span><span class=\"ft-colh ft-colh--r\"><strong class=\"ft-tot\" data-vals=\"{{sellVals}}\">{{sellTot}}</strong><span>Sells to</span></span></div>\n            <div class=\"ft-stage\" role=\"img\" aria-label=\"{{tradeAria}}\">\n              <svg class=\"ft-svg\" viewBox=\"0 0 760 300\" preserveAspectRatio=\"none\" aria-hidden=\"true\">\n                <sc-for list=\"{{tradeBands}}\" as=\"b\" hint-placeholder-count=\"0\">\n                  <path d=\"{{b.d}}\" data-hl-target=\"{{b.hl}}\" fill=\"{{b.col}}\" fill-opacity=\"0.42\" stroke=\"{{b.col}}\" stroke-opacity=\"0.75\" stroke-width=\"0.8\"></path>\n                </sc-for>\n                <sc-for list=\"{{tradeLeft}}\" as=\"n\" hint-placeholder-count=\"0\">\n                  <rect x=\"176\" y=\"{{n.y}}\" width=\"7\" height=\"{{n.h}}\" rx=\"2\" fill=\"#4a4a46\"></rect>\n                </sc-for>\n                <rect x=\"352\" y=\"{{hubY}}\" width=\"56\" height=\"{{hubH}}\" rx=\"6\" fill=\"#1a1a1a\"></rect>\n                <sc-for list=\"{{tradeRight}}\" as=\"n\" hint-placeholder-count=\"0\">\n                  <rect x=\"577\" y=\"{{n.y}}\" width=\"7\" height=\"{{n.h}}\" rx=\"2\" fill=\"#4a4a46\"></rect>\n                </sc-for>\n              </svg>\n              <sc-for list=\"{{tradeLeft}}\" as=\"n\" hint-placeholder-count=\"0\">\n                <span class=\"ft-lab ft-lab--l\" style=\"{{n.pos}}\" data-hl-any=\"{{n.fuels}}\" data-vals=\"{{n.vals}}\"><img class=\"ft-flag\" src=\"{{n.flag}}\" alt=\"\"><span class=\"ft-name\">{{n.name}}</span><span class=\"ft-val\">{{n.val}}</span></span>\n              </sc-for>\n              <span class=\"ft-hub\" style=\"{{hubPos}}\">?</span>\n              <span class=\"ft-hubl\" style=\"{{hubLPos}}\">this country</span>\n              <sc-for list=\"{{tradeRight}}\" as=\"n\" hint-placeholder-count=\"0\">\n                <span class=\"ft-lab ft-lab--r\" style=\"{{n.pos}}\" data-hl-any=\"{{n.fuels}}\" data-vals=\"{{n.vals}}\"><img class=\"ft-flag\" src=\"{{n.flag}}\" alt=\"\"><span class=\"ft-name\">{{n.name}}</span><span class=\"ft-val\">{{n.val}}</span></span>\n              </sc-for>\n            </div>\n            <div class=\"ft-legend\">\n              <sc-for list=\"{{fuelKey}}\" as=\"k\" hint-placeholder-count=\"5\"><span class=\"ft-key\" data-hl=\"{{k.hl}}\" tabindex=\"0\"><span class=\"sp-sw\" style=\"{{k.sw}}\"></span>{{k.name}}</span></sc-for>\n              <span class=\"ft-key ft-key--note\">band width = US$</span>\n            </div>\n          </div>\n          <span class=\"ic-src\">Source: CEPII BACI (UN Comtrade)</span>\n        </section>",
 "market": "<section class=\"{{o.cls}}\">\n          <div class=\"ic-head\">\n            <span class=\"ic-title\"><span class=\"ic-ico\" aria-hidden=\"true\"></span>Electricity Trade · Gross Flows · {{elecYear}}</span>\n            <span class=\"{{o.tagCls}}\" title=\"{{o.tagTitle}}\"><sc-for list=\"{{o.cells}}\" as=\"cc\" hint-placeholder-count=\"0\"><span class=\"sp-cell\"></span></sc-for>{{o.tag}}</span>\n          </div>\n          <div class=\"et-body\">\n            <div class=\"nb-row nb-tots\"><span class=\"nb-who nb-who--h\"></span><span class=\"nb-tot nb-tot--imp\" data-hl=\"flow:imp\" tabindex=\"0\"><span class=\"sp-sw nb-sw nb-sw--imp\"></span>Imported <strong>{{nbImp}}</strong></span><span class=\"nb-axis\"></span><span class=\"nb-tot\" data-hl=\"flow:exp\" tabindex=\"0\">Exported <strong>{{nbExp}}</strong><span class=\"sp-sw nb-sw nb-sw--exp\"></span></span></div>\n            <sc-for list=\"{{neighbours}}\" as=\"nb\" hint-placeholder-count=\"0\">\n              <div class=\"nb-row\">\n                <span class=\"nb-who\"><img class=\"ft-flag\" src=\"{{nb.flag}}\" alt=\"\"><span>{{nb.name}}</span></span>\n                <span class=\"nb-imp\"><span class=\"nb-v\" data-hl-target=\"flow:imp\">{{nb.impTxt}}</span><span class=\"nb-bar nb-bar--imp\" style=\"{{nb.imp}}\" data-hl-target=\"flow:imp\"></span></span>\n                <span class=\"nb-axis\"></span>\n                <span class=\"nb-exp\"><span class=\"nb-bar nb-bar--exp\" style=\"{{nb.exp}}\" data-hl-target=\"flow:exp\"></span><span class=\"nb-v\" data-hl-target=\"flow:exp\">{{nb.expTxt}}</span></span>\n              </div>\n            </sc-for>\n            <sc-if value=\"{{noNeighbours}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"et-none\">No electricity crosses its borders on record: its grid runs on its own.</div></sc-if>\n            <div class=\"et-facts\"><span>Traded both ways: <strong>{{grossTot}}</strong>, {{grossShare}} of demand</span></div>\n          </div>\n          <span class=\"ic-src\">Source: ENTSO-E (Europe) · UN Comtrade via CEPII BACI · U.S. EIA</span>\n        </section>"
};

function shopV2Vals(st0) {
  {
    const st = st0 || {};
    const europe = st.europe !== false;
    const log = st.log || [];                         // [{ guess: true } | { card: key, cost: n }], in order
    const ended = st.ended || null;                   // null | 'won' | 'lost'
    const spent = [];                                 // one entry per battery cell used: 'g' or 'c'
    log.forEach(e => { if (e.card) for (let i = 0; i < e.cost; i++) spent.push('c'); else spent.push('g'); });
    const used = Math.min(6, spent.length + (ended === 'won' ? 1 : 0));
    const left = 6 - used;
    const owned = log.filter(e => e.card).map(e => e.card);
    const over = !!ended || left <= 0;
    const B = id => '/_blob/' + id;
    const FLAG = {
      GB: B('bff90c13159d67a43659221697751292'), NO: B('2599ad7e4e302075e98d22ec05a335b3'), BE: B('3d18c8c971ffaed638ab93a0941c0a60'),
      NL: B('027d358d95f719e470cc4c378b75c950'), US: B('1309812f11f9b27f5f354c85eb7923fc'), KZ: B('6a2552f36c458bc1591a5506c32a8df8'),
      IE: B('dddea82cd744cc0e252dd8017a3f35f0'), MA: B('11082b23adc0035a8a4fc390151a7f73'),
      FR: B('22ad1998fecced63e0dba6ef2031fd84'), PL: B('b66df9e6bbf4b124c66d2b03e00e3fe0'), CZ: B('8c626744c7892741677c6881339e6a65'),
      AT: B('c9815565acd57eea8a70968172810143'), CH: B('297812368152718f29730beb3f441d12'), DK: B('3d8a2f1dd109d8e33655e9101cd791bf'),
      OTHER: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 4 3'%3E%3Crect width='4' height='3' fill='%23d6d4cf'/%3E%3C/svg%3E"
    };
    const guessWord = n => n + ' guess' + (n > 1 ? 'es' : '');
    const cellList = n => Array.from({ length: n }, () => ({}));

    // ---------- the shop: three cards for every country, a fourth in Europe ----------
    const CARDS = [
      { k: 'trade', cost: 1, name: 'Fuel trade', desc: 'Who it buys oil, gas and coal from, and who it sells to.', src: 'UN trade data (BACI) · every country' },
      { k: 'nature', cost: 1, name: 'Natural endowment', desc: 'How much sun and wind it gets, and the oil, gas and coal under its ground.', src: 'Solar & Wind Atlas · EIA · every country' },
      { k: 'society', cost: 1, name: 'Energy in daily life', desc: 'Who has power at home, who cooks with clean fuel, how green all its energy is.', src: 'World Bank · every country' },
      { k: 'market', cost: 1, name: 'Power market & neighbours', desc: 'Who it swaps electricity with, and how the price moves through a day.', src: 'ENTSO-E · Europe only', europe: true }
    ].filter(c => europe || !c.europe);
    const open = spent.length >= 1 && !over;           // after the first guess
    const ask = c => () => {
      const s = this.state || {}, lg = s.log || [];
      const sp = lg.reduce((a, e) => a + (e.card ? e.cost : 1), 0);
      if (s.ended || lg.some(e => e.card === c.k) || sp < 1 || 6 - sp - c.cost < 1) return;
      this.setState({ confirm: c.k });
    };
    let buyable = 0;
    const shop = CARDS.map(c => {
      const have = owned.includes(c.k);
      const state = have ? 'owned' : !open ? 'locked' : left - c.cost >= 1 ? 'buy' : 'broke';
      if (state === 'buy') buyable++;
      return {
        name: c.name, desc: c.desc, src: c.src, europeTag: !!c.europe,
        isTrade: c.k === 'trade', isNature: c.k === 'nature', isSociety: c.k === 'society', isMarket: c.k === 'market',
        cls: 'sh-card is-' + state, locked: state === 'locked' || state === 'broke',
        cells: cellList(c.cost), price: guessWord(c.cost),
        btn: state === 'owned' ? 'Opened' : state === 'locked' ? 'After your 1st guess' : state === 'broke' ? 'Needs ' + (c.cost + 1) + ' left' : 'Buy',
        disabled: state !== 'buy', ask: ask(c)
      };
    });
    const confirmCard = CARDS.find(c => c.k === st.confirm);

    // ---------- the clue-card slot under the charts ----------
    // During the game: the cards bought, in the shop's order. After it: every card, the unopened ones marked.
    const slot = CARDS.filter(c => ended || owned.includes(c.k)).map(c => {
      const have = owned.includes(c.k);
      return {
        trade: c.k === 'trade', nature: c.k === 'nature', society: c.k === 'society', market: c.k === 'market',
        cls: 'ic-card' + (have ? '' : ' is-unused'),
        tagCls: have ? 'ic-cost' : 'ic-cost ic-cost--unused',
        tag: have ? 'Bought for ' + guessWord(c.cost) : 'Not opened · revealed after the game',
        cells: have ? cellList(c.cost) : []
      };
    });
    const nUnused = ended ? CARDS.filter(c => !owned.includes(c.k)).length : 0;

    // ---------- card: fuel trade (illustrative figures) ----------
    const FUEL = { crude: ['Crude oil', '#6b4a2b'], refined: ['Refined products', '#b07a3c'], gas: ['Pipeline gas', '#d9773f'], lng: ['LNG', '#3f86b8'], coal: ['Coal', '#4a4a4a'] };
    const IN = st.IN || [
      ['NO', 'Norway', { gas: 26, crude: 9 }], ['NL', 'Netherlands', { refined: 10, gas: 9 }],
      ['US', 'United States', { crude: 8, lng: 3, coal: 1.5 }], ['BE', 'Belgium', { gas: 8, refined: 3 }],
      ['KZ', 'Kazakhstan', { crude: 6 }], ['OTHER', 'Others', { crude: 4, refined: 3, coal: 2.5 }]
    ];
    const OUT = st.OUT || [['NL', 'Netherlands', { refined: 4, gas: 2 }], ['BE', 'Belgium', { refined: 3 }], ['OTHER', 'Others', { refined: 3, gas: 3 }]];
    const sum = o => Object.values(o).reduce((a, v) => a + v, 0);
    const bn = v => '$' + (v >= 10 ? Math.round(v) : Math.round(v * 10) / 10) + ' bn';
    // label centres pushed apart so flags and names never overlap (bands keep their true positions)
    const spread = (list, gap, lo, hi) => {
      const ys = list.map(n => n.c);
      for (let it = 0; it < 40; it++) { let moved = false;
        for (let i = 1; i < ys.length; i++) { const d = ys[i] - ys[i - 1]; if (d < gap) { const m = (gap - d) / 2; ys[i - 1] -= m; ys[i] += m; moved = true; } }
        for (let i = 0; i < ys.length; i++) ys[i] = Math.max(lo + i * gap, Math.min(hi - (ys.length - 1 - i) * gap, ys[i]));
        if (!moved) break; }
      list.forEach((n, i) => { n.pos = 'top: ' + (ys[i] / 300 * 100).toFixed(2) + '%'; });
    };
    const totIn = IN.reduce((a, n) => a + sum(n[2]), 0), totOut = OUT.reduce((a, n) => a + sum(n[2]), 0);
    // one scale for both sides, set by the bigger side, so exporters fit as well as importers
    const TOP = 30, H = 260, GAP = 8, big = Math.max(totIn, totOut, 1e-9);
    const k = (H - GAP * (Math.max(IN.length, OUT.length) - 1)) / big;
    const hubH = big * k, hubY = TOP + (H - hubH) / 2;
    const stack = (list, tot) => { const used = tot * k + GAP * (list.length - 1);
      if (used >= H * 0.6) return { start: TOP + (H - used) / 2, gap: GAP };
      const g = (H - tot * k) / (list.length + 1); return { start: TOP + g, gap: g }; };
    const SL = stack(IN, totIn), SR = stack(OUT, totOut);
    const PX = (x, w) => (x / w * 100).toFixed(2) + '%';
    const bands = [], leftNodes = [], rightNodes = [];
    let y = SL.start, hy = hubY + (hubH - totIn * k) / 2;
    const band = (x0, a0, a1, x1, b0, b1) => {
      const m = (x0 + x1) / 2;
      return 'M' + x0 + ' ' + a0.toFixed(1) + ' C' + m + ' ' + a0.toFixed(1) + ' ' + m + ' ' + b0.toFixed(1) + ' ' + x1 + ' ' + b0.toFixed(1)
        + ' L' + x1 + ' ' + b1.toFixed(1) + ' C' + m + ' ' + b1.toFixed(1) + ' ' + m + ' ' + a1.toFixed(1) + ' ' + x0 + ' ' + a1.toFixed(1) + ' Z';
    };
    IN.forEach(([iso, name, parts]) => {
      const h = sum(parts) * k;
      leftNodes.push({ y: y.toFixed(1), h: h.toFixed(1), flag: shopFlagSrc(iso), name, val: bn(sum(parts)), c: y + h / 2, fuels: Object.keys(parts).map(f => 'fuel:' + f).join(' '), vals: JSON.stringify(Object.fromEntries(Object.entries(parts).map(([f, v]) => ['fuel:' + f, bn(v)]))) });
      let py = y;
      Object.entries(parts).forEach(([f, v]) => { const bh = v * k; bands.push({ d: band(183, py, py + bh, 352, hy, hy + bh), col: FUEL[f][1], hl: 'fuel:' + f }); py += bh; hy += bh; });
      y += h + SL.gap;
    });
    let ry = SR.start, oy = hubY + (hubH - totOut * k) / 2;
    OUT.forEach(([iso, name, parts]) => {
      const h = sum(parts) * k;
      rightNodes.push({ y: ry.toFixed(1), h: h.toFixed(1), flag: shopFlagSrc(iso), name, val: bn(sum(parts)), c: ry + h / 2, fuels: Object.keys(parts).map(f => 'fuel:' + f).join(' '), vals: JSON.stringify(Object.fromEntries(Object.entries(parts).map(([f, v]) => ['fuel:' + f, bn(v)]))) });
      let py = ry;
      Object.entries(parts).forEach(([f, v]) => { const bh = v * k; bands.push({ d: band(408, oy, oy + bh, 577, py, py + bh), col: FUEL[f][1], hl: 'fuel:' + f }); py += bh; oy += bh; });
      ry += h + SR.gap;
    });
    spread(leftNodes, 24, 14, 296); spread(rightNodes, 24, 14, 296);
    const usedFuels = new Set(IN.concat(OUT).flatMap(n => Object.keys(n[2]).filter(f => n[2][f] > 0)));
    const fuelKey = Object.entries(FUEL).filter(([fk]) => usedFuels.has(fk)).map(([fk, [n, c]]) => ({ name: n, hl: 'fuel:' + fk, sw: 'background: ' + c + '80; box-shadow: inset 0 0 0 1px ' + c }));

    // ---------- card: natural endowment, in the style of the headline stats ----------
    const meter = (v, w, max) => ({ fill: 'width: ' + Math.min(100, v / max * 100).toFixed(1) + '%', mark: 'left: ' + Math.min(100, w / max * 100).toFixed(1) + '%' });
    const skies = [
      { label: 'Solar output', val: '2.9 kWh', unit: 'a day per kW of panels', world: '4.1 kWh', lo: 'Cloudy', hi: 'Desert sun', col: '#f5c842', ...meter(2.9, 4.1, 6) },
      { label: 'Wind speed', val: '7.4 m/s', unit: 'at 100 m, windiest tenth of the land', world: '6.6 m/s', lo: 'Calm', hi: 'Very windy', col: '#5ab88a', ...meter(7.4, 6.6, 10) }
    ].map(s => ({ ...s, fill: s.fill + '; background: ' + s.col + 'b3' }));
    const logShare = (v, max) => Math.max(2, Math.min(100, (Math.log10(v / max) + 3) / 3 * 100));
    const reserves = [
      { name: 'Coal', col: '#4a4a4a', v: 35, max: 249, val: '35 bn t', sub: 'about 270 years of today’s output · world #8' },
      { name: 'Gas', col: '#e8925a', v: 0.02, max: 47, val: '0.02 tn m³', sub: 'about 4 years · imports most of its gas' },
      { name: 'Oil', col: '#c0654a', v: 0.1, max: 303, val: '0.1 bn barrels', sub: 'about 3 years · imports most of its oil' }
    ].map(x => ({ ...x, sw: 'background: ' + x.col + '80; box-shadow: inset 0 0 0 1px ' + x.col, bar: 'width: ' + logShare(x.v, x.max).toFixed(1) + '%; background: ' + x.col + '80; box-shadow: inset 0 0 0 1px ' + x.col }));

    // ---------- card: energy in daily life (World Bank) ----------
    const S = europe
      ? { city: 100, rural: 100, cook: 100, renElec: 59, renAll: 22, fuelImp: 12, fuelExp: 2,
          take: 'Everyone has power and cooks with gas or electricity. Its electricity is far greener than its energy as a whole: heating and transport still run mostly on oil and gas.' }
      : { city: 94, rural: 70, cook: 30, renElec: 90, renAll: 72, fuelImp: 18, fuelExp: 1,
          take: 'Seven in ten rural homes have power, but most families still cook on wood or charcoal: that is why so much of its energy counts as renewable.' };
    const houses = p => Array.from({ length: 10 }, (_, i) => ({ cls: 'ec-house' + (i < Math.round(p / 10) ? ' is-lit' : '') }));
    const accessRows = [['In cities', S.city], ['In the countryside', S.rural]].map(([lbl, p]) => ({ lbl, val: p + '%', houses: houses(p), aria: p + '% of homes ' + lbl.toLowerCase() + ' have electricity' }));
    const CLEAN = 'M12 5c2.5 3 4 5 4 7.5a4 4 0 0 1-8 0C8 10 9.5 8 12 5z', WOOD = 'M12 4c1 3 4 4.5 4 8.5a4 4 0 0 1-8 0c0-2 1-3 1.5-4 .5 1.5 1.5 2 1.5 2 0-2 .2-4 1-6.5z';
    const stoves = Array.from({ length: 10 }, (_, i) => { const clean = i < Math.round(S.cook / 10); return { cls: 'ec-stove ' + (clean ? 'is-clean' : 'is-wood'), d: clean ? CLEAN : WOOD }; });
    const renBars = [['In its electricity', S.renElec, 30], ['In all the energy it uses', S.renAll, 19]]
      .map(([lbl, v, w]) => ({ lbl, val: v + '%', fill: 'width: ' + v + '%', world: 'left: ' + w + '%' }));
    const donuts = [{ p: S.fuelImp, lbl: 'of its imports', col: '#d9773f' }, { p: S.fuelExp, lbl: 'of its exports', col: '#6b4a2b' }]
      .map(d => ({ val: d.p + '%', lbl: d.lbl, col: d.col, dash: d.p + ' ' + (100 - d.p) }));

    // ---------- card: power market and neighbours (Europe) ----------
    const NB = st.NB || [['FR', 'France', 16, 1], ['DK', 'Denmark', 11, 3], ['CZ', 'Czechia', 9, 2], ['NO', 'Norway', 6, 1], ['NL', 'Netherlands', 5, 10],
                ['PL', 'Poland', 4, 3], ['CH', 'Switzerland', 3, 11], ['BE', 'Belgium', 3, 2], ['AT', 'Austria', 2, 9]];
    const NBMAX = Math.max(...NB.map(n => Math.max(n[2], n[3])), 0.1);
    const neighbours = NB.map(([iso, name, imp, exp]) => ({ flag: shopFlagSrc(iso), name, impTxt: imp, expTxt: exp, impNo: imp ? '' : 'nb-zero', expNo: exp ? '' : 'nb-zero',
      imp: imp ? 'width: ' + (imp / NBMAX * 100).toFixed(1) + '%' : 'display: none', exp: exp ? 'width: ' + (exp / NBMAX * 100).toFixed(1) + '%' : 'display: none' }));
    const DAY = [88, 84, 81, 80, 82, 90, 104, 118, 112, 92, 72, 58, 48, 44, 47, 60, 82, 112, 138, 142, 128, 112, 100, 93], PMAX = 160;
    const dayPts = DAY.map((v, i) => (i / 23 * 100).toFixed(2) + ',' + (100 - v / PMAX * 100).toFixed(2)).join(' ');

    // ---------- guesses and purchases, newest first ----------
    const WRONG = [
      { name: 'Ireland', iso: 'IE', dir: 'ESE', deg: 112, km: 1350, twh: '33.9', dpc: '6.3' },
      { name: 'United Kingdom', iso: 'GB', dir: 'ESE', deg: 108, km: 930, twh: '285', dpc: '4.3' },
      { name: 'Norway', iso: 'NO', dir: 'S', deg: 172, km: 1080, twh: '154', dpc: '24.0' },
      { name: 'Belgium', iso: 'BE', dir: 'E', deg: 86, km: 430, twh: '82.4', dpc: '7.2' },
      { name: 'Netherlands', iso: 'NL', dir: 'ESE', deg: 105, km: 380, twh: '121', dpc: '6.9' },
      { name: 'Morocco', iso: 'MA', dir: 'NE', deg: 40, km: 2300, twh: '41.2', dpc: '1.2' }
    ];
    const STOPS = [[196, 112, 96], [214, 168, 80], [84, 160, 112]];
    const closeRGB = p => { const t = Math.min(1, Math.max(0, p / 100)), i = t <= 0.5 ? 0 : 1, u = (t - i * 0.5) / 0.5; return STOPS[i].map((v, kk) => Math.round(v + (STOPS[i + 1][kk] - v) * u)); };
    const NAMES = {}; CARDS.forEach(c => { NAMES[c.k] = c.name; });
    let gi = 0;
    const rows = log.map((e, i) => {
      if (e.card) return { isCard: true, isGuess: false, n: String(i + 1), card: NAMES[e.card] || e.card, cost: guessWord(e.cost), cells: cellList(e.cost) };
      const g = WRONG[gi++ % WRONG.length]; const p = Math.max(0, Math.round(100 - g.km / 100)); const c = closeRGB(p);
      return {
        isCard: false, isGuess: true, n: String(i + 1), rowStyle: '--cl: ' + c.join(','), dash: (p / 100 * 81.7).toFixed(1) + ' 81.7',
        flag: shopFlagSrc(g.iso), name: g.name, twh: g.twh, dpc: g.dpc, dir: g.dir, needle: '--deg: ' + g.deg + 'deg',
        km: g.km.toLocaleString('en-US') + ' km', kmStyle: 'color: rgb(' + c.map(v => Math.round(v * 0.72)).join(',') + ')', wire: 'width: ' + p + '%'
      };
    }).reverse();

    const batt = (n, seq) => {
      const tone = n >= 4 ? 'is-high' : n >= 2 ? 'is-mid' : 'is-low';
      return [0, 1, 2, 3, 4, 5].map(i => ({ cls: 'battery-cell' + (i < n ? ' is-on ' + tone : seq[5 - i] === 'c' ? ' sp-spent' : '') }));
    };
    const cells = batt(left, spent);
    const cellsAfter = confirmCard ? batt(left - confirmCard.cost, spent.concat(Array(confirmCard.cost).fill('c'))) : cells;
    const locked = spent.length < 1;

    return {
      europe, euCls: 'cr-proto-btn' + (europe ? ' is-on' : ''), worldCls: 'cr-proto-btn' + (!europe ? ' is-on' : ''),
      setEurope: () => this.setState({ europe: true, log: [], ended: null, shopOpen: false, confirm: null }),
      setWorld: () => this.setState({ europe: false, log: [], ended: null, shopOpen: false, confirm: null }),
      wrong: () => {
        const s = this.state || {}; if (s.ended) return;
        const lg = (s.log || []).concat([{ guess: true }]);
        const sp = lg.reduce((a, e) => a + (e.card ? e.cost : 1), 0);
        this.setState({ log: lg, ended: sp >= 6 ? 'lost' : null });
      },
      win: () => { const s = this.state || {}; if (!s.ended) this.setState({ ended: 'won', shopOpen: false, confirm: null }); },
      reset: () => this.setState({ log: [], ended: null, shopOpen: false, confirm: null }),

      shopBtnCls: 'shop-btn' + (locked ? ' is-locked' : '') + (buyable ? ' has-cards' : ''),
      shopBtnAria: locked ? 'Info shop: opens after your first guess' : 'Info shop: trade guesses for clue cards',
      shopBadge: !locked && buyable > 0, shopBadgeTxt: String(buyable),
      openShop: () => this.setState({ shopOpen: true, confirm: null }),
      closeShop: () => this.setState({ shopOpen: false, confirm: null }),
      shopOpen: !!st.shopOpen && !ended,
      showHint: spent.length === 1 && owned.length === 0 && !over,
      hintTxt: 'The Info shop is open: trade guesses for clue cards.',
      shop, shopNote: locked ? 'Have a look now: cards open after your first guess.' : 'Every card you skip is revealed for free once the game is over.',
      confirming: !!confirmCard, confirmName: confirmCard ? confirmCard.name : '', confirmCost: confirmCard ? guessWord(confirmCard.cost) : '',
      confirmBtn: confirmCard ? 'Open for ' + guessWord(confirmCard.cost) : '', afterLeft: confirmCard ? String(left - confirmCard.cost) : '', cellsAfter,
      cancelBuy: () => this.setState({ confirm: null }),
      confirmBuy: () => {
        const s = this.state || {}, c = CARDS.find(x => x.k === s.confirm), lg = s.log || [];
        if (!c || lg.some(e => e.card === c.k)) return;
        this.setState({ log: lg.concat([{ card: c.k, cost: c.cost }]), confirm: null, shopOpen: false });
      },

      ended: !!ended, slot,
      endSub: owned.length ? (nUnused ? 'The ' + nUnused + ' you didn’t open are revealed too' : 'You opened every card') : 'You solved it without any: here is what they held',
      endTxt: ended === 'won' ? 'Result card as today (your path, average, stats)' : 'Result card as today (the answer, your path)',
      cells, leftTxt: String(left), batteryLabel: left + ' of 6 guesses left',
      playing: !over,
      buyTot: bn(totIn), sellTot: bn(totOut),
      buyVals: JSON.stringify(Object.fromEntries(Object.keys(FUEL).map(f => ['fuel:' + f, bn(IN.reduce((a, n) => a + (n[2][f] || 0), 0))]))),
      sellVals: JSON.stringify(Object.fromEntries(Object.keys(FUEL).map(f => ['fuel:' + f, bn(OUT.reduce((a, n) => a + (n[2][f] || 0), 0))]))),
      nbImp: Math.round(NB.reduce((a, n) => a + n[2], 0) * 10) / 10 + ' TWh', nbExp: Math.round(NB.reduce((a, n) => a + n[3], 0) * 10) / 10 + ' TWh',
      nbNote: (() => { const d = Math.round(NB.reduce((a, n) => a + n[2] - n[3], 0) * 10) / 10; return 'Net ' + (d >= 0 ? 'importer' : 'exporter') + ' of ' + Math.abs(d) + ' TWh'; })(),
      grossTot: Math.round(NB.reduce((a, n) => a + n[2] + n[3], 0) * 10) / 10 + ' TWh',
      grossShare: st.demand ? Math.round(NB.reduce((a, n) => a + n[2] + n[3], 0) / st.demand * 100) + '%' : '25%',
      tradeBands: bands, tradeLeft: leftNodes, tradeRight: rightNodes, fuelKey,
      hubY: hubY.toFixed(1), hubH: hubH.toFixed(1), hubPos: 'top: ' + PX(hubY + hubH / 2, 300), hubLPos: 'top: ' + PX(hubY + hubH + 4, 300),
      tradeAria: 'Buys fuel worth ' + bn(totIn) + ' and sells ' + bn(totOut),
      tradeTake: 'Buys $' + totIn + ' bn of fuel a year and sells $' + totOut + ' bn: gas and crude come mostly from Norway, refined products from its western neighbours.',
      skies, reserves,
      accessRows, stoves, cookTxt: S.cook + '%', cookSub: 'World: 74% · the rest cook on wood, charcoal or kerosene', cookAria: S.cook + '% of people cook with gas or electricity',
      renBars, renSub: 'Ticks: world average', donuts, societyTake: S.take,
      neighbours, dayPts, dayArea: '0,100 ' + dayPts + ' 100,100', avgLine: 'top: ' + (100 - 78 / PMAX * 100).toFixed(2) + '%',
      rows
    };
  }
}


function cardsV3Vals(st0) {
  {
    const st = st0 || {};
    const iso = st.iso || 'DEU';
    const scene = st.scene || 'two';

    // ---------- illustrative figures, rounded the way the cards will show them ----------
    const D = {};
    const C = st.C;
    const nf = v => v.toLocaleString('en-US');
    const sig2 = v => { if (!v) return '0'; const d = Math.max(0, 1 - Math.floor(Math.log10(Math.abs(v)))); return Number(v.toFixed(d)).toLocaleString('en-US', { maximumFractionDigits: d }); };
    const cellList = n => Array.from({ length: n }, () => ({}));
    const guessWord = n => n + ' guess' + (n > 1 ? 'es' : '');

    // ---------- which cards, and the layout rule ----------
    const CARDS = [
      { k: 'trade', cost: 1, title: 'Fuel trade', full: true, ph: 'Fuel trade card: unchanged from Info shop v2', h: 300 },
      { k: 'nature', cost: 1, title: 'Renewables potential' },
      { k: 'under', cost: 1, title: 'Underground riches' },
      { k: 'people', cost: 1, title: 'People & power' },
      { k: 'market', cost: 1, title: 'Power market & neighbours', europe: true, ph: 'Power market card: unchanged from Info shop v2', h: 300 }
    ].filter(c => C.europe || !c.europe);
    const SCENES = {
      one: { lbl: '1 bought', owned: ['people'] },
      two: { lbl: '2 bought', owned: ['nature', 'under'] },
      three: { lbl: '3 bought', owned: ['nature', 'under', 'people'] },
      over: { lbl: 'Game over (all revealed)', owned: ['nature', 'under'], ended: true }
    };
    const S = SCENES[scene];
    const shown = CARDS.filter(c => S.ended || S.owned.includes(c.k));
    // pair cards two to a row in shop order; Fuel trade is always full; a card left alone takes the full row
    const span = {}; let pending = null;
    shown.forEach(c => {
      if (c.full) { if (pending) span[pending] = true; pending = null; span[c.k] = true; return; }
      if (pending) { span[pending] = false; span[c.k] = false; pending = null; } else pending = c.k;
    });
    if (pending) span[pending] = true;
    const slot = shown.map(c => {
      const have = S.owned.includes(c.k);
      return {
        placeholder: !!c.ph, nature: c.k === 'nature', under: c.k === 'under', people: c.k === 'people',
        title: c.title, phTxt: c.ph || '', phStyle: 'height: ' + (c.h || 0) + 'px',
        cls: 'ic-card v3-card' + (span[c.k] ? ' is-full' : ' is-half') + (have ? '' : ' is-unused'),
        tagCls: have ? 'ic-cost' : 'ic-cost ic-cost--unused',
        tag: have ? 'Bought for ' + guessWord(c.cost) : 'Not opened · revealed after the game',
        cells: have ? cellList(c.cost) : []
      };
    });

    // ---------- natural endowment ----------
    const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
    const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const avg = a => a.reduce((s, v) => s + v, 0) / a.length;
    const bars = (a, max, col) => a.map((v, i) => ({ m: MONTHS[i], style: 'height: ' + Math.max(3, v / max * 100).toFixed(1) + '%; background: ' + col + '8c; box-shadow: inset 0 0 0 1px ' + col }));
    const ghi = avg(C.sun), ws = avg(C.wind);
    const skies = [
      { label: 'Sunshine', pre: 'yearly total ', val: nf(Math.round(ghi * 365 / 10) * 10), unit: 'kWh/m²', worldDay: 4.6, wtxt: 'world average 1,680', col: '#e0b225', a: C.sun, max: 8,
        facts: [],
        aria: 'Sunshine month by month; world average 1,680 kWh per square metre a year' },
      { label: 'Wind at 50 m', pre: 'yearly average ', val: ws.toFixed(1), unit: 'm/s', worldDay: 5.2, wtxt: 'world average 5.2', col: '#5ab88a', a: C.wind, max: 9, facts: [],
        aria: 'Wind speed by month, from ' + Math.min(...C.wind) + ' to ' + Math.max(...C.wind) + ' metres per second; world average 5.2' }
    ].map(s => ({ ...s, bars: bars(s.a, s.max, s.col), wl: 'bottom: ' + (14 + 46 * s.worldDay / s.max).toFixed(1) + 'px' }));
    const logPos = (v, lo, hi) => Math.max(0, Math.min(100, (Math.log10(v) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo)) * 100));
    const meterStyle = (p, col) => 'width: ' + p.toFixed(1) + '%; background: ' + col + '8c; box-shadow: inset 0 0 0 1px ' + col;
    const water = [
      { label: 'Rain', title: 'World average 1,000 mm · scale 0 to 3,000 mm', val: nf(C.rain), unit: 'mm/yr', fill: meterStyle(Math.min(100, C.rain / 3000 * 100), '#4a90c4'), mark: 'left: ' + (1000 / 3000 * 100).toFixed(1) + '%' },
      { label: 'Rivers & groundwater', title: 'Renewable fresh water generated inside the country each year (World Bank / FAO) · world average 240 km³ · log scale 1 to 10,000', val: nf(C.flow), unit: 'km³/yr', fill: meterStyle(logPos(C.flow, 1, 10000), '#4a90c4'), mark: 'left: ' + logPos(240, 1, 10000).toFixed(1) + '%' }
    ];
    // terrain: 101 sampled elevations, sorted (interpolated from a few quantiles in this draft)
    const q = Array.from({ length: 101 }, (_, i) => {
      const t = i / 100, T = C.terr; let k = 1; while (k < T.length - 1 && T[k][0] < t) k++;
      const [x0, y0] = T[k - 1], [x1, y1] = T[k]; return y0 + (y1 - y0) * (t - x0) / (x1 - x0);
    });
    const ZMAX = 6000, zy = z => (100 - Math.sqrt(Math.max(0, z) / ZMAX) * 100).toFixed(2);
    const terrLine = q.map((z, i) => i + ',' + zy(z)).join(' ');
    const mean = avg(q), high = q[95], above = q.filter(z => z > 1000).length;
    const r50 = v => nf(Math.round(v / 50) * 50) + ' m';
    // terrain as a distribution: share of the land in each height band (world land for comparison)
    const BINS = [[3000, 1e9, '3+ km'], [2000, 3000, '2–3 km'], [1000, 2000, '1–2 km'], [500, 1000, '0.5–1 km'], [200, 500, '0.2–0.5 km'], [0, 200, '< 0.2 km']];
    const WORLD_BINS = [5, 6, 15, 21, 25, 28];
    const nq = q.length;
    const shares = BINS.map(([lo, hi]) => Math.round(q.filter(z => z >= lo && z < hi).length / nq * 100));
    const DMAX = Math.max(40, ...shares) * 1.05;
    const terrBins = BINS.map(([lo, hi, lbl], i) => {
      const p = shares[i];
      return { lbl, txt: p + '%', style: 'width: ' + (p ? Math.max(2, p / DMAX * 100) : 0).toFixed(1) + '%',
        world: 'left: ' + (WORLD_BINS[i] / DMAX * 100).toFixed(1) + '%' };
    });

    // ---------- underground riches ----------
    const band = b => b ? 'Top ' + b : '—';
    const reserveTxt = v => v;
    const chip = b => 'ug-chip' + (b ? ' is-b' + b : ' is-none');
    const FOS = [
      ['oil', 'Oil', '#c0654a', v => sig2(v) + ' bn barrels'],
      ['gas', 'Gas', '#e8925a', v => v < 0.1 ? sig2(v * 1000) + ' bn m³' : sig2(v) + ' tn m³'],
      ['coal', 'Coal', '#4a4a4a', v => sig2(v) + ' bn t']
    ];
    const fossil = FOS.map(([k, name, col, fmt]) => {
      const [v, r, p] = C.fossil[k];
      return { name, sw: 'background: ' + col + '80; box-shadow: inset 0 0 0 1px ' + col, val: v ? fmt(v) : 'none proven', r: band(r), p: band(p), rCls: chip(r), pCls: chip(p) };
    });
    const MIN = [['Li', 'Lithium'], ['Co', 'Cobalt'], ['Ni', 'Nickel'], ['Cu', 'Copper'], ['C', 'Graphite'], ['REE', 'Rare earths'], ['Mn', 'Manganese'], ['PGM', 'Platinum metals']];
    const minTiles = MIN.map(([sym, name]) => {
      const m = C.minerals[sym], b = m ? Math.min(m[2] || 99, m[3] || 99) : 0;
      const tons = (v, u) => u === 't' && v >= 1e6 ? sig2(v / 1e6) + ' Mt' : u === 't' && v >= 1e4 ? sig2(v / 1e3) + ' kt' : sig2(v) + ' ' + u;   // fits the small tile
      const res = m && m[0] ? tons(m[0], m[1]) : 'mined';
      const parts = m ? [m[2] ? 'world top ' + m[2] + ' for reserves' : '', m[3] ? 'top ' + m[3] + ' for output' : ''].filter(Boolean).join(', ') : '';
      return { sym, name, sub: m ? res : name, title: name + (m ? (m[0] ? ': reserves ' + res + ', ' : ': ') + parts : ''), band: m ? 'Top ' + (m[2] || m[3]) : '', cls: 'mn-tile' + (m ? ' is-lit' : '') };
    });
    const minRows = MIN.filter(([sym]) => C.minerals[sym]).map(([sym, name]) => {
      const [v, u, r, p] = C.minerals[sym];
      return { name, val: sig2(v) + ' ' + u, r: band(r), p: band(p), rCls: chip(r), pCls: chip(p) };
    });
    const RENT = [['oil', 'Oil', '#c0654a'], ['gas', 'Gas', '#e8925a'], ['coal', 'Coal', '#4a4a4a'], ['min', 'Minerals', '#5b6573']];
    const rentTot = Object.values(C.rents).reduce((a, v) => a + v, 0);
    const fmtPct = v => v === 0 ? '0%' : v < 0.1 ? '<0.1%' : (v < 10 ? v.toFixed(1) : Math.round(v)) + '%';
    const rentSegs = RENT.filter(([k]) => C.rents[k] > 0).map(([k, name, col]) => ({ name, hl: 'rent:' + k, style: 'width: ' + Math.max(0.6, C.rents[k] / 20 * 100).toFixed(2) + '%; background: ' + col + '8c; box-shadow: inset 0 0 0 1px ' + col }));
    const rentKey = RENT.map(([k, name, col]) => ({ name, hl: 'rent:' + k, v: fmtPct(C.rents[k]), sw: 'background: ' + col + '80; box-shadow: inset 0 0 0 1px ' + col }));

    // ---------- people & power ----------
    const HOUSE = 'M3 11 12 3l9 8v10H3z';
    const CLEAN = 'M12 5c2.5 3 4 5 4 7.5a4 4 0 0 1-8 0C8 10 9.5 8 12 5z', WOOD = 'M12 4c1 3 4 4.5 4 8.5a4 4 0 0 1-8 0c0-2 1-3 1.5-4 .5 1.5 1.5 2 1.5 2 0-2 .2-4 1-6.5z';
    const houses = p => Array.from({ length: 10 }, (_, i) => ({ cls: 'ec-house' + (i < Math.round(p / 10) ? ' is-lit' : ''), hl: '', d: HOUSE, pc: '', rx: 10, ry: 13, rw: 4, rh: 5, rc: 'ec-win' }));
    const stoves = Array.from({ length: 10 }, (_, i) => { const clean = i < Math.round(C.cook / 10); return { cls: 'ec-stove ' + (clean ? 'is-clean' : 'is-wood'), hl: 'cook:' + (clean ? 'clean' : 'wood'), d: clean ? CLEAN : WOOD, pc: 'ec-flame', rx: 0, ry: 0, rw: 0, rh: 0, rc: 'ec-hob' }; });
    const accessRows = [['Power in cities', C.access[0], houses(C.access[0])], ['Power in the countryside', C.access[1], houses(C.access[1])], ['Clean cooking', C.cook, stoves]]
      .map(([lbl, p, icons]) => ({ lbl, val: p + '%', icons, aria: p + '% · ' + lbl, vals: icons === stoves ? JSON.stringify({ 'cook:clean': p + '%', 'cook:wood': (100 - p) + '%' }) : '' }));
    const cuts = C.cuts;
    const nCut = cuts ? Math.max(cuts.n > 0 ? 1 : 0, Math.round(cuts.n)) : 0;
    const cutDays = Array.from({ length: 30 }, (_, i) => ({ cls: 'pc-day' + ([4, 11, 17, 23, 27, 8, 20, 14, 2, 25].slice(0, nCut).includes(i) ? ' is-cut' : '') }));
    const TLO = -15, THI = 35, tp = t => ((t - TLO) / (THI - TLO) * 100).toFixed(1);
    const ddRows = [
      { lbl: 'Heating', val: nf(Math.round(C.hdd / 50) * 50), fill: 'width: ' + Math.min(100, C.hdd / 5000 * 100).toFixed(1) + '%; background: #4a90c48c; box-shadow: inset 0 0 0 1px #4a90c4' },
      { lbl: 'Cooling', val: nf(Math.round(C.cdd / 50) * 50), fill: 'width: ' + Math.min(100, C.cdd / 5000 * 100).toFixed(1) + '%; background: #d9773f8c; box-shadow: inset 0 0 0 1px #d9773f' }
    ];
    const lin = (v, lo, hi) => Math.max(0, Math.min(100, (v - lo) / (hi - lo) * 100));
    const life = [
      { label: 'Urban population', title: 'Share of people living in towns and cities · world average 57%', val: C.urban + '%', p: C.urban, w: 57, world: '57%', lo: '0%', hi: '100%' },
      { label: 'Income per person (PPP)', title: 'GDP per person, adjusted for local prices · world average $23k · log scale', val: '$' + Math.round(C.gdp / 1000) + 'k', p: logPos(C.gdp, 1000, 150000), w: logPos(23000, 1000, 150000), world: '$23k', lo: '$1k', hi: '$150k (log)' },
      { label: 'Industry, % of GDP', title: 'Manufacturing, mining, construction, power and water · world average 27%', val: C.industry + '%', p: lin(C.industry, 0, 60), w: lin(27, 0, 60), world: '27%', lo: '0%', hi: '60%' }
    ].map(l => ({ ...l, fill: meterStyle(l.p, '#8a8a86'), mark: 'left: ' + l.w.toFixed(1) + '%' }));

    const set = o => () => this.setState(o);
    return {
      countryBtns: Object.keys(D).map(k => ({ lbl: D[k].name + (D[k].europe ? ' (Europe)' : ''), cls: 'cr-proto-btn' + (k === iso ? ' is-on' : ''), go: set({ iso: k }) })),
      sceneBtns: Object.keys(SCENES).map(k => ({ lbl: SCENES[k].lbl, cls: 'cr-proto-btn' + (k === scene ? ' is-on' : ''), go: set({ scene: k }) })),
      ended: !!S.ended, endSub: 'You opened 2 · the others are revealed too', slot, noCards: !slot.length,

      skies, water,
      terrLine, terrArea: '0,100 ' + terrLine + ' 100,100',
      terr1000: 'top: ' + zy(1000) + '%', terrTop: 'top: ' + zy(ZMAX) + '%', terrTopTxt: nf(ZMAX) + ' m', terr3000: 'top: ' + zy(3000) + '%',
      terrBins, terrWorld: '680 m', terrMean: r50(mean), terrHigh: r50(high), terrAbove: above + '%',
      terrAria: 'Elevation of its land, sorted: average ' + r50(mean) + ', ' + above + '% above 1,000 m',
      natureTake: C.tNature,

      fossil, fossilNote: C.coalYears ? 'Coal: about ' + C.coalYears + ' years at today’s output · bands are world ranks, never exact' : 'Bands are world ranks, never exact',
      minTiles, minRows, noMinerals: !minRows.length,
      rentTotal: fmtPct(rentTot), rentVals: JSON.stringify(Object.fromEntries(RENT.map(([k]) => ['rent:' + k, fmtPct(C.rents[k])]))), rentWorld: '2.8%', rentSegs, rentKey, rentMark: 'left: ' + (2.8 / 20 * 100).toFixed(1) + '%',
      underTake: C.tUnder,

      accessRows, stoves, cookTxt: C.cook + '%', cookAria: C.cook + '% of people cook with gas or electricity',
      hasCuts: !!cuts, noCuts: !cuts, cutYear: cuts ? 'survey ' + cuts.year : '',
      cutDays, cutsTxt: cuts ? String(cuts.n) : '', firmsTxt: cuts ? cuts.firms + '%' : '', firmsWorld: '45%',
      cutAria: cuts ? cuts.n + ' power cuts in a typical month' : '',
      // Enterprise Surveys (WDI IC.ELC.OUTG, IC.ELC.OUTG.ZS, IC.FRM.OUTG.ZS); ticks = average of all surveyed countries
      cutRows: cuts ? [
        { label: 'Firms hit', val: cuts.firms + '%', title: 'Share of firms with at least one outage in the year · ticks: average of all surveyed countries (45%)',
          fill: meterStyle(cuts.firms, '#8a8a86'), mark: 'left: 45%' },
        cuts.loss == null ? null : { label: 'Sales lost', val: cuts.loss + '%', title: 'Sales lost to outages by the firms hit · ticks: average of all surveyed countries (3%) · scale 0 to 10%',
          fill: meterStyle(Math.min(100, cuts.loss * 10), '#8a8a86'), mark: 'left: 30%' }
      ].filter(Boolean) : [],
      tmRange: 'left: ' + tp(C.cold) + '%; width: ' + (tp(C.hot) - tp(C.cold)).toFixed(1) + '%',
      hddTxt: nf(Math.round(C.hdd / 50) * 50), cddTxt: nf(Math.round(C.cdd / 50) * 50),
      hddWorld: 'left: ' + (1400 / 4000 * 100).toFixed(1) + '%', cddWorld: 'left: ' + (1500 / 4000 * 100).toFixed(1) + '%',
      hddW: 'width: ' + Math.min(100, C.hdd / 4000 * 100).toFixed(1) + '%', cddW: 'width: ' + Math.min(100, C.cdd / 4000 * 100).toFixed(1) + '%',
      tmLo: tp(C.cold) < 22 ? 'left: 0; translate: 0 0' : 'left: ' + tp(C.cold) + '%',
      tmHi: tp(C.hot) > 78 ? 'left: auto; right: 0; translate: 0 0' : 'left: ' + tp(C.hot) + '%',   // labels near an end stay inside the card
      tmLoTxt: C.coldM + ' ' + C.cold + '°C', tmHiTxt: C.hotM + ' ' + C.hot + '°C',
      ddRows, life, peopleTake: C.tPeople
    };
  }
}

