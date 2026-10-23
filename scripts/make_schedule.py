"""
Keeps puzzles.json, the list of daily answers (one ISO3 code per puzzle number), topped up.

The list is never redrawn. Each run only:
- adds another stretch of puzzles at the end when fewer than MIN_AHEAD are left after today;
- replaces a future puzzle whose country is no longer in energle_data.json (that day only).
Played puzzles, today and anything edited by hand stay exactly as they are.

New puzzles are drawn day by day with the same seeded random number as the game:
    weight = generation^(1/3) x (base + signature_weight x signature + transition_weight x min(change since 2010, cap))
where signature = how far the country's strongest low-carbon source sits above the world share,
and a country cannot come back within `gap_days` days. Past the last entry, the game draws with the same rule.

Run after refresh_data.py:  python scripts/make_schedule.py
"""
import json, datetime, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'energle_data.json')
OUT = os.path.join(ROOT, 'puzzles.json')
EPOCH = datetime.date(2026, 6, 2)          # puzzle #1
MIN_AHEAD = 365                            # top up when fewer puzzles than this are left after today
HORIZON = 730                              # a top-up extends the list to about two years after today

SOURCES = ['Coal', 'Gas', 'Other Fossil', 'Nuclear', 'Hydro', 'Wind', 'Solar', 'Bioenergy', 'Other Renewables']
LOW_CARBON = ['Nuclear', 'Hydro', 'Wind', 'Solar', 'Bioenergy', 'Other Renewables']


# ---- the game's random number (mulberry32, first draw only), in 32-bit integer arithmetic ----
def _i32(x):
    x &= 0xFFFFFFFF
    return x - 0x100000000 if x & 0x80000000 else x

def _u32(x):
    return x & 0xFFFFFFFF

def _imul(a, b):
    return _i32(a * b)

def day_random(day):
    seed = _i32(day * 2654435761)
    seed = _i32(seed + 0x6D2B79F5)
    t = _imul(_i32(seed ^ (_u32(seed) >> 15)), _i32(1 | seed))
    t = _i32(_i32(t + _imul(_i32(t ^ (_u32(t) >> 7)), _i32(61 | t))) ^ t)
    return _u32(t ^ (_u32(t) >> 14)) / 4294967296


def shares(year):
    total = (year or {}).get('Total') or 0
    if not total:
        return None
    return [(year.get(k) or 0) / total for k in SOURCES]


def weights(data, rule):
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
        sig = max([0.0] + [(r['s'][SOURCES.index(k)] - world[SOURCES.index(k)]) * (rule['hydro_factor'] if k == 'Hydro' else 1)
                           for k in LOW_CARBON])
        mult = rule['base'] + rule['signature_weight'] * sig + rule['transition_weight'] * min(r['change'], rule['transition_cap'])
        out[r['iso']] = max(max(r['g'], 0.01) ** rule['size_exponent'] * mult, 1e-9)
    return dict(sorted(out.items()))        # fixed order: by ISO3 code, as in the game


def draw(day, w, last, gap, blocked=()):
    pool = [iso for iso in w if (iso not in last or day - last[iso] > gap) and iso not in blocked] or list(w)
    x = day_random(day) * sum(w[i] for i in pool)
    for iso in pool:
        x -= w[iso]
        if x <= 0:
            return iso
    return pool[-1]


def main():
    data = json.load(open(DATA, encoding='utf-8'))
    sched = json.load(open(OUT, encoding='utf-8'))
    rule, puzzles = sched['rule'], sched['puzzles']
    gap = rule['gap_days']
    today = (datetime.datetime.now(datetime.timezone.utc).date() - EPOCH).days + 1
    w = weights(data, rule)
    changes = []

    # 1. a future puzzle whose country left the data: draw that day again, keeping the gap on both sides
    for i, iso in enumerate(puzzles):
        day = i + 1
        if day <= max(today, sched.get('frozen', 0)) or iso in w:
            continue
        last = {p: k + 1 for k, p in enumerate(puzzles[:i])}
        near = {p for p in puzzles[i + 1:i + 1 + gap]}
        puzzles[i] = draw(day, w, last, gap, near)
        changes.append('#%d %s -> %s' % (day, iso, puzzles[i]))

    # 2. running low: add puzzles at the end
    if len(puzzles) - today < MIN_AHEAD:
        last = {p: k + 1 for k, p in enumerate(puzzles)}
        start = len(puzzles) + 1
        for day in range(start, today + HORIZON + 1):
            iso = draw(day, w, last, gap)
            puzzles.append(iso)
            last[iso] = day
        changes.append('added #%d to #%d' % (start, len(puzzles)))

    if not changes:
        print('puzzles.json: %d puzzles, %d left after today, nothing to change' % (len(puzzles), len(puzzles) - today))
        return
    sched['puzzles'] = puzzles
    sched['updated'] = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d')
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(sched, f, separators=(',', ':'))
    print('puzzles.json: ' + '; '.join(changes))


if __name__ == '__main__':
    main()
