# Clue cards build 2026-11-02

Published: **yes**

## Sources

- wdi: {'updated': '2026-11-02', 'countries': 172}
- eia: {'updated': '2026-11-02', 'countries': 173}
- factbook: {'updated': '2026-11-02', 'countries': 123}
- opec: {'countries': 58, 'updated': '2026-10-30', 'year': 2025}
- entsoe: {'year': 2025, 'updated': '2026-11-02', 'countries': 36}
- baci: {'countries': 167, 'release': 'BACI_HS96_V202601.zip', 'updated': '2026-10-29', 'year': 2024}
- usgs: {'countries': 42, 'release': 2026, 'updated': '2026-10-29'}
- power: {'countries': 173, 'updated': '2026-10-29'}
- elevation: {'countries': 173, 'updated': '2026-10-29'}

Failed this run (kept their previous figures): baci

## Coverage

- countries in the game: 173
- with the shop (3+ cards): 170
- nature: 169
- under: 171
- trade: 126
- market: 173
- people: 167

No shop (fewer than 3 cards): PRK, TWN, XKX

## Electricity trade vs Ember net imports (gap > 1 TWh and > 10 % of demand)

- MDA: imports - exports -0.0 TWh vs Ember net 2.6 TWh (eia+baci 2024)
- MNE: imports - exports 2.3 TWh vs Ember net 1.0 TWh (entsoe 2025)
- PRY: imports - exports -30.0 TWh vs Ember net -15.7 TWh (eia+baci 2024)
- TJK: imports - exports -2.6 TWh vs Ember net -5.2 TWh (eia+baci 2024)
- URY: imports - exports 1.1 TWh vs Ember net 2.8 TWh (eia+baci 2024)
- XKX: imports - exports 0.5 TWh vs Ember net 1.6 TWh (eia+baci 2024)

## Log

```
== wdi
  wdi access_urban  EG.ELC.ACCS.UR.ZS  171 countries
  wdi access_rural  EG.ELC.ACCS.RU.ZS  171 countries
  wdi access        EG.ELC.ACCS.ZS     172 countries
  wdi cook          EG.CFT.ACCS.ZS     169 countries
  wdi cuts_n        IC.FRM.INFRA.IN2   132 countries
  wdi cuts_firms    IC.ELC.OUTG.ZS     162 countries
  wdi cuts_loss     IC.FRM.OUTG.ZS     162 countries
  wdi urban         SP.URB.TOTL.IN.ZS  172 countries
  wdi gdp           NY.GDP.PCAP.PP.CD  170 countries
  wdi industry      NV.IND.TOTL.ZS     171 countries
  wdi rent_oil      NY.GDP.PETR.RT.ZS  171 countries
  wdi rent_gas      NY.GDP.NGAS.RT.ZS  169 countries
  wdi rent_coal     NY.GDP.COAL.RT.ZS  171 countries
  wdi rent_min      NY.GDP.MINR.RT.ZS  171 countries
  wdi rain          AG.LND.PRCP.MM     169 countries
  wdi flow          ER.H2O.INTR.K3     170 countries
  -> 172 countries
== eia
  eia oil_prod  219 countries
  eia gas_prod  225 countries
  eia coal_prod 225 countries
  eia coal_res  217 countries
  eia elec_imp  222 countries
  eia elec_exp  222 countries
  -> 173 countries
== factbook
  factbook: reserves for 127 places; not matched: Akrotiri, Ashmore and Cartier Islands, Baker Island, Howland Island, Jarvis Island, Johnston Atoll, Kingman Reef, Midway Islands, Palmyra Atoll, Clipperton Island, Coral Sea Islands, Dhekelia, Falkland Islands (Islas Malvinas), French Southern and Antarctic Lands, Gaza, Gaza Strip, Holy See (Vatican City), Jan Mayen, Navassa Island, Paracel Islands, Pitcairn Islands, Saint Barthelemy, Saint Martin
  -> 123 countries
== opec
  opec: ASB 2026 already read, skipped
== entsoe
  entsoe 2025: 160 border directions to read
  entsoe 2025: flows for 77 borders, 36 countries
  -> 36 countries
== baci
  FAILED: RuntimeError: GET failed after 4 tries: https://www.cepii.fr/CEPII/en/bdd_modele/bdd_modele_item.asp (403 Client Error: Forbidden for url: https://www.cepii.fr/CEPII/en/bdd_modele/bdd_modele_item.asp?id=37) | ['  File "/home/runner/work/Energle/Energle/scripts/cards/common.py", line 40, in get', "    raise RuntimeError('GET failed after %d tries: %s (%s)' % (tries, url.split('?')[0], last))", 'RuntimeError: GET failed after 4 tries: https://www.cepii.fr/CEPII/en/bdd_modele/bdd_modele_item.asp (403 Client Error: Forbidden for url: https://www.cepii.fr/CEPII/en/bdd_modele/bdd_modele_item.asp?id=37)']
== usgs
  usgs: MCS 2026 already read, skipped
== power: not due (last 2026-10-29)
== elevation: not due (last 2026-10-29)
```
