// Coalesce repeated dashboard status reads so the Cloudflare Free quota is not wasted.
// All dashboard modules can keep their own timers, but only one real GET /api/status
// is sent per active browser tab inside the TTL. Hidden tabs reuse the last response.
const STATUS_TTL_MS=30000;
const nativeFetch=window.fetch.bind(window);
let cachedResponse=null;
let cachedAt=0;
let inFlight=null;

function requestInfo(input,init){
  try{
    const method=String(init?.method||(input instanceof Request?input.method:'GET')||'GET').toUpperCase();
    const raw=typeof input==='string'||input instanceof URL?String(input):input?.url;
    if(!raw)return null;
    const u=new URL(raw,location.href);
    return{method,u};
  }catch{return null}
}
function invalidate(){cachedAt=0;cachedResponse=null}

window.fetch=async function quotaAwareFetch(input,init){
  const info=requestInfo(input,init);
  if(!info||info.u.origin!==location.origin)return nativeFetch(input,init);

  const isStatus=info.method==='GET'&&info.u.pathname==='/api/status';
  const isMutation=info.method!=='GET'&&['/api/start','/api/stop','/api/reset','/api/scan','/api/migrate-from-old-sql'].includes(info.u.pathname);

  if(!isStatus){
    const r=await nativeFetch(input,init);
    if(isMutation&&r.ok)invalidate();
    return r;
  }

  const now=Date.now();
  if(cachedResponse&&(document.hidden||now-cachedAt<STATUS_TTL_MS))return cachedResponse.clone();
  if(inFlight){const r=await inFlight;return r.clone()}

  inFlight=(async()=>{
    const r=await nativeFetch(input,init);
    if(r.ok){cachedResponse=r.clone();cachedAt=Date.now()}
    return r;
  })();
  try{return(await inFlight).clone()}finally{inFlight=null}
};

window.addEventListener('portfolio-status-invalidate',invalidate);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)cachedAt=0});

// Erst nach Installation des Fetch-Guards laden, damit auch diese Anzeigen den gemeinsamen
// Statuscache nutzen und keine unnötigen Cloudflare-Reads erzeugen.
import('./ui-v2.js').catch(e=>console.error('UI V2 failed',e));
import('./zero-ui.js').catch(e=>console.error('ZERO target UI failed',e));
import('./order-approval-ui.js').catch(e=>console.error('Order approval UI failed',e));
import('./accounting-ui.js').catch(e=>console.error('Accounting checksum UI failed',e));
