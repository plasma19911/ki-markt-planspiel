import {daytradeCandidateScoresV299} from './daytrade-largecap-v299.js';

const REENTRY_KEY='state/score-reentry-v296';
const arr=v=>Array.isArray(v)?v:[];
const finite=v=>Number.isFinite(Number(v));
const num=(v,d=0)=>finite(v)?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();
const read=(storage,k,d)=>{try{return storage?.kv?.get(k)||d}catch{return d}};
const first=(o,names,d=NaN)=>{for(const n of names)if(o!=null&&finite(o[n]))return Number(o[n]);return d};

export const DAYTRADE_DIP_V300={
  version:30.0,
  immediateBuyMin:56,
  maxOpenPositions:4,
  targetCashDeploymentPct:90,
  reserveCashPct:10,
  idealDipMinPct:-2.2,
  idealDipMaxPct:-.35,
  deepDipMinPct:-4.5,
  chaseNearHighPct:-.12,
  fallingKnifeDipPct:-5,
  idealDipBonus:8,
  reclaimBonus:6,
  inferredDipBonus:5,
  shallowResetBonus:3,
  chasePenalty:-7,
  weakDipPenalty:-6,
  fallingKnifePenalty:-12
};

export function intradayMetricsV300(c={}){
  const draw=first(c,['drawdownFrom20mHighPct','drawdown_from_20m_high_pct']);
  return{
    day:first(c,['dayPct','day','day_change','dayChange'],0),
    m5:first(c,['momentum5Pct','intraday5m','momentum5','momentum_5_pct'],0),
    m20:first(c,['momentum20Pct','intraday20m','momentum20','momentum_20_pct'],0),
    acc:first(c,['acceleration5Pct','momentumAcceleration5','momentum_acceleration5','acceleration_5_pct'],0),
    draw:Number.isFinite(draw)?draw:null,
    rsi:first(c,['intradayRsi','rsi'],50),
    seller:first(c,['sellerShare','seller_share'],50),
    news:first(c,['news','newsScore','news_score'],0),
    volume:first(c,['volumeRatio','volume_ratio'],1)
  };
}

export function dipQualityV300(c={}){
  const m=intradayMetricsV300(c),cfg=DAYTRADE_DIP_V300;
  const fallingKnife=(m.draw!==null&&m.draw<=cfg.fallingKnifeDipPct)||(m.m20<=-.8&&m.m5<0)||(m.m5<=-.4&&m.acc<=-.03)||m.seller>=68;
  if(fallingKnife)return{points:cfg.fallingKnifePenalty,label:'FALLING_KNIFE',quality:0,m,reason:'zu tiefer/weiter beschleunigender Abverkauf'};

  const ideal=m.draw!==null&&m.draw<=cfg.idealDipMaxPct&&m.draw>=cfg.idealDipMinPct&&m.m20>=.05&&m.m5>=-.03&&m.acc>=.015&&m.rsi>=40&&m.rsi<=69&&m.seller<=56&&m.news>-.35&&m.volume>=.55;
  if(ideal)return{points:cfg.idealDipBonus,label:'IDEAL_DIP_RECLAIM',quality:1,m,reason:'gesunder Rücksetzer aus Stärke mit beginnendem Reclaim'};

  const reclaim=m.draw!==null&&m.draw<=-.35&&m.draw>=cfg.deepDipMinPct&&m.m20>=-.15&&m.m5>=0&&m.acc>=0&&m.rsi<=72&&m.seller<=60&&m.news>-.45;
  if(reclaim)return{points:cfg.reclaimBonus,label:'DIP_RECLAIM',quality:.82,m,reason:'Dip stabilisiert sich und dreht kurzfristig wieder hoch'};

  // PC-FIRST liefert nicht bei jedem Wert ein 20m-Hoch. In diesem Fall kann ein
  // positiver 20m-Trend + kurzer 5m-Rücksetzer + positive Beschleunigung den Dip ableiten.
  const inferred=m.draw===null&&m.m20>=.20&&m.m5>=-.20&&m.m5<=.10&&m.acc>=.03&&m.day>=-.5&&m.day<=4&&m.rsi<=70&&m.seller<=58;
  if(inferred)return{points:cfg.inferredDipBonus,label:'MOMENTUM_DIP_RECLAIM',quality:.72,m,reason:'PC-1m/5m zeigt Rücksetzer innerhalb eines intakten 20m-Aufwärtstrends'};

  const shallow=m.draw!==null&&m.draw<cfg.chaseNearHighPct&&m.draw>-.35&&m.m20>=.10&&m.m5>=0&&m.acc>=0&&m.rsi<=70;
  if(shallow)return{points:cfg.shallowResetBonus,label:'SHALLOW_RESET',quality:.58,m,reason:'kleiner Rücksetzer statt Kauf direkt am Hoch'};

  const chase=(m.draw!==null&&m.draw>cfg.chaseNearHighPct&&(m.day>=2.5||m.m5>=.45||m.rsi>=72))||(m.draw===null&&(m.day>=5||m.m5>=.75||m.rsi>=78));
  if(chase)return{points:cfg.chasePenalty,label:'HIGH_CHASE',quality:.12,m,reason:'zu nah am Intraday-Hoch / bereits beschleunigt'};

  const weakDip=m.draw!==null&&m.draw<=-.35&&(m.m5<-.12||m.acc<-.02||m.seller>=61);
  if(weakDip)return{points:cfg.weakDipPenalty,label:'WEAK_DIP',quality:.2,m,reason:'Rücksetzer noch nicht stabilisiert'};

  return{points:0,label:'NEUTRAL',quality:.45,m,reason:'kein klarer Dip-/Reclaim-Vorteil'};
}

export function daytradeDipScoresV300(state={},storage=null,now=Date.now()){
  const base=daytradeCandidateScoresV299(state,storage,now),cmap=new Map(arr(state?.candidates).map(c=>[key(c),c])),ranking=[];
  for(const row of arr(base.ranking)){
    const c=cmap.get(key(row))||{},dip=dipQualityV300(c),before=clamp(row.daytradeDecisionScore??row.decisionScore,0,100),score=clamp(before+dip.points,0,100);
    ranking.push({...row,preDipDecisionScore:+before.toFixed(1),decisionScore:+score.toFixed(1),buyScore:+score.toFixed(1),fusionScore:+score.toFixed(1),holdScore:+score.toFixed(1),sellScore:+(100-score).toFixed(1),daytradeDipScore:+score.toFixed(1),dipScorePoints:dip.points,dipLabel:dip.label,dipQuality:+dip.quality.toFixed(2),dipReason:dip.reason,dipMetrics:dip.m,decisionScoreVersion:30.0});
  }
  ranking.sort((a,b)=>b.daytradeDipScore-a.daytradeDipScore||b.dipQuality-a.dipQuality||num(b.marketCapUSD)-num(a.marketCapUSD));
  return{version:30.0,ranking,base};
}

export function daytradeAllocationV300({score=56,dipQuality=0,selectedCount=1,rank=1}={}){
  const s=num(score),q=clamp(dipQuality,0,1),n=Math.max(1,Math.min(DAYTRADE_DIP_V300.maxOpenPositions,Math.round(num(selectedCount,1))));
  let target=n>=4?90:n===3?88:n===2?84:(s>=70?48:s>=62?40:30);
  const weights=n===4?[.30,.27,.23,.20]:n===3?[.38,.34,.28]:n===2?[.54,.46]:[1];
  let pct=target*(weights[Math.min(weights.length-1,Math.max(0,Math.round(num(rank,1))-1))]||1);
  pct*=.92+.16*q;
  if(s>=76)pct*=1.06;else if(s<62)pct*=.92;
  return +clamp(pct,12,34).toFixed(2);
}

function parsePlan(r){const raw=String(r?.response||r?.result?.response||''),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j?.actions)?j:null}catch{return null}}
function encode(r,plan){const raw=JSON.stringify(plan);if(r&&typeof r==='object'&&r.result&&typeof r.result==='object'&&'response'in r.result)return{...r,result:{...r.result,response:raw}};if(r&&typeof r==='object'&&'response'in r)return{...r,response:raw};return{response:raw}}
function isTradingPlanInput(input){return Boolean(input&&typeof input==='object'&&arr(input?.messages).some(m=>{const t=String(m?.content||'');return t.includes('Kandidaten=')&&t.includes(' Gehalten=')}))}

export function enforceDaytradeDipV300(plan,state={},storage=null,now=Date.now()){
  if(!plan||!Array.isArray(plan.actions))return{plan,counters:{}};
  const scored=daytradeDipScoresV300(state,storage,now),cmap=new Map(arr(state?.candidates).map(c=>[key(c),c])),held=new Set(arr(state?.positions).map(key).filter(Boolean)),re=read(storage,REENTRY_KEY,{locks:{}})||{locks:{}};
  const actions=plan.actions.map(a=>({...a})),idx=new Map();actions.forEach((a,i)=>{const s=key(a);if(s&&!idx.has(s))idx.set(s,i)});
  const plannedSells=new Set(actions.filter(a=>String(a?.action||'').toUpperCase()==='SELL'&&held.has(key(a))).map(key));
  const effectiveHeld=Math.max(0,held.size-plannedSells.size),slots=Math.max(0,DAYTRADE_DIP_V300.maxOpenPositions-effectiveHeld);
  const eligible=scored.ranking.filter(r=>!held.has(r.symbol)&&!r.hardBlocked&&!re?.locks?.[r.symbol]&&r.daytradeDipScore>=DAYTRADE_DIP_V300.immediateBuyMin);
  const selected=eligible.slice(0,slots),selectedSet=new Set(selected.map(r=>r.symbol));
  const counters={selectedBuys:0,dipBuys:0,chasesSuppressed:0,fallingKnivesSuppressed:0,slotHolds:0};

  // Final authority for NEW buys: keep SELLs untouched, but allow only the best
  // candidates that fit the deliberately concentrated four-position daytrade book.
  for(let i=0;i<actions.length;i++){
    const a=actions[i],s=key(a);if(!s||held.has(s)||String(a?.action||'').toUpperCase()!=='BUY')continue;
    const row=scored.ranking.find(r=>r.symbol===s);
    if(!row||!selectedSet.has(s)){
      const label=row?.dipLabel||'NO_SCORE';
      actions[i]={...a,action:'HOLD',allocation_pct:0,daytradeDipV300:true,reason:`V30.0 DAYTRADE-HOLD: ${s} nicht unter den ${slots} besten freien Daytrade-Slots${row?` · Score ${row.daytradeDipScore.toFixed(1)} · Dip ${label}`:''}. Maximal ${DAYTRADE_DIP_V300.maxOpenPositions} konzentrierte Positionen.`};
      if(row?.dipLabel==='HIGH_CHASE')counters.chasesSuppressed++;if(row?.dipLabel==='FALLING_KNIFE')counters.fallingKnivesSuppressed++;if(row&&row.daytradeDipScore>=56)counters.slotHolds++;
    }
  }

  selected.forEach((row,rankIndex)=>{
    const s=row.symbol,c=cmap.get(s)||{},existing=idx.get(s),pct=daytradeAllocationV300({score:row.daytradeDipScore,dipQuality:row.dipQuality,selectedCount:selected.length,rank:rankIndex+1});
    const next={...(existing!==undefined?actions[existing]:{}),symbol:s,name:c?.name||undefined,action:'BUY',allocation_pct:pct,confidence:clamp(.62+(row.daytradeDipScore-56)*.006+row.dipQuality*.05,.62,.92),daytradeDipV300:true,preDipDecisionScore:row.preDipDecisionScore,daytradeDipScore:row.daytradeDipScore,dipScorePoints:row.dipScorePoints,dipLabel:row.dipLabel,dipQuality:row.dipQuality,reason:`V30.0 DAYTRADE-BUY: ${s} Score ${row.preDipDecisionScore.toFixed(1)} ${row.dipScorePoints>=0?'+':''}${row.dipScorePoints} Dip = ${row.daytradeDipScore.toFixed(1)}/100 · ${row.dipLabel} · Einsatz ${pct.toFixed(1)}% des freien Cashs. Max. ${DAYTRADE_DIP_V300.maxOpenPositions} Positionen; bessere Reclaims vor High-Chases.`};
    if(existing===undefined){idx.set(s,actions.length);actions.push(next)}else actions[existing]=next;
    counters.selectedBuys++;if(row.dipScorePoints>0)counters.dipBuys++;
  });

  plan.actions=actions;plan.summary=`${String(plan.summary||'').slice(0,110)} · V30.0 Daytrade-Dips: ${counters.selectedBuys} konzentrierte BUY · ${counters.dipBuys} Dip/Reclaim · max ${DAYTRADE_DIP_V300.maxOpenPositions} Positionen.`;
  return{plan,counters,ranking:scored.ranking,slots,selected};
}

export class DaytradeDipGuardV300{
  constructor(inner,{getState,storage,now}={}){this.inner=inner;this.getState=getState;this.storage=storage;this.now=now;this.latest=null}
  async run(model,input){const legacy=input===undefined&&model&&typeof model==='object',payload=legacy?model:input,state=typeof this.getState==='function'?(this.getState()||{}):{},r=legacy?await this.inner.run(payload):await this.inner.run(model,payload);if(!isTradingPlanInput(payload))return r;const p=parsePlan(r);if(!p)return r;const out=enforceDaytradeDipV300(p,state,this.storage,typeof this.now==='function'?this.now():Date.now());this.latest=out;return encode(r,out.plan)}
  status(){const state=typeof this.getState==='function'?(this.getState()||{}):{},out=daytradeDipScoresV300(state,this.storage,typeof this.now==='function'?this.now():Date.now());return{enabled:true,version:30.0,authoritativeDaytradeEntry:true,immediateBuyMin:56,maxOpenPositions:DAYTRADE_DIP_V300.maxOpenPositions,targetCashDeploymentPct:DAYTRADE_DIP_V300.targetCashDeploymentPct,reserveCashPct:DAYTRADE_DIP_V300.reserveCashPct,pcFastFieldsUsed:['momentum5Pct','momentum20Pct','acceleration5Pct'],ranking:out.ranking,latest:this.latest?.counters||null,config:DAYTRADE_DIP_V300,rule:'V30.0 bevorzugt echte Pullback-Reclaims: Dip aus vorheriger Stärke + Stabilisierung + positive Beschleunigung. High-Chases und fallende Messer drücken den DecisionScore. BUY bleibt ab 56, aber nur die besten freien Slots bis maximal vier Positionen werden genutzt; dafür deutlich größerer Cash-Einsatz.'}}
}
