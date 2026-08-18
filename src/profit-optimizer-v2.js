import {ProfitOptimizerAiGuard} from './profit-optimizer.js';
import {getEntryTimingAdjustment} from './live-signal-learning.js';
import {targetVenueIssue} from './target-venue-ai-guard.js';

// V2 sitzt direkt um den bestehenden Profit-Optimizer. Er ersetzt keine Safety-Regel.
// Ziel: gute Chancen nicht wegen zu harter Soft-Schwellen verlieren. Wenn der innere
// Optimizer keinen BUY liefert, darf V2 das beste mehrfach bestaetigte Setup mit einer
// kleinen Probe-Position aufnehmen. Harte Event-/Reversal-/Venue-/Lern-Sperren bleiben.

const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const key=x=>String(x?.symbol||x||'').toUpperCase();
const responseText=r=>String(r?.response||r?.result?.response||'');

function parseBlock(text,start,end=null){const a=text.indexOf(start);if(a<0)return null;const from=a+start.length,b=end?text.indexOf(end,from):-1;try{return JSON.parse(text.slice(from,b>=0?b:text.length).trim())}catch{return null}}
function parsePlan(r){const raw=responseText(r),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j.actions)?j:null}catch{return null}}
function findPlanMessage(input){for(let i=0;i<arr(input?.messages).length;i++){const t=String(input.messages[i]?.content||'');if(t.includes('Kandidaten=')&&t.includes(' Gehalten='))return{i,text:t}}return null}
function badEvidence(c){return/(?:Infinity|NaN|undefined)/i.test([...arr(c?.pro),...arr(c?.contra),c?.reason].join(' '))}
function metrics(c={},storage=null){
 const live=num(c?.liveScore,c?.score),conf=num(c?.liveConfidence,c?.confidence),news=num(c?.news,c?.news_score),day=num(c?.day,c?.day_change),m5=num(c?.intraday5m,c?.momentum5),m20=num(c?.intraday20m,c?.momentum20),accel=num(c?.momentumAcceleration5,c?.momentum_acceleration5),draw=num(c?.drawdownFrom20mHighPct,c?.drawdown_from_20m_high_pct),rsi=num(c?.intradayRsi,c?.rsi||50),vol=num(c?.volumeRatio,c?.volume_ratio||1),breakout=Math.max(0,num(c?.momentumBreakoutScore,c?.momentum_breakout_score)),exhaust=Math.max(0,num(c?.momentumExhaustionScore,c?.momentum_exhaustion_score)),state=String(c?.momentumState||c?.momentum_state||'NORMAL').toUpperCase(),sell=String(c?.momentumSellSignal||c?.momentum_sell_signal||'NONE').toUpperCase(),event=String(c?.eventRisk||c?.event_risk||'NONE').toUpperCase(),volumeKnown=Number.isFinite(Number(c?.volumeRatio??c?.volume_ratio)),learn=getEntryTimingAdjustment(storage,c);
 const nearHigh=draw>-0.18,expected=live*1.15+conf*1.6+news*.18+breakout*.16-exhaust*.22+Math.max(0,m5)*.14+Math.max(0,m20)*.09+Math.max(0,vol-1)*.18+num(learn?.scoreDelta),hardSafe=event!=='HIGH'&&sell!=='STRONG'&&!['REVERSAL','EXHAUSTION'].includes(state)&&!targetVenueIssue(c)&&!badEvidence(c)&&!learn?.block;
 return{live,conf,news,day,m5,m20,accel,draw,rsi,vol,breakout,exhaust,state,sell,event,volumeKnown,learn,nearHigh,expected,hardSafe};
}

export function evaluateSecondChance(c={},storage=null){
 const x=metrics(c,storage),quality=x.live>=5.0&&x.conf>=.64,volumeOk=!x.volumeKnown||x.vol>=1.0,momentumOk=x.m5>=.03&&x.m20>=.08&&x.accel>=-.05,structureOk=x.breakout>=.75||(x.nearHigh&&x.m5>=.06&&x.m20>=.12&&x.accel>=-.03),notExtended=x.day<=7.0&&x.m20<=2.2&&x.rsi>=40&&x.rsi<78;
 const confirmed=quality&&x.nearHigh&&volumeOk&&momentumOk&&structureOk&&notExtended&&x.hardSafe&&x.expected>=6.2;
 const blockers=[];
 if(!quality)blockers.push('Qualität/Konfidenz');if(!x.nearHigh)blockers.push('kein Near-High-Sonderfall');if(!momentumOk)blockers.push('5m/20m-Bestätigung');if(!structureOk)blockers.push('Breakout-Struktur');if(!volumeOk)blockers.push('Volumen');if(!notExtended)blockers.push('Überhitzung');if(x.event==='HIGH')blockers.push('Event HIGH');if(x.sell==='STRONG'||['REVERSAL','EXHAUSTION'].includes(x.state))blockers.push('Momentum-Risiko');if(targetVenueIssue(c))blockers.push('Zielbörse');if(x.learn?.block)blockers.push('15/30/60m-Lernen');if(x.expected<6.2)blockers.push('Erwartungswert');
 return{confirmed,expected:+x.expected.toFixed(3),liveScore:+x.live.toFixed(3),confidence:+x.conf.toFixed(3),nearHigh:x.nearHigh,m5:+x.m5.toFixed(3),m20:+x.m20.toFixed(3),acceleration:+x.accel.toFixed(3),day:+x.day.toFixed(3),rsi:+x.rsi.toFixed(2),volumeRatio:+x.vol.toFixed(2),breakoutScore:+x.breakout.toFixed(2),blockers:[...new Set(blockers)]};
}

export function evaluateQualifiedBest(c={},storage=null){
 const x=metrics(c,storage),quality=x.live>=3.15&&x.conf>=.58,positiveTape=(x.m5>=.02&&x.m20>=.06)||(x.m20>=.16&&x.accel>=-.04)||(['BUILDING','BREAKOUT'].includes(x.state)&&x.m5>=-.01),newsSupport=x.news>=.20&&x.m5>=-.04,notExtended=x.day<=6.5&&x.m20<=2.4&&x.rsi<78,nearHighOk=!x.nearHigh||(x.m5>=.05&&x.m20>=.10&&x.accel>=-.04),confirmed=quality&&(positiveTape||newsSupport)&&notExtended&&nearHighOk&&x.hardSafe&&x.expected>=5.35;
 const blockers=[];if(!quality)blockers.push('Mindestqualität');if(!(positiveTape||newsSupport))blockers.push('Live-Bestätigung');if(!notExtended)blockers.push('Überhitzung');if(!nearHighOk)blockers.push('Near-High noch unbestätigt');if(x.event==='HIGH')blockers.push('Event HIGH');if(x.sell==='STRONG'||['REVERSAL','EXHAUSTION'].includes(x.state))blockers.push('Momentum-Risiko');if(targetVenueIssue(c))blockers.push('Zielbörse');if(x.learn?.block)blockers.push('15/30/60m-Lernen');if(x.expected<5.35)blockers.push('Erwartungswert');
 return{confirmed,expected:+x.expected.toFixed(3),liveScore:+x.live.toFixed(3),confidence:+x.conf.toFixed(3),nearHigh:x.nearHigh,m5:+x.m5.toFixed(3),m20:+x.m20.toFixed(3),acceleration:+x.accel.toFixed(3),day:+x.day.toFixed(3),rsi:+x.rsi.toFixed(2),volumeRatio:+x.vol.toFixed(2),breakoutScore:+x.breakout.toFixed(2),blockers:[...new Set(blockers)]};
}

function postProcess(r,input,storage){
 const plan=parsePlan(r),hit=findPlanMessage(input);if(!plan||!hit)return r;
 const candidates=parseBlock(hit.text,'Kandidaten=',' Gehalten=');if(!Array.isArray(candidates)||!candidates.length)return r;
 const held=arr(parseBlock(hit.text,' Gehalten=')||[]),heldSet=new Set(held.map(key)),hasBuy=arr(plan.actions).some(a=>String(a?.action||'').toUpperCase()==='BUY');
 if(hasBuy)return r;

 const second=candidates.map(c=>({c,e:evaluateSecondChance(c,storage)})).sort((a,b)=>b.e.expected-a.e.expected),secondHit=second.find(x=>x.e.confirmed&&!heldSet.has(key(x.c)));
 if(secondHit){
   const pct=secondHit.e.expected>=8.5?28:secondHit.e.expected>=7.2?24:20;
   plan.actions=[...arr(plan.actions).filter(a=>key(a)!==key(secondHit.c)),{symbol:key(secondHit.c),action:'BUY',confidence:clamp(.59+(secondHit.e.expected-6.2)*.055,.60,.84),allocation_pct:pct,reason:`SECOND-CHANCE-CONFIRMED: gutes Near-High-Setup alternativ bestaetigt · Erwartungswert ${secondHit.e.expected.toFixed(2)} · 5m ${secondHit.e.m5>=0?'+':''}${secondHit.e.m5.toFixed(2)}% · 20m ${secondHit.e.m20>=0?'+':''}${secondHit.e.m20.toFixed(2)}% · Beschleunigung ${secondHit.e.acceleration>=0?'+':''}${secondHit.e.acceleration.toFixed(2)}% · Startposition ${pct}%`}];
   plan.summary=`${String(plan.summary||'').slice(0,175)} · SECOND-CHANCE: ${key(secondHit.c)} bestaetigt; ${pct}%-Probe statt Verwerfen.`;
   return{...r,response:JSON.stringify(plan)};
 }

 const qualified=candidates.map(c=>({c,e:evaluateQualifiedBest(c,storage)})).filter(x=>x.e.confirmed&&!heldSet.has(key(x.c))).sort((a,b)=>b.e.expected-a.e.expected),best=qualified[0];
 if(best){
   const pct=best.e.expected>=6.8?24:best.e.expected>=6.0?20:16;
   plan.actions=[...arr(plan.actions).filter(a=>key(a)!==key(best.c)),{symbol:key(best.c),action:'BUY',confidence:clamp(.57+(best.e.expected-5.35)*.06,.58,.78),allocation_pct:pct,reason:`BEST-QUALIFIED-ENTRY: bestes aktuell brauchbares, mehrfach bestaetigtes Setup · Erwartungswert ${best.e.expected.toFixed(2)} · Live ${best.e.liveScore.toFixed(2)} / ${Math.round(best.e.confidence*100)}% · 5m ${best.e.m5>=0?'+':''}${best.e.m5.toFixed(2)}% · 20m ${best.e.m20>=0?'+':''}${best.e.m20.toFixed(2)}% · kleine Startposition ${pct}%`}];
   plan.summary=`${String(plan.summary||'').slice(0,175)} · BEST-QUALIFIED: ${key(best.c)} als bestes sicheres Setup mit ${pct}%-Probe aufgenommen.`;
   return{...r,response:JSON.stringify(plan)};
 }

 const watch=second[0]||null;
 if(watch&&watch.e.liveScore>=4.6&&watch.e.confidence>=.62&&!heldSet.has(key(watch.c))){
   const exists=arr(plan.actions).some(a=>key(a)===key(watch.c));
   if(!exists)plan.actions=[...arr(plan.actions),{symbol:key(watch.c),action:'HOLD',confidence:clamp(watch.e.confidence,.55,.82),allocation_pct:0,reason:`SECOND-CHANCE-WATCH: noch nicht kaufbar, aber stark genug fuer weitere Minutenbeobachtung; fehlend: ${(watch.e.blockers.length?watch.e.blockers:['Bestätigung']).join(', ')}`}];
   plan.summary=`${String(plan.summary||'').slice(0,185)} · SECOND-CHANCE-WATCH: ${key(watch.c)} bleibt im Heisspool.`;
 }
 return{...r,response:JSON.stringify(plan)};
}

export class ProfitOptimizerV2AiGuard{
 constructor(base,adapter,storage){this.inner=new ProfitOptimizerAiGuard(base,adapter,storage);this.storage=storage}
 async run(model,input){const r=await this.inner.run(model,input);return postProcess(r,input,this.storage)}
}
