import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v287-calibrated-breadth.js';

const PC_KEY='state/pc-first-scanner-v288';
const BROAD_KEY='cache/v287-broad-leaders';
const PC_TTL_MS=180*1000;
const PC_POOL_TARGET=60;
const STAGE2_TARGET=400;
const DEEP_TARGET=120;
const CF_VALIDATION_TARGET=18;
const CF_FORWARD_RESERVE=4;
const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();
const base=v=>key(v).split('.')[0];
const fresh=(ts,ttl=PC_TTL_MS)=>{const t=Date.parse(String(ts||''));return Number.isFinite(t)&&Date.now()-t>=0&&Date.now()-t<ttl};

function normalizeCandidate(x={}){
  return{
    symbol:key(x),name:String(x?.name||'').slice(0,120),
    pcPreScore:+clamp(num(x?.pcPreScore,x?.preScore),0,100).toFixed(1),pcDeepScore:+clamp(num(x?.pcDeepScore,x?.deepScore),0,100).toFixed(1),
    price:+Math.max(0,num(x?.price,x?.last)).toFixed(6),day:+num(x?.day,x?.dayPct??x?.sessionPct).toFixed(3),
    momentum20:+num(x?.momentum20,x?.momentum20Pct??x?.m20Pct).toFixed(3),momentum5:+num(x?.momentum5,x?.momentum5Pct??x?.m5Pct).toFixed(3),
    momentumAcceleration5:+num(x?.momentumAcceleration5,x?.acceleration5Pct??x?.accelerationPct).toFixed(3),confidence:+clamp(num(x?.confidence,.5),0,1).toFixed(3),
    quoteAgeMinutes:Number.isFinite(Number(x?.quoteAgeMinutes))?+Number(x.quoteAgeMinutes).toFixed(1):null,stale:Boolean(x?.stale),rank:Math.max(1,Math.round(num(x?.rank,999))),source:String(x?.source||'PC-FIRST').slice(0,80)
  }
}
export function normalizePcFirstScanV288(input={}){
  const candidates=arr(input?.candidates).map(normalizeCandidate).filter(x=>x.symbol).sort((a,b)=>b.pcDeepScore-a.pcDeepScore||b.pcPreScore-a.pcPreScore).slice(0,80);
  return{
    enabled:true,version:28.8,mode:String(input?.mode||'PC_FIRST_FULL_MASTER'),updatedAt:String(input?.updatedAt||input?.lastMinuteRefreshAt||new Date().toISOString()),
    masterUniverseCount:Math.max(0,Math.round(num(input?.masterUniverseCount))),prescannedCount:Math.max(0,Math.round(num(input?.prescannedCount))),validQuoteCount:Math.max(0,Math.round(num(input?.validQuoteCount,input?.prescannedCount))),
    stage2Count:Math.max(0,Math.round(num(input?.stage2Count))),deepCount:Math.max(0,Math.round(num(input?.deepCount))),finalistCount:candidates.length,
    shardIndex:Math.max(0,Math.round(num(input?.shardIndex))),shardCount:Math.max(1,Math.round(num(input?.shardCount,1))),fullCycleCoveragePct:+clamp(num(input?.fullCycleCoveragePct),0,100).toFixed(1),targetFullCycleMinutes:Math.max(1,Math.round(num(input?.targetFullCycleMinutes,1))),
    lastFullSweepAt:input?.lastFullSweepAt||null,lastMinuteRefreshAt:input?.lastMinuteRefreshAt||input?.updatedAt||null,batchRequests:Math.max(0,Math.round(num(input?.batchRequests))),batchErrors:Math.max(0,Math.round(num(input?.batchErrors))),source:String(input?.source||'Windows PC').slice(0,160),candidates
  }
}
function widePreScore(x={},now=Date.now()){
  const day=num(x?.sessionPct),m5=num(x?.m5Pct),m20=num(x?.m20Pct),acc=num(x?.accelerationPct),wide=num(x?.wideScore),seen=Date.parse(String(x?.observedAt||x?.ts||'')),ageMin=Number.isFinite(seen)?Math.max(0,(now-seen)/60000):null;
  let score=50;score+=clamp(wide*2.1,-8,18)+clamp(m20*4.2,-10,12)+clamp(m5*6.5,-7,9)+clamp(acc*18,-4,6);
  if(day>=0&&day<=6)score+=day*.8;else if(day<0&&day>=-4)score+=Math.max(-4,day*.5);else if(day>=12)score-=16+Math.min(12,(day-12)*.8);else if(day>=8)score-=7;else if(day<-8)score-=8;
  if(ageMin!==null&&ageMin>3)score-=Math.min(14,(ageMin-3)*2.5);
  return{score:+clamp(score,0,100).toFixed(1),ageMin};
}
function wideDeepScore(x={},pre=50){
  const day=num(x?.sessionPct),m5=num(x?.m5Pct),m20=num(x?.m20Pct),acc=num(x?.accelerationPct),wide=num(x?.wideScore);let score=pre*.58+21;
  score+=clamp(wide*1.25,-5,10)+clamp(m20*3.5,-8,10)+clamp(m5*5,-6,8)+clamp(acc*16,-4,6);
  if(day>=12)score-=13+Math.min(12,(day-12)*.85);else if(day>=8)score-=5;
  return +clamp(score,0,100).toFixed(1);
}
export function pcFirstFromWideSweepV288(entries=[],meta={},now=Date.now()){
  const latest=new Map();for(const raw of arr(entries).slice(0,1000)){const symbol=key(raw),last=num(raw?.last);if(!symbol||!(last>0))continue;const t=Date.parse(String(raw?.observedAt||raw?.ts||''));if(Number.isFinite(t)&&(t>now+60_000||now-t>8*60_000))continue;const old=latest.get(symbol),ot=old?Date.parse(String(old?.observedAt||old?.ts||'')):0;if(!old||!Number.isFinite(t)||t>=ot)latest.set(symbol,raw)}
  const staged=[...latest.values()].map(x=>{const p=widePreScore(x,now);return{x,pre:p.score,ageMin:p.ageMin}}).sort((a,b)=>b.pre-a.pre).slice(0,STAGE2_TARGET);
  const deep=staged.slice(0,DEEP_TARGET).map(r=>({...r,deep:wideDeepScore(r.x,r.pre)})).sort((a,b)=>b.deep-a.deep||b.pre-a.pre);
  const deepMap=new Map(deep.map(x=>[key(x.x),x.deep])),final=staged.map(r=>({
    symbol:key(r.x),rank:0,pcPreScore:r.pre,pcDeepScore:deepMap.has(key(r.x))?deepMap.get(key(r.x)):r.pre,price:num(r.x?.last),dayPct:num(r.x?.sessionPct),momentum20Pct:num(r.x?.m20Pct),momentum5Pct:num(r.x?.m5Pct),acceleration5Pct:num(r.x?.accelerationPct),confidence:clamp(.48+(deepMap.has(key(r.x))?deepMap.get(key(r.x)):r.pre)-50,35,90)/100,quoteAgeMinutes:r.ageMin,stale:r.ageMin!==null&&r.ageMin>3,source:'CSHARP-WIDE-SWEEP-V28.8'
  })).sort((a,b)=>b.pcDeepScore-a.pcDeepScore||b.pcPreScore-a.pcPreScore).slice(0,PC_POOL_TARGET).map((x,i)=>({...x,rank:i+1}));
  const master=Math.max(0,Math.round(num(meta?.masterCount))),scanned=Math.max(0,Math.round(num(meta?.scannedCount,master))),coverage=master>0?100*Math.min(master,scanned)/master:0,cycle=Math.max(1,Math.ceil(num(meta?.fullMasterCycleMinutes,meta?.cycleMinutes||1)));
  return normalizePcFirstScanV288({mode:'CSHARP_PC_FIRST_FULL_MASTER',updatedAt:new Date(now).toISOString(),masterUniverseCount:master,prescannedCount:scanned,validQuoteCount:scanned,stage2Count:staged.length,deepCount:deep.length,fullCycleCoveragePct:coverage,targetFullCycleMinutes:cycle,lastFullSweepAt:coverage>=99?new Date(now).toISOString():null,lastMinuteRefreshAt:new Date(now).toISOString(),source:`${String(meta?.profile||'C# SINGLE SUPER SCANNER').slice(0,90)} · existing wideSweepEntries`,candidates:final});
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
  async _storePcFirst(pc){
    if(!pc)return null;try{this.ctx?.storage?.kv?.put(PC_KEY,pc)}catch{}let raw=null;try{raw=await this.zeroAssets?._load?.()}catch{}const rows=arr(raw?.equities).filter(x=>x?.symbol),broad=buildPcFirstBroadPoolV288(pc,rows);if(broad.pool.length>=12)try{this.ctx?.storage?.kv?.put(BROAD_KEY,broad)}catch{}return{pc,broad}
  }
  async _acceptPcFirstPayload(payload={}){
    try{
      if(payload?.pcFirstScan)return this._storePcFirst(normalizePcFirstScanV288(payload.pcFirstScan));
      if(Array.isArray(payload?.wideSweepEntries)&&payload.wideSweepEntries.length){const pc=pcFirstFromWideSweepV288(payload.wideSweepEntries,payload?.wideSweepMeta||{},Date.now());return this._storePcFirst(pc)}
    }catch(e){console.error('V28.8 PC-first ingest failed',e)}return null
  }
  async agentPrefetch(payload={}){
    const staged=await this._acceptPcFirstPayload(payload),result=await super.agentPrefetch(payload);if(!staged)return result;const {pc,broad}=staged;return{...result,pcFirstScanner:{ok:true,version:28.8,source:pc.mode,masterUniverseCount:pc.masterUniverseCount,prescannedCount:pc.prescannedCount,stage2Count:pc.stage2Count,deepCount:pc.deepCount,finalistCount:pc.finalistCount,broadPoolSize:broad?.pool?.length||0,coveragePct:pc.fullCycleCoveragePct}}
  }
  async scanFromAgent(payload={}){await this._acceptPcFirstPayload(payload);return super.scanFromAgent(payload)}
  async status(){
    const s=await super.status();let pc=null;try{pc=this.ctx?.storage?.kv?.get(PC_KEY)||null}catch{}const online=Boolean(s?.pcAgent?.online),pcFresh=Boolean(pc&&fresh(pc.updatedAt)),age=pc?.updatedAt?Math.max(0,Math.round((Date.now()-Date.parse(pc.updatedAt))/1000)):null;
    s.pcFirstScannerPolicy={enabled:true,version:28.8,mode:'PC-FIRST: vorhandener C#-Super-Scanner scannt den kompletten Aktien-Master → Top 400 → Deep 120 → Finalisten 60 → Cloudflare validiert nur kleinen Final-Slice',masterUniverseCount:num(pc?.masterUniverseCount,s?.pcWideSweep?.masterCount),prescannedCount:num(pc?.prescannedCount,s?.pcWideSweep?.scannedCount),validQuoteCount:num(pc?.validQuoteCount,s?.pcWideSweep?.scannedCount),stage2Count:num(pc?.stage2Count),deepCount:num(pc?.deepCount),finalistCount:num(pc?.finalistCount),fullCycleCoveragePct:num(pc?.fullCycleCoveragePct),targetFullCycleMinutes:num(pc?.targetFullCycleMinutes,s?.pcWideSweep?.fullMasterCycleMinutes||1),lastFullSweepAt:pc?.lastFullSweepAt||null,lastMinuteRefreshAt:pc?.lastMinuteRefreshAt||pc?.updatedAt||null,pcDataAgeSeconds:age,pcAgentOnline:online,pcDataFresh:pcFresh,cloudflareFallbackActive:!(online&&pcFresh),cloudflareValidationTarget:CF_VALIDATION_TARGET,cloudflareForwardReserve:CF_FORWARD_RESERVE,batchRequestsLastMinute:num(pc?.batchRequests),batchErrorsLastMinute:num(pc?.batchErrors),topPcCandidates:arr(pc?.candidates).slice(0,12),source:pc?.source||s?.pcWideSweep?.profile||null,usesExistingCsharpWideSweep:Boolean(pc?.mode==='CSHARP_PC_FIRST_FULL_MASTER'),rule:'Der vorhandene C#-Agent bleibt der schnelle Voll-Master-Scanner. V28.8 nutzt dessen bereits gesendete Wide-Sweep-Rohdaten für Top400/Deep120/Final60. Cloudflare prüft nur Finalisten, Positionen, Safety, Kosten und Paper-Ausführung. Bei PC-Ausfall fällt das System automatisch auf V28.7 zurück.'};
    s.scannerBreadthPolicy={...(s.scannerBreadthPolicy||{}),version:28.8,pcFirstFullMaster:true,pcMasterUniverseCount:s.pcFirstScannerPolicy.masterUniverseCount,pcPrescannedCount:s.pcFirstScannerPolicy.prescannedCount,pcFinalistCount:s.pcFirstScannerPolicy.finalistCount,pcFullCycleCoveragePct:s.pcFirstScannerPolicy.fullCycleCoveragePct,cloudflareValidationTarget:CF_VALIDATION_TARGET,cloudflareFallbackActive:!(online&&pcFresh),mode:online&&pcFresh?'V28.8 C# PC-first full master + Cloudflare final validation':'V28.7 Cloudflare rotating fallback'};
    if(s?.finalDecisionPolicy)s.finalDecisionPolicy={...s.finalDecisionPolicy,version:28.8,calibratedActionScoreVersion:28.7,pcFirstScannerV288:true,rule:`${s.finalDecisionPolicy.rule||''} V28.8 erweitert die Suche auf den gesamten PC-vorgescannten Aktien-Master; die finale Kauf/Verkauf-Entscheidung bleibt bei den kalibrierten Scores und Safety-Guards.`};
    if(s?.executionModel)s.executionModel={...s.executionModel,pcFirstFullUniverseV288:true,cloudflareFinalValidationOnlyWhenPcFresh:true};
    if(s?.freeTierBudget)s.freeTierBudget={...s.freeTierBudget,pcFirstFullUniverse:true,pcMasterCycleMinutes:s.pcFirstScannerPolicy.targetFullCycleMinutes,cloudflareValidationTarget:CF_VALIDATION_TARGET,cloudflareHeavyScanAvoidedWhenPcFresh:online&&pcFresh,note:`${s.freeTierBudget.note||''} V28.8 nutzt den bestehenden C#-Volluniversum-Sweep auf dem Windows-PC; Cloudflare bleibt Finalvalidierung und Fallback.`};return s
  }
}
