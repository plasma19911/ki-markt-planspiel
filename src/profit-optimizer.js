// Aggressiver Paper-Trading-Optimierer.
// Ziel: erwarteten Gewinn maximieren, nicht jederzeit investiert sein. Keine echten Orders.
// Der Optimierer sitzt als letzte Schicht um den bestehenden AI/Fast-Layer und darf
// nur aktuelle Kandidaten handeln. Safety-, Quote-, Kosten- und Broker-Grenzen bleiben aktiv.

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
 const state=String(c?.momentumState||'NORMAL').toUpperCase(),draw=num(c?.drawdownFrom20mHighPct,-99),day=num(c?.day),m5=num(c?.intraday5m),m20=num(c?.intraday20m),vol=num(c?.volumeRatio,1),rsi=num(c?.intradayRsi,50),breakout=num(c?.momentumBreakoutScore);
 const nearHigh=draw>-0.18;
 const breakoutConfirmed=state==='BREAKOUT'&&breakout>=2&&vol>=1.35&&m5>0.05&&m20>0.15&&rsi<78;
 const extended=day>3.5||m20>1.25||rsi>74;
 const pullbackRetest=draw<=-0.22&&draw>=-1.25&&m20>0&&m5>=-0.18&&rsi<72;
 return{nearHigh,breakoutConfirmed,extended,pullbackRetest,draw,day,m5,m20,vol,rsi};
}
function chaseBlocked(c){const t=entryTiming(c);return t.nearHigh&&!t.breakoutConfirmed}

function forwardMap(state){return new Map(arr(state?.futureWatch?.candidates).map(x=>[key(x),x]))}
function enrichInput(input,state){
 const hit=findPlanMessage(input);if(!hit)return input;
 const candidates=parseBlock(hit.text,'Kandidaten=',' Gehalten=');if(!Array.isArray(candidates))return input;
 const fw=forwardMap(state),enriched=candidates.map(c=>{const f=fw.get(key(c));return f?{...c,forwardWatchScore:num(f.watchScore),forwardIssueStrength:num(f.issueStrength),forwardUrgency:num(f.urgency),forwardQuietScore:num(f.quietScore),forwardHorizon:f.horizon||null,forwardTheme:f.theme||null,forwardCatalyst:f.catalyst||null,forwardDirectionUnknown:Boolean(f.directionUnknown),forwardAlreadyMoving:Boolean(f.alreadyMoving)}:c});
 const a=hit.text.indexOf('Kandidaten='),b=hit.text.indexOf(' Gehalten=',a),prefix=hit.text.slice(0,a),suffix=hit.text.slice(b);
 const policy='PROFIT-OPTIMIZER: Ziel ist maximaler erwarteter PAPER-TRADING-Gewinn nach realistischen Kosten, nicht maximale Handelsfrequenz. Konzentriere Kapital in wenige mehrfach bestaetigte Setups. Ein Forward-Watch-Kandidat darf frueh priorisiert werden, wenn Katalysator+Live-Reaktion+Liquiditaet zusammenpassen. Bei forwardDirectionUnknown=true niemals vor dem Ereignis die Richtung raten; erst nach positiver Live-Bestaetigung kaufen. Schwache Kandidaten duerfen 0% bekommen; Cash ist erlaubt, wenn kein positiver Erwartungswert vorliegt. Gewinner laufen lassen, aber bei klarer Reversal-/Peak-Giveback-Bestaetigung schneller umschichten. Kandidaten mit Infinity/NaN/kaputten Kursindikatoren niemals kaufen. ANTI-CHASE: Direkt am kurzfristigen Hoch nur bei echtem Breakout mit Volumen, positiver 5m/20m-Dynamik und nicht ueberhitztem RSI kaufen. Sonst auf Ruecksetzer/Re-Test warten; bestaetigte Pullback-/Re-Test-Setups bevorzugen. ';
 const messages=input.messages.slice();messages[hit.i]={...messages[hit.i],content:`${prefix}${policy}Kandidaten=${JSON.stringify(enriched)}${suffix}`};return{...input,messages}
}

function scoreCandidate(c,fw){
 const live=num(c?.liveScore,c?.score),conf=num(c?.liveConfidence,c?.confidence),news=num(c?.news),breakout=Math.max(0,num(c?.momentumBreakoutScore)),exhaust=Math.max(0,num(c?.momentumExhaustionScore)),day=num(c?.day),m5=num(c?.intraday5m),m20=num(c?.intraday20m),vol=num(c?.volumeRatio),learn=num(c?.learnedExpected3dPct),similar=num(c?.perfectPreBuySimilarity),timing=entryTiming(c);
 let s=live*1.15+conf*1.6+news*.18+breakout*.16-exhaust*.22+Math.max(0,m5)*.14+Math.max(0,m20)*.09+Math.max(0,vol-1)*.18;
 if(c?.learningUsable)s+=clamp(learn,-3,4)*.18+clamp(similar,0,1)*.35;
 if(fw){s+=num(fw.watchScore)*.018+num(fw.issueStrength)*.009+num(fw.urgency)*.008;if(fw.preNews)s+=.25;if(fw.alreadyMoving)s-=.35;if(fw.directionUnknown)s-=.45}
 if(String(c?.eventRisk||'').toUpperCase()==='HIGH')s-=3;if(String(c?.momentumSellSignal||'').toUpperCase()==='STRONG')s-=4;if(String(c?.momentumState||'').toUpperCase()==='REVERSAL')s-=2.5;
 if(timing.nearHigh&&!timing.breakoutConfirmed)s-=4.5;
 if(timing.nearHigh&&timing.breakoutConfirmed)s+=.35;
 if(timing.pullbackRetest)s+=.7;
 if(timing.extended)s-=1.15;
 if(timing.extended&&timing.nearHigh)s-=1.1;
 if(day>5)s-=.45;if(day>8)s-=1.1;if(badEvidence(c))s-=20;return s
}

function deployPct(best,second,regime){
 if(best>=10)return regime==='VOLATILE'?92:100;
 if(best>=8.5)return regime==='VOLATILE'?82:95;
 if(best>=7.2)return regime==='VOLATILE'?68:85;
 if(best>=6.2)return regime==='VOLATILE'?50:70;
 if(best>=5.4&&second>=5.1)return regime==='TREND_UP'?55:40;
 return 0;
}
function singleCap(best,regime){if(best>=10.5&&regime!=='VOLATILE')return72;if(best>=9)return62;if(best>=7.5)return55;return45}

function optimizeResponse(r,input,state){
 const j=parsePlan(r);if(!j)return r;const hit=findPlanMessage(input);if(!hit)return r;
 const candidates=parseBlock(hit.text,'Kandidaten=',' Gehalten=');if(!Array.isArray(candidates))return r;const held=parseBlock(hit.text,' Gehalten=')||[];
 const cMap=new Map(candidates.map(x=>[key(x),x])),fw=forwardMap(state),heldSet=new Set(arr(held).map(key));
 const sells=arr(j.actions).filter(a=>String(a?.action||'').toUpperCase()==='SELL');const holds=arr(j.actions).filter(a=>String(a?.action||'').toUpperCase()==='HOLD');
 const buyMap=new Map();for(const a of arr(j.actions)){if(String(a?.action||'').toUpperCase()!=='BUY')continue;const c=cMap.get(key(a));if(!c||heldSet.has(key(a))||badEvidence(c)||chaseBlocked(c))continue;buyMap.set(key(a),{...a,_score:scoreCandidate(c,fw.get(key(a))),_cand:c})}
 if(!buyMap.size){for(const c of candidates){if(heldSet.has(key(c))||badEvidence(c)||chaseBlocked(c))continue;if(String(c?.eventRisk||'').toUpperCase()==='HIGH'||String(c?.momentumSellSignal||'').toUpperCase()==='STRONG')continue;const sc=scoreCandidate(c,fw.get(key(c)));if(sc>=7.2){const timing=entryTiming(c);buyMap.set(key(c),{symbol:key(c),action:'BUY',confidence:clamp(.52+sc*.035,.58,.9),allocation_pct:1,reason:`PROFIT-OPTIMIZER: Erwartungswert ${sc.toFixed(2)} · ${timing.pullbackRetest?'Ruecksetzer/Re-Test bestaetigt':'Live+Katalysator bestaetigt'}`,_score:sc,_cand:c});break}}
 const ranked=[...buyMap.values()].sort((a,b)=>b._score-a._score),best=ranked[0]?._score??-99,second=ranked[1]?._score??-99,regime=String(ranked[0]?._cand?.marketRegime||ranked[0]?.regime||state?.marketRegime?.label||'RANGE').toUpperCase(),deploy=deployPct(best,second,regime);
 if(best>=8&&ranked.length){const sellSet=new Set(sells.map(key)),heldRank=arr(held).map(h=>{const c=cMap.get(key(h));return{h,c,score:c?scoreCandidate(c,fw.get(key(c))):-1e9}}).filter(x=>!sellSet.has(key(x.h))).sort((a,b)=>a.score-b.score);const weak=heldRank[0];if(weak){const pnl=num(weak.h?.pnlPct),stateName=String(weak.c?.momentumState||''),sellSignal=String(weak.c?.momentumSellSignal||'NONE');const clearlyInferior=weak.score<=5.5&&best-weak.score>=2.8,notProtectedWinner=pnl<1.5||sellSignal!=='NONE'||stateName==='REVERSAL'||weak.score<=3;if(clearlyInferior&&notProtectedWinner)sells.push({symbol:key(weak.h),action:'SELL',confidence:clamp(.58+(best-weak.score)*.035,.6,.9),allocation_pct:0,reason:`PROFIT-ROTATION: staerkeres Setup ${key(ranked[0])} Score ${best.toFixed(2)} vs. ${key(weak.h)} ${weak.score.toFixed(2)} · Kapital fuer hoeheren Erwartungswert freimachen`})}}
 let buys=[];
 if(deploy>0&&ranked.length){
   const chosen=ranked.slice(0,best>=9?3:best>=7.5?2:1),baseCap=singleCap(best,regime),raw=chosen.map((x,i)=>Math.exp((x._score-best)*.75)*(i===0?1.18:1)),sum=raw.reduce((a,b)=>a+b,0)||1;let remaining=deploy;
   buys=chosen.map((x,i)=>{const timing=entryTiming(x._cand),cap=timing.nearHigh?Math.min(baseCap,35):baseCap;let pct=i===chosen.length-1?Math.min(remaining,cap):Math.min(cap,deploy*raw[i]/sum);pct=Math.max(0,Math.min(remaining,pct));remaining-=pct;const timingText=timing.nearHigh?'Breakout-Einstieg, Groesse begrenzt':timing.pullbackRetest?'Ruecksetzer/Re-Test':'Timing neutral';return{symbol:key(x),action:'BUY',confidence:clamp(num(x.confidence,.6),.5,.95),allocation_pct:+pct.toFixed(2),reason:`${String(x.reason||'').slice(0,220)} · PROFIT-SCORE ${x._score.toFixed(2)} · ${timingText} · Kapital ${pct.toFixed(1)}%`}}).filter(x=>x.allocation_pct>0.01);
   if(remaining>0.01&&buys.length){for(const b of buys){const c=cMap.get(key(b)),cap=entryTiming(c).nearHigh?35:baseCap,room=Math.max(0,cap-b.allocation_pct),add=Math.min(room,remaining);b.allocation_pct=+(b.allocation_pct+add).toFixed(2);remaining-=add;if(remaining<=0.01)break}}
 }
 const keptHolds=holds.filter(h=>!buys.some(b=>key(b)===key(h))&&!sells.some(s=>key(s)===key(h)));
 j.actions=[...sells,...buys,...keptHolds];j.summary=`${String(j.summary||'').slice(0,240)} · PROFIT-OPTIMIZER+ANTI-CHASE: bester Score ${Number.isFinite(best)?best.toFixed(2):'–'}, ${buys.reduce((a,x)=>a+num(x.allocation_pct),0).toFixed(0)}% des freien Cashs fuer ${buys.length} BUY(s); Hoch-Kaeufe ohne Breakout-Bestaetigung blockiert.`;
 return{...r,response:JSON.stringify(j)}
}

export class ProfitOptimizerAiGuard{
 constructor(base,adapter){this.base=base;this.adapter=adapter}
 async run(model,input){const joined=String(arr(input?.messages).map(x=>x?.content||'').join('\n')),isPlan=joined.includes('Kandidaten=')&&joined.includes('JSON-only');if(!isPlan)return this.base.run(model,input);const state=this.adapter?.peekState?.()||null,next=enrichInput(input,state);const r=await this.base.run(model,next);return optimizeResponse(r,next,state)}
}
