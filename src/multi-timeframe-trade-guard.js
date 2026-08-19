const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const key=x=>String(x?.symbol||x||'').toUpperCase().trim();
const responseText=r=>String(r?.response||r?.result?.response||'');
const HEADERS={'accept':'application/json','user-agent':'Mozilla/5.0 (compatible; KI-Markt-Planspiel/MultiTimeframeV1)'};
const MAX_CONTEXT_SYMBOLS=3;

function parsePlan(r){const raw=responseText(r),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j.actions)?j:null}catch{return null}}
function findPrompt(input){for(const m of arr(input?.messages)){const t=String(m?.content||'');if(t.includes('Kandidaten=')&&t.includes(' Gehalten='))return t}return''}
function parseBlock(text,start,end=null){const a=text.indexOf(start);if(a<0)return null;const from=a+start.length,b=end?text.indexOf(end,from):-1;try{return JSON.parse(text.slice(from,b>=0?b:text.length).trim())}catch{return null}}
function avg(a=[]){return a.length?a.reduce((s,x)=>s+x,0)/a.length:0}
function ema(a,p){if(a.length<p)return null;const k=2/(p+1);let e=a.slice(0,p).reduce((x,y)=>x+y,0)/p;for(const v of a.slice(p))e=v*k+e*(1-k);return e}

async function timeframeChart(symbol,range,interval){
 let error='';
 for(const host of ['query1.finance.yahoo.com','query2.finance.yahoo.com']){
  try{
   const u=new URL(`https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}`);u.searchParams.set('range',range);u.searchParams.set('interval',interval);u.searchParams.set('includePrePost','false');
   const r=await fetch(u,{headers:HEADERS});if(!r.ok){error=`HTTP ${r.status}`;continue}
   const j=await r.json(),res=j?.chart?.result?.[0],q=res?.indicators?.quote?.[0]||{},ts=res?.timestamp||[],rows=[];
   for(let i=0;i<ts.length;i++){const c=Number(q.close?.[i]);if(!Number.isFinite(c)||c<=0)continue;const o=Number(q.open?.[i]),h=Number(q.high?.[i]),l=Number(q.low?.[i]);rows.push({ts:num(ts[i]),o:Number.isFinite(o)&&o>0?o:c,h:Number.isFinite(h)&&h>0?h:c,l:Number.isFinite(l)&&l>0?l:c,c,v:Math.max(0,num(q.volume?.[i]))})}
   if(rows.length<24){error='zu wenige Balken';continue}
   return{rows,error:null};
  }catch(e){error=String(e?.message||e)}
 }
 return{rows:[],error:error||'Chart nicht verfügbar'};
}

function structure(rows=[]){
 const a=arr(rows);if(a.length<24)return null;const closes=a.map(x=>x.c),last=a.at(-1).c,e20=ema(closes,20),e50=ema(closes,50),old20=ema(closes.slice(0,-5),20),recent=a.slice(-20),recent8=a.slice(-8),high20=Math.max(...recent.map(x=>x.h)),low20=Math.min(...recent.map(x=>x.l)),span=Math.max(1e-12,high20-low20),rangePos=clamp((last-low20)/span,0,1);
 let higherLows=0,lowerLows=0,higherHighs=0,lowerHighs=0,risingCloses=0,fallingCloses=0;for(let i=1;i<recent8.length;i++){if(recent8[i].l>=recent8[i-1].l)higherLows++;else lowerLows++;if(recent8[i].h>=recent8[i-1].h)higherHighs++;else lowerHighs++;if(recent8[i].c>=recent8[i-1].c)risingCloses++;else fallingCloses++}
 const slope=e20&&old20?(e20/old20-1):0,up=Boolean(e20&&e50&&last>=e20&&e20>=e50&&slope>=0&&higherLows>=lowerLows),down=Boolean(e20&&e50&&last<=e20&&e20<=e50&&slope<0&&lowerHighs>=higherHighs),trend=up?'UP':down?'DOWN':'MIXED';
 const supportZone=rangePos<=.34||higherLows>=5,resistanceZone=rangePos>=.78||lowerHighs>=5,base=rangePos<.55&&higherLows>=4&&risingCloses>=4,top=rangePos>.45&&lowerHighs>=4&&fallingCloses>=4;
 return{trend,rangePos:+rangePos.toFixed(3),supportZone,resistanceZone,base,top,higherLows,lowerLows,higherHighs,lowerHighs,risingCloses,fallingCloses,slope:+slope.toFixed(5),last:+last.toFixed(6)};
}
function headlineText(h){if(typeof h==='string')return h;return String(h?.title||h?.headline||h?.text||'')}
function newsContext(c={}){const event=String(c?.eventRisk||c?.event_risk||'NONE').toUpperCase(),heads=arr(c?.headlines).map(headlineText).filter(Boolean).slice(0,4),text=heads.join(' | ').toLowerCase(),score=num(c?.news,c?.newsScore),severeNegative=/(profit warning|gewinnwarnung|cuts? guidance|guidance lowered|prognose gesenkt|bankrupt|insolven|default|fraud|betrug|investigation|ermittlung|recall|rückruf|cyberattack|data breach|capital increase|kapitalerhöhung|rights issue|dilution|misses estimates|verfehlt erwartungen)/i.test(text),positive=/(raises? guidance|guidance raised|prognose angehoben|beats? estimates|übertrifft erwartungen|record orders|rekordauftrag|contract award|auftrag|approval granted|buyback|dividend increase)/i.test(text);return{event,score,heads,severeNegative,positive,hardNegative:event==='HIGH'||severeNegative}}
function contextReason(d,w,n){const pct=x=>x?`${Math.round(x.rangePos*100)}% der jüngsten Spanne`:'keine Daten';return`Tageschart ${d?.trend||'?'}, ${pct(d)}${d?.supportZone?' · nahe Unterstützung':''}${d?.resistanceZone?' · nahe Widerstand':''}; Wochenchart ${w?.trend||'?'}, ${pct(w)}${w?.supportZone?' · nahe Unterstützung':''}${w?.resistanceZone?' · nahe Widerstand':''}; News ${n.hardNegative?'negatives Warnsignal':n.positive?'positiver Katalysator':n.heads.length?'geprüft/neutral':'ohne neue harte Meldung'}`}
function hardTradeReason(a={}){return /(?:HARD|EVENT[- ]?RISK|NOTAUSSTIEG|STOP[- ]?LOSS|STRONG\s+SELL)/i.test(String(a?.reason||''))}

async function postProcess(r,input){
 const plan=parsePlan(r),prompt=findPrompt(input);if(!plan||!prompt)return r;const candidates=arr(parseBlock(prompt,'Kandidaten=',' Gehalten=')||[]),held=arr(parseBlock(prompt,' Gehalten=')||[]),map=new Map([...candidates,...held].map(x=>[key(x),x]));
 const symbols=[...new Set(arr(plan.actions).filter(a=>['BUY','SELL'].includes(String(a?.action||'').toUpperCase())).map(key).filter(Boolean))].slice(0,MAX_CONTEXT_SYMBOLS),checks=new Map();
 await Promise.all(symbols.map(async s=>{const [d,w]=await Promise.all([timeframeChart(s,'6mo','1d'),timeframeChart(s,'2y','1wk')]);checks.set(s,{daily:structure(d.rows),weekly:structure(w.rows),errors:[d.error,w.error].filter(Boolean)})}));
 const out=[],notes=[];
 for(const a of arr(plan.actions)){
  const act=String(a?.action||'').toUpperCase(),s=key(a);if(!['BUY','SELL'].includes(act)||!checks.has(s)){out.push(a);continue}const c=map.get(s)||{},x=checks.get(s),d=x.daily,w=x.weekly,n=newsContext(c),ctx=contextReason(d,w,n),hard=hardTradeReason(a)||n.event==='HIGH';
  if(act==='BUY'){
   if(n.hardNegative){out.push({symbol:s,action:'HOLD',confidence:.72,allocation_pct:0,reason:`MULTI-TIMEFRAME WAIT: optischer Dip wird wegen aktueller Unternehmens-/Event-News nicht gekauft. ${ctx}.`});notes.push(`${s} News-Risiko blockiert Dip`);continue}
   if(d&&w&&d.trend==='DOWN'&&w.trend==='DOWN'&&!d.base){out.push({symbol:s,action:'HOLD',confidence:.71,allocation_pct:0,reason:`MULTI-TIMEFRAME WAIT: Minutenboden reicht nicht, weil Tages- und Wochenstruktur weiter abwärts zeigen. ${ctx}. Erst echte übergeordnete Stabilisierung statt fallendes Messer.`});notes.push(`${s} Abwärtstrend statt sauberem Dip`);continue}
   const dipLike=/DIP|BODEN|PULLBACK|RUECKSETZER|RÜCKSETZER/i.test(String(a?.reason||'')),highContext=Boolean(d?.resistanceZone&&w?.resistanceZone&&!dipLike),weakContext=Boolean((d?.trend==='DOWN'&&w?.trend!=='UP')||d?.top);
   if(highContext){out.push({symbol:s,action:'HOLD',confidence:.68,allocation_pct:0,reason:`MULTI-TIMEFRAME WAIT: Einstieg liegt strukturell zu hoch an Tages- und Wochenwiderstand. ${ctx}. Nicht hinterherkaufen.`});notes.push(`${s} zu hoch für neuen Einstieg`);continue}
   let mult=1;if(weakContext)mult*=.55;if(d?.supportZone)mult*=1.08;if(w?.trend==='UP')mult*=1.05;if(n.positive)mult*=1.05;const allocation=clamp(num(a?.allocation_pct)*mult,0,35);
   out.push({...a,allocation_pct:+allocation.toFixed(2),reason:`${String(a?.reason||'').slice(0,190)} · MULTI-TIMEFRAME: ${ctx}. Positionsgröße an übergeordneten Kontext angepasst.`});continue
  }
  if(act==='SELL'){
   if(hard){out.push({...a,reason:`${String(a?.reason||'').slice(0,205)} · MULTI-TIMEFRAME: harter Risikoexit bleibt vorrangig. ${ctx}.`});continue}
   const sellingLow=Boolean(d?.supportZone&&w?.trend==='UP'&&!d?.top&&!n.hardNegative),sellingHigh=Boolean(d?.resistanceZone||w?.resistanceZone||d?.top);
   if(sellingLow){out.push({symbol:s,action:'HOLD',confidence:clamp(num(a?.confidence,.7),.60,.82),allocation_pct:0,reason:`MULTI-TIMEFRAME HOLD: kurzfristiger Verkäuferdruck liegt noch in einer übergeordneten Unterstützungs-/Aufwärtsstruktur. ${ctx}. Nicht tief verkaufen; erneute Verkäuferbestätigung abwarten.`});notes.push(`${s} nicht an Unterstützung verkauft`);continue}
   out.push({...a,confidence:sellingHigh?clamp(Math.max(num(a?.confidence,.7),.76),.6,.92):a.confidence,reason:`${String(a?.reason||'').slice(0,195)} · MULTI-TIMEFRAME: ${ctx}${sellingHigh?' · Ausstieg liegt strukturell eher hoch/nahe Widerstand.':''}.`});
  }
 }
 plan.actions=out;if(notes.length)plan.summary=`${String(plan.summary||'').slice(0,130)} · Tages-/Wochenchart+News: ${notes.slice(0,3).join(' · ')}.`;return{...r,response:JSON.stringify(plan)};
}

export class MultiTimeframeTradeAiGuard{constructor(base){this.base=base}async run(model,input){const r=await this.base.run(model,input);return postProcess(r,input)}}
