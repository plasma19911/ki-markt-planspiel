import {stableDecisionScoresV296} from './decision-score-v296.js';

const KEY='state/directional-position-score-v296';
const ENTRY_KEY='state/score-entry-exit-v294';
const REENTRY_KEY='state/score-reentry-v296';
const arr=v=>Array.isArray(v)?v:[];
const finite=v=>Number.isFinite(Number(v));
const num=(v,d=0)=>finite(v)?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();
const readKey=(storage,k,d)=>{try{return storage?.kv?.get(k)||d}catch{return d}};
const writeKey=(storage,k,v)=>{try{storage?.kv?.put(k,v)}catch{}};
const pctMove=(a,b)=>a>0&&b>0?(a/b-1)*100:0;

export const DIRECTIONAL_POSITION_SCORE_V296={
  version:'29.6-d1',
  flatChartPct:.35,
  flatScoreDistance:3,
  oppositeDirectionDistance:4,
  positiveDistancePerPct:5.5,
  negativeDistancePerPct:4.6,
  maxDirectionalDistance:30,
  positiveExitDelta:10,
  negativeExitDelta:-15,
  positiveExitRequiresPositiveChart:true,
  negativeExitRequiresNegativeChart:true,
  auditPerSymbol:120
};

function defaults(){return{version:'29.6-d1',positions:{},audit:{},stats:{updates:0,flatCorrections:0,directionCorrections:0,legacyScoreSellsSuppressed:0,positiveExits:0,negativeExits:0},updatedAt:null}}
function reentryDefaults(){return{version:29.6,locks:{},stats:{locksCreated:0,blocks:0,unlocks:0,terminalLocks:0},updatedAt:null}}

export function directionalLimitsV296(chartMovePct=0){
  const move=num(chartMovePct,0),a=Math.abs(move),cfg=DIRECTIONAL_POSITION_SCORE_V296;
  if(a<=cfg.flatChartPct)return{maxUp:cfg.flatScoreDistance,maxDown:cfg.flatScoreDistance,mode:'FLAT'};
  if(move>0){
    const maxUp=clamp(cfg.flatScoreDistance+(move-cfg.flatChartPct)*cfg.positiveDistancePerPct,cfg.flatScoreDistance,cfg.maxDirectionalDistance);
    return{maxUp:+maxUp.toFixed(2),maxDown:cfg.oppositeDirectionDistance,mode:'UP'};
  }
  const maxDown=clamp(cfg.flatScoreDistance+(a-cfg.flatChartPct)*cfg.negativeDistancePerPct,cfg.flatScoreDistance,cfg.maxDirectionalDistance);
  return{maxUp:cfg.oppositeDirectionDistance,maxDown:+maxDown.toFixed(2),mode:'DOWN'};
}

function stepCap(lastMovePct=0,ageMinutes=1,aligned=true){
  const a=Math.abs(num(lastMovePct,0));let cap=a<.15?.6:a<.35?1:a<.75?2:a<1.5?3.5:6;
  cap=Math.min(cap,Math.max(.6,num(ageMinutes,1)*1.5));
  if(!aligned)cap=Math.min(cap,.75);
  return cap;
}

export function directionalPositionStepV296({entryScore,lastStable,rawScore,chartMovePct,lastChartMovePct=0,ageMinutes=1,partial=false}={}){
  const entry=clamp(entryScore,0,100),raw=clamp(rawScore,0,100),limits=directionalLimitsV296(chartMovePct),lo=clamp(entry-limits.maxDown,0,100),hi=clamp(entry+limits.maxUp,0,100);
  const correctedPrior=clamp(lastStable,lo,hi);
  if(partial)return{score:+correctedPrior.toFixed(1),step:0,lo:+lo.toFixed(1),hi:+hi.toFixed(1),...limits,frozen:true,correctedPrior:Math.abs(correctedPrior-num(lastStable))>.05};
  const target=clamp(raw,lo,hi),wanted=target-correctedPrior,chart=num(chartMovePct,0),aligned=Math.abs(wanted)<.05||Math.sign(wanted)===Math.sign(chart)||Math.abs(chart)<=DIRECTIONAL_POSITION_SCORE_V296.flatChartPct;
  const cap=stepCap(lastChartMovePct,ageMinutes,aligned),step=clamp(wanted,-cap,cap),score=clamp(correctedPrior+step,lo,hi);
  return{score:+score.toFixed(1),step:+step.toFixed(2),lo:+lo.toFixed(1),hi:+hi.toFixed(1),target:+target.toFixed(1),...limits,frozen:false,aligned,cap:+cap.toFixed(2),correctedPrior:Math.abs(correctedPrior-num(lastStable))>.05};
}

function entryPrice(p={}){const v=Number(p?.entry_price??p?.entryPrice);return finite(v)&&v>0?v:0}
function currentPrice(p={}){const v=Number(p?.last_price??p?.price);return finite(v)&&v>0?v:0}
function auditPush(mem,s,row,now){
  const old=arr(mem.audit[s]),last=old.at(-1),changed=!last||Math.abs(num(last.decisionScore)-num(row.decisionScore))>=.1||now-num(last.at,0)>=30_000;
  if(!changed)return;old.push({at:now,symbol:s,entryScore:row.entryDecisionScore,rawScore:row.rawDecisionScore,decisionScore:row.decisionScore,deltaFromEntry:row.scoreDeltaFromEntry,entryPrice:row.entryPrice,currentPrice:row.currentPrice,chartMovePct:row.chartMoveFromEntryPct,lastChartMovePct:row.chartMoveLastScanPct,lo:row.scoreFloor,hi:row.scoreCeiling,mode:row.chartDirectionMode,partial:row.partial,correctedPrior:row.scorePriorCorrected});mem.audit[s]=old.slice(-DIRECTIONAL_POSITION_SCORE_V296.auditPerSymbol)
}

export function directionalPositionScoresV296(state={},storage=null,now=Date.now(),update=false){
  const mem={...defaults(),...readKey(storage,KEY,defaults())};mem.positions={...(mem.positions||{})};mem.audit={...(mem.audit||{})};mem.stats={...defaults().stats,...(mem.stats||{})};
  const entries=readKey(storage,ENTRY_KEY,{entries:{}})?.entries||{},base=stableDecisionScoresV296(state,storage,now,false),byPos=new Map(arr(base.positionScores).map(r=>[key(r),r])),byRank=new Map(arr(base.ranking).map(r=>[key(r),r])),rows=[];
  for(const p of arr(state?.positions)){
    const s=key(p),entry=entries[s];if(!s||!entry||!finite(entry.score))continue;
    const source=byPos.get(s)||byRank.get(s),partial=Boolean(source?.partial||!source),raw=finite(source?.decisionScore)?Number(source.decisionScore):num(entry.lastStable,entry.score),ep=entryPrice(p)||num(entry.entryPrice),cp=currentPrice(p);
    if(!(ep>0&&cp>0))continue;
    const prior=mem.positions[s],lastStable=finite(prior?.stable)?Number(prior.stable):num(entry.lastStable,entry.score),lastPrice=finite(prior?.price)&&prior.price>0?Number(prior.price):num(entry.lastPrice,cp),age=Math.max(.05,(now-num(prior?.at,now-60_000))/60000),chartMove=pctMove(cp,ep),lastMove=pctMove(cp,lastPrice);
    const d=directionalPositionStepV296({entryScore:entry.score,lastStable,rawScore:raw,chartMovePct:chartMove,lastChartMovePct:lastMove,ageMinutes:age,partial});
    const row={...(source||{}),symbol:s,position:true,partial,rawDecisionScore:+raw.toFixed(1),decisionScore:d.score,buyScore:d.score,holdScore:d.score,fusionScore:d.score,sellScore:+(100-d.score).toFixed(1),entryDecisionScore:+num(entry.score).toFixed(1),scoreDeltaFromEntry:+(d.score-num(entry.score)).toFixed(1),scoreDeltaThisScan:d.step,entryPrice:+ep.toFixed(4),currentPrice:+cp.toFixed(4),chartMoveFromEntryPct:+chartMove.toFixed(3),chartMoveLastScanPct:+lastMove.toFixed(3),scoreFloor:d.lo,scoreCeiling:d.hi,chartDirectionMode:d.mode,scorePriorCorrected:d.correctedPrior,scoreFrozenPartial:d.frozen,scoreDirectionAligned:d.aligned??null,scoreSource:'V29.6_DIRECTIONAL_ACTUAL_POSITION'};
    rows.push(row);
    if(update){if(d.correctedPrior){if(Math.abs(chartMove)<=DIRECTIONAL_POSITION_SCORE_V296.flatChartPct)mem.stats.flatCorrections++;else mem.stats.directionCorrections++}mem.positions[s]={at:now,stable:d.score,price:cp,entryScore:num(entry.score),entryPrice:ep};auditPush(mem,s,row,now)}
  }
  const held=new Set(arr(state?.positions).map(key).filter(Boolean));if(update){for(const s of Object.keys(mem.positions))if(!held.has(s))delete mem.positions[s];mem.stats.updates++;mem.updatedAt=new Date(now).toISOString();writeKey(storage,KEY,mem)}
  rows.sort((a,b)=>b.decisionScore-a.decisionScore);return{version:'29.6-d1',positionScores:rows,audit:mem.audit,stats:mem.stats,mem};
}

function parsePlan(r){const raw=String(r?.response||r?.result?.response||''),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j?.actions)?j:null}catch{return null}}
function encode(r,plan){const raw=JSON.stringify(plan);if(r&&typeof r==='object'&&r.result&&typeof r.result==='object'&&'response'in r.result)return{...r,result:{...r.result,response:raw}};if(r&&typeof r==='object'&&'response'in r)return{...r,response:raw};return{response:raw}}
function isTradingPlanInput(input){return Boolean(input&&typeof input==='object'&&arr(input?.messages).some(m=>{const t=String(m?.content||'');return t.includes('Kandidaten=')&&t.includes(' Gehalten=')}))}

export function enforceDirectionalPositionScoreV296(plan,state={},storage=null,now=Date.now()){
  if(!plan||!Array.isArray(plan.actions))return{plan,counters:{}};
  const out=directionalPositionScoresV296(state,storage,now,true),by=new Map(out.positionScores.map(r=>[r.symbol,r])),actions=plan.actions.map(a=>({...a})),idx=new Map();actions.forEach((a,i)=>{const s=key(a);if(s&&!idx.has(s))idx.set(s,i)});
  const re={...reentryDefaults(),...readKey(storage,REENTRY_KEY,reentryDefaults())};re.locks={...(re.locks||{})};re.stats={...reentryDefaults().stats,...(re.stats||{})};const counters={legacyScoreSellsSuppressed:0,positiveExits:0,negativeExits:0};
  for(const p of arr(state?.positions)){
    const s=key(p),row=by.get(s);if(!s||!row)continue;let i=idx.get(s),a=i===undefined?null:actions[i];
    if(a&&String(a?.action||'').toUpperCase()==='SELL'&&a?.emergencyExitV296===true)continue;
    const delta=num(row.scoreDeltaFromEntry),plus=delta>=DIRECTIONAL_POSITION_SCORE_V296.positiveExitDelta&&row.chartMoveFromEntryPct>0,minus=delta<=DIRECTIONAL_POSITION_SCORE_V296.negativeExitDelta&&row.chartMoveFromEntryPct<0;
    if(plus||minus){
      if(i===undefined){i=actions.length;idx.set(s,i);actions.push({symbol:s,action:'HOLD',allocation_pct:0});a=actions[i]}
      const kind=plus?'PLUS_10':'MINUS_15';actions[i]={...a,symbol:s,action:'SELL',allocation_pct:0,confidence:.9,scoreExitV294:true,scoreExitV297:true,scoreExitKind:kind,scoreExitEntry:row.entryDecisionScore,scoreExitCurrent:row.decisionScore,scoreExitDelta:delta,scoreExitChartMovePct:row.chartMoveFromEntryPct,reason:`V29.6 DIRECTIONAL SCORE-EXIT: ${s} ${row.entryDecisionScore.toFixed(1)} -> ${row.decisionScore.toFixed(1)} (${delta>=0?'+':''}${delta.toFixed(1)}) bei echtem Depotchart ${row.chartMoveFromEntryPct>=0?'+':''}${row.chartMoveFromEntryPct.toFixed(2)}%.`};
      const exitScore=row.decisionScore,rearmScore=plus?Math.max(56,exitScore-5):Math.max(56,exitScore+5);re.locks[s]={at:now,kind,exitScore,rearmScore};re.stats.locksCreated=num(re.stats.locksCreated)+1;if(plus)counters.positiveExits++;else counters.negativeExits++;continue;
    }
    if(a&&String(a?.action||'').toUpperCase()==='SELL'){
      actions[i]={...a,action:'HOLD',allocation_pct:0,scoreExitV294:false,scoreExitV297:false,reason:`V29.6 DIRECTIONAL HOLD: ${s} echter Depotchart ${row.chartMoveFromEntryPct>=0?'+':''}${row.chartMoveFromEntryPct.toFixed(2)}%, Positionsscore ${row.decisionScore.toFixed(1)} (${delta>=0?'+':''}${delta.toFixed(1)} seit Kauf). Kein +10/-15-Exit.`};counters.legacyScoreSellsSuppressed++;delete re.locks[s]
    }
  }
  const mem=out.mem;mem.stats.legacyScoreSellsSuppressed=num(mem.stats.legacyScoreSellsSuppressed)+counters.legacyScoreSellsSuppressed;mem.stats.positiveExits=num(mem.stats.positiveExits)+counters.positiveExits;mem.stats.negativeExits=num(mem.stats.negativeExits)+counters.negativeExits;writeKey(storage,KEY,mem);re.updatedAt=new Date(now).toISOString();writeKey(storage,REENTRY_KEY,re);
  plan.actions=actions;plan.summary=`${String(plan.summary||'').slice(0,135)} · Richtungs-Score: ${counters.positiveExits} +10 SELL · ${counters.negativeExits} -15 SELL · ${counters.legacyScoreSellsSuppressed} falsche SELL blockiert.`;return{plan,counters,positionScores:out.positionScores,audit:out.audit}
}

export class DirectionalPositionScoreGuardV296{
  constructor(inner,{getState,storage,now}={}){this.inner=inner;this.getState=getState;this.storage=storage;this.now=now;this.latest=null}
  async run(model,input){const legacy=input===undefined&&model&&typeof model==='object',payload=legacy?model:input,state=typeof this.getState==='function'?(this.getState()||{}):{},r=legacy?await this.inner.run(payload):await this.inner.run(model,payload);if(!isTradingPlanInput(payload))return r;const p=parsePlan(r);if(!p)return r;const out=enforceDirectionalPositionScoreV296(p,state,this.storage,typeof this.now==='function'?this.now():Date.now());this.latest=out;return encode(r,out.plan)}
  status(){const state=typeof this.getState==='function'?(this.getState()||{}):{},out=directionalPositionScoresV296(state,this.storage,typeof this.now==='function'?this.now():Date.now(),false);return{enabled:true,version:'29.6-d1',authoritativeHeldScore:true,usesActualPositionPriceFirst:true,directionalChartEnvelope:true,thresholds:DIRECTIONAL_POSITION_SCORE_V296,positionScores:out.positionScores,audit:out.audit,stats:out.stats,latest:this.latest?.counters||null,rule:'Bei flachem Depotchart bleibt der Positionsscore eng am Einstieg. Negative Scorebewegung bekommt nur dann deutlich Spielraum, wenn der echte Depotkurs seit Einstieg ebenfalls fällt; positive entsprechend bei steigendem Kurs. Dadurch kann ein Feed-/Kandidatensprung bei ruhigem Chart keinen beinahe -15 SELL mehr erzeugen.'}}
}
