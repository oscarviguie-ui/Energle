"""
NASA POWER climatology (open API, no key) - long-term monthly averages, refreshed once a year.

Feeds:  Renewables Potential  sunshine and wind, month by month, over the whole country
        People & Power        climate where people live: coldest / warmest month, heating and cooling need

Points (made once from Natural Earth, see data/*.json):
  land_points  up to 16 points spread over the country     -> ALLSKY_SFC_SW_DWN (kWh/m2/day), WS50M (m/s)
  city_points  the six largest places, weighted by people  -> T2M (deg C)
Climate averages barely move, so every point is cached in data/power_cache.json and only missing
points are fetched; the cache is cleared once a year to pick up POWER's updated climatology.
"""
import time

from .common import DATA_DIR, get_json, load_json, r, save_json, static
import os

CADENCE = 'yearly'
API = 'https://power.larc.nasa.gov/api/temporal/climatology/point'
CACHE_FILE = os.path.join(DATA_DIR, 'power_cache.json')
MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
DAYS = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
BASE_T = 18.0                       # degree-days base, deg C


def _point(lat, lng, params):
    body = get_json(API, {'parameters': ','.join(params), 'community': 'RE',
                          'latitude': round(lat, 3), 'longitude': round(lng, 3), 'format': 'JSON'}, timeout=120)
    p = body['properties']['parameter']
    out = {}
    for name in params:
        vals = [p.get(name, {}).get(m) for m in MONTHS]
        out[name] = [None if v is None or v <= -900 else round(float(v), 3) for v in vals]   # -999 = missing
    return out


def _fetch(cache, key, lat, lng, params, log):
    if key in cache:
        return cache[key]
    try:
        cache[key] = _point(lat, lng, params)
    except Exception as err:        # noqa: BLE001
        log('  power %s failed: %s' % (key, err))
        cache[key] = None
    return cache[key]


def _mean_months(series, weights=None):
    """Month-by-month mean over points (each a list of 12, None where missing)."""
    out = []
    for m in range(12):
        num = den = 0.0
        for i, s in enumerate(series):
            if s and s[m] is not None:
                w = weights[i] if weights else 1.0
                num += w * s[m]; den += w
        out.append(num / den if den else None)
    return out


def build(countries, state=None, log=print, budget=5000, pause=0.15):
    state = state or {}
    cache = load_json(CACHE_FILE, {})
    if state.get('refresh'):                       # yearly: start again from POWER's current climatology
        cache = {}
    land, city = static('land_points'), static('city_points')
    before = len(cache)
    fetched = 0
    for iso in countries:
        for la, lo in land.get(iso, []):
            k = 'L%.3f,%.3f' % (la, lo)
            if k not in cache and fetched < budget:
                _fetch(cache, k, la, lo, ['ALLSKY_SFC_SW_DWN', 'WS50M'], log); fetched += 1; time.sleep(pause)
        for la, lo, _pop, _name in city.get(iso, []):
            k = 'C%.3f,%.3f' % (la, lo)
            if k not in cache and fetched < budget:
                _fetch(cache, k, la, lo, ['T2M'], log); fetched += 1; time.sleep(pause)
        if fetched and fetched % 200 == 0:
            save_json(CACHE_FILE, cache)
    save_json(CACHE_FILE, cache)
    log('  power: %d points fetched this run, %d in the cache (%d before)' % (fetched, len(cache), before))

    out = {}
    for iso in countries:
        lp = [cache.get('L%.3f,%.3f' % (la, lo)) for la, lo in land.get(iso, [])]
        lp = [p for p in lp if p]
        cp = [(cache.get('C%.3f,%.3f' % (la, lo)), max(1, pop or 1)) for la, lo, pop, _n in city.get(iso, [])]
        cp = [(p, w) for p, w in cp if p]
        rec = {}
        if lp:
            sun = _mean_months([p['ALLSKY_SFC_SW_DWN'] for p in lp])
            wind = _mean_months([p['WS50M'] for p in lp])
            if all(v is not None for v in sun):
                rec['sun'] = [r(v, 2) for v in sun]
            if all(v is not None for v in wind):
                rec['wind'] = [r(v, 2) for v in wind]
            rec['land_points'] = len(lp)
        if cp:
            t = _mean_months([p['T2M'] for p, _ in cp], [w for _, w in cp])
            if all(v is not None for v in t):
                lo_m, hi_m = min(range(12), key=lambda m: t[m]), max(range(12), key=lambda m: t[m])
                rec.update({'t2m': [r(v, 1) for v in t], 'cold': r(t[lo_m], 1), 'coldM': MON3[lo_m], 'hot': r(t[hi_m], 1), 'hotM': MON3[hi_m],
                            'hdd': round(sum(DAYS[m] * max(0.0, BASE_T - t[m]) for m in range(12))),
                            'cdd': round(sum(DAYS[m] * max(0.0, t[m] - BASE_T) for m in range(12))),
                            'city_points': len(cp)})
        if rec:
            out[iso] = rec
    def wavg(key, f):
        vals = [f(v[key]) for v in out.values() if key in v]
        return r(sum(vals) / len(vals), 2) if vals else None
    world = {'sun_year_kwh_m2': wavg('sun', lambda a: sum(x * d for x, d in zip(a, DAYS))),
             'wind_ms': wavg('wind', lambda a: sum(a) / 12),
             'hdd': wavg('hdd', float), 'cdd': wavg('cdd', float)}
    missing = [iso for iso in countries if iso not in out]
    return out, {'world': world, 'missing': missing, 'cache_points': len(cache)}
