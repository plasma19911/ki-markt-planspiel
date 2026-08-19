import {targetVenueIssue} from './target-venue-ai-guard.js';

// Finale Preis-Schutzschicht vor der Ausfuehrung.
// Die KI darf nicht mehr nur deshalb kaufen, weil Cash frei ist. Bevorzugt werden
// kontrollierte Ruecksetzer. Ein noch leicht fallender Kurs ist als kleine
// Starterposition erlaubt, wenn der Abwaertsdruck sichtbar nachlaesst. Groesser
// wird erst beim bestaetigten Rebound gekauft. Near-High/Breakout bleibt Ausnahme.

const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const key=x=>String(x?.symbol||x||'').toUpperCase();
const responseText=r=>String(r?.response||r?.result?.response||'');

function parseBlock(text,start,end=null){const a=text.indexOf(start);if(a<0)return null;const from=a+start.length,b=end?text.indexOf(end,from):-1;try{return JSON.parse(text.slice(from,b>=0?b:text.length).trim())}catch{return null}}
function parsePlan(r){const raw=responseText(r),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j.actions)?j:null}catch{return null}}
function findPrompt(input){for(const m of arr(input?.messages)){const t=String(m?.content||'');if(t.includes('Kandidaten=')&&t.includes(' Gehalten='))return t}return''}
function promptCash(text){const m=String(text||'').match(/\bCash\s+([0-9]+(?:[.,][0-9]+)?)/i);return m?num(String(m[1]).replace(',','.')):0}
function isRotationSell(a={}){return String(a?.action||'').toUpperCase()==='SELL'&&/(?:CAPITAL-MOTION-ROTATION|OPPORTUNITY-COST-ROTATION)/i.test(String(a?.reason||''))}

function metrics(c={}){
 const score=num(c?.liveScore,c?.score),confidence=num(c?.liveConfidence,c?.confidence),news=num(c?.newsScore,c?.news_score??c?.news),day=num(c?.day,c?.day_change),m5=num(c?.intraday5m,c?.momentum5),m20=num(c?.intraday20m,c?.momentum20),accel=num(c?.momentumAcceleration5,c?.momentum_acceleration5),rsi=num(c?.intradayRsi,c?.rsi||50),rawDraw=c?.drawdownFrom20mHighPct??c?.drawdown_from_20m_high_pct,drawKnown=Number.isFinite(Number(rawDraw)),draw=drawKnown?Number(rawDraw):null,event=String(c?.eventRisk||c?.event_risk||'NONE').toUpperCase(),state=String(c?.momentumState||c?.momentum_state||'NORMAL').toUpperCase(),sell=String(c?.momentumSellSignal||c?.momentum_sell_signal||'NONE').toUpperCase();
 const hardSafe=event!=='HIGH'&&sell!=='STRONG'&&!['REVERSAL','EXHAUSTION'].includes(state)&&!targetVenueIssue(c);
 const quality=(score>=4.10&&confidence>=.62)||(score>=3.70&&confidence>=.70)||(score>=3.55&&confidence>=.66&&news>=.28);
 return{score,confidence,news,day,m5,m20,accel,rsi,drawKnown,draw,event,state,sell,hardSafe,quality};
}

export function assessDipValueEntry(c={}){
 const x=metrics(c);
 const inDip=x.drawKnown&&x.draw<=-.55&&x.draw>=-4.50;
 const deepDip=x.drawKnown&&x.draw<=-1.25&&x.draw>=-4.50;
 const falling=x.m5<0||x.m20<0;
 // Kurs darf noch fallen, aber nur wenn die kurzfristige Beschleunigung bereits
 // nach oben dreht. So kaufen wir frueher im Ruecksetzer ohne blind ins Messer zu greifen.
 const fallSlowing=falling&&x.m5>=-.30&&x.m20>=-1.25&&x.accel>=.030;
 const dipStarter=x.hardSafe&&x.quality&&inDip&&fallSlowing&&x.rsi>=31&&x.rsi<=61&&x.day>=-8&&x.day<=1.50;
 const rebound=x.hardSafe&&x.quality&&inDip&&x.m5>=-.015&&x.m5<=.24&&x.m20>=-.65&&x.accel>=.015&&x.rsi>=33&&x.rsi<=66&&x.day<=2.20;
 const unknownValue=x.hardSafe&&x.quality&&!x.drawKnown&&x.day<=0&&x.m20<=0&&x.m20>=-.85&&x.m5>=-.18&&x.m5<=.08&&x.accel>=.025&&x.rsi>=33&&x.rsi<=59;
 const nearHigh=x.drawKnown&&x.draw>-.35;
 // Breakout-Kauf nur noch in einer sehr engen Ausnahme und maximal als Mini-Starter.
 const exceptionalBreakout=x.hardSafe&&x.score>=5.80&&x.confidence>=.76&&nearHigh&&x.day>=-.20&&x.day<=.70&&x.m5>=.04&&x.m5<=.16&&x.m20>=.08&&x.m20<=.45&&x.accel>=.030&&x.rsi<62;
 const mode=rebound?'DIP_REBOUND':dipStarter?(deepDip?'DEEP_DIP_STARTER':'DIP_STARTER'):unknownValue?'VALUE_STARTER':exceptionalBreakout?'EXCEPTIONAL_BREAKOUT':'WAIT_FOR_VALUE';
 const allow=rebound||dipStarter||unknownValue||exceptionalBreakout;
 const cap=rebound?28:dipStarter?(deepDip?12:16):unknownValue?10:exceptionalBreakout?8:0;
 const valueScore=x.score*1.15+x.confidence*2+x.news*.20+(inDip?Math.min(2.5,Math.abs(x.draw))*.42:0)+(x.accel>0?Math.min(.25,x.accel)*1.6:0)-(nearHigh?1.35:0)-(x.day>1?Math.min(6,x.day-1)*.28:0);
 const blockers=[];
 if(!x.hardSafe)blockers.push('harte Safety');
 if(!x.quality)blockers.push('Qualitaet/Konfidenz');
 if(nearHigh&&!exceptionalBreakout)blockers.push('zu nah am 20m-Hoch');
 if(inDip&&!fallSlowing&&!rebound)blockers.push('Abwaertsdruck noch nicht gebremst');
 if(x.drawKnown&&!inDip&&!nearHigh)blockers.push('noch kein attraktiver Ruecksetzer');
 if(!x.drawKnown&&!unknownValue)blockers.push('Preisposition nicht guenstig bestaetigt');
 if(x.rsi>66)blockers.push('RSI zu hoch');
 if(x.day>2.2)blockers.push('Tag bereits zu weit gelaufen');
 return{allow,mode,cap,valueScore:+valueScore.toFixed(3),...x,falling,fallSlowing,inDip,deepDip,rebound,dipStarter,unknownValue,exceptionalBreakout,blockers:[...new Set(blockers)]};
}

function reasonFor(q){
 if(q.mode==='DIP_REBOUND')return `Ruecksetzer ${q.draw?.toFixed(2)}% vom 20m-Hoch stabilisiert sich; 5m ${q.m5>=0?'+':''}${q.m5.toFixed(2)}%, Beschl. ${q.accel>=0?'+':''}${q.accel.toFixed(2)}`;
 if(q.mode==='DEEP_DIP_STARTER'||q.mode==='DIP_STARTER')return `Kurs noch im Ruecksetzer (${q.draw?.toFixed(2)}% vom 20m-Hoch), aber Fall bremst: 5m ${q.m5.toFixed(2)}%, Beschl. +${q.accel.toFixed(2)}`;
 if(q.mode==='VALUE_STARTER')return `Aktie heute nicht hochgelaufen; kurzfristiger Abwaertsdruck bremst, kleine Value-Starterposition`;
 if(q.mode==='EXCEPTIONAL_BREAKOUT')return `Ausnahme-Breakout nur als Mini-Starter; nicht hinterherlaufen`;
 return q.blockers.join(' · ')||'kein guenstiger Einstieg';
}

function postProcess(r,input){
 const plan=parsePlan(r),prompt=findPrompt(input);if(!plan||!prompt)return r;
 const candidates=arr(parseBlock(prompt,'Kandidaten=',' Gehalten=')||[]),held=arr(parseBlock(prompt,' Gehalten=')||[]),cash=promptCash(prompt);
 if(!candidates.length)return r;
 const cMap=new Map(candidates.map(c=>[key(c),c])),heldSet=new Set(held.map(key)),out=[],blocked=[];

 for(const a of arr(plan.actions)){
  if(String(a?.action||'').toUpperCase()!=='BUY'){out.push(a);continue}
  const c=cMap.get(key(a)),q=c?assessDipValueEntry(c):null;
  if(!q?.allow){blocked.push({symbol:key(a),q});out.push({symbol:key(a),action:'HOLD',confidence:.64,allocation_pct:0,reason:`DIP-FIRST-WAIT: ${q?reasonFor(q):'Preis-Timing nicht verifizierbar'}. Cash bleibt frei statt teuer einzusteigen.`});continue}
  out.push({...a,allocation_pct:Math.min(Math.max(1,num(a?.allocation_pct)),q.cap),confidence:clamp(num(a?.confidence,q.confidence),.55,.82),reason:`DIP-FIRST ${q.mode}: ${reasonFor(q)} · max. ${q.cap}% Starter/Zielanteil`});
 }

 let hasBuy=out.some(a=>String(a?.action||'').toUpperCase()==='BUY');
 // Wenn die bisherige KI keinen Kauf wollte, darf ein starker Ruecksetzer jetzt
 // trotzdem frueher als kleine Position gekauft werden – genau bevor das Tape
 // bereits wieder deutlich hochgelaufen ist.
 if(!hasBuy&&cash>2){
  const best=candidates.filter(c=>!heldSet.has(key(c))).map(c=>({c,q:assessDipValueEntry(c)})).filter(x=>x.q.allow&&x.q.mode!=='EXCEPTIONAL_BREAKOUT').sort((a,b)=>b.q.valueScore-a.q.valueScore)[0];
  if(best){
   out.push({symbol:key(best.c),action:'BUY',confidence:clamp(best.q.confidence,.58,.80),allocation_pct:best.q.cap,reason:`DIP-FIRST AUTO ${best.q.mode}: ${reasonFor(best.q)} · bewusst kleiner Einstieg ${best.q.cap}%, Rest-Cash fuer weiteren Ruecksetzer/Rebound`});
   hasBuy=true;
  }
 }

 // Rotation nur zum Zweck eines anschliessend blockierten teuren Kaufs vermeiden.
 const finalActions=hasBuy?out:out.filter(a=>!isRotationSell(a));
 if(blocked.length||hasBuy){
  const dipBuys=finalActions.filter(a=>String(a?.action||'').toUpperCase()==='BUY');
  plan.summary=`${String(plan.summary||'').slice(0,145)} · DIP-FIRST: ${blocked.length} zu teure/unbestaetigte Kaufidee(n) gestoppt; ${dipBuys.length?`${dipBuys.length} guenstiger Dip-/Value-Einstieg`: 'kein Kauf – Cash wartet auf besseren Preis'}.`;
 }
 plan.actions=finalActions;
 return{...r,response:JSON.stringify(plan)};
}

export class DipValueEntryAiGuard{
 constructor(base){this.base=base}
 async run(model,input){const r=await this.base.run(model,input);return postProcess(r,input)}
}
