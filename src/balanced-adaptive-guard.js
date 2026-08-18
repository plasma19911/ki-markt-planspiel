import {targetVenueIssue} from './target-venue-ai-guard.js';

const REPORT_KEY='state/day-replay-report-v1';
const LEARN_KEY='state/day-replay-learning-v1';
const EXIT_KEY='state/balanced-exit-confirm-v1';
const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const key=x=>String(x?.symbol||x||'').toUpperCase();
const responseText=r=>String(r?.response||r?.result?.response||'');
const read=(storage,k,d)=>{try{return storage?.kv?.get(k)||d}catch{return d}};
const write=(storage,k,v)=>{try{storage?.kv?.put(k,v)}catch{}};

function parseBlock(text,start,end=null){const a=text.indexOf(start);if(a<0)return null;const from=a+start.length,b=end?text.indexOf(end,from):-1;try{return JSON.parse(text.slice(from,b>=0?b:text.length).trim())}catch{return null}}
function parsePlan(r){const raw=responseText(r),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j.actions)?j:null}catch{return null}}
function findPrompt(input){for(const m of arr(input?.messages)){const t=String(m?.content||'');if(t.includes('Kandidaten=')&&t.includes(' Gehalten='))return t}return''}
function heldPnlPct(h={}){for(const v of [h?.pnlPct,h?.pnl_pct,h?.pnl])if(Number.isFinite(Number(v)))return Number(v);return 0}

export function replayBalancePressure(storage=null){
 const report=read(storage,REPORT_KEY,null),learn=read(storage,LEARN_KEY,null),summary=report?.status==='COMPLETE'?report?.summary||{}:{};
 const total=Math.max(1,num(summary?.symbolsAnalysed,report?.processed||0)),mistakes=summary?.mistakes||{},days=Math.max(0,num(learn?.completedDays));
 const missed=num(mistakes?.MISSED_SAFE_MOVE),late=num(mistakes?.LATE_EXPENSIVE_ENTRY),peak=num(mistakes?.PEAK_ENTRY);
 const evidence=clamp(.35+Math.min(5,days)*.09+Math.min(72,total)/180,.35,.92);
 const opportunityBoost=clamp((missed/total*.75+late/total*.55)*evidence,0,.24);
 const peakPenalty=clamp((peak/total*.90)*evidence,0,.18);
 return{total,completedDays:days,missed,late,peak,evidence:+evidence.toFixed(3),opportunityBoost:+opportunityBoost.toFixed(3),peakPenalty:+peakPenalty.toFixed(3),active:Boolean(report?.status==='COMPLETE')};
}

function metrics(c={}){
 const score=num(c?.liveScore,c?.score),confidence=num(c?.liveConfidence,c?.confidence),day=num(c?.day,c?.day_change),m5=num(c?.intraday5m,c?.momentum5),m20=num(c?.intraday20m,c?.momentum20),accel=num(c?.momentumAcceleration5,c?.momentum_acceleration5),rsi=num(c?.intradayRsi,c?.rsi||50),drawRaw=c?.drawdownFrom20mHighPct??c?.drawdown_from_20m_high_pct,drawKnown=Number.isFinite(Number(drawRaw)),draw=drawKnown?Number(drawRaw):-99,rawVol=c?.volumeRatio??c?.volume_ratio,volumeKnown=Number.isFinite(Number(rawVol)),vol=volumeKnown?Number(rawVol):1,news=num(c?.newsScore,c?.news_score),event=String(c?.eventRisk||c?.event_risk||'NONE').toUpperCase(),state=String(c?.momentumState||c?.momentum_state||'NORMAL').toUpperCase(),sell=String(c?.momentumSellSignal||c?.momentum_sell_signal||'NONE').toUpperCase();
 const hardSafe=event!=='HIGH'&&state!=='REVERSAL'&&sell!=='STRONG'&&!targetVenueIssue(c);
 return{score,confidence,day,m5,m20,accel,rsi,drawKnown,draw,volumeKnown,vol,news,event,state,sell,hardSafe};
}

export function assessBalancedSoftEntry(candidate={},storage=null){
 const x=metrics(candidate),p=replayBalancePressure(storage),nearHigh=x.drawKnown&&x.draw>-0.18;
 const strongOverall=(x.score>=5&&x.confidence>=.68)||(x.score>=4.5&&x.confidence>=.74)||(x.score>=4.25&&x.confidence>=.70&&x.news>=.30);
 const baseTape=x.m5>=.04&&x.m20>=.06&&x.accel>=0;
 const volumeOk=!x.volumeKnown||x.vol>=.90;
 const notLate=x.day<=4.0&&x.rsi<75;
 const nearHighOk=!nearHigh||(x.day<=3.5&&x.m5>=.07&&x.m20>=.10&&x.accel>=.01&&x.rsi<73);
 const netOpportunity=clamp(p.opportunityBoost-(nearHigh?p.peakPenalty*.60:0),0,.24);
 const allow=x.hardSafe&&strongOverall&&baseTape&&volumeOk&&notLate&&nearHighOk&&netOpportunity>=.035;
 const cap=clamp(18+netOpportunity*34+(x.score>=5.7&&x.confidence>=.74?4:0)-(nearHigh?p.peakPenalty*18:0),16,28);
 const reasons=[];if(!x.hardSafe)reasons.push('harte Safety');if(!strongOverall)reasons.push('Gesamtqualität');if(!baseTape)reasons.push('Kursbestätigung');if(!volumeOk)reasons.push('Volumen');if(!notLate)reasons.push('zu spät/überhitzt');if(!nearHighOk)reasons.push('zu nah am Hoch');if(netOpportunity<.035)reasons.push('Replay-Balance spricht noch nicht für Soft-Override');
 return{allow,allocationCap:+cap.toFixed(1),pressure:p,netOpportunity:+netOpportunity.toFixed(3),metrics:x,reasons};
}

function isResearchWait(a={}){return String(a?.action||'').toUpperCase()==='HOLD'&&/RESEARCH-ENTRY-WAIT/i.test(String(a?.reason||''))}
function marginalMomentumExit(a={}){return String(a?.action||'').toUpperCase()==='SELL'&&/Momentum-Risk-Exit/i.test(String(a?.reason||''))}
function hardExit(h={},a={}){const state=String(h?.momentumState||h?.momentum_state||'').toUpperCase(),sell=String(h?.momentumSellSignal||h?.momentum_sell_signal||'').toUpperCase(),reason=String(a?.reason||'');return state==='REVERSAL'||sell==='STRONG'||/REVERSAL\s+stark|hard(?:er)?\s+Exit/i.test(reason)}

export function marginalExitDecision({held={},action={},storage=null,now=Date.now()}={}){
 if(!marginalMomentumExit(action))return{allow:true,reason:'not-marginal-momentum-exit'};
 if(hardExit(held,action))return{allow:true,hard:true,reason:'harter Reversal-Exit'};
 const m5=num(held?.momentum5,held?.intraday5m),m20=num(held?.momentum20,held?.intraday20m),pnl=heldPnlPct(held),severe=(m5<=-.42&&m20<=-.50)||pnl<=-1.25;
 if(severe)return{allow:true,severe:true,reason:'deutlich bestätigter Abwärtsdruck'};
 const state=read(storage,EXIT_KEY,{rows:{}}),rows=state.rows||{},s=key(held?.symbol?held:action),old=rows[s],fresh=old&&now-num(old.at)<8*60*1000,count=fresh?num(old.count)+1:1;
 rows[s]={at:now,count};for(const [k,v] of Object.entries(rows))if(now-num(v?.at)>15*60*1000)delete rows[k];write(storage,EXIT_KEY,{updatedAt:new Date(now).toISOString(),rows});
 return{allow:count>=2,count,hard:false,severe:false,reason:count>=2?'zweites aufeinanderfolgendes Momentum-Risikosignal':'erstes leichtes Momentum-Risikosignal – einmal bestätigen'};
}

function themeFamily(v){
 const t=String(v||'').toUpperCase();if(!t)return'';
 if(t.includes('DEFENSE')||t.includes('RUSSIA')||t.includes('MILIT'))return'DEFENSE';
 if(t.includes('SEMI')||t.includes('CHIP'))return'SEMICONDUCTOR';
 if(t.includes('AI_POWER')||t.includes('GRID')||t.includes('DATA_CENTER'))return'AI_POWER_GRID';
 if(t.includes('CYBER'))return'CYBER_SECURITY';
 if(t.includes('NUCLEAR')||t.includes('URANIUM'))return'NUCLEAR';
 if(t.includes('ENERGY')||t.includes('OIL')||t.includes('GAS'))return'ENERGY';
 if(t.includes('GOLD')||t.includes('MINER'))return'MATERIALS';
 if(t.includes('RATE')||t.includes('MACRO'))return'MACRO_SENSITIVE';
 return t;
}

function concentrationFactor(candidate,held=[]){
 const theme=themeFamily(candidate?.theme||candidate?.sector);if(!theme)return{factor:1,share:0,theme:null};
 const values=arr(held).map(h=>({theme:themeFamily(h?.theme||h?.sector),value:Math.max(0,num(h?.invested,h?.value))})),total=values.reduce((a,x)=>a+x.value,0);if(!(total>0))return{factor:1,share:0,theme};
 const same=values.filter(x=>x.theme===theme).reduce((a,x)=>a+x.value,0),share=same/total;if(share<.55)return{factor:1,share,theme};
 const x=metrics(candidate),exceptional=x.score>=6.2&&x.confidence>=.76,factor=exceptional?0.90:0.75;return{factor,share,theme,exceptional};
}

function postProcess(r,input,storage){
 const plan=parsePlan(r),prompt=findPrompt(input);if(!plan||!prompt)return r;
 const candidates=arr(parseBlock(prompt,'Kandidaten=',' Gehalten=')||[]),held=arr(parseBlock(prompt,' Gehalten=')||[]),cMap=new Map(candidates.map(c=>[key(c),c])),hMap=new Map(held.map(h=>[key(h),h]));
 let actions=[],exitHeldBack=0;
 for(const a of arr(plan.actions)){
  if(marginalMomentumExit(a)){
   const d=marginalExitDecision({held:hMap.get(key(a))||{},action:a,storage});
   if(!d.allow){actions.push({symbol:key(a),action:'HOLD',confidence:.62,allocation_pct:0,reason:`BALANCED-EXIT-WATCH: ${d.reason}. Kein Verkauf nur wegen eines kleinen einzelnen Rücksetzers.`});exitHeldBack++;continue}
  }
  actions.push(a);
 }

 const existingBuy=actions.some(a=>String(a?.action||'').toUpperCase()==='BUY');
 if(!existingBuy){
  const researchWaits=actions.filter(isResearchWait).map(a=>({a,c:cMap.get(key(a))})).filter(x=>x.c);
  const soft=researchWaits.map(x=>({c:x.c,q:assessBalancedSoftEntry(x.c,storage)})).filter(x=>x.q.allow).sort((a,b)=>b.q.metrics.score-a.q.metrics.score||b.q.metrics.confidence-a.q.metrics.confidence)[0];
  if(soft){
   actions=actions.filter(a=>!isResearchWait(a)||key(a)!==key(soft.c));
   actions.push({symbol:key(soft.c),action:'BUY',confidence:clamp(soft.q.metrics.confidence,.64,.82),allocation_pct:soft.q.allocationCap,reason:`BALANCED-SOFT-ENTRY: starker Kandidat, harte Safety bestanden; Replay zeigt verpasste/zu späte Chancen. Eine weiche Research-Grenze darf knapp verfehlt werden · kleine Startposition ${soft.q.allocationCap.toFixed(1)}% · Score ${soft.q.metrics.score.toFixed(2)} · Konfidenz ${Math.round(soft.q.metrics.confidence*100)}%`});
  }
 }

 actions=actions.map(a=>{
  if(String(a?.action||'').toUpperCase()!=='BUY')return a;const c=cMap.get(key(a));if(!c)return a;const cc=concentrationFactor(c,held);if(cc.factor>=.999)return a;
  const old=Math.max(0,num(a?.allocation_pct)),next=Math.max(8,old*cc.factor);return{...a,allocation_pct:+next.toFixed(2),reason:`${String(a.reason||'').slice(0,330)} · SOFT-DIVERSIFIKATION: ${cc.theme} bereits ${Math.round(cc.share*100)}% des investierten Depots; Position nur ${Math.round((1-cc.factor)*100)}% kleiner statt hart blockiert.`};
 });

 plan.actions=actions;
 const pressure=replayBalancePressure(storage),notes=[];if(exitHeldBack)notes.push(`${exitHeldBack} leichter Exit erst bestaetigen`);if(pressure.active)notes.push(`Replay-Balance Missed ${pressure.missed}, Late ${pressure.late}, Peak ${pressure.peak}`);
 if(notes.length)plan.summary=`${String(plan.summary||'').slice(0,170)} · BALANCED-ADAPTIVE: ${notes.join(' · ')}. Harte Risiken bleiben hart, weiche Grenzen bleiben uebersteuerbar.`;
 return{...r,response:JSON.stringify(plan)};
}

export class BalancedAdaptiveAiGuard{
 constructor(base,storage){this.base=base;this.storage=storage}
 async run(model,input){const r=await this.base.run(model,input);return postProcess(r,input,this.storage)}
}
