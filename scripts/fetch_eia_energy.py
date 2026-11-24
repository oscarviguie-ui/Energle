"""Extract, from EIA's international bulk file, what the total-energy view needs for every country, 2000 onwards:
fuel use (consumption) and domestic production of coal, natural gas, oil (petroleum and other liquids) and liquid
biofuels, converted from quadrillion Btu to TWh. Writes data/build/eia_energy.json.

Runs in GitHub Actions (EIA's servers are reachable there): python scripts/fetch_eia_energy.py
"""
import io, json, os, zipfile, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
QBTU_TWH = 293.07107                     # 1 quadrillion Btu in TWh
SERIES = {('4411', '2'): 'coal_c', ('4413', '2'): 'gas_c', ('4415', '2'): 'oil_c', ('79', '2'): 'bio_c',
          ('4411', '1'): 'coal_p', ('4413', '1'): 'gas_p', ('4415', '1'): 'oil_p', ('79', '1'): 'bio_p'}
FIRST = 2000


def main():
    raw = urllib.request.urlopen('https://api.eia.gov/bulk/INTL.zip', timeout=900).read()
    z = zipfile.ZipFile(io.BytesIO(raw)); out = {}
    with z.open(z.namelist()[0]) as f:
        for line in f:
            try: d = json.loads(line)
            except ValueError: continue
            sid = d.get('series_id') or ''
            if not (sid.startswith('INTL.') and sid.endswith('-QBTU.A')): continue
            parts = sid[5:-2].split('-')                           # product, activity, ISO, unit
            if len(parts) != 4 or len(parts[2]) != 3: continue
            key = SERIES.get((parts[0], parts[1]))
            if not key: continue
            for y, v in d.get('data') or []:
                try: y, v = int(str(y)[:4]), float(v)
                except (TypeError, ValueError): continue
                if y >= FIRST: out.setdefault(parts[2], {}).setdefault(str(y), {})[key] = round(v * QBTU_TWH, 3)
    os.makedirs(os.path.join(ROOT, 'data', 'build'), exist_ok=True)
    with open(os.path.join(ROOT, 'data', 'build', 'eia_energy.json'), 'w') as f:
        json.dump(out, f, separators=(',', ':'), sort_keys=True)
    print(len(out), 'countries')


if __name__ == '__main__':
    main()
