import {ProfitOptimizerAiGuard} from './profit-optimizer.js';
import {getEntryTimingAdjustment} from './live-signal-learning.js';
import {targetVenueIssue} from './target-venue-ai-guard.js';
import {scaleUpAllocation} from './position-scale-up.js';

// V2 sitzt direkt um den bestehenden Profit-Optimizer. Der Capital-in-Motion-Modus
// haelt verfuegbares Paper-Cash grundsaetzlich investiert und rotiert schwache
// Positionen aktiv in bessere Setups. Harte Event-/Reversal-/Venue-/Daten-/Lern-
// Sperren bleiben bestehen; "immer investiert" ist kein Freibrief fuer unsichere Trades.

export const SECOND_CHANCE_MIN_EXPECTED=5.7;
export const QUALIFIED_MIN_EXPECTED=4.7;
export const CAPITAL_MOTION_MIN_EXPECTED=3.0;
export const ROTATION_MIN_GAP=0.8;
const LOSS_ROTATION_MIN_GAP=0.45;
const MAX_SCALE_UP_CASH_PER_DECISION_PCT=15;
const MAX_PARALLEL_SCALE_UP_CASH_PCT=6;
const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const key=x=>String(x?.symbol||x||'').toUpperCase();
const responseText=r=>String(r?.response||r?.result?.response||'');

function parseBlock(text,start,end=null){const a=text.indexOf(start);if(a<0)return null;const from=a+start.length,b=end?text.indexOf(end,from):-1;try{return JSON.parse(text.slice(from,b>=0?b:text.length).trim())}catch{return null}}
function parsePlan(r){const raw=responseText(r),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j.actions)?j:null}catch{return null}}
function findPlanMessage(input){for(let i=0;i<arr(input?.messages).length;i++){const t=String(input.messages[i]?.content||'');if(t.includes('Kandidaten=')&&t.includes(' Gehalten='))return{i,text:t}}return null}
function badEvidence(c){return/(?:Infinity|NaN|undefined)/i.test([...arr(c?.pro),...arr(c?.contra),c?.reason].join(' '))}
function promptCash(text){const m=String(text||'').match(/\bCash\s+([0-9]+(?:[.,][0-9]+)?)/i);return m?num(String(m[1]).replace(',','.')):0}
function heldAgeMinutes(h={}){if(Number.isFinite(Number(h?.ageMinutes)))return Math.max(0,Number(h.ageMinutes));const t=Date.parse(String(h?.opened_at||h?.openedAt||''));return Number.isFinite(t)?Math.max(0,(Date.now()-t)/60000):999}
function heldScaleAgeMinutes(h={}){if(Number.isFinite(Number(h?.minutesSinceAdd)))return Math.max(0,Number(h.minutesSinceAdd));const t=Date.parse(String(h?.last_added_at||h?.lastAddedAt||h?.opened_at||h?.openedAt||''));return Number.isFinite(t)?Math.max(0,(Date.now()-t)/60000):999}
function heldPnlPct(h={}){for(const v of [h?.pnlPct,h?.pnl_pct,h?.pnl])if(Number.isFinite(Number(v)))return Number(v);return 0}

function metrics(c={},storage=null){
 const live=num(c?.liveScore,c?.score),conf=num(c?.liveConfidence,c?.confidence),news=num(c?.news,c?.news_score),day=num(c?.day,c?.day_change),m5=num(c?.intraday5m,c?.momentum5),m20=num(c?.intraday20m,c?.momentum20),accel=num(c?.momentumAcceleration5,c?.momentum_acceleration5),draw=num(c?.drawdownFrom20mHighPct,c?.drawdown_from_20m_high_pct??-99),rsi=num(c?.intradayRsi,c?.rsi||50),vol=num(c?.volumeRatio,c?.volume_ratio||1),breakout=Math.max(0,num(c?.momentumBreakoutScore,c?.momentum_breakout_score)),exhaust=Math.max(0,num(c?.momentumExhaustionScore,c?.momentum_exhaustion_score)),state=String(c?.momentumState||c?.momentum_state||'NORMAL').toUpperCase(),sell=String(c?.momentumSellSignal||c?.momentum_sell_signal||'NONE').toUpperCase(),event=String(c?.eventRisk||c?.event_risk||'NONE').toUpperCase(),volumeKnown=Number.isFinite(Number(c?.volumeRatio??c?.volume_ratio)),learn=getEntryTimingAdjustment(storage,c);
 const nearHigh=draw>-0.18,expected=live*1.15+conf*1.6+news*.18+breakout*.16-exhaust*.22+Math.max(0,m5)*.14+Math.max(0,m20)*.09+Math.max(0,vol-1)*.18+num(learn?.scoreDelta),hardSafe=event!=='HIGH'&&sell!=='STRONG'&&!['REVERSAL','EXHAUSTION'].includes(state)&&!targetVenueIssue(c)&&!badEvidence(c)&&!learn?.block;
 return{live,conf,news,day,m5,m20,accel,draw,rsi,vol,breakout,exhaust,state,sell,event,volumeKnown,learn,nearHigh,expected,hardSafe};
}

export function evaluateSecondChance(c={},storage=null){
 const x=metrics(c,storage),quality=x.live>=4.7&&x.conf>=.60,volumeOk=!x.volumeKnown||x.vol>=.90,momentumOk=x.m5>=0&&x.m20>=.05&&x.accel>=-.07,structureOk=x.breakout>=.55||(x.nearHigh&&x.m5>=.03&&x.m20>=.08&&x.accel>=-.05),notExtended=x.day<=8.0&&x.m20<=2.8&&x.rsi>=38&&x.rsi<79;
 const confirmed=quality&&x.nearHigh&&volumeOk&&momentumOk&&structureOk&&notExtended&&x.hardSafe&&x.expected>=SECOND_CHANCE_MIN_EXPECTED;
 const blockers=[];
 if(!quality)blockers.push('Qualität/Konfidenz');if(!x.nearHigh)blockers.push('kein Near-High-Sonderfall');if(!momentumOk)blockers.push('5m/20m-Bestätigung');if(!structureOk)blockers.push('Breakout-Struktur');if(!volumeOk)blockers.push('Volumen');if(!notExtended)blockers.push('Überhitzung');if(x.event==='HIGH')blockers.push('Event HIGH');if(x.sell==='STRONG'||['REVERSAL','EXHAUSTION'].includes(x.state))blockers.push('Momentum-Risiko');if(targetVenueIssue(c))blockers.push('Zielbörse');if(x.learn?.block)blockers.push('15/30/60m-Lernen');if(x.expected<SECOND_CHANCE_MIN_EXPECTED)blockers.push('Erwartungswert');
 return{confirmed,expected:+x.expected.toFixed(3),liveScore:+x.live.toFixed(3),confidence:+x.conf.toFixed(3),nearHigh:x.nearHigh,m5:+x.m5.toFixed(3),m20:+x.m20.toFixed(3),acceleration:+x.accel.toFixed(3),day:+x.day.toFixed(3),rsi:+x.rsi.toFixed(2),volumeRatio:+x.vol.toFixed(2),breakoutScore:+x.breakout.toFixed(2),blockers:[...new Set(blockers)]};
}

export function evaluateQualifiedBest(c={},storage=null){
 const x=metrics(c,storage),quality=x.live>=2.8&&x.conf>=.54,positiveTape=(x.m5>=0&&x.m20>=.03)||(x.m20>=.10&&x.accel>=-.06)||(['BUILDING','BREAKOUT'].includes(x.state)&&x.m5>=-.03),newsSupport=x.news>=.15&&x.m5>=-.06,notExtended=x.day<=7.8&&x.m20<=2.9&&x.rsi<79,nearHighOk=!x.nearHigh||(x.m5>=.02&&x.m20>=.06&&x.accel>=-.06),confirmed=quality&&(positiveTape||newsSupport)&&notExtended&&nearHighOk&&x.hardSafe&&x.expected>=QUALIFIED_MIN_EXPECTED;
 const blockers=[];if(!quality)blockers.push('Mindestqualität');if(!(positiveTape||newsSupport))blockers.push('Live-Bestätigung');if(!notExtended)blockers.push('Überhitzung');if(!nearHighOk)blockers.push('Near-High noch unbestätigt');if(x.event==='HIGH')blockers.push('Event HIGH');if(x.sell==='STRONG'||['REVERSAL','EXHAUSTION'].includes(x.state))blockers.push('Momentum-Risiko');if(targetVenueIssue(c))blockers.push('Zielbörse');if(x.learn?.block)blockers.push('15/30/60m-Lernen');if(x.expected<QUALIFIED_MIN_EXPECTED)blockers.push('Erwartungswert');
 return{confirmed,expected:+x.expected.toFixed(3),liveScore:+x.live.toFixed(3),confidence:+x.conf.toFixed(3),nearHigh:x.nearHigh,m5:+x.m5.toFixed(3),m20:+x.m20.toFixed(3),acceleration:+x.accel.toFixed(3),day:+x.day.toFixed(3),rsi:+x.rsi.toFixed(2),volumeRatio:+x.vol.toFixed(2),breakoutScore:+x.breakout.toFixed(2),blockers:[...new Set(blockers)]};
}

export function evaluateCapitalMotion(c={},storage=null){
 const x=metrics(c,storage),quality=x.live>=1.6&&x.conf>=.45,tapeOk=(x.m20>=-.08&&x.m5>=-.12)||(x.news>=.25&&x.m20>=-.18)||(['BUILDING','BREAKOUT'].includes(x.state)&&x.m20>=-.05),notExtended=x.day<=9.5&&x.m20<=3.5&&x.rsi>=35&&x.rsi<80,nearHighOk=!x.nearHigh||(x.m5>=-.01&&x.m20>=.04),confirmed=quality&&tapeOk&&notExtended&&nearHighOk&&x.hardSafe&&x.expected>=CAPITAL_MOTION_MIN_EXPECTED;
 const blockers=[];if(!quality)blockers.push('Mindestqualität');if(!tapeOk)blockers.push('Tape zu schwach');if(!notExtended)blockers.push('Überhitzung');if(!nearHighOk)blockers.push('Near-High fällt zurück');if(!x.hardSafe)blockers.push('Hard-Safety');if(x.expected<CAPITAL_MOTION_MIN_EXPECTED)blockers.push('Erwartungswert');
 return{confirmed,expected:+x.expected.toFixed(3),liveScore:+x.live.toFixed(3),confidence:+x.conf.toFixed(3),nearHigh:x.nearHigh,m5:+x.m5.toFixed(3),m20:+x.m20.toFixed(3),acceleration:+x.accel.toFixed(3),day:+x.day.toFixed(3),rsi:+x.rsi.toFixed(2),volumeRatio:+x.vol.toFixed(2),breakoutScore:+x.breakout.toFixed(2),state:x.state,sell:x.sell,hardSafe:x.hardSafe,blockers:[...new Set(blockers)]};
}

function candidateCap(c,e){if(c?.reboundWatch||c?.reboundRadar)return 35;if(c?.earlyBreakoutWatch)return 45;if(e?.nearHigh)return 60;return 100}
function rankCapitalCandidates(candidates,heldSet,storage){return arr(candidates).filter(c=>!heldSet.has(key(c))).map(c=>({c,e:evaluateCapitalMotion(c,storage),second:evaluateSecondChance(c,storage),qualified:evaluateQualifiedBest(c,storage)})).filter(x=>x.e.confirmed).sort((a,b)=>b.e.expected-a.e.expected||b.e.liveScore-a.e.liveScore)}

export function buildCapitalMotionAllocations(candidates=[],storage=null){
 const ranked=rankCapitalCandidates(candidates,new Set(),storage);if(!ranked.length)return[];
 const picked=[];let capSum=0;for(const x of ranked){picked.push(x);capSum+=candidateCap(x.c,x.e);if(capSum>=100||picked.length>=4)break}
 const best=picked[0]?.e.expected??0,weights=picked.map((x,i)=>Math.exp((x.e.expected-best)*.72)*(i===0?1.18:1)),out=picked.map((x,i)=>({x,weight:weights[i],pct:0,cap:candidateCap(x.c,x.e)}));let remaining=100;
 for(let pass=0;pass<4&&remaining>.001;pass++){
  const open=out.filter(o=>o.pct+1e-6<o.cap);if(!open.length)break;const wsum=open.reduce((a,o)=>a+o.weight,0)||open.length;
  let used=0;for(const o of open){const add=Math.min(o.cap-o.pct,remaining*(o.weight/wsum));o.pct+=add;used+=add}if(used<.001)break;remaining=Math.max(0,remaining-used)
 }
 if(remaining>.001){const o=out.find(x=>x.cap>=100)||out[0];if(o)o.pct+=remaining;remaining=0}
 return out.filter(o=>o.pct>.01).map(o=>({symbol:key(o.x.c),allocation_pct:+o.pct.toFixed(4),expected:o.x.e.expected,tier:o.x.second.confirmed?'SECOND_CHANCE':o.x.qualified.confirmed?'QUALIFIED':'CAPITAL_FLOOR',candidate:o.x.c,evaluation:o.x.e}));
}

export function shouldRotateCapital({current={},alternative={},ageMinutes=999,pnlPct=0}={}){
 const gap=num(alternative?.expected)-num(current?.expected),degrading=num(current?.m5)<0||num(current?.m20)<.02||num(current?.expected)<4||num(pnlPct)<0,winner=num(pnlPct)>=1.5&&num(current?.expected)>=4.7&&num(current?.m5)>=0&&num(current?.m20)>=.08;
 if(num(ageMinutes)<8&&num(pnlPct)>=0&&num(current?.state)!=='REVERSAL')return false;
 const threshold=num(pnlPct)<0?LOSS_ROTATION_MIN_GAP:ROTATION_MIN_GAP;
 if(winner&&gap<1.6)return false;
 return num(alternative?.expected)>=CAPITAL_MOTION_MIN_EXPECTED&&(gap>=threshold||(degrading&&gap>=.55));
}

function scaleUpActions(held,cMap,{cash,storage,sellSet}={}){
 const capital=Math.max(.01,num(cash)+arr(held).reduce((a,h)=>a+Math.max(0,num(h?.invested)),0)),raw=[];
 for(const h of arr(held)){
  const symbol=key(h);if(!symbol||sellSet?.has(symbol))continue;const c=cMap.get(symbol);if(!c)continue;
  const qualified=evaluateQualifiedBest(c,storage),second=evaluateSecondChance(c,storage),p=scaleUpAllocation({cash,capital,invested:num(h?.invested),pnlPct:heldPnlPct(h),minutesSinceAdd:heldScaleAgeMinutes(h),qualified:qualified.confirmed,secondChance:second.confirmed});
  if(!p.allowed)continue;const tier=second.confirmed?'SECOND_CHANCE':'QUALIFIED',expected=Math.max(second.confirmed?second.expected:0,qualified.confirmed?qualified.expected:0);
  raw.push({symbol,allocation_pct:p.allocationPct,confidence:clamp(.54+expected*.045,.58,.88),reason:`STARTER-AUSBAU ${tier}: Position erneut bestätigt · Erwartungswert ${expected.toFixed(2)} · ${p.reason} · neue Tranche max. ${p.allocationPct.toFixed(1)}% des freien Cashs`,expected,targetPositionPct:p.targetPositionPct});
 }
 raw.sort((a,b)=>b.expected-a.expected);const sum=raw.reduce((a,x)=>a+num(x.allocation_pct),0),scale=sum>MAX_SCALE_UP_CASH_PER_DECISION_PCT?MAX_SCALE_UP_CASH_PER_DECISION_PCT/sum:1;
 return raw.map(x=>({symbol:x.symbol,action:'BUY',confidence:x.confidence,allocation_pct:+(x.allocation_pct*scale).toFixed(4),reason:x.reason})).filter(x=>x.allocation_pct>=2);
}

export function buildConfirmedScaleUpActions(held=[],candidates=[],{cash=0,storage=null,sellSymbols=[]}={}){
 const cMap=new Map(arr(candidates).map(c=>[key(c),c])),sellSet=new Set(arr(sellSymbols).map(key));
 return scaleUpActions(held,cMap,{cash,storage,sellSet});
}

function postProcess(r,input,storage){
 const plan=parsePlan(r),hit=findPlanMessage(input);if(!plan||!hit)return r;
 const candidates=parseBlock(hit.text,'Kandidaten=',' Gehalten=');if(!Array.isArray(candidates)||!candidates.length)return r;
 const held=arr(parseBlock(hit.text,' Gehalten=')||[]),heldSet=new Set(held.map(key)),cMap=new Map(candidates.map(c=>[key(c),c])),cash=promptCash(hit.text);
 const original=arr(plan.actions),sells=original.filter(a=>String(a?.action||'').toUpperCase()==='SELL'),holds=original.filter(a=>String(a?.action||'').toUpperCase()==='HOLD'),sellSet=new Set(sells.map(key));
 const capitalRanked=rankCapitalCandidates(candidates,heldSet,storage),bestAlt=capitalRanked[0]||null;

 if(bestAlt&&held.length){
  const heldRank=held.map(h=>{const c=cMap.get(key(h))||h,e=evaluateCapitalMotion(c,storage);return{h,c,e,age:heldAgeMinutes(h),pnl:heldPnlPct(h)}}).filter(x=>!sellSet.has(key(x.h))).sort((a,b)=>a.e.expected-b.e.expected),weak=heldRank[0];
  if(weak&&key(weak.h)!==key(bestAlt.c)&&shouldRotateCapital({current:weak.e,alternative:bestAlt.e,ageMinutes:weak.age,pnlPct:weak.pnl})){
   const gap=bestAlt.e.expected-weak.e.expected;sells.push({symbol:key(weak.h),action:'SELL',confidence:clamp(.60+gap*.07,.62,.90),allocation_pct:0,reason:`CAPITAL-MOTION-ROTATION: ${key(bestAlt.c)} Erwartungswert ${bestAlt.e.expected.toFixed(2)} ist besser als ${key(weak.h)} ${weak.e.expected.toFixed(2)} · Differenz ${gap.toFixed(2)} · P/L ${weak.pnl.toFixed(2)}% · Kapital aktiv zum staerkeren Setup verschieben`});sellSet.add(key(weak.h));
  }
 }

 const deployNeeded=cash>2||sells.length>0||held.length===0;
 if(!deployNeeded){
  plan.actions=[...sells,...original.filter(a=>String(a?.action||'').toUpperCase()!=='SELL'&&!sellSet.has(key(a)))];
  return{...r,response:JSON.stringify(plan)};
 }

 const availableScaleUps=scaleUpActions(held,cMap,{cash,storage,sellSet});
 const alloc=buildCapitalMotionAllocations(candidates.filter(c=>!heldSet.has(key(c))),storage);
 if(!alloc.length){
  if(availableScaleUps.length){const buySymbols=new Set(availableScaleUps.map(key)),total=availableScaleUps.reduce((a,b)=>a+num(b.allocation_pct),0);plan.actions=[...sells,...availableScaleUps,...holds.filter(h=>!sellSet.has(key(h))&&!buySymbols.has(key(h)))];plan.summary=`${String(plan.summary||'').slice(0,165)} · STARTER-AUSBAU: ${availableScaleUps.length} erneut bestätigte Position(en), zusammen max. ${total.toFixed(1)}% des freien Cashs; neue Kandidaten hatten keinen Vorrang-Setup.`;return{...r,response:JSON.stringify(plan)}}
  plan.actions=[...sells,...holds.filter(h=>!sellSet.has(key(h)))];
  plan.summary=`${String(plan.summary||'').slice(0,180)} · CAPITAL-IN-MOTION: weder neuer Kandidat noch bestehender Starter bestand die harten Ausbau-/Mindest-Sicherheitsregeln; Cash bleibt frei.`;
  return{...r,response:JSON.stringify(plan)};
 }
 const buys=alloc.map(a=>({symbol:a.symbol,action:'BUY',confidence:clamp(.50+a.expected*.045,.54,.86),allocation_pct:a.allocation_pct,reason:`CAPITAL-IN-MOTION ${a.tier}: bestes aktuell hart-sicheres Setup · Erwartungswert ${a.expected.toFixed(2)} · verfuegbares Cash aktiv eingesetzt · Zielanteil ${a.allocation_pct.toFixed(1)}%`}));
 const parallelScaleUps=availableScaleUps.slice(0,1).map(a=>({...a,allocation_pct:+Math.min(MAX_PARALLEL_SCALE_UP_CASH_PCT,num(a.allocation_pct)).toFixed(4),reason:`${a.reason} · PARALLEL-AUSBAU: neuer Kandidat hat Vorrang; bestehender Starter erhaelt daneben hoechstens ${MAX_PARALLEL_SCALE_UP_CASH_PCT}% des freien Cashs.`})).filter(a=>a.allocation_pct>=2);
 const buySymbols=new Set([...buys,...parallelScaleUps].map(key));
 plan.actions=[...sells,...buys,...parallelScaleUps,...holds.filter(h=>!sellSet.has(key(h))&&!buySymbols.has(key(h)))];
 const total=buys.reduce((a,b)=>a+num(b.allocation_pct),0),scaleTotal=parallelScaleUps.reduce((a,b)=>a+num(b.allocation_pct),0),top=alloc[0];
 plan.summary=`${String(plan.summary||'').slice(0,150)} · CAPITAL-IN-MOTION: ${total.toFixed(0)}% Plan-Cash auf ${buys.length} neue hart-sichere Aktie(n); Top ${top.symbol} ${top.expected.toFixed(2)}${scaleTotal?` · parallel ${scaleTotal.toFixed(1)}% bestätigter Starter-Ausbau`:''}; aktive Rotation=${sells.length>0?'ja':'nein'}.`;
 return{...r,response:JSON.stringify(plan)};
}

export class ProfitOptimizerV2AiGuard{
 constructor(base,adapter,storage){this.inner=new ProfitOptimizerAiGuard(base,adapter,storage);this.storage=storage}
 async run(model,input){const r=await this.inner.run(model,input);return postProcess(r,input,this.storage)}
}
