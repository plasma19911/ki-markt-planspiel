import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v286-comprehensive-opportunity.js';
import {CalibratedActionScoreGuardV287} from './calibrated-action-score-v287.js';
import {buildBroadLeaderPool,applyRotatingBreadth,BROAD_POOL_TTL_MS} from './scanner-breadth-v287.js';

const BROAD_KEY='cache/v287-broad-leaders';
const arr=v=>Array.isArray(v)?v:[];
const fresh=(ts,ttl=BROAD_POOL_TTL_MS)=>{const t=Date.parse(String(ts||''));return Number.isFinite(t)&&Date.now()-t>=0&&Date.now()-t<ttl};

// PAPER-TRADING ONLY. V28.7 recalibrates the action score and increases scanner
// breadth over time without increasing the expensive per-minute deep slice.
export class MarketPortfolio extends BasePortfolio{
 constructor(ctx,env){
  super(ctx,env);this.ctx=ctx;this.env=env;
  const ai=this.engine?.env?.AI;
  if(ai?.run&&!ai.__calibratedActionScoreV287){
   const getState=()=>{try{return this._actualState?.()||{}}catch{return{}}};
   const wrapped=new CalibratedActionScoreGuardV287(ai,{getState,storage:this.ctx?.storage});
   wrapped.__calibratedActionScoreV287=true;this.calibratedActionScoreV287=wrapped;this.engine.env.AI=wrapped;
  }
  const assets=this.zeroAssets;
  if(assets?.fetch&&!assets.__v287BreadthRotation){
   assets.__v287BreadthRotation=true;const baseFetch=assets.fetch.bind(assets);
   assets.fetch=async(request,init)=>{
    const response=await baseFetch(request,init);let u;try{u=new URL(typeof request==='string'?request:request.url)}catch{return response}
    if(!u.pathname.endsWith('/universe.json')||!response.ok)return response;
    const fallback=response.clone();let data;try{data=await response.json()}catch{return fallback}
    let broad=null;try{broad=this.ctx?.storage?.kv?.get(BROAD_KEY)||null}catch{}
    if(!broad||!fresh(broad.updatedAt))return Response.json({...data,breadthRotationApplied:false,broadPoolSize:arr(broad?.pool).length},{headers:{'cache-control':'no-store'}});
    const state=this.bucketAdapter?.peekState?.()||{},next=applyRotatingBreadth(data,broad,state);
    return Response.json(next,{headers:{'cache-control':'no-store'}})
   };
   if(this.engine?.env)this.engine.env.ASSETS=assets;
  }
 }
 async agentPrefetch(payload={}){
  const result=await super.agentPrefetch(payload);
  try{
   const raw=await this.zeroAssets?._load?.(),rows=arr(raw?.equities).filter(x=>x?.symbol),entries=arr(payload?.leaderEntries);
   if(rows.length&&entries.length){const broad=buildBroadLeaderPool(entries,rows);if(broad.pool.length>=25)this.ctx?.storage?.kv?.put(BROAD_KEY,broad)}
  }catch(e){console.error('V28.7 broad leader prefetch failed',e)}
  return result
 }
 async status(){
  const s=await super.status(),policy=this.calibratedActionScoreV287?.status?.()||{enabled:true,version:28.7,ranking:[],positionScores:[]};let broad=null;try{broad=this.ctx?.storage?.kv?.get(BROAD_KEY)||null}catch{}
  s.calibratedActionScorePolicy=policy;
  s.researchSignalFusionPolicy={...(s.researchSignalFusionPolicy||{}),...policy,version:28.7,ranking:policy.ranking||[],positionScores:policy.positionScores||[],scoreModel:'V28.7 calibrated buy/hold/sell action score',scoreLegend:[{min:75,label:'Kaufbereit'},{min:68,label:'Bestätigen'},{min:58,label:'Beobachten'},{min:40,label:'Aufbau'},{min:0,label:'Schwach'}],positionScoreMeaning:'Positionen zeigen Haltescore und daraus abgeleiteten Verkaufsscore. Teil-/Alt-Scores bleiben rein informativ und lösen keinen automatischen Verkauf aus.'};
  s.scannerBreadthPolicy={enabled:true,version:28.7,broadPoolTarget:60,broadPoolSize:arr(broad?.pool).length,broadPoolFresh:Boolean(broad&&fresh(broad.updatedAt)),updatedAt:broad?.updatedAt||null,anchorsEveryMinute:12,rotatingLeadersPerMinute:13,rotationBuckets:4,approxUniqueLeaderCoverageMinutes:4,deepSliceTargetPerMinute:25,heldAlwaysIncluded:true,forwardOverlayPreserved:true,mode:'12 feste Top-Leader + 13 rotierende aus Top-60; dadurch ca. 60 Leader in vier Minuten gesehen, ohne den teuren Minuten-Slice zu vergrößern.'};
  if(s?.finalDecisionPolicy)s.finalDecisionPolicy={...s.finalDecisionPolicy,version:28.7,calibratedActionScore:true,coverageShrinkage:true,nonlinearChasePenalty:true,partialScoresCannotAutoSell:true,broadScannerRotation:true,rule:'V28.7 trennt Chancenqualität von Einstiegs-Timing: fehlende Daten sind neutral, reduzieren aber die Sicherheit extremer Scores; Überdehnung wird nicht mehr von Momentum überstimmt. BUY ab 75 nach Bestätigung. SELL/Rotation nur mit frischen vollständigen Positionsdaten; Teilscore allein verkauft nie.'};
  if(s?.executionModel)s.executionModel={...s.executionModel,calibratedActionScoreV287:true,breadthRotationV287:true};
  if(s?.freeTierBudget)s.freeTierBudget={...s.freeTierBudget,broadPoolTarget:60,deepSliceStillCapped:true,approxUniqueLeaderCoverageMinutes:4,note:`${s.freeTierBudget.note||''} V28.7 vergroessert nicht den teuren Minutenscan, sondern rotiert das Leader-Fenster ueber einen groesseren Top-60-Pool.`};
  return s
 }
}
