import {targetVenueIssue} from './target-venue-ai-guard.js';

// Finale Preis-Schutzschicht vor der Ausfuehrung.
// DIP-FIRST ist die Hauptstrategie: kontrollierte Ruecksetzer und fruehe Rebounds
// haben Vorrang. High-/Breakout-Kaeufe sind nur eine kleine Ausnahme. Ein komplett
// leeres Depot darf nicht in 100% Cash festhaengen, soll aber zuerst einen Dip suchen.

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
 const score=firstNum(c?.liveScore,c?.score),confidence=firstNum(c?.liveConfidence,c?.confidence),news=firstNum(c?.newsScore,c?.news_score,c?.news),day=firstNum(c?.day,c?.day_change,c?.pcWideSessionPct),m5=firstNum(c?.intraday5m,c?.momentum5,c?.pcWideM5Pct),m20=firstNum(c?.intraday20m,c?.momentum20,c?.pcWideM20Pct),accel=firstNum(c?.momentumAcceleration5,c?.momentum_acceleration5,c?.pcWideAccelerationPct),rsi=firstNum(c?.intradayRsi,c?.rsi,50),rawDraw=c?.drawdownFrom20mHighPct??c?.drawdown_from_20m_high_pct,drawKnown=Number.isFinite(Number(rawDraw)),draw=drawKnown?Number(rawDraw):null,event=String(c?.eventRisk||c?.event_risk||'NONE').toUpperCase(),state=String(c?.momentumState||c?.momentum_state||'NORMAL').toUpperCase(),sell=String(c?.momentumSellSignal||c?.momentum_sell_signal||'NONE').toUpperCase();
 const hardSafe=event!=='HIGH'&&sell!=='STRONG'&&!['REVERSAL','EXHAUSTION'].includes(state)&&!targetVenueIssue(c);
 const regularQuality=(score>=4.10&&confidence>=.62)||(score>=3.70&&confidence>=.70)||(score>=3.55&&confidence>=.66&&news>=.28);
 const wideDipDiscovery=Boolean(c?.pcWideSweep)&&day<=-.55&&day>=-10&&m5>=-.85&&m5<=.15&&m20>=-3.2&&m20<=.20&&accel>=.012;
 const dipQuality=wideDipDiscovery&&((score>=2.45&&confidence>=.58)||(score>=2.15&&confidence>=.62&&news>=-.05));
 const quality=regularQuality||dipQuality;
 return{score,confidence,news,day,m5,m20,accel,rsi,drawKnown,draw,event,state,sell,hardSafe,quality,regularQuality,dipQuality,wideDipDiscovery};
}

export function assessDipValueEntry(c={}){
 const x=metrics(c);
 const inDip=x.drawKnown&&x.draw<=-.45&&x.draw>=-5.25;
 const deepDip=x.drawKnown&&x.draw<=-1.25&&x.draw>=-5.25;
 const falling=x.m5<0||x.m20<0;
 const fallSlowing=falling&&x.m5>=-.35&&x.m20>=-1.40&&x.accel>=.020;
 const dipStarter=x.hardSafe&&x.quality&&inDip&&fallSlowing&&x.rsi>=29&&x.rsi<=62&&x.day>=-9&&x.day<=1.20;
 const rebound=x.hardSafe&&x.quality&&inDip&&x.m5>=-.03&&x.m5<=.26&&x.m20>=-.75&&x.accel>=.012&&x.rsi>=31&&x.rsi<=67&&x.day<=1.80;
 const unknownValue=x.hardSafe&&x.quality&&!x.drawKnown&&x.day<=0&&x.m20<=0&&x.m20>=-1.00&&x.m5>=-.22&&x.m5<=.08&&x.accel>=.018&&x.rsi>=31&&x.rsi<=61;
 const nearHigh=x.drawKnown&&x.draw>-.30;
 // High-Kauf nur noch als sehr seltene Mini-Ausnahme.
 const exceptionalBreakout=x.hardSafe&&x.score>=6.20&&x.confidence>=.80&&nearHigh&&x.day>=-.10&&x.day<=.45&&x.m5>=.04&&x.m5<=.13&&x.m20>=.08&&x.m20<=.35&&x.accel>=.035&&x.rsi<60;
 const mode=rebound?'DIP_REBOUND':dipStarter?(deepDip?'DEEP_DIP_STARTER':'DIP_STARTER'):unknownValue?'VALUE_STARTER':exceptionalBreakout?'EXCEPTIONAL_BREAKOUT':'WAIT_FOR_VALUE';
 const allow=rebound||dipStarter||unknownValue||exceptionalBreakout;
 const cap=rebound?30:dipStarter?(deepDip?14:18):unknownValue?12:exceptionalBreakout?5:0;
 const dipBonus=x.wideDipDiscovery?1.40:(x.day<0?Math.min(1.0,Math.abs(x.day)*.18):0);
 const valueScore=x.score*1.10+x.confidence*2+x.news*.20+dipBonus+(inDip?Math.min(3,Math.abs(x.draw))*.50:0)+(x.accel>0?Math.min(.30,x.accel)*1.8:0)-(nearHigh?2.20:0)-(x.day>0?Math.min(6,x.day)*.45:0);
 const blockers=[];
 if(!x.hardSafe)blockers.push('harte Safety');
 if(!x.quality)blockers.push('Qualitaet/Konfidenz');
 if(nearHigh&&!exceptionalBreakout)blockers.push('zu nah am 20m-Hoch');
 if(inDip&&!fallSlowing&&!rebound)blockers.push('Abwaertsdruck noch nicht gebremst');
 if(x.drawKnown&&!inDip&&!nearHigh)blockers.push('noch kein attraktiver Ruecksetzer');
 if(!x.drawKnown&&!unknownValue)blockers.push('Preisposition nicht guenstig bestaetigt');
 if(x.rsi>67)blockers.push('RSI zu hoch');
 if(x.day>1.8)blockers.push('Tag bereits zu weit gelaufen');
 return{allow,mode,cap,valueScore:+valueScore.toFixed(3),...x,falling,fallSlowing,inDip,deepDip,rebound,dipStarter,unknownValue,exceptionalBreakout,blockers:[...new Set(blockers)]};
}

function assessEmptyDepotStarter(q={}){
 // Auch bei leerem Depot zuerst Dips. Ein positiver Tageslaeufer ist nur Fallback
 // und bleibt deutlich kleiner als ein guter Ruecksetzer.
 const dipLike=q.wideDipDiscovery||q.inDip||(q.day<=0&&q.m20<=0);
 const baseQuality=dipLike
  ?((q.score>=2.85&&q.confidence>=.58)||(q.score>=2.55&&q.confidence>=.63)||(q.score>=2.35&&q.confidence>=.60&&q.news>=.25))
  :((q.score>=4.35&&q.confidence>=.70)||(q.score>=4.00&&q.confidence>=.76));
 const tapeOk=q.day>=-7&&q.day<=(dipLike?1.0:.60)&&q.m5>=-.38&&q.m20>=-1.50;
 const temperatureOk=q.rsi>=28&&q.rsi<=(dipLike?66:61);
 const priceOk=dipLike?(!q.drawKnown||q.draw<=-.08||q.day<=0):(!q.drawKnown?q.day<=.25:q.draw<=-.25);
 const allow=q.hardSafe&&baseQuality&&tapeOk&&temperatureOk&&priceOk;
 const cap=dipLike?(q.day<=-1.5?16:12):5;
 const score=q.valueScore+(dipLike?2.2:-1.0)+q.confidence*1.1-Math.max(0,q.day)*.55+(q.accel>0?.25:0);
 return{allow,cap,score:+score.toFixed(3),dipLike};
}

function reasonFor(q){
 const src=q.wideDipDiscovery?'Breitscan-Dip · ':'';
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
  if(!q?.allow){blocked.push({symbol:key(a),q});out.push({symbol:key(a),action:'HOLD',confidence:.64,allocation_pct:0,reason:`DIP-FIRST-WAIT: ${q?reasonFor(q):'Preis-Timing nicht verifizierbar'}. Cash bleibt fuer einen besseren Dip frei.`});continue}
  out.push({...a,allocation_pct:Math.min(Math.max(1,num(a?.allocation_pct)),q.cap),confidence:clamp(num(a?.confidence,q.confidence),.55,.82),reason:`DIP-FIRST ${q.mode}: ${reasonFor(q)} · max. ${q.cap}%`});
 }

 let hasBuy=out.some(a=>String(a?.action||'').toUpperCase()==='BUY');
 // Automatisch zuerst den besten echten Dip/Value-Einstieg nehmen; Breakouts werden
 // hier absichtlich nicht automatisch erzeugt.
 if(!hasBuy&&cash>2){
  const best=candidates.filter(c=>!heldSet.has(key(c))).map(c=>({c,q:assessDipValueEntry(c)})).filter(x=>x.q.allow&&x.q.mode!=='EXCEPTIONAL_BREAKOUT').sort((a,b)=>b.q.valueScore-a.q.valueScore)[0];
  if(best){
   out.push({symbol:key(best.c),action:'BUY',confidence:clamp(best.q.confidence,.58,.80),allocation_pct:best.q.cap,reason:`DIP-FIRST AUTO ${best.q.mode}: ${reasonFor(best.q)} · ${best.q.cap}% Start/Ziel, Rest-Cash fuer weiteren Ruecksetzer`});
   hasBuy=true;
  }
 }

 // Leeres Depot: zuerst ausschließlich geeignete Dip-Starter betrachten. Nur wenn
 // gar keiner vorhanden ist, darf ein sehr starker Nicht-Dip als 5%-Fallback rein.
 if(!hasBuy&&cash>2&&emptyDepot){
  const rows=candidates.filter(c=>!heldSet.has(key(c))).map(c=>{const q=assessDipValueEntry(c),starter=assessEmptyDepotStarter(q);return{c,q,starter}}).filter(x=>x.starter.allow);
  const dips=rows.filter(x=>x.starter.dipLike).sort((a,b)=>b.starter.score-a.starter.score);
  const highs=rows.filter(x=>!x.starter.dipLike).sort((a,b)=>b.starter.score-a.starter.score);
  const best=dips[0]||highs[0];
  if(best){
   const symbol=key(best.c);
   for(let i=out.length-1;i>=0;i--)if(key(out[i])===symbol&&String(out[i]?.action||'').toUpperCase()==='HOLD'&&String(out[i]?.reason||'').startsWith('DIP-FIRST-WAIT'))out.splice(i,1);
   out.push({symbol,action:'BUY',confidence:clamp(best.q.confidence,.58,.79),allocation_pct:best.starter.cap,reason:`EMPTY-DEPOT-STARTER: ${best.starter.dipLike?'Dip priorisiert':'kein brauchbarer Dip vorhanden – sehr kleiner Fallback'} · Score ${best.q.score.toFixed(2)} · Konfidenz ${(best.q.confidence*100).toFixed(0)}% · ${best.starter.cap}% Startposition.`});
   hasBuy=true;
  }
 }

 const finalActions=hasBuy?out:out.filter(a=>!isRotationSell(a));
 if(blocked.length||hasBuy){
  const entryBuys=finalActions.filter(a=>String(a?.action||'').toUpperCase()==='BUY');
  const dipBuys=entryBuys.filter(a=>/DIP|VALUE/i.test(String(a?.reason||''))).length;
  plan.summary=`${String(plan.summary||'').slice(0,132)} · DIP-FIRST: ${blocked.length} teure/unbestaetigte Idee(n) gestoppt; ${entryBuys.length?`${dipBuys||entryBuys.length} Einstieg(e), Dips haben Vorrang`:'kein Kauf – Cash wartet auf Dip'}.`;
 }
 plan.actions=finalActions;
 return{...r,response:JSON.stringify(plan)};
}

export class DipValueEntryAiGuard{
 constructor(base){this.base=base}
 async run(model,input){const r=await this.base.run(model,input);return postProcess(r,input)}
}