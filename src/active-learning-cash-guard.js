import {targetVenueIssue} from './target-venue-ai-guard.js';

const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const key=x=>String(x?.symbol||x||'').toUpperCase().trim();
const responseText=r=>String(r?.response||r?.result?.response||'');

function parseBlock(text,start,end=null){const a=text.indexOf(start);if(a<0)return null;const from=a+start.length,b=end?text.indexOf(end,from):-1;try{return JSON.parse(text.slice(from,b>=0?b:text.length).trim())}catch{return null}}
function parsePlan(r){const raw=responseText(r),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j.actions)?j:null}catch{return null}}
function findPrompt(input){for(const m of arr(input?.messages)){const t=String(m?.content||'');if(t.includes('Kandidaten=')&&t.includes(' Gehalten='))return t}return''}

function metrics(c={}){
 return{
  score:num(c?.liveScore,c?.score),confidence:num(c?.liveConfidence,c?.confidence),day:num(c?.day,c?.day_change),
  m5:num(c?.intraday5m,c?.momentum5),m20:num(c?.intraday20m,c?.momentum20),accel:num(c?.momentumAcceleration5,c?.momentum_acceleration5),
  rsi:num(c?.intradayRsi,c?.rsi||50),draw:Number.isFinite(Number(c?.drawdownFrom20mHighPct??c?.drawdown_from_20m_high_pct))?Number(c?.drawdownFrom20mHighPct??c?.drawdown_from_20m_high_pct):null,
  vol:Number.isFinite(Number(c?.volumeRatio??c?.volume_ratio))?Number(c?.volumeRatio??c?.volume_ratio):null,news:num(c?.news,c?.newsScore??c?.news_score),
  event:String(c?.eventRisk||c?.event_risk||'NONE').toUpperCase(),state:String(c?.momentumState||c?.momentum_state||'NORMAL').toUpperCase(),sell:String(c?.momentumSellSignal||c?.momentum_sell_signal||'NONE').toUpperCase()
 };
}
function hardUnsafe(c,m){return m.event==='HIGH'||m.state==='REVERSAL'||m.sell==='STRONG'||targetVenueIssue(c)}
function hardProtectedHold(reason=''){
 return /(?:NEWS-IMPACT BLOCK|NEWS-SHOCK WAIT|CATALYST WATCH|EVENT[- ]?RISK|REVERSAL|STRONG SELL|PEAK[- ]?CHASE|HIGH[- ]?CHASE|OVERHEAT|VENUE|GETTEX|FX[- ]?SAFETY|FALLING KNIFE|VERKÄUFERDOMINANZ)/i.test(String(reason));
}
function softDataHold(reason=''){
 return /(?:MULTI[- ]?TIMEFRAME|\bMTF\b|MISSING[- ]?DATA|SOFT[- ]?DATA|RESEARCH-ENTRY-WAIT|LANGFRISTDATEN|CHARTDATEN FEHLEN)/i.test(String(reason));
}
function obviousPeakChase(m){
 const nearHigh=m.draw!==null&&m.draw>-0.20;
 // Ein winziger 0,1%-Retest ist KEIN neuer Einstieg, wenn der Titel schon gelaufen ist.
 if(nearHigh&&(m.day>=3.0||m.rsi>=74))return true;
 if(m.day>=6.0||m.rsi>=80)return true;
 // Fehlender Drawdown-Wert darf einen bereits deutlich gelaufenen Titel nicht freischalten.
 if(m.draw===null&&(m.day>=4.0||m.rsi>=77))return true;
 return false;
}
function setupProfile(c,{innerApproved=false,softMtf=false}={}){
 const m=metrics(c);if(hardUnsafe(c,m)||obviousPeakChase(m))return{allow:false,m,quality:0,setup:'BLOCKED',softMtf};
 const volumeOk=m.vol===null||m.vol>=.45;
 const earlyBreakout=m.day>=-1.5&&m.day<=2.5&&m.score>=4.0&&m.confidence>=.54&&m.m5>=.04&&m.m20>=.02&&m.accel>=.015&&m.rsi>=42&&m.rsi<72&&volumeOk&&(m.draw===null||m.draw<=-.05||m.day<=1.5);
 const pullbackReclaim=m.draw!==null&&m.draw<=-.35&&m.draw>=-4.5&&m.score>=3.7&&m.confidence>=.51&&m.m5>=.02&&m.m20>=-.12&&m.accel>=.005&&m.rsi<74&&volumeOk;
 const baseReclaim=m.day>=-4.5&&m.day<=3.5&&m.score>=3.8&&m.confidence>=.52&&m.m5>=.02&&m.m20>=0&&m.accel>=.015&&m.rsi<73&&volumeOk;
 const approvedFallback=innerApproved&&m.score>=3.5&&m.confidence>=.50&&m.m5>=-.03&&m.m20>=-.12&&m.accel>=-.01&&m.rsi<74&&m.day<3.5&&volumeOk;
 const allow=earlyBreakout||pullbackReclaim||baseReclaim||approvedFallback;
 if(!allow)return{allow:false,m,quality:0,setup:'NO_SETUP',softMtf};
 const setup=earlyBreakout?'EARLY_BREAKOUT':pullbackReclaim?'PULLBACK_RECLAIM':baseReclaim?'BASE_RECLAIM':'INNER_APPROVED';
 const scoreQ=clamp((m.score-3.4)/2.8,0,1),confQ=clamp((m.confidence-.50)/.30,0,1),tapeQ=clamp((m.m5+.04)/.30,0,1)*.42+clamp((m.m20+.12)/.50,0,1)*.33+clamp((m.accel+.01)/.16,0,1)*.25,newsQ=clamp((m.news+.30)/.90,0,1);
 const setupBonus=earlyBreakout?.12:pullbackReclaim?.16:baseReclaim?.10:.04;
 const mtfPenalty=softMtf?.10:0;
 const quality=clamp(scoreQ*.34+confQ*.22+tapeQ*.28+newsQ*.10+setupBonus-mtfPenalty,0,1);
 return{allow:true,m,quality,setup,softMtf};
}
function targetDeployment(rows){
 if(!rows.length)return 0;
 const top=rows[0].quality,avg=rows.reduce((a,x)=>a+x.quality,0)/rows.length,n=rows.length,allSoft=rows.every(x=>x.softMtf);
 let target;
 if(n>=4&&top>=.66&&avg>=.52)target=100;
 else if(n>=3&&top>=.58&&avg>=.44)target=86;
 else if(n>=2&&top>=.54)target=68;
 else if(n>=2)target=48;
 else if(top>=.70)target=50;
 else if(top>=.55)target=36;
 else target=22;
 if(allSoft)target=Math.min(target,n>=2?35:18);
 return target;
}
function allocate(rows,targetPct){
 const n=rows.length;if(!n||targetPct<=0)return[];
 const out=rows.map(x=>({...x,allocation:0,weight:.55+x.quality}));let remaining=targetPct,active=out.slice();
 for(let pass=0;pass<12&&remaining>.01&&active.length;pass++){
  const ws=active.reduce((a,x)=>a+x.weight,0)||active.length;let used=0;
  for(const x of active){
   const cap=x.softMtf?Math.min(10,targetPct):(n===1?targetPct:n===2?Math.min(44,targetPct):n===3?Math.min(34,targetPct):Math.min(28,targetPct));
   const room=Math.max(0,cap-x.allocation),share=remaining*(x.weight/ws),add=Math.min(room,share);x.allocation+=add;used+=add;
  }
  remaining-=used;active=active.filter(x=>{const cap=x.softMtf?Math.min(10,targetPct):(n===1?targetPct:n===2?Math.min(44,targetPct):n===3?Math.min(34,targetPct):Math.min(28,targetPct));return cap-x.allocation>.01});if(used<.001)break;
 }
 return out.filter(x=>x.allocation>=1);
}
function uniqueBestCandidates(candidates,sellKeys,hardBlockedKeys,innerBuyKeys,softHoldKeys){
 const best=new Map();
 for(const c of candidates){
  const s=key(c);if(!s||sellKeys.has(s)||hardBlockedKeys.has(s))continue;
  const q=setupProfile(c,{innerApproved:innerBuyKeys.has(s),softMtf:softHoldKeys.has(s)});if(!q.allow)continue;
  const row={c,...q},old=best.get(s);
  if(!old||row.quality>old.quality||row.quality===old.quality&&row.m.score>old.m.score)best.set(s,row);
 }
 return[...best.values()].sort((a,b)=>b.quality-a.quality||b.m.score-a.m.score||b.m.confidence-a.m.confidence||b.m.accel-a.m.accel).slice(0,4);
}

function postProcess(r,input,getState){
 const plan=parsePlan(r),prompt=findPrompt(input);if(!plan||!prompt)return r;
 const state=typeof getState==='function'?(getState()||{}):{},cash=Math.max(0,num(state?.config?.cash)),start=Math.max(cash,num(state?.config?.start_capital,cash));
 const minMeaningfulCash=Math.max(5,start*.001);
 let actions=arr(plan.actions).slice();
 if(cash<minMeaningfulCash){
  actions=actions.filter(a=>String(a?.action||'').toUpperCase()!=='BUY');
  plan.actions=actions;plan.summary=`${String(plan.summary||'').slice(0,135)} · SMART-ENTRY V24: Restcash ${cash.toFixed(2)} € unter sinnvoller Ordergröße ${minMeaningfulCash.toFixed(2)} €; keine Miniorders.`;
  return{...r,response:JSON.stringify(plan)};
 }
 const candidates=arr(parseBlock(prompt,'Kandidaten=',' Gehalten=')||[]);if(!candidates.length)return r;
 const sellKeys=new Set(actions.filter(a=>String(a?.action||'').toUpperCase()==='SELL').map(key));
 const innerBuyKeys=new Set(actions.filter(a=>String(a?.action||'').toUpperCase()==='BUY').map(key));
 const hardBlockedKeys=new Set(actions.filter(a=>String(a?.action||'').toUpperCase()==='HOLD'&&hardProtectedHold(a?.reason)).map(key));
 const softHoldKeys=new Set(actions.filter(a=>String(a?.action||'').toUpperCase()==='HOLD'&&softDataHold(a?.reason)&&!hardProtectedHold(a?.reason)).map(key));
 const ranked=uniqueBestCandidates(candidates,sellKeys,hardBlockedKeys,innerBuyKeys,softHoldKeys);
 if(!ranked.length){
  // Wichtig: bereits von inneren Guards sauber freigegebene BUYs nicht versehentlich vernichten.
  const safeExisting=actions.filter(a=>String(a?.action||'').toUpperCase()!=='BUY'||(!hardBlockedKeys.has(key(a))&&!sellKeys.has(key(a))));
  plan.actions=safeExisting;plan.summary=`${String(plan.summary||'').slice(0,135)} · SMART-ENTRY V24: kein neuer Starter aus dem Fallback; bestehende sichere BUYs bleiben erhalten, harte News/Event/High-Sperren bleiben bindend.`;
  return{...r,response:JSON.stringify(plan)};
 }
 const target=targetDeployment(ranked),allocation=allocate(ranked,target),selected=new Set(allocation.map(x=>key(x.c)));
 actions=actions.filter(a=>{
  const type=String(a?.action||'').toUpperCase();
  if(type==='BUY')return false;
  if(type==='SELL')return true;
  return !selected.has(key(a));
 });
 const emitted=new Set();
 for(const x of allocation){
  const s=key(x.c);if(!s||emitted.has(s))continue;emitted.add(s);
  const pct=+x.allocation.toFixed(2);if(pct<1)continue;
  actions.push({symbol:s,action:'BUY',confidence:clamp(Math.max(.58,x.m.confidence),.58,.88),allocation_pct:pct,reason:`SMART-ENTRY V24 ${x.setup}: ${pct.toFixed(1)}% des freien Cashs · Zielauslastung ${target.toFixed(0)}% · Qualität ${x.quality.toFixed(2)} · Score ${x.m.score.toFixed(2)} · 5m ${x.m.m5.toFixed(2)} · 20m ${x.m.m20.toFixed(2)} · Beschleunigung ${x.m.accel.toFixed(2)}${x.softMtf?' · fehlende MTF-Daten: nur kleiner Starter':''}. Harte News-/Event-/High-/Venue-Sperren bleiben bindend.`});
 }
 plan.actions=actions;plan.summary=`${String(plan.summary||'').slice(0,110)} · SMART-ENTRY V24: ${emitted.size} BUY(s), ${target.toFixed(0)}% Cashziel; Early-Breakout/Pullback-Reclaim statt High-Chase, MTF-Lücken nur als kleiner Starter.`;
 return{...r,response:JSON.stringify(plan)};
}

export class ActiveLearningCashAiGuard{
 constructor(base,{getState=null}={}){this.base=base;this.getState=getState}
 async run(model,input){const r=await this.base.run(model,input);return postProcess(r,input,this.getState)}
}
