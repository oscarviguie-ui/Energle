"""
Keeps the daily answers topped up in Supabase (table public.puzzles, one ISO3 code per puzzle number).

The answers are not in this repository: the table is locked, and the website can only ask Supabase
for puzzles that have already started. This script runs in the monthly GitHub workflow with the
service key (GitHub secret SUPABASE_SERVICE_KEY) and never prints an answer, because workflow logs
of a public repository are public.

The list is never redrawn. Each run only:
- adds puzzles at the end when fewer than MIN_AHEAD are left after today;
- replaces a future puzzle whose country is no longer in energle_data.json (that day only).
Played puzzles and today stay exactly as they are.

New puzzles are drawn with a secure random generator (so nobody can recompute them from this code):
    weight = generation^(1/3) x (base + signature_weight x signature + transition_weight x min(change since 2010, cap))
where signature = how far the country's strongest low-carbon source sits above the world share,
and a country cannot come back within GAP_DAYS days.

Run after refresh_data.py:  python scripts/make_schedule.py
"""
import datetime
import json
import os
import random
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'energle_data.json')
SUPABASE_URL = os.environ.get('SUPABASE_URL', 'https://chjipjiaemwfvwgdhccn.supabase.co').rstrip('/')
KEY = os.environ.get('SUPABASE_SERVICE_KEY', '').strip()
EPOCH = datetime.date(2026, 6, 2)          # puzzle #1
MIN_AHEAD = 365                            # top up when fewer puzzles than this are left after today
HORIZON = 730                              # a top-up extends the list to about two years after today

RULE = {'gap_days': 50, 'size_exponent': 1 / 3, 'base': 0.7, 'signature_weight': 0.6,
        'hydro_factor': 1, 'transition_weight': 0.6, 'transition_cap': 0.7}

SOURCES = ['Coal', 'Gas', 'Other Fossil', 'Nuclear', 'Hydro', 'Wind', 'Solar', 'Bioenergy', 'Other Renewables']
LOW_CARBON = ['Nuclear', 'Hydro', 'Wind', 'Solar', 'Bioenergy', 'Other Renewables']
RNG = random.SystemRandom()


# ---- Supabase (REST, service key) ----
def _headers():
    h = {'apikey': KEY, 'Content-Type': 'application/json'}
    if KEY.startswith('eyJ'):                # legacy service_role JWT; new sb_secret_ keys go in apikey only
        h['Authorization'] = 'Bearer ' + KEY
    return h


def _request(method, path, body=None, extra=None):
    req = urllib.request.Request(SUPABASE_URL + '/rest/v1/' + path, method=method,
                                 data=None if body is None else json.dumps(body).encode(),
                                 headers={**_headers(), **(extra or {})})
    with urllib.request.urlopen(req, timeout=60) as res:
        raw = res.read()
        return json.loads(raw) if raw else None


def load_puzzles():
    out, offset = {}, 0
    while True:                              # Supabase returns at most 1000 rows per request
        rows = _request('GET', 'puzzles?select=day,iso3&order=day.asc&limit=1000&offset=%d' % offset)
        for r in rows:
            out[r['day']] = r['iso3']
        if len(rows) < 1000:
            return out
        offset += 1000


def save_puzzles(rows):
    for i in range(0, len(rows), 500):
        _request('POST', 'puzzles?on_conflict=day', [{'day': d, 'iso3': iso} for d, iso in rows[i:i + 500]],
                 {'Prefer': 'resolution=merge-duplicates,return=minimal'})


# ---- weights ----
def shares(year):
    total = (year or {}).get('Total') or 0
    if not total:
        return None
    return [(year.get(k) or 0) / total for k in SOURCES]


def weights(data):
    rows = []
    for name, info in data.items():
        if name.startswith('__'):
            continue
        latest = info['years'][str(info['latestYear'])]
        s = shares(latest)
        if s is None:
            continue
        first = info['years'].get('2010') or info['years'][sorted(info['years'])[0]]
        s0 = shares(first) or s
        rows.append({'iso': info['iso3'], 'g': latest.get('Total') or 0, 's': s,
                     'change': 0.5 * sum(abs(a - b) for a, b in zip(s, s0))})
    total = sum(r['g'] for r in rows)
    world = [sum(r['s'][k] * r['g'] for r in rows) / total for k in range(len(SOURCES))]
    out = {}
    for r in rows:
        sig = max([0.0] + [(r['s'][SOURCES.index(k)] - world[SOURCES.index(k)]) * (RULE['hydro_factor'] if k == 'Hydro' else 1)
                           for k in LOW_CARBON])
        mult = RULE['base'] + RULE['signature_weight'] * sig + RULE['transition_weight'] * min(r['change'], RULE['transition_cap'])
        out[r['iso']] = max(max(r['g'], 0.01) ** RULE['size_exponent'] * mult, 1e-9)
    return out


def draw(day, w, puzzles, gap):
    """A country that is not within `gap` days of this day, on either side."""
    near = {puzzles.get(d) for d in range(day - gap, day + gap + 1) if d != day}
    pool = [iso for iso in w if iso not in near] or list(w)
    return RNG.choices(pool, weights=[w[i] for i in pool])[0]


def main():
    if not KEY:
        print('make_schedule: SUPABASE_SERVICE_KEY is not set, nothing to do')
        return
    data = json.load(open(DATA, encoding='utf-8'))
    w = weights(data)
    gap = RULE['gap_days']
    today = (datetime.datetime.now(datetime.timezone.utc).date() - EPOCH).days + 1
    puzzles = load_puzzles()
    if not puzzles:
        sys.exit('make_schedule: the puzzles table is empty or unreadable; refusing to start a new list')
    last_day = max(puzzles)
    changed = []

    # 1. a future puzzle whose country left the data: draw that day again, keeping the gap on both sides
    replaced = 0
    for day in sorted(d for d in puzzles if d > today and puzzles[d] not in w):
        puzzles[day] = draw(day, w, puzzles, gap)
        changed.append(day)
        replaced += 1

    # 2. running low: add puzzles at the end
    added = 0
    if last_day - today < MIN_AHEAD:
        for day in range(last_day + 1, today + HORIZON + 1):
            puzzles[day] = draw(day, w, puzzles, gap)
            changed.append(day)
            added += 1

    if not changed:
        print('make_schedule: %d puzzles, %d after today, nothing to change' % (len(puzzles), last_day - today))
        return
    save_puzzles([(d, puzzles[d]) for d in sorted(set(changed))])
    # counts only: never print an answer (public logs)
    print('make_schedule: replaced %d future puzzle(s), added %d; the list now ends at #%d' % (replaced, added, max(puzzles)))


if __name__ == '__main__':
    main()
