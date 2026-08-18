// Letzte, bewusst kleine Rettungsstufe hinter yahoo-spark-repair.js.
// Wenn Yahoo Spark komplett ausfaellt, werden nicht alle Symbole einzeln abgefragt:
// nur bis zu sechs Symbole des aktuellen Batches erhalten einen 5m-Chart-Fallback.
// Der Windows-PC-Agent bleibt fuer die breite Markt-Abdeckung zustaendig.
const INSTALL='__kiYahooSparkChartFallbackV1';
const STATS='__kiYahooSparkChartFallbackStatsV1';
const MAX_SYMBOLS=6;
const WINDOW_MS=55*1000;
const MAX_EXTRA=8;
const RETRY=new Set([400,404,422,429,500,502,503,504]);
const textUrl=input=>{try{return typeof input==='string'||input instanceof URL?String(input):String(input?.url||'')}catch{return''}};
const isSpark=u=>u.hostname.endsWith('finance.yahoo.com')&&u.pathname==='/v7/finance/spark';
const valid=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))&&Number(v)>0;

if(!globalThis[INSTALL]){
 globalThis[INSTALL]=true;
 const baseFetch=globalThis.fetch.bind(globalThis),stats=globalThis[STATS]={windowStartedAt:Date.now(),extraRequests:0,fallbackAttempts:0,recoveredBatches:0,recoveredSymbols:0,lastError:null,lastRecoveredAt:null};
 const reserve=()=>{if(Date.now()-stats.windowStartedAt>=WINDOW_MS){stats.windowStartedAt=Date.now();stats.extraRequests=0}if(stats.extraRequests>=MAX_EXTRA)return false;stats.extraRequests++;return true};
 async function chartRow(symbol,init){
  for(const host of ['query1.finance.yahoo.com','query2.finance.yahoo.com']){
   if(!reserve())return null;
   try{
    const u=new URL(`https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}`);u.searchParams.set('range','1d');u.searchParams.set('interval','5m');u.searchParams.set('includePrePost','false');
    const r=await baseFetch(u,init);if(!r.ok){stats.lastError=`Chart ${symbol} HTTP ${r.status}`;continue}
    const j=await r.json(),res=j?.chart?.result?.[0],q=res?.indicators?.quote?.[0]||{},close=(q.close||[]).filter(valid).map(Number);if(!res||!close.length)continue;
    const m=res.meta||{},price=valid(m.regularMarketPrice)?Number(m.regularMarketPrice):close.at(-1),previous=valid(m.previousClose)?Number(m.previousClose):valid(m.chartPreviousClose)?Number(m.chartPreviousClose):close[0];
    return{symbol,response:[{meta:{...m,symbol,regularMarketPrice:price,previousClose:previous,regularMarketTime:m.regularMarketTime||(res.timestamp||[]).at(-1)||null},indicators:{quote:[{close}]}}]};
   }catch(e){stats.lastError=String(e?.message||e).slice(0,150)}
  }
  return null;
 }
 globalThis.fetch=async function yahooSparkChartFallback(input,init){
  const raw=textUrl(input);let u;try{u=new URL(raw)}catch{return baseFetch(input,init)}
  if(!isSpark(u))return baseFetch(input,init);
  const first=await baseFetch(input,init);if(first.ok||!RETRY.has(first.status))return first;
  const symbols=String(u.searchParams.get('symbols')||'').split(',').map(x=>x.trim()).filter(Boolean).slice(0,MAX_SYMBOLS);if(!symbols.length)return first;
  stats.fallbackAttempts++;
  const rows=(await Promise.all(symbols.map(s=>chartRow(s,init)))).filter(Boolean);if(!rows.length)return first;
  stats.recoveredBatches++;stats.recoveredSymbols+=rows.length;stats.lastRecoveredAt=new Date().toISOString();stats.lastError=null;
  return new Response(JSON.stringify({spark:{result:rows,error:null}}),{status:200,headers:{'content-type':'application/json','cache-control':'no-store','x-ki-yahoo-spark-chart-fallback':'1','x-ki-yahoo-spark-chart-symbols':String(rows.length)}});
 };
}

export function yahooSparkChartFallbackStats(){return structuredClone(globalThis[STATS]||{})}
