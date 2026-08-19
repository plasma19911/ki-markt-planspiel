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
 const quality=(score>=2.9&&confidence>=.58)||(score>=2.55&&confidence>=.66)||(score>=3.8&&confidence>=.54);
 const dipLike=safe&&quality&&((drawKnown&&draw<0)||day<0||m20<0||/DIP|PULLBACK|REBOUND/i.test(String(c?.entryTimingBucket||c?.reason||'')));
 const sellerCooling=accel>0||(m5>m20&&m5<=0)||state==='EARLY_DIP'||Boolean(c?.foresightDip);
 const buyerReady=sellerCooling||m5>=0||['BUILDING','BREAKOUT'].includes(state);
 const realDip=dipLike&&buyerReady&&rsi<72;
 const highLike=!dipLike&&((drawKnown&&draw>=0)||(day>0&&m20>0))&&rsi>=66;
 const dipDepth=(drawKnown&&draw<0?Math.abs(draw):0)+Math.max(0,-day)*.35+Math.max(0,-m20)*.45;
 const dipScore=score*1.05+confidence*2.1+(realDip?2:0)+dipDepth*.65+Math.max(0,accel)*2.1+Math.max(0,-m5)*.12-Math.max(0,day)*.35-(highLike?1.8:0);
 return{score,confidence,day,m5,m20,accel,rsi,drawKnown,draw,event,state,sell,safe,quality,dipLike,sellerCooling,buyerReady,realDip,highLike,dipDepth,dipScore};
}
function dynamicCap(q){return clamp(10+Math.min(12,q.dipDepth*4)+Math.max(0,q.accel)*8,8,28)}

function postProcess(r,input){
 const plan=parsePlan(r),prompt=findPrompt(input);if(!plan||!prompt)return r;
 const candidates=arr(parseBlock(prompt,'Kandidaten=',' Gehalten=')||[]),held=arr(parseBlock(prompt,' Gehalten=')||[]),cash=promptCash(prompt);if(!candidates.length)return r;
 const heldSet=new Set(held.map(key)),cMap=new Map(candidates.map(c=>[key(c),c]));
 const dips=candidates.filter(c=>!heldSet.has(key(c))).map(c=>({c,q:metrics(c)})).filter(x=>x.q.realDip).sort((a,b)=>b.q.dipScore-a.q.dipScore),bestDip=dips[0]||null,blocked=[],out=[];
 for(const a of arr(plan.actions)){
  if(String(a?.action||'').toUpperCase()!=='BUY'){out.push(a);continue}
  const c=cMap.get(key(a)),q=c?metrics(c):null;
  if(bestDip&&!q?.realDip&&key(bestDip.c)!==key(a)){
   blocked.push(key(a));out.push({symbol:key(a),action:'HOLD',confidence:.66,allocation_pct:0,reason:`DIP-FIRST DYNAMIC: ${key(bestDip.c)} hat aktuell den besseren relativen Rücksetzer; kein starres Prozentlimit, sondern Preis-/Momentum-Rangfolge.`});continue;
  }
  if(q?.dipLike&&!q?.buyerReady){blocked.push(key(a));out.push({symbol:key(a),action:'HOLD',confidence:.65,allocation_pct:0,reason:'DIP-FIRST DYNAMIC WAIT: Rücksetzer vorhanden, aber Verkaufsdruck dreht noch nicht. Auf Käuferübernahme warten.'});continue}
  if(q?.realDip){const cap=dynamicCap(q);out.push({...a,allocation_pct:+Math.min(Math.max(1,num(a?.allocation_pct)),cap).toFixed(2),confidence:clamp(num(a?.confidence,q.confidence),.56,.82),reason:`${String(a?.reason||'').slice(0,285)} · DIP-FIRST DYNAMIC: relativer Rücksetzer priorisiert; Tiefe ${q.dipDepth.toFixed(2)} / Beschleunigung ${q.accel>=0?'+':''}${q.accel.toFixed(2)} · finale Freigabe durch Käufer-/Verkäuferkerzen.`});continue}
  if(q?.highLike){out.push({...a,allocation_pct:Math.min(5,Math.max(1,num(a?.allocation_pct))),reason:`${String(a?.reason||'').slice(0,290)} · DIP-FIRST DYNAMIC: kein Rücksetzer; nur kleiner Vorstarter, finale Freigabe nur bei klarer Käuferdominanz.`});continue}
  out.push(a);
 }
 let buys=out.filter(a=>String(a?.action||'').toUpperCase()==='BUY');
 if(!buys.length&&bestDip&&cash>2){const cap=dynamicCap(bestDip.q);out.push({symbol:key(bestDip.c),action:'BUY',confidence:clamp(bestDip.q.confidence,.58,.80),allocation_pct:+cap.toFixed(2),reason:`DIP-FIRST DYNAMIC AUTO: bester relativer Dip im aktuellen Kandidatenfeld; Verkaufsdruck bremst/ Käuferseite beginnt zu übernehmen. Keine feste Dip-%-Grenze; finale Kerzenprüfung folgt.`});buys=out.filter(a=>String(a?.action||'').toUpperCase()==='BUY')}
 if(blocked.length||bestDip)plan.summary=`${String(plan.summary||'').slice(0,155)} · DIP-FIRST DYNAMIC: ${bestDip?`bester Rücksetzer ${key(bestDip.c)}`:'kein bestätigter Dip'}${blocked.length?` · ${blocked.length} schlechter getimter Kauf zurückgestellt`:''}.`;
 plan.actions=out;return{...r,response:JSON.stringify(plan)};
}

export class DipPriorityV2AiGuard{constructor(base){this.base=base}async run(model,input){const r=await this.base.run(model,input);return postProcess(r,input)}}
