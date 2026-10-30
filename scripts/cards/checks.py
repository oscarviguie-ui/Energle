"""
Checks run on every build before cards.json is published.

Blocking (the card is dropped for that country, the rest still publishes):
  - a figure outside its possible range (a share above 100 %, negative rain, a month with no value...)
Blocking for the whole build (the previous cards.json stays live):
  - no country keeps the shop, or fewer than 60 % of the countries that had it in the live file
Reported only (data/cards_report.md):
  - countries with fewer than 3 cards (no shop for them)
  - electricity: gross imports minus exports far from Ember's net imports
  - big jumps against the previous build (a figure more than doubled or halved)
"""

RANGES = {   # card -> [(label, getter, lo, hi)]
    'nature': [('sun (kWh/m2/day)', lambda c: c['sun'], 0, 10), ('wind (m/s)', lambda c: c['wind'], 0, 25),
               ('rain (mm/yr)', lambda c: [c['rain']], 0, 6000), ('flow (km3/yr)', lambda c: [c['flow']], 0, 10000),
               ('elevation (m)', lambda c: [z for _, z in c['terr']], 0, 7000)],
    'under':  [('rents (% GDP)', lambda c: list(c['rents'].values()), 0, 90),
               ('reserves', lambda c: [v[0] for v in c['fossil'].values()], 0, 1e6)],
    'trade':  [('trade (bn US$)', lambda c: [v for row in c['trade']['IN'] + c['trade']['OUT'] for v in row[2].values()], 0, 1000)],
    'market': [('electricity (TWh)', lambda c: [v for n in c['elec']['NB'] for v in (n[2], n[3])], 0, 200)],
    'people': [('access (%)', lambda c: c['access'] + [c['cook']], 0, 100), ('urban (%)', lambda c: [c['urban']], 0, 100),
               ('income ($)', lambda c: [c['gdp']], 200, 250000), ('industry (%)', lambda c: [c['industry']], 0, 90),
               ('degree-days', lambda c: [c['hdd'], c['cdd']], 0, 12000), ('temperature (C)', lambda c: [c['cold'], c['hot']], -50, 50)],
}
MIN_CARDS = 3


def run(countries, game, previous):
    """Drops out-of-range cards in place; returns (report lines, ok_to_publish)."""
    lines, errors = [], []
    for iso, C in countries.items():
        for card in list(C['cards']):
            for label, get, lo, hi in RANGES.get(card, []):
                try:
                    vals = get(C)
                except (KeyError, TypeError, IndexError) as err:
                    errors.append('%s %s: missing %s' % (iso, card, err)); C['cards'].remove(card); break
                bad = [v for v in vals if v is None or not (lo <= v <= hi)]
                if bad:
                    errors.append('%s %s: %s out of range %s' % (iso, card, label, bad[:3])); C['cards'].remove(card); break

    shop = [iso for iso, C in countries.items() if len(C['cards']) >= MIN_CARDS]
    few = sorted(iso for iso, C in countries.items() if len(C['cards']) < MIN_CARDS)
    per_card = {k: sum(1 for C in countries.values() if k in C['cards']) for k in ('nature', 'under', 'trade', 'market', 'people')}
    lines += ['## Coverage', '', '- countries in the game: %d' % len(countries), '- with the shop (%d+ cards): %d' % (MIN_CARDS, len(shop))]
    lines += ['- %s: %d' % (k, v) for k, v in per_card.items()]
    if few:
        lines += ['', 'No shop (fewer than %d cards): %s' % (MIN_CARDS, ', '.join(few))]

    # electricity: gross flows against Ember's net balance
    gaps = []
    for iso, C in countries.items():
        if 'market' not in C['cards']:
            continue
        g = next((v for k, v in game.items() if isinstance(v, dict) and v.get('iso3') == iso), None)
        if not g:
            continue
        yd = (g.get('years') or {}).get(str(g.get('latestYear'))) or {}
        net = yd.get('NetImports')
        if net is None:
            continue
        nb = C['elec']['NB']
        mine = sum(n[2] - n[3] for n in nb)
        if abs(mine - net) > max(1.0, 0.1 * (yd.get('Demand') or 0)):
            # the card says so (red asterisk): its sources don't agree with the main chart
            sign = lambda v: '0' if abs(v) < 0.05 else ('+' if v > 0 else '') + ('%.1f' % v)
            note = ('Imports minus exports here: %s TWh; the main chart (Ember) shows %s TWh. The sources count trade differently '
                    'and don’t always agree.' % (sign(mine), sign(net)))
            fl = C.setdefault('flags', {})
            fl['market'] = (fl['market'] + ' ' + note) if fl.get('market') else note
            gaps.append('%s: imports - exports %.1f TWh vs Ember net %.1f TWh (%s %s)' % (iso, mine, net, C['elec'].get('source'), C['elec'].get('year')))
    if gaps:
        lines += ['', '## Electricity trade vs Ember net imports (gap > 1 TWh and > 10 % of demand)', ''] + ['- ' + x for x in sorted(gaps)]

    # jumps against the previous build
    prev = (previous or {}).get('countries', {})
    jumps = []
    for iso, C in countries.items():
        P = prev.get(iso)
        if not P:
            continue
        for key in ('rain', 'flow', 'gdp', 'urban', 'industry', 'cook', 'hdd', 'cdd'):
            a, b = P.get(key), C.get(key)
            if isinstance(a, (int, float)) and isinstance(b, (int, float)) and a > 0 and b > 0 and (b / a > 2 or a / b > 2):
                jumps.append('%s %s: %s -> %s' % (iso, key, a, b))
    if jumps:
        lines += ['', '## Big changes against the live file', ''] + ['- ' + x for x in jumps]
    if errors:
        lines += ['', '## Cards dropped (figures out of range)', ''] + ['- ' + x for x in errors]

    prev_shop = sum(1 for P in prev.values() if len(P.get('cards', [])) >= MIN_CARDS)
    ok = len(shop) > 0 and (not prev_shop or len(shop) >= 0.6 * prev_shop)
    if not ok:
        lines += ['', '**Not published:** only %d countries keep the shop%s.' % (len(shop), ', against %d in the live file' % prev_shop if prev_shop else '')]
    return lines, ok
