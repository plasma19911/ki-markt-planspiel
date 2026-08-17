const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function ensure(){
 if($('zeroBrokerTarget'))return $('zeroBrokerTarget');
 const anchor=$('setup')||document.querySelector('main.grid .card');if(!anchor)return null;
 const s=document.createElement('section');s.id='zeroBrokerTarget';s.className='card';s.style.gridColumn='1/-1';
 s.innerHTML=`<div class="cardTitle"><h2>Zieldepot · finanzen.net ZERO</h2><span id="zeroBrokerPill" class="tag">gettex</span></div>
 <div id="zeroBrokerMeta" class="trendSummary">Das Planspiel wird auf praktisch bei ZERO/gettex umsetzbare Aktien und normale UCITS-ETFs ausgerichtet.</div>
 <div id="zeroBrokerGrid" class="miniGrid"></div>
 <div id="zeroBrokerNote" class="notice"></div>
 <div style="margin-top:10px"><a href="/onepager.html" style="color:#8fc4ff;font-weight:800;text-decoration:none">Funktionsübersicht / Onepager öffnen →</a></div>`;
 anchor.insertAdjacentElement('afterend',s);return s;
}

async function load(){
 if(document.hidden)return;const section=ensure();if(!section)return;
 try{
  const r=await fetch('/api/status',{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);const s=await r.json(),b=s.brokerTarget;
  if(!b){$('zeroBrokerMeta').textContent='ZERO-Zielprofil wird mit dem nächsten Deployment aktiv.';return}
  const full=Number(b.fullLiquidEquityUniverse||0),slice=Number(b.currentScannerUniverse||0),rot=Number(b.estimatedFullRotationMinutes||0);
  $('zeroBrokerPill').textContent=`${b.name} · ${b.venue}`;
  $('zeroBrokerMeta').textContent=`Ziel für eine spätere reale Umsetzung: ${b.name} über ${b.venue}. Die App bleibt Paper Trading und sendet keine echten Brokerorders. Aktien werden branchenunabhängig bewertet; Tech/Rüstung sind nur Teilbereiche.`;
  $('zeroBrokerGrid').innerHTML=`
   <div class="mini"><span>Liquides Aktien-Zieluniversum</span><b>${full||'–'}</b></div>
   <div class="mini"><span>Aktueller Minuten-Slice</span><b>${slice||'–'}</b></div>
   <div class="mini"><span>Komplette Rotation</span><b>${rot?`~${rot} Min.`:'–'}</b></div>
   <div class="mini"><span>ETF-Regel</span><b>normale UCITS</b></div>
   <div class="mini"><span>Kleine Orders</span><b>1 € konservativ</b></div>
   <div class="mini"><span>US-ETF-Proxys</span><b>nur Analyse</b></div>`;
  const catalog=b.exactBrokerCatalog?'Broker-Katalog synchronisiert':'liquides ZERO/gettex-Zieluniversum; konkrete Broker-Verfügbarkeit vor echter Order erneut prüfen';
  $('zeroBrokerNote').innerHTML=`<b>Breit statt sektorfixiert:</b> Der Scanner rotiert durch das Aktienuniversum, damit die Cloudflare-Free-Limits nicht durch einen Vollscan in jeder Minute überschritten werden. ${esc(catalog)}. ${esc(b.executionNote||'')}`;
 }catch(e){$('zeroBrokerMeta').textContent=`ZERO-Zielprofil derzeit nicht verfügbar: ${e.message}`}
}

load();setInterval(load,60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()});
