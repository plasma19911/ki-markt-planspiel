import {GENERATED_ZERO_ETFS} from './generated-zero-etfs.js';

export const AI_MODEL = '@cf/zai-org/glm-4.7-flash';
export const SPARK_BATCH = 40;
export const DEEP_LIMIT = 12;
export const NEWS_LIMIT = 4;
export const NEWS_RADAR_BATCH = 6;

// ETF-Masterpool für das geplante Zieldepot finanzen.net ZERO/gettex.
// Der vollständige Pool darf auf ZERO-Größenordnung wachsen; pro Minute wird aus
// Cloudflare-Quota-Gründen nur ein rotierender Ausschnitt in den Live-Scan gegeben.
// Konkrete ZERO-Verfügbarkeit bleibt vor einer späteren Echtgeldorder ein Pflichtcheck.
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
].map(([symbol,name,theme])=>({symbol,name,theme,type:'ETF',leverage:1,broker:'finanzen.net ZERO',venue:'gettex',ucits:true,brokerCatalogCandidate:true,brokerVerified:false,priority:true}));

const etfBySymbol=new Map();
for(const x of [...CURATED_CORE_ETFS,...GENERATED_ZERO_ETFS]){
 const symbol=String(x?.symbol||'').toUpperCase();
 if(!symbol||etfBySymbol.has(symbol))continue;
 etfBySymbol.set(symbol,{...x,symbol,type:'ETF',leverage:1,ucits:true,broker:'finanzen.net ZERO',venue:'gettex',brokerCatalogCandidate:true,brokerVerified:Boolean(x?.brokerVerified)});
}
export const ZERO_ETF_MASTER=[...etfBySymbol.values()];
export const ZERO_ETF_MASTER_COUNT=ZERO_ETF_MASTER.length;
export const ZERO_ETF_ALWAYS_COUNT=CURATED_CORE_ETFS.length;
export const ZERO_ETF_ROTATING_PER_MINUTE=102;

function rotateEtfs(pool,count,seed){if(!pool.length||count<=0)return[];const n=Math.min(count,pool.length),start=(seed*n)%pool.length,out=[];for(let i=0;i<n;i++)out.push(pool[(start+i)%pool.length]);return out}
function liveEtfSlice(){
 const always=ZERO_ETF_MASTER.filter(x=>x.priority),pool=ZERO_ETF_MASTER.filter(x=>!x.priority),minute=Math.floor(Date.now()/60000),rot=rotateEtfs(pool,ZERO_ETF_ROTATING_PER_MINUTE,minute),seen=new Set(),out=[];
 for(const x of [...always,...rot]){const k=String(x.symbol).toUpperCase();if(!seen.has(k)){seen.add(k);out.push(x)}}return out;
}

// loadUniverse nutzt Spread-Syntax (...CORE_ETFS), deshalb liefert der Iterator nur den
// aktuellen Minuten-Slice. Die Masterliste bleibt dennoch vollständig im Build vorhanden.
export const CORE_ETFS=new Proxy(ZERO_ETF_MASTER,{get(target,prop,receiver){if(prop===Symbol.iterator)return function*(){yield* liveEtfSlice()};return Reflect.get(target,prop,receiver)}});

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
