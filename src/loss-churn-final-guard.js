const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const key=x=>String(x?.symbol||x||'').toUpperCase().trim();
const responseText=r=>String(r?.response||r?.result?.response||'');

function parsePlan(r){const raw=responseText(r),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j.actions)?j:null}catch{return null}}
function findPrompt(input){for(const m of arr(input?.messages)){const t=String(m?.content||'');if(t.includes('Kandidaten=')&&t.includes(' Gehalten='))return t}return''}
function parseBlock(text,start,end=null){const a=text.indexOf(start);if(a<0)return null;const from=a+start.length,b=end?text.indexOf(end,from):-1;try{return JSON.parse(text.slice(from,b>=0?b:text.length).trim())}catch{return null}}
function hard(reason=''){return/(?:HARD[- ]?EXIT|EVENT[- ]?RISK|NOTAUSSTIEG|STOP[- ]?LOSS|REVERSAL\s+stark|STRONG\s+SELL|harter Risikoexit|NEGATIVE NEWS SHOCK|NEWS.*HARD)/i.test(String(reason))}
function pnl(h={}){for(const v of [h?.pnlPct,h?.pnl_pct,h?.pnl])if(Number.isFinite(Number(v)))return Number(v);return 0}
function heldMetrics(h={}){return{m5:num(h?.intraday5m,h?.momentum5),m20:num(h?.intraday20m,h?.momentum20),accel:num(h?.momentumAcceleration5,h?.momentum_acceleration5),state:String(h?.momentumState||h?.momentum_state||'NORMAL').toUpperCase(),sell:String(h?.momentumSellSignal||h?.momentum_sell_signal||'NONE').toUpperCase()}}
function explicitSellerStructure(reason=''){
 const r=String(reason);
 return /(?:bärisches Engulfing|bearish engulf|klare Verkäuferdominanz|starke Verkäuferdominanz|seller takeover|Verkäuferübernahme bestätigt|lower highs.*lower closes|tiefere Hochs.*fallende Schlusskurse)/i.test(r);
}
function sellerConfirmed(reason,h={}){
 const m=heldMetrics(h);
 if(m.state==='REVERSAL'||m.sell==='STRONG'||explicitSellerStructure(reason))return true;
 const twoWeak=m.m5<=-.20&&m.m20<=-.35;
 const fastBreak=m.m5<=-.35&&m.accel<=-.05;
 return twoWeak||fastBreak;
}
function buyerStillIntact(h={}){const m=heldMetrics(h);return m.m5>=-.05&&m.m20>=-.10&&m.state!=='REVERSAL'&&m.sell!=='STRONG'}

function postProcess(r,input){
 const plan=parsePlan(r),prompt=findPrompt(input);if(!plan||!prompt)return r;
 const held=arr(parseBlock(prompt,' Gehalten=')||[]),hMap=new Map(held.map(h=>[key(h),h])),out=[],blocked=[];
 for(const a of arr(plan.actions)){
  if(String(a?.action||'').toUpperCase()!=='SELL'){out.push(a);continue}
  const s=key(a),reason=String(a?.reason||''),h=hMap.get(s)||{},pl=pnl(h),isHard=hard(reason),confirmed=sellerConfirmed(reason,h);
  if(!isHard&&pl<=0&&!confirmed){
   out.push({symbol:s,action:'HOLD',confidence:.80,allocation_pct:0,reason:`FINAL EXIT VALIDATOR V23: ${s} liegt bei ${pl.toFixed(2)}%. Kein Verlustverkauf wegen weichem Momentum-/Timing-Signal. SELL erst bei bestätigter Verkäuferstruktur, starkem Reversal, hartem Event-/News-Risiko oder Stop-Invaliderung.`});blocked.push(`${s} weicher Verlust-SELL`);continue;
  }
  if(!isHard&&pl>0&&!confirmed&&buyerStillIntact(h)){
   out.push({symbol:s,action:'HOLD',confidence:.76,allocation_pct:0,reason:`FINAL WINNER HOLD V23: ${s} liegt bei +${pl.toFixed(2)}% und die Käuferstruktur ist noch nicht klar gebrochen. Gewinner weiterlaufen lassen; kein Gewinnverkauf nur wegen eines kleinen 5m-Rücksetzers.`});blocked.push(`${s} Gewinner ohne bestätigten Bruch`);continue;
  }
  out.push(a);
 }
 plan.actions=out;if(blocked.length)plan.summary=`${String(plan.summary||'').slice(0,135)} · EXIT V23: ${blocked.slice(0,3).join(' · ')} gestoppt.`;
 return{...r,response:JSON.stringify(plan)};
}

export class LossChurnFinalAiGuard{constructor(base){this.base=base}async run(model,input){const r=await this.base.run(model,input);return postProcess(r,input)}}
