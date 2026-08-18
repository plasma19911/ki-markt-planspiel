import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v10.js';
import {MarketPortfolio as V9Portfolio} from './compact-portfolio-v9.js';
import {ProfitOptimizerAiGuard} from './profit-optimizer.js';
import {LegacyCashNeutralizerAiGuard} from './legacy-cash-neutralizer.js';
import {getLiveLearningStatus} from './live-signal-learning.js';

const FORWARD_SCAN_TARGET=15;
const FORWARD_MIN_SCORE=50;
const arr=v=>Array.isArray(v)?v:[];
const key=v=>String(v||'').toUpperCase().trim();
const baseSymbol=v=>key(v).split('.')[0];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const isFresh=(ts,ttl=15*60*1000)=>{const t=Date.parse(String(ts||''));return Number.isFinite(t)&&Date.now()-t>=0&&Date.now()-t<ttl};

function masterIndex(rows){
 const exact=new Map(),byBase=new Map();
 for(const row of rows){const s=key(row?.symbol);if(!s)continue;exact.set(s,row);const b=baseSymbol(s),a=byBase.get(b)||[];a.push(row);byBase.set(b,a)}
 const pref=row=>{const s=key(row?.symbol);if(s.endsWith('.DE'))return 0;if(s.endsWith('.F'))return 1;if(s.endsWith('.SG'))return 2;if(!s.includes('.'))return 3;return 4};
 for(const a of byBase.values())a.sort((x,y)=>pref(x)-pref(y)||num(y?.marketCapUSD||y?.marketCap)-num(x?.marketCapUSD||x?.marketCap));
 return{exact,byBase};
}
function resolve(symbol,index){const s=key(symbol);if(!s)return null;return index.exact.get(s)||(index.byBase.get(baseSymbol(s))||[])[0]||null}
function mergeThemes(a,b){const m=new Map();for(const x of [...arr(a),...arr(b)]){const id=String(x?.id||x?.label||'');if(!id)continue;const old=m.get(id);if(!old||num(x?.issueStrength)>num(old?.issueStrength))m.set(id,x)}return[...m.values()].slice(0,12)}

export class MarketPortfolio extends BasePortfolio{
 constructor(ctx,env){
  super(ctx,env);
  this.ctx=ctx;this.env=env;
  const assets=this.zeroAssets;
  if(assets?.fetch&&!assets.__forwardUniverseOverlay){
   assets.__forwardUniverseOverlay=true;
   const baseFetch=assets.fetch.bind(assets);
   assets.fetch=async(request,init)=>{
    const r=await baseFetch(request,init);let u;try{u=new URL(typeof request==='string'?request:request.url)}catch{return r}
    if(!u.pathname.endsWith('/universe.json')||!r.ok)return r;
    let data;try{data=await r.json()}catch{return r}
    const state=this.bucketAdapter?.peekState?.(),fw=state?.futureWatch;
    if(!fw||!isFresh(fw.updatedAt,30*60*1000)||!arr(fw.candidates).length)return Response.json(data,{headers:{'cache-control':'no-store'}});
    let raw=null;try{raw=await assets._load?.()}catch{}
    const rows=arr(raw?.equities).filter(x=>x?.symbol),index=masterIndex(rows),seen=new Set(arr(data?.equities).map(x=>key(x?.symbol))),extras=[];
    for(const c of arr(fw.candidates).sort((a,b)=>num(b?.watchScore)-num(a?.watchScore))){
      if(extras.length>=FORWARD_SCAN_TARGET||num(c?.watchScore)<FORWARD_MIN_SCORE)break;
      const row=resolve(c?.symbol,index);if(!row)continue;const s=key(row.symbol);if(!s||seen.has(s))continue;seen.add(s);extras.push({...row,forwardWatch:true,forwardWatchScore:num(c.watchScore),forwardWatchTheme:c.theme||null,forwardWatchHorizon:c.horizon||null,forwardWatchUrgency:num(c.urgency),forwardWatchAlreadyMoving:Boolean(c.alreadyMoving)})
    }
    return Response.json({...data,equities:[...arr(data?.equities),...extras],forward_watch_scan_count:extras.length,forward_watch_scan_target:FORWARD_SCAN_TARGET,scanner_slice_equity_count:arr(data?.equities).length+extras.length,scanner_mode:`${data?.scanner_mode||'LEADERS'}+FORWARD`},{headers:{'cache-control':'no-store'}});
   };
   if(this.engine?.env)this.engine.env.ASSETS=assets;
  }
  let ai=this.engine?.env?.AI;
  if(ai?.run&&!ai.__legacyCashNeutralizer){ai=new LegacyCashNeutralizerAiGuard(ai);this.engine.env.AI=ai}
  if(ai?.run&&!ai.__profitOptimizer){const wrapped=new ProfitOptimizerAiGuard(ai,this.bucketAdapter,ctx?.storage);wrapped.__profitOptimizer=true;this.engine.env.AI=wrapped}
 }

 async agentPrefetch(payload={}){
  const old=this.bucketAdapter?.peekState?.()?.futureWatch,oldRich=arr(old?.candidates).length?structuredClone(old):null;
  const result=await super.agentPrefetch(payload);
  const incoming=payload?.futureWatch;
  if(oldRich&&incoming&&arr(incoming?.candidates).length===0&&this.engine?.store?.update){
   await this.engine.store.update(s=>{s.futureWatch={...oldRich,activeThemes:mergeThemes(oldRich.activeThemes,incoming.activeThemes),source:`${oldRich.source||'Forward-Radar'} + PC-Themen`,pcThemeUpdatedAt:new Date().toISOString()};return true});
  }
  return result;
 }

 async _refreshFutureWatch(force=false){
  const p=this._agentPrefetch?.(),fw=p?.futureWatch;
  if(fw&&arr(fw.candidates).length>0&&isFresh(p?.receivedAt)&&isFresh(fw?.updatedAt))return super._refreshFutureWatch(force);
  return V9Portfolio.prototype._refreshFutureWatch.call(this,force);
 }

 async status(){
  const s=await super.status(),fw=s?.futureWatch||null,learning=getLiveLearningStatus(this.ctx?.storage);
  s.forwardScan={enabled:true,leaderPoolTarget:25,forwardPoolTarget:FORWARD_SCAN_TARGET,forwardCandidates:num(fw?.candidateCount),monitoredForwardUniverse:num(fw?.monitoredUniverseCount),activeThemes:arr(fw?.activeThemes).length,mode:'25 aktuelle Leader + bis zu 15 vorausschauende, im Broker-Master aufgelöste Ereignis-/Themenwerte',confirmationRequired:true,watchMayBeBroaderThanTradablePool:true};
  s.profitOptimizer={enabled:true,objective:'maximaler erwarteter Paper-Gewinn nach realistischen Kosten',alwaysInvested:false,maxSinglePositionPct:72,weakSetupsMayStayCash:true,forwardCatalystBoost:true,eventDirectionGuessing:false,profitRotation:true,badQuoteEvidenceBlocked:true,entryTimingLearning:true,entryTimingHorizonsMinutes:[15,30,60],legacyFullCashFailsafe:true,note:'Aggressiver Paper-Modus: Kapital wird in wenige starke, mehrfach bestaetigte Setups konzentriert. 15/30/60-Minuten-Ergebnisse kalibrieren das Einstiegstiming automatisch. Alte FULL-CASH-Fallbacks werden in Produktion neutralisiert. Keine Gewinngarantie; Safety-/Quote-/Kostenpruefungen bleiben aktiv.'};
  s.entryTimingLearning=learning;
  s.executionModel={...(s.executionModel||{}),fullCashPolicy:false,alwaysInvested:false,cashMayRemain:true,strategicCashReservePct:null,legacyFullCashFailsafe:true};
  if(s.freeTierBudget)s.freeTierBudget={...s.freeTierBudget,forwardLookingPool:true,forwardPoolTarget:FORWARD_SCAN_TARGET,note:`${s.freeTierBudget.note||''} Zusätzlich werden bis zu ${FORWARD_SCAN_TARGET} vorausschauende Ereignis-/Themenkandidaten aus dem Broker-Master im Minuten-Scan beobachtet; gekauft wird erst nach Live-Bestaetigung. Einstiegstiming wird nach 15/30/60 Minuten lernend bewertet. Freies Cash darf bei fehlendem positivem Erwartungswert liegen bleiben.`};
  return s;
 }
}
