"""
World Bank World Development Indicators (open API, no key) - refreshed every month.

Feeds:  People & Power (power access, clean cooking, power cuts, urban share, income, industry)
        Underground Riches (GDP from oil, gas, coal and minerals)
        Renewables Potential (rain, river and groundwater flow)

For each indicator the API returns every country's most recent non-empty value (mrnev=1) with its
year. Aggregates are dropped except the world (WLD), kept for the world averages on the cards.
The power-cut figures come from the World Bank Enterprise Surveys, which cover mostly low- and
middle-income countries; the card says so when a country has no survey.
"""
from .common import get_json, r

CADENCE = 'monthly'
API = 'https://api.worldbank.org/v2/country/all/indicator/{ind}'
INDICATORS = {
    # People & Power
    'access_urban':  'EG.ELC.ACCS.UR.ZS',   # access to electricity, % of urban population
    'access_rural':  'EG.ELC.ACCS.RU.ZS',   # access to electricity, % of rural population
    'access':        'EG.ELC.ACCS.ZS',      # access to electricity, % of population (fallback)
    'cook':          'EG.CFT.ACCS.ZS',      # access to clean fuels and technologies for cooking, % of population
    'cuts_n':        ('IC.FRM.INFRA.IN2', 13),  # outages in a typical month (Enterprise Surveys database; the WDI copy is archived)
    'cuts_firms':    'IC.ELC.OUTG.ZS',      # firms experiencing electrical outages, % of firms
    'cuts_loss':     'IC.FRM.OUTG.ZS',      # value lost due to electrical outages, % of sales for affected firms
    'urban':         'SP.URB.TOTL.IN.ZS',   # urban population, % of total
    'gdp':           'NY.GDP.PCAP.PP.CD',   # GDP per capita, PPP, current international $
    'industry':      'NV.IND.TOTL.ZS',      # industry (incl. construction), value added, % of GDP
    # Underground Riches
    'rent_oil':      'NY.GDP.PETR.RT.ZS',   # oil rents, % of GDP
    'rent_gas':      'NY.GDP.NGAS.RT.ZS',   # natural gas rents, % of GDP
    'rent_coal':     'NY.GDP.COAL.RT.ZS',   # coal rents, % of GDP
    'rent_min':      'NY.GDP.MINR.RT.ZS',   # mineral rents, % of GDP
    # Renewables Potential
    'rain':          'AG.LND.PRCP.MM',      # average precipitation in depth, mm per year
    'flow':          'ER.H2O.INTR.K3',      # renewable internal freshwater resources, billion m3 (= km3)
}


def fetch_indicator(code, source=None):
    """{ISO3: (value, year)} for one indicator, most recent non-empty value per country."""
    out, page = {}, 1
    while True:
        params = {'format': 'json', 'per_page': 20000, 'mrnev': 1, 'page': page}
        if source:
            params['source'] = source
        body = get_json(API.format(ind=code), params)
        if not isinstance(body, list) or len(body) < 2 or body[1] is None:
            break
        for row in body[1]:
            iso, val = row.get('countryiso3code'), row.get('value')
            if iso and val is not None:
                out[iso] = (float(val), int(row['date']))
        if page >= int(body[0].get('pages', 1)):
            break
        page += 1
    return out


def build(countries, state=None, log=print):
    series, failed = {}, []
    for key, code in INDICATORS.items():
        code, source = code if isinstance(code, tuple) else (code, None)
        try:
            series[key] = fetch_indicator(code, source)
            log('  wdi %-13s %-18s %d countries' % (key, code, sum(1 for iso in series[key] if iso in countries)))
        except Exception as err:            # noqa: BLE001
            log('  wdi %-13s FAILED: %s' % (key, err))
            series[key] = {}
            failed.append(key)
    if len(failed) == len(INDICATORS):
        raise RuntimeError('every World Bank request failed')
    out = {}
    for iso in countries:
        rec = {k: [r(v[0], 2), v[1]] for k, s in series.items() for v in [s.get(iso)] if v}
        if rec:
            out[iso] = rec
    world = {k: [r(s['WLD'][0], 2), s['WLD'][1]] for k, s in series.items() if 'WLD' in s}
    return out, {'world': world, 'failed': failed}
