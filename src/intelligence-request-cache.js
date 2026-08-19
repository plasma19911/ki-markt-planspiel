// Short-lived in-isolate intelligence cache. Fast price decisions stay fresh; slowly
// changing context (RSS, event calendar, daily/weekly charts) is reused across minute
// scans so the Worker does not waste its external-request budget fetching identical data.
const INSTALL_KEY='__kiIntelligenceRequestCacheV2';
const STATS_KEY='__kiIntelligenceRequestCacheStatsV2';
const MAX_ITEMS=260;
const cache=new Map(),inflight=new Map();
const textUrl=input=>{try{return typeof input==='string'||input instanceof URL?String(input):String(input?.url||'')}catch{return''}};
const snapshot=async r=>({status:r.status,statusText:r.statusText,headers:[...r.headers.entries()],body:await r.clone().arrayBuffer()});
const restore=x=>new Response(x.body.slice(0),{status:x.status,statusText:x.statusText,headers:x.headers});
function ttlFor(u){
 const h=u.hostname,p=u.pathname,interval=u.searchParams.get('interval')||'';
 if(h==='feeds.finance.yahoo.com'&&p.includes('/rss/'))return 90*1000;
 if(h==='news.google.com'&&p.includes('/rss/'))return 150*1000;
 if(h==='api.boerse-frankfurt.de'&&p.includes('/feeds/'))return 180*1000;
 if(h.includes('finanznachrichten.de')&&p.includes('/rss'))return 180*1000;
 if(h.includes('wallstreet-online.de')&&p.includes('/rss'))return 180*1000;
 if(h==='www.boersennews.de'&&p==='/service/news.rss')return 180*1000;
 if(h==='www.tagesschau.de'&&p.endsWith('rss2.xml'))return 180*1000;
 if(h==='api.nasdaq.com'&&p==='/api/calendar/earnings')return 60*60*1000;
 if(h.endsWith('finance.yahoo.com')&&p.startsWith('/v8/finance/chart/')&&interval==='1m')return 45*1000;
 if(h.endsWith('finance.yahoo.com')&&p.startsWith('/v8/finance/chart/')&&['1d','1wk','1mo'].includes(interval))return 4*60*1000;
 return 0;
}
function cacheKey(u){const x=new URL(u);x.hostname='yahoo-chart-cache.local';return x.pathname+'?'+[...x.searchParams.entries()].sort((a,b)=>a[0].localeCompare(b[0])||String(a[1]).localeCompare(String(b[1]))).map(([k,v])=>`${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')}
function prune(){if(cache.size<=MAX_ITEMS)return;const now=Date.now();for(const[k,v]of cache)if(now>v.expiresAt)cache.delete(k);while(cache.size>MAX_ITEMS){const k=cache.keys().next().value;if(k==null)break;cache.delete(k)}}
if(!globalThis[INSTALL_KEY]){
 globalThis[INSTALL_KEY]=true;
 const nativeFetch=globalThis.fetch.bind(globalThis);
 const stats=globalThis[STATS_KEY]={hits:0,inflightHits:0,misses:0,stored:0,staleRemoved:0,lastHitAt:null,lastStoreAt:null,oneMinuteTtlSeconds:45};
 globalThis.fetch=async function intelligenceRequestCacheFetch(input,init){
  if(String(init?.method||'GET').toUpperCase()!=='GET')return nativeFetch(input,init);
  let u;try{u=new URL(textUrl(input))}catch{return nativeFetch(input,init)}const ttl=ttlFor(u);if(!ttl)return nativeFetch(input,init);
  const k=cacheKey(u),now=Date.now(),old=cache.get(k);if(old&&now<old.expiresAt){stats.hits++;stats.lastHitAt=new Date().toISOString();return restore(old.snap)}if(old){cache.delete(k);stats.staleRemoved++}
  if(inflight.has(k)){stats.inflightHits++;return restore(await inflight.get(k))}
  stats.misses++;
  const work=(async()=>{const r=await nativeFetch(input,init),snap=await snapshot(r);if(r.ok){cache.set(k,{expiresAt:Date.now()+ttl,snap});stats.stored++;stats.lastStoreAt=new Date().toISOString();prune()}return snap})();
  inflight.set(k,work);try{return restore(await work)}finally{inflight.delete(k)}
 };
}
export function intelligenceRequestCacheStats(){return structuredClone(globalThis[STATS_KEY]||{})}
