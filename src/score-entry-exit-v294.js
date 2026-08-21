import {stableDecisionScoresV293} from './decision-score-v293.js';

const KEY='state/score-entry-exit-v294';
const V293_KEY='state/decision-score-v293';
const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();
const readKey=(storage,k,d)=>{try{return storage?.kv?.get(k)||d}catch{return d}};
const read=(storage,d)=>readKey(storage,KEY,d);
const write=(storage,v)=>{try{storage?.kv?.put(KEY,v)}catch{}};

export const SCORE_ENTRY_EXIT_V294={
  version:29.4,
  positiveExitDelta:10,
  negativeExitDelta:-15,
  scoreSource:'V29.4_CHART_ANCHORED_DECISION',
  requiresFullChartScore:true,
  partialScoreFreeze:true,
  minimumHoldMinutes:0,
  // A nearly flat chart must not make a held score collapse because another data field
  // disappeared or changed scale. The total score deviation from entry is constrained by
  // the actual price move since purchase; each scan is capped again separately.
  chartEnvelope:[
    {moveLt:.25,maxScoreDistance:3,maxStep:1},
    {moveLt:.75,maxScoreDistance:6,maxStep:2},
    {moveLt:1.50,maxScoreDistance:10,maxStep:3},
    {moveLt:3.00,maxScoreDistance:15,maxStep:5},
    {moveLt:Infinity,maxScoreDistance:30,maxStep:8}
  ]
};

function defaults(){return{version:29.4,entries:{},recent:[],stats:{entryScoresStored:0,recoveredEntryScores:0,positiveScoreExits:0,negativeScoreExits:0,partialScoreWaits:0,partialScoreFreezes:0,flatChartCaps:0},updatedAt:null}}

function priceOf(p={},c={},row={}){
  const values=[c?.price,c?.last_price,p?.last_price,p?.price,row?.price];
  for(const v of values)if(Number.isFinite(Number(v))&&Number(v)>0)return Number(v);
  return 0;
}
function entryPriceOf(p={},c={},fallback=0){
  const values=[p?.entry_price,p?.entryPrice,c?.entry_price,fallback];
  for(const v of values)if(Number.isFinite(Number(v))&&Number(v)>0)return Number(v);
  return 0;
}
function chartBand(absMove=0){return SCORE_ENTRY_EXIT_V294.chartEnvelope.find(x=>absMove<x.moveLt)||SCORE_ENTRY_EXIT_V294.chartEnvelope.at(-1)}
function pctMove(a,b){return a>0&&b>0?(a/b-1)*100:0}

export function scoreEntryExitDecisionV294(entryScore,currentScore,{partial=false}={}){
  const entry=num(entryScore,NaN),current=num(currentScore,NaN);
  if(!Number.isFinite(entry)||!Number.isFinite(current))return{action:'HOLD',reason:'missing_score',entryScore:entry,currentScore:current,delta:null};
  const delta=+(current-entry).toFixed(1);
  if(partial&&SCORE_ENTRY_EXIT_V294.requiresFullChartScore)return{action:'HOLD',reason:'partial_chart_score',entryScore:+entry.toFixed(1),currentScore:+current.toFixed(1),delta};
  if(delta>=SCORE_ENTRY_EXIT_V294.positiveExitDelta)return{action:'SELL',reason:'score_plus_10',entryScore:+entry.toFixed(1),currentScore:+current.toFixed(1),delta};
  if(delta<=SCORE_ENTRY_EXIT_V294.negativeExitDelta)return{action:'SELL',reason:'score_minus_15',entryScore:+entry.toFixed(1),currentScore:+current.toFixed(1),delta};
  return{action:'HOLD',reason:'inside_band',entryScore:+entry.toFixed(1),currentScore:+current.toFixed(1),delta};
}

function recoverEntry(s,p,row,candidate,mem,v293,now){
  if(mem.entries[s])return mem.entries[s];
  const oldPos=v293?.positions?.[s],oldCandidate=v293?.candidates?.[s];
  const recovered=oldPos&&Number.isFinite(Number(oldPos.stable))?oldPos:oldCandidate&&Number.isFinite(Number(oldCandidate.stable))?oldCandidate:null;
  const full=!row?.partial&&Number.isFinite(Number(row?.decisionScore??row?.holdScore??row?.buyScore));
  const score=recovered?num(recovered.stable):full?num(row?.decisionScore,row?.holdScore,row?.buyScore,NaN):NaN;
  if(!Number.isFinite(score))return null;
  const currentPrice=priceOf(p,candidate,row),entryPrice=entryPriceOf(p,candidate,currentPrice);
  const e={score:+score.toFixed(1),lastStable:+score.toFixed(1),entryPrice, lastPrice:currentPrice||entryPrice,at:now,lastAt:now,source:recovered?'RECOVERED_V293_SCORE':'FIRST_V294_FULL_SCORE',fullSeen:Boolean(full)};
  mem.entries[s]=e;return e;
}

export function positionScoresV294(state={},storage=null,now=Date.now(),update=false,workingMem=null){
  const base=stableDecisionScoresV293(state,storage,now,false),mem=workingMem||{...defaults(),...read(storage,defaults())};
  mem.entries={...(mem.entries||{})};mem.stats={...defaults().stats,...(mem.stats||{})};
  const v293=readKey(storage,V293_KEY,{candidates:{},positions:{}})||{candidates:{},positions:{}};
  const candidates=new Map(arr(state?.candidates).map(c=>[key(c),c])),baseCandidates=new Map(arr(base.ranking).map(r=>[key(r),r])),basePositions=new Map(arr(base.positionScores).map(r=>[key(r),r]));
  const rows=[];
  for(const p of arr(state?.positions)){
    const s=key(p);if(!s)continue;const candidate=candidates.get(s)||{},row=basePositions.get(s)||baseCandidates.get(s);if(!row)continue;
    const hadEntry=Boolean(mem.entries[s]),entry=recoverEntry(s,p,row,candidate,mem,v293,now);if(!entry)continue;
    if(!hadEntry&&entry.source==='RECOVERED_V293_SCORE')mem.stats.recoveredEntryScores++;
    const raw=num(row?.decisionScore,row?.holdScore,row?.buyScore,entry.lastStable),partial=Boolean(row?.partial),currentPrice=priceOf(p,candidate,row),entryPrice=entry.entryPrice>0?entry.entryPrice:entryPriceOf(p,candidate,currentPrice),lastPrice=entry.lastPrice>0?entry.lastPrice:currentPrice;
    const fromEntry=Math.abs(pctMove(currentPrice,entryPrice)),fromLast=Math.abs(pctMove(currentPrice,lastPrice)),band=chartBand(fromEntry),lastStable=num(entry.lastStable,entry.score),lo=clamp(entry.score-band.maxScoreDistance,0,100),hi=clamp(entry.score+band.maxScoreDistance,0,100);
    let stable=lastStable,step=0,frozen=false,capped=false;
    if(partial&&SCORE_ENTRY_EXIT_V294.partialScoreFreeze){
      frozen=true;mem.stats.partialScoreFreezes++;
    }else{
      const target=clamp(raw,lo,hi),lastBand=chartBand(fromLast),cap=Math.min(band.maxStep,lastBand.maxStep),wanted=target-lastStable;step=clamp(wanted,-cap,cap);stable=clamp(lastStable+step,0,100);capped=Math.abs(target-raw)>.05||Math.abs(wanted-step)>.05;if(capped)mem.stats.flatChartCaps++;
    }
    const out={...row,symbol:s,rawDecisionScore:+raw.toFixed(1),decisionScore:+stable.toFixed(1),buyScore:+stable.toFixed(1),holdScore:+stable.toFixed(1),fusionScore:+stable.toFixed(1),sellScore:+(100-stable).toFixed(1),entryDecisionScore:+num(entry.score).toFixed(1),scoreDeltaFromEntry:+(stable-num(entry.score)).toFixed(1),scoreDeltaThisScan:+step.toFixed(1),chartMoveFromEntryPct:+pctMove(currentPrice,entryPrice).toFixed(3),chartMoveLastScanPct:+pctMove(currentPrice,lastPrice).toFixed(3),scoreFrozenPartial:frozen,scoreChartCapped:capped,scoreSource:'V29.4_CHART_ANCHORED_DECISION',partial};
    rows.push(out);
    if(update){entry.lastStable=out.decisionScore;entry.entryPrice=entryPrice||entry.entryPrice;entry.lastPrice=currentPrice||entry.lastPrice;entry.lastAt=now;entry.fullSeen=entry.fullSeen||!partial;mem.entries[s]=entry}
  }
  rows.sort((a,b)=>b.decisionScore-a.decisionScore);
  if(update&&!workingMem){mem.updatedAt=new Date(now).toISOString();write(storage,mem)}
  return{version:29.4,positionScores:rows,candidateScores:base.ranking,mem};
}

function parsePlan(r){const raw=String(r?.response||r?.result?.response||''),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j?.actions)?j:null}catch{return null}}
function encode(r,plan){const raw=JSON.stringify(plan);if(r&&typeof r==='object'&&r.result&&typeof r.result==='object'&&'response'in r.result)return{...r,result:{...r.result,response:raw}};if(r&&typeof r==='object'&&'response'in r)return{...r,response:raw};return{response:raw}}
function isTradingPlanInput(input){return Boolean(input&&typeof input==='object'&&arr(input?.messages).some(m=>{const t=String(m?.content||'');return t.includes('Kandidaten=')&&t.includes(' Gehalten=')}))}

export function enforceScoreEntryExitV294(plan,state={},storage=null,now=Date.now()){
  if(!plan||!Array.isArray(plan.actions))return{plan,counters:{positiveScoreExits:0,negativeScoreExits:0,entryScoresStored:0,partialScoreWaits:0}};
  const mem={...defaults(),...read(storage,defaults())};mem.entries={...(mem.entries||{})};mem.recent=arr(mem.recent);mem.stats={...defaults().stats,...(mem.stats||{})};
  const base=stableDecisionScoresV293(state,storage,now,false),candidateScore=new Map(arr(base.ranking).map(r=>[key(r),r])),held=new Set(arr(state?.positions).map(p=>key(p)).filter(Boolean)),actions=plan.actions.map(a=>({...a})),actionIndex=new Map();
  actions.forEach((a,i)=>{const s=key(a);if(s&&!actionIndex.has(s))actionIndex.set(s,i)});
  const counters={positiveScoreExits:0,negativeScoreExits:0,entryScoresStored:0,partialScoreWaits:0};

  // Exact purchase baseline: store the exact stabilized BUY score and price before the
  // symbol can leave the candidate list on the next scan.
  for(const a of actions){
    const s=key(a);if(!s||held.has(s)||String(a?.action||'').toUpperCase()!=='BUY')continue;
    const row=candidateScore.get(s);if(!row)continue;const score=num(row?.decisionScore,row?.buyScore,NaN);if(!Number.isFinite(score))continue;
    const c=arr(state?.candidates).find(x=>key(x)===s)||{},price=priceOf({},c,row);
    mem.entries[s]={score:+score.toFixed(1),lastStable:+score.toFixed(1),entryPrice:price,lastPrice:price,at:now,lastAt:now,source:'BUY_DECISION_SCORE',fullSeen:true};counters.entryScoresStored++;
  }

  const continuity=positionScoresV294(state,storage,now,true,mem),positionScore=new Map(arr(continuity.positionScores).map(r=>[key(r),r]));
  for(const p of arr(state?.positions)){
    const s=key(p),entry=mem.entries[s],row=positionScore.get(s);if(!s||!entry||!row)continue;
    const d=scoreEntryExitDecisionV294(entry.score,row.decisionScore,{partial:Boolean(row?.partial)});
    if(d.reason==='partial_chart_score'){counters.partialScoreWaits++;continue}
    if(d.action!=='SELL')continue;
    let idx=actionIndex.get(s);if(idx===undefined){idx=actions.length;actionIndex.set(s,idx);actions.push({symbol:s,action:'HOLD',allocation_pct:0,confidence:.7,reason:'V29.4 score delta position'})}
    const positive=d.delta>=SCORE_ENTRY_EXIT_V294.positiveExitDelta;
    actions[idx]={...actions[idx],action:'SELL',allocation_pct:0,confidence:.88,reason:`V29.4 SCORE-EXIT: ${s} Einstiegsscore ${d.entryScore.toFixed(1)} -> chart-verankerter DecisionScore ${d.currentScore.toFixed(1)} (${d.delta>=0?'+':''}${d.delta.toFixed(1)} Punkte). ${positive?'Score seit Kauf um mindestens 10 Punkte verbessert: SELL.':'Score seit Kauf um mindestens 15 Punkte gefallen: SELL.'}`};
    if(positive)counters.positiveScoreExits++;else counters.negativeScoreExits++;
  }

  for(const [s,e] of Object.entries(mem.entries))if(!held.has(s)&&!actions.some(a=>key(a)===s&&String(a?.action||'').toUpperCase()==='BUY')&&now-num(e?.at,0)>24*60*60_000)delete mem.entries[s];
  for(const k of Object.keys(counters))mem.stats[k]=num(mem.stats[k])+num(counters[k]);mem.updatedAt=new Date(now).toISOString();mem.recent.push({at:now,...counters});mem.recent=mem.recent.slice(-120);write(storage,mem);
  plan.actions=actions;plan.summary=`${String(plan.summary||'').slice(0,150)} · V29.4 chart-verankert: +10 => SELL ${counters.positiveScoreExits} · -15 => SELL ${counters.negativeScoreExits}.`;
  return{plan,counters,entries:mem.entries,positionScores:continuity.positionScores};
}

export class ScoreEntryExitGuardV294{
  constructor(inner,{getState,storage,now}={}){this.inner=inner;this.getState=getState;this.storage=storage;this.now=now;this.latest=null}
  async run(model,input){const legacy=input===undefined&&model&&typeof model==='object',payload=legacy?model:input,state=typeof this.getState==='function'?(this.getState()||{}):{},r=legacy?await this.inner.run(payload):await this.inner.run(model,payload);if(!isTradingPlanInput(payload))return r;const p=parsePlan(r);if(!p)return r;const out=enforceScoreEntryExitV294(p,state,this.storage,typeof this.now==='function'?this.now():Date.now());this.latest=out;return encode(r,out.plan)}
  status(){const state=typeof this.getState==='function'?(this.getState()||{}):{},mem={...defaults(),...read(this.storage,defaults())},scores=positionScoresV294(state,this.storage,typeof this.now==='function'?this.now():Date.now(),false);return{enabled:true,version:29.4,authoritativePositionScoreExit:true,chartAnchoredPositionScore:true,thresholds:SCORE_ENTRY_EXIT_V294,entries:mem.entries||{},positionScores:scores.positionScores,latest:this.latest?.counters||null,stats:mem.stats||{},rule:'Der Kaufscore wird als feste Basis gespeichert. Ein Depotwert darf bei unvollständigen Daten nicht auf eine andere Score-Skala springen. Bei fast unverändertem Chart bleibt der Score nahe am Einstieg und bewegt sich pro Scan nur wenig. Erst der chart-verankerte DecisionScore kann bei +10 oder -15 Punkten einen SELL auslösen.'}}
}
