const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const key=x=>String(x?.symbol||x||'').toUpperCase();
const responseText=r=>String(r?.response||r?.result?.response||'');
const HEADERS={'accept':'application/json','user-agent':'Mozilla/5.0 (compatible; KI-Markt-Planspiel/CandleFlowV2)'};
const MAX_CHECKS=5;

function parsePlan(r){const raw=responseText(r),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j.actions)?j:null}catch{return null}}
function findPrompt(input){for(const m of arr(input?.messages)){const t=String(m?.content||'');if(t.includes('Kandidaten=')&&t.includes(' Gehalten='))return t}return''}
function parseBlock(text,start,end=null){const a=text.indexOf(start);if(a<0)return null;const from=a+start.length,b=end?text.indexOf(end,from):-1;try{return JSON.parse(text.slice(from,b>=0?b:text.length).trim())}catch{return null}}
function hardReason(a={}){return /(?:HARD[- ]?EXIT|EVENT[- ]?RISK|NOTAUSSTIEG|STOP[- ]?LOSS|REVERSAL\s+stark|STRONG\s+SELL)/i.test(String(a?.reason||''))}
function hardCandidate(c={}){const e=String(c?.eventRisk||c?.event_risk||'NONE').toUpperCase(),s=String(c?.momentumState||c?.momentum_state||'NORMAL').toUpperCase(),x=String(c?.momentumSellSignal||c?.momentum_sell_signal||'NONE').toUpperCase();return e==='HIGH'||s==='REVERSAL'||x==='STRONG'}
function avg(a=[]){return a.length?a.reduce((s,x)=>s+x,0)/a.length:0}

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
   if(rows.length<10){lastError='zu wenige Kerzen';continue}
   const last=rows.at(-1)?.ts||num(res.meta?.regularMarketTime);if(!(last>0&&(Date.now()/1000-last)<6*60)){lastError='Kerzen nicht frisch';continue}
   return{rows:rows.slice(-24),error:null};
  }catch(e){lastError=String(e?.message||e)}
 }
 return{rows:[],error:lastError||'Kerzencheck fehlgeschlagen'};
}

function candlePressure(rows=[]){
 const a=arr(rows).slice(-16);if(a.length<8)return null;
 const vols=a.map(x=>x.v).filter(x=>x>0),vbase=avg(vols)||1;
 let buy=0,sell=0,lowerReject=0,upperReject=0;const greenVol=[],redVol=[];
 for(let i=0;i<a.length;i++){
  const x=a[i],range=Math.max(1e-12,x.h-x.l),body=x.c-x.o,bodyShare=Math.min(1,Math.abs(body)/range),lower=(Math.min(x.o,x.c)-x.l)/range,upper=(x.h-Math.max(x.o,x.c))/range,volWeight=clamp(x.v/vbase,.30,2.6),recency=.48+.52*((i+1)/a.length),strength=(.24+.76*bodyShare)*volWeight*recency;
  if(body>0){buy+=strength;greenVol.push(x.v)}else if(body<0){sell+=strength;redVol.push(x.v)}
  lowerReject+=Math.max(0,lower-upper*.30)*volWeight*recency;upperReject+=Math.max(0,upper-lower*.30)*volWeight*recency;
 }
 const total=Math.max(.0001,buy+sell),buyerShare=buy/total,sellerShare=sell/total,last3=a.slice(-3),last5=a.slice(-5),bull3=last3.filter(x=>x.c>x.o).length,bear3=last3.filter(x=>x.c<x.o).length;
 let higherLows=0,lowerHighs=0,risingCloses=0,fallingCloses=0;
 for(let i=Math.max(1,a.length-6);i<a.length;i++){if(a[i].l>=a[i-1].l)higherLows++;if(a[i].h<=a[i-1].h)lowerHighs++;if(a[i].c>a[i-1].c)risingCloses++;if(a[i].c<a[i-1].c)fallingCloses++}
 const p=a.at(-2),z=a.at(-1),bullEngulf=Boolean(p&&z&&p.c<p.o&&z.c>z.o&&z.o<=p.c&&z.c>=p.o),bearEngulf=Boolean(p&&z&&p.c>p.o&&z.c<z.o&&z.o>=p.c&&z.c<=p.o);
 const half=Math.floor(a.length/2),first=a.slice(0,half),second=a.slice(half);
 const redStrength=part=>avg(part.map(x=>{const r=Math.max(1e-12,x.h-x.l);return Math.max(0,x.o-x.c)/r*clamp(x.v/vbase,.30,2.6)}));
 const greenStrength=part=>avg(part.map(x=>{const r=Math.max(1e-12,x.h-x.l);return Math.max(0,x.c-x.o)/r*clamp(x.v/vbase,.30,2.6)}));
 const sellEarly=redStrength(first),sellRecent=redStrength(second),buyEarly=greenStrength(first),buyRecent=greenStrength(second),sellerWeakening=sellRecent<sellEarly*.82&&higherLows>=2,buyerWeakening=buyRecent<buyEarly*.82&&lowerHighs>=2;
 const recentGreenVol=avg(last5.filter(x=>x.c>x.o).map(x=>x.v)),recentRedVol=avg(last5.filter(x=>x.c<x.o).map(x=>x.v)),greenVolumeLead=recentGreenVol>0&&recentGreenVol>=recentRedVol*1.08,redVolumeLead=recentRedVol>0&&recentRedVol>=recentGreenVol*1.08;
 const lows=a.map(x=>x.l),highs=a.map(x=>x.h),low=Math.min(...lows),high=Math.max(...highs),lowIndex=lows.indexOf(low),highIndex=highs.indexOf(high),lastClose=a.at(-1).c,range=Math.max(1e-12,high-low),recovery=(lastClose-low)/range,retraceFromHigh=(high-lastClose)/range;
 const baseFormed=lowIndex<a.length-1&&recovery>.18&&higherLows>=2&&(risingCloses>=2||bull3>=2),topFormed=highIndex<a.length-1&&retraceFromHigh>.18&&lowerHighs>=2&&(fallingCloses>=2||bear3>=2);
 const buyerAbsorption=lowerReject>upperReject*1.15&&sellerWeakening,buyerTakeover=bullEngulf||(buyerShare>sellerShare*1.15&&bull3>=2&&risingCloses>=2)||(sellerWeakening&&bull3>=2&&lowerReject>upperReject)||(baseFormed&&greenVolumeLead&&!redVolumeLead);
 const sellerTakeover=bearEngulf||(sellerShare>buyerShare*1.15&&bear3>=2&&fallingCloses>=2)||(buyerWeakening&&bear3>=2&&upperReject>lowerReject)||(topFormed&&redVolumeLead&&!greenVolumeLead);
 const structureUp=higherLows+risingCloses-lowerHighs-fallingCloses,net=buyerShare-sellerShare;
 const dipQuality=(sellerWeakening?2:0)+(buyerTakeover?2.4:0)+(baseFormed?1.4:0)+(buyerAbsorption?1.2:0)+(bullEngulf?1.2:0)+(greenVolumeLead?.9:0)+Math.min(1.5,higherLows*.3)+Math.min(1.2,risingCloses*.24)-Math.min(1.5,lowerHighs*.3)-(sellerTakeover?3.5:0);
 const exitQuality=(buyerWeakening?1.7:0)+(sellerTakeover?2.5:0)+(topFormed?1.3:0)+(bearEngulf?1.2:0)+(redVolumeLead?.9:0)+Math.min(1.5,lowerHighs*.3)+Math.min(1.2,fallingCloses*.24)-Math.min(1.2,higherLows*.24)-(buyerTakeover?2.2:0);
 return{buyerShare:+buyerShare.toFixed(3),sellerShare:+sellerShare.toFixed(3),net:+net.toFixed(3),bull3,bear3,higherLows,lowerHighs,risingCloses,fallingCloses,bullEngulf,bearEngulf,sellerWeakening,buyerWeakening,buyerAbsorption,buyerTakeover,sellerTakeover,baseFormed,topFormed,greenVolumeLead,redVolumeLead,structureUp,dipQuality:+dipQuality.toFixed(2),exitQuality:+exitQuality.toFixed(2),lowerReject:+lowerReject.toFixed(2),upperReject:+upperReject.toFixed(2)};
}
function tape(c={}){return{day:num(c?.day,c?.day_change),m5:num(c?.intraday5m,c?.momentum5),m20:num(c?.intraday20m,c?.momentum20),accel:num(c?.momentumAcceleration5,c?.momentum_acceleration5),draw:num(c?.drawdownFrom20mHighPct,c?.drawdown_from_20m_high_pct),state:String(c?.momentumState||c?.momentum_state||'NORMAL').toUpperCase(),sell:String(c?.momentumSellSignal||c?.momentum_sell_signal||'NONE').toUpperCase(),score:num(c?.liveScore,c?.score)}}
function dipContext(c={}){const x=tape(c);return x.draw<0||x.day<0||x.m20<0||/DIP|PULLBACK|REBOUND/i.test(String(c?.entryTimingBucket||c?.reason||''))}
function sellRisk(c={}){const x=tape(c);return (x.state==='REVERSAL'?5:0)+(x.state==='EXHAUSTION'?3:0)+(x.sell==='STRONG'?5:0)+(x.m5<0?1:0)+(x.m20<0?1:0)+(x.accel<0?1.4:0)+(x.score<0?1:0)+Math.max(0,-x.draw)*.15}
function flowReason(f){if(!f)return'kein frischer Kerzencheck';return`Käufer ${(f.buyerShare*100).toFixed(0)}% / Verkäufer ${(f.sellerShare*100).toFixed(0)}% · letzte 3 ${f.bull3} grün/${f.bear3} rot · ${f.higherLows} höhere Tiefs/${f.lowerHighs} tiefere Hochs${f.baseFormed?' · Bodenbildung':''}${f.topFormed?' · Topbildung':''}${f.bullEngulf?' · bullisches Engulfing':''}${f.bearEngulf?' · bärisches Engulfing':''}${f.sellerWeakening?' · Verkäuferdruck lässt nach':''}${f.greenVolumeLead?' · grünes Volumen führt':''}`}

async function postProcess(r,input){
 const plan=parsePlan(r),prompt=findPrompt(input);if(!plan||!prompt)return r;
 const candidates=arr(parseBlock(prompt,'Kandidaten=',' Gehalten=')||[]),held=arr(parseBlock(prompt,' Gehalten=')||[]),cMap=new Map(candidates.map(c=>[key(c),c])),hMap=new Map(held.map(h=>[key(h),h]));
 const planned=arr(plan.actions).filter(a=>['BUY','SELL'].includes(String(a?.action||'').toUpperCase())).map(a=>key(a)).filter(Boolean),plannedSet=new Set(planned),riskHeld=held.filter(h=>!plannedSet.has(key(h))).sort((a,b)=>sellRisk(b)-sellRisk(a)).slice(0,2).map(key),symbols=[...new Set([...planned,...riskHeld])].slice(0,MAX_CHECKS),checks=new Map();
 await Promise.all(symbols.map(async s=>{const got=await candleChart(s);checks.set(s,{flow:candlePressure(got.rows),error:got.error})}));
 const out=[],notes=[],actionSymbols=new Set();
 for(const a of arr(plan.actions)){
  const act=String(a?.action||'').toUpperCase(),s=key(a);actionSymbols.add(s);if(!['BUY','SELL'].includes(act)||!checks.has(s)){out.push(a);continue}
  const c={...(cMap.get(s)||{}),...(hMap.get(s)||{})},check=checks.get(s),f=check?.flow,hard=hardReason(a)||hardCandidate(c);
  if(act==='SELL'){
   if(hard){out.push({...a,reason:`${String(a?.reason||'').slice(0,270)} · CANDLE-FLOW V2: harter Risikoexit; keine Minutenregel.`});continue}
   if(!f){out.push({symbol:s,action:'HOLD',confidence:clamp(num(a?.confidence,.65),.56,.82),allocation_pct:0,reason:`CANDLE-FLOW HOLD: Verkauf ohne frische Käufer-/Verkäuferkerzen wird nicht ausgeführt (${check?.error||'keine Daten'}).`});notes.push(`${s} SELL ohne Kerzendaten gestoppt`);continue}
   const x=tape(c),sellerConfirmed=f.sellerTakeover&&f.exitQuality>2.2&&(f.structureUp<0||x.accel<0||['EXHAUSTION','REVERSAL'].includes(x.state));
   if(!sellerConfirmed){out.push({symbol:s,action:'HOLD',confidence:clamp(num(a?.confidence,.68),.58,.84),allocation_pct:0,reason:`CANDLE-FLOW HOLD: Verkäufer haben die Struktur noch nicht überzeugend übernommen. ${flowReason(f)} · Exit-Qualität ${f.exitQuality.toFixed(1)}. Keine Haltedauer-/Minutenregel.`});notes.push(`${s} gehalten – Käuferstruktur noch nicht gebrochen`);continue}
   out.push({...a,confidence:clamp(Math.max(num(a?.confidence,.65),.70+Math.max(0,f.sellerShare-f.buyerShare)*.35),.58,.92),reason:`${String(a?.reason||'').slice(0,230)} · CANDLE-FLOW SELL: Verkäuferstruktur bestätigt, Exit-Qualität ${f.exitQuality.toFixed(1)}. ${flowReason(f)} · Haltedauer irrelevant.`});continue
  }
  if(act==='BUY'){
   if(!f){out.push({symbol:s,action:'HOLD',confidence:.64,allocation_pct:0,reason:`CANDLE-FLOW WAIT: Einstieg wartet auf frische Käufer-/Verkäuferkerzen (${check?.error||'keine Daten'}).`});notes.push(`${s} BUY ohne Kerzendaten gestoppt`);continue}
   const dip=dipContext(c),x=tape(c),buyersConfirmed=f.buyerTakeover&&!f.sellerTakeover&&f.dipQuality>1.9,earlyAbsorption=dip&&f.sellerWeakening&&f.buyerAbsorption&&f.dipQuality>1.3&&x.accel>=0;
   if(!(buyersConfirmed||earlyAbsorption)){out.push({symbol:s,action:'HOLD',confidence:.65,allocation_pct:0,reason:`CANDLE-FLOW DIP-WAIT: Boden noch nicht gut genug bestätigt. ${flowReason(f)} · Dip-Qualität ${f.dipQuality.toFixed(1)}. Nicht nur wegen gefallenem Kurs kaufen.`});notes.push(`${s} wartet auf bessere Bodenbildung`);continue}
   const strength=clamp(.62+Math.max(0,f.net)*.75+Math.max(0,f.dipQuality)*.055+(f.sellerWeakening?.10:0)+(f.bullEngulf?.10:0),.58,1.12),old=Math.max(1,num(a?.allocation_pct)),scaled=dip?old*strength:old*Math.min(.55,strength*.55);
   out.push({...a,allocation_pct:+clamp(scaled,1,35).toFixed(2),confidence:clamp(Math.max(num(a?.confidence,.62),.62+Math.max(0,f.net)*.28+Math.max(0,f.dipQuality)*.018),.58,.89),reason:`${String(a?.reason||'').slice(0,205)} · CANDLE-FLOW BUY: ${dip?'Dip/Boden mit Käuferübernahme':'kein klassischer Dip, deshalb klein'} · Dip-Qualität ${f.dipQuality.toFixed(1)} · ${flowReason(f)}.`});continue
  }
 }
 // Proaktiver SELL ohne Minutenlogik: auch wenn ein innerer Optimizer wegen einer alten
 // Haltedauerregel keinen SELL vorgeschlagen hat, darf eine klare Verkäuferübernahme
 // den Ausstieg ausloesen. Maximal zwei schwache gehaltene Positionen werden dafuer geprueft.
 for(const s of riskHeld){
  if(actionSymbols.has(s))continue;const h=hMap.get(s)||{},f=checks.get(s)?.flow,x=tape(h);if(!f)continue;
  const hard=hardCandidate(h),confirmed=f.sellerTakeover&&f.exitQuality>3.2&&(f.structureUp<0||x.accel<0||x.state==='EXHAUSTION');
  if(hard||confirmed){out.push({symbol:s,action:'SELL',confidence:hard?.88:clamp(.70+Math.max(0,f.sellerShare-f.buyerShare)*.35,.70,.91),allocation_pct:0,reason:hard?`CANDLE-FLOW PROACTIVE HARD-SELL: harter Risiko-/Reversalzustand; Haltedauer irrelevant.`:`CANDLE-FLOW PROACTIVE SELL: Verkäufer übernehmen unabhängig von der Haltedauer · Exit-Qualität ${f.exitQuality.toFixed(1)} · ${flowReason(f)}.`});notes.push(`${s} proaktiv wegen Verkäuferstruktur zum SELL`)}
 }
 plan.actions=out;
 if(notes.length)plan.summary=`${String(plan.summary||'').slice(0,145)} · CANDLE-FLOW V2: ${notes.slice(0,3).join(' · ')}. Keine Minutenregel fuer SELL.`;
 return{...r,response:JSON.stringify(plan)};
}

export class CandleFlowAiGuard{constructor(base){this.base=base}async run(model,input){const r=await this.base.run(model,input);return postProcess(r,input)}}
