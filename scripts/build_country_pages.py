"""Build one static page per country: energle.org/country/<slug>/

Pages are written for search engines and curious readers: the country's electricity in words and simple charts.
Two rules keep them from becoming a way to cheat at the daily puzzle:
  1. No exact game figures. Totals, shares and ratios are rounded and put into words ("about a third", "about 570
     TWh"), so typing the puzzle's numbers into a search engine never leads here.
  2. A spoiler shield. A visitor with today's puzzle unfinished sees the page blurred, on every country page alike,
     so the shield itself gives nothing away.
And no ranking or "countries by share" pages: each page describes one country, plus its nearest neighbours.

Usage:
  python scripts/build_country_pages.py                  # every country, indexable
  python scripts/build_country_pages.py --preview France Japan Brazil   # a few pages, hidden from search engines
"""
import argparse, html, json, math, os, re, unicodedata
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = 'https://energle.org'
COLORS = {'Coal': '#4a4a4a', 'Gas': '#e8925a', 'Other Fossil': '#c0654a', 'Nuclear': '#9b6dbd', 'Hydro': '#4a90c4',
          'Wind': '#5ab88a', 'Solar': '#f5c842', 'Bioenergy': '#a0724a', 'Other Renewables': '#2ab5a0'}
SOURCES = list(COLORS)
LOWER = {'Other Fossil': 'other fossil fuels', 'Other Renewables': 'other renewables', 'Bioenergy': 'bioenergy'}
THE = {'United States', 'United Kingdom', 'Netherlands', 'Philippines', 'United Arab Emirates', 'Dominican Republic',
       'Democratic Republic of the Congo', 'Central African Republic', 'Bahamas', 'Gambia', 'Czech Republic',
       'Republic of the Congo', 'Maldives', 'Solomon Islands', 'Comoros', 'Seychelles', 'Marshall Islands'}


def esc(s): return html.escape(str(s), quote=True)
def the(name, cap=False):
    t = ('The ' if cap else 'the ') + name if name in THE else name
    return t
def slug(name):
    s = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')
def src_word(s): return LOWER.get(s, s.lower())


# ---- rounding into words (rule 1) ----
def sig2(v):
    if v <= 0: return '0'
    d = 2 - int(math.floor(math.log10(v))) - 1
    r = round(v, d)
    return f'{r:,.0f}' if r >= 10 else f'{r:.1f}'.rstrip('0').rstrip('.')
def twh(v): return 'about ' + sig2(v) + ' TWh'
FRAC = [(1 / 4, 'a quarter'), (1 / 3, 'a third'), (1 / 2, 'half'), (2 / 3, 'two-thirds'), (3 / 4, 'three-quarters')]
def share_words(f):
    for v, w in FRAC:
        if abs(f - v) <= 0.025: return 'about ' + w
    p = f * 100
    if p < 1: return 'under 1%'
    if p < 10: return f'about {round(p)}%'
    if p > 97: return 'almost all'
    return f'about {int(5 * round(p / 5))}%'
def pct_round(f):
    p = f * 100
    return '<1' if p < 1 else str(round(p)) if p < 10 else str(int(5 * round(p / 5)))
def ratio_words(r):
    if r >= 1.15:
        x = round(r * 2) / 2
        return 'about twice' if x == 2 else f'about {x:g} times'
    if r >= 0.87: return 'close to'
    for v, w in [(0.75, 'about three-quarters of'), (2 / 3, 'about two-thirds of'), (0.5, 'about half'), (1 / 3, 'about a third of'),
                 (0.25, 'about a quarter of'), (0.2, 'about a fifth of'), (0.1, 'about a tenth of')]:
        if r >= v * 0.9: return w
    return 'less than a tenth of'


def km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a['lat'], a['lng'], b['lat'], b['lng']))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


# ---- charts (inline SVG, no value labels) ----
def mix_bar(d):
    srcs = [s for s in SOURCES if d.get(s, 0) > 0]
    srcs.sort(key=lambda s: -d[s])
    tot = d['Total']; x = 0; parts = []
    for s in srcs:
        w = d[s] / tot * 100
        parts.append(f'<rect x="{x:.2f}" y="0" width="{w:.2f}" height="18" fill="{COLORS[s]}"/>'); x += w
    legend = ''.join(f'<li><i style="background:{COLORS[s]}"></i>{esc(s)}</li>' for s in srcs if d[s] / tot >= 0.005)   # no figures: rule 1
    return ('<svg class="mix" viewBox="0 0 100 18" preserveAspectRatio="none" role="img" aria-label="Electricity mix">'
            + ''.join(parts) + '</svg><ul class="legend">' + legend + '</ul>')
def line_chart(info, name):
    yrs = sorted(int(y) for y in info['years'] if int(y) >= 2000)
    last = info['years'][str(yrs[-1])]
    top = sorted([s for s in SOURCES if last.get(s, 0) > 0 or max(info['years'][str(y)].get(s, 0) for y in yrs) > 0],
                 key=lambda s: -max(info['years'][str(y)].get(s, 0) for y in yrs))[:6]
    W, H, L, B = 640, 260, 46, 28
    mx = max(info['years'][str(y)].get(s, 0) for y in yrs for s in top) or 1
    step = 10 ** math.floor(math.log10(mx)); step = step * (5 if mx / step > 5 else 2 if mx / step > 2 else 1) / 2
    ticks = [i * step for i in range(math.ceil(mx / step) + 1)]   # the top tick is at or above the highest point
    X = lambda y: L + (y - yrs[0]) / (yrs[-1] - yrs[0]) * (W - L - 110)
    T = 24
    Y = lambda v: T + (1 - v / (ticks[-1] or 1)) * (H - B - T)
    g = ''.join(f'<line x1="{L}" x2="{W - 110}" y1="{Y(t):.1f}" y2="{Y(t):.1f}" class="grid"/><text x="{L - 6}" y="{Y(t) + 4:.1f}" class="ax" text-anchor="end">{sig2(t) if t else 0}</text>' for t in ticks)
    g += ''.join(f'<text x="{X(y):.1f}" y="{H - 8}" class="ax" text-anchor="middle">{y}</text>' for y in yrs if (y - yrs[0]) % 5 == 0 or y == yrs[-1])
    lines, ends = '', []
    for s in top:
        pts = ' '.join(f'{X(y):.1f},{Y(info["years"][str(y)].get(s, 0)):.1f}' for y in yrs)
        lines += f'<polyline fill="none" stroke="{COLORS[s]}" stroke-width="2.2" stroke-linejoin="round" points="{pts}"/>'
        ends.append([Y(last.get(s, 0)), s])
    ends.sort()
    for i in range(1, len(ends)):                       # end labels: 13 px apart, and none below the axis
        if ends[i][0] - ends[i - 1][0] < 13: ends[i][0] = ends[i - 1][0] + 13
    floor = H - B
    for i in range(len(ends) - 1, -1, -1):
        cap = floor if i == len(ends) - 1 else ends[i + 1][0] - 13
        if ends[i][0] > cap: ends[i][0] = cap
    lab = ''.join(f'<text x="{X(yrs[-1]) + 8:.1f}" y="{yv + 4:.1f}" class="lab" fill="{COLORS[s]}">{esc(s)}</text>' for yv, s in ends)
    return (f'<svg class="lines" viewBox="0 0 {W} {H}" role="img" aria-label="{esc(name)} electricity generation by source since {yrs[0]}, in TWh">'
            + g + lines + lab + f'<text x="{L - 6}" y="12" class="ax" text-anchor="end">TWh</text></svg>')


def page(name, info, cards, world, neighbours, preview, built=None):
    y = info['latestYear']; d = info['years'][str(y)]; tot = d['Total']
    srcs = sorted([s for s in SOURCES if d.get(s, 0) > 0], key=lambda s: -d[s])
    first = min(int(k) for k in info['years'] if int(k) >= 2000); d0 = info['years'][str(first)]
    The, the_ = the(name, True), the(name)
    lead, second = srcs[0], srcs[1] if len(srcs) > 1 else None
    fossil = sum(d.get(s, 0) for s in ('Coal', 'Gas', 'Other Fossil')) / tot
    lowc = 1 - fossil
    # sentences
    s_mix = f'{The} generated {twh(tot)} of electricity in {y}. {share_words(d[lead] / tot).capitalize()} came from {src_word(lead)}'
    s_mix += (f', and {share_words(d[second] / tot)} from {src_word(second)}.' if second and d[second] / tot >= 0.05 else '.')
    s_low = (f' Low-carbon sources (nuclear and renewables) supplied {share_words(lowc)} of the total.' if lowc >= 0.05
             else ' Almost all of it came from fossil fuels.')
    r_dpc = info['latestDpc'] / world['dpc'] if world['dpc'] else 1
    s_dpc = f'Each person uses {ratio_words(r_dpc)} the world average amount of electricity.'
    net = d.get('NetImports', 0) or 0
    if net > 0.01 * tot: s_trade = f'{The} is a net importer: about {pct_round(net / (tot + net))}% of the electricity it uses comes from abroad.'
    elif net < -0.01 * tot: s_trade = f'{The} is a net exporter: it sells about {pct_round(-net / tot)}% of what it generates to its neighbours.'
    else: s_trade = f'{The} makes roughly as much electricity as it uses, with little net trade.'
    co2 = d.get('CO2')
    s_co2 = (f'Each kilowatt-hour emits about {int(10 * round(co2 / 10))} grams of CO₂, {ratio_words(co2 / world["co2"])} the world average.'
             if co2 and world['co2'] else '')
    # change since the first year
    ch = []
    for s in SOURCES:
        a, b = d0.get(s, 0) / d0['Total'] if d0.get('Total') else 0, d.get(s, 0) / tot
        if abs(b - a) >= 0.05: ch.append((abs(b - a), s, a, b))
    ch.sort(reverse=True)
    def fromto(a, b): return ('from almost nothing' if a < 0.01 else 'from ' + share_words(a)) + ' to ' + ('almost nothing' if b < 0.01 else share_words(b))
    if ch:
        bits = [f'{src_word(s)} {"rose" if b > a else "fell"} {fromto(a, b)}' for _, s, a, b in ch[:3]]
        s_change = f'Since {first}, ' + (', '.join(bits[:-1]) + ' and ' + bits[-1] if len(bits) > 1 else bits[0]) + ' of the mix.'
        s_change = s_change[0].upper() + s_change[1:]
    else:
        s_change = f'The mix has changed little since {first}.'
    # resources and links from the clue-card data, kept to rounded words
    facts = []
    if cards:
        acc = cards.get('access')
        if acc and acc[0] is not None and acc[0] < 99.5: facts.append(f'About {pct_round(acc[0] / 100)}% of people have electricity at home.')
        sun = cards.get('sun')
        if sun and world.get('sun'):
            yr = sum(v * n for v, n in zip(sun, [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]))
            facts.append(f'Sunshine: {ratio_words(yr / world["sun"])} the world average.')
        if cards.get('rain') and world.get('rain'): facts.append(f'Rainfall: {ratio_words(cards["rain"] / world["rain"])} the world average.')
        nb = ((cards.get('elec') or {}).get('NB') or [])
        names = [x[1] for x in sorted(nb, key=lambda x: -((x[2] or 0) + (x[3] or 0)))[:3] if (x[2] or 0) + (x[3] or 0) > 0]
        if names: facts.append('Biggest power links: ' + ', '.join(the(n) for n in names) + '.')
        ins = ((cards.get('trade') or {}).get('IN') or [])
        if ins: facts.append('Main fuel supplier: ' + the(ins[0][1]) + '.')
    title = f'{name} electricity mix: how {the_} makes its power | Energle'
    desc = f'How {the_} generates its electricity: {share_words(d[lead] / tot)} from {src_word(lead)}, its trade with neighbours, and how its mix has changed since {first}. Then guess a country from its mix in Energle.'
    url = f'{SITE}/country/{slug(name)}/'
    nb_html = ''.join((f'<li><a href="/country/{slug(n)}/">{esc(n)}</a></li>' if built is None or n in built else f'<li>{esc(n)}</li>') for n in neighbours)
    ld = {'@context': 'https://schema.org', '@type': 'WebPage', 'name': title, 'url': url, 'description': desc, 'inLanguage': 'en',
          'isPartOf': {'@id': SITE + '/#site'}, 'about': {'@type': 'Country', 'name': name},
          'breadcrumb': {'@type': 'BreadcrumbList', 'itemListElement': [
              {'@type': 'ListItem', 'position': 1, 'name': 'Energle', 'item': SITE + '/'},
              {'@type': 'ListItem', 'position': 2, 'name': f'{name} electricity', 'item': url}]}}
    robots = '<meta name="robots" content="noindex, nofollow" />' if preview else ''
    return f'''<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{esc(title)}</title>
    <meta name="description" content="{esc(desc)}" />
    {robots}
    <link rel="canonical" href="{url}" />
    <link rel="icon" href="/img/favicon.svg" type="image/svg+xml" />
    <meta name="theme-color" content="#f7f7f5" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="Energle" />
    <meta property="og:url" content="{url}" />
    <meta property="og:title" content="{esc(f'How {the_} makes its electricity')}" />
    <meta property="og:description" content="{esc(desc)}" />
    <meta property="og:image" content="{SITE}/img/og-image.png" />
    <script type="application/ld+json">{json.dumps(ld, ensure_ascii=False, separators=(',', ':'))}</script>
    <link rel="stylesheet" href="/country/country.css" />
  </head>
  <body>
    <div class="wrap">
      <header>
        <a class="brand" href="/"><img src="/img/favicon.svg" alt="" width="24" height="24" />Energle</a>
        <a class="play" href="/">Play today’s puzzle</a>
      </header>
      <div class="shield" id="shield" hidden>
        <p><b>You have today’s puzzle in progress.</b> This page could spoil it.</p>
        <div><a class="play" href="/">Finish today’s puzzle</a><button type="button" id="shield-off">Show anyway</button></div>
      </div>
      <main id="content">
        <p class="crumb"><a href="/">Energle</a> › Countries › {esc(name)}</p>
        <h1>How {esc(the_)} makes its electricity</h1>
        <p class="lead">{esc(s_mix)}{esc(s_low)}</p>

        <section>
          <h2>The mix in {y}</h2>
          {mix_bar(d)}
          <p>{esc(s_dpc)} {esc(s_co2)}</p>
        </section>

        <section>
          <h2>Since {first}</h2>
          {line_chart(info, name)}
          <p>{esc(s_change)}</p>
        </section>

        <section>
          <h2>Trade and resources</h2>
          <p>{esc(s_trade)}</p>
          {('<ul class="facts">' + ''.join(f'<li>{esc(f)}</li>' for f in facts) + '</ul>') if facts else ''}
        </section>

        <div class="cta">
          <p><b>Could you recognise {esc(the_)} from its electricity alone?</b> Every day, Energle shows one country’s energy profile, and you have six guesses to name it.</p>
          <a class="play" href="/">Play today’s Energle</a>
        </div>

        <section>
          <h2>Nearby countries</h2>
          <ul class="near">{nb_html}</ul>
        </section>
      </main>
      <footer>
        <p>Figures are rounded. Electricity data: <a href="https://ember-energy.org/data/yearly-electricity-data/" rel="noopener">Yearly Electricity Data | Ember</a> (CC BY 4.0), {y}. Other data: World Bank, NASA, ENTSO-E, CEPII. <a href="/about/">About Energle</a></p>
      </footer>
    </div>
    <script>
      // the spoiler shield: the same on every country page, shown only while today's daily is unfinished in this browser
      (function () {{
        try {{
          var s = JSON.parse(localStorage.getItem('energle_daily_v1') || 'null');
          var now = new Date(), day = Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - Date.UTC(2026, 5, 2)) / 86400000) + 1;
          if (s && s.day === day && !s.gameOver && sessionStorage.getItem('energle_shield_off') !== String(day)) {{
            document.getElementById('shield').hidden = false; document.body.classList.add('shielded');
            document.getElementById('shield-off').onclick = function () {{ sessionStorage.setItem('energle_shield_off', String(day)); document.getElementById('shield').hidden = true; document.body.classList.remove('shielded'); }};
          }}
        }} catch (e) {{}}
      }})();
    </script>
  </body>
</html>
'''


def display_names():
    """The game's everyday names ('Russia', not 'Russian Federation (the)'), read from js/script.js so both stay in step."""
    js = open(os.path.join(ROOT, 'js', 'script.js'), encoding='utf-8').read()
    block = js[js.index('const DISPLAY_NAMES = {'):]; block = block[:block.index('};')]
    return {a or b: c for a, b, c in re.findall(r"(?:'([^']+)'|\"([^\"]+)\")\s*:\s*'([^']+)'", block)}


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--preview', action='store_true'); ap.add_argument('names', nargs='*')
    a = ap.parse_args()
    raw = json.load(open(os.path.join(ROOT, 'data', 'energle_data.json'), encoding='utf-8'))
    dn = display_names()
    data = {dn.get(k, k): v for k, v in raw.items()}
    cards = json.load(open(os.path.join(ROOT, 'data', 'cards.json'), encoding='utf-8'))
    wd = data.pop('__world_dpc__')
    latest = max(v['latestYear'] for v in data.values())
    g = e = 0
    for v in data.values():
        dd = v['years'].get(str(latest))
        if dd and dd.get('CO2') is not None and dd.get('Total'): g += dd['Total']; e += dd['CO2'] * dd['Total']
    wc = cards.get('world', {}).get('cards', {})
    world = {'dpc': wd.get(str(latest)) or list(wd.values())[-1], 'co2': e / g if g else None, 'sun': wc.get('sunYear'), 'rain': wc.get('rain')}
    names = a.names or sorted(data)
    out = os.path.join(ROOT, 'country')
    for n in names:
        info = data[n]
        near = sorted((x for x in data if x != n), key=lambda x: km(info, data[x]))[:6]
        p = os.path.join(out, slug(n)); os.makedirs(p, exist_ok=True)
        with open(os.path.join(p, 'index.html'), 'w', encoding='utf-8') as f:
            f.write(page(n, info, cards['countries'].get(info['iso3']), world, near, a.preview, set(names) if a.names else None))
    print(f'{len(names)} page(s) written to country/')


if __name__ == '__main__':
    main()
