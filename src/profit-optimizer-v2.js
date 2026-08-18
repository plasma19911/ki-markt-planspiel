import {ProfitOptimizerAiGuard} from './profit-optimizer.js';
import {getEntryTimingAdjustment} from './live-signal-learning.js';
import {targetVenueIssue} from './target-venue-ai-guard.js';

// V2 sitzt direkt um den bestehenden Profit-Optimizer. Er ersetzt keine Safety-Regel.
// Er verhindert nur, dass ein sehr guter Kandidat wegen der besonders strengen
// Near-High/Breakout-Definition komplett verloren geht. Eine alternative Entry-Freigabe
// ist nur bei mehrfach bestätigtem Momentum erlaubt und startet absichtlich klein.

const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const key=x=>String(x?.symbol||x||'').toUpperCase();
const responseText=r=>String(r?.response||r?.result?.response||'');

function parseBlock(text,start,end=null){const a=text.indexOf(start);if(a<0)return null;const from=a+start.length,b=end?text.indexOf(end,from):-1;try{return JSON.parse(text.slice(from,b>=0?b:text.length).trim())}catch{return null}}
function parsePlan(r){const raw=responseText(r),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j.actions)?j:null}catch{return null}}
function findPlanMessage(input){for(let i=0;i<arr(input?.messages).length;i++){const t=String(input.messages[i]?.content||'');if(t.includes('Kandidaten=')&&t.includes(' Gehalten='))return{i,text:t}}return null}
function badEvidence(c){return/(?:Infinity|NaN|undefined)/i.test([...arr(c?.pro),...arr(c?.contra),c?.reason].join(' '))}

export function evaluateSecondChance(c={},storage=null){
 const live=num(c?.liveScore,c?.score),conf=num(c?.liveConfidence,c?.confidence),news=num(c?.news,c?.news_score),day=num(c?.day,c?.day_change),m5=num(c?.intraday5m,c?.momentum5),m20=num(c?.intraday20m,c?.momentum20),accel=num(c?.momentumAcceleration5,c?.momentum_acceleration5),draw=num(c?.drawdownFrom20mHighPct,c?.drawdown_from_20m_high_pct),rsi=num(c?.intradayRsi,c?.rsi||50),vol=num(c?.volumeRatio,c?.volume_ratio||1),breakout=Math.max(0,num(c?.momentumBreakoutScore,c?.momentum_breakout_score)),exhaust=Math.max(0,num(c?.momentumExhaustionScore,c?.momentum_exhaustion_score)),state=String(c?.momentumState||c?.momentum_state||'NORMAL').toUpperCase(),sell=String(c?.momentumSellSignal||c?.momentum_sell_signal||'NONE').toUpperCase(),event=String(c?.eventRisk||c?.event_risk||'NONE').toUpperCase(),volumeKnown=Number.isFinite(Number(c?.volumeRatio??c?.volume_ratio)),learn=getEntryTimingAdjustment(storage,c);
 const nearHigh=draw>-0.18,quality=live>=5.75&&conf>=.70,volumeOk=!volumeKnown||vol>=1.10,momentumOk=m5>=.08&&m20>=.18&&accel>=-.01,structureOk=breakout>=1||(nearHigh&&m5>=.12&&m20>=.25&&accel>=.01),notExtended=day<=5.5&&m20<=1.55&&rsi>=42&&rsi<75,hardSafe=event!=='HIGH'&&sell!=='STRONG'&&!['REVERSAL','EXHAUSTION'].includes(state)&&!targetVenueIssue(c)&&!badEvidence(c)&&!learn?.block;
 let expected=live*1.15+conf*1.6+news*.18+breakout*.16-exhaust*.22+Math.max(0,m5)*.14+Math.max(0,m20)*.09+Math.max(0,vol-1)*.18+num(learn?.scoreDelta);
 const confirmed=quality&&nearHigh&&volumeOk&&momentumOk&&structureOk&&notExtended&&hardSafe&&expected>=7.4;
 const blockers=[];
 if(!quality)blockers.push('Qualität/Konfidenz');if(!nearHigh)blockers.push('kein Near-High-Sonderfall');if(!momentumOk)blockers.push('5m/20m-Bestätigung');if(!structureOk)blockers.push('Breakout-Struktur');if(!volumeOk)blockers.push('Volumen');if(!notExtended)blockers.push('Überhitzung');if(event==='HIGH')blockers.push('Event HIGH');if(sell==='STRONG'||['REVERSAL','EXHAUSTION'].includes(state))blockers.push('Momentum-Risiko');if(targetVenueIssue(c))blockers.push('Zielbörse');if(learn?.block)blockers.push('15/30/60m-Lernen');if(expected<7.4)blockers.push('Erwartungswert');
 return{confirmed,expected:+expected.toFixed(3),liveScore:+live.toFixed(3),confidence:+conf.toFixed(3),nearHigh,m5:+m5.toFixed(3),m20:+m20.toFixed(3),acceleration:+accel.toFixed(3),day:+day.toFixed(3),rsi:+rsi.toFixed(2),volumeRatio:+vol.toFixed(2),breakoutScore:+breakout.toFixed(2),blockers:[...new Set(blockers)]};
}

function postProcess(r,input,storage){
 const plan=parsePlan(r),hit=findPlanMessage(input);if(!plan||!hit)return r;
 const candidates=parseBlock(hit.text,'Kandidaten=',' Gehalten=');if(!Array.isArray(candidates)||!candidates.length)return r;
 const held=arr(parseBlock(hit.text,' Gehalten=')||[]),heldSet=new Set(held.map(key)),hasBuy=arr(plan.actions).some(a=>String(a?.action||'').toUpperCase()==='BUY');
 const evaluated=candidates.map(c=>({c,e:evaluateSecondChance(c,storage)})).sort((a,b)=>b.e.expected-a.e.expected);
 const strongest=evaluated[0]||null;
 if(!hasBuy){
  const hit2=evaluated.find(x=>x.e.confirmed&&!heldSet.has(key(x.c)));
  if(hit2){
   const pct=hit2.e.expected>=9?28:hit2.e.expected>=8.2?24:20;
   plan.actions=[...arr(plan.actions).filter(a=>key(a)!==key(hit2.c)),{symbol:key(hit2.c),action:'BUY',confidence:clamp(.58+(hit2.e.expected-7.4)*.055,.60,.82),allocation_pct:pct,reason:`SECOND-CHANCE-CONFIRMED: starker Kandidat blieb am Near-High-Filter hängen, ist aber alternativ mehrfach bestaetigt · Erwartungswert ${hit2.e.expected.toFixed(2)} · 5m ${hit2.e.m5>=0?'+':''}${hit2.e.m5.toFixed(2)}% · 20m ${hit2.e.m20>=0?'+':''}${hit2.e.m20.toFixed(2)}% · Beschleunigung ${hit2.e.acceleration>=0?'+':''}${hit2.e.acceleration.toFixed(2)}% · Breakout ${hit2.e.breakoutScore.toFixed(1)} · Startposition bewusst ${pct}%`}];
   plan.summary=`${String(plan.summary||'').slice(0,180)} · SECOND-CHANCE: ${key(hit2.c)} streng bestaetigt; kleiner ${pct}%-Einstieg statt komplettem Verwerfen.`;
  }else if(strongest&&strongest.e.liveScore>=5.5&&strongest.e.confidence>=.68&&!heldSet.has(key(strongest.c))){
   const exists=arr(plan.actions).some(a=>key(a)===key(strongest.c));
   if(!exists)plan.actions=[...arr(plan.actions),{symbol:key(strongest.c),action:'HOLD',confidence:clamp(strongest.e.confidence,.55,.82),allocation_pct:0,reason:`SECOND-CHANCE-WATCH: stark genug fuer weitere Minutenbeobachtung; noch fehlend: ${(strongest.e.blockers.length?strongest.e.blockers:['Bestätigung']).join(', ')}`}];
   plan.summary=`${String(plan.summary||'').slice(0,190)} · SECOND-CHANCE-WATCH: ${key(strongest.c)} bleibt im Heisspool statt aus dem Radar zu fallen.`;
  }
 }
 return{...r,response:JSON.stringify(plan)};
}

export class ProfitOptimizerV2AiGuard{
 constructor(base,adapter,storage){this.inner=new ProfitOptimizerAiGuard(base,adapter,storage);this.storage=storage}
 async run(model,input){const r=await this.inner.run(model,input);return postProcess(r,input,this.storage)}
}
