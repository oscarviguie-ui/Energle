"""
USGS Mineral Commodity Summaries (public domain) - one release a year, usually late January.

Feeds:  Underground Riches  "Transition minerals": reserves and world rank (reserves, mine output) for
                            lithium, cobalt, nickel, copper, graphite, rare earths, manganese, platinum metals

The figures come from the MCS data release on ScienceBase (a CSV of world mine production and
reserves by country). The monthly job only re-reads it when a newer release year is out.
Country names are USGS's own ("Congo (Kinshasa)", "Burma"...); NAMES maps the ones that differ.
"""
import csv
import io
import re

from .common import get, get_json, r, today

CADENCE = 'yearly'
CATALOG = 'https://www.sciencebase.gov/catalog/items'
ITEM = 'https://www.sciencebase.gov/catalog/item/{id}'

# card symbol -> (pattern for the USGS commodity name, unit the card shows, factor from the USGS unit to it)
MINERALS = {
    'Li':  (r'^lithium',                       't'),
    'Co':  (r'^cobalt',                        't'),
    'Ni':  (r'^nickel',                        't'),
    'Cu':  (r'^copper',                        'Mt'),
    'C':   (r'^graphite',                      't'),
    'REE': (r'^rare earths',                   't'),
    'Mn':  (r'^manganese',                     'Mt'),
    'PGM': (r'^platinum[- ]group|^platinum',   't'),
}
# USGS unit text -> tonnes
UNIT_T = [(r'thousand metric tons|thousand tons|kmt', 1e3), (r'million metric tons|million tons', 1e6),
          (r'kilograms|\bkg\b', 1e-3), (r'metric tons|tons|\bmt\b|\bt\b', 1.0)]
NAMES = {
    'burma': 'MMR', 'congo (kinshasa)': 'COD', 'congo (brazzaville)': 'COG', 'korea, north': 'PRK', 'korea, republic of': 'KOR',
    'south korea': 'KOR', 'north korea': 'PRK', 'russia': 'RUS', 'united states': 'USA', 'united kingdom': 'GBR', 'iran': 'IRN',
    'turkey': 'TUR', 'turkiye': 'TUR', 'vietnam': 'VNM', 'laos': 'LAO', 'tanzania': 'TZA', 'bolivia': 'BOL', 'venezuela': 'VEN',
    'cote d\'ivoire': 'CIV', "côte d'ivoire": 'CIV', 'czechia': 'CZE', 'czech republic': 'CZE', 'syria': 'SYR', 'moldova': 'MDA',
    'macedonia': 'MKD', 'north macedonia': 'MKD', 'kyrgyzstan': 'KGZ', 'brunei': 'BRN', 'taiwan': 'TWN', 'eswatini': 'SWZ',
}


def _iso_of(name, lookup):
    n = re.sub(r'\s*\d+$', '', name.strip().lower())            # footnote numbers
    n = re.sub(r'\s*\(.*?\)$', '', n) if n not in NAMES else n
    return NAMES.get(n) or lookup.get(n)


def _to_tonnes(unit):
    u = (unit or '').lower()
    for pat, f in UNIT_T:
        if re.search(pat, u):
            return f
    return None


def _num(v):
    v = str(v or '').replace(',', '').strip()
    if not v or v.upper() in ('NA', 'W', 'XX', '—', '-', '--'):
        return None
    m = re.match(r'^[<>~]?\s*(-?\d+(\.\d+)?)', v)
    return float(m.group(1)) if m else None


def find_release(min_year):
    """(year, csv url) of the newest MCS data release with a world data CSV."""
    for year in range(today().year + 1, min_year - 1, -1):
        hits = get_json(CATALOG, {'q': 'Mineral Commodity Summaries %d data release' % year, 'format': 'json', 'max': 10, 'fields': 'title,id'})
        for it in hits.get('items', []):
            if str(year) not in it.get('title', '') or 'ineral' not in it.get('title', ''):
                continue
            item = get_json(ITEM.format(id=it['id']), {'format': 'json'})
            files = list(item.get('files', [])) + [f for ex in item.get('facets', []) for f in ex.get('files', [])]
            for f in files:
                name = f.get('name', '')
                if name.lower().endswith('.csv') and re.search(r'world', name, re.I):
                    return year, f.get('url') or f.get('downloadUri')
    return None, None


def build(countries, state=None, log=print):
    state = state or {}
    year, url = find_release(2024)
    if not url:
        raise RuntimeError('no USGS MCS world data CSV found on ScienceBase')
    if state.get('release') == year and not state.get('refresh'):
        log('  usgs: MCS %s already read, skipped' % year)
        return None, None
    text = get(url, timeout=120).content.decode('utf-8-sig', errors='replace')
    rows = list(csv.DictReader(io.StringIO(text)))
    if not rows:
        raise RuntimeError('USGS CSV is empty')
    cols = {c.lower(): c for c in rows[0].keys()}
    c_comm = next(cols[k] for k in cols if 'commodity' in k)
    c_country = next(cols[k] for k in cols if k.startswith('country'))
    c_type = next((cols[k] for k in cols if k in ('type', 'stat_type', 'mine_type')), None)
    c_unit = next((cols[k] for k in cols if 'unit' in k), None)
    prod_cols = sorted([cols[k] for k in cols if k.startswith('prod')], key=lambda c: re.sub(r'\D', '', c))
    res_cols = sorted([cols[k] for k in cols if k.startswith('reserve')], key=lambda c: re.sub(r'\D', '', c))
    if not prod_cols or not res_cols:
        raise RuntimeError('USGS CSV columns not recognised: %s' % list(rows[0].keys()))
    p_col, rs_col = prod_cols[-1], res_cols[-1]
    log('  usgs MCS %d: %d rows; production column %s, reserves column %s' % (year, len(rows), p_col, rs_col))
    lookup = {v['name'].lower(): iso for iso, v in countries.items()}
    out, world = {}, {}
    for sym, (pat, unit) in MINERALS.items():
        rx = re.compile(pat, re.I)
        mine = [row for row in rows if rx.search(row[c_comm] or '') and (not c_type or re.search(r'mine|production', row[c_type] or '', re.I) or not row[c_type])]
        if not mine:
            log('  usgs %s: no rows for /%s/' % (sym, pat)); continue
        per = {}
        for row in mine:
            iso = _iso_of(row[c_country] or '', lookup)
            f = _to_tonnes(row.get(c_unit) if c_unit else '')
            if not iso or iso not in countries or f is None:
                continue
            p, rs = _num(row.get(p_col)), _num(row.get(rs_col))
            per[iso] = (p * f if p is not None else None, rs * f if rs is not None else None)
        to_card = 1e-6 if unit == 'Mt' else 1.0
        rk_res = {iso: i + 1 for i, (iso, _) in enumerate(sorted([(i, v[1]) for i, v in per.items() if v[1]], key=lambda x: -x[1]))}
        rk_out = {iso: i + 1 for i, (iso, _) in enumerate(sorted([(i, v[0]) for i, v in per.items() if v[0]], key=lambda x: -x[1]))}
        for iso, (p, rs) in per.items():
            if not rs and not p:
                continue
            out.setdefault(iso, {})[sym] = {'reserves': r(rs * to_card, 3) if rs else None, 'unit': unit,
                                            'rank_reserves': rk_res.get(iso), 'rank_output': rk_out.get(iso), 'year': year}
        world[sym] = {'countries': len(per)}
        log('  usgs %-3s %d countries' % (sym, len(per)))
    return out, {'release': year, 'world': world}
