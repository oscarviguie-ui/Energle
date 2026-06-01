import pandas as pd, json

df = pd.read_csv('yearly_full_release_long_format.csv')

# --- Electricity generation ---
sources = ['Coal','Gas','Nuclear','Hydro','Wind','Solar','Bioenergy',
           'Other Renewables','Other Fossil','Total Generation']
gen = df[
    (df['Category'] == 'Electricity generation') &
    (df['Area type'] == 'Country or economy') &
    (df['Unit'] == 'TWh') &
    (df['Variable'].isin(sources))
][['Area','ISO 3 code','Year','Variable','Value']].copy()
gen['Value'] = gen['Value'].fillna(0).round(2)

# --- Net imports ---
imp = df[
    (df['Category'] == 'Electricity imports') &
    (df['Area type'] == 'Country or economy') &
    (df['Unit'] == 'TWh') &
    (df['Variable'] == 'Net Imports')
][['Area','ISO 3 code','Year','Value']].copy()
imp['Value'] = imp['Value'].fillna(0).round(2)
imp_lookup = {}
for (area, iso3), grp in imp.groupby(['Area','ISO 3 code']):
    imp_lookup[(area, iso3)] = {int(r['Year']): r['Value'] for _, r in grp.iterrows()}

# --- Demand ---
dem = df[
    (df['Category'] == 'Electricity demand') &
    (df['Area type'] == 'Country or economy') &
    (df['Unit'] == 'TWh') &
    (df['Variable'] == 'Demand')
][['Area','ISO 3 code','Year','Value']].copy()
dem['Value'] = dem['Value'].fillna(0).round(2)
dem_lookup = {}
for (area, iso3), grp in dem.groupby(['Area','ISO 3 code']):
    dem_lookup[(area, iso3)] = {int(r['Year']): r['Value'] for _, r in grp.iterrows()}

# --- Demand per capita ---
dpc = df[
    (df['Variable'] == 'Demand per capita') &
    (df['Area type'] == 'Country or economy') &
    (df['Unit'] == 'MWh')
][['Area','ISO 3 code','Year','Value']].copy()
dpc['Value'] = dpc['Value'].fillna(0).round(2)
dpc_lookup = {}
for (area, iso3), grp in dpc.groupby(['Area','ISO 3 code']):
    dpc_lookup[iso3] = {int(r['Year']): r['Value'] for _, r in grp.iterrows()}

# --- World average demand per capita ---
world_dpc = df[
    (df['Variable'] == 'Demand per capita') &
    (df['Area'] == 'World') &
    (df['Unit'] == 'MWh')
][['Year','Value']].copy()
world_avg = {int(r['Year']): round(r['Value'], 2) for _, r in world_dpc.iterrows()}

# --- Country coordinates (ISO3 -> lat, lng) ---
coords = {
  'AFG':(33.93,67.71),'ALB':(41.15,20.17),'DZA':(28.03,1.66),'AGO':(-11.20,17.87),
  'ARG':(-38.42,-63.62),'ARM':(40.07,45.04),'AUS':(-25.27,133.78),'AUT':(47.52,14.55),
  'AZE':(40.14,47.58),'BHS':(25.03,-77.40),'BHR':(26.02,50.55),'BGD':(23.68,90.36),
  'BLR':(53.71,27.95),'BEL':(50.50,4.47),'BLZ':(17.19,-88.50),'BEN':(9.31,2.32),
  'BTN':(27.51,90.43),'BOL':(-16.29,-63.59),'BIH':(43.92,17.68),'BWA':(-22.33,24.68),
  'BRA':(-14.24,-51.93),'BRN':(4.54,114.73),'BGR':(42.73,25.49),'BFA':(12.36,-1.56),
  'BDI':(-3.37,29.92),'CPV':(16.54,-23.04),'KHM':(12.57,104.99),'CMR':(7.37,12.35),
  'CAN':(56.13,-106.35),'CAF':(6.61,20.94),'TCD':(15.45,18.73),'CHL':(-35.67,-71.54),
  'CHN':(35.86,104.19),'COL':(4.57,-74.30),'COM':(-11.87,43.87),'COD':(-4.04,21.76),
  'COG':(-0.23,15.83),'CRI':(9.75,-83.75),'CIV':(7.54,-5.55),'HRV':(45.10,15.20),
  'CUB':(21.52,-77.78),'CYP':(35.13,33.43),'CZE':(49.82,15.47),'DNK':(56.26,9.50),
  'DJI':(11.83,42.59),'DOM':(18.74,-70.16),'ECU':(-1.83,-78.18),'EGY':(26.82,30.80),
  'SLV':(13.79,-88.90),'GNQ':(1.65,10.27),'ERI':(15.18,39.78),'EST':(58.60,25.01),
  'SWZ':(-26.52,31.47),'ETH':(9.15,40.49),'FJI':(-16.58,179.41),'FIN':(61.92,25.75),
  'FRA':(46.23,2.21),'GAB':(-0.80,11.61),'GMB':(13.44,-15.31),'GEO':(42.32,43.36),
  'DEU':(51.17,10.45),'GHA':(7.95,-1.02),'GRC':(39.07,21.82),'GTM':(15.78,-90.23),
  'GIN':(9.95,-11.82),'GNB':(11.80,-15.18),'GUY':(4.86,-58.93),'HTI':(18.97,-72.29),
  'HND':(15.20,-86.24),'HUN':(47.16,19.50),'ISL':(64.96,-19.02),'IND':(20.59,78.96),
  'IDN':(-0.79,113.92),'IRN':(32.43,53.69),'IRQ':(33.22,43.68),'IRL':(53.41,-8.24),
  'ISR':(31.05,34.85),'ITA':(41.87,12.57),'JAM':(18.11,-77.30),'JPN':(36.20,138.25),
  'JOR':(30.59,36.24),'KAZ':(48.02,66.92),'KEN':(-0.02,37.91),'PRK':(40.34,127.51),
  'KOR':(35.91,127.77),'XKX':(42.60,20.90),'KWT':(29.34,47.49),'KGZ':(41.20,74.77),
  'LAO':(19.86,102.50),'LVA':(56.88,24.60),'LBN':(33.85,35.86),'LSO':(-29.61,28.23),
  'LBR':(6.43,-9.43),'LBY':(26.34,17.23),'LTU':(55.17,23.88),'LUX':(49.82,6.13),
  'MDG':(-18.77,46.87),'MWI':(-13.25,34.30),'MYS':(4.21,101.98),'MDV':(3.20,73.22),
  'MLI':(17.57,-3.99),'MLT':(35.94,14.37),'MRT':(21.01,-10.94),'MUS':(-20.35,57.55),
  'MEX':(23.63,-102.55),'MDA':(47.41,28.37),'MNG':(46.86,103.85),'MNE':(42.71,19.37),
  'MAR':(31.79,-7.09),'MOZ':(-18.67,35.53),'MMR':(16.87,96.08),'NAM':(-22.96,18.49),
  'NPL':(28.39,84.12),'NLD':(52.13,5.29),'NZL':(-40.90,174.89),'NIC':(12.87,-85.21),
  'NER':(17.61,8.08),'NGA':(9.08,8.68),'MKD':(41.61,21.75),'NOR':(60.47,8.47),
  'OMN':(21.51,55.92),'PAK':(30.38,69.35),'PAN':(8.54,-80.78),'PNG':(-6.31,143.96),
  'PRY':(-23.44,-58.44),'PER':(-9.19,-75.02),'PHL':(12.88,121.77),'POL':(51.92,19.15),
  'PRT':(39.40,-8.22),'QAT':(25.35,51.18),'ROU':(45.94,24.97),'RUS':(61.52,105.32),
  'RWA':(-1.94,29.87),'SAU':(23.89,45.08),'SEN':(14.50,-14.45),'SRB':(44.02,21.01),
  'SLE':(8.46,-11.78),'SGP':(1.35,103.82),'SVK':(48.67,19.70),'SVN':(46.15,14.99),
  'SOM':(5.15,46.20),'ZAF':(-30.56,22.94),'SSD':(7.86,29.70),'ESP':(40.46,-3.75),
  'LKA':(7.87,80.77),'SDN':(12.86,30.22),'SUR':(3.92,-56.03),'SWE':(60.13,18.64),
  'CHE':(46.82,8.23),'SYR':(34.80,38.99),'TWN':(23.70,121.00),'TJK':(38.86,71.28),
  'TZA':(-6.37,34.89),'THA':(15.87,100.99),'TLS':(-8.87,125.73),'TGO':(8.62,0.82),
  'TTO':(10.69,-61.22),'TUN':(33.89,9.54),'TUR':(38.96,35.24),'TKM':(38.97,59.56),
  'UGA':(1.37,32.29),'UKR':(48.38,31.17),'ARE':(23.42,53.85),'GBR':(55.38,-3.44),
  'USA':(37.09,-95.71),'URY':(-32.52,-55.77),'UZB':(41.38,64.59),'VEN':(6.42,-66.59),
  'VNM':(14.06,108.28),'YEM':(15.55,48.52),'ZMB':(-13.13,27.85),'ZWE':(-19.02,29.15),
  'PSE':(31.95,35.23),'PRI':(18.22,-66.59),
}

# --- Build output ---
result = {}
for (area, iso3), group in gen.groupby(['Area','ISO 3 code']):
    if iso3 not in coords:
        continue
    lat, lng    = coords[iso3]
    imp_years   = imp_lookup.get((area, iso3), {})
    dem_years   = dem_lookup.get((area, iso3), {})
    dpc_years   = dpc_lookup.get(iso3, {})

    years = {}
    for year, ygroup in group.groupby('Year'):
        row = {}
        for _, r in ygroup.iterrows():
            row[r['Variable']] = r['Value']
        if row.get('Total Generation', 0) > 0:
            net_imp = imp_years.get(int(year), 0)
            demand  = dem_years.get(int(year), 0)
            years[int(year)] = {
                'Coal':             row.get('Coal', 0),
                'Gas':              row.get('Gas', 0),
                'Nuclear':          row.get('Nuclear', 0),
                'Hydro':            row.get('Hydro', 0),
                'Wind':             row.get('Wind', 0),
                'Solar':            row.get('Solar', 0),
                'Bioenergy':        row.get('Bioenergy', 0),
                'Other Renewables': row.get('Other Renewables', 0),
                'Other Fossil':     row.get('Other Fossil', 0),
                'Total':            row.get('Total Generation', 0),
                'NetImports':       round(net_imp, 2),
                'Demand':           round(demand, 2),
            }
    if not years:
        continue

    latest_year = max(years.keys())
    latest_dpc  = dpc_years.get(latest_year) or (
        dpc_years.get(max(dpc_years.keys())) if dpc_years else None)

    result[area] = {
        'iso3':       iso3,
        'lat':        lat,
        'lng':        lng,
        'years':      years,
        'dpc':        dpc_years,
        'latestYear': latest_year,
        'latestDpc':  latest_dpc,
    }

# Prepend world average DPC
final = {'__world_dpc__': world_avg, **result}

with open('energle_data.json', 'w') as f:
    json.dump(final, f, separators=(',', ':'))

print(f"Done. Countries: {len(result)}")
