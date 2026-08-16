// Zusatzuniversum fuer relevante Defense-/Tech-Aktien, die trotz globaler Top-500-Auswahl
// sonst herausfallen koennen. Ueberschneidungen werden in market.js automatisch dedupliziert.
const rows = [
  // USA / Kanada - Aerospace, Defense, Space, Government Tech
  ['LMT','Lockheed Martin','DEFENSE'],['RTX','RTX','DEFENSE'],['NOC','Northrop Grumman','DEFENSE'],
  ['GD','General Dynamics','DEFENSE'],['LHX','L3Harris Technologies','DEFENSE'],['BA','Boeing','DEFENSE'],
  ['GE','GE Aerospace','DEFENSE'],['HWM','Howmet Aerospace','DEFENSE'],['TDG','TransDigm Group','DEFENSE'],
  ['AXON','Axon Enterprise','DEFENSE_TECH'],['HII','Huntington Ingalls Industries','DEFENSE'],['TXT','Textron','DEFENSE'],
  ['CW','Curtiss-Wright','DEFENSE'],['BWXT','BWX Technologies','DEFENSE'],['AVAV','AeroVironment','DEFENSE_TECH'],
  ['KTOS','Kratos Defense & Security Solutions','DEFENSE_TECH'],['MRCY','Mercury Systems','DEFENSE_TECH'],
  ['LDOS','Leidos','DEFENSE_TECH'],['BAH','Booz Allen Hamilton','DEFENSE_TECH'],['SAIC','Science Applications International','DEFENSE_TECH'],
  ['CACI','CACI International','DEFENSE_TECH'],['PSN','Parsons','DEFENSE_TECH'],['RKLB','Rocket Lab USA','SPACE_TECH'],
  ['ASTS','AST SpaceMobile','SPACE_TECH'],['CAE','CAE','DEFENSE'],['MDA.TO','MDA Space','SPACE_DEFENSE'],

  // Europa - Defense / Aerospace
  ['RHM.DE','Rheinmetall','DEFENSE'],['HAG.DE','Hensoldt','DEFENSE_TECH'],['R3NK.DE','RENK Group','DEFENSE'],
  ['AIR.PA','Airbus','DEFENSE'],['HO.PA','Thales','DEFENSE_TECH'],['SAF.PA','Safran','DEFENSE'],
  ['AM.PA','Dassault Aviation','DEFENSE'],['LDO.MI','Leonardo','DEFENSE_TECH'],['BA.L','BAE Systems','DEFENSE'],
  ['RR.L','Rolls-Royce Holdings','DEFENSE'],['QQ.L','QinetiQ Group','DEFENSE_TECH'],['CHG.L','Chemring Group','DEFENSE'],
  ['BAB.L','Babcock International','DEFENSE'],['SAAB-B.ST','Saab','DEFENSE'],['KOG.OL','Kongsberg Gruppen','DEFENSE_TECH'],
  ['FCT.MI','Fincantieri','DEFENSE'],['IDR.MC','Indra Sistemas','DEFENSE_TECH'],['EXA.PA','Exail Technologies','DEFENSE_TECH'],
  ['ESLT','Elbit Systems','DEFENSE_TECH'],['ASELS.IS','Aselsan','DEFENSE_TECH'],['OTKAR.IS','Otokar','DEFENSE'],
  ['ASB.AX','Austal','DEFENSE'],['EOS.AX','Electro Optic Systems','DEFENSE_TECH'],['EMBR3.SA','Embraer','DEFENSE'],

  // Asien - Defense
  ['012450.KS','Hanwha Aerospace','DEFENSE'],['064350.KS','Hyundai Rotem','DEFENSE'],
  ['047810.KS','Korea Aerospace Industries','DEFENSE'],['079550.KS','LIG Nex1','DEFENSE_TECH'],
  ['272210.KS','Hanwha Systems','DEFENSE_TECH'],['042660.KS','Hanwha Ocean','DEFENSE'],
  ['329180.KS','HD Hyundai Heavy Industries','DEFENSE'],['7011.T','Mitsubishi Heavy Industries','DEFENSE'],
  ['7012.T','Kawasaki Heavy Industries','DEFENSE'],['7013.T','IHI','DEFENSE'],
  ['HAL.NS','Hindustan Aeronautics','DEFENSE'],['BEL.NS','Bharat Electronics','DEFENSE_TECH'],
  ['BDL.NS','Bharat Dynamics','DEFENSE'],['MAZDOCK.NS','Mazagon Dock Shipbuilders','DEFENSE'],
  ['COCHINSHIP.NS','Cochin Shipyard','DEFENSE'],['GRSE.NS','Garden Reach Shipbuilders & Engineers','DEFENSE'],
  ['DATAPATTNS.NS','Data Patterns India','DEFENSE_TECH'],['ZENTEC.NS','Zen Technologies','DEFENSE_TECH'],
  ['PARAS.NS','Paras Defence and Space Technologies','DEFENSE_TECH'],['SOLARINDS.NS','Solar Industries India','DEFENSE'],

  // Halbleiter / Chip-Equipment / Hardware
  ['NVDA','NVIDIA','TECH_AI'],['AMD','Advanced Micro Devices','TECH_SEMI'],['AVGO','Broadcom','TECH_SEMI'],
  ['MU','Micron Technology','TECH_SEMI'],['INTC','Intel','TECH_SEMI'],['QCOM','Qualcomm','TECH_SEMI'],
  ['TXN','Texas Instruments','TECH_SEMI'],['ADI','Analog Devices','TECH_SEMI'],['AMAT','Applied Materials','TECH_SEMI'],
  ['LRCX','Lam Research','TECH_SEMI'],['KLAC','KLA','TECH_SEMI'],['MRVL','Marvell Technology','TECH_SEMI'],
  ['NXPI','NXP Semiconductors','TECH_SEMI'],['ON','ON Semiconductor','TECH_SEMI'],['MCHP','Microchip Technology','TECH_SEMI'],
  ['ARM','Arm Holdings ADR','TECH_SEMI'],['TSM','Taiwan Semiconductor ADR','TECH_SEMI'],['ASML','ASML ADR','TECH_SEMI'],
  ['STM','STMicroelectronics ADR','TECH_SEMI'],['IFX.DE','Infineon Technologies','TECH_SEMI'],['ASML.AS','ASML Amsterdam','TECH_SEMI'],
  ['ASM.AS','ASM International','TECH_SEMI'],['BESI.AS','BE Semiconductor Industries','TECH_SEMI'],
  ['8035.T','Tokyo Electron','TECH_SEMI'],['6857.T','Advantest','TECH_SEMI'],['6146.T','DISCO','TECH_SEMI'],
  ['6723.T','Renesas Electronics','TECH_SEMI'],['7735.T','SCREEN Holdings','TECH_SEMI'],
  ['005930.KS','Samsung Electronics','TECH_SEMI'],['000660.KS','SK hynix','TECH_SEMI'],
  ['2330.TW','Taiwan Semiconductor Manufacturing','TECH_SEMI'],['2454.TW','MediaTek','TECH_SEMI'],
  ['2303.TW','United Microelectronics','TECH_SEMI'],['3711.TW','ASE Technology Holding','TECH_SEMI'],

  // Software, Cloud, AI, Cybersecurity, Data
  ['MSFT','Microsoft','TECH_CLOUD'],['ORCL','Oracle','TECH_CLOUD'],['CRM','Salesforce','TECH_SOFTWARE'],
  ['NOW','ServiceNow','TECH_SOFTWARE'],['PLTR','Palantir Technologies','TECH_AI'],['ADBE','Adobe','TECH_SOFTWARE'],
  ['INTU','Intuit','TECH_SOFTWARE'],['SNOW','Snowflake','TECH_DATA'],['DDOG','Datadog','TECH_CLOUD'],
  ['MDB','MongoDB','TECH_DATA'],['NET','Cloudflare','TECH_CLOUD'],['CRWD','CrowdStrike','TECH_CYBER'],
  ['PANW','Palo Alto Networks','TECH_CYBER'],['FTNT','Fortinet','TECH_CYBER'],['ZS','Zscaler','TECH_CYBER'],
  ['OKTA','Okta','TECH_CYBER'],['CYBR','CyberArk Software','TECH_CYBER'],['QLYS','Qualys','TECH_CYBER'],
  ['TENB','Tenable Holdings','TECH_CYBER'],['S','SentinelOne','TECH_CYBER'],['GEN','Gen Digital','TECH_CYBER'],
  ['AKAM','Akamai Technologies','TECH_CLOUD'],['ANET','Arista Networks','TECH_NETWORK'],['DELL','Dell Technologies','TECH_HARDWARE'],
  ['HPE','Hewlett Packard Enterprise','TECH_HARDWARE'],['SMCI','Super Micro Computer','TECH_AI_HARDWARE'],
  ['APP','AppLovin','TECH_SOFTWARE'],['U','Unity Software','TECH_SOFTWARE'],['PATH','UiPath','TECH_AI'],
  ['AI','C3.ai','TECH_AI'],['SOUN','SoundHound AI','TECH_AI'],['BBAI','BigBear.ai','TECH_AI'],

  // Internet / Platforms / E-Commerce / International Tech
  ['GOOGL','Alphabet','TECH_PLATFORM'],['META','Meta Platforms','TECH_PLATFORM'],['AMZN','Amazon','TECH_CLOUD'],
  ['NFLX','Netflix','TECH_MEDIA'],['SHOP','Shopify','TECH_COMMERCE'],['MELI','MercadoLibre','TECH_COMMERCE'],
  ['SE','Sea Limited','TECH_COMMERCE'],['BABA','Alibaba ADR','TECH_PLATFORM'],['PDD','PDD Holdings','TECH_COMMERCE'],
  ['JD','JD.com ADR','TECH_COMMERCE'],['BIDU','Baidu ADR','TECH_AI'],['NTES','NetEase ADR','TECH_PLATFORM'],
  ['TCEHY','Tencent Holdings ADR','TECH_PLATFORM'],['9988.HK','Alibaba Hong Kong','TECH_PLATFORM'],['0700.HK','Tencent Holdings','TECH_PLATFORM'],
  ['3690.HK','Meituan','TECH_PLATFORM'],['9618.HK','JD.com Hong Kong','TECH_COMMERCE'],
  ['6758.T','Sony Group','TECH_HARDWARE'],['9984.T','SoftBank Group','TECH_INVESTMENT'],
  ['SAP.DE','SAP','TECH_SOFTWARE'],['ADYEN.AS','Adyen','TECH_FINTECH'],['WISE.L','Wise','TECH_FINTECH']
];

export const PRIORITY_EQUITIES = rows.map(([symbol,name,theme])=>({
  symbol,name,theme,type:'EQUITY',leverage:1,priority:true
}));
