// Coalesce repeated dashboard status reads so the Cloudflare Free quota is not wasted.
// During gettex trading hours the UI stays minute-current; outside that window one
// open browser tab performs at most one real status request every 10 minutes.
// The archive loads older history only on demand instead of on every dashboard poll.
const ACTIVE_STATUS_TTL_MS=55_000;
const SLEEP_STATUS_TTL_MS=10*60*1000;
const CLOSED_2026=new Set(['2026-01-01','2026-04-03','2026-04-06','2026-05-01','2026-12-24','2026-12-25','2026-12-31']);
const MUTATION_PATHS=new Set(['/api/start','/api/stop','/api/reset','/api/scan','/api/migrate-from-old-sql']);
const nativeFetch=window.fetch.bind(window);
let cachedResponse=null;
let cachedAt=0;
let inFlight=null;
let expandedHistory=null;
let historyLoading=false;
let lastHistoryTotal=0;
let lastCurrency='EUR';

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
  const raw=typeof input==='string'||input instanceof URL?String(input):input?.url;if(!raw)return null;
  return{method,u:new URL(raw,location.href)};
 }catch{return null}
}
function invalidate(){cachedAt=0;cachedResponse=null}

window.fetch=async function quotaAwareFetch(input,init){
 const info=requestInfo(input,init);if(!info||info.u.origin!==location.origin)return nativeFetch(input,init);
 const isStatus=info.method==='GET'&&info.u.pathname==='/api/status';
 const isMutation=info.method!=='GET'&&MUTATION_PATHS.has(info.u.pathname);
 if(!isStatus){const r=await nativeFetch(input,init);if(isMutation&&r.ok)invalidate();return r}
 const now=Date.now(),ttl=statusTtl();
 if(cachedResponse&&(document.hidden||now-cachedAt<ttl))return cachedResponse.clone();
 if(inFlight){const r=await inFlight;return r.clone()}
 inFlight=(async()=>{const r=await nativeFetch(input,init);if(r.ok){cachedResponse=r.clone();cachedAt=Date.now()}return r})();
 try{return(await inFlight).clone()}finally{inFlight=null}
};

window.addEventListener('portfolio-status-invalidate',invalidate);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&gettexUiActive())cachedAt=0});

// ---------- History window UI ----------
// app.js renders the newest window. After its planspiel:status event we either append
// one "older" button or, once expanded, restore the locally loaded archive and merge
// newly arrived trades at the front.
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const dt=v=>v?new Date(v).toLocaleString('de-DE'):'–';
function money(v){const n=Number(v||0).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2});return`${n} ${lastCurrency==='EUR'?'€':lastCurrency}`}
function historyTime(h){
 if(String(h?.action||'').toUpperCase()==='HALTEN'){
  const s=num(h.start_scan),e=num(h.end_scan),scan=s>0?(e>s?`Scan ${s}–${e}`:`Scan ${s}`):'HALTEN';
  return`${scan}<br><span class="muted">${dt(h.ts)} → ${dt(h.end_ts||h.ts)}</span>`;
 }
 return dt(h?.ts);
}
function actionClass(a){a=String(a||'').toUpperCase();return a==='KAUF'?'good':a==='VERKAUF'?'yellow':a==='FEHLER'?'bad':''}
function historyRow(h){
 return`<tr><td>${historyTime(h)}</td><td class="${actionClass(h.action)}"><b>${esc(h.action)}</b></td><td>${esc(h.symbol||'–')}</td><td>${h.amount?`${num(h.amount)>0?'+':''}${money(h.amount)}`:'–'}</td><td>${h.fee?money(h.fee):'–'}</td><td>${money(h.cash_after)}</td><td>${money(h.equity)}</td><td class="${num(h.total_pnl)>=0?'good':'bad'}">${num(h.total_pnl)>=0?'+':''}${money(h.total_pnl)}</td><td>${esc(h.reason||'')}</td></tr>`;
}
function historyKey(x){return String(x?.id??`${x?.ts||''}:${x?.action||''}:${x?.symbol||''}`)}
function renderExpandedHistory(){
 const body=document.getElementById('historyBody');if(!body||!Array.isArray(expandedHistory))return;
 body.innerHTML=expandedHistory.map(historyRow).join('')||'<tr><td colspan="9">Noch keine History.</td></tr>';
}
function appendHistoryButton(windowRows,total){
 const body=document.getElementById('historyBody');if(!body||expandedHistory||total<=windowRows.length)return;
 const row=document.createElement('tr');
 row.innerHTML=`<td colspan="9"><button type="button" id="historyMore"${historyLoading?' disabled':''}>${historyLoading?'Lade …':`Ältere ${Math.max(0,total-windowRows.length)} Einträge laden`}</button></td>`;
 body.appendChild(row);row.querySelector('button')?.addEventListener('click',loadOlderHistory,{once:true});
}
async function loadOlderHistory(){
 if(historyLoading)return;historyLoading=true;
 try{
  const r=await window.fetch('/api/history?kind=history&limit=500');
  const j=await r.json();if(!r.ok)throw new Error(j?.error||`HTTP ${r.status}`);
  expandedHistory=Array.isArray(j?.rows)?j.rows:[];lastHistoryTotal=num(j?.total,expandedHistory.length);renderExpandedHistory();
 }catch(e){console.warn('History konnte nicht nachgeladen werden:',e)}finally{historyLoading=false}
}
document.addEventListener('planspiel:status',ev=>{
 const s=ev.detail||{},rows=Array.isArray(s.history)?s.history:[];lastCurrency=String(s?.config?.currency||'EUR').toUpperCase();lastHistoryTotal=num(s.historyTotal,rows.length);
 if(expandedHistory){const known=new Set(expandedHistory.map(historyKey)),fresh=rows.filter(x=>!known.has(historyKey(x)));if(fresh.length)expandedHistory=[...fresh,...expandedHistory];renderExpandedHistory()}
 else appendHistoryButton(rows,lastHistoryTotal);
});
