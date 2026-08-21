import {daytradeEntryScoresV301,DAYTRADE_ENTRY_V301} from './daytrade-entry-v301.js';

const REENTRY_KEY='state/score-reentry-v296';
const PC_KEY='state/pc-first-scanner-v288';
const ENTRY_MEM_KEY='state/score-entry-exit-v294';
const EXEC_KEY='state/executed-entry-baseline-v302';
const arr=v=>Array.isArray(v)?v:[];
const finite=v=>Number.isFinite(Number(v));
const num=(v,d=0)=>finite(v)?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();
const read=(storage,k,d)=>{try{return storage?.kv?.get(k)||d}catch{return d}};
const write=(storage,k,v)=>{try{storage?.kv?.put(k,v)}catch{}};

export const DAYTRADE_LIVE_FEEDBACK_V302={
  version:30.2,
  immediateBuyMin:56,
  maxOpenPositions:4,
  maxSinglePositionPctOfEquity:25,
  maxTargetCashDeploymentPct:90,
  highChaseExtraPenalty:-10,
  weakDipExtraPenalty:-2,
  pendingBaselineTtlMinutes:20
};

function enrichWithPcFast(state={},storage=null){
  const pc=read(storage,PC_KEY,null),pm=new Map(arr(pc?.candidates).map(x=>[key(x),x]));
  if(!pm.size)return state;
  return{...state,candidates:arr(state?.candidates).map(c=>{const p=pm.get(key(c));if(!p)return c;return{...c,
    momentum5Pct:finite(p?.momentum5)?Number(p.momentum5):c?.momentum5Pct,
    momentum20Pct:finite(p?.momentum20)?Number(p.momentum20):c?.momentum20Pct,
    acceleration5Pct:finite(p?.momentumAcceleration5)?Number(p.momentumAcceleration5):c?.acceleration5Pct,
    quoteAgeMinutes:finite(p?.quoteAgeMinutes)?Number(p.quoteAgeMinutes):c?.quoteAgeMinutes,
    stale:Boolean(p?.stale??c?.stale),pcPreScore:p?.pcPreScore,pcDeepScore:p?.pcDeepScore,pcFastSource:p?.source||pc?.source||null};
  })};
}

export function daytradeLiveScoresV302(state={},storage=null,now=Date.now()){
  const enriched=enrichWithPcFast(state,storage),base=daytradeEntryScoresV301(enriched,storage,now),ranking=[];
  for(const row of arr(base.ranking)){
    let extra=0,feedback='NONE';
    if(row?.dipLabel==='HIGH_CHASE'){extra+=DAYTRADE_LIVE_FEEDBACK_V302.highChaseExtraPenalty;feedback='HIGH_CHASE_LIVE_FIX'}
    else if(row?.dipLabel==='WEAK_DIP'){extra+=DAYTRADE_LIVE_FEEDBACK_V302.weakDipExtraPenalty;feedback='WEAK_DIP_LIVE_FIX'}
    const before=clamp(row.daytradeEntryScore??row.decisionScore,0,100),score=clamp(before+extra,0,100);
    ranking.push({...row,preLiveFeedbackScore:+before.toFixed(1),liveFeedbackScorePoints:extra,liveFeedbackLabel:feedback,decisionScore:+score.toFixed(1),buyScore:+score.toFixed(1),fusionScore:+score.toFixed(1),holdScore:+score.toFixed(1),sellScore:+(100-score).toFixed(1),daytradeLiveScore:+score.toFixed(1),decisionScoreVersion:30.2});
  }
  ranking.sort((a,b)=>b.daytradeLiveScore-a.daytradeLiveScore||b.timingQuality-a.timingQuality||b.dipQuality-a.dipQuality||num(b.marketCapUSD)-num(a.marketCapUSD));
  return{version:30.2,ranking,base,enriched};
}

export function daytradeAllocationV302({selectedCount=1,rank=1,score=56,dipQuality=.5,timingQuality=.5}={}){
  const n=Math.max(1,Math.min(4,Math.round(num(selectedCount,1)))),r=Math.max(1,Math.min(n,Math.round(num(rank,1))));
  const table=n===4?[25,24,22,19]:n===3?[25,25,25]:n===2?[25,25]:[25];
  let pct=table[r-1]||25;
  const q=clamp((num(dipQuality,.5)+num(timingQuality,.5))/2,0,1),s=num(score,56);
  if(s<62)pct*=.86;else if(s<68)pct*=.94;
  pct*=.90+.10*q;
  return +clamp(pct,10,DAYTRADE_LIVE_FEEDBACK_V302.maxSinglePositionPctOfEquity).toFixed(2);
}

function scoreFromBuyReason(reason=''){
  const text=String(reason||''),matches=[...text.matchAll(/=\s*(\d{1,3}(?:[.,]\d+)?)\s*\/100/gi)];
  if(matches.length){const v=Number(matches.at(-1)[1].replace(',','.'));if(finite(v)&&v>=0&&v<=100)return v}
  const m=text.match(/DecisionScore\s+(\d{1,3}(?:[.,]\d+)?)/i);if(m){const v=Number(m[1].replace(',','.'));if(finite(v)&&v>=0&&v<=100)return v}
  return NaN;
}
function openedMs(p={}){const t=Date.parse(String(p?.opened_at??p?.openedAt??''));return Number.isFinite(t)?t:0}
function historyBuyScore(state={},symbol=''){
  const s=key(symbol);for(const h of [...arr(state?.history)].reverse()){
    if(key(h)!==s||String(h?.action||'').toUpperCase()!=='KAUF')continue;const v=scoreFromBuyReason(h?.reason);if(finite(v))return{score:v,at:Date.parse(String(h?.ts||''))||0,source:'TRADE_HISTORY_REASON'};
  }return null;
}

export function repairExecutedEntryBaselinesV302(state={},storage=null,now=Date.now()){
  const exec={version:30.2,pending:{},confirmed:{},stats:{},...(read(storage,EXEC_KEY,{})||{})};exec.pending={...(exec.pending||{})};exec.confirmed={...(exec.confirmed||{})};exec.stats={repaired:0,historyRecovered:0,pendingConfirmed:0,...(exec.stats||{})};
  const mem={...(read(storage,ENTRY_MEM_KEY,{})||{})};mem.entries={...(mem.entries||{})};
  const held=new Set(arr(state?.positions).map(key).filter(Boolean)),corrected=[];
  for(const p of arr(state?.positions)){
    const s=key(p);if(!s)continue;const opened=openedMs(p),pending=exec.pending[s],hist=historyBuyScore(state,s);let source=null;
    if(pending&&finite(pending.score)&&(!opened||Math.abs(opened-num(pending.at,opened))<=10*60_000))source={score:num(pending.score),at:num(pending.at),source:'PENDING_FINAL_ACTION'};
    else if(hist)source=hist;
    if(!source||!finite(source.score))continue;
    const old=mem.entries[s],entryPrice=num(p?.entry_price,p?.entryPrice),lastPrice=num(p?.last_price,entryPrice);
    const oldScore=finite(old?.score)?num(old.score):NaN;
    if(!old||Math.abs(num(oldScore,source.score)-source.score)>.05||old?.executionBaselineFixedV302!==true){
      mem.entries[s]={...(old||{}),score:+source.score.toFixed(1),lastStable:finite(old?.lastStable)?num(old.lastStable):+source.score.toFixed(1),entryPrice:num(old?.entryPrice,entryPrice),lastPrice:num(old?.lastPrice,lastPrice),at:num(old?.at,opened||source.at||now),lastAt:now,source:'CONFIRMED_POSITION_BASELINE',seedSource:'V30.2_EXECUTED_FINAL_DECISION',fullSeen:Boolean(old?.fullSeen),executionBaselineFixedV302:true,executionBaselinePreviousScore:finite(oldScore)?+oldScore.toFixed(1):null,executionBaselineSource:source.source,correctedAt:now};
      corrected.push(s);exec.stats.repaired++;if(source.source==='TRADE_HISTORY_REASON')exec.stats.historyRecovered++;else exec.stats.pendingConfirmed++;
    }
    exec.confirmed[s]={score:+source.score.toFixed(1),at:opened||source.at||now,source:source.source};delete exec.pending[s];
  }
  const ttl=DAYTRADE_LIVE_FEEDBACK_V302.pendingBaselineTtlMinutes*60_000;for(const [s,p] of Object.entries(exec.pending))if(held.has(s)||now-num(p?.at,0)>ttl)delete exec.pending[s];
  for(const s of Object.keys(exec.confirmed))if(!held.has(s)&&now-num(exec.confirmed[s]?.at,0)>24*60*60_000)delete exec.confirmed[s];
  mem.updatedAt=new Date(now).toISOString();exec.updatedAt=new Date(now).toISOString();write(storage,ENTRY_MEM_KEY,mem);write(storage,EXEC_KEY,exec);
  return{corrected,mem,exec};
}

function rememberPendingBaseline(storage,row,now){
  const exec={version:30.2,pending:{},confirmed:{},stats:{},...(read(storage,EXEC_KEY,{})||{})};exec.pending={...(exec.pending||{})};exec.confirmed={...(exec.confirmed||{})};exec.stats={...(exec.stats||{})};exec.pending[row.symbol]={score:+num(row.daytradeLiveScore).toFixed(1),at:now,dipLabel:row.dipLabel,timingLabel:row.timingLabel,source:'V30.2_FINAL_BUY_ACTION'};exec.updatedAt=new Date(now).toISOString();write(storage,EXEC_KEY,exec);
}
function parsePlan(r){const raw=String(r?.response||r?.result?.response||''),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j?.actions)?j:null}catch{return null}}
function encode(r,plan){const raw=JSON.stringify(plan);if(r&&typeof r==='object'&&r.result&&typeof r.result==='object'&&'response'in r.result)return{...r,result:{...r.result,response:raw}};if(r&&typeof r==='object'&&'response'in r)return{...r,response:raw};return{response:raw}}
function isTradingPlanInput(input){return Boolean(input&&typeof input==='object'&&arr(input?.messages).some(m=>{const t=String(m?.content||'');return t.includes('Kandidaten=')&&t.includes(' Gehalten=')}))}
function isBaselineDependentSell(a={}){const r=String(a?.reason||'');return Boolean(a?.scoreExitV294||a?.profitExitV297||/SCORE-EXIT|PROFIT.*SELL|Gewinn-SELL/i.test(r))&&!/HARD-EVENT|TERMINAL|INSOLVENZ|DELIST|HANDELSSTOPP/i.test(r)}

export function enforceDaytradeLiveFeedbackV302(plan,state={},storage=null,now=Date.now()){
  if(!plan||!Array.isArray(plan.actions))return{plan,counters:{}};
  const repair=repairExecutedEntryBaselinesV302(state,storage,now),corrected=new Set(repair.corrected),scored=daytradeLiveScoresV302(state,storage,now),cmap=new Map(arr(scored.enriched?.candidates).map(c=>[key(c),c])),held=new Set(arr(state?.positions).map(key).filter(Boolean)),re=read(storage,REENTRY_KEY,{locks:{}})||{locks:{}};
  const actions=plan.actions.map(a=>({...a})),idx=new Map();actions.forEach((a,i)=>{const s=key(a);if(s&&!idx.has(s))idx.set(s,i)});
  const counters={selectedBuys:0,chasesSuppressed:0,riskCappedBuys:0,baselinesRepaired:repair.corrected.length,baselineSellsDeferred:0,pcFastRowsUsed:0};

  for(let i=0;i<actions.length;i++){
    const a=actions[i],s=key(a);if(corrected.has(s)&&String(a?.action||'').toUpperCase()==='SELL'&&isBaselineDependentSell(a)){
      actions[i]={...a,action:'HOLD',allocation_pct:0,baselineRepairV302:true,reason:`V30.2 BASELINE-FIX: ${s} ausgeführter Einstiegsscore wurde aus dem echten Kauf-Decision/Trade-Log repariert. Baseline-abhängiger SELL wird in diesem Scan ausgesetzt und im nächsten Scan mit korrekter Basis neu bewertet.`};counters.baselineSellsDeferred++;
    }
  }

  const plannedSells=new Set(actions.filter(a=>String(a?.action||'').toUpperCase()==='SELL'&&held.has(key(a))).map(key));
  const effectiveHeld=Math.max(0,held.size-plannedSells.size),slots=Math.max(0,DAYTRADE_LIVE_FEEDBACK_V302.maxOpenPositions-effectiveHeld);
  const eligible=scored.ranking.filter(r=>!held.has(r.symbol)&&!r.hardBlocked&&!re?.locks?.[r.symbol]&&r.daytradeLiveScore>=DAYTRADE_LIVE_FEEDBACK_V302.immediateBuyMin);
  const selected=eligible.slice(0,slots),selectedSet=new Set(selected.map(r=>r.symbol));

  for(let i=0;i<actions.length;i++){
    const a=actions[i],s=key(a);if(!s||held.has(s)||String(a?.action||'').toUpperCase()!=='BUY')continue;const row=scored.ranking.find(r=>r.symbol===s);
    if(!row||!selectedSet.has(s)){
      actions[i]={...a,action:'HOLD',allocation_pct:0,daytradeLiveFeedbackV302:true,reason:`V30.2 DAYTRADE-HOLD: ${s} ${row?`finaler Score ${row.daytradeLiveScore.toFixed(1)} · ${row.dipLabel} · ${row.timingLabel}`:'ohne aktuellen V30.2-Score'}. HIGH_CHASE und schwaches Timing senken den DecisionScore selbst; BUY-Schwelle bleibt 56.`};if(row?.dipLabel==='HIGH_CHASE')counters.chasesSuppressed++;
    }
  }

  selected.forEach((row,rankIndex)=>{
    const s=row.symbol,c=cmap.get(s)||{},existing=idx.get(s),pct=daytradeAllocationV302({selectedCount:selected.length,rank:rankIndex+1,score:row.daytradeLiveScore,dipQuality:row.dipQuality,timingQuality:row.timingQuality});
    const oldPct=existing===undefined?0:num(actions[existing]?.allocation_pct);if(oldPct>DAYTRADE_LIVE_FEEDBACK_V302.maxSinglePositionPctOfEquity||pct<oldPct)counters.riskCappedBuys++;
    const next={...(existing!==undefined?actions[existing]:{}),symbol:s,name:c?.name||undefined,action:'BUY',allocation_pct:pct,confidence:clamp(.62+(row.daytradeLiveScore-56)*.006+num(row.dipQuality)*.03+num(row.timingQuality)*.03,.62,.92),daytradeLiveFeedbackV302:true,entryDecisionScore:row.daytradeLiveScore,preLiveFeedbackScore:row.preLiveFeedbackScore,daytradeLiveScore:row.daytradeLiveScore,liveFeedbackScorePoints:row.liveFeedbackScorePoints,liveFeedbackLabel:row.liveFeedbackLabel,dipLabel:row.dipLabel,timingLabel:row.timingLabel,reason:`V30.2 DAYTRADE-BUY: ${s} Score ${row.preLiveFeedbackScore.toFixed(1)} ${row.liveFeedbackScorePoints>=0?'+':''}${row.liveFeedbackScorePoints} Live-Fix = ${row.daytradeLiveScore.toFixed(1)}/100 · ${row.dipLabel} · ${row.timingLabel} · Einsatz ${pct.toFixed(1)}% des Scan-Startcashs, max. 25% Einzelpositions-Risikodeckel.`};
    if(existing===undefined){idx.set(s,actions.length);actions.push(next)}else actions[existing]=next;rememberPendingBaseline(storage,row,now);counters.selectedBuys++;if(row?.timingMetrics?.fastPresent>=3)counters.pcFastRowsUsed++;
  });
  plan.actions=actions;plan.summary=`${String(plan.summary||'').slice(0,100)} · V30.2 Live-Feedback: ${counters.selectedBuys} BUY · ${counters.chasesSuppressed} High-Chase gedrückt · ${counters.baselinesRepaired} Baseline repariert.`;
  return{plan,counters,ranking:scored.ranking,selected,slots,repair};
}

export class DaytradeLiveFeedbackGuardV302{
  constructor(inner,{getState,storage,now}={}){this.inner=inner;this.getState=getState;this.storage=storage;this.now=now;this.latest=null}
  async run(model,input){const legacy=input===undefined&&model&&typeof model==='object',payload=legacy?model:input,state=typeof this.getState==='function'?(this.getState()||{}):{},r=legacy?await this.inner.run(payload):await this.inner.run(model,payload);if(!isTradingPlanInput(payload))return r;const p=parsePlan(r);if(!p)return r;const out=enforceDaytradeLiveFeedbackV302(p,state,this.storage,typeof this.now==='function'?this.now():Date.now());this.latest=out;return encode(r,out.plan)}
  status(){const state=typeof this.getState==='function'?(this.getState()||{}):{},repair=repairExecutedEntryBaselinesV302(state,this.storage,typeof this.now==='function'?this.now():Date.now()),out=daytradeLiveScoresV302(state,this.storage,typeof this.now==='function'?this.now():Date.now());return{enabled:true,version:30.2,authoritativeDaytradeEntry:true,immediateBuyMin:56,maxOpenPositions:4,maxSinglePositionPctOfEquity:25,maxTargetCashDeploymentPct:90,highChaseExtraPenalty:DAYTRADE_LIVE_FEEDBACK_V302.highChaseExtraPenalty,pcFastDataMergedFromPcFirst:true,executedEntryBaselineRepair:true,ranking:out.ranking,baselineRepair:{correctedNow:repair.corrected,confirmed:repair.exec.confirmed,stats:repair.exec.stats},latest:this.latest?.counters||null,config:DAYTRADE_LIVE_FEEDBACK_V302,rule:'V30.2 lernt direkt aus den Live-Trades: HIGH_CHASE bekommt zusätzlichen Score-Malus statt eines separaten Kaufverbots; neue Positionen bleiben bei höchstens 25% des Scan-Startcashs und vier Slots können zusammen bis 90% nutzen. Der tatsächlich ausgeführte finale DecisionScore wird als Einstiegsscore-Basis gespeichert/repariert.'}}
}
