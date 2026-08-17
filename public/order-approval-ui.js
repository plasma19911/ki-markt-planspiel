const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(v,d=2)=>Number(v||0).toLocaleString('de-DE',{minimumFractionDigits:d,maximumFractionDigits:d});
let caps=null,timer=null;

async function getJson(path,opts={}){const r=await fetch(path,{cache:'no-store',...opts});let j={};try{j=await r.json()}catch{}if(!r.ok)throw new Error(j.error||`HTTP ${r.status}`);return j}
function badge(text,kind=''){const el=$('approvalState');if(!el)return;el.textContent=text;el.className=`tag approvalBadge ${kind}`}
function msLeft(x){return Math.max(0,Number(x||0)-Date.now())}
function age(seconds){const s=Math.max(0,Math.ceil(seconds));return `${s} s`}

function disabledView(c){
  const root=$('approvalList');if(!root)return;
  if(!c?.enabled){badge('VORBEREITET · AUS','off');root.innerHTML='<div class="approvalEmpty"><b>Noch keine echte Broker-Freigabe.</b><br>Die App erzeugt die technische Freigabe-Struktur, sendet aber keine Orders. Zum Aktivieren werden später Cloudflare Access und ein offiziell erlaubter ZERO-/Partner-Connector benötigt.</div>';return}
  if(!c?.accessConfigured){badge('ACCESS FEHLT','warn');root.innerHTML='<div class="approvalEmpty"><b>Freigabe gesperrt.</b><br>ORDER_APPROVAL_MODE ist aktiv, aber Cloudflare Access ist noch nicht vollständig konfiguriert. Das ist absichtlich fail-closed.</div>';return}
  badge('ACCESS AKTIV · BROKER AUS','warn');root.innerHTML='<div class="approvalEmpty">Cloudflare Access ist vorbereitet. Broker-Dispatch bleibt deaktiviert, bis ein offiziell erlaubter Connector vorhanden ist.</div>';
}

function orderCard(o){
  const left=msLeft(o.expiresAt),expired=o.status==='PENDING'&&left<=0,action=o.action==='BUY'?'KAUF':'VERKAUF',notional=o.estimatedNotional!=null?`${fmt(o.estimatedNotional)} ${esc(o.currency)}`:(o.action==='SELL'?'gesamte Planspiel-Position':'–'),price=o.referencePrice?fmt(o.referencePrice,3):'vor Brokerübergabe neu prüfen';
  return `<article class="approvalCard ${o.action==='BUY'?'buy':'sell'}" data-order-id="${esc(o.id)}">
    <div class="approvalHead"><div><span class="approvalAction">${action}</span><h3>${esc(o.symbol)}</h3></div><div class="approvalConfidence">${Math.round(Number(o.confidence||0)*100)}%</div></div>
    <div class="approvalMetrics"><div><span>Betrag</span><b>${notional}</b></div><div><span>Referenzkurs</span><b>${price}</b></div><div><span>Gültig</span><b class="approvalExpiry" data-exp="${Number(o.expiresAt||0)}">${o.status==='PENDING'?age(left/1000):esc(o.status)}</b></div></div>
    <p>${esc(o.reason||'Kein Grund angegeben.')}</p>
    <div class="approvalMeta">${esc(o.source||'')} · ZERO/gettex Ziel · Broker-Connector: ${esc(o.connector||'NONE')}</div>
    ${o.status==='PENDING'&&!expired?`<div class="approvalButtons"><button class="approvalApprove" data-id="${esc(o.id)}">Bestätigen</button><button class="approvalReject" data-id="${esc(o.id)}">Ablehnen</button></div>`:`<div class="approvalNotice">${o.status==='APPROVED_LOCAL'?'Lokal bestätigt – NICHT an den Broker gesendet.':'Dieser Vorschlag ist nicht mehr freigabefähig.'}</div>`}
  </article>`;
}

async function loadOrders(){
  try{
    caps=await getJson('/api/order-approval-status');
    $('approvalCount').textContent=String(caps.pending||0);
    if(!caps.readyForLocalApproval){disabledView(caps);return}
    let data;try{data=await getJson('/api/order-approvals')}catch(e){badge('ACCESS ANMELDUNG NÖTIG','warn');$('approvalList').innerHTML=`<div class="approvalEmpty"><b>Freigabe geschützt.</b><br>${esc(e.message)}<br><span class="muted">Vor echtem Betrieb soll die gesamte App hinter Cloudflare Access liegen.</span></div>`;return}
    const active=(data.orders||[]).filter(o=>o.status==='PENDING'||o.status==='APPROVED_LOCAL').slice(0,12);
    badge(`FREIGABE AKTIV · BROKER ${data.capabilities?.brokerConnected?'AN':'AUS'}`,data.capabilities?.brokerConnected?'on':'warn');
    $('approvalList').innerHTML=active.length?active.map(orderCard).join(''):'<div class="approvalEmpty">Aktuell keine Order zur Freigabe.</div>';
    bindButtons();
  }catch(e){badge('FEHLER','off');$('approvalList').innerHTML=`<div class="approvalEmpty">${esc(e.message)}</div>`}
}

function bindButtons(){
  document.querySelectorAll('.approvalApprove').forEach(b=>b.onclick=()=>act(b.dataset.id,'approve'));
  document.querySelectorAll('.approvalReject').forEach(b=>b.onclick=()=>act(b.dataset.id,'reject'));
}
async function act(id,what){
  const verb=what==='approve'?'wirklich lokal bestätigen':'ablehnen';if(!confirm(`Ordervorschlag ${verb}?`))return;
  try{const r=await getJson(`/api/order-approvals/${encodeURIComponent(id)}/${what}`,{method:'POST'});if(what==='approve'&&!r.brokerSent)alert('Bestätigt. Wichtig: Es wurde KEINE Brokerorder gesendet. Der offizielle Broker-Connector ist noch nicht verbunden.');await loadOrders()}catch(e){alert(e.message);await loadOrders()}
}
function tick(){document.querySelectorAll('.approvalExpiry[data-exp]').forEach(el=>{const left=msLeft(el.dataset.exp);el.textContent=left?age(left/1000):'abgelaufen'})}

if($('approvalList')){loadOrders();timer=setInterval(()=>{tick();loadOrders()},5000)}
