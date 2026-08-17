const HEADERS={'accept':'application/json','user-agent':'Mozilla/5.0 (compatible; KI-Markt-Planspiel/RegionalBenchmark)'};
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));

function parseJsonBetween(text,startMarker,endMarker=null){const start=text.indexOf(startMarker);if(start<0)return[];const from=start+startMarker.length,end=endMarker?text.indexOf(endMarker,from):-1;try{return JSON.parse(text.slice(from,end>=0?end:text.length).trim())}catch{return[]}}
function candidatesFromPrompt(prompt){const rows=parseJsonBetween(prompt,'Kandidaten=',' Gehalten=');return Array.isArray(rows)?rows:[]}

function regionalBenchmark(symbol){
  const s=String(symbol||'').toUpperCase();
  if(/\.(DE|F|SG|MU|HM)$/.test(s))return'^GDAXI';
  if(/\.L$/.test(s))return'^FTSE';
  if(/\.SW$/.test(s))return'^SSMI';
  if(/\.(PA|BR|MI|MC|AS|VI|HE|CO|LS|ST|OL|WA|PR)$/.test(s))return'^STOXX50E';
  if(/\.T$/.test(s))return'^N225';
  if(/\.HK$/.test(s))return'^HSI';
  if(/\.(SS|SZ)$/.test(s))return'000001.SS';
  if(/\.(KS|KQ)$/.test(s))return'^KS11';
  if(/\.(TW|TWO)$/.test(s))return'^TWII';
  if(/\.(NS|BO)$/.test(s))return'^NSEI';
  if(/\.AX$/.test(s))return'^AXJO';
  if(/\.(TO|V|NE)$/.test(s))return'^GSPTSE';
  if(/\.SA$/.test(s))return'^BVSP';
  return'SPY';
}

async function benchmarkBatch(symbols){
  const out=new Map(),unique=[...new Set(symbols.filter(Boolean))];if(!unique.length)return out;
  try{
    const u=new URL('https://query1.finance.yahoo.com/v7/finance/spark');
    u.searchParams.set('symbols',unique.join(','));u.searchParams.set('range','1d');u.searchParams.set('interval','5m');u.searchParams.set('indicators','close');u.searchParams.set('includePrePost','false');
    const r=await fetch(u,{headers:HEADERS});if(!r.ok)return out;const j=await r.json();
    for(const item of j?.spark?.result||[]){
      const res=item?.response?.[0],m=res?.meta||{},sym=String(item.symbol||m.symbol||'').toUpperCase(),cl=(res?.indicators?.quote?.[0]?.close||[]).filter(x=>Number.isFinite(Number(x))).map(Number);if(!sym||cl.length<2)continue;
      const price=num(m.regularMarketPrice,cl.at(-1)),prev=num(m.previousClose,cl[0]),back=cl[Math.max(0,cl.length-5)],lastTs=num(m.regularMarketTime,0);
      out.set(sym,{dayPct:prev?(price/prev-1)*100:0,m20Pct:back?(price/back-1)*100:0,fresh:lastTs>0&&Date.now()/1000-lastTs<35*60});
    }
  }catch{}
  return out;
}

export async function applyRegionalBenchmarkConfirmation(fast,prompt){
  if(!fast)return fast;const candidates=candidatesFromPrompt(prompt),cm=new Map(candidates.map(x=>[String(x.symbol||'').toUpperCase(),x])),symbols=(fast.context||[]).map(x=>String(x.symbol||'').toUpperCase()).filter(Boolean),benchBySymbol=new Map(symbols.map(s=>[s,regionalBenchmark(s)])),bench=await benchmarkBatch([...benchBySymbol.values()]),regional=new Map();
  for(const symbol of symbols){const c=cm.get(symbol),benchmark=benchBySymbol.get(symbol),b=bench.get(String(benchmark).toUpperCase());if(!c||!b)continue;const rel20=num(c.intraday20m)-num(b.m20Pct),relDay=num(c.day)-num(b.dayPct);regional.set(symbol,{benchmark,benchmark20m:+num(b.m20Pct).toFixed(2),benchmarkDay:+num(b.dayPct).toFixed(2),relative20m:+rel20.toFixed(2),relativeDay:+relDay.toFixed(2),fresh:Boolean(b.fresh),blockBuy:Boolean(b.fresh&&rel20<-.45&&relDay<-.70)});}
  const actions=[];for(const a of fast.actions||[]){const key=String(a.symbol||'').toUpperCase(),r=regional.get(key);if(a.action==='BUY'&&r?.blockBuy)continue;if(a.action==='BUY'&&r?.fresh&&r.relative20m>.25)actions.push({...a,confidence:clamp(num(a.confidence)+.025,.55,.92),reason:`${a.reason} · regional stärker als ${r.benchmark}`});else if(a.action==='SELL'&&r?.fresh&&r.relative20m<-.5)actions.push({...a,confidence:clamp(num(a.confidence)+.03,.56,.96),reason:`${a.reason} · regional schwächer als ${r.benchmark}`});else actions.push(a)}
  const context=(fast.context||[]).map(c=>{const r=regional.get(String(c.symbol||'').toUpperCase());return r?{...c,regionalBenchmark:r}:c});
  return{...fast,actions,context,regionalBenchmark:{enabled:true,results:Object.fromEntries(regional),blockedBuys:[...regional].filter(([,v])=>v.blockBuy).map(([k])=>k)}};
}
