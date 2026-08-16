export const AI_MODEL = '@cf/zai-org/glm-4.7-flash';
export const SPARK_BATCH = 40;
export const DEEP_LIMIT = 12;
export const NEWS_LIMIT = 6;
export const NEWS_RADAR_BATCH = 8;

// Breites, bewusst kuratiertes ETF-Universum. Die Werte werden mit den 500 groessten Aktien gemeinsam gescannt.
export const CORE_ETFS = [
 // Welt / breite Aktienmaerkte
 ['SPY','SPDR S&P 500 ETF Trust'],['IVV','iShares Core S&P 500 ETF'],['VOO','Vanguard S&P 500 ETF'],
 ['VTI','Vanguard Total Stock Market ETF'],['ITOT','iShares Core S&P Total U.S. Stock Market ETF'],['SCHB','Schwab U.S. Broad Market ETF'],
 ['VT','Vanguard Total World Stock ETF'],['ACWI','iShares MSCI ACWI ETF'],['URTH','iShares MSCI World ETF'],
 ['RSP','Invesco S&P 500 Equal Weight ETF'],['DIA','SPDR Dow Jones Industrial Average ETF'],
 ['QQQ','Invesco QQQ Trust'],['QQQM','Invesco NASDAQ 100 ETF'],
 ['VWCE.DE','Vanguard FTSE All-World UCITS ETF USD Accumulating (A2PXXG)'],
 ['EXXT.DE','iShares NASDAQ-100 UCITS ETF (DE) (A0F5UF)'],

 // Small / Mid Caps
 ['IWM','iShares Russell 2000 ETF'],['IJR','iShares Core S&P Small-Cap ETF'],['VB','Vanguard Small-Cap ETF'],
 ['VO','Vanguard Mid-Cap ETF'],['MDY','SPDR S&P MidCap 400 ETF Trust'],

 // International / Europa / Emerging Markets
 ['VXUS','Vanguard Total International Stock ETF'],['IXUS','iShares Core MSCI Total International Stock ETF'],
 ['VEA','Vanguard FTSE Developed Markets ETF'],['IEFA','iShares Core MSCI EAFE ETF'],['EFA','iShares MSCI EAFE ETF'],
 ['VWO','Vanguard FTSE Emerging Markets ETF'],['IEMG','iShares Core MSCI Emerging Markets ETF'],['EEM','iShares MSCI Emerging Markets ETF'],
 ['EMXC','iShares MSCI Emerging Markets ex China ETF'],['VGK','Vanguard FTSE Europe ETF'],['FEZ','SPDR EURO STOXX 50 ETF'],
 ['EZU','iShares MSCI Eurozone ETF'],['EWG','iShares MSCI Germany ETF'],['EWU','iShares MSCI United Kingdom ETF'],
 ['EWQ','iShares MSCI France ETF'],['EWI','iShares MSCI Italy ETF'],['EWP','iShares MSCI Spain ETF'],['EWL','iShares MSCI Switzerland ETF'],
 ['EWN','iShares MSCI Netherlands ETF'],['EWD','iShares MSCI Sweden ETF'],

 // Asien / Laender
 ['EWJ','iShares MSCI Japan ETF'],['DXJ','WisdomTree Japan Hedged Equity Fund'],['MCHI','iShares MSCI China ETF'],
 ['FXI','iShares China Large-Cap ETF'],['KWEB','KraneShares CSI China Internet ETF'],['ASHR','Xtrackers Harvest CSI 300 China A-Shares ETF'],
 ['INDA','iShares MSCI India ETF'],['EPI','WisdomTree India Earnings Fund'],['EWY','iShares MSCI South Korea ETF'],
 ['EWT','iShares MSCI Taiwan ETF'],['EWA','iShares MSCI Australia ETF'],['EWC','iShares MSCI Canada ETF'],
 ['EWZ','iShares MSCI Brazil ETF'],['EWW','iShares MSCI Mexico ETF'],['EZA','iShares MSCI South Africa ETF'],

 // US-Sektoren
 ['XLK','Technology Select Sector SPDR Fund'],['XLF','Financial Select Sector SPDR Fund'],['XLE','Energy Select Sector SPDR Fund'],
 ['XLV','Health Care Select Sector SPDR Fund'],['XLI','Industrial Select Sector SPDR Fund'],['XLY','Consumer Discretionary Select Sector SPDR Fund'],
 ['XLP','Consumer Staples Select Sector SPDR Fund'],['XLU','Utilities Select Sector SPDR Fund'],['XLB','Materials Select Sector SPDR Fund'],
 ['XLRE','Real Estate Select Sector SPDR Fund'],['XLC','Communication Services Select Sector SPDR Fund'],
 ['VGT','Vanguard Information Technology ETF'],['SMH','VanEck Semiconductor ETF'],['SOXX','iShares Semiconductor ETF'],
 ['XBI','SPDR S&P Biotech ETF'],['IBB','iShares Biotechnology ETF'],['XHB','SPDR S&P Homebuilders ETF'],
 ['ITB','iShares U.S. Home Construction ETF'],['KRE','SPDR S&P Regional Banking ETF'],['KBE','SPDR S&P Bank ETF'],
 ['OIH','VanEck Oil Services ETF'],['XOP','SPDR S&P Oil & Gas Exploration & Production ETF'],

 // Faktoren / Dividenden / Stil
 ['VUG','Vanguard Growth ETF'],['VTV','Vanguard Value ETF'],['IWF','iShares Russell 1000 Growth ETF'],['IWD','iShares Russell 1000 Value ETF'],
 ['QUAL','iShares MSCI USA Quality Factor ETF'],['MTUM','iShares MSCI USA Momentum Factor ETF'],['USMV','iShares MSCI USA Min Vol Factor ETF'],
 ['SPLV','Invesco S&P 500 Low Volatility ETF'],['VLUE','iShares MSCI USA Value Factor ETF'],['SPHQ','Invesco S&P 500 Quality ETF'],
 ['SCHD','Schwab U.S. Dividend Equity ETF'],['VIG','Vanguard Dividend Appreciation ETF'],['DVY','iShares Select Dividend ETF'],
 ['HDV','iShares Core High Dividend ETF'],['NOBL','ProShares S&P 500 Dividend Aristocrats ETF'],

 // Anleihen / Cash / Inflation
 ['BND','Vanguard Total Bond Market ETF'],['AGG','iShares Core U.S. Aggregate Bond ETF'],['BNDX','Vanguard Total International Bond ETF'],
 ['TLT','iShares 20+ Year Treasury Bond ETF'],['IEF','iShares 7-10 Year Treasury Bond ETF'],['SHY','iShares 1-3 Year Treasury Bond ETF'],
 ['SGOV','iShares 0-3 Month Treasury Bond ETF'],['BIL','SPDR Bloomberg 1-3 Month T-Bill ETF'],['VGSH','Vanguard Short-Term Treasury ETF'],
 ['VGIT','Vanguard Intermediate-Term Treasury ETF'],['LQD','iShares iBoxx Investment Grade Corporate Bond ETF'],['VCIT','Vanguard Intermediate-Term Corporate Bond ETF'],
 ['HYG','iShares iBoxx High Yield Corporate Bond ETF'],['JNK','SPDR Bloomberg High Yield Bond ETF'],['TIP','iShares TIPS Bond ETF'],
 ['VTIP','Vanguard Short-Term Inflation-Protected Securities ETF'],['MUB','iShares National Muni Bond ETF'],

 // Immobilien / Rohstoffe / Edelmetalle
 ['VNQ','Vanguard Real Estate ETF'],['IYR','iShares U.S. Real Estate ETF'],['REET','iShares Global REIT ETF'],
 ['GLD','SPDR Gold Shares'],['IAU','iShares Gold Trust'],['SLV','iShares Silver Trust'],['DBC','Invesco DB Commodity Index Tracking Fund'],
 ['PDBC','Invesco Optimum Yield Diversified Commodity Strategy No K-1 ETF'],['USO','United States Oil Fund'],['UNG','United States Natural Gas Fund'],

 // Zukunftsthemen / Spezialthemen
 ['ARKK','ARK Innovation ETF'],['BOTZ','Global X Robotics & Artificial Intelligence ETF'],['ROBO','ROBO Global Robotics and Automation Index ETF'],
 ['TAN','Invesco Solar ETF'],['ICLN','iShares Global Clean Energy ETF'],['LIT','Global X Lithium & Battery Tech ETF'],
 ['COPX','Global X Copper Miners ETF'],['URA','Global X Uranium ETF'],['CIBR','First Trust Nasdaq Cybersecurity ETF'],['HACK','ETFMG Prime Cyber Security ETF']
].map(([symbol,name])=>({symbol,name,type:'ETF',leverage:1}));

export const LEVERAGED_ETFS = [
 ['TQQQ','ProShares UltraPro QQQ',3],['SQQQ','ProShares UltraPro Short QQQ',-3],
 ['UPRO','ProShares UltraPro S&P500',3],['SPXU','ProShares UltraPro Short S&P500',-3],
 ['SOXL','Direxion Semiconductor Bull 3X',3],['SOXS','Direxion Semiconductor Bear 3X',-3],
 ['TECL','Direxion Technology Bull 3X',3],['TECS','Direxion Technology Bear 3X',-3],
 ['TNA','Direxion Small Cap Bull 3X',3],['TZA','Direxion Small Cap Bear 3X',-3],
 ['LABU','Direxion S&P Biotech Bull 3X',3],['LABD','Direxion S&P Biotech Bear 3X',-3],
 ['NUGT','Direxion Gold Miners Bull 2X',2],['DUST','Direxion Gold Miners Bear 2X',-2],
 ['BOIL','ProShares Ultra Natural Gas',2],['KOLD','ProShares UltraShort Natural Gas',-2],
 ['TMF','Direxion 20+ Year Treasury Bull 3X',3],['TBT','ProShares UltraShort 20+ Year Treasury',-2],
 ['YINN','Direxion FTSE China Bull 3X',3],['YANG','Direxion FTSE China Bear 3X',-3]
].map(([symbol,name,leverage])=>({symbol,name,type:'LEVERAGED_ETF',leverage}));

export const POS_WORDS=['beat','beats','surge','surges','record','upgrade','upgraded','growth','profit','strong','approval','approved','rally','rebound','outperform','buyback','raises','raised','gain','gains'];
export const NEG_WORDS=['miss','misses','plunge','plunges','downgrade','downgraded','loss','weak','lawsuit','probe','investigation','recall','cuts','cut','warning','falls','drop','drops','underperform','fraud','bankruptcy','slump'];

export const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
export const num=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
export const nowIso=()=>new Date().toISOString();
export const chunks=(a,n)=>{const r=[];for(let i=0;i<a.length;i+=n)r.push(a.slice(i,i+n));return r};
export const equityValue=(p,price)=>!p?.entry_price||!price?num(p?.invested):num(p.invested)*(num(price)/num(p.entry_price));
export function riskParams(mode){
 // Trading-Stil steuert weiter nur Signal-/Exit-Sensitivitaet. Es gibt keine harte Positionszahl
 // und keine Reservequote mehr; das vorhandene Spielgeld ist die einzige Portfolio-Grenze.
 if(mode==='vorsichtig')return{entry:6.2,stop:-.018,take:.035,reserve:0,max:1000000,normal:1,lever:1};
 if(mode==='offensiv')return{entry:4.2,stop:-.035,take:.075,reserve:0,max:1000000,normal:1,lever:1};
 return{entry:5.2,stop:-.025,take:.055,reserve:0,max:1000000,normal:1,lever:1};
}
