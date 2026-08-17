export const AI_MODEL = '@cf/zai-org/glm-4.7-flash';
export const SPARK_BATCH = 40;
export const DEEP_LIMIT = 12;
// Pro Minute nur die wichtigsten Kandidaten individuell per Yahoo-News abfragen.
export const NEWS_LIMIT = 4;
export const NEWS_RADAR_BATCH = 6;

// TRADE-UNIVERSUM für das geplante Zieldepot finanzen.net ZERO/gettex.
// US-domiciled ETFs wie SPY/QQQ bleiben als Analyse-/Makro-Proxys in anderen Modulen,
// werden aber nicht mehr als kaufbare ETF-Kandidaten an die Handels-KI gegeben.
// Hier stehen bewusst normale europäische UCITS-ETFs mit in Deutschland gebräuchlichen
// Börsenlistings. Das vermeidet PRIIPs-/KID-Probleme bei US-ETFs im deutschen Retail-Depot.
export const CORE_ETFS = [
 ['VWCE.DE','Vanguard FTSE All-World UCITS ETF USD Accumulating (A2PKXG)','GLOBAL'],
 ['EUNL.DE','iShares Core MSCI World UCITS ETF USD Acc','WORLD'],
 ['SXR8.DE','iShares Core S&P 500 UCITS ETF USD Acc','USA'],
 ['EXXT.DE','iShares NASDAQ-100 UCITS ETF (DE)','TECH'],
 ['IUSN.DE','iShares MSCI World Small Cap UCITS ETF','SMALL_CAP'],
 ['EXSA.DE','iShares STOXX Europe 600 UCITS ETF (DE)','EUROPE'],
 ['IS3N.DE','iShares Core MSCI Emerging Markets IMI UCITS ETF','EMERGING_MARKETS'],
 ['IQQH.DE','iShares Global Clean Energy Transition UCITS ETF','CLEAN_ENERGY']
].map(([symbol,name,theme])=>({symbol,name,theme,type:'ETF',leverage:1,broker:'finanzen.net ZERO',venue:'gettex',ucits:true,brokerEligible:true,priority:true}));

// Absichtlich leer: Das Planspiel handelt ausschließlich Aktien und normale ETFs.
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
