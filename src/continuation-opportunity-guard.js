const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const key=x=>String(x?.symbol||x||'').toUpperCase().trim();
const responseText=r=>String(r?.response||r?.result?.response||'');

function parsePlan(r){const raw=responseText(r),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j.actions)?j:null}catch{return null}}
function findPrompt(input){for(const m of arr(input?.messages)){const t=String(m?.content||'');if(t.includes('Kandidaten=')&&t.includes(' Gehalten='))return t}return''}
function parseBlock(text,start,end=null){const a=text.indexOf(start);if(a<0)return null;const from=a+start.length,b=end?text.indexOf(end,from):-1;try{return JSON.parse(text.slice(from,b>=0?b:text.length).trim())}catch{return null}}
function shares(reason=''){const m=String(reason).match(/Käufer\s*(\d+)%\s*\/\s*Verkäufer\s*(\d+)%/i);return m?{buyer:Number(m[1]),seller:Number(m[2])}:null}
function last3(reason=''){const m=String(reason).match(/letzte\s*3\s*(\d+)\s*grün\/(\d+)\s*rot/i);return m?{green:Number(m[1]),red:Number(m[2])}:null}
function higherLows(reason=''){const m=String(reason).match(/(\d+)\s*h(?:ö|oe)here Tiefs/i);return m?Number(m[1]):0}
function metrics(c={}){return{score:num(c?.liveScore,c?.score),confidence:num(c?.liveConfidence,c?.confidence),m5:num(c?.intraday5m,c?.momentum5),m20:num(c?.intraday20m,c?.momentum20),accel:num(c?.momentumAcceleration5,c?.momentum_acceleration5),rsi:num(c?.intradayRsi,c?.rsi||50),event:String(c?.eventRisk||c?.event_risk||'NONE').toUpperCase(),state:String(c?.momentumState||c?.momentum_state||'NORMAL').toUpperCase(),sell:String(c?.momentumSellSignal||c?.momentum_sell_signal||'NONE').toUpperCase()}}
function safe(x){return x.event!=='HIGH'&&x.sell!=='STRONG'&&!['REVERSAL','EXHAUSTION'].includes(x.state)}

function postProcess(r,input){
 const plan=parsePlan(r),prompt=findPrompt(input);if(!plan||!prompt)return r;
 const candidates=arr(parseBlock(prompt,'Kandidaten=',' Gehalten=')||[]),map=new Map(candidates.map(c=>[key(c),c])),out=[],notes=[];
 for(const a of arr(plan.actions)){
  const s=key(a),act=String(a?.action||'').toUpperCase(),reason=String(a?.reason||'');
  if(act!=='HOLD'||!/CANDLE-FLOW DIP-WAIT/i.test(reason)){out.push(a);continue}
  const c=map.get(s);if(!c){out.push(a);continue}
  const x=metrics(c),sh=shares(reason),l3=last3(reason),hl=higherLows(reason),greenVol=/grünes Volumen führt/i.test(reason),bullEngulf=/bullisches Engulfing/i.test(reason),base=/Bodenbildung/i.test(reason);
  const continuation=['BREAKOUT','BUILDING'].includes(x.state)||/BREAKOUT|CONTINUATION/i.test(String(c?.entryTimingBucket||c?.reason||''));
  const momentum=x.m5>0&&x.m20>=0&&x.accel>=-.03;
  const tape=sh&&sh.buyer>=55&&sh.buyer>sh.seller;
  const structure=(l3?.green>=2&&hl>=2)||(greenVol&&hl>=1)||bullEngulf;
  const quality=x.score>=3.2&&x.confidence>=.56&&x.rsi<88;
  if(safe(x)&&continuation&&momentum&&tape&&structure&&quality){
   const strength=(sh.buyer-sh.seller)/100+Math.max(0,x.accel)*.5+(greenVol?.08:0)+(bullEngulf?.08:0)+(base?.04:0),allocation=clamp(5+strength*12,4,10);
   out.push({symbol:s,action:'BUY',confidence:clamp(Math.max(x.confidence,.64+strength*.12),.60,.86),allocation_pct:+allocation.toFixed(2),reason:`OPPORTUNITY CONTINUATION: Dip-Score war fuer dieses Nicht-Dip-Setup zu streng, aber Käufertrend ist bestätigt: Käufer ${sh.buyer}% / Verkäufer ${sh.seller}%${greenVol?' · grünes Volumen führt':''}${hl?` · ${hl} höhere Tiefs`:''}${bullEngulf?' · bullisches Engulfing':''}. ${x.state}-Momentum 5m ${x.m5>=0?'+':''}${x.m5.toFixed(2)} / 20m ${x.m20>=0?'+':''}${x.m20.toFixed(2)}. Kleiner ${allocation.toFixed(1)}%-Starter; Langfristchart darf danach nur Groesse reduzieren, nicht normale News diktieren.`});notes.push(`${s} Continuation statt falschem Dip-WAIT aktiviert`);continue
  }
  out.push(a);
 }
 plan.actions=out;if(notes.length)plan.summary=`${String(plan.summary||'').slice(0,145)} · CONTINUATION: ${notes.slice(0,2).join(' · ')}.`;return{...r,response:JSON.stringify(plan)};
}

export class ContinuationOpportunityAiGuard{constructor(base){this.base=base}async run(model,input){const r=await this.base.run(model,input);return postProcess(r,input)}}
