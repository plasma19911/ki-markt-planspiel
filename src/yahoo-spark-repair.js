// Central Yahoo transport resilience for the Worker.
// - Spark: split bad batches.
// - Quote/events: query2 then authenticated Yahoo cookie/crumb retry on 401/403.
// - Chart: shared short cache + inflight dedupe + bounded concurrency to avoid 429 storms.
// - All price arrays are sanitized so null can never become a fake zero.
const INSTALL_KEY='__kiYahooMarketRepairInstalledV4';
const STATS_KEY='__kiYahooMarketRepairStatsV4';
const WINDOW_MS=55*1000;
const MAX_EXTRA_REQUESTS=14;
const RETRY_STATUSES=new Set([400,404,422]);
const QUOTE_RETRY_STATUSES=new Set([401,403,429,500,502,503,504]);
const MISSING='__KI_MISSING_PRICE__';
const CHART_CACHE_MS=25*1000;
const CHART_ERROR_CACHE_MS=2500;
const CHART_MAX_PARALLEL=3;
const YAHOO_SESSION_MS=30*60*1000;

const textUrl=input=>{try{return typeof input==='string'||input instanceof URL?String(input):String(input?.url||'')}catch{return''}};
const isYahoo=u=>u.hostname.endsWith('finance.yahoo.com');
const isSpark=u=>isYahoo(u)&&u.pathname==='/v7/finance/spark';
const isQuote=u=>isYahoo(u)&&u.pathname==='/v7/finance/quote';
const isChart=u=>isYahoo(u)&&u.pathname.startsWith('/v8/finance/chart/');
const validPrice=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))&&Number(v)>0;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

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

function requestHeaders(input,init){
  const h=new Headers();
  try{if(input instanceof Request)for(const [k,v] of input.headers)h.set(k,v)}catch{}
  try{for(const [k,v] of new Headers(init?.headers||{}))h.set(k,v)}catch{}
  if(!h.has('accept'))h.set('accept','application/json,text/plain,*/*');
  if(!h.has('user-agent'))h.set('user-agent','Mozilla/5.0 (compatible; KI-Markt-Planspiel/YahooSession)');
  return h;
}
function responseSnapshot(r){return r.clone().arrayBuffer().then(body=>({status:r.status,statusText:r.statusText,headers:[...r.headers.entries()],body}))}
function responseFromSnapshot(x){return new Response(x.body.slice(0),{status:x.status,statusText:x.statusText,headers:x.headers})}
function canonicalChartKey(u){const x=new URL(u);x.hostname='query.yahoo.local';return x.pathname+'?'+[...x.searchParams.entries()].sort((a,b)=>a[0].localeCompare(b[0])||String(a[1]).localeCompare(String(b[1]))).map(([k,v])=>`${k}=${v}`).join('&')}

if(!globalThis[INSTALL_KEY]){
  globalThis[INSTALL_KEY]=true;
  const nativeFetch=globalThis.fetch.bind(globalThis);
  const stats=globalThis[STATS_KEY]={windowStartedAt:Date.now(),extraRequests:0,initial400s:0,repairedBatches:0,recoveredRows:0,sanitizedPriceFields:0,quoteFallbackAttempts:0,quoteFallbackRecovered:0,quoteSessionAttempts:0,quoteSessionRecovered:0,chartCacheHits:0,chartInflightHits:0,chartQueued:0,chartQuery2Recovered:0,badSymbols:[],lastRepairAt:null,lastError:null};
  const resetWindow=()=>{if(Date.now()-stats.windowStartedAt>=WINDOW_MS){stats.windowStartedAt=Date.now();stats.extraRequests=0;stats.badSymbols=[]}};
  const reserve=()=>{resetWindow();if(stats.extraRequests>=MAX_EXTRA_REQUESTS)return false;stats.extraRequests++;return true};
  let yahooSession=null,sessionPromise=null;
  const chartCache=new Map(),chartInflight=new Map(),chartQueue=[];let chartActive=0,lastChartStart=0;

  async function ensureYahooSession(){
    if(yahooSession&&Date.now()<yahooSession.expiresAt)return yahooSession;
    if(sessionPromise)return sessionPromise;
    sessionPromise=(async()=>{
      stats.quoteSessionAttempts++;
      try{
        const landing=await nativeFetch('https://fc.yahoo.com/',{redirect:'manual',headers:{'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64)','accept':'text/html,*/*'}});
        const rawCookie=landing.headers.get('set-cookie')||'';
        const cm=rawCookie.match(/(?:^|,\s*)((?:A3S?|GUC)=[^;,\s]+)/i)||rawCookie.match(/([^=;,\s]+=[^;,\s]+)/);
        const cookie=cm?.[1]||'';
        const h={'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64)','accept':'text/plain,*/*'};if(cookie)h.cookie=cookie;
        const cr=await nativeFetch('https://query1.finance.yahoo.com/v1/test/getcrumb',{headers:h});
        const crumb=cr.ok?(await cr.text()).trim():'';
        if(!crumb||crumb.length>200||crumb.includes('<'))throw new Error(`Crumb HTTP ${cr.status}`);
        yahooSession={cookie,crumb,expiresAt:Date.now()+YAHOO_SESSION_MS};stats.lastError=null;return yahooSession;
      }catch(e){stats.lastError=`Yahoo Session: ${String(e?.message||e).slice(0,140)}`;return null}
      finally{sessionPromise=null}
    })();
    return sessionPromise;
  }

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

  async function authenticatedQuoteRetry(input,init,u){
    if(!reserve())return null;
    const s=await ensureYahooSession();if(!s)return null;
    try{
      const retryUrl=new URL(u);retryUrl.hostname='query1.finance.yahoo.com';retryUrl.searchParams.set('crumb',s.crumb);
      const h=requestHeaders(input,init);if(s.cookie)h.set('cookie',s.cookie);
      const retry=await nativeFetch(retryUrl,{...init,headers:h});
      if(retry.ok){stats.quoteSessionRecovered++;stats.lastRepairAt=new Date().toISOString();stats.lastError=null;const hh=new Headers(retry.headers);hh.set('x-ki-yahoo-quote-fallback','cookie-crumb');return new Response(retry.body,{status:retry.status,statusText:retry.statusText,headers:hh})}
      if(retry.status===401||retry.status===403)yahooSession=null;
      stats.lastError=`Yahoo quote session HTTP ${retry.status}`;
    }catch(e){stats.lastError=`Yahoo quote session: ${String(e?.message||e).slice(0,130)}`}
    return null;
  }

  async function quoteFallback(input,init,u){
    const first=await nativeFetch(input,init);
    if(first.ok||!QUOTE_RETRY_STATUSES.has(first.status))return first;
    stats.quoteFallbackAttempts++;
    let second=null;
    if(reserve())try{
      const retryUrl=new URL(u);retryUrl.hostname='query2.finance.yahoo.com';
      second=await nativeFetch(retryUrl,init);
      if(second.ok){stats.quoteFallbackRecovered++;stats.lastRepairAt=new Date().toISOString();stats.lastError=null;const h=new Headers(second.headers);h.set('x-ki-yahoo-quote-fallback','query2');return new Response(second.body,{status:second.status,statusText:second.statusText,headers:h})}
    }catch(e){stats.lastError=`Yahoo quote query2: ${String(e?.message||e).slice(0,130)}`}
    if([401,403].includes(first.status)||[401,403].includes(second?.status)){const auth=await authenticatedQuoteRetry(input,init,u);if(auth)return auth}
    if(second&&!second.ok)stats.lastError=`Yahoo quote fallback HTTP ${second.status}`;
    return first;
  }

  function pumpChartQueue(){
    while(chartActive<CHART_MAX_PARALLEL&&chartQueue.length){
      const task=chartQueue.shift();chartActive++;stats.chartQueued++;
      Promise.resolve().then(async()=>{const wait=Math.max(0,55-(Date.now()-lastChartStart));if(wait)await sleep(wait);lastChartStart=Date.now();return task.fn()}).then(task.resolve,task.reject).finally(()=>{chartActive--;pumpChartQueue()});
    }
  }
  function chartGate(fn){return new Promise((resolve,reject)=>{chartQueue.push({fn,resolve,reject});pumpChartQueue()})}
  async function chartResilient(input,init,u){
    const key=canonicalChartKey(u),cached=chartCache.get(key),now=Date.now();
    if(cached&&now-cached.at<(cached.ok?CHART_CACHE_MS:CHART_ERROR_CACHE_MS)){stats.chartCacheHits++;return responseFromSnapshot(cached.snap)}
    if(chartInflight.has(key)){stats.chartInflightHits++;const snap=await chartInflight.get(key);return responseFromSnapshot(snap)}
    const work=chartGate(async()=>{
      let r=await nativeFetch(input,init);
      if(!r.ok&&[429,500,502,503,504].includes(r.status)&&u.hostname==='query1.finance.yahoo.com'&&reserve()){
        await sleep(100);const q2=new URL(u);q2.hostname='query2.finance.yahoo.com';const rr=await nativeFetch(q2,init);if(rr.ok){stats.chartQuery2Recovered++;stats.lastRepairAt=new Date().toISOString();r=rr}
      }
      const clean=await sanitizedResponse(r,{'x-ki-yahoo-chart-sanity':'1'}),n=Number(clean.headers?.get('x-ki-yahoo-price-sanitized')||0);if(n)stats.sanitizedPriceFields+=n;
      const snap=await responseSnapshot(clean);chartCache.set(key,{at:Date.now(),ok:clean.ok,snap});
      if(chartCache.size>180)for(const [k,v] of chartCache)if(Date.now()-v.at>CHART_CACHE_MS*2)chartCache.delete(k);
      return snap;
    });
    chartInflight.set(key,work);try{return responseFromSnapshot(await work)}finally{chartInflight.delete(key)}
  }

  globalThis.fetch=async function yahooMarketRepairFetch(input,init){
    const raw=textUrl(input);let u;try{u=new URL(raw)}catch{return nativeFetch(input,init)}
    if(!isSpark(u)&&!isChart(u)&&!isQuote(u))return nativeFetch(input,init);
    if(isQuote(u))return quoteFallback(input,init,u);
    if(isChart(u))return chartResilient(input,init,u);

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
