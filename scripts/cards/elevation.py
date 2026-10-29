"""
Elevation of each country's land - NOAA ETOPO1 global relief (via the free OpenTopoData API), made once.

Feeds:  Renewables Potential  "Elevation": share of the land in each height band, and the average.

About 100 points spread over each country (data/elevation_points.json, from Natural Earth) are
looked up 100 at a time (OpenTopoData allows 1 call a second and 1,000 a day). Land does not move,
so the results are kept in data/elevation_cache.json and only countries still missing are fetched.
Points that fall in the sea on the coarse grid count as 0 m. The highest point is never stored:
it gives the country away.
"""
import os
import time

from .common import DATA_DIR, get_json, load_json, r, save_json, static

CADENCE = 'once'
API = 'https://api.opentopodata.org/v1/{dataset}'
DATASETS = ['etopo1', 'srtm90m']              # ETOPO first; SRTM as a fallback if the first is down
CACHE_FILE = os.path.join(DATA_DIR, 'elevation_cache.json')
QUANTILES = [0, .05, .1, .2, .3, .4, .5, .6, .7, .8, .9, .95, .98]


def _lookup(points):
    loc = '|'.join('%.4f,%.4f' % (la, lo) for la, lo in points)
    last = None
    for ds in DATASETS:
        try:
            body = get_json(API.format(dataset=ds), {'locations': loc}, timeout=90)
            if body.get('status') == 'OK':
                return [res.get('elevation') for res in body['results']], ds
            last = body.get('error')
        except Exception as err:        # noqa: BLE001
            last = err
    raise RuntimeError('elevation lookup failed: %s' % last)


def build(countries, state=None, log=print, max_calls=900, pause=1.1):
    cache = load_json(CACHE_FILE, {})
    pts = static('elevation_points')
    calls = 0
    for iso in countries:
        if iso in cache or iso not in pts or calls >= max_calls:
            continue
        points = pts[iso]
        z, used = [], None
        try:
            for i in range(0, len(points), 100):
                vals, used = _lookup(points[i:i + 100]); calls += 1
                z.extend(vals); time.sleep(pause)
        except Exception as err:        # noqa: BLE001
            log('  elevation %s failed: %s' % (iso, err)); continue
        z = sorted(max(0.0, float(v)) for v in z if v is not None)
        if not z:
            continue
        cache[iso] = {'q': [[q, round(z[min(len(z) - 1, int(round(q * (len(z) - 1))))])] for q in QUANTILES],
                      'mean': round(sum(z) / len(z)), 'n': len(z), 'dataset': used}
        if calls % 50 == 0:
            save_json(CACHE_FILE, cache)
    save_json(CACHE_FILE, cache)
    log('  elevation: %d calls this run, %d countries cached' % (calls, len(cache)))
    out = {iso: cache[iso] for iso in countries if iso in cache}
    means = [v['mean'] for v in out.values()]
    return out, {'world': {'mean_m': r(sum(means) / len(means), 0) if means else None},
                 'missing': [iso for iso in countries if iso not in out]}
