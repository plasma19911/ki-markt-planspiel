// Coalesce repeated dashboard status reads so the Cloudflare Free quota is not wasted.
// All modules may keep their own refresh timers; only one real GET /api/status is sent
// per active browser tab within this window. Hidden tabs reuse their last response.
const STATUS_TTL_MS=15000;
const nativeFetch=window.fetch.bind(window);
let cachedResponse=null;
let cachedAt=0;
let inFlight=null;

function isStatusGet(input,init){
  try{
    const method=String(init?.method||(input instanceof Request?input.method:'GET')||'GET').toUpperCase();
    if(method!=='GET')return false;
    const raw=typeof input==='string'||input instanceof URL?String(input):input?.url;
    if(!raw)return false;
    const u=new URL(raw,location.href);
    return u.origin===location.origin&&u.pathname==='/api/status';
  }catch{return false}
}

window.fetch=async function quotaAwareFetch(input,init){
  if(!isStatusGet(input,init))return nativeFetch(input,init);
  const now=Date.now();
  if(cachedResponse&&(document.hidden||now-cachedAt<STATUS_TTL_MS))return cachedResponse.clone();
  if(inFlight){
    const r=await inFlight;
    return r.clone();
  }
  inFlight=(async()=>{
    const r=await nativeFetch(input,init);
    if(r.ok){cachedResponse=r.clone();cachedAt=Date.now()}
    return r;
  })();
  try{return(await inFlight).clone()}finally{inFlight=null}
};

window.addEventListener('portfolio-status-invalidate',()=>{cachedAt=0});
