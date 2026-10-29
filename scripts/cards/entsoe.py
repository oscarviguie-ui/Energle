"""
ENTSO-E Transparency Platform (free token in the ENTSOE_API_KEY secret), through the entsoe-py client
- refreshed every month for the last complete calendar year.

Feeds:  Electricity Trade (Europe)  gross physical flows across each border: TWh imported from and
                                    exported to every neighbour.
Outside Europe, and in Europe until the token is set, the card uses EIA totals split by BACI partner
shares instead. Without a token this source skips quietly and the job still succeeds.
"""
import datetime
import os

import pandas as pd

CADENCE = 'monthly'
ISO3 = {'AL': 'ALB', 'AT': 'AUT', 'BA': 'BIH', 'BE': 'BEL', 'BG': 'BGR', 'BY': 'BLR', 'CH': 'CHE', 'CY': 'CYP',
        'CZ': 'CZE', 'DE': 'DEU', 'DK': 'DNK', 'EE': 'EST', 'ES': 'ESP', 'FI': 'FIN', 'FR': 'FRA', 'GB': 'GBR',
        'GE': 'GEO', 'GR': 'GRC', 'HR': 'HRV', 'HU': 'HUN', 'IE': 'IRL', 'IT': 'ITA', 'LT': 'LTU', 'LU': 'LUX',
        'LV': 'LVA', 'MD': 'MDA', 'ME': 'MNE', 'MK': 'MKD', 'MT': 'MLT', 'NL': 'NLD', 'NO': 'NOR', 'PL': 'POL',
        'PT': 'PRT', 'RO': 'ROU', 'RS': 'SRB', 'RU': 'RUS', 'SE': 'SWE', 'SI': 'SVN', 'SK': 'SVK', 'TR': 'TUR',
        'UA': 'UKR', 'XK': 'XKX'}
def _country(zone):
    return {'DE_LU': 'DE', 'DE_AT_LU': None, 'IE_SEM': 'IE', 'NIE': 'GB'}.get(zone, zone.split('_')[0])


def country_pairs():
    """Neighbouring countries, from entsoe-py's bidding-zone neighbours."""
    from entsoe.mappings import NEIGHBOURS
    pairs = set()
    for zone, others in NEIGHBOURS.items():
        a = _country(zone)
        for other in others:
            b = _country(other)
            if a and b and a != b and a in ISO3 and b in ISO3:
                pairs.add(tuple(sorted((a, b))))
    return sorted(pairs)


def _hourly(series):
    s = series.dropna()
    if s.empty:
        return s
    return s.resample('1h').mean().dropna()


def flow_twh(series):
    s = _hourly(series)
    return 0.0 if s.empty else float(s.clip(lower=0).sum()) / 1e6      # MW over hours -> MWh -> TWh


def _fetch_raw(raw, src, dst, start, end, log):
    """One border direction over the whole year: one request (the API takes a year of flows at once),
    or four quarters if it refuses. A border with no data gives None."""
    from entsoe.mappings import lookup_area
    from entsoe.parsers import parse_crossborder_flows
    from entsoe.exceptions import NoMatchingDataError
    try:
        a, b = lookup_area(src), lookup_area(dst)
    except Exception:                   # noqa: BLE001 - an area the client does not know
        return None
    spans = [(start, end)]
    for attempt in range(2):
        try:
            parts = [parse_crossborder_flows(raw.query_crossborder_flows(a, b, start=s0, end=s1)) for s0, s1 in spans]
            return flow_twh(pd.concat(parts)) if parts else None
        except NoMatchingDataError:
            return None
        except Exception as err:        # noqa: BLE001
            if attempt == 0 and 'exceed' in str(err).lower():
                q = pd.date_range(start, end, periods=5)
                spans = list(zip(q[:-1], q[1:]))
                continue
            log('  entsoe flow %s>%s: %s' % (src, dst, str(err)[:90]))
            return None
    return None


def build(countries, state=None, log=print, client=None, year=None, workers=4):
    state = state or {}
    key = os.environ.get('ENTSOE_API_KEY', '').strip()
    if client is None:
        if not key:
            log('  entsoe: ENTSOE_API_KEY not set, skipped')
            return None, None
        from entsoe import EntsoeRawClient
        client = EntsoeRawClient(api_key=key, retry_count=2, retry_delay=5, timeout=90)   # no hanging requests
    year = year or datetime.date.today().year - 1
    if state.get('year') == year and not state.get('refresh') and state.get('updated_month') == datetime.date.today().strftime('%Y-%m'):
        log('  entsoe: %d already read this month, skipped' % year)
        return None, None
    start = pd.Timestamp('%d-01-01' % year, tz='Europe/Brussels')
    end = pd.Timestamp('%d-01-01' % (year + 1), tz='Europe/Brussels')
    in_game = {cc for cc, iso in ISO3.items() if iso in countries}
    jobs = [(s0, d0) for a, b in country_pairs() if a in in_game or b in in_game for s0, d0 in ((a, b), (b, a))]
    log('  entsoe %d: %d border directions to read' % (year, len(jobs)))
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=workers) as pool:
        got = list(pool.map(lambda j: _fetch_raw(client, j[0], j[1], start, end, log), jobs))
    flows = {j: v for j, v in zip(jobs, got) if v is not None}
    if not flows:
        raise RuntimeError('no ENTSO-E flows could be read')
    out = {}
    for cc in sorted(in_game):
        partners = {}
        for (src, dst), twh in flows.items():
            if dst == cc:
                partners.setdefault(src, [0.0, 0.0])[0] += twh
            elif src == cc:
                partners.setdefault(dst, [0.0, 0.0])[1] += twh
        nbs = [[ISO3[p], round(v[0], 2), round(v[1], 2)] for p, v in partners.items() if v[0] + v[1] >= 0.05]
        nbs.sort(key=lambda n: -(n[1] + n[2]))
        if nbs:
            out[ISO3[cc]] = {'year': year, 'neighbours': nbs,
                             'imp': round(sum(n[1] for n in nbs), 2), 'exp': round(sum(n[2] for n in nbs), 2)}
    log('  entsoe %d: flows for %d borders, %d countries' % (year, len(flows) // 2, len(out)))
    return out, {'year': year, 'updated_month': datetime.date.today().strftime('%Y-%m')}
