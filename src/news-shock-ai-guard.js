import {strongestNewsImpact} from './news-impact-intelligence.js';

const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const key=x=>String(x?.symbol||x||'').toUpperCase().trim();
const responseText=r=>String(r?.response||r?.result?.response||'');

function parsePlan(r){const raw=responseText(r),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j.actions)?j:null}catch{return null}}
function findPrompt(input){for(const m of arr(input?.messages)){const t=String(m?.content||'');if(t.includes('Kandidaten=')&&t.includes(' Gehalten='))return t}return''}
function parseBlock(text,start,end=null){const a=text.indexOf(start);if(a<0)return null;const from=a+start.length,b=end?text.indexOf(end,from):-1;try{return JSON.parse(text.slice(from,b>=0?b:text.length).trim())}catch{return null}}
function candidateMetrics(c={}){return{score:num(c?.liveScore,c?.score),confidence:num(c?.liveConfidence,c?.confidence),day:num(c?.day,c?.day_change,c?.dayChange),m5:num(c?.intraday5m,c?.momentum5),m20:num(c?.intraday20m,c?.momentum20),accel:num(c?.momentumAcceleration5,c?.momentum_acceleration5),draw:Number.isFinite(Number(c?.drawdownFrom20mHighPct??c?.drawdown_from_20m_high_pct))?Number(c?.drawdownFrom20mHighPct??c?.drawdown_from_20m_high_pct):null,rsi:num(c?.intradayRsi,c?.rsi||50),event:String(c?.eventRisk||c?.event_risk||'NONE').toUpperCase()}}
function newsRowsFor(symbol,state,c={}){const b=key(symbol).split('.')[0],rows=[];for(const n of arr(state?.newsRadar)){if(key(n).split('.')[0]===b)rows.push(n)}for(const h of arr(c?.headlines))rows.push(typeof h==='string'?{headline:h}:h);return rows}
function shockProfile(c,state){const rows=newsRowsFor(c?.symbol,state,c),impact=strongestNewsImpact(rows),m=candidateMetrics(c),positive=impact.direction>0&&impact.impact>=4,negative=impact.direction<0&&impact.impact>=4;
 const shockMove=Math.abs(m.day)>=8||Math.abs(m.m20)>=3;
 // Je groesser der News-Schock, desto tiefer muss der erste geordnete Retest sein.
 // Das ist eine dynamische Kontextgroesse, keine allgemeine starre Dip-Schwelle.
 const expectedRetest=clamp(Math.sqrt(Math.max(0,Math.abs(m.day)))*.24,.55,4.25);
 const pulledBack=Number.isFinite(m.draw)&&m.draw<=-expectedRetest;
 const reclaim=m.m5>=0&&m.accel>0&&m.event!=='HIGH';
 const continuationReady=positive&&shockMove&&pulledBack&&reclaim;
 const tooExtended=positive&&shockMove&&!pulledBack;
 return{impact,m,positive,negative,shockMove,expectedRetest,pulledBack,reclaim,continuationReady,tooExtended,rows};}
function reasonImpact(p){const h=String(p.impact.headline||'').slice(0,150);return`${p.impact.type} Impact ${p.impact.impact}/5${h?` · ${h}`:''}`}

function postProcess(r,input,getState){
 const plan=parsePlan(r),prompt=findPrompt(input);if(!plan||!prompt)return r;
 const state=typeof getState==='function'?(getState()||{}):{},candidates=arr(parseBlock(prompt,'Kandidaten=',' Gehalten=')||[]),held=arr(parseBlock(prompt,' Gehalten=')||[]),heldSet=new Set(held.map(key)),map=new Map(candidates.map(c=>[key(c),c]));
 const profiles=candidates.filter(c=>!heldSet.has(key(c))).map(c=>({c,p:shockProfile(c,state)}));
 const positiveShocks=profiles.filter(x=>x.p.positive&&x.p.shockMove).sort((a,b)=>b.p.impact.impact-a.p.impact.impact||b.p.m.score-a.p.m.score);
 const leader=positiveShocks[0]||null;
 const negative=new Map(profiles.filter(x=>x.p.negative).map(x=>[key(x.c),x.p]));
 const out=[],notes=[];

 for(const a of arr(plan.actions)){
  const act=String(a?.action||'').toUpperCase(),s=key(a),c=map.get(s),p=c?shockProfile(c,state):null;
  if(act==='BUY'&&negative.has(s)){
   const q=negative.get(s);out.push({symbol:s,action:'HOLD',confidence:.78,allocation_pct:0,reason:`NEWS-IMPACT BLOCK: fundamentaler negativer Katalysator (${reasonImpact(q)}). Kein optischer Dip-Kauf gegen strukturelle News.`});notes.push(`${s} negativer News-Schock blockiert`);continue;
  }
  if(act==='BUY'&&leader&&key(leader.c)!==s&&leader.p.tooExtended&&leader.p.m.score>=num(c?.score)-.5){
   out.push({symbol:s,action:'HOLD',confidence:.70,allocation_pct:0,reason:`NEWS-SHOCK PRIORITY: ${key(leader.c)} ist der dominante fundamentale News-Leader, aber noch zu weit vom geordneten Retest entfernt. Cash bleibt frei statt in einen schwaecheren Ersatz-Trade zu gehen.`});notes.push(`Cash fuer ${key(leader.c)}-Retest frei`);continue;
  }
  if(act==='BUY'&&p?.positive&&p.shockMove&&!p.continuationReady){
   out.push({symbol:s,action:'HOLD',confidence:.72,allocation_pct:0,reason:`NEWS-SHOCK WAIT: ${reasonImpact(p)}. Grosser News-Sprung wird nicht am Peak gejagt. Erwarteter geordneter Retest ca. ${p.expectedRetest.toFixed(2)}% relativ zur lokalen Struktur; danach Käufer-Reclaim abwarten.`});notes.push(`${s} wartet auf News-Retest`);continue;
  }
  if(act==='BUY'&&p?.continuationReady){
   out.push({...a,allocation_pct:+Math.min(12,Math.max(2,num(a?.allocation_pct))).toFixed(2),confidence:clamp(Math.max(num(a?.confidence,.65),.74),.62,.88),reason:`${String(a?.reason||'').slice(0,210)} · NEWS-SHOCK CONTINUATION: ${reasonImpact(p)} · geordneter Retest ${p.m.draw.toFixed(2)}% und Käufer-Reclaim bestätigt; kleiner Starter, finale Candle-Flow-Prüfung folgt.`});continue;
  }
  out.push(a);
 }

 // Wenn die normale KI gar keinen BUY plant, aber ein strukturell positiver News-Schock
 // seinen Retest + Reclaim erreicht hat, darf ein kleiner Starter vorgeschlagen werden.
 const hasBuy=out.some(a=>String(a?.action||'').toUpperCase()==='BUY');
 if(!hasBuy&&leader?.p.continuationReady){out.push({symbol:key(leader.c),action:'BUY',confidence:clamp(Math.max(leader.p.m.confidence,.74),.62,.86),allocation_pct:8,reason:`NEWS-SHOCK AUTO: ${reasonImpact(leader.p)} · nach grossem News-Sprung jetzt geordneter Retest ${leader.p.m.draw.toFixed(2)}% + positiver Reclaim. Kein Peak-Chase; kleiner Starter, Candle-Flow entscheidet final.`});notes.push(`${key(leader.c)} News-Retest aktiviert`)}

 plan.actions=out;
 if(notes.length)plan.summary=`${String(plan.summary||'').slice(0,145)} · NEWS-IMPACT: ${notes.slice(0,3).join(' · ')}.`;
 return{...r,response:JSON.stringify(plan)};
}

export class NewsShockAiGuard{
 constructor(base,{getState=null}={}){this.base=base;this.getState=getState}
 async run(model,input){const r=await this.base.run(model,input);return postProcess(r,input,this.getState)}
}
