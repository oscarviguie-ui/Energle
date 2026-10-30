"""
Turns the raw source figures (data/cards_raw.json) into cards.json, in the shape the cards draw
(see shop-cards.js), applying the giveaway rules on the way:
  - ranks are only ever shown as bands (Top 3 / Top 5 / Top 10), never as the exact rank;
  - the highest point of a country is never stored;
  - figures are rounded the way the cards print them.

cards.json:
  {"version": 1, "built": "YYYY-MM-DD", "sources": {source: {"updated", "release"/"year"}},
   "world": {...averages for the cards...},
   "countries": {ISO3: {"cards": ["nature", "under", "trade", "market", "people"], "europe": bool,
                        ...the card figures...}}}
A card is listed for a country only when every figure it draws is there.
"""
import os
import re

import math

from .common import ROOT, r, static

FUELS = ('crude', 'refined', 'gas', 'lng', 'coal')
MINERALS = ['Li', 'Co', 'Ni', 'Cu', 'C', 'REE', 'Mn', 'PGM']
SHORT_NAMES = {
    'USA': 'United States', 'GBR': 'United Kingdom', 'RUS': 'Russia', 'KOR': 'South Korea', 'PRK': 'North Korea',
    'IRN': 'Iran', 'SYR': 'Syria', 'VEN': 'Venezuela', 'BOL': 'Bolivia', 'TZA': 'Tanzania', 'VNM': 'Vietnam',
    'LAO': 'Laos', 'MDA': 'Moldova', 'COD': 'DR Congo', 'COG': 'Congo', 'ARE': 'United Arab Emirates',
    'CZE': 'Czechia', 'TWN': 'Taiwan', 'BRN': 'Brunei', 'CIV': "Côte d'Ivoire", 'MKD': 'North Macedonia',
    'NLD': 'Netherlands', 'PHL': 'Philippines', 'DOM': 'Dominican Republic', 'CAF': 'Central African Rep.',
    'TUR': 'Türkiye', 'PSE': 'Palestine', 'XKX': 'Kosovo', 'HKG': 'Hong Kong', 'MAC': 'Macao', 'SWZ': 'Eswatini',
}


def _script_maps():
    """ISO3 -> ISO2 and ISO3 -> continent, read from the game script so both always agree."""
    src = open(os.path.join(ROOT, 'script.js'), encoding='utf-8').read()
    m = re.search(r'const ISO3_TO_ISO2 = \{(.*?)\};', src, re.S)
    iso2 = dict(re.findall(r"([A-Z]{3}):'([a-z]{2})'", m.group(1))) if m else {}
    m = re.search(r'const ISO3_CONTINENT = \{(.*?)\};', src, re.S)
    cont = dict(re.findall(r"'([A-Z]{3})':'([^']+)'", m.group(1))) if m else {}
    return iso2, cont


_DISPLAY = None
def _display_names():
    """The everyday names the game shows ('Bosnia Herzegovina' -> 'Bosnia and Herzegovina'), from script.js."""
    global _DISPLAY
    if _DISPLAY is None:
        src = open(os.path.join(ROOT, 'script.js'), encoding='utf-8').read()
        m = re.search(r'const DISPLAY_NAMES = \{(.*?)\};', src, re.S)
        _DISPLAY = {a: b for _, a, b in re.findall(r"""(['"])(.*?)\1:\s*'([^']*)'""", m.group(1))} if m else {}
    return _DISPLAY


def _name(iso3, game_names):
    if iso3 in SHORT_NAMES:
        return SHORT_NAMES[iso3]
    if iso3 in game_names:
        g = game_names[iso3]
        return _display_names().get(g) or re.sub(r'\s*\(the\)$', '', g)
    try:
        import pycountry
        c = pycountry.countries.get(alpha_3=iso3)
        if c:
            return getattr(c, 'common_name', None) or c.name
    except Exception:       # noqa: BLE001
        pass
    return iso3


# OPEC figures left out: Canada's oil excludes the oil sands there (its table footnote), so the Factbook's total is kept
OPEC_SKIP = {('oil', 'CAN')}


def _and(names):
    return names[0] if len(names) == 1 else ', '.join(names[:-1]) + ' and ' + names[-1]


_PTS = None
def near(a, b, km=1500):
    """Whether two countries come within `km` of each other (100 sample points each): a power line can join them."""
    global _PTS
    if _PTS is None:
        _PTS = static('elevation_points')
    A, B = _PTS.get(a), _PTS.get(b)
    if not A or not B:
        return True                          # unknown: keep the partner
    rad = math.radians
    for la1, lo1 in A:
        for la2, lo2 in B:
            h = math.sin(rad(la2 - la1) / 2) ** 2 + math.cos(rad(la1)) * math.cos(rad(la2)) * math.sin(rad(lo2 - lo1) / 2) ** 2
            if 6371 * 2 * math.asin(math.sqrt(min(1, h))) < km:
                return True
    return False


def band(rank):
    """Exact ranks never leave the pipeline: Top 3, Top 5 or Top 10, else nothing."""
    if not rank:
        return None
    return 3 if rank <= 3 else 5 if rank <= 5 else 10 if rank <= 10 else None


def sig(v, n=2):
    if v is None or v == 0:
        return 0
    from math import floor, log10
    d = n - 1 - int(floor(log10(abs(v))))
    return round(v, d) if d > 0 else int(round(v, d))


def build(raw, game, log=print):
    countries = {v['iso3']: k for k, v in game.items() if not k.startswith('__') and isinstance(v, dict) and v.get('iso3')}
    iso2, cont = _script_maps()
    data = {s: (raw.get(s) or {}).get('data', {}) for s in ('wdi', 'power', 'elevation', 'eia', 'factbook', 'opec', 'usgs', 'baci', 'entsoe')}
    # oil and gas reserves: OPEC's bulletin for the countries it lists (every major holder), the Factbook for the rest;
    # world ranks over the merged figures
    RES = {}
    for f in ('oil', 'gas'):
        merged = {}
        for iso in set(data['factbook']) | set(data['opec']):
            x = None if (f, iso) in OPEC_SKIP else (data['opec'].get(iso) or {}).get(f)
            x = x or (data['factbook'].get(iso) or {}).get(f)
            if x and x.get('value'):
                merged[iso] = x
        RES[f] = {iso: dict(merged[iso], rank=i + 1) for i, iso in enumerate(sorted(merged, key=lambda k: -merged[k]['value']))}
    out, why = {}, {}
    for iso, gname in countries.items():
        w, pw, el = data['wdi'].get(iso, {}), data['power'].get(iso, {}), data['elevation'].get(iso)
        e, u, b, en = data['eia'].get(iso, {}), data['usgs'].get(iso, {}), data['baci'].get(iso, {}), data['entsoe'].get(iso)
        fb = data['factbook'].get(iso, {})
        wv = lambda k: (w.get(k) or [None])[0]
        C, cards, missing = {'europe': cont.get(iso) == 'Europe'}, [], {}

        # ---- Renewables Potential ----
        need = {'sun': pw.get('sun'), 'wind': pw.get('wind'), 'rain': wv('rain'), 'flow': wv('flow'), 'elevation': el}
        if all(v is not None for v in need.values()):
            q = [list(x) for x in el['q']]
            if q[-1][0] < 1:
                q.append([1, q[-1][1]])          # flat to the top: the highest point stays unknown
            C.update({'sun': [r(v, 2) for v in pw['sun']], 'wind': [r(v, 1) for v in pw['wind']],
                      'rain': int(round(wv('rain'))), 'flow': sig(wv('flow'), 3), 'terr': q, 'elevMean': el['mean']})
            cards.append('nature')
        else:
            missing['nature'] = [k for k, v in need.items() if v is None]

        # ---- Underground Riches ----
        # reserves: oil and gas from the CIA World Factbook, coal from EIA (Factbook when EIA has none);
        # output rank from EIA. [reserves, reserves band, output band]
        fos, years = {}, {}
        for f in ('oil', 'gas', 'coal'):
            ex = e.get(f) or {}
            res = (ex if ex.get('value') else fb.get('coal')) if f == 'coal' else RES[f].get(iso)
            res = res or {}
            fos[f] = [sig(res['value'], 2) if res.get('value') else 0, band(res.get('rank')), band(ex.get('prod_rank'))]
            p = ex.get('prod')
            if res.get('value') and p:
                per_year = {'oil': p * 365 / 1e6, 'gas': p / 1000, 'coal': p / 1e6}[f]   # bn bbl, tcm, bn t a year
                years[f] = res['value'] / per_year
        mins = {}
        for sym in MINERALS:
            m = u.get(sym)
            if m and (band(m.get('rank_reserves')) or band(m.get('rank_output'))):
                mins[sym] = [sig(m['reserves'], 2) if m.get('reserves') else 0, m['unit'], band(m.get('rank_reserves')), band(m.get('rank_output'))]
        rents = {k: wv('rent_' + k) for k in ('oil', 'gas', 'coal', 'min')}
        if (data['eia'] or data['factbook']) and any(v is not None for v in rents.values()):
            C.update({'fossil': fos, 'minerals': mins, 'rents': {k: r(v or 0, 2) for k, v in rents.items()}})
            if years.get('coal') and fos['coal'][0] and years['coal'] <= 500:     # no "years left" for coal that is barely mined
                C['coalYears'] = sig(min(years['coal'], 999), 2)
            cards.append('under')
        else:
            missing['under'] = [k for k, bad in (('eia+factbook', not (data['eia'] or data['factbook'])), ('rents', all(v is None for v in rents.values()))) if bad]

        # ---- Fuel Trade ----
        imp, exp = b.get('imports'), b.get('exports')
        if imp or exp:
            def side(s):
                rows = []
                for p in (s or {}).get('partners', []):
                    fuels = {f: r(v, 2) for f, v in p['fuels'].items() if f in FUELS and v >= 0.005}
                    if not fuels:
                        continue
                    a2 = 'OTHER' if p['iso3'] == 'OTHER' else (iso2.get(p['iso3'], '').upper() or 'OTHER')
                    rows.append([a2, 'Others' if p['iso3'] == 'OTHER' else _name(p['iso3'], countries), fuels])
                return rows
            IN, OUT = side(imp), side(exp)
            if sum(sum(x[2].values()) for x in IN + OUT) >= 0.05:
                C['trade'] = {'year': b.get('year'), 'IN': IN, 'OUT': OUT}
                cards.append('trade')
            else:
                missing['trade'] = ['too small']
        else:
            missing['trade'] = ['baci']

        # ---- Electricity Trade: ENTSO-E in Europe, else EIA totals split by BACI partner shares ----
        nb, src, year = None, None, None
        if en and en.get('neighbours'):
            nb = [[iso2.get(p, '').upper() or 'OTHER', _name(p, countries), a, x] for p, a, x in en['neighbours'][:6]]
            src, year = 'entsoe', en.get('year')
        elif e.get('elec'):
            t = e['elec']; shares = b.get('elec', {})
            ish, esh = dict(shares.get('imp_shares', [])), dict(shares.get('exp_shares', []))
            for sh in (ish, esh):                # flows the customs data has no partner for go to "Others"
                left = 1 - sum(sh.values())
                if left > 0.02:
                    sh['OTHER'] = sh.get('OTHER', 0) + left
            far = sorted({p for p in set(ish) | set(esh) if p != 'OTHER' and not near(iso, p)})
            for sh in (ish, esh):                # partners too far away for any power line: customs-record errors, counted under Others
                for p in far:
                    if p in sh:
                        sh['OTHER'] = sh.get('OTHER', 0) + sh.pop(p)
            if far:
                C.setdefault('flags', {})['market'] = ('Customs records also name %s, too far away for a power line; that trade is counted under Others.'
                                                       % _and([_name(p, countries) for p in far]))
            parts = set(ish) | set(esh)
            nb = []
            for p in parts:
                a, x = r((t.get('imp') or 0) * ish.get(p, 0), 2), r((t.get('exp') or 0) * esh.get(p, 0), 2)
                if a + x >= 0.05:
                    nb.append([('OTHER' if p == 'OTHER' else iso2.get(p, '').upper() or 'OTHER'), ('Others' if len(parts) > 1 else 'Neighbours') if p == 'OTHER' else _name(p, countries), a, x])
            if not parts and (t.get('imp') or t.get('exp')):
                nb.append(['OTHER', 'Neighbours', r(t.get('imp') or 0, 2), r(t.get('exp') or 0, 2)])
            nb.sort(key=lambda n: (n[0] == 'OTHER', -(n[2] + n[3])))
            nb = nb[:6]
            src, year = 'eia+baci', t.get('year')
        if nb is not None:
            C['elec'] = {'year': year, 'NB': nb, 'source': src}
            cards.append('market')
        else:
            missing['market'] = ['eia']

        # ---- People & Power ----
        au, ar, at = wv('access_urban'), wv('access_rural'), wv('access')
        access = [au if au is not None else at, ar if ar is not None else at]
        need = {'access': access[0], 'cook': wv('cook'), 'climate': pw.get('hdd'), 'urban': wv('urban'), 'gdp': wv('gdp'), 'industry': wv('industry')}
        if all(v is not None for v in need.values()) and access[1] is not None:
            cuts = None
            if wv('cuts_n') is not None and wv('cuts_firms') is not None:
                cuts = {'n': r(wv('cuts_n'), 1), 'firms': int(round(wv('cuts_firms'))), 'loss': None if wv('cuts_loss') is None else r(wv('cuts_loss'), 1), 'year': w['cuts_n'][1]}
            C.update({'access': [int(round(min(100, access[0]))), int(round(min(100, access[1])))], 'cook': int(round(min(100, wv('cook')))),
                      'cuts': cuts, 'cold': int(round(pw['cold'])), 'hot': int(round(pw['hot'])), 'coldM': pw['coldM'], 'hotM': pw['hotM'],
                      'hdd': int(pw['hdd']), 'cdd': int(pw['cdd']), 'urban': int(round(wv('urban'))), 'gdp': int(round(wv('gdp'), -2)),
                      'industry': int(round(wv('industry')))})
            cards.append('people')
        else:
            missing['people'] = [k for k, v in need.items() if v is None]

        C['cards'] = cards
        out[iso] = C
        why[iso] = missing
    world = {s: (raw.get(s) or {}).get('meta', {}).get('world') for s in ('wdi', 'power', 'elevation')}
    world['cards'] = card_world(out, world.get('wdi') or {})
    return out, why, world


# height bands of the Elevation tile, as the card draws them (shop-cards.js: BINS)
BINS = [(3000, 1e9), (2000, 3000), (1000, 2000), (500, 1000), (200, 500), (-1e9, 200)]


def _terr_q(T):
    """101 sampled elevations from the stored quantiles, as the card interpolates them."""
    q = []
    for i in range(101):
        t, k = i / 100, 1
        while k < len(T) - 1 and T[k][0] < t:
            k += 1
        (x0, y0), (x1, y1) = T[k - 1], T[k]
        q.append(y0 + (y1 - y0) * (t - x0) / (x1 - x0) if x1 != x0 else y0)
    return q


def card_world(out, wdi_world):
    """The world marks the cards draw. Climate, water and land: the average of every country in the game, computed the
    way each card computes its own figure. Society and the economy: the World Bank's world figure. Power cuts: the average
    of the surveyed countries."""
    def mean(vals):
        vals = [v for v in vals if v is not None]
        return sum(vals) / len(vals) if vals else None
    nat = [C for C in out.values() if 'sun' in C]
    qs = [_terr_q(C['terr']) for C in nat]
    bins = [r(mean([sum(1 for z in q if lo <= z < hi) / len(q) * 100 for q in qs]), 0) for lo, hi in BINS] if qs else None
    ppl = [C for C in out.values() if 'hdd' in C]
    cuts = [C['cuts'] for C in out.values() if C.get('cuts')]
    wv = lambda k: (wdi_world.get(k) or [None])[0]
    rents = [wv('rent_' + k) for k in ('oil', 'gas', 'coal', 'min')]
    return {
        'n': len(nat),
        'sunYear': r(mean([sum(C['sun']) / 12 * 365 for C in nat]), 0), 'wind': r(mean([sum(C['wind']) / 12 for C in nat]), 1),
        'rain': r(mean([C['rain'] for C in nat]), 0), 'flow': r(mean([C['flow'] for C in nat]), 0),
        'elevMean': r(mean([sum(q) / len(q) for q in qs]), 0), 'terrBins': bins,
        'hdd': r(mean([C['hdd'] for C in ppl]), 0), 'cdd': r(mean([C['cdd'] for C in ppl]), 0),
        'urban': r(wv('urban'), 0), 'gdp': r(wv('gdp'), -2), 'industry': r(wv('industry'), 0), 'cook': r(wv('cook'), 0),
        'rent': r(sum(v for v in rents if v is not None), 1) if any(v is not None for v in rents) else None,
        'cutsFirms': r(mean([c['firms'] for c in cuts]), 0), 'cutsLoss': r(mean([c['loss'] for c in cuts]), 1), 'cutsN': len(cuts),
    }
