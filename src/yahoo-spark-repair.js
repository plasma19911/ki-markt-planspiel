// Yahoo v7 spark occasionally rejects a whole multi-symbol batch with HTTP 400 when
// one symbol is problematic. Keep the Free-tier scanner useful by retrying only that
// endpoint via query2 and recursively splitting the batch. Extra real subrequests are
// capped per ~scan window so the existing Cloudflare soft cap still has hard-limit room.
const INSTALL_KEY='__kiYahooSparkRepairInstalledV1';
const STATS_KEY='__kiYahooSparkRepairStatsV1';
const WINDOW_MS=55*1000;
const MAX_EXTRA_REQUESTS=10;
const RETRY_STATUSES=new Set([400,404,422]);

const textUrl=input=>{try{return typeof input==='string'||input instanceof URL?String(input):String(input?.url||'')}catch{return''}};
const isSpark=u=>u.hostname.endsWith('finance.yahoo.com')&&u.pathname==='/v7/finance/spark';

if(!globalThis[INSTALL_KEY]){
  globalThis[INSTALL_KEY]=true;
  const nativeFetch=globalThis.fetch.bind(globalThis);
  const stats=globalThis[STATS_KEY]={windowStartedAt:Date.now(),extraRequests:0,initial400s:0,repairedBatches:0,recoveredRows:0,badSymbols:[],lastRepairAt:null,lastError:null};
  const resetWindow=()=>{if(Date.now()-stats.windowStartedAt>=WINDOW_MS){stats.windowStartedAt=Date.now();stats.extraRequests=0;stats.badSymbols=[]}};
  const reserve=()=>{resetWindow();if(stats.extraRequests>=MAX_EXTRA_REQUESTS)return false;stats.extraRequests++;return true};

  async function fetchPart(baseUrl,symbols,init){
    if(!symbols.length||!reserve())return[];
    const u=new URL(baseUrl);u.hostname='query2.finance.yahoo.com';u.searchParams.set('symbols',symbols.join(','));
    try{
      const r=await nativeFetch(u,init);
      if(r.ok){const j=await r.json();return Array.isArray(j?.spark?.result)?j.spark.result:[]}
      if(symbols.length===1){stats.badSymbols.push(symbols[0]);stats.lastError=`HTTP ${r.status} ${symbols[0]}`;return[]}
    }catch(e){if(symbols.length===1){stats.badSymbols.push(symbols[0]);stats.lastError=String(e?.message||e).slice(0,160);return[]}}
    if(symbols.length<=1)return[];
    const mid=Math.ceil(symbols.length/2),a=await fetchPart(baseUrl,symbols.slice(0,mid),init),b=await fetchPart(baseUrl,symbols.slice(mid),init);
    return [...a,...b];
  }

  globalThis.fetch=async function yahooSparkRepairFetch(input,init){
    const raw=textUrl(input);let u;try{u=new URL(raw)}catch{return nativeFetch(input,init)}
    if(!isSpark(u))return nativeFetch(input,init);
    const first=await nativeFetch(input,init);
    if(first.ok||!RETRY_STATUSES.has(first.status))return first;
    stats.initial400s++;
    const symbols=String(u.searchParams.get('symbols')||'').split(',').map(x=>x.trim()).filter(Boolean);
    if(!symbols.length)return first;
    const rows=await fetchPart(u,symbols,init);
    if(!rows.length)return first;
    stats.repairedBatches++;stats.recoveredRows+=rows.length;stats.lastRepairAt=new Date().toISOString();stats.lastError=null;
    return new Response(JSON.stringify({spark:{result:rows,error:null}}),{status:200,headers:{'content-type':'application/json','cache-control':'no-store','x-ki-yahoo-spark-repair':'1'}});
  };
}

export function yahooSparkRepairStats(){return structuredClone(globalThis[STATS_KEY]||{})}
