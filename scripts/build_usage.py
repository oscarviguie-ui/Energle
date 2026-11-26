"""Final energy use by sector, for the game: data/usage.json (from data/build/un_energy.json, UN Energy Statistics).

For each country and year, TWh by sector, two ways:
  e : applications, what the energy is used for  [industry, transport, homes, services & other, feedstocks]
  s : sources, what is used                       [oil, natural gas, coal, electricity, biomass, district heat]
      (biomass: wood, charcoal, crop waste, biofuels, biogas, waste, and solar or geothermal heat used directly)
  Both add up to the same total: feedstocks count under the fuel they are made of.
  flow: for the latest year, TWh from each source to each application (rows: applications, columns: sources).
  - industry  = manufacturing, construction, mining (UN 121)
  - transport = road, rail, domestic flights and shipping, pipelines (122; international bunkers are not counted)
  - homes     = households (1231)
  - services & other = commerce and public services, farming, forestry and fishing, and unspecified (1235, 1232, 1234)
  - feedstocks = fuels used as raw material, not burnt: plastics, fertiliser, asphalt, lubricants (non-energy use, 11)
Sub-item codes that the UN also reports as their own total are counted once (hard coal, brown coal, "of which" biofuels).
latestYear is the last year with a full report (at least two of industry, transport and homes, and no sudden drop against
the year before, and no source that mattered the year before gone to zero). onlyElectricity marks a country that reports
only its electricity use (Puerto Rico). notReported lists a main sector a country leaves out (Puerto Rico: transport; Timor-Leste: industry).
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
ALL_TR = [t for g in GROUPS for t in g]
# final energy by what is used. Fuels used on site: oil, natural gas, coal, biomass (with waste, and the small amount of
# solar and geothermal heat used directly). Made elsewhere and delivered: electricity, district heat.
def source_of(c):
    if c == '7000': return 3
    if c == '8000': return 5
    if c in ('DG', 'DS'): return 4
    if c == '3000': return 1
    if c[:1] == '4' or c == '2000': return 0
    if c[:1] in ('0', '1'): return 2                     # coal, coal products and gases made from coal, peat
    if c[:1] in ('5', '6'): return 4                     # wood, charcoal, bagasse, biofuels, biogas, waste
    return None

def by_source(trs):
    out = [0.0] * 6
    for t in ALL_TR:
        cs = trs.get(t, {})
        for c, v in cs.items():
            if c in SKIP or (c in AGG and any(x in cs for x in AGG[c])):
                continue
            i = source_of(c)
            if i is not None:
                out[i] += v / 3600
    return [round(x, 2) for x in out]

def flow(trs):
    """TWh from each source to each application: rows = applications (GROUPS), columns = sources."""
    m = [[0.0] * 6 for _ in GROUPS]
    for a, g in enumerate(GROUPS):
        for t in g:
            cs = trs.get(t, {})
            for c, v in cs.items():
                if c in SKIP or (c in AGG and any(x in cs for x in AGG[c])):
                    continue
                i = source_of(c)
                if i is not None:
                    m[a][i] += v / 3600
    return [[round(x, 2) for x in row] for row in m]

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
        if sum(e) > 0:
            years[y] = {'e': e, 's': by_source(tr)}
    ys = sorted(years)
    def ok(j, need):   # enough sectors reported, no sudden drop against the year before, and no source gone missing
        d = years[ys[j]]['e']; prev = years[ys[j - 1]]['e'] if j else None
        s_, ps = years[ys[j]]['s'], years[ys[j - 1]]['s'] if j else None
        lost = ps and any(ps[i] > 0.02 * sum(ps) and s_[i] <= 0 for i in range(6))
        return sum(d[i] > 0 for i in range(3)) >= need and (not prev or sum(d) >= 0.75 * sum(prev)) and not lost
    latest = next((ys[j] for j in range(len(ys) - 1, -1, -1) if ok(j, 3)), None) \
        or next((ys[j] for j in range(len(ys) - 1, -1, -1) if ok(j, 2)), None)   # complete years first
    if not latest:
        missing.append(name); continue
    out[name] = {'iso3': info['iso3'], 'latestYear': int(latest), 'years': {y: v for y, v in years.items() if y <= latest},
                 'flow': flow(U[k][latest])}   # latest year: application x source
    if sum(years[latest]['s'][i] for i in (0, 1, 2, 4, 5)) <= 0:
        out[name]['onlyElectricity'] = True                     # fuels not reported, only electricity (Puerto Rico)
    gap = [i for i in range(3) if years[latest]['e'][i] <= 0]   # a main sector the country does not report
    if gap:
        out[name]['notReported'] = gap

# the world, year by year: the sum over the game's countries
world = {}
for v in out.values():
    for y, d in v['years'].items():
        w = world.setdefault(y, {'e': [0] * 5, 's': [0] * 6, 'n': 0})
        w['e'] = [a + b for a, b in zip(w['e'], d['e'])]; w['s'] = [a + b for a, b in zip(w['s'], d['s'])]; w['n'] += 1
n_all = len(out)
out['__world__'] = {y: {'e': [round(x, 1) for x in w['e']], 's': [round(x, 1) for x in w['s']]} for y, w in world.items() if w['n'] == n_all}
json.dump(out, open('data/usage.json', 'w'), separators=(',', ':'))
print(n_all, 'countries; missing:', missing, '; world years:', min(out['__world__']), '-', max(out['__world__']), file=sys.stderr)
