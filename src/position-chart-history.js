const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const key=v=>String(v||'').toUpperCase().trim();
const BUY=new Set(['KAUF','BUY']),SELL=new Set(['VERKAUF','SELL']);
const isTrade=x=>BUY.has(String(x?.action||'').toUpperCase())||SELL.has(String(x?.action||'').toUpperCase());

function eventWindow(events,pos){
 const times=events.map(x=>Date.parse(String(x?.ts||''))).filter(Number.isFinite),opened=Date.parse(String(pos?.opened_at||''));if(Number.isFinite(opened))times.push(opened);
 if(!times.length)return null;const first=Math.min(...times),last=pos?Date.now():Math.max(...times),padBefore=6*3600*1000,padAfter=pos?30*60*1000:6*3600*1000;return{from:first-padBefore,to:last+padAfter};
}
function tradeInterval(ms){const days=ms/86400000;if(days<=7)return'5m';if(days<=31)return'15m';if(days<=180)return'60m';return'1d'}
function directEventPrice(x){const p=Number(x?.execution_price??x?.price);return Number.isFinite(p)&&p>0?p:null}

export async function positionChartHistoryData(p,u){
 const symbol=key(u.searchParams.get('symbol'));if(!symbol||symbol.length>32)return{error:'Ungültiges Aktiensymbol.',status:400};
 const raw=String(u.searchParams.get('range')||'trade'),range=['trade','1d','5d','1mo'].includes(raw)?raw:'trade';
 const s=await p.status(),positions=s?.positions||[],history=s?.history||[],pos=positions.find(x=>key(x?.symbol)===symbol)||null,events=history.filter(x=>key(x?.symbol)===symbol&&isTrade(x)).sort((a,b)=>Date.parse(a.ts)-Date.parse(b.ts));
 // Der historische Trade-Bereich braucht einen Trade. Reine Kursbereiche dürfen dagegen
 // jede valide News-/Scanner-Aktie öffnen, auch wenn sie noch nie im Depot lag.
 if(range==='trade'&&!pos&&!events.length)return{error:'Dieses Symbol wurde im Planspiel noch nicht gehandelt.',status:404};
 const q=new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);let interval='5m',window=null;
 if(range==='trade'){
  window=eventWindow(events,pos);if(!window)return{error:'Kein Trade-Zeitraum verfügbar.',status:404};interval=tradeInterval(window.to-window.from);q.searchParams.set('period1',String(Math.floor(window.from/1000)));q.searchParams.set('period2',String(Math.floor(window.to/1000)));
 }else{interval=range==='1d'?'5m':range==='5d'?'15m':'60m';q.searchParams.set('range',range)}
 q.searchParams.set('interval',interval);q.searchParams.set('includePrePost','false');q.searchParams.set('events','div,splits');
 let r=await fetch(q,{headers:{accept:'application/json','user-agent':'Mozilla/5.0 (compatible; KI-Markt-Planspiel/TradeHistoryChart)'}});if(!r.ok){const q2=new URL(q);q2.hostname='query2.finance.yahoo.com';r=await fetch(q2,{headers:{accept:'application/json','user-agent':'Mozilla/5.0 (compatible; KI-Markt-Planspiel/TradeHistoryChart)'}})}
 if(!r.ok)return{error:`Kurschart derzeit nicht verfügbar (HTTP ${r.status}).`,status:502};const j=await r.json(),res=j?.chart?.result?.[0];if(!res)return{error:'Kurschart enthält keine Daten.',status:502};
 const ts=res.timestamp||[],quote=res?.indicators?.quote?.[0]||{},close=quote.close||[],bars=[];for(let i=0;i<ts.length;i++){const c=Number(close[i]);if(Number.isFinite(c)&&c>0)bars.push({ts:Number(ts[i])*1000,close:c})}if(!bars.length)return{error:'Für den gewählten Zeitraum liegen keine Kursbalken vor.',status:502};
 const name=pos?.name||events.find(x=>x?.name)?.name||res?.meta?.longName||res?.meta?.shortName||symbol,entryPrice=Number(pos?.entry_price||0),openedAt=pos?.opened_at||events.find(x=>BUY.has(String(x?.action||'').toUpperCase()))?.ts||null;
 const normalizedEvents=events.map(x=>({ts:x.ts,action:BUY.has(String(x?.action||'').toUpperCase())?'KAUF':'VERKAUF',price:directEventPrice(x),amount:Number(x?.amount||0),reason:String(x?.reason||'').slice(0,260)})).filter(x=>x.ts);
 if(pos&&openedAt&&entryPrice>0&&!normalizedEvents.some(x=>x.action==='KAUF'&&Math.abs(Date.parse(x.ts)-Date.parse(openedAt))<10*60*1000))normalizedEvents.push({ts:openedAt,action:'KAUF',price:entryPrice,amount:Number(pos?.invested||0),reason:'Aktueller Einstieg'});normalizedEvents.sort((a,b)=>Date.parse(a.ts)-Date.parse(b.ts));
 return{ok:true,symbol,name,range,interval,bars,events:normalizedEvents,tradeWindow:window?{from:new Date(window.from).toISOString(),to:new Date(window.to).toISOString()}:null,position:pos?{open:true,entryPrice,openedAt,invested:Number(pos?.invested||0),lastPrice:Number(pos?.last_price||res?.meta?.regularMarketPrice||bars.at(-1)?.close||0)}:{open:false,entryPrice:0,openedAt:null,invested:0,lastPrice:Number(res?.meta?.regularMarketPrice||bars.at(-1)?.close||0)},currency:res?.meta?.currency||pos?.currency||null,exchange:res?.meta?.exchangeName||null};
}
