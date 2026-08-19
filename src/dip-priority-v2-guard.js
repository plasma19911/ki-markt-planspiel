const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const key=x=>String(x?.symbol||x||'').toUpperCase();
const responseText=r=>String(r?.response||r?.result?.response||'');
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));

function parsePlan(r){const raw=responseText(r),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j.actions)?j:null}catch{return null}}
function findPrompt(input){for(const m of arr(input?.messages)){const t=String(m?.content||'');if(t.includes('Kandidaten=')&&t.includes(' Gehalten='))return t}return''}
function parseBlock(text,start,end=null){const a=text.indexOf(start);if(a<0)return null;const from=a+start.length,b=end?text.indexOf(end,from):-1;try{return JSON.parse(text.slice(from,b>=0?b:text.length).trim())}catch{return null}}
function promptCash(text){const m=String(text||'').match(/\bCash\s+([0-9]+(?:[.,][0-9]+)?)/i);return m?num(String(m[1]).replace(',','.')):0}
function firstNum(...xs){for(const x of xs)if(Number.isFinite(Number(x)))return Number(x);return 0}

function metrics(c={}){
 const score=firstNum(c?.liveScore,c?.score),confidence=firstNum(c?.liveConfidence,c?.confidence),day=firstNum(c?.day,c?.day_change,c?.dayChange,c?.pcWideSessionPct),m5=firstNum(c?.intraday5m,c?.momentum5,c?.pcWideM5Pct),m20=firstNum(c?.intraday20m,c?.momentum20,c?.pcWideM20Pct),accel=firstNum(c?.momentumAcceleration5,c?.momentum_acceleration5,c?.pcWideAccelerationPct),rsi=firstNum(c?.intradayRsi,c?.rsi,50),rawDraw=c?.drawdownFrom20mHighPct??c?.drawdown_from_20m_high_pct,drawKnown=Number.isFinite(Number(rawDraw)),draw=drawKnown?Number(rawDraw):null,event=String(c?.eventRisk||c?.event_risk||'NONE').toUpperCase(),state=String(c?.momentumState||c?.momentum_state||'NORMAL').toUpperCase(),sell=String(c?.momentumSellSignal||c?.momentum_sell_signal||'NONE').toUpperCase();
 const safe=event!=='HIGH'&&sell!=='STRONG'&&!['REVERSAL','EXHAUSTION'].includes(state);
 const qualityScore=score*1.08+confidence*3.1+Math.max(0,accel)*1.8+Math.max(0,m5)*.22+Math.max(0,m20)*.10;
 const dipLike=safe&&((drawKnown&&draw<0)||day<0||m20<0||/DIP|PULLBACK|REBOUND/i.test(String(c?.entryTimingBucket||c?.reason||'')));
 const sellerCooling=accel>0||(m5>m20&&m5<=0)||state==='EARLY_DIP'||Boolean(c?.foresightDip);
 const buyerReady=sellerCooling||m5>=0||['BUILDING','BREAKOUT'].includes(state);
 const realDip=safe&&dipLike&&buyerReady&&rsi<78&&qualityScore>=4.6;
 const continuation=safe&&['BUILDING','BREAKOUT'].includes(state)&&m5>0&&m20>=0&&accel>=-.03&&rsi<86&&qualityScore>=5.0;
 const highLike=safe&&!dipLike&&((drawKnown&&draw>=0)||(day>0&&m20>0))&&rsi>=72;
 const dipDepth=(drawKnown&&draw<0?Math.abs(draw):0)+Math.max(0,-day)*.30+Math.max(0,-m20)*.40;
 const opportunityScore=qualityScore+(realDip?2.2:0)+(continuation?1.9:0)+dipDepth*.52+(sellerCooling?.65:0)-(highLike?.65:0);
 return{score,confidence,day,m5,m20,accel,rsi,drawKnown,draw,event,state,sell,safe,qualityScore,dipLike,sellerCooling,buyerReady,realDip,continuation,highLike,dipDepth,opportunityScore};
}
function dynamicDipCap(q){return clamp(11+Math.min(13,q.dipDepth*4)+Math.max(0,q.accel)*8,8,30)}
function continuationCap(q){return clamp(6+Math.max(0,q.qualityScore-5)*1.6+Math.max(0,q.accel)*6,5,13)}

function postProcess(r,input){
 const plan=parsePlan(r),prompt=findPrompt(input);if(!plan||!prompt)return r;
 const candidates=arr(parseBlock(prompt,'Kandidaten=',' Gehalten=')||[]),held=arr(parseBlock(prompt,' Gehalten=')||[]),cash=promptCash(prompt);if(!candidates.length)return r;
 const heldSet=new Set(held.map(key)),cMap=new Map(candidates.map(c=>[key(c),c]));
 const ranked=candidates.filter(c=>!heldSet.has(key(c))).map(c=>({c,q:metrics(c)})).filter(x=>x.q.safe).sort((a,b)=>b.q.opportunityScore-a.q.opportunityScore);
 const bestDip=ranked.find(x=>x.q.realDip)||null,bestContinuation=ranked.find(x=>x.q.continuation)||null,best=bestDip||bestContinuation||ranked[0]||null;
 const out=[],notes=[];
 for(const a of arr(plan.actions)){
  if(String(a?.action||'').toUpperCase()!=='BUY'){out.push(a);continue}
  const c=cMap.get(key(a)),q=c?metrics(c):null;if(!q){out.push(a);continue}
  if(!q.safe){out.push({symbol:key(a),action:'HOLD',confidence:.72,allocation_pct:0,reason:'OPPORTUNITY SAFETY: harter Event-/Reversal-/STRONG-SELL-Zustand. Kein Starter gegen eindeutiges Risiko.'});continue}
  if(q.realDip){const cap=dynamicDipCap(q);out.push({...a,allocation_pct:+Math.min(Math.max(2,num(a?.allocation_pct)),cap).toFixed(2),reason:`${String(a?.reason||'').slice(0,260)} · OPPORTUNITY V3: guter relativer Dip; Rang ${q.opportunityScore.toFixed(1)}, Verkäuferdruck bremst. Bis ${cap.toFixed(1)}% Starter/Staffel, Candle-Flow entscheidet final.`});continue}
  if(q.continuation){const cap=continuationCap(q);out.push({...a,allocation_pct:+Math.min(Math.max(2,num(a?.allocation_pct)),cap).toFixed(2),reason:`${String(a?.reason||'').slice(0,250)} · OPPORTUNITY V3 CONTINUATION: kein Dip nötig, wenn Käufertrend/Breakout intakt ist. Kleiner ${cap.toFixed(1)}%-Starter; Candle-Flow und Mehr-Zeitebenen-Kontext entscheiden final.`});continue}
  if(bestDip&&key(bestDip.c)!==key(a)){
   const small=clamp(Math.min(num(a?.allocation_pct,4),5),2,5);out.push({...a,allocation_pct:+small.toFixed(2),reason:`${String(a?.reason||'').slice(0,235)} · OPPORTUNITY V3: ${key(bestDip.c)} ist der bessere Dip, aber dieser Trade wird nicht mehr komplett verdrängt. Nur ${small.toFixed(1)}%-Vorstarter, falls Candle-Flow Käufer bestätigt.`});notes.push(`${key(a)} nicht mehr durch besten Dip komplett blockiert`);continue
  }
  if(q.dipLike&&!q.buyerReady){const small=clamp(Math.min(num(a?.allocation_pct,3),3.5),1.5,3.5);out.push({...a,allocation_pct:+small.toFixed(2),reason:`${String(a?.reason||'').slice(0,230)} · OPPORTUNITY V3 EARLY: Rücksetzer noch ohne klare Drehung; nur Mini-Starter-Kandidat. Candle-Flow darf ihn weiterhin auf WAIT setzen.`});continue}
  if(q.highLike){const small=clamp(Math.min(num(a?.allocation_pct,4),6),2,6);out.push({...a,allocation_pct:+small.toFixed(2),reason:`${String(a?.reason||'').slice(0,235)} · OPPORTUNITY V3: bereits hoch gelaufen, aber nicht pauschal verboten. Max. ${small.toFixed(1)}%-Starter nur bei echter Käuferdominanz.`});continue}
  out.push(a);
 }
 let buys=out.filter(a=>String(a?.action||'').toUpperCase()==='BUY');
 if(!buys.length&&best&&cash>2){
  const q=best.q,allocation=q.realDip?Math.min(12,dynamicDipCap(q)):q.continuation?Math.min(8,continuationCap(q)):q.qualityScore>=5.4?4:0;
  if(allocation>0){out.push({symbol:key(best.c),action:'BUY',confidence:clamp(Math.max(q.confidence,.61),.58,.84),allocation_pct:+allocation.toFixed(2),reason:`OPPORTUNITY AUTO V3: stärkste aktuell sichere Chance im Kandidatenfeld (Rang ${q.opportunityScore.toFixed(1)}; ${q.realDip?'Dip':q.continuation?'Continuation/Breakout':'Qualitätssetup'}). Kein Zwangskauf: nur Starter, finale Candle-/Mehr-Zeitebenen-Prüfung folgt.`});notes.push(`${key(best.c)} als stärkste Chance aktiviert`)}
 }
 plan.actions=out;if(notes.length)plan.summary=`${String(plan.summary||'').slice(0,145)} · OPPORTUNITY V3: ${notes.slice(0,3).join(' · ')}.`;return{...r,response:JSON.stringify(plan)};
}

export class DipPriorityV2AiGuard{constructor(base){this.base=base}async run(model,input){const r=await this.base.run(model,input);return postProcess(r,input)}}
