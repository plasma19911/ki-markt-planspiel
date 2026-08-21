import {stableDecisionScoresV296} from './decision-score-v296.js';

const KEY='state/score-entry-exit-v294';
const V296_KEY='state/decision-score-v296';
const V293_KEY='state/decision-score-v293';
const arr=v=>Array.isArray(v)?v:[];
const finite=v=>Number.isFinite(Number(v));
const num=(v,d=0)=>finite(v)?Number(v):d;
const firstFinite=(...v)=>{for(const x of v)if(finite(x))return Number(x);return NaN};
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();
const readKey=(storage,k,d)=>{try{return storage?.kv?.get(k)||d}catch{return d}};
const read=(storage,d)=>readKey(storage,KEY,d);
const write=(storage,v)=>{try{storage?.kv?.put(KEY,v)}catch{}};

export const SCORE_ENTRY_EXIT_V294={
  version:29.4,
  scoreCoreVersion:29.6,
  positiveExitDelta:10,
  negativeExitDelta:-15,
  positiveExitRequiresPositiveChart:true,
  scoreSource:'V29.6_COHERENT_CHART_ANCHORED_DECISION',
  requiresFullChartScore:true,
  partialScoreFreeze:true,
  baselineRequiresActualPosition:true,
  minimumHoldMinutes:0,
  chartEnvelope:[
    {moveLt:.25,maxScoreDistance:3,maxStep:1},
    {moveLt:.75,maxScoreDistance:6,maxStep:2},
    {moveLt:1.50,maxScoreDistance:10,maxStep:3},
    {moveLt:3.00,maxScoreDistance:15,maxStep:5},
    {moveLt:Infinity,maxScoreDistance:30,maxStep:8}
  ]
};

function defaults(){return{version:29.4,entries:{},recent:[],stats:{entryScoresStored:0,recoveredEntryScores:0,positiveScoreExits:0,negativeScoreExits:0,partialScoreWaits:0,partialScoreFreezes:0,flatChartCaps:0,positiveScoreWaitsForChart:0,stalePendingBaselinesReplaced:0},updatedAt:null}}
function priceOf(p={},c={},row={}){const values=[p?.last_price,p?.price,c?.price,c?.last_price,row?.price];for(const v of values)if(finite(v)&&Number(v)>0)return Number(v);return 0}
function entryPriceOf(p={},c={},fallback=0){const values=[p?.entry_price,p?.entryPrice,c?.entry_price,fallback];for(const v of values)if(finite(v)&&Number(v)>0)return Number(v);return 0}
function openedAt(p={}){const t=Date.parse(String(p?.opened_at??p?.openedAt??''));return Number.isFinite(t)?t:0}
function chartBand(absMove=0){return SCORE_ENTRY_EXIT_V294.chartEnvelope.find(x=>absMove<x.moveLt)||SCORE_ENTRY_EXIT_V294.chartEnvelope.at(-1)}
function pctMove(a,b){return a>0&&b>0?(a/b-1)*100:0}

export function scoreEntryExitDecisionV294(entryScore,currentScore,{partial=false,chartMoveFromEntryPct=0}={}){
  const entry=num(entryScore,NaN),current=num(currentScore,NaN),chartMove=num(chartMoveFromEntryPct,0);
  if(!finite(entry)||!finite(current))return{action:'HOLD',reason:'missing_score',entryScore:entry,currentScore:current,delta:null,chartMove};
  const delta=+(current-entry).toFixed(1);
  if(partial&&SCORE_ENTRY_EXIT_V294.requiresFullChartScore)return{action:'HOLD',reason:'partial_chart_score',entryScore:+entry.toFixed(1),currentScore:+current.toFixed(1),delta,chartMove};
  if(delta>=SCORE_ENTRY_EXIT_V294.positiveExitDelta){
    if(SCORE_ENTRY_EXIT_V294.positiveExitRequiresPositiveChart&&chartMove<=0)return{action:'HOLD',reason:'plus_10_wait_positive_chart',entryScore:+entry.toFixed(1),currentScore:+current.toFixed(1),delta,chartMove};
    return{action:'SELL',reason:'score_plus_10',entryScore:+entry.toFixed(1),currentScore:+current.toFixed(1),delta,chartMove};
  }
  if(delta<=SCORE_ENTRY_EXIT_V294.negativeExitDelta)return{action:'SELL',reason:'score_minus_15',entryScore:+entry.toFixed(1),currentScore:+current.toFixed(1),delta,chartMove};
  return{action:'HOLD',reason:'inside_band',entryScore:+entry.toFixed(1),currentScore:+current.toFixed(1),delta,chartMove};
}

function recoverScoreSeed(s,v296,v293){
  const sources=[v296?.positions?.[s],v296?.candidates?.[s],v293?.positions?.[s],v293?.candidates?.[s]];
  for(const x of sources)if(x&&finite(x.stable))return x;
  return null;
}
function recoverEntry(s,p,row,candidate,mem,v296,v293,now){
  const existing=mem.entries[s];
  if(existing?.source==='CONFIRMED_POSITION_BASELINE'&&finite(existing.score))return existing;
  const recovered=recoverScoreSeed(s,v296,v293),rowScore=firstFinite(row?.decisionScore,row?.holdScore,row?.buyScore),full=!row?.partial&&finite(rowScore);
  const score=recovered?num(recovered.stable):existing&&finite(existing.score)?num(existing.score):full?rowScore:NaN;
  if(!finite(score))return null;
  const currentPrice=priceOf(p,candidate,row),entryPrice=entryPriceOf(p,candidate,currentPrice),opened=openedAt(p)||now;
  const e={score:+score.toFixed(1),lastStable:+score.toFixed(1),entryPrice,lastPrice:currentPrice||entryPrice,at:opened,lastAt:now,source:'CONFIRMED_POSITION_BASELINE',seedSource:recovered?'COHERENT_SCORE_MEMORY':existing?'LEGACY_PENDING_BASELINE':'FIRST_FULL_POSITION_SCORE',fullSeen:Boolean(full)};
  mem.entries[s]=e;return e;
}

export function positionScoresV294(state={},storage=null,now=Date.now(),update=false,workingMem=null){
  const base=stableDecisionScoresV296(state,storage,now,false),mem=workingMem||{...defaults(),...read(storage,defaults())};
  mem.entries={...(mem.entries||{})};mem.stats={...defaults().stats,...(mem.stats||{})};
  const v296=readKey(storage,V296_KEY,{candidates:{},positions:{}})||{candidates:{},positions:{}},v293=readKey(storage,V293_KEY,{candidates:{},positions:{}})||{candidates:{},positions:{}};
  const candidates=new Map(arr(state?.candidates).map(c=>[key(c),c])),baseCandidates=new Map(arr(base.ranking).map(r=>[key(r),r])),basePositions=new Map(arr(base.positionScores).map(r=>[key(r),r])),rows=[];
  for(const p of arr(state?.positions)){
    const s=key(p);if(!s)continue;const candidate=candidates.get(s)||{},row=basePositions.get(s)||baseCandidates.get(s);if(!row)continue;
    const previous=mem.entries[s],wasConfirmed=previous?.source==='CONFIRMED_POSITION_BASELINE',entry=recoverEntry(s,p,row,candidate,mem,v296,v293,now);if(!entry)continue;
    if(update&&!wasConfirmed){mem.stats.entryScoresStored++;if(previous)mem.stats.stalePendingBaselinesReplaced++;if(entry.seedSource==='COHERENT_SCORE_MEMORY')mem.stats.recoveredEntryScores++}
    const raw=firstFinite(row?.decisionScore,row?.holdScore,row?.buyScore,entry.lastStable),partial=Boolean(row?.partial),currentPrice=priceOf(p,candidate,row),actualEntryPrice=entryPriceOf(p,candidate,entry.entryPrice||currentPrice),entryPrice=actualEntryPrice||entry.entryPrice||currentPrice,lastPrice=entry.lastPrice>0?entry.lastPrice:currentPrice;
    const chartMove=pctMove(currentPrice,entryPrice),fromEntry=Math.abs(chartMove),fromLast=Math.abs(pctMove(currentPrice,lastPrice)),band=chartBand(fromEntry),lastStable=num(entry.lastStable,entry.score),lo=clamp(entry.score-band.maxScoreDistance,0,100),hi=clamp(entry.score+band.maxScoreDistance,0,100);
    let stable=lastStable,step=0,frozen=false,capped=false;
    if(partial&&SCORE_ENTRY_EXIT_V294.partialScoreFreeze){frozen=true;if(update)mem.stats.partialScoreFreezes++}
    else{const target=clamp(raw,lo,hi),lastBand=chartBand(fromLast),cap=Math.min(band.maxStep,lastBand.maxStep),wanted=target-lastStable;step=clamp(wanted,-cap,cap);stable=clamp(lastStable+step,0,100);capped=Math.abs(target-raw)>.05||Math.abs(wanted-step)>.05;if(update&&capped)mem.stats.flatChartCaps++}
    const out={...row,symbol:s,rawDecisionScore:+num(raw,stable).toFixed(1),decisionScore:+stable.toFixed(1),buyScore:+stable.toFixed(1),holdScore:+stable.toFixed(1),fusionScore:+stable.toFixed(1),sellScore:+(100-stable).toFixed(1),entryDecisionScore:+num(entry.score).toFixed(1),scoreDeltaFromEntry:+(stable-num(entry.score)).toFixed(1),scoreDeltaThisScan:+step.toFixed(1),chartMoveFromEntryPct:+chartMove.toFixed(3),chartMoveLastScanPct:+pctMove(currentPrice,lastPrice).toFixed(3),scoreFrozenPartial:frozen,scoreChartCapped:capped,scoreSource:'V29.6_COHERENT_CHART_ANCHORED_DECISION',partial};
    rows.push(out);
    if(update){entry.lastStable=out.decisionScore;entry.entryPrice=entryPrice||entry.entryPrice;entry.lastPrice=currentPrice||entry.lastPrice;entry.lastAt=now;entry.fullSeen=entry.fullSeen||!partial;mem.entries[s]=entry}
  }
  rows.sort((a,b)=>b.decisionScore-a.decisionScore);if(update&&!workingMem){mem.updatedAt=new Date(now).toISOString();write(storage,mem)}
  return{version:29.4,scoreCoreVersion:29.6,positionScores:rows,candidateScores:base.ranking,mem};
}

function parsePlan(r){const raw=String(r?.response||r?.result?.response||''),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j?.actions)?j:null}catch{return null}}
function encode(r,plan){const raw=JSON.stringify(plan);if(r&&typeof r==='object'&&r.result&&typeof r.result==='object'&&'response'in r.result)return{...r,result:{...r.result,response:raw}};if(r&&typeof r==='object'&&'response'in r)return{...r,response:raw};return{response:raw}}
function isTradingPlanInput(input){return Boolean(input&&typeof input==='object'&&arr(input?.messages).some(m=>{const t=String(m?.content||'');return t.includes('Kandidaten=')&&t.includes(' Gehalten=')}))}

export function enforceScoreEntryExitV294(plan,state={},storage=null,now=Date.now()){
  if(!plan||!Array.isArray(plan.actions))return{plan,counters:{}};
  const mem={...defaults(),...read(storage,defaults())};mem.entries={...(mem.entries||{})};mem.recent=arr(mem.recent);mem.stats={...defaults().stats,...(mem.stats||{})};
  const held=new Set(arr(state?.positions).map(p=>key(p)).filter(Boolean)),actions=plan.actions.map(a=>({...a})),actionIndex=new Map();actions.forEach((a,i)=>{const s=key(a);if(s&&!actionIndex.has(s))actionIndex.set(s,i)});
  const counters={positiveScoreExits:0,negativeScoreExits:0,entryScoresStored:0,partialScoreWaits:0,positiveScoreWaitsForChart:0};

  // V29.6 deliberately does NOT store a baseline from an inner planned BUY here. The final
  // outer BUY controller may still reject that plan. A baseline is confirmed only once the
  // symbol actually appears in state.positions on a later decision.
  const beforeStored=num(mem.stats.entryScoresStored),continuity=positionScoresV294(state,storage,now,true,mem),positionScore=new Map(arr(continuity.positionScores).map(r=>[key(r),r]));
  counters.entryScoresStored=Math.max(0,num(mem.stats.entryScoresStored)-beforeStored);
  for(const p of arr(state?.positions)){
    const s=key(p),entry=mem.entries[s],row=positionScore.get(s);if(!s||!entry||!row)continue;const d=scoreEntryExitDecisionV294(entry.score,row.decisionScore,{partial:Boolean(row?.partial),chartMoveFromEntryPct:row.chartMoveFromEntryPct});
    if(d.reason==='partial_chart_score'){counters.partialScoreWaits++;continue}if(d.reason==='plus_10_wait_positive_chart'){counters.positiveScoreWaitsForChart++;continue}if(d.action!=='SELL')continue;
    let i=actionIndex.get(s);if(i===undefined){i=actions.length;actionIndex.set(s,i);actions.push({symbol:s,action:'HOLD',allocation_pct:0,confidence:.7,reason:'V29.4 score delta position'})}
    const positive=d.reason==='score_plus_10',kind=positive?'PLUS_10':'MINUS_15';actions[i]={...actions[i],action:'SELL',allocation_pct:0,confidence:.88,scoreExitV294:true,scoreExitKind:kind,scoreExitEntry:d.entryScore,scoreExitCurrent:d.currentScore,scoreExitDelta:d.delta,scoreExitChartMovePct:d.chartMove,reason:`V29.4 SCORE-EXIT: ${s} Einstiegsscore ${d.entryScore.toFixed(1)} -> chart-verankerter DecisionScore ${d.currentScore.toFixed(1)} (${d.delta>=0?'+':''}${d.delta.toFixed(1)} Punkte) · Chart ${d.chartMove>=0?'+':''}${d.chartMove.toFixed(2)}%. ${positive?'Score +10 und Chart seit Kauf positiv: SELL.':'Score seit Kauf -15: SELL.'}`};if(positive)counters.positiveScoreExits++;else counters.negativeScoreExits++;
  }
  // Pending baselines are obsolete in V29.6. Keep only symbols that are actually held.
  for(const s of Object.keys(mem.entries))if(!held.has(s))delete mem.entries[s];
  for(const k of ['positiveScoreExits','negativeScoreExits','partialScoreWaits','positiveScoreWaitsForChart'])mem.stats[k]=num(mem.stats[k])+num(counters[k]);mem.updatedAt=new Date(now).toISOString();mem.recent.push({at:now,...counters});mem.recent=mem.recent.slice(-120);write(storage,mem);plan.actions=actions;plan.summary=`${String(plan.summary||'').slice(0,145)} · V29.4/V29.6: +10 bei positivem Chart => SELL ${counters.positiveScoreExits} · -15 => SELL ${counters.negativeScoreExits}.`;
  return{plan,counters,entries:mem.entries,positionScores:continuity.positionScores};
}

export class ScoreEntryExitGuardV294{
  constructor(inner,{getState,storage,now}={}){this.inner=inner;this.getState=getState;this.storage=storage;this.now=now;this.latest=null}
  async run(model,input){const legacy=input===undefined&&model&&typeof model==='object',payload=legacy?model:input,state=typeof this.getState==='function'?(this.getState()||{}):{},r=legacy?await this.inner.run(payload):await this.inner.run(model,payload);if(!isTradingPlanInput(payload))return r;const p=parsePlan(r);if(!p)return r;const out=enforceScoreEntryExitV294(p,state,this.storage,typeof this.now==='function'?this.now():Date.now());this.latest=out;return encode(r,out.plan)}
  status(){const state=typeof this.getState==='function'?(this.getState()||{}):{},mem={...defaults(),...read(this.storage,defaults())},scores=positionScoresV294(state,this.storage,typeof this.now==='function'?this.now():Date.now(),false);return{enabled:true,version:29.4,scoreCoreVersion:29.6,authoritativePositionScoreExit:true,chartAnchoredPositionScore:true,baselineRequiresActualPosition:true,positiveExitRequiresPositiveChart:true,thresholds:SCORE_ENTRY_EXIT_V294,entries:mem.entries||{},positionScores:scores.positionScores,latest:this.latest?.counters||null,stats:mem.stats||{},rule:'Die Positionsbasis wird erst bestätigt, wenn der Titel wirklich im Depot steht. Innere, später verworfene BUY-Pläne können keine falsche Basis hinterlassen. +10 führt nur bei positivem Chart seit Kauf zum SELL; -15 führt zum SELL.'}}
}
