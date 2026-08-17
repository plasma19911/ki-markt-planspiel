const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function ensure(){
 if($('zeroBrokerTarget'))return $('zeroBrokerTarget');
 const anchor=$('setup')||document.querySelector('main.grid .card');if(!anchor)return null;
 const s=document.createElement('section');s.id='zeroBrokerTarget';s.className='card';s.style.gridColumn='1/-1';
 s.innerHTML=`<div class="cardTitle"><h2>Zieldepot · finanzen.net ZERO</h2><span id="zeroBrokerPill" class="tag">gettex</span></div>
 <div id="zeroBrokerMeta" class="trendSummary">Das Planspiel wird auf praktisch bei ZERO/gettex umsetzbare, liquide Aktien und normale UCITS-ETFs ausgerichtet.</div>
 <div id="zeroBrokerGrid" class="miniGrid"></div>
 <div id="zeroBrokerNote" class="notice"></div>`;
 anchor.insertAdjacentElement('afterend',s);return s;
}

async function load(){
 if(document.hidden)return;const section=ensure();if(!section)return;
 try{
  const r=await fetch('/api/status',{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);const s=await r.json(),b=s.brokerTarget;
  if(!b){$('zeroBrokerMeta').textContent='ZERO-Zielprofil wird mit dem nächsten Deployment aktiv.';return}
  $('zeroBrokerPill').textContent=`${b.name} · ${b.venue}`;
  $('zeroBrokerMeta').textContent=`Ziel für eine spätere reale Umsetzung: ${b.name} über ${b.venue}. Die App bleibt Paper Trading und sendet keine echten Brokerorders.`;
  $('zeroBrokerGrid').innerHTML=`<div class="mini"><span>Aktuelles Scan-Universum</span><b>${Number(b.currentScannerUniverse||0)}</b></div><div class="mini"><span>ETF-Regel</span><b>normale UCITS</b></div><div class="mini"><span>Kleine Orders</span><b>1 € konservativ</b></div><div class="mini"><span>US-ETF-Proxys</span><b>nur Analyse</b></div>`;
  $('zeroBrokerNote').innerHTML=`<b>Praktische Handelbarkeit vor theoretischer Breite:</b> sehr kleine/illiquide Notierungen werden aussortiert. Die öffentliche ZERO-Produktliste kann sich ändern; deshalb ist Broker-Verfügbarkeit kein Kaufargument und wird vor einer späteren echten Order erneut geprüft. ${esc(b.executionNote||'')}`;
 }catch(e){$('zeroBrokerMeta').textContent=`ZERO-Zielprofil derzeit nicht verfügbar: ${e.message}`}
}

load();setInterval(load,60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()});
