// Yahoo v7 spark occasionally rejects a whole multi-symbol batch with HTTP 400 when
// one symbol is problematic. Keep the Free-tier scanner useful by retrying only that
// endpoint via query2 and recursively splitting the batch. The same fetch shim also
// sanitizes Yahoo chart/spark null prices so Number(null) can never become a fake 0
// and later create Infinity/NaN momentum.
const INSTALL_KEY='__kiYahooSparkRepairInstalledV2';
const STATS_KEY='__kiYahooSparkRepairStatsV2';
const WINDOW_MS=55*1000;
const MAX_EXTRA_REQUESTS=10;
const RETRY_STATUSES=new Set([400,404,422]);
const MISSING='__KI_MISSING_PRICE__';

const textUrl=input=>{try{return typeof input==='string'||input instanceof URL?String(input):String(input?.url||'')}catch{return''}};
const isYahoo=u=>u.hostname.endsWith('finance.yahoo.com');
const isSpark=u=>isYahoo(u)&&u.pathname==='/v7/finance/spark';
const isChart=u=>isYahoo(u)&&u.pathname.startsWith('/v8/finance/chart/');
const validPrice=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))&&Number(v)>0;

function sanitizeResponseObject(j){
  let sanitized=0;
  const cleanResult=res=>{
    if(!res||typeof res!=='object')return;
    const q=res?.indicators?.quote?.[0];
    if(q&&typeof q==='object'){
      for(const field of ['open','high','low','close'])if(Array.isArray(q[field]))q[field]=q[field].map(v=>{if(validPrice(v))return v;sanitized++;return MISSING});
    }
    const m=res.meta;if(m&&typeof m==='object')for(const field of ['regularMarketPrice','previousClose','chartPreviousClose'])if(field in m&&!validPrice(m[field])){m[field]=MISSING;sanitized++}
  };
  for(const item of j?.spark?.result||[])for(const res of item?.response||[])cleanResult(res);
  for(const res of j?.chart?.result||[])cleanResult(res);
  return{json:j,sanitized};
}

async function sanitizedResponse(r,extraHeaders={}){
  if(!r?.ok)return r;
  try{
    const probe=r.clone(),parsed=sanitizeResponseObject(await probe.json());
    const h=new Headers(r.headers);h.delete('content-length');h.delete('content-encoding');h.set('content-type','application/json; charset=utf-8');
    for(const [k,v] of Object.entries(extraHeaders))h.set(k,v);
    if(parsed.sanitized)h.set('x-ki-yahoo-price-sanitized',String(parsed.sanitized));
    return new Response(JSON.stringify(parsed.json),{status:r.status,statusText:r.statusText,headers:h});
  }catch{return r}
}

if(!globalThis[INSTALL_KEY]){
  globalThis[INSTALL_KEY]=true;
  const nativeFetch=globalThis.fetch.bind(globalThis);
  const stats=globalThis[STATS_KEY]={windowStartedAt:Date.now(),extraRequests:0,initial400s:0,repairedBatches:0,recoveredRows:0,sanitizedPriceFields:0,badSymbols:[],lastRepairAt:null,lastError:null};
  const resetWindow=()=>{if(Date.now()-stats.windowStartedAt>=WINDOW_MS){stats.windowStartedAt=Date.now();stats.extraRequests=0;stats.badSymbols=[]}};
  const reserve=()=>{resetWindow();if(stats.extraRequests>=MAX_EXTRA_REQUESTS)return false;stats.extraRequests++;return true};

  async function fetchPart(baseUrl,symbols,init){
    if(!symbols.length||!reserve())return[];
    const u=new URL(baseUrl);u.hostname='query2.finance.yahoo.com';u.searchParams.set('symbols',symbols.join(','));
    try{
      const r=await nativeFetch(u,init);
      if(r.ok){const j=await r.json(),parsed=sanitizeResponseObject(j);stats.sanitizedPriceFields+=parsed.sanitized;return Array.isArray(parsed.json?.spark?.result)?parsed.json.spark.result:[]}
      if(symbols.length===1){stats.badSymbols.push(symbols[0]);stats.lastError=`HTTP ${r.status} ${symbols[0]}`;return[]}
    }catch(e){if(symbols.length===1){stats.badSymbols.push(symbols[0]);stats.lastError=String(e?.message||e).slice(0,160);return[]}}
    if(symbols.length<=1)return[];
    const mid=Math.ceil(symbols.length/2),a=await fetchPart(baseUrl,symbols.slice(0,mid),init),b=await fetchPart(baseUrl,symbols.slice(mid),init);
    return [...a,...b];
  }

  globalThis.fetch=async function yahooMarketRepairFetch(input,init){
    const raw=textUrl(input);let u;try{u=new URL(raw)}catch{return nativeFetch(input,init)}
    if(!isSpark(u)&&!isChart(u))return nativeFetch(input,init);

    if(isChart(u)){
      const r=await nativeFetch(input,init);
      const clean=await sanitizedResponse(r,{'x-ki-yahoo-chart-sanity':'1'});
      const n=Number(clean.headers?.get('x-ki-yahoo-price-sanitized')||0);if(n)stats.sanitizedPriceFields+=n;
      return clean;
    }

    const first=await nativeFetch(input,init);
    if(first.ok){
      const clean=await sanitizedResponse(first,{'x-ki-yahoo-spark-sanity':'1'});
      const n=Number(clean.headers?.get('x-ki-yahoo-price-sanitized')||0);if(n)stats.sanitizedPriceFields+=n;
      return clean;
    }
    if(!RETRY_STATUSES.has(first.status))return first;
    stats.initial400s++;
    const symbols=String(u.searchParams.get('symbols')||'').split(',').map(x=>x.trim()).filter(Boolean);
    if(!symbols.length)return first;
    const rows=await fetchPart(u,symbols,init);
    if(!rows.length)return first;
    stats.repairedBatches++;stats.recoveredRows+=rows.length;stats.lastRepairAt=new Date().toISOString();stats.lastError=null;
    const parsed=sanitizeResponseObject({spark:{result:rows,error:null}});stats.sanitizedPriceFields+=parsed.sanitized;
    return new Response(JSON.stringify(parsed.json),{status:200,headers:{'content-type':'application/json','cache-control':'no-store','x-ki-yahoo-spark-repair':'1','x-ki-yahoo-price-sanitized':String(parsed.sanitized)}});
  };
}

export function yahooSparkRepairStats(){return structuredClone(globalThis[STATS_KEY]||{})}
