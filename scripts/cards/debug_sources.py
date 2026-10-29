"""
Diagnostics for the card sources whose formats could not be checked from outside GitHub:
writes data/debug_sources.txt (World Bank outage indicators, EIA facet names, ScienceBase USGS items).
Run only on the cards-pipeline-test branch.
"""
import json
import os
import sys
import traceback

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from cards.common import DATA_DIR, get_json  # noqa: E402

out = []
p = out.append


def section(title, fn):
    p('\n==== ' + title)
    try:
        fn()
    except Exception:       # noqa: BLE001
        p(traceback.format_exc())


def wb():
    for code in ('IC.ELC.OUTG', 'IC.ELC.OUTG.ZS', 'IC.FRM.OUTG.ZS'):
        meta = get_json('https://api.worldbank.org/v2/indicator/' + code, {'format': 'json'})
        p('%s meta: %s' % (code, json.dumps(meta)[:400]))
        for src in ('2', '3', '16', '57'):
            try:
                body = get_json('https://api.worldbank.org/v2/country/all/indicator/' + code, {'format': 'json', 'per_page': 500, 'mrnev': 1, 'source': src}, tries=1)
                n = len(body[1] or []) if isinstance(body, list) and len(body) > 1 else 0
                p('  source %s: %d rows %s' % (src, n, json.dumps(body[0])[:200] if isinstance(body, list) else str(body)[:200]))
            except Exception as err:     # noqa: BLE001
                p('  source %s: %s' % (src, err))
    found = get_json('https://api.worldbank.org/v2/indicator', {'format': 'json', 'per_page': 30000}, timeout=180)
    for ind in found[1]:
        if 'outage' in (ind.get('name') or '').lower():
            p('  indicator %s | %s | source %s' % (ind['id'], ind['name'], (ind.get('source') or {}).get('id')))


def eia():
    key = os.environ.get('EIA_API_KEY', '').strip()
    if not key:
        p('no EIA key'); return
    for facet in ('productId', 'activityId', 'unit'):
        body = get_json('https://api.eia.gov/v2/international/facet/' + facet, {'api_key': key})
        facets = body['response']['facets']
        p('%s: %d values' % (facet, len(facets)))
        for f in facets:
            p('  %s | %s | %s' % (f.get('id'), f.get('name'), f.get('alias', '')))


def usgs():
    for q in ('Mineral Commodity Summaries 2026 data release', 'Mineral Commodity Summaries 2025 data release'):
        hits = get_json('https://www.sciencebase.gov/catalog/items', {'q': q, 'format': 'json', 'max': 10, 'fields': 'title,id'})
        p('query %r -> %d' % (q, len(hits.get('items', []))))
        for it in hits.get('items', []):
            p('  %s | %s' % (it.get('id'), it.get('title')))
        for it in hits.get('items', [])[:3]:
            item = get_json('https://www.sciencebase.gov/catalog/item/' + it['id'], {'format': 'json'})
            files = list(item.get('files', [])) + [f for ex in item.get('facets', []) for f in ex.get('files', [])]
            p('  files of %s: %s' % (it['id'], [(f.get('name'), (f.get('url') or '')[:90]) for f in files][:40]))
            p('  links: %s' % [(l.get('title'), l.get('uri')) for l in item.get('webLinks', [])][:15])


section('World Bank outages', wb)
section('EIA facets', eia)
section('USGS ScienceBase', usgs)
open(os.path.join(DATA_DIR, 'debug_sources.txt'), 'w', encoding='utf-8').write('\n'.join(out) + '\n')
print('\n'.join(out)[:3000])
