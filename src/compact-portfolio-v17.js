import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v16.js';
import {setSecondChanceRuntime,clearSecondChanceRuntime} from './second-chance-runtime.js';

// V17: Gute Deep-Kandidaten verschwinden nicht mehr sofort, nur weil sie im
// naechsten Minutenranking knapp aus den Finalisten fallen. Bis zu 8 starke,
// ungefaehrliche Werte bleiben 12 Minuten im Zweitcheck-Pool. Market-v3 fuehrt
// fuer bis zu zwei fehlende Kandidaten pro Runde einen frischen 1m-Recheck aus.
// Die Watchlist ist KEIN Kaufsignal und erzwingt niemals einen Trade.

const WATCH_KEY='state/second-chance-watch-v1';
export const SECOND_CHANCE_RETENTION_MS=12*60*1000;
export const SECOND_CHANCE_TARGET=8;
const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const key=v=>String(v||'').toUpperCase().trim();
const baseSymbol=v=>key(v).split('.')[0];
const blockedSymbol=s=>/\.(?:V|CN|NE|PK|OB)$/i.test(key(s));
const fresh=(ts,ttl=SECOND_CHANCE_RETENTION_MS)=>{const t=Date.parse(String(ts||''));return Number.isFinite(t)&&Date.now()-t>=0&&Date.now()-t<ttl};

function masterIndex(rows){
 const exact=new Map(),byBase=new Map();
 for(const row of rows){const s=key(row?.symbol);if(!s)continue;exact.set(s,row);const b=baseSymbol(s),a=byBase.get(b)||[];a.push(row);byBase.set(b,a)}
 const pref=row=>{const s=key(row?.symbol);if(s.endsWith('.DE'))return 0;if(s.endsWith('.F'))return 1;if(s.endsWith('.SG'))return 2;if(!s.includes('.'))return 3;return 4};
 for(const a of byBase.values())a.sort((x,y)=>pref(x)-pref(y)||num(y?.marketCapUSD||y?.marketCap)-num(x?.marketCapUSD||x?.marketCap));
 return{exact,byBase};
}
function resolve(symbol,index){const s=key(symbol);if(!s)return null;return index.exact.get(s)||(index.byBase.get(baseSymbol(s))||[])[0]||null}
function stateName(c){return String(c?.momentum_state||c?.momentumState||'NORMAL').toUpperCase()}
function sellSignal(c){return String(c?.momentum_sell_signal||c?.momentumSellSignal||'NONE').toUpperCase()}
function eventRisk(c){return String(c?.event_risk||c?.eventRisk||'NONE').toUpperCase()}
export function isSecondChanceCandidate(c={}){
 const score=num(c?.score),conf=num(c?.confidence),good=(score>=5.25&&conf>=.68)||(score>=4.8&&conf>=.76),bad=eventRisk(c)==='HIGH'||sellSignal(c)==='STRONG'||['REVERSAL','EXHAUSTION'].includes(stateName(c))||blockedSymbol(c?.symbol);
 return Boolean(key(c?.symbol)&&good&&!bad);
}
export function buildSecondChanceWatch(previous,current,now=Date.now()){
 const old=arr(previous?.candidates).filter(x=>fresh(x?.lastSeenAt||x?.updatedAt)),cur=arr(current),badNow=new Set(cur.filter(c=>eventRisk(c)==='HIGH'||sellSignal(c)==='STRONG'||['REVERSAL','EXHAUSTION'].includes(stateName(c))).map(c=>key(c?.symbol))),m=new Map();
 for(const x of old){const s=key(x?.symbol);if(s&&!badNow.has(s)&&!blockedSymbol(s))m.set(s,{...x})}
 const stamp=new Date(now).toISOString();
 for(const c of cur){if(!isSecondChanceCandidate(c))continue;const s=key(c.symbol),oldRow=m.get(s);m.set(s,{...c,symbol:s,firstSeenAt:oldRow?.firstSeenAt||stamp,lastSeenAt:stamp,watchReason:`Starker Deep-Kandidat ${num(c.score).toFixed(2)} / ${Math.round(num(c.confidence)*100)}% bleibt fuer frischen 1m-Zweitcheck aktiv`})}
 const candidates=[...m.values()].filter(x=>fresh(x?.lastSeenAt||x?.updatedAt)).sort((a,b)=>(num(b.score)+num(b.confidence)*1.5)-(num(a.score)+num(a.confidence)*1.5)).slice(0,SECOND_CHANCE_TARGET);
 return{version:1,updatedAt:stamp,candidateCount:candidates.length,target:SECOND_CHANCE_TARGET,retentionMinutes:12,recheckPerScan:2,forcedBuy:false,requiresFreshOneMinuteRecheck:true,candidates};
}

export class MarketPortfolio extends BasePortfolio{
 constructor(ctx,env){
  super(ctx,env);this.ctx=ctx;this.env=env;
  const assets=this.zeroAssets;
  if(assets?.fetch&&!assets.__secondChanceUniverseOverlay){
   assets.__secondChanceUniverseOverlay=true;
   const baseFetch=assets.fetch.bind(assets);
   assets.fetch=async(request,init)=>{
    const r=await baseFetch(request,init);let u;try{u=new URL(typeof request==='string'?request:request.url)}catch{return r}
    if(!u.pathname.endsWith('/universe.json')||!r.ok)return r;
    let data;try{data=await r.json()}catch{return r}
    const watch=this._readSecondChance();if(!watch||!fresh(watch.updatedAt)||!arr(watch.candidates).length)return Response.json(data,{headers:{'cache-control':'no-store'}});
    let raw=null;try{raw=await assets._load?.()}catch{}
    const index=masterIndex(arr(raw?.equities).filter(x=>x?.symbol)),seen=new Set(arr(data?.equities).map(x=>key(x?.symbol))),extras=[];
    for(const c of arr(watch.candidates)){
      if(extras.length>=SECOND_CHANCE_TARGET)break;const row=resolve(c?.symbol,index),s=key(row?.symbol);if(!row||!s||seen.has(s)||blockedSymbol(s))continue;seen.add(s);extras.push({...row,secondChanceWatch:true,secondChancePreviousScore:num(c?.score),secondChancePreviousConfidence:num(c?.confidence)});
    }
    return Response.json({...data,equities:[...arr(data?.equities),...extras],second_chance_watch_count:extras.length,second_chance_watch_target:SECOND_CHANCE_TARGET,scanner_slice_equity_count:arr(data?.equities).length+extras.length,scanner_mode:`${data?.scanner_mode||'LEADERS'}+SECOND_CHANCE`},{headers:{'cache-control':'no-store'}});
   };
   if(this.engine?.env)this.engine.env.ASSETS=assets;
  }
 }
 _readSecondChance(){try{return this.ctx?.storage?.kv?.get(WATCH_KEY)||null}catch{return null}}
 _storeSecondChance(watch){try{this.ctx?.storage?.kv?.put(WATCH_KEY,watch)}catch{}return watch}
 async scan(){
  const before=this._readSecondChance(),active=before&&fresh(before.updatedAt)?arr(before.candidates):[];setSecondChanceRuntime(active);
  try{
   const r=await super.scan();
   if(!r?.skipped&&!r?.aborted){const state=this.bucketAdapter?.peekState?.(),next=buildSecondChanceWatch(before,state?.candidates||[]);this._storeSecondChance(next);setSecondChanceRuntime(next.candidates)}
   return r;
  }finally{if(!this._readSecondChance()?.candidateCount)clearSecondChanceRuntime()}
 }
 async status(){
  const s=await super.status(),watch=this._readSecondChance(),isFresh=Boolean(watch&&fresh(watch.updatedAt)),count=isFresh?num(watch?.candidateCount):0;
  s.secondChanceWatch={enabled:true,target:SECOND_CHANCE_TARGET,candidateCount:count,updatedAt:watch?.updatedAt||null,fresh:isFresh,retentionMinutes:12,recheckPerScan:2,requiresFreshOneMinuteRecheck:true,forcedBuy:false,mode:'Starke Deep-Kandidaten bleiben bis zu 12 Minuten im Heisspool; fehlen sie im normalen Finalisten-Ranking, erhalten bis zu zwei pro Scan einen frischen 1m-Zweitcheck.'};
  if(s.profitOptimizer)s.profitOptimizer={...s.profitOptimizer,secondChanceCapture:true,strongCandidateRetentionMinutes:12,secondChanceRecheckPerScan:2,secondChanceProbeMaxPct:28,deepFinalists:4};
  if(s.freeTierBudget)s.freeTierBudget={...s.freeTierBudget,secondChanceWatch:true,secondChanceRetentionMinutes:12,secondChanceRecheckPerScan:2,note:`${s.freeTierBudget.note||''} Starke Deep-Kandidaten fallen nicht sofort aus dem Radar: bis zu ${SECOND_CHANCE_TARGET} werden 12 Minuten gehalten; pro Scan werden maximal 2 fehlende Werte mit einem frischen 1m-Chart nachgeprueft.`};
  return s;
 }
}
