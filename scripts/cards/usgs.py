"""
USGS Mineral Commodity Summaries (public domain) - one release a year, usually late January;
checked every month, re-read only when a newer release is out.

Feeds:  Underground Riches  "Transition minerals": reserves and world rank (reserves, mine output) for
                            lithium, cobalt, nickel, copper, graphite, rare earths, manganese, platinum metals

Source file: MCS<year>_Commodities_Data.csv in the "Mineral Commodity Summaries <year> Data Release"
item on ScienceBase. Columns: MCS chapter, Section, Commodity, Country, Statistics, Statistics_detail,
Unit, Year, Value, Notes... The "World Mine Production and Reserves" rows carry what the card needs.
"""
import csv
import io
import re

from .common import get, get_json, r, today

CADENCE = 'yearly'
CATALOG = 'https://www.sciencebase.gov/catalog/items'
ITEM = 'https://www.sciencebase.gov/catalog/item/{id}'

# card symbol -> (USGS commodity name, unit the card shows)
MINERALS = {
    'Li': ('Lithium', 't'), 'Co': ('Cobalt', 't'), 'Ni': ('Nickel', 't'), 'Cu': ('Copper', 'Mt'),
    'C': ('Graphite (Natural)', 't'), 'REE': ('Rare Earths', 't'), 'Mn': ('Manganese', 'Mt'), 'PGM': ('Platinum-Group Metals', 't'),
}
PGM_OUTPUT = ('Platinum', 'Palladium')       # PGM mine output is published under the two metals
def unit_t(unit):
    """Tonnes per unit: 'metric tons', 'thousand metric tons', 'metric tons of rare-earth-oxide equivalent', 'kilograms'..."""
    u = (unit or '').strip().lower()
    if u.startswith('kilogram'):
        return 1e-3
    if 'metric' in u and 'ton' in u and 'carat' not in u:
        return 1e6 if u.startswith('million') else 1e3 if u.startswith('thousand') else 1.0
    return None
NAMES = {
    'burma': 'MMR', 'congo (kinshasa)': 'COD', 'congo (brazzaville)': 'COG', 'korea, north': 'PRK', 'korea, republic of': 'KOR',
    'russia': 'RUS', 'united states': 'USA', 'united kingdom': 'GBR', 'iran': 'IRN', 'turkey': 'TUR', 'turkiye': 'TUR', 'türkiye': 'TUR',
    'vietnam': 'VNM', 'laos': 'LAO', 'tanzania': 'TZA', 'bolivia': 'BOL', 'venezuela': 'VEN', "côte d’ivoire": 'CIV', "cote d'ivoire": 'CIV',
    "côte d'ivoire": 'CIV', 'czechia': 'CZE', 'syria': 'SYR', 'moldova': 'MDA', 'north macedonia': 'MKD', 'kyrgyzstan': 'KGZ',
    'brunei': 'BRN', 'taiwan': 'TWN', 'eswatini': 'SWZ', 'new caledonia': 'NCL', 'greenland': 'GRL',
}


def find_release():
    """(year, url) of the newest MCS data release with the commodities CSV."""
    for year in range(today().year + 1, today().year - 3, -1):
        hits = get_json(CATALOG, {'q': 'Mineral Commodity Summaries %d Data Release' % year, 'format': 'json', 'max': 20, 'fields': 'title,id'})
        for it in hits.get('items', []):
            if not re.match(r'^Mineral Commodity Summaries %d Data Release' % year, it.get('title', ''), re.I):
                continue
            item = get_json(ITEM.format(id=it['id']), {'format': 'json'})
            for f in item.get('files', []):
                if re.match(r'^MCS%d_Commodities_Data\.csv$' % year, f.get('name', ''), re.I):
                    return year, f.get('url') or f.get('downloadUri')
    return None, None


def _num(v):
    v = str(v or '').replace(',', '').strip()
    m = re.match(r'^[<>~]?\s*(\d+(\.\d+)?)$', v)
    return float(m.group(1)) if m else None              # '—', 'W', 'NA', 'XX', '' -> None


def build(countries, state=None, log=print):
    state = state or {}
    year, url = find_release()
    if not url:
        raise RuntimeError('no MCS Commodities_Data.csv found on ScienceBase')
    if state.get('release') == year and not state.get('refresh'):
        log('  usgs: MCS %s already read, skipped' % year)
        return None, None
    raw = get(url, timeout=180).content
    try:
        text = raw.decode('utf-8-sig')
    except UnicodeDecodeError:
        text = raw.decode('cp1252')
    rows = [row for row in csv.DictReader(io.StringIO(text)) if (row.get('Section') or '').startswith('World')]
    log('  usgs MCS %d: %d world production / reserves rows' % (year, len(rows)))
    lookup = {v['name'].lower(): iso for iso, v in countries.items()}
    try:
        import pycountry
    except ImportError:
        pycountry = None

    def iso_of(name):
        n = re.sub(r'\s*\d+$', '', (name or '').strip()).lower()
        iso = NAMES.get(n) or lookup.get(n)
        if not iso and pycountry and n and not n.startswith(('world', 'other', 'total')):
            try:
                iso = pycountry.countries.lookup(n).alpha_3
            except LookupError:
                iso = None
        return iso

    out, world = {}, {}
    for sym, (comm, unit) in MINERALS.items():
        prod, res = {}, {}                  # iso -> {year: {detail: tonnes}}
        names = (comm,) + (PGM_OUTPUT if sym == 'PGM' else ())
        for row in rows:
            if row.get('Commodity') not in names:
                continue
            iso = iso_of(row.get('Country'))
            f = unit_t(row.get('Unit'))
            v = _num(row.get('Value'))
            detail = (row.get('Statistics_detail') or '').strip().lower()
            if not iso or f is None or v is None or 'rounded' in detail:
                continue
            y = int(re.sub(r'\D', '', row.get('Year') or '0')[:4] or 0)
            stat = row.get('Statistics') or ''
            if stat == 'Production' and detail.startswith('mine production'):
                prod.setdefault(iso, {}).setdefault(y, {})[row['Commodity'] + detail] = v * f
            elif stat == 'Reserves' and row.get('Commodity') == comm:
                res.setdefault(iso, {}).setdefault(y, {})[detail] = v * f

        def latest(d, add):
            y = max(d)
            return (sum(d[y].values()) if add else max(d[y].values())), y
        prod = {iso: latest(d, sym == 'PGM') for iso, d in prod.items()}     # platinum + palladium; else one figure
        res = {iso: latest(d, False) for iso, d in res.items()}
        to_card = 1e-6 if unit == 'Mt' else 1.0
        rk_res = {iso: i + 1 for i, iso in enumerate(sorted(res, key=lambda k: -res[k][0]))}
        rk_out = {iso: i + 1 for i, iso in enumerate(sorted(prod, key=lambda k: -prod[k][0]))}
        for iso in set(prod) | set(res):
            if iso not in countries:
                continue
            out.setdefault(iso, {})[sym] = {'reserves': r(res[iso][0] * to_card, 3) if iso in res else None, 'unit': unit,
                                            'rank_reserves': rk_res.get(iso), 'rank_output': rk_out.get(iso), 'year': year}
        world[sym] = {'producers': len(prod), 'with_reserves': len(res)}
        log('  usgs %-3s %-22s %d producers, %d with reserves' % (sym, comm, len(prod), len(res)))
    return out, {'release': year, 'world': world}
