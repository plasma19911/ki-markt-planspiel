import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v16.js';
import {setSecondChanceRuntime,clearSecondChanceRuntime} from './second-chance-runtime.js';
import {SECOND_CHANCE_TARGET,buildSecondChanceWatch,isSecondChanceWatchFresh,isBlockedSecondChanceSymbol} from './second-chance-watch-utils.js';
export {SECOND_CHANCE_TARGET,SECOND_CHANCE_RETENTION_MS,buildSecondChanceWatch,isSecondChanceCandidate} from './second-chance-watch-utils.js';

// V17: Gute Deep-Kandidaten verschwinden nicht mehr sofort. Zusaetzlich arbeitet
// der Profit-Optimizer im Capital-in-Motion-Paper-Modus: freies Cash wird auf die
// besten hart-sicheren Kandidaten verteilt und schwaechere Positionen duerfen
// frueh in bessere Setups rotieren. Harte Safety-Sperren bleiben bestehen.

const WATCH_KEY='state/second-chance-watch-v1';
const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const key=v=>String(v||'').toUpperCase().trim();
const baseSymbol=v=>key(v).split('.')[0];

function masterIndex(rows){
 const exact=new Map(),byBase=new Map();
 for(const row of rows){const s=key(row?.symbol);if(!s)continue;exact.set(s,row);const b=baseSymbol(s),a=byBase.get(b)||[];a.push(row);byBase.set(b,a)}
 const pref=row=>{const s=key(row?.symbol);if(s.endsWith('.DE'))return 0;if(s.endsWith('.F'))return 1;if(s.endsWith('.SG'))return 2;if(!s.includes('.'))return 3;return 4};
 for(const a of byBase.values())a.sort((x,y)=>pref(x)-pref(y)||num(y?.marketCapUSD||y?.marketCap)-num(x?.marketCapUSD||x?.marketCap));
 return{exact,byBase};
}
function resolve(symbol,index){const s=key(symbol);if(!s)return null;return index.exact.get(s)||(index.byBase.get(baseSymbol(s))||[])[0]||null}

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
    const watch=this._readSecondChance();if(!isSecondChanceWatchFresh(watch)||!arr(watch?.candidates).length)return Response.json(data,{headers:{'cache-control':'no-store'}});
    let raw=null;try{raw=await assets._load?.()}catch{}
    const index=masterIndex(arr(raw?.equities).filter(x=>x?.symbol)),seen=new Set(arr(data?.equities).map(x=>key(x?.symbol))),extras=[];
    for(const c of arr(watch.candidates)){
      if(extras.length>=SECOND_CHANCE_TARGET)break;const row=resolve(c?.symbol,index),s=key(row?.symbol);if(!row||!s||seen.has(s)||isBlockedSecondChanceSymbol(s))continue;seen.add(s);extras.push({...row,secondChanceWatch:true,secondChancePreviousScore:num(c?.score),secondChancePreviousConfidence:num(c?.confidence)});
    }
    return Response.json({...data,equities:[...arr(data?.equities),...extras],second_chance_watch_count:extras.length,second_chance_watch_target:SECOND_CHANCE_TARGET,scanner_slice_equity_count:arr(data?.equities).length+extras.length,scanner_mode:`${data?.scanner_mode||'LEADERS'}+SECOND_CHANCE`},{headers:{'cache-control':'no-store'}});
   };
   if(this.engine?.env)this.engine.env.ASSETS=assets;
  }
 }
 _readSecondChance(){try{return this.ctx?.storage?.kv?.get(WATCH_KEY)||null}catch{return null}}
 _storeSecondChance(watch){try{this.ctx?.storage?.kv?.put(WATCH_KEY,watch)}catch{}return watch}
 async scan(){
  const before=this._readSecondChance(),active=isSecondChanceWatchFresh(before)?arr(before?.candidates):[];setSecondChanceRuntime(active);
  try{
   const r=await super.scan();
   if(!r?.skipped&&!r?.aborted){const state=this.bucketAdapter?.peekState?.(),next=buildSecondChanceWatch(before,state?.candidates||[]);this._storeSecondChance(next);setSecondChanceRuntime(next.candidates)}
   return r;
  }finally{if(!this._readSecondChance()?.candidateCount)clearSecondChanceRuntime()}
 }
 async status(){
  const s=await super.status(),watch=this._readSecondChance(),isFresh=isSecondChanceWatchFresh(watch),count=isFresh?num(watch?.candidateCount):0;
  s.secondChanceWatch={enabled:true,target:SECOND_CHANCE_TARGET,candidateCount:count,updatedAt:watch?.updatedAt||null,fresh:isFresh,retentionMinutes:12,recheckPerScan:2,requiresFreshOneMinuteRecheck:true,forcedBuy:false,mode:'Gute Deep-Kandidaten bleiben bis zu 12 Minuten im Heisspool; fehlen sie im normalen Finalisten-Ranking, erhalten bis zu zwei pro Scan einen frischen 1m-Zweitcheck.'};
  if(s.profitOptimizer)s.profitOptimizer={...s.profitOptimizer,secondChanceCapture:true,strongCandidateRetentionMinutes:12,secondChanceRecheckPerScan:2,deepFinalists:4,bestQualifiedEntry:true,bestQualifiedMinExpected:4.7,secondChanceMinExpected:5.7,capitalInMotion:true,alwaysInvested:true,capitalMotionMinExpected:3.0,capitalMotionTargetCashDeploymentPct:100,rotationMinGap:0.8,lossRotationMinGap:0.45,rotationMinAgeMinutes:8,hardSafetyStillRequired:true,hardSafetyCashException:true,profitRotation:true,weakSetupsMayStayCash:false,note:'Capital-in-Motion Paper-Modus: verfuegbares Cash wird grundsaetzlich zu 100% auf die besten hart-sicheren Aktien verteilt. Schwache/verlierende Positionen duerfen frueh in bessere Setups rotieren. Nur wenn kein Kandidat die harten Safety-/Venue-/Event-/Datenregeln besteht, darf ausnahmsweise Cash liegen bleiben. Keine Gewinngarantie.'};
  if(s.executionModel)s.executionModel={...s.executionModel,alwaysInvested:true,capitalInMotion:true,cashMayRemain:false,strategicCashReservePct:0,hardSafetyCashException:true,legacyFullCashFailsafe:true,fullCashPolicy:false};
  if(s.freeTierBudget)s.freeTierBudget={...s.freeTierBudget,secondChanceWatch:true,secondChanceRetentionMinutes:12,secondChanceRecheckPerScan:2,bestQualifiedEntry:true,capitalInMotion:true,alwaysInvested:true,capitalMotionTargetCashDeploymentPct:100,note:`${s.freeTierBudget.note||''} Capital-in-Motion: freies Cash wird auf die besten hart-sicheren Kandidaten verteilt; bei klar besserem Erwartungswert darf eine schwaechere Position bereits nach kurzer Hysterese rotiert werden. Harte Safety-/Venue-/Event-Sperren bleiben.`};
  return s;
 }
}
