import {scoreAllV287} from './calibrated-action-score-v287.js';
import {entryAllocationPctV290} from './entry-profit-behavior-v290-core.js';

const KEY='state/decision-score-v293';
const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();
const read=(storage,d)=>{try{return storage?.kv?.get(KEY)||d}catch{return d}};
const write=(storage,v)=>{try{storage?.kv?.put(KEY,v)}catch{}};

export const DECISION_SCORE_V293={
  version:29.3,
  immediateBuyMin:56,
  watchMin:50,
  noSoftBuyBlocks:true,
  maxDropPerDecision:8,
  maxRisePerDecision:12,
  downAlpha:.35,
  upAlpha:.65,
  coverageShockDelta:.34,
  coverageShockDropCap:5,
  staleResetMinutes:12
};

function defaults(){return{version:29.3,candidates:{},positions:{},stats:{updates:0,largeRawJumps:0,smoothedLargeJumps:0,forcedBuys:0,blockedBelow56:0},updatedAt:null}}

function smoothOne(raw,coverage,prev,now=Date.now()){
  raw=clamp(raw,0,100);coverage=clamp(coverage,0,1);
  if(!prev||!Number.isFinite(Number(prev.stable))||now-num(prev.at,0)>DECISION_SCORE_V293.staleResetMinutes*60_000){
    return{stable:+raw.toFixed(1),raw:+raw.toFixed(1),deltaRaw:0,deltaStable:0,coverage,coverageShock:false,smoothed:false};
  }
  const old=clamp(prev.stable,0,100),deltaRaw=raw-old,coverageShock=Math.abs(coverage-num(prev.coverage,coverage))>=DECISION_SCORE_V293.coverageShockDelta;
  const up=deltaRaw>=0,alpha=up?DECISION_SCORE_V293.upAlpha:(coverageShock?.20:DECISION_SCORE_V293.downAlpha);
  const cap=up?DECISION_SCORE_V293.maxRisePerDecision:(coverageShock?DECISION_SCORE_V293.coverageShockDropCap:DECISION_SCORE_V293.maxDropPerDecision);
  const wanted=deltaRaw*alpha,step=clamp(wanted,-cap,cap),stable=clamp(old+step,0,100);
  return{stable:+stable.toFixed(1),raw:+raw.toFixed(1),deltaRaw:+deltaRaw.toFixed(1),deltaStable:+step.toFixed(1),coverage,coverageShock,smoothed:Math.abs(stable-raw)>=.05};
}

function tierFor(score){
  if(score>=76)return'EXCEPTIONAL';
  if(score>=68)return'STRONG';
  if(score>=62)return'REGULAR';
  if(score>=58)return'EARLY';
  return'MICRO';
}

export function stableDecisionScoresV293(state={},storage=null,now=Date.now(),update=false){
  const scored=scoreAllV287(state,storage,now,false),mem={...defaults(),...read(storage,defaults())};
  mem.candidates={...(mem.candidates||{})};mem.positions={...(mem.positions||{})};mem.stats={...defaults().stats,...(mem.stats||{})};
  const ranking=[];
  for(const row of arr(scored.ranking)){
    const s=key(row);if(!s)continue;
    const sm=smoothOne(num(row?.buyScore,row?.fusionScore),num(row?.coverage),mem.candidates[s],now);
    if(Math.abs(sm.deltaRaw)>=20)mem.stats.largeRawJumps++;
    if(Math.abs(sm.deltaStable)>=15)mem.stats.smoothedLargeJumps++;
    const out={...row,rawDecisionScore:sm.raw,decisionScore:sm.stable,buyScore:sm.stable,fusionScore:sm.stable,holdScore:sm.stable,sellScore:+(100-sm.stable).toFixed(1),scoreDeltaRaw:sm.deltaRaw,scoreDeltaStable:sm.deltaStable,scoreSmoothed:sm.smoothed,coverageShock:sm.coverageShock,decisionScoreVersion:29.3};
    ranking.push(out);
    if(update)mem.candidates[s]={at:now,stable:sm.stable,raw:sm.raw,coverage:sm.coverage};
  }
  ranking.sort((a,b)=>b.decisionScore-a.decisionScore);
  const positionScores=[];
  for(const row of arr(scored.positionScores)){
    const s=key(row);if(!s)continue;const sm=smoothOne(num(row?.holdScore,row?.fusionScore),num(row?.coverage),mem.positions[s],now);
    positionScores.push({...row,rawDecisionScore:sm.raw,decisionScore:sm.stable,holdScore:sm.stable,buyScore:sm.stable,fusionScore:sm.stable,sellScore:+(100-sm.stable).toFixed(1),scoreDeltaRaw:sm.deltaRaw,scoreDeltaStable:sm.deltaStable,scoreSmoothed:sm.smoothed,coverageShock:sm.coverageShock,decisionScoreVersion:29.3});
    if(update)mem.positions[s]={at:now,stable:sm.stable,raw:sm.raw,coverage:sm.coverage};
  }
  if(update){
    const cutoff=now-45*60_000;for(const b of [mem.candidates,mem.positions])for(const s of Object.keys(b))if(num(b[s]?.at,0)<cutoff)delete b[s];
    mem.stats.updates++;mem.updatedAt=new Date(now).toISOString();write(storage,mem);
  }
  return{version:29.3,ranking,positionScores,mem};
}

function parsePlan(r){const raw=String(r?.response||r?.result?.response||''),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j?.actions)?j:null}catch{return null}}
function encode(r,plan){const raw=JSON.stringify(plan);if(r&&typeof r==='object'&&r.result&&typeof r.result==='object'&&'response'in r.result)return{...r,result:{...r.result,response:raw}};if(r&&typeof r==='object'&&'response'in r)return{...r,response:raw};return{response:raw}}
function isTradingPlanInput(input){return Boolean(input&&typeof input==='object'&&arr(input?.messages).some(m=>{const t=String(m?.content||'');return t.includes('Kandidaten=')&&t.includes(' Gehalten=')}))}

export function enforceImmediateBuyV293(plan,state={},storage=null,now=Date.now()){
  if(!plan||!Array.isArray(plan.actions))return{plan,counters:{forcedBuys:0,blockedBelow56:0}};
  const stable=stableDecisionScoresV293(state,storage,now,false),positions=new Set(arr(state?.positions).map(key)),candidateMap=new Map(arr(state?.candidates).map(c=>[key(c),c])),byScore=new Map(stable.ranking.map(r=>[key(r),r]));
  const actions=plan.actions.map(a=>({...a})),counters={forcedBuys:0,blockedBelow56:0};
  const actionIndex=new Map();actions.forEach((a,i)=>{const s=key(a);if(s&&!actionIndex.has(s))actionIndex.set(s,i)});

  // V29.3: fuer neue Positionen entscheidet nur noch der stabilisierte 0-100-DecisionScore.
  // >=56 wird sofort BUY. Keine Momentum-, News-, FOMO-, Coverage-, Trend- oder Mehrfachscan-Sperre.
  for(const row of stable.ranking){
    const s=key(row);if(!s||positions.has(s))continue;const score=num(row?.decisionScore,row?.buyScore),existing=actionIndex.get(s);
    if(score>=DECISION_SCORE_V293.immediateBuyMin){
      const tier=tierFor(score),pct=entryAllocationPctV290(Math.max(0,num(state?.config?.cash,state?.cash)),{score,tier}),candidate=candidateMap.get(s)||{};
      const next={...(existing!==undefined?actions[existing]:{}),symbol:s,name:candidate?.name||undefined,action:'BUY',allocation_pct:pct,confidence:clamp(.60+(score-56)*.006,.60,.90),reason:`V29.3 SOFORT-BUY: stabilisierter DecisionScore ${score.toFixed(1)}/100 >= 56. Rohscore ${num(row?.rawDecisionScore,score).toFixed(1)}. Keine zusaetzliche weiche Kaufbremse; Score ist die verbindliche Kaufentscheidung.`};
      if(existing!==undefined)actions[existing]=next;else{actionIndex.set(s,actions.length);actions.push(next)}counters.forcedBuys++;
    }else if(existing!==undefined&&String(actions[existing]?.action||'').toUpperCase()==='BUY'){
      actions[existing]={...actions[existing],action:'HOLD',allocation_pct:0,reason:`V29.3 HOLD: stabilisierter DecisionScore ${score.toFixed(1)}/100 < 56.`};counters.blockedBelow56++;
    }
  }
  // Ein alter BUY ohne aktuellen DecisionScore darf nicht an der neuen einzigen Schwelle vorbeilaufen.
  for(let i=0;i<actions.length;i++){
    const a=actions[i],s=key(a);if(positions.has(s)||String(a?.action||'').toUpperCase()!=='BUY'||byScore.has(s))continue;
    actions[i]={...a,action:'HOLD',allocation_pct:0,reason:'V29.3 HOLD: kein aktueller DecisionScore vorhanden.'};counters.blockedBelow56++;
  }
  const fresh=stableDecisionScoresV293(state,storage,now,true);fresh.mem.stats.forcedBuys=num(fresh.mem.stats.forcedBuys)+counters.forcedBuys;fresh.mem.stats.blockedBelow56=num(fresh.mem.stats.blockedBelow56)+counters.blockedBelow56;write(storage,fresh.mem);
  plan.actions=actions;plan.summary=`${String(plan.summary||'').slice(0,150)} · V29.3: ${counters.forcedBuys} Sofort-BUY ab 56 · ${counters.blockedBelow56} BUY unter 56 gestoppt · DecisionScore geglaettet.`;
  return{plan,counters,ranking:fresh.ranking,positionScores:fresh.positionScores};
}

export class DecisionScoreGuardV293{
  constructor(inner,{getState,storage,now}={}){this.inner=inner;this.getState=getState;this.storage=storage;this.now=now;this.latest=null}
  async run(model,input){const legacy=input===undefined&&model&&typeof model==='object',payload=legacy?model:input,state=typeof this.getState==='function'?(this.getState()||{}):{},r=legacy?await this.inner.run(payload):await this.inner.run(model,payload);if(!isTradingPlanInput(payload))return r;const p=parsePlan(r);if(!p)return r;const out=enforceImmediateBuyV293(p,state,this.storage,typeof this.now==='function'?this.now():Date.now());this.latest=out;return encode(r,out.plan)}
  status(){const state=typeof this.getState==='function'?(this.getState()||{}):{},s=stableDecisionScoresV293(state,this.storage,typeof this.now==='function'?this.now():Date.now(),false),mem={...defaults(),...read(this.storage,defaults())};return{enabled:true,version:29.3,authoritative:true,immediateBuyMin:56,noSoftBuyBlocks:true,stability:DECISION_SCORE_V293,ranking:s.ranking,positionScores:s.positionScores,latest:this.latest?.counters||null,stats:mem.stats||{},rule:'Ein einziger sichtbarer und handelbarer DecisionScore. 0-55,9 kein Neukauf; ab 56 sofort BUY. Grosse Rohscore-Spruenge werden zeitlich geglaettet, damit Datenquellenwechsel oder ein einzelner 5-Minuten-Tick nicht 72 auf 36 springen lassen.'}}
}
