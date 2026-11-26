"""Final energy use by sector from the UN Energy Statistics Database (UNSD, data.un.org SDMX API).

Runs in GitHub Actions (the API is not reachable from everywhere). Writes data/build/un_energy.json:
  {"areas": {m49: name}, "data": {m49: {year: {transaction: {commodity: TJ}}}}}
Every value is converted to terajoules with the database's own CONVERSION_FACTOR.
Licence: UNSD data may be copied and redistributed for non-profit use, citing UNSD as the source.
"""
import csv, io, json, os, sys, urllib.request

BASE = 'https://data.un.org/WS/rest'
SECTORS = ['121', '122', '1231', '1232', '1234', '1235', '11']   # industry, transport, homes, farming, other, services, non-energy
START = 2000

def get(url, accept):
    req = urllib.request.Request(url, headers={'Accept': accept, 'User-Agent': 'energle-data'})
    with urllib.request.urlopen(req, timeout=600) as r:
        return r.read()

areas = {}
s = json.loads(get(BASE + '/codelist/UNSD/CL_AREA_NRG/latest', 'application/vnd.sdmx.structure+json;version=1.0'))
s = s.get('data', s)
for cl in s['codelists']:
    for c in cl['codes']:
        areas[c['id']] = c['name'] if isinstance(c.get('name'), str) else c.get('names', {}).get('en', '')

data = {}
for tr in SECTORS:   # one query per sector keeps each response a manageable size
    raw = get(BASE + '/data/DF_UNDATA_ENERGY/A...' + tr + '?startPeriod=' + str(START), 'application/vnd.sdmx.data+csv;version=1.0.0')
    n = 0
    for r in csv.DictReader(io.StringIO(raw.decode('utf-8'))):
        try:
            v = float(r['OBS_VALUE']) * float(r.get('CONVERSION_FACTOR') or 'nan')   # the factor already covers the unit (e.g. TJ per thousand tonnes)
        except ValueError:
            continue
        if v != v:
            continue
        a, y, c = r['REF_AREA'], r['TIME_PERIOD'], r['COMMODITY']
        d = data.setdefault(a, {}).setdefault(y, {}).setdefault(tr, {})
        d[c] = round(d.get(c, 0) + v, 1); n += 1
    print(tr, n, 'values', file=sys.stderr)

# electricity balance, from generation to use: gross production, imports, exports, energy industry own use, losses,
# electricity turned into heat (electric boilers, heat pumps), final consumption
ELEC_TR = ['01', '018', '019', '03', '04', '09', '0926', '0927', '101', '0889E', '0889H', '12']
elec = {}
raw = get(BASE + '/data/DF_UNDATA_ENERGY/A..7000.' + '+'.join(ELEC_TR) + '?startPeriod=' + str(START), 'application/vnd.sdmx.data+csv;version=1.0.0')
for r in csv.DictReader(io.StringIO(raw.decode('utf-8'))):
    try:
        v = float(r['OBS_VALUE']) * float(r.get('CONVERSION_FACTOR') or 'nan')
    except ValueError:
        continue
    if v == v:
        elec.setdefault(r['REF_AREA'], {}).setdefault(r['TIME_PERIOD'], {})[r['TRANSACTION']] = round(v, 1)
print('electricity balance:', len(elec), 'areas', file=sys.stderr)

os.makedirs('data/build', exist_ok=True)
json.dump({'areas': areas, 'data': data, 'elec': elec}, open('data/build/un_energy.json', 'w'), separators=(',', ':'))
print(len(data), 'areas', file=sys.stderr)
