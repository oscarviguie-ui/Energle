"""Build one page per country: energle.org/country/<slug>/

Each page is Energle itself, opened on Explore with that country picked (window.ENERGLE_COUNTRY, handled in
globe/globe.js). Until today's puzzle is finished in that browser, the profile stays locked and the page shows only
a few sentences about the country, in words with no figures at all; search engines see just those words. Once
the puzzle is done, the full Explore profile opens, exactly as in the game.
No ranking or "countries by share" pages: each page is about one country.

Usage:
  python scripts/build_country_pages.py                  # every country, indexable, plus the index and the sitemap
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
        x = round(r) if r >= 5 else round(r * 2) / 2
        return 'a little more than' if x <= 1 else 'about twice' if x == 2 else f'about {x:g} times'
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


# ---- words only (no figures at all): what the page says to search engines and to anyone who hasn't played today ----
def use_words(r):
    """Electricity use per person against the world average, in words."""
    return ('far more electricity than' if r >= 2 else 'more electricity than' if r >= 1.2 else 'about as much electricity as' if r >= 0.83
            else 'less electricity than' if r >= 0.5 else 'far less electricity than')
PLURAL = {'Other Fossil', 'Other Renewables'}
def has(srcs): return ' have' if len(srcs) > 1 or srcs[0] in PLURAL else ' has'
def words(name, info, world):
    y = info['latestYear']; d = info['years'][str(y)]; tot = d['Total']
    The, the_ = the(name, True), the(name)
    srcs = sorted([s for s in SOURCES if d.get(s, 0) > 0], key=lambda s: -d[s]); sh = {s: d[s] / tot for s in srcs}
    a = srcs[0]; b = srcs[1] if len(srcs) > 1 else None
    if sh[a] >= 0.97: mix = f'{The} makes almost all of its electricity from {src_word(a)}.'
    elif sh[a] >= 0.6: mix = f'{The} makes most of its electricity from {src_word(a)}' + (f', with {src_word(b)} a distant second.' if b and sh[b] >= 0.08 else '.')
    elif sh[a] >= 0.45: mix = f'{The} makes about half of its electricity from {src_word(a)}' + (f', followed by {src_word(b)}.' if b and sh[b] >= 0.08 else '.')
    elif b and sh[b] >= 0.2: mix = f'{The} makes its electricity mainly from {src_word(a)} and {src_word(b)}.'
    else: mix = f'{src_word(a).capitalize()} is the largest source of {the_}' + ('’' if name.endswith('s') else '’s') + f' electricity, ahead of {src_word(b)}.' if b else f'{The} makes its electricity from {src_word(a)}.'
    rest = [s for s in srcs[2:] if sh[s] >= 0.05]
    if rest and sh[a] < 0.97: mix += ' ' + ' and '.join(src_word(s).capitalize() if i == 0 else src_word(s) for i, s in enumerate(rest[:2])) + (' add a smaller share.' if len(rest[:2]) > 1 or rest[0] in PLURAL else ' adds a smaller share.')
    lowc = 1 - sum(sh.get(s, 0) for s in ('Coal', 'Gas', 'Other Fossil'))
    clean = ('' if sh[a] >= 0.97 and lowc < 0.1 else 'Almost all of its power is low-carbon.' if lowc >= 0.9 else 'Most of its power is low-carbon.' if lowc >= 0.6
             else 'Roughly half of its power is low-carbon.' if lowc >= 0.4 else 'Fossil fuels still supply most of its power.' if lowc >= 0.1
             else 'Almost all of its power comes from fossil fuels.')
    co2 = d.get('CO2')
    if co2 and world.get('co2'):
        r = co2 / world['co2']
        clean = (clean + ' ' + ('Its electricity is far cleaner than the world average.' if r < 0.5 else 'Its electricity is cleaner than the world average.' if r < 0.83
                  else 'Its electricity is about as carbon-intensive as the world average.' if r < 1.2 else 'Its electricity is more carbon-intensive than the world average.')).strip()
    use = f'Each person uses {use_words(info["latestDpc"] / world["dpc"])} the world average.' if world.get('dpc') else ''
    net = d.get('NetImports', 0) or 0
    trade = ('It relies heavily on electricity bought from its neighbours.' if net > 0.25 * (tot + net) else 'It buys some of its electricity from its neighbours.' if net > 0.05 * (tot + net)
             else 'It sells a large share of its electricity to its neighbours.' if -net > 0.25 * tot else 'It sells some of its electricity to its neighbours.' if -net > 0.05 * tot
             else 'It makes about as much electricity as it uses.')
    first = min(int(k) for k in info['years'] if int(k) >= 2000); d0 = info['years'][str(first)]
    ch = sorted(((d.get(s, 0) / tot - (d0.get(s, 0) / d0['Total'] if d0.get('Total') else 0), s, d0.get(s, 0) / d0['Total'] if d0.get('Total') else 0) for s in SOURCES), key=lambda x: -abs(x[0]))
    ups = [(s, a0) for dlt, s, a0 in ch if dlt >= 0.05][:2]; downs = [s for dlt, s, a0 in ch if dlt <= -0.05][:2]
    parts = []
    if ups: parts.append(' and '.join(src_word(s) for s, _ in ups) + has([s for s, _ in ups]) + (' grown from almost nothing' if all(a0 < 0.01 for _, a0 in ups) else ' grown'))
    if downs: parts.append(' and '.join(src_word(s) for s in downs) + has(downs) + ' declined')
    change = ('Over the past two decades, ' + ', while '.join(parts) + '.') if parts else 'Its mix has changed little over the past two decades.'
    return mix, ' '.join(x for x in (clean, use, trade) if x), change


def page(name, info, world, preview, template):
    """The page is Energle itself, opened on Explore with this country picked (window.ENERGLE_COUNTRY). Until today's
    puzzle is finished, the profile is locked and only the words show; search engines see the words only."""
    mix, facts, change = words(name, info, world)
    The, the_ = the(name, True), the(name)
    title = f'{name} electricity mix: how {the_} makes its power | Energle'
    desc = f'{mix} {change} Explore {the_} on Energle’s globe, then guess a country from its electricity mix.'
    url = f'{SITE}/country/{slug(name)}/'
    ld = {'@context': 'https://schema.org', '@type': 'WebPage', 'name': title, 'url': url, 'description': desc, 'inLanguage': 'en',
          'isPartOf': {'@id': SITE + '/#site'}, 'about': {'@type': 'Country', 'name': name},
          'breadcrumb': {'@type': 'BreadcrumbList', 'itemListElement': [
              {'@type': 'ListItem', 'position': 1, 'name': 'Energle', 'item': SITE + '/'},
              {'@type': 'ListItem', 'position': 2, 'name': 'Countries', 'item': SITE + '/country/'},
              {'@type': 'ListItem', 'position': 3, 'name': f'{name} electricity', 'item': url}]}}
    h = template
    head = (f'<title>{esc(title)}</title>\n    <meta name="description" content="{esc(desc)}" />\n'
            + ('    <meta name="robots" content="noindex, nofollow" />\n' if preview else '')
            + f'    <link rel="canonical" href="{url}" />\n    <base href="/" />')
    h = re.sub(r'<title>.*?</title>\s*<meta name="description" content="[^"]*" />\s*<link rel="canonical" href="[^"]*" />', head, h, flags=re.S)
    for prop, val in (('og:url', url), ('og:title', f'How {the_} makes its electricity'), ('og:description', desc), ('og:type', 'article')):
        h = re.sub(r'<meta property="' + prop + r'" content="[^"]*" />', f'<meta property="{prop}" content="{esc(val)}" />', h)
    for prop, val in (('twitter:title', f'How {the_} makes its electricity'), ('twitter:description', desc)):
        h = re.sub(r'<meta name="' + prop + r'" content="[^"]*" />', f'<meta name="{prop}" content="{esc(val)}" />', h)
    h = re.sub(r'<script type="application/ld\+json">.*?</script>', '<script type="application/ld+json">' + json.dumps(ld, ensure_ascii=False, separators=(',', ':')) + '</script>', h, flags=re.S)
    h = h.replace('<script>window.GLOBE_PAGE = true;', f'<script>window.GLOBE_PAGE = true; window.ENERGLE_COUNTRY = {json.dumps(info["iso3"])};', 1)
    words_html = (f'\n    <section id="cp-words" class="cp-words" aria-labelledby="cp-h1">\n      <h1 id="cp-h1">How {esc(the_)} makes its electricity</h1>\n'
                  f'      <p>{esc(mix)} {esc(facts)}</p>\n      <p>{esc(change)}</p>\n    </section>')
    h = h.replace('  <body>', '  <body>' + words_html, 1)
    assert 'ENERGLE_COUNTRY' in h and 'cp-words' in h and '<base href="/" />' in h, name
    return h


def display_names():
    """The game's everyday names ('Russia', not 'Russian Federation (the)'), read from js/script.js so both stay in step."""
    js = open(os.path.join(ROOT, 'js', 'script.js'), encoding='utf-8').read()
    block = js[js.index('const DISPLAY_NAMES = {'):]; block = block[:block.index('};')]
    return {a or b: c for a, b, c in re.findall(r"(?:'([^']+)'|\"([^\"]+)\")\s*:\s*'([^']+)'", block)}


def continents():
    """The game's continent per ISO3 code, read from js/script.js."""
    js = open(os.path.join(ROOT, 'js', 'script.js'), encoding='utf-8').read()
    block = js[js.index('const ISO3_CONTINENT = {'):]; block = block[:block.index('};')]
    return {'TUR': 'Europe', **dict(re.findall(r"'([A-Z]{3})'\s*:\s*'([^']+)'", block))}   # Turkey: missing from the game's table


CONT_ORDER = ['Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania']
def index_page(data, preview, template):
    """energle.org/country/: Energle's Explore on the whole world, with every country listed by continent (names
    only, no figures, no ranking). Picking a country opens its page."""
    cont = continents(); groups = {}
    for n in sorted(data, key=lambda x: unicodedata.normalize('NFKD', x).lower()):
        groups.setdefault(data[n].get('continent') or cont.get(data[n]['iso3']) or 'Other', []).append(n)
    order = [c for c in CONT_ORDER if c in groups] + [c for c in groups if c not in CONT_ORDER]
    secs = ''.join(f'\n      <h2>{esc(c)}</h2>\n      <ul class="az">' + ''.join(f'<li><a href="/country/{slug(n)}/">{esc(n)}</a></li>' for n in groups[c]) + '</ul>' for c in order)
    title = 'Electricity by country: how every country makes its power | Energle'
    desc = f'How {len(data)} countries make their electricity: the mix of sources, how it has changed, and what each trades with its neighbours. Explore them on Energle’s globe, then guess a country from its mix.'
    url = SITE + '/country/'
    ld = {'@context': 'https://schema.org', '@type': 'CollectionPage', 'name': title, 'url': url, 'description': desc, 'isPartOf': {'@id': SITE + '/#site'}, 'inLanguage': 'en'}
    h = template
    head = (f'<title>{esc(title)}</title>\n    <meta name="description" content="{esc(desc)}" />\n'
            + ('    <meta name="robots" content="noindex, nofollow" />\n' if preview else '')
            + f'    <link rel="canonical" href="{url}" />\n    <base href="/" />')
    h = re.sub(r'<title>.*?</title>\s*<meta name="description" content="[^"]*" />\s*<link rel="canonical" href="[^"]*" />', head, h, flags=re.S)
    for prop, val in (('og:url', url), ('og:title', 'Electricity by country'), ('og:description', desc)):
        h = re.sub(r'<meta property="' + prop + r'" content="[^"]*" />', f'<meta property="{prop}" content="{esc(val)}" />', h)
    for prop, val in (('twitter:title', 'Electricity by country'), ('twitter:description', desc)):
        h = re.sub(r'<meta name="' + prop + r'" content="[^"]*" />', f'<meta name="{prop}" content="{esc(val)}" />', h)
    h = re.sub(r'<script type="application/ld\+json">.*?</script>', '<script type="application/ld+json">' + json.dumps(ld, ensure_ascii=False, separators=(',', ':')) + '</script>', h, flags=re.S)
    h = h.replace('<script>window.GLOBE_PAGE = true;', '<script>window.GLOBE_PAGE = true; window.ENERGLE_COUNTRY = "*";', 1)
    words_html = (f'\n    <section id="cp-words" class="cp-words" aria-labelledby="cp-h1">\n      <h1 id="cp-h1">Electricity by country</h1>\n'
                  f'      <p>How {len(data)} countries make their electricity: the mix of sources, how it has changed over the past two decades, and what each country trades with its neighbours. Pick a country on the globe or in the list.</p>'
                  + secs + '\n    </section>')
    h = h.replace('  <body>', '  <body>' + words_html, 1)
    return h


def write_sitemap(names):
    today = date.today().isoformat()
    urls = [(SITE + '/', 'daily', '1.0', None), (SITE + '/about/', 'monthly', '0.7', today), (SITE + '/country/', 'monthly', '0.7', today)]
    urls += [(f'{SITE}/country/{slug(n)}/', 'monthly', '0.6', today) for n in sorted(names)]
    body = ''.join(f'  <url><loc>{u}</loc>' + (f'<lastmod>{m}</lastmod>' if m else '') + f'<changefreq>{c}</changefreq><priority>{p}</priority></url>\n' for u, c, p, m in urls)
    with open(os.path.join(ROOT, 'sitemap.xml'), 'w', encoding='utf-8') as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + body + '</urlset>\n')


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
    template = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
    out = os.path.join(ROOT, 'country')
    for n in names:
        info = data[n]
        p = os.path.join(out, slug(n)); os.makedirs(p, exist_ok=True)
        with open(os.path.join(p, 'index.html'), 'w', encoding='utf-8') as f:
            f.write(page(n, info, world, a.preview, template))
    if not a.names:                                     # the full set: the index, and the sitemap
        with open(os.path.join(out, 'index.html'), 'w', encoding='utf-8') as f: f.write(index_page(data, a.preview, template))
        if not a.preview: write_sitemap(names)
    print(f'{len(names)} page(s) written to country/')


if __name__ == '__main__':
    main()
