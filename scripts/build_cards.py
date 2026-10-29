"""
Builds cards.json, the data behind the Clue Shop's cards, from open sources. Run monthly by
.github/workflows/refresh-cards.yml (after the Ember refresh), or by hand:

    python scripts/build_cards.py                  # due sources only (see the cadences below)
    python scripts/build_cards.py wdi eia          # just these sources
    python scripts/build_cards.py --all            # every source, whatever is due
    python scripts/build_cards.py --assemble       # no downloads: rebuild cards.json from data/cards_raw.json

Sources and how often they are fetched (a source that fails, or has no key, keeps its last data):
    wdi        World Bank indicators          monthly    no key
    eia        U.S. EIA reserves, output,     monthly    EIA_API_KEY
               electricity imports/exports
    entsoe     ENTSO-E border flows (Europe)  monthly    ENTSOE_API_KEY (optional)
    baci       CEPII BACI trade               yearly     no key - re-read only when a new release is out
    usgs       USGS minerals                  yearly     no key - re-read only when a new release is out
    power      NASA POWER climatology         yearly     no key - points cached in data/power_cache.json
    elevation  NOAA ETOPO via OpenTopoData    once       no key - cached in data/elevation_cache.json

Files: data/cards_raw.json (every source's figures), cards.json (what the game reads, published
only if scripts/cards/checks.py passes), data/cards_report.md (coverage, gaps, what changed).
"""
import os
import sys
import traceback

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from cards import assemble, baci, checks, eia, elevation, entsoe, factbook, power, usgs, wdi   # noqa: E402
from cards.common import CARDS_FILE, RAW_FILE, REPORT_FILE, days_since, game_countries, game_data, load_json, save_json, today   # noqa: E402

SOURCES = {'wdi': wdi, 'eia': eia, 'factbook': factbook, 'entsoe': entsoe, 'baci': baci, 'usgs': usgs, 'power': power, 'elevation': elevation}


def due(name, mod, state, countries):
    """Whether a source should be fetched on this run, and whether to start it afresh."""
    cad = getattr(mod, 'CADENCE', 'monthly')
    if cad == 'monthly':
        return True, False
    if cad == 'once':
        have = (state.get('countries') or 0)
        return have < len(countries), False
    # yearly: BACI and USGS look for a new release every month (cheap); POWER starts afresh once a year
    if name in ('baci', 'usgs'):
        return True, False
    return days_since(state.get('updated')) >= 330 or not state.get('countries'), days_since(state.get('updated')) >= 365


def main(argv):
    args = [a for a in argv if not a.startswith('--')]
    flags = {a for a in argv if a.startswith('--')}
    countries = game_countries()
    raw = load_json(RAW_FILE, {})
    log_lines = []
    log = lambda m: (print(m), log_lines.append(m))
    failed = []
    if '--assemble' not in flags:
        names = args or list(SOURCES)
        for name in names:
            mod = SOURCES.get(name)
            if not mod:
                log('unknown source %s' % name); continue
            block = raw.setdefault(name, {'data': {}, 'meta': {}})
            state = dict(block.get('meta', {}))
            go, fresh = due(name, mod, state, countries)
            if not go and '--all' not in flags and not args:
                log('== %s: not due (last %s)' % (name, state.get('updated'))); continue
            if fresh or (name in args and name in ('usgs', 'baci', 'entsoe')):   # named on the command line: re-read the release
                state['refresh'] = True
            log('== %s' % name)
            try:
                data, meta = mod.build(countries, state, log=log)
            except Exception as err:            # noqa: BLE001 - keep what we had, report at the end
                log('  FAILED: %s: %s | %s' % (type(err).__name__, err, traceback.format_exc().strip().splitlines()[-3:])); traceback.print_exc()
                failed.append(name); continue
            if data is None:                   # skipped: no key, or nothing new
                continue
            if not data:
                log('  no data returned; keeping the previous figures'); failed.append(name); continue
            block['data'] = data
            block['meta'] = {**(meta or {}), 'updated': today().isoformat(), 'countries': len(data)}
            log('  -> %d countries' % len(data))
        save_json(RAW_FILE, raw)

    game = game_data()
    cards, why, world = assemble.build(raw, game, log=log)
    previous = load_json(CARDS_FILE, {})
    lines, ok = checks.run(cards, game, previous)
    sources = {s: {k: v for k, v in (raw.get(s) or {}).get('meta', {}).items() if k in ('updated', 'release', 'year', 'countries')} for s in SOURCES}
    out = {'version': 1, 'built': today().isoformat(), 'sources': sources, 'world': world, 'countries': cards}
    report = ['# Clue cards build %s' % today().isoformat(), '',
              'Published: **%s**' % ('yes' if ok else 'no, the live cards.json was kept'), '',
              '## Sources', ''] + ['- %s: %s' % (s, v or 'never fetched') for s, v in sources.items()]
    if failed:
        report += ['', 'Failed this run (kept their previous figures): ' + ', '.join(failed)]
    report += [''] + lines + ['', '## Log', '', '```'] + log_lines[-400:] + ['```']
    open(REPORT_FILE, 'w', encoding='utf-8').write('\n'.join(report) + '\n')
    if ok:
        save_json(CARDS_FILE, out)
        print('cards.json: %d countries, %d with the shop' % (len(cards), sum(1 for C in cards.values() if len(C['cards']) >= checks.MIN_CARDS)))
    else:
        print('cards.json NOT updated, see data/cards_report.md')
    return 0 if ok and len(failed) < len(SOURCES) else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
