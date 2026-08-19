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
 const quality=(score>=2.90&&confidence>=.58)||(score>=2.55&&confidence>=.66)||(score>=3.80&&confidence>=.54);
 const realDip=safe&&quality&&drawKnown&&draw<=-.35&&draw>=-5.75&&day<=.45&&day>=-9&&m5>=-.38&&m5<=.28&&m20>=-1.80&&m20<=.45&&accel>=.008&&rsi>=28&&rsi<=68;
 const deepDip=realDip&&draw<=-1.20;
 const highLike=(drawKnown&&draw>-.30)||day>.85||m20>.85||rsi>72;
 const dipScore=score*1.05+confidence*2.1+(realDip?2.0:0)+(deepDip?1.0:0)+(drawKnown&&draw<0?Math.min(4,Math.abs(draw))*.72:0)+(day<0?Math.min(4,Math.abs(day))*.28:0)+Math.max(0,Math.min(.5,accel))*2.2-Math.max(0,day)*.85-(highLike?2.5:0);
 return{score,confidence,day,m5,m20,accel,rsi,drawKnown,draw,event,state,sell,safe,quality,realDip,deepDip,highLike,dipScore};
}
function dipCap(q){return q.deepDip?16:12}

function postProcess(r,input){
 const plan=parsePlan(r),prompt=findPrompt(input);if(!plan||!prompt)return r;
 const candidates=arr(parseBlock(prompt,'Kandidaten=',' Gehalten=')||[]),held=arr(parseBlock(prompt,' Gehalten=')||[]),cash=promptCash(prompt);if(!candidates.length)return r;
 const heldSet=new Set(held.map(key)),cMap=new Map(candidates.map(c=>[key(c),c]));
 const dips=candidates.filter(c=>!heldSet.has(key(c))).map(c=>({c,q:metrics(c)})).filter(x=>x.q.realDip).sort((a,b)=>b.q.dipScore-a.q.dipScore);
 const bestDip=dips[0]||null,blockedHigh=[],out=[];
 for(const a of arr(plan.actions)){
  if(String(a?.action||'').toUpperCase()!=='BUY'){out.push(a);continue}
  const c=cMap.get(key(a)),q=c?metrics(c):null;
  if(q?.highLike&&bestDip&&key(bestDip.c)!==key(a)){
   blockedHigh.push(key(a));out.push({symbol:key(a),action:'HOLD',confidence:.66,allocation_pct:0,reason:`DIP-FIRST V2: ${key(bestDip.c)} bietet aktuell den besseren echten Ruecksetzer; High-/Momentum-Kauf ${key(a)} wird zurueckgestellt.`});continue;
  }
  if(q?.realDip){out.push({...a,allocation_pct:Math.min(Math.max(1,num(a?.allocation_pct)),dipCap(q)),confidence:clamp(num(a?.confidence,q.confidence),.56,.82),reason:`${String(a?.reason||'').slice(0,300)} · DIP-FIRST V2: echter Ruecksetzer ${q.draw.toFixed(2)}% unter 20m-Hoch; Einstieg auf ${dipCap(q)}% begrenzt.`});continue}
  if(q?.highLike){out.push({...a,allocation_pct:Math.min(3,Math.max(1,num(a?.allocation_pct))),reason:`${String(a?.reason||'').slice(0,300)} · DIP-FIRST V2: kein guter Dip; High-Kauf nur als max. 3%-Mini-Starter.`});continue}
  out.push(a);
 }
 let buys=out.filter(a=>String(a?.action||'').toUpperCase()==='BUY');
 if(!buys.length&&bestDip&&cash>2){out.push({symbol:key(bestDip.c),action:'BUY',confidence:clamp(bestDip.q.confidence,.58,.80),allocation_pct:dipCap(bestDip.q),reason:`DIP-FIRST V2 AUTO: echter Ruecksetzer ${bestDip.q.draw.toFixed(2)}% unter 20m-Hoch, Tag ${bestDip.q.day>=0?'+':''}${bestDip.q.day.toFixed(2)}%, 5m ${bestDip.q.m5>=0?'+':''}${bestDip.q.m5.toFixed(2)}%, Beschl. ${bestDip.q.accel>=0?'+':''}${bestDip.q.accel.toFixed(2)} · ${dipCap(bestDip.q)}% Starter.`});buys=out.filter(a=>String(a?.action||'').toUpperCase()==='BUY')}
 if(blockedHigh.length||bestDip){plan.summary=`${String(plan.summary||'').slice(0,155)} · DIP-FIRST V2: ${bestDip?`bester echter Dip ${key(bestDip.c)} (${bestDip.q.draw.toFixed(2)}%)`:'kein echter Dip'}${blockedHigh.length?` · ${blockedHigh.length} High-Kauf/-kaeufe zurueckgestellt`:''}.`}
 plan.actions=out;return{...r,response:JSON.stringify(plan)};
}

export class DipPriorityV2AiGuard{
 constructor(base){this.base=base}
 async run(model,input){const r=await this.base.run(model,input);return postProcess(r,input)}
}
