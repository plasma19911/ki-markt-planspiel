export const AI_MODEL = '@cf/zai-org/glm-4.7-flash';
export const SPARK_BATCH = 40;
export const DEEP_LIMIT = 12;
export const NEWS_LIMIT = 6;
export const NEWS_RADAR_BATCH = 8;

export const CORE_ETFS = [
 ['SPY','SPDR S&P 500 ETF Trust'],['QQQ','Invesco QQQ Trust'],['VTI','Vanguard Total Stock Market ETF'],
 ['VWCE.DE','Vanguard FTSE All-World UCITS ETF USD Accumulating (A2PXXG)'],
 ['EXXT.DE','iShares NASDAQ-100 UCITS ETF (DE) (A0F5UF)'],
 ['IWM','iShares Russell 2000 ETF'],['DIA','SPDR Dow Jones Industrial Average ETF'],['XLK','Technology Select Sector SPDR'],
 ['XLF','Financial Select Sector SPDR'],['XLE','Energy Select Sector SPDR'],['XLV','Health Care Select Sector SPDR'],
 ['GLD','SPDR Gold Shares'],['TLT','iShares 20+ Year Treasury Bond ETF'],['EEM','iShares MSCI Emerging Markets ETF'],
 ['VGK','Vanguard FTSE Europe ETF'],['EWJ','iShares MSCI Japan ETF'],['EWG','iShares MSCI Germany ETF'],
 ['INDA','iShares MSCI India ETF'],['MCHI','iShares MSCI China ETF'],['ARKK','ARK Innovation ETF']
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
 if(mode==='vorsichtig')return{entry:6.2,stop:-.018,take:.035,reserve:.20,max:2,normal:.34,lever:.12};
 if(mode==='offensiv')return{entry:4.2,stop:-.035,take:.075,reserve:.05,max:4,normal:.30,lever:.18};
 return{entry:5.2,stop:-.025,take:.055,reserve:.10,max:3,normal:.30,lever:.15};
}
