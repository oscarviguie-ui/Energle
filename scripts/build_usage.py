"""Final energy use by sector, for the game: data/usage.json (from data/build/un_energy.json, UN Energy Statistics).

For each country and year, TWh by sector, two ways:
  e : all final energy  [industry, transport, homes, services & other, feedstocks]
  el: electricity only  [industry, transport, homes, services & other]
  - industry  = manufacturing, construction, mining (UN 121)
  - transport = road, rail, domestic flights and shipping, pipelines (122; international bunkers are not counted)
  - homes     = households (1231)
  - services & other = commerce and public services, farming, forestry and fishing, and unspecified (1235, 1232, 1234)
  - feedstocks = fuels used as raw material, not burnt: plastics, fertiliser, asphalt, lubricants (non-energy use, 11)
Sub-item codes that the UN also reports as their own total are counted once (hard coal, brown coal, "of which" biofuels).
latestYear is the last year with a full report (at least two of industry, transport and homes, and no sudden drop against
the year before). notReported lists a main sector a country leaves out (Puerto Rico: transport; Timor-Leste: industry).
"""
import json, sys
try:
    import pycountry
    NUM = {c.numeric: c.alpha_3 for c in pycountry.countries}
except ImportError:
    NUM = {}
OVERRIDE = {'251': 'FRA', '757': 'CHE', '579': 'NOR', '842': 'USA', '699': 'IND', '382': 'ITA', '381': 'ITA', '711': 'ZAF', '412': 'XKX', '158': 'TWN'}
AGG = {'0100': ('0110', '0121', '0129'), '0200': ('0210', '0220')}
SKIP = {'5212', '5222', '5232', '8000T', '7000G', '7000H', '7000N', '7000O', '7000S', '7000T', '7000W', 'EC', 'GR', 'WF', '9101'}
GROUPS = [['121'], ['122'], ['1231'], ['1235', '1232', '1234'], ['11']]

def twh(cs):
    t = 0.0
    for c, v in cs.items():
        if c in SKIP or (c in AGG and any(x in cs for x in AGG[c])):
            continue
        t += v
    return t / 3600

U = json.load(open('data/build/un_energy.json'))['data']
E = json.load(open('data/energle_data.json'))
by_iso = {}
for k in U:
    i = OVERRIDE.get(k) or NUM.get(k)
    if i and i not in by_iso:
        by_iso[i] = k

out, missing = {}, []
for name, info in E.items():
    if name.startswith('__') or not isinstance(info, dict):
        continue
    k = by_iso.get(info.get('iso3'))
    if not k:
        missing.append(name); continue
    years = {}
    for y, tr in sorted(U[k].items()):
        if int(y) < 2000:
            continue
        e = [round(sum(twh(tr.get(t, {})) for t in g), 2) for g in GROUPS]
        el = [round(sum(tr.get(t, {}).get('7000', 0) for t in g) / 3600, 2) for g in GROUPS[:4]]
        if sum(e) > 0:
            years[y] = {'e': e, 'el': el}
    ys = sorted(years)
    def ok(j, need):   # enough sectors reported, and no sudden drop against the year before
        d = years[ys[j]]['e']; prev = years[ys[j - 1]]['e'] if j else None
        return sum(d[i] > 0 for i in range(3)) >= need and (not prev or sum(d) >= 0.75 * sum(prev))
    latest = next((ys[j] for j in range(len(ys) - 1, -1, -1) if ok(j, 3)), None) \
        or next((ys[j] for j in range(len(ys) - 1, -1, -1) if ok(j, 2)), None)   # complete years first
    if not latest:
        missing.append(name); continue
    out[name] = {'iso3': info['iso3'], 'latestYear': int(latest), 'years': {y: v for y, v in years.items() if y <= latest}}
    gap = [i for i in range(3) if years[latest]['e'][i] <= 0]   # a main sector the country does not report
    if gap:
        out[name]['notReported'] = gap

# the world, year by year: the sum over the game's countries
world = {}
for v in out.values():
    for y, d in v['years'].items():
        w = world.setdefault(y, {'e': [0] * 5, 'el': [0] * 4, 'n': 0})
        w['e'] = [a + b for a, b in zip(w['e'], d['e'])]; w['el'] = [a + b for a, b in zip(w['el'], d['el'])]; w['n'] += 1
n_all = len(out)
out['__world__'] = {y: {'e': [round(x, 1) for x in w['e']], 'el': [round(x, 1) for x in w['el']]} for y, w in world.items() if w['n'] == n_all}
json.dump(out, open('data/usage.json', 'w'), separators=(',', ':'))
print(n_all, 'countries; missing:', missing, '; world years:', min(out['__world__']), '-', max(out['__world__']), file=sys.stderr)
