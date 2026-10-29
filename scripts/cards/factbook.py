"""
CIA World Factbook (public domain), through the weekly-updated factbook.json repository on GitHub -
refreshed every month.

Feeds:  Underground Riches  proven reserves of crude oil (bn barrels) and natural gas (tn m3), with
                            their world rank. Coal reserves come from EIA when it has them, else here.

The repository is read as one zip (no key). Countries are matched by their short name.
"""
import html
import io
import json
import re
import zipfile

from .common import get, r

CADENCE = 'monthly'
ZIP = 'https://github.com/factbook/factbook.json/archive/refs/heads/master.zip'
UNITS = [(r'trillion', 1e12), (r'billion', 1e9), (r'million', 1e6), (r'thousand', 1e3)]
ALIASES = {
    'korea, south': 'KOR', 'korea, north': 'PRK', 'congo, democratic republic of the': 'COD', 'congo, republic of the': 'COG',
    'burma': 'MMR', 'turkey (turkiye)': 'TUR', 'turkiye': 'TUR', 'czechia': 'CZE', 'russia': 'RUS', 'iran': 'IRN', 'syria': 'SYR',
    'laos': 'LAO', 'vietnam': 'VNM', 'bolivia': 'BOL', 'venezuela': 'VEN', 'tanzania': 'TZA', 'moldova': 'MDA', 'united states': 'USA',
    'united kingdom': 'GBR', 'bahamas, the': 'BHS', 'gambia, the': 'GMB', 'cabo verde': 'CPV', "cote d'ivoire": 'CIV', "côte d'ivoire": 'CIV', 'eswatini': 'SWZ',
    'drc': 'COD', 'congo (kinshasa)': 'COD', 'congo (brazzaville)': 'COG', 'gaza': 'PSE', 'macau': 'MAC', 'curacao': 'CUW',
    'north macedonia': 'MKD', 'kosovo': 'XKX', 'west bank': 'PSE', 'gaza strip': 'PSE', 'timor-leste': 'TLS', 'brunei': 'BRN', 'taiwan': 'TWN',
}


def amount(text):
    """'8.122 billion barrels (2021 est.)' -> (8.122e9, 2021). '0 barrels' -> (0, None)."""
    if not text:
        return None
    m = re.match(r'\s*([\d.,]+)\s*([a-z]*)', text.replace(' ', ' '))
    if not m:
        return None
    v = float(m.group(1).replace(',', ''))
    for pat, f in UNITS:
        if m.group(2).startswith(pat):
            v *= f; break
    y = re.search(r'\((\d{4})', text)
    return v, (int(y.group(1)) if y else None)


def build(countries, state=None, log=print):
    z = zipfile.ZipFile(io.BytesIO(get(ZIP, timeout=300).content))
    by_name = {v['name'].lower(): iso for iso, v in countries.items()}
    try:
        import pycountry
    except ImportError:
        pycountry = None
    got, unmatched = {}, []
    for name in z.namelist():
        if not re.search(r'/[a-z-]+/[a-z]{2}\.json$', name) or '/meta/' in name:
            continue
        try:
            d = json.loads(z.read(name))
        except ValueError:
            continue
        short = (((d.get('Government') or {}).get('Country name') or {}).get('conventional short form') or {}).get('text', '')
        short = html.unescape(re.sub(r'<.*?>', '', short)).strip()
        key = short.lower()
        iso = ALIASES.get(key) or by_name.get(key)
        if not iso and pycountry and short and short.lower() != 'none':
            try:
                iso = pycountry.countries.lookup(short).alpha_3
            except LookupError:
                iso = None
        if not iso:
            unmatched.append(short or name); continue
        e = d.get('Energy') or {}
        oil = amount(((e.get('Petroleum') or {}).get('crude oil estimated reserves') or {}).get('text'))
        gas = amount(((e.get('Natural gas') or {}).get('proven reserves') or {}).get('text'))
        coal = amount(((e.get('Coal') or {}).get('proven reserves') or {}).get('text'))
        rec = {}
        if oil: rec['oil'] = {'value': r(oil[0] / 1e9, 3), 'year': oil[1]}        # bn barrels
        if gas: rec['gas'] = {'value': r(gas[0] / 1e12, 4), 'year': gas[1]}       # tn m3
        if coal: rec['coal'] = {'value': r(coal[0] / 1e9, 4), 'year': coal[1]}    # bn t
        if rec:
            got.setdefault(iso, {}).update(rec)
    for f in ('oil', 'gas', 'coal'):
        vals = sorted(((v[f]['value'], iso) for iso, v in got.items() if f in v and v[f]['value'] > 0), reverse=True)
        for i, (_, iso) in enumerate(vals):
            got[iso][f]['rank'] = i + 1
    log('  factbook: reserves for %d places; not matched: %s' % (len(got), ', '.join(sorted(unmatched))[:400]))
    return {iso: v for iso, v in got.items() if iso in countries}, {'unmatched': len(unmatched)}
