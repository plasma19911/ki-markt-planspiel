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
function watchFrom(entries,meta={}){
 const candidates=normalizeWideSweepEntries(entries);
 return{version:1,updatedAt:new Date().toISOString(),candidateCount:candidates.length,target:WIDE_SWEEP_TARGET,mode:'WINDOWS_PC_WIDE_SWEEP',candidates,masterCount:num(meta?.masterCount),scannedCount:num(meta?.scannedCount),cycleMinutes:num(meta?.cycleMinutes),batchCount:num(meta?.batchCount),pausedUntil:meta?.pausedUntil||null,lastError:meta?.lastError||null,confirmationRequired:true,forcedBuy:false,notice:'PC-Volluniversum-Sweep ist nur Discovery. Auffaellige Werte muessen danach die komplette Live-/Safety-/News-/Anti-Chase-/Venue-Pruefung bestehen.'};
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
 async scanFromAgent(payload={}){
  if(Array.isArray(payload?.wideSweepEntries))await this._storeWideSweep(watchFrom(payload.wideSweepEntries,payload?.wideSweepMeta||{}));
  return super.scanFromAgent(payload);
 }
 async status(){
  const s=await super.status(),watch=this._readWideSweep(),isFresh=Boolean(watch&&isFreshWideSweep(watch.updatedAt));
  s.pcWideSweep={enabled:true,target:WIDE_SWEEP_TARGET,candidateCount:isFresh?num(watch?.candidateCount):0,updatedAt:watch?.updatedAt||null,fresh:isFresh,source:watch?.mode||'WAITING_FOR_PC_AGENT',masterCount:num(watch?.masterCount),scannedCount:num(watch?.scannedCount),cycleMinutes:num(watch?.cycleMinutes),batchCount:num(watch?.batchCount),pausedUntil:watch?.pausedUntil||null,lastError:watch?.lastError||null,confirmationRequired:true,forcedBuy:false,mode:'Windows-PC scannt das gesamte handelbare Aktien-Master in Batches; nur auffaellige Werte werden fuer Cloudflare-Deep/Safety hochgezogen'};
  if(s.pcAgent)s.pcAgent={...s.pcAgent,wideSweepCandidates:s.pcWideSweep.candidateCount,wideSweepFresh:isFresh,wideSweepMasterCount:num(watch?.masterCount),wideSweepScannedCount:num(watch?.scannedCount)};
  if(s.profitOptimizer)s.profitOptimizer={...s.profitOptimizer,pcWideUniverseSweep:true,wideSweepNeverForcesBuy:true};
  if(s.freeTierBudget)s.freeTierBudget={...s.freeTierBudget,pcWideSweep:true,pcWideSweepTarget:WIDE_SWEEP_TARGET,note:`${s.freeTierBudget.note||''} Windows-PC durchsucht zusaetzlich das Volluniversum in Kurs-Batches. Nur die bis zu ${WIDE_SWEEP_TARGET} auffaelligsten Werte werden in die teure Cloudflare-Entscheidung hochgezogen; dadurch steigt die Abdeckung ohne mehr Deep-Checks zu erzwingen.`};
  return s;
 }
}
