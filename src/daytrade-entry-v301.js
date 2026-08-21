import {daytradeDipScoresV300,daytradeAllocationV300,DAYTRADE_DIP_V300} from './daytrade-dip-v300.js';

const REENTRY_KEY='state/score-reentry-v296';
const arr=v=>Array.isArray(v)?v:[];
const finite=v=>Number.isFinite(Number(v));
const num=(v,d=0)=>finite(v)?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();
const read=(storage,k,d)=>{try{return storage?.kv?.get(k)||d}catch{return d}};
const first=(o,names,d=NaN)=>{for(const n of names)if(o!=null&&finite(o[n]))return Number(o[n]);return d};
const hasAny=(o,names)=>names.some(n=>o!=null&&finite(o[n]));

export const DAYTRADE_ENTRY_V301={
  version:30.1,
  immediateBuyMin:56,
  maxOpenPositions:DAYTRADE_DIP_V300.maxOpenPositions,
  targetCashDeploymentPct:DAYTRADE_DIP_V300.targetCashDeploymentPct,
  reserveCashPct:DAYTRADE_DIP_V300.reserveCashPct,
  freshQuoteMinutes:2.5,
  agingQuoteMinutes:4.5,
  staleQuoteMinutes:7,
  cleanRetestBonus:4,
  continuationBonus:3,
  freshTapeBonus:2,
  neutralTimingPenalty:-3,
  agingQuotePenalty:-5,
  staleQuotePenalty:-14,
  missingFastPenalty:-7,
  weakTapePenalty:-5
};

export function timingMetricsV301(c={}){
  const m5Names=['momentum5Pct','intraday5m','momentum5','momentum_5_pct'];
  const m20Names=['momentum20Pct','intraday20m','momentum20','momentum_20_pct'];
  const accNames=['acceleration5Pct','momentumAcceleration5','momentum_acceleration5','acceleration_5_pct'];
  const fastPresent=[hasAny(c,m5Names),hasAny(c,m20Names),hasAny(c,accNames)].filter(Boolean).length;
  const age=first(c,['quoteAgeMinutes','quote_age_minutes','quoteAgeMin'],NaN);
  const draw=first(c,['drawdownFrom20mHighPct','drawdown_from_20m_high_pct'],NaN);
  return{
    m5:first(c,m5Names,0),m20:first(c,m20Names,0),acc:first(c,accNames,0),
    day:first(c,['dayPct','day','day_change','dayChange'],0),
    rsi:first(c,['intradayRsi','rsi'],50),
    draw:Number.isFinite(draw)?draw:null,
    quoteAgeMinutes:Number.isFinite(age)?Math.max(0,age):null,
    explicitStale:Boolean(c?.stale||c?.quoteStale||c?.quote_stale),
    fastPresent
  };
}

export function entryTimingV301(c={},dip={}){
  const m=timingMetricsV301(c),cfg=DAYTRADE_ENTRY_V301;
  let points=0,label='TIMING_OK',quality=.5;const reasons=[];

  if(m.explicitStale||(m.quoteAgeMinutes!==null&&m.quoteAgeMinutes>cfg.staleQuoteMinutes)){
    points+=cfg.staleQuotePenalty;label='STALE_FAST_DATA';quality=.05;reasons.push('1m/5m-Kursdaten zu alt');
  }else if(m.quoteAgeMinutes!==null&&m.quoteAgeMinutes>cfg.agingQuoteMinutes){
    points+=cfg.agingQuotePenalty;label='AGING_FAST_DATA';quality=.25;reasons.push('Intraday-Kursdaten altern bereits');
  }else if(m.quoteAgeMinutes!==null&&m.quoteAgeMinutes<=cfg.freshQuoteMinutes){
    points+=cfg.freshTapeBonus;quality+=.08;reasons.push('frische Intraday-Quote');
  }

  if(m.fastPresent<=1){points+=cfg.missingFastPenalty;quality=Math.min(quality,.25);reasons.push('zu wenige echte 1m/5m-Signale');}
  else if(m.fastPresent===2){points-=2;quality-=.08;reasons.push('ein schnelles Intraday-Signal fehlt');}

  const cleanRetest=m.draw!==null&&m.draw<=-.15&&m.draw>=-.8&&m.m20>=.15&&m.m5>=-.06&&m.m5<=.20&&m.acc>=.015&&m.day<=4&&m.rsi<=71;
  const continuation=m.draw===null&&m.m20>=.35&&m.m5>=.015&&m.m5<=.22&&m.acc>=.02&&m.day>=-.3&&m.day<=3.5&&m.rsi<=70;
  const weakTape=(m.m20<=-.22&&m.acc<=0)||(m.m5<=-.18&&m.acc<0);

  if(cleanRetest){points+=cfg.cleanRetestBonus;label='CLEAN_RETEST';quality=Math.max(quality,.84);reasons.push('sauberer Retest mit wieder positiver Beschleunigung');}
  else if(continuation){points+=cfg.continuationBonus;label='CLEAN_CONTINUATION';quality=Math.max(quality,.74);reasons.push('frische Fortsetzung ohne Hochjagd');}
  else if(weakTape){points+=cfg.weakTapePenalty;label='WEAK_TAPE';quality=Math.min(quality,.2);reasons.push('kurzfristiges Tape noch schwach');}
  else if(String(dip?.dipLabel||dip?.label||'')==='NEUTRAL'){
    points+=cfg.neutralTimingPenalty;label='NEUTRAL_TIMING';quality=Math.min(quality,.42);reasons.push('kein klarer Daytrade-Timingvorteil');
  }

  return{points,quality:+clamp(quality,0,1).toFixed(2),label,reason:reasons.join(' · ')||'Timing neutral',metrics:m};
}

export function daytradeEntryScoresV301(state={},storage=null,now=Date.now()){
  const base=daytradeDipScoresV300(state,storage,now),cmap=new Map(arr(state?.candidates).map(c=>[key(c),c])),ranking=[];
  for(const row of arr(base.ranking)){
    const c=cmap.get(key(row))||{},timing=entryTimingV301(c,row),before=clamp(row.daytradeDipScore??row.decisionScore,0,100),score=clamp(before+timing.points,0,100);
    ranking.push({...row,preTimingDecisionScore:+before.toFixed(1),decisionScore:+score.toFixed(1),buyScore:+score.toFixed(1),fusionScore:+score.toFixed(1),holdScore:+score.toFixed(1),sellScore:+(100-score).toFixed(1),daytradeEntryScore:+score.toFixed(1),timingScorePoints:timing.points,timingLabel:timing.label,timingQuality:timing.quality,timingReason:timing.reason,timingMetrics:timing.metrics,decisionScoreVersion:30.1});
  }
  ranking.sort((a,b)=>b.daytradeEntryScore-a.daytradeEntryScore||b.timingQuality-a.timingQuality||b.dipQuality-a.dipQuality||num(b.marketCapUSD)-num(a.marketCapUSD));
  return{version:30.1,ranking,base};
}

function parsePlan(r){const raw=String(r?.response||r?.result?.response||''),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j?.actions)?j:null}catch{return null}}
function encode(r,plan){const raw=JSON.stringify(plan);if(r&&typeof r==='object'&&r.result&&typeof r.result==='object'&&'response'in r.result)return{...r,result:{...r.result,response:raw}};if(r&&typeof r==='object'&&'response'in r)return{...r,response:raw};return{response:raw}}
function isTradingPlanInput(input){return Boolean(input&&typeof input==='object'&&arr(input?.messages).some(m=>{const t=String(m?.content||'');return t.includes('Kandidaten=')&&t.includes(' Gehalten=')}))}

export function enforceDaytradeEntryV301(plan,state={},storage=null,now=Date.now()){
  if(!plan||!Array.isArray(plan.actions))return{plan,counters:{}};
  const scored=daytradeEntryScoresV301(state,storage,now),cmap=new Map(arr(state?.candidates).map(c=>[key(c),c])),held=new Set(arr(state?.positions).map(key).filter(Boolean)),re=read(storage,REENTRY_KEY,{locks:{}})||{locks:{}};
  const actions=plan.actions.map(a=>({...a})),idx=new Map();actions.forEach((a,i)=>{const s=key(a);if(s&&!idx.has(s))idx.set(s,i)});
  const plannedSells=new Set(actions.filter(a=>String(a?.action||'').toUpperCase()==='SELL'&&held.has(key(a))).map(key));
  const effectiveHeld=Math.max(0,held.size-plannedSells.size),slots=Math.max(0,DAYTRADE_ENTRY_V301.maxOpenPositions-effectiveHeld);
  const eligible=scored.ranking.filter(r=>!held.has(r.symbol)&&!r.hardBlocked&&!re?.locks?.[r.symbol]&&r.daytradeEntryScore>=DAYTRADE_ENTRY_V301.immediateBuyMin);
  const selected=eligible.slice(0,slots),selectedSet=new Set(selected.map(r=>r.symbol));
  const counters={selectedBuys:0,freshTapeBuys:0,retests:0,staleSuppressed:0,missingFastSuppressed:0,neutralSuppressed:0};

  for(let i=0;i<actions.length;i++){
    const a=actions[i],s=key(a);if(!s||held.has(s)||String(a?.action||'').toUpperCase()!=='BUY')continue;
    const row=scored.ranking.find(r=>r.symbol===s);
    if(!row||!selectedSet.has(s)){
      actions[i]={...a,action:'HOLD',allocation_pct:0,daytradeEntryV301:true,reason:`V30.1 DAYTRADE-HOLD: ${s} ${row?`Timing ${row.timingLabel} · Score ${row.daytradeEntryScore.toFixed(1)}`:'ohne frische Timingbewertung'}. BUY bleibt ab 56, aber alte/fehlende oder schwache Intraday-Daten drücken den Score selbst.`};
      if(row?.timingLabel==='STALE_FAST_DATA'||row?.timingLabel==='AGING_FAST_DATA')counters.staleSuppressed++;
      if(num(row?.timingMetrics?.fastPresent,3)<=1)counters.missingFastSuppressed++;
      if(row?.timingLabel==='NEUTRAL_TIMING')counters.neutralSuppressed++;
    }
  }

  selected.forEach((row,rankIndex)=>{
    const s=row.symbol,c=cmap.get(s)||{},existing=idx.get(s),quality=clamp((num(row.dipQuality)+num(row.timingQuality))/2,0,1),pct=daytradeAllocationV300({score:row.daytradeEntryScore,dipQuality:quality,selectedCount:selected.length,rank:rankIndex+1});
    const next={...(existing!==undefined?actions[existing]:{}),symbol:s,name:c?.name||undefined,action:'BUY',allocation_pct:pct,confidence:clamp(.62+(row.daytradeEntryScore-56)*.006+quality*.05,.62,.92),daytradeEntryV301:true,preTimingDecisionScore:row.preTimingDecisionScore,daytradeEntryScore:row.daytradeEntryScore,timingScorePoints:row.timingScorePoints,timingLabel:row.timingLabel,timingQuality:row.timingQuality,dipLabel:row.dipLabel,dipQuality:row.dipQuality,reason:`V30.1 DAYTRADE-BUY: ${s} Dip-Score ${row.preTimingDecisionScore.toFixed(1)} ${row.timingScorePoints>=0?'+':''}${row.timingScorePoints} Timing = ${row.daytradeEntryScore.toFixed(1)}/100 · ${row.dipLabel} · ${row.timingLabel} · Einsatz ${pct.toFixed(1)}% des freien Cashs.`};
    if(existing===undefined){idx.set(s,actions.length);actions.push(next)}else actions[existing]=next;
    counters.selectedBuys++;if(row.timingMetrics?.quoteAgeMinutes!==null&&num(row.timingMetrics?.quoteAgeMinutes,99)<=DAYTRADE_ENTRY_V301.freshQuoteMinutes)counters.freshTapeBuys++;if(row.timingLabel==='CLEAN_RETEST')counters.retests++;
  });

  plan.actions=actions;plan.summary=`${String(plan.summary||'').slice(0,105)} · V30.1 Fresh-Tape-Daytrade: ${counters.selectedBuys} BUY · ${counters.retests} Retest · ${counters.freshTapeBuys} frische Quotes.`;
  return{plan,counters,ranking:scored.ranking,slots,selected};
}

export class DaytradeEntryGuardV301{
  constructor(inner,{getState,storage,now}={}){this.inner=inner;this.getState=getState;this.storage=storage;this.now=now;this.latest=null}
  async run(model,input){const legacy=input===undefined&&model&&typeof model==='object',payload=legacy?model:input,state=typeof this.getState==='function'?(this.getState()||{}):{},r=legacy?await this.inner.run(payload):await this.inner.run(model,payload);if(!isTradingPlanInput(payload))return r;const p=parsePlan(r);if(!p)return r;const out=enforceDaytradeEntryV301(p,state,this.storage,typeof this.now==='function'?this.now():Date.now());this.latest=out;return encode(r,out.plan)}
  status(){const state=typeof this.getState==='function'?(this.getState()||{}):{},out=daytradeEntryScoresV301(state,this.storage,typeof this.now==='function'?this.now():Date.now());return{enabled:true,version:30.1,authoritativeDaytradeEntry:true,immediateBuyMin:56,maxOpenPositions:DAYTRADE_ENTRY_V301.maxOpenPositions,targetCashDeploymentPct:DAYTRADE_ENTRY_V301.targetCashDeploymentPct,quoteFreshnessInScore:true,fastFieldCoverageInScore:true,cleanRetestAware:true,cleanContinuationAware:true,ranking:out.ranking,latest:this.latest?.counters||null,config:DAYTRADE_ENTRY_V301,rule:'V30.1 macht den 56er DecisionScore daytrading-tauglicher: frische PC-1m/5m-Daten, saubere Retests und frühe Fortsetzungen verbessern den Score; alte/fehlende Intraday-Daten, neutrales Timing und schwaches Tape senken ihn. Es gibt weiterhin keine zweite strategische BUY-Schwelle.'}}
}
