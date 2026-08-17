const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function lockLegacyFeeInputs(){
 const fixed=$('feeFixed'),percent=$('feePercent');
 for(const el of [fixed,percent])if(el){el.value='0.00';el.disabled=true;el.title='Im ZERO-Modus automatisch nach echter ZERO-Gebührenregel berechnet.'}
 if(fixed?.closest('label'))fixed.closest('label').childNodes[0].textContent='ZERO-Brokergebühr ';
 if(percent?.closest('label'))percent.closest('label').childNodes[0].textContent='Zusätzliche Ordergebühr % ';
 const box=document.querySelector('.feeBox .feeTitle');if(box)box.textContent='ZERO-Kostenmodell · automatisch';
}
function keepExecutionText(){
 const e=$('executionInfo');if(!e)return;
 const text='ZERO automatisch: ganze Wertpapierorder ab 500 € = 0 € Brokergebühr · unter 500 € = 1 € Mindermengenzuschlag · Aktien-Bruchstückauftrag = 1 € separat · Spread/Marktausführung separat.';
 if(e.textContent!==text)e.textContent=text;
}
function installFeeUiGuard(){lockLegacyFeeInputs();keepExecutionText();const target=$('executionInfo');if(target)new MutationObserver(()=>keepExecutionText()).observe(target,{childList:true,characterData:true,subtree:true});setInterval(()=>{lockLegacyFeeInputs();keepExecutionText()},10000)}

function ensure(){
 if($('zeroBrokerTarget'))return $('zeroBrokerTarget');
 const anchor=$('setup')||document.querySelector('main.grid .card');if(!anchor)return null;
 const s=document.createElement('section');s.id='zeroBrokerTarget';s.className='card';s.style.gridColumn='1/-1';
 s.innerHTML=`<div class="cardTitle"><h2>Zieldepot · finanzen.net ZERO</h2><span id="zeroBrokerPill" class="tag">gettex</span></div>
 <div id="zeroBrokerMeta" class="trendSummary">Das Planspiel wird auf ein ZERO/gettex-großes Masteruniversum aus Aktien und normalen ETFs ausgerichtet.</div>
 <div id="zeroBrokerGrid" class="miniGrid"></div>
 <div id="zeroBrokerNote" class="notice"></div>
 <div style="margin-top:10px"><a href="/onepager.html" style="color:#8fc4ff;font-weight:800;text-decoration:none">Funktionsübersicht / Onepager öffnen →</a></div>`;
 anchor.insertAdjacentElement('afterend',s);return s;
}

async function load(){
 if(document.hidden)return;const section=ensure();if(!section)return;
 try{
  const r=await fetch('/api/status',{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);const s=await r.json(),b=s.brokerTarget,m=s.executionModel||{};
  if(!b){$('zeroBrokerMeta').textContent='ZERO-Zielprofil wird mit dem nächsten Deployment aktiv.';return}
  const full=Number(b.fullLiquidEquityUniverse||0),slice=Number(b.currentScannerUniverse||0),rot=Number(b.estimatedFullRotationMinutes||0),aiMin=Number(b.aiPlanCooldownMinutes||0),etfs=Number(b.fullEtfMasterPool||0),etfRot=Number(b.estimatedEtfRotationMinutes||0);
  $('zeroBrokerPill').textContent=`${b.name} · ${b.venue}`;
  $('zeroBrokerMeta').textContent=`Ziel für eine spätere reale Umsetzung: ${b.name} über ${b.venue}. Die App bleibt Paper Trading. Der Masterpool wird in ZERO-Größenordnung geführt und wegen Cloudflare-Limits rotierend gescannt.`;
  $('zeroBrokerGrid').innerHTML=`
   <div class="mini"><span>Aktien-Masterpool</span><b>${full||'Refresh läuft'}</b></div>
   <div class="mini"><span>Aktien je Minuten-Slice</span><b>${slice||'–'}</b></div>
   <div class="mini"><span>Aktien-Rotation</span><b>${rot?`~${rot} Min.`:'–'}</b></div>
   <div class="mini"><span>ETF-Masterpool</span><b>${etfs||'Refresh läuft'}</b></div>
   <div class="mini"><span>ETF-Rotation</span><b>${etfRot?`~${etfRot} Min.`:'–'}</b></div>
   <div class="mini"><span>Markt/News Scan</span><b>jede Minute</b></div>
   <div class="mini"><span>KI-Neubewertung</span><b>${aiMin?`max. alle ${aiMin} Min.`:'quota-geschützt'}</b></div>
   <div class="mini"><span>Order ≥ 500 €</span><b>0 € Brokergebühr</b></div>
   <div class="mini"><span>Order &lt; 500 €</span><b>1 € Zuschlag</b></div>
   <div class="mini"><span>Aktien-Bruchstück</span><b>1 € separat</b></div>
   <div class="mini"><span>Spread</span><b>markt-/zeitabhängig</b></div>
   <div class="mini"><span>Broker-Katalog</span><b>vor Echtgeldorder prüfen</b></div>`;
  const feeOk=b.feesMatchedToZeroRules?'ZERO-Brokergebührenregel aktiv':'ZERO-Gebührenmodell wird aktiviert';
  const catalog=b.exactBrokerCatalog?'Broker-Katalog exakt synchronisiert':'ZERO-großer Kandidatenpool; konkrete ZERO-Handelbarkeit/ISIN muss vor jeder späteren Echtgeldorder über einen offiziellen Broker-/Partnerweg bestätigt werden';
  $('zeroBrokerNote').innerHTML=`<b>${esc(feeOk)}.</b> Brokergebühr und Marktspread sind getrennt. ETFs werden im normalen Börsenhandel als ganze Stücke simuliert; nicht investierbares Restcash bleibt im Depot. ${esc(catalog)}. ${esc(b.executionNote||'')}`;
  keepExecutionText();
 }catch(e){$('zeroBrokerMeta').textContent=`ZERO-Zielprofil derzeit nicht verfügbar: ${e.message}`}
}

installFeeUiGuard();
load();setInterval(load,60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()});
