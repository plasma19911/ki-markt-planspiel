import {GENERATED_ZERO_ETFS} from './generated-zero-etfs.js';

export const AI_MODEL = '@cf/zai-org/glm-4.7-flash';
export const SPARK_BATCH = 40;
export const DEEP_LIMIT = 12;
export const NEWS_LIMIT = 4;
export const NEWS_RADAR_BATCH = 6;

// TRADE-UNIVERSUM für das geplante Zieldepot finanzen.net ZERO/gettex.
// US-domiciled ETFs wie SPY/QQQ bleiben ausschließlich Analyse-/Makro-Proxys.
// Kaufbare ETF-Kandidaten sind normale europäische UCITS-Produkte mit in Deutschland
// gebräuchlichen Listings. Die ZERO-Produktliste ist dynamisch; Broker-Verfügbarkeit
// wird deshalb nicht als dauerhafte Garantie oder als Kaufsignal behandelt.
const CURATED_CORE_ETFS = [
 ['VWCE.DE','Vanguard FTSE All-World UCITS ETF USD Accumulating (A2PKXG)','GLOBAL'],
 ['EUNL.DE','iShares Core MSCI World UCITS ETF USD Acc','WORLD'],
 ['SXR8.DE','iShares Core S&P 500 UCITS ETF USD Acc','USA'],
 ['EXXT.DE','iShares NASDAQ-100 UCITS ETF (DE) (A0F5UF)','TECH'],
 ['SXRV.DE','iShares NASDAQ 100 UCITS ETF','TECH'],
 ['IUSN.DE','iShares MSCI World Small Cap UCITS ETF','SMALL_CAP'],
 ['IUS3.DE','iShares S&P SmallCap 600 UCITS ETF','SMALL_CAP_USA'],
 ['EXSA.DE','iShares STOXX Europe 600 UCITS ETF (DE)','EUROPE'],
 ['EUN1.DE','iShares STOXX Europe 50 UCITS ETF','EUROPE'],
 ['IS3N.DE','iShares Core MSCI Emerging Markets IMI UCITS ETF','EMERGING_MARKETS'],
 ['SXRZ.DE','iShares Nikkei 225 UCITS ETF','JAPAN'],
 ['EXV1.DE','iShares STOXX Europe 600 Banks UCITS ETF (DE)','BANKS'],
 ['EXV5.DE','iShares STOXX Europe 600 Automobiles & Parts UCITS ETF (DE)','AUTOMOTIVE'],
 ['EXV6.DE','iShares STOXX Europe 600 Basic Resources UCITS ETF (DE)','MATERIALS'],
 ['EXV8.DE','iShares STOXX Europe 600 Construction & Materials UCITS ETF (DE)','CONSTRUCTION'],
 ['IS0D.DE','iShares Oil & Gas Exploration & Production UCITS ETF','ENERGY'],
 ['IQQQ.DE','iShares Global Water UCITS ETF','WATER'],
 ['IQQH.DE','iShares Global Clean Energy Transition UCITS ETF','CLEAN_ENERGY']
].map(([symbol,name,theme])=>({symbol,name,theme,type:'ETF',leverage:1,broker:'finanzen.net ZERO',venue:'gettex',ucits:true,brokerEligible:true,priority:true}));

const etfBySymbol=new Map();
for(const x of [...CURATED_CORE_ETFS,...GENERATED_ZERO_ETFS]){
 const symbol=String(x?.symbol||'').toUpperCase();
 if(!symbol||etfBySymbol.has(symbol))continue;
 etfBySymbol.set(symbol,{...x,symbol,type:'ETF',leverage:1,ucits:true,broker:'finanzen.net ZERO',venue:'gettex',brokerEligible:true});
}
export const CORE_ETFS=[...etfBySymbol.values()];

export const LEVERAGED_ETFS = [];

export const POS_WORDS=['beat','beats','surge','surges','record','upgrade','upgraded','growth','profit','strong','approval','approved','rally','rebound','outperform','buyback','raises','raised','gain','gains'];
export const NEG_WORDS=['miss','misses','plunge','plunges','downgrade','downgraded','loss','weak','lawsuit','probe','investigation','recall','cuts','cut','warning','falls','drop','drops','underperform','fraud','bankruptcy','slump'];

export const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
export const num=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
export const nowIso=()=>new Date().toISOString();
export const chunks=(a,n)=>{const r=[];for(let i=0;i<a.length;i+=n)r.push(a.slice(i,i+n));return r};
export const equityValue=(p,price)=>!p?.entry_price||!price?num(p?.invested):num(p.invested)*(num(price)/num(p.entry_price));
export function riskParams(mode){
 if(mode==='vorsichtig')return{entry:6.2,stop:-.018,take:.035,reserve:0,max:1000000,normal:1,lever:0};
 if(mode==='offensiv')return{entry:4.2,stop:-.035,take:.075,reserve:0,max:1000000,normal:1,lever:0};
 return{entry:5.2,stop:-.025,take:.055,reserve:0,max:1000000,normal:1,lever:0};
}
