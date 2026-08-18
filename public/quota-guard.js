// Coalesce repeated dashboard status reads so the Cloudflare Free quota is not wasted.
// During gettex trading hours the UI stays minute-current; outside that window one
// open browser tab performs at most one real status request every 10 minutes.
const ACTIVE_STATUS_TTL_MS=55_000;
const SLEEP_STATUS_TTL_MS=10*60*1000;
const CLOSED_2026=new Set(['2026-01-01','2026-04-03','2026-04-06','2026-05-01','2026-12-24','2026-12-25','2026-12-31']);
const nativeFetch=window.fetch.bind(window);
let cachedResponse=null;
let cachedAt=0;
let inFlight=null;

function berlinClock(){
 try{
  const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()),o={};for(const x of p)o[x.type]=x.value;
  return{ymd:`${o.year}-${o.month}-${o.day}`,weekday:o.weekday,minute:Number(o.hour)*60+Number(o.minute)};
 }catch{return null}
}
function gettexUiActive(){const p=berlinClock();if(!p)return true;if(['Sat','Sun'].includes(p.weekday)||CLOSED_2026.has(p.ymd))return false;return p.minute>=7*60+25&&p.minute<23*60}
function statusTtl(){return gettexUiActive()?ACTIVE_STATUS_TTL_MS:SLEEP_STATUS_TTL_MS}

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

  const now=Date.now(),ttl=statusTtl();
  if(cachedResponse&&(document.hidden||now-cachedAt<ttl))return cachedResponse.clone();
  if(inFlight){const r=await inFlight;return r.clone()}

  inFlight=(async()=>{
    const r=await nativeFetch(input,init);
    if(r.ok){cachedResponse=r.clone();cachedAt=Date.now()}
    return r;
  })();
  try{return(await inFlight).clone()}finally{inFlight=null}
};

window.addEventListener('portfolio-status-invalidate',invalidate);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&gettexUiActive())cachedAt=0});

if(!document.querySelector('link[data-ui-v2]')){const l=document.createElement('link');l.rel='stylesheet';l.href='/ui-v2.css';l.dataset.uiV2='1';document.head.appendChild(l)}

import('./ui-v2.js').catch(e=>console.error('UI V2 failed',e));
import('./zero-ui.js').catch(e=>console.error('ZERO target UI failed',e));
import('./order-approval-ui.js').catch(e=>console.error('Order approval UI failed',e));
import('./accounting-ui.js').catch(e=>console.error('Accounting checksum UI failed',e));
import('./future-watch-ui.js').catch(e=>console.error('Future watch UI failed',e));
import('./free-budget-ui.js').catch(e=>console.error('Free budget UI failed',e));
