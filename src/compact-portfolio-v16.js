import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v15.js';
import {WIDE_SWEEP_TARGET,normalizeWideSweepEntries,isFreshWideSweep,isBlockedWideSweepSymbol} from './wide-sweep-utils.js';

// V16: Der Windows-PC dient als breiter Radar-Server. Er kann das komplette
// Aktien-Master in grossen Kurs-Batches vorscannen und nur die auffaelligsten
// Werte hierher schicken. Diese Discovery-Eintraege sind KEIN Kaufsignal und
// muessen weiterhin Profit-Optimizer, Deep/Safety, News, Anti-Chase und
// Target-Venue-Sanity bestehen.

const WIDE_STATE_KEY='state/pc-wide-sweep-v1';
const MIN_MARKET_CAP=150_000_000;
const arr=v=>Array.isArray(v)?v:[];
const key=v=>String(v||'').toUpperCase().trim();
const baseSymbol=v=>key(v).split('.')[0];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;

function masterIndex(rows){
 const exact=new Map(),byBase=new Map();
 for(const row of rows){const s=key(row?.symbol);if(!s)continue;exact.set(s,row);const b=baseSymbol(s),a=byBase.get(b)||[];a.push(row);byBase.set(b,a)}
 const pref=row=>{const s=key(row?.symbol);if(s.endsWith('.DE'))return 0;if(s.endsWith('.F'))return 1;if(s.endsWith('.SG'))return 2;if(!s.includes('.'))return 3;return 4};
 for(const a of byBase.values())a.sort((x,y)=>pref(x)-pref(y)||num(y?.marketCapUSD||y?.marketCap)-num(x?.marketCapUSD||x?.marketCap));
 return{exact,byBase};
}
function resolve(symbol,index){const s=key(symbol);if(!s)return null;return index.exact.get(s)||(index.byBase.get(baseSymbol(s))||[])[0]||null}
function liquidEnough(row){const cap=num(row?.marketCapUSD||row?.marketCap);return cap<=0||cap>=MIN_MARKET_CAP}
function helperMeta(meta,previous){
 const profile=String(meta?.profile||'').toUpperCase(),isFast=Boolean(meta?.fastHelper)||profile.includes('FAST_RADAR');
 if(isFast)return{enabled:true,updatedAt:new Date().toISOString(),profile:String(meta?.profile||'FAST_RADAR_ADAPTIVE_V1').slice(0,60),parallelRequests:num(meta?.parallelRequests),batchesPerMinute:num(meta?.batchesPerMinute,meta?.batchCount),targetRowsPerMinute:num(meta?.targetRowsPerMinute),scannedCount:num(meta?.scannedCount),fullMasterCycleMinutes:num(meta?.fullMasterCycleMinutes),maxCoverageMinutesTarget:num(meta?.maxCoverageMinutesTarget),coreCycleMinutes:num(meta?.coreCycleMinutes),tailCycleMinutes:num(meta?.tailCycleMinutes),sourceBackoff:Boolean(meta?.sourceBackoff),throttleCount:num(meta?.throttleCount),lastError:meta?.lastError||null};
 const old=previous?.fastHelper;return old&&isFreshWideSweep(old.updatedAt)?old:null;
}
function watchFrom(entries,meta={},previous=null){
 const previousCandidates=previous&&isFreshWideSweep(previous.updatedAt)?arr(previous.candidates):[];
 // Fast-Radar und Haupt-C#-Agent duerfen denselben Pool fuettern. Die Utility
 // verwirft pro Symbol alte Beobachtungen und priorisiert danach Dips/Momentum.
 const candidates=normalizeWideSweepEntries([...arr(entries),...previousCandidates]);
 const fastHelper=helperMeta(meta,previous),effectiveCycle=fastHelper?.fullMasterCycleMinutes>0?fastHelper.fullMasterCycleMinutes:num(meta?.fullMasterCycleMinutes,Math.max(num(meta?.coreCycleMinutes),num(meta?.tailCycleMinutes)));
 return{version:4,updatedAt:new Date().toISOString(),candidateCount:candidates.length,target:WIDE_SWEEP_TARGET,mode:fastHelper?'WINDOWS_PC_HYBRID_FAST_WIDE_SWEEP':'WINDOWS_PC_WIDE_SWEEP',profile:fastHelper?'CSHARP_PLUS_FAST_RADAR':String(meta?.profile||previous?.profile||'STANDARD_WIDE_SWEEP').slice(0,60),candidates,masterCount:num(meta?.masterCount,previous?.masterCount),scannedCount:num(meta?.scannedCount),cycleMinutes:num(meta?.cycleMinutes,effectiveCycle),batchCount:num(meta?.batchCount),coreCount:num(meta?.coreCount,previous?.coreCount),coreCycleMinutes:num(meta?.coreCycleMinutes,previous?.coreCycleMinutes),tailCount:num(meta?.tailCount,previous?.tailCount),tailCycleMinutes:num(meta?.tailCycleMinutes,previous?.tailCycleMinutes),fullMasterCycleMinutes:effectiveCycle,maxCoverageMinutesTarget:num(meta?.maxCoverageMinutesTarget,fastHelper?.maxCoverageMinutesTarget||previous?.maxCoverageMinutesTarget),tailBatchesPerMinute:num(meta?.tailBatchesPerMinute,previous?.tailBatchesPerMinute),hotEveryMinutes:num(meta?.hotEveryMinutes,1),warmEveryMinutes:num(meta?.warmEveryMinutes,1),quietCoreEveryMinutes:num(meta?.quietCoreEveryMinutes,meta?.coreCycleMinutes||previous?.quietCoreEveryMinutes),parallelRequests:num(meta?.parallelRequests,fastHelper?.parallelRequests),batchesPerMinute:num(meta?.batchesPerMinute,fastHelper?.batchesPerMinute),targetRowsPerMinute:num(meta?.targetRowsPerMinute,fastHelper?.targetRowsPerMinute),adaptiveConcurrency:Boolean(meta?.adaptiveConcurrency||fastHelper),sourceBackoff:Boolean(meta?.sourceBackoff),pausedUntil:meta?.pausedUntil||null,lastError:meta?.lastError||null,fastHelper,confirmationRequired:true,forcedBuy:false,notice:'PC-Volluniversum-Sweep ist nur Discovery. Auffaellige Werte muessen danach die komplette Live-/Safety-/News-/Anti-Chase-/Venue-Pruefung bestehen.'};
}

export class MarketPortfolio extends BasePortfolio{
 constructor(ctx,env){
  super(ctx,env);this.ctx=ctx;this.env=env;
  const assets=this.zeroAssets;
  if(assets?.fetch&&!assets.__pcWideSweepOverlay){
   assets.__pcWideSweepOverlay=true;
   const baseFetch=assets.fetch.bind(assets);
   assets.fetch=async(request,init)=>{
    const r=await baseFetch(request,init);let u;try{u=new URL(typeof request==='string'?request:request.url)}catch{return r}
    if(!u.pathname.endsWith('/universe.json')||!r.ok)return r;
    let data;try{data=await r.json()}catch{return r}
    const watch=this._readWideSweep();if(!watch||!isFreshWideSweep(watch.updatedAt)||!arr(watch.candidates).length)return Response.json(data,{headers:{'cache-control':'no-store'}});
    let raw=null;try{raw=await assets._load?.()}catch{}
    const rows=arr(raw?.equities).filter(x=>x?.symbol),index=masterIndex(rows),seen=new Set(arr(data?.equities).map(x=>key(x?.symbol))),extras=[];
    for(const c of arr(watch.candidates)){
     if(extras.length>=WIDE_SWEEP_TARGET)break;
     const row=resolve(c.symbol,index),s=key(row?.symbol);if(!row||!s||seen.has(s)||isBlockedWideSweepSymbol(s)||!liquidEnough(row))continue;
     seen.add(s);extras.push({...row,pcWideSweep:true,pcWideScore:num(c.wideScore),pcWideM5Pct:num(c.m5Pct),pcWideM20Pct:num(c.m20Pct),pcWideAccelerationPct:num(c.accelerationPct),pcWideSessionPct:num(c.sessionPct),pcWideObservedAt:c.observedAt});
    }
    return Response.json({...data,equities:[...arr(data?.equities),...extras],pc_wide_sweep_count:extras.length,pc_wide_sweep_target:WIDE_SWEEP_TARGET,scanner_slice_equity_count:arr(data?.equities).length+extras.length,scanner_mode:`${data?.scanner_mode||'LEADERS'}+PC_WIDE_SWEEP`},{headers:{'cache-control':'no-store'}});
   };
   if(this.engine?.env)this.engine.env.ASSETS=assets;
  }
 }
 _readWideSweep(){
  const s=this.bucketAdapter?.peekState?.()?.pcWideSweep;if(s)return s;
  try{return this.ctx?.storage?.kv?.get(WIDE_STATE_KEY)||null}catch{return null}
 }
 async _storeWideSweep(watch){
  try{this.ctx?.storage?.kv?.put(WIDE_STATE_KEY,watch)}catch{}
  if(this.engine?.store?.update)try{await this.engine.store.update(s=>{s.pcWideSweep=watch;return true})}catch{}
  return watch;
 }
 async _acceptWideSweep(entries,meta={}){
  const watch=watchFrom(entries,meta,this._readWideSweep());
  return this._storeWideSweep(watch);
 }
 async agentPrefetch(payload={}){
  let watch=null;if(Array.isArray(payload?.wideSweepEntries))watch=await this._acceptWideSweep(payload.wideSweepEntries,payload?.wideSweepMeta||{});
  // Ein separater lokaler Fast-Radar darf nur Discovery-Kennzahlen nachliefern.
  // Er darf weder Leader/Future-Prefetch noch den Heartbeat des Haupt-C#-Agenten
  // ueberschreiben und loest auch keinen zusaetzlichen Trade-Scan aus.
  if(payload?.wideSweepOnly===true)return{ok:true,agent:'WINDOWS_PC_FAST_WIDE_RADAR',prefetch:{wideSweepCandidates:num(watch?.candidateCount),updatedAt:watch?.updatedAt||null,fastHelper:watch?.fastHelper||null}};
  const result=await super.agentPrefetch(payload);
  if(watch&&result&&typeof result==='object')result.prefetch={...(result.prefetch||{}),wideSweepCandidates:watch.candidateCount};
  return result;
 }
 async scanFromAgent(payload={}){
  if(Array.isArray(payload?.wideSweepEntries))await this._acceptWideSweep(payload.wideSweepEntries,payload?.wideSweepMeta||{});
  return super.scanFromAgent(payload);
 }
 async status(){
  const s=await super.status(),watch=this._readWideSweep(),isFresh=Boolean(watch&&isFreshWideSweep(watch.updatedAt)),fast=watch?.fastHelper&&isFreshWideSweep(watch.fastHelper.updatedAt)?watch.fastHelper:null;
  s.pcWideSweep={enabled:true,target:WIDE_SWEEP_TARGET,candidateCount:isFresh?num(watch?.candidateCount):0,updatedAt:watch?.updatedAt||null,fresh:isFresh,source:watch?.mode||'WAITING_FOR_PC_AGENT',profile:watch?.profile||null,masterCount:num(watch?.masterCount),scannedCount:num(watch?.scannedCount),cycleMinutes:num(watch?.cycleMinutes),batchCount:num(watch?.batchCount),coreCount:num(watch?.coreCount),coreCycleMinutes:num(watch?.coreCycleMinutes),tailCount:num(watch?.tailCount),tailCycleMinutes:num(watch?.tailCycleMinutes),fullMasterCycleMinutes:num(watch?.fullMasterCycleMinutes,Math.max(num(watch?.coreCycleMinutes),num(watch?.tailCycleMinutes))),maxCoverageMinutesTarget:num(watch?.maxCoverageMinutesTarget),tailBatchesPerMinute:num(watch?.tailBatchesPerMinute),hotEveryMinutes:num(watch?.hotEveryMinutes,1),warmEveryMinutes:num(watch?.warmEveryMinutes,1),quietCoreEveryMinutes:num(watch?.quietCoreEveryMinutes,watch?.coreCycleMinutes),parallelRequests:num(watch?.parallelRequests),batchesPerMinute:num(watch?.batchesPerMinute),targetRowsPerMinute:num(watch?.targetRowsPerMinute),adaptiveConcurrency:Boolean(watch?.adaptiveConcurrency),fastHelper:fast,sourceBackoff:Boolean(watch?.sourceBackoff),pausedUntil:watch?.pausedUntil||null,lastError:watch?.lastError||null,confirmationRequired:true,forcedBuy:false,mode:'Windows-PC scannt das handelbare Aktien-Master dynamisch. Haupt-C#-Agent und optionaler Fast-Radar werden frisch zusammengefuehrt; HOT/Dips bleiben priorisiert und nur Auffaelligkeiten gehen in Cloudflare-Deep/Safety.'};
  if(s.pcAgent)s.pcAgent={...s.pcAgent,wideSweepCandidates:s.pcWideSweep.candidateCount,wideSweepFresh:isFresh,wideSweepMasterCount:num(watch?.masterCount),wideSweepScannedCount:num(watch?.scannedCount),wideSweepCoreCycleMinutes:num(watch?.coreCycleMinutes),wideSweepTailCycleMinutes:num(watch?.tailCycleMinutes),wideSweepFullMasterCycleMinutes:num(watch?.fullMasterCycleMinutes,Math.max(num(watch?.coreCycleMinutes),num(watch?.tailCycleMinutes))),wideSweepMaxCoverageTargetMinutes:num(watch?.maxCoverageMinutesTarget),wideSweepTailBatchesPerMinute:num(watch?.tailBatchesPerMinute),fastWideRadar:Boolean(fast),fastWideParallelRequests:num(fast?.parallelRequests),fastWideBatchesPerMinute:num(fast?.batchesPerMinute),fastWideTargetRowsPerMinute:num(fast?.targetRowsPerMinute)};
  if(s.profitOptimizer)s.profitOptimizer={...s.profitOptimizer,pcWideUniverseSweep:true,wideSweepNeverForcesBuy:true,fullMasterCoverageTracked:true,hybridFastWideRadar:Boolean(fast)};
  if(s.freeTierBudget)s.freeTierBudget={...s.freeTierBudget,pcWideSweep:true,pcWideSweepTarget:WIDE_SWEEP_TARGET,note:`${s.freeTierBudget.note||''} Windows-PC durchsucht zusaetzlich das Volluniversum dynamisch in Kurs-Batches. Der Haupt-C#-Agent bleibt aktiv; ein Fast-Radar kann parallel weitere frische Dips/HOT-Werte zuliefern, ohne einen zweiten Trade-Scan auszulösen. Nur die bis zu ${WIDE_SWEEP_TARGET} auffaelligsten Werte werden in die teure Cloudflare-Entscheidung hochgezogen.`};
  return s;
 }
}
