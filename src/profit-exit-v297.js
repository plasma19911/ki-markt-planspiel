import {directionalPositionScoresV296} from './directional-position-score-v296.js';

const KEY='state/profit-exit-v297';
const REENTRY_KEY='state/score-reentry-v296';
const arr=v=>Array.isArray(v)?v:[];
const finite=v=>Number.isFinite(Number(v));
const num=(v,d=0)=>finite(v)?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();
const readKey=(storage,k,d)=>{try{return storage?.kv?.get(k)||d}catch{return d}};
const writeKey=(storage,k,v)=>{try{storage?.kv?.put(k,v)}catch{}};

export const PROFIT_EXIT_V297={
  version:29.71,
  profitabilityPatch:'29.7.1-profit-fade-lock',
  minProfitPct:.8,
  mediumProfitPct:2.0,
  largeProfitPct:3.5,
  profitLockPct:5.0,
  smallProfitScoreDelta:10,
  mediumProfitScoreDelta:7,
  largeProfitScoreDelta:4,
  smallProfitFadeDelta:-3,
  mediumProfitFadeDelta:-1,
  largeProfitFadeDelta:0,
  fadeScoreStep:-1.0,
  fadeChartStepPct:-.12,
  highScoreTarget:99,
  strongRiseScoreStep:1.0,
  strongRiseChartStepPct:.15,
  reentryPullbackPoints:5,
  maxProfitScoreDistance:30
};

function defaults(){return{version:29.71,positions:{},audit:{},stats:{updates:0,profitScoreAdjusted:0,profitSells:0,profitLocks:0,profitFadeLocks:0,strongRiseHolds:0,oldProfitSellsSuppressed:0},updatedAt:null}}
function reentryDefaults(){return{version:29.6,locks:{},stats:{locksCreated:0,blocks:0,unlocks:0,terminalLocks:0},updatedAt:null}}

export function requiredProfitScoreDeltaV297(entryScore=0,chartMovePct=0){
  const chart=num(chartMovePct,0),entry=clamp(entryScore,0,100),c=PROFIT_EXIT_V297;
  if(chart<c.minProfitPct)return Infinity;
  const base=chart>=c.largeProfitPct?c.largeProfitScoreDelta:chart>=c.mediumProfitPct?c.mediumProfitScoreDelta:c.smallProfitScoreDelta;
  const highScoreHeadroom=Math.max(0,c.highScoreTarget-entry);
  return +Math.min(base,highScoreHeadroom).toFixed(1);
}
function profitFadeLimit(chart=0){const c=PROFIT_EXIT_V297;return chart>=c.largeProfitPct?c.largeProfitFadeDelta:chart>=c.mediumProfitPct?c.mediumProfitFadeDelta:c.smallProfitFadeDelta}

export function profitDecisionV297({entryScore=0,currentScore=0,chartMovePct=0,scoreDeltaThisScan=0,chartMoveLastScanPct=0}={}){
  const c=PROFIT_EXIT_V297,entry=clamp(entryScore,0,100),current=clamp(currentScore,0,100),chart=num(chartMovePct,0),delta=+(current-entry).toFixed(1),scoreStep=num(scoreDeltaThisScan,0),chartStep=num(chartMoveLastScanPct,0);
  const strongRise=scoreStep>=c.strongRiseScoreStep&&chartStep>=c.strongRiseChartStepPct;
  if(chart<c.minProfitPct)return{action:'HOLD',reason:'profit_below_minimum',entryScore:entry,currentScore:current,delta,chartMovePct:chart,requiredDelta:Infinity,fadeLimit:null,scoreStep,chartStep,strongRise};
  if(chart>=c.profitLockPct){
    if(strongRise)return{action:'HOLD',reason:'profit_5_strong_rise',entryScore:entry,currentScore:current,delta,chartMovePct:chart,requiredDelta:0,fadeLimit:0,scoreStep,chartStep,strongRise};
    return{action:'SELL',reason:'profit_lock_5',entryScore:entry,currentScore:current,delta,chartMovePct:chart,requiredDelta:0,fadeLimit:0,scoreStep,chartStep,strongRise};
  }
  if(strongRise)return{action:'HOLD',reason:'profit_strong_rise',entryScore:entry,currentScore:current,delta,chartMovePct:chart,requiredDelta:requiredProfitScoreDeltaV297(entry,chart),fadeLimit:profitFadeLimit(chart),scoreStep,chartStep,strongRise};
  const fadeLimit=profitFadeLimit(chart),scoreFade=delta<=fadeLimit,jointFade=scoreStep<=c.fadeScoreStep&&chartStep<=c.fadeChartStepPct,mediumFade=chart>=c.mediumProfitPct&&(scoreStep<=c.fadeScoreStep||chartStep<=c.fadeChartStepPct),largeFade=chart>=c.largeProfitPct&&(delta<=c.largeProfitFadeDelta||scoreStep<0||chartStep<0);
  if(scoreFade||jointFade||mediumFade||largeFade){
    const reason=chart>=c.largeProfitPct?'profit_3_5_fade_lock':chart>=c.mediumProfitPct?'profit_2_fade_lock':'profit_0_8_fade_lock';
    return{action:'SELL',reason,entryScore:entry,currentScore:current,delta,chartMovePct:chart,requiredDelta:requiredProfitScoreDeltaV297(entry,chart),fadeLimit,scoreStep,chartStep,strongRise,scoreFade,jointFade,mediumFade,largeFade};
  }
  return{action:'HOLD',reason:'profit_running_not_fading',entryScore:entry,currentScore:current,delta,chartMovePct:chart,requiredDelta:requiredProfitScoreDeltaV297(entry,chart),fadeLimit,scoreStep,chartStep,strongRise};
}

function profitScoreCeiling(entryScore,chartMovePct){
  const c=PROFIT_EXIT_V297,entry=clamp(entryScore,0,100),chart=Math.max(0,num(chartMovePct,0));
  if(chart<=.35)return clamp(entry+3,0,100);
  let distance;
  if(chart<c.minProfitPct)distance=3+((chart-.35)/(c.minProfitPct-.35))*7;
  else distance=10+Math.min(c.maxProfitScoreDistance-10,(chart-c.minProfitPct)*2);
  return clamp(entry+distance,0,100);
}
function profitStepCap(chartMovePct,ageMinutes){
  const c=PROFIT_EXIT_V297,chart=num(chartMovePct,0),tier=chart>=c.profitLockPct?5:chart>=c.largeProfitPct?4:chart>=c.mediumProfitPct?3:chart>=c.minProfitPct?2:1;
  return Math.min(tier,Math.max(.5,num(ageMinutes,1)*2));
}

export function profitAdjustedPositionScoresV297(state={},storage=null,now=Date.now(),update=false){
  const base=directionalPositionScoresV296(state,storage,now,false),mem={...defaults(),...readKey(storage,KEY,defaults())};
  mem.positions={...(mem.positions||{})};mem.audit={...(mem.audit||{})};mem.stats={...defaults().stats,...(mem.stats||{})};
  const rows=[];
  for(const row of arr(base.positionScores)){
    const s=key(row);if(!s)continue;const entry=clamp(row.entryDecisionScore,0,100),chart=num(row.chartMoveFromEntryPct,0),baseScore=clamp(row.decisionScore,0,100),raw=clamp(row.rawDecisionScore,0,100),prev=mem.positions[s],age=Math.max(.05,(now-num(prev?.at,now-60_000))/60000);
    let score=baseScore,step=0,ceiling=baseScore;
    if(chart>0){
      ceiling=profitScoreCeiling(entry,chart);
      const prior=clamp(Math.max(baseScore,num(prev?.stable,baseScore)),baseScore,ceiling),target=clamp(Math.max(baseScore,raw),baseScore,ceiling),wanted=target-prior,cap=profitStepCap(chart,age);
      step=clamp(wanted,-cap,cap);score=clamp(prior+step,baseScore,ceiling);
    }
    const out={...row,preProfitDecisionScore:baseScore,decisionScore:+score.toFixed(1),buyScore:+score.toFixed(1),holdScore:+score.toFixed(1),fusionScore:+score.toFixed(1),sellScore:+(100-score).toFixed(1),scoreDeltaFromEntry:+(score-entry).toFixed(1),profitScoreDeltaThisScan:+step.toFixed(2),profitScoreCeiling:+ceiling.toFixed(1),profitScoreSource:'V29.7_ADAPTIVE_PROFIT_SCORE'};
    rows.push(out);
    if(update){
      if(Math.abs(score-baseScore)>=.05)mem.stats.profitScoreAdjusted++;
      mem.positions[s]={at:now,stable:score,entryScore:entry,chartMovePct:chart};
      const audit=arr(mem.audit[s]);audit.push({at:now,symbol:s,entryScore:entry,rawScore:raw,baseDecisionScore:baseScore,decisionScore:out.decisionScore,chartMovePct:chart,scoreDeltaFromEntry:out.scoreDeltaFromEntry,profitScoreCeiling:out.profitScoreCeiling,profitScoreDeltaThisScan:out.profitScoreDeltaThisScan});mem.audit[s]=audit.slice(-120);
    }
  }
  if(update){const held=new Set(arr(state?.positions).map(key).filter(Boolean));for(const s of Object.keys(mem.positions))if(!held.has(s))delete mem.positions[s];mem.stats.updates++;mem.updatedAt=new Date(now).toISOString();writeKey(storage,KEY,mem)}
  rows.sort((a,b)=>b.decisionScore-a.decisionScore);return{version:29.71,positionScores:rows,audit:mem.audit,stats:mem.stats,mem};
}

function parsePlan(r){const raw=String(r?.response||r?.result?.response||''),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j?.actions)?j:null}catch{return null}}
function encode(r,plan){const raw=JSON.stringify(plan);if(r&&typeof r==='object'&&r.result&&typeof r.result==='object'&&'response'in r.result)return{...r,result:{...r.result,response:raw}};if(r&&typeof r==='object'&&'response'in r)return{...r,response:raw};return{response:raw}}
function isTradingPlanInput(input){return Boolean(input&&typeof input==='object'&&arr(input?.messages).some(m=>{const t=String(m?.content||'');return t.includes('Kandidaten=')&&t.includes(' Gehalten=')}))}

export function enforceProfitExitV297(plan,state={},storage=null,now=Date.now()){
  if(!plan||!Array.isArray(plan.actions))return{plan,counters:{}};
  const out=profitAdjustedPositionScoresV297(state,storage,now,true),by=new Map(out.positionScores.map(r=>[r.symbol,r])),actions=plan.actions.map(a=>({...a})),idx=new Map();actions.forEach((a,i)=>{const s=key(a);if(s&&!idx.has(s))idx.set(s,i)});
  const re={...reentryDefaults(),...readKey(storage,REENTRY_KEY,reentryDefaults())};re.locks={...(re.locks||{})};re.stats={...reentryDefaults().stats,...(re.stats||{})};
  const counters={profitSells:0,profitLocks:0,profitFadeLocks:0,strongRiseHolds:0,oldProfitSellsSuppressed:0};
  for(const p of arr(state?.positions)){
    const s=key(p),row=by.get(s);if(!s||!row)continue;let i=idx.get(s),a=i===undefined?null:actions[i];
    if(a&&String(a?.action||'').toUpperCase()==='SELL'&&a?.emergencyExitV296===true)continue;
    if(a&&String(a?.action||'').toUpperCase()==='SELL'&&String(a?.scoreExitKind||'')==='MINUS_15')continue;
    const d=profitDecisionV297({entryScore:row.entryDecisionScore,currentScore:row.decisionScore,chartMovePct:row.chartMoveFromEntryPct,scoreDeltaThisScan:row.profitScoreDeltaThisScan,chartMoveLastScanPct:row.chartMoveLastScanPct});
    if(d.action==='SELL'){
      if(i===undefined){i=actions.length;idx.set(s,i);actions.push({symbol:s,action:'HOLD',allocation_pct:0});a=actions[i]}
      const tier=d.reason==='profit_lock_5'?'5_PERCENT_LOCK':d.reason==='profit_3_5_fade_lock'?'3_5_PERCENT_FADE_LOCK':d.reason==='profit_2_fade_lock'?'2_PERCENT_FADE_LOCK':'0_8_PERCENT_FADE_LOCK';
      actions[i]={...a,symbol:s,action:'SELL',allocation_pct:0,confidence:.9,scoreExitV294:false,scoreExitV297:true,scoreExitKind:'PROFIT_FADE_LOCK',profitExitV297:true,profitExitTierV297:tier,profitFadeExitV297:d.reason!=='profit_lock_5',scoreExitEntry:d.entryScore,scoreExitCurrent:d.currentScore,scoreExitDelta:d.delta,scoreExitChartMovePct:d.chartMovePct,requiredProfitScoreDeltaV297:d.requiredDelta,profitFadeLimitV297:d.fadeLimit,reason:`V29.7.1 GEWINN-SICHERUNG: ${s} Chart +${d.chartMovePct.toFixed(2)}%, Einstiegsscore ${d.entryScore.toFixed(1)} -> ${d.currentScore.toFixed(1)} (${d.delta>=0?'+':''}${d.delta.toFixed(1)}). ${tier==='5_PERCENT_LOCK'?'Ab +5% wird der Gewinn gesichert, weil Score und Chart nicht mehr stark gemeinsam steigen.':`Der Gewinn läuft nicht mehr sauber weiter: Fade-Grenze ${Number.isFinite(d.fadeLimit)?d.fadeLimit.toFixed(1):'n/a'} Scorepunkte, letzter Score-Schritt ${d.scoreStep>=0?'+':''}${d.scoreStep.toFixed(2)}, letzter Chart-Schritt ${d.chartStep>=0?'+':''}${d.chartStep.toFixed(2)}%.`}`};
      const rearmScore=Math.max(56,d.currentScore-PROFIT_EXIT_V297.reentryPullbackPoints);re.locks[s]={at:now,kind:'PROFIT_FADE_LOCK',exitScore:d.currentScore,rearmScore,source:'V29.7.1_PROFIT_FADE_EXIT'};re.stats.locksCreated=num(re.stats.locksCreated)+1;counters.profitSells++;if(tier==='5_PERCENT_LOCK')counters.profitLocks++;else counters.profitFadeLocks++;continue;
    }
    if(d.reason==='profit_5_strong_rise'||d.reason==='profit_strong_rise')counters.strongRiseHolds++;
    const oldPositiveSell=a&&String(a?.action||'').toUpperCase()==='SELL'&&(String(a?.scoreExitKind||'')==='PLUS_10'||num(a?.scoreExitDelta,0)>0||String(a?.reason||'').includes('DIRECTIONAL SCORE-EXIT'));
    if(oldPositiveSell){actions[i]={...a,action:'HOLD',allocation_pct:0,scoreExitV294:false,scoreExitV297:false,profitExitV297:false,reason:`V29.7.1 PROFIT-HOLD: ${s} Chart ${d.chartMovePct>=0?'+':''}${d.chartMovePct.toFixed(2)}%, Score ${d.currentScore.toFixed(1)} (${d.delta>=0?'+':''}${d.delta.toFixed(1)} seit Kauf). ${d.reason==='profit_below_minimum'?'Unter +0,8% wird kein normaler Gewinn-SELL ausgeführt.':d.reason==='profit_5_strong_rise'||d.reason==='profit_strong_rise'?'Score und Chart steigen aktuell noch stark gemeinsam; Gewinner darf weiterlaufen.':'Der Gewinn zeigt noch keinen bestätigten Fade; ein alter scorebasierter Gewinn-SELL wird unterdrückt.'}`};counters.oldProfitSellsSuppressed++;if(['PLUS_10','PROFIT_FADE_LOCK'].includes(String(re.locks[s]?.kind||'')))delete re.locks[s]}
  }
  const mem=out.mem;for(const k of ['profitSells','profitLocks','profitFadeLocks','strongRiseHolds','oldProfitSellsSuppressed'])mem.stats[k]=num(mem.stats[k])+num(counters[k]);writeKey(storage,KEY,mem);re.updatedAt=new Date(now).toISOString();writeKey(storage,REENTRY_KEY,re);
  plan.actions=actions;plan.summary=`${String(plan.summary||'').slice(0,130)} · V29.7.1 Gewinn: ${counters.profitSells} SELL (${counters.profitFadeLocks} Fade-Lock) · ${counters.strongRiseHolds} Gewinner weiterlaufen.`;return{plan,counters,positionScores:out.positionScores,audit:out.audit}
}

export class ProfitExitGuardV297{
  constructor(inner,{getState,storage,now}={}){this.inner=inner;this.getState=getState;this.storage=storage;this.now=now;this.latest=null}
  async run(model,input){const legacy=input===undefined&&model&&typeof model==='object',payload=legacy?model:input,state=typeof this.getState==='function'?(this.getState()||{}):{},r=legacy?await this.inner.run(payload):await this.inner.run(model,payload);if(!isTradingPlanInput(payload))return r;const p=parsePlan(r);if(!p)return r;const out=enforceProfitExitV297(p,state,this.storage,typeof this.now==='function'?this.now():Date.now());this.latest=out;return encode(r,out.plan)}
  status(){const state=typeof this.getState==='function'?(this.getState()||{}):{},out=profitAdjustedPositionScoresV297(state,this.storage,typeof this.now==='function'?this.now():Date.now(),false);return{enabled:true,version:29.71,profitabilityPatch:PROFIT_EXIT_V297.profitabilityPatch,authoritativeProfitExit:true,thresholds:PROFIT_EXIT_V297,positionScores:out.positionScores,audit:out.audit,stats:out.stats,latest:this.latest?.counters||null,rule:'V29.7.1 Gewinn-Sicherung: unter +0,8% kein normaler Profit-Exit. Oberhalb davon werden Gewinner nicht mehr verkauft, nur weil der Score steigt. Sie dürfen bei gemeinsam stark steigendem Score+Chart weiterlaufen; SELL erfolgt bei nachlassendem Score/Chart gestaffelt ab +0,8%, +2% und +3,5%. Ab +5% wird Gewinn gesichert, außer die Bewegung beschleunigt weiterhin klar. Harte Verlust-/Safety-Exits bleiben separat unverändert.'}}
}
