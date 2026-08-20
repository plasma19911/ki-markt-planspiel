// Coalesce repeated dashboard status reads so the Cloudflare Free quota is not wasted.
// During gettex trading hours the UI stays minute-current; outside that window one
// open browser tab performs at most one real status request every 10 minutes.
// The archive loads older history only on demand instead of on every dashboard poll.
const ACTIVE_STATUS_TTL_MS=25_000;
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

// ---------- Shared display helpers ----------
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const dt=v=>v?new Date(v).toLocaleString('de-DE'):'–';
const fmt=(v,d=2)=>Number(v||0).toLocaleString('de-DE',{minimumFractionDigits:d,maximumFractionDigits:d});
function money(v){const n=fmt(v,2);return`${n} ${lastCurrency==='EUR'?'€':lastCurrency}`}
function typeName(t){return String(t||'EQUITY').toUpperCase()==='ETF'?'ETF':'Aktie'}

// Genau dieselbe wirtschaftliche Sicht fuer Positionskarte, Tabelle und Kreisgrafik.
// Neue ZERO-Positionen koennen ueber die echte Stueckzahl bewertet werden. Bei alten
// Positionen bleibt die bewährte Einstand-/FX-Verhaeltnisformel als Fallback erhalten.
function positionDisplayValue(p){
 const invested=Math.max(0,num(p?.invested)),entryPrice=num(p?.entry_price),lastPrice=num(p?.last_price,entryPrice),entryFx=num(p?.entry_fx,1),lastFx=num(p?.last_fx,entryFx),qty=num(p?.zero_quantity,0);
 const ratioValue=entryPrice>0&&entryFx>0?invested*(lastPrice/entryPrice)*(lastFx/entryFx):invested;
 const qtyValue=qty>0&&lastPrice>0&&lastFx>0?qty*lastPrice*lastFx:0;
 if(!(qtyValue>0))return ratioValue;
 if(!(ratioValue>0))return qtyValue;
 // Legacy-FX-Reparaturen koennen alte gespeicherte Mengen unbrauchbar machen. Eine
 // grosse Abweichung ist deshalb ein Grund, auf die bereits reparierte Basisformel
 // zurueckzufallen statt einen falschen Depotwert anzuzeigen.
 return Math.abs(qtyValue/ratioValue-1)<=.05?qtyValue:ratioValue;
}
function positionDisplayPnl(p){const value=positionDisplayValue(p),invested=num(p?.invested);return{value,pnl:value-invested-num(p?.entry_fee),invested}}

function renderDepotTruth(s){
 const positions=Array.isArray(s?.positions)?s.positions:[],cash=num(s?.config?.cash),cards=document.getElementById('positionCards'),body=document.getElementById('positionsBody');
 if(cards)cards.innerHTML=positions.map(p=>{const x=positionDisplayPnl(p),pct=x.invested?x.pnl/x.invested*100:0;return`<article class="positionCard ${x.pnl<0?'loss':''}"><div class="positionHead"><div><div class="positionSymbol">${esc(p.symbol)}</div><div class="positionName">${esc(p.name||'')}</div></div><div class="positionPnl">${x.pnl>=0?'+':''}${fmt(pct,2)} %</div></div><div class="positionMetrics"><span>Einsatz<b>${money(x.invested)}</b></span><span>Aktuell<b>${money(x.value)}</b></span><span>Ø Kauf<b>${fmt(p.entry_price,2)}</b></span><span>Kurs<b>${fmt(p.last_price,2)}</b></span></div></article>`}).join('')||'<div class="emptyState">Keine offene Position.</div>';
 if(body)body.innerHTML=positions.map(p=>{const x=positionDisplayPnl(p);return`<tr><td><b>${esc(p.symbol)}</b><br><span class="muted">${esc(p.name||'')}</span></td><td>${esc(typeName(p.instrument_type))}</td><td>${money(x.invested)}</td><td>${fmt(p.last_fx||1,5)}</td><td>${fmt(p.last_price,3)}</td><td class="${x.pnl>=0?'good':'bad'}">${x.pnl>=0?'+':''}${money(x.pnl)}</td></tr>`}).join('')||'<tr><td colspan="6">Keine offene Position.</td></tr>';
 const items=positions.map(p=>({name:String(p.symbol||''),value:positionDisplayValue(p)})).filter(x=>x.value>0);if(cash>0)items.push({name:'CASH',value:cash});const total=items.reduce((a,b)=>a+b.value,0);
 const investedValue=Math.max(0,total-cash),cashShare=document.getElementById('cashShare'),investedShare=document.getElementById('investedShare');
 if(cashShare&&total>0)cashShare.textContent=`${fmt(cash/total*100,1)} % des Depotwerts`;
 if(investedShare&&total>0)investedShare.textContent=`${fmt(investedValue/total*100,1)} % investiert`;
 const legend=document.getElementById('allocationLegend');if(legend&&total>0)legend.innerHTML=items.map((it,i)=>`<div class="legendItem"><span class="legendDot" style="background:hsl(${(i*137.5+205)%360} 68% 62%)"></span><span>${esc(it.name)} · ${fmt(it.value/total*100,1)} %</span><b>${money(it.value)}</b></div>`).join('');
 const canvas=document.getElementById('allocationChart');if(canvas&&total>0){const rect=canvas.getBoundingClientRect(),w=Math.max(1,Math.round(rect.width||canvas.clientWidth||300)),h=Math.max(1,Math.round(rect.height||canvas.clientHeight||220)),dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);const cx=w/2,cy=h/2,r=Math.min(w,h)*.44,inner=r*.62;let a=-Math.PI/2;items.forEach((it,i)=>{const e=a+it.value/total*Math.PI*2;ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,r,a,e);ctx.closePath();ctx.fillStyle=`hsl(${(i*137.5+205)%360} 68% 62%)`;ctx.fill();a=e});ctx.globalCompositeOperation='destination-out';ctx.beginPath();ctx.arc(cx,cy,inner,0,Math.PI*2);ctx.fill();ctx.globalCompositeOperation='source-over';ctx.textAlign='center';ctx.fillStyle='#edf6ff';ctx.font='700 19px Inter, system-ui, sans-serif';ctx.fillText(`${fmt(investedValue/total*100,0)} %`,cx,cy+1);ctx.fillStyle='#7990a6';ctx.font='10px Inter, system-ui, sans-serif';ctx.fillText('investiert',cx,cy+16);ctx.textAlign='start'}
}

function renderReplayRuntimeStatus(s){
 const r=s?.dayReplayLearning?.report||{},capture=s?.dayReplayLearning?.capture||{},focus=document.getElementById('replayFocus');if(!focus)return;
 const processed=num(r.processed),total=num(r.total,capture.symbolCount),analysed=num(r?.summary?.symbolsAnalysed,processed),status=String(r.status||'').toUpperCase();
 if(status==='COMPLETE'){focus.textContent=`Replay heute final abgeschlossen · ${analysed} Aktien analysiert. Die Learnings fließen konservativ in den nächsten Handelstag ein.`;return}
 if(status==='PRELIMINARY_COMPLETE'){focus.textContent=`Heutiger Replay-Zwischenstand fertig · ${analysed} Aktien analysiert. Finaler Neuaufbau nach gettex-Schluss ab 23:05.`;return}
 if(status==='RUNNING'){focus.textContent=`Tages-Replay läuft · ${processed}/${Math.max(total,processed)} Werte verarbeitet. Vorläufige Auswertung, final ab 23:05.`;return}
 if(status==='CAPTURING'){focus.textContent=`Tages-Replay sammelt heute Daten · ${num(capture.symbolCount,total)} Werte im Tages-Capture. Erste Auswertung ab 22:05, final ab 23:05.`;return}
}

// ---------- History window UI ----------
// app.js renders the newest window. After its planspiel:status event we either append
// one "older" button or, once expanded, restore the locally loaded archive and merge
// newly arrived trades at the front.
function historyTime(h){
 if(String(h?.action||'').toUpperCase()==='HALTEN'){
  const s=num(h.start_scan),e=num(h.end_scan),scan=s>0?(e>s?`Scan ${s}–${e}`:`Scan ${s}`):'HALTEN';
  return`${scan}<br><span class="muted">${dt(h.ts)} → ${dt(h.end_ts||h.ts)}</span>`;
 }
 return dt(h?.ts);
}
function actionClass(a){a=String(a||'').toUpperCase();return a==='KAUF'?'good':a==='VERKAUF'?'yellow':a==='FEHLER'?'bad':''}
function historyRow(h){return`<tr><td>${historyTime(h)}</td><td class="${actionClass(h.action)}"><b>${esc(h.action)}</b></td><td>${esc(h.symbol||'–')}</td><td>${h.amount?`${num(h.amount)>0?'+':''}${money(h.amount)}`:'–'}</td><td>${h.fee?money(h.fee):'–'}</td><td>${money(h.cash_after)}</td><td>${money(h.equity)}</td><td class="${num(h.total_pnl)>=0?'good':'bad'}">${num(h.total_pnl)>=0?'+':''}${money(h.total_pnl)}</td><td>${esc(h.reason||'')}</td></tr>`}
function historyKey(x){return String(x?.id??`${x?.ts||''}:${x?.action||''}:${x?.symbol||''}`)}
function renderExpandedHistory(){const body=document.getElementById('historyBody');if(!body||!Array.isArray(expandedHistory))return;body.innerHTML=expandedHistory.map(historyRow).join('')||'<tr><td colspan="9">Noch keine History.</td></tr>'}
function appendHistoryButton(windowRows,total){const body=document.getElementById('historyBody');if(!body||expandedHistory||total<=windowRows.length)return;const row=document.createElement('tr');row.innerHTML=`<td colspan="9"><button type="button" id="historyMore"${historyLoading?' disabled':''}>${historyLoading?'Lade …':`Ältere ${Math.max(0,total-windowRows.length)} Einträge laden`}</button></td>`;body.appendChild(row);row.querySelector('button')?.addEventListener('click',loadOlderHistory,{once:true})}
async function loadOlderHistory(){if(historyLoading)return;historyLoading=true;try{const r=await window.fetch('/api/history?kind=history&limit=500'),j=await r.json();if(!r.ok)throw new Error(j?.error||`HTTP ${r.status}`);expandedHistory=Array.isArray(j?.rows)?j.rows:[];lastHistoryTotal=num(j?.total,expandedHistory.length);renderExpandedHistory()}catch(e){console.warn('History konnte nicht nachgeladen werden:',e)}finally{historyLoading=false}}

document.addEventListener('planspiel:status',ev=>{
 const s=ev.detail||{},rows=Array.isArray(s.history)?s.history:[];lastCurrency=String(s?.config?.currency||'EUR').toUpperCase();lastHistoryTotal=num(s.historyTotal,rows.length);
 renderDepotTruth(s);renderReplayRuntimeStatus(s);
 if(expandedHistory){const known=new Set(expandedHistory.map(historyKey)),fresh=rows.filter(x=>!known.has(historyKey(x)));if(fresh.length)expandedHistory=[...fresh,...expandedHistory];renderExpandedHistory()}
 else appendHistoryButton(rows,lastHistoryTotal);
});
