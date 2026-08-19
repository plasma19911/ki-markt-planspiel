// Public RSS resilience. BörsenNews' old /service/news.rss currently returns errors.
// Use finanzen.net's public news RSS instead so the news-clustering path still receives
// a fourth broad German-language equity feed without adding another request per scan.
const INSTALL_KEY='__kiPublicFeedResilienceV1';
const STATS_KEY='__kiPublicFeedResilienceStatsV1';
if(!globalThis[INSTALL_KEY]){
  globalThis[INSTALL_KEY]=true;
  const nativeFetch=globalThis.fetch.bind(globalThis);
  const stats=globalThis[STATS_KEY]={boersenNewsFallbacks:0,lastFallbackAt:null,lastError:null};
  globalThis.fetch=async function publicFeedResilienceFetch(input,init){
    let u;try{u=new URL(typeof input==='string'||input instanceof URL?String(input):String(input?.url||''))}catch{return nativeFetch(input,init)}
    if(u.hostname==='www.boersennews.de'&&u.pathname==='/service/news.rss'){
      try{
        const target='https://www.finanzen.net/rss/news',r=await nativeFetch(target,init);
        if(r.ok){stats.boersenNewsFallbacks++;stats.lastFallbackAt=new Date().toISOString();stats.lastError=null;const h=new Headers(r.headers);h.set('x-ki-feed-fallback','finanzen.net/rss/news');return new Response(r.body,{status:r.status,statusText:r.statusText,headers:h})}
        stats.lastError=`finanzen.net RSS HTTP ${r.status}`;return r;
      }catch(e){stats.lastError=String(e?.message||e).slice(0,160);return nativeFetch(input,init)}
    }
    return nativeFetch(input,init);
  };
}
export function publicFeedResilienceStats(){return structuredClone(globalThis[STATS_KEY]||{})}
