import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v287-calibrated-breadth.js';

const PC_KEY='state/pc-first-scanner-v288';
const BROAD_KEY='cache/v287-broad-leaders';
const PC_TTL_MS=180*1000;
const PC_POOL_TARGET=60;
const CF_VALIDATION_TARGET=18;
const CF_FORWARD_RESERVE=4;
const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();
const base=v=>key(v).split('.')[0];
const fresh=(ts,ttl=PC_TTL_MS)=>{const t=Date.parse(String(ts||''));return Number.isFinite(t)&&Date.now()-t>=0&&Date.now()-t<ttl};

function normalizeCandidate(x={}){
  return{
    symbol:key(x),name:String(x?.name||'').slice(0,120),
    pcPreScore:+Math.max(0,Math.min(100,num(x?.pcPreScore,x?.preScore))).toFixed(1),
    pcDeepScore:+Math.max(0,Math.min(100,num(x?.pcDeepScore,x?.deepScore))).toFixed(1),
    price:+Math.max(0,num(x?.price)).toFixed(6),day:+num(x?.day,x?.dayPct).toFixed(3),
    momentum20:+num(x?.momentum20,x?.momentum20Pct).toFixed(3),momentum5:+num(x?.momentum5,x?.momentum5Pct).toFixed(3),
    momentumAcceleration5:+num(x?.momentumAcceleration5,x?.acceleration5Pct).toFixed(3),confidence:+Math.max(0,Math.min(1,num(x?.confidence,.5))).toFixed(3),
    quoteAgeMinutes:Number.isFinite(Number(x?.quoteAgeMinutes))?+Number(x.quoteAgeMinutes).toFixed(1):null,stale:Boolean(x?.stale),rank:Math.max(1,Math.round(num(x?.rank,999)))
  }
}
export function normalizePcFirstScanV288(input={}){
  const candidates=arr(input?.candidates).map(normalizeCandidate).filter(x=>x.symbol).sort((a,b)=>b.pcDeepScore-a.pcDeepScore||b.pcPreScore-a.pcPreScore).slice(0,80);
  return{
    enabled:true,version:28.8,mode:'PC_FIRST_FULL_MASTER',updatedAt:String(input?.updatedAt||input?.lastMinuteRefreshAt||new Date().toISOString()),
    masterUniverseCount:Math.max(0,Math.round(num(input?.masterUniverseCount))),prescannedCount:Math.max(0,Math.round(num(input?.prescannedCount))),validQuoteCount:Math.max(0,Math.round(num(input?.validQuoteCount,input?.prescannedCount))),
    stage2Count:Math.max(0,Math.round(num(input?.stage2Count))),deepCount:Math.max(0,Math.round(num(input?.deepCount))),finalistCount:candidates.length,
    shardIndex:Math.max(0,Math.round(num(input?.shardIndex))),shardCount:Math.max(1,Math.round(num(input?.shardCount,4))),fullCycleCoveragePct:+Math.max(0,Math.min(100,num(input?.fullCycleCoveragePct))).toFixed(1),targetFullCycleMinutes:Math.max(1,Math.round(num(input?.targetFullCycleMinutes,4))),
    lastFullSweepAt:input?.lastFullSweepAt||null,lastMinuteRefreshAt:input?.lastMinuteRefreshAt||input?.updatedAt||null,batchRequests:Math.max(0,Math.round(num(input?.batchRequests))),batchErrors:Math.max(0,Math.round(num(input?.batchErrors))),source:String(input?.source||'Windows PC · Yahoo batch spark').slice(0,160),candidates
  }
}
function masterIndex(rows){
  const exact=new Map(),byBase=new Map();for(const r of rows){const s=key(r);if(!s)continue;exact.set(s,r);const b=base(s),a=byBase.get(b)||[];a.push(r);byBase.set(b,a)}
  const pref=r=>{const s=key(r);if(s.endsWith('.DE'))return 0;if(s.endsWith('.F'))return 1;if(s.endsWith('.SG'))return 2;if(!s.includes('.'))return 3;return 4};
  for(const a of byBase.values())a.sort((x,y)=>pref(x)-pref(y)||num(y?.marketCapUSD||y?.marketCap)-num(x?.marketCapUSD||x?.marketCap));return{exact,byBase}
}
function resolve(symbol,index){const s=key(symbol),a=index.byBase.get(base(s))||[];return index.exact.get(s)||a[0]||null}
export function buildPcFirstBroadPoolV288(pc,rows){
  const index=masterIndex(rows),pool=[],seen=new Set();for(const c of arr(pc?.candidates)){const row=resolve(c.symbol,index),s=key(row);if(!row||!s||seen.has(s))continue;seen.add(s);pool.push({...row,broadLeaderRank:pool.length+1,broadLeaderScore:+(c.pcDeepScore/10).toFixed(3),broadLeaderSources:['PC-FIRST-V28.8'],pcPreScore:c.pcPreScore,pcDeepScore:c.pcDeepScore,pcQuoteAgeMinutes:c.quoteAgeMinutes,pcStale:c.stale});if(pool.length>=PC_POOL_TARGET)break}
  return{version:28.8,updatedAt:pc.updatedAt,target:PC_POOL_TARGET,pool,resolved:pool.length,sourceBreadth:1,mode:'PC_FIRST_FULL_MASTER_TOP60'}
}
export function trimPcFirstValidationSliceV288(data,state){
  const rows=arr(data?.equities),heldSet=new Set(arr(state?.positions).map(p=>key(p))),held=[],forward=[],normal=[];for(const r of rows){const s=key(r);if(!s)continue;if(heldSet.has(s))held.push(r);else if(r?.forwardWatch)forward.push(r);else normal.push(r)}
  const chosen=[...normal.slice(0,CF_VALIDATION_TARGET),...forward.slice(0,CF_FORWARD_RESERVE),...held],seen=new Set(),equities=[];for(const r of chosen){const s=key(r);if(s&&!seen.has(s)){seen.add(s);equities.push(r)}}
  return{...data,equities,scanner_slice_equity_count:equities.length,pcFirstCloudflareValidationSlice:true,pcFirstValidationTarget:CF_VALIDATION_TARGET,scanner_mode:'V288_PC_FIRST_FINAL_VALIDATION'}
}

export class MarketPortfolio extends BasePortfolio{
  constructor(ctx,env){
    super(ctx,env);this.ctx=ctx;this.env=env;
    const assets=this.zeroAssets;if(assets?.fetch&&!assets.__v288PcFirstTrim){assets.__v288PcFirstTrim=true;const baseFetch=assets.fetch.bind(assets);assets.fetch=async(request,init)=>{
      const response=await baseFetch(request,init);let u;try{u=new URL(typeof request==='string'?request:request.url)}catch{return response}if(!u.pathname.endsWith('/universe.json')||!response.ok)return response;
      let pc=null;try{pc=this.ctx?.storage?.kv?.get(PC_KEY)||null}catch{}if(!pc||!fresh(pc.updatedAt))return response;const fallback=response.clone();let data;try{data=await response.json()}catch{return fallback}
      return Response.json(trimPcFirstValidationSliceV288(data,this.bucketAdapter?.peekState?.()||{}),{headers:{'cache-control':'no-store'}})
    };if(this.engine?.env)this.engine.env.ASSETS=assets}
  }
  async agentPrefetch(payload={}){
    const result=await super.agentPrefetch(payload),rawPc=payload?.pcFirstScan;if(!rawPc)return result;
    try{const pc=normalizePcFirstScanV288(rawPc);this.ctx?.storage?.kv?.put(PC_KEY,pc);let raw=null;try{raw=await this.zeroAssets?._load?.()}catch{}const rows=arr(raw?.equities).filter(x=>x?.symbol),broad=buildPcFirstBroadPoolV288(pc,rows);if(broad.pool.length>=12)this.ctx?.storage?.kv?.put(BROAD_KEY,broad);return{...result,pcFirstScanner:{ok:true,version:28.8,masterUniverseCount:pc.masterUniverseCount,prescannedCount:pc.prescannedCount,finalistCount:pc.finalistCount,broadPoolSize:broad.pool.length,coveragePct:pc.fullCycleCoveragePct}}}
    catch(e){console.error('V28.8 PC-first prefetch failed',e);return{...result,pcFirstScanner:{ok:false,error:String(e?.message||e)}}}
  }
  async status(){
    const s=await super.status();let pc=null;try{pc=this.ctx?.storage?.kv?.get(PC_KEY)||null}catch{}const online=Boolean(s?.pcAgent?.online),pcFresh=Boolean(pc&&fresh(pc.updatedAt)),age=pc?.updatedAt?Math.max(0,Math.round((Date.now()-Date.parse(pc.updatedAt))/1000)):null;
    s.pcFirstScannerPolicy={enabled:true,version:28.8,mode:'PC-FIRST: voller Aktien-Master auf Heim-PC → rolling Voll-Vorscan → Top 400 → Deep 120 → Finalisten 60 → Cloudflare validiert nur kleinen Final-Slice',masterUniverseCount:num(pc?.masterUniverseCount),prescannedCount:num(pc?.prescannedCount),validQuoteCount:num(pc?.validQuoteCount),stage2Count:num(pc?.stage2Count),deepCount:num(pc?.deepCount),finalistCount:num(pc?.finalistCount),fullCycleCoveragePct:num(pc?.fullCycleCoveragePct),targetFullCycleMinutes:num(pc?.targetFullCycleMinutes,4),lastFullSweepAt:pc?.lastFullSweepAt||null,lastMinuteRefreshAt:pc?.lastMinuteRefreshAt||null,pcDataAgeSeconds:age,pcAgentOnline:online,pcDataFresh:pcFresh,cloudflareFallbackActive:!(online&&pcFresh),cloudflareValidationTarget:CF_VALIDATION_TARGET,cloudflareForwardReserve:CF_FORWARD_RESERVE,batchRequestsLastMinute:num(pc?.batchRequests),batchErrorsLastMinute:num(pc?.batchErrors),topPcCandidates:arr(pc?.candidates).slice(0,12),rule:'Cloudflare scannt den 8k+-Master nicht selbst. Solange frische PC-Daten vorliegen, übernimmt der Heim-PC die breite Suche; Cloudflare prüft nur Finalisten, Positionen, Safety, Kosten und Paper-Ausführung. Bei PC-Ausfall fällt das System automatisch auf V28.7 zurück.'};
    s.scannerBreadthPolicy={...(s.scannerBreadthPolicy||{}),version:28.8,pcFirstFullMaster:true,pcMasterUniverseCount:num(pc?.masterUniverseCount),pcPrescannedCount:num(pc?.prescannedCount),pcFinalistCount:num(pc?.finalistCount),pcFullCycleCoveragePct:num(pc?.fullCycleCoveragePct),cloudflareValidationTarget:CF_VALIDATION_TARGET,cloudflareFallbackActive:!(online&&pcFresh),mode:online&&pcFresh?'V28.8 PC-first full master + Cloudflare final validation':'V28.7 Cloudflare rotating fallback'};
    if(s?.finalDecisionPolicy)s.finalDecisionPolicy={...s.finalDecisionPolicy,version:28.8,calibratedActionScoreVersion:28.7,pcFirstScannerV288:true,rule:`${s.finalDecisionPolicy.rule||''} V28.8 erweitert die Suche auf den gesamten PC-vorgescannten Aktien-Master; die finale Kauf/Verkauf-Entscheidung bleibt bei den kalibrierten Scores und Safety-Guards.`};
    if(s?.executionModel)s.executionModel={...s.executionModel,pcFirstFullUniverseV288:true,cloudflareFinalValidationOnlyWhenPcFresh:true};
    if(s?.freeTierBudget)s.freeTierBudget={...s.freeTierBudget,pcFirstFullUniverse:true,pcMasterCycleMinutes:num(pc?.targetFullCycleMinutes,4),cloudflareValidationTarget:CF_VALIDATION_TARGET,cloudflareHeavyScanAvoidedWhenPcFresh:online&&pcFresh,note:`${s.freeTierBudget.note||''} V28.8 verlagert den breiten Voll-Master-Vorscan auf den Windows-PC; Cloudflare bleibt Finalvalidierung und Fallback.`};return s
  }
}
