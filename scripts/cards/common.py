"""
Shared helpers for the clue-card data pipeline (scripts/build_cards.py).

Every source module has build(countries, state, log) -> (data, meta) or (None, None) when it skips.
  data:  {ISO3: {...raw figures...}}
  meta:  small dict kept in data/cards_raw.json (release name, year, world figures...)
Sources never raise for one bad country: they log and move on. Network calls go through get().
"""
import datetime
import json
import os
import time

import requests

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
GAME_FILE = os.path.join(ROOT, 'energle_data.json')        # the base game's data (names, ISO3, lat/lng, Ember)
DATA_DIR = os.path.join(ROOT, 'data')
RAW_FILE = os.path.join(DATA_DIR, 'cards_raw.json')        # every source's raw figures + when they were fetched
CARDS_FILE = os.path.join(ROOT, 'cards.json')              # what the game reads (published only if the checks pass)
REPORT_FILE = os.path.join(DATA_DIR, 'cards_report.md')    # what changed and what the checks found

SESSION = requests.Session()
SESSION.headers['User-Agent'] = 'energle-cards/1.0 (+https://energle.org)'


def get(url, params=None, tries=4, timeout=60, stream=False, headers=None):
    """GET with retries and back-off; returns the response (raises after the last try)."""
    last = None
    for attempt in range(tries):
        try:
            res = SESSION.get(url, params=params, timeout=timeout, stream=stream, headers=headers)
            if res.status_code == 429 or res.status_code >= 500:
                raise requests.HTTPError('HTTP %d' % res.status_code)
            res.raise_for_status()
            return res
        except Exception as err:             # noqa: BLE001 - retry anything, then give up loudly
            last = err
            time.sleep(min(60, 3 * (attempt + 1) ** 2))
    raise RuntimeError('GET failed after %d tries: %s (%s)' % (tries, url.split('?')[0], last))


def get_json(url, params=None, **kw):
    return get(url, params=params, **kw).json()


def game_countries():
    """ISO3 -> {'name', 'lat', 'lng', 'continent'} for every country in the game."""
    data = json.load(open(GAME_FILE, encoding='utf-8'))
    out = {}
    for k, v in data.items():
        if k.startswith('__') or not isinstance(v, dict) or not v.get('iso3'):
            continue
        out[v['iso3']] = {'name': k, 'lat': v.get('lat'), 'lng': v.get('lng'), 'continent': v.get('continent')}
    return out


def game_data():
    return json.load(open(GAME_FILE, encoding='utf-8'))


def load_json(path, default):
    try:
        return json.load(open(path, encoding='utf-8'))
    except (OSError, ValueError):
        return default


def save_json(path, obj, compact=True):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        if compact:
            json.dump(obj, f, separators=(',', ':'), ensure_ascii=False, sort_keys=True)
        else:
            json.dump(obj, f, indent=1, ensure_ascii=False, sort_keys=True)
    os.replace(tmp, path)


def static(name):
    """One of the made-once point files in data/ (elevation_points, land_points, city_points)."""
    return json.load(open(os.path.join(DATA_DIR, name + '.json'), encoding='utf-8'))['points']


def r(x, nd=2):
    return None if x is None else round(float(x), nd)


def today():
    return datetime.datetime.now(datetime.timezone.utc).date()


def days_since(iso_date):
    try:
        return (today() - datetime.date.fromisoformat(iso_date)).days
    except (TypeError, ValueError):
        return 10 ** 6
