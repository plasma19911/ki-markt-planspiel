// Vorausschauendes Zusatzuniversum. Diese Werte werden nicht automatisch gekauft.
// Sie werden nur dann in den Minuten-Scan gezogen, wenn ein passendes Ereignis-/Thema
// aktiv ist. Die normale Live-, Liquiditaets-, Kosten- und Safety-Kette bleibt Pflicht.
const rows=[
 // Energie / Oel / Gas / LNG
 ['XOM','Exxon Mobil','ENERGY_OIL'],['CVX','Chevron','ENERGY_OIL'],['COP','ConocoPhillips','ENERGY_OIL'],['EOG','EOG Resources','ENERGY_OIL'],['OXY','Occidental Petroleum','ENERGY_OIL'],['SLB','SLB','ENERGY_SERVICES'],['HAL','Halliburton','ENERGY_SERVICES'],['BKR','Baker Hughes','ENERGY_SERVICES'],['LNG','Cheniere Energy','ENERGY_LNG'],['EQT','EQT','ENERGY_GAS'],['TTE.PA','TotalEnergies','ENERGY_OIL'],['ENI.MI','Eni','ENERGY_OIL'],['EQNR.OL','Equinor','ENERGY_OIL'],['REP.MC','Repsol','ENERGY_OIL'],['OMV.VI','OMV','ENERGY_OIL'],
 // Stromnetz / Rechenzentren / Infrastruktur
 ['GEV','GE Vernova','POWER_GRID'],['ETN','Eaton','POWER_GRID'],['VRT','Vertiv','AI_POWER'],['PWR','Quanta Services','POWER_GRID'],['HUBB','Hubbell','POWER_GRID'],['NVT','nVent Electric','POWER_GRID'],['ABB','ABB ADR','POWER_GRID'],['ENR.DE','Siemens Energy','POWER_GRID'],['SIE.DE','Siemens','INDUSTRIAL_AUTOMATION'],['SU.PA','Schneider Electric','POWER_GRID'],['LR.PA','Legrand','POWER_GRID'],
 // Kernenergie / Uran
 ['CCJ','Cameco','NUCLEAR_URANIUM'],['NXE','NexGen Energy','NUCLEAR_URANIUM'],['DNN','Denison Mines','NUCLEAR_URANIUM'],['UEC','Uranium Energy','NUCLEAR_URANIUM'],['LEU','Centrus Energy','NUCLEAR_FUEL'],['CEG','Constellation Energy','NUCLEAR_POWER'],['VST','Vistra','POWER_GENERATION'],['OKLO','Oklo','NUCLEAR_SMR'],['SMR','NuScale Power','NUCLEAR_SMR'],
 // Kritische Rohstoffe / Kupfer / Lithium / seltene Erden
 ['FCX','Freeport-McMoRan','CRITICAL_MINERALS'],['SCCO','Southern Copper','CRITICAL_MINERALS'],['MP','MP Materials','RARE_EARTHS'],['ALB','Albemarle','LITHIUM'],['SQM','SQM ADR','LITHIUM'],['LAC','Lithium Americas','LITHIUM'],['VALE','Vale ADR','CRITICAL_MINERALS'],['BHP','BHP ADR','CRITICAL_MINERALS'],
 // Schifffahrt / Tanker / Lieferketten
 ['FRO','Frontline','SHIPPING_TANKER'],['STNG','Scorpio Tankers','SHIPPING_TANKER'],['DHT','DHT Holdings','SHIPPING_TANKER'],['TNK','Teekay Tankers','SHIPPING_TANKER'],['ZIM','ZIM Integrated Shipping','SHIPPING_CONTAINER'],['MATX','Matson','SHIPPING_CONTAINER'],
 // Gold / geopolitische Absicherung – nur mit positiver Live-Bestaetigung
 ['NEM','Newmont','GOLD_MINER'],['AEM','Agnico Eagle Mines','GOLD_MINER'],['GOLD','Barrick Mining','GOLD_MINER'],['WPM','Wheaton Precious Metals','GOLD_MINER'],['KGC','Kinross Gold','GOLD_MINER'],
 // Banken / Zinsereignisse – Richtung wird niemals vorab angenommen
 ['JPM','JPMorgan Chase','RATES_BANKS'],['BAC','Bank of America','RATES_BANKS'],['GS','Goldman Sachs','RATES_BANKS'],['MS','Morgan Stanley','RATES_BANKS'],['DBK.DE','Deutsche Bank','RATES_BANKS'],['CBK.DE','Commerzbank','RATES_BANKS'],
 // Halbleiter / Exportkontrollen / AI-Lieferkette
 ['NVDA','NVIDIA','SEMI_AI'],['AMD','Advanced Micro Devices','SEMI_AI'],['AVGO','Broadcom','SEMI_AI'],['MU','Micron Technology','SEMI_MEMORY'],['AMAT','Applied Materials','SEMI_EQUIPMENT'],['LRCX','Lam Research','SEMI_EQUIPMENT'],['KLAC','KLA','SEMI_EQUIPMENT'],['ASML','ASML ADR','SEMI_EQUIPMENT'],['ASML.AS','ASML','SEMI_EQUIPMENT'],['IFX.DE','Infineon Technologies','SEMI'],['TSM','Taiwan Semiconductor ADR','SEMI_FOUNDRY'],
 // Cyber / hybride Konflikte
 ['CRWD','CrowdStrike','CYBER'],['PANW','Palo Alto Networks','CYBER'],['FTNT','Fortinet','CYBER'],['ZS','Zscaler','CYBER'],['CYBR','CyberArk','CYBER'],['S','SentinelOne','CYBER'],['NET','Cloudflare','CYBER_INFRA'],
 // Verteidigung / Luftfahrt / Raumfahrt
 ['RHM.DE','Rheinmetall','DEFENSE'],['HAG.DE','Hensoldt','DEFENSE'],['R3NK.DE','RENK Group','DEFENSE'],['LMT','Lockheed Martin','DEFENSE'],['RTX','RTX','DEFENSE'],['NOC','Northrop Grumman','DEFENSE'],['GD','General Dynamics','DEFENSE'],['LHX','L3Harris Technologies','DEFENSE'],['PLTR','Palantir Technologies','DEFENSE_AI'],['AVAV','AeroVironment','DEFENSE_DRONES'],['KTOS','Kratos Defense & Security Solutions','DEFENSE_DRONES'],['LDO.MI','Leonardo','DEFENSE'],['HO.PA','Thales','DEFENSE'],['AIR.PA','Airbus','DEFENSE_AERO'],['SAAB-B.ST','Saab','DEFENSE'],['KOG.OL','Kongsberg Gruppen','DEFENSE']
];

export const FORWARD_EQUITIES=rows.map(([symbol,name,theme])=>({symbol,name,theme,type:'EQUITY',leverage:1,forwardPriority:true}));
