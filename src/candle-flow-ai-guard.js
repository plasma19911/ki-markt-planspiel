const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const key=x=>String(x?.symbol||x||'').toUpperCase();
const responseText=r=>String(r?.response||r?.result?.response||'');
const HEADERS={'accept':'application/json','user-agent':'Mozilla/5.0 (compatible; KI-Markt-Planspiel/CandleFlow)'};
const MAX_CHECKS=3;

function parsePlan(r){const raw=responseText(r),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j.actions)?j:null}catch{return null}}
function findPrompt(input){for(const m of arr(input?.messages)){const t=String(m?.content||'');if(t.includes('Kandidaten=')&&t.includes(' Gehalten='))return t}return''}
function parseBlock(text,start,end=null){const a=text.indexOf(start);if(a<0)return null;const from=a+start.length,b=end?text.indexOf(end,from):-1;try{return JSON.parse(text.slice(from,b>=0?b:text.length).trim())}catch{return null}}
function hardReason(a={}){return /(?:HARD[- ]?EXIT|EVENT[- ]?RISK|NOTAUSSTIEG|STOP[- ]?LOSS|REVERSAL\s+stark|STRONG\s+SELL)/i.test(String(a?.reason||''))}
function hardCandidate(c={}){const e=String(c?.eventRisk||c?.event_risk||'NONE').toUpperCase(),s=String(c?.momentumState||c?.momentum_state||'NORMAL').toUpperCase(),x=String(c?.momentumSellSignal||c?.momentum_sell_signal||'NONE').toUpperCase();return e==='HIGH'||s==='REVERSAL'||x==='STRONG'}

async function candleChart(symbol){
 let lastError='';
 for(const host of ['query1.finance.yahoo.com','query2.finance.yahoo.com']){
  try{
   const u=new URL(`https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}`);u.searchParams.set('range','1d');u.searchParams.set('interval','1m');u.searchParams.set('includePrePost','false');
   const r=await fetch(u,{headers:HEADERS});if(!r.ok){lastError=`HTTP ${r.status}`;continue}
   const j=await r.json(),res=j?.chart?.result?.[0];if(!res){lastError='keine Chartdaten';continue}
   const q=res?.indicators?.quote?.[0]||{},times=res?.timestamp||[],rows=[];
   for(let i=0;i<times.length;i++){
    const o=Number(q.open?.[i]),h=Number(q.high?.[i]),l=Number(q.low?.[i]),c=Number(q.close?.[i]),v=Math.max(0,num(q.volume?.[i]));
    if(![o,h,l,c].every(Number.isFinite)||o<=0||h<=0||l<=0||c<=0)continue;
    rows.push({ts:num(times[i]),o,h,l,c,v});
   }
   if(rows.length<8){lastError='zu wenige Kerzen';continue}
   const last=rows.at(-1)?.ts||num(res.meta?.regularMarketTime);if(!(last>0&&(Date.now()/1000-last)<6*60)){lastError='Kerzen nicht frisch';continue}
   return{rows:rows.slice(-16),error:null};
  }catch(e){lastError=String(e?.message||e)}
 }
 return{rows:[],error:lastError||'Kerzencheck fehlgeschlagen'};
}

function candlePressure(rows=[]){
 const a=arr(rows).slice(-12);if(a.length<6)return null;
 const vols=a.map(x=>x.v).filter(x=>x>0),vbase=vols.length?vols.reduce((s,x)=>s+x,0)/vols.length:0;
 let buy=0,sell=0,bull=0,bear=0,lowerReject=0,upperReject=0;
 for(let i=0;i<a.length;i++){
  const x=a[i],range=Math.max(1e-12,x.h-x.l),body=x.c-x.o,bodyShare=Math.min(1,Math.abs(body)/range),lower=(Math.min(x.o,x.c)-x.l)/range,upper=(x.h-Math.max(x.o,x.c))/range,volWeight=vbase>0?clamp(x.v/vbase,.35,2.4):1,recency=.55+.45*((i+1)/a.length),strength=(.28+.72*bodyShare)*volWeight*recency;
  if(body>0){buy+=strength;bull++}else if(body<0){sell+=strength;bear++}
  lowerReject+=Math.max(0,lower-upper*.35)*volWeight*recency;upperReject+=Math.max(0,upper-lower*.35)*volWeight*recency;
 }
 const total=Math.max(.0001,buy+sell),buyerShare=buy/total,sellerShare=sell/total,last3=a.slice(-3),bull3=last3.filter(x=>x.c>x.o).length,bear3=last3.filter(x=>x.c<x.o).length;
 let higherLows=0,lowerHighs=0,risingCloses=0,fallingCloses=0;for(let i=Math.max(1,a.length-5);i<a.length;i++){if(a[i].l>=a[i-1].l)higherLows++;if(a[i].h<=a[i-1].h)lowerHighs++;if(a[i].c>a[i-1].c)risingCloses++;if(a[i].c<a[i-1].c)fallingCloses++}
 const p=a.at(-2),z=a.at(-1),bullEngulf=Boolean(p&&z&&p.c<p.o&&z.c>z.o&&z.o<=p.c&&z.c>=p.o),bearEngulf=Boolean(p&&z&&p.c>p.o&&z.c<z.o&&z.o>=p.c&&z.c<=p.o);
 const first=a.slice(0,Math.floor(a.length/2)),second=a.slice(Math.floor(a.length/2));
 const redStrength=part=>part.reduce((s,x)=>{const r=Math.max(1e-12,x.h-x.l),b=Math.max(0,x.o-x.c);return s+(b/r)*(vbase>0?clamp(x.v/vbase,.35,2.4):1)},0)/Math.max(1,part.length);
 const sellEarly=redStrength(first),sellRecent=redStrength(second),sellerWeakening=sellRecent<sellEarly*.78&&higherLows>=2;
 const buyerTakeover=bullEngulf||(buyerShare>sellerShare*1.18&&bull3>=2&&risingCloses>=2)||(sellerWeakening&&bull3>=2&&lowerReject>upperReject);
 const sellerTakeover=bearEngulf||(sellerShare>buyerShare*1.18&&bear3>=2&&fallingCloses>=2)||(lowerHighs>=3&&bear3>=2&&upperReject>lowerReject);
 const structureUp=higherLows+risingCloses-lowerHighs-fallingCloses,net=buyerShare-sellerShare;
 return{buyerShare:+buyerShare.toFixed(3),sellerShare:+sellerShare.toFixed(3),net:+net.toFixed(3),bull3,bear3,higherLows,lowerHighs,risingCloses,fallingCloses,bullEngulf,bearEngulf,sellerWeakening,buyerTakeover,sellerTakeover,structureUp,lowerReject:+lowerReject.toFixed(2),upperReject:+upperReject.toFixed(2)};
}
function tape(c={}){return{day:num(c?.day,c?.day_change),m5:num(c?.intraday5m,c?.momentum5),m20:num(c?.intraday20m,c?.momentum20),accel:num(c?.momentumAcceleration5,c?.momentum_acceleration5),draw:num(c?.drawdownFrom20mHighPct,c?.drawdown_from_20m_high_pct),state:String(c?.momentumState||c?.momentum_state||'NORMAL').toUpperCase()}}
function dipContext(c={}){const x=tape(c);return x.draw<0||x.day<0||x.m20<0||/DIP|PULLBACK|REBOUND/i.test(String(c?.entryTimingBucket||c?.reason||''))}
function flowReason(f){if(!f)return'kein frischer Kerzencheck';return`Käufer ${(f.buyerShare*100).toFixed(0)}% / Verkäufer ${(f.sellerShare*100).toFixed(0)}% · letzte 3 ${f.bull3} grün/${f.bear3} rot · ${f.higherLows} höhere Tiefs/${f.lowerHighs} tiefere Hochs${f.bullEngulf?' · bullisches Engulfing':''}${f.bearEngulf?' · bärisches Engulfing':''}${f.sellerWeakening?' · Verkäuferdruck lässt nach':''}`}

async function postProcess(r,input){
 const plan=parsePlan(r),prompt=findPrompt(input);if(!plan||!prompt)return r;
 const candidates=arr(parseBlock(prompt,'Kandidaten=',' Gehalten=')||[]),held=arr(parseBlock(prompt,' Gehalten=')||[]),cMap=new Map(candidates.map(c=>[key(c),c])),hMap=new Map(held.map(h=>[key(h),h]));
 const proposed=arr(plan.actions).filter(a=>['BUY','SELL'].includes(String(a?.action||'').toUpperCase())).map(a=>key(a)).filter(Boolean),symbols=[...new Set(proposed)].slice(0,MAX_CHECKS),checks=new Map();
 await Promise.all(symbols.map(async s=>{const got=await candleChart(s);checks.set(s,{flow:candlePressure(got.rows),error:got.error})}));
 const out=[],notes=[];
 for(const a of arr(plan.actions)){
  const act=String(a?.action||'').toUpperCase(),s=key(a);if(!['BUY','SELL'].includes(act)||!checks.has(s)){out.push(a);continue}
  const c={...(cMap.get(s)||{}),...(hMap.get(s)||{})},check=checks.get(s),f=check?.flow,hard=hardReason(a)||hardCandidate(c);
  if(act==='SELL'){
   if(hard){out.push({...a,reason:`${String(a?.reason||'').slice(0,270)} · CANDLE-FLOW: harter Risikoexit; Kerzencheck darf Schutz nicht blockieren.`});continue}
   if(!f){out.push({symbol:s,action:'HOLD',confidence:clamp(num(a?.confidence,.65),.56,.82),allocation_pct:0,reason:`CANDLE-FLOW HOLD: Verkauf ohne frische Käufer-/Verkäuferkerzen wird nicht ausgeführt (${check?.error||'keine Daten'}).`});notes.push(`${s} SELL ohne Kerzendaten gestoppt`);continue}
   const x=tape(c),sellerConfirmed=f.sellerTakeover&&(f.structureUp<0||x.accel<0||['EXHAUSTION','REVERSAL'].includes(x.state));
   if(!sellerConfirmed){out.push({symbol:s,action:'HOLD',confidence:clamp(num(a?.confidence,.68),.58,.84),allocation_pct:0,reason:`CANDLE-FLOW HOLD: Käuferseite ist noch nicht sauber gebrochen. ${flowReason(f)}. Gewinn darf weiterlaufen; kein fixes Take-Profit.`});notes.push(`${s} gehalten – Käuferstruktur noch intakt`);continue}
   out.push({...a,confidence:clamp(Math.max(num(a?.confidence,.65),.70+Math.max(0,f.sellerShare-f.buyerShare)*.35),.58,.92),reason:`${String(a?.reason||'').slice(0,245)} · CANDLE-FLOW SELL: Verkäufer übernehmen die Kerzenstruktur. ${flowReason(f)}.`});continue
  }
  if(act==='BUY'){
   if(!f){out.push({symbol:s,action:'HOLD',confidence:.64,allocation_pct:0,reason:`CANDLE-FLOW WAIT: Einstieg wartet auf frische Käufer-/Verkäuferkerzen (${check?.error||'keine Daten'}).`});notes.push(`${s} BUY ohne Kerzendaten gestoppt`);continue}
   const dip=dipContext(c),x=tape(c),buyersConfirmed=f.buyerTakeover||(!f.sellerTakeover&&f.sellerWeakening&&f.net>=-.08&&x.accel>=0);
   if(!buyersConfirmed||f.sellerTakeover){out.push({symbol:s,action:'HOLD',confidence:.65,allocation_pct:0,reason:`CANDLE-FLOW DIP-WAIT: Verkäufer sind noch nicht klar verdrängt. ${flowReason(f)}. Nicht ins fallende Messer kaufen.`});notes.push(`${s} wartet auf Käuferübernahme`);continue}
   const strength=clamp(.70+Math.max(0,f.net)*.75+(f.sellerWeakening?.12:0)+(f.bullEngulf?.12:0),.70,1.10),old=Math.max(1,num(a?.allocation_pct)),scaled=dip?old*strength:old*Math.min(.65,strength*.62);
   out.push({...a,allocation_pct:+clamp(scaled,1,35).toFixed(2),confidence:clamp(Math.max(num(a?.confidence,.62),.64+Math.max(0,f.net)*.28+(f.bullEngulf?.05:0)),.58,.88),reason:`${String(a?.reason||'').slice(0,230)} · CANDLE-FLOW BUY: ${dip?'Dip mit Käuferübernahme':'kein klassischer Dip, daher kleiner'} · ${flowReason(f)}.`});continue
  }
 }
 plan.actions=out;
 if(notes.length)plan.summary=`${String(plan.summary||'').slice(0,150)} · CANDLE-FLOW: ${notes.slice(0,3).join(' · ')}.`;
 return{...r,response:JSON.stringify(plan)};
}

export class CandleFlowAiGuard{
 constructor(base){this.base=base}
 async run(model,input){const r=await this.base.run(model,input);return postProcess(r,input)}
}
