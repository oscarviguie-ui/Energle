"""
CEPII BACI, the cleaned-up UN Comtrade bilateral trade data (yearly download, Etalab 2.0 licence:
credit "CEPII BACI") - one release a year, checked every month.

Feeds:  Fuel Trade         top suppliers and customers for crude, refined products, LNG, pipeline gas, coal
        Electricity Trade  who a country trades electricity with (HS 2716), as shares that split the
                           EIA import / export totals outside Europe

BACI is not an API but one zip per HS revision (~1-2 GB). The script finds the newest release on
CEPII's page, streams only the latest year's file out of the zip, and keeps the fuel rows:
  crude oil 2709 · refined products 2710 (fuels, not waste oils) · LNG 271111 · pipeline gas 271121 · coal 2701, 2702
Values in BACI are in thousands of US dollars, quantities in metric tonnes. For each country the card
gets its top suppliers and customers (ranked by value), split by fuel, twice: in US$ and in barrels of oil
equivalent a day (the same shipments' tonnes times a fixed energy factor per product, BOE_PER_T, then / 365).
A few flows have no tonnage in BACI: 'vol_cov' is the share of the dollar value whose tonnage is known.
Re-processing is skipped when the release has not changed.
"""
import io
import os
import re
import tempfile
import zipfile

import pandas as pd

from .common import get

CADENCE = 'yearly'

PAGE = 'https://www.cepii.fr/CEPII/en/bdd_modele/bdd_modele_item.asp?id=37'
LINK = re.compile(r'(https?://www\.cepii\.fr)?/?DATA_DOWNLOAD/baci/data/(BACI_HS(\d\d)_V(\d{6}[a-z]?)\.zip)', re.I)
FUEL = {'crude': ('270900',), 'refined': ('271012', '271019', '271020', '271000'), 'lng': ('271111',),
        'gas': ('271121',), 'coal': ('2701', '270210', '270220'), 'elec': ('271600',)}
TOP_IN, TOP_OUT = 5, 5
# Barrels of oil equivalent per tonne, by energy content: boe/t = (GJ/t) / 41.868 x 7.33 (1 toe = 41.868 GJ = 7.33 boe,
# the Energy Institute convention). Typical net calorific values: crude 41.9 GJ/t, gasoline and naphtha 44.3,
# gasoil / jet / fuel oil 42.5, natural gas (pipeline or LNG) 48, anthracite 28, bituminous coal 26, other
# (sub-bituminous) coal 20, coal briquettes 25, lignite 12, lignite briquettes 20.
# Crude comes out at 7.33, which is also its physical barrels a tonne. Longest prefix wins.
BOE_PER_T = {'270900': 7.33, '271012': 7.75, '271019': 7.44, '271020': 7.44, '271000': 7.50, '271111': 8.40, '271121': 8.40,
             '270111': 4.90, '270112': 4.55, '270119': 3.50, '270120': 4.38, '2701': 4.55,
             '270210': 2.10, '270220': 3.50}


def boe_per_t(code):
    code = str(code).zfill(6)
    for n in (6, 4):
        if code[:n] in BOE_PER_T:
            return BOE_PER_T[code[:n]]
    return None


def fuel_of(code):
    code = str(code).zfill(6)
    for fuel, prefixes in FUEL.items():
        if any(code.startswith(p) for p in prefixes):
            return fuel
    return None


def latest_release():
    url = os.environ.get('BACI_URL', '').strip()
    if url:
        m = LINK.search(url)
        return url, (m.group(2) if m else os.path.basename(url))
    html = get(PAGE, timeout=60).text
    # newest HS revision first: '92' and '96' are 1992 and 1996, '02'...'22' are 2002...2022 (HS96 has no
    # 6-digit split of refined products, so taking it by mistake drops them from the card)
    hs_year = lambda hs: (1900 if int(hs) >= 88 else 2000) + int(hs)
    found = {(hs_year(m.group(3)), m.group(4).lower(), m.group(2)) for m in LINK.finditer(html)}
    if not found:
        raise RuntimeError('no BACI download link found on the CEPII page')
    hs, ver, name = max(found)
    return 'https://www.cepii.fr/DATA_DOWNLOAD/baci/data/' + name, name


def read_fuel_rows(zip_path, log=print):
    """(rows DataFrame with t,i,j,fuel,v and boe (barrels of oil equivalent a year, NaN where BACI has no tonnage);
    country code table; year)."""
    with zipfile.ZipFile(zip_path) as z:
        names = z.namelist()
        years = sorted((int(m.group(1)), n) for n in names for m in [re.search(r'_Y(\d{4})_', n)] if m)
        if not years:
            raise RuntimeError('no yearly file in the BACI zip')
        year, name = years[-1]
        codes_name = next(n for n in names if re.search(r'country_codes', n, re.I))
        codes = pd.read_csv(io.BytesIO(z.read(codes_name)), dtype=str, keep_default_na=False)
        parts = []
        with z.open(name) as f:
            for chunk in pd.read_csv(f, dtype={'k': str}, chunksize=2_000_000):
                chunk.columns = [c.strip().lower() for c in chunk.columns]
                chunk = chunk[chunk['k'].str.zfill(6).str.startswith('27')]
                if len(chunk):
                    chunk = chunk.assign(fuel=chunk['k'].map(fuel_of)).dropna(subset=['fuel'])
                    q = pd.to_numeric(chunk['q'], errors='coerce') if 'q' in chunk else float('nan')
                    chunk = chunk.assign(boe=q * chunk['k'].map(boe_per_t))
                    parts.append(chunk[['t', 'i', 'j', 'fuel', 'v', 'boe']])
        rows = pd.concat(parts) if parts else pd.DataFrame(columns=['t', 'i', 'j', 'fuel', 'v', 'boe'])
        log('  baci %s: %d fuel rows for %d' % (name, len(rows), year))
        return rows, codes, year


def summarise(rows, codes, year, countries):
    codes.columns = [c.strip().lower() for c in codes.columns]
    iso = dict(zip(codes['country_code'].astype(str), codes['country_iso3']))
    rows = rows.assign(exp=rows['i'].astype(str).map(iso), imp=rows['j'].astype(str).map(iso)).dropna(subset=['exp', 'imp'])
    rows = rows[rows['exp'] != rows['imp']]
    out = {}

    KBD = 1 / 365 / 1000            # boe a year -> thousand boe a day

    def side(df, who, partner_col, top):
        g = df.groupby([partner_col, 'fuel'])['v'].sum().unstack(fill_value=0.0)
        if g.empty:
            return [], 0.0, {}, {}
        vol = df.groupby([partner_col, 'fuel'])['boe'].sum(min_count=1).unstack().reindex(index=g.index, columns=g.columns)
        g = g.assign(total=g.sum(axis=1)).sort_values('total', ascending=False)
        vol = vol.reindex(g.index)
        total = float(g['total'].sum())
        head, tail = g.iloc[:top], g.iloc[top:]

        def vols(vrow):
            return {f: round(float(vrow[f]) * KBD, 2) for f in FUEL if f in vrow and pd.notna(vrow[f]) and vrow[f] > 0}
        partners = [{'iso3': p, 'total': round(float(row['total']) / 1e6, 2),
                     'fuels': {f: round(float(row[f]) / 1e6, 2) for f in FUEL if f in row and row[f] > 0},
                     'vol': vols(vol.loc[p])}
                    for p, row in head.iterrows()]
        if len(tail):
            t = tail.drop(columns='total').sum()
            partners.append({'iso3': 'OTHER', 'total': round(float(tail['total'].sum()) / 1e6, 2),
                             'fuels': {f: round(float(t[f]) / 1e6, 2) for f in FUEL if f in t and t[f] > 0},
                             'vol': vols(vol.loc[tail.index].sum(min_count=1))})
        by_fuel = df.groupby('fuel')['v'].sum()
        known = float(df.loc[df['boe'].notna(), 'v'].sum())
        extra = {'vol_total': round(float(df['boe'].sum()) * KBD, 2), 'vol_cov': round(known / total, 3) if total > 0 else None}
        return partners, round(total / 1e6, 2), {f: round(float(v) / 1e6, 2) for f, v in by_fuel.items() if v > 0}, extra

    elec = rows[rows['fuel'] == 'elec']
    rows = rows[rows['fuel'] != 'elec']

    def shares(df, partner_col, top=6):
        g = df.groupby(partner_col)['v'].sum().sort_values(ascending=False)
        tot = float(g.sum())
        return [[p, round(float(v) / tot, 4)] for p, v in g.iloc[:top].items()] + ([['OTHER', round(float(g.iloc[top:].sum()) / tot, 4)]] if len(g) > top else []) if tot > 0 else []

    for c in countries:
        ei, ee = elec[elec['imp'] == c], elec[elec['exp'] == c]
        if len(ei) or len(ee):
            out.setdefault(c, {})['elec'] = {'year': year, 'imp_shares': shares(ei, 'exp'), 'exp_shares': shares(ee, 'imp')}
        imports = rows[rows['imp'] == c]
        exports = rows[rows['exp'] == c]
        if imports.empty and exports.empty:
            continue
        pin, tin, fin, xin = side(imports, c, 'exp', TOP_IN)
        pout, tout, fout, xout = side(exports, c, 'imp', TOP_OUT)
        out.setdefault(c, {}).update({'year': year, 'unit': 'bn US$', 'vol_unit': 'kboe/d',
                                      'imports': {'total': tin, 'by_fuel': fin, 'partners': pin, **xin},
                                      'exports': {'total': tout, 'by_fuel': fout, 'partners': pout, **xout}})
    return out


def build(countries, state=None, log=print, zip_path=None):
    state = state or {}
    previous_release = None if state.get('refresh') else state.get('release')
    if zip_path is None:
        url, release = latest_release()
        if release == previous_release:
            log('  baci: %s already processed, skipped' % release)
            return None, None
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, release)
            log('  baci: downloading %s' % url)
            with get(url, stream=True, timeout=600) as res, open(path, 'wb') as f:
                for block in res.iter_content(1 << 20):
                    f.write(block)
            rows, codes, year = read_fuel_rows(path, log)
    else:
        release = os.path.basename(zip_path)
        rows, codes, year = read_fuel_rows(zip_path, log)
    out = summarise(rows, codes, year, countries)
    log('  baci: trade for %d countries' % len(out))
    return out, {'release': release, 'year': year}
