import {targetVenueIssue} from './target-venue-ai-guard.js';

// Finale Preis-Schutzschicht vor der Ausfuehrung.
// EARLY-DIP-FIRST: kontrollierte Ruecksetzer duerfen frueher klein begonnen werden,
// sobald der Verkaufsdruck messbar nachlaesst. Harte Risiken bleiben unveraendert hart.

const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const firstNum=(...v)=>{for(const x of v)if(Number.isFinite(Number(x)))return Number(x);return 0};
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const key=x=>String(x?.symbol||x||'').toUpperCase();
const responseText=r=>String(r?.response||r?.result?.response||'');

function parseBlock(text,start,end=null){const a=text.indexOf(start);if(a<0)return null;const from=a+start.length,b=end?text.indexOf(end,from):-1;try{return JSON.parse(text.slice(from,b>=0?b:text.length).trim())}catch{return null}}
function parsePlan(r){const raw=responseText(r),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j.actions)?j:null}catch{return null}}
function findPrompt(input){for(const m of arr(input?.messages)){const t=String(m?.content||'');if(t.includes('Kandidaten=')&&t.includes(' Gehalten='))return t}return''}
function promptCash(text){const m=String(text||'').match(/\bCash\s+([0-9]+(?:[.,][0-9]+)?)/i);return m?num(String(m[1]).replace(',','.')):0}
function isRotationSell(a={}){return String(a?.action||'').toUpperCase()==='SELL'&&/(?:CAPITAL-MOTION-ROTATION|OPPORTUNITY-COST-ROTATION)/i.test(String(a?.reason||''))}

function metrics(c={}){
 const score=firstNum(c?.liveScore,c?.score),confidence=firstNum(c?.liveConfidence,c?.confidence),news=firstNum(c?.newsScore,c?.news_score,c?.news),day=firstNum(c?.day,c?.day_change,c?.dayChange,c?.pcWideSessionPct),m5=firstNum(c?.intraday5m,c?.momentum5,c?.pcWideM5Pct),m20=firstNum(c?.intraday20m,c?.momentum20,c?.pcWideM20Pct),accel=firstNum(c?.momentumAcceleration5,c?.momentum_acceleration5,c?.pcWideAccelerationPct),rsi=firstNum(c?.intradayRsi,c?.rsi,50),rawDraw=c?.drawdownFrom20mHighPct??c?.drawdown_from_20m_high_pct,drawKnown=Number.isFinite(Number(rawDraw)),draw=drawKnown?Number(rawDraw):null,event=String(c?.eventRisk||c?.event_risk||'NONE').toUpperCase(),state=String(c?.momentumState||c?.momentum_state||'NORMAL').toUpperCase(),sell=String(c?.momentumSellSignal||c?.momentum_sell_signal||'NONE').toUpperCase(),foresight=Boolean(c?.foresightDip);
 const hardSafe=event!=='HIGH'&&sell!=='STRONG'&&!['REVERSAL','EXHAUSTION'].includes(state)&&!targetVenueIssue(c);
 const regularQuality=(score>=3.95&&confidence>=.60)||(score>=3.55&&confidence>=.68)||(score>=3.35&&confidence>=.65&&news>=.22);
 const wideDipDiscovery=Boolean(c?.pcWideSweep||foresight)&&day<=-.35&&day>=-10&&m5>=-.95&&m5<=.18&&m20>=-3.5&&m20<=.28&&accel>=.008;
 const dipQuality=wideDipDiscovery&&((score>=2.90&&confidence>=.58)||(score>=2.60&&confidence>=.64)||(score>=2.45&&confidence>=.60&&news>=.20));
 const quality=regularQuality||dipQuality;
 return{score,confidence,news,day,m5,m20,accel,rsi,drawKnown,draw,event,state,sell,hardSafe,quality,regularQuality,dipQuality,wideDipDiscovery,foresight};
}

export function assessDipValueEntry(c={}){
 const x=metrics(c);
 const inDip=x.drawKnown&&x.draw<=-.20&&x.draw>=-5.75;
 const deepDip=x.drawKnown&&x.draw<=-1.10&&x.draw>=-5.75;
 const falling=x.m5<0||x.m20<0;
 const fallSlowing=falling&&x.m5>=-.45&&x.m20>=-1.70&&x.accel>=.012;
 const dipStarter=x.hardSafe&&x.quality&&inDip&&fallSlowing&&x.rsi>=28&&x.rsi<=64&&x.day>=-9&&x.day<=1.10;
 const rebound=x.hardSafe&&x.quality&&inDip&&x.m5>=-.06&&x.m5<=.28&&x.m20>=-1.10&&x.accel>=.008&&x.rsi>=30&&x.rsi<=68&&x.day<=1.60;
 const unknownValue=x.hardSafe&&x.quality&&!x.drawKnown&&x.day<=.30&&x.m20<=.12&&x.m20>=-1.25&&x.m5>=-.30&&x.m5<=.10&&x.accel>=.012&&x.rsi>=30&&x.rsi<=63;
 const nearHigh=x.drawKnown&&x.draw>-.22;
 const exceptionalBreakout=x.hardSafe&&x.score>=6.20&&x.confidence>=.80&&nearHigh&&x.day>=-.10&&x.day<=.45&&x.m5>=.04&&x.m5<=.13&&x.m20>=.08&&x.m20<=.35&&x.accel>=.035&&x.rsi<60;
 const mode=rebound?'DIP_REBOUND':dipStarter?(deepDip?'DEEP_DIP_STARTER':'DIP_STARTER'):unknownValue?'VALUE_STARTER':exceptionalBreakout?'EXCEPTIONAL_BREAKOUT':'WAIT_FOR_VALUE';
 const allow=rebound||dipStarter||unknownValue||exceptionalBreakout;
 let cap=rebound?30:dipStarter?(deepDip?16:20):unknownValue?14:exceptionalBreakout?5:0;
 // Early-Dip-Kandidaten haben noch nicht den kompletten regulaeren News/Event-Deep-Pass.
 // Sie duerfen deshalb frueher hinein, starten aber bewusst kleiner.
 if(x.foresight)cap=Math.min(cap,rebound?18:12);
 const dipBonus=x.wideDipDiscovery?1.65:(x.day<0?Math.min(1.1,Math.abs(x.day)*.20):0);
 const valueScore=x.score*1.10+x.confidence*2+x.news*.20+dipBonus+(inDip?Math.min(3.5,Math.abs(x.draw))*.55:0)+(x.accel>0?Math.min(.35,x.accel)*2:0)-(nearHigh?2.35:0)-(x.day>0?Math.min(6,x.day)*.48:0)+(x.foresight?.55:0);
 const blockers=[];
 if(!x.hardSafe)blockers.push('harte Safety');
 if(!x.quality)blockers.push('Qualitaet/Konfidenz');
 if(nearHigh&&!exceptionalBreakout)blockers.push('zu nah am 20m-Hoch');
 if(inDip&&!fallSlowing&&!rebound)blockers.push('Abwaertsdruck noch nicht gebremst');
 if(x.drawKnown&&!inDip&&!nearHigh)blockers.push('noch kein attraktiver Ruecksetzer');
 if(!x.drawKnown&&!unknownValue)blockers.push('Preisposition nicht guenstig bestaetigt');
 if(x.rsi>68)blockers.push('RSI zu hoch');
 if(x.day>1.6)blockers.push('Tag bereits zu weit gelaufen');
 return{allow,mode,cap,valueScore:+valueScore.toFixed(3),...x,falling,fallSlowing,inDip,deepDip,rebound,dipStarter,unknownValue,exceptionalBreakout,blockers:[...new Set(blockers)]};
}

function assessEmptyDepotStarter(q={}){
 const dipLike=q.foresight||q.wideDipDiscovery||q.inDip||(q.day<=0&&q.m20<=0);
 const baseQuality=dipLike?((q.score>=2.70&&q.confidence>=.58)||(q.score>=2.45&&q.confidence>=.63)||(q.score>=2.30&&q.confidence>=.60&&q.news>=.20)):((q.score>=4.30&&q.confidence>=.70)||(q.score>=3.95&&q.confidence>=.76));
 const tapeOk=q.day>=-7.5&&q.day<=(dipLike?1.0:.55)&&q.m5>=-.45&&q.m20>=-1.70;
 const temperatureOk=q.rsi>=28&&q.rsi<=(dipLike?67:61);
 const priceOk=dipLike?(!q.drawKnown||q.draw<=-.05||q.day<=0):(!q.drawKnown?q.day<=.20:q.draw<=-.25);
 const allow=q.hardSafe&&baseQuality&&tapeOk&&temperatureOk&&priceOk;
 let cap=dipLike?(q.day<=-1.5?16:12):5;if(q.foresight)cap=Math.min(cap,10);
 const score=q.valueScore+(dipLike?2.3:-1.0)+q.confidence*1.1-Math.max(0,q.day)*.55+(q.accel>0?.30:0);
 return{allow,cap,score:+score.toFixed(3),dipLike};
}

function reasonFor(q){
 const src=q.foresight?'Early-Dip · ':q.wideDipDiscovery?'Breitscan-Dip · ':'';
 if(q.mode==='DIP_REBOUND')return `${src}Ruecksetzer ${q.draw?.toFixed(2)}% vom 20m-Hoch stabilisiert sich; 5m ${q.m5>=0?'+':''}${q.m5.toFixed(2)}%, Beschl. ${q.accel>=0?'+':''}${q.accel.toFixed(2)}`;
 if(q.mode==='DEEP_DIP_STARTER'||q.mode==='DIP_STARTER')return `${src}Kurs noch im Ruecksetzer (${q.draw?.toFixed(2)}% vom 20m-Hoch), aber Fall bremst: 5m ${q.m5.toFixed(2)}%, Beschl. +${q.accel.toFixed(2)}`;
 if(q.mode==='VALUE_STARTER')return `${src}Aktie ist noch nicht hochgelaufen; Abwaertsdruck bremst, kleine Value-Starterposition`;
 if(q.mode==='EXCEPTIONAL_BREAKOUT')return `Seltene Breakout-Ausnahme nur als 5%-Mini-Starter`;
 return q.blockers.join(' · ')||'kein guenstiger Einstieg';
}

function postProcess(r,input){
 const plan=parsePlan(r),prompt=findPrompt(input);if(!plan||!prompt)return r;
 const candidates=arr(parseBlock(prompt,'Kandidaten=',' Gehalten=')||[]),held=arr(parseBlock(prompt,' Gehalten=')||[]),cash=promptCash(prompt),emptyDepot=held.length===0;
 if(!candidates.length)return r;
 const cMap=new Map(candidates.map(c=>[key(c),c])),heldSet=new Set(held.map(key)),out=[],blocked=[];
 for(const a of arr(plan.actions)){
  if(String(a?.action||'').toUpperCase()!=='BUY'){out.push(a);continue}
  const c=cMap.get(key(a)),q=c?assessDipValueEntry(c):null;
  if(!q?.allow){blocked.push({symbol:key(a),q});out.push({symbol:key(a),action:'HOLD',confidence:.64,allocation_pct:0,reason:`EARLY-DIP-WAIT: ${q?reasonFor(q):'Preis-Timing nicht verifizierbar'}. Cash bleibt fuer einen besseren Einstieg frei.`});continue}
  out.push({...a,allocation_pct:Math.min(Math.max(1,num(a?.allocation_pct)),q.cap),confidence:clamp(num(a?.confidence,q.confidence),.55,.82),reason:`EARLY-DIP ${q.mode}: ${reasonFor(q)} · max. ${q.cap}%`});
 }
 let hasBuy=out.some(a=>String(a?.action||'').toUpperCase()==='BUY');
 if(!hasBuy&&cash>2){
  const best=candidates.filter(c=>!heldSet.has(key(c))).map(c=>({c,q:assessDipValueEntry(c)})).filter(x=>x.q.allow&&x.q.mode!=='EXCEPTIONAL_BREAKOUT').sort((a,b)=>b.q.valueScore-a.q.valueScore)[0];
  if(best){out.push({symbol:key(best.c),action:'BUY',confidence:clamp(best.q.confidence,.58,.80),allocation_pct:best.q.cap,reason:`EARLY-DIP AUTO ${best.q.mode}: ${reasonFor(best.q)} · ${best.q.cap}% Start/Ziel, Rest-Cash fuer weiteren Ruecksetzer`});hasBuy=true}
 }
 if(!hasBuy&&cash>2&&emptyDepot){
  const rows=candidates.filter(c=>!heldSet.has(key(c))).map(c=>{const q=assessDipValueEntry(c),starter=assessEmptyDepotStarter(q);return{c,q,starter}}).filter(x=>x.starter.allow),dips=rows.filter(x=>x.starter.dipLike).sort((a,b)=>b.starter.score-a.starter.score),highs=rows.filter(x=>!x.starter.dipLike).sort((a,b)=>b.starter.score-a.starter.score),best=dips[0]||highs[0];
  if(best){const symbol=key(best.c);for(let i=out.length-1;i>=0;i--)if(key(out[i])===symbol&&String(out[i]?.action||'').toUpperCase()==='HOLD'&&/DIP-WAIT/.test(String(out[i]?.reason||'')))out.splice(i,1);out.push({symbol,action:'BUY',confidence:clamp(best.q.confidence,.58,.79),allocation_pct:best.starter.cap,reason:`EMPTY-DEPOT-STARTER: ${best.starter.dipLike?'frueher kontrollierter Dip':'kein brauchbarer Dip vorhanden – sehr kleiner Fallback'} · Score ${best.q.score.toFixed(2)} · Konfidenz ${(best.q.confidence*100).toFixed(0)}% · ${best.starter.cap}% Startposition.`});hasBuy=true}
 }
 const finalActions=hasBuy?out:out.filter(a=>!isRotationSell(a));
 if(blocked.length||hasBuy){const entryBuys=finalActions.filter(a=>String(a?.action||'').toUpperCase()==='BUY'),dipBuys=entryBuys.filter(a=>/DIP|VALUE/i.test(String(a?.reason||''))).length;plan.summary=`${String(plan.summary||'').slice(0,130)} · EARLY-DIP: ${blocked.length} ungeeignete Idee(n) gestoppt; ${entryBuys.length?`${dipBuys||entryBuys.length} Einstieg(e), fruehe Ruecksetzer priorisiert`:'kein Kauf – aktuell kein kontrollierter Einstieg'}.`}
 plan.actions=finalActions;return{...r,response:JSON.stringify(plan)};
}

export class DipValueEntryAiGuard{
 constructor(base){this.base=base}
 async run(model,input){const r=await this.base.run(model,input);return postProcess(r,input)}
}
