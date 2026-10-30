"""
OPEC Annual Statistical Bulletin (free PDF, a new edition every spring with end-of-last-year figures) -
checked every month, re-read only when a newer edition is out.

Feeds:  Underground Riches  proven crude oil and natural gas reserves for the countries the bulletin lists
                            one by one (every major holder, OPEC member or not). Smaller holders, which
                            the bulletin groups as "others", keep their CIA World Factbook figure
                            (factbook.py): those barely move from year to year.

Read from the two tables "World proven crude oil reserves by country" (million barrels) and
"World proven natural gas reserves by country" (billion standard cubic metres); the last column is the
latest year-end.
"""
import io
import os
import re

from .common import DATA_DIR, get, r, today

CADENCE = 'yearly'
URLS = ['https://publications.opec.org/ASSETS/assetdb/asb-{y}.pdf', 'https://www.opec.org/assets/assetdb/asb-{y}.pdf']
HEADERS = {'User-Agent': 'Mozilla/5.0 (energle.org data refresh; +https://energle.org)'}
TITLES = {'oil': r'world\s+proven\s+crude\s+oil\s+reserves\s+by\s+country', 'gas': r'world\s+proven\s+natural\s+gas\s+reserves\s+by\s+country'}
SKIP = re.compile(r'^(total|others?|opec|non-opec|oecd|non-oecd|world|north america|latin america|eastern europe|western europe|'
                  r'middle east|africa|asia|of which|share|notes?|source|table|\d)', re.I)
ALIASES = {'ir iran': 'IRN', 'iran': 'IRN', 'us': 'USA', 'united states': 'USA', 'uk': 'GBR', 'united kingdom': 'GBR', 'russia': 'RUS',
           'venezuela': 'VEN', 'bolivia': 'BOL', 'syria': 'SYR', 'syrian arab republic': 'SYR', 'vietnam': 'VNM', 'brunei': 'BRN',
           'congo': 'COG', 'dr congo': 'COD', 'united arab emirates': 'ARE', 'uae': 'ARE', 'turkey': 'TUR', 'türkiye': 'TUR',
           "côte d'ivoire": 'CIV', 'cote d\'ivoire': 'CIV', 'trinidad & tobago': 'TTO', 'papua new guinea': 'PNG', 'south korea': 'KOR'}
ROW = re.compile(r"^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .,&'()/-]*?)\s+((?:[\d,]+(?:\.\d+)?|na|n\.a\.|–|-)\s+)*([\d,]+(?:\.\d+)?)\s*$")


def fetch_pdf(log):
    for y in (today().year, today().year - 1):
        for u in URLS:
            url = u.format(y=y)
            try:
                res = get(url, timeout=240, headers=HEADERS, tries=2)
                if res.content[:4] == b'%PDF':
                    return y, url, res.content
                log('  opec: %s did not return a PDF' % url)
            except Exception as err:      # noqa: BLE001
                log('  opec: %s: %s' % (url, str(err)[:120]))
    return None, None, None


def table_pages(pdf_bytes):
    import pdfplumber
    found = {'oil': [], 'gas': []}
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ''
            head = ' '.join(text.split('\n')[:6]).lower()
            for f, pat in TITLES.items():
                if re.search(pat, head):
                    found[f].append(text)
    return found


def parse(texts, lookup, pycountry):
    out = {}
    for text in texts:
        for line in text.split('\n'):
            line = line.strip()
            m = ROW.match(line)
            if not m or SKIP.match(m.group(1).strip()):
                continue
            name = re.sub(r'\s+\d+$', '', m.group(1).strip()).strip(' .')
            key = name.lower()
            iso = ALIASES.get(key) or lookup.get(key)
            if not iso and pycountry:
                try:
                    iso = pycountry.countries.lookup(name).alpha_3
                except LookupError:
                    iso = None
            if iso:
                out[iso] = float(m.group(3).replace(',', ''))
    return out


def build(countries, state=None, log=print):
    state = state or {}
    year, url, pdf = fetch_pdf(log)
    if not pdf:
        raise RuntimeError('no OPEC Annual Statistical Bulletin PDF could be downloaded')
    if state.get('edition') == year and not state.get('refresh'):
        log('  opec: ASB %d already read, skipped' % year)
        return None, None
    pages = table_pages(pdf)
    with open(os.path.join(DATA_DIR, 'opec_debug.txt'), 'w', encoding='utf-8') as f:   # what was read, for checking the parser
        for k, v in pages.items():
            f.write('==== %s: %d page(s)\n%s\n' % (k, len(v), '\n----\n'.join(v)[:12000]))
    lookup = {v['name'].lower(): iso for iso, v in countries.items()}
    try:
        import pycountry
    except ImportError:
        pycountry = None
    oil = parse(pages['oil'], lookup, pycountry)      # million barrels
    gas = parse(pages['gas'], lookup, pycountry)      # billion standard m3
    log('  opec ASB %d (%s): oil reserves for %d countries, gas for %d' % (year, url, len(oil), len(gas)))
    if len(oil) < 20 or len(gas) < 20:
        raise RuntimeError('OPEC tables read badly (oil %d, gas %d countries): see data/opec_debug.txt' % (len(oil), len(gas)))
    data_year = year - 1                               # the 2026 edition gives end-2025 reserves
    out = {}
    for iso, v in oil.items():
        out.setdefault(iso, {})['oil'] = {'value': r(v / 1000, 3), 'year': data_year}     # bn barrels
    for iso, v in gas.items():
        out.setdefault(iso, {})['gas'] = {'value': r(v / 1000, 4), 'year': data_year}     # tn m3
    return {k: v for k, v in out.items() if k in countries}, {'edition': year, 'year': data_year}
