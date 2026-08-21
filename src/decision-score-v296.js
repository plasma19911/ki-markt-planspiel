import {scoreAllV287} from './calibrated-action-score-v287.js';
import {entryAllocationPctV290} from './entry-profit-behavior-v290-core.js';

const KEY='state/decision-score-v296';
const LEGACY_KEY='state/decision-score-v293';
const REENTRY_KEY='state/score-reentry-v296';
const arr=v=>Array.isArray(v)?v:[];
const finite=v=>Number.isFinite(Number(v));
const num=(v,d=0)=>finite(v)?Number(v):d;
const firstFinite=(...v)=>{for(const x of v)if(finite(x))return Number(x);return NaN};
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();
const readKey=(storage,k,d)=>{try{return storage?.kv?.get(k)||d}catch{return d}};
const writeKey=(storage,k,v)=>{try{storage?.kv?.put(k,v)}catch{}};

export const DECISION_SCORE_V296={
  version:29.6,
  immediateBuyMin:56,
  noSoftBuyBlocks:true,
  qualityFloor:.45,
  qualityCoverageWeight:.55,
  freshQuoteMinutes:3,
  oldQuoteMinutes:8,
  mildlyStaleFactor:.75,
  staleFactor:.40,
  upTauMinutes:1.2,
  downTauMinutes:2.0,
  riseRatePerMinute:4.5,
  dropRatePerMinute:3.0,
  minRiseStep:1.5,
  minDropStep:1.0,
  maxRisePerDecision:10,
  maxDropPerDecision:6,
  coverageShockDelta:.34,
  memoryHours:6,
  reentryResetBelow:56
};

function defaults(){return{version:29.6,candidates:{},positions:{},stats:{updates:0,largeRawJumps:0,qualityAdjusted:0,timeSmoothed:0,forcedBuys:0,blockedBelow56:0,reentryBlocks:0,reentryUnlocks:0},updatedAt:null}}
function reentryDefaults(){return{version:29.6,locks:{},stats:{locksCreated:0,blocks:0,unlocks:0},updatedAt:null}}

function quoteFreshness(c={}){
  const age=firstFinite(c?.quoteAgeMinutes,c?.pcQuoteAgeMinutes,c?.quote_age_minutes);
  const stale=Boolean(c?.stale||c?.pcStale);
  if(stale||(finite(age)&&age>DECISION_SCORE_V296.oldQuoteMinutes))return{factor:DECISION_SCORE_V296.staleFactor,age:finite(age)?age:null,stale:true};
  if(finite(age)&&age>DECISION_SCORE_V296.freshQuoteMinutes)return{factor:DECISION_SCORE_V296.mildlyStaleFactor,age,stale:false};
  return{factor:1,age:finite(age)?age:null,stale:false};
}
function qualityRaw(row={},candidate={}){
  const raw=clamp(firstFinite(row?.buyScore,row?.fusionScore,row?.holdScore),0,100),coverage=clamp(num(row?.coverage),0,1),fresh=quoteFreshness(candidate);
  const q=DECISION_SCORE_V296.qualityFloor+DECISION_SCORE_V296.qualityCoverageWeight*coverage;
  const factor=clamp(q*fresh.factor,0,1),adjusted=50+(raw-50)*factor;
  return{raw:+raw.toFixed(1),adjusted:+clamp(adjusted,0,100).toFixed(1),coverage:+coverage.toFixed(2),qualityFactor:+factor.toFixed(3),quoteAgeMinutes:fresh.age,quoteStale:fresh.stale,qualityAdjusted:Math.abs(adjusted-raw)>=.05};
}
function driverChanges(parts={},prevParts=null){
  const keys=Object.keys(parts||{}).filter(k=>finite(parts[k]));
  if(!keys.length)return[];
  const rows=keys.map(k=>({name:k,value:+num(parts[k]).toFixed(1),delta:prevParts&&finite(prevParts[k])?+(num(parts[k])-num(prevParts[k])).toFixed(1):null}));
  rows.sort((a,b)=>Math.abs(b.delta??b.value)-Math.abs(a.delta??a.value));
  return rows.slice(0,4);
}
function smooth(rawInfo,prev,parts,now=Date.now()){
  const adjusted=rawInfo.adjusted;
  const validPrev=prev&&finite(prev.stable)&&now-num(prev.at,0)<=DECISION_SCORE_V296.memoryHours*3600_000;
  if(!validPrev)return{stable:adjusted,deltaRaw:0,deltaStable:0,ageMinutes:null,coverageShock:false,smoothed:false,drivers:driverChanges(parts,null)};
  const old=clamp(prev.stable,0,100),delta=adjusted-old,age=Math.max(.05,(now-num(prev.at,now))/60000),up=delta>=0;
  const tau=up?DECISION_SCORE_V296.upTauMinutes:DECISION_SCORE_V296.downTauMinutes,alpha=1-Math.exp(-age/tau);
  let cap=up?clamp(DECISION_SCORE_V296.riseRatePerMinute*age,DECISION_SCORE_V296.minRiseStep,DECISION_SCORE_V296.maxRisePerDecision):clamp(DECISION_SCORE_V296.dropRatePerMinute*age,DECISION_SCORE_V296.minDropStep,DECISION_SCORE_V296.maxDropPerDecision);
  const coverageShock=Math.abs(rawInfo.coverage-num(prev.coverage,rawInfo.coverage))>=DECISION_SCORE_V296.coverageShockDelta;
  if(!up&&coverageShock)cap=Math.max(.75,cap*.5);
  const wanted=delta*alpha,step=clamp(wanted,-cap,cap),stable=clamp(old+step,0,100);
  return{stable:+stable.toFixed(1),deltaRaw:+delta.toFixed(1),deltaStable:+step.toFixed(1),ageMinutes:+age.toFixed(2),coverageShock,smoothed:Math.abs(stable-adjusted)>=.05,drivers:driverChanges(parts,prev.parts)};
}
function legacySeed(legacy={},bucket='candidates',s=''){
  const x=legacy?.[bucket]?.[s];
  return x&&finite(x.stable)?{at:num(x.at),stable:num(x.stable),raw:num(x.raw,x.stable),coverage:num(x.coverage),parts:x.parts||{}}:null;
}

export function stableDecisionScoresV296(state={},storage=null,now=Date.now(),update=false){
  const scored=scoreAllV287(state,storage,now,false),mem={...defaults(),...readKey(storage,KEY,defaults())};
  mem.candidates={...(mem.candidates||{})};mem.positions={...(mem.positions||{})};mem.stats={...defaults().stats,...(mem.stats||{})};
  const legacy=readKey(storage,LEGACY_KEY,{candidates:{},positions:{}})||{candidates:{},positions:{}},candidateInput=new Map(arr(state?.candidates).map(c=>[key(c),c])),ranking=[];
  for(const row of arr(scored.ranking)){
    const s=key(row);if(!s)continue;const c=candidateInput.get(s)||{},qi=qualityRaw(row,c),prev=mem.candidates[s]||legacySeed(legacy,'candidates',s),sm=smooth(qi,prev,row?.parts||{},now);
    const out={...row,rawDecisionScore:qi.raw,qualityAdjustedRawScore:qi.adjusted,decisionScore:sm.stable,buyScore:sm.stable,fusionScore:sm.stable,holdScore:sm.stable,sellScore:+(100-sm.stable).toFixed(1),scoreDeltaRaw:sm.deltaRaw,scoreDeltaStable:sm.deltaStable,scoreAgeMinutes:sm.ageMinutes,scoreSmoothed:sm.smoothed,coverageShock:sm.coverageShock,scoreQualityFactor:qi.qualityFactor,quoteAgeMinutes:qi.quoteAgeMinutes,quoteStale:qi.quoteStale,scoreDrivers:sm.drivers,decisionScoreVersion:29.6};
    ranking.push(out);
    if(update){
      if(Math.abs(sm.deltaRaw)>=20)mem.stats.largeRawJumps++;
      if(qi.qualityAdjusted)mem.stats.qualityAdjusted++;
      if(sm.smoothed)mem.stats.timeSmoothed++;
      mem.candidates[s]={at:now,stable:sm.stable,raw:qi.raw,coverage:qi.coverage,parts:{...(row?.parts||{})}};
    }
  }
  ranking.sort((a,b)=>b.decisionScore-a.decisionScore);const ranked=new Map(ranking.map(r=>[r.symbol,r])),positionScores=[];
  for(const row of arr(scored.positionScores)){
    const s=key(row);if(!s)continue;const live=ranked.get(s);
    if(live){const out={...row,...live,position:true,partial:false,source:'V29.6_FULL_CANDIDATE'};positionScores.push(out);if(update)mem.positions[s]={at:now,stable:out.decisionScore,raw:out.rawDecisionScore,coverage:out.coverage,parts:{...(out.parts||{})}};continue}
    const seed=mem.positions[s]||mem.candidates[s]||legacySeed(legacy,'positions',s)||legacySeed(legacy,'candidates',s);
    if(seed&&finite(seed.stable)){
      const stable=clamp(seed.stable,0,100);positionScores.push({...row,decisionScore:+stable.toFixed(1),buyScore:+stable.toFixed(1),holdScore:+stable.toFixed(1),fusionScore:+stable.toFixed(1),sellScore:+(100-stable).toFixed(1),rawDecisionScore:firstFinite(row?.holdScore,row?.fusionScore),scoreFrozenNoFullData:true,decisionScoreVersion:29.6,partial:true,position:true,source:'V29.6_CONTINUITY_FREEZE'});if(update)mem.positions[s]={...seed,at:now};
    }else{
      const qi=qualityRaw(row,{}),stable=qi.adjusted;positionScores.push({...row,decisionScore:stable,buyScore:stable,holdScore:stable,fusionScore:stable,sellScore:+(100-stable).toFixed(1),rawDecisionScore:qi.raw,scoreBootstrapPartial:true,decisionScoreVersion:29.6,partial:true,position:true,source:'V29.6_PARTIAL_BOOTSTRAP'});if(update)mem.positions[s]={at:now,stable,raw:qi.raw,coverage:qi.coverage,parts:{...(row?.parts||{})}};
    }
  }
  if(update){
    const cutoff=now-DECISION_SCORE_V296.memoryHours*3600_000;for(const b of [mem.candidates,mem.positions])for(const s of Object.keys(b))if(num(b[s]?.at,0)<cutoff)delete b[s];
    mem.stats.updates++;mem.updatedAt=new Date(now).toISOString();writeKey(storage,KEY,mem);
  }
  return{version:29.6,ranking,positionScores,mem};
}

function tierFor(score){if(score>=76)return'EXCEPTIONAL';if(score>=68)return'STRONG';if(score>=62)return'REGULAR';if(score>=58)return'EARLY';return'MICRO'}
function parsePlan(r){const raw=String(r?.response||r?.result?.response||''),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j?.actions)?j:null}catch{return null}}
function encode(r,plan){const raw=JSON.stringify(plan);if(r&&typeof r==='object'&&r.result&&typeof r.result==='object'&&'response'in r.result)return{...r,result:{...r.result,response:raw}};if(r&&typeof r==='object'&&'response'in r)return{...r,response:raw};return{response:raw}}
function isTradingPlanInput(input){return Boolean(input&&typeof input==='object'&&arr(input?.messages).some(m=>{const t=String(m?.content||'');return t.includes('Kandidaten=')&&t.includes(' Gehalten=')}))}

export function enforceDecisionScoreV296(plan,state={},storage=null,now=Date.now()){
  if(!plan||!Array.isArray(plan.actions))return{plan,counters:{}};
  const scored=stableDecisionScoresV296(state,storage,now,false),by=new Map(scored.ranking.map(r=>[r.symbol,r])),positions=new Set(arr(state?.positions).map(key).filter(Boolean)),candidateMap=new Map(arr(state?.candidates).map(c=>[key(c),c]));
  const re={...reentryDefaults(),...readKey(storage,REENTRY_KEY,reentryDefaults())};re.locks={...(re.locks||{})};re.stats={...reentryDefaults().stats,...(re.stats||{})};
  const actions=plan.actions.map(a=>({...a})),idx=new Map();actions.forEach((a,i)=>{const s=key(a);if(s&&!idx.has(s))idx.set(s,i)});
  const counters={forcedBuys:0,blockedBelow56:0,reentryBlocks:0,reentryUnlocks:0,reentryLocksCreated:0};

  for(const a of actions){
    const s=key(a);if(!s||!positions.has(s)||String(a?.action||'').toUpperCase()!=='SELL'||a?.scoreExitV294!==true)continue;
    const delta=num(a?.scoreExitDelta,0);if(delta>=10||delta<=-15){re.locks[s]={at:now,exitScore:firstFinite(a?.scoreExitCurrent,a?.scoreExitEntry),delta,resetBelow:DECISION_SCORE_V296.reentryResetBelow};counters.reentryLocksCreated++;re.stats.locksCreated++}
  }
  for(const [s,lock] of Object.entries(re.locks)){
    if(positions.has(s))continue;const row=by.get(s);if(row&&row.decisionScore<DECISION_SCORE_V296.reentryResetBelow){delete re.locks[s];counters.reentryUnlocks++;re.stats.unlocks++}
  }

  for(const row of scored.ranking){
    const s=row.symbol;if(!s||positions.has(s))continue;const score=row.decisionScore,existing=idx.get(s),locked=Boolean(re.locks[s]);
    if(score>=DECISION_SCORE_V296.immediateBuyMin&&!locked){
      const tier=tierFor(score),cash=Math.max(0,firstFinite(state?.config?.cash,state?.cash,0)),pct=entryAllocationPctV290(cash,{score,tier}),c=candidateMap.get(s)||{},next={...(existing!==undefined?actions[existing]:{}),symbol:s,name:c?.name||undefined,action:'BUY',allocation_pct:pct,confidence:clamp(.60+(score-56)*.006,.60,.90),reason:`V29.6 SOFORT-BUY: DecisionScore ${score.toFixed(1)}/100 >= 56. Zeit-/Qualitäts-geglättet, keine zusätzliche weiche Kaufbremse.`};
      if(existing!==undefined)actions[existing]=next;else{idx.set(s,actions.length);actions.push(next)}counters.forcedBuys++;
    }else if(existing!==undefined&&String(actions[existing]?.action||'').toUpperCase()==='BUY'){
      actions[existing]={...actions[existing],action:'HOLD',allocation_pct:0,reason:locked?`V29.6 REENTRY-RESET: ${s} wurde per Score-Exit verkauft. Vor erneutem Sofortkauf muss der DecisionScore einmal unter 56 zurücksetzen.`:`V29.6 HOLD: DecisionScore ${score.toFixed(1)}/100 < 56.`};
      if(locked){counters.reentryBlocks++;re.stats.blocks++}else counters.blockedBelow56++;
    }else if(locked&&score>=56){
      if(existing!==undefined)actions[existing]={...actions[existing],action:'HOLD',allocation_pct:0,reason:`V29.6 REENTRY-RESET: ${s} bleibt über 56, nachdem die Position per +10/-15 Score-Exit verkauft wurde. Kein Gebühren-Loop; erst unter 56 zurücksetzen, danach gilt bei erneutem Überschreiten sofort BUY.`};
      counters.reentryBlocks++;re.stats.blocks++;
    }
  }
  for(let i=0;i<actions.length;i++){
    const a=actions[i],s=key(a);if(positions.has(s)||String(a?.action||'').toUpperCase()!=='BUY'||by.has(s))continue;actions[i]={...a,action:'HOLD',allocation_pct:0,reason:'V29.6 HOLD: kein aktueller DecisionScore vorhanden.'};counters.blockedBelow56++;
  }
  const fresh=stableDecisionScoresV296(state,storage,now,true);fresh.mem.stats.forcedBuys=num(fresh.mem.stats.forcedBuys)+counters.forcedBuys;fresh.mem.stats.blockedBelow56=num(fresh.mem.stats.blockedBelow56)+counters.blockedBelow56;fresh.mem.stats.reentryBlocks=num(fresh.mem.stats.reentryBlocks)+counters.reentryBlocks;fresh.mem.stats.reentryUnlocks=num(fresh.mem.stats.reentryUnlocks)+counters.reentryUnlocks;writeKey(storage,KEY,fresh.mem);
  re.updatedAt=new Date(now).toISOString();writeKey(storage,REENTRY_KEY,re);plan.actions=actions;plan.summary=`${String(plan.summary||'').slice(0,135)} · V29.6: ${counters.forcedBuys} BUY>=56 · ${counters.reentryBlocks} Reentry blockiert · ${counters.reentryUnlocks} Reset.`;
  return{plan,counters,ranking:fresh.ranking,positionScores:fresh.positionScores,reentry:re};
}

export class DecisionScoreGuardV296{
  constructor(inner,{getState,storage,now}={}){this.inner=inner;this.getState=getState;this.storage=storage;this.now=now;this.latest=null}
  async run(model,input){const legacy=input===undefined&&model&&typeof model==='object',payload=legacy?model:input,state=typeof this.getState==='function'?(this.getState()||{}):{},r=legacy?await this.inner.run(payload):await this.inner.run(model,payload);if(!isTradingPlanInput(payload))return r;const p=parsePlan(r);if(!p)return r;const out=enforceDecisionScoreV296(p,state,this.storage,typeof this.now==='function'?this.now():Date.now());this.latest=out;return encode(r,out.plan)}
  status(){const state=typeof this.getState==='function'?(this.getState()||{}):{},s=stableDecisionScoresV296(state,this.storage,typeof this.now==='function'?this.now():Date.now(),false),mem={...defaults(),...readKey(this.storage,KEY,defaults())},re={...reentryDefaults(),...readKey(this.storage,REENTRY_KEY,reentryDefaults())};return{enabled:true,version:29.6,authoritative:true,immediateBuyMin:56,noSoftBuyBlocks:true,timeAwareSmoothing:true,qualityAwareScore:true,reentryResetRequired:true,stability:DECISION_SCORE_V296,ranking:s.ranking,positionScores:s.positionScores,reentryLocks:re.locks||{},latest:this.latest?.counters||null,stats:mem.stats||{},rule:'Einheitlicher DecisionScore 0-100. Ab 56 sofort BUY. Scoreänderungen sind zeit- statt scanabhängig und werden bei lückenhaften/veralteten Daten Richtung neutral gedämpft. Nach einem +10/-15 Exit muss derselbe Titel einmal unter 56 zurücksetzen, damit kein SELL→sofortiger Wiederkauf-Loop entsteht.'}}
}
