export const AI_MODEL = '@cf/zai-org/glm-4.7-flash';
export const SPARK_BATCH = 50;
// Opportunity-First-Profil: mehr Werte kommen in die 1m-Tiefenpruefung.
// Acht Finalisten sind ein bewusster Mittelweg: deutlich breiter als bisher,
// aber noch klein genug, damit die teuren Minutenchecks nicht den ganzen Scan bremsen.
export const DEEP_LIMIT = 8;
export const NEWS_LIMIT = 5;
export const NEWS_RADAR_BATCH = 3;

// Das Live-Planspiel handelt ausschließlich Aktien.
// ETFs und Hebelprodukte sind absichtlich aus dem aktiven Universum entfernt.
// Die leeren Exporte bleiben nur als Kompatibilität für ältere Module bestehen.
export const ZERO_ETF_MASTER = [];
export const ZERO_ETF_MASTER_COUNT = 0;
export const ZERO_ETF_ALWAYS_COUNT = 0;
// Die leere [].map-Form bleibt absichtlich erhalten, weil der historische
// 2026-Generator diesen Block textuell liest. Inhaltlich entstehen 0 ETFs.
export const CORE_ETFS = [
].map(([symbol,name,theme])=>({symbol,name,theme,type:'ETF',leverage:1}));
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