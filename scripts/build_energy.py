"""Build data/energy.json: each country's total energy use by source, year by year, for the game's
"All energy" view. Same shape as data/energle_data.json, so the game can swap one for the other.

One method for every country (so profiles stay comparable):
  * Fossil fuels (coal, gas, oil): the energy burned, from EIA (data/build/eia_energy.json,
    scripts/fetch_eia_energy.py). Liquid biofuels, which EIA counts with oil, are moved to Bioenergy.
  * Nuclear, hydro, wind, solar, bioenergy and other renewables used for power: Ember's electricity
    divided by the efficiency of the fossil plants it replaces (the Energy Institute's "substitution
    method"; EFFICIENCY below, the factor the Energy Institute used each year).
  * Countries that sell electricity abroad: only the share used at home counts towards consumption
    (all of it counts as production). Electricity bought abroad is not counted, as in the Energy
    Institute's figures: it was made from another country's energy.
  * Oil sits in the game's "Other Fossil" slot (shown as "Oil" in this view).
Per year: each source (TWh), Total = consumption, Produced = domestic production, NetImports =
Total - Produced (positive: the country buys energy abroad), Demand = Total.
Not counted anywhere: traditional wood and charcoal (no open data); countries where they matter are
flagged (woodGap).

Usage: python scripts/build_energy.py   (needs data/build/eia_energy.json)
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# fossil-plant efficiency assumed by the Energy Institute for non-fossil electricity, by year
# (their nuclear input-equivalent over nuclear generation, world, 2000-2024)
EFFICIENCY = {2000: .3544, 2001: .3565, 2002: .3594, 2003: .3614, 2004: .3634, 2005: .3664, 2006: .3685, 2007: .3702,
              2008: .3731, 2009: .3751, 2010: .3781, 2011: .3799, 2012: .3820, 2013: .3844, 2014: .3864, 2015: .3885,
              2016: .3915, 2017: .3935, 2018: .3958, 2019: .3980, 2020: .3989, 2021: .4002, 2022: .4010, 2023: .4040,
              2024: .4041}
EIA_CODE = {'XKX': 'XKS', 'KOS': 'XKS'}   # EIA's own codes where they differ
CLEAN = ['Nuclear', 'Hydro', 'Wind', 'Solar', 'Bioenergy', 'Other Renewables']
# where wood and charcoal are a large share of energy use and appear in no open dataset
WOOD_GAP = {'AGO', 'BDI', 'BEN', 'BFA', 'CAF', 'CIV', 'CMR', 'COD', 'COG', 'ERI', 'ETH', 'GAB', 'GHA', 'GIN', 'GMB', 'GNB',
            'GNQ', 'KEN', 'LBR', 'LSO', 'MDG', 'MLI', 'MOZ', 'MRT', 'MWI', 'NER', 'NGA', 'RWA', 'SDN', 'SEN', 'SLE', 'SOM',
            'SSD', 'SWZ', 'TCD', 'TGO', 'TZA', 'UGA', 'ZMB', 'ZWE', 'NPL', 'AFG', 'HTI', 'MMR', 'KHM', 'LAO', 'PNG', 'BTN'}


def r(v): return round(v, 2)


def main():
    elec = json.load(open(os.path.join(ROOT, 'data', 'energle_data.json'), encoding='utf-8'))
    elec.pop('__world_dpc__', None)
    eia = json.load(open(os.path.join(ROOT, 'data', 'build', 'eia_energy.json')))
    out, missing = {}, []
    for name, info in elec.items():
        iso = info['iso3']; ef = eia.get(iso) or eia.get(EIA_CODE.get(iso, ''))
        if not ef: missing.append(name); continue
        years = {}
        for ys, e in info['years'].items():
            y = int(ys); f = ef.get(ys)
            if y not in EFFICIENCY or not f or not e.get('Total'): continue
            eff = EFFICIENCY[y]; gen = e['Total']; net = e.get('NetImports') or 0
            home = (gen + net) / gen if net < 0 else 1.0                        # exporters: the share used at home
            bio_fuel = f.get('bio_c', 0)
            d = {'Coal': f.get('coal_c', 0), 'Gas': f.get('gas_c', 0), 'Other Fossil': max(f.get('oil_c', 0) - bio_fuel, 0)}   # oil, in the game's "other fossil" slot
            for s in CLEAN: d[s] = (e.get(s) or 0) / eff * home
            d['Bioenergy'] += bio_fuel
            total = sum(d.values())
            produced = (f.get('coal_p', 0) + f.get('gas_p', 0) + max(f.get('oil_p', 0), 0) + f.get('bio_p', 0)
                        + sum((e.get(s) or 0) / eff for s in CLEAN))
            d = {k: r(v) for k, v in d.items()}
            d.update(Total=r(total), Produced=r(produced), NetImports=r(total - produced), Demand=r(total))
            years[ys] = d
        if not years: missing.append(name); continue
        ly = max(years, key=int); le = info['latestYear']
        pop = (info['years'][str(le)].get('Demand') or 0) * 1e6 / info['latestDpc'] if info.get('latestDpc') else None
        rec = {k: v for k, v in info.items() if k not in ('years', 'latestYear', 'latestDpc')}
        rec.update(latestYear=int(ly), latestDpc=r(years[ly]['Total'] * 1e6 / pop) if pop else None, years=years, pop=round(pop) if pop else None)
        if iso in WOOD_GAP: rec['woodGap'] = True
        out[name] = rec
    # world use per person, by year: all these countries together
    wd = {}
    for ys in {y for v in out.values() for y in v['years']}:
        t = sum(v['years'][ys]['Total'] for v in out.values() if ys in v['years'] and v.get('pop'))
        p = sum(v['pop'] for v in out.values() if ys in v['years'] and v.get('pop'))
        if p: wd[ys] = r(t * 1e6 / p)
    out['__world_dpc__'] = dict(sorted(wd.items()))
    with open(os.path.join(ROOT, 'data', 'energy.json'), 'w', encoding='utf-8') as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(',', ':'))
    print(len(out) - 1, 'countries;', len(missing), 'without EIA data:', ', '.join(missing))


if __name__ == '__main__':
    main()
