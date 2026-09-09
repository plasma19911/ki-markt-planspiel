const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function lockLegacyFeeInputs(){
 const fixed=$('feeFixed'),percent=$('feePercent');
 if(fixed){fixed.value='1.00';fixed.disabled=true;fixed.title='Trade-Republic-Standardgebühr: 1 € je Wertpapierorder.'}
 if(percent){percent.value='0.00';percent.disabled=true;percent.title='Keine zusätzliche prozentuale Brokergebühr; Spread und Slippage werden separat berücksichtigt.'}
 if(fixed?.closest('label'))fixed.closest('label').childNodes[0].textContent='Trade-Republic-Ordergebühr ';
 if(percent?.closest('label'))percent.closest('label').childNodes[0].textContent='Zusätzliche Ordergebühr % ';
 const box=document.querySelector('.feeBox .feeTitle');if(box)box.textContent='Trade-Republic-Kostenmodell · automatisch';
}
function keepExecutionText(){
 const e=$('executionInfo');if(!e)return;
 const text='Trade Republic: 1 € Standardgebühr je Wertpapierorder · ganze Aktien im Planspiel · Spread und Slippage werden separat berücksichtigt.';
 if(e.textContent!==text)e.textContent=text;
}
function installFeeUiGuard(){lockLegacyFeeInputs();keepExecutionText();const target=$('executionInfo');if(target)new MutationObserver(()=>keepExecutionText()).observe(target,{childList:true,characterData:true,subtree:true});setInterval(()=>{lockLegacyFeeInputs();keepExecutionText()},10000)}

function ensure(){
 if($('zeroBrokerTarget'))return $('zeroBrokerTarget');
 const anchor=$('setup')||document.querySelector('main.grid .card');if(!anchor)return null;
 const s=document.createElement('section');s.id='zeroBrokerTarget';s.className='card';s.style.gridColumn='1/-1';
 s.innerHTML=`<div class="cardTitle"><h2>Zieldepot · Trade Republic</h2><span id="zeroBrokerPill" class="tag">Bestpreis</span></div>
 <div id="zeroBrokerMeta" class="trendSummary">Das Planspiel berücksichtigt ausschließlich Aktien aus dem verifizierten Trade-Republic-Aktienuniversum.</div>
 <div id="zeroBrokerGrid" class="miniGrid"></div>
 <div id="zeroBrokerNote" class="notice"></div>
 <div style="margin-top:10px"><a href="/onepager.html" style="color:#8fc4ff;font-weight:800;text-decoration:none">Funktionsübersicht / Onepager öffnen →</a></div>`;
 anchor.insertAdjacentElement('afterend',s);return s;
}

async function load(){
 if(document.hidden)return;const section=ensure();if(!section)return;
 try{
  const r=await fetch('/api/status',{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);const s=await r.json(),b=s.brokerTarget,m=s.executionModel||{};
  if(!b){$('zeroBrokerMeta').textContent='Trade-Republic-Zielprofil wird mit dem nächsten vollständigen Status verfügbar.';return}
  const full=Number(b.fullLiquidEquityUniverse||0),slice=Number(b.currentScannerUniverse||0),rot=Number(b.estimatedFullRotationMinutes||0),aiMin=Number(b.aiPlanCooldownMinutes||0);
  $('zeroBrokerPill').textContent=`${b.name} · ${b.venue}`;
  $('zeroBrokerMeta').textContent=`Ziel für eine spätere reale Umsetzung: ${b.name} über ${b.venue}. Die App bleibt Paper Trading und handelt ausschließlich Aktien. Der Aktien-Masterpool wird wegen Cloudflare-Limits rotierend gescannt.`;
  $('zeroBrokerGrid').innerHTML=`
   <div class="mini"><span>Aktien-Masterpool</span><b>${full||'Refresh läuft'}</b></div>
   <div class="mini"><span>Aktien je Minuten-Slice</span><b>${slice||'–'}</b></div>
   <div class="mini"><span>Aktien-Rotation</span><b>${rot?`~${rot} Min.`:'–'}</b></div>
   <div class="mini"><span>Assetklasse</span><b>nur Aktien</b></div>
   <div class="mini"><span>Markt/News Scan</span><b>jede Minute</b></div>
   <div class="mini"><span>KI-Neubewertung</span><b>${aiMin?`max. alle ${aiMin} Min.`:'quota-geschützt'}</b></div>
   <div class="mini"><span>Standardorder</span><b>1 € Gebühr</b></div>
   <div class="mini"><span>Ordergröße</span><b>kostenbereinigt</b></div>
   <div class="mini"><span>Ausführung</span><b>ganze Aktien</b></div>
   <div class="mini"><span>Spread</span><b>markt-/zeitabhängig</b></div>
   <div class="mini"><span>Broker-Katalog</span><b>vor Echtgeldorder prüfen</b></div>`;
  const feeOk=m.targetBroker==='Trade Republic'||b.name==='Trade Republic'?'Trade-Republic-Gebührenmodell aktiv':'Gebührenmodell wird synchronisiert';
  const catalog=b.exactBrokerCatalog?'Trade-Republic-Katalog synchronisiert':'Konkrete Trade-Republic-Handelbarkeit und ISIN müssen vor einer späteren Echtgeldorder erneut geprüft werden';
  $('zeroBrokerNote').innerHTML=`<b>${esc(feeOk)}.</b> Brokergebühr und Marktspread sind getrennt. <b>ETFs sind im Planspiel ausgeschlossen.</b> ${esc(catalog)}. ${esc(b.executionNote||'')}`;
  keepExecutionText();
 }catch(e){$('zeroBrokerMeta').textContent=`Trade-Republic-Zielprofil derzeit nicht verfügbar: ${e.message}`}
}

installFeeUiGuard();
load();setInterval(load,60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()});
