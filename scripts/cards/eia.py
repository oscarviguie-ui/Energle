"""
U.S. EIA international energy data (API v2, free key in the EIA_API_KEY secret) - refreshed every month.

Feeds:  Underground Riches  oil, gas and coal: proven reserves, world rank for reserves and for output,
                            years left at today's output
        Electricity Trade   yearly electricity imports and exports (TWh) for every country; the partner
                            split comes from BACI (or ENTSO-E in Europe)

EIA's numeric product/activity ids are looked up by name at run time (facet endpoints),
so a change on their side shows up as a clear log line rather than silently wrong data.
"""
import os
import re

from .common import get_json, r

CADENCE = 'monthly'

BASE = 'https://api.eia.gov/v2/international'

# (fuel, what, name pattern for the product, activity pattern, preferred units in order)
WANTED = [
    ('oil',  'reserves',   r'^crude oil including lease condensate$', r'^reserves$',   ['BB']),
    ('oil',  'production', r'^crude oil including lease condensate$', r'^production$', ['TBPD']),
    ('gas',  'reserves',   r'^dry natural gas$',                      r'^reserves$',   ['TCF']),
    ('gas',  'production', r'^dry natural gas$',                      r'^production$', ['BCF']),
    ('coal', 'reserves',   r'^coal$',                                 r'^reserves$',   ['MST', 'MT']),
    ('coal', 'production', r'^coal$',                                 r'^production$', ['MST', 'MT']),
    ('elec', 'imports',    r'^electricity$',                          r'^imports$',    ['BKWH']),
    ('elec', 'exports',    r'^electricity$',                          r'^exports$',    ['BKWH']),
]
# to the units the card shows: bn barrels, trillion m3, bn tonnes
TO_CARD = {'BB': 1.0, 'TCF': 0.0283168, 'MST': 0.000907185, 'MT': 0.001}


def _facet(name, key):
    body = get_json(BASE + '/facet/' + name, {'api_key': key})
    return [(str(f['id']), f.get('name', '')) for f in body['response']['facets']]


def _pick(options, pattern):
    rx = re.compile(pattern, re.I)
    for fid, name in options:
        if rx.search(name.strip()):
            return fid, name
    return None, None


def _series(key, product, activity, unit, since):
    """{ISO3: (value, year)}, latest non-null year per country."""
    out, offset = {}, 0
    while True:
        params = {'api_key': key, 'frequency': 'annual', 'data[0]': 'value', 'start': str(since),
                  'facets[productId][]': product, 'facets[activityId][]': activity, 'facets[unit][]': unit,
                  'sort[0][column]': 'period', 'sort[0][direction]': 'desc', 'length': 5000, 'offset': offset}
        resp = get_json(BASE + '/data/', params)['response']
        rows = resp.get('data', [])
        for row in rows:
            iso, val = row.get('countryRegionId'), row.get('value')
            try:
                val = float(val)
            except (TypeError, ValueError):
                continue
            year = int(str(row['period'])[:4])
            if iso and (iso not in out or year > out[iso][1]):
                out[iso] = (val, year)
        offset += len(rows)
        if not rows or offset >= int(resp.get('total', 0)):
            return out


def build(countries, state=None, since=2015, log=print):
    key = os.environ.get('EIA_API_KEY', '').strip()
    if not key:
        log('  eia: EIA_API_KEY not set, skipped')
        return None, None
    products, activities, units = _facet('productId', key), _facet('activityId', key), _facet('unit', key)
    unit_ids = {u for u, _ in units}
    got = {}
    for fuel, what, ppat, apat, prefer in WANTED:
        pid, pname = _pick(products, ppat)
        aid, aname = _pick(activities, apat)
        unit = next((u for u in prefer if u in unit_ids), None)
        if not (pid and aid and unit):
            log('  eia %s %s: not found (product %s, activity %s, unit %s)' % (fuel, what, pid, aid, unit))
            continue
        try:
            got[(fuel, what)] = (_series(key, pid, aid, unit, since), unit)
            log('  eia %-4s %-10s product %s "%s" · activity %s · %s · %d countries'
                % (fuel, what, pid, pname, aid, unit, sum(1 for c in got[(fuel, what)][0] if c in countries)))
        except Exception as err:            # noqa: BLE001
            log('  eia %s %s FAILED: %s' % (fuel, what, err))

    if not got:
        raise RuntimeError('no EIA series could be read')
    out = {}
    for fuel in ('oil', 'gas', 'coal'):
        res, res_unit = got.get((fuel, 'reserves'), ({}, None))
        prod, prod_unit = got.get((fuel, 'production'), ({}, None))
        ranked = sorted((v[0] * TO_CARD.get(res_unit, 1), iso) for iso, v in res.items() if iso in countries and v[0] > 0)[::-1]
        rank = {iso: i + 1 for i, (_, iso) in enumerate(ranked)}
        pranked = sorted((v[0], iso) for iso, v in prod.items() if iso in countries and v[0] > 0)[::-1]
        prank = {iso: i + 1 for i, (_, iso) in enumerate(pranked)}
        top = ranked[0][0] if ranked else None
        for iso in countries:
            if iso not in res:
                continue
            value, year = res[iso]
            card = value * TO_CARD.get(res_unit, 1)
            years_left = None
            if iso in prod and prod[iso][0] > 0 and value > 0:
                p = prod[iso][0]
                if fuel == 'oil' and res_unit == 'BB' and prod_unit == 'TBPD':
                    years_left = value * 1e9 / (p * 1e3 * 365)
                elif fuel == 'gas' and res_unit == 'TCF' and prod_unit == 'BCF':
                    years_left = value * 1e3 / p
                elif fuel == 'coal' and res_unit == prod_unit:
                    years_left = value / p
            out.setdefault(iso, {})[fuel] = {
                'value': r(card, 3), 'year': year, 'rank': rank.get(iso), 'prod_rank': prank.get(iso),
                'share_of_top': r(card / top, 5) if top else None,
                'years_left': None if years_left is None else int(round(min(years_left, 999))),
            }
    # electricity trade, billion kWh = TWh
    imp, _ = got.get(('elec', 'imports'), ({}, None))
    exp, _ = got.get(('elec', 'exports'), ({}, None))
    for iso in countries:
        if iso in imp or iso in exp:
            out.setdefault(iso, {})['elec'] = {'imp': r((imp.get(iso) or (0, None))[0], 2), 'exp': r((exp.get(iso) or (0, None))[0], 2),
                                               'year': max(y for y in [(imp.get(iso) or (0, 0))[1], (exp.get(iso) or (0, 0))[1]])}
    return out, {'units': {'oil': 'bn barrels', 'gas': 'tn m3', 'coal': 'bn tonnes', 'elec': 'TWh'}}
