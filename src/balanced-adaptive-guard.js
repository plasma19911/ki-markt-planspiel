import {targetVenueIssue} from './target-venue-ai-guard.js';
import {classifyHardExit} from './hard-exit-classifier.js';

const REPORT_KEY='state/day-replay-report-v1';
const LEARN_KEY='state/day-replay-learning-v1';
const BALANCE_HISTORY_KEY='state/replay-balance-history-v1';
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

function updateBalanceHistory(storage,report){
 let h=read(storage,BALANCE_HISTORY_KEY,{version:1,days:[]})||{version:1,days:[]};h.days=arr(h.days);
 if(report?.status==='COMPLETE'&&report?.date&&!h.days.some(x=>x.date===report.date)){
  const s=report.summary||{},m=s.mistakes||{};h.days.push({date:report.date,symbols:Math.max(1,num(s.symbolsAnalysed,report.processed||0)),missed:num(m.MISSED_SAFE_MOVE),late:num(m.LATE_EXPENSIVE_ENTRY),peak:num(m.PEAK_ENTRY),rapid:num(s?.churn?.rapidRoundTrips),fees:num(s?.churn?.fees)});h.days=h.days.slice(-20);h.updatedAt=new Date().toISOString();write(storage,BALANCE_HISTORY_KEY,h);
 }
 return h;
}

export function replayBalancePressure(storage=null){
 const report=read(storage,REPORT_KEY,null),learn=read(storage,LEARN_KEY,null),history=updateBalanceHistory(storage,report),recent=arr(history.days).slice(-5);
 const currentSummary=report?.status==='COMPLETE'?report?.summary||{}:{},currentMistakes=currentSummary?.mistakes||{};
 let den=0,missedN=0,lateN=0,peakN=0;recent.forEach((d,i)=>{const w=.65+i*.10,sy=Math.max(1,num(d.symbols));den+=sy*w;missedN+=num(d.missed)*w;lateN+=num(d.late)*w;peakN+=num(d.peak)*w});
 const currentTotal=Math.max(1,num(currentSummary?.symbolsAnalysed,report?.processed||0)),total=den||currentTotal,missedRate=den?missedN/den:num(currentMistakes?.MISSED_SAFE_MOVE)/currentTotal,lateRate=den?lateN/den:num(currentMistakes?.LATE_EXPENSIVE_ENTRY)/currentTotal,peakRate=den?peakN/den:num(currentMistakes?.PEAK_ENTRY)/currentTotal;
 const days=Math.max(arr(history.days).length,num(learn?.completedDays)),evidence=clamp(.38+Math.min(8,days)*.055+Math.min(260,total)/650,.38,.90);
 const opportunityBoost=clamp((missedRate*.72+lateRate*.50)*evidence,0,.22),peakPenalty=clamp(peakRate*.82*evidence,0,.16);
 return{total:+total.toFixed(1),completedDays:days,windowDays:recent.length,missed:num(currentMistakes?.MISSED_SAFE_MOVE),late:num(currentMistakes?.LATE_EXPENSIVE_ENTRY),peak:num(currentMistakes?.PEAK_ENTRY),missedRate:+missedRate.toFixed(3),lateRate:+lateRate.toFixed(3),peakRate:+peakRate.toFixed(3),evidence:+evidence.toFixed(3),opportunityBoost:+opportunityBoost.toFixed(3),peakPenalty:+peakPenalty.toFixed(3),active:recent.length>0||Boolean(report?.status==='COMPLETE')};
}

function metrics(c={}){
 const score=num(c?.liveScore,c?.score),confidence=num(c?.liveConfidence,c?.confidence),day=num(c?.day,c?.day_change),m5=num(c?.intraday5m,c?.momentum5),m20=num(c?.intraday20m,c?.momentum20),accel=num(c?.momentumAcceleration5,c?.momentum_acceleration5),rsi=num(c?.intradayRsi,c?.rsi||50),drawRaw=c?.drawdownFrom20mHighPct??c?.drawdown_from_20m_high_pct,drawKnown=Number.isFinite(Number(drawRaw)),draw=drawKnown?Number(drawRaw):-99,rawVol=c?.volumeRatio??c?.volume_ratio,volumeKnown=Number.isFinite(Number(rawVol)),vol=volumeKnown?Number(rawVol):1,news=num(c?.newsScore,c?.news_score),event=String(c?.eventRisk||c?.event_risk||'NONE').toUpperCase(),state=String(c?.momentumState||c?.momentum_state||'NORMAL').toUpperCase(),sell=String(c?.momentumSellSignal||c?.momentum_sell_signal||'NONE').toUpperCase();
 const hardSafe=event!=='HIGH'&&state!=='REVERSAL'&&sell!=='STRONG'&&!targetVenueIssue(c);
 return{score,confidence,day,m5,m20,accel,rsi,drawKnown,draw,volumeKnown,vol,news,event,state,sell,hardSafe};
}

export function assessBalancedSoftEntry(candidate={},storage=null){
 const x=metrics(candidate),p=replayBalancePressure(storage),nearHigh=x.drawKnown&&x.draw>-0.18;
 const strongOverall=(x.score>=5&&x.confidence>=.66)||(x.score>=4.5&&x.confidence>=.72)||(x.score>=4.2&&x.confidence>=.69&&x.news>=.25);
 const baseTape=x.m5>=.04&&x.m20>=.05&&x.accel>=0,earlyTrend=(x.m5>=.02&&x.m20>=0&&x.accel>=.01)||(x.m5>=.06&&x.accel>=0),volumeOk=!x.volumeKnown||x.vol>=.75,notLate=x.day<=5.0&&x.rsi<78,nearHighOk=!nearHigh||(x.day<=3.8&&x.m5>=.06&&x.m20>=.08&&x.accel>=0&&x.rsi<75);
 const netOpportunity=clamp(p.opportunityBoost-(nearHigh?p.peakPenalty*.60:0),0,.22),directStrength=x.score>=5.2||x.confidence>=.76||(x.score>=4.7&&x.news>=.35),allow=x.hardSafe&&strongOverall&&(baseTape||earlyTrend)&&volumeOk&&notLate&&nearHighOk&&(directStrength||netOpportunity>=.01);
 const cap=clamp(14+netOpportunity*35+(x.score>=5.7&&x.confidence>=.74?5:0)+(earlyTrend&&!baseTape?-3:0)-(nearHigh?p.peakPenalty*18:0),10,28);
 const reasons=[];if(!x.hardSafe)reasons.push('harte Safety');if(!strongOverall)reasons.push('Gesamtqualität');if(!(baseTape||earlyTrend))reasons.push('Kursbestätigung');if(!volumeOk)reasons.push('Volumen');if(!notLate)reasons.push('zu spät/überhitzt');if(!nearHighOk)reasons.push('zu nah am Hoch');if(!(directStrength||netOpportunity>=.01))reasons.push('weder direkte Stärke noch Replay-Spielraum');
 return{allow,allocationCap:+cap.toFixed(1),pressure:p,netOpportunity:+netOpportunity.toFixed(3),metrics:x,reasons,earlyTrend,baseTape};
}

function isHoldAction(a={}){return String(a?.action||'').toUpperCase()==='HOLD'}
function marginalMomentumExit(a={}){return String(a?.action||'').toUpperCase()==='SELL'&&/Momentum-Risk-Exit/i.test(String(a?.reason||''))}
function hardExit(h={},a={}){return classifyHardExit(h,a).hard}

export function marginalExitDecision({held={},action={},storage=null,now=Date.now()}={}){
 if(!marginalMomentumExit(action))return{allow:true,reason:'not-marginal-momentum-exit'};if(hardExit(held,action))return{allow:true,hard:true,reason:'echter harter Event-/Kursbruch'};
 const m5=num(held?.momentum5,held?.intraday5m),m20=num(held?.momentum20,held?.intraday20m),pnl=heldPnlPct(held),severe=(m5<=-.42&&m20<=-.50)||pnl<=-1.25,earlyWeak=(m5<=-.18&&m20<=-.12)||(m5<=-.24&&pnl<=-.45);
 if(severe)return{allow:true,severe:true,reason:'deutlich bestätigter Abwärtsdruck'};
 if(earlyWeak)return{allow:true,early:true,reason:'kombinierte frühe Schwäche – nicht auf zweites Signal warten'};
 const state=read(storage,EXIT_KEY,{rows:{}}),rows=state.rows||{},s=key(held?.symbol?held:action),old=rows[s],fresh=old&&now-num(old.at)<8*60*1000,count=fresh?num(old.count)+1:1;rows[s]={at:now,count};for(const [k,v] of Object.entries(rows))if(now-num(v?.at)>15*60*1000)delete rows[k];write(storage,EXIT_KEY,{updatedAt:new Date(now).toISOString(),rows});
 return{allow:count>=2,count,hard:false,severe:false,reason:count>=2?'zweites aufeinanderfolgendes leichtes Momentum-Risikosignal':'nur ein kleines Einzelsignal – einmal bestätigen'};
}

function themeFamily(v){const t=String(v||'').toUpperCase();if(!t)return'';if(t.includes('DEFENSE')||t.includes('RUSSIA')||t.includes('MILIT'))return'DEFENSE';if(t.includes('SEMI')||t.includes('CHIP'))return'SEMICONDUCTOR';if(t.includes('AI_POWER')||t.includes('GRID')||t.includes('DATA_CENTER'))return'AI_POWER_GRID';if(t.includes('CYBER'))return'CYBER_SECURITY';if(t.includes('NUCLEAR')||t.includes('URANIUM'))return'NUCLEAR';if(t.includes('ENERGY')||t.includes('OIL')||t.includes('GAS'))return'ENERGY';if(t.includes('GOLD')||t.includes('MINER'))return'MATERIALS';if(t.includes('RATE')||t.includes('MACRO'))return'MACRO_SENSITIVE';return t}
function concentrationFactor(candidate,held=[]){const theme=themeFamily(candidate?.theme||candidate?.sector);if(!theme)return{factor:1,share:0,theme:null};const values=arr(held).map(h=>({theme:themeFamily(h?.theme||h?.sector),value:Math.max(0,num(h?.invested,h?.value))})),total=values.reduce((a,x)=>a+x.value,0);if(!(total>0))return{factor:1,share:0,theme};const same=values.filter(x=>x.theme===theme).reduce((a,x)=>a+x.value,0),share=same/total;if(share<.55)return{factor:1,share,theme};const x=metrics(candidate),exceptional=x.score>=6.2&&x.confidence>=.76,factor=exceptional?.90:.75;return{factor,share,theme,exceptional}}

function postProcess(r,input,storage){
 const plan=parsePlan(r),prompt=findPrompt(input);if(!plan||!prompt)return r;const candidates=arr(parseBlock(prompt,'Kandidaten=',' Gehalten=')||[]),held=arr(parseBlock(prompt,' Gehalten=')||[]),cMap=new Map(candidates.map(c=>[key(c),c])),hMap=new Map(held.map(h=>[key(h),h]));let actions=[],exitHeldBack=0;
 for(const a of arr(plan.actions)){if(marginalMomentumExit(a)){const d=marginalExitDecision({held:hMap.get(key(a))||{},action:a,storage});if(!d.allow){actions.push({symbol:key(a),action:'HOLD',confidence:.62,allocation_pct:0,reason:`BALANCED-EXIT-WATCH: ${d.reason}. Kein Verkauf nur wegen eines kleinen einzelnen Rücksetzers.`});exitHeldBack++;continue}}actions.push(a)}
 const existingBuy=actions.some(a=>String(a?.action||'').toUpperCase()==='BUY');
 if(!existingBuy){
  const holdKeys=new Set(actions.filter(isHoldAction).map(key));
  const soft=candidates.map(c=>({c,q:assessBalancedSoftEntry(c,storage),wasHold:holdKeys.has(key(c))})).filter(x=>x.q.allow).sort((a,b)=>Number(b.wasHold)-Number(a.wasHold)||b.q.metrics.score-a.q.metrics.score||b.q.metrics.confidence-a.q.metrics.confidence)[0];
  if(soft){actions=actions.filter(a=>!(isHoldAction(a)&&key(a)===key(soft.c)));actions.push({symbol:key(soft.c),action:'BUY',confidence:clamp(soft.q.metrics.confidence,.64,.84),allocation_pct:soft.q.allocationCap,reason:`BALANCED-EARLY-ENTRY: starker Kandidat, harte Safety bestanden. Nicht auf perfekte Vollbestätigung warten · ${soft.q.earlyTrend&&!soft.q.baseTape?'frühe Trendaufnahme':'bestätigter Aufbau'} · Starter ${soft.q.allocationCap.toFixed(1)}% · Score ${soft.q.metrics.score.toFixed(2)} · Konfidenz ${Math.round(soft.q.metrics.confidence*100)}%`})}
 }
 actions=actions.map(a=>{if(String(a?.action||'').toUpperCase()!=='BUY')return a;const c=cMap.get(key(a));if(!c)return a;const cc=concentrationFactor(c,held);if(cc.factor>=.999)return a;const old=Math.max(0,num(a?.allocation_pct)),next=Math.max(8,old*cc.factor);return{...a,allocation_pct:+next.toFixed(2),reason:`${String(a.reason||'').slice(0,330)} · SOFT-DIVERSIFIKATION: ${cc.theme} bereits ${Math.round(cc.share*100)}% des investierten Depots; Position nur ${Math.round((1-cc.factor)*100)}% kleiner statt hart blockiert.`}});
 plan.actions=actions;const pressure=replayBalancePressure(storage),notes=[];if(exitHeldBack)notes.push(`${exitHeldBack} wirklich leichtes Einzelsignal wartet einmal`);if(pressure.active)notes.push(`Replay-Balance ${pressure.windowDays} Tag(e) · Missed ${pressure.missedRate.toFixed(2)} · Late ${pressure.lateRate.toFixed(2)} · Peak ${pressure.peakRate.toFixed(2)}`);if(notes.length)plan.summary=`${String(plan.summary||'').slice(0,170)} · BALANCED-ADAPTIVE: ${notes.join(' · ')}. Frühe valide Chancen dürfen starten; harte Risiken bleiben hart.`;return{...r,response:JSON.stringify(plan)};
}

export class BalancedAdaptiveAiGuard{constructor(base,storage){this.base=base;this.storage=storage}async run(model,input){const r=await this.base.run(model,input);return postProcess(r,input,this.storage)}}
