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


def eia_bulk():
    import io, re, zipfile
    from cards.common import get
    raw = get('https://api.eia.gov/bulk/INTL.zip', timeout=600).content
    z = zipfile.ZipFile(io.BytesIO(raw))
    p('INTL.zip files: %s, %d MB' % (z.namelist(), len(raw) // 1e6))
    rx = re.compile(r'^INTL\.(\d+)-(\d+)-([A-Z]{3})-([A-Za-z]+)\.A$')
    seen, examples = {}, {}
    with z.open(z.namelist()[0]) as f:
        for i, line in enumerate(f):
            try:
                d = json.loads(line)
            except ValueError:
                continue
            sid = d.get('series_id') or ''
            m = rx.match(sid)
            if not m:
                if i < 3: p('  other line keys: %s' % list(d)[:10])
                continue
            k = (m.group(1), m.group(2), m.group(4))
            seen[k] = seen.get(k, 0) + 1
            if k not in examples:
                examples[k] = (sid, d.get('name'), (d.get('data') or [])[:2])
    for k in sorted(seen, key=lambda k: (int(k[0]), int(k[1]))):
        if k[0] in ('57', '26', '7', '2', '1', '4', '12', '44') :
            p('  product %s activity %s unit %s: %d series e.g. %s' % (k[0], k[1], k[2], seen[k], examples[k]))


def usgs_csv():
    from cards.common import get
    url = 'https://www.sciencebase.gov/catalog/file/get/696a75d5d4be0228872d3bf8?f=__disk__eb%2F4d%2F'
    hits = get_json('https://www.sciencebase.gov/catalog/item/696a75d5d4be0228872d3bf8', {'format': 'json'})
    for f in hits.get('files', []):
        if f['name'] == 'MCS2026_Commodities_Data.csv':
            url = f['url']
    text = get(url, timeout=120).content.decode('utf-8-sig', errors='replace')
    lines = text.splitlines()
    p('rows %d; header: %s' % (len(lines), lines[0]))
    for ln in lines[1:]:
        if re.search(r'lithium|platinum|graphite|rare earth', ln, re.I) and re.search(r'chile|australia|south africa|china|world', ln, re.I):
            p('  ' + ln[:300])


import re  # noqa: E402
def wb2():
    body = get_json('https://api.worldbank.org/v2/country/all/indicator/IC.FRM.INFRA.IN2', {'format': 'json', 'per_page': 500, 'mrnev': 1, 'source': 13})
    p('IC.FRM.INFRA.IN2 source 13: %s; rows %d; e.g. %s' % (json.dumps(body[0])[:150], len(body[1] or []), [(r['countryiso3code'], r['date'], r['value']) for r in (body[1] or [])[:6]]))


section('World Bank outages (Enterprise Surveys source)', wb2)
section('EIA bulk INTL', eia_bulk)
section('USGS commodities CSV', usgs_csv)
open(os.path.join(DATA_DIR, 'debug_sources.txt'), 'w', encoding='utf-8').write('\n'.join(out) + '\n')
print('\n'.join(out)[:3000])
