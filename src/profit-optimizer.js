import {getEntryTimingAdjustment} from './live-signal-learning.js';

// Paper-Trading-Optimierer: erwarteten Gewinn nach Kosten maximieren.
// Kein Zwang, jederzeit investiert zu sein. Safety-/Quote-/Kostenregeln bleiben aktiv.

const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const key=x=>String(x?.symbol||x||'').toUpperCase();
const arr=v=>Array.isArray(v)?v:[];
const responseText=r=>String(r?.response||r?.result?.response||'');

function parseBlock(text,start,end=null){const a=text.indexOf(start);if(a<0)return null;const from=a+start.length,b=end?text.indexOf(end,from):-1;try{return JSON.parse(text.slice(from,b>=0?b:text.length).trim())}catch{return null}}
function parsePlan(r){const raw=responseText(r),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j.actions)?j:null}catch{return null}}
function findPlanMessage(input){for(let i=0;i<arr(input?.messages).length;i++){const t=String(input.messages[i]?.content||'');if(t.includes('Kandidaten=')&&t.includes(' Gehalten='))return{i,text:t}}return null}
function badEvidence(c){const t=[...arr(c?.pro),...arr(c?.contra),c?.reason].join(' ');return /(?:Infinity|NaN|undefined)/i.test(t)}

function entryTiming(c){
 const state=String(c?.momentumState||'NORMAL').toUpperCase(),draw=num(c?.drawdownFrom20mHighPct,-99),day=num(c?.day,c?.day_change),m5=num(c?.intraday5m,c?.momentum5),m20=num(c?.intraday20m,c?.momentum20),vol=num(c?.volumeRatio,1),rsi=num(c?.intradayRsi,c?.rsi||50),breakout=num(c?.momentumBreakoutScore);
 const nearHigh=draw>-0.18,volumeKnown=Number.isFinite(Number(c?.volumeRatio)),volumeOk=vol>=1.35||!volumeKnown;
 const breakoutConfirmed=state==='BREAKOUT'&&breakout>=2&&volumeOk&&m5>0.05&&m20>0.15&&rsi<78;
 const extended=day>3.5||m20>1.25||rsi>74;
 const pullbackRetest=draw<=-0.22&&draw>=-1.25&&m20>0&&m5>=-0.18&&rsi<72;
 return{nearHigh,breakoutConfirmed,extended,pullbackRetest,draw,day,m5,m20,vol,rsi,state};
}
function chaseBlocked(c){const t=entryTiming(c);return t.nearHigh&&!t.breakoutConfirmed}
function forwardMap(state){return new Map(arr(state?.futureWatch?.candidates).map(x=>[key(x),x]))}

function enrichInput(input,state){
 const hit=findPlanMessage(input);if(!hit)return input;
 const candidates=parseBlock(hit.text,'Kandidaten=',' Gehalten=');if(!Array.isArray(candidates))return input;
 const fw=forwardMap(state),enriched=candidates.map(c=>{const f=fw.get(key(c));return f?{...c,forwardWatchScore:num(f.watchScore),forwardIssueStrength:num(f.issueStrength),forwardUrgency:num(f.urgency),forwardQuietScore:num(f.quietScore),forwardHorizon:f.horizon||null,forwardTheme:f.theme||null,forwardCatalyst:f.catalyst||null,forwardDirectionUnknown:Boolean(f.directionUnknown),forwardAlreadyMoving:Boolean(f.alreadyMoving)}:c});
 const a=hit.text.indexOf('Kandidaten='),b=hit.text.indexOf(' Gehalten=',a),prefix=hit.text.slice(0,a),suffix=hit.text.slice(b);
 const policy='PROFIT-OPTIMIZER: Ziel ist maximaler erwarteter PAPER-Gewinn nach realistischen Kosten, nicht maximale Handelsfrequenz. Cash darf bleiben, wenn kein bestaetigter positiver Erwartungswert vorliegt. ANTI-CHASE: nicht unbestaetigt am lokalen Hoch hinterherkaufen. ENTRY-LEARNING: 15/30/60-Minuten-Ergebnisse kalibrieren Timing und Groesse. OPPORTUNITY-COST: Schwache oder zerfallende Positionen duerfen nach ausreichender Haltedauer verkauft bzw. in klar bessere Setups rotiert werden; Gewinner nicht wegen kleiner Score-Unterschiede hektisch umschichten. ';
 const messages=input.messages.slice();messages[hit.i]={...messages[hit.i],content:`${prefix}${policy}Kandidaten=${JSON.stringify(enriched)}${suffix}`};return{...input,messages}
}

function scoreCandidate(c,fw,storage){
 const live=num(c?.liveScore,c?.score),conf=num(c?.liveConfidence,c?.confidence),news=num(c?.news,c?.news_score),breakout=Math.max(0,num(c?.momentumBreakoutScore)),exhaust=Math.max(0,num(c?.momentumExhaustionScore)),day=num(c?.day,c?.day_change),m5=num(c?.intraday5m,c?.momentum5),m20=num(c?.intraday20m,c?.momentum20),vol=num(c?.volumeRatio,1),learn=num(c?.learnedExpected3dPct),similar=num(c?.perfectPreBuySimilarity),timing=entryTiming(c),timingLearn=getEntryTimingAdjustment(storage,c);
 let s=live*1.15+conf*1.6+news*.18+breakout*.16-exhaust*.22+Math.max(0,m5)*.14+Math.max(0,m20)*.09+Math.max(0,vol-1)*.18+num(timingLearn.scoreDelta);
 if(c?.learningUsable)s+=clamp(learn,-3,4)*.18+clamp(similar,0,1)*.35;
 if(fw){s+=num(fw.watchScore)*.018+num(fw.issueStrength)*.009+num(fw.urgency)*.008;if(fw.preNews)s+=.25;if(fw.alreadyMoving)s-=.35;if(fw.directionUnknown)s-=.45}
 if(String(c?.eventRisk||'').toUpperCase()==='HIGH')s-=3;
 if(String(c?.momentumSellSignal||'').toUpperCase()==='STRONG')s-=4;
 if(String(c?.momentumSellSignal||'').toUpperCase()==='WATCH')s-=1.15;
 if(String(c?.momentumState||'').toUpperCase()==='REVERSAL')s-=2.5;
 if(String(c?.momentumState||'').toUpperCase()==='EXHAUSTION')s-=1.1;
 if(timing.nearHigh&&!timing.breakoutConfirmed)s-=4.5;
 if(timing.nearHigh&&timing.breakoutConfirmed)s+=.35;
 if(timing.pullbackRetest)s+=.7;
 if(timing.extended)s-=1.15;
 if(timing.extended&&timing.nearHigh)s-=1.1;
 if(day>5)s-=.45;if(day>8)s-=1.1;
 if(badEvidence(c))s-=20;if(timingLearn.block)s-=50;
 return s;
}

function deployPct(best,second,regime){
 if(best>=10.5)return regime==='VOLATILE'?78:90;
 if(best>=8.8)return regime==='VOLATILE'?68:82;
 if(best>=7.4)return regime==='VOLATILE'?52:68;
 if(best>=6.4&&second>=5.8)return regime==='TREND_UP'?52:42;
 return 0;
}
function singleCap(best,regime){if(best>=11.5&&regime!=='VOLATILE')return72;if(best>=9.5)return62;if(best>=8)return54;return45}
function positionMap(state){return new Map(arr(state?.positions).map(p=>[key(p),p]))}
function heldAgeMinutes(h,state){const p=positionMap(state).get(key(h))||h,raw=p?.opened_at||p?.openedAt||h?.opened_at||h?.openedAt,t=Date.parse(String(raw||''));return Number.isFinite(t)?Math.max(0,(Date.now()-t)/60000):0}
function heldPnl(h,state){const p=positionMap(state).get(key(h));if(Number.isFinite(Number(h?.pnlPct)))return Number(h.pnlPct);if(p&&num(p.invested)>0&&num(p.entry_price)>0&&num(p.last_price)>0)return(num(p.last_price)/num(p.entry_price)-1)*100;return 0}

function optimizeResponse(r,input,state,storage){
 const j=parsePlan(r);if(!j)return r;
 const hit=findPlanMessage(input);if(!hit)return r;
 const candidates=parseBlock(hit.text,'Kandidaten=',' Gehalten=');if(!Array.isArray(candidates))return r;
 const held=arr(parseBlock(hit.text,' Gehalten=')||[]),cMap=new Map(candidates.map(x=>[key(x),x])),fw=forwardMap(state),heldSet=new Set(held.map(key));
 const sells=arr(j.actions).filter(a=>String(a?.action||'').toUpperCase()==='SELL');
 const holds=arr(j.actions).filter(a=>String(a?.action||'').toUpperCase()==='HOLD');
 const timingBlocked=new Set(holds.filter(a=>/ENTRY-TIMING-BLOCK/i.test(String(a?.reason||''))).map(key));
 const buyMap=new Map();
 for(const a of arr(j.actions)){
  if(String(a?.action||'').toUpperCase()!=='BUY')continue;
  const c=cMap.get(key(a)),learn=c?getEntryTimingAdjustment(storage,c):null;
  if(!c||heldSet.has(key(a))||badEvidence(c)||chaseBlocked(c)||learn?.block||timingBlocked.has(key(a)))continue;
  buyMap.set(key(a),{...a,_score:scoreCandidate(c,fw.get(key(a)),storage),_cand:c,_timingLearn:learn});
 }
 if(!buyMap.size){
  for(const c of candidates){
   const learn=getEntryTimingAdjustment(storage,c);
   if(heldSet.has(key(c))||badEvidence(c)||chaseBlocked(c)||learn.block||timingBlocked.has(key(c)))continue;
   if(String(c?.eventRisk||'').toUpperCase()==='HIGH'||String(c?.momentumSellSignal||'').toUpperCase()==='STRONG')continue;
   const sc=scoreCandidate(c,fw.get(key(c)),storage);
   if(sc>=7.4){const timing=entryTiming(c);buyMap.set(key(c),{symbol:key(c),action:'BUY',confidence:clamp(.52+sc*.035+num(learn.confidenceDelta),.58,.9),allocation_pct:1,reason:`PROFIT-OPTIMIZER: Erwartungswert ${sc.toFixed(2)} · ${timing.pullbackRetest?'Ruecksetzer/Re-Test bestaetigt':'Live+Katalysator bestaetigt'}${learn.reason?` · ${learn.reason}`:''}`,_score:sc,_cand:c,_timingLearn:learn});break}
  }
 }

 const ranked=[...buyMap.values()].sort((a,b)=>b._score-a._score),best=ranked[0]?._score??-99,second=ranked[1]?._score??-99;
 const regime=String(ranked[0]?._cand?.marketRegime||ranked[0]?.regime||state?.marketRegime?.label||'RANGE').toUpperCase();
 const sellSet=new Set(sells.map(key));
 const heldRank=held.map(h=>{const c=cMap.get(key(h));return{h,c,score:c?scoreCandidate(c,fw.get(key(c)),storage):-1e9,age:heldAgeMinutes(h,state),pnl:heldPnl(h,state)}}).filter(x=>x.c&&!sellSet.has(key(x.h))).sort((a,b)=>a.score-b.score);

 // 1) Thesis-Failure / Time-Stop: eine zerfallende Position nicht stundenlang aus Gewohnheit halten.
 for(const x of heldRank){
  const stateName=String(x.c?.momentumState||'').toUpperCase(),sellSignal=String(x.c?.momentumSellSignal||'NONE').toUpperCase();
  const thesisFailed=x.age>=90&&x.pnl<=0.10&&x.score<=1.25&&(sellSignal==='WATCH'||sellSignal==='STRONG'||stateName==='EXHAUSTION'||stateName==='REVERSAL');
  const deadMoney=x.age>=180&&x.pnl<0.30&&x.score<=2.25;
  if(thesisFailed||deadMoney){sells.push({symbol:key(x.h),action:'SELL',confidence:clamp(.62+Math.min(4,Math.max(0,2.5-x.score))*.055,.62,.88),allocation_pct:0,reason:`TIME/THESIS-EXIT: ${Math.round(x.age)} Min. gehalten · P/L ${x.pnl.toFixed(2)}% · aktueller Erwartungs-Score ${x.score.toFixed(2)} · ${thesisFailed?'Signal zerfallen':'Kapital ohne ausreichenden Fortschritt gebunden'}`});sellSet.add(key(x.h));break}
 }

 // 2) Opportunity-Cost-Rotation: klar besseres Setup darf schwaches Kapital ersetzen.
 if(best>=7.4&&ranked.length){
  const weak=heldRank.find(x=>!sellSet.has(key(x.h)));
  if(weak){
   const stateName=String(weak.c?.momentumState||'').toUpperCase(),sellSignal=String(weak.c?.momentumSellSignal||'NONE').toUpperCase(),gap=best-weak.score;
   const signalWeak=weak.score<=3.8||sellSignal!=='NONE'||['EXHAUSTION','REVERSAL'].includes(stateName),stagnant=weak.age>=75&&weak.pnl<0.35;
   const protectedWinner=weak.pnl>=1.5&&sellSignal==='NONE'&&!['EXHAUSTION','REVERSAL'].includes(stateName)&&weak.score>3.5;
   if(!protectedWinner&&gap>=2.4&&(signalWeak||stagnant)){
    sells.push({symbol:key(weak.h),action:'SELL',confidence:clamp(.60+gap*.04,.62,.90),allocation_pct:0,reason:`OPPORTUNITY-COST-ROTATION: ${key(ranked[0])} Score ${best.toFixed(2)} vs. ${key(weak.h)} ${weak.score.toFixed(2)} · Haltedauer ${Math.round(weak.age)} Min. · P/L ${weak.pnl.toFixed(2)}% · Kapital zum klar hoeheren Erwartungswert umschichten`});sellSet.add(key(weak.h));
   }
  }
 }

 const deploy=deployPct(best,second,regime);let buys=[];
 if(deploy>0&&ranked.length){
  const chosen=ranked.slice(0,best>=9.5?3:best>=8?2:1),baseCap=singleCap(best,regime),raw=chosen.map((x,i)=>Math.exp((x._score-best)*.75)*(i===0?1.18:1)),sum=raw.reduce((a,b)=>a+b,0)||1;let remaining=deploy;
  buys=chosen.map((x,i)=>{const timing=entryTiming(x._cand),learn=x._timingLearn||getEntryTimingAdjustment(storage,x._cand),learnCap=Math.max(12,baseCap*num(learn.sizeMultiplier,1)),cap=timing.nearHigh?Math.min(learnCap,35):learnCap;let pct=i===chosen.length-1?Math.min(remaining,cap):Math.min(cap,deploy*raw[i]/sum);pct=Math.max(0,Math.min(remaining,pct));remaining-=pct;const timingText=timing.nearHigh?'Breakout-Einstieg, Groesse begrenzt':timing.pullbackRetest?'Ruecksetzer/Re-Test':'Timing neutral',learnText=learn.reason?` · ${learn.reason}`:'';return{symbol:key(x),action:'BUY',confidence:clamp(num(x.confidence,.6)+num(learn.confidenceDelta),.5,.95),allocation_pct:+pct.toFixed(2),reason:`${String(x.reason||'').slice(0,180)} · PROFIT-SCORE ${x._score.toFixed(2)} · ${timingText}${learnText} · Kapital ${pct.toFixed(1)}%`}}).filter(x=>x.allocation_pct>0.01);
  if(remaining>0.01&&buys.length){for(const b of buys){const c=cMap.get(key(b)),learn=getEntryTimingAdjustment(storage,c),baseLearnCap=Math.max(12,baseCap*num(learn.sizeMultiplier,1)),cap=entryTiming(c).nearHigh?Math.min(baseLearnCap,35):baseLearnCap,room=Math.max(0,cap-b.allocation_pct),add=Math.min(room,remaining);b.allocation_pct=+(b.allocation_pct+add).toFixed(2);remaining-=add;if(remaining<=0.01)break}}
 }
 const keptHolds=holds.filter(h=>!buys.some(b=>key(b)===key(h))&&!sells.some(s=>key(s)===key(h)));
 j.actions=[...sells,...buys,...keptHolds];
 const exitCount=sells.length,used=buys.reduce((a,x)=>a+num(x.allocation_pct),0);
 j.summary=`${String(j.summary||'').slice(0,190)} · PROFIT-OPTIMIZER: bester Score ${Number.isFinite(best)?best.toFixed(2):'–'}, ${used.toFixed(0)}% fuer ${buys.length} BUY(s), ${exitCount} SELL(s); Anti-Chase + 15/30/60m-Lernen + Opportunity-Cost aktiv.`;
 return{...r,response:JSON.stringify(j)};
}

export class ProfitOptimizerAiGuard{
 constructor(base,adapter,storage){this.base=base;this.adapter=adapter;this.storage=storage}
 async run(model,input){const joined=String(arr(input?.messages).map(x=>x?.content||'').join('\n')),isPlan=joined.includes('Kandidaten=')&&joined.includes('JSON-only');if(!isPlan)return this.base.run(model,input);const state=this.adapter?.peekState?.()||null,next=enrichInput(input,state),r=await this.base.run(model,next);return optimizeResponse(r,next,state,this.storage)}
}
