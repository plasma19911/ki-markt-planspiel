import {classifyHardExit} from './hard-exit-classifier.js';
const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const key=x=>String(x?.symbol||x||'').toUpperCase();
const responseText=r=>String(r?.response||r?.result?.response||'');

// Das sind reine Risikokappen fuer die Positionsgroesse, KEINE BUY-/SELL-Signalschwellen.
const MAX_DIP_BUY_PCT=28;
const MAX_NORMAL_BUY_PCT=18;
const MAX_NON_DIP_BUY_PCT=8;
const MAX_BUY_PER_SCAN_PCT=55;
const MIN_ECONOMIC_BUY_PCT=1.5;

function parsePlan(r){const raw=responseText(r),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j.actions)?j:null}catch{return null}}
function findPrompt(input){for(const m of arr(input?.messages)){const t=String(m?.content||'');if(t.includes('Kandidaten=')&&t.includes(' Gehalten='))return t}return''}
function parseBlock(text,start,end=null){const a=text.indexOf(start);if(a<0)return null;const from=a+start.length,b=end?text.indexOf(end,from):-1;try{return JSON.parse(text.slice(from,b>=0?b:text.length).trim())}catch{return null}}
function ageMinutes(p={},now=Date.now()){const t=Date.parse(String(p?.opened_at||p?.openedAt||''));return Number.isFinite(t)?Math.max(0,(now-t)/60000):null}
function pnlPct(p={}){for(const v of [p?.pnlPct,p?.pnl_pct,p?.pnl])if(Number.isFinite(Number(v)))return Number(v);const invested=num(p?.invested),entry=num(p?.entry_price),last=num(p?.last_price),efx=num(p?.entry_fx,1),lfx=num(p?.last_fx,1);return invested>0&&entry>0&&last>0?(last/entry*lfx/efx-1)*100:0}
function timeOnlySell(a={}){return/(?:TIME\/THESIS-EXIT|DEAD[- ]?MONEY|TIME[- ]?EXIT|ZEIT[- ]?EXIT)/i.test(String(a?.reason||''))}
function forcedCashBuy(a={}){return/(?:FULL-CASH-BEST|OUTER-FULL-CASH|FULL-CASH)/i.test(String(a?.reason||''))}
function capitalMotionBuy(a={}){return/(?:CAPITAL-IN-MOTION|CAPITAL-MOTION)/i.test(String(a?.reason||''))}
function normalizedCurrency(v){const c=String(v||'').trim();return c==='GBp'||c.toUpperCase()==='GBX'?'GBP':c.toUpperCase()}
function positionValue(p={}){return Math.max(0,num(p?.invested,p?.value))}
function themeFamily(v){const t=String(v||'').toUpperCase();if(!t)return'';if(t.includes('DEFENSE')||t.includes('RUSSIA')||t.includes('MILIT'))return'DEFENSE';if(t.includes('SEMI')||t.includes('CHIP'))return'SEMICONDUCTOR';if(t.includes('AI_POWER')||t.includes('GRID')||t.includes('DATA_CENTER'))return'AI_POWER_GRID';if(t.includes('CYBER'))return'CYBER_SECURITY';if(t.includes('NUCLEAR')||t.includes('URANIUM'))return'NUCLEAR';if(t.includes('ENERGY')||t.includes('OIL')||t.includes('GAS'))return'ENERGY';if(t.includes('GOLD')||t.includes('MINER'))return'MATERIALS';if(t.includes('RATE')||t.includes('MACRO'))return'MACRO_SENSITIVE';return t}
function nordic(x={}){const s=key(x),c=normalizedCurrency(x?.currency);return /\.(ST|CO|HE|OL)$/.test(s)||['SEK','DKK','NOK'].includes(c)}

function metrics(c={}){
 const rawDraw=c?.drawdownFrom20mHighPct??c?.drawdown_from_20m_high_pct,drawKnown=Number.isFinite(Number(rawDraw)),draw=drawKnown?Number(rawDraw):0;
 return{event:String(c?.eventRisk||c?.event_risk||'NONE').toUpperCase(),state:String(c?.momentumState||c?.momentum_state||'NORMAL').toUpperCase(),sell:String(c?.momentumSellSignal||c?.momentum_sell_signal||'NONE').toUpperCase(),m5:num(c?.intraday5m,c?.momentum5),m20:num(c?.intraday20m,c?.momentum20),accel:num(c?.momentumAcceleration5,c?.momentum_acceleration5),day:num(c?.day,c?.day_change),draw,drawKnown,rsi:num(c?.intradayRsi,c?.rsi||50),score:num(c?.liveScore,c?.score),confidence:num(c?.liveConfidence,c?.confidence),marketCap:num(c?.marketCapUSD,c?.marketCap)}
}
function hardExit(c={},a={}){return classifyHardExit(c,a).hard}
function safeQuality(c={}){const x=metrics(c),safe=x.event!=='HIGH'&&x.sell!=='STRONG'&&!['REVERSAL','EXHAUSTION'].includes(x.state);return safe&&((x.score>=2.8&&x.confidence>=.54)||(x.score>=4&&x.confidence>=.48))}
function dipLike(c={},a={}){const x=metrics(c),r=String(a?.reason||c?.entryTimingBucket||c?.reason||'');return(x.drawKnown&&x.draw<0)||x.day<0||x.m20<0||/DIP|PULLBACK|REBOUND/i.test(r)}
function highLike(c={},a={}){const x=metrics(c);return!dipLike(c,a)&&((x.drawKnown&&x.draw>=0)||x.day>.8||x.m20>.8||x.rsi>=70)}
function foreignFxMissing(candidate={},state={}){const cur=normalizedCurrency(candidate?.currency),base=normalizedCurrency(state?.config?.currency||'EUR'),fx=num(candidate?.fx_rate,candidate?.fxRate);if(!cur||!base||cur===base)return false;return!(fx>0)||Math.abs(fx-1)<.025}

function exposureShare(positions,predicate){const total=arr(positions).reduce((s,p)=>s+positionValue(p),0);if(!(total>0))return 0;return arr(positions).filter(predicate).reduce((s,p)=>s+positionValue(p),0)/total}
function riskSizing(candidate={},action={},positions=[],baseCurrency='EUR'){
 const x=metrics(candidate),dip=dipLike(candidate,action),high=highLike(candidate,action),noise=Math.max(Math.abs(x.m5)*1.4,Math.abs(x.m20)*.9,Math.abs(x.day)*.22);
 const volatilityFactor=noise<.7?1:noise<1.3?.88:noise<2.1?.72:.58;
 const marketCapFactor=!(x.marketCap>0)?1:x.marketCap<100_000_000?.55:x.marketCap<300_000_000?.70:x.marketCap<1_000_000_000?.85:1;
 const cur=normalizedCurrency(candidate?.currency),base=normalizedCurrency(baseCurrency||'EUR'),currencyShare=cur?exposureShare(positions,p=>normalizedCurrency(p?.currency)===cur):0;
 let currencyFactor=1;if(cur&&cur!==base)currencyFactor=currencyShare>=.55?.50:currencyShare>=.40?.68:currencyShare>=.28?.84:1;else if(cur===base)currencyFactor=currencyShare>=.75?.75:currencyShare>=.60?.90:1;
 const nordicShare=exposureShare(positions,p=>nordic(p));let nordicFactor=1;if(nordic(candidate))nordicFactor=nordicShare>=.65?.55:nordicShare>=.50?.72:nordicShare>=.35?.88:1;
 const theme=themeFamily(candidate?.theme||candidate?.sector),themeShare=theme?exposureShare(positions,p=>themeFamily(p?.theme||p?.sector)===theme):0,exceptional=x.score>=6.2&&x.confidence>=.76;let themeFactor=1;if(themeShare>=.55)themeFactor=exceptional?.88:.70;
 const factor=clamp(volatilityFactor*marketCapFactor*currencyFactor*nordicFactor*themeFactor,.28,1),cap=high?MAX_NON_DIP_BUY_PCT:dip?MAX_DIP_BUY_PCT:MAX_NORMAL_BUY_PCT;
 return{factor,cap,dip,high,noise,volatilityFactor,marketCapFactor,currencyFactor,currencyShare,nordicFactor,nordicShare,themeFactor,themeShare,theme};
}

export function freshPositionSellDecision({position={},candidate={},action={},now=Date.now()}={}){
 const age=ageMinutes(position,now),pl=pnlPct(position),hard=hardExit(candidate,action),x=metrics(candidate);
 return{allow:true,hard,delegatedToCandleFlow:!hard,ageMinutesTelemetry:age==null?null:+age.toFixed(1),ageRule:false,pl:+pl.toFixed(2),reason:hard?'harter Risikoexit – sofort ausfuehrbar':'Haltedauer entscheidet nicht; finaler SELL nur durch aktuelle Käufer-/Verkäuferkerzen/Struktur',tape:{m5:x.m5,m20:x.m20,accel:x.accel,state:x.state}};
}

function postProcess(r,input,{getState}={}){
 const plan=parsePlan(r);if(!plan)return r;
 const state=typeof getState==='function'?(getState()||{}):{},positions=arr(state?.positions),stateCandidates=arr(state?.candidates),stateCMap=new Map(stateCandidates.map(c=>[key(c),c])),prompt=findPrompt(input),promptCandidates=arr(parseBlock(prompt,'Kandidaten=',' Gehalten=')||[]),promptCMap=new Map(promptCandidates.map(c=>[key(c),c])),candidateFor=s=>({...stateCMap.get(key(s)),...promptCMap.get(key(s))}),cash=num(state?.config?.cash,state?.cash),baseCurrency=state?.config?.currency||'EUR';
 const notes=[],actions=[];
 for(const a of arr(plan.actions)){
  const act=String(a?.action||'').toUpperCase(),s=key(a),c=candidateFor(a),hard=hardExit(c,a);
  if(act==='SELL'&&timeOnlySell(a)&&!hard){actions.push({symbol:s,action:'HOLD',confidence:clamp(num(a?.confidence,.65),.56,.84),allocation_pct:0,reason:'NO-TIME-EXIT: Uhr/Haltedauer ist kein Verkaufsgrund. Verkauf nur bei bestätigter Verkäuferstruktur im Candle-Flow.'});notes.push(`${s} Zeit-SELL blockiert`);continue}
  if(act!=='BUY'){actions.push(a);continue}
  if(cash<=1.05){notes.push('kein verfügbarer Cash');continue}
  if(forcedCashBuy(a)){actions.push({symbol:s,action:'HOLD',confidence:.64,allocation_pct:0,reason:'SELECTIVE-CASH: alter FULL-CASH-Zwangskauf blockiert. Cash darf liegen bleiben, bis ein gutes Setup bestätigt ist.'});notes.push(`${s} Zwangskauf blockiert`);continue}
  if(capitalMotionBuy(a)&&!safeQuality(c)){actions.push({symbol:s,action:'HOLD',confidence:.64,allocation_pct:0,reason:'SELECTIVE-CAPITAL: Capital-in-Motion reicht allein nicht. Qualität/Sicherheit für einen neuen Kauf ist aktuell zu schwach.'});notes.push(`${s} schwachen Capital-Motion-Kauf blockiert`);continue}
  if(foreignFxMissing(c,state)){actions.push({symbol:s,action:'HOLD',confidence:.65,allocation_pct:0,reason:'FX-SAFETY: Fremdwährungs-Kauf wartet auf einen echten Umrechnungskurs statt Platzhalter 1,0.'});notes.push(`${s} FX fehlt`);continue}
  const rs=riskSizing(c,a,positions,baseCurrency),old=Math.max(0,num(a?.allocation_pct)),next=Math.min(old,rs.cap)*rs.factor;
  if(next<MIN_ECONOMIC_BUY_PCT){actions.push({symbol:s,action:'HOLD',confidence:.64,allocation_pct:0,reason:`SELECTIVE-SIZING: Nach Risiko-/Konzentrationsanpassung wären nur ${next.toFixed(1)}% sinnvoll; wegen Gebühren/kleinem Nutzen wird auf ein besseres Setup gewartet.`});notes.push(`${s} zu klein nach Risikosizing`);continue}
  actions.push({...a,allocation_pct:+next.toFixed(2),reason:`${String(a?.reason||'').slice(0,250)} · SELECTIVE-SIZING: ${rs.dip?'Dip':'Setup'} · Risiko-Faktor ${rs.factor.toFixed(2)} (Volatilität ${rs.volatilityFactor.toFixed(2)}, Größe ${rs.marketCapFactor.toFixed(2)}, Währung ${rs.currencyFactor.toFixed(2)}, Nordic ${rs.nordicFactor.toFixed(2)}, Thema ${rs.themeFactor.toFixed(2)}). Positionskappe ist nur Risikomanagement, kein Signal.`});
 }
 let finalActions=actions;const buys=finalActions.filter(a=>String(a?.action||'').toUpperCase()==='BUY'),sum=buys.reduce((s,a)=>s+Math.max(0,num(a?.allocation_pct)),0);
 if(sum>MAX_BUY_PER_SCAN_PCT){const scale=MAX_BUY_PER_SCAN_PCT/sum;finalActions=finalActions.map(a=>String(a?.action||'').toUpperCase()==='BUY'?{...a,allocation_pct:+(num(a?.allocation_pct)*scale).toFixed(2),reason:`${String(a?.reason||'').slice(0,330)} · SCAN-RISK: mehrere Käufe gemeinsam auf ${MAX_BUY_PER_SCAN_PCT}% des verfügbaren Cash-Budgets skaliert.`}:a);notes.push('Gesamt-Neukäufe pro Scan risikoskaliert')}
 plan.actions=finalActions;
 if(notes.length)plan.summary=`${String(plan.summary||'').slice(0,150)} · SELECTIVE-CAPITAL: ${notes.slice(0,4).join(' · ')}. Cash ist erlaubt; BUY/SELL final per Candle-Flow.`;
 return{...r,response:JSON.stringify(plan)};
}

export class FreshPositionChurnAiGuard{constructor(base,{getState=null,storage=null}={}){this.base=base;this.getState=getState;this.storage=storage}async run(model,input){const r=await this.base.run(model,input);return postProcess(r,input,{getState:this.getState})}}
