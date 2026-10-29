"""
U.S. EIA international energy statistics, from EIA's free bulk file (INTL.zip, no key needed) -
refreshed every month.

Feeds:  Underground Riches  oil, gas and coal output (world rank for output), coal proven reserves
        Electricity Trade   yearly electricity imports and exports (TWh) for every country; the
                            partner split comes from BACI (or ENTSO-E in Europe)
Oil and gas reserves are not in EIA's international data any more: they come from the CIA World
Factbook (factbook.py).

The bulk file has one JSON series per line, ids like INTL.<product>-<activity>-<country>-<unit>.A:
products 57 crude oil incl. lease condensate, 26 dry natural gas, 7 coal, 2 electricity;
activities 1 production, 3 imports, 4 exports, 6 reserves.
"""
import io
import json
import re
import zipfile

from .common import get, r

CADENCE = 'monthly'
BULK = 'https://api.eia.gov/bulk/INTL.zip'
WANTED = {   # (product, activity, unit) -> name
    ('57', '1', 'TBPD'): 'oil_prod',      # thousand barrels a day
    ('26', '1', 'BCM'): 'gas_prod',       # billion cubic metres
    ('7', '1', 'MT'): 'coal_prod',        # thousand metric tons
    ('7', '6', 'MST'): 'coal_res',        # million short tons
    ('2', '3', 'BKWH'): 'elec_imp',       # billion kWh = TWh
    ('2', '4', 'BKWH'): 'elec_exp',
}
FIX_ISO = {'XKS': 'XKX'}
SERIES = re.compile(r'^INTL\.(\d+)-(\d+)-([A-Z]{3})-([A-Za-z]+)\.A$')


def read_bulk(log=print):
    raw = get(BULK, timeout=600).content
    z = zipfile.ZipFile(io.BytesIO(raw))
    got = {name: {} for name in WANTED.values()}
    with z.open(z.namelist()[0]) as f:
        for line in f:
            try:
                d = json.loads(line)
            except ValueError:
                continue
            m = SERIES.match(d.get('series_id') or '')
            if not m:
                continue
            name = WANTED.get((m.group(1), m.group(2), m.group(4)))
            if not name:
                continue
            iso = FIX_ISO.get(m.group(3), m.group(3))
            for year, val in d.get('data') or []:          # newest first
                try:
                    got[name][iso] = (float(val), int(str(year)[:4]))
                    break
                except (TypeError, ValueError):
                    continue                                 # 'NA', '--', 'ie'...
    for name, s in got.items():
        log('  eia %-9s %d countries' % (name, len(s)))
    return got


def ranks(series, countries):
    """World rank among real countries (aggregates have no 3-letter code in the game list)."""
    vals = sorted(((v[0], iso) for iso, v in series.items() if iso in countries and v[0] > 0), reverse=True)
    return {iso: i + 1 for i, (_, iso) in enumerate(vals)}


def build(countries, state=None, log=print):
    got = read_bulk(log)
    if not any(got.values()):
        raise RuntimeError('nothing read from the EIA bulk file')
    out = {}
    pr = {f: ranks(got[f + '_prod'], countries) for f in ('oil', 'gas', 'coal')}
    cr = ranks(got['coal_res'], countries)
    for iso in countries:
        rec = {}
        for f in ('oil', 'gas', 'coal'):
            p = got[f + '_prod'].get(iso)
            if p:
                rec[f] = {'prod': r(p[0], 3), 'prod_year': p[1], 'prod_rank': pr[f].get(iso)}
        c = got['coal_res'].get(iso)
        if c:
            rec.setdefault('coal', {}).update({'value': r(c[0] * 0.000907185, 3), 'year': c[1], 'rank': cr.get(iso)})   # Mst -> bn t
        i, e = got['elec_imp'].get(iso), got['elec_exp'].get(iso)
        if i or e:
            rec['elec'] = {'imp': r((i or (0, 0))[0], 2), 'exp': r((e or (0, 0))[0], 2), 'year': max((i or (0, 0))[1], (e or (0, 0))[1])}
        if rec:
            out[iso] = rec
    return out, {'units': {'oil_prod': 'kb/d', 'gas_prod': 'bcm', 'coal_prod': 'kt', 'coal': 'bn t', 'elec': 'TWh'}}
