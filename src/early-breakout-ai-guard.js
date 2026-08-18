// Schutzschicht fuer den Early-Breakout-Discovery-Pool.
// Sie darf niemals selbst einen BUY erzeugen. Sie validiert nur bereits vom
// bestehenden AI/Profit-Optimizer vorgeschlagene Early-Breakout-Kaeufe.

const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const key=x=>String(x?.symbol||x||'').toUpperCase();
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const responseText=r=>String(r?.response||r?.result?.response||'');

function parseBlock(text,start,end=null){const a=text.indexOf(start);if(a<0)return null;const from=a+start.length,b=end?text.indexOf(end,from):-1;try{return JSON.parse(text.slice(from,b>=0?b:text.length).trim())}catch{return null}}
function parsePlan(r){const raw=responseText(r),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j.actions)?j:null}catch{return null}}
function findPlanMessage(input){for(let i=0;i<arr(input?.messages).length;i++){const t=String(input.messages[i]?.content||'');if(t.includes('Kandidaten=')&&t.includes(' Gehalten='))return{i,text:t}}return null}
function watchMap(state){return new Map(arr(state?.earlyBreakoutWatch?.candidates).map(x=>[key(x),x]))}

export function evaluateEarlyBreakout(c={}){
  const day=num(c?.day,c?.day_change),m5=num(c?.intraday5m,c?.momentum5),m20=num(c?.intraday20m,c?.momentum20),accel=num(c?.momentumAcceleration5,c?.momentumAcceleration),rsi=num(c?.intradayRsi,c?.rsi||50),vol=num(c?.volumeRatio,c?.volume_ratio||1),breakout=num(c?.momentumBreakoutScore),state=String(c?.momentumState||'NORMAL').toUpperCase(),sell=String(c?.momentumSellSignal||'NONE').toUpperCase(),event=String(c?.eventRisk||c?.event_risk||'NONE').toUpperCase();
  const volumeKnown=Number.isFinite(Number(c?.volumeRatio??c?.volume_ratio)),volumeOk=!volumeKnown||vol>=1.05;
  const tooLate=day>8||rsi>=80||m20>2.8;
  const hardBad=event==='HIGH'||sell==='STRONG'||state==='REVERSAL'||m5<-.12||tooLate;
  let q=0;const why=[];
  if(day>=.35&&day<=6.5){q+=1.2;why.push(`Tag +${day.toFixed(1)}% noch im Early-Fenster`)}else if(day>6.5)q-=2;
  if(m5>.08){q+=1.5;why.push(`5m +${m5.toFixed(2)}%`)}else if(m5<0)q-=1.5;
  if(m20>.15&&m20<=2.2){q+=1.3;why.push(`20m +${m20.toFixed(2)}%`)}else if(m20>2.8)q-=1.5;
  if(accel>.02){q+=1.1;why.push(`Beschleunigung +${accel.toFixed(2)}`)}else if(accel<-.12)q-=1;
  if(['BUILDING','BREAKOUT'].includes(state)||breakout>=1.4){q+=1.25;why.push(`Momentum ${state}`)}
  if(rsi>=45&&rsi<=74){q+=.7;why.push(`RSI ${rsi.toFixed(0)}`)}else if(rsi>=78)q-=1.5;
  if(volumeOk){q+=.55;if(volumeKnown)why.push(`Volumen x${vol.toFixed(1)}`)}
  if(hardBad)q-=8;
  const confirmed=!hardBad&&day>=.35&&day<=6.5&&m5>.08&&m20>.15&&m20<=2.8&&accel>=-.03&&(['BUILDING','BREAKOUT'].includes(state)||breakout>=1.4)&&rsi<78&&volumeOk;
  return{confirmed,quality:q,hardBad,tooLate,day,m5,m20,accel,rsi,vol,state,why};
}

function enrichInput(input,state){
  const hit=findPlanMessage(input);if(!hit)return input;
  const candidates=parseBlock(hit.text,'Kandidaten=',' Gehalten=');if(!Array.isArray(candidates))return input;
  const wm=watchMap(state),enriched=candidates.map(c=>{const w=wm.get(key(c));if(!w)return c;const e=evaluateEarlyBreakout(c);return{...c,earlyBreakoutWatch:true,earlyBreakoutRank:num(w.rank),earlyBreakoutSource:w.source||null,earlyBreakoutConfirmed:e.confirmed,earlyBreakoutQuality:+e.quality.toFixed(2)}});
  const a=hit.text.indexOf('Kandidaten='),b=hit.text.indexOf(' Gehalten=',a),prefix=hit.text.slice(0,a),suffix=hit.text.slice(b);
  const policy='EARLY-BREAKOUT-RADAR: Top-Gainer-Listen sind nur Discovery. Niemals allein wegen Tagesplus kaufen. BUY nur wenn der Lauf noch frueh ist und 5m/20m-Momentum, Beschleunigung, Momentumstruktur, Volumen und RSI live bestaetigen. Ueberhitzte oder spaete Gewinner bleiben HOLD. Diese Schicht darf keinen BUY erzwingen. ';
  const messages=input.messages.slice();messages[hit.i]={...messages[hit.i],content:`${prefix}${policy}Kandidaten=${JSON.stringify(enriched)}${suffix}`};return{...input,messages};
}

function postProcess(r,input,state){
  const plan=parsePlan(r),hit=findPlanMessage(input);if(!plan||!hit)return r;
  const candidates=parseBlock(hit.text,'Kandidaten=',' Gehalten=');if(!Array.isArray(candidates))return r;
  const cMap=new Map(candidates.map(c=>[key(c),c])),wm=watchMap(state);let validated=0,blocked=0;
  const actions=arr(plan.actions).map(a=>{
    if(String(a?.action||'').toUpperCase()!=='BUY'||!wm.has(key(a)))return a;
    const c=cMap.get(key(a));if(!c)return a;const e=evaluateEarlyBreakout(c);
    if(!e.confirmed){blocked++;return{symbol:key(a),action:'HOLD',confidence:clamp(num(a.confidence,.55),.5,.8),allocation_pct:0,reason:`EARLY-BREAKOUT-BLOCK: noch kein frueher bestaetigter Ausbruch · Qualität ${e.quality.toFixed(2)} · ${e.why.slice(0,4).join(' · ')}`}}
    validated++;const cap=e.day>4?30:45,pct=Math.min(cap,Math.max(0,num(a.allocation_pct)));return{...a,allocation_pct:+pct.toFixed(2),reason:`${String(a.reason||'').slice(0,180)} · EARLY-BREAKOUT bestätigt ${e.quality.toFixed(2)} · ${e.why.slice(0,4).join(' · ')} · max. ${cap}%`};
  });
  plan.actions=actions;plan.summary=`${String(plan.summary||'').slice(0,205)} · EARLY-BREAKOUT: ${wm.size} entdeckt, ${validated} BUY validiert, ${blocked} spaete/unbestaetigte BUYs blockiert; kein Zwangskauf.`;
  return{...r,response:JSON.stringify(plan)};
}

export class EarlyBreakoutAiGuard{
  constructor(base,adapter){this.base=base;this.adapter=adapter}
  async run(model,input){const joined=String(arr(input?.messages).map(x=>x?.content||'').join('\n')),isPlan=joined.includes('Kandidaten=')&&joined.includes('JSON-only');if(!isPlan)return this.base.run(model,input);const state=this.adapter?.peekState?.()||null,next=enrichInput(input,state),r=await this.base.run(model,next);return postProcess(r,next,state)}
}
