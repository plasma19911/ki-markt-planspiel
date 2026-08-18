import {evaluateCapitalMotion} from './profit-optimizer-v2.js';
import {getReplayTimingAdjustment} from './day-replay-learning.js';

// Letzte Einstiegspreis-Schicht vor der Ausfuehrung:
// Pullback/Re-Test zuerst, frueher Breakout zweitens, normaler Einstieg drittens.
// Tages-Replay darf diese Prioritaet nach mehreren realen Samples nur begrenzt
// kalibrieren. Peak-/Ueberhitzungsschutz bleibt hart.

const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const key=x=>String(x?.symbol||x||'').toUpperCase();
const responseText=r=>String(r?.response||r?.result?.response||'');

function parseBlock(text,start,end=null){const a=text.indexOf(start);if(a<0)return null;const from=a+start.length,b=end?text.indexOf(end,from):-1;try{return JSON.parse(text.slice(from,b>=0?b:text.length).trim())}catch{return null}}
function parsePlan(r){const raw=responseText(r),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j.actions)?j:null}catch{return null}}
function findPlanMessage(input){for(let i=0;i<arr(input?.messages).length;i++){const t=String(input.messages[i]?.content||'');if(t.includes('Kandidaten=')&&t.includes(' Gehalten='))return{i,text:t}}return null}
function promptCash(text){const m=String(text||'').match(/\bCash\s+([0-9]+(?:[.,][0-9]+)?)/i);return m?num(String(m[1]).replace(',','.')):0}
function specialDiscovery(c={}){return Boolean(c?.reboundWatch||c?.reboundRadar||c?.earlyBreakoutWatch)}

export function evaluateEntryPriceTiming(c={},storage=null){
 const base=evaluateCapitalMotion(c,storage),rawDraw=c?.drawdownFrom20mHighPct??c?.drawdown_from_20m_high_pct,drawKnown=Number.isFinite(Number(rawDraw)),draw=drawKnown?Number(rawDraw):-99,day=num(c?.day,c?.day_change),m5=num(c?.intraday5m,c?.momentum5),m20=num(c?.intraday20m,c?.momentum20),accel=num(c?.momentumAcceleration5,c?.momentum_acceleration5),rsi=num(c?.intradayRsi,c?.rsi||50),state=String(c?.momentumState||c?.momentum_state||'NORMAL').toUpperCase();
 const nearHigh=drawKnown&&draw>-0.18;
 const pullbackZone=drawKnown&&draw<=-0.22&&draw>=-2.2;
 const deeperPullback=drawKnown&&draw<-0.45&&draw>=-3.2;
 const bounceConfirmed=m5>=0.02&&accel>=0.015&&m20>=-0.08;
 const deepBounce=deeperPullback&&m5>=0.08&&accel>=0.05&&rsi<=70;
 const pullbackConfirmed=base.confirmed&&(pullbackZone&&bounceConfirmed||deepBounce)&&rsi>=38&&rsi<=72;
 const earlyBreakout=base.confirmed&&!pullbackConfirmed&&day<=3.2&&rsi<72&&m5>=0.05&&m5<=0.45&&m20>=0.12&&m20<=1.35&&accel>=0.015&&(!drawKnown||draw>=-0.35)&&['BUILDING','BREAKOUT','NORMAL'].includes(state);
 const unknownLocationRisk=!drawKnown&&(day>=4||rsi>=74||m20>=1.5);
 const hardPeak=!pullbackConfirmed&&(rsi>=77||(nearHigh&&day>=6)||(nearHigh&&m20>=2)||(nearHigh&&day>=4&&accel<0)||(nearHigh&&m5>=0.60));
 const peakRisk=!pullbackConfirmed&&(hardPeak||unknownLocationRisk||(nearHigh&&(day>=2.8||rsi>=70||m20>=0.9)&&(accel<=0.03||rsi>=73||day>=4.5||m5>=0.40)));
 const overextended=!pullbackConfirmed&&(day>=8.5||m20>=3.2||rsi>=79);
 const normalEntry=base.confirmed&&!nearHigh&&!overextended&&m5>=-0.05&&m20>=-0.10;
 const mode=pullbackConfirmed?'PULLBACK_RETEST':earlyBreakout?'EARLY_BREAKOUT':peakRisk||overextended?'PEAK_BLOCK':normalEntry?'NORMAL':'WAIT_FOR_PULLBACK';
 const replayBucket=mode==='PEAK_BLOCK'?'PEAK_CHASE':mode,replay=getReplayTimingAdjustment(storage,replayBucket);
 let adjustedExpected=num(base.expected);if(pullbackConfirmed)adjustedExpected+=1.35;else if(earlyBreakout)adjustedExpected+=.45;else if(normalEntry)adjustedExpected+=.10;if(peakRisk)adjustedExpected-=2.25;if(overextended)adjustedExpected-=2.75;adjustedExpected+=num(replay?.scoreDelta);
 const buyable=base.confirmed&&!peakRisk&&!overextended&&!replay?.block&&(pullbackConfirmed||earlyBreakout||normalEntry);
 const baseReason=pullbackConfirmed?`Ruecksetzer ${draw.toFixed(2)}% vom 20m-Hoch, 1m/5m drehen wieder hoch`:earlyBreakout?`frueher Breakout: Tag ${day>=0?'+':''}${day.toFixed(2)}%, 5m +${m5.toFixed(2)}%, noch nicht ueberhitzt`:peakRisk||overextended?`Peak-Chase blockiert: Tag ${day>=0?'+':''}${day.toFixed(2)}%, RSI ${rsi.toFixed(0)}, 20m ${m20>=0?'+':''}${m20.toFixed(2)}%, Abstand 20m-Hoch ${drawKnown?draw.toFixed(2)+'%':'unbekannt'}`:`neutraler Einstieg abseits des lokalen Hochs`,reason=replay?.reason?`${baseReason} · ${replay.reason}`:baseReason;
 return{...base,buyable,mode,pullbackConfirmed,earlyBreakout,normalEntry,peakRisk,hardPeak,overextended,nearHigh,drawKnown,drawdownFrom20mHighPct:drawKnown?+draw.toFixed(3):null,adjustedExpected:+adjustedExpected.toFixed(3),replayAdjustment:replay,reason};
}

function candidateCap(c,p){if(c?.reboundWatch||c?.reboundRadar)return 35;if(c?.earlyBreakoutWatch||p.earlyBreakout)return 45;if(p.nearHigh)return 50;return 100}
function timingWeight(p){const learned=num(p?.replayAdjustment?.sizeMultiplier,1);if(p.pullbackConfirmed)return 1.35*learned;if(p.earlyBreakout)return 1.08*learned;if(p.normalEntry)return learned;return .5*learned}

export function buildPullbackFirstAllocations(candidates=[],storage=null,{originalBuySymbols=[],heldSymbols=[]}={}){
 const original=new Set(arr(originalBuySymbols).map(key)),held=new Set(arr(heldSymbols).map(key));
 const ranked=arr(candidates).filter(c=>!held.has(key(c))).map(c=>({c,p:evaluateEntryPriceTiming(c,storage)})).filter(x=>x.p.buyable&&(!specialDiscovery(x.c)||original.has(key(x.c)))).sort((a,b)=>b.p.adjustedExpected-a.p.adjustedExpected||Number(b.p.pullbackConfirmed)-Number(a.p.pullbackConfirmed)||b.p.liveScore-a.p.liveScore);
 if(!ranked.length)return[];
 const picked=[];let capSum=0;for(const x of ranked){const cap=candidateCap(x.c,x.p);picked.push({...x,cap});capSum+=cap;if(capSum>=100||picked.length>=4)break}
 const best=picked[0].p.adjustedExpected,rows=picked.map((x,i)=>({...x,weight:Math.exp((x.p.adjustedExpected-best)*.72)*timingWeight(x.p)*(i===0?1.12:1),pct:0}));let remaining=100;
 for(let pass=0;pass<5&&remaining>.001;pass++){
  const open=rows.filter(o=>o.pct+1e-6<o.cap);if(!open.length)break;const wsum=open.reduce((a,o)=>a+o.weight,0)||open.length;let used=0;
  for(const o of open){const add=Math.min(o.cap-o.pct,remaining*(o.weight/wsum));o.pct+=add;used+=add}
  if(used<.001)break;remaining=Math.max(0,remaining-used);
 }
 return rows.filter(o=>o.pct>.01).map(o=>({symbol:key(o.c),allocation_pct:+o.pct.toFixed(4),entryMode:o.p.mode,adjustedExpected:o.p.adjustedExpected,rawExpected:o.p.expected,profile:o.p,candidate:o.c}));
}

function isRotationSell(a={}){return /(?:CAPITAL-MOTION-ROTATION|OPPORTUNITY-COST-ROTATION)/i.test(String(a?.reason||''))}

function postProcess(r,input,storage){
 const plan=parsePlan(r),hit=findPlanMessage(input);if(!plan||!hit)return r;
 const candidates=parseBlock(hit.text,'Kandidaten=',' Gehalten=');if(!Array.isArray(candidates)||!candidates.length)return r;
 const held=arr(parseBlock(hit.text,' Gehalten=')||[]),cash=promptCash(hit.text),original=arr(plan.actions),originalBuys=original.filter(a=>String(a?.action||'').toUpperCase()==='BUY'),sells=original.filter(a=>String(a?.action||'').toUpperCase()==='SELL'),holds=original.filter(a=>String(a?.action||'').toUpperCase()==='HOLD');
 const deployContext=cash>2||originalBuys.length>0||sells.length>0;if(!deployContext)return r;
 const alloc=buildPullbackFirstAllocations(candidates,storage,{originalBuySymbols:originalBuys.map(key),heldSymbols:held.map(key)});
 if(!alloc.length){
  const keptSells=sells.filter(s=>!isRotationSell(s)),cancelled=sells.length-keptSells.length,blocked=originalBuys.map(b=>{const c=candidates.find(x=>key(x)===key(b));return c?evaluateEntryPriceTiming(c,storage):null}).filter(Boolean).filter(x=>x.peakRisk||x.overextended||x.replayAdjustment?.block);
  plan.actions=[...keptSells,...holds.filter(h=>!keptSells.some(s=>key(s)===key(h)))];
  plan.summary=`${String(plan.summary||'').slice(0,165)} · PULLBACK-FIRST: kein preislich guter Neueinstieg; ${blocked.length} Peak/zu-teuer BUY(s) blockiert${cancelled?`, ${cancelled} Rotation(en) zurueckgenommen`:''}. Lieber auf Ruecksetzer warten als oben hinterherkaufen.`;
  return{...r,response:JSON.stringify(plan)};
 }
 const buySet=new Set(alloc.map(a=>a.symbol)),sellSet=new Set(sells.map(key));
 const buys=alloc.map(a=>({symbol:a.symbol,action:'BUY',confidence:clamp(.51+a.adjustedExpected*.042,.55,.86),allocation_pct:a.allocation_pct,reason:`PULLBACK-FIRST ${a.entryMode}: ${a.profile.reason} · Preis-Timing ${a.adjustedExpected.toFixed(2)} (Basis ${a.rawExpected.toFixed(2)}) · Zielanteil ${a.allocation_pct.toFixed(1)}%`}));
 plan.actions=[...sells,...buys,...holds.filter(h=>!sellSet.has(key(h))&&!buySet.has(key(h)))];
 const total=buys.reduce((a,b)=>a+num(b.allocation_pct),0),top=alloc[0];
 plan.summary=`${String(plan.summary||'').slice(0,155)} · PULLBACK-FIRST: ${top.symbol} ${top.entryMode} bevorzugt; ${total.toFixed(0)}% Cash eingesetzt. Peak-Chase/ueberteuerte Einstiege werden vor Ausfuehrung blockiert.`;
 return{...r,response:JSON.stringify(plan)};
}

export class PullbackFirstAiGuard{
 constructor(base,storage){this.base=base;this.storage=storage}
 async run(model,input){const r=await this.base.run(model,input);const joined=String(arr(input?.messages).map(x=>x?.content||'').join('\n'));if(!joined.includes('Kandidaten=')||!joined.includes('JSON-only'))return r;return postProcess(r,input,this.storage)}
}
